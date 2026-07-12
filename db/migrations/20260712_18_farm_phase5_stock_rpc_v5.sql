-- フェーズ5: 在庫RPC v5（Codexレビュー11対応）
-- [High] 負数チェック復活: 期待量比較の許容差(0.01)を悪用した「極小正数で在庫を増やす」を拒否
-- [High] 資材IDがあるのに数量を計算できない記録(希釈0/amount0等)は「入力不正」として拒否
-- [Med] org_idはクライアント入力を使わずfarm_idからDB導出(所属不整合行を作れない)

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
  v_expected jsonb := '{}'::jsonb;
  expected_type text;
  v_exp numeric;
begin
  if p_table = 'farm_lot_spray_records' then
    expected_type := 'pesticide';
    -- 資材IDがあるのに数量条件(希釈>0かつ液量>0)を満たさない行は入力不正として拒否
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
    if (p_record->>'work_type') = '農薬散布' and coalesce(p_record->>'pesticide_id','') <> '' then
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
    -- 使用の在庫移動は必ず負数(期待量比較の許容差を悪用した極小正数=在庫水増しを拒否)
    if agg.delta >= 0 or v_exp >= 0 then
      raise exception '使用の在庫移動は負の量のみ許可します(申告=% 期待=%)', agg.delta, round(v_exp, 4);
    end if;
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

    v_expected := v_expected - agg.item_id;
  end loop;

  if v_expected <> '{}'::jsonb then
    raise exception '記録内の資材に対応する在庫移動が不足しています(%)', v_expected;
  end if;
end $$;

-- ── 保存RPC v5: org_idをDB導出(クライアント入力を信用しない) ──
create or replace function public.farm_save_record_with_stock(
  p_table text, p_record jsonb, p_movements jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security invoker
as $$
declare
  v_inserted int;
  v_exists int;
  v_hist int;
  v_exist_row jsonb;
  v_in_row jsonb;
  v_farm uuid := (p_record->>'farm_id')::uuid;
  v_org uuid;
  v_record_id uuid := (p_record->>'id')::uuid;
  v_rec jsonb;
begin
  if p_table not in ('farm_work_records','farm_lot_spray_records','farm_top_dressing_records') then
    raise exception '対象外テーブル: %', p_table;
  end if;
  if v_farm is null or v_record_id is null then
    raise exception 'farm_id/idが未指定です';
  end if;

  -- org_idはfarm_idからDB導出（RLSで自orgのfarmしか見えない=越境も同時に弾かれる）
  select org_id into v_org from public.farm_farms where id = v_farm;
  if v_org is null then
    raise exception '対象の農場が見つかりません(farm_id=%)', v_farm;
  end if;
  v_rec := jsonb_set(p_record, '{org_id}', to_jsonb(v_org));

  execute format('select count(*) from public.%I where id=$1', p_table) into v_exists using v_record_id;
  if v_exists = 0 then
    select count(*) into v_hist from public.farm_stock_movements
      where record_collection = p_table and record_id = v_record_id;
    if v_hist > 0 then
      raise exception '削除済みの記録IDは再利用できません(id=%)。新しいIDで保存してください', v_record_id;
    end if;
  end if;

  execute format(
    'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1) on conflict (id) do nothing',
    p_table, p_table) using v_rec;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    execute format('select to_jsonb(t) - ''created_at'' - ''version'' from public.%I t where id=$1', p_table)
      into v_exist_row using v_record_id;
    execute format('select to_jsonb(x) - ''created_at'' - ''version'' from jsonb_populate_record(null::public.%I, $1) x', p_table)
      into v_in_row using v_rec;
    if (v_exist_row->>'farm_id') is distinct from (v_in_row->>'farm_id')
       or (v_exist_row->>'org_id') is distinct from (v_in_row->>'org_id') then
      raise exception '同じIDの記録が別の農場/組織に存在します(id=%)', v_record_id;
    end if;
    if v_exist_row is distinct from v_in_row then
      raise exception '同じIDで内容が異なる再送は拒否します(id=%)。訂正は更新RPCを使用してください', v_record_id;
    end if;
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  perform farm_internal.farm__apply_stock_movements(v_org, v_farm, p_table, v_record_id, v_rec, p_movements);
  return jsonb_build_object('ok', true);
end $$;

-- ── 更新RPC v5: org_idをDB導出 ──
create or replace function public.farm_update_record_with_stock(
  p_table text, p_record jsonb, p_movements jsonb, p_expected_version int
) returns jsonb
language plpgsql
security invoker
as $$
declare
  v_ver int;
  v_farm uuid := (p_record->>'farm_id')::uuid;
  v_org uuid;
  v_record_id uuid := (p_record->>'id')::uuid;
  v_new jsonb;
begin
  if p_table not in ('farm_work_records','farm_lot_spray_records','farm_top_dressing_records') then
    raise exception '対象外テーブル: %', p_table;
  end if;
  if v_farm is null or v_record_id is null or p_expected_version is null then
    raise exception 'farm_id/id/expected_versionが未指定です';
  end if;

  select org_id into v_org from public.farm_farms where id = v_farm;
  if v_org is null then
    raise exception '対象の農場が見つかりません(farm_id=%)', v_farm;
  end if;

  execute format('select version from public.%I where id=$1 and farm_id=$2 for update', p_table)
    into v_ver using v_record_id, v_farm;
  if v_ver is null then
    return jsonb_build_object('ok', false, 'notFound', true);
  end if;
  if v_ver <> p_expected_version then
    return jsonb_build_object('ok', false, 'conflict', true);
  end if;

  perform farm_internal.farm__reverse_stock_movements(p_table, v_record_id);
  execute format('delete from public.%I where id=$1 and farm_id=$2', p_table) using v_record_id, v_farm;
  v_new := jsonb_set(jsonb_set(p_record, '{version}', to_jsonb(p_expected_version + 1)), '{org_id}', to_jsonb(v_org));
  execute format(
    'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
    p_table, p_table) using v_new;
  perform farm_internal.farm__apply_stock_movements(v_org, v_farm, p_table, v_record_id, v_new, p_movements);

  return jsonb_build_object('ok', true, 'version', p_expected_version + 1);
end $$;
