-- フェーズ5: 日報(farm_work_records)のDB経路化に伴う列追加（Codexレビュー24 High対応）
-- ①crop_cycle_id: 記録と作付サイクルの紐付け。crop_cyclesはまだlocalStorage(未DB化)で
--   idが数値/文字列混在のためtextで受ける(将来crop_cyclesをUUID化してもtextなら不変)。
-- ②spray_volume_l: 基本日報の農薬散布で「散布液量(L)」を保存(アプリ形spray_volume_L)。
--   DB切替でこの2項目が欠落・再読込で消えるのを防ぐ。既存の畝ロット散布と同じ小文字列名。
alter table public.farm_work_records
  add column if not exists crop_cycle_id text,
  add column if not exists spray_volume_l numeric;
