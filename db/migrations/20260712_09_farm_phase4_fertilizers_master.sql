-- マスタUUID化第2弾(肥料): 旧数値ID保持legacy_id(同一農場内で一意)＋realtime配信
alter table public.farm_fertilizers add column legacy_id bigint;
create unique index farm_fertilizers_farm_legacy_uniq
  on public.farm_fertilizers (farm_id, legacy_id) where legacy_id is not null;
alter publication supabase_realtime add table public.farm_fertilizers;
alter table public.farm_fertilizers replica identity full;
