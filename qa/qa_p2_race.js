// ============================================================================
// 番人 追加検証: マウント時 autosave useEffect が「未復元の下書き」を消すレース
//  懸念: 有効な下書きがある状態で日報を開くと、live formはpristine(step1)なので
//        autosave useEffect の meaningful=false 枝が localStorage.removeItem(draftKey) を実行し、
//        ユーザーが[復元/破棄]を選ぶ前に永続下書きが消える。
//        → 同画面では restorableDraft(メモリ)で復元可。だが「復元前にもう一度リロード」すると
//          下書きが消えておりバナーが出なくなる（電波弱者が二度リロードしたら復元不能）。
// 実行: cd qa && node qa_p2_race.js
// ============================================================================
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core')
const ROOT=path.resolve(__dirname,'..'),PORT=8242,CHROME=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){r.writeHead(404);r.end('404');return}r.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'});r.end(d)})})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const clickText=(page,t)=>page.evaluate(t=>{const v=e=>e.offsetParent!==null;const cs=[...document.querySelectorAll('button,a,[role=button]')].filter(v);let el=cs.find(e=>e.textContent.trim()===t)||cs.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+18);if(el){el.click();return true}return false},t)
const ensureApp=async(page)=>{ if(!(await page.evaluate(()=>!!document.querySelector('.main')))){
  await page.waitForSelector('input[type=email]',{timeout:30000});await page.type('input[type=email]','demo@syatyo-suport.jp');await page.type('input[type=password]','demo1234')
  await page.evaluate(()=>{const x=[...document.querySelectorAll('button[type=submit]')].find(b=>/ログイン/.test(b.textContent));if(x)x.click()})
  for(let i=0;i<40;i++){if(await page.evaluate(()=>!!document.querySelector('.main')))break;await sleep(500)} } }
const openDaily=async(page)=>{ await clickText(page,'日報入力'); await sleep(800) }
;(async()=>{
  await new Promise(r=>server.listen(PORT,r))
  const errors=[]
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']})
  const page=await b.newPage(); await page.setViewport({width:1400,height:1000})
  page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,150)))
  await page.goto(`http://localhost:${PORT}/`,{waitUntil:'networkidle2',timeout:60000})
  await ensureApp(page)
  const farmId=await page.evaluate(()=>(typeof CONFIG!=='undefined'&&CONFIG.CURRENT_FARM_ID)?CONFIG.CURRENT_FARM_ID:null)
  const dk='farm_recordform_draft_'+farmId
  await page.evaluate((fid)=>{localStorage.setItem('farm_fields_v2_'+fid,JSON.stringify([{id:1,name:'第1圃場',field_no:'1',crop:'レタス',area_are:10,color:'#0D9972',row_count:12,crop_category:'leaf_veg'}]));localStorage.setItem('farm_records_'+fid,JSON.stringify([]))},farmId)

  const R={}
  // 有効な下書きを植える（step2/除草/note）
  const draft=JSON.stringify({form:{work_type:'除草',note:'圏外メモ',field_id:'1',field_ids:[1],photos:[]},step:2,dilution:1000,savedAt:Date.now()})
  await page.evaluate((dk,v)=>localStorage.setItem(dk,v),dk,draft)

  // 日報を開く（この時点で restorableDraft はメモリに読まれ、バナーが出る）
  await page.reload({waitUntil:'networkidle2'}); await sleep(800)
  await openDaily(page); await sleep(700)
  R.bannerFirstOpen=await page.evaluate(()=>/入力途中の下書きが残っています/.test((document.querySelector('.main')||{}).innerText||''))
  // 開いた直後、localStorageの永続下書きはまだ残っているか？（autosave effectのpristine枝が消すか）
  R.persistedAfterOpen=await page.evaluate((dk)=>localStorage.getItem(dk),dk)

  // ★ 復元/破棄を選ばずに、もう一度リロード（電波弱者が二度読み込みしがち）
  await page.reload({waitUntil:'networkidle2'}); await sleep(800)
  await openDaily(page); await sleep(700)
  R.bannerSecondReload=await page.evaluate(()=>/入力途中の下書きが残っています/.test((document.querySelector('.main')||{}).innerText||''))
  R.persistedAfterSecond=await page.evaluate((dk)=>localStorage.getItem(dk),dk)

  R.errors=errors
  console.log(JSON.stringify({
    bannerFirstOpen:R.bannerFirstOpen,
    persistedAfterOpen: R.persistedAfterOpen? 'PRESENT' : 'GONE',
    bannerSecondReload:R.bannerSecondReload,
    persistedAfterSecond: R.persistedAfterSecond? 'PRESENT' : 'GONE',
    errors:R.errors
  },null,2))
  console.log('\n=== 診断 ===')
  console.log((R.bannerFirstOpen?'✅':'❌')+' 初回オープンでバナー表示')
  if(R.persistedAfterOpen===null) console.log('⚠️ 初回オープン直後に永続下書きが消えている（pristine autosave枝がremove）')
  else console.log('✅ 初回オープン後も永続下書き保持')
  if(!R.bannerSecondReload) console.log('❌ [レース確認] 復元前の2度目リロードでバナーが消える＝下書き復元不能（電波弱者リスク）')
  else console.log('✅ 2度目リロードでもバナー再表示（復元可）')
  await b.close(); server.close(); process.exit(0)
})().catch(e=>{console.error(e);process.exit(2)})
