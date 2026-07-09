// ============================================================================
// 番人 複合QAハーネス: GAP精緻化の「掛け算」監査（単体禁止・状態の交差）
//   軸A ロール×同時タブ(別タブ保存の相互上書き last-write-win)
//   軸B ライフサイクル(追加→編集→削除・参照先削除の破綻)
//   軸C 状態の掛け算(スキーム×レベル×gap_target×文書整備×農場切替×?reset のリーク)
//   軸D 異常/境界(全角・絵文字・超長文・負数・Infinity・欠損)
//   軸E 出力の複合(0件/大量・emaff未登録混在・キャンセル×再出力・CSVインジェクション)
// メモリ制約: タブは最大同時2、順次実行。1ブラウザを使い回す。
// 実行: cd qa && node qa_cross_gap.js
// ============================================================================
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core')
const ROOT=path.resolve(__dirname,'..'),PORT=8241,CHROME=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){r.writeHead(404);r.end('404');return}r.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'});r.end(d)})})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const clickText=(page,t)=>page.evaluate(t=>{const v=e=>e.offsetParent!==null;const cs=[...document.querySelectorAll('button,a,[role=button]')].filter(v);let el=cs.find(e=>e.textContent.trim()===t)||cs.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+18);if(el){el.click();return true}return false},t)
const expand=(page)=>page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim().startsWith('管理・設定')&&e.offsetParent);if(b)b.click()})
async function login(page){
  await page.goto(`http://localhost:${PORT}/`,{waitUntil:'networkidle2',timeout:60000})
  if(!(await page.evaluate(()=>!!document.querySelector('.main')))){
    await page.waitForSelector('input[type=email]',{timeout:30000});await page.type('input[type=email]','demo@syatyo-suport.jp');await page.type('input[type=password]','demo1234')
    await page.evaluate(()=>{const x=[...document.querySelectorAll('button[type=submit]')].find(b=>/ログイン/.test(b.textContent));if(x)x.click()})
    for(let i=0;i<40;i++){if(await page.evaluate(()=>!!document.querySelector('.main')))break;await sleep(500)}
  }
}
const bad=(t)=>['NaN','undefined','[object Object]','Infinity'].filter(x=>t.includes(x)).join(',')
const scanMain=(page)=>page.evaluate(()=>{const m=document.querySelector('.main');if(!m)return 'no-main';const t=m.innerText;const b=['NaN','undefined','[object Object]','Infinity'].filter(x=>t.includes(x)).join(',');return b||(t.trim().length<20?'blank':'')})

;(async()=>{
  await new Promise(r=>server.listen(PORT,r))
  const errors=[]; const R={}
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']})
  const page=await b.newPage(); await page.setViewport({width:1500,height:1000})
  page.on('pageerror',e=>errors.push('P:'+String(e.message||e).slice(0,140)))
  page.on('console',m=>{if(m.type()==='error'){const t=m.text();if(!/favicon|unpkg|jsdelivr|cloudflare|tabler|net::ERR/.test(t))errors.push('C:'+t.slice(0,140))}})
  await login(page)
  const farmId = await page.evaluate(()=> (typeof CONFIG!=='undefined'&&CONFIG.CURRENT_FARM_ID)?CONFIG.CURRENT_FARM_ID:null)
  R.farmId=farmId

  // ============ 軸C: スキーム×レベル 状態の交差（stale state） ============
  // GGAP→レベル"推奨(rec)"→GRASPへ切替。GRASPにrec項目は無い。levelがstaleのままだと0件になるか?
  await expand(page); await sleep(200)
  await clickText(page,'GAPチェックリスト'); await sleep(700)
  const readTotal=async()=>page.evaluate(()=>{const m=document.querySelector('.main').innerText.match(/対応度（\d+\/(\d+)）/);return m?parseInt(m[1]):null})
  await clickText(page,'GLOBALG.A.P.'); await sleep(300)
  await clickText(page,'推奨'); await sleep(300); R.ggapRec=await readTotal()
  // ここで GRASP に切替（レベルは"推奨"のまま）
  await clickText(page,'GRASP（労務）'); await sleep(400)
  R.graspAfterRecStale = await readTotal()  // GRASPにrecは0。staleなら0、正しく総数に戻すなら67
  R.graspStaleLevelUIShown = await page.evaluate(()=>[...document.querySelectorAll('button')].some(b=>/推奨/.test(b.textContent)&&b.offsetParent))
  // McDへ切替（levelはstill rec）。McD項目にlevelは無い→c.level&&でガードされ全通過するはず=31
  await clickText(page,'McD Addendum'); await sleep(400); R.mcdAfterRecStale=await readTotal()
  // 全スキーム×推奨
  await clickText(page,'全スキーム'); await sleep(300); await clickText(page,'推奨'); await sleep(300); R.bothRec=await readTotal()
  // クリーンに戻す
  await clickText(page,'すべて'); await sleep(200); await clickText(page,'GLOBALG.A.P.'); await sleep(200)

  // ============ 軸D: 圃場に境界データを注入（Infinity面積・絵文字・超長文・負数・emaff記号） ============
  R.injected = await page.evaluate(()=>{
    const fid = CONFIG.CURRENT_FARM_ID
    const key = 'farm_fields_v2_'+fid
    let arr=[]; try{arr=JSON.parse(localStorage.getItem(key)||'[]')}catch(e){}
    const base=arr.length?arr[0]:{}
    const weird=[
      {...base, id:900001, name:'𠮷🌾＜script＞負', area_name:'上望陀🚜', crop:'ターサイ', crop_category:base.crop_category||'leaf', area_are:1e999, address:'徳島県'+'あ'.repeat(400), emaff_no:'=cmd|/c calc', gap_target:true, status:'栽培中', color:'#0D9972', lat:35.4, lng:139.9},
      {...base, id:900002, name:'負数畑', area_name:'', crop:'水稲', crop_category:base.crop_category||'leaf', area_are:-50, address:'', emaff_no:'', gap_target:false, status:'栽培中', color:'#2563EB', lat:35.4, lng:139.9},
      {...base, id:900003, name:'', area_name:null, crop:'', crop_category:base.crop_category||'leaf', area_are:'abc', address:null, emaff_no:'+1-2', gap_target:undefined, status:'栽培中', color:'#EA580C', lat:35.4, lng:139.9},
    ]
    localStorage.setItem(key, JSON.stringify([...arr, ...weird]))
    // 記録も注入（うち1件は存在しない圃場を参照＝孤児）
    const rkey='farm_records_'+fid
    let recs=[]; try{recs=JSON.parse(localStorage.getItem(rkey)||'[]')}catch(e){}
    const today=new Date().toISOString().slice(0,10)
    recs.push({id:990001, field_id:900001, work_type:'施肥', date:today, amount:1e999, fertilizer_name:'=SUM(A1)', worker:'@evil', weather:'晴', note:'"改行\ntest'})
    recs.push({id:990002, field_id:900002, work_type:'収穫', date:today, total_cases:-3, worker:'負', weather:'雨', note:''})
    recs.push({id:990003, field_id:88888888, work_type:'収穫', date:today, total_cases:5, worker:'孤児参照', weather:'', note:''}) // 存在しない圃場
    localStorage.setItem(rkey, JSON.stringify(recs))
    return {fields:JSON.parse(localStorage.getItem(key)).length, records:recs.length}
  })
  await page.reload({waitUntil:'networkidle2'}); await sleep(1200); await expand(page); await sleep(300)

  // 境界データで各ページ巡回（白画面・NaN・Infinity・[object Object]を探す）
  const pages=['ダッシュボード','圃場管理','GAPチェックリスト','必要書類・文書台帳','GAP帳票出力','圃場まとめ']
  R.scanWeird=[]
  for(const p of pages){ await clickText(page,p); await sleep(600); R.scanWeird.push({p,bad:await scanMain(page)}) }

  // 圃場一覧カードで Infinity面積/対象外バッジ/絵文字が壊れていないか
  await clickText(page,'圃場管理'); await sleep(500)
  R.cardText = await page.evaluate(()=>{const m=document.querySelector('.main');const t=m?m.innerText:'';return{
    hasInfinity:/Infinity/.test(t), hasNaN:/NaN/.test(t), hasObj:/\[object Object\]/.test(t),
    hasTaishougai:/対象外/.test(t)
  }})

  // ============ 軸E: eMAFF CSV 複合（境界データ・孤児・emaff混在・CSVインジェクション） ============
  R.csv = await page.evaluate(()=>{
    // exportEmaffCSVはDLするので、内部ロジックを再現せず、実際のcsvCellと同じ健全性をDOM経由で確認するのは難しい。
    // 代わりに関数存在と、csvインジェクション無害化ロジックをブラウザ内で直接テストする。
    const out={fnExists: typeof exportEmaffCSV==='function'}
    // csvCellはクロージャ内なので、同等ロジックを本体から抜けない。ここでは「=+-@ で始まる値」を持つ
    // 記録が存在する状態でexportがthrowしないかをstub化して確認する。
    try{
      const origBlob=window.Blob, created=[]
      // Blob生成を捕捉してCSV本文を取り出す
      let captured=null
      window.Blob=function(parts,opts){captured=parts&&parts[0];return new origBlob(parts,opts)}
      const origCreate=URL.createObjectURL; URL.createObjectURL=()=>'blob:stub'
      const origRevoke=URL.revokeObjectURL; URL.revokeObjectURL=()=>{}
      const origAppend=document.body.appendChild.bind(document.body)
      // aタグのclickを無効化してDLを止める
      const origClick=HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click=function(){}
      const fid=CONFIG.CURRENT_FARM_ID
      const fields=JSON.parse(localStorage.getItem('farm_fields_v2_'+fid)||'[]')
      const records=JSON.parse(localStorage.getItem('farm_records_'+fid)||'[]')
      const pest=JSON.parse(localStorage.getItem('farm_pesticides_'+fid)||'[]')
      // skipConfirm=true で確認ダイアログを飛ばす
      const p=exportEmaffCSV(records, fields, pest, true)
      // 同期的にBlobが作られる（awaitなし）
      out.csvSample = captured ? String(captured).slice(0,600) : null
      // 危険プレフィックスがそのまま行頭に出ていないか（' でエスケープされているべき）
      if(captured){
        const body=String(captured)
        out.hasRawFormula = /(^|,)=SUM/.test(body) || /(^|,)=cmd/.test(body) || /(^|,)@evil/.test(body) || /(^|,)\+1-2/.test(body)
        out.hasEscaped = /'=SUM|'=cmd|'@evil|'\+1-2/.test(body)
        out.hasInfinityCell = /Infinity/.test(body)
      }
      window.Blob=origBlob; URL.createObjectURL=origCreate; URL.revokeObjectURL=origRevoke; HTMLAnchorElement.prototype.click=origClick
      out.threw=false
    }catch(e){ out.threw=true; out.err=String(e.message||e).slice(0,140) }
    return out
  })

  // ============ 軸E: 確認ダイアログ キャンセル×再出力 ============
  await clickText(page,'GAP帳票出力'); await sleep(600)
  // eMAFF出力ボタンを押す→ダイアログ→キャンセル→もう一度押せるか
  R.dialog = await page.evaluate(async()=>{
    const findBtn=()=>[...document.querySelectorAll('button')].find(b=>/eMAFF|CSV/.test(b.textContent)&&b.offsetParent)
    const b1=findBtn(); if(!b1)return{noBtn:true}
    b1.click(); await new Promise(r=>setTimeout(r,300))
    const ov1=document.querySelector('.sb-confirm-overlay'); const dialogShown=!!ov1
    if(ov1){const c=ov1.querySelector('.sb-cf-cancel'); if(c)c.click()}
    await new Promise(r=>setTimeout(r,300))
    const afterCancel=document.querySelectorAll('.sb-confirm-overlay').length
    // 再度押す
    const b2=findBtn(); let reopened=false
    if(b2){b2.click(); await new Promise(r=>setTimeout(r,300)); reopened=!!document.querySelector('.sb-confirm-overlay')}
    // 後始末: escで閉じる
    document.querySelectorAll('.sb-confirm-overlay').forEach(o=>{const c=o.querySelector('.sb-cf-cancel');if(c)c.click()})
    return {dialogShown, afterCancel, reopened}
  })

  // ============ 軸C: 文書台帳整備→?reset で農場データが消えるか（リーク検査） ============
  await clickText(page,'必要書類・文書台帳'); await sleep(600)
  await page.evaluate(()=>{const cbs=[...document.querySelectorAll('.main input[type=checkbox]')];[0,1].forEach(i=>cbs[i]&&cbs[i].click())})
  await sleep(400)
  R.docsBeforeReset = await page.evaluate((fid)=>{const raw=localStorage.getItem('farm_gap_documents_'+fid);return raw?Object.keys(JSON.parse(raw)).length:0}, farmId)
  // ?reset を発火
  await page.goto(`http://localhost:${PORT}/?reset`,{waitUntil:'networkidle2',timeout:60000}); await sleep(1500)
  R.afterReset = await page.evaluate(()=>{const ks=Object.keys(localStorage).filter(k=>k.indexOf('farm_')===0);return {farmKeysLeft:ks.length, sample:ks.slice(0,4)}})
  R.weirdFieldsGone = await page.evaluate((fid)=>{const raw=localStorage.getItem('farm_fields_v2_'+fid);if(!raw)return 'key-removed';try{const a=JSON.parse(raw);return a.some(f=>f.id>=900000)?'LEAK':'clean-or-reseeded'}catch(e){return 'parse-err'}}, farmId)

  // ============ 軸A: 別タブ同時保存の last-write-win（storageイベント追随） ============
  await login(page); await sleep(800)
  const page2=await b.newPage(); await page2.setViewport({width:1200,height:900})
  page2.on('pageerror',e=>errors.push('P2:'+String(e.message||e).slice(0,140)))
  await login(page2); await sleep(800)
  // タブ1でgap文書idを整備、タブ2でも別idを整備→両方残るか（storage追随で上書き消失しないか）
  R.concurrent = await (async()=>{
    // タブ1: gapDocs[1]=ready
    await page.evaluate((fid)=>{const k='farm_gap_documents_'+fid;const o=JSON.parse(localStorage.getItem(k)||'{}');o['1']={ready:true,updated:'2026-07-09'};localStorage.setItem(k,JSON.stringify(o));window.dispatchEvent(new StorageEvent('storage',{key:k,newValue:JSON.stringify(o)}))}, farmId)
    await sleep(300)
    // タブ2がstorageイベントで追随した後、タブ2からdoc[2]を足す（App state経由でsetGapDocsを模擬するのは難しいので直接localStorage+event）
    await page2.evaluate((fid)=>{const k='farm_gap_documents_'+fid;const o=JSON.parse(localStorage.getItem(k)||'{}');o['2']={ready:true,updated:'2026-07-09'};localStorage.setItem(k,JSON.stringify(o));window.dispatchEvent(new StorageEvent('storage',{key:k,newValue:JSON.stringify(o)}))}, farmId)
    await sleep(400)
    const final=await page.evaluate((fid)=>{const raw=localStorage.getItem('farm_gap_documents_'+fid);return raw?Object.keys(JSON.parse(raw)):[]}, farmId)
    return {finalKeys:final, bothKept: final.includes('1')&&final.includes('2')}
  })()
  await page2.close()

  R.errors=errors
  console.log(JSON.stringify(R,null,2))

  // ===== 判定 =====
  const c=R
  // 注: 一部は「既知バグの再現＝failで正しい」検査。expectFail:true はfail期待。
  const checks=[
    ['C-stale: GGAP推奨は20件', c.ggapRec===20],
    ['[BUG#2] C-stale: GRASP切替でlevel(rec)がstale→0件になる（本来67）', c.graspAfterRecStale===67],
    ['C-stale: McD切替は31件維持(levelガードで通過)', c.mcdAfterRecStale===31],
    ['[BUG#3] C: 全スキーム×推奨にMcD31件が混入し51件（本来20）', c.bothRec===20],
    ['D: 境界圃場注入成功', c.injected.fields>=3],
    ['D: 圃場管理カードにInfinity表示なし', !c.cardText.hasInfinity],
    ['D: 圃場管理カードにNaN表示なし', !c.cardText.hasNaN],
    ['D: 圃場管理カードに[object Object]なし', !c.cardText.hasObj],
    ['D: 全ページ巡回で異常表示なし(Infinity面積/絵文字/長文/負数/孤児記録)', c.scanWeird.every(x=>!x.bad)],
    ['E: eMAFF出力がthrowしない(境界/孤児混在)', c.csv.threw===false],
    ['E: CSVインジェクション無害化(生の式が残らない)', c.csv.hasRawFormula===false],
    ['E: CSVで危険値が\'エスケープ済み', c.csv.hasEscaped===true],
    ['E: CSVにInfinityセルが出ない', c.csv.hasInfinityCell===false],
    ['E: 確認ダイアログ表示', c.dialog.dialogShown===true],
    ['E: キャンセルでダイアログ閉じる', c.dialog.afterCancel===0],
    ['E: キャンセル後に再出力ボタンが再度押せる', c.dialog.reopened===true],
    ['[BUG#1] C-reset: ?resetでfarm_キー全消去(認証後ユーザーで失敗)', c.afterReset.farmKeysLeft===0],
    ['[BUG#1] C-reset: 境界圃場データがリークしない', c.weirdFieldsGone!=='LEAK'],
    ['A: 別タブ同時整備で両方残る(last-write-win防止/storage追随)', c.concurrent.bothKept===true],
    ['JSエラーなし', errors.length===0],
  ]
  console.log('\n=== 判定 ===')
  let fail=0
  for(const [n,ok] of checks){ console.log((ok?'✅':'❌')+' '+n); if(!ok)fail++ }
  console.log(`\n${checks.length-fail}/${checks.length} passed, ${fail} failed`)
  await b.close(); server.close(); process.exit(fail?1:0)
})().catch(e=>{console.error('FATAL',e);process.exit(2)})
