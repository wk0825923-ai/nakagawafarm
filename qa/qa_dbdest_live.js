// qa_dbdest_live.js — フェーズ4後半: 出荷先マスタDB切替の本番実機検証（デモ農場のみ・?dbdest=1）
// 検証: ①フラグでroute ON ②DBから読める ③DBへ書ける(upsert+差分delete) ④タブ間リアルタイム同期
// ⑤後片付け(書いたテスト行を削除して原状復帰)。実データはデモ農場のみ＝実ユーザー影響なし。
// 実行: cd qa && node qa_dbdest_live.js
const puppeteer = require('puppeteer-core')
const URL_BASE = process.env.LIVE_URL || 'https://syatyo-suport.vercel.app'
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const checks = []
const ok = (name, cond, extra) => checks.push({ name, pass: !!cond, extra: extra == null ? '' : String(extra) })

const appReady = (page) => page.evaluate(() => !!document.querySelector('.main') || !!document.querySelector('.staff-view'))
const login = async (page) => {
  await sleep(800)
  const e = await page.$('input[type=email]')
  if (e) {
    await page.type('input[type=email]', 'demo@syatyo-suport.jp')
    await page.type('input[type=password]', 'demo1234')
    await page.evaluate(() => { const x = [...document.querySelectorAll('button[type=submit]')].find(b => /ログイン/.test(b.textContent)); if (x) x.click() })
  }
  for (let i = 0; i < 60; i++) { if (await appReady(page)) break; await sleep(500) }
}

;(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  let A = null, key = null
  try {
    // ── タブA: フラグONで開いてログイン ──
    A = await b.newPage()
    await A.goto(URL_BASE + '/?dbdest=1', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await login(A)
    ok('A0: アプリ起動・ログイン', await appReady(A))

    // ① route ON 確認
    const routeKind = await A.evaluate(() => { const r = farmRepo.routes && farmRepo.routes['farm_shipment_destinations']; return r ? r.kind : 'none' })
    ok('A1: フラグでSupabase経路にroute', routeKind === 'supabase', 'kind=' + routeKind)

    // ② DBから読める
    key = await A.evaluate(() => 'farm_shipment_destinations_' + CONFIG.CURRENT_FARM_ID)
    const before = await A.evaluate(k => farmRepo.readAsync(k), key)
    ok('A2: DBから出荷先を読める', before && before.ok && before.found && Array.isArray(before.value) && before.value.length >= 1,
      'count=' + (before && before.value ? before.value.length : 'x') + ' keys=' + JSON.stringify((before.value || []).map(d => d.key)))
    const original = before.value

    // ── タブB: 同条件で開いて購読を仕込む（端末またぎ同期の受信側） ──
    const B = await b.newPage()
    await B.goto(URL_BASE + '/?dbdest=1', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await login(B)
    await B.evaluate(k => { window.__rt = []; window.__unsub = farmRepo.subscribe(k, v => window.__rt.push(v)) }, key)
    await sleep(3000) // realtimeチャンネルの接続待ち

    // ③ タブAからDBへ書き込み（テスト行を1件追加）
    const w = await A.evaluate((k, orig) => farmRepo.write(k, orig.concat([{ key: 'qa_live_test', label: 'QA検証先(自動削除)', frequent: false, sort_order: 999 }])), key, original)
    ok('A3: DBへ書ける(upsert)', w && w.ok, JSON.stringify(w))

    // ④ タブBにリアルタイムで届く
    let got = null
    for (let i = 0; i < 20; i++) { got = await B.evaluate(() => (window.__rt || []).find(v => (v || []).some(d => d.key === 'qa_live_test'))); if (got) break; await sleep(500) }
    ok('B1: 別タブへリアルタイム同期が届く', !!got, got ? 'count=' + got.length : '10秒待っても未着')

    // ⑤ 後片付け: 最新のDB値からテスト行「だけ」を除いて書き戻す
    //（全体をoriginalで上書きすると、QA中に他端末が足した正規データまで消すため。Codexレビュー Med対応）
    const w2 = await A.evaluate(async (k) => {
      const cur = await farmRepo.readAsync(k)
      if (!cur || !cur.ok) return { ok: false, error: 'reread failed' }
      return farmRepo.write(k, cur.value.filter(d => d.key !== 'qa_live_test'))
    }, key)
    await sleep(1500)
    const after = await A.evaluate(k => farmRepo.readAsync(k), key)
    const cleaned = after && after.ok && !after.value.some(d => d.key === 'qa_live_test')
    const originalsKept = after && after.ok && original.every(o => after.value.some(d => d.key === o.key))
    ok('A4: 後片付け(差分deleteでテスト行だけ消え、元の行は残る)', w2 && w2.ok && cleaned && originalsKept,
      'count=' + (after && after.value ? after.value.length : 'x') + ' keys=' + JSON.stringify((after.value || []).map(d => d.key)))

    // ── 横展開テーブル: gap_documents / monthly_temps の本番往復（テストデータは自分で消す） ──
    const routesAll = await A.evaluate(() => ['farm_shipment_destinations', 'farm_gap_documents', 'farm_monthly_temps', 'farm_maintenance_records', 'farm_shipment_records', 'farm_pesticides', 'farm_fertilizers', 'farm_fields_v2']
      .map(c => (farmRepo.routes[c] || {}).kind || 'none'))
    ok('C1: 8コレクションともDB経路にroute', routesAll.every(k => k === 'supabase'), routesAll.join(','))

    const gRes = await A.evaluate(async () => {
      const k = 'farm_gap_documents_' + CONFIG.CURRENT_FARM_ID
      const before = await farmRepo.readAsync(k)
      const merged = Object.assign({}, before.value, { qa_live_doc: { ready: true, updated: '2026-07-12', note: 'live検証(自動削除)' } })
      const w = await farmRepo.write(k, merged)
      const mid = await farmRepo.readAsync(k)
      const rest = Object.assign({}, mid.value); delete rest.qa_live_doc
      const w2 = await farmRepo.write(k, rest)
      const fin = await farmRepo.readAsync(k)
      return { w: w.ok, got: !!(mid.value.qa_live_doc && mid.value.qa_live_doc.ready), w2: w2.ok, gone: !fin.value.qa_live_doc }
    })
    ok('C2: gap_documentsの本番往復(write→read→削除)', gRes.w && gRes.got && gRes.w2 && gRes.gone, JSON.stringify(gRes))

    const tRes = await A.evaluate(async () => {
      const k = 'farm_monthly_temps_' + CONFIG.CURRENT_FARM_ID
      const before = await farmRepo.readAsync(k) // 現状退避
      const w = await farmRepo.write(k, [1, 2, 6, 12, 17, 21, 25, 26, 21, 15, 9, 3])
      const mid = await farmRepo.readAsync(k)
      const w2 = await farmRepo.write(k, before.found && before.value.length ? before.value : []) // 原状復帰(元が空なら行削除)
      const fin = await farmRepo.readAsync(k)
      return { w: w.ok, got: mid.value.length === 12 && mid.value[3] === 12, w2: w2.ok, restored: fin.value.join(',') === (before.value || []).join(',') }
    })
    ok('C3: monthly_temps(singleton)の本番往復＋原状復帰', tRes.w && tRes.got && tRes.w2 && tRes.restored, JSON.stringify(tRes))

    // ── 記録系CRUDパイロット: 整備記録の1行create→read→version更新→remove（本番・自動削除） ──
    const mRes = await A.evaluate(async () => {
      const col = 'farm_maintenance_records', fid = CONFIG.CURRENT_FARM_ID, k = col + '_' + fid
      const id = (crypto.randomUUID ? crypto.randomUUID() : 'qa-' + Date.now())
      const c = await farmRepo.create(col, fid, { id, date: '2026-07-12', machine_name: 'QA検証機(自動削除)', machine_no: 'QA-1', mtype: '点検', result: '異常なし', worker: '', note: '' })
      const r1 = await farmRepo.readAsync(k)
      const found = r1.ok && r1.value.some(x => String(x.id) === id)
      const u = await farmRepo.update(col, fid, id, { note: 'live更新' }, 1)
      const uConflict = await farmRepo.update(col, fid, id, { note: '古い版' }, 1) // 版ズレ→conflictのはず
      const d = await farmRepo.remove(col, fid, id, 2)
      const r2 = await farmRepo.readAsync(k)
      const gone = r2.ok && !r2.value.some(x => String(x.id) === id)
      return { c: c.ok, found, u: u.ok, conflict: !uConflict.ok && uConflict.conflict === true, d: d.ok, gone }
    })
    ok('C4: 整備記録CRUDの本番往復(create→update→版ズレconflict→remove)',
      mRes.c && mRes.found && mRes.u && mRes.conflict && mRes.d && mRes.gone, JSON.stringify(mRes))

    const sRes = await A.evaluate(async () => {
      const col = 'farm_shipment_records', fid = CONFIG.CURRENT_FARM_ID, k = col + '_' + fid
      const id = (crypto.randomUUID ? crypto.randomUUID() : 'qa-' + Date.now())
      const c = await farmRepo.create(col, fid, { id, date: '2026-07-12', variety: 'QA検証品目(自動削除)', harvest_date: '2026-07-10', lot_code: 'QA-LOT', dest: 'QA', cases: 1, note: '' })
      const r1 = await farmRepo.readAsync(k)
      const rec = r1.ok ? r1.value.find(x => String(x.id) === id) : null
      const d = await farmRepo.remove(col, fid, id, 1)
      const r2 = await farmRepo.readAsync(k)
      const gone = r2.ok && !r2.value.some(x => String(x.id) === id)
      return { c: c.ok, found: !!rec, types: rec ? (rec.cases === 1 && rec.harvest_date === '2026-07-10') : false, d: d.ok, gone }
    })
    ok('C5: 出荷記録CRUDの本番往復(型保持含む)', sRes.c && sRes.found && sRes.types && sRes.d && sRes.gone, JSON.stringify(sRes))

    // ── 農薬マスタ(マスタUUID化第1弾): 差分同期の本番往復＋legacy_id保持（自動削除） ──
    const pRes = await A.evaluate(async () => {
      const k = 'farm_pesticides_' + CONFIG.CURRENT_FARM_ID
      const before = await farmRepo.readAsync(k)
      const id = (crypto.randomUUID ? crypto.randomUUID() : 'qa-' + Date.now())
      const test = { id, name: 'QA検証農薬(自動削除)', reg_no: 'QA-0001', dilution: 1000, max_times: 3, preharvest_days: 7, target_crop: 'レタス', legacy_id: 990001 }
      const w = await farmRepo.write(k, (before.value || []).concat([test]))
      const mid = await farmRepo.readAsync(k)
      const rec = mid.ok ? mid.value.find(x => String(x.id) === id) : null
      const w2 = await farmRepo.write(k, mid.value.filter(x => String(x.id) !== id))
      const fin = await farmRepo.readAsync(k)
      return { w: w.ok, found: !!rec, legacy: rec ? rec.legacy_id === 990001 : false, w2: w2.ok, gone: fin.ok && !fin.value.some(x => String(x.id) === id) }
    })
    ok('C6: 農薬マスタの本番往復(uuid+legacy_id保持・差分delete)', pRes.w && pRes.found && pRes.legacy && pRes.w2 && pRes.gone, JSON.stringify(pRes))

    // ── 肥料マスタ(マスタUUID化第2弾): 配合肥料jsonb含む本番往復（自動削除） ──
    const fRes = await A.evaluate(async () => {
      const k = 'farm_fertilizers_' + CONFIG.CURRENT_FARM_ID
      const before = await farmRepo.readAsync(k)
      const id = (crypto.randomUUID ? crypto.randomUUID() : 'qa-' + Date.now())
      const test = { id, name: 'QA検証肥料(自動削除)', maker: 'QA', weight_per_bag_kg: 20, price_per_bag_yen: 3000,
        unit_price_yen_per_kg: 150, blend_components: [{ fertilizer_id: 'x', bags: 6 }], weight_unconfirmed: false, legacy_id: 990002 }
      const w = await farmRepo.write(k, (before.value || []).concat([test]))
      const mid = await farmRepo.readAsync(k)
      const rec = mid.ok ? mid.value.find(x => String(x.id) === id) : null
      const w2 = await farmRepo.write(k, mid.value.filter(x => String(x.id) !== id))
      const fin = await farmRepo.readAsync(k)
      return { w: w.ok, found: !!rec, legacy: rec ? rec.legacy_id === 990002 : false,
        blend: rec ? (Array.isArray(rec.blend_components) && rec.blend_components[0].bags === 6) : false,
        w2: w2.ok, gone: fin.ok && !fin.value.some(x => String(x.id) === id) }
    })
    ok('C7: 肥料マスタの本番往復(uuid+legacy_id+配合jsonb保持)', fRes.w && fRes.found && fRes.legacy && fRes.blend && fRes.w2 && fRes.gone, JSON.stringify(fRes))

    // ── 圃場マスタ(マスタUUID化第3弾): boundary/legacy_id/crop_categoryキー名変換の本番往復（自動削除） ──
    const flRes = await A.evaluate(async () => {
      const k = 'farm_fields_v2_' + CONFIG.CURRENT_FARM_ID
      const before = await farmRepo.readAsync(k)
      const id = (crypto.randomUUID ? crypto.randomUUID() : 'qa-' + Date.now())
      const test = { id, name: 'QA検証圃場(自動削除)', field_no: 'QA-1', crop: 'レタス', crop_category: 'leaf_veg',
        area_are: 10, status: '栽培中', color: '#0D9972', row_count: 6, gap_target: true,
        boundary: [[35.4, 139.9], [35.41, 139.91]], legacy_id: 990003 }
      const w = await farmRepo.write(k, (before.value || []).concat([test]))
      const mid = await farmRepo.readAsync(k)
      const rec = mid.ok ? mid.value.find(x => String(x.id) === id) : null
      const w2 = await farmRepo.write(k, mid.value.filter(x => String(x.id) !== id))
      const fin = await farmRepo.readAsync(k)
      return { w: w.ok, err: w.error ? String(w.error.message || w.error) : null, found: !!rec,
        cat: rec ? rec.crop_category === 'leaf_veg' : false, legacy: rec ? rec.legacy_id === 990003 : false,
        boundary: rec ? (Array.isArray(rec.boundary) && rec.boundary.length === 2) : false,
        w2: w2.ok, gone: fin.ok && !fin.value.some(x => String(x.id) === id) }
    })
    ok('C8: 圃場マスタの本番往復(crop_category変換+boundary+legacy_id保持)',
      flRes.w && flRes.found && flRes.cat && flRes.legacy && flRes.boundary && flRes.w2 && flRes.gone, JSON.stringify(flRes))

    // ── 畝ロット(マスタUUID化第4弾): 圃場を作り→ロット追加→group復元→両方削除（自動削除） ──
    const ltRes = await A.evaluate(async () => {
      const fk = 'farm_fields_v2_' + CONFIG.CURRENT_FARM_ID
      const lk = 'farm_lots_' + CONFIG.CURRENT_FARM_ID
      const fid2 = crypto.randomUUID(), lid = crypto.randomUUID()
      const bf = await farmRepo.readAsync(fk)
      const wf = await farmRepo.write(fk, (bf.value || []).concat([{ id: fid2, name: 'QA検証圃場L(自動削除)', crop: 'レタス', crop_category: 'leaf_veg', area_are: 5, status: '栽培中', color: '#0D9972', row_count: 6, gap_target: true }]))
      const bl = await farmRepo.readAsync(lk)
      const lots = Object.assign({}, bl.value)
      lots[fid2] = [{ id: lid, field_id: fid2, row_range: '1-3', variety: 'QA品種', status: 'growing', seed_date: '2026-05-01', legacy_id: 990004 }]
      const wl = await farmRepo.write(lk, lots)
      const mid = await farmRepo.readAsync(lk)
      const got = mid.ok && (mid.value[fid2] || []).find(x => String(x.id) === lid)
      // 後片付け: ロット→圃場の順に削除
      const rest = Object.assign({}, mid.value); delete rest[fid2]
      const wl2 = await farmRepo.write(lk, rest)
      const ff = await farmRepo.readAsync(fk)
      const wf2 = await farmRepo.write(fk, ff.value.filter(x => String(x.id) !== fid2))
      const fin = await farmRepo.readAsync(lk)
      return { wf: wf.ok, wl: wl.ok, err: wl.error ? String(wl.error.message || wl.error) : null,
        got: !!got, legacy: got ? got.legacy_id === 990004 : false,
        wl2: wl2.ok, wf2: wf2.ok, gone: fin.ok && !(fin.value[fid2] || []).length }
    })
    ok('C9: 畝ロットの本番往復(圃場参照つきflatten⇔group+legacy_id保持)',
      ltRes.wf && ltRes.wl && ltRes.got && ltRes.legacy && ltRes.wl2 && ltRes.wf2 && ltRes.gone, JSON.stringify(ltRes))

    // ── 畝ロット散布=在庫RPC切替(アプリ契約): createWithStock→記録往復+マスタ残高減算(fromRows復元)→removeWithStockで完全復帰 ──
    const spRes = await A.evaluate(async () => {
      const col = 'farm_lot_spray_records', fid = CONFIG.CURRENT_FARM_ID
      const pk = 'farm_pesticides_' + fid, sk = col + '_' + fid
      // QA農薬(在庫18L)をDBに直接作成
      const farmRow = await sb.from('farm_farms').select('org_id').eq('id', fid).limit(1)
      const orgId = farmRow.data[0].org_id
      const pid = crypto.randomUUID()
      await sb.from('farm_pesticides').insert([{ id: pid, org_id: orgId, farm_id: fid, name: 'QA-APP農薬(自動削除)', reg_no: 'QA', dilution: 1000, max_times: 3, preharvest_days: 7, stock_l: 18 }])
      const rec = { id: crypto.randomUUID(), field_id: null, date: '2026-07-13', row_range: '1-3',
        pesticides: [{ pesticide_id: pid, dilution: 1000, disposal_amount: 0 }], spray_volume_L: 500,
        weather: '晴', note: 'QA-APP(自動削除)', staff_ids: [], checks: { kanri: true } }
      const mov = [{ item_type: 'pesticide', item_id: pid, delta_amount: -0.5, unit: 'L', reason: '農薬散布' }]
      const c = await farmRepo.createWithStock(col, fid, rec, mov)
      const r1 = await farmRepo.readAsync(sk)
      const got = r1.ok ? r1.value.find(x => String(x.id) === rec.id) : null
      const m1 = await farmRepo.readAsync(pk)
      const p1 = m1.ok ? m1.value.find(x => String(x.id) === pid) : null
      const d = await farmRepo.removeWithStock(col, fid, rec.id, 1)
      const m2 = await farmRepo.readAsync(pk)
      const p2 = m2.ok ? m2.value.find(x => String(x.id) === pid) : null
      // 片付け
      await sb.from('farm_stock_movements').delete().eq('item_id', pid)
      await sb.from('farm_pesticides').delete().eq('id', pid)
      return { c: !!(c && c.ok), found: !!got, vol: got && got.spray_volume_L, checks: got && got.checks && got.checks.kanri === true,
        stockAfterSave: p1 && p1.stock_l, d: !!(d && d.ok), stockAfterDelete: p2 && p2.stock_l }
    })
    ok('C10: 在庫RPC切替の本番往復(createWithStock=記録+残高18→17.5L・converter往復(液量/checks)・removeWithStockで18L復帰)',
      spRes.c && spRes.found && spRes.vol === 500 && spRes.checks && spRes.stockAfterSave === 17.5 && spRes.d && spRes.stockAfterDelete === 18,
      JSON.stringify(spRes))

    // ── 在庫調整RPC(仕入れ/棚卸し): delta加算・冪等再送・set絶対値（自動削除） ──
    const adRes = await A.evaluate(async () => {
      const fid = CONFIG.CURRENT_FARM_ID
      const farmRow = await sb.from('farm_farms').select('org_id').eq('id', fid).limit(1)
      const orgId = farmRow.data[0].org_id
      const pid = crypto.randomUUID()
      await sb.from('farm_pesticides').insert([{ id: pid, org_id: orgId, farm_id: fid, name: 'QA-ADJ農薬(自動削除)', reg_no: 'QA', dilution: 1000, max_times: 3, preharvest_days: 7, stock_l: 18 }])
      const stockOf = async () => { const r = await sb.from('farm_pesticides').select('stock_l').eq('id', pid); return Number(r.data[0].stock_l) }
      const ref = crypto.randomUUID()
      const a1 = await farmRepo.adjustStockDb('pesticide', fid, pid, 'delta', 5, '仕入れ', ref)      // 18→23
      const s1 = await stockOf()
      const a2 = await farmRepo.adjustStockDb('pesticide', fid, pid, 'delta', 5, '仕入れ', ref)      // 再送=冪等
      const s2 = await stockOf()
      const a3 = await farmRepo.adjustStockDb('pesticide', fid, pid, 'set', 20, '棚卸し調整', crypto.randomUUID()) // 23→20
      const s3 = await stockOf()
      const mv = await sb.from('farm_stock_movements').select('delta_amount,reason').eq('item_id', pid)
      await sb.from('farm_stock_movements').delete().eq('item_id', pid)
      await sb.from('farm_pesticides').delete().eq('id', pid)
      return { a1: a1 && a1.ok, s1, dup: a2 && a2.duplicate === true, s2, a3: a3 && a3.ok, s3,
        rows: mv.data ? mv.data.length : -1, deltas: (mv.data || []).map(x => Number(x.delta_amount)) }
    })
    ok('C11: 在庫調整RPC(仕入れ+5L→23L・再送は冪等・棚卸しset20L=差分-3記帳)',
      adRes.a1 && adRes.s1 === 23 && adRes.dup && adRes.s2 === 23 && adRes.a3 && adRes.s3 === 20 &&
      adRes.rows === 2 && adRes.deltas.includes(5) && adRes.deltas.includes(-3),
      JSON.stringify(adRes))
  } finally {
    // 途中で例外終了してもテスト行を残さない（成功時は各検査内で消えているので実質no-op）
    try {
      if (A && key) {
        await A.evaluate(async (k) => {
          const cur = await farmRepo.readAsync(k)
          if (cur && cur.ok && cur.found && cur.value.some(d => d.key === 'qa_live_test')) {
            await farmRepo.write(k, cur.value.filter(d => d.key !== 'qa_live_test'))
          }
          // 横展開テーブルのテストデータ掃除
          const gk = 'farm_gap_documents_' + CONFIG.CURRENT_FARM_ID
          const g = await farmRepo.readAsync(gk)
          if (g && g.ok && g.value && g.value.qa_live_doc) {
            const rest = Object.assign({}, g.value); delete rest.qa_live_doc
            await farmRepo.write(gk, rest)
          }
          const tk = 'farm_monthly_temps_' + CONFIG.CURRENT_FARM_ID
          const t = await farmRepo.readAsync(tk)
          if (t && t.ok && Array.isArray(t.value) && t.value.join(',') === '1,2,6,12,17,21,25,26,21,15,9,3') {
            await farmRepo.write(tk, []) // テストで書いた気温だけ削除(実データはこの並びで書かない前提)
          }
          const mk = 'farm_maintenance_records_' + CONFIG.CURRENT_FARM_ID
          const m = await farmRepo.readAsync(mk)
          if (m && m.ok && Array.isArray(m.value)) {
            for (const rec of m.value.filter(x => x.machine_name === 'QA検証機(自動削除)')) {
              await farmRepo.remove('farm_maintenance_records', CONFIG.CURRENT_FARM_ID, rec.id) // 版指定なし=無条件削除
            }
          }
          const sk = 'farm_shipment_records_' + CONFIG.CURRENT_FARM_ID
          const s = await farmRepo.readAsync(sk)
          if (s && s.ok && Array.isArray(s.value)) {
            for (const rec of s.value.filter(x => x.variety === 'QA検証品目(自動削除)')) {
              await farmRepo.remove('farm_shipment_records', CONFIG.CURRENT_FARM_ID, rec.id)
            }
          }
        }, key)
      }
    } catch (_) { /* 後片付け失敗は本体の失敗を隠さない */ }
    await b.close()
  }
  const pass = checks.filter(c => c.pass).length
  console.log('QADBDESTLIVE_START')
  checks.forEach(c => console.log((c.pass ? 'PASS' : 'FAIL') + ' ' + c.name + (c.extra ? ' [' + c.extra + ']' : '')))
  console.log(pass + '/' + checks.length)
  console.log('QADBDESTLIVE_END')
  process.exit(pass === checks.length ? 0 : 1)
})().catch(e => { console.error('RUNERR', e); process.exit(1) })
