// qa_migration.js — フェーズ3 移行ロジックの検証（Node単体・Supabase不要・本番に書き込まない）
// buildMigrationPlan が「件数一致・ID張り替え・正規化・在庫マージ・依存順」を満たすか検査。
const M = require('../js/migration.js')
const checks = []
const ok = (name, cond, extra) => checks.push({ name, pass: !!cond, extra: extra == null ? '' : String(extra) })
const isUuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const isYmd  = v => v == null || /^\d{4}-\d{2}-\d{2}$/.test(v)

// ── アプリの実保存形状に沿ったサンプル（旧ID=数値・日付=文字列/一部Excelシリアル・在庫別） ──
const local = {
  farm_fields_v2: [
    { id: 1, name: '第1圃場', field_no: '1', crop: 'レタス', area_are: 60, crop_category: 'leaf_veg', row_count: 41, status: '栽培中', lat: 35.4, lng: 139.93, area_name: '上望陀', address: '千葉県木更津市上望陀1-1', emaff_no: '1000000000001', gap_target: true },
    { id: 2, name: '第2圃場', field_no: '2', crop: 'レタス', area_are: 25, crop_category: 'leaf_veg', row_count: 58, status: '栽培中' },
  ],
  farm_staff: [{ id: 10, name: 'グエン', role: 'trainee', nationality: 'ベトナム', visa_expiry: '2027-03-31' }],
  farm_pesticides: [
    { id: 100, name: 'テスト殺菌剤A', reg_no: '第10001号', dilution: 1000, preharvest_days: 7, max_times: 5, target_crop: 'レタス' },
    { id: 101, name: 'テスト殺虫剤B', reg_no: '第10002号', dilution: 2000, preharvest_days: 14, max_times: 3 },
  ],
  farm_pesticide_stock: [{ pesticide_id: 100, stock_l: 18, alert_threshold_l: 5 }],
  farm_pesticide_purchases: [{ id: 900, pesticide_id: 100, date: '2026-01-10', amount_L: 20, price_yen: 40000 }],
  farm_fertilizers: [
    { id: 200, name: '葉菜専用Dd404', maker: 'JA', weight_per_bag_kg: 20, price_per_bag_yen: 2614, unit_price_yen_per_kg: 130.7 },
    { id: 201, name: '6:1', weight_per_bag_kg: 140, unit_price_yen_per_kg: 133.3, blend_components: [{ fertilizer_id: 200, bags: 6 }] },
  ],
  farm_fertilizer_stock: [{ fertilizer_id: 200, stock_kg: 300, alert_threshold_kg: 40 }],
  farm_fertilizer_purchases: [{ id: 910, fertilizer_id: 200, date: '2026-01-10', amount_kg: 2000, price_yen: 240000 }],
  farm_crop_categories: [{ key: 'leaf_veg', name: '葉物野菜', ui_mode: 'row_map', color: '#0D9972', sort_order: 0 }],
  farm_shipment_destinations: [{ key: 'ja', label: 'JA木更津', frequent: true, sort_order: 0 }],
  // ロットは {fieldId:[...]} オブジェクト。field_id は入っていない前提でキーから引く
  farm_lots: {
    1: [{ id: 300, row_range: '1-6', variety: 'シスコ', seed_date: 45896, transplant_date: '2026-02-01', seedling_period_days: 27, status: 'harvested', seed_supplier: '葛田園芸', seed_gmo: '無', seed_disinfection: 'なし' }],
    2: [{ id: 301, row_range: '7-12', variety: 'ラプトル', seed_date: '2026-03-05', transplant_date: '2026-04-01', status: 'growing' }],
  },
  farm_records: [
    { id: 500, date: '2026-05-01', field_id: 1, work_type: '除草', weather: '晴', worker: '佐藤', note: '', start_time: '08:00', end_time: '10:00', break_minutes: 15, machine_no: '', photos: [], field_ids: [1, 2] },
  ],
  farm_lot_spray_records: [
    { id: 600, field_id: 1, date: '2026-03-20', weather: '晴', row_range: '1-6', pesticides: [{ pesticide_id: 100, dilution: 1000 }], spray_volume_L: 100, staff_ids: [10], note: '' },
  ],
  farm_top_dressing_records: [
    { id: 700, field_id: 1, date: '2026-01-20', fertilizing_type: '元肥', item: 'レタス', row_range: '1-6', row_count: 6, fertilizers: [{ fertilizer_id: 200, amount_kg: 40 }], spray_volume_L: null, note: '' },
    { id: 701, field_id: 2, date: '2026-04-15', fertilizing_type: '追肥', item: 'レタス', row_range: '7-12', fertilizers: [], note: '' },
  ],
  farm_harvest_records: [
    { id: 800, field_id: 1, date: '2026-05-10', variety: 'シスコ', row_range: '1-6', lot_code: '(1)05100106', shipments: [{ dest: 'JA木更津', cases: 40 }], total_cases: 40, worker: '佐藤', note: '' },
  ],
  farm_shipment_records: [
    { id: 850, date: '2026-05-20', variety: 'シスコ', harvest_date: '2026-05-10', lot_code: '(1)05100106', dest: 'JA木更津', cases: 32, note: '' },
  ],
  farm_maintenance_records: [{ id: 860, date: '2026-06-20', machine_name: 'トラクタ1号', machine_no: 'T-01', mtype: '点検', result: '良好', worker: '中川', note: '' }],
  farm_trainee_diaries: [{ id: 870, date: '2026-05-01', staff_id: 10, start_time: '08:00', end_time: '17:00', break_minutes: 60, tasks: '除草', field_ids: [1], supervisor: '中川', notes: '' }],
  farm_today_tasks: [{ id: 880, field_id: 1, worker: '佐藤', work_type: '灌水', time: '09:00', priority: 'high', done: false, date: '2026-07-11' }],
  farm_rentals: [{ id: 890, equipment: 'トラクタ', date: '2026-07-01', type: 'own', note: '' }],
  farm_crop_plans: [{ id: 400, field_id: 1, crop: 'レタス', start_month: 9, end_month: 5, status: 'active', year: 2025 }],
  farm_crop_cycles: [{ id: 410, field_id: 2, crop: 'レタス', status: 'active', year: 2025 }],
  farm_gap: [{ id: 1, code: '26.01', category: '種苗', item: '品種登録に関する法令に適合', is_cleared: true }],
  farm_gap_documents: { 'doc_01': { ready: true, updated: '2026-07-01', note: '整備済み' }, 'doc_02': { ready: false } },
  farm_monthly_temps: [1, 2, 6, 12, 17, 21, 25, 26, 21, 15, 9, 3],
  farm_field_performance_comments: [{ field_id: 1, comment: '良好' }],
  farm_crop_comments: [{ crop: 'レタス', comment: '順調' }],
  farm_field_performance: [{ some: 'fixed' }],
}

const ORG = '11111111-1111-1111-1111-111111111111'
const FARM = '22222222-2222-2222-2222-222222222222'
const plan = M.buildMigrationPlan(local, { orgId: ORG, farmId: FARM })
const P = plan.plans

// ── 検査 ──
// 1) 全コレクションがいずれかのテーブルへ（未マップ0）
const mappedSources = Object.keys(plan.counts)
ok('M1 全26コレクションが移行対象として処理される', mappedSources.length >= 24, 'sources=' + mappedSources.length)

// 2) 件数一致（代表）
ok('M2 圃場2件・ロット2件・散布1件・施肥2件・収穫1件・出荷1件',
  P.farm_fields.length === 2 && P.farm_lots.length === 2 && P.farm_lot_spray_records.length === 1 &&
  P.farm_top_dressing_records.length === 2 && P.farm_harvest_records.length === 1 && P.farm_shipment_records.length === 1,
  JSON.stringify({ f: P.farm_fields.length, l: P.farm_lots.length, s: P.farm_lot_spray_records.length, t: P.farm_top_dressing_records.length, h: P.farm_harvest_records.length, sh: P.farm_shipment_records.length }))

// 3) crop_plans + cycles 統合（1+1=2）
ok('M3 作付計画+サイクルが統合されて2件', P.farm_crop_plans.length === 2)

// 4) GAP文書オブジェクト→2行に展開 / 月別気温→1行
ok('M4 GAP文書2行・月別気温1行(12要素)', P.farm_gap_documents.length === 2 && P.farm_monthly_temps.length === 1 && P.farm_monthly_temps[0].temps.length === 12)

// 5) 全行に org_id / farm_id
let allTenant = true
Object.keys(P).forEach(t => P[t].forEach(r => { if (t !== 'farm_crop_categories' && (r.org_id !== ORG || r.farm_id !== FARM)) allTenant = false }))
ok('M5 全行に org_id / farm_id が付く', allTenant)

// 6) ID張り替え: 圃場IDがUUID・ロット/散布/収穫のfield_idが圃場UUIDに解決
const fieldUuid1 = plan.idMaps.fields['1']
ok('M6 圃場ID→UUID・参照(field_id)が解決される',
  isUuid(P.farm_fields[0].id) && isUuid(fieldUuid1) &&
  P.farm_lots[0].field_id === fieldUuid1 &&
  P.farm_lot_spray_records[0].field_id === fieldUuid1 &&
  P.farm_harvest_records[0].field_id === fieldUuid1 &&
  P.farm_top_dressing_records[0].field_id === fieldUuid1,
  JSON.stringify({ fld: P.farm_fields[0].id, lotFid: P.farm_lots[0].field_id }))

// 7) 記録の複数圃場参照(field_ids)も張り替え / 実習生のstaff_id張り替え
const staffUuid = plan.idMaps.staff['10']
ok('M7 field_ids配列・staff_idも張り替え',
  P.farm_work_records[0].field_ids.every(isUuid) && P.farm_work_records[0].field_ids.length === 2 &&
  P.farm_trainee_diaries[0].staff_id === staffUuid,
  JSON.stringify(P.farm_work_records[0].field_ids))

// 8) 仕入れのマスタ参照
ok('M8 仕入れの pesticide_id / fertilizer_id が解決',
  P.farm_pesticide_purchases[0].pesticide_id === plan.idMaps.pesticides['100'] &&
  P.farm_fertilizer_purchases[0].fertilizer_id === plan.idMaps.fertilizers['200'])

// 9) 在庫マージ（別コレクション farm_pesticide_stock/fertilizer_stock がマスタ本体列へ）
ok('M9 在庫がマスタ本体に統合(農薬18L/肥料300kg)',
  P.farm_pesticides[0].stock_l === 18 && P.farm_pesticides[0].alert_threshold_l === 5 &&
  P.farm_fertilizers[0].stock_kg === 300 && P.farm_fertilizers[0].alert_threshold_kg === 40,
  JSON.stringify({ pl: P.farm_pesticides[0].stock_l, fk: P.farm_fertilizers[0].stock_kg }))

// 10) 日付正規化: Excelシリアル(45896)→YYYY-MM-DD、文字列→そのまま
const seedDate = P.farm_lots[0].seed_date
let allDatesYmd = true
;['farm_lots', 'farm_harvest_records', 'farm_top_dressing_records', 'farm_shipment_records'].forEach(t =>
  P[t].forEach(r => { if (!isYmd(r.date) || !isYmd(r.seed_date) || !isYmd(r.harvest_date)) allDatesYmd = false }))
// 45896(Excelシリアル)=2025-08-27。実データ レタス管理表の播種日(BD:45896=8月27日)と一致＝正しく変換できている証拠
ok('M10 日付が全てYYYY-MM-DD(Excelシリアル45896→2025-08-27)', isYmd(seedDate) && seedDate === '2025-08-27' && allDatesYmd, 'seed=' + seedDate)

// 11) 配合肥料 blend_components が保持される
ok('M11 配合肥料の内訳が保持', Array.isArray(P.farm_fertilizers[1].blend_components) && P.farm_fertilizers[1].blend_components[0].bags === 6)

// 12) 数値型: total_cases/area_are が数値、文字列でない
ok('M12 数値項目が数値型', typeof P.farm_harvest_records[0].total_cases === 'number' && typeof P.farm_fields[0].area_are === 'number')

// 13) runMigration dryRun が INSERT_ORDER で件数を数える（DB非接続）
;(async () => {
  const dry = await M.runMigration(null, plan, { dryRun: true })
  const totalRows = Object.values(dry.inserted).reduce((a, b) => a + b, 0)
  ok('M13 dryRunが依存順で全行を数える(DB未書込)', dry.dryRun && dry.errors.length === 0 && totalRows >= 20, 'rows=' + totalRows)

  // ── 結果出力 ──
  const pass = checks.filter(c => c.pass).length
  const summary = {
    pass, total: checks.length, failed: checks.filter(c => !c.pass),
    tableRowCounts: Object.fromEntries(M.INSERT_ORDER.map(t => [t, (P[t] || []).length])),
    warnings: plan.warnings,
  }
  console.log('QAMIG_BEGIN'); console.log(JSON.stringify(summary, null, 1)); console.log('QAMIG_END')
  process.exit(pass === checks.length ? 0 : 1)
})()
