-- フェーズ5: 在庫RPC v4 — 期待量計算のキーを実列名(小文字 spray_volume_l)に修正
-- v3の p_record->>'spray_volume_L'(大文字)はpopulate_recordが実列(小文字)にマップできず、
-- converterが実列名でDB行を渡すと期待量0=在庫連動が全拒否になる潜在バグだった。
-- 変更は farm_internal.farm__apply_stock_movements のみ(他関数はv3のまま)。
-- [Critical] 内部ヘルパーをPostgREST非公開スキーマ(farm_internal)へ移動=APIから直接呼べない
-- [High] 使用量の正しさをRPC内で計算・検証（記録の中身が正・クライアント不信の完成）
-- [High] 記録内の全資材とmovementの完全一致（一部欠落を拒否）
-- [Med] 同一IDで内容が異なる再送は拒否（訂正は更新RPCへ誘導）

create schema if not exists farm_internal;
grant usage on schema farm_internal to authenticated, anon, service_role;

-- 旧public版ヘルパーは撤去（API直呼びの穴を閉じる）
drop function if exists public.farm__apply_stock_movements(uuid, uuid, text, uuid, jsonb, jsonb);
drop function if exists public.farm__reverse_stock_movements(text, uuid);

-- ── 内部ヘルパー①(v3): 期待量の計算＋完全一致検証＋記帳＋残高更新 ──
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
  v_expected jsonb := '{}'::jsonb; -- { item_id(uuid文字列): 期待delta(負数) }
  expected_type text;
  v_exp numeric;
begin
  -- 記録の中身から「期待される資材IDと使用量」をサーバー側で計算する（クライアントの申告を信用しない）
  if p_table = 'farm_lot_spray_records' then
    expected_type := 'pesticide';
    -- 原液使用量 = 散布液量(L) ÷ 希釈倍率（アプリのadjustStockと同一の消費モデル）
    select coalesce(jsonb_object_agg(item_id, delta), '{}'::jsonb) into v_expected from (
      select (e->>'pesticide_id') as item_id,
             sum(-1 * (p_record->>'spray_volume_l')::numeric / (e->>'dilution')::numeric) as delta
      from jsonb_array_elements(coalesce(p_record->'pesticides','[]'::jsonb)) e
      where coalesce(e->>'pesticide_id','') <> ''
        and coalesce((e->>'dilution')::numeric, 0) > 0
        and coalesce((p_record->>'spray_volume_l')::numeric, 0) > 0
      group by 1
    ) t;
  elsif p_table = 'farm_top_dressing_records' then
    expected_type := 'fertilizer';
    -- amount_kg直接入力を優先、無ければ 散布液量(L)÷希釈倍率（アプリonSaveTopDressingRecordと同一）
    select coalesce(jsonb_object_agg(item_id, delta), '{}'::jsonb) into v_expected from (
      select (e->>'fertilizer_id') as item_id,
             sum(case
               when coalesce((e->>'amount_kg')::numeric, 0) > 0 then -1 * (e->>'amount_kg')::numeric
               when coalesce((e->>'dilution')::numeric, 0) > 0 and coalesce((p_record->>'spray_volume_l')::numeric, 0) > 0
                 then -1 * (p_record->>'spray_volume_l')::numeric / (e->>'dilution')::numeric
               else null end) as delta
      from jsonb_array_elements(coalesce(p_record->'fertilizers','[]'::jsonb)) e
      where coalesce(e->>'fertilizer_id','') <> ''
        and (coalesce((e->>'amount_kg')::numeric, 0) > 0
             or (coalesce((e->>'dilution')::numeric, 0) > 0 and coalesce((p_record->>'spray_volume_l')::numeric, 0) > 0))
      group by 1
    ) t;
  else -- farm_work_records: 農薬散布(amount=原液L)のみ在庫連動
    expected_type := 'pesticide';
    if (p_record->>'work_type') = '農薬散布' and coalesce(p_record->>'pesticide_id','') <> ''
       and coalesce((p_record->>'amount')::numeric, 0) > 0 then
      v_expected := jsonb_build_object(p_record->>'pesticide_id', -1 * (p_record->>'amount')::numeric);
    end if;
  end if;

  select count(*) into v_cnt from jsonb_array_elements(p_movements);
  if v_expected = '{}'::jsonb and v_cnt > 0 then
    raise exception '在庫を使わない記録に在庫移動が指定されています';
  end if;

  -- 同一資材はRPC内で集約→期待量と1件ずつ突合（許容差0.01）
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
    if abs(agg.delta - v_exp) > 0.01 then
      raise exception '在庫移動量が記録内容と一致しません(資材=% 申告=% 期待=%)', agg.item_id, agg.delta, round(v_exp, 4);
    end if;
    if expected_type = 'pesticide' and agg.unit not in ('', 'L') then
      raise exception '農薬の在庫移動の単位はLのみ(%)', agg.unit;
    end if;
    if expected_type = 'fertilizer' and agg.unit not in ('', 'kg') then
      raise exception '肥料の在庫移動の単位はkgのみ(%)', agg.unit;
    end if;

    insert into public.farm_stock_movements
      (org_id, farm_id, item_type, item_id, delta_amount, unit, reason, record_collection, record_id)
    values (p_org, p_farm, agg.item_type, agg.item_id::uuid, agg.delta, agg.unit, agg.reason, p_table, p_record_id);

    if expected_type = 'pesticide' then
      update public.farm_pesticides set stock_l = coalesce(stock_l,0) + agg.delta
        where id = agg.item_id::uuid and farm_id = p_farm;
    else
      update public.farm_fertilizers set stock_kg = coalesce(stock_kg,0) + agg.delta
        where id = agg.item_id::uuid and farm_id = p_farm;
    end if;
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception '在庫の対象資材が見つかりません(item_id=% type=%)。記録・記帳ごと取り消しました',
        agg.item_id, agg.item_type;
    end if;

    v_expected := v_expected - agg.item_id; -- 消し込み
  end loop;

  -- 完全一致: 記録にあるのにmovementが来ていない資材が残っていたら拒否（一部欠落の防止）
  if v_expected <> '{}'::jsonb then
    raise exception '記録内の資材に対応する在庫移動が不足しています(%)', v_expected;
  end if;
end $$;
