// P5 CSSルール真偽判定（合成DOM）: 実アプリのナビに依存せず、app.css を読み込んだ
// ページに .main と代表的な小ボタンを注入し、body.field-mode ON/OFF で算出寸法を測る。
// 検証対象: min-height:46px が inline height:26px の円ボタンを縦に引き伸ばすか等。
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core')
const ROOT=path.resolve(__dirname,'..'),PORT=8243,CHROME=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'
const css=fs.readFileSync(path.join(ROOT,'css','app.css'),'utf8')
const HTML=`<!doctype html><html><head><meta charset=utf8><style>:root{--border-color:#E5E7EB;--radius-md:10px}${css}</style></head>
<body><main class="main">
  <button id="swatch" style="width:26px;height:26px;border-radius:50%;background:#f00;border:2px solid #000;cursor:pointer"></button>
  <button id="chip" style="padding:6px 12px;border-radius:16px;font-size:12px">栽培中</button>
  <button id="closex" style="background:none;border:none;font-size:16px;padding:2px">✕</button>
  <button class="btn" id="primary">保存する</button>
  <input id="txt" class="form-input" type="text" placeholder="検索">
  <input id="time" type="time">
</main></body></html>`
const server=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html'});r.end(HTML)})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const measure=(page)=>page.evaluate(()=>{const g=id=>{const e=document.getElementById(id)||document.querySelector('#'+id);const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return {w:Math.round(r.width),h:Math.round(r.height),minH:cs.minHeight,fs:cs.fontSize,radius:cs.borderRadius}};return {swatch:g('swatch'),chip:g('chip'),closex:g('closex'),primary:g('primary'),txt:g('txt'),time:g('time')}})
;(async()=>{
  await new Promise(r=>server.listen(PORT,r))
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']})
  const page=await b.newPage(); await page.setViewport({width:390,height:820})
  await page.goto(`http://localhost:${PORT}/`,{waitUntil:'networkidle2'})
  const off=await measure(page)
  await page.evaluate(()=>document.body.classList.add('field-mode')); await sleep(100)
  const on=await measure(page)
  console.log(JSON.stringify({off,on},null,2))
  const isCircleBroken = on.swatch.w!==on.swatch.h && on.swatch.h>=44
  console.log('\n色スウォッチ26x26円: OFF',off.swatch.w+'x'+off.swatch.h,'/ ON',on.swatch.w+'x'+on.swatch.h, isCircleBroken?'→ ★形状破壊(縦伸び)':'→ 保持')
  console.log('×閉じ: OFF h='+off.closex.h+' / ON h='+on.closex.h, (on.closex.h>=44?'→ 過大化':'ok'))
  console.log('チップ: OFF h='+off.chip.h+' / ON h='+on.chip.h)
  console.log('time入力 font-size: OFF '+off.time.fs+' / ON '+on.time.fs)
  await b.close(); server.close(); process.exit(0)
})().catch(e=>{console.error(e);process.exit(2)})
