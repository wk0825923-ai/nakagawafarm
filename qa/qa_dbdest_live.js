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

    // ── 在庫調整RPCのrace: 同一ref_idの同時2要求→記帳1行だけ(レビュー14 Medium・自動削除) ──
    const rcRes = await A.evaluate(async () => {
      const fid = CONFIG.CURRENT_FARM_ID
      const farmRow = await sb.from('farm_farms').select('org_id').eq('id', fid).limit(1)
      const orgId = farmRow.data[0].org_id
      const pid = crypto.randomUUID()
      await sb.from('farm_pesticides').insert([{ id: pid, org_id: orgId, farm_id: fid, name: 'QA-RACE農薬(自動削除)', reg_no: 'QA', dilution: 1000, max_times: 3, preharvest_days: 7, stock_l: 18 }])
      const ref = crypto.randomUUID()
      const [r1, r2] = await Promise.all([
        farmRepo.adjustStockDb('pesticide', fid, pid, 'delta', 5, '仕入れ', ref),
        farmRepo.adjustStockDb('pesticide', fid, pid, 'delta', 5, '仕入れ', ref),
      ])
      const st = await sb.from('farm_pesticides').select('stock_l').eq('id', pid)
      const mv = await sb.from('farm_stock_movements').select('id').eq('item_id', pid)
      await sb.from('farm_stock_movements').delete().eq('item_id', pid)
      await sb.from('farm_pesticides').delete().eq('id', pid)
      const dups = [r1, r2].filter(x => x && x.duplicate === true).length
      const oks = [r1, r2].filter(x => x && x.ok).length
      return { oks, dups, stock: Number(st.data[0].stock_l), rows: mv.data ? mv.data.length : -1 }
    })
    ok('C12: 在庫調整RPCのrace(同一ref_id同時2要求→両方ok・片方duplicate・記帳1行・残高23L=1回分のみ)',
      rcRes.oks === 2 && rcRes.dups === 1 && rcRes.stock === 23 && rcRes.rows === 1,
      JSON.stringify(rcRes))

    // ── set no-opの冪等マーカー: 同値棚卸し(応答喪失)→別操作→再送で巻き戻らない(レビュー15 Medium・自動削除) ──
    const noRes = await A.evaluate(async () => {
      const fid = CONFIG.CURRENT_FARM_ID
      const farmRow = await sb.from('farm_farms').select('org_id').eq('id', fid).limit(1)
      const orgId = farmRow.data[0].org_id
      const pid = crypto.randomUUID()
      await sb.from('farm_pesticides').insert([{ id: pid, org_id: orgId, farm_id: fid, name: 'QA-NOOP農薬(自動削除)', reg_no: 'QA', dilution: 1000, max_times: 3, preharvest_days: 7, stock_l: 18 }])
      const ref = crypto.randomUUID()
      const a1 = await farmRepo.adjustStockDb('pesticide', fid, pid, 'set', 18, '棚卸し調整', ref) // 同値=noop(でも記帳される)
      const a2 = await farmRepo.adjustStockDb('pesticide', fid, pid, 'delta', 5, '仕入れ', crypto.randomUUID()) // 18→23
      const a3 = await farmRepo.adjustStockDb('pesticide', fid, pid, 'set', 18, '棚卸し調整', ref) // 応答喪失後の再送→duplicateで巻き戻らない
      const st = await sb.from('farm_pesticides').select('stock_l').eq('id', pid)
      const mv = await sb.from('farm_stock_movements').select('delta_amount').eq('item_id', pid)
      await sb.from('farm_stock_movements').delete().eq('item_id', pid)
      await sb.from('farm_pesticides').delete().eq('id', pid)
      return { noop: a1 && a1.noop === true, a2: a2 && a2.ok, dup: a3 && a3.duplicate === true,
        stock: Number(st.data[0].stock_l), rows: mv.data ? mv.data.length : -1 }
    })
    ok('C13: set同値(no-op)も冪等記録: 応答喪失→仕入れ+5L→同一ref_id再送はduplicate=23Lのまま巻き戻らない(記帳2行=0とその+5)',
      noRes.noop && noRes.a2 && noRes.dup && noRes.stock === 23 && noRes.rows === 2,
      JSON.stringify(noRes))

    // ── 施肥=在庫RPC切替(アプリ契約): createWithStock→記録往復+肥料残高減算(amount_kg優先/希釈両方)→removeWithStockで完全復帰 ──
    const tdRes = await A.evaluate(async () => {
      const col = 'farm_top_dressing_records', fid = CONFIG.CURRENT_FARM_ID
      const fk = 'farm_fertilizers_' + fid, sk = col + '_' + fid
      const farmRow = await sb.from('farm_farms').select('org_id').eq('id', fid).limit(1)
      const orgId = farmRow.data[0].org_id
      // QA肥料2種(在庫40kg)。f1=amount_kg直接3kg / f2=希釈500×散布液量1000L=2kg
      const f1 = crypto.randomUUID(), f2 = crypto.randomUUID()
      await sb.from('farm_fertilizers').insert([
        { id: f1, org_id: orgId, farm_id: fid, name: 'QA-TD肥料A(自動削除)', maker: 'QA', weight_per_bag_kg: 20, price_per_bag_yen: 3000, unit_price_yen_per_kg: 150, stock_kg: 40 },
        { id: f2, org_id: orgId, farm_id: fid, name: 'QA-TD肥料B(自動削除)', maker: 'QA', weight_per_bag_kg: 20, price_per_bag_yen: 3000, unit_price_yen_per_kg: 150, stock_kg: 40 },
      ])
      const rec = { id: crypto.randomUUID(), field_id: null, date: '2026-07-14',
        fertilizing_type: '追肥', item: 'レタス', row_range: '1-3', row_count: 3,
        fertilizers: [
          { fertilizer_id: f1, dilution: null, amount_kg: 3 },       // 直接3kg → 40→37
          { fertilizer_id: f2, dilution: 500, amount_kg: null },     // 1000L/500=2kg → 40→38
        ], spray_volume_L: 1000, note: 'QA-TD(自動削除)', checks: { tenki: true }, staff_ids: [] }
      const mov = [
        { item_type: 'fertilizer', item_id: f1, delta_amount: -3, unit: 'kg', reason: '施肥' },
        { item_type: 'fertilizer', item_id: f2, delta_amount: -2, unit: 'kg', reason: '施肥' },
      ]
      const c = await farmRepo.createWithStock(col, fid, rec, mov)
      const r1 = await farmRepo.readAsync(sk)
      const got = r1.ok ? r1.value.find(x => String(x.id) === rec.id) : null
      const m1 = await farmRepo.readAsync(fk)
      const a1 = m1.ok ? m1.value.find(x => String(x.id) === f1) : null
      const b1 = m1.ok ? m1.value.find(x => String(x.id) === f2) : null
      const d = await farmRepo.removeWithStock(col, fid, rec.id, 1)
      const m2 = await farmRepo.readAsync(fk)
      const a2 = m2.ok ? m2.value.find(x => String(x.id) === f1) : null
      const b2 = m2.ok ? m2.value.find(x => String(x.id) === f2) : null
      // 片付け
      await sb.from('farm_stock_movements').delete().eq('item_id', f1)
      await sb.from('farm_stock_movements').delete().eq('item_id', f2)
      await sb.from('farm_fertilizers').delete().eq('id', f1)
      await sb.from('farm_fertilizers').delete().eq('id', f2)
      return { c: !!(c && c.ok), found: !!got, ftype: got && got.fertilizing_type === '追肥',
        checks: got && got.checks && got.checks.tenki === true, vol: got && got.spray_volume_L === 1000,
        stockA: a1 && a1.stock_kg, stockB: b1 && b1.stock_kg,
        d: !!(d && d.ok), stockAafter: a2 && a2.stock_kg, stockBafter: b2 && b2.stock_kg }
    })
    ok('C14: 施肥の在庫RPC往復(createWithStock=記録+肥料A40→37kg(直接)/B40→38kg(希釈)・converter往復(区分/checks/液量)・removeWithStockで40kg復帰)',
      tdRes.c && tdRes.found && tdRes.ftype && tdRes.checks && tdRes.vol &&
      tdRes.stockA === 37 && tdRes.stockB === 38 && tdRes.d && tdRes.stockAafter === 40 && tdRes.stockBafter === 40,
      JSON.stringify(tdRes))

    // ── 日報(farm_records→farm_work_records)=在庫RPC切替: 農薬散布create→農薬A残高減算・converter往復
    //    (crop_cycle_id/spray_volume_L)→農薬A→Bへupdate(逆仕訳でA復元・B減算)→removeでB復元 ──
    const wrRes = await A.evaluate(async () => {
      const col = 'farm_records', fid = CONFIG.CURRENT_FARM_ID
      const pk = 'farm_pesticides_' + fid, sk = col + '_' + fid
      const farmRow = await sb.from('farm_farms').select('org_id').eq('id', fid).limit(1)
      const orgId = farmRow.data[0].org_id
      const pA = crypto.randomUUID(), pB = crypto.randomUUID()
      await sb.from('farm_pesticides').insert([
        { id: pA, org_id: orgId, farm_id: fid, name: 'QA-WR農薬A(自動削除)', reg_no: 'QA', dilution: 1000, max_times: 3, preharvest_days: 7, stock_l: 20 },
        { id: pB, org_id: orgId, farm_id: fid, name: 'QA-WR農薬B(自動削除)', reg_no: 'QA', dilution: 1000, max_times: 3, preharvest_days: 7, stock_l: 20 },
      ])
      const rid = crypto.randomUUID()
      const rec = { id: rid, field_id: null, date: '2026-07-14', work_type: '農薬散布', pesticide_id: pA,
        dilution: 1000, amount: 5, spray_volume_L: 500, crop_cycle_id: 'cycle-QA-1', weather: '晴', worker: 'QA',
        note: 'QA-WR(自動削除)', field_ids: [], checks: { kanri: true } }
      const c = await farmRepo.createWithStock(col, fid, rec, [{ item_type: 'pesticide', item_id: pA, delta_amount: -5, unit: 'L', reason: '農薬散布' }])
      const r1 = await farmRepo.readAsync(sk)
      const got = r1.ok ? r1.value.find(x => String(x.id) === rid) : null
      const stA1 = (await sb.from('farm_pesticides').select('stock_l').eq('id', pA)).data[0].stock_l // 20→15
      // 農薬A→Bへ編集(逆仕訳: A+5戻し / B-5適用)。直接呼びなのでexpectedVersion(=got.version)を渡す(hookは内部で渡す)
      const edited = Object.assign({}, got, { pesticide_id: pB, amount: 5 })
      const u = await farmRepo.updateWithStock(col, fid, edited, [{ item_type: 'pesticide', item_id: pB, delta_amount: -5, unit: 'L', reason: '農薬散布' }], got.version)
      const stA2 = (await sb.from('farm_pesticides').select('stock_l').eq('id', pA)).data[0].stock_l // 15→20
      const stB2 = (await sb.from('farm_pesticides').select('stock_l').eq('id', pB)).data[0].stock_l // 20→15
      const r2 = await farmRepo.readAsync(sk)
      const got2 = r2.ok ? r2.value.find(x => String(x.id) === rid) : null
      const d = await farmRepo.removeWithStock(col, fid, rid, (got2 && got2.version) || 2)
      const stB3 = (await sb.from('farm_pesticides').select('stock_l').eq('id', pB)).data[0].stock_l // 15→20
      // 片付け
      await sb.from('farm_stock_movements').delete().eq('item_id', pA)
      await sb.from('farm_stock_movements').delete().eq('item_id', pB)
      await sb.from('farm_pesticides').delete().eq('id', pA)
      await sb.from('farm_pesticides').delete().eq('id', pB)
      return { c: !!(c && c.ok), found: !!got, cycle: got && got.crop_cycle_id === 'cycle-QA-1', vol: got && got.spray_volume_L === 500,
        checks: got && got.checks && got.checks.kanri === true, stA1: Number(stA1),
        u: !!(u && u.ok), stA2: Number(stA2), stB2: Number(stB2), pidAfter: got2 && got2.pesticide_id === pB,
        d: !!(d && d.ok), stB3: Number(stB3) }
    })
    ok('C15: 日報の在庫RPC往復(農薬散布create=A20→15L・converter往復(crop_cycle_id/spray_volume_L/checks)・A→B編集で逆仕訳(A復元20/B減算15)・削除でB復元20)',
      wrRes.c && wrRes.found && wrRes.cycle && wrRes.vol && wrRes.checks && wrRes.stA1 === 15 &&
      wrRes.u && wrRes.stA2 === 20 && wrRes.stB2 === 15 && wrRes.pidAfter && wrRes.d && wrRes.stB3 === 20,
      JSON.stringify(wrRes))

    // ── 収穫記録(farm_harvest_records)=記録系CRUD第5弾(在庫非連動): create→converter往復(shipments jsonb/total_cases/checks)→版ズレconflict→remove ──
    const hvRes = await A.evaluate(async () => {
      const col = 'farm_harvest_records', fid = CONFIG.CURRENT_FARM_ID, k = col + '_' + fid
      const id = crypto.randomUUID()
      const rec = { id, field_id: null, date: '2026-07-14', variety: 'QA収穫品種(自動削除)', row_range: '1-3',
        lot_code: 'QA-HV-1', shipments: [{ dest: 'JA', cases: 12 }, { dest: '直売', cases: 3 }], total_cases: 15,
        worker: 'QA', note: 'QA収穫(自動削除)', checks: { kanri: true } }
      const c = await farmRepo.create(col, fid, rec)
      const r1 = await farmRepo.readAsync(k)
      const got = r1.ok ? r1.value.find(x => String(x.id) === id) : null
      const conflict = await farmRepo.remove(col, fid, id, 99) // 版ズレ=conflict(削除されない)
      const still = await farmRepo.readAsync(k)
      const stillThere = still.ok && still.value.some(x => String(x.id) === id)
      const d = await farmRepo.remove(col, fid, id, (got && got.version) || 1)
      const r2 = await farmRepo.readAsync(k)
      const gone = r2.ok && !r2.value.some(x => String(x.id) === id)
      return { c: !!(c && c.ok), found: !!got,
        ship: got ? (Array.isArray(got.shipments) && got.shipments.length === 2 && got.shipments[0].cases === 12) : false,
        total: got ? got.total_cases === 15 : false, checks: got ? (got.checks && got.checks.kanri === true) : false,
        conflict: !!(conflict && conflict.conflict), stillThere, d: !!(d && d.ok), gone }
    })
    ok('C16: 収穫記録CRUDの本番往復(shipments jsonb/total_cases/checks往復・版ズレconflict保護・remove)',
      hvRes.c && hvRes.found && hvRes.ship && hvRes.total && hvRes.checks && hvRes.conflict && hvRes.stillThere && hvRes.d && hvRes.gone,
      JSON.stringify(hvRes))

    // ── 仕入れ履歴DB化(farm_add_purchase_with_stock)=履歴insert+通帳記帳+残高更新が単一トランザクション・同一送信ID冪等 ──
    const puRes = await A.evaluate(async () => {
      const fid = CONFIG.CURRENT_FARM_ID
      const farmRow = await sb.from('farm_farms').select('org_id').eq('id', fid).limit(1)
      const orgId = farmRow.data[0].org_id
      const pid = crypto.randomUUID()
      await sb.from('farm_pesticides').insert([{ id: pid, org_id: orgId, farm_id: fid, name: 'QA-PU農薬(自動削除)', reg_no: 'QA', dilution: 1000, max_times: 3, preharvest_days: 7, stock_l: 10 }])
      const purchaseId = crypto.randomUUID()
      const purchase = { id: purchaseId, pesticide_id: pid, date: '2026-07-14', amount_L: 5, supplier: 'QA商店', price_yen: 3000 }
      // 1回目: 履歴1件+在庫10→15+通帳1行
      const r1 = await farmRepo.addPurchaseWithStock('farm_pesticide_purchases', fid, purchase)
      const st1 = Number((await sb.from('farm_pesticides').select('stock_l').eq('id', pid)).data[0].stock_l)
      const h1 = (await sb.from('farm_pesticide_purchases').select('id,amount_l,supplier').eq('id', purchaseId)).data
      // 2回目: 同一purchase_idの再送→duplicate・在庫は動かない(15のまま)・履歴も1件のまま
      const r2 = await farmRepo.addPurchaseWithStock('farm_pesticide_purchases', fid, purchase)
      const st2 = Number((await sb.from('farm_pesticides').select('stock_l').eq('id', pid)).data[0].stock_l)
      const hcount = (await sb.from('farm_pesticide_purchases').select('id').eq('pesticide_id', pid)).data.length
      const mv = (await sb.from('farm_stock_movements').select('delta_amount,reason,record_collection').eq('item_id', pid)).data
      // アプリのconverter経由で履歴が読めるか(一覧表示)
      const listed = await farmRepo.readAsync('farm_pesticide_purchases_' + fid)
      const shown = listed.ok ? (listed.value || []).find(x => String(x.id) === purchaseId) : null
      // 片付け
      await sb.from('farm_stock_movements').delete().eq('item_id', pid)
      await sb.from('farm_pesticide_purchases').delete().eq('pesticide_id', pid)
      await sb.from('farm_pesticides').delete().eq('id', pid)
      return { r1: !!(r1 && r1.ok && !r1.duplicate), st1, hist1: !!(h1 && h1.length === 1 && Number(h1[0].amount_l) === 5 && h1[0].supplier === 'QA商店'),
        dup: !!(r2 && r2.ok && r2.duplicate === true), st2, hcount, mvRows: mv ? mv.length : -1,
        mvReason: mv && mv[0] ? (mv[0].reason === '仕入れ' && mv[0].record_collection === 'purchase') : false,
        shownAmt: shown ? shown.amount_L : null }
    })
    ok('C17: 仕入れ履歴DB化(履歴+通帳+残高が単一RPC・在庫10→15・converter読み・同一送信ID再送はduplicate=15のまま/履歴1件/記帳1行)',
      puRes.r1 && puRes.st1 === 15 && puRes.hist1 && puRes.dup && puRes.st2 === 15 && puRes.hcount === 1 && puRes.mvRows === 1 && puRes.mvReason && puRes.shownAmt === 5,
      JSON.stringify(puRes))

    // ── 仕入れの異内容再送ガード(レビュー High): 同一purchase_idで量を変えて再送→RPCが拒否・在庫/履歴は初回のまま ──
    const puGuard = await A.evaluate(async () => {
      const fid = CONFIG.CURRENT_FARM_ID
      const farmRow = await sb.from('farm_farms').select('org_id').eq('id', fid).limit(1)
      const orgId = farmRow.data[0].org_id
      const pid = crypto.randomUUID()
      await sb.from('farm_pesticides').insert([{ id: pid, org_id: orgId, farm_id: fid, name: 'QA-PUG農薬(自動削除)', reg_no: 'QA', dilution: 1000, max_times: 3, preharvest_days: 7, stock_l: 10 }])
      const purchaseId = crypto.randomUUID()
      const r1 = await farmRepo.addPurchaseWithStock('farm_pesticide_purchases', fid, { id: purchaseId, pesticide_id: pid, date: '2026-07-14', amount_L: 5, supplier: 'QA商店', price_yen: 3000 }) // 10→15
      const st1 = Number((await sb.from('farm_pesticides').select('stock_l').eq('id', pid)).data[0].stock_l)
      // 同一IDで量を6Lに変えて再送 → 拒否(ok:false)・在庫15のまま・履歴のamount_lは5のまま
      const r2 = await farmRepo.addPurchaseWithStock('farm_pesticide_purchases', fid, { id: purchaseId, pesticide_id: pid, date: '2026-07-14', amount_L: 6, supplier: 'QA商店', price_yen: 3000 })
      const st2 = Number((await sb.from('farm_pesticides').select('stock_l').eq('id', pid)).data[0].stock_l)
      const h = (await sb.from('farm_pesticide_purchases').select('amount_l').eq('id', purchaseId)).data
      // 同一内容(5L)の再送は引き続き冪等成功
      const r3 = await farmRepo.addPurchaseWithStock('farm_pesticide_purchases', fid, { id: purchaseId, pesticide_id: pid, date: '2026-07-14', amount_L: 5, supplier: 'QA商店', price_yen: 3000 })
      const st3 = Number((await sb.from('farm_pesticides').select('stock_l').eq('id', pid)).data[0].stock_l)
      await sb.from('farm_stock_movements').delete().eq('item_id', pid)
      await sb.from('farm_pesticide_purchases').delete().eq('pesticide_id', pid)
      await sb.from('farm_pesticides').delete().eq('id', pid)
      return { r1: !!(r1 && r1.ok), st1, rejected: !!(r2 && r2.ok === false), st2,
        histAmt: h && h[0] ? Number(h[0].amount_l) : null, dupSame: !!(r3 && r3.ok && r3.duplicate === true), st3 }
    })
    ok('C18: 仕入れの異内容再送ガード(同一ID・量5→6は拒否ok:false・在庫15/履歴5Lのまま・同一内容5Lの再送は冪等成功)',
      puGuard.r1 && puGuard.st1 === 15 && puGuard.rejected && puGuard.st2 === 15 && puGuard.histAmt === 5 && puGuard.dupSame && puGuard.st3 === 15,
      JSON.stringify(puGuard))
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
