-- フェーズ4後半: filter付きrealtime購読でDELETEイベントも届くようにする
-- (replica identity defaultではfilter付き購読にDELETEが配信されず、全行削除だけの更新が他端末に伝わらない)
alter table public.farm_shipment_destinations replica identity full;
