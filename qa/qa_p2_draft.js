// ============================================================================
// シナリオ: 星5ロードマップ P2「電波が弱くても入力が消えない安心」
//  ① 日報入力で作業内容/メモを入れると下書きが自動保存される（farm_recordform_draft_）
//  ② 下書き保存済みの見える化が出る
//  ③ リロード後に「入力途中の下書き」バナーが出る → 復元でメモ等が戻る
//  ④ 破棄でバナーが消え下書きも消える
//  ⑤ 保存(記録確定)すると下書きが消える（次回バナーが出ない）
//  ⑥ 写真は下書きに含めない（容量肥大回避）
//  ⑦ 未入力(pristine)では下書きを作らない＝バナー誤出を防ぐ
// 実行: cd qa && node qa_p2_draft.js
// ============================================================================
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core')
const ROOT=path.resolve(__dirname,'..'),PORT=8237,CHROME=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){r.writeHead(404);r.end('404');return}r.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'});r.end(d)})})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const clickText=(page,t)=>page.evaluate(t=>{const v=e=>e.offsetParent!==null;const cs=[...document.querySelectorAll('button,a,[role=button]')].filter(v);let el=cs.find(e=>e.textContent.trim()===t)||cs.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+18);if(el){el.click();return true}return false},t)
const ensureApp=async(page)=>{ if(!(await page.evaluate(()=>!!document.querySelector('.main')))){
  await page.waitForSelector('input[type=email]',{timeout:30000});await page.type('input[type=email]','demo@syatyo-suport.jp');await page.type('input[type=password]','demo1234')
  await page.evaluate(()=>{const x=[...document.querySelectorAll('button[type=submit]')].find(b=>/ログイン/.test(b.textContent));if(x)x.click()})
  for(let i=0;i<40;i++){if(await page.evaluate(()=>!!document.querySelector('.main')))break;await sleep(500)} } }
const openDaily=async(page)=>{ await clickText(page,'日報入力'); await sleep(800) }
const typeNote=async(page,txt)=>{ await page.evaluate((txt)=>{const ta=[...document.querySelectorAll('textarea,input')].find(e=>/メモ|備考|note/i.test(e.placeholder||'')|| (e.tagName==='TEXTAREA'));if(ta){const s=Object.getOwnPropertyDescriptor(ta.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype,'value').set;s.call(ta,txt);ta.dispatchEvent(new Event('input',{bubbles:true}))}},txt) }
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
  const draftKey='farm_recordform_draft_'+farmId
  // 圃場1件seed＋下書きクリア
  await page.evaluate((fid,dk)=>{
    localStorage.setItem('farm_fields_v2_'+fid, JSON.stringify([{id:1,name:'第1圃場',field_no:'1',crop:'レタス',area_are:10,color:'#0D9972',row_count:12,crop_category:'leaf_veg'}]))
    localStorage.setItem('farm_records_'+fid, JSON.stringify([]))
    localStorage.removeItem(dk)
  }, farmId, draftKey)
  await page.reload({waitUntil:'networkidle2'}); await sleep(1000)
  const R={}

  // ⑦ pristineでは下書きを作らない
  await openDaily(page)
  await sleep(400)
  R.pristineNoDraft = await page.evaluate((dk)=>localStorage.getItem(dk)===null, draftKey)

  // 圃場チップを選択（グリッド内）→ 次へ → 作業種別「除草」
  const selectField=async()=>{ await page.evaluate(()=>{const grid=[...document.querySelectorAll('div')].find(d=>d.style&&d.style.maxHeight==='240px');if(grid){const chip=[...grid.children].find(c=>/第1圃場/.test(c.textContent));if(chip)chip.click()}}) }
  await selectField(); await sleep(300)
  await clickText(page,'次へ'); await sleep(500)
  await clickText(page,'除草'); await sleep(400)   // work_type=除草 → 下書きに載る（step2>1でも載る）

  // ① 下書き自動保存 ⑥ 写真除外
  R.draftWritten = await page.evaluate((dk)=>{const d=localStorage.getItem(dk);if(!d)return null;const o=JSON.parse(d);return{has:true,work:(o.form&&o.form.work_type)||'',photos:(o.form&&o.form.photos)?o.form.photos.length:0,step:o.step}}, draftKey)
  // ② 見える化
  R.savedIndicator = await page.evaluate(()=>/下書きを自動保存|自動保存しました/.test(document.querySelector('.main').innerText))

  // ③ リロード → 復元バナー
  await page.reload({waitUntil:'networkidle2'}); await sleep(1000)
  await openDaily(page); await sleep(500)
  R.bannerShown = await page.evaluate(()=>/入力途中の下書きが残っています/.test(document.querySelector('.main').innerText))
  // 復元 → 作業種別(除草)が戻る
  await clickText(page,'復元する'); await sleep(600)
  R.restored = await page.evaluate((dk)=>{const t=document.querySelector('.main').innerText;const d=localStorage.getItem(dk);const o=d?JSON.parse(d):null;return{workBack:(o&&o.form&&o.form.work_type==='除草')||/除草/.test(t), bannerGone:!/入力途中の下書きが残っています/.test(t)}}, draftKey)

  // ⑤ 保存すると下書きが消える（step2→3→4: 次へ→確認 →→保存する まで進める）
  for(let i=0;i<6;i++){
    if(await clickText(page,'保存する')){ break }
    if(await clickText(page,'確認')){ await sleep(450); continue }
    if(await clickText(page,'次へ')){ await sleep(450); continue }
    break
  }
  await sleep(1000)
  R.draftClearedOnSave = await page.evaluate((dk)=>localStorage.getItem(dk)===null, draftKey)

  // ④ 破棄: 新たに下書きを作ってリロード→破棄
  await page.evaluate((dk)=>localStorage.setItem(dk, JSON.stringify({form:{work_type:'除草',note:'破棄テスト',field_id:'1',field_ids:[1],photos:[]},step:2,dilution:1000,savedAt:Date.now()})), draftKey)
  await page.reload({waitUntil:'networkidle2'}); await sleep(1000)
  await openDaily(page); await sleep(500)
  await clickText(page,'破棄'); await sleep(400)
  R.discarded = await page.evaluate((dk)=>({gone:localStorage.getItem(dk)===null, bannerGone:!/入力途中の下書きが残っています/.test(document.querySelector('.main').innerText)}), draftKey)

  R.errors=errors
  console.log(JSON.stringify(R,null,2))
  const checks=[
    ['pristineでは下書き未作成', R.pristineNoDraft===true],
    ['作業内容で下書き自動保存', R.draftWritten&&R.draftWritten.has===true],
    ['下書きに作業種別が入る', R.draftWritten&&R.draftWritten.work==='除草'],
    ['写真は下書きに含めない', R.draftWritten&&R.draftWritten.photos===0],
    ['下書き保存の見える化表示', R.savedIndicator===true],
    ['リロード後に復元バナー', R.bannerShown===true],
    ['復元で作業種別が戻る', R.restored&&R.restored.workBack===true],
    ['復元でバナーが消える', R.restored&&R.restored.bannerGone===true],
    ['保存で下書きがクリアされる', R.draftClearedOnSave===true],
    ['破棄で下書きが消える', R.discarded&&R.discarded.gone===true&&R.discarded.bannerGone===true],
    ['JSエラーなし', errors.length===0],
  ]
  console.log('\n=== 判定 ===')
  let fail=0
  for(const [n,ok] of checks){ console.log((ok?'✅':'❌')+' '+n); if(!ok)fail++ }
  console.log(`\n${checks.length-fail}/${checks.length} passed, ${fail} failed`)
  await b.close(); server.close(); process.exit(fail?1:0)
})().catch(e=>{console.error(e);process.exit(2)})
