// ============================================================================
// スタッフ画面ファザー: スタッフ簡易画面(StaffQuickView)を人間の多様な異常データで突く。
//  - 当日記録リスト(todayItems)・なおす(編集)・けす(削除確認) をエッジデータで検証
//  - 白画面/NaN/undefined/例外 が出ないか。20データセット。
// 実行: cd qa && node qa_fuzz_staff.js
// ============================================================================
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core')
const ROOT=path.resolve(__dirname,'..'),PORT=8247,CHROME=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css'}
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){r.writeHead(404);r.end('404');return}r.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'});r.end(d)})})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const ready=(page)=>page.evaluate(()=>!!document.querySelector('.main')||!!document.querySelector('.staff-view'))
const login=async(page)=>{ await sleep(400); const e=await page.$('input[type=email]'); if(e){ await page.type('input[type=email]','demo@syatyo-suport.jp'); await page.type('input[type=password]','demo1234'); await page.evaluate(()=>{const x=[...document.querySelectorAll('button[type=submit]')].find(b=>/ログイン/.test(b.textContent));if(x)x.click()}) } for(let i=0;i<50;i++){ if(await ready(page))break; await sleep(400) } }
let SEED=999; const rnd=()=>{ SEED=(SEED*1103515245+12345)&0x7fffffff; return SEED/0x7fffffff }
const pick=(a)=>a[Math.floor(rnd()*a.length)]
const ESTR=['','   ','あ'.repeat(200),'😀🌱','＝＋','A,B\n"C"',"O'Brien",'ﾊﾝｶｸ']
const ENUM=[0,-1,999999,NaN,Infinity,'12','１２','abc']
const today=(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})()
const EDATE=[today,today,'2027-12-31','',null,'bad']
;(async()=>{
  await new Promise(r=>server.listen(PORT,r))
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',protocolTimeout:300000,args:['--no-sandbox','--disable-dev-shm-usage']})
  const page=await b.newPage(); await page.setViewport({width:420,height:900})
  const capt=new Set(); await page.evaluateOnNewDocument(()=>{const oe=console.error;console.error=function(){try{const s=[...arguments].map(a=>a&&a.stack?a.stack.split('\n').slice(0,3).join(' | '):(a&&a.message?a.message:String(a))).join(' ');(window.__e=window.__e||[]).push(s)}catch(e){}return oe.apply(console,arguments)}})
  const perr=[]; page.on('pageerror',e=>perr.push(String(e.message).slice(0,140)))
  await page.goto(`http://localhost:${PORT}/`,{waitUntil:'domcontentloaded',timeout:60000}); await login(page)
  const fid=await page.evaluate(()=>CONFIG.CURRENT_FARM_ID)
  let checks=0; const fails=[]
  const CHK=(c,l)=>{checks++;if(!c)fails.push(l)}
  const collect=async()=>{try{const a=await page.evaluate(()=>{const x=window.__e||[];window.__e=[];return x});a.forEach(s=>{if(/at |TypeError|Cannot read|ErrorBoundary/.test(s))capt.add(s.slice(0,200))})}catch(e){}}
  const scan=async(w)=>{const s=await page.evaluate(()=>{const r=document.querySelector('.staff-view')||document.querySelector('.main');if(!r)return{white:true};const t=r.innerText;return{white:false,bad:['NaN','undefined','[object Object]','Infinity'].filter(x=>t.includes(x)).join(',')}});CHK(!s.white,'white:'+w);CHK(!s.bad,'bad('+s.bad+'):'+w)}

  for(let d=0; d<20; d++){
    const n=1+Math.floor(rnd()*5)
    const fields=[{id:1,name:pick(ESTR)||'圃場1',crop:pick(['レタス','',pick(ESTR)]),area_are:pick(ENUM),status:'growing',row_count:pick(ENUM)}]
    const records=[],sprays=[],ferts=[],harvs=[]
    for(let i=0;i<n;i++){
      records.push({id:100+i,field_id:pick([1,undefined,999]),date:pick(EDATE),work_type:pick(['除草','その他','',pick(ESTR)]),worker:pick(ESTR)})
      sprays.push({id:200+i,field_id:1,row_range:pick(['1-3','abc','']),date:pick(EDATE),pesticides:[{pesticide_id:pick([1,999]),dilution:pick(ENUM)}]})
      ferts.push({id:300+i,field_id:1,row_range:pick(['1-3','']),date:pick(EDATE),fertilizer_id:1,amount_kg:pick(ENUM)})
      harvs.push({id:400+i,field_id:1,row_range:pick(['1-3','']),date:pick(EDATE),variety:pick(ESTR),total_cases:pick(ENUM)})
    }
    await page.evaluate((fid,o)=>{Object.keys(localStorage).filter(k=>k.startsWith('farm_')).forEach(k=>localStorage.removeItem(k));Object.entries(o).forEach(([k,v])=>localStorage.setItem('farm_'+k+'_'+fid,JSON.stringify(v)))},fid,
      {fields_v2:fields,records,lot_spray_records:sprays,top_dressing_records:ferts,harvest_records:harvs,lots:{1:[{id:'L1',field_id:1,row_range:pick(['1-3','']),variety:pick(ESTR),status:'growing'}]},pesticides:[{id:1,name:'D',max_times:pick(ENUM),preharvest_days:pick(ENUM)}]})
    await page.goto(`http://localhost:${PORT}/?view=staff`,{waitUntil:'domcontentloaded'}); await login(page); await sleep(700)
    await scan('staff-list#'+d)
    // なおす(編集)を開く
    await page.evaluate(()=>{const bt=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='なおす'&&b.offsetParent);if(bt)bt.click()}); await sleep(400); await scan('edit#'+d)
    await page.evaluate(()=>{const bt=[...document.querySelectorAll('button')].find(b=>/×|キャンセル|閉じる/.test(b.textContent)&&b.offsetParent);if(bt)bt.click()}); await sleep(200)
    // けす(削除確認)を開く
    await page.evaluate(()=>{const bt=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='けす'&&b.offsetParent);if(bt)bt.click()}); await sleep(300); await scan('delete#'+d)
    await page.evaluate(()=>{const bt=[...document.querySelectorAll('button')].find(b=>/キャンセル|やめる|×/.test(b.textContent)&&b.offsetParent);if(bt)bt.click()}); await sleep(200)
    await collect()
  }
  await collect()
  console.log('QAFUZZSTAFF_START');console.log(JSON.stringify({checksRun:checks,failCount:fails.length,failures:fails.slice(0,20),pageErrors:perr.length,uniqueErrors:[...capt].slice(0,12)},null,2));console.log('QAFUZZSTAFF_END')
  await b.close();server.close()
})().catch(e=>{console.error('RUNERR',e);process.exit(1)})
