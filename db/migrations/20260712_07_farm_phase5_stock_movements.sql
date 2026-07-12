-- フェーズ5前倒し: 在庫移動の「通帳」テーブル（設計図=中川農園_在庫RPC設計図.html・Daiya決定2026-07-12）
-- 決定: マイナス在庫はCHECKで止めない(警告のみ)・残高はマスタ列キャッシュ＋通帳の二重持ち・削除は逆仕訳
create table public.farm_stock_movements (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references farm_organizations(id) on delete cascade,
  farm_id           uuid not null references farm_farms(id) on delete cascade,
  item_type         text not null check (item_type in ('pesticide','fertilizer')),
  item_id           uuid not null,
  delta_amount      numeric not null,
  unit              text not null default '',
  reason            text not null default '',
  record_collection text not null default '',
  record_id         uuid,
  reversal_of       uuid references farm_stock_movements(id),
  created_at        timestamptz default now()
);
-- 冪等キー: 同じ記録×同じ資材の使用記帳は1回だけ（再送で二重減算しない）
create unique index farm_stock_movements_idem
  on public.farm_stock_movements (record_collection, record_id, item_id)
  where reversal_of is null;
-- 逆仕訳の冪等性: 同じ記帳は1回しか取り消せない
create unique index farm_stock_movements_reversal_once
  on public.farm_stock_movements (reversal_of)
  where reversal_of is not null;
-- RLS: 既存farm_系と同型（自orgの行しか見えない/書けない）
alter table public.farm_stock_movements enable row level security;
create policy farm_stock_movements_all on public.farm_stock_movements
  for all using (org_id = any(farm_get_user_org_ids()))
  with check (org_id = any(farm_get_user_org_ids()));
