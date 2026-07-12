// qa_uuid_records.js — UUIDマスタ×実フォーム保存経路のE2E検証（Codexレビュー5対応）
// マスタがUUID化された後も、現場の記録入力が壊れないことを実UIで確認する:
//  E1 畝ロット農薬散布: UUID農薬で保存→pesticide_idがUUIDのまま残る＋在庫減算
//  E2 施肥: UUID肥料で保存→fertilizer_idがUUIDのまま残る
//  E3 配合肥料: UUID構成肥料でblend_componentsが消えずに保存される
//  E4 旧数値ID仕入履歴がUUIDマスタの詳細に表示される(legacy_id橋渡し)
// 実行: cd qa && node qa_uuid_records.js
const http = require('http'); const fs = require('fs'); const path = require('path')
const puppeteer = require('puppeteer-core')
const ROOT = path.resolve(__dirname, '..'); const PORT = 8247
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon' }
const server = http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){r.writeHead(404);r.end('404');return}r.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'});r.end(d)})})
const sleep = ms => new Promise(r=>setTimeout(r,ms))
const PU = 'aaaa1111-2222-3333-4444-555555550001' // UUID農薬
const FLD = 'eeee1111-2222-3333-4444-555555550001' // UUID圃場(マスタUUID化第3弾)
const FU = 'bbbb1111-2222-3333-4444-555555550001' // UUID肥料1
const FU2 = 'bbbb1111-2222-3333-4444-555555550002' // UUID肥料2
const clickText = (page,t)=>page.evaluate(t=>{const v=e=>e.offsetParent!==null;const cs=[...document.querySelectorAll('button,a,[role=button]')].filter(v);let el=cs.find(e=>e.textContent.trim()===t)||cs.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+18);if(!el){const all=[...document.querySelectorAll('div,span,li,label')].filter(v);el=all.find(e=>e.textContent.trim()===t)||all.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+16)}if(el){el.click();return true}return false},t)
const navClick = async (page,label)=>{
  const tryClick=()=>page.evaluate(l=>{const b=[...document.querySelectorAll('.nav-item, .sidebar button')].find(e=>e.offsetParent&&e.textContent.trim()===l);if(b){b.click();return true}return false},label)
  if(await tryClick())return true
  for(const head of ['営農データ','管理・設定']){
    await page.evaluate(h=>{const hs=[...document.querySelectorAll('.sidebar *')].filter(e=>e.offsetParent&&e.textContent.trim()===h);const last=hs[hs.length-1];if(last)last.click()},head)
    await sleep(250); if(await tryClick())return true
  }
  return false
}
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
  await page.evaluate(()=>{Object.keys(localStorage).filter(k=>k.startsWith('farm_')).forEach(k=>localStorage.removeItem(k))})
  const fid=await page.evaluate(()=>CONFIG.CURRENT_FARM_ID)
  phase='seed'
  await page.evaluate(({fid,PU,FU,FU2,FLD})=>{
    const set=(k,v)=>localStorage.setItem(k+'_'+fid,JSON.stringify(v))
    set('farm_fields_v2',[{id:FLD,name:'第1圃場',field_no:'1',crop:'レタス',area_are:10,color:'#0D9972',row_count:6,crop_category:'leaf_veg',legacy_id:1}])
    set('farm_lots',{[FLD]:[{id:'L1',field_id:FLD,row_range:'1-3',variety:'シスコ',status:'growing',seed_date:'2026-05-01'}]})
    // UUIDマスタ(先頭=フォームの既定選択)。農薬はlegacy_id=1(旧数値ID時代の自分)
    set('farm_pesticides',[{id:PU,name:'UUID農薬',reg_no:'第999号',dilution:1000,preharvest_days:7,max_times:3,legacy_id:1}])
    set('farm_pesticide_stock',[{pesticide_id:PU,stock_L:10,alert_threshold_L:1}])
    set('farm_fertilizers',[
      {id:FU,name:'UUID肥料A',weight_per_bag_kg:20,price_per_bag_yen:2614,unit_price_yen_per_kg:130.7,default_dilution:300,legacy_id:2},
      {id:FU2,name:'UUID肥料B',weight_per_bag_kg:20,price_per_bag_yen:2972,unit_price_yen_per_kg:148.6}])
    set('farm_fertilizer_stock',[{fertilizer_id:FU,stock_kg:100,alert_threshold_kg:10},{fertilizer_id:FU2,stock_kg:100,alert_threshold_kg:10}])
    // 旧数値ID(=legacy_id 1)で記録された仕入履歴 → UUIDマスタの詳細に表示されるべき
    set('farm_pesticide_purchases',[{id:1,pesticide_id:1,date:'2026-06-01',amount_L:5,price_yen:5000}])
    set('farm_records',[]); set('farm_lot_spray_records',[]); set('farm_top_dressing_records',[])
  },{fid,PU,FU,FU2,FLD})
  await page.reload({waitUntil:'networkidle2'}); await sleep(1200)

  // ═══ E1: 畝ロット農薬散布（UUID農薬・既定選択） ═══
  phase='e1-spray'
  await clickText(page,'日報入力'); await sleep(800)
  await page.evaluate(()=>{const grid=[...document.querySelectorAll('div')].find(d=>d.style&&d.style.maxHeight==='240px');if(grid){const chip=[...grid.children].find(c=>/第1圃場/.test(c.textContent));if(chip)chip.click()}})
  await sleep(300); await clickText(page,'次へ'); await sleep(500)
  await clickText(page,'農薬散布'); await sleep(400); await clickText(page,'次へ'); await sleep(900)
  await setInputByPh(page,'1-40','1-3')
  await setInputByPh(page,'例: 500','500')
  await sleep(300)
  await clickText(page,'記録する'); await sleep(1200)
  const e1=await page.evaluate((fid)=>{
    const recs=JSON.parse(localStorage.getItem('farm_lot_spray_records_'+fid)||'[]')
    const st=JSON.parse(localStorage.getItem('farm_pesticide_stock_'+fid)||'[]')[0]
    const r=recs[recs.length-1]
    return recs.length?{pid:r.pesticides[0].pesticide_id,fld:r.field_id,dilution:r.pesticides[0].dilution,stock:st?st.stock_L:null,n:recs.length}:{n:0}
  },fid)
  ok('E1 畝ロット散布: pesticide_id・field_idがUUIDのまま保存される', e1.n===1 && e1.pid===PU && String(e1.fld)===FLD, JSON.stringify(e1))
  ok('E1b 在庫減算がUUIDでも効く(10L→9.5L: 500L÷1000倍)', e1.stock===9.5, 'stock='+e1.stock)

  // ═══ E2: 施肥（UUID肥料・既定選択＋標準希釈で有効化） ═══
  phase='e2-topdressing'
  await page.reload({waitUntil:'networkidle2'}); await sleep(1200) // E1の画面状態を持ち越さない
  await clickText(page,'日報入力'); await sleep(800)
  await page.evaluate(()=>{const grid=[...document.querySelectorAll('div')].find(d=>d.style&&d.style.maxHeight==='240px');if(grid){const chip=[...grid.children].find(c=>/第1圃場/.test(c.textContent));if(chip)chip.click()}})
  await sleep(300); await clickText(page,'次へ'); await sleep(500)
  await clickText(page,'施肥'); await sleep(400); await clickText(page,'次へ'); await sleep(900)
  await setInputByPh(page,'1-40','1-3')
  await setInputByPh(page,'例: 5','20') // 施肥量(kg)
  await sleep(300)
  await clickText(page,'記録する'); await sleep(1200)
  const e2=await page.evaluate((fid)=>{
    const recs=JSON.parse(localStorage.getItem('farm_top_dressing_records_'+fid)||'[]')
    const r=recs[recs.length-1]
    return recs.length?{fid2:r.fertilizers[0].fertilizer_id,n:recs.length}:{n:0}
  },fid)
  ok('E2 施肥: fertilizer_idがUUIDのまま保存される', e2.n===1 && e2.fid2===FU, JSON.stringify(e2))

  // ═══ E3: 配合肥料（UUID構成肥料でblend_componentsが残る） ═══
  phase='e3-blend'
  await navClick(page,'マスタ管理'); await sleep(800)
  await clickText(page,'肥料マスタ'); await sleep(700)
  await clickText(page,'肥料を追加'); await sleep(500)
  await setInputByPh(page,'IB化成S1','QA配合6:1')
  await page.evaluate(()=>{const cb=[...document.querySelectorAll('input[type=checkbox]')].find(e=>e.offsetParent&&/配合肥料として登録/.test((e.closest('label')||{}).textContent||''));if(cb)cb.click()})
  await sleep(300)
  await page.evaluate(({FU,FU2})=>{
    const sels=[...document.querySelectorAll('select')].filter(s=>s.offsetParent&&[...s.options].some(o=>o.textContent==='構成肥料を選択'))
    const set=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set
    if(sels[0]){set.call(sels[0],FU);sels[0].dispatchEvent(new Event('change',{bubbles:true}))}
    if(sels[1]){set.call(sels[1],FU2);sels[1].dispatchEvent(new Event('change',{bubbles:true}))}
    const bags=[...document.querySelectorAll('input[type=number]')].filter(e=>e.offsetParent&&e.placeholder==='袋数')
    const iset=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set
    if(bags[0]){iset.call(bags[0],'6');bags[0].dispatchEvent(new Event('input',{bubbles:true}))}
    if(bags[1]){iset.call(bags[1],'1');bags[1].dispatchEvent(new Event('input',{bubbles:true}))}
  },{FU,FU2})
  await sleep(400)
  await clickText(page,'登録する'); await sleep(1200)
  const e3=await page.evaluate((fid)=>{
    const arr=JSON.parse(localStorage.getItem('farm_fertilizers_'+fid)||'[]')
    const f=arr.find(x=>x.name==='QA配合6:1')
    return f?{blend:f.blend_components}:null
  },fid)
  ok('E3 配合肥料: UUID構成肥料でblend_componentsが消えない',
    e3 && Array.isArray(e3.blend) && e3.blend.length===2 && e3.blend[0].fertilizer_id===FU && e3.blend[0].bags===6,
    JSON.stringify(e3))

  // ═══ E4: 旧数値ID仕入履歴がUUIDマスタの詳細に表示される ═══
  phase='e4-legacy-purchase'
  await page.reload({waitUntil:'networkidle2'}); await sleep(1200) // E3のモーダル状態を持ち越さない
  await navClick(page,'マスタ管理'); await sleep(800)
  await clickText(page,'農薬マスタ'); await sleep(700)
  await page.evaluate(()=>{ // カード内の名前(最深一致)をクリック→バブリングでカードonClick(詳細モーダル)が開く
    const hits=[...document.querySelectorAll('.main *')].filter(e=>e.offsetParent&&e.children.length===0&&e.textContent.trim()==='UUID農薬')
    const el=hits[hits.length-1]; if(el)el.click()
  }); await sleep(900)
  await clickText(page,'仕入れ履歴'); await sleep(600) // モーダル内タブへ切替
  const e4=await page.evaluate(()=>{
    const t=document.body.innerText
    return { hasAmount:/\+?5(\.0)?\s*L/.test(t), hasDate:/2026-06-01/.test(t) }
  })
  ok('E4 旧数値ID(legacy_id)の仕入履歴がUUIDマスタ詳細に表示される', e4.hasAmount && e4.hasDate, JSON.stringify(e4))

  const pass=checks.filter(c=>c.pass).length
  console.log('QAUUIDREC_START')
  checks.forEach(c=>console.log((c.pass?'PASS':'FAIL')+' '+c.name+(c.extra?' ['+c.extra+']':'')))
  if(errors.length)console.log('ERRORS:',JSON.stringify(errors.slice(0,5)))
  console.log(pass+'/'+checks.length)
  console.log('QAUUIDREC_END')
  await b.close(); server.close()
  process.exit(pass===checks.length?0:1)
})().catch(e=>{console.error('RUNERR',e);process.exit(1)})
