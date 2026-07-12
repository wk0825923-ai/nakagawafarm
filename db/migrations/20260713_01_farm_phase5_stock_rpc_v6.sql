-- フェーズ5: 在庫RPC v6（Codexレビュー12対応）— 変更は farm_internal.farm__apply_stock_movements のみ
-- [High] 資材0件の散布・施肥記録を拒否（業務判断確定: 在庫連動記録は資材1件以上が必須。
--        UIバリデーションと同一規則・GAP記録として「散布したのに資材不明」は不備）
--        lot_spray: pesticides有効0件拒否 / top_dressing: fertilizers有効0件拒否 /
--        work_records: work_type='農薬散布'でpesticide_id空を拒否
-- [Med] 数量比較を「許容差0.01」から「小数第2位に丸めて完全一致」へ変更・記帳/残高も丸め値で統一
--       （誤差の意図的積み上げ防止。丸め規則として設計図に明文化）
create or replace function farm_internal.farm__apply_stock_movements(
  p_org uuid, p_farm uuid, p_table text, p_record_id uuid, p_record jsonb, p_movements jsonb
) returns void
language plpgsql
security invoker
as $$
declare
  agg record;
  v_updated int;
  v_cnt int;
  v_bad int;
  v_valid int;
  v_expected jsonb := '{}'::jsonb;
  expected_type text;
  v_exp numeric;
begin
  if p_table = 'farm_lot_spray_records' then
    expected_type := 'pesticide';
    select count(*) filter (where coalesce(e->>'pesticide_id','') <> '') into v_valid
      from jsonb_array_elements(coalesce(p_record->'pesticides','[]'::jsonb)) e;
    if v_valid = 0 then
      raise exception '農薬散布の記録には農薬を1件以上指定してください';
    end if;
    select count(*) into v_bad
      from jsonb_array_elements(coalesce(p_record->'pesticides','[]'::jsonb)) e
      where coalesce(e->>'pesticide_id','') <> ''
        and not (coalesce((e->>'dilution')::numeric, 0) > 0 and coalesce((p_record->>'spray_volume_l')::numeric, 0) > 0);
    if v_bad > 0 then
      raise exception '農薬が指定されていますが使用量を計算できません（希釈倍率と散布液量を確認してください）';
    end if;
    select coalesce(jsonb_object_agg(item_id, delta), '{}'::jsonb) into v_expected from (
      select (e->>'pesticide_id') as item_id,
             sum(-1 * (p_record->>'spray_volume_l')::numeric / (e->>'dilution')::numeric) as delta
      from jsonb_array_elements(coalesce(p_record->'pesticides','[]'::jsonb)) e
      where coalesce(e->>'pesticide_id','') <> ''
      group by 1
    ) t;
  elsif p_table = 'farm_top_dressing_records' then
    expected_type := 'fertilizer';
    select count(*) filter (where coalesce(e->>'fertilizer_id','') <> '') into v_valid
      from jsonb_array_elements(coalesce(p_record->'fertilizers','[]'::jsonb)) e;
    if v_valid = 0 then
      raise exception '施肥の記録には肥料を1件以上指定してください';
    end if;
    select count(*) into v_bad
      from jsonb_array_elements(coalesce(p_record->'fertilizers','[]'::jsonb)) e
      where coalesce(e->>'fertilizer_id','') <> ''
        and not (coalesce((e->>'amount_kg')::numeric, 0) > 0
                 or (coalesce((e->>'dilution')::numeric, 0) > 0 and coalesce((p_record->>'spray_volume_l')::numeric, 0) > 0));
    if v_bad > 0 then
      raise exception '肥料が指定されていますが使用量を計算できません（散布量(kg)または希釈倍率と散布液量を確認してください）';
    end if;
    select coalesce(jsonb_object_agg(item_id, delta), '{}'::jsonb) into v_expected from (
      select (e->>'fertilizer_id') as item_id,
             sum(case
               when coalesce((e->>'amount_kg')::numeric, 0) > 0 then -1 * (e->>'amount_kg')::numeric
               else -1 * (p_record->>'spray_volume_l')::numeric / (e->>'dilution')::numeric
               end) as delta
      from jsonb_array_elements(coalesce(p_record->'fertilizers','[]'::jsonb)) e
      where coalesce(e->>'fertilizer_id','') <> ''
      group by 1
    ) t;
  else -- farm_work_records
    expected_type := 'pesticide';
    if (p_record->>'work_type') = '農薬散布' then
      if coalesce(p_record->>'pesticide_id','') = '' then
        raise exception '農薬散布の記録には農薬を指定してください';
      end if;
      if coalesce((p_record->>'amount')::numeric, 0) <= 0 then
        raise exception '農薬散布の記録ですが使用量(amount)が正しくありません';
      end if;
      v_expected := jsonb_build_object(p_record->>'pesticide_id', -1 * (p_record->>'amount')::numeric);
    end if;
  end if;

  select count(*) into v_cnt from jsonb_array_elements(p_movements);
  if v_expected = '{}'::jsonb and v_cnt > 0 then
    raise exception '在庫を使わない記録に在庫移動が指定されています';
  end if;

  for agg in
    select (e->>'item_type') as item_type, (e->>'item_id') as item_id,
           sum((e->>'delta_amount')::numeric) as delta,
           min(coalesce(e->>'unit','')) as unit, min(coalesce(e->>'reason','')) as reason
    from jsonb_array_elements(p_movements) e
    group by 1, 2
  loop
    if agg.item_type is distinct from expected_type then
      raise exception '記録種別と資材種別が一致しません(%)', agg.item_type;
    end if;
    if not (v_expected ? agg.item_id) then
      raise exception '記録に含まれない資材への在庫移動は拒否します(%)', agg.item_id;
    end if;
    v_exp := (v_expected->>agg.item_id)::numeric;
    if agg.delta >= 0 or v_exp >= 0 then
      raise exception '使用の在庫移動は負の量のみ許可します(申告=% 期待=%)', agg.delta, round(v_exp, 4);
    end if;
    -- 丸め規則(明文化): 期待量・申告量とも小数第2位に丸めて完全一致（許容差方式は誤差の積み上げを許すため廃止）
    if round(agg.delta, 2) <> round(v_exp, 2) then
      raise exception '在庫移動量が記録内容と一致しません(資材=% 申告=% 期待=%)', agg.item_id, round(agg.delta, 2), round(v_exp, 2);
    end if;
    if expected_type = 'pesticide' and agg.unit not in ('', 'L') then
      raise exception '農薬の在庫移動の単位はLのみ(%)', agg.unit;
    end if;
    if expected_type = 'fertilizer' and agg.unit not in ('', 'kg') then
      raise exception '肥料の在庫移動の単位はkgのみ(%)', agg.unit;
    end if;

    insert into public.farm_stock_movements
      (org_id, farm_id, item_type, item_id, delta_amount, unit, reason, record_collection, record_id)
    values (p_org, p_farm, agg.item_type, agg.item_id::uuid, round(agg.delta, 2), agg.unit, agg.reason, p_table, p_record_id);

    if expected_type = 'pesticide' then
      update public.farm_pesticides set stock_l = coalesce(stock_l,0) + round(agg.delta, 2)
        where id = agg.item_id::uuid and farm_id = p_farm;
    else
      update public.farm_fertilizers set stock_kg = coalesce(stock_kg,0) + round(agg.delta, 2)
        where id = agg.item_id::uuid and farm_id = p_farm;
    end if;
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception '在庫の対象資材が見つかりません(item_id=% type=%)。記録・記帳ごと取り消しました',
        agg.item_id, agg.item_type;
    end if;

    v_expected := v_expected - agg.item_id;
  end loop;

  if v_expected <> '{}'::jsonb then
    raise exception '記録内の資材に対応する在庫移動が不足しています(%)', v_expected;
  end if;
end $$;
