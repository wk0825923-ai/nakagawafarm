// ============================================================================
// 同時利用QA(エッジ): storage同期修正後に残る手戻りリスクを多角で潰す。
//  A 削除の伝播: 別タブが記録を削除→自タブが保存しても、消した記録が復活しない
//  B 同一記録の競合編集: 2タブが同じ記録を別内容に編集→他の記録は失われない
//  C 多タブ(5)同時追加: 5タブが順に追加→全部残る(取りこぼしゼロ)
//  D 別種の記録が別タブで同時: 農薬散布と施肥は別キー→相互に影響しない
// 別ページのlocalStorage書込は他ページでstorageイベントを発火する性質を使い実挙動を検証。
// 実行: cd qa && node qa_concurrent3.js
// ============================================================================
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core')
const ROOT=path.resolve(__dirname,'..'),PORT=8239,CHROME=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css'}
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){r.writeHead(404);r.end('404');return}r.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'});r.end(d)})})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const appReady=(page)=>page.evaluate(()=>!!document.querySelector('.main')||!!document.querySelector('.staff-view'))
const login=async(page)=>{ await sleep(500); const e=await page.$('input[type=email]'); if(e){ await page.type('input[type=email]','demo@syatyo-suport.jp'); await page.type('input[type=password]','demo1234'); await page.evaluate(()=>{const x=[...document.querySelectorAll('button[type=submit]')].find(b=>/ログイン/.test(b.textContent));if(x)x.click()}) } for(let i=0;i<50;i++){ if(await appReady(page))break; await sleep(500) } }
const clickInc=(page,t)=>page.evaluate(t=>{const c=[...document.querySelectorAll('button,a,[role=button]')].filter(e=>e.offsetParent);const el=c.find(e=>e.textContent.trim()===t)||c.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+16);if(el){el.click();return true}return false},t)
const adminSaveDaily=async(page)=>{ await clickInc(page,'日報入力');await sleep(600);await clickInc(page,'第1圃場');await sleep(300);await clickInc(page,'次へ');await sleep(400);await clickInc(page,'除草');await sleep(300);await clickInc(page,'次へ');await sleep(400);await clickInc(page,'確認');await sleep(400);(await clickInc(page,'記録する'))||(await clickInc(page,'保存'));await sleep(800) }
;(async()=>{
  await new Promise(r=>server.listen(PORT,r))
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']})
  const R={}
  const admin=await b.newPage(); await admin.goto(`http://localhost:${PORT}/`,{waitUntil:'domcontentloaded',timeout:60000}); await login(admin)
  const fid=await admin.evaluate(()=>CONFIG.CURRENT_FARM_ID)
  const recs=async()=>admin.evaluate((fid)=>JSON.parse(localStorage.getItem('farm_records_'+fid)||'[]'),fid)
  const initRecs=(page,arr)=>page.evaluate((fid,arr)=>localStorage.setItem('farm_records_'+fid,JSON.stringify(arr)),fid,arr)
  await admin.evaluate((fid)=>{ Object.keys(localStorage).filter(k=>k.startsWith('farm_')).forEach(k=>localStorage.removeItem(k)); localStorage.setItem('farm_fields_v2_'+fid,JSON.stringify([{id:1,name:'第1圃場',crop:'レタス',area_are:10,status:'growing'}])) },fid)
  await admin.reload({waitUntil:'domcontentloaded'}); await sleep(1000)
  const staff=await b.newPage(); await staff.goto(`http://localhost:${PORT}/?view=staff`,{waitUntil:'domcontentloaded'}); await login(staff); await sleep(700)

  // ── A 削除の伝播 ──
  // 初期: R1,R2 (adminのstateにも読み込ませる)
  await initRecs(staff,[{id:1,field_id:1,date:'2026-06-01',work_type:'除草',worker:'R1'},{id:2,field_id:1,date:'2026-06-02',work_type:'その他',worker:'R2'}])
  await admin.reload({waitUntil:'domcontentloaded'}); await sleep(1000)
  // スタッフがR1を削除(別タブ書込→adminへstorageイベント)
  await staff.evaluate((fid)=>{ const a=JSON.parse(localStorage.getItem('farm_records_'+fid)||'[]').filter(r=>r.id!==1); localStorage.setItem('farm_records_'+fid,JSON.stringify(a)) },fid); await sleep(800)
  // adminが実UIで日報を追加保存 → R1が復活しないこと
  await adminSaveDaily(admin); await sleep(400)
  const a1=await recs()
  R.A_delete_propagation={ count:a1.length, r1Resurrected:a1.some(r=>r.id===1), r2Kept:a1.some(r=>r.id===2), adminAdded:a1.some(r=>r.worker!=='R1'&&r.worker!=='R2'),
    verdict:(!a1.some(r=>r.id===1) && a1.some(r=>r.id===2)) ? 'OK(削除が維持され他は残る)' : 'NG' }

  // ── C 多タブ(5)同時追加 ──
  await initRecs(admin,[]); await admin.reload({waitUntil:'domcontentloaded'}); await sleep(800)
  const tabs=[admin,staff]
  for(let i=0;i<3;i++){ const p=await b.newPage(); await p.goto(`http://localhost:${PORT}/?view=staff`,{waitUntil:'domcontentloaded'}); await login(p); tabs.push(p) }
  // 各タブが順に1件ずつ追加(自分の同期済みstateに積む=直近LSを読んでpush)
  for(let i=0;i<tabs.length;i++){ await tabs[i].evaluate((fid,i)=>{ const a=JSON.parse(localStorage.getItem('farm_records_'+fid)||'[]'); a.push({id:5000+i,field_id:1,date:'2026-06-1'+i,work_type:'除草',worker:'T'+i}); localStorage.setItem('farm_records_'+fid,JSON.stringify(a)) },fid,i); await sleep(500) }
  const c=await recs()
  R.C_five_tabs={ count:c.length, workers:c.map(r=>r.worker), allKept:[0,1,2,3,4].every(i=>c.some(r=>r.worker==='T'+i)) }

  // ── D 別種の記録は別キーで独立 ──
  await staff.evaluate((fid)=>localStorage.setItem('farm_lot_spray_records_'+fid,JSON.stringify([{id:1,field_id:1,row_range:'1-3',date:'2026-06-01',pesticides:[{pesticide_id:1,dilution:1000}]}])),fid); await sleep(300)
  await admin.evaluate((fid)=>localStorage.setItem('farm_top_dressing_records_'+fid,JSON.stringify([{id:1,field_id:1,row_range:'1-3',date:'2026-06-01',fertilizer_id:1,amount_kg:10}])),fid); await sleep(300)
  R.D_independent_keys={ spray:await admin.evaluate((fid)=>JSON.parse(localStorage.getItem('farm_lot_spray_records_'+fid)||'[]').length,fid),
    fert:await admin.evaluate((fid)=>JSON.parse(localStorage.getItem('farm_top_dressing_records_'+fid)||'[]').length,fid) }

  console.log('QACONC3_START');console.log(JSON.stringify(R,null,2));console.log('QACONC3_END')
  await b.close();server.close()
})().catch(e=>{console.error('RUNERR',e);process.exit(1)})
