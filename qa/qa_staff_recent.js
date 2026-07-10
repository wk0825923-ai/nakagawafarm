// qa_staff_recent.js — #B検証: スタッフ画面「直近の記録（昨日〜3日前）」
// 既定は閉じる / 開くと過去(1〜3日前)が読み取り表示 / 3日超は除外 / 今日ぶんは従来通り4種。
const http = require('http'); const fs = require('fs'); const path = require('path')
const puppeteer = require('puppeteer-core')
const ROOT = path.resolve(__dirname, '..'); const PORT = 8138
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
  await page.evaluate(() => { Object.keys(localStorage).filter(k=>k.startsWith('farm_')).forEach(k=>localStorage.removeItem(k)) })
  await page.reload({ waitUntil:'networkidle2' }); await sleep(1000)
  await clickByText(page,'収穫予測'); await sleep(500); await clickByText(page,'編集する'); await sleep(250); await clickByText(page,'気温を保存'); await sleep(400)
  const farmId = await page.evaluate(() => { const k=Object.keys(localStorage).find(k=>k.startsWith('farm_monthly_temps_')); return k?k.replace('farm_monthly_temps_',''):null })
  if (!farmId) { console.log(JSON.stringify({fatal:'farmId',errors})); await browser.close(); server.close(); return }

  const seed = await page.evaluate((fid) => {
    const set=(k,v)=>localStorage.setItem(k+'_'+fid,JSON.stringify(v))
    const pad=n=>String(n).padStart(2,'0')
    const ymd=(off)=>{ const d=new Date(); d.setDate(d.getDate()+off); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()) }
    const today=ymd(0), y1=ymd(-1), y2=ymd(-2), y5=ymd(-5)
    set('farm_fields_v2',[{id:1,name:'第1圃場',field_no:'1',crop:'レタス',area_are:15,color:'#0D9972',row_count:12,crop_category:'leaf_veg'},
                         {id:2,name:'第2圃場',field_no:'2',crop:'レタス',area_are:12,color:'#EA580C',row_count:8,crop_category:'leaf_veg'}])
    set('farm_lots',{1:[{id:1001,row_range:'1-6',variety:'シスコ',status:'growing'}],2:[{id:1002,row_range:'1-4',variety:'ラプトル',status:'growing'}]})
    // 基本日報: 今日1 / 2日前1 / 5日前1(=除外されるべき)
    set('farm_records',[
      {id:100001,date:today,field_id:1,work_type:'除草',weather:'晴',worker:'佐藤',note:'今日'},
      {id:100002,date:y2,field_id:1,work_type:'点検',weather:'晴',worker:'佐藤',note:'2日前'},
      {id:100003,date:y5,field_id:1,work_type:'灌水',weather:'晴',worker:'佐藤',note:'5日前(除外)'},
    ])
    // 農薬散布: 今日1 / 昨日1
    set('farm_lot_spray_records',[
      {id:5001,field_id:1,date:today,weather:'晴',row_range:'1-6',pesticides:[{pesticide_id:1,dilution:1000}],spray_volume_L:100,note:'今日'},
      {id:5002,field_id:2,date:y1,weather:'曇',row_range:'1-4',pesticides:[{pesticide_id:1,dilution:1000}],spray_volume_L:80,note:'昨日'},
    ])
    // 施肥: 今日1
    set('farm_top_dressing_records',[{id:6001,field_id:2,date:today,fertilizing_type:'追肥',item:'レタス',row_range:'1-4',row_count:4,fertilizers:[{fertilizer_id:1,amount_kg:20}]}])
    // 収穫: 今日1
    set('farm_harvest_records',[{id:7001,field_id:1,date:today,variety:'シスコ',row_range:'1-6',lot_code:'L1',shipments:[{dest:'JA',grade:'規格内',unit_type:'count_pcs',cases:42}],total_cases:42}])
    return { today, y1, y2, y5, expectTodayItems:4, expectRecent:2 } // recent=昨日spray + 2日前点検（5日前は除外）
  }, farmId)

  await page.evaluate(() => { location.href = location.pathname + '?view=staff' })
  await sleep(1700)

  const before = await page.evaluate(() => {
    const txt = document.body.innerText
    return {
      isStaff: /スタッフ入力/.test(txt),
      todayN: (txt.match(/今日\s*(\d+)\s*件/)||[])[1] || null,
      hasRecentToggle: /直近の記録（昨日〜3日前）/.test(txt),
      recentToggleCount: (txt.match(/直近の記録（昨日〜3日前）[\s\S]{0,40}?(\d+)件/)||[])[1] || null,
      // 既定は閉じているので「確認のみ」は出ていないはず
      confirmOnlyVisible: [...document.querySelectorAll('span')].some(s => s.offsetParent && s.textContent.trim()==='確認のみ'),
    }
  })
  ok('スタッフ画面が開く', before.isStaff)
  ok('今日ぶん=4件（従来通り4種）', before.todayN === '4', 'actual='+before.todayN)
  ok('「直近の記録」トグルが出る', before.hasRecentToggle)
  ok('トグルの件数=2（昨日spray＋2日前点検・5日前は除外）', before.recentToggleCount === '2', 'actual='+before.recentToggleCount)
  ok('既定は閉じている（過去行が非表示）', before.confirmOnlyVisible === false)

  // トグルを開く
  await clickByText(page, '直近の記録（昨日〜3日前）')
  await sleep(500)
  const after = await page.evaluate(() => {
    const txt = document.body.innerText
    const rows = [...document.querySelectorAll('span')].filter(s => s.offsetParent && s.textContent.trim()==='確認のみ').length
    return {
      confirmRows: rows,
      hasSprayPast: /農薬散布/.test(txt),
      hasCheck: /点検/.test(txt),           // 2日前の基本日報
      excluded5d: !/5日前/.test(txt),        // note本文は出ないので常にtrue（保険）
      noKansui: !/灌水/.test(txt),           // 5日前(灌水)は除外されているべき
    }
  })
  ok('開くと過去行が2件表示（確認のみ×2）', after.confirmRows === 2, 'rows='+after.confirmRows)
  ok('過去に「点検」(2日前・基本日報)が出る', after.hasCheck)
  ok('5日前の「灌水」は除外されている', after.noKansui)

  const summary = { farmId, seed, before, after,
    pass: checks.filter(c=>c.pass).length, total: checks.length,
    failed: checks.filter(c=>!c.pass), errors: errors.slice(0,15) }
  console.log(JSON.stringify(summary, null, 2))
  await browser.close(); server.close()
}
run().catch(e => { console.log('THREW:'+e.message); process.exit(1) })
