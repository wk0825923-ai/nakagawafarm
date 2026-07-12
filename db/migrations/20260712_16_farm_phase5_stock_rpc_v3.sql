-- フェーズ5: 在庫RPC v3（Codexレビュー10対応）
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
             sum(-1 * (p_record->>'spray_volume_L')::numeric / (e->>'dilution')::numeric) as delta
      from jsonb_array_elements(coalesce(p_record->'pesticides','[]'::jsonb)) e
      where coalesce(e->>'pesticide_id','') <> ''
        and coalesce((e->>'dilution')::numeric, 0) > 0
        and coalesce((p_record->>'spray_volume_L')::numeric, 0) > 0
      group by 1
    ) t;
  elsif p_table = 'farm_top_dressing_records' then
    expected_type := 'fertilizer';
    -- amount_kg直接入力を優先、無ければ 散布液量(L)÷希釈倍率（アプリonSaveTopDressingRecordと同一）
    select coalesce(jsonb_object_agg(item_id, delta), '{}'::jsonb) into v_expected from (
      select (e->>'fertilizer_id') as item_id,
             sum(case
               when coalesce((e->>'amount_kg')::numeric, 0) > 0 then -1 * (e->>'amount_kg')::numeric
               when coalesce((e->>'dilution')::numeric, 0) > 0 and coalesce((p_record->>'spray_volume_L')::numeric, 0) > 0
                 then -1 * (p_record->>'spray_volume_L')::numeric / (e->>'dilution')::numeric
               else null end) as delta
      from jsonb_array_elements(coalesce(p_record->'fertilizers','[]'::jsonb)) e
      where coalesce(e->>'fertilizer_id','') <> ''
        and (coalesce((e->>'amount_kg')::numeric, 0) > 0
             or (coalesce((e->>'dilution')::numeric, 0) > 0 and coalesce((p_record->>'spray_volume_L')::numeric, 0) > 0))
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

-- ── 内部ヘルパー②(移設のみ・ロジックはv2同等) ──
create or replace function farm_internal.farm__reverse_stock_movements(
  p_table text, p_record_id uuid
) returns int
language plpgsql
security invoker
as $$
declare
  mv record;
  v_updated int;
  v_reversed int := 0;
begin
  for mv in
    select * from public.farm_stock_movements s
    where s.record_collection = p_table and s.record_id = p_record_id
      and s.reversal_of is null and not s.reversed
  loop
    insert into public.farm_stock_movements
      (org_id, farm_id, item_type, item_id, delta_amount, unit, reason, record_collection, record_id, reversal_of)
    values (mv.org_id, mv.farm_id, mv.item_type, mv.item_id, -mv.delta_amount, mv.unit,
      '記録削除・訂正の取消', mv.record_collection, mv.record_id, mv.id);
    update public.farm_stock_movements set reversed = true where id = mv.id;

    if mv.item_type = 'pesticide' then
      update public.farm_pesticides set stock_l = coalesce(stock_l,0) - mv.delta_amount
        where id = mv.item_id and farm_id = mv.farm_id;
    else
      update public.farm_fertilizers set stock_kg = coalesce(stock_kg,0) - mv.delta_amount
        where id = mv.item_id and farm_id = mv.farm_id;
    end if;
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception '在庫戻しの対象資材が見つかりません(item_id=%)。処理を巻き戻しました', mv.item_id;
    end if;
    v_reversed := v_reversed + 1;
  end loop;
  return v_reversed;
end $$;

-- ── 保存RPC v3: duplicate時の内容検証を追加 ──
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
  v_org uuid := (p_record->>'org_id')::uuid;
  v_record_id uuid := (p_record->>'id')::uuid;
begin
  if p_table not in ('farm_work_records','farm_lot_spray_records','farm_top_dressing_records') then
    raise exception '対象外テーブル: %', p_table;
  end if;
  if v_farm is null or v_record_id is null then
    raise exception 'farm_id/idが未指定です';
  end if;

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
    p_table, p_table) using p_record;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    -- [Med対応] 同じIDでも「同一内容の再送」だけを冪等成功にする。内容が違えば拒否(訂正は更新RPCへ)
    execute format('select to_jsonb(t) - ''created_at'' - ''version'' from public.%I t where id=$1', p_table)
      into v_exist_row using v_record_id;
    execute format('select to_jsonb(x) - ''created_at'' - ''version'' from jsonb_populate_record(null::public.%I, $1) x', p_table)
      into v_in_row using p_record;
    if (v_exist_row->>'farm_id') is distinct from (v_in_row->>'farm_id')
       or (v_exist_row->>'org_id') is distinct from (v_in_row->>'org_id') then
      raise exception '同じIDの記録が別の農場/組織に存在します(id=%)', v_record_id;
    end if;
    if v_exist_row is distinct from v_in_row then
      raise exception '同じIDで内容が異なる再送は拒否します(id=%)。訂正は更新RPCを使用してください', v_record_id;
    end if;
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  perform farm_internal.farm__apply_stock_movements(v_org, v_farm, p_table, v_record_id, p_record, p_movements);
  return jsonb_build_object('ok', true);
end $$;

-- ── 更新RPC v3: 内部ヘルパーの参照先をfarm_internalへ ──
create or replace function public.farm_update_record_with_stock(
  p_table text, p_record jsonb, p_movements jsonb, p_expected_version int
) returns jsonb
language plpgsql
security invoker
as $$
declare
  v_ver int;
  v_farm uuid := (p_record->>'farm_id')::uuid;
  v_org uuid := (p_record->>'org_id')::uuid;
  v_record_id uuid := (p_record->>'id')::uuid;
  v_new jsonb;
begin
  if p_table not in ('farm_work_records','farm_lot_spray_records','farm_top_dressing_records') then
    raise exception '対象外テーブル: %', p_table;
  end if;
  if v_farm is null or v_record_id is null or p_expected_version is null then
    raise exception 'farm_id/id/expected_versionが未指定です';
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
  v_new := jsonb_set(p_record, '{version}', to_jsonb(p_expected_version + 1));
  execute format(
    'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
    p_table, p_table) using v_new;
  perform farm_internal.farm__apply_stock_movements(v_org, v_farm, p_table, v_record_id, v_new, p_movements);

  return jsonb_build_object('ok', true, 'version', p_expected_version + 1);
end $$;

-- ── 削除RPC v3: 内部ヘルパーの参照先をfarm_internalへ ──
create or replace function public.farm_delete_record_with_stock(
  p_table text, p_farm_id uuid, p_record_id uuid, p_expected_version int default null
) returns jsonb
language plpgsql
security invoker
as $$
declare
  v_deleted int;
  v_exists int;
  v_reversed int;
begin
  if p_table not in ('farm_work_records','farm_lot_spray_records','farm_top_dressing_records') then
    raise exception '対象外テーブル: %', p_table;
  end if;

  if p_expected_version is not null then
    execute format('delete from public.%I where id=$1 and farm_id=$2 and version=$3', p_table)
      using p_record_id, p_farm_id, p_expected_version;
  else
    execute format('delete from public.%I where id=$1 and farm_id=$2', p_table)
      using p_record_id, p_farm_id;
  end if;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    execute format('select count(*) from public.%I where id=$1 and farm_id=$2', p_table)
      into v_exists using p_record_id, p_farm_id;
    if v_exists > 0 then
      return jsonb_build_object('ok', false, 'conflict', true);
    end if;
    return jsonb_build_object('ok', true, 'alreadyGone', true);
  end if;

  v_reversed := farm_internal.farm__reverse_stock_movements(p_table, p_record_id);
  return jsonb_build_object('ok', true, 'reversed', v_reversed);
end $$;
