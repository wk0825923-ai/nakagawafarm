// ============================================================================
// シナリオ: 星5ロードマップ P3「複数畝の一括登録」
//  ① 農薬散布の畝フォームに「全畝を選択（N畝）」ボタンが出る
//  ② クリックで全畝が選択され「N畝 選択中」＋畝範囲テキストが 1-N になる
//  ③ 「クリア」で選択が0に戻る
//  ④ 個別タップの複数畝選択も従来どおり動く（1畝→2畝…）
//  ⑤ JSエラーなし
// 実行: cd qa && node qa_p3_bulkrows.js
// ============================================================================
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core')
const ROOT=path.resolve(__dirname,'..'),PORT=8238,CHROME=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){r.writeHead(404);r.end('404');return}r.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'});r.end(d)})})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const clickText=(page,t)=>page.evaluate(t=>{const v=e=>e.offsetParent!==null;const cs=[...document.querySelectorAll('button,a,[role=button]')].filter(v);let el=cs.find(e=>e.textContent.trim()===t)||cs.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+18);if(el){el.click();return true}return false},t)
const ensureApp=async(page)=>{ if(!(await page.evaluate(()=>!!document.querySelector('.main')))){
  await page.waitForSelector('input[type=email]',{timeout:30000});await page.type('input[type=email]','demo@syatyo-suport.jp');await page.type('input[type=password]','demo1234')
  await page.evaluate(()=>{const x=[...document.querySelectorAll('button[type=submit]')].find(b=>/ログイン/.test(b.textContent));if(x)x.click()})
  for(let i=0;i<40;i++){if(await page.evaluate(()=>!!document.querySelector('.main')))break;await sleep(500)} } }
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
  // 圃場1件(row_count=6)＋ロット1件(1-3)＋農薬マスタ をseed（hasMap成立に必要）
  await page.evaluate((fid)=>{
    const set=(k,v)=>localStorage.setItem(k+'_'+fid,JSON.stringify(v))
    set('farm_fields_v2',[{id:1,name:'第1圃場',field_no:'1',crop:'レタス',area_are:10,color:'#0D9972',row_count:6,crop_category:'leaf_veg'}])
    set('farm_lots',{1:[{id:'L1',field_id:1,row_range:'1-3',variety:'シスコ',status:'growing',seed_date:'2026-05-01'}]})
    set('farm_pesticides',[{id:1,name:'アグロA',reg_no:'第123号',dilution:1000,preharvest_days:7,max_count:3}])
    set('farm_records',[])
  }, farmId)
  await page.reload({waitUntil:'networkidle2'}); await sleep(1200)
  const R={}

  // 日報入力 → 圃場選択 → 次へ → 農薬散布（richフォーム）
  await clickText(page,'日報入力'); await sleep(800)
  await page.evaluate(()=>{const grid=[...document.querySelectorAll('div')].find(d=>d.style&&d.style.maxHeight==='240px');if(grid){const chip=[...grid.children].find(c=>/第1圃場/.test(c.textContent));if(chip)chip.click()}})
  await sleep(300)
  await clickText(page,'次へ'); await sleep(500)
  await clickText(page,'農薬散布'); await sleep(400)
  await clickText(page,'次へ'); await sleep(800)   // step2→step3: 農薬散布は畝フォーム(rich)に切替

  // ① 全畝を選択ボタン
  R.hasAllBtn = await page.evaluate(()=>[...document.querySelectorAll('button')].some(b=>/全畝を選択/.test(b.textContent)&&b.offsetParent))
  R.allBtnLabel = await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>/全畝を選択/.test(b.textContent));return b?b.textContent.trim():null})

  // ② クリックで全畝選択＋範囲1-6
  await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>/全畝を選択/.test(b.textContent)&&b.offsetParent);if(b)b.click()})
  await sleep(400)
  R.afterAll = await page.evaluate(()=>{
    const t=document.querySelector('.main').innerText
    const rangeInput=[...document.querySelectorAll('input')].find(i=>/1-6|1-|畝/.test(i.value||'')||/1-40|1-6/.test(i.placeholder||''))
    const anyVal=[...document.querySelectorAll('input')].map(i=>i.value).filter(Boolean)
    return { badge6:/6畝 選択中/.test(t), rangeVals:anyVal.filter(v=>/^1-6$|1-6/.test(v)), hasRange16:anyVal.some(v=>v==='1-6') }
  })

  // ③ クリア
  await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='クリア'&&b.offsetParent);if(b)b.click()})
  await sleep(400)
  R.afterClear = await page.evaluate(()=>({noBadge:!/畝 選択中/.test(document.querySelector('.main').innerText)}))

  // ④ 個別タップ2畝（クリック間に再描画されるので都度クエリ）
  const tapCell=async(idx)=>{ await page.evaluate((idx)=>{const cells=[...document.querySelectorAll('div')].filter(d=>d.style&&d.style.width==='36px'&&d.style.height==='36px'&&d.offsetParent);if(cells[idx])cells[idx].click()},idx); await sleep(250) }
  await tapCell(0); await tapCell(1)
  R.tapBadge = await page.evaluate(()=>/2畝 選択中/.test(document.querySelector('.main').innerText))

  R.errors=errors
  console.log(JSON.stringify(R,null,2))
  const checks=[
    ['全畝を選択ボタンが出る', R.hasAllBtn===true],
    ['ボタンに畝数(6)が表示', /6畝/.test(R.allBtnLabel||'')],
    ['全畝選択で6畝選択中', R.afterAll.badge6===true],
    ['畝範囲テキストが 1-6 に同期', R.afterAll.hasRange16===true],
    ['クリアで選択解除', R.afterClear.noBadge===true],
    ['個別タップ2畝で2畝選択中', R.tapBadge===true],
    ['JSエラーなし', errors.length===0],
  ]
  console.log('\n=== 判定 ===')
  let fail=0
  for(const [n,ok] of checks){ console.log((ok?'✅':'❌')+' '+n); if(!ok)fail++ }
  console.log(`\n${checks.length-fail}/${checks.length} passed, ${fail} failed`)
  await b.close(); server.close(); process.exit(fail?1:0)
})().catch(e=>{console.error(e);process.exit(2)})
