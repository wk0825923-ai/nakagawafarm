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
  } finally {
    // 途中で例外終了してもテスト行を残さない（成功時は⑤で消えているので実質no-op）
    try {
      if (A && key) {
        await A.evaluate(async (k) => {
          const cur = await farmRepo.readAsync(k)
          if (cur && cur.ok && cur.found && cur.value.some(d => d.key === 'qa_live_test')) {
            await farmRepo.write(k, cur.value.filter(d => d.key !== 'qa_live_test'))
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
