// qa_bell_allkinds.js — #1修正の検証: 通知ベル「本日の作業記録」が
// 農薬散布/施肥/収穫も横断して数える＆表示する。＋日報のみスタッフ視点の一連。
const http = require('http'); const fs = require('fs'); const path = require('path')
const puppeteer = require('puppeteer-core')
const ROOT = path.resolve(__dirname, '..'); const PORT = 8137
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.json':'application/json' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = path.join(ROOT, p)
  fs.readFile(fp, (err, data) => { if (err) { res.writeHead(404); res.end('404'); return } res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' }); res.end(data) })
})
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function clickByText(page, text) {
  return page.evaluate((text) => {
    const vis = e => e.offsetParent !== null
    const clickable = [...document.querySelectorAll('button, a, [role=button]')].filter(vis)
    let t = clickable.find(e => e.textContent.trim() === text) || clickable.find(e => e.textContent.trim().includes(text) && e.textContent.trim().length < text.length + 20)
    if (!t) { const all = [...document.querySelectorAll('div, span, li')].filter(vis); t = all.find(e => e.textContent.trim() === text) || all.find(e => e.textContent.trim().includes(text) && e.textContent.trim().length < text.length + 16) }
    if (t) { t.click(); return true } return false
  }, text)
}

async function run() {
  await new Promise(r => server.listen(PORT, r))
  const errors = []; const checks = []
  const ok = (name, cond, extra) => checks.push({ name, pass: !!cond, extra: extra || '' })
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage'] })
  const page = await browser.newPage()
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0,240)) })
  page.on('pageerror', e => errors.push('PAGEERR:' + String(e.message||e).slice(0,200)))

  await page.goto(`http://localhost:${PORT}/`, { waitUntil:'networkidle2', timeout:60000 })
  if (!(await page.evaluate(() => !!document.querySelector('.main')))) {
    await page.waitForSelector('input[type=email]', { timeout:30000 })
    await page.type('input[type=email]', 'demo@syatyo-suport.jp'); await page.type('input[type=password]', 'demo1234')
    await page.evaluate(() => { const b=[...document.querySelectorAll('button[type=submit]')].find(b=>/ログイン/.test(b.textContent)); if(b)b.click() })
    let st='wait'; for(let i=0;i<40;i++){ st=await page.evaluate(()=>document.querySelector('.main')?'ready':'wait'); if(st!=='wait')break; await sleep(500) }
    if (st!=='ready'){ console.log(JSON.stringify({fatal:'login',errors})); await browser.close(); server.close(); return }
  }
  // farmId 取得
  await page.evaluate(() => { Object.keys(localStorage).filter(k=>k.startsWith('farm_')).forEach(k=>localStorage.removeItem(k)) })
  await page.reload({ waitUntil:'networkidle2' }); await sleep(1000)
  await clickByText(page,'収穫予測'); await sleep(500); await clickByText(page,'編集する'); await sleep(250); await clickByText(page,'気温を保存'); await sleep(400)
  let farmId = await page.evaluate(() => { const k=Object.keys(localStorage).find(k=>k.startsWith('farm_monthly_temps_')); return k?k.replace('farm_monthly_temps_',''):null })
  if (!farmId) { console.log(JSON.stringify({fatal:'farmId',errors})); await browser.close(); server.close(); return }

  // 今日の日付で 基本日報1 / 農薬散布1 / 施肥1 / 収穫1 をseed（過去の記録も混ぜる）
  const seed = await page.evaluate((fid) => {
    const set=(k,v)=>localStorage.setItem(k+'_'+fid,JSON.stringify(v))
    const pad=n=>String(n).padStart(2,'0'); const d=new Date()
    const today=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())
    const fields=[{id:1,name:'第1圃場',field_no:'1',crop:'レタス',area_are:15,color:'#0D9972',row_count:12,crop_category:'leaf_veg'},
                  {id:2,name:'第2圃場',field_no:'2',crop:'レタス',area_are:12,color:'#EA580C',row_count:8,crop_category:'leaf_veg'}]
    set('farm_fields_v2',fields)
    set('farm_lots',{1:[{id:1001,row_range:'1-6',variety:'シスコ',transplant_date:'2026-05-01',status:'growing'}],2:[{id:1002,row_range:'1-4',variety:'ラプトル',transplant_date:'2026-05-10',status:'growing'}]})
    // 基本日報: 今日=除草1件 / 過去1件
    set('farm_records',[
      {id:100001,date:today,field_id:1,work_type:'除草',weather:'晴',worker:'今福',note:'今日の除草'},
      {id:100002,date:'2026-06-01',field_id:1,work_type:'定植',weather:'晴',worker:'今福',note:'過去'},
    ])
    // 農薬散布: 今日1件（ここがベルに出るべき本命）
    set('farm_lot_spray_records',[
      {id:5001,field_id:1,date:today,weather:'晴',row_range:'1-6',pesticides:[{pesticide_id:1,dilution:1000,disposal_amount:0}],spray_volume_L:100,note:'今日の防除'},
      {id:5002,field_id:2,date:'2026-06-20',weather:'曇',row_range:'1-4',pesticides:[{pesticide_id:1,dilution:1000}],spray_volume_L:80},
    ])
    // 施肥: 今日1件
    set('farm_top_dressing_records',[
      {id:6001,field_id:2,date:today,fertilizing_type:'追肥',item:'レタス',row_range:'1-4',row_count:4,fertilizers:[{fertilizer_id:1,amount_kg:20}]},
    ])
    // 収穫: 今日1件
    set('farm_harvest_records',[
      {id:7001,field_id:1,date:today,variety:'シスコ',row_range:'1-6',lot_code:'L1',shipments:[{dest:'JA',grade:'規格内',unit_type:'count_pcs',cases:42}],total_cases:42,note:'今日の収穫'},
    ])
    return { today, dailyToday:1, sprayToday:1, fertToday:1, harvestToday:1, expectedBadge:4 }
  }, farmId)

  await page.reload({ waitUntil:'networkidle2' }); await sleep(1200)

  // ── 管理者ダッシュボード: 通知ベルのバッジ ──
  await clickByText(page,'総合ダッシュボード'); await sleep(800)
  const badge = await page.evaluate(() => {
    const bell = [...document.querySelectorAll('button[title="最近の作業記録"]')][0]
    if (!bell) return { found:false }
    const span = bell.querySelector('span')
    return { found:true, badge: span ? span.textContent.trim() : '(none)' }
  })
  ok('ベルのバッジが表示される', badge.found, JSON.stringify(badge))
  ok('バッジ=4（基本日報1+農薬1+施肥1+収穫1）', badge.badge === '4', 'actual='+badge.badge)

  // ポップアップを開いて中身確認
  await page.evaluate(() => { const b=[...document.querySelectorAll('button[title="最近の作業記録"]')][0]; if(b)b.click() })
  await sleep(500)
  const popup = await page.evaluate(() => {
    // ポップアップ内テキスト（本日の作業記録）
    const wrap = [...document.querySelectorAll('div')].find(d => /本日の作業記録/.test(d.textContent) && d.querySelector('i.ti-clipboard-text'))
    const txt = document.body.innerText
    return {
      hasSpray: /農薬散布/.test(txt) && /本日の作業記録/.test(txt),
      hasHarvest: /収穫/.test(txt),
      hasFert: /施肥/.test(txt),
      notEmpty: !/本日の作業記録はまだありません/.test(txt),
    }
  })
  ok('ポップアップに農薬散布が出る', popup.hasSpray, JSON.stringify(popup))
  ok('ポップアップに施肥が出る', popup.hasFert)
  ok('ポップアップに収穫が出る', popup.hasHarvest)
  ok('「まだありません」ではない', popup.notEmpty)

  // リッチ記録（農薬散布行）タップ → 圃場詳細へ遷移
  const nav = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('div')].filter(d => /農薬散布 — 第1圃場/.test(d.textContent) && d.textContent.length < 60)
    const row = rows[rows.length-1]
    if (!row) return { clicked:false }
    row.click(); return { clicked:true }
  })
  await sleep(700)
  const afterNav = await page.evaluate(() => ({ url: location.hash, main: (document.querySelector('.main')||{}).innerText ? document.querySelector('.main').innerText.slice(0,40).replace(/\n/g,' ') : '' }))
  ok('農薬散布行タップで圃場詳細へ遷移', /第1圃場/.test(afterNav.main), JSON.stringify(afterNav))

  // ── 日報のみスタッフ視点: スタッフ画面の「今日 N件」 ──
  await page.evaluate(() => { location.href = location.pathname + '?view=staff' })
  await sleep(1600)
  const staff = await page.evaluate(() => {
    const txt = document.body.innerText
    const m = txt.match(/今日\s*(\d+)\s*件/)
    return { badge: m ? Number(m[1]) : null, isStaff: /スタッフ入力/.test(txt) }
  })
  ok('スタッフ画面が開く', staff.isStaff, JSON.stringify(staff))
  ok('スタッフ「今日 N件」=4（4種横断で一致）', staff.badge === 4, 'actual='+staff.badge)

  // スタッフ画面で新しい日報（除草）を今日入力 → 5件になるか
  const staffAdd = await page.evaluate(() => {
    // RecordForm step1: 圃場チップ選択
    const chips = [...document.querySelectorAll('button, [role=button], div')].filter(e => e.offsetParent && /第1圃場/.test(e.textContent) && e.textContent.trim().length < 30)
    if (chips[0]) chips[0].click()
    return { ok:true }
  })
  await sleep(500)

  const summary = {
    farmId, seed, badge, popup, afterNav, staff,
    pass: checks.filter(c=>c.pass).length, total: checks.length,
    failed: checks.filter(c=>!c.pass),
    errors: errors.slice(0,20),
  }
  console.log(JSON.stringify(summary, null, 2))
  await browser.close(); server.close()
}
run().catch(e => { console.log('THREW:'+e.message); process.exit(1) })
