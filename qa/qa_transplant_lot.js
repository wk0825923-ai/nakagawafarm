// qa_transplant_lot.js — 定植日報→畝ロット自動生成＋圃場row_count拡張のE2E（Codexレビュー28 Medium対応）
// autoCreateLotFromTransplantで、生成したロットのrow_rangeまで圃場のrow_count(畝総数)が広がることを確認。
// (レビュー27で入れたstate updater内createdRange代入が遅延実行でnullのまま→extendRowCount未実行になる回帰の防止)
//  T1 圃場(row_count=6・ロット無し)に定植8畝を記録→ロット1件(1-8)生成＋圃場row_countが8へ拡張
// 実行: cd qa && node qa_transplant_lot.js  ※localStorage経路(?dbdestなし)。app.jsのautoCreateLotロジックを実UIで検証
const http = require('http'); const fs = require('fs'); const path = require('path')
const puppeteer = require('puppeteer-core')
const ROOT = path.resolve(__dirname, '..'); const PORT = 8263
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon' }
const server = http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){r.writeHead(404);r.end('404');return}r.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'});r.end(d)})})
const sleep = ms => new Promise(r=>setTimeout(r,ms))
const FLD='eeee1111-2222-3333-4444-555555550aa1'
const clickText = (page,t)=>page.evaluate(t=>{const v=e=>e.offsetParent!==null;const cs=[...document.querySelectorAll('button,a,[role=button]')].filter(v);let el=cs.find(e=>e.textContent.trim()===t)||cs.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+18);if(!el){const all=[...document.querySelectorAll('div,span,li,label')].filter(v);el=all.find(e=>e.textContent.trim()===t)||all.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+16)}if(el){el.click();return true}return false},t)
const setInputByPh = (page, ph, v)=>page.evaluate(({ph,v})=>{
  const el=[...document.querySelectorAll('input')].filter(e=>e.offsetParent).find(e=>(e.placeholder||'').includes(ph))
  if(!el)return false
  const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set
  s.call(el,String(v)); el.dispatchEvent(new Event('input',{bubbles:true})); return true
},{ph,v})
;(async()=>{
  await new Promise(r=>server.listen(PORT,r))
  const checks=[]; const errors=[]; let phase='boot'
  const ok=(n,c,x)=>checks.push({name:n,pass:!!c,extra:x==null?'':String(x)})
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-dev-shm-usage'],protocolTimeout:240000})
  const page=await b.newPage(); await page.setViewport({width:1500,height:1000})
  page.on('pageerror',e=>errors.push(phase+':'+String(e.message||e).slice(0,120)))
  await page.goto(`http://localhost:${PORT}/`,{waitUntil:'networkidle2',timeout:60000})
  if(!(await page.evaluate(()=>!!document.querySelector('.main')))){
    await page.waitForSelector('input[type=email]',{timeout:30000})
    await page.type('input[type=email]','demo@syatyo-suport.jp'); await page.type('input[type=password]','demo1234')
    await page.evaluate(()=>{const x=[...document.querySelectorAll('button[type=submit]')].find(b=>/ログイン/.test(b.textContent));if(x)x.click()})
    for(let i=0;i<40;i++){if(await page.evaluate(()=>!!document.querySelector('.main')))break;await sleep(500)}
  }
  // ── 準備: farm_*をクリア→圃場1件(row_count=6・ロット無し)をlocalStorageにseed ──
  phase='seed'
  await page.evaluate(()=>{Object.keys(localStorage).filter(k=>k.startsWith('farm_')).forEach(k=>localStorage.removeItem(k))})
  const fid=await page.evaluate(()=>CONFIG.CURRENT_FARM_ID)
  await page.evaluate(({fid,FLD})=>{
    const set=(k,v)=>localStorage.setItem(k+'_'+fid,JSON.stringify(v))
    set('farm_fields_v2',[{id:FLD,name:'定植QA圃場',field_no:'1',crop:'レタス',area_are:10,color:'#0D9972',row_count:6,crop_category:'leaf_veg'}])
    set('farm_lots',{})        // ロット無し(usedMax=0→定植8畝で1-8)
    set('farm_records',[])
  },{fid,FLD})
  await page.reload({waitUntil:'networkidle2'}); await sleep(1200)

  // ═══ T1: 定植8畝を記録→ロット(1-8)生成＋圃場row_countが8へ拡張 ═══
  phase='t1-transplant'
  await clickText(page,'日報入力'); await sleep(900)
  await page.evaluate(()=>{const grid=[...document.querySelectorAll('div')].find(d=>d.style&&d.style.maxHeight==='240px');if(grid){const chip=[...grid.children].find(c=>/定植QA圃場/.test(c.textContent));if(chip)chip.click()}})
  await sleep(400); await clickText(page,'次へ'); await sleep(600)
  await clickText(page,'定植'); await sleep(400); await clickText(page,'次へ'); await sleep(900)
  await setInputByPh(page,'例: 7','8') // 作業畝数=8
  await sleep(300)
  await clickText(page,'確認'); await sleep(700) // ステップ4(確認・保存)へ
  await clickText(page,'保存する'); await sleep(1800)
  const t1=await page.evaluate((fid)=>{
    const lots=JSON.parse(localStorage.getItem('farm_lots_'+fid)||'{}')
    const fields=JSON.parse(localStorage.getItem('farm_fields_v2_'+fid)||'[]')
    const allLots=[].concat(...Object.values(lots))
    const lot=allLots.find(l=>l.source_record_id!=null)
    const fld=fields[0]
    return { nLots:allLots.length, range:lot?lot.row_range:null, rowCount:fld?fld.row_count:null }
  },fid)
  // 定植8畝(ロット無し)→ row_range='1-8'・圃場row_countが6→8へ拡張(最大畝番号8まで)
  ok('T1 定植日報→ロット自動生成(1-8)＋圃場row_countが8へ拡張(extendRowCountが確実に走る)',
    t1.nLots===1 && t1.range==='1-8' && t1.rowCount===8, JSON.stringify(t1))

  const pass=checks.filter(c=>c.pass).length
  console.log('QATRANSLOT_START')
  checks.forEach(c=>console.log((c.pass?'PASS':'FAIL')+' '+c.name+(c.extra?' ['+c.extra+']':'')))
  if(errors.length)console.log('ERRORS:',JSON.stringify(errors.slice(0,5)))
  console.log(pass+'/'+checks.length)
  console.log('QATRANSLOT_END')
  await b.close(); server.close()
  process.exit(pass===checks.length?0:1)
})().catch(e=>{console.error('RUNERR',e);process.exit(1)})
