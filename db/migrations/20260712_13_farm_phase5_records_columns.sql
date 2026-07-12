-- 在庫連動3記録のCRUD化下準備: 楽観ロックversion・旧数値ID保持legacy_id・realtime配信
alter table public.farm_work_records add column version integer not null default 1, add column legacy_id bigint;
alter table public.farm_lot_spray_records add column version integer not null default 1, add column legacy_id bigint;
alter table public.farm_top_dressing_records add column version integer not null default 1, add column legacy_id bigint;
create unique index farm_work_records_farm_legacy_uniq on public.farm_work_records (farm_id, legacy_id) where legacy_id is not null;
create unique index farm_lot_spray_records_farm_legacy_uniq on public.farm_lot_spray_records (farm_id, legacy_id) where legacy_id is not null;
create unique index farm_top_dressing_records_farm_legacy_uniq on public.farm_top_dressing_records (farm_id, legacy_id) where legacy_id is not null;
alter publication supabase_realtime add table public.farm_work_records;
alter publication supabase_realtime add table public.farm_lot_spray_records;
alter publication supabase_realtime add table public.farm_top_dressing_records;
alter table public.farm_work_records replica identity full;
alter table public.farm_lot_spray_records replica identity full;
alter table public.farm_top_dressing_records replica identity full;
