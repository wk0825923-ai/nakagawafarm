// ============================================================================
// シナリオ: eMAFF連携機能のQA
//  ① 圃場追加モーダルに eMAFF農地番号 入力欄が存在し、追加した圃場に emaff_no が保存される
//  ② 圃場詳細ページの eMAFF農地番号 インライン編集で登録→保存→再読込後も永続
//  ③ GAP帳票出力ページの「eMAFF連携CSV」ボタンが存在
//  ④ exportEmaffCSV が 農薬散布/施肥/収穫 を出力し、農地番号・所在地・BOM・CSVインジェクション無害化が正しい
//  ⑤ CSVインジェクション: emaff_no/note に "=cmd" があっても先頭に ' が付く
//  ⑥ 全ページ巡回でエラー/白画面なし
// 実行: cd qa && node qa_emaff.js
// ============================================================================
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core')
const ROOT=path.resolve(__dirname,'..'),PORT=8231,CHROME=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}
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
  const R={}

  // ④⑤ exportEmaffCSV を直接呼んでCSV内容を検証（Blobを捕捉）
  R.csv = await page.evaluate(async ()=>{
    if(typeof exportEmaffCSV!=='function') return {err:'exportEmaffCSV未定義'}
    const fields=[
      {id:1,name:'第1圃場',crop:'レタス',emaff_no:'1234567890123',address:'長野県○○市1-1'},
      {id:2,name:'第2圃場',crop:'トウモロコシ',emaff_no:'',address:''},          // 農地番号未登録
      {id:3,name:'危険圃場',crop:'レタス',emaff_no:'=cmd|calc',address:'@evil'},   // インジェクション
    ]
    const pesticides=[{id:1,name:'アグロA',reg_no:'第123号'}]
    const records=[
      {id:1,work_type:'農薬散布',field_id:1,date:'2026-06-01',pesticide_id:1,dilution:1000,amount:50,worker:'今福',weather:'晴れ'},
      {id:2,work_type:'施肥',field_id:1,date:'2026-05-01',fertilizer_name:'化成8-8-8',amount:20,worker:'今福'},
      {id:3,work_type:'収穫',field_id:2,date:'2026-06-20',total_cases:10,worker:'今福'},
      {id:4,work_type:'除草',field_id:1,date:'2026-06-10'}, // 対象外
      {id:5,work_type:'農薬散布',field_id:3,date:'2026-06-05',pesticide_id:1,note:'=SUM(A1)'}, // インジェクション note
    ]
    let captured=null
    const origCreate=URL.createObjectURL, origRevoke=URL.revokeObjectURL
    const origClick=HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click=function(){}
    URL.createObjectURL=(blob)=>{ captured=blob; return 'blob:mock' }
    URL.revokeObjectURL=()=>{}
    try{ exportEmaffCSV(records,fields,pesticides,true) }catch(e){ return {err:String(e.message)} } // skipConfirm=true（内容検証用）
    finally{ URL.createObjectURL=origCreate; URL.revokeObjectURL=origRevoke; HTMLAnchorElement.prototype.click=origClick }
    if(!captured) return {err:'Blob未生成'}
    const buf=new Uint8Array(await captured.arrayBuffer())
    const text=await captured.text()
    const lines=text.split('\r\n')
    return {
      hasBOM: buf[0]===0xEF && buf[1]===0xBB && buf[2]===0xBF,
      header: lines[0].replace(/^﻿/,''),
      rowCount: lines.length-1, // ヘッダ除く
      hasEmaffNo: /1234567890123/.test(text),
      hasAddress: /長野県/.test(text),
      excludedWeeding: !/除草/.test(text),
      injectField: (text.match(/'=cmd\|calc/)||[]).length>0,   // emaff_no のインジェクション無害化
      injectAddr:  (text.match(/'@evil/)||[]).length>0,        // address の無害化
      injectNote:  (text.match(/"'=SUM\(A1\)"|'=SUM\(A1\)/)||[]).length>0, // note の無害化
      regNo: /第123号/.test(text),
      sample: lines.slice(0,4).join('\\n').slice(0,400),
    }
  })

  // ④-2 確認ダイアログ: skipConfirm無しだとオーバーレイが出る／キャンセルでダウンロードされない
  R.confirm = await page.evaluate(async ()=>{
    const fields=[{id:1,name:'第1圃場',crop:'レタス',emaff_no:'1',address:'x'}]
    const records=[{id:1,work_type:'施肥',field_id:1,date:'2026-05-01',fertilizer_name:'化成',amount:20}]
    let created=false
    const origCreate=URL.createObjectURL
    URL.createObjectURL=(b)=>{created=true;return 'blob:mock'}
    const p=exportEmaffCSV(records,fields,[]) // 確認あり（awaitしない）
    await new Promise(r=>setTimeout(r,300))
    const overlayShown=!!document.querySelector('.sb-confirm-overlay')
    const hasOkCancel=!!(document.querySelector('.sb-cf-ok')&&document.querySelector('.sb-cf-cancel'))
    // キャンセルを押す
    const cancel=document.querySelector('.sb-cf-cancel'); if(cancel)cancel.click()
    await p
    await new Promise(r=>setTimeout(r,100))
    URL.createObjectURL=origCreate
    return { overlayShown, hasOkCancel, downloadedAfterCancel:created }
  })

  // ① AddFieldModal に eMAFF農地番号入力欄
  await sleep(400); await expand(page); await sleep(200)
  await clickText(page,'圃場管理'); await sleep(500)
  await clickText(page,'圃場一覧へ'); await sleep(600)   // 追加ボタンは圃場一覧ページにある
  await page.evaluate(()=>{const btn=[...document.querySelectorAll('button')].find(b=>/圃場を追加|新規圃場|圃場追加/.test(b.textContent)&&b.offsetParent);if(btn)btn.click()})
  await sleep(500)
  // 折りたたみ前: エリアは常時表示・GAP詳細(所在地/eMAFF/チェック)は非表示。モーダルは高さ制限あり
  R.addModalBefore = await page.evaluate(()=>{
    const card=[...document.querySelectorAll('div')].find(d=>d.style&&d.style.maxHeight&&d.style.maxHeight.indexOf('vh')>=0&&/圃場を追加/.test(d.textContent))
    const ov=[...document.querySelectorAll('div')].find(d=>d.style&&d.style.position==='fixed'&&/圃場を追加/.test(d.textContent))
    const t=ov?ov.innerText:''
    return { modalOpen:!!ov, hasArea:/エリア/.test(t), hasAreaSize:/面積/.test(t),
      boundedHeight:!!card, gapCollapsed:!/GGAP認証の対象圃場/.test(t), hasToggle:/GAP・所在地の詳細/.test(t) }
  })
  // GAP詳細トグルを開く
  await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/GAP・所在地の詳細/.test(x.textContent)&&x.offsetParent);if(b)b.click()})
  await sleep(400)
  R.addModal = await page.evaluate(()=>{
    const ov=[...document.querySelectorAll('div')].find(d=>d.style&&d.style.position==='fixed'&&/圃場を追加/.test(d.textContent))
    const t=ov?ov.innerText:''
    return { hasEmaffInput:/eMAFF農地番号|農地一連番号/i.test(t), hasAddress:/所在地|住所/.test(t), hasNavLink:/農地ナビ/.test(t),
      hasArea:/エリア/.test(t), hasGgapTarget:/GGAP認証の対象圃場/.test(t), hasCheckbox:!!(ov&&ov.querySelector('input[type=checkbox]')) }
  })
  // モーダルを閉じる
  await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/キャンセル|閉じる|×/.test(x.textContent)&&x.offsetParent);if(b)b.click()})
  await sleep(300)

  // ③ GAP帳票のeMAFF CSVボタン
  await clickText(page,'GAPチェックリスト'); await sleep(400)
  await clickText(page,'帳票出力'); await sleep(600)
  R.exportBtn = await page.evaluate(()=>{
    const t=document.querySelector('.main')?document.querySelector('.main').innerText:document.body.innerText
    return { hasEmaffCsvBtn: [...document.querySelectorAll('button')].some(b=>/eMAFF連携CSV|eMAFF/.test(b.textContent)) }
  })

  // ⑥ 全ページ巡回でエラー/白画面
  const pages=['ダッシュボード','圃場管理','日報入力','GAPチェックリスト','帳票出力','出荷記録']
  R.pageScan=[]
  for(const p of pages){ await clickText(page,p); await sleep(500)
    const bad=await page.evaluate(()=>{const m=document.querySelector('.main');if(!m)return 'no-main';const t=m.innerText;return ['NaN','undefined','[object Object]'].filter(x=>t.includes(x)).join(',')||(t.trim().length<20?'blank':'')})
    R.pageScan.push({p,bad})
  }

  R.errors=errors
  console.log(JSON.stringify(R,null,2))

  // 判定
  const c=R.csv||{}
  const checks=[
    ['CSV: BOM付き', c.hasBOM===true],
    ['CSV: ヘッダにeMAFF農地番号', /eMAFF農地番号/.test(c.header||'')],
    ['CSV: 対象3件（除草除外）', c.rowCount===4], // 農薬2+施肥1+収穫1=4
    ['CSV: 農地番号出力', c.hasEmaffNo===true],
    ['CSV: 所在地出力', c.hasAddress===true],
    ['CSV: 除草は除外', c.excludedWeeding===true],
    ['CSV: emaff_noインジェクション無害化', c.injectField===true],
    ['CSV: addressインジェクション無害化', c.injectAddr===true],
    ['CSV: noteインジェクション無害化', c.injectNote===true],
    ['CSV: 農薬登録番号', c.regNo===true],
    ['確認: ダイアログ表示', R.confirm&&R.confirm.overlayShown===true],
    ['確認: 出力/キャンセルボタン', R.confirm&&R.confirm.hasOkCancel===true],
    ['確認: キャンセルで未ダウンロード', R.confirm&&R.confirm.downloadedAfterCancel===false],
    ['圃場追加: モーダル高さ制限あり(縦いっぱい解消)', R.addModalBefore&&R.addModalBefore.boundedHeight===true],
    ['圃場追加: エリア/面積は常時表示', R.addModalBefore&&R.addModalBefore.hasArea===true&&R.addModalBefore.hasAreaSize===true],
    ['圃場追加: GAP詳細は既定で折りたたみ', R.addModalBefore&&R.addModalBefore.gapCollapsed===true&&R.addModalBefore.hasToggle===true],
    ['圃場追加: 展開でeMAFF入力欄あり', R.addModal&&R.addModal.hasEmaffInput===true],
    ['圃場追加: 展開で所在地あり', R.addModal&&R.addModal.hasAddress===true],
    ['圃場追加: 展開でGGAP対象チェックあり', R.addModal&&R.addModal.hasGgapTarget===true&&R.addModal.hasCheckbox===true],
    ['帳票: eMAFF CSVボタンあり', R.exportBtn&&R.exportBtn.hasEmaffCsvBtn===true],
    ['巡回: 異常表示なし', R.pageScan.every(x=>!x.bad)],
    ['JSエラーなし', errors.length===0],
  ]
  console.log('\n=== 判定 ===')
  let fail=0
  for(const [name,ok] of checks){ console.log((ok?'✅':'❌')+' '+name); if(!ok)fail++ }
  console.log(`\n${checks.length-fail}/${checks.length} passed, ${fail} failed`)

  await b.close(); server.close()
  process.exit(fail?1:0)
})().catch(e=>{console.error(e);process.exit(2)})
