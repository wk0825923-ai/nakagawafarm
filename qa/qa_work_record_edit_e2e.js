// qa_work_record_edit_e2e.js — 日報の農薬編集(実UI)の一気通貫E2E（Codexレビュー24 Critical検証）
// 「UUID農薬の農薬散布日報を別農薬へ編集し、在庫差分も確認する」。編集画面の農薬selectが
// Number()でUUIDを壊していたバグ(components.js:4127)の再発防止。DB経路(?dbdest=1)。
//  W1 農薬A(5L消費)の日報を編集画面で農薬Bへ変更→保存: A在庫復元(15→20)・B減算(20→15)・
//     記録のpesticide_idがUUID(=B)のまま(NaN化しない)
// 実行: cd qa && node qa_work_record_edit_e2e.js  ※デモ農場の実DBに書き、テスト行は自動削除
const http = require('http'); const fs = require('fs'); const path = require('path')
const puppeteer = require('puppeteer-core')
const ROOT = path.resolve(__dirname, '..'); const PORT = 8262
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon' }
const server = http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){r.writeHead(404);r.end('404');return}r.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'});r.end(d)})})
const sleep = ms => new Promise(r=>setTimeout(r,ms))
const PA='QA-WREDIT農薬A(自動削除)', PB='QA-WREDIT農薬B(自動削除)', WORKER='QA-WREDIT担当'
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
;(async()=>{
  await new Promise(r=>server.listen(PORT,r))
  const checks=[]; const errors=[]; let phase='boot'
  const ok=(n,c,x)=>checks.push({name:n,pass:!!c,extra:x==null?'':String(x)})
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-dev-shm-usage'],protocolTimeout:240000})
  const page=await b.newPage(); await page.setViewport({width:1500,height:1000})
  page.on('pageerror',e=>errors.push(phase+':'+String(e.message||e).slice(0,120)))
  let pA=null, pB=null, rid=null
  try{
    await page.goto(`http://localhost:${PORT}/?dbdest=1`,{waitUntil:'networkidle2',timeout:60000})
    if(!(await page.evaluate(()=>!!document.querySelector('.main')))){
      await page.waitForSelector('input[type=email]',{timeout:30000})
      await page.type('input[type=email]','demo@syatyo-suport.jp'); await page.type('input[type=password]','demo1234')
      await page.evaluate(()=>{const x=[...document.querySelectorAll('button[type=submit]')].find(b=>/ログイン/.test(b.textContent));if(x)x.click()})
      for(let i=0;i<40;i++){if(await page.evaluate(()=>!!document.querySelector('.main')))break;await sleep(500)}
    }
    // ── 準備: 残骸掃除→農薬A/B(在庫20L)+農薬散布日報(A,5L消費=A20→15)をDB経路で作る ──
    phase='seed'
    const seed=await page.evaluate(async ({PA,PB,WORKER})=>{
      const fid=CONFIG.CURRENT_FARM_ID
      const farmRow=await sb.from('farm_farms').select('org_id').eq('id',fid).limit(1); const orgId=farmRow.data[0].org_id
      for(const nm of [PA,PB]){ const old=await sb.from('farm_pesticides').select('id').eq('farm_id',fid).eq('name',nm); for(const row of (old.data||[])){ await sb.from('farm_stock_movements').delete().eq('item_id',row.id); await sb.from('farm_pesticides').delete().eq('id',row.id) } }
      const oldR=await sb.from('farm_work_records').select('id').eq('farm_id',fid).eq('worker',WORKER); for(const row of (oldR.data||[])){ await sb.from('farm_stock_movements').delete().eq('record_id',row.id); await sb.from('farm_work_records').delete().eq('id',row.id) }
      const pA=crypto.randomUUID(), pB=crypto.randomUUID()
      await sb.from('farm_pesticides').insert([
        { id:pA, org_id:orgId, farm_id:fid, name:PA, reg_no:'QA', dilution:1000, max_times:3, preharvest_days:7, stock_l:20 },
        { id:pB, org_id:orgId, farm_id:fid, name:PB, reg_no:'QA', dilution:1000, max_times:3, preharvest_days:7, stock_l:20 },
      ])
      const rid=crypto.randomUUID()
      const rec={ id:rid, field_id:null, date:'2026-07-14', work_type:'農薬散布', pesticide_id:pA, dilution:1000, amount:5,
        spray_volume_L:500, weather:'晴', worker:WORKER, note:'QA-WREDIT(自動削除)', field_ids:[], checks:{} }
      const c=await farmRepo.createWithStock('farm_records', fid, rec, [{ item_type:'pesticide', item_id:pA, delta_amount:-5, unit:'L', reason:'農薬散布' }])
      return { pA, pB, rid, c:!!(c&&c.ok) }
    },{PA,PB,WORKER})
    pA=seed.pA; pB=seed.pB; rid=seed.rid
    if(!seed.c)throw new Error('seed createWithStock failed')
    const stockOf=async (id)=>page.evaluate(async (id)=>{ const r=await sb.from('farm_pesticides').select('stock_l').eq('id',id); return Number(r.data[0].stock_l) },id)
    await page.goto(`http://localhost:${PORT}/?dbdest=1`,{waitUntil:'networkidle2',timeout:60000}); await sleep(1500)

    // ═══ W1: 日報管理→該当行の詳細/編集→編集→農薬をA→B→保存する ═══
    phase='w1-edit-pesticide'
    const stA0=await stockOf(pA), stB0=await stockOf(pB) // A=15, B=20
    await navClick(page,'日報管理'); await sleep(1200)
    // 担当者(QA-WREDIT担当)を含む行の「詳細 / 編集」を押す
    const opened=await page.evaluate((worker)=>{
      const rows=[...document.querySelectorAll('tr')].filter(tr=>tr.offsetParent&&tr.textContent.includes(worker))
      const row=rows[0]; if(!row)return false
      const btn=[...row.querySelectorAll('button')].find(b=>/詳細|編集/.test(b.textContent))
      if(btn){btn.click();return true}return false
    },WORKER)
    if(!opened)throw new Error('record row not found in 日報管理')
    await sleep(800)
    await clickText(page,'編集'); await sleep(700)
    // 農薬selectでBを選ぶ(UUID保持=Critical修正の検証)
    const selected=await page.evaluate((name)=>{
      const sel=[...document.querySelectorAll('select')].filter(e=>e.offsetParent).find(s=>[...s.options].some(o=>o.textContent.includes(name)))
      if(!sel)return false
      const opt=[...sel.options].find(o=>o.textContent.includes(name)); if(!opt)return false
      const setter=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set
      setter.call(sel,opt.value); sel.dispatchEvent(new Event('change',{bubbles:true})); return true
    },PB)
    if(!selected)throw new Error('pesticide B option not found in edit modal')
    await sleep(400)
    await clickText(page,'保存する'); await sleep(2500)
    const stA1=await stockOf(pA), stB1=await stockOf(pB)
    const recPid=await page.evaluate(async (rid)=>{ const r=await sb.from('farm_work_records').select('pesticide_id').eq('id',rid); return r.data&&r.data[0]?r.data[0].pesticide_id:null },rid)
    ok('W1 日報の農薬編集(実UI): A→Bで在庫がA復元(15→20)・B減算(20→15)・記録のpesticide_idがB(UUID・NaN化しない)',
      stA0===15 && stB0===20 && stA1===20 && stB1===15 && recPid===pB,
      JSON.stringify({stA0,stB0,stA1,stB1,recPidIsB:recPid===pB}))
  } finally {
    try{
      await page.evaluate(async ({pA,pB,rid})=>{
        if(rid){ await sb.from('farm_stock_movements').delete().eq('record_id',rid); await sb.from('farm_work_records').delete().eq('id',rid) }
        for(const id of [pA,pB]){ if(id){ await sb.from('farm_stock_movements').delete().eq('item_id',id); await sb.from('farm_pesticides').delete().eq('id',id) } }
      },{pA,pB,rid})
    }catch(_){}
  }
  const pass=checks.filter(c=>c.pass).length
  console.log('QAWREDIT_START')
  checks.forEach(c=>console.log((c.pass?'PASS':'FAIL')+' '+c.name+(c.extra?' ['+c.extra+']':'')))
  if(errors.length)console.log('ERRORS:',JSON.stringify(errors.slice(0,5)))
  console.log(pass+'/'+checks.length)
  console.log('QAWREDIT_END')
  await b.close(); server.close()
  process.exit(pass===checks.length?0:1)
})().catch(e=>{console.error('RUNERR',e);process.exit(1)})
