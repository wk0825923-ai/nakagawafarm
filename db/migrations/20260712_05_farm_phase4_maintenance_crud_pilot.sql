-- 記録系CRUDパイロット(整備記録): 楽観ロック用version・旧数値ID保持用legacy_id・realtime配信
alter table public.farm_maintenance_records
  add column version integer not null default 1,
  add column legacy_id bigint;
alter publication supabase_realtime add table public.farm_maintenance_records;
alter table public.farm_maintenance_records replica identity full;
