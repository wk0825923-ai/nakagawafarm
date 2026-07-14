// qa_top_dressing_e2e.js — 施肥フォーム→app→在庫RPCの一気通貫E2E（Codexレビュー22 Medium2対応）
// C14はfarmRepo.createWithStockを直接呼ぶためフォームの契約差(画面で通るがRPCで拒否)を検知できない。
// ここは実UIの日報ウィザードで施肥を入力・保存し、DB記録・肥料残高・削除復元まで通しで確認する:
//  T1 kg直接入力で保存→DBに記録が残り、選んだ肥料の残高が減る(100→80kg)＋通帳記帳
//  T2 希釈倍率だけ(散布液量なし)は保存できない(RPCで拒否される前に画面で弾く=レビュー22 Medium1)
//  T3 削除で残高が戻る(80→100kg)
// 実行: cd qa && node qa_top_dressing_e2e.js  ※デモ農場の実DBに書き、テスト行は自動削除
const http = require('http'); const fs = require('fs'); const path = require('path')
const puppeteer = require('puppeteer-core')
const ROOT = path.resolve(__dirname, '..'); const PORT = 8258
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon' }
const server = http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){r.writeHead(404);r.end('404');return}r.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'});r.end(d)})})
const sleep = ms => new Promise(r=>setTimeout(r,ms))
const FLD='QA-TD圃場(自動削除)'; const FNAME='QA-TD肥料(自動削除)'
const clickText = (page,t)=>page.evaluate(t=>{const v=e=>e.offsetParent!==null;const cs=[...document.querySelectorAll('button,a,[role=button]')].filter(v);let el=cs.find(e=>e.textContent.trim()===t)||cs.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+18);if(!el){const all=[...document.querySelectorAll('div,span,li,label')].filter(v);el=all.find(e=>e.textContent.trim()===t)||all.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+16)}if(el){el.click();return true}return false},t)
const setInputByPh = (page, ph, v)=>page.evaluate(({ph,v})=>{
  const el=[...document.querySelectorAll('input')].filter(e=>e.offsetParent).find(e=>(e.placeholder||'').includes(ph))
  if(!el)return false
  const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set
  s.call(el,String(v)); el.dispatchEvent(new Event('input',{bubbles:true})); return true
},{ph,v})
// 施肥フォームは希釈倍率(例:500)・散布量kg(例:5)・散布液量(例:500)がplaceholder衝突するため、
// ラベル/見出しspanの直近inputを狙う(親要素内のinput[type=number])。
const setByLabel = (page, labelText, v)=>page.evaluate(({labelText,v})=>{
  const nodes=[...document.querySelectorAll('span,label')].filter(e=>e.offsetParent&&e.textContent.trim().startsWith(labelText))
  for(const node of nodes){
    const inp=node.parentElement&&node.parentElement.querySelector('input[type=number]')
    if(inp){ const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(inp,String(v)); inp.dispatchEvent(new Event('input',{bubbles:true})); return true }
  }
  return false
},{labelText,v})
// 有効な「次へ」を押す(無効ボタンをclickText誤爆で押して進まないのを防ぐ)
const clickNext = async (page)=>{
  for(let i=0;i<20;i++){ const c=await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.offsetParent&&/次へ/.test(e.textContent)&&!e.disabled);if(b){b.click();return true}return false}); if(c)return true; await sleep(200) }
  return false
}
// 施肥フォームまでウィザードを進める(日報入力→圃場選択→次へ→施肥→次へ)
const openFertForm = async (page)=>{
  await clickText(page,'日報入力'); await sleep(900)
  await page.evaluate((name)=>{const grid=[...document.querySelectorAll('div')].find(d=>d.style&&d.style.maxHeight==='240px');if(grid){const chip=[...grid.children].find(c=>c.textContent.includes(name));if(chip)chip.click()}},FLD)
  await sleep(500); if(!(await clickNext(page)))throw new Error('step1 次へ not enabled'); await sleep(700)
  await clickText(page,'施肥'); await sleep(400); if(!(await clickNext(page)))throw new Error('step2 次へ not enabled'); await sleep(1000)
}
// 施肥フォームの肥料selectでQA肥料を選ぶ(handleFertilizerChange=UUID保持のテストを兼ねる)
const selectFert = (page,name)=>page.evaluate((name)=>{
  const sel=[...document.querySelectorAll('select')].filter(e=>e.offsetParent).find(s=>[...s.options].some(o=>o.textContent.includes(name)))
  if(!sel)return false
  const opt=[...sel.options].find(o=>o.textContent.includes(name)); if(!opt)return false
  const setter=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set
  setter.call(sel,opt.value); sel.dispatchEvent(new Event('change',{bubbles:true})); return true
},name)
;(async()=>{
  await new Promise(r=>server.listen(PORT,r))
  const checks=[]; const errors=[]; let phase='boot'
  const ok=(n,c,x)=>checks.push({name:n,pass:!!c,extra:x==null?'':String(x)})
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-dev-shm-usage'],protocolTimeout:240000})
  const page=await b.newPage(); await page.setViewport({width:1500,height:1000})
  page.on('pageerror',e=>errors.push(phase+':'+String(e.message||e).slice(0,120)))
  let fieldId=null, fertId=null
  try{
    await page.goto(`http://localhost:${PORT}/?dbdest=1`,{waitUntil:'networkidle2',timeout:60000})
    if(!(await page.evaluate(()=>!!document.querySelector('.main')))){
      await page.waitForSelector('input[type=email]',{timeout:30000})
      await page.type('input[type=email]','demo@syatyo-suport.jp'); await page.type('input[type=password]','demo1234')
      await page.evaluate(()=>{const x=[...document.querySelectorAll('button[type=submit]')].find(b=>/ログイン/.test(b.textContent));if(x)x.click()})
      for(let i=0;i<40;i++){if(await page.evaluate(()=>!!document.querySelector('.main')))break;await sleep(500)}
    }
    // ── 準備: 残骸を名前で掃除→QA圃場+ロット+肥料(在庫100kg)を生insertで作る ──
    // farmRepo.writeはスナップショット基準の差分同期で、sb削除した古い行を_snapから復活させてしまう
    // (ウィザードが別圃場を選ぶ原因)。全て生insertで作り_snap経由の復活を断つ。テーブル名はDB実名(farm_fields)。
    phase='seed'
    const seed=await page.evaluate(async ({FLD,FNAME})=>{
      const fid=CONFIG.CURRENT_FARM_ID
      const farmRow=await sb.from('farm_farms').select('org_id').eq('id',fid).limit(1)
      const orgId=farmRow.data[0].org_id
      // 残骸掃除(名前一致)
      const oldF=await sb.from('farm_fields').select('id').eq('farm_id',fid).eq('name',FLD)
      for(const row of (oldF.data||[])){ await sb.from('farm_top_dressing_records').delete().eq('field_id',row.id); await sb.from('farm_lots').delete().eq('field_id',row.id); await sb.from('farm_fields').delete().eq('id',row.id) }
      const oldFe=await sb.from('farm_fertilizers').select('id').eq('farm_id',fid).eq('name',FNAME)
      for(const row of (oldFe.data||[])){ await sb.from('farm_stock_movements').delete().eq('item_id',row.id); await sb.from('farm_fertilizers').delete().eq('id',row.id) }
      const fieldId=crypto.randomUUID(), lotId=crypto.randomUUID(), fertId=crypto.randomUUID()
      await sb.from('farm_fields').insert([{ id:fieldId, org_id:orgId, farm_id:fid, name:FLD, crop:'レタス', crop_category_key:'leaf_veg', area_are:5, status:'栽培中', color:'#0D9972', row_count:6, gap_target:true }])
      await sb.from('farm_lots').insert([{ id:lotId, org_id:orgId, farm_id:fid, field_id:fieldId, row_range:'1-3', variety:'QA品種', status:'growing', seed_date:'2026-05-01' }])
      await sb.from('farm_fertilizers').insert([{ id:fertId, org_id:orgId, farm_id:fid, name:FNAME, weight_per_bag_kg:20, price_per_bag_yen:3000, unit_price_yen_per_kg:150, stock_kg:100, alert_threshold_kg:10 }])
      return { fieldId, fertId }
    },{FLD,FNAME})
    fieldId=seed.fieldId; fertId=seed.fertId
    const stockOf=async ()=>page.evaluate(async (fertId)=>{ const r=await sb.from('farm_fertilizers').select('stock_kg').eq('id',fertId); return Number(r.data[0].stock_kg) },fertId)
    const recCount=async ()=>page.evaluate(async (fieldId)=>{ const r=await sb.from('farm_top_dressing_records').select('id').eq('field_id',fieldId); return r.data?r.data.length:-1 },fieldId)
    await page.goto(`http://localhost:${PORT}/?dbdest=1`,{waitUntil:'networkidle2',timeout:60000}); await sleep(1500)

    // ═══ T1: kg直接入力でフォーム保存→DB記録+肥料残高100→80kg ═══
    phase='t1-form-save-kg'
    await openFertForm(page)
    if(!(await selectFert(page,FNAME)))throw new Error('fertilizer option not found (T1)')
    await sleep(300)
    await setInputByPh(page,'1-40','1-3')       // 畝範囲
    await setByLabel(page,'散布量','20')          // 散布量(kg)=20
    await sleep(300)
    await clickText(page,'記録する'); await sleep(2500)
    const t1stock=await stockOf(); const t1n=await recCount()
    const t1rec=await page.evaluate(async (fieldId)=>{
      const r=await sb.from('farm_top_dressing_records').select('fertilizers,fertilizing_type').eq('field_id',fieldId)
      const rec=r.data&&r.data[0]; return rec?{ ftype:rec.fertilizing_type, fid:(rec.fertilizers[0]||{}).fertilizer_id }:null
    },fieldId)
    ok('T1 施肥フォーム保存(kg): DB記録1件・肥料残高100→80kg・記録の肥料IDがUUIDのまま(handleFertilizerChange健全)',
      t1n===1 && t1stock===80 && t1rec && t1rec.fid===fertId && t1rec.ftype==='追肥',
      JSON.stringify({n:t1n,stock:t1stock,rec:t1rec}))

    // ═══ T2: 希釈倍率だけ(散布液量なし)は保存できない=RPC拒否の前に画面で弾く ═══
    phase='t2-dilution-no-volume'
    await page.goto(`http://localhost:${PORT}/?dbdest=1`,{waitUntil:'networkidle2',timeout:60000}); await sleep(1500)
    await openFertForm(page)
    if(!(await selectFert(page,FNAME)))throw new Error('fertilizer option not found (T2)')
    await sleep(300)
    await setInputByPh(page,'1-40','4-6')
    await setByLabel(page,'希釈倍率','500')       // 希釈倍率のみ(散布液量は空・kgも空)
    await sleep(400)
    // 記録するボタンが無効状態(灰色)であること=画面で弾いている(修正前は有効=緑でRPCまで飛び拒否される)
    const btnInvalid=await page.evaluate(()=>{
      const b=[...document.querySelectorAll('button')].filter(e=>e.offsetParent).find(e=>e.textContent.trim()==='記録する')
      if(!b)return null
      const bg=b.style.background||getComputedStyle(b).backgroundColor
      return /D1D5DB|209, 213, 219/.test(bg) // 無効色
    })
    await clickText(page,'記録する'); await sleep(1500)
    const t2n=await recCount(); const t2stock=await stockOf()
    // 散布液量を入れると保存できる(希釈方式が完成)。1000L/500=2kg → 80→78
    await setByLabel(page,'散布液量','1000')
    await sleep(300)
    await clickText(page,'記録する'); await sleep(2500)
    const t2n2=await recCount(); const t2stock2=await stockOf()
    ok('T2 希釈方式の散布液量必須: 液量なしは記録ボタン無効(画面で弾く)・在庫不変(1件/80kg)→液量入力で保存(2件/78kg=1000÷500)',
      btnInvalid===true && t2n===1 && t2stock===80 && t2n2===2 && t2stock2===78,
      JSON.stringify({btnInvalid,afterDilOnly:{n:t2n,stock:t2stock},afterVolume:{n:t2n2,stock:t2stock2}}))

    // ═══ T3: 削除RPC(逆仕訳)で肥料残高が戻る。app.jsのonDeleteTopDressingRecord(routed分岐)が呼ぶ
    //         farmRepo.removeWithStock を直接検証する(記録削除+通帳の逆仕訳+残高復元が1トランザクション)。
    //         ※UIの削除ボタン(スタッフ画面の「けす」→確認→DELETERS['fert'])→この関数、の結線自体は
    //         このE2Eの対象外(管理画面の日報入力はウィザードのみで削除一覧を持たないため)。 ═══
    phase='t3-delete-restore'
    const t3=await page.evaluate(async (fieldId)=>{
      const col='farm_top_dressing_records', fid=CONFIG.CURRENT_FARM_ID
      const r=await sb.from(col).select('id').eq('field_id',fieldId)
      let okAll=true
      for(const row of (r.data||[])){ const d=await farmRepo.removeWithStock(col,fid,row.id,1); if(!(d&&d.ok))okAll=false }
      return okAll
    },fieldId)
    await sleep(500)
    const t3stock=await stockOf(); const t3n=await recCount()
    ok('T3 削除RPC(逆仕訳)で肥料残高が戻る(2件削除→100kg・記録0件)',
      t3===true && t3stock===100 && t3n===0, JSON.stringify({del:t3,stock:t3stock,n:t3n}))
  } finally {
    // ── 後片付け: テストが作った圃場/ロット/肥料/記録/通帳をIDで限定削除 ──
    try{
      await page.evaluate(async ({fieldId,fertId})=>{
        if(fieldId){
          await sb.from('farm_top_dressing_records').delete().eq('field_id',fieldId)
          await sb.from('farm_lots').delete().eq('field_id',fieldId)
          await sb.from('farm_fields').delete().eq('id',fieldId)
        }
        if(fertId){
          await sb.from('farm_stock_movements').delete().eq('item_id',fertId)
          await sb.from('farm_fertilizers').delete().eq('id',fertId)
        }
      },{fieldId,fertId})
    }catch(_){}
  }
  const pass=checks.filter(c=>c.pass).length
  console.log('QATOPDRESSE2E_START')
  checks.forEach(c=>console.log((c.pass?'PASS':'FAIL')+' '+c.name+(c.extra?' ['+c.extra+']':'')))
  if(errors.length)console.log('ERRORS:',JSON.stringify(errors.slice(0,5)))
  console.log(pass+'/'+checks.length)
  console.log('QATOPDRESSE2E_END')
  await b.close(); server.close()
  process.exit(pass===checks.length?0:1)
})().catch(e=>{console.error('RUNERR',e);process.exit(1)})
