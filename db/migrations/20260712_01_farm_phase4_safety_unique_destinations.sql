-- フェーズ4安全化: 出荷先マスタの upsert(onConflict: farm_id,key) に必須の一意制約
-- ※前セッションで適用済みと記録されていたが実際は未適用だった（実機検証で42P10を検出）
alter table public.farm_shipment_destinations
  add constraint farm_shipment_destinations_farm_key_uniq unique (farm_id, key);
