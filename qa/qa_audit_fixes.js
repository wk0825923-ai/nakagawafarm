// ============================================================================
// シナリオ: 番人監査で発見したバグの修正検証
//  BUG#1 [Critical] ?reset が認証済みでも farm_* を確実に消す（index.html同期実行）
//  BUG#2 [High] スキーム切替でレベル絞込がリセットされ0件stale化しない
//  BUG#3 [Med] 全スキーム×推奨 に McD(レベル無し)が誤混入しない → 推奨=GGAP rec 20件のみ
//  BUG#5 [Med] 文書台帳 smartマッピング: 労働者申し立て→10 / フードディフェンス→15
// 実行: cd qa && node qa_audit_fixes.js
// ============================================================================
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core')
const ROOT=path.resolve(__dirname,'..'),PORT=8235,CHROME=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){r.writeHead(404);r.end('404');return}r.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'});r.end(d)})})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const clickText=(page,t)=>page.evaluate(t=>{const v=e=>e.offsetParent!==null;const cs=[...document.querySelectorAll('button,a,[role=button]')].filter(v);let el=cs.find(e=>e.textContent.trim()===t)||cs.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+18);if(el){el.click();return true}return false},t)
const expand=(page)=>page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim().startsWith('管理・設定')&&e.offsetParent);if(b)b.click()})
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
  const R={}
  const farmId=await page.evaluate(()=>(typeof CONFIG!=='undefined'&&CONFIG.CURRENT_FARM_ID)?CONFIG.CURRENT_FARM_ID:null)

  // BUG#1: farm_* にダミーを入れて ?reset で開く → 消えていること（ログインsb_*は保持）
  await page.evaluate((fid)=>{
    localStorage.setItem('farm_fields_v2_'+fid, JSON.stringify([{id:1,name:'第1圃場',crop:'レタス',area_are:10}]))
    localStorage.setItem('farm_gap_documents_'+fid, JSON.stringify({1:{ready:true}}))
    localStorage.setItem('sb_role','admin'); localStorage.setItem('sb_name','テスト管理者')
  }, farmId)
  await page.goto(`http://localhost:${PORT}/?reset`,{waitUntil:'networkidle2',timeout:60000})
  await sleep(500)
  R.reset = await page.evaluate((fid)=>({
    farmKeysLeft: Object.keys(localStorage).filter(k=>k.indexOf('farm_')===0).length,
    fieldsGone: localStorage.getItem('farm_fields_v2_'+fid)===null,
    docsGone: localStorage.getItem('farm_gap_documents_'+fid)===null,
    loginKept: localStorage.getItem('sb_role')==='admin' && localStorage.getItem('sb_name')==='テスト管理者',
    urlClean: !/reset/.test(location.search)
  }), farmId)
  await ensureApp(page)

  // GAPチェックリストへ
  await expand(page); await sleep(200)
  await clickText(page,'GAPチェックリスト'); await sleep(700)
  const readTotal=async()=>page.evaluate(()=>{const m=document.querySelector('.main').innerText.match(/対応度（\d+\/(\d+)）/);return m?parseInt(m[1]):null})

  // BUG#3: 全スキーム×推奨 = GGAP rec 20件のみ（McD混入なし）
  await clickText(page,'全スキーム'); await sleep(300)
  await clickText(page,'推奨'); await sleep(400)
  R.allRecTotal = await readTotal()   // 期待 20

  // BUG#2: GGAP+推奨 の状態から GRASP へ切替 → レベルがallにリセットされGRASP67件（0件stale化しない）
  await clickText(page,'GLOBALG.A.P.'); await sleep(300)
  await clickText(page,'推奨'); await sleep(300); R.ggapRec = await readTotal()  // 期待 20
  await clickText(page,'GRASP（労務）'); await sleep(400); R.graspAfterSwitch = await readTotal()  // 期待 67（0でない）

  // BUG#5: 文書台帳 smartマッピング
  await clickText(page,'必要書類・文書台帳'); await sleep(600)
  R.docMap = await page.evaluate(()=>{
    const d15 = INITIAL_GAP_DOCUMENTS.find(d=>d.id===15)
    const d16 = INITIAL_GAP_DOCUMENTS.find(d=>d.id===16)
    // フードディフェンスがFV-Smart 15グループ配下に表示されているか
    const t = document.querySelector('.main').innerText
    return { d15smart:d15&&d15.smart, d16smart:d16&&d16.smart,
      cat15: (typeof gapCategoryForSmart==='function')?gapCategoryForSmart('15',INITIAL_GAP_CHECKS):null,
      cat10: (typeof gapCategoryForSmart==='function')?gapCategoryForSmart('10',INITIAL_GAP_CHECKS):null,
      showsFoodDefense: /フードディフェンス/.test(t) }
  })

  R.errors=errors
  console.log(JSON.stringify(R,null,2))
  const c=R
  const checks=[
    ['#1 reset: farm_*が全消去', c.reset.farmKeysLeft===0],
    ['#1 reset: fields消去', c.reset.fieldsGone],
    ['#1 reset: 文書台帳消去', c.reset.docsGone],
    ['#1 reset: ログイン保持', c.reset.loginKept],
    ['#1 reset: URLクリーン化', c.reset.urlClean],
    ['#3 全スキーム×推奨=20(McD混入なし)', c.allRecTotal===20],
    ['#2 GGAP推奨=20', c.ggapRec===20],
    ['#2 GRASP切替でallリセット=67(stale0でない)', c.graspAfterSwitch===67],
    ['#5 文書id15→smart10', c.docMap.d15smart==='10'],
    ['#5 文書id16→smart15', c.docMap.d16smart==='15'],
    ['#5 smart15→フードディフェンス原則解決', /フードディフェンス/.test(c.docMap.cat15||'')],
    ['#5 台帳にフードディフェンス表示', c.docMap.showsFoodDefense],
    ['JSエラーなし', errors.length===0],
  ]
  console.log('\n=== 判定 ===')
  let fail=0
  for(const [n,ok] of checks){ console.log((ok?'✅':'❌')+' '+n); if(!ok)fail++ }
  console.log(`\n${checks.length-fail}/${checks.length} passed, ${fail} failed`)
  await b.close(); server.close(); process.exit(fail?1:0)
})().catch(e=>{console.error(e);process.exit(2)})
