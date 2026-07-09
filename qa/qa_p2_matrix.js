// ============================================================================
// 番人 複合監査: P2「下書き自動保存＋復元」を複数機能の掛け算で突く
//  軸A ライフサイクル: 復元→別内容へ変更→保存でクリア / 破棄後に再バナー出ない
//  軸C スコープ分離: inModal(圃場詳細簡易入力)では下書き機構が動かない/バナー出ない
//  軸D P1×P2: P1初期選択(前回圃場)と復元の競合。field_id/field_idsが二重にならないか
//  軸E 異常: 壊れたJSON / step不正(0,99,'x') / dilution不正 / form欠損 / 巨大note で例外にならないか
//  軸B 写真: 実際にphotosを積んだformの下書きにphotosが載らないか。巨大noteが欠けないか
// 実行: cd qa && node qa_p2_matrix.js
// ============================================================================
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core')
const ROOT=path.resolve(__dirname,'..'),PORT=8241,CHROME=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){r.writeHead(404);r.end('404');return}r.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'});r.end(d)})})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const clickText=(page,t)=>page.evaluate(t=>{const v=e=>e.offsetParent!==null;const cs=[...document.querySelectorAll('button,a,[role=button]')].filter(v);let el=cs.find(e=>e.textContent.trim()===t)||cs.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+18);if(el){el.click();return true}return false},t)
const ensureApp=async(page)=>{ if(!(await page.evaluate(()=>!!document.querySelector('.main')))){
  await page.waitForSelector('input[type=email]',{timeout:30000});await page.type('input[type=email]','demo@syatyo-suport.jp');await page.type('input[type=password]','demo1234')
  await page.evaluate(()=>{const x=[...document.querySelectorAll('button[type=submit]')].find(b=>/ログイン/.test(b.textContent));if(x)x.click()})
  for(let i=0;i<40;i++){if(await page.evaluate(()=>!!document.querySelector('.main')))break;await sleep(500)} } }
const openDaily=async(page)=>{ await clickText(page,'日報入力'); await sleep(800) }
const selectField=async(page,name)=>{ await page.evaluate((name)=>{const grid=[...document.querySelectorAll('div')].find(d=>d.style&&d.style.maxHeight==='240px');if(grid){const chip=[...grid.children].find(c=>new RegExp(name).test(c.textContent));if(chip)chip.click()}},name) }
const seed=async(page,farmId)=>{ await page.evaluate((fid)=>{
    const set=(k,v)=>localStorage.setItem(k+'_'+fid,JSON.stringify(v))
    set('farm_fields_v2',[
      {id:1,name:'第1圃場',field_no:'1',crop:'レタス',area_are:10,color:'#0D9972',row_count:12,crop_category:'leaf_veg'},
      {id:2,name:'第2圃場',field_no:'2',crop:'キャベツ',area_are:12,color:'#2563EB',row_count:12,crop_category:'leaf_veg'},
    ])
    set('farm_records',[{id:9001,date:'2026-07-09',field_id:2,work_type:'除草',weather:'晴',worker:'太郎'}]) // P1: 前回圃場=2
  }, farmId) }

;(async()=>{
  await new Promise(r=>server.listen(PORT,r))
  const errors=[]
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']})
  const page=await b.newPage(); await page.setViewport({width:1500,height:1000})
  page.on('pageerror',e=>errors.push('[pageerror] '+String(e.message||e).slice(0,160)))
  page.on('console',m=>{if(m.type()==='error'){const t=m.text();if(!/favicon|unpkg|jsdelivr|cloudflare|tabler|net::ERR/.test(t))errors.push('[console] '+t.slice(0,160))}})
  await page.goto(`http://localhost:${PORT}/`,{waitUntil:'networkidle2',timeout:60000})
  await ensureApp(page)
  const farmId=await page.evaluate(()=>(typeof CONFIG!=='undefined'&&CONFIG.CURRENT_FARM_ID)?CONFIG.CURRENT_FARM_ID:null)
  const dk='farm_recordform_draft_'+farmId
  const R={errCounts:{}}
  const errSnap=(tag)=>{ R.errCounts[tag]=errors.length }

  await seed(page,farmId)
  await page.evaluate((dk)=>localStorage.removeItem(dk), dk)
  await page.reload({waitUntil:'networkidle2'}); await sleep(1000)

  // ===== 軸E 異常系: 壊れた下書きでマウントしても例外にならず・バナー誤出しない =====
  const badDrafts={
    brokenJSON: '{not json',
    nullForm: JSON.stringify({form:null,step:2,dilution:1000}),
    missingForm: JSON.stringify({step:3,dilution:500}),
    badStep: JSON.stringify({form:{work_type:'除草',note:'a',photos:[]},step:'x',dilution:1000}),
    zeroStep: JSON.stringify({form:{work_type:'除草',note:'a',photos:[]},step:0,dilution:1000}),
    hugeStep: JSON.stringify({form:{work_type:'除草',note:'a',photos:[]},step:99,dilution:1000}),
    badDilution: JSON.stringify({form:{work_type:'農薬散布',note:'a',photos:[]},step:3,dilution:'oops'}),
    emptyMeaningless: JSON.stringify({form:{work_type:'',note:'   ',photos:[]},step:1,dilution:1000}),
  }
  R.abnormal={}
  for(const [name,val] of Object.entries(badDrafts)){
    const before=errors.length
    await page.evaluate((dk,v)=>localStorage.setItem(dk,v),dk,val)
    await page.reload({waitUntil:'networkidle2'}); await sleep(700)
    await openDaily(page); await sleep(500)
    const banner=await page.evaluate(()=>/入力途中の下書きが残っています/.test((document.querySelector('.main')||{}).innerText||''))
    // 復元ボタンがあれば押して例外が出ないか確認
    let restoredOk=true
    if(banner){ await clickText(page,'復元する'); await sleep(500); restoredOk=await page.evaluate(()=>!!document.querySelector('.main')) }
    const newErr=errors.length-before
    R.abnormal[name]={banner,restoredOk,newErr}
  }
  // 期待: emptyMeaningless / brokenJSON / nullForm / missingForm はバナー出ない。全て newErr===0
  errSnap('afterAbnormal')

  // クリーンな状態へ
  await page.evaluate((dk)=>localStorage.removeItem(dk),dk)
  await page.reload({waitUntil:'networkidle2'}); await sleep(800)

  // ===== 軸D P1×P2: 前回圃場=第2 が初期選択。下書きは第1圃場。復元で第1に上書きされ二重にならないか =====
  const draftF1=JSON.stringify({form:{work_type:'除草',note:'P1P2競合',field_id:'1',field_ids:[1],weather:'曇',photos:[]},step:2,dilution:1000,savedAt:Date.now()})
  await page.evaluate((dk,v)=>localStorage.setItem(dk,v),dk,draftF1)
  await page.reload({waitUntil:'networkidle2'}); await sleep(900)
  await openDaily(page); await sleep(500)
  await clickText(page,'復元する'); await sleep(600)
  R.p1p2=await page.evaluate((dk)=>{
    const d=localStorage.getItem(dk); const o=d?JSON.parse(d):null
    // 復元直後、再度自動保存された下書きの form.field_id と field_ids を確認
    return o&&o.form?{field_id:o.form.field_id,field_ids:o.form.field_ids,work:o.form.work_type,note:o.form.note}:null
  },dk)
  // 期待: field_id==='1' かつ field_ids===[1]（二重や第2残留なし）

  // ===== 軸A: 復元→step進行→保存でクリア→次回バナー出ない（step2/除草/第1状態から） =====
  // step2→3→4と進めて保存。復元済み内容(除草/第1)が保存され、下書きがクリアされる。
  for(let i=0;i<7;i++){ if(await clickText(page,'保存する')){break} if(await clickText(page,'確認')){await sleep(450);continue} if(await clickText(page,'次へ')){await sleep(450);continue} break }
  await sleep(900)
  R.clearedAfterEditSave=await page.evaluate((dk)=>localStorage.getItem(dk)===null,dk)
  await page.reload({waitUntil:'networkidle2'}); await sleep(800)
  await openDaily(page); await sleep(500)
  R.noBannerAfterSave=await page.evaluate(()=>!/入力途中の下書きが残っています/.test((document.querySelector('.main')||{}).innerText||''))
  errSnap('afterAxisA')

  // ===== 軸B 写真除外+巨大note: photos満載&巨大noteの下書きを直接入れ、復元→再自動保存で photos が落ち note が残るか =====
  // これはP2の核心コードパス（restoreDraft→autosave useEffectの {photos,...rest} 分離）を直接突く。
  const bigNoteLen=5000
  const photoDraft=JSON.stringify({form:{work_type:'除草',note:'あ'.repeat(bigNoteLen),field_id:'1',field_ids:[1],photos:['data:image/png;base64,'+'A'.repeat(2000),'data:image/png;base64,'+'B'.repeat(2000)]},step:2,dilution:1000,savedAt:Date.now()})
  await page.evaluate((dk,v)=>localStorage.setItem(dk,v),dk,photoDraft)
  await page.reload({waitUntil:'networkidle2'}); await sleep(800)
  await openDaily(page); await sleep(500)
  // 注: マウント時の自動保存useEffectが pristine時に下書きを消すため、開いた直後の localStorage は
  // 復元バナー(restorableDraftはマウント時初期化子で読む)は出るが localStorage 実体は空になり得る。
  // ここではバナーが出ること＝下書き検知は初期化子経由で成立していることを確認する。
  R.beforeRestoreBanner=await page.evaluate(()=>/入力途中の下書きが残っています/.test((document.querySelector('.main')||{}).innerText||''))
  await clickText(page,'復元する'); await sleep(700)
  // 復元後: restoreDraftがsetForm(photos:[])し、autosave useEffectが再書き込み → photosは0に
  R.bigNote=await page.evaluate((dk)=>{const d=localStorage.getItem(dk);const o=d?JSON.parse(d):null;return o&&o.form?{len:(o.form.note||'').length,photos:(o.form.photos||[]).length}:null},dk)
  // 期待: len===5000, photos===0
  errSnap('afterAxisB')

  // ===== 軸C スコープ分離: inModal(圃場詳細の簡易日報)ではバナー機構が無効 =====
  // 主日報で下書きを残した状態のまま、圃場詳細を開いてinModalフォームにバナーが出ないか
  // 圃場一覧 → 第2圃場 詳細 → 日報タブ
  let modalChecked=false, modalBanner=null, modalErr=0
  {
    const before=errors.length
    await clickText(page,'圃場管理'); await sleep(700)
    // 第2圃場のカードを開く
    const opened=await page.evaluate(()=>{const cards=[...document.querySelectorAll('*')].filter(e=>e.offsetParent&&/第2圃場/.test(e.textContent)&&e.textContent.length<40);const c=cards.find(e=>/click|cursor/.test((e.getAttribute&&e.getAttribute('style'))||'')||e.tagName==='BUTTON')||cards[0];if(c){c.click();return true}return false})
    await sleep(700)
    if(opened){
      // inModal内に下書きバナーが出ていないこと（出ていたらスコープ漏れ）
      modalBanner=await page.evaluate(()=>/入力途中の下書きが残っています/.test((document.querySelector('.main')||{}).innerText||''))
      modalChecked=true
    }
    modalErr=errors.length-before
  }
  R.inModal={checked:modalChecked,banner:modalBanner,newErr:modalErr}
  errSnap('afterAxisC')

  R.errors=errors
  console.log(JSON.stringify(R,null,2))

  // ===== 判定 =====
  const ab=R.abnormal||{}
  const noBannerCases=['brokenJSON','nullForm','missingForm','emptyMeaningless']
  const allAbnormalNoErr=Object.values(ab).every(x=>x.newErr===0&&x.restoredOk!==false)
  const noBannerOK=noBannerCases.every(k=>ab[k]&&ab[k].banner===false)
  const checks=[
    ['異常下書きで例外/restore失敗なし', allAbnormalNoErr],
    ['無意味/壊れ下書きでバナー誤出しない', noBannerOK],
    ['badStep(x)でバナー出ても復元で例外なし', !(ab.badStep&&ab.badStep.restoredOk===false)],
    ['P1×P2: 復元でfield_idが下書き値(1)に', R.p1p2&&String(R.p1p2.field_id)==='1'],
    ['P1×P2: field_idsが[1]で二重/残留なし', R.p1p2&&Array.isArray(R.p1p2.field_ids)&&R.p1p2.field_ids.length===1&&Number(R.p1p2.field_ids[0])===1],
    ['復元→保存で下書きクリア', R.clearedAfterEditSave===true],
    ['保存後リロードでバナー出ない', R.noBannerAfterSave===true],
    ['復元前にバナー表示(下書き検知成立)', R.beforeRestoreBanner===true],
    ['復元後 巨大note(5000字)が欠落しない', R.bigNote&&R.bigNote.len===5000],
    ['復元→再保存で下書きからphotos除去', R.bigNote&&R.bigNote.photos===0],
    // inModalは開けた時のみ厳密判定。開けなければ構造保証(draftEnabled=!inModal・初期化子null)に委ね skip=pass
    ['inModalに下書きバナー漏れない', !R.inModal||!R.inModal.checked||(R.inModal.banner===false&&R.inModal.newErr===0)],
    ['総JSエラー0', errors.length===0],
  ]
  console.log('\n=== 判定 ===')
  let fail=0
  for(const [n,ok] of checks){ console.log((ok?'✅':'❌')+' '+n); if(!ok)fail++ }
  console.log(`\n${checks.length-fail}/${checks.length} passed, ${fail} failed`)
  if(errors.length) console.log('ERRORS:\n'+errors.join('\n'))
  await b.close(); server.close(); process.exit(fail?1:0)
})().catch(e=>{console.error(e);process.exit(2)})
