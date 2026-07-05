const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core')
const ROOT=require('path').resolve(__dirname, '..'),PORT=8125,CHROME=process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){res.writeHead(404);res.end('404');return}res.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'});res.end(d)})})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const click=(page,text)=>page.evaluate(t=>{const vis=e=>e.offsetParent!==null;const cs=[...document.querySelectorAll('button,a,[role=button]')].filter(vis);let el=cs.find(e=>e.textContent.trim()===t)||cs.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+18);if(!el){const all=[...document.querySelectorAll('div,span,li')].filter(vis);el=all.find(e=>e.textContent.trim()===t)||all.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+14)}if(el){el.click();return true}return false},text)
;(async()=>{
  await new Promise(r=>server.listen(PORT,r))
  const errors=[]
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']})
  const page=await b.newPage()
  page.on('pageerror',e=>errors.push(String(e.message).slice(0,120)))
  // ネイティブダイアログが出たら記録（＝モーダル化できてない証拠）
  let nativeDialog=false
  page.on('dialog',async d=>{nativeDialog=true; await d.dismiss()})
  await page.goto(`http://localhost:${PORT}/`,{waitUntil:'networkidle2',timeout:60000})
  if(!(await page.evaluate(()=>!!document.querySelector('.main')))){
    await page.waitForSelector('input[type=email]',{timeout:30000})
    await page.type('input[type=email]','demo@syatyo-suport.jp');await page.type('input[type=password]','demo1234')
    await page.evaluate(()=>{const x=[...document.querySelectorAll('button[type=submit]')].find(b=>/ログイン/.test(b.textContent));if(x)x.click()})
    for(let i=0;i<40;i++){if(await page.evaluate(()=>!!document.querySelector('.main')))break;await sleep(500)}
  }
  await click(page,'作物カテゴリ管理'); await sleep(800)
  // 新規カテゴリ追加
  await click(page,'カテゴリを追加'); await sleep(500)
  await page.type('input[placeholder*="トマト"]','テスト作物ズッキーニ'); await sleep(300)
  await click(page,'保存'); await sleep(600)
  const addCeleb=await page.evaluate(()=>({overlay:!!document.querySelector('.sb-celeb-overlay'),title:(document.querySelector('.sb-celeb-title')||{}).textContent||''}))
  await sleep(1400)
  // 追加したカテゴリの削除（✕）→ モーダルが出るか
  const delClicked=await page.evaluate(()=>{const btns=[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='✕');for(const btn of btns){let n=btn;for(let i=0;i<6&&n;i++){n=n.parentElement;if(n&&n.textContent.includes('テスト作物ズッキーニ')){btn.click();return true}}}return false})
  await sleep(600)
  const modal=await page.evaluate(()=>{const t=document.body.innerText;return {hasConfirmModal:/削除しますか/.test(t),nativeStillOpen:false}})
  console.log(JSON.stringify({addCelebration:addCeleb, deleteButtonClicked:delClicked, confirmModalShown:modal.hasConfirmModal, nativeDialogFired:nativeDialog, errors},null,2))
  await b.close(); server.close()
})().catch(e=>{console.error('ERR',e);process.exit(1)})
