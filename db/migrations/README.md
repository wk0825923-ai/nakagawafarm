# db/migrations — 本番Supabaseに適用済みのDDL控え

本番プロジェクト jfalipljqvuzigmxzeoy に適用済みのmigration SQLの控え（引き継ぎ・再現性のため。Codexレビュー4 Med-3対応）。
適用の正本は Supabase 側の `supabase_migrations.schema_migrations`。ここは「同じ名前・同じ内容」を保存する鏡。

- ファイル名 = migration名（適用順に日付プレフィックス）
- フェーズ1（スキーマ確定: farm_phase1_extend_existing_tables / farm_phase1_add_missing_tables）は
  2026-07-11適用・本文はSupabase側参照（必要になったら同様に控えを追加する）
- 新しいmigrationを適用したら、必ず同名の .sql をここに追加すること
