-- フェーズ5: 在庫調整RPC v3（Codexレビュー15対応）
-- [Medium] setのno-op(差分ゼロ)も記帳して冪等マーカーを残す。
--   v2はno-opを記帳しなかったため「10L→棚卸し10L(no-op)→応答喪失→別操作で15L→同じref_id再送」で
--   15Lから10Lへ巻き戻せた。delta_amount=0の行を残せば再送はduplicateになり巻き戻らない。
-- [Low] farm_stock_movements_active_ref_uniq は既存の farm_stock_movements_idem と
--   同一列・同一条件の重複だったため削除(ON CONFLICT句は条件一致でidemに解決される)。

drop index if exists public.farm_stock_movements_active_ref_uniq;

create or replace function public.farm_adjust_stock(
  p_item_type text,   -- 'pesticide' | 'fertilizer'
  p_item_id uuid,
  p_farm_id uuid,
  p_mode text,        -- 'delta' | 'set'
  p_amount numeric,   -- delta: 増減量(正=入荷/負=調整減) / set: 新しい残高
  p_reason text,      -- '仕入れ' '棚卸し調整' '初期在庫' など
  p_ref_id uuid       -- 冪等キー(仕入れ行のid等。再送で二重加算しない)
) returns jsonb
language plpgsql
security invoker
as $$
declare
  v_org uuid;
  v_cur numeric;
  v_delta numeric;
  v_inserted int;
begin
  if p_item_type not in ('pesticide','fertilizer') then
    raise exception '不明なitem_type: %', p_item_type;
  end if;
  if p_mode not in ('delta','set') then
    raise exception '不明なmode: %', p_mode;
  end if;
  if p_ref_id is null then
    raise exception 'ref_id(冪等キー)が未指定です';
  end if;
  if abs(coalesce(p_amount, 0)) > 100000 then
    raise exception '在庫調整量が異常です(%)', p_amount;
  end if;

  select org_id into v_org from public.farm_farms where id = p_farm_id;
  if v_org is null then
    raise exception '対象の農場が見つかりません(farm_id=%)', p_farm_id;
  end if;

  -- 現在残高を行ロックつきで取得。同一資材への同時調整はここで直列化されるため、
  -- 後続のon conflict判定も先行トランザクションのcommit後に評価される。
  if p_item_type = 'pesticide' then
    select coalesce(stock_l, 0) into v_cur from public.farm_pesticides
      where id = p_item_id and farm_id = p_farm_id for update;
  else
    select coalesce(stock_kg, 0) into v_cur from public.farm_fertilizers
      where id = p_item_id and farm_id = p_farm_id for update;
  end if;
  if v_cur is null then
    raise exception '在庫の対象資材が見つかりません(item_id=% type=%)', p_item_id, p_item_type;
  end if;

  v_delta := case when p_mode = 'set' then round(p_amount, 2) - v_cur else round(p_amount, 2) end;

  -- 冪等チェックと記帳を1文で原子化。no-op(差分ゼロ)でも0円の仕訳を残して
  -- 「この要求は処理済み」の証拠にする(応答喪失→再送の巻き戻し防止)。
  insert into public.farm_stock_movements
    (org_id, farm_id, item_type, item_id, delta_amount, unit, reason, record_collection, record_id)
  values (v_org, p_farm_id, p_item_type, p_item_id, round(v_delta, 2),
    case when p_item_type = 'pesticide' then 'L' else 'kg' end,
    coalesce(p_reason, '在庫調整') || case when v_delta = 0 then '(変化なし)' else '' end,
    'stock_adjust', p_ref_id)
  on conflict (record_collection, record_id, item_id)
    where reversal_of is null and not reversed
    do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('ok', true, 'duplicate', true); -- 同一ref_idの処理済み要求(同時到着含む)
  end if;

  if v_delta = 0 then
    return jsonb_build_object('ok', true, 'noop', true, 'stock', round(v_cur, 2));
  end if;

  if p_item_type = 'pesticide' then
    update public.farm_pesticides set stock_l = round(v_cur + v_delta, 2)
      where id = p_item_id and farm_id = p_farm_id;
  else
    update public.farm_fertilizers set stock_kg = round(v_cur + v_delta, 2)
      where id = p_item_id and farm_id = p_farm_id;
  end if;

  return jsonb_build_object('ok', true, 'delta', round(v_delta, 2), 'stock', round(v_cur + v_delta, 2));
end $$;
