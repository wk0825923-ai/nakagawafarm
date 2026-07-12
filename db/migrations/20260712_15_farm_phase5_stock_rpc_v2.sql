-- フェーズ5: 在庫RPC v2（Codexレビュー9対応）
-- [Critical] 記録ID再利用の事故防止: 削除済みIDでの再保存を入口で拒否＋通帳に「取消済みマーク」
-- [High] movement内容のサーバー検証（記録との資材一致・負数のみ・単位・空拒否・RPC内集約）
-- [High] 更新RPC新設（旧記帳の逆仕訳→記録更新→新記帳を1トランザクション）

-- 通帳: 取消済みマーク（行は消さない・金額も変えない。冪等キーを「未取消の記帳」に絞るため）
alter table public.farm_stock_movements add column reversed boolean not null default false;
drop index if exists farm_stock_movements_idem;
create unique index farm_stock_movements_idem
  on public.farm_stock_movements (record_collection, record_id, item_id)
  where reversal_of is null and not reversed;

-- ── 内部ヘルパー①: movement検証＋集約＋記帳＋残高更新 ──
create or replace function public.farm__apply_stock_movements(
  p_org uuid, p_farm uuid, p_table text, p_record_id uuid, p_record jsonb, p_movements jsonb
) returns void
language plpgsql
security invoker
as $$
declare
  agg record;
  v_updated int;
  v_cnt int;
  expected_ids uuid[];
  expected_type text;
begin
  -- 記録の内容から「期待される資材ID集合」を導出（記録と在庫移動の一致をサーバーで保証）
  if p_table = 'farm_lot_spray_records' then
    select array_agg(distinct (e->>'pesticide_id')::uuid) into expected_ids
      from jsonb_array_elements(coalesce(p_record->'pesticides','[]'::jsonb)) e;
    expected_type := 'pesticide';
  elsif p_table = 'farm_top_dressing_records' then
    select array_agg(distinct (e->>'fertilizer_id')::uuid) into expected_ids
      from jsonb_array_elements(coalesce(p_record->'fertilizers','[]'::jsonb)) e;
    expected_type := 'fertilizer';
  else -- farm_work_records: 農薬散布のみ在庫連動
    if (p_record->>'work_type') = '農薬散布' and coalesce(p_record->>'pesticide_id','') <> '' then
      expected_ids := array[(p_record->>'pesticide_id')::uuid];
      expected_type := 'pesticide';
    else
      expected_ids := array[]::uuid[];
    end if;
  end if;

  select count(*) into v_cnt from jsonb_array_elements(p_movements);
  if coalesce(array_length(expected_ids,1),0) > 0 and v_cnt = 0 then
    raise exception '在庫連動の記録なのに在庫移動が空です（記録と在庫がズレるため拒否）';
  end if;
  if coalesce(array_length(expected_ids,1),0) = 0 and v_cnt > 0 then
    raise exception '在庫を使わない記録に在庫移動が指定されています';
  end if;

  -- 同一資材の複数行はRPC内で先に集約（冪等キーとの衝突と二重記帳を防ぐ）
  for agg in
    select (e->>'item_type') as item_type, (e->>'item_id')::uuid as item_id,
           sum((e->>'delta_amount')::numeric) as delta,
           min(coalesce(e->>'unit','')) as unit, min(coalesce(e->>'reason','')) as reason
    from jsonb_array_elements(p_movements) e
    group by 1, 2
  loop
    if agg.item_type is distinct from expected_type then
      raise exception '記録種別と資材種別が一致しません(%)', agg.item_type;
    end if;
    if not (agg.item_id = any(expected_ids)) then
      raise exception '記録に含まれない資材への在庫移動は拒否します(%)', agg.item_id;
    end if;
    if agg.delta >= 0 then
      raise exception '使用の在庫移動は負の量のみ許可します(%)', agg.delta;
    end if;
    if agg.delta < -100000 then
      raise exception '在庫移動量が異常です(%)', agg.delta;
    end if;
    if expected_type = 'pesticide' and agg.unit not in ('', 'L') then
      raise exception '農薬の在庫移動の単位はLのみ(%)', agg.unit;
    end if;
    if expected_type = 'fertilizer' and agg.unit not in ('', 'kg') then
      raise exception '肥料の在庫移動の単位はkgのみ(%)', agg.unit;
    end if;

    insert into public.farm_stock_movements
      (org_id, farm_id, item_type, item_id, delta_amount, unit, reason, record_collection, record_id)
    values (p_org, p_farm, agg.item_type, agg.item_id, agg.delta, agg.unit, agg.reason, p_table, p_record_id);

    if expected_type = 'pesticide' then
      update public.farm_pesticides set stock_l = coalesce(stock_l,0) + agg.delta
        where id = agg.item_id and farm_id = p_farm;
    else
      update public.farm_fertilizers set stock_kg = coalesce(stock_kg,0) + agg.delta
        where id = agg.item_id and farm_id = p_farm;
    end if;
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception '在庫の対象資材が見つかりません(item_id=% type=%)。記録・記帳ごと取り消しました',
        agg.item_id, agg.item_type;
    end if;
  end loop;
end $$;

-- ── 内部ヘルパー②: 未取消の記帳を逆仕訳＋取消済みマーク＋残高戻し ──
create or replace function public.farm__reverse_stock_movements(
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

-- ── 保存RPC v2: ID再利用禁止＋検証付き記帳 ──
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

  -- [Critical対応] 記録が存在しないのに通帳履歴だけある = 削除済みIDの再利用 → 全体拒否
  execute format('select count(*) from public.%I where id=$1', p_table) into v_exists using v_record_id;
  if v_exists = 0 then
    select count(*) into v_hist from public.farm_stock_movements
      where record_collection = p_table and record_id = v_record_id;
    if v_hist > 0 then
      raise exception '削除済みの記録IDは再利用できません(id=%)。新しいIDで保存してください', v_record_id;
    end if;
  end if;

  -- 記録insert（同じidの再送=既存行あり=冪等成功。在庫も触らない）
  execute format(
    'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1) on conflict (id) do nothing',
    p_table, p_table) using p_record;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  perform public.farm__apply_stock_movements(v_org, v_farm, p_table, v_record_id, p_record, p_movements);
  return jsonb_build_object('ok', true);
end $$;

-- ── 更新RPC(新設): 版ロック→旧記帳の逆仕訳→記録置換→新記帳 を1トランザクション ──
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
    return jsonb_build_object('ok', false, 'notFound', true); -- 別端末で削除済み
  end if;
  if v_ver <> p_expected_version then
    return jsonb_build_object('ok', false, 'conflict', true); -- 別端末で更新済み
  end if;

  perform public.farm__reverse_stock_movements(p_table, v_record_id); -- 旧使用量を戻す(赤ペン)
  execute format('delete from public.%I where id=$1 and farm_id=$2', p_table) using v_record_id, v_farm;
  v_new := jsonb_set(p_record, '{version}', to_jsonb(p_expected_version + 1)); -- versionはサーバーが強制
  execute format(
    'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
    p_table, p_table) using v_new;
  perform public.farm__apply_stock_movements(v_org, v_farm, p_table, v_record_id, v_new, p_movements);

  return jsonb_build_object('ok', true, 'version', p_expected_version + 1);
end $$;

-- ── 削除RPC v2: ヘルパー利用に統一 ──
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

  v_reversed := public.farm__reverse_stock_movements(p_table, p_record_id);
  return jsonb_build_object('ok', true, 'reversed', v_reversed);
end $$;
