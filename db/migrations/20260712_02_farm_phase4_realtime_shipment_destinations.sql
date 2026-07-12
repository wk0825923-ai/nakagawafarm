-- フェーズ4後半: 出荷先マスタのリアルタイム同期を有効化（postgres_changes発火に必須）
-- RLSは有効のまま＝realtimeイベントも自orgの行しか届かない
alter publication supabase_realtime add table public.farm_shipment_destinations;
