// =====================================================
// migration.js — localStorage → Supabase 移行の「引っ越し業者」（フルスタック移行フェーズ3）
//
// 役割: いま端末の中(localStorage)にある26種類のデータを、フェーズ1で用意したSupabaseの棚へ
//   運べる形に「検品(正規化)」して詰め替える。安全のため2段構え:
//     ① buildMigrationPlan() … DBに触らず、入れる行を全部組み立てる純粋関数（テスト可能）
//     ② runMigration(sb, plan) … 組み立てた行を依存順にinsert（dryRunで空実行も可）
//
// 肝: アプリの旧ID(数値)を新ID(UUID)へ張り替え、参照(field_id等)も追随させる。
//   日付はYYYY-MM-DD・数値は数値型に検品してから運ぶ（Codex型混在対策をここでも徹底）。
// =====================================================
(function (global) {
  'use strict'

  // ── ID採番 ──
  const uuid = () => (global.crypto && global.crypto.randomUUID)
    ? global.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
      })

  // ── 検品(正規化)ヘルパー ──
  const S = v => (v == null ? '' : String(v))
  const N = v => { const n = Number(v); return Number.isFinite(n) ? n : null }        // 数値 or null
  const Iv = v => { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : null } // 整数 or null
  const arrOf = v => (Array.isArray(v) ? v : [])
  const objOf = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
  function D(v) { // 日付 → 'YYYY-MM-DD' or null
    if (v == null || v === '') return null
    if (typeof v === 'number' && v > 20000 && v < 60000) { // Excel/1900日付シリアル
      const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000); return d.toISOString().slice(0, 10)
    }
    const s = String(v)
    const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
    if (m) return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0')
    return null
  }

  // ── 移行本体（純粋関数） ──
  // local: { コレクション名(farm_xxx): 値 } の連想配列（呼び出し側でfarmId込みキーを解決して渡す）
  // ctx:   { orgId, farmId }
  // 返り値: { plans:{table:[rows]}, idMaps, counts:{source→n}, warnings:[] }
  function buildMigrationPlan(local, ctx) {
    const orgId = ctx.orgId, farmId = ctx.farmId
    const base = () => ({ org_id: orgId, farm_id: farmId })
    const plans = {}; const warnings = []; const counts = {}
    const put = (table, rows) => { plans[table] = (plans[table] || []).concat(rows) }
    const get = (k) => local[k]
    const idMaps = { fields: {}, pesticides: {}, fertilizers: {}, staff: {}, lots: {} }
    // 旧ID→新UUID（未知IDは新規採番して覚える）
    const mapId = (map, oldId) => {
      if (oldId == null || oldId === '') return null
      const key = String(oldId)
      if (!map[key]) map[key] = uuid()
      return map[key]
    }
    const refId = (map, oldId) => { // 既知参照のみ解決（未知はnull＝孤児警告）
      if (oldId == null || oldId === '') return null
      const v = map[String(oldId)]
      return v || null
    }

    // ===== 1) マスタ（先にID表を作る） =====
    // 圃場
    arrOf(get('farm_fields_v2')).forEach(f => {
      const id = mapId(idMaps.fields, f.id)
      put('farm_fields', [Object.assign(base(), {
        id, name: S(f.name), field_no: f.field_no != null ? S(f.field_no) : null,
        area_are: N(f.area_are), crop: f.crop != null ? S(f.crop) : null,
        crop_category_key: S(f.crop_category || 'leaf_veg'),
        lat: N(f.lat), lng: N(f.lng), status: S(f.status || '栽培中'), color: S(f.color || '#0D9972'),
        row_count: Iv(f.row_count), crop_specific_details: objOf(f.crop_specific_details),
        rice_stage_dates: objOf(f.rice_stage_dates),
        area_name: f.area_name != null ? S(f.area_name) : null,
        address: f.address != null ? S(f.address) : null,
        emaff_no: f.emaff_no != null ? S(f.emaff_no) : null,
        gap_target: f.gap_target !== false,
      })])
    })
    counts['farm_fields_v2'] = arrOf(get('farm_fields_v2')).length

    // スタッフ
    arrOf(get('farm_staff')).forEach(s => {
      const id = mapId(idMaps.staff, s.id)
      put('farm_staff', [Object.assign(base(), {
        id, name: S(s.name), name_kana: S(s.name_kana), nationality: S(s.nationality || 'JP'),
        role: S(s.role || 'worker'), skills: arrOf(s.skills), visa_expiry: D(s.visa_expiry),
        residence_card_no: S(s.residence_card_no),
      })])
    })
    counts['farm_staff'] = arrOf(get('farm_staff')).length

    // 農薬マスタ（在庫はここへマージ）
    const pestStock = {}; arrOf(get('farm_pesticide_stock')).forEach(x => { pestStock[String(x.pesticide_id)] = x })
    arrOf(get('farm_pesticides')).forEach(p => {
      const id = mapId(idMaps.pesticides, p.id)
      const st = pestStock[String(p.id)] || {}
      put('farm_pesticides', [Object.assign(base(), {
        id, name: S(p.name), reg_no: S(p.reg_no), dilution: N(p.dilution),
        max_times: Iv(p.max_times), preharvest_days: Iv(p.preharvest_days), target_crop: S(p.target_crop),
        stock_l: N(st.stock_l != null ? st.stock_l : (st.stock_kg != null ? st.stock_kg : p.stock_l)) || 0,
        alert_threshold_l: N(st.alert_threshold_l != null ? st.alert_threshold_l : st.alert_threshold_kg) || 0,
      })])
    })
    counts['farm_pesticides'] = arrOf(get('farm_pesticides')).length

    // 肥料マスタ（在庫マージ）
    const fertStock = {}; arrOf(get('farm_fertilizer_stock')).forEach(x => { fertStock[String(x.fertilizer_id)] = x })
    arrOf(get('farm_fertilizers')).forEach(f => {
      const id = mapId(idMaps.fertilizers, f.id)
      const st = fertStock[String(f.id)] || {}
      put('farm_fertilizers', [Object.assign(base(), {
        id, name: S(f.name), maker: S(f.maker), weight_per_bag_kg: N(f.weight_per_bag_kg),
        price_per_bag_yen: Iv(f.price_per_bag_yen), unit_price_yen_per_kg: N(f.unit_price_yen_per_kg),
        stock_kg: N(st.stock_kg != null ? st.stock_kg : f.stock_kg) || 0,
        alert_threshold_kg: N(st.alert_threshold_kg != null ? st.alert_threshold_kg : f.alert_threshold_kg) || 0,
        default_dilution: N(f.default_dilution), crop_dilutions: objOf(f.crop_dilutions),
        blend_components: f.blend_components != null ? f.blend_components : null,
        weight_unconfirmed: !!f.weight_unconfirmed,
      })])
    })
    counts['farm_fertilizers'] = arrOf(get('farm_fertilizers')).length

    // 作物カテゴリ（DBに既定4件あり→keyでupsert推奨。ここでは行を作り警告）
    const cats = arrOf(get('farm_crop_categories'))
    if (cats.length) {
      put('farm_crop_categories', cats.map(c => Object.assign({ org_id: orgId }, {
        name: S(c.name), key: S(c.key), ui_mode: S(c.ui_mode || 'row_map'),
        specific_field_defs: arrOf(c.specific_field_defs), harvest_grades: arrOf(c.harvest_grades),
        color: S(c.color || '#0D9972'), sort_order: Iv(c.sort_order) || 0,
      })))
      warnings.push('farm_crop_categories は key で upsert すること（DBに既定4件あり・重複回避）')
    }
    counts['farm_crop_categories'] = cats.length

    // 出荷先マスタ（同上）
    const dests = arrOf(get('farm_shipment_destinations'))
    if (dests.length) {
      put('farm_shipment_destinations', dests.map(d => Object.assign(base(), {
        key: S(d.key), label: S(d.label), frequent: !!d.frequent, sort_order: Iv(d.sort_order) || 0,
      })))
      warnings.push('farm_shipment_destinations は key で upsert すること（DBに既定4件あり）')
    }
    counts['farm_shipment_destinations'] = dests.length

    // ===== 2) 畝ロット（field参照・{fieldId:[...]}オブジェクト） =====
    const lotsObj = objOf(get('farm_lots')); let lotN = 0
    Object.keys(lotsObj).forEach(fid => {
      arrOf(lotsObj[fid]).forEach(l => {
        lotN++
        const id = mapId(idMaps.lots, l.id)
        put('farm_lots', [Object.assign(base(), {
          id, field_id: refId(idMaps.fields, l.field_id != null ? l.field_id : fid),
          row_range: S(l.row_range), row_count: N(l.row_count), variety: S(l.variety),
          crop_type: S(l.crop_type), season: S(l.season),
          seed_date: D(l.seed_date), seed_lot_no: S(l.seed_lot_no || l.seedling_lot),
          seedling_type: S(l.seedling_type), seedling_period_days: Iv(l.seedling_period_days),
          transplant_date: D(l.transplant_date), transplant_method: S(l.transplant_method),
          transplant_count: N(l.transplant_count),
          harvest_start: D(l.harvest_start), harvest_end: D(l.harvest_end),
          status: S(l.status || 'growing'),
          pretransplant_pesticides: arrOf(l.pretransplant_pesticides),
          fertilizer_refs: arrOf(l.fertilizer_refs), pesticide_refs: arrOf(l.pesticide_refs),
          seed_supplier: S(l.seed_supplier), seed_origin: S(l.seed_origin),
          seed_purchase_date: D(l.seed_purchase_date), seed_purchase_qty: N(l.seed_purchase_qty),
          seed_disinfection: S(l.seed_disinfection), seed_gmo: S(l.seed_gmo),
          data_note: S(l.data_note),
        })])
      })
    })
    counts['farm_lots'] = lotN

    // ===== 3) 記録系（field/pesticide/staff参照） =====
    // 基本日報
    arrOf(get('farm_records')).forEach(r => {
      put('farm_work_records', [Object.assign(base(), {
        id: uuid(), field_id: refId(idMaps.fields, r.field_id), date: D(r.date),
        work_type: S(r.work_type), pesticide_id: refId(idMaps.pesticides, r.pesticide_id),
        dilution: N(r.dilution), amount: N(r.amount), weather: S(r.weather), worker: S(r.worker),
        note: S(r.note), fertilizer_name: S(r.fertilizer_name),
        field_ids: arrOf(r.field_ids).map(x => refId(idMaps.fields, x)).filter(Boolean),
        start_time: r.start_time || null, end_time: r.end_time || null, break_minutes: Iv(r.break_minutes),
        machine_no: S(r.machine_no), row_range: S(r.row_range), spray_method: S(r.spray_method),
        spray_made_l: N(r.spray_made_L != null ? r.spray_made_L : r.spray_made_l),
        spray_discarded_l: N(r.spray_discarded_L != null ? r.spray_discarded_L : r.spray_discarded_l),
        waste: S(r.waste), photos: arrOf(r.photos), checks: objOf(r.checks),
      })])
    })
    counts['farm_records'] = arrOf(get('farm_records')).length

    // 畝別農薬散布
    arrOf(get('farm_lot_spray_records')).forEach(r => {
      put('farm_lot_spray_records', [Object.assign(base(), {
        id: uuid(), field_id: refId(idMaps.fields, r.field_id), date: D(r.date),
        row_range: S(r.row_range), pesticides: arrOf(r.pesticides),
        spray_volume_l: N(r.spray_volume_L != null ? r.spray_volume_L : r.spray_volume_l),
        weather: S(r.weather), worker: S(r.worker), note: S(r.note),
        staff_ids: arrOf(r.staff_ids),
      })])
    })
    counts['farm_lot_spray_records'] = arrOf(get('farm_lot_spray_records')).length

    // 施肥
    arrOf(get('farm_top_dressing_records')).forEach(r => {
      put('farm_top_dressing_records', [Object.assign(base(), {
        id: uuid(), field_id: refId(idMaps.fields, r.field_id), date: D(r.date),
        fertilizing_type: S(r.fertilizing_type), item: S(r.item), row_range: S(r.row_range),
        row_count: N(r.row_count), fertilizers: arrOf(r.fertilizers),
        spray_volume_l: N(r.spray_volume_L != null ? r.spray_volume_L : r.spray_volume_l), note: S(r.note),
      })])
    })
    counts['farm_top_dressing_records'] = arrOf(get('farm_top_dressing_records')).length

    // 収穫
    arrOf(get('farm_harvest_records')).forEach(r => {
      put('farm_harvest_records', [Object.assign(base(), {
        id: uuid(), field_id: refId(idMaps.fields, r.field_id), date: D(r.date),
        variety: S(r.variety), row_range: S(r.row_range), lot_code: S(r.lot_code),
        shipments: arrOf(r.shipments), total_cases: Iv(r.total_cases) || 0,
        worker: S(r.worker), note: S(r.note),
      })])
    })
    counts['farm_harvest_records'] = arrOf(get('farm_harvest_records')).length

    // 出荷
    arrOf(get('farm_shipment_records')).forEach(r => {
      put('farm_shipment_records', [Object.assign(base(), {
        id: uuid(), date: D(r.date), variety: S(r.variety), harvest_date: D(r.harvest_date),
        lot_code: S(r.lot_code), dest: S(r.dest), cases: N(r.cases), note: S(r.note),
      })])
    })
    counts['farm_shipment_records'] = arrOf(get('farm_shipment_records')).length

    // 機械整備
    arrOf(get('farm_maintenance_records')).forEach(r => {
      put('farm_maintenance_records', [Object.assign(base(), {
        id: uuid(), date: D(r.date), machine_name: S(r.machine_name || r.machine),
        machine_no: S(r.machine_no), mtype: S(r.mtype || r.kind), result: S(r.result),
        worker: S(r.worker), note: S(r.note),
      })])
    })
    counts['farm_maintenance_records'] = arrOf(get('farm_maintenance_records')).length

    // 実習生日誌（staff/field参照）
    arrOf(get('farm_trainee_diaries')).forEach(r => {
      put('farm_trainee_diaries', [Object.assign(base(), {
        id: uuid(), staff_id: refId(idMaps.staff, r.staff_id), date: D(r.date),
        start_time: r.start_time || null, end_time: r.end_time || null, break_minutes: Iv(r.break_minutes),
        tasks: S(r.tasks), field_ids: arrOf(r.field_ids).map(x => refId(idMaps.fields, x)).filter(Boolean),
        supervisor: S(r.supervisor), notes: S(r.notes),
      })])
    })
    counts['farm_trainee_diaries'] = arrOf(get('farm_trainee_diaries')).length

    // 今日のタスク
    arrOf(get('farm_today_tasks')).forEach(r => {
      put('farm_today_tasks', [Object.assign(base(), {
        id: uuid(), field_id: refId(idMaps.fields, r.field_id), worker: S(r.worker),
        work_type: S(r.work_type || r.label), time: S(r.time), priority: S(r.priority || 'medium'),
        done: !!r.done, date: D(r.date) || null,
      })])
    })
    counts['farm_today_tasks'] = arrOf(get('farm_today_tasks')).length

    // 機器予約
    arrOf(get('farm_rentals')).forEach(r => {
      put('farm_rentals', [Object.assign(base(), {
        id: uuid(), equipment: S(r.equipment), date: D(r.date), type: S(r.type || 'own'), note: S(r.note),
      })])
    })
    counts['farm_rentals'] = arrOf(get('farm_rentals')).length

    // 作付計画＋作付サイクル（統合）
    const plans2 = arrOf(get('farm_crop_plans')).concat(arrOf(get('farm_crop_cycles')))
    plans2.forEach(r => {
      put('farm_crop_plans', [Object.assign(base(), {
        id: uuid(), field_id: refId(idMaps.fields, r.field_id), crop: S(r.crop),
        start_month: Iv(r.start_month), end_month: Iv(r.end_month), color: S(r.color || '#0D9972'),
        note: S(r.note), status: S(r.status || 'active'), year: Iv(r.year),
      })])
    })
    counts['farm_crop_plans+cycles'] = plans2.length

    // ===== 4) 仕入れ（マスタ参照） =====
    arrOf(get('farm_pesticide_purchases')).forEach(r => {
      put('farm_pesticide_purchases', [Object.assign(base(), {
        id: uuid(), pesticide_id: refId(idMaps.pesticides, r.pesticide_id), date: D(r.date),
        amount_l: N(r.amount_L != null ? r.amount_L : r.amount_l), price_yen: N(r.price_yen), supplier: S(r.supplier),
      })])
    })
    counts['farm_pesticide_purchases'] = arrOf(get('farm_pesticide_purchases')).length

    arrOf(get('farm_fertilizer_purchases')).forEach(r => {
      put('farm_fertilizer_purchases', [Object.assign(base(), {
        id: uuid(), fertilizer_id: refId(idMaps.fertilizers, r.fertilizer_id), date: D(r.date),
        amount_kg: N(r.amount_kg), price_yen: N(r.price_yen), supplier: S(r.supplier),
      })])
    })
    counts['farm_fertilizer_purchases'] = arrOf(get('farm_fertilizer_purchases')).length

    // ===== 5) GAP・気温・コメント =====
    // GAPチェック（[{code,category,item,is_cleared}] → farm_gap_checks）
    arrOf(get('farm_gap')).forEach(g => {
      put('farm_gap_checks', [Object.assign(base(), {
        id: uuid(), category: S(g.category), item: S(g.item), is_cleared: !!g.is_cleared,
      })])
    })
    counts['farm_gap'] = arrOf(get('farm_gap')).length

    // GAP文書台帳（{docId:{ready,updated,note}} → 行に展開）
    const docs = objOf(get('farm_gap_documents')); let docN = 0
    Object.keys(docs).forEach(docId => {
      const d = docs[docId] || {}; docN++
      put('farm_gap_documents', [Object.assign(base(), {
        id: uuid(), doc_id: S(docId), ready: !!d.ready, updated: D(d.updated), note: S(d.note),
      })])
    })
    counts['farm_gap_documents'] = docN

    // 月別気温（[12数値] → 1行）
    const temps = get('farm_monthly_temps')
    if (Array.isArray(temps) && temps.length) {
      put('farm_monthly_temps', [Object.assign(base(), { id: uuid(), field_id: null, temps: temps.map(N) })])
      counts['farm_monthly_temps'] = 1
    } else counts['farm_monthly_temps'] = 0

    // 圃場実績コメント
    arrOf(get('farm_field_performance_comments')).forEach(c => {
      put('farm_field_performance_comments', [Object.assign(base(), {
        id: uuid(), field_id: refId(idMaps.fields, c.field_id), comment: S(c.comment || c.text),
      })])
    })
    counts['farm_field_performance_comments'] = arrOf(get('farm_field_performance_comments')).length

    // 作物コメント
    arrOf(get('farm_crop_comments')).forEach(c => {
      put('farm_crop_comments', [Object.assign(base(), {
        id: uuid(), crop: S(c.crop), comment: S(c.comment || c.text),
      })])
    })
    counts['farm_crop_comments'] = arrOf(get('farm_crop_comments')).length

    // 移行対象外（意図的）: farm_field_performance（コード内固定・読み取り専用）
    if (get('farm_field_performance') != null) warnings.push('farm_field_performance は固定データのため移行対象外')

    return { plans, idMaps, counts, warnings }
  }

  // 依存順（マスタ→ロット→記録→仕入れ→その他）。参照先を先にinsertする。
  const INSERT_ORDER = [
    'farm_crop_categories', 'farm_shipment_destinations',
    'farm_fields', 'farm_staff', 'farm_pesticides', 'farm_fertilizers',
    'farm_lots',
    'farm_work_records', 'farm_lot_spray_records', 'farm_top_dressing_records',
    'farm_harvest_records', 'farm_shipment_records', 'farm_maintenance_records',
    'farm_trainee_diaries', 'farm_today_tasks', 'farm_rentals', 'farm_crop_plans',
    'farm_pesticide_purchases', 'farm_fertilizer_purchases',
    'farm_gap_checks', 'farm_gap_documents', 'farm_monthly_temps',
    'farm_field_performance_comments', 'farm_crop_comments',
  ]

  // 実書き込み（フェーズ4/本番移行で使用）。dryRun=trueなら件数だけ数えてinsertしない。
  async function runMigration(sb, plan, opts) {
    opts = opts || {}
    const dryRun = !!opts.dryRun
    const result = { inserted: {}, errors: [], dryRun }
    for (const table of INSERT_ORDER) {
      const rows = plan.plans[table]
      if (!rows || rows.length === 0) { result.inserted[table] = 0; continue }
      if (dryRun) { result.inserted[table] = rows.length; continue }
      // 500件ずつに分割してinsert
      let ok = 0
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500)
        const { error } = await sb.from(table).insert(chunk)
        if (error) { result.errors.push({ table, error: String(error.message || error) }); break }
        ok += chunk.length
      }
      result.inserted[table] = ok
    }
    return result
  }

  global.FarmMigration = { buildMigrationPlan, runMigration, INSERT_ORDER, _uuid: uuid }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this))

if (typeof module !== 'undefined' && module.exports) module.exports = (typeof global !== 'undefined' ? global.FarmMigration : undefined)
