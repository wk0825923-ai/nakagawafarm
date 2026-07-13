// qa_purchase_resend.js — 仕入れ/初期在庫の応答喪失・失敗経路のE2E検証（Codexレビュー14対応）
// DB経路(?dbdest=1)の実UIで、フォーム→onAddPurchase→farm_adjust_stock の一気通貫を確認する:
//  R1 応答喪失: RPCはサーバで成功したが返事が失敗に見える→成功表示なし・履歴に残らない(記帳はサーバに1行)
//  R2 再登録: 同じ入力のまま再クリック→同一送信IDで冪等(duplicate)→履歴1件・記帳1行・残高は1回分のみ
//  R3 初期在庫失敗: 農薬追加で在庫RPCが失敗→祝福を出さず「初期在庫の反映に失敗」トーストで棚卸しへ誘導
//  R4 農薬棚卸し(実UI): UUID農薬の一括保存がDB残高に反映される(レビュー15 Critical: Number(id)のNaN化検出)
//  R5 棚卸しの応答喪失→再保存: 失敗表示・同一送信IDで冪等・二重記帳なし
//  R6 棚卸しは変更行だけ送信: 別端末の仕入れで進んだ在庫を、開きっぱなし画面の一括保存が巻き戻さない
//  R7 保存の応答待ち中に打ち替えた新しい値が黙って消えない(dirty保持→再保存で反映)
// 実行: cd qa && node qa_purchase_resend.js  ※デモ農場(live QA環境)の実DBに書き、テスト行は自動削除
const http = require('http'); const fs = require('fs'); const path = require('path')
const puppeteer = require('puppeteer-core')
const ROOT = path.resolve(__dirname, '..'); const PORT = 8253
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon' }
const server = http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){r.writeHead(404);r.end('404');return}r.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'});r.end(d)})})
const sleep = ms => new Promise(r=>setTimeout(r,ms))
const PNAME = 'QA仕入れ農薬(自動削除)'
const clickText = (page,t)=>page.evaluate(t=>{const v=e=>e.offsetParent!==null;const cs=[...document.querySelectorAll('button,a,[role=button]')].filter(v);let el=cs.find(e=>e.textContent.trim()===t)||cs.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+18);if(!el){const all=[...document.querySelectorAll('div,span,li,label')].filter(v);el=all.find(e=>e.textContent.trim()===t)||all.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+16)}if(el){el.click();return true}return false},t)
const navClick = async (page,label)=>{
  const tryClick=()=>page.evaluate(l=>{const b=[...document.querySelectorAll('.nav-item, .sidebar button')].find(e=>e.offsetParent&&e.textContent.trim()===l);if(b){b.click();return true}return false},label)
  if(await tryClick())return true
  for(const head of ['営農データ','管理・設定']){
    await page.evaluate(h=>{const hs=[...document.querySelectorAll('.sidebar *')].filter(e=>e.offsetParent&&e.textContent.trim()===h);const last=hs[hs.length-1];if(last)last.click()},head)
    await sleep(250); if(await tryClick())return true
  }
  return false
}
const setInputByPh = (page, ph, v)=>page.evaluate(({ph,v})=>{
  const el=[...document.querySelectorAll('input')].filter(e=>e.offsetParent).find(e=>(e.placeholder||'')===ph||(e.placeholder||'').includes(ph))
  if(!el)return false
  const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set
  s.call(el,String(v)); el.dispatchEvent(new Event('input',{bubbles:true})); return true
},{ph,v})
// RPC応答の失敗化/正常化(サーバ側は本物を実行=「応答だけ喪失」の忠実な再現)
const patchAdjust = (page, mode)=>page.evaluate((mode)=>{
  if(!window.__origAdjust) window.__origAdjust = farmRepo.adjustStockDb.bind(farmRepo)
  window.__adjCalls = window.__adjCalls || []
  if(mode==='lose')      farmRepo.adjustStockDb = async (...a)=>{ window.__adjCalls.push(['lose',...a.slice(0,5)]); await window.__origAdjust(...a); return { ok:false, error:new Error('simulated response loss') } }
  else if(mode==='fail') farmRepo.adjustStockDb = async (...a)=>{ window.__adjCalls.push(['fail',...a.slice(0,5)]); return { ok:false, error:new Error('simulated failure') } }
  else if(mode==='slow') farmRepo.adjustStockDb = async (...a)=>{ window.__adjCalls.push(['slow',...a.slice(0,5)]); await new Promise(r=>setTimeout(r,2500)); return window.__origAdjust(...a) }
  else                   farmRepo.adjustStockDb = async (...a)=>{ window.__adjCalls.push(['real',...a.slice(0,5)]); return window.__origAdjust(...a) }
},mode)
;(async()=>{
  await new Promise(r=>server.listen(PORT,r))
  const checks=[]; const errors=[]; let phase='boot'
  const ok=(n,c,x)=>checks.push({name:n,pass:!!c,extra:x==null?'':String(x)})
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-dev-shm-usage'],protocolTimeout:240000})
  const page=await b.newPage(); await page.setViewport({width:1500,height:1000})
  page.on('pageerror',e=>errors.push(phase+':'+String(e.message||e).slice(0,120)))
  let pid=null, initPid=null
  try{
    await page.goto(`http://localhost:${PORT}/?dbdest=1`,{waitUntil:'networkidle2',timeout:60000})
    if(!(await page.evaluate(()=>!!document.querySelector('.main')))){
      await page.waitForSelector('input[type=email]',{timeout:30000})
      await page.type('input[type=email]','demo@syatyo-suport.jp'); await page.type('input[type=password]','demo1234')
      await page.evaluate(()=>{const x=[...document.querySelectorAll('button[type=submit]')].find(b=>/ログイン/.test(b.textContent));if(x)x.click()})
      for(let i=0;i<40;i++){if(await page.evaluate(()=>!!document.querySelector('.main')))break;await sleep(500)}
    }
    // ── 準備: QA農薬をDBに直接insert→リロードでUIに載せる ──
    phase='seed'
    pid=await page.evaluate(async (name)=>{
      const fid=CONFIG.CURRENT_FARM_ID
      const f=await sb.from('farm_farms').select('org_id').eq('id',fid).limit(1)
      const id=crypto.randomUUID()
      const r=await sb.from('farm_pesticides').insert([{id,org_id:f.data[0].org_id,farm_id:fid,name,reg_no:'QA',dilution:1000,max_times:3,preharvest_days:7,stock_l:18}])
      return r.error?null:id
    },PNAME)
    if(!pid)throw new Error('seed insert failed')
    await page.goto(`http://localhost:${PORT}/?dbdest=1`,{waitUntil:'networkidle2',timeout:60000}); await sleep(1500)
    await navClick(page,'マスタ管理'); await sleep(800)
    await clickText(page,'農薬マスタ'); await sleep(700)
    await page.evaluate((name)=>{
      const hits=[...document.querySelectorAll('.main *')].filter(e=>e.offsetParent&&e.children.length===0&&e.textContent.trim()===name)
      const el=hits[hits.length-1]; if(el)el.click()
    },PNAME); await sleep(900)
    await clickText(page,'仕入れ登録'); await sleep(600)

    // ═══ R1: 応答喪失(サーバは記帳成功・返事だけ失敗)→ 成功表示なし・履歴に残らない ═══
    phase='r1-response-loss'
    await patchAdjust(page,'lose')
    if(!(await setInputByPh(page,'例: 20',20)))throw new Error('amount input not found')
    await sleep(200)
    await clickText(page,'仕入れを登録して在庫に追加'); await sleep(2500)
    const r1=await page.evaluate(async (pid)=>{
      const fid=CONFIG.CURRENT_FARM_ID
      const done=/仕入れを登録しました/.test(document.body.innerText)
      const hist=JSON.parse(localStorage.getItem('farm_pesticide_purchases_'+fid)||'[]').filter(x=>String(x.pesticide_id)===pid)
      const mv=await sb.from('farm_stock_movements').select('id,delta_amount').eq('item_id',pid)
      const st=await sb.from('farm_pesticides').select('stock_l').eq('id',pid)
      return { done, hist:hist.length, rows:mv.data?mv.data.length:-1, stock:Number(st.data[0].stock_l) }
    },pid)
    ok('R1 応答喪失: 成功表示を出さず履歴にも残らない(サーバ側は記帳1行=残高38L)',
      r1.done===false && r1.hist===0 && r1.rows===1 && r1.stock===38, JSON.stringify(r1))

    // ═══ R2: 同じ入力のまま再登録→同一送信IDで冪等→履歴1件・記帳は増えない ═══
    phase='r2-resend'
    await patchAdjust(page,'restore')
    await clickText(page,'仕入れを登録して在庫に追加')
    let r2done=false // 成功表示は1.8秒で消えるためポーリングで捕まえる
    for(let i=0;i<15;i++){ if(await page.evaluate(()=>/仕入れを登録しました/.test(document.body.innerText))){r2done=true;break}; await sleep(200) }
    await sleep(1500)
    const r2=await page.evaluate(async (pid)=>{
      const fid=CONFIG.CURRENT_FARM_ID
      const hist=JSON.parse(localStorage.getItem('farm_pesticide_purchases_'+fid)||'[]').filter(x=>String(x.pesticide_id)===pid)
      const mv=await sb.from('farm_stock_movements').select('id').eq('item_id',pid)
      const st=await sb.from('farm_pesticides').select('stock_l').eq('id',pid)
      return { hist:hist.length, rows:mv.data?mv.data.length:-1, stock:Number(st.data[0].stock_l) }
    },pid)
    ok('R2 再登録は同一送信IDで冪等: 成功表示・履歴1件・記帳1行のまま・残高38L(二重加算なし)',
      r2done===true && r2.hist===1 && r2.rows===1 && r2.stock===38, JSON.stringify({done:r2done,...r2}))

    // ═══ R3: 初期在庫の反映失敗→祝福を出さず棚卸しへ誘導するトースト ═══
    phase='r3-init-stock-fail'
    await page.evaluate(()=>{const m=document.querySelector('.sb-celeb-overlay');if(m)m.remove()})
    await clickText(page,'閉じる')||await page.keyboard.press('Escape'); await sleep(400)
    await page.evaluate(()=>{ // モーダルが残っていたら背景クリックで閉じる
      const ov=[...document.querySelectorAll('div')].find(e=>e.offsetParent&&getComputedStyle(e).position==='fixed'&&getComputedStyle(e).zIndex==='2000')
      if(ov)ov.click()
    }); await sleep(400)
    await patchAdjust(page,'fail')
    await clickText(page,'農薬を追加'); await sleep(600)
    await setInputByPh(page,'スミチオン乳剤','QA初期在庫農薬(自動削除)')
    await setInputByPh(page,'1000',500)
    await page.evaluate(()=>{ // 在庫量(ph=20)を入れる
      const el=[...document.querySelectorAll('input')].filter(e=>e.offsetParent).find(e=>(e.placeholder||'')==='20')
      const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set
      if(el){s.call(el,'7');el.dispatchEvent(new Event('input',{bubbles:true}))}
    })
    await sleep(200)
    await clickText(page,'登録する'); await sleep(2500)
    const r3=await page.evaluate(()=>{
      const t=document.body.innerText
      return { celeb:!!document.querySelector('.sb-celeb-overlay'), toast:/初期在庫の反映に失敗/.test(t) }
    })
    ok('R3 初期在庫の反映失敗: 祝福を出さず「初期在庫の反映に失敗」トーストで棚卸しへ誘導',
      r3.celeb===false && r3.toast===true, JSON.stringify(r3))
    await patchAdjust(page,'restore')

    // ═══ R4: 農薬棚卸し(実UI・一括保存)がUUID農薬のDB残高に反映される ═══
    phase='r4-inventory-ui'
    // R1〜R3のモーダル状態を持ち越さない(詳細モーダルが残ると行検索が誤爆する)
    await page.goto(`http://localhost:${PORT}/?dbdest=1`,{waitUntil:'networkidle2',timeout:60000}); await sleep(1500)
    await navClick(page,'マスタ管理'); await sleep(800)
    await clickText(page,'農薬マスタ'); await sleep(700)
    await patchAdjust(page,'restore') // reloadでパッチが消えるため記録用ラッパーを貼り直す
    await clickText(page,'棚卸し入力'); await sleep(700)
    // 実キーボード入力(trusted event)。合成inputイベントはこの画面のcontrolled inputでReactに拾われなかった
    const setRowInput=async (name,v)=>{
      const handle=await page.evaluateHandle((name)=>{
        const rows=[...document.querySelectorAll('.main div')].filter(e=>e.offsetParent&&e.textContent.includes(name)&&e.querySelector('input[type=number]'))
        const row=rows[rows.length-1]; return row?row.querySelector('input[type=number]'):null
      },name)
      if(!(await handle.evaluate(el=>!!el)))return false
      await handle.click({clickCount:3}) // 全選択→打ち替え
      await page.keyboard.type(String(v))
      return true
    }
    // 「在庫を一括保存」が有効化される(React再描画でdirty反映)まで待ってからクリック=タイミングレース回避
    const clickSaveAll=async ()=>{
      for(let i=0;i<25;i++){
        const clicked=await page.evaluate(()=>{
          const b=[...document.querySelectorAll('button')].find(e=>e.offsetParent&&/在庫を一括保存/.test(e.textContent)&&!e.disabled)
          if(b){b.click();return true}return false
        })
        if(clicked)return true
        await sleep(200)
      }
      return false
    }
    if(!(await setRowInput(PNAME,50)))throw new Error('inventory row input not found')
    if(!(await clickSaveAll()))throw new Error('save-all button not enabled (R4)')
    let r4saved=false
    for(let i=0;i<25;i++){ if(await page.evaluate(()=>/保存しました/.test(document.body.innerText))){r4saved=true;break}; await sleep(300) }
    const r4=await page.evaluate(async (pid)=>{
      const st=await sb.from('farm_pesticides').select('stock_l').eq('id',pid)
      const calls=(window.__adjCalls||[]).filter(c=>String(c[3])===pid||String(c[2])===pid)
      return { stock:Number(st.data[0].stock_l), calls }
    },pid)
    ok('R4 農薬棚卸し(実UI): UUID農薬の一括保存で「保存しました」＋DB残高38→50L',
      r4saved===true && r4.stock===50, JSON.stringify({saved:r4saved,...r4}))

    // ═══ R5: 棚卸しの応答喪失→失敗表示→同じ値で再保存→同一送信IDで冪等 ═══
    phase='r5-inventory-loss'
    await patchAdjust(page,'lose')
    if(!(await setRowInput(PNAME,60)))throw new Error('inventory row input not found (r5)')
    if(!(await clickSaveAll()))throw new Error('save-all button not enabled (R5 first)')
    let r5fail=false
    for(let i=0;i<25;i++){ if(await page.evaluate(()=>/件が保存できませんでした/.test(document.body.innerText))){r5fail=true;break}; await sleep(300) }
    const r5a=await page.evaluate(async (pid)=>{
      const st=await sb.from('farm_pesticides').select('stock_l').eq('id',pid)
      return { stock:Number(st.data[0].stock_l) }
    },pid)
    await patchAdjust(page,'restore')
    if(!(await clickSaveAll()))throw new Error('save-all button not enabled (R5 resave)')
    let r5saved=false
    for(let i=0;i<25;i++){ if(await page.evaluate(()=>/保存しました/.test(document.body.innerText))){r5saved=true;break}; await sleep(300) }
    const r5b=await page.evaluate(async (pid)=>{
      const st=await sb.from('farm_pesticides').select('stock_l').eq('id',pid)
      const mv=await sb.from('farm_stock_movements').select('id').eq('item_id',pid)
      return { stock:Number(st.data[0].stock_l), rows:mv.data?mv.data.length:-1 }
    },pid)
    // 記帳=仕入れ+20(R1/R2)・set50(R4)・set60(R5)の3行のみ(再保存は同一IDでduplicate=増えない)
    ok('R5 棚卸し応答喪失: 失敗表示→同じ値で再保存は冪等(残高60L・記帳3行のまま)',
      r5fail===true && r5a.stock===60 && r5saved===true && r5b.stock===60 && r5b.rows===3,
      JSON.stringify({fail:r5fail,stockAfterLoss:r5a.stock,saved:r5saved,...r5b}))

    // ═══ R6: 変更していない行は送らない=別端末で進んだ在庫を一括保存が巻き戻さない ═══
    phase='r6-no-rollback'
    // 別端末の仕入れ相当: DBを直接80Lへ(この画面のinputsはR5の保存成功でdirty解除済み)
    await page.evaluate(async (pid)=>{ await sb.from('farm_pesticides').update({stock_l:80}).eq('id',pid) },pid)
    let r6follow=false // 未変更行の表示が最新在庫(80)へ追随するか(realtime経由)
    for(let i=0;i<40;i++){
      const v=await page.evaluate((name)=>{
        const rows=[...document.querySelectorAll('.main div')].filter(e=>e.offsetParent&&e.textContent.includes(name)&&e.querySelector('input[type=number]'))
        const row=rows[rows.length-1]; return row?row.querySelector('input[type=number]').value:null
      },PNAME)
      if(v==='80'){r6follow=true;break}
      await sleep(300)
    }
    const callsBefore=await page.evaluate(()=>(window.__adjCalls||[]).length)
    // 変更ゼロ=ボタンは「変更はありません」でdisabled。押せないこと自体を検証するのでクリックしない
    await sleep(2000)
    const r6=await page.evaluate(async ({pid,callsBefore})=>{
      const st=await sb.from('farm_pesticides').select('stock_l').eq('id',pid)
      const mv=await sb.from('farm_stock_movements').select('id').eq('item_id',pid)
      const noChangeBtn=[...document.querySelectorAll('button')].some(b=>b.offsetParent&&/変更はありません/.test(b.textContent)&&b.disabled)
      return { stock:Number(st.data[0].stock_l), rows:mv.data?mv.data.length:-1,
        rpcCalls:(window.__adjCalls||[]).length-callsBefore, noChangeBtn }
    },{pid,callsBefore})
    ok('R6 一括保存は変更行だけ送信: 別端末の80Lを巻き戻さない(表示追随・RPC0件・ボタンは「変更はありません」)',
      r6follow===true && r6.stock===80 && r6.rows===3 && r6.rpcCalls===0 && r6.noChangeBtn===true,
      JSON.stringify({follow:r6follow,...r6}))

    // ═══ R7: 保存の応答待ち中に打ち替えた新しい値が黙って消えない ═══
    phase='r7-edit-while-saving'
    await patchAdjust(page,'slow') // RPCを2.5秒遅延(成功はする)
    if(!(await setRowInput(PNAME,70)))throw new Error('inventory row input not found (r7)')
    if(!(await clickSaveAll()))throw new Error('save-all button not enabled (R7 first)') // 70の保存が走り出す(保存中…)
    await sleep(600)
    if(!(await setRowInput(PNAME,75)))throw new Error('inventory row input not found (r7b)') // 応答待ち中に打ち替え
    let r7note=false // 70の保存完了時、「保存しました」ではなく未保存の明示が出ることを待つ
    for(let i=0;i<30;i++){ if(await page.evaluate(()=>/保存中に入力した変更が未保存です/.test(document.body.innerText))){r7note=true;break}; await sleep(300) }
    await sleep(400)
    const r7a=await page.evaluate(async ({pid,name})=>{
      const st=await sb.from('farm_pesticides').select('stock_l').eq('id',pid)
      const rows=[...document.querySelectorAll('.main div')].filter(e=>e.offsetParent&&e.textContent.includes(name)&&e.querySelector('input[type=number]'))
      const row=rows[rows.length-1]
      const savedShown=/保存しました/.test(document.body.innerText) // 未保存があるのに緑の成功表示を出していないか
      return { stock:Number(st.data[0].stock_l), inputVal: row?row.querySelector('input[type=number]').value:null, savedShown }
    },{pid,name:PNAME})
    // 打ち替えた75はdirtyのまま残り、再保存で反映される(このときは全て保存済み=保存しました)
    await patchAdjust(page,'restore')
    if(!(await clickSaveAll()))throw new Error('save-all button not enabled (R7 resave)')
    let r7saved2=false
    for(let i=0;i<25;i++){ if(await page.evaluate(()=>/保存しました/.test(document.body.innerText))){r7saved2=true;break}; await sleep(300) }
    const r7b=await page.evaluate(async (pid)=>{
      const st=await sb.from('farm_pesticides').select('stock_l').eq('id',pid)
      return { stock:Number(st.data[0].stock_l) }
    },pid)
    ok('R7 保存中の打ち替え: 70保存後は「未保存の変更あり」を明示(成功表示なし)・入力欄75維持→再保存で75L反映+保存しました',
      r7note===true && r7a.savedShown===false && r7a.stock===70 && r7a.inputVal==='75' && r7saved2===true && r7b.stock===75,
      JSON.stringify({note:r7note,savedShown:r7a.savedShown,stockAfter70:r7a.stock,inputAfter:r7a.inputVal,saved2:r7saved2,stockFinal:r7b.stock}))

    initPid=await page.evaluate(async (name)=>{ // R3で作られたマスタ行(DB同期後)のidを後片付け用に取得
      for(let i=0;i<10;i++){
        const r=await sb.from('farm_pesticides').select('id').eq('farm_id',CONFIG.CURRENT_FARM_ID).eq('name',name)
        if(r.data&&r.data.length)return r.data[0].id
        await new Promise(res=>setTimeout(res,700))
      }
      return null
    },'QA初期在庫農薬(自動削除)')
  } finally {
    // ── 後片付け: DBのテスト行を削除(ブラウザ側localStorageは使い捨てプロファイル) ──
    try{
      await page.evaluate(async ({pid,initPid})=>{
        // 削除はテストが作った資材のIDに限定する(正規の冪等マーカーを消すと巻き戻し防止が壊れる)
        if(pid){ await sb.from('farm_stock_movements').delete().eq('item_id',pid); await sb.from('farm_pesticides').delete().eq('id',pid) }
        if(initPid){ await sb.from('farm_stock_movements').delete().eq('item_id',initPid); await sb.from('farm_pesticides').delete().eq('id',initPid) }
      },{pid,initPid})
    }catch(_){}
  }
  const pass=checks.filter(c=>c.pass).length
  console.log('QAPURCHRESEND_START')
  checks.forEach(c=>console.log((c.pass?'PASS':'FAIL')+' '+c.name+(c.extra?' ['+c.extra+']':'')))
  if(errors.length)console.log('ERRORS:',JSON.stringify(errors.slice(0,5)))
  console.log(pass+'/'+checks.length)
  console.log('QAPURCHRESEND_END')
  await b.close(); server.close()
  process.exit(pass===checks.length?0:1)
})().catch(e=>{console.error('RUNERR',e);process.exit(1)})
