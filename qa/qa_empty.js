// 新規ユーザー(データ空)で全ページがクラッシュ/白画面/壊れ表示にならないか検証
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core')
const ROOT=require('path').resolve(__dirname,'..'),PORT=8143,CHROME=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){r.writeHead(404);r.end('404');return}r.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'});r.end(d)})})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const NAV=['総合ダッシュボード','日報入力','作付計画 / 経営予測','GAP帳票出力','GAPチェックリスト','日報管理','圃場まとめ','収穫予測','出荷記録','マスタ管理','スタッフ管理','技能実習生 作業日誌','多言語マニュアル','機器予約','機械整備記録','収益シミュレーター','作物カテゴリ管理','設定']
const click=(page,t)=>page.evaluate(t=>{const v=e=>e.offsetParent!==null;const cs=[...document.querySelectorAll('button,a,[role=button]')].filter(v);let el=cs.find(e=>e.textContent.trim()===t)||cs.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+18);if(!el){const a=[...document.querySelectorAll('div,span,li')].filter(v);el=a.find(e=>e.textContent.trim()===t)||a.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+14)}if(el){el.click();return true}return false},t)
const expand=(page)=>page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim().startsWith('管理・設定')&&e.offsetParent);if(b)b.click()})
;(async()=>{
  await new Promise(r=>server.listen(PORT,r))
  const errors=[]; let cur='-'
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']})
  const page=await b.newPage(); await page.setViewport({width:1500,height:1000})
  page.on('console',m=>{if(m.type()==='error'){const t=m.text();if(!/favicon|unpkg|jsdelivr|cloudflare|tailwind|tabler|net::ERR/.test(t))errors.push({page:cur,msg:t.slice(0,200)})}})
  page.on('pageerror',e=>errors.push({page:cur,msg:String(e.message||e).slice(0,160),stack:String(e.stack||'').split('\n').slice(1,3).join(' | ')}))
  await page.goto(`http://localhost:${PORT}/`,{waitUntil:'networkidle2',timeout:60000})
  if(!(await page.evaluate(()=>!!document.querySelector('.main')))){
    await page.waitForSelector('input[type=email]',{timeout:30000});await page.type('input[type=email]','demo@syatyo-suport.jp');await page.type('input[type=password]','demo1234')
    await page.evaluate(()=>{const x=[...document.querySelectorAll('button[type=submit]')].find(b=>/ログイン/.test(b.textContent));if(x)x.click()})
    for(let i=0;i<40;i++){if(await page.evaluate(()=>!!document.querySelector('.main')))break;await sleep(500)}
  }
  // 完全に空にする（新規ユーザー相当）
  await page.evaluate(()=>{Object.keys(localStorage).filter(k=>k.startsWith('farm_')).forEach(k=>localStorage.removeItem(k))})
  await page.reload({waitUntil:'networkidle2'});await sleep(1500);await expand(page);await sleep(300)
  const badScan=()=>page.evaluate(()=>{const m=document.querySelector('.main');if(!m)return{hasMain:false,bad:''};const t=m.innerText;const hits=[];[/NaN/,/Infinity/,/undefined/,/\[object Object\]/].forEach(re=>{const mm=t.match(re);if(mm)hits.push(mm[0])});return{hasMain:true,bad:[...new Set(hits)].join(',')}})
  const sweep=[]
  for(const label of NAV){ cur=label; const ok=await click(page,label); await sleep(600); const s=await badScan(); sweep.push({label,clicked:ok,...s}) }
  const white=sweep.filter(r=>!r.hasMain).map(r=>r.label)
  const bad=sweep.filter(r=>r.bad).map(r=>r.label+':'+r.bad)
  const notClicked=sweep.filter(r=>r.clicked===false).map(r=>r.label)
  console.log('QAEMPTY_START')
  console.log(JSON.stringify({white,bad,notClicked,errorCount:errors.length,errors:errors.slice(0,30)},null,2))
  console.log('QAEMPTY_END')
  await b.close();server.close()
})().catch(e=>{console.error('RUNERR',e);process.exit(1)})
