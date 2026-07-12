-- マスタUUID化第3弾(圃場): 旧数値ID保持legacy_id(同一農場内一意)＋地図境界boundary＋realtime配信
alter table public.farm_fields add column legacy_id bigint;
alter table public.farm_fields add column boundary jsonb; -- 圃場マップのポリゴン(アプリ側boundary。migrationで落ちていた)
create unique index farm_fields_farm_legacy_uniq
  on public.farm_fields (farm_id, legacy_id) where legacy_id is not null;
alter publication supabase_realtime add table public.farm_fields;
alter table public.farm_fields replica identity full;
