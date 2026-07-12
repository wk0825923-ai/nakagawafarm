// qa_rpc_live.js — 在庫RPC v3(save/update/delete_record_with_stock)の本番検証（デモ農場・自動片付け）
// v1: P1保存3点セット/P2再送冪等/P3不正id/P4逆仕訳/P5削除冪等/P6通帳突合
// v2(レビュー9): P8 ID再利用拒否 / P9-P11 movement検証 / P12合算 / P13更新 / P14版競合 / P15資材変更
// v3(レビュー10): P17 内部ヘルパー直接呼び出し拒否 / P18 量の改ざん拒否(期待量とRPC内突合) /
//   P19 複数資材の一部欠落拒否 / P20 同一ID・異なる内容の再送拒否
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
      // 期待使用量 = spray_volume_L ÷ dilution（RPCがサーバー側で同じ式で検証する）
      const mkRec = (id, pests, vol, note) => ({ id, org_id: orgId, farm_id: fid, field_id: null, date: '2026-07-12',
        row_range: '1-3', spray_volume_l: vol == null ? 500 : vol, weather: '晴', note: note || 'QA-RPC(自動削除)', pesticides: pests, staff_ids: [], version: 1 })
      const mv = (pid, d) => ({ item_type: 'pesticide', item_id: pid, delta_amount: d, unit: 'L', reason: '農薬散布' })
      const save = (rec, mov) => sb.rpc('farm_save_record_with_stock', { p_table: T, p_record: rec, p_movements: mov })
      const upd = (rec, mov, v) => sb.rpc('farm_update_record_with_stock', { p_table: T, p_record: rec, p_movements: mov, p_expected_version: v })
      const del = (id, v) => sb.rpc('farm_delete_record_with_stock', { p_table: T, p_farm_id: fid, p_record_id: id, p_expected_version: v })
      const mvOf = async (id) => { const r = await sb.from('farm_stock_movements').select('delta_amount,reversal_of,reversed').eq('record_id', id); return r.data || [] }

      // ── P1-P6(v1基本経路: 500L÷1000倍=0.5L) ──
      const rid = crypto.randomUUID()
      const s1 = await save(mkRec(rid, [{ pesticide_id: pidA, dilution: 1000 }]), [mv(pidA, -0.5)])
      out.p1 = { ok: !s1.error && s1.data.ok === true, err: s1.error && s1.error.message, stock: await stockOf(pidA) }
      const s2 = await save(mkRec(rid, [{ pesticide_id: pidA, dilution: 1000 }]), [mv(pidA, -0.5)])
      out.p2 = { ok: !s2.error && s2.data.duplicate === true, stock: await stockOf(pidA) }
      const badRec = mkRec(crypto.randomUUID(), [{ pesticide_id: pidA, dilution: 1000 }])
      const s3 = await save(badRec, [mv(crypto.randomUUID(), -0.5)])
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

      // ── P8: 削除済みIDの再利用は拒否 ──
      const s8 = await save(mkRec(rid, [{ pesticide_id: pidA, dilution: 1000 }]), [mv(pidA, -0.5)])
      out.p8 = { errored: !!s8.error, stock: await stockOf(pidA), rows: (await mvOf(rid)).length }

      // ── P9: 在庫連動の記録なのにmovements空 → 拒否(期待資材の不足として検出) ──
      const r9 = mkRec(crypto.randomUUID(), [{ pesticide_id: pidA, dilution: 1000 }])
      const s9 = await save(r9, [])
      const c9 = await sb.from(T).select('id').eq('id', r9.id)
      out.p9 = { errored: !!s9.error, recGone: c9.data && c9.data.length === 0 }

      // ── P10: 正数(在庫を増やす) → 量不一致として拒否 ──
      const s10 = await save(mkRec(crypto.randomUUID(), [{ pesticide_id: pidA, dilution: 1000 }]), [mv(pidA, 0.5)])
      out.p10 = { errored: !!s10.error, stock: await stockOf(pidA) }

      // ── P11: 記録に含まれない別資材 → 拒否 ──
      const s11 = await save(mkRec(crypto.randomUUID(), [{ pesticide_id: pidA, dilution: 1000 }]), [mv(pidB, -0.5)])
      out.p11 = { errored: !!s11.error, stockB: await stockOf(pidB) }

      // ── P12: 同一資材の複数行(1000倍+500倍)=期待-1.5Lを2行で申告→合算1記帳 ──
      const rid2 = crypto.randomUUID()
      const s12 = await save(mkRec(rid2, [{ pesticide_id: pidA, dilution: 1000 }, { pesticide_id: pidA, dilution: 500 }]),
        [mv(pidA, -0.5), mv(pidA, -1.0)])
      const mv12 = await mvOf(rid2)
      out.p12 = { ok: !s12.error && s12.data.ok === true, err: s12.error && s12.error.message,
        rows: mv12.length, delta: mv12[0] && Number(mv12[0].delta_amount), stock: await stockOf(pidA) }

      // ── P13: 更新RPC(散布液量500→800L=使用量1.5→0.8L) ──
      const u13 = await upd(mkRec(rid2, [{ pesticide_id: pidA, dilution: 1000 }], 800), [mv(pidA, -0.8)], 1)
      const mv13 = await mvOf(rid2)
      const verRow = await sb.from(T).select('version').eq('id', rid2) // 列名は小文字(spray_volume_l)なのでversionのみ取得
      out.p13 = { ok: !u13.error && u13.data.ok === true && u13.data.version === 2, err: u13.error && u13.error.message,
        stock: await stockOf(pidA), rows: mv13.length, version: verRow.data && verRow.data[0] && verRow.data[0].version }

      // ── P14: 版競合 → conflict・すべて無傷 ──
      const u14 = await upd(mkRec(rid2, [{ pesticide_id: pidA, dilution: 1000 }], 900), [mv(pidA, -0.9)], 1)
      out.p14 = { conflict: !u14.error && u14.data.conflict === true, stock: await stockOf(pidA), rows: (await mvOf(rid2)).length }

      // ── P15: 資材A→B変更(液量800L・B使用0.8L) ──
      const u15 = await upd(mkRec(rid2, [{ pesticide_id: pidB, dilution: 1000 }], 800), [mv(pidB, -0.8)], 2)
      out.p15 = { ok: !u15.error && u15.data.ok === true, stockA: await stockOf(pidA), stockB: await stockOf(pidB) }

      // ── P17(v3 Critical): 内部ヘルパーはAPIから直接呼べない ──
      const h1 = await sb.rpc('farm__apply_stock_movements', { p_org: orgId, p_farm: fid, p_table: T, p_record_id: crypto.randomUUID(), p_record: {}, p_movements: [] })
      const h2 = await sb.rpc('farm__reverse_stock_movements', { p_table: T, p_record_id: rid2 })
      out.p17 = { applyBlocked: !!h1.error, reverseBlocked: !!h2.error,
        codes: [(h1.error && h1.error.code) || '', (h2.error && h2.error.code) || ''].join(','), stockB: await stockOf(pidB) }

      // ── P18(v3 High): 資材IDは正しいが量だけ改ざん(-0.01) → 拒否 ──
      const s18 = await save(mkRec(crypto.randomUUID(), [{ pesticide_id: pidA, dilution: 1000 }]), [mv(pidA, -0.01)])
      out.p18 = { errored: !!s18.error, msg: s18.error && String(s18.error.message).slice(0, 30), stock: await stockOf(pidA) }

      // ── P19(v3 High): 記録に農薬A+Bなのにmovementsが片方だけ → 不足として拒否 ──
      const r19 = mkRec(crypto.randomUUID(), [{ pesticide_id: pidA, dilution: 1000 }, { pesticide_id: pidB, dilution: 1000 }])
      const s19 = await save(r19, [mv(pidA, -0.5)])
      const c19 = await sb.from(T).select('id').eq('id', r19.id)
      out.p19 = { errored: !!s19.error, recGone: c19.data && c19.data.length === 0, stockA: await stockOf(pidA) }

      // ── P22(v5 High): 極小期待量(0.005L)に正数(+0.004)→許容差内でも負数チェックで拒否 ──
      const r22 = mkRec(crypto.randomUUID(), [{ pesticide_id: pidA, dilution: 100000 }]) // 500/100000=0.005L
      const s22 = await save(r22, [mv(pidA, 0.004)])
      out.p22 = { errored: !!s22.error, msg: s22.error && String(s22.error.message).slice(0, 20), stock: await stockOf(pidA) }

      // ── P23(v5 High): 農薬IDあり+希釈0=数量計算不能 → movements空でも入力不正として拒否 ──
      const r23 = mkRec(crypto.randomUUID(), [{ pesticide_id: pidA, dilution: 0 }])
      const s23 = await save(r23, [])
      const c23 = await sb.from(T).select('id').eq('id', r23.id)
      out.p23 = { errored: !!s23.error, msg: s23.error && String(s23.error.message).slice(0, 20), recGone: c23.data && c23.data.length === 0 }

      // ── P24(v5 Med): 偽org_idを渡してもDB導出のorg_idで保存される ──
      const r24id = crypto.randomUUID()
      const r24 = Object.assign(mkRec(r24id, [{ pesticide_id: pidA, dilution: 1000 }]), { org_id: crypto.randomUUID() })
      const s24 = await save(r24, [mv(pidA, -0.5)])
      const row24 = await sb.from(T).select('org_id').eq('id', r24id)
      const savedOrg = row24.data && row24.data[0] && row24.data[0].org_id
      await del(r24id, 1) // 後片付け
      out.p24 = { ok: !s24.error && s24.data.ok === true, orgFixed: savedOrg === orgId, stock: await stockOf(pidA) }

      // ── P20(v3 Med): 同一ID・異なる内容の再送 → 拒否(同一内容ならP2でduplicate成功済み) ──
      const s20 = await save(mkRec(rid2, [{ pesticide_id: pidB, dilution: 1000 }], 800, '内容を変えた再送'), [mv(pidB, -0.8)])
      out.p20 = { errored: !!s20.error, msg: s20.error && String(s20.error.message).slice(0, 20) }

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
    ok('P2: 同一内容の再送は冪等(二重減算なし)', res.p2.ok && res.p2.stock === 17.5, JSON.stringify(res.p2))
    ok('P3: 不正item_idは全体rollback', res.p3.errored && res.p3.recGone && res.p3.stock === 17.5, JSON.stringify(res.p3))
    ok('P4: 削除=逆仕訳+取消済みマーク+残高18L復帰', res.p4.ok && res.p4.stock === 18 && res.p4.rows === 2 && res.p4.marked && res.p4.hasReversal, JSON.stringify(res.p4))
    ok('P5: 削除再送は冪等(逆仕訳増えない)', res.p5.ok && res.p5.rows === 2, JSON.stringify(res.p5))
    ok('P6: 通帳突合(合計0=残高一致)', res.p6.total === 0 && res.p6.stock === 18, JSON.stringify(res.p6))
    ok('P8: 削除済み記録IDの再利用は拒否', res.p8.errored && res.p8.stock === 18 && res.p8.rows === 2, JSON.stringify(res.p8))
    ok('P9: 在庫連動記録なのにmovements空→拒否', res.p9.errored && res.p9.recGone, JSON.stringify(res.p9))
    ok('P10: 正数の使用movement→拒否', res.p10.errored && res.p10.stock === 18, JSON.stringify(res.p10))
    ok('P11: 記録に含まれない別資材→拒否', res.p11.errored && res.p11.stockB === 10, JSON.stringify(res.p11))
    ok('P12: 同一資材複数行(期待-1.5L)は合算1記帳・残高16.5L', res.p12.ok && res.p12.rows === 1 && res.p12.delta === -1.5 && res.p12.stock === 16.5, JSON.stringify(res.p12))
    ok('P13: 更新RPC 液量500→800L(使用1.5→0.8L・残高17.2L・version2)', res.p13.ok && res.p13.stock === 17.2 && res.p13.rows === 3 && res.p13.version === 2, JSON.stringify(res.p13))
    ok('P14: 版競合で更新拒否(全て無傷)', res.p14.conflict && res.p14.stock === 17.2 && res.p14.rows === 3, JSON.stringify(res.p14))
    ok('P15: 資材A→B変更(A復帰18L・B 10→9.2L)', res.p15.ok && res.p15.stockA === 18 && res.p15.stockB === 9.2, JSON.stringify(res.p15))
    ok('P17: 内部ヘルパーはAPIから直接呼べない(apply/reverseとも拒否・在庫無傷)', res.p17.applyBlocked && res.p17.reverseBlocked && res.p17.stockB === 9.2, JSON.stringify(res.p17))
    ok('P18: 資材は正しいが量だけ改ざん(-0.01)→期待量0.5と不一致で拒否', res.p18.errored && res.p18.stock === 18, JSON.stringify(res.p18))
    ok('P19: 複数資材の一部欠落→不足として拒否(記録も残らない)', res.p19.errored && res.p19.recGone && res.p19.stockA === 18, JSON.stringify(res.p19))
    ok('P20: 同一ID・異なる内容の再送→拒否(更新RPCへ誘導)', res.p20.errored, JSON.stringify(res.p20))
    ok('P22: 極小期待量に正数movement→負数チェックで拒否(在庫水増し不可)', res.p22.errored && res.p22.stock === 18, JSON.stringify(res.p22))
    ok('P23: 農薬IDあり+希釈0=数量計算不能→入力不正として拒否', res.p23.errored && res.p23.recGone, JSON.stringify(res.p23))
    ok('P24: 偽org_idはDB導出値で上書き保存(所属不整合行を作れない)', res.p24.ok && res.p24.orgFixed && res.p24.stock === 18, JSON.stringify(res.p24))
    ok('P21: 最終削除でA=18/B=10へ完全復帰＋QAデータ掃除完了', res.finalStocks.delOk && res.finalStocks.a === 18 && res.finalStocks.b === 10 && res.cleanup === true, JSON.stringify(res.finalStocks))
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
