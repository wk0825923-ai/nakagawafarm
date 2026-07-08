// ============================================================================
// シナリオ: GLOBALG.A.P. Ver6 実チェックリスト(190管理点)の複合条件QA
//  ①空データ: 190項目/33カテゴリ描画・自動達成0・レベルバッジ・要書類表示・白画面なし
//  ②レベル絞り込み: すべて190 / 上位103 / 下位67 / 推奨20 に一致
//  ③記録投入: spray/fert/harvest/shipment/machine を入れると auto 達成が増え対応度%上昇
//  ④全ページ巡回で NaN/undefined/白画面/エラーが出ない
// 実行: cd qa && node qa_gap.js
// ============================================================================
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core')
const ROOT=path.resolve(__dirname,'..'),PORT=8216,CHROME=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){r.writeHead(404);r.end('404');return}r.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'});r.end(d)})})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const clickText=(page,t)=>page.evaluate(t=>{const v=e=>e.offsetParent!==null;const cs=[...document.querySelectorAll('button,a,[role=button]')].filter(v);let el=cs.find(e=>e.textContent.trim()===t)||cs.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+18);if(el){el.click();return true}return false},t)
const expand=(page)=>page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim().startsWith('管理・設定')&&e.offsetParent);if(b)b.click()})
;(async()=>{
  await new Promise(r=>server.listen(PORT,r))
  const errors=[]
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']})
  const page=await b.newPage(); await page.setViewport({width:1500,height:1000})
  page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,150)))
  page.on('console',m=>{if(m.type()==='error'){const t=m.text();if(!/favicon|unpkg|jsdelivr|cloudflare|tabler|net::ERR/.test(t))errors.push(t.slice(0,150))}})
  await page.goto(`http://localhost:${PORT}/`,{waitUntil:'networkidle2',timeout:60000})
  if(!(await page.evaluate(()=>!!document.querySelector('.main')))){
    await page.waitForSelector('input[type=email]',{timeout:30000});await page.type('input[type=email]','demo@syatyo-suport.jp');await page.type('input[type=password]','demo1234')
    await page.evaluate(()=>{const x=[...document.querySelectorAll('button[type=submit]')].find(b=>/ログイン/.test(b.textContent));if(x)x.click()})
    for(let i=0;i<40;i++){if(await page.evaluate(()=>!!document.querySelector('.main')))break;await sleep(500)}
  }
  const R={}
  // データ定義の健全性(ブラウザ内のINITIAL_GAP_CHECKS)
  R.def = await page.evaluate(()=>({ total:INITIAL_GAP_CHECKS.length, cats:new Set(INITIAL_GAP_CHECKS.map(c=>c.category)).size,
    major:INITIAL_GAP_CHECKS.filter(c=>c.level==='major').length, minor:INITIAL_GAP_CHECKS.filter(c=>c.level==='minor').length, rec:INITIAL_GAP_CHECKS.filter(c=>c.level==='rec').length,
    auto:INITIAL_GAP_CHECKS.filter(c=>c.auto).length, withCode:INITIAL_GAP_CHECKS.filter(c=>c.code).length }))
  // 空データに
  await page.evaluate(()=>{Object.keys(localStorage).filter(k=>k.startsWith('farm_')).forEach(k=>localStorage.removeItem(k))})
  await page.reload({waitUntil:'networkidle2'});await sleep(1200);await expand(page);await sleep(300)
  // ① 空データでGAPチェックリスト
  await clickText(page,'GAPチェックリスト'); await sleep(900)
  R.emptyText = await page.evaluate(()=>{const t=document.querySelector('.main').innerText;return{
    hasTitle:/GAP対応チェックリスト/.test(t), has190:/190/.test(t), hasLevelBadge:/上位|下位|推奨/.test(t),
    hasDoc:/要書類/.test(t), bad:['NaN','undefined','[object Object]'].filter(x=>t.includes(x)).join(',') }})
  // ② レベル絞り込み: 母数(total)をDOMの「対応度（done/total）」から読む
  const grab=async(lab)=>{ await clickText(page,lab); await sleep(500); return await page.evaluate(()=>{const m=document.querySelector('.main').innerText.match(/対応度（\d+\/(\d+)）/);return m?parseInt(m[1]):null}) }
  R.filterAll   = await grab('すべて')
  R.filterMajor = await grab('上位（必須）')
  R.filterMinor = await grab('下位（必須）')
  R.filterRec   = await grab('推奨')
  await grab('すべて')
  // ③ farmId取得→記録投入→自動達成が増えるか
  const farmId = await page.evaluate(()=> (typeof CONFIG!=='undefined'&&CONFIG.CURRENT_FARM_ID)?CONFIG.CURRENT_FARM_ID:null)
  R.farmId = !!farmId
  const pctBefore = await page.evaluate(()=>{const m=document.querySelector('.main').innerText.match(/(\d+)%/);return m?parseInt(m[1]):null})
  if(farmId){
    await page.evaluate((fid)=>{
      const set=(k,v)=>localStorage.setItem(k+'_'+fid,JSON.stringify(v))
      set('farm_lot_spray_records',[{id:1,field_id:1,date:'2026-06-01',row_range:'1-6',spray_volume_L:50,pesticides:[{pesticide_id:1,dilution:1000}],weather:'晴れ'}])
      set('farm_top_dressing_records',[{id:1,field_id:1,date:'2026-05-01',row_range:'1-6',fertilizer_id:1,amount_kg:20}])
      set('farm_harvest_records',[{id:1,field_id:1,date:'2026-06-20',variety:'レタス',total_cases:10,shipments:[{grade:'A',cases:10}]}])
      set('farm_shipment_records',[{id:1,field_id:1,date:'2026-06-25',variety:'レタス',cases:8}])
      set('farm_maintenance_records',[{id:1,machine_name:'トラクター',date:'2026-05-10',mtype:'点検',result:'異常なし'}])
      set('farm_pesticide_purchases',[{id:1,pesticide_id:1,date:'2026-04-01',amount_L:5,price_yen:3000}])
      set('farm_lots',{1:[{id:'L1',field_id:1,row_range:'1-6',variety:'レタス',status:'growing',seed_lot_no:'S1'}]})
    }, farmId)
    await page.reload({waitUntil:'networkidle2'});await sleep(1200);await expand(page);await sleep(300)
    await clickText(page,'GAPチェックリスト'); await sleep(900)
    R.autoAfter = await page.evaluate(()=>{const m=document.querySelector('.main').innerText.match(/(\d+) 件\s*✅ システムが記録で自動達成/);return m?parseInt(m[1]):(document.querySelector('.main').innerText.match(/自動✓/g)||[]).length})
    R.pctAfter = await page.evaluate(()=>{const m=document.querySelector('.main').innerText.match(/(\d+)%/);return m?parseInt(m[1]):null})
  }
  R.pctBefore = pctBefore
  // ④ 全ページ巡回でエラー/白画面
  const NAV=['総合ダッシュボード','日報入力','GAP帳票出力','GAPチェックリスト','日報管理','圃場まとめ','収穫予測','出荷記録','マスタ管理','スタッフ管理','機械整備記録']
  const bad=[]
  for(const p of NAV){ const ok=await clickText(page,p); await sleep(450); const s=await page.evaluate(()=>{const m=document.querySelector('.main');if(!m)return{white:true};const t=m.innerText;return{white:false,bad:['NaN','undefined','[object Object]'].filter(x=>t.includes(x)).join(',')}}); if(s.white||s.bad)bad.push(p+(s.white?':white':':'+s.bad)) }
  R.sweepBad = bad
  R.errorCount = errors.length; R.errors=errors.slice(0,8)
  console.log('QAGAP_START');console.log(JSON.stringify(R,null,2));console.log('QAGAP_END')
  await b.close();server.close()
})().catch(e=>{console.error('RUNERR',e);process.exit(1)})
