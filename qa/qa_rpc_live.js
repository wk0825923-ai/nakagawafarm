// qa_rpc_live.js — 在庫RPC(farm_save/delete_record_with_stock)の本番検証（デモ農場・自動片付け）
// 設計図の約束を実機で証明する:
//  P1 保存=記録+記帳+残高減算が1回で揃う / P2 再送は冪等(二重減算しない) /
//  P3 不正item_idは全体rollback(記録も記帳も残らない) / P4 削除=逆仕訳+残高復帰 /
//  P5 削除再送は冪等(逆仕訳が増えない) / P6 通帳(движements合計)と残高キャッシュが一致
// 実行: cd qa && node qa_rpc_live.js
const puppeteer = require('puppeteer-core')
const URL_BASE = process.env.LIVE_URL || 'https://syatyo-suport.vercel.app'
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const checks = []
const ok = (name, cond, extra) => checks.push({ name, pass: !!cond, extra: extra == null ? '' : String(extra) })

;(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  let A = null
  try {
    A = await b.newPage()
    await A.goto(URL_BASE + '/', { waitUntil: 'domcontentloaded', timeout: 120000 })
    await sleep(800)
    if (await A.$('input[type=email]')) {
      await A.type('input[type=email]', 'demo@syatyo-suport.jp')
      await A.type('input[type=password]', 'demo1234')
      await A.evaluate(() => { const x = [...document.querySelectorAll('button[type=submit]')].find(b => /ログイン/.test(b.textContent)); if (x) x.click() })
      for (let i = 0; i < 60; i++) { if (await A.evaluate(() => !!document.querySelector('.main'))) break; await sleep(500) }
    }

    const res = await A.evaluate(async () => {
      const fid = CONFIG.CURRENT_FARM_ID
      const out = { steps: {} }
      // orgIdはfarm_farmsから(自orgのみRLSで見える)
      const farmRow = await sb.from('farm_farms').select('org_id').eq('id', fid).limit(1)
      const orgId = farmRow.data && farmRow.data[0] && farmRow.data[0].org_id
      out.orgId = !!orgId

      // ── 準備: QA用農薬マスタをDBに作成(在庫18L) ──
      const pid = crypto.randomUUID()
      const mk = await sb.from('farm_pesticides').insert([{ id: pid, org_id: orgId, farm_id: fid, name: 'QA-RPC農薬(自動削除)', reg_no: 'QA', dilution: 1000, max_times: 3, preharvest_days: 7, stock_l: 18 }])
      out.steps.master = !mk.error
      const stockOf = async () => { const r = await sb.from('farm_pesticides').select('stock_l').eq('id', pid); return r.data && r.data[0] ? Number(r.data[0].stock_l) : null }

      // ── P1: 保存RPC(散布記録+原液0.5L減算) ──
      const rid = crypto.randomUUID()
      const record = { id: rid, org_id: orgId, farm_id: fid, field_id: null, date: '2026-07-12',
        row_range: '1-3', spray_volume_L: 500, weather: '晴', note: 'QA-RPC(自動削除)',
        pesticides: [{ pesticide_id: pid, dilution: 1000 }], staff_ids: [], version: 1 }
      const movements = [{ item_type: 'pesticide', item_id: pid, delta_amount: -0.5, unit: 'L', reason: '農薬散布' }]
      const s1 = await sb.rpc('farm_save_record_with_stock', { p_table: 'farm_lot_spray_records', p_record: record, p_movements: movements })
      const stock1 = await stockOf()
      const recCount = async () => { const r = await sb.from('farm_lot_spray_records').select('id').eq('id', rid); return r.data ? r.data.length : -1 }
      out.p1 = { ok: !s1.error && s1.data && s1.data.ok === true, err: s1.error && s1.error.message, stock: stock1, rec: await recCount() }

      // ── P2: 同じ記録IDの再送 → duplicate:true・在庫はそれ以上減らない ──
      const s2 = await sb.rpc('farm_save_record_with_stock', { p_table: 'farm_lot_spray_records', p_record: record, p_movements: movements })
      const stock2 = await stockOf()
      out.p2 = { ok: !s2.error && s2.data && s2.data.duplicate === true, stock: stock2 }

      // ── P3: 不正item_id → 例外で全体rollback(記録も記帳も残高も無傷) ──
      const badId = crypto.randomUUID()
      const badRec = Object.assign({}, record, { id: crypto.randomUUID() })
      const s3 = await sb.rpc('farm_save_record_with_stock', { p_table: 'farm_lot_spray_records', p_record: badRec,
        p_movements: [{ item_type: 'pesticide', item_id: crypto.randomUUID(), delta_amount: -1, unit: 'L', reason: 'QA不正' }] })
      const badRecCount = await sb.from('farm_lot_spray_records').select('id').eq('id', badRec.id)
      const stock3 = await stockOf()
      out.p3 = { errored: !!s3.error, msg: s3.error && String(s3.error.message).slice(0, 40), recGone: badRecCount.data && badRecCount.data.length === 0, stock: stock3 }

      // ── P4: 削除RPC → 逆仕訳行+残高復帰 ──
      const d1 = await sb.rpc('farm_delete_record_with_stock', { p_table: 'farm_lot_spray_records', p_farm_id: fid, p_record_id: rid, p_expected_version: 1 })
      const stock4 = await stockOf()
      const mv = await sb.from('farm_stock_movements').select('delta_amount,reversal_of').eq('record_id', rid)
      out.p4 = { ok: !d1.error && d1.data && d1.data.ok === true && d1.data.reversed === 1, stock: stock4,
        rows: mv.data ? mv.data.length : -1, hasReversal: mv.data ? mv.data.some(x => x.reversal_of != null) : false,
        rec: await recCount() }

      // ── P5: 削除の再送 → alreadyGone・逆仕訳は増えない ──
      const d2 = await sb.rpc('farm_delete_record_with_stock', { p_table: 'farm_lot_spray_records', p_farm_id: fid, p_record_id: rid, p_expected_version: 1 })
      const mv2 = await sb.from('farm_stock_movements').select('id').eq('record_id', rid)
      out.p5 = { ok: !d2.error && d2.data && d2.data.alreadyGone === true, rows: mv2.data ? mv2.data.length : -1 }

      // ── P6: 通帳突合(この記録のmovements合計=0)＋残高が初期値18Lへ復帰 ──
      const sum = await sb.from('farm_stock_movements').select('delta_amount').eq('record_id', rid)
      const total = (sum.data || []).reduce((a, x) => a + Number(x.delta_amount), 0)
      out.p6 = { total, stock: await stockOf() }

      // ── 後片付け: QA農薬とQA記帳を削除(通帳を消さない思想の例外=QAデータのみ) ──
      await sb.from('farm_stock_movements').delete().eq('item_id', pid)
      await sb.from('farm_pesticides').delete().eq('id', pid)
      const left = await sb.from('farm_pesticides').select('id').eq('id', pid)
      out.cleanup = left.data && left.data.length === 0
      return out
    })

    ok('P0: 準備(orgId解決・QA農薬マスタ作成 在庫18L)', res.orgId && res.steps.master)
    ok('P1: 保存RPC=記録insert+記帳+残高18→17.5Lが1回で揃う', res.p1.ok && res.p1.stock === 17.5 && res.p1.rec === 1, JSON.stringify(res.p1))
    ok('P2: 再送は冪等(duplicate:true・残高17.5Lのまま=二重減算なし)', res.p2.ok && res.p2.stock === 17.5, JSON.stringify(res.p2))
    ok('P3: 不正item_idは全体rollback(記録も残らず・残高無傷)', res.p3.errored && res.p3.recGone && res.p3.stock === 17.5, JSON.stringify(res.p3))
    ok('P4: 削除RPC=逆仕訳1件追加(行は消さない)+残高18Lへ復帰+記録delete', res.p4.ok && res.p4.stock === 18 && res.p4.rows === 2 && res.p4.hasReversal && res.p4.rec === 0, JSON.stringify(res.p4))
    ok('P5: 削除の再送は冪等(alreadyGone・逆仕訳が増えない=2行のまま)', res.p5.ok && res.p5.rows === 2, JSON.stringify(res.p5))
    ok('P6: 通帳突合=この記録の記帳合計0・残高キャッシュ一致(18L)', res.p6.total === 0 && res.p6.stock === 18, JSON.stringify(res.p6))
    ok('P7: 後片付け完了(QAデータ残存なし)', res.cleanup === true)
  } finally {
    await b.close()
  }
  const pass = checks.filter(c => c.pass).length
  console.log('QARPCLIVE_START')
  checks.forEach(c => console.log((c.pass ? 'PASS' : 'FAIL') + ' ' + c.name + (c.extra ? ' [' + c.extra + ']' : '')))
  console.log(pass + '/' + checks.length)
  console.log('QARPCLIVE_END')
  process.exit(pass === checks.length ? 0 : 1)
})().catch(e => { console.error('RUNERR', e); process.exit(1) })
