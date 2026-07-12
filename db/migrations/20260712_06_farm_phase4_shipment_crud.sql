-- 記録系CRUD展開(出荷記録): 楽観ロックversion・旧数値ID保持legacy_id・realtime配信
alter table public.farm_shipment_records
  add column version integer not null default 1,
  add column legacy_id bigint;
alter publication supabase_realtime add table public.farm_shipment_records;
alter table public.farm_shipment_records replica identity full;
