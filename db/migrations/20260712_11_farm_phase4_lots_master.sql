-- マスタUUID化第4弾(畝ロット): 旧数値ID保持legacy_id(同一農場内一意)＋realtime配信
alter table public.farm_lots add column legacy_id bigint;
create unique index farm_lots_farm_legacy_uniq
  on public.farm_lots (farm_id, legacy_id) where legacy_id is not null;
alter publication supabase_realtime add table public.farm_lots;
alter table public.farm_lots replica identity full;
