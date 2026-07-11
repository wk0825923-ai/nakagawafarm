// qa_codex_fixes.js — Codexレビュー(025b68d)採用分の修正検証
// #01 ID型混在でもPHI/回数チェックが効く / #02 巨大レンジで固まらない
// #03 全角・波ダッシュ表記の正規化＋読めない畝は安全側で点検対象 / #08 チェック内部例外の可視化
const http = require('http'); const fs = require('fs'); const path = require('path')
const puppeteer = require('puppeteer-core')
const ROOT = path.resolve(__dirname, '..'); const PORT = 8143
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.json':'application/json' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  fs.readFile(path.join(ROOT, p), (err, data) => { if (err) { res.writeHead(404); res.end('404'); return } res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' }); res.end(data) })
})
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function run() {
  await new Promise(r => server.listen(PORT, r))
  const errors = []; const checks = []; let phase = 'boot'
  const ok = (name, cond, extra) => checks.push({ name, pass: !!cond, extra: extra || '' })
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage'], protocolTimeout: 240000 })
  const page = await browser.newPage()
  page.on('console', m => { if (m.type() === 'error') errors.push({ phase, msg: m.text().slice(0,240) }) })
  page.on('pageerror', e => errors.push({ phase, msg: 'PAGEERR:' + String(e.message||e).slice(0,200) }))
  page.on('dialog', async d => { try { await d.accept() } catch(e){} })

  await page.goto(`http://localhost:${PORT}/`, { waitUntil:'networkidle2', timeout:60000 })
  if (!(await page.evaluate(() => !!document.querySelector('.main')))) {
    await page.waitForSelector('input[type=email]', { timeout:30000 })
    await page.type('input[type=email]', 'demo@syatyo-suport.jp'); await page.type('input[type=password]', 'demo1234')
    await page.evaluate(() => { const b=[...document.querySelectorAll('button[type=submit]')].find(b=>/ログイン/.test(b.textContent)); if(b)b.click() })
    for(let i=0;i<40;i++){ if(await page.evaluate(()=>!!document.querySelector('.main')))break; await sleep(500) }
  }

  // ═══ #02/#03 parseRowRange: 正規化・不正値拒否・上限 ═══
  phase = 'rowrange'
  const rr = await page.evaluate(() => {
    const size = s => parseRowRange(s).size
    const t0 = performance.now()
    const capped = size('1-1000000000') // 修正前は10億回ループで固まる
    const ms = performance.now() - t0
    return {
      zenkaku: size('１－７'),        // 全角数字＋全角ダッシュ（実データの管理表表記）
      mixed:   size('15－22'),        // 半角数字＋全角ダッシュ
      wave:    size('1〜6'),          // 波ダッシュ
      zenComma:size('1，3，5'),       // 全角カンマ
      normal:  size('1-7'),
      garbage: size('abc'),
      reversed:size('6-1'),
      zero:    size('0'),
      decimal: size('1.5'),
      negative:size('-3'),
      capped, ms: Math.round(ms),
    }
  })
  ok('C1 全角表記を正規化して読める(１－７=7畝/15－22=8畝/1〜6=6畝/全角カンマ3)',
     rr.zenkaku===7 && rr.mixed===8 && rr.wave===6 && rr.zenComma===3 && rr.normal===7, JSON.stringify(rr))
  ok('C2 不正値は空(abc/6-1/0/1.5/-3)', rr.garbage===0 && rr.reversed===0 && rr.zero===0 && rr.decimal===0 && rr.negative===0)
  ok('C3 巨大レンジは上限1000で即返る', rr.capped===1000 && rr.ms < 500, 'size='+rr.capped+' '+rr.ms+'ms')

  // ═══ #01 ID型混在 / #03 安全側フォールバック / #08 例外可視化 — runFarmIntegrityChecksを直接検査 ═══
  phase = 'integrity'
  const integ = await page.evaluate(() => {
    const base = {
      fields: [{ id: 1, name: '第1圃場' }],
      pesticides: [{ id: 1, name: 'テスト剤', preharvest_days: 14, max_times: 2 }],
      farmLots: { 1: [{ id: 10, row_range: '1-6', variety: 'レタス', transplant_date: '2026-04-01' }] },
    }
    const titles = ctx => runFarmIntegrityChecks(Object.assign({}, base, ctx)).map(x => x.severity + ':' + x.title)
    // (a) ID型混在: 散布のpesticide_id/field_idが文字列でもPHI違反を検知できるか（収穫3日前に散布・PHI14日）
    const a = titles({
      lotSprayRecords: [{ id: 1, field_id: '1', date: '2026-06-18', row_range: '1-6', pesticides: [{ pesticide_id: '1' }] }],
      harvestRecords:  [{ id: 2, field_id: 1,   date: '2026-06-20', row_range: '1-6', total_cases: 10, variety: 'レタス' }],
    })
    // (b) 読めない畝表記: 散布側の畝が 'abc' でも「重なりなし」扱いで免除されないか
    const b = titles({
      lotSprayRecords: [{ id: 1, field_id: 1, date: '2026-06-18', row_range: 'abc', pesticides: [{ pesticide_id: 1 }] }],
      harvestRecords:  [{ id: 2, field_id: 1, date: '2026-06-20', row_range: '1-6', total_cases: 10, variety: 'レタス' }],
    })
    // (c) 修正前から正しかった免除（畝が本当に重ならない場合）は維持されているか
    const c = titles({
      lotSprayRecords: [{ id: 1, field_id: 1, date: '2026-06-18', row_range: '7-12', pesticides: [{ pesticide_id: 1 }] }],
      harvestRecords:  [{ id: 2, field_id: 1, date: '2026-06-20', row_range: '1-6', total_cases: 10, variety: 'レタス' }],
    })
    // (d) チェック内部で例外が起きたら「一部の点検が実行できませんでした」が出るか（null混入で誘発）
    const d = titles({ topDressingRecords: [null] })
    return {
      aPhi: a.some(t => /収穫前日数|PHI/.test(t)), b: b.some(t => /収穫前日数|PHI/.test(t)),
      c: c.some(t => /収穫前日数|PHI/.test(t)), d: d.some(t => /一部の点検が実行できませんでした/.test(t)),
      aAll: a.slice(0,4),
    }
  })
  ok('C4 ID型混在(文字列ID)でもPHI違反を検知', integ.aPhi, JSON.stringify(integ.aAll))
  ok('C5 読めない畝表記は安全側で点検対象(免除しない)', integ.b)
  ok('C6 畝が本当に重ならない場合の免除は維持', !integ.c)
  ok('C7 チェック内部例外は所見として可視化', integ.d)

  // ═══ #05 XSSペイロード入り圃場名でマップ描画してもスクリプトが動かない ═══
  phase = 'xss-map'
  const fid = await page.evaluate(() => (typeof CONFIG !== 'undefined' && CONFIG.CURRENT_FARM_ID) || null)
  await page.evaluate((fid) => {
    Object.keys(localStorage).filter(k=>k.startsWith('farm_')).forEach(k=>localStorage.removeItem(k))
    localStorage.setItem('farm_fields_v2_'+fid, JSON.stringify([
      { id:1, name:'<img src=x onerror="window.__xss=1">', crop:'"><svg onload=window.__xss=1>', area_are:60,
        color:'#0D9972', row_count:10, status:'栽培中', lat:35.40, lng:139.93 }]))
  }, fid)
  await page.reload({ waitUntil:'networkidle2' }); await sleep(1500)
  for (const head of ['営農データ', '管理・設定']) {
    await page.evaluate((head) => { const h=[...document.querySelectorAll('.sidebar *')].filter(e=>e.offsetParent&&e.textContent.trim()===head); const last=h[h.length-1]; if(last)last.click() }, head)
    await sleep(250)
  }
  const mapNavClicked = await page.evaluate(() => {
    // 圃場マップ/一覧はアイコンボタン（textContent無し・title属性のみ）
    const b=document.querySelector('button[title="圃場マップ"]') || document.querySelector('button[title="圃場一覧"]')
      || [...document.querySelectorAll('.nav-item,.sidebar button')].find(e=>e.offsetParent&&/圃場マップ|圃場一覧/.test(e.textContent.trim()))
    if(b){b.click();return b.title||b.textContent.trim()} return null
  })
  await sleep(2500)
  // マーカーのポップアップを開いてHTMLを実体化させる
  await page.evaluate(() => { try { document.querySelectorAll('.leaflet-interactive').forEach(el=>el.dispatchEvent(new MouseEvent('click',{bubbles:true}))) } catch(e){} })
  await sleep(1200)
  const xss = await page.evaluate(() => ({ fired: window.__xss === 1, mapOn: !!document.querySelector('.leaflet-container'),
    nameShown: /栽培中/.test((document.querySelector('.main')||document.body).innerText) }))
  ok('C8 圃場名のXSSペイロードが実行されない(マップ+ポップアップ)', xss.mapOn && !xss.fired, JSON.stringify(xss)+' nav='+mapNavClicked)

  const summary = { checks, pass:checks.filter(c=>c.pass).length, total:checks.length,
    failed:checks.filter(c=>!c.pass), errorCount:errors.length, errors:errors.slice(0,20) }
  console.log('QACODEX_BEGIN'); console.log(JSON.stringify(summary,null,1)); console.log('QACODEX_END')
  await browser.close(); server.close()
}
run().catch(e => { console.log('THREW:'+e.message+'\n'+(e.stack||'').split('\n').slice(0,4).join('\n')); process.exit(1) })
