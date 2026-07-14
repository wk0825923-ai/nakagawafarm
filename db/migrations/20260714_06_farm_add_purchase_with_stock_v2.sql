-- フェーズ5: 仕入れRPC v2（Codexレビュー High対応）
-- v1は同一purchase_idの再送を、既存行の内容を確認せず duplicate:true にしていた。
-- 「5Lで成功→応答喪失→6Lに変えて再送」で、DB/在庫は5Lのまま画面だけ6Lに置換され食い違う余地があった。
-- v2: conflict時に既存行を取得し farm_id/資材ID/日付/丸め量/仕入れ先/金額 を完全一致照合。
--     一致のみ duplicate(冪等成功)、不一致は例外(=別内容の再送を成功扱いにしない)。
create or replace function public.farm_add_purchase_with_stock(
  p_item_type text,
  p_item_id uuid,
  p_farm_id uuid,
  p_purchase_id uuid,
  p_date date,
  p_amount numeric,
  p_supplier text,
  p_price_yen numeric
) returns jsonb
language plpgsql
security invoker
as $$
declare
  v_org uuid;
  v_cur numeric;
  v_inserted int;
  v_ex record;
  v_amt numeric := round(p_amount, 2);
  v_sup text := coalesce(p_supplier, '');
begin
  if p_item_type not in ('pesticide','fertilizer') then
    raise exception '不明なitem_type: %', p_item_type;
  end if;
  if p_purchase_id is null then
    raise exception 'purchase_id(冪等キー)が未指定です';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception '仕入れ量が正しくありません(%)', p_amount;
  end if;
  if abs(p_amount) > 1000000 then
    raise exception '仕入れ量が異常です(%)', p_amount;
  end if;

  select org_id into v_org from public.farm_farms where id = p_farm_id;
  if v_org is null then
    raise exception '対象の農場が見つかりません(farm_id=%)', p_farm_id;
  end if;

  if p_item_type = 'pesticide' then
    select coalesce(stock_l, 0) into v_cur from public.farm_pesticides
      where id = p_item_id and farm_id = p_farm_id for update;
  else
    select coalesce(stock_kg, 0) into v_cur from public.farm_fertilizers
      where id = p_item_id and farm_id = p_farm_id for update;
  end if;
  if v_cur is null then
    raise exception '仕入れ対象の資材が見つかりません(item_id=% type=%)', p_item_id, p_item_type;
  end if;

  -- 履歴insert(冪等の砦)。同一purchase_idの再送は0行insert
  if p_item_type = 'pesticide' then
    insert into public.farm_pesticide_purchases (id, org_id, farm_id, pesticide_id, date, amount_l, supplier, price_yen)
    values (p_purchase_id, v_org, p_farm_id, p_item_id, p_date, v_amt, v_sup, p_price_yen)
    on conflict (id) do nothing;
  else
    insert into public.farm_fertilizer_purchases (id, org_id, farm_id, fertilizer_id, date, amount_kg, supplier, price_yen)
    values (p_purchase_id, v_org, p_farm_id, p_item_id, p_date, v_amt, v_sup, p_price_yen)
    on conflict (id) do nothing;
  end if;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    -- 既存行の内容と完全一致する再送だけを冪等成功にする。別内容(量/資材/日付/仕入先/金額/農場)なら拒否。
    if p_item_type = 'pesticide' then
      select farm_id, pesticide_id as item_id, date, amount_l as amount, supplier, price_yen
        into v_ex from public.farm_pesticide_purchases where id = p_purchase_id;
    else
      select farm_id, fertilizer_id as item_id, date, amount_kg as amount, supplier, price_yen
        into v_ex from public.farm_fertilizer_purchases where id = p_purchase_id;
    end if;
    if v_ex.farm_id = p_farm_id
       and v_ex.item_id is not distinct from p_item_id
       and v_ex.date is not distinct from p_date
       and round(coalesce(v_ex.amount, 0), 2) = v_amt
       and coalesce(v_ex.supplier, '') = v_sup
       and v_ex.price_yen is not distinct from p_price_yen then
      return jsonb_build_object('ok', true, 'duplicate', true); -- 同一内容の再送=冪等成功
    end if;
    raise exception '同じ送信IDで内容の異なる仕入れが既に登録されています(purchase_id=%)。画面を再読込してご確認ください', p_purchase_id;
  end if;

  insert into public.farm_stock_movements
    (org_id, farm_id, item_type, item_id, delta_amount, unit, reason, record_collection, record_id)
  values (v_org, p_farm_id, p_item_type, p_item_id, v_amt,
    case when p_item_type = 'pesticide' then 'L' else 'kg' end,
    '仕入れ', 'purchase', p_purchase_id);

  if p_item_type = 'pesticide' then
    update public.farm_pesticides set stock_l = round(v_cur + p_amount, 2)
      where id = p_item_id and farm_id = p_farm_id;
  else
    update public.farm_fertilizers set stock_kg = round(v_cur + p_amount, 2)
      where id = p_item_id and farm_id = p_farm_id;
  end if;

  return jsonb_build_object('ok', true, 'stock', round(v_cur + p_amount, 2));
end $$;
