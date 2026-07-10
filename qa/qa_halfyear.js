// qa_halfyear.js — 半年間使用テスト（スタッフ＋管理者）
// レタス作付け半年（2026-01-15〜今日）を12圃場で運用したデータを積み、
// スタッフの毎日入力動線と管理者の全ページ・計算・GAP・帳票・整合性を検査する。
// フルスタック引継ぎ範囲（端末またぎDB連動）は対象外。
const http = require('http'); const fs = require('fs'); const path = require('path')
const puppeteer = require('puppeteer-core')
const ROOT = path.resolve(__dirname, '..'); const PORT = 8139
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
// ナビ項目をクリック（無ければセクション見出しを開いてから再試行。トグルで閉じないよう存在確認してから開く）
async function navClick(page, label) {
  const tryClick = () => page.evaluate((label) => {
    const btn = [...document.querySelectorAll('.nav-item, .sidebar button')].find(e => e.offsetParent && e.textContent.trim() === label)
    if (btn) { btn.click(); return true } return false
  }, label)
  if (await tryClick()) return true
  // 閉じているセクションを開く（見出しをクリック）→再試行
  for (const head of ['営農データ', '管理・設定']) {
    await page.evaluate((head) => {
      const h = [...document.querySelectorAll('.sidebar *')].filter(e => e.offsetParent && e.textContent.trim() === head)
      const last = h[h.length - 1]; if (last) last.click()
    }, head)
    await new Promise(r => setTimeout(r, 250))
    if (await tryClick()) return true
  }
  return false
}
async function scanPage(page) {
  return page.evaluate(() => {
    const m = document.querySelector('main.main') || document.querySelector('.main')
    if (!m) return { hasMain:false, len:0, bad:'' }
    const t = m.innerText
    const bad = []
    if (/undefined/.test(t)) bad.push('undefined')
    if (/\bNaN\b/.test(t)) bad.push('NaN')
    if (/\[object Object\]/.test(t)) bad.push('[object Object]')
    return { hasMain:true, len:t.length, bad: bad.join(','), head: t.slice(0,50).replace(/\n/g,' ') }
  })
}

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
    let st='wait'; for(let i=0;i<40;i++){ st=await page.evaluate(()=>document.querySelector('.main')?'ready':'wait'); if(st!=='wait')break; await sleep(500) }
    if (st!=='ready'){ console.log(JSON.stringify({fatal:'login',errors})); await browser.close(); server.close(); return }
  }
  await page.evaluate(() => { Object.keys(localStorage).filter(k=>k.startsWith('farm_')).forEach(k=>localStorage.removeItem(k)) })
  await page.reload({ waitUntil:'networkidle2' }); await sleep(1000)
  await clickByText(page,'収穫予測'); await sleep(500); await clickByText(page,'編集する'); await sleep(250); await clickByText(page,'気温を保存'); await sleep(400)
  const farmId = await page.evaluate(() => { const k=Object.keys(localStorage).find(k=>k.startsWith('farm_monthly_temps_')); return k?k.replace('farm_monthly_temps_',''):null })
  if (!farmId) { console.log(JSON.stringify({fatal:'farmId',errors})); await browser.close(); server.close(); return }

  // ═══ 半年ぶんのレタス運用データを積む（整合性チェックで偽陽性が出ない"きれいな運用"） ═══
  phase = 'seed'
  const seed = await page.evaluate((fid) => {
    const set=(k,v)=>localStorage.setItem(k+'_'+fid,JSON.stringify(v))
    const pad=n=>String(n).padStart(2,'0')
    const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())
    const addD=(s,n)=>{ const d=new Date(s+'T00:00:00'); d.setDate(d.getDate()+n); return ymd(d) }
    const today=ymd(new Date())
    const COLORS=['#0D9972','#2563EB','#EA580C','#7C3AED','#B45309','#DC2626','#0891B2','#65A30D']
    // 12圃場（レタス・畝12本・住所/エリア/eMAFF付き=GAP自動達成も効く）
    const fields=[]; for(let i=1;i<=12;i++) fields.push({ id:i, name:'第'+i+'圃場', field_no:String(i), crop:'レタス',
      area_are:10+(i%4)*5, color:COLORS[i%8], row_count:12, crop_category:'leaf_veg',
      area_name:'上望陀', address:'千葉県木更津市上望陀'+i+'-1', emaff_no:String(1000000000000+i), gap_target:true,
      lat:35.40+i*0.001, lng:139.93+i*0.001, status:'栽培中' })
    set('farm_fields_v2',fields)
    // マスタ: 農薬2種(PHI7日/年5回・PHI14日/年3回)・肥料2種(単価あり)・購入は使用量を上回る
    set('farm_pesticides',[
      { id:1, name:'テスト殺菌剤A', reg_no:'第10001号', dilution:1000, preharvest_days:7,  max_times:5, target_crop:'レタス' },
      { id:2, name:'テスト殺虫剤B', reg_no:'第10002号', dilution:2000, preharvest_days:14, max_times:3, target_crop:'レタス' },
    ])
    set('farm_pesticide_purchases',[
      { id:1, pesticide_id:1, date:'2026-01-10', amount_L:20, price_yen:40000 },
      { id:2, pesticide_id:2, date:'2026-01-10', amount_L:10, price_yen:30000 },
    ])
    set('farm_fertilizers',[
      { id:1, name:'テスト化成811', unit_price_yen_per_kg:120, weight_per_bag_kg:20 },
      { id:2, name:'テスト有機ペレット', unit_price_yen_per_kg:80, weight_per_bag_kg:15 },
    ])
    set('farm_fertilizer_purchases',[{ id:1, fertilizer_id:1, date:'2026-01-10', amount_kg:2000, price_yen:240000 },{ id:2, fertilizer_id:2, date:'2026-01-10', amount_kg:1500, price_yen:120000 }])
    set('farm_staff',[
      { id:1, name:'中川', role:'manager', nationality:'日本' },
      { id:2, name:'今福', role:'worker', nationality:'日本' },
      { id:3, name:'佐藤', role:'worker', nationality:'日本' },
      { id:4, name:'グエン', role:'trainee', nationality:'ベトナム', visa_expiry:'2027-03-31' },
    ])
    // ロット: 各圃場2作（春レタス1-6畝: 2/1定植→5月収穫、初夏レタス7-12畝: 4/1定植→6-7月収穫）
    const lots={}; let lid=1000
    fields.forEach(f=>{ lots[f.id]=[
      { id:++lid, row_range:'1-6',  variety:'シスコ',   seed_date:'2026-01-05', transplant_date:'2026-02-01', seedling_period_days:27, status:'harvested' },
      { id:++lid, row_range:'7-12', variety:'ラプトル', seed_date:'2026-03-05', transplant_date:'2026-04-01', seedling_period_days:27, status:'growing' },
    ]})
    set('farm_lots',lots)
    // 基本日報: 1/15〜今日まで2日おき（除草/点検/灌水ローテ・作業者ローテ・天気ローテ）約88日ぶん
    const WORKS=['除草','点検','灌水']; const WEATHERS=['晴','曇','晴','雨','晴']; const WORKERS=['今福','佐藤','グエン']
    const records=[]; let rid=100000
    for(let d='2026-01-15', i=0; d<today; d=addD(d,2), i++){
      records.push({ id:++rid, date:d, field_id:(i%12)+1, work_type:WORKS[i%3], weather:WEATHERS[i%5], worker:WORKERS[i%3], note:'', photos:[] })
    }
    // 定植日報（2作ぶん・全圃場）
    fields.forEach(f=>{ records.push({ id:++rid, date:'2026-02-01', field_id:f.id, work_type:'播種/定植', weather:'晴', worker:'今福', variety:'シスコ', note:'春作定植' })
                        records.push({ id:++rid, date:'2026-04-01', field_id:f.id, work_type:'播種/定植', weather:'晴', worker:'今福', variety:'ラプトル', note:'初夏作定植' }) })
    set('farm_records',records)
    // 農薬散布: 各圃場 春作にA2回+B1回(2-3月)、初夏作にA2回+B1回(4-5月) = 年A4回(≤5)/B2回(≤3)。
    // PHI: 春作最終散布3/20→収穫5/10(50日>14日OK)、初夏作最終5/15→収穫6/20(36日OK)
    const sprays=[]; let sid=500000
    fields.forEach((f,fi)=>{
      const off=fi%5 // 圃場ごとに日をずらす（同日重複を避ける）
      ;[['2026-02-15',1,'1-6'],['2026-03-05',1,'1-6'],['2026-03-20',2,'1-6'],
        ['2026-04-20',1,'7-12'],['2026-05-05',1,'7-12'],['2026-05-15',2,'7-12']].forEach(([base,pid,rows],si)=>{
        sprays.push({ id:++sid, field_id:f.id, date:addD(base,off), weather:'晴', row_range:rows,
          pesticides:[{ pesticide_id:pid, dilution:pid===1?1000:2000, disposal_amount:0 }],
          spray_volume_L:100, staff_ids:[2], note:'' })
      })
    })
    set('farm_lot_spray_records',sprays)
    // 施肥: 各圃場 元肥2回（1月・3月）
    const ferts=[]; let tid=600000
    fields.forEach((f,fi)=>{
      ferts.push({ id:++tid, field_id:f.id, date:addD('2026-01-20',fi%4), fertilizing_type:'元肥', item:'レタス', row_range:'1-6',  row_count:6, fertilizers:[{fertilizer_id:1, dilution:null, amount_kg:40}], spray_volume_L:null, note:'' })
      ferts.push({ id:++tid, field_id:f.id, date:addD('2026-03-15',fi%4), fertilizing_type:'元肥', item:'レタス', row_range:'7-12', row_count:6, fertilizers:[{fertilizer_id:2, dilution:null, amount_kg:30}], spray_volume_L:null, note:'' })
    })
    set('farm_top_dressing_records',ferts)
    // 収穫: 春作5/10前後（全12圃場・シスコ）＋初夏作6/20前後（ラプトル）。計24件
    const harvs=[]; let hid=700000; let totalCases=0
    fields.forEach((f,fi)=>{
      const c1=40+fi, c2=35+fi; totalCases+=c1+c2
      harvs.push({ id:++hid, field_id:f.id, date:addD('2026-05-10',fi%6), variety:'シスコ',   row_range:'1-6',  lot_code:'S'+f.id, shipments:[{dest:'JA木更津',grade:'規格内',unit_type:'count_pcs',cases:c1}], total_cases:c1, worker:'佐藤', note:'' })
      harvs.push({ id:++hid, field_id:f.id, date:addD('2026-06-20',fi%6), variety:'ラプトル', row_range:'7-12', lot_code:'E'+f.id, shipments:[{dest:'JA木更津',grade:'規格内',unit_type:'count_pcs',cases:c2}], total_cases:c2, worker:'佐藤', note:'' })
    })
    set('farm_harvest_records',harvs)
    // 出荷: 品種別に収穫の8割を出荷（ストック残プラス維持）
    const sumBy=v=>harvs.filter(h=>h.variety===v).reduce((a,h)=>a+h.total_cases,0)
    const ship=[]; let pid2=800000
    ;[['シスコ','2026-05-20'],['ラプトル','2026-06-28']].forEach(([v,d])=>{
      ship.push({ id:++pid2, date:d, variety:v, dest:'JA木更津', cases:Math.floor(sumBy(v)*0.8), note:'' })
    })
    set('farm_shipment_records',ship)
    // 機械整備: 直近60日以内あり（アラート出ない状態）
    set('farm_maintenance_records',[{ id:1, date:addD(today,-20), machine:'トラクタ1号', machine_no:'T-01', kind:'点検', result:'良好', worker:'中川', note:'' }])
    return { today, fields:fields.length, records:records.length, sprays:sprays.length, ferts:ferts.length, harvs:harvs.length, totalCases, shipped: ship.reduce((a,s)=>a+s.cases,0) }
  }, farmId)
  await page.reload({ waitUntil:'networkidle2' }); await sleep(1500)

  // ═══ ① スタッフの毎日: 実フォームで今日の日報を入力 ═══
  phase = 'staff'
  // ログイン時の名前記憶(sb_name)を再現（作業者名の既定に入る＝実運用と同じ）
  await page.evaluate(() => { localStorage.setItem('sb_name','佐藤'); localStorage.setItem('sb_role','staff') })
  await page.evaluate(() => { location.href = location.pathname + '?view=staff' })
  await sleep(1800)
  const staffBefore = await page.evaluate(() => {
    const txt = document.body.innerText
    return { isStaff:/スタッフ入力/.test(txt), todayN: Number((txt.match(/今日\s*(\d+)\s*件/)||[])[1] ?? -1),
      hasRecent:/直近の記録（昨日〜3日前）/.test(txt) }
  })
  ok('S1 スタッフ画面が開く', staffBefore.isStaff)
  ok('S2 直近の記録トグルがある', staffBefore.hasRecent)
  // 実フォーム入力: 既定選択をクリア→圃場チップ(第3圃場)→次へ→除草→次へ→確認→保存(「✓ 保存する」)
  await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(e=>e.offsetParent&&e.textContent.trim()==='クリア'); if(b)b.click() })
  await sleep(250)
  await page.evaluate(() => { const c=[...document.querySelectorAll('button')].filter(e=>e.offsetParent&&/第3圃場/.test(e.textContent)&&e.textContent.trim().length<20); if(c[0])c[0].click() })
  await sleep(300); await clickByText(page,'次へ →'); await sleep(400)
  await page.evaluate(() => { const c=[...document.querySelectorAll('button')].filter(e=>e.offsetParent&&/除草/.test(e.textContent.trim())&&e.textContent.trim().length<6); if(c[0])c[0].click() })
  await sleep(300); await clickByText(page,'次へ →'); await sleep(400)
  await clickByText(page,'確認 →'); await sleep(400)
  await clickByText(page,'保存する'); await sleep(1400)
  const staffAfter = await page.evaluate(() => {
    const txt = document.body.innerText
    return { todayN: Number((txt.match(/今日\s*(\d+)\s*件/)||[])[1] ?? -1), hasFix:/なおす/.test(txt) }
  })
  ok('S3 日報保存で「今日N件」が+1', staffAfter.todayN === staffBefore.todayN + 1, staffBefore.todayN+'→'+staffAfter.todayN)
  ok('S4 保存した記録に「なおす」導線', staffAfter.hasFix)
  // 直近の記録を開く（過去2日ぶんの基本日報が見えるはず）
  await clickByText(page,'直近の記録（昨日〜3日前）'); await sleep(500)
  const staffRecent = await page.evaluate(() => ({ rows: [...document.querySelectorAll('span')].filter(s=>s.offsetParent&&s.textContent.trim()==='確認のみ').length }))
  ok('S5 直近の記録が開き過去が確認できる', staffRecent.rows > 0, 'rows='+staffRecent.rows)

  // ═══ ② 管理者の毎朝: ダッシュボード・ベル・整合性 ═══
  phase = 'admin-dashboard'
  // 役割記憶(sb_role=staff)を管理者に戻してから経営者画面へ（実運用の「経営者画面へ」ボタン相当）
  await page.evaluate(() => { localStorage.setItem('sb_role','admin') })
  await page.evaluate(() => { location.href = location.pathname })
  await sleep(1800)
  await clickByText(page,'総合ダッシュボード'); await sleep(900)
  const dash = await page.evaluate(() => {
    const txt = (document.querySelector('.main')||document.body).innerText
    const bell = document.querySelector('button[title="最近の作業記録"]')
    const badge = bell && bell.querySelector('span') ? bell.querySelector('span').textContent.trim() : null
    return { badge, hasIntegrityAlert:/整合性チェックを開く/.test(txt), hasMaintAlert:/整備記録がありません|要対応/.test(txt),
      bad: (/undefined|\bNaN\b/.test(txt) ? 'bad-token' : '') }
  })
  ok('A1 ベルにスタッフ入力ぶんのバッジ(=1)', dash.badge === '1', 'badge='+dash.badge)
  ok('A2 きれいな運用で整合性アラートが出ない（偽陽性なし）', !dash.hasIntegrityAlert)
  ok('A3 整備アラートが出ない（直近整備あり）', !dash.hasMaintAlert)
  ok('A4 ダッシュボードにundefined/NaNなし', !dash.bad)

  // 整合性チェックページ: findings 0（要対応0・要確認0）— 偽陽性が出たらタイトルも出す
  await navClick(page,'整合性チェック'); await sleep(900)
  const integ = await page.evaluate((fid) => {
    const txt = (document.querySelector('.main')||document.body).innerText
    const m = txt.match(/要対応[\s\S]{0,12}?(\d+)/); const m2 = txt.match(/要確認[\s\S]{0,12}?(\d+)/)
    let titles = []
    try {
      const ls = k => { const v = localStorage.getItem(k + '_' + fid); return v ? JSON.parse(v) : [] }
      const f = runFarmIntegrityChecks({
        records: ls('farm_records'), lotSprayRecords: ls('farm_lot_spray_records'),
        topDressingRecords: ls('farm_top_dressing_records'), harvestRecords: ls('farm_harvest_records'),
        shipmentRecords: ls('farm_shipment_records'), farmLots: (()=>{ const v=localStorage.getItem('farm_lots_'+fid); return v?JSON.parse(v):{} })(),
        fields: ls('farm_fields_v2'), pesticides: ls('farm_pesticides'), pesticidePurchases: ls('farm_pesticide_purchases'),
      })
      titles = f.map(x => x.severity + ':' + x.title)
    } catch (e) { titles = ['ERR:' + e.message] }
    return { high: m?Number(m[1]):null, mid: m2?Number(m2[1]):null, titles: titles.slice(0,8), count: titles.length }
  }, farmId)
  ok('A5 半年の記録で突合せ偽陽性ゼロ', integ.count === 0, JSON.stringify(integ))

  // ═══ ③ 全ページ巡回（白画面・エラー・壊れ表示・描画時間） ═══
  phase = 'sweep'
  const NAV = ['日報入力','日報管理','圃場まとめ','収穫予測','出荷記録','作付計画 / 経営予測','GAP帳票出力','GAPチェックリスト','必要書類・文書台帳','整合性チェック','マスタ管理','スタッフ管理','技能実習生 作業日誌','多言語マニュアル','機器予約','機械整備記録','収益シミュレーター','設定']
  const sweep = []
  for (const nav of NAV) {
    const clicked = await navClick(page, nav)
    const t0 = Date.now(); await sleep(700)
    const s = await scanPage(page)
    sweep.push({ nav, clicked, ms: Date.now()-t0, ...s })
  }
  const badPages = sweep.filter(s => !s.hasMain || s.len < 30 || s.bad)
  ok('A6 全18ページ白画面ゼロ・壊れ表示ゼロ', badPages.length === 0, JSON.stringify(badPages.map(b=>b.nav)))

  // 圃場一覧→圃場詳細→タブ
  phase = 'field-detail'
  await page.evaluate(() => { const b=document.querySelector('button[title="圃場一覧"]'); if(b)b.click() })
  await sleep(700)
  await page.evaluate(() => { const c=[...document.querySelectorAll('button,a,div')].filter(e=>e.offsetParent&&/^第5圃場/.test(e.textContent.trim())&&e.textContent.trim().length<24); if(c[0])c[0].click() })
  await sleep(900)
  const fd = await scanPage(page)
  ok('A7 圃場詳細が開く', fd.hasMain && /第5圃場|圃場別管理/.test(fd.head||''), fd.head)
  for (const tab of ['作付け履歴','日報入力','農薬散布','収穫・出荷','実績評価']) { await clickByText(page, tab); await sleep(450) }
  const fdTabs = await scanPage(page)
  ok('A8 圃場詳細の全タブ巡回OK', fdTabs.hasMain && !fdTabs.bad, fdTabs.bad)

  // ═══ ④ 計算の整合: 収穫合計・ストック残 ═══
  phase = 'calc'
  await navClick(page,'圃場まとめ'); await sleep(1100)
  const summaryTxt = await page.evaluate(() => (document.querySelector('.main')||document.body).innerText)
  const expectedTotal = seed.totalCases
  const hasTotal = new RegExp(String(expectedTotal).replace(/(\d)(?=(\d{3})+$)/g,'$1,?')).test(summaryTxt) || summaryTxt.includes(String(expectedTotal))
  ok('C1 圃場まとめの収穫ケース計=' + expectedTotal, hasTotal, '合計出現=' + hasTotal)
  await navClick(page,'出荷記録'); await sleep(800)
  const shipTxt = await page.evaluate(() => (document.querySelector('.main')||document.body).innerText)
  // ストック残は品種別に表示される: シスコ=546-436=110 / ラプトル=486-388=98
  const stockShisco = 546 - Math.floor(546*0.8), stockRaptor = 486 - Math.floor(486*0.8)
  ok('C2 品種別ストック残(シスコ' + stockShisco + '/ラプトル' + stockRaptor + ')が表示',
     shipTxt.includes(String(stockShisco)) && shipTxt.includes(String(stockRaptor)), 'shisco='+stockShisco+' raptor='+stockRaptor)

  // ═══ ⑤ GAP・帳票（審査対応） ═══
  phase = 'gap'
  await navClick(page,'GAPチェックリスト'); await sleep(1000)
  const gap = await page.evaluate(() => {
    const txt = (document.querySelector('.main')||document.body).innerText
    const auto = (txt.match(/自動/g)||[]).length
    return { hasChecks:/GLOBALG\.A\.P|管理点|チェックリスト/.test(txt), autoBadges:auto, bad:/undefined|\bNaN\b/.test(txt) }
  })
  ok('G1 GAPチェックリスト描画・自動達成バッジあり', gap.hasChecks && gap.autoBadges > 0 && !gap.bad, 'auto='+gap.autoBadges)
  await navClick(page,'GAP帳票出力'); await sleep(900)
  const preErr = errors.length
  await clickByText(page,'eMAFF連携CSV'); await sleep(1500)
  ok('G2 eMAFF連携CSV出力がエラーなし', errors.length === preErr, errors.slice(preErr).map(e=>e.msg).join(';'))
  const preErr2 = errors.length
  await page.evaluate(() => { const b=[...document.querySelectorAll('button')].filter(e=>e.offsetParent&&/PDF/.test(e.textContent)); if(b[0])b[0].click() })
  await sleep(4000) // 遅延ロード込み
  ok('G3 帳票PDF生成がエラーなし（遅延ロード込み）', errors.length === preErr2, errors.slice(preErr2).map(e=>e.msg).join(';'))
  await navClick(page,'必要書類・文書台帳'); await sleep(800)
  const docs = await scanPage(page)
  ok('G4 文書台帳が描画', docs.hasMain && docs.len > 200 && !docs.bad)

  // ═══ ⑥ 下書き復元（圏外・離脱対策が半年後も効くか） ═══
  phase = 'draft'
  await navClick(page,'日報入力'); await sleep(800)
  await page.evaluate(() => { const c=[...document.querySelectorAll('button,div')].filter(e=>e.offsetParent&&/^第7圃場/.test(e.textContent.trim())&&e.textContent.trim().length<20); if(c[0])c[0].click() })
  await sleep(300); await clickByText(page,'次へ'); await sleep(400)
  await page.evaluate(() => { const c=[...document.querySelectorAll('button,div')].filter(e=>e.offsetParent&&e.textContent.trim()==='点検'); if(c[0])c[0].click() })
  await sleep(600) // 下書き自動保存を待つ
  await page.reload({ waitUntil:'networkidle2' }); await sleep(1500)
  await navClick(page,'日報入力'); await sleep(800)
  const draft = await page.evaluate(() => ({ banner:/入力途中の下書きが残っています/.test((document.querySelector('.main')||document.body).innerText) }))
  ok('D1 リロード後に下書き復元バナー', draft.banner)
  if (draft.banner) { await clickByText(page,'復元する'); await sleep(600) }
  const restored = await page.evaluate(() => ({ hasType:/点検/.test((document.querySelector('.main')||document.body).innerText) }))
  ok('D2 復元で作業種別(点検)が戻る', restored.hasType)
  await clickByText(page,'破棄'); await sleep(200)

  // ═══ 結果 ═══
  const slow = sweep.filter(s => s.ms > 3500).map(s => ({ nav:s.nav, ms:s.ms }))
  const summary = {
    farmId, seed,
    checks, pass: checks.filter(c=>c.pass).length, total: checks.length,
    failed: checks.filter(c=>!c.pass),
    sweep: sweep.map(s=>({ nav:s.nav, ok:s.hasMain&&!s.bad, len:s.len })),
    slowPages: slow,
    errorCount: errors.length, errors: errors.slice(0,20),
  }
  console.log('QAHALF_BEGIN'); console.log(JSON.stringify(summary, null, 1)); console.log('QAHALF_END')
  await browser.close(); server.close()
}
run().catch(e => { console.log('THREW:'+e.message+'\n'+(e.stack||'').split('\n').slice(0,4).join('\n')); process.exit(1) })
