// ============================================================================
// 番人・複合監査: 星5 P4「天気の自動候補」× P1/P2 × 保存 × 大量records × 異常
//   軸A データ×初期天気 / 軸B 日付追従×手動 / 軸C P1/P2相互作用
//   軸D 保存波及 / 軸E 異常・性能 / 軸F リグレッション
// 実行: cd qa && node qa_p4_weather_complex.js
// ※本体js非改変・読み取りのみ。git操作なし。
// ============================================================================
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core')
const ROOT=path.resolve(__dirname,'..'),PORT=8241,CHROME=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){r.writeHead(404);r.end('404');return}r.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'});r.end(d)})})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const clickText=(page,t)=>page.evaluate(t=>{const v=e=>e.offsetParent!==null;const cs=[...document.querySelectorAll('button,a,[role=button]')].filter(v);let el=cs.find(e=>e.textContent.trim()===t)||cs.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+18);if(el){el.click();return true}return false},t)
const ensureApp=async(page)=>{ if(!(await page.evaluate(()=>!!document.querySelector('.main')))){
  await page.waitForSelector('input[type=email]',{timeout:30000});await page.type('input[type=email]','demo@syatyo-suport.jp');await page.type('input[type=password]','demo1234')
  await page.evaluate(()=>{const x=[...document.querySelectorAll('button[type=submit]')].find(b=>/ログイン/.test(b.textContent));if(x)x.click()})
  for(let i=0;i<40;i++){if(await page.evaluate(()=>!!document.querySelector('.main')))break;await sleep(500)} } }
const selectedWeather=(page)=>page.evaluate(()=>{
  const btns=[...document.querySelectorAll('button')].filter(b=>/^[☀🌤🌧💨]/.test(b.textContent.trim()))
  const sel=btns.find(b=>{const bg=b.style.background||getComputedStyle(b).backgroundColor;return /ECFDF5|236, 253, 245/.test(bg)})
  return sel?sel.textContent.replace(/[^晴曇雨強風]/g,''):null
})
const setDate=(page,val)=>page.evaluate((val)=>{const inp=[...document.querySelectorAll('input[type=date]')].find(i=>i.offsetParent);if(inp){const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(inp,val);inp.dispatchEvent(new Event('input',{bubbles:true}));inp.dispatchEvent(new Event('change',{bubbles:true}))}},val)
const seed=(page,farmId,records)=>page.evaluate((fid,recs)=>{const set=(k,v)=>localStorage.setItem(k+'_'+fid,JSON.stringify(v));set('farm_fields_v2',[{id:1,name:'第1圃場',field_no:'1',crop:'レタス',area_are:10,color:'#0D9972',row_count:6,crop_category:'leaf_veg'}]);set('farm_records',recs)},farmId,records)
const results=[]; const rec=(n,ok,extra)=>{results.push({n,ok:!!ok,extra:extra===undefined?'':extra})}

;(async()=>{
  await new Promise(r=>server.listen(PORT,r))
  const errors=[]
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']})
  const page=await b.newPage(); await page.setViewport({width:1500,height:1000})
  page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,150)))
  page.on('console',m=>{if(m.type()==='error'){const t=m.text();if(!/favicon|unpkg|jsdelivr|cloudflare|tabler|net::ERR/.test(t))errors.push(t.slice(0,150))}})
  await page.goto(`http://localhost:${PORT}/`,{waitUntil:'networkidle2',timeout:60000})
  await ensureApp(page)
  const farmId=await page.evaluate(()=>(typeof CONFIG!=='undefined'&&CONFIG.CURRENT_FARM_ID)?CONFIG.CURRENT_FARM_ID:null)
  const today=await page.evaluate(()=>todayYmd())
  const draftKey='farm_recordform_draft_'+farmId

  // ---- 軸A6: 同一日に異なる天気が複数（最初の1件採用の一貫性）----
  // records順: id100(晴,today) が先, id200(雨,today) が後 → weatherByDate[today]は最初に見つかった'晴'
  await page.evaluate(k=>localStorage.removeItem(k),draftKey)
  await seed(page,farmId,[
    {id:100,field_id:1,date:today,work_type:'除草',weather:'晴',worker:'A'},
    {id:200,field_id:1,date:today,work_type:'潅水',weather:'雨',worker:'A'},
  ])
  await page.reload({waitUntil:'networkidle2'}); await sleep(900)
  await clickText(page,'日報入力'); await sleep(700)
  rec('軸A6 同一日複数天気→最初の1件(晴)を採用', await selectedWeather(page)==='晴')

  // ---- 軸A4: weather欠損の記録が混在 / date欠損 ----
  // 最新日(D=2026-07-05)の記録はweather欠損, その前(D2=2026-07-04)が曇, date欠損の混入
  await page.evaluate(k=>localStorage.removeItem(k),draftKey)
  await seed(page,farmId,[
    {id:301,field_id:1,date:'2026-07-04',work_type:'除草',weather:'曇',worker:'A'},
    {id:302,field_id:1,date:'2026-07-05',work_type:'潅水',worker:'A'}, // weather欠損
    {id:303,field_id:1,work_type:'耕耘',weather:'雨',worker:'A'},       // date欠損
  ])
  await page.reload({waitUntil:'networkidle2'}); await sleep(900)
  await clickText(page,'日報入力'); await sleep(700)
  // latestWeatherはweatherを持つ記録のみ対象→date降順で '2026-07-04'(曇) が最上位（date欠損''は最下位）
  rec('軸A4 weather/date欠損混在→latest=曇(欠損は無視)', await selectedWeather(page)==='曇')
  rec('軸A4 候補バッジ表示あり', await page.evaluate(()=>/候補：前回の天気/.test(document.querySelector('.main').innerText)))

  // ---- 軸B: 記録の無い日付へ変更→現状維持(上書きしない) → 記録ある日へ→追従 → 往復 ----
  // today=雨, D2=2026-07-04=曇 をseed
  await page.evaluate(k=>localStorage.removeItem(k),draftKey)
  await seed(page,farmId,[
    {id:401,field_id:1,date:'2026-07-04',work_type:'除草',weather:'曇',worker:'A'},
    {id:402,field_id:1,date:today,work_type:'潅水',weather:'雨',worker:'A'},
  ])
  await page.reload({waitUntil:'networkidle2'}); await sleep(900)
  await clickText(page,'日報入力'); await sleep(700)
  rec('軸B 初期=today記録の雨', await selectedWeather(page)==='雨')
  await setDate(page,'2020-01-01'); await sleep(400)   // 記録の無い日
  rec('軸B 記録無し日へ→上書きせず現状維持(雨)', await selectedWeather(page)==='雨')
  await setDate(page,'2026-07-04'); await sleep(400)   // 曇の記録がある日
  rec('軸B 曇の記録日へ→追従(曇)', await selectedWeather(page)==='曇')
  await setDate(page,today); await sleep(400)          // today(雨)へ往復
  rec('軸B todayへ往復→雨に追従', await selectedWeather(page)==='雨')

  // ---- 軸B 手動選択→別作業→日付変更で不変 ----
  await clickText(page,'強風'); await sleep(250)
  await clickText(page,'除草'); await sleep(250)        // 別作業(work_type)を触る
  await setDate(page,'2026-07-04'); await sleep(400)    // 曇の記録日でも追従しない
  rec('軸B 手動選択→別作業→日付変更でも不変(強風)', await selectedWeather(page)==='強風')

  // ---- 軸D 保存への波及: 候補のまま保存 → 記録のweatherが候補値か ----
  // step1(圃場)→次へ→step2(除草)→次へ→step3→次へ→step4→保存する（除草はrich非該当）
  await page.evaluate(k=>localStorage.removeItem(k),draftKey)
  await seed(page,farmId,[
    {id:501,field_id:1,date:today,work_type:'潅水',weather:'雨',worker:'A'},
  ])
  await page.reload({waitUntil:'networkidle2'}); await sleep(900)
  await clickText(page,'日報入力'); await sleep(700)
  rec('軸D step1で初期=雨', await selectedWeather(page)==='雨')
  await page.evaluate(()=>{const c=[...document.querySelectorAll('button,[role=button],div,label')].find(e=>/第1圃場/.test(e.textContent)&&e.textContent.trim().length<30&&e.offsetParent);if(c)c.click()})
  await sleep(300); await clickText(page,'次へ'); await sleep(400)   // →step2
  await clickText(page,'除草'); await sleep(300); await clickText(page,'次へ'); await sleep(400) // →step3
  await clickText(page,'確認'); await sleep(400)  // step3→step4
  await clickText(page,'保存する'); await sleep(800)
  const savedW=await page.evaluate(fid=>{const rs=JSON.parse(localStorage.getItem('farm_records_'+fid)||'[]');const mine=rs.filter(r=>r.work_type==='除草');return mine.length?mine[mine.length-1].weather:null},farmId)
  rec('軸D 候補(雨)のまま保存→記録weather=雨',savedW==='雨','実測='+JSON.stringify(savedW))

  // ---- 軸D2 手動変更→その値で保存 ----
  await page.evaluate(k=>localStorage.removeItem(k),draftKey)
  await seed(page,farmId,[{id:511,field_id:1,date:today,work_type:'潅水',weather:'雨',worker:'A'}])
  await page.reload({waitUntil:'networkidle2'}); await sleep(900)
  await clickText(page,'日報入力'); await sleep(700)
  await clickText(page,'強風'); await sleep(250)   // 手動で強風
  await page.evaluate(()=>{const c=[...document.querySelectorAll('button,[role=button],div,label')].find(e=>/第1圃場/.test(e.textContent)&&e.textContent.trim().length<30&&e.offsetParent);if(c)c.click()})
  await sleep(300); await clickText(page,'次へ'); await sleep(400)
  await clickText(page,'除草'); await sleep(300); await clickText(page,'次へ'); await sleep(400)
  await clickText(page,'確認'); await sleep(400)
  await clickText(page,'保存する'); await sleep(800)
  const savedW2=await page.evaluate(fid=>{const rs=JSON.parse(localStorage.getItem('farm_records_'+fid)||'[]');const mine=rs.filter(r=>r.work_type==='除草');return mine.length?mine[mine.length-1].weather:null},farmId)
  rec('軸D2 手動(強風)で保存→記録weather=強風',savedW2==='強風','実測='+JSON.stringify(savedW2))

  // ---- 軸C(P2): 手動で天気選択した下書きを保存→復元後に日付変更で勝手に上書きされないか ----
  // step1で手動weather=強風 → step2で除草(work_type)を入れ下書きmeaningfulに → リロード → 復元 → step1で日付変更
  await page.evaluate(k=>localStorage.removeItem(k),draftKey)
  await seed(page,farmId,[
    {id:601,field_id:1,date:'2026-07-04',work_type:'除草',weather:'曇',worker:'A'},
    {id:602,field_id:1,date:today,work_type:'潅水',weather:'雨',worker:'A'},
  ])
  await page.reload({waitUntil:'networkidle2'}); await sleep(900)
  await clickText(page,'日報入力'); await sleep(700)
  await clickText(page,'強風'); await sleep(250)         // 手動で強風
  await page.evaluate(()=>{const c=[...document.querySelectorAll('button,[role=button],div,label')].find(e=>/第1圃場/.test(e.textContent)&&e.textContent.trim().length<30&&e.offsetParent);if(c)c.click()})
  await sleep(300); await clickText(page,'次へ'); await sleep(400)  // step2へ
  await clickText(page,'除草'); await sleep(300)         // work_typeを入れ下書きmeaningfulに
  await sleep(700)                                       // 下書き自動保存を待つ
  const draftDump=await page.evaluate(k=>localStorage.getItem(k),draftKey)
  rec('軸C 下書きに手動weather(強風)が保存される',/強風/.test(draftDump||''),String(draftDump).slice(0,140))
  // リロードして復元
  await page.reload({waitUntil:'networkidle2'}); await sleep(900)
  await clickText(page,'日報入力'); await sleep(700)
  await clickText(page,'復元する'); await sleep(700)
  // 復元でstep2に戻る想定 → step1へ戻る（← 作業内容 の前段。step1に戻るボタン '戻る' or '←'）
  await page.evaluate(()=>{const cs=[...document.querySelectorAll('button,a,[role=button]')].filter(e=>e.offsetParent);const el=cs.find(e=>/戻る|前へ|←/.test(e.textContent));if(el)el.click()})
  await sleep(500)
  rec('軸C 復元直後の天気=強風(step1)', await selectedWeather(page)==='強風','実測='+await selectedWeather(page))
  // 復元後に日付を「曇の記録がある日」に変更 → weatherTouchedRefはマウントでリセット済み→追従してしまう恐れ
  await setDate(page,'2026-07-04'); await sleep(500)
  const afterRestoreDate=await selectedWeather(page)
  rec('軸C 復元後に日付変更→手動値(強風)を勝手に上書きしない',afterRestoreDate==='強風','実測='+afterRestoreDate)

  // ---- 軸E 大量records(1000件)性能 & 異常文字列 ----
  await page.evaluate(k=>localStorage.removeItem(k),draftKey)
  await page.evaluate((fid,today)=>{
    const arr=[]; const ws=['晴','曇','雨','強風']
    for(let i=0;i<1000;i++){arr.push({id:1000+i,field_id:1,date:'2025-'+String((i%12)+1).padStart(2,'0')+'-'+String((i%28)+1).padStart(2,'0'),work_type:'除草',weather:ws[i%4],worker:'A'})}
    arr.push({id:9999,field_id:1,date:today,work_type:'潅水',weather:'<img src=x onerror=alert(1)>台風☔',worker:'A'})
    localStorage.setItem('farm_records_'+fid,JSON.stringify(arr))
  },farmId,today)
  await page.reload({waitUntil:'networkidle2'}); await sleep(1000)
  const t0=Date.now(); await clickText(page,'日報入力'); await sleep(700); const dt=Date.now()-t0
  rec('軸E 1000件でも日報入力が開く(<4s)',dt<4000,dt+'ms')
  rec('軸E 想定外weather文字列でクラッシュしない', await page.evaluate(()=>!!document.querySelector('.main')))

  // ---- 軸F リグレッション: 圃場まとめ画面が開く / JSエラー0 ----
  await clickText(page,'圃場'); await sleep(600)
  rec('軸F 圃場まとめ画面が表示される', await page.evaluate(()=>!!document.querySelector('.main')&&document.querySelector('.main').innerText.length>10))
  rec('軸F JSエラー0',errors.length===0,errors.slice(0,3).join(' | '))

  console.log('\n=== P4 複合監査 結果 ===')
  let fail=0
  for(const r of results){console.log((r.ok?'PASS':'FAIL')+' '+r.n+(r.extra?('  ['+r.extra+']'):''));if(!r.ok)fail++}
  console.log(`\n${results.length-fail}/${results.length} passed, ${fail} failed`)
  if(errors.length){console.log('\nerrors:',JSON.stringify(errors.slice(0,6),null,1))}
  await b.close(); server.close(); process.exit(fail?1:0)
})().catch(e=>{console.error('HARNESS ERROR',e);process.exit(2)})
