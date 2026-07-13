-- フェーズ5: 在庫調整RPC v2（Codexレビュー14 Medium対応: 同一ref_idの同時再送race解消）
-- v1はcount()による事前チェックのみだったため、2つの同時リクエストが両方チェックを通過して
-- 二重記帳できた。部分ユニークインデックスで(集計対象の)記帳を一意化し、
-- insert ... on conflict do nothing の実挿入行数で冪等判定する（チェックと挿入を原子化）。

-- 有効な記帳(取消行でも取消済みでもない)は 記録×資材 で一意。
-- 記録RPC(v6)も1記録×1資材=1記帳・ID再利用禁止・取消はreversal_of/reversedで除外されるため両立する。
create unique index if not exists farm_stock_movements_active_ref_uniq
  on public.farm_stock_movements (record_collection, record_id, item_id)
  where reversal_of is null and not reversed;

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

  -- 冪等: 既に同じref_id×資材の有効な記帳があれば挿入0行→duplicate。
  -- v_delta=0(棚卸しで同値等)でも先に重複判定できるよう、記帳の前に必ずこの分岐を通す。
  if exists (
    select 1 from public.farm_stock_movements
    where record_collection = 'stock_adjust' and record_id = p_ref_id and item_id = p_item_id
      and reversal_of is null and not reversed
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  if v_delta = 0 then
    return jsonb_build_object('ok', true, 'noop', true); -- 変化なし(棚卸しで同値等)は記帳しない
  end if;

  insert into public.farm_stock_movements
    (org_id, farm_id, item_type, item_id, delta_amount, unit, reason, record_collection, record_id)
  values (v_org, p_farm_id, p_item_type, p_item_id, round(v_delta, 2),
    case when p_item_type = 'pesticide' then 'L' else 'kg' end,
    coalesce(p_reason, '在庫調整'), 'stock_adjust', p_ref_id)
  on conflict (record_collection, record_id, item_id)
    where reversal_of is null and not reversed
    do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('ok', true, 'duplicate', true); -- 直前に別トランザクションが記帳済み
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
