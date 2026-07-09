// BUG#4検証: GAP達成率ヒーローの「昨年比+12pt」モック値を廃止したこと
//  - 前年実績が無い間、昨年比バッジが表示されない
//  - どこにも "昨年比" のモックpt表示が出ない
//  - 達成率%と 項目クリア(done/total) は事実として残る・母集合ラベルに項目数明示
// 実行: cd qa && node qa_hero_yoy.js
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core')
const ROOT=path.resolve(__dirname,'..'),PORT=8249,CHROME=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css'}
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
  await expand(page); await sleep(200)
  await clickText(page,'GAP帳票出力'); await sleep(900)
  const R = await page.evaluate(()=>{
    const m=document.querySelector('.main'); const t=m?m.innerText:''
    return {
      hasHero: /GAP 審査基準 達成率/.test(t),
      hasPct: /\d+%/.test(t),
      hasYoyMock: /昨年比/.test(t),          // ← 出てはいけない
      has12pt: /\+12pt|＋12pt/.test(t),      // ← 出てはいけない
      hasClearCount: /項目クリア/.test(t),   // ← 事実は残る
      hasBaseLabel: /基準）/.test(t),        // ← 母集合ラベル
    }
  })
  R.errors=errors
  console.log(JSON.stringify(R,null,2))
  const checks=[
    ['ヒーロー表示', R.hasHero],
    ['達成率%は残る(事実)', R.hasPct],
    ['[BUG#4] 昨年比モックが表示されない', R.hasYoyMock===false],
    ['[BUG#4] +12ptが表示されない', R.has12pt===false],
    ['項目クリア数は残る(事実)', R.hasClearCount],
    ['母集合ラベル(基準）)が明示', R.hasBaseLabel],
    ['JSエラーなし', errors.length===0],
  ]
  console.log('\n=== 判定 ===')
  let fail=0
  for(const [n,ok] of checks){ console.log((ok?'✅':'❌')+' '+n); if(!ok)fail++ }
  console.log(`\n${checks.length-fail}/${checks.length} passed, ${fail} failed`)
  await b.close(); server.close(); process.exit(fail?1:0)
})().catch(e=>{console.error(e);process.exit(2)})
