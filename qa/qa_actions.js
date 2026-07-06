// 使い倒しQA: 帳票出力(PDF/Excel)・各種保存/削除・シミュレーターを実操作し全エラー収集
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core')
const ROOT=require('path').resolve(__dirname,'..'),PORT=8139,CHROME=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){r.writeHead(404);r.end('404');return}r.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'});r.end(d)})})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const click=(page,t)=>page.evaluate(t=>{const v=e=>e.offsetParent!==null;const cs=[...document.querySelectorAll('button,a,[role=button]')].filter(v);let el=cs.find(e=>e.textContent.trim()===t)||cs.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+18);if(!el){const a=[...document.querySelectorAll('div,span,li')].filter(v);el=a.find(e=>e.textContent.trim()===t)||a.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+14)}if(el){el.click();return true}return false},t)
const expand=(page)=>page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim().startsWith('管理・設定')&&e.offsetParent);if(b)b.click()})
;(async()=>{
  await new Promise(r=>server.listen(PORT,r))
  const errors=[]; let cur='-'; const steps=[]
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-dev-shm-usage','--window-size=1600,1000']})
  const page=await b.newPage(); await page.setViewport({width:1600,height:1000})
  // ダウンロードでクラッシュしないように
  const dl=path.join(__dirname,'dl'); try{fs.mkdirSync(dl)}catch{}; const cdp=await page.target().createCDPSession(); await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:dl})
  page.on('console',m=>{if(m.type()==='error'){const t=m.text();if(!/favicon|unpkg|jsdelivr|cloudflare|tailwind|tabler|net::ERR/.test(t))errors.push({page:cur,type:'console',msg:t.slice(0,240)})}})
  page.on('pageerror',e=>errors.push({page:cur,type:'pageerror',msg:String(e.message||e).slice(0,180),stack:String(e.stack||'').split('\n').slice(1,4).join(' | ')}))
  page.on('dialog',async d=>{ await d.accept().catch(()=>{}) }) // confirm/alertを自動OK
  await page.goto(`http://localhost:${PORT}/`,{waitUntil:'networkidle2',timeout:60000})
  if(!(await page.evaluate(()=>!!document.querySelector('.main')))){
    await page.waitForSelector('input[type=email]',{timeout:30000});await page.type('input[type=email]','demo@syatyo-suport.jp');await page.type('input[type=password]','demo1234')
    await page.evaluate(()=>{const x=[...document.querySelectorAll('button[type=submit]')].find(b=>/ログイン/.test(b.textContent));if(x)x.click()})
    for(let i=0;i<40;i++){if(await page.evaluate(()=>!!document.querySelector('.main')))break;await sleep(500)}
  }
  await page.evaluate(()=>{Object.keys(localStorage).filter(k=>k.startsWith('farm_')).forEach(k=>localStorage.removeItem(k))})
  await page.reload({waitUntil:'networkidle2'});await sleep(800)
  await click(page,'収穫予測');await sleep(400);await click(page,'編集する');await sleep(200);await click(page,'気温を保存');await sleep(300)
  let fid=await page.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('farm_monthly_temps_'));return k?k.replace('farm_monthly_temps_',''):null})
  if(!fid){fid=await page.evaluate(async()=>{const{data:{user}}=await sb.auth.getUser();const{data:m}=await sb.from('farm_members').select('org_id').eq('user_id',user.id).limit(1);const{data:fa}=await sb.from('farm_farms').select('id').eq('org_id',m[0].org_id).order('created_at');return fa[0].id})}
  // 帳票が動く程度のデータ（エッジ含む: 空名・巨大値・null価格・畝未指定）
  await page.evaluate((fid)=>{const set=(k,v)=>localStorage.setItem(k+'_'+fid,JSON.stringify(v))
    set('farm_fields_v2',[{id:1,name:'第1圃場',field_no:'1',crop:'レタス',area_are:20,color:'#0D9972',row_count:10,crop_category:'leaf_veg',status:'栽培中'},{id:2,name:'第2圃場',field_no:'',crop:'',area_are:0,color:'#EA580C',row_count:0,crop_category:'other',status:undefined}])
    set('farm_lots',{'1':[{id:1001,row_range:'1-4',variety:'シスコ',seed_date:'2025-03-01',transplant_date:'2025-04-01',status:'growing',seed_lot_no:'L1'}],'2':[{id:1002,row_range:'',variety:'',status:'growing'}]})
    set('farm_records',[{id:1,date:'2025-05-10',field_id:1,work_type:'農薬散布',weather:'晴',worker:'今福',pesticide_id:1,dilution:1000,amount:0.1},{id:2,date:'2025-05-11',field_id:2,work_type:'収穫',weather:'晴',worker:''}])
    set('farm_lot_spray_records',[{id:5001,field_id:1,date:'2025-05-10',weather:'晴',row_range:'1-4',pesticides:[{pesticide_id:1,dilution:1000,disposal_amount:0}],spray_volume_L:100},{id:5002,field_id:2,date:'2025-05-12',weather:'晴',row_range:'',pesticides:[{pesticide_id:2,dilution:0,disposal_amount:0}],spray_volume_L:0}])
    set('farm_top_dressing_records',[{id:6001,field_id:1,date:'2025-04-20',fertilizing_type:'元肥',item:'レタス',row_range:'1-4',row_count:4,fertilizers:[{fertilizer_id:1,amount_kg:25}]},{id:6002,field_id:2,date:'2025-04-21',fertilizing_type:'追肥',item:'',row_range:'',fertilizers:[{fertilizer_id:2,amount_kg:0}]}])
    set('farm_harvest_records',[{id:7001,field_id:1,date:'2025-06-05',variety:'シスコ',row_range:'1-4',shipments:[{dest:'JA',grade:'規格内',unit_type:'count_pcs',cases:50}],total_cases:50},{id:7002,field_id:2,date:'2025-06-06',variety:'',row_range:'',shipments:[],total_cases:0}])
    set('farm_pesticides',[{id:1,name:'アディオン乳剤',reg_no:'R-1',max_times:3,preharvest_days:7},{id:2,name:'',reg_no:'',max_times:0,preharvest_days:0}])
    set('farm_pesticide_stock',[{pesticide_id:1,stock_L:8},{pesticide_id:2,stock_L:-5}])
    set('farm_pesticide_purchases',[{id:1,pesticide_id:1,amount_L:4,price_yen:8000}])
    set('farm_fertilizers',[{id:1,name:'化成肥料888',unit_price_yen_per_kg:90},{id:2,name:'',unit_price_yen_per_kg:null}])
    set('farm_fertilizer_stock',[{fertilizer_id:1,stock_kg:200},{fertilizer_id:2,stock_kg:0}])
    set('farm_staff',[{id:1,name:'中川',nationality:'JP',role:'manager',skills:[]},{id:2,name:'Nguyen',nationality:'VN',role:'trainee',visa_expires_at:'2025-01-01',skills:[]}])
    set('farm_shipment_records',[{id:1,date:'2025-06-10',variety:'シスコ',dest:'JA',cases:10,harvest_date:'2025-06-05'}])
    set('farm_maintenance_records',[{id:1,date:'2026-06-03',machine_name:'トラクター',machine_no:'T-01',mtype:'点検',result:'要対応',worker:'中川'}])
    set('farm_gap',(typeof INITIAL_GAP_CHECKS!=='undefined')?INITIAL_GAP_CHECKS.map(c=>({...c,is_cleared:!c.auto})):[])
    set('farm_monthly_temps',[1,2,6,12,17,21,25,26,21,15,9,3])
  },fid)
  await page.reload({waitUntil:'networkidle2'});await sleep(1500);await expand(page);await sleep(300)
  const act=async(label,fn)=>{cur=label;const before=errors.length;try{await fn()}catch(e){errors.push({page:label,type:'runner',msg:String(e.message||e).slice(0,140)})}await sleep(700);steps.push({label,newErrors:errors.length-before})}

  // 1) GAP帳票出力: PDF・Excel
  await act('GAP帳票:PDF',async()=>{await click(page,'GAP帳票出力');await sleep(600);await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>/PDF/.test(b.textContent)&&b.offsetParent);if(b)b.click()});await sleep(2500)})
  await act('GAP帳票:Excel',async()=>{await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>/Excel/.test(b.textContent)&&b.offsetParent);if(b)b.click()});await sleep(1500)})
  // 2) 日報入力: 農薬散布(リッチ畝)を保存
  await act('日報:農薬散布リッチ保存',async()=>{await click(page,'日報入力');await sleep(600)
    await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('第1圃場')&&b.offsetParent);if(b)b.click()});await sleep(300)
    await page.evaluate(()=>{const bs=[...document.querySelectorAll('button')].filter(b=>/次へ/.test(b.textContent)&&b.offsetParent);if(bs[0])bs[0].click()});await sleep(400)
    await page.evaluate(()=>{const bs=[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='農薬散布'&&b.offsetParent);const b=bs[bs.length-1];if(b)b.click()});await sleep(300)
    await page.evaluate(()=>{const bs=[...document.querySelectorAll('button')].filter(b=>/次へ/.test(b.textContent)&&b.offsetParent);const b=bs[bs.length-1];if(b)b.click()});await sleep(500)
    await page.evaluate(()=>{const s=[...document.querySelectorAll('select')].find(x=>x.offsetParent);if(s&&s.options.length>1){s.value=s.options[1].value;s.dispatchEvent(new Event('change',{bubbles:true}))}});await sleep(300)
    await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>/記録する|保存/.test(b.textContent)&&b.offsetParent);if(b)b.click()});await sleep(800)})
  // 2b) 日報→施肥(リッチ) 保存
  const richDaily=async(work)=>{ await click(page,'日報入力');await sleep(600)
    await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('第1圃場')&&b.offsetParent);if(b)b.click()});await sleep(300)
    await page.evaluate(()=>{const bs=[...document.querySelectorAll('button')].filter(b=>/次へ/.test(b.textContent)&&b.offsetParent);if(bs[0])bs[0].click()});await sleep(400)
    await page.evaluate((w)=>{const bs=[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()===w&&b.offsetParent);const b=bs[bs.length-1];if(b)b.click()},work);await sleep(300)
    await page.evaluate(()=>{const bs=[...document.querySelectorAll('button')].filter(b=>/次へ/.test(b.textContent)&&b.offsetParent);const b=bs[bs.length-1];if(b)b.click()});await sleep(500)
    await page.evaluate(()=>{[...document.querySelectorAll('select')].forEach(s=>{if(s.offsetParent&&s.options.length>1){s.value=s.options[1].value;s.dispatchEvent(new Event('change',{bubbles:true}))}})});await sleep(200)
    await page.evaluate(()=>{document.querySelectorAll('input[type=number]').forEach(i=>{if(i.offsetParent){i.value='10';i.dispatchEvent(new Event('input',{bubbles:true}))}})});await sleep(200)
    await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>/記録する|保存/.test(b.textContent)&&b.offsetParent);if(b)b.click()});await sleep(800) }
  await act('日報:施肥リッチ保存',()=>richDaily('施肥'))
  await act('日報:収穫リッチ保存',()=>richDaily('収穫'))
  // 3) 出荷記録: 追加
  await act('出荷記録:追加',async()=>{await click(page,'出荷記録');await sleep(500);await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>/出荷を記録|追加/.test(b.textContent)&&b.offsetParent);if(b)b.click()});await sleep(400)
    await page.evaluate(()=>{document.querySelectorAll('input[type=number]').forEach(i=>{if(i.offsetParent){i.value='5';i.dispatchEvent(new Event('input',{bubbles:true}))}})});await sleep(200)
    await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>/保存|記録|追加/.test(b.textContent)&&b.offsetParent&&!/出荷を記録/.test(b.textContent));if(b)b.click()});await sleep(600)})
  // 4) マスタ管理: 農薬追加
  await act('マスタ:農薬追加',async()=>{await click(page,'マスタ管理');await sleep(500);await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>/追加|新規/.test(b.textContent)&&b.offsetParent);if(b)b.click()});await sleep(400)
    await page.evaluate(()=>{const i=[...document.querySelectorAll('input[type=text]')].find(x=>x.offsetParent);if(i){i.value='テスト薬剤';i.dispatchEvent(new Event('input',{bubbles:true}))}});await sleep(200)
    await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>/保存|登録|追加/.test(b.textContent)&&b.offsetParent);if(b)b.click()});await sleep(500)})
  // 5) 機械整備記録: 追加
  await act('整備記録:追加',async()=>{await click(page,'機械整備記録');await sleep(500);await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>/追加|新規|記録/.test(b.textContent)&&b.offsetParent);if(b)b.click()});await sleep(400)
    await page.evaluate(()=>{const i=[...document.querySelectorAll('input[type=text]')].find(x=>x.offsetParent);if(i){i.value='コンバイン';i.dispatchEvent(new Event('input',{bubbles:true}))}});await sleep(200)
    await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>/保存|登録|記録する/.test(b.textContent)&&b.offsetParent);if(b)b.click()});await sleep(500)})
  // 6) 収益シミュレーター
  await act('収益シミュレーター',async()=>{await click(page,'収益シミュレーター');await sleep(600);await page.evaluate(()=>{document.querySelectorAll('input[type=range],input[type=number]').forEach(i=>{if(i.offsetParent){i.value=i.max||'100';i.dispatchEvent(new Event('input',{bubbles:true}))}})});await sleep(500)})
  // 7) 日報管理: 1件削除(confirmはdialogでOK)
  await act('日報管理:削除',async()=>{await click(page,'日報管理');await sleep(500);await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>/削除/.test(b.textContent)&&b.offsetParent);if(b)b.click()});await sleep(500);await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>/削除|OK|はい/.test(b.textContent)&&b.offsetParent);if(b)b.click()});await sleep(500)})

  console.log('QAACT_START')
  console.log(JSON.stringify({steps, errorCount:errors.length, errors:errors.slice(0,40)},null,2))
  console.log('QAACT_END')
  await b.close();server.close()
})().catch(e=>{console.error('RUNERR',e);process.exit(1)})
