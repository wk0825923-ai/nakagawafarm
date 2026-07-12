-- フェーズ4横展開: gap_documents / monthly_temps のDB経路化3点セット
-- ①upsert(onConflict)用の一意制約
alter table public.farm_gap_documents
  add constraint farm_gap_documents_farm_doc_uniq unique (farm_id, doc_id);
alter table public.farm_monthly_temps
  add constraint farm_monthly_temps_farm_uniq unique (farm_id); -- 1農場1行(全圃場共通の月別気温)
-- ②realtime配信(postgres_changes)の有効化
alter publication supabase_realtime add table public.farm_gap_documents;
alter publication supabase_realtime add table public.farm_monthly_temps;
-- ③filter付き購読にDELETEイベントも届くようにする
alter table public.farm_gap_documents replica identity full;
alter table public.farm_monthly_temps replica identity full;
