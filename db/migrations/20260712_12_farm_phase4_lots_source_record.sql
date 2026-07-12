-- 畝ロット: 定植日報から自動生成した際の生成元記録IDを永続化（追跡情報・Codexレビュー7 Low対応）
-- 旧数値ID/UUIDどちらも入るようtext型
alter table public.farm_lots add column source_record_id text;
