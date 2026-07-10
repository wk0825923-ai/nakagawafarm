// ============================================================================
// シナリオ: デモデータ投入（?demo / ウェルカムの「デモデータで試す」）
//  ① まっさら(farm_*なし)の空ダッシュボードに「デモデータで試す」ボタンが出る
//  ② ?demo で開くと CONFIG.CURRENT_FARM_ID にデモが投入される（fields=20・記録/散布/農薬あり）
//  ③ 投入後リロードで空状態が解消（ダッシュボードに数値が出る）
//  ④ JSエラーなし
// 実行: cd qa && node qa_demo_seed.js
// ============================================================================
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core')
const ROOT=path.resolve(__dirname,'..'),PORT=8242,CHROME=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){r.writeHead(404);r.end('404');return}r.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'});r.end(d)})})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
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
  // confirm/alert を自動でOKに
  page.on('dialog', async d => { try { await d.accept() } catch(e){} })
  await page.goto(`http://localhost:${PORT}/`,{waitUntil:'networkidle2',timeout:60000})
  await ensureApp(page)
  const fid=await page.evaluate(()=>(typeof CONFIG!=='undefined'&&CONFIG.CURRENT_FARM_ID)?CONFIG.CURRENT_FARM_ID:null)
  // まっさらに
  await page.evaluate(()=>{Object.keys(localStorage).filter(k=>k.startsWith('farm_')).forEach(k=>localStorage.removeItem(k))})
  await page.reload({waitUntil:'networkidle2'}); await sleep(1200); await ensureApp(page)
  const R={}

  // ① 空状態にデモボタン
  R.hasDemoBtn = await page.evaluate(()=>[...document.querySelectorAll('button')].some(b=>/デモデータで試す/.test(b.textContent)&&b.offsetParent))

  // ② ?demo で投入（fid検出が CONFIG.CURRENT_FARM_ID 経由で効くか）
  await page.goto(`http://localhost:${PORT}/?demo`,{waitUntil:'networkidle2',timeout:60000})
  await sleep(4000) // seedスクリプト+投入+自動リロード待ち
  await ensureApp(page)
  R.seeded = await page.evaluate((fid)=>{
    const g=k=>{try{return JSON.parse(localStorage.getItem(k+'_'+fid)||'null')}catch(e){return null}}
    const f=g('farm_fields_v2'),rec=g('farm_records'),sp=g('farm_lot_spray_records'),pe=g('farm_pesticides'),st=g('farm_staff')
    return { fields:f?f.length:0, records:rec?rec.length:0, sprays:sp?sp.length:0, pesticides:pe?pe.length:0, staff:st?st.length:0 }
  }, fid)

  // ③ 空状態が解消（デモボタンが消え、圃場数値が出る）
  R.afterSeed = await page.evaluate(()=>{
    const t=document.querySelector('.main')?document.querySelector('.main').innerText:''
    return { noWelcomeBtn:![...document.querySelectorAll('button')].some(b=>/デモデータで試す/.test(b.textContent)&&b.offsetParent), hasStats:/稼働中圃場|総管理面積|作業記録/.test(t) }
  })

  R.errors=errors
  console.log(JSON.stringify(R,null,2))
  const checks=[
    ['空状態にデモボタン表示', R.hasDemoBtn===true],
    ['?demoで20圃場投入', R.seeded.fields===20],
    ['作業記録が投入される', R.seeded.records>0],
    ['散布履歴が投入される', R.seeded.sprays>0],
    ['農薬マスタが投入される', R.seeded.pesticides>0],
    ['スタッフが投入される', R.seeded.staff>0],
    ['投入後は空状態が解消', R.afterSeed.noWelcomeBtn===true && R.afterSeed.hasStats===true],
    ['JSエラーなし', errors.length===0],
  ]
  console.log('\n=== 判定 ===')
  let fail=0
  for(const [n,ok] of checks){ console.log((ok?'✅':'❌')+' '+n); if(!ok)fail++ }
  console.log(`\n${checks.length-fail}/${checks.length} passed, ${fail} failed`)
  await b.close(); server.close(); process.exit(fail?1:0)
})().catch(e=>{console.error(e);process.exit(2)})
