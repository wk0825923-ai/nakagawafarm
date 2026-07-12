// qa_rpc_live.js — 在庫RPC v2(save/update/delete_record_with_stock)の本番検証（デモ農場・自動片付け）
// v1: P1保存3点セット/P2再送冪等/P3不正id全rollback/P4逆仕訳/P5削除冪等/P6通帳突合
// v2(Codexレビュー9): P8 ID再利用拒否 / P9-P11 movement検証(空・正数・別資材) /
//   P12 同一資材の合算 / P13 更新RPC(量変更) / P14 版競合で全て無傷 / P15 資材A→B変更
// 実行: cd qa && node qa_rpc_live.js
const puppeteer = require('puppeteer-core')
const URL_BASE = process.env.LIVE_URL || 'https://syatyo-suport.vercel.app'
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const checks = []
const ok = (name, cond, extra) => checks.push({ name, pass: !!cond, extra: extra == null ? '' : String(extra) })

;(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  try {
    const A = await b.newPage()
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
      const out = {}
      const T = 'farm_lot_spray_records'
      const farmRow = await sb.from('farm_farms').select('org_id').eq('id', fid).limit(1)
      const orgId = farmRow.data && farmRow.data[0] && farmRow.data[0].org_id
      out.orgId = !!orgId

      // 準備: QA農薬A(在庫18L)・B(在庫10L)
      const pidA = crypto.randomUUID(), pidB = crypto.randomUUID()
      const mk = await sb.from('farm_pesticides').insert([
        { id: pidA, org_id: orgId, farm_id: fid, name: 'QA-RPC農薬A(自動削除)', reg_no: 'QA', dilution: 1000, max_times: 3, preharvest_days: 7, stock_l: 18 },
        { id: pidB, org_id: orgId, farm_id: fid, name: 'QA-RPC農薬B(自動削除)', reg_no: 'QA', dilution: 1000, max_times: 3, preharvest_days: 7, stock_l: 10 },
      ])
      out.master = !mk.error
      const stockOf = async (pid) => { const r = await sb.from('farm_pesticides').select('stock_l').eq('id', pid); return r.data && r.data[0] ? Number(r.data[0].stock_l) : null }
      const mkRec = (id, pests) => ({ id, org_id: orgId, farm_id: fid, field_id: null, date: '2026-07-12',
        row_range: '1-3', spray_volume_L: 500, weather: '晴', note: 'QA-RPC(自動削除)', pesticides: pests, staff_ids: [], version: 1 })
      const save = (rec, mov) => sb.rpc('farm_save_record_with_stock', { p_table: T, p_record: rec, p_movements: mov })
      const upd = (rec, mov, v) => sb.rpc('farm_update_record_with_stock', { p_table: T, p_record: rec, p_movements: mov, p_expected_version: v })
      const del = (id, v) => sb.rpc('farm_delete_record_with_stock', { p_table: T, p_farm_id: fid, p_record_id: id, p_expected_version: v })
      const mvOf = async (id) => { const r = await sb.from('farm_stock_movements').select('delta_amount,reversal_of,reversed').eq('record_id', id); return r.data || [] }

      // ── P1-P6(v1基本経路) ──
      const rid = crypto.randomUUID()
      const s1 = await save(mkRec(rid, [{ pesticide_id: pidA, dilution: 1000 }]), [{ item_type: 'pesticide', item_id: pidA, delta_amount: -0.5, unit: 'L', reason: '農薬散布' }])
      out.p1 = { ok: !s1.error && s1.data.ok === true, stock: await stockOf(pidA) }
      const s2 = await save(mkRec(rid, [{ pesticide_id: pidA, dilution: 1000 }]), [{ item_type: 'pesticide', item_id: pidA, delta_amount: -0.5, unit: 'L', reason: '農薬散布' }])
      out.p2 = { ok: !s2.error && s2.data.duplicate === true, stock: await stockOf(pidA) }
      const badRec = mkRec(crypto.randomUUID(), [{ pesticide_id: pidA, dilution: 1000 }])
      const s3 = await save(badRec, [{ item_type: 'pesticide', item_id: crypto.randomUUID(), delta_amount: -1, unit: 'L', reason: 'QA不正' }])
      const badCount = await sb.from(T).select('id').eq('id', badRec.id)
      out.p3 = { errored: !!s3.error, recGone: badCount.data && badCount.data.length === 0, stock: await stockOf(pidA) }
      const d1 = await del(rid, 1)
      const mv1 = await mvOf(rid)
      out.p4 = { ok: !d1.error && d1.data.ok === true && d1.data.reversed === 1, stock: await stockOf(pidA),
        rows: mv1.length, marked: mv1.some(x => x.reversed === true), hasReversal: mv1.some(x => x.reversal_of != null) }
      const d2 = await del(rid, 1)
      out.p5 = { ok: !d2.error && d2.data.alreadyGone === true, rows: (await mvOf(rid)).length }
      const total = (await mvOf(rid)).reduce((a, x) => a + Number(x.delta_amount), 0)
      out.p6 = { total, stock: await stockOf(pidA) }

      // ── P8: 削除済みIDの再利用は拒否(残高・通帳とも無傷) ──
      const s8 = await save(mkRec(rid, [{ pesticide_id: pidA, dilution: 1000 }]), [{ item_type: 'pesticide', item_id: pidA, delta_amount: -0.5, unit: 'L', reason: '農薬散布' }])
      out.p8 = { errored: !!s8.error, msg: s8.error && String(s8.error.message).slice(0, 24), stock: await stockOf(pidA), rows: (await mvOf(rid)).length }

      // ── P9: 在庫連動の記録なのにmovements空 → 拒否 ──
      const r9 = mkRec(crypto.randomUUID(), [{ pesticide_id: pidA, dilution: 1000 }])
      const s9 = await save(r9, [])
      const c9 = await sb.from(T).select('id').eq('id', r9.id)
      out.p9 = { errored: !!s9.error, recGone: c9.data && c9.data.length === 0 }

      // ── P10: 正数(在庫を増やす使用) → 拒否 ──
      const r10 = mkRec(crypto.randomUUID(), [{ pesticide_id: pidA, dilution: 1000 }])
      const s10 = await save(r10, [{ item_type: 'pesticide', item_id: pidA, delta_amount: 0.5, unit: 'L', reason: 'QA不正' }])
      out.p10 = { errored: !!s10.error, stock: await stockOf(pidA) }

      // ── P11: 記録に含まれない別資材への移動 → 拒否 ──
      const r11 = mkRec(crypto.randomUUID(), [{ pesticide_id: pidA, dilution: 1000 }])
      const s11 = await save(r11, [{ item_type: 'pesticide', item_id: pidB, delta_amount: -0.5, unit: 'L', reason: 'QA不正' }])
      out.p11 = { errored: !!s11.error, stockB: await stockOf(pidB) }

      // ── P12: 同一資材の複数行は合算(通帳1行・残高は合計分だけ減る) ──
      const rid2 = crypto.randomUUID()
      const s12 = await save(mkRec(rid2, [{ pesticide_id: pidA, dilution: 1000 }, { pesticide_id: pidA, dilution: 500 }]),
        [{ item_type: 'pesticide', item_id: pidA, delta_amount: -0.3, unit: 'L', reason: '農薬散布' },
         { item_type: 'pesticide', item_id: pidA, delta_amount: -0.2, unit: 'L', reason: '農薬散布' }])
      const mv12 = await mvOf(rid2)
      out.p12 = { ok: !s12.error && s12.data.ok === true, rows: mv12.length, delta: mv12[0] && Number(mv12[0].delta_amount), stock: await stockOf(pidA) }

      // ── P13: 更新RPC(使用量0.5→0.8) = 逆仕訳+新記帳・残高17.2 ──
      const u13 = await upd(mkRec(rid2, [{ pesticide_id: pidA, dilution: 1000 }]),
        [{ item_type: 'pesticide', item_id: pidA, delta_amount: -0.8, unit: 'L', reason: '農薬散布(訂正)' }], 1)
      const mv13 = await mvOf(rid2)
      const verRow = await sb.from(T).select('version').eq('id', rid2)
      out.p13 = { ok: !u13.error && u13.data.ok === true && u13.data.version === 2, stock: await stockOf(pidA),
        rows: mv13.length, version: verRow.data && verRow.data[0] && verRow.data[0].version }

      // ── P14: 版競合(古いversion=1で更新) → conflict・記録/通帳/残高すべて無傷 ──
      const u14 = await upd(mkRec(rid2, [{ pesticide_id: pidA, dilution: 1000 }]),
        [{ item_type: 'pesticide', item_id: pidA, delta_amount: -9, unit: 'L', reason: 'QA競合' }], 1)
      out.p14 = { conflict: !u14.error && u14.data.conflict === true, stock: await stockOf(pidA), rows: (await mvOf(rid2)).length }

      // ── P15: 資材A→Bへ変更(version=2) → A残高復帰18・B残高9.2 ──
      const u15 = await upd(mkRec(rid2, [{ pesticide_id: pidB, dilution: 1000 }]),
        [{ item_type: 'pesticide', item_id: pidB, delta_amount: -0.8, unit: 'L', reason: '農薬散布(資材変更)' }], 2)
      out.p15 = { ok: !u15.error && u15.data.ok === true, stockA: await stockOf(pidA), stockB: await stockOf(pidB) }

      // 片付け: 記録削除(version3)→B復帰 → QAデータ全削除
      const d15 = await del(rid2, 3)
      out.finalStocks = { a: await stockOf(pidA), b: await stockOf(pidB), delOk: !d15.error && d15.data.ok === true }
      await sb.from('farm_stock_movements').delete().in('item_id', [pidA, pidB])
      await sb.from('farm_pesticides').delete().in('id', [pidA, pidB])
      const left = await sb.from('farm_pesticides').select('id').in('id', [pidA, pidB])
      out.cleanup = left.data && left.data.length === 0
      return out
    })

    ok('P0: 準備(orgId解決・QA農薬A=18L/B=10L作成)', res.orgId && res.master)
    ok('P1: 保存=記録+記帳+残高18→17.5L', res.p1.ok && res.p1.stock === 17.5, JSON.stringify(res.p1))
    ok('P2: 再送は冪等(二重減算なし)', res.p2.ok && res.p2.stock === 17.5, JSON.stringify(res.p2))
    ok('P3: 不正item_idは全体rollback', res.p3.errored && res.p3.recGone && res.p3.stock === 17.5, JSON.stringify(res.p3))
    ok('P4: 削除=逆仕訳+取消済みマーク+残高18L復帰', res.p4.ok && res.p4.stock === 18 && res.p4.rows === 2 && res.p4.marked && res.p4.hasReversal, JSON.stringify(res.p4))
    ok('P5: 削除再送は冪等(逆仕訳増えない)', res.p5.ok && res.p5.rows === 2, JSON.stringify(res.p5))
    ok('P6: 通帳突合(合計0=残高一致)', res.p6.total === 0 && res.p6.stock === 18, JSON.stringify(res.p6))
    ok('P8: 削除済み記録IDの再利用は拒否(残高・通帳無傷)', res.p8.errored && res.p8.stock === 18 && res.p8.rows === 2, JSON.stringify(res.p8))
    ok('P9: 在庫連動記録なのにmovements空→拒否(記録も残らない)', res.p9.errored && res.p9.recGone, JSON.stringify(res.p9))
    ok('P10: 正数の使用movement→拒否(在庫を勝手に増やせない)', res.p10.errored && res.p10.stock === 18, JSON.stringify(res.p10))
    ok('P11: 記録に含まれない別資材への移動→拒否', res.p11.errored && res.p11.stockB === 10, JSON.stringify(res.p11))
    ok('P12: 同一資材の複数行は合算(通帳1行 -0.5L・残高17.5L)', res.p12.ok && res.p12.rows === 1 && res.p12.delta === -0.5 && res.p12.stock === 17.5, JSON.stringify(res.p12))
    ok('P13: 更新RPC 0.5→0.8L(逆仕訳+新記帳=3行・残高17.2L・version2)', res.p13.ok && res.p13.stock === 17.2 && res.p13.rows === 3 && res.p13.version === 2, JSON.stringify(res.p13))
    ok('P14: 版競合で更新拒否(記録/通帳/残高すべて無傷)', res.p14.conflict && res.p14.stock === 17.2 && res.p14.rows === 3, JSON.stringify(res.p14))
    ok('P15: 資材A→B変更(A復帰18L・B 10→9.2L)', res.p15.ok && res.p15.stockA === 18 && res.p15.stockB === 9.2, JSON.stringify(res.p15))
    ok('P16: 最終削除でA=18/B=10へ完全復帰＋QAデータ掃除完了', res.finalStocks.delOk && res.finalStocks.a === 18 && res.finalStocks.b === 10 && res.cleanup === true, JSON.stringify(res.finalStocks))
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
