// P5 補助プローブ: 現場モードON時に .main 内の小さな固定サイズボタンが min-height:46px で
// 過大化/形状破壊しないかを実測する。特に AddFieldModal のマップ色スウォッチ(26x26円)。
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core')
const ROOT=path.resolve(__dirname,'..'),PORT=8242,CHROME=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){r.writeHead(404);r.end('404');return}r.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'});r.end(d)})})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const clickText=(page,t)=>page.evaluate(t=>{const v=e=>e.offsetParent!==null;const cs=[...document.querySelectorAll('button,a,[role=button]')].filter(v);let el=cs.find(e=>e.textContent.trim()===t)||cs.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+18);if(el){el.click();return true}return false},t)
const expand=(page)=>page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim().startsWith('管理・設定')&&e.offsetParent);if(b)b.click()})
const ensureApp=async(page)=>{ if(!(await page.evaluate(()=>!!document.querySelector('.main')))){
  await page.waitForSelector('input[type=email]',{timeout:30000});await page.type('input[type=email]','demo@syatyo-suport.jp');await page.type('input[type=password]','demo1234')
  await page.evaluate(()=>{const x=[...document.querySelectorAll('button[type=submit]')].find(b=>/ログイン/.test(b.textContent));if(x)x.click()})
  for(let i=0;i<40;i++){if(await page.evaluate(()=>!!document.querySelector('.main')))break;await sleep(500)} } }
const setFM=(page,on)=>page.evaluate(on=>{const b=document.getElementById('sb-field-mode-toggle');const cur=document.body.classList.contains('field-mode');if(cur!==on&&b)b.click()},on)
async function openAddModal(page){
  // 圃場マップページへ → 「圃場を追加/＋」ボタン、無ければ地図の空状態ボタン
  await expand(page); await sleep(200)
  await clickText(page,'圃場マップ'); await sleep(900)
  let ok=await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.offsetParent&&/圃場を追加|最初の圃場|＋ 圃場|\+ 圃場/.test(e.textContent));if(b){b.click();return true}return false})
  if(!ok){ ok=await clickText(page,'圃場を追加') }
  await sleep(600)
  return await page.evaluate(()=>{const h=[...document.querySelectorAll('div')].find(d=>/➕ 圃場を追加/.test(d.textContent||''));return !!h})
}
function measure(page){return page.evaluate(()=>{
  const out={}
  // マップ色スウォッチ = 26x26 の円ボタン（inline height:26px, border-radius:50%）
  const swatches=[...document.querySelectorAll('button')].filter(b=>{const s=b.getAttribute('style')||'';return /width:\s*26px/.test(s)&&/border-radius:\s*50%/.test(s)&&b.offsetParent})
  out.swatchN=swatches.length
  out.swatchBoxes=swatches.slice(0,3).map(b=>{const r=b.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height)}})
  // .main 内で、算出高さが本来の想定より極端に大きい小ボタンの検出（w<32 かつ h>=44）
  const tiny=[...document.querySelectorAll('.main button')].filter(b=>{const r=b.getBoundingClientRect();return b.offsetParent&&r.width>0&&r.width<32&&r.height>=44})
  out.inflatedTinyN=tiny.length
  out.inflatedSamples=tiny.slice(0,4).map(b=>{const r=b.getBoundingClientRect();return {t:(b.textContent||'').trim().slice(0,4),w:Math.round(r.width),h:Math.round(r.height)}})
  return out
})}
;(async()=>{
  await new Promise(r=>server.listen(PORT,r))
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']})
  const page=await b.newPage(); await page.setViewport({width:390,height:820,isMobile:true})
  await page.goto(`http://localhost:${PORT}/`,{waitUntil:'networkidle2',timeout:60000})
  await ensureApp(page)
  await page.evaluate(()=>{localStorage.setItem('sb_field_mode','0');document.body.classList.remove('field-mode')})
  await page.reload({waitUntil:'networkidle2'}); await sleep(1200); await ensureApp(page)
  const R={}
  // OFFで開いて基準を測る
  R.openedOff=await openAddModal(page)
  await setFM(page,false); await sleep(200)
  R.off=await measure(page)
  // 同モーダルを開いたままONにして測る
  await setFM(page,true); await sleep(300)
  R.on=await measure(page)
  console.log(JSON.stringify(R,null,2))
  await b.close(); server.close(); process.exit(0)
})().catch(e=>{console.error(e);process.exit(2)})
