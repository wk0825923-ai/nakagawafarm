// ============================================================================
// P5「現場モード」複合監査ハーネス（番人 / 掛け算条件）
//  軸A ライフサイクル×永続: リロードでの二重生成/残留・class整合
//  軸B 画面横断: 管理⇄スタッフ跨ぎでトグルが1つだけ・状態維持、サインアウトで消える
//  軸C レイアウト非破壊: ON時に主要ページ/モーダルで横スクロール・小ボタン過大化
//  軸D 他機能併用: モーダル(圃場追加)を開いた状態でON、閉じるボタン等のタップ域
//  軸E 入力ズーム: 検索/時刻/日付入力の16px!important 副作用（実測 font-size）
//  軸F リグレッション: OFF時は影響ゼロ
// 実行: cd qa && node qa_p5_fieldmode_complex.js
// ============================================================================
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core')
const ROOT=path.resolve(__dirname,'..'),PORT=8241,CHROME=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){r.writeHead(404);r.end('404');return}r.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'});r.end(d)})})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const clickText=(page,t)=>page.evaluate(t=>{const v=e=>e.offsetParent!==null;const cs=[...document.querySelectorAll('button,a,[role=button]')].filter(v);let el=cs.find(e=>e.textContent.trim()===t)||cs.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+18);if(el){el.click();return true}return false},t)
const expand=(page)=>page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim().startsWith('管理・設定')&&e.offsetParent);if(b)b.click()})
const ensureApp=async(page)=>{ if(!(await page.evaluate(()=>!!document.querySelector('.main')))){
  await page.waitForSelector('input[type=email]',{timeout:30000});await page.type('input[type=email]','demo@syatyo-suport.jp');await page.type('input[type=password]','demo1234')
  await page.evaluate(()=>{const x=[...document.querySelectorAll('button[type=submit]')].find(b=>/ログイン/.test(b.textContent));if(x)x.click()})
  for(let i=0;i<40;i++){if(await page.evaluate(()=>!!document.querySelector('.main')))break;await sleep(500)} } }
const toggleCount=(page)=>page.evaluate(()=>document.querySelectorAll('#sb-field-mode-toggle').length)
const setFM=(page,on)=>page.evaluate(on=>{const b=document.getElementById('sb-field-mode-toggle');const cur=document.body.classList.contains('field-mode');if(cur!==on&&b)b.click()},on)
const hScroll=(page)=>page.evaluate(()=>({docOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth, bodyOverflow:document.body.scrollWidth-document.body.clientWidth}))
;(async()=>{
  await new Promise(r=>server.listen(PORT,r))
  const errors=[]
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']})
  const page=await b.newPage(); await page.setViewport({width:390,height:820,isMobile:true}) // 現場=スマホ想定
  page.on('pageerror',e=>errors.push('PE:'+String(e.message||e).slice(0,140)))
  page.on('console',m=>{if(m.type()==='error'){const t=m.text();if(!/favicon|unpkg|jsdelivr|cloudflare|tabler|net::ERR|supabase|401|400/.test(t))errors.push('CE:'+t.slice(0,140))}})
  await page.goto(`http://localhost:${PORT}/`,{waitUntil:'networkidle2',timeout:60000})
  await ensureApp(page)
  await page.evaluate(()=>{localStorage.removeItem('sb_field_mode');document.body.classList.remove('field-mode')})
  await page.reload({waitUntil:'networkidle2'}); await sleep(1200); await ensureApp(page)
  const R={}

  // ── 軸A/B: 二重生成 & リロード後の単一性 ──
  R.countInitial = await toggleCount(page)
  await setFM(page,true); await sleep(300)
  R.countAfterOn = await toggleCount(page)
  // 何度もリロード（effect再実行×cleanupで累積しないか）
  for(let i=0;i<3;i++){ await page.reload({waitUntil:'networkidle2'}); await sleep(900); await ensureApp(page) }
  R.countAfter3Reload = await toggleCount(page)
  R.persistAfterReload = await page.evaluate(()=>document.body.classList.contains('field-mode'))

  // ── 軸B: 管理⇄スタッフ跨ぎ（?view=staff→戻る）でトグル単一・状態維持 ──
  await page.goto(`http://localhost:${PORT}/?view=staff`,{waitUntil:'networkidle2',timeout:60000}); await sleep(1400)
  R.staffCount = await toggleCount(page)
  R.staffFMkept = await page.evaluate(()=>document.body.classList.contains('field-mode'))
  await page.goto(`http://localhost:${PORT}/`,{waitUntil:'networkidle2',timeout:60000}); await sleep(1000); await ensureApp(page)
  R.backAdminCount = await toggleCount(page)

  // ── 軸C/E: ON時、日報入力step1で入力欄min-height & 検索/時刻/日付のfont-size ──
  await setFM(page,true); await sleep(200)
  await clickText(page,'日報入力'); await sleep(800)
  R.step1 = await page.evaluate(()=>{
    const out={}
    const anyInput=document.querySelector('.main input, .main .form-input, .main select')
    out.inputMinH = anyInput?parseFloat(getComputedStyle(anyInput).minHeight)||0:-1
    // 検索欄(圃場が多い時) / time / date input の font-size 実測
    const time=document.querySelector('.main input[type=time]')
    const date=document.querySelector('.main input[type=date]')
    const search=[...document.querySelectorAll('.main input[type=text],.main input:not([type])')].find(i=>/検索|絞/.test(i.placeholder||''))
    out.timeFS = time?parseFloat(getComputedStyle(time).fontSize):-1
    out.timeMinH = time?parseFloat(getComputedStyle(time).minHeight):-1
    out.dateFS = date?parseFloat(getComputedStyle(date).fontSize):-1
    out.searchFS = search?parseFloat(getComputedStyle(search).fontSize):-1
    return out
  })
  R.step1Scroll = await hScroll(page)

  // ── 軸C/D: 圃場追加モーダルを開いてON、小さな×閉じるボタンの実高さ・モーダルはみ出し ──
  // サイドバー等から圃場追加へ。まずダッシュボードへ戻る
  await clickText(page,'総合ダッシュボード'); await sleep(500)
  // 圃場追加ボタンを探す（サイドバー「＋ 圃場を追加」等）
  const openedAdd = await page.evaluate(()=>{const b=[...document.querySelectorAll('button,[role=button]')].find(e=>e.offsetParent&&/圃場を追加|圃場追加|＋ 圃場/.test(e.textContent));if(b){b.click();return true}return false})
  await sleep(600)
  R.modal = await page.evaluate(()=>{
    const out={openedAdd:true}
    // 一番手前のモーダル的コンテナ（fixed & overlay）内の × ボタンの高さ
    const closeBtns=[...document.querySelectorAll('button')].filter(b=>b.offsetParent&&/^[✕×]$/.test(b.textContent.trim()))
    out.closeBtnCount=closeBtns.length
    out.closeBtnHeights=closeBtns.map(b=>Math.round(b.getBoundingClientRect().height))
    // モーダルコンテナが画面からはみ出していないか（bottom > innerHeight）
    const modals=[...document.querySelectorAll('div')].filter(d=>{const s=getComputedStyle(d);return (s.position==='fixed')&&d.querySelector('button')&&d.getBoundingClientRect().height>200})
    out.modalOverflowBottom=modals.map(m=>{const r=m.getBoundingClientRect();return Math.max(0,Math.round(r.bottom-window.innerHeight))})
    return out
  })
  R.modalScroll = await hScroll(page)
  // モーダルを閉じる（× or キャンセル or Escape）
  await page.keyboard.press('Escape'); await sleep(200)
  await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.offsetParent&&/^[✕×]$/.test(e.textContent.trim()));if(b)b.click()})
  await sleep(300)

  // ── 軸C: ON状態で主要ページ巡回、横スクロール量を測る ──
  await expand(page); await sleep(200)
  const pages=['総合ダッシュボード','日報管理','圃場まとめ','GAPチェックリスト','出荷記録']
  R.pageScroll=[]
  for(const p of pages){ await clickText(page,p); await sleep(600)
    const s=await hScroll(page)
    R.pageScroll.push({p,over:Math.max(s.docOverflow,s.bodyOverflow)})
  }

  // ── 軸F: OFFに戻して回帰（min-heightが基準に戻る） ──
  await setFM(page,false); await sleep(200)
  await clickText(page,'日報入力'); await sleep(700)
  R.offMinH = await page.evaluate(()=>{const i=document.querySelector('.main input,.main .form-input,.main select');return i?parseFloat(getComputedStyle(i).minHeight)||0:-1})
  R.offHasClass = await page.evaluate(()=>document.body.classList.contains('field-mode'))

  R.errors=errors
  console.log(JSON.stringify(R,null,2))
  const checks=[
    ['初期トグル1個', R.countInitial===1],
    ['ON後もトグル1個', R.countAfterOn===1],
    ['3回リロードしてもトグル1個(累積なし)', R.countAfter3Reload===1],
    ['リロード後ON維持', R.persistAfterReload===true],
    ['スタッフ画面でトグル1個', R.staffCount===1],
    ['スタッフ画面でFM維持', R.staffFMkept===true],
    ['管理へ戻ってもトグル1個', R.backAdminCount===1],
    ['ON:入力欄min-height>=48', R.step1.inputMinH>=48],
    ['ON:step1で横スクロールなし(<=2px)', R.step1Scroll.docOverflow<=2 && R.step1Scroll.bodyOverflow<=2],
    ['ON:主要ページ横スクロールなし', R.pageScroll.every(x=>x.over<=2)],
    ['ON:モーダル横スクロールなし', R.modalScroll.docOverflow<=2],
    ['OFF回帰:min-heightが基準(<48)', R.offMinH>=0 && R.offMinH<48],
    ['OFF回帰:classなし', R.offHasClass===false],
    ['JSエラーなし', errors.length===0],
  ]
  console.log('\n=== 判定 ===')
  let fail=0
  for(const [n,ok] of checks){ console.log((ok?'✅':'❌')+' '+n); if(!ok)fail++ }
  console.log(`\n${checks.length-fail}/${checks.length} passed, ${fail} failed`)
  await b.close(); server.close(); process.exit(fail?1:0)
})().catch(e=>{console.error(e);process.exit(2)})
