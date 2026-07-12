-- フェーズ5: 在庫RPC（設計図=中川農園_在庫RPC設計図.html・レビュー4 High-3のRETURNING検証反映）
-- 「記録insert＋在庫記帳＋残高キャッシュ更新」を1トランザクションで処理する（レジの一括会計）。
-- security invoker=呼び出しユーザー権限のままRLSが全行に効く。記録IDが冪等キー（再送で二重減算しない）。

create or replace function public.farm_save_record_with_stock(
  p_table text,
  p_record jsonb,
  p_movements jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security invoker
as $$
declare
  v_inserted int;
  v_updated int;
  m jsonb;
  v_farm uuid := (p_record->>'farm_id')::uuid;
  v_record_id uuid := (p_record->>'id')::uuid;
begin
  -- ホワイトリスト: 在庫が絡む3記録のみ
  if p_table not in ('farm_work_records','farm_lot_spray_records','farm_top_dressing_records') then
    raise exception '対象外テーブル: %', p_table;
  end if;
  if v_farm is null or v_record_id is null then
    raise exception 'farm_id/idが未指定です';
  end if;

  -- ① 記録insert（同じidの再送は何もせず冪等成功=在庫も触らない）
  execute format(
    'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1) on conflict (id) do nothing',
    p_table, p_table) using p_record;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  -- ② 在庫記帳＋③ 残高キャッシュ更新（同一トランザクション。失敗したら記録ごと全部なかったことに）
  for m in select * from jsonb_array_elements(p_movements) loop
    -- 同一記録×同一資材が複数行来た場合は合算（冪等indexと衝突させない）
    insert into public.farm_stock_movements
      (org_id, farm_id, item_type, item_id, delta_amount, unit, reason, record_collection, record_id)
    values ((p_record->>'org_id')::uuid, v_farm, m->>'item_type', (m->>'item_id')::uuid,
      (m->>'delta_amount')::numeric, coalesce(m->>'unit',''), coalesce(m->>'reason',''), p_table, v_record_id)
    on conflict (record_collection, record_id, item_id) where reversal_of is null
    do update set delta_amount = farm_stock_movements.delta_amount + excluded.delta_amount;

    if (m->>'item_type') = 'pesticide' then
      update public.farm_pesticides set stock_l = coalesce(stock_l,0) + (m->>'delta_amount')::numeric
        where id = (m->>'item_id')::uuid and farm_id = v_farm;
    elsif (m->>'item_type') = 'fertilizer' then
      update public.farm_fertilizers set stock_kg = coalesce(stock_kg,0) + (m->>'delta_amount')::numeric
        where id = (m->>'item_id')::uuid and farm_id = v_farm;
    else
      raise exception '不明なitem_type: %', m->>'item_type';
    end if;
    get diagnostics v_updated = row_count;
    -- 残高更新0件=item_id不正/他農場。黙って成功させると通帳と残高が初日からズレる(レビュー4 High-3)
    if v_updated <> 1 then
      raise exception '在庫の対象資材が見つかりません(item_id=% type=%)。記録・記帳ごと取り消しました',
        m->>'item_id', m->>'item_type';
    end if;
  end loop;

  return jsonb_build_object('ok', true);
end $$;

-- 削除RPC: 記録delete＋逆仕訳（通帳の行は消さず「打ち消しの行」を追加=赤ペン方式）＋残高戻し
create or replace function public.farm_delete_record_with_stock(
  p_table text,
  p_farm_id uuid,
  p_record_id uuid,
  p_expected_version int default null
) returns jsonb
language plpgsql
security invoker
as $$
declare
  v_deleted int;
  v_exists int;
  v_updated int;
  v_reversed int := 0;
  mv record;
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
      return jsonb_build_object('ok', false, 'conflict', true); -- 版ズレ(別端末が更新済み)
    end if;
    return jsonb_build_object('ok', true, 'alreadyGone', true); -- 既に削除済み=冪等成功(逆仕訳は増やさない)
  end if;

  -- この記録の「未取消」記帳を1件ずつ打ち消す(reversal_of一意index=同じ記帳は1回しか取り消せない)
  for mv in
    select * from public.farm_stock_movements s
    where s.record_collection = p_table and s.record_id = p_record_id and s.reversal_of is null
      and not exists (select 1 from public.farm_stock_movements r where r.reversal_of = s.id)
  loop
    insert into public.farm_stock_movements
      (org_id, farm_id, item_type, item_id, delta_amount, unit, reason, record_collection, record_id, reversal_of)
    values (mv.org_id, mv.farm_id, mv.item_type, mv.item_id, -mv.delta_amount, mv.unit,
      '記録削除の取消', mv.record_collection, mv.record_id, mv.id);

    if mv.item_type = 'pesticide' then
      update public.farm_pesticides set stock_l = coalesce(stock_l,0) - mv.delta_amount
        where id = mv.item_id and farm_id = mv.farm_id;
    else
      update public.farm_fertilizers set stock_kg = coalesce(stock_kg,0) - mv.delta_amount
        where id = mv.item_id and farm_id = mv.farm_id;
    end if;
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception '在庫戻しの対象資材が見つかりません(item_id=%)。削除・取消ごと巻き戻しました', mv.item_id;
    end if;
    v_reversed := v_reversed + 1;
  end loop;

  return jsonb_build_object('ok', true, 'reversed', v_reversed);
end $$;
