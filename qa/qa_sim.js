// 3年運用シミュレーション＋エッジケースで全ページ・全サブタブを巡回し、全エラーを収集
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core')
const ROOT=require('path').resolve(__dirname,'..'),PORT=8137,CHROME=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){r.writeHead(404);r.end('404');return}r.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'});r.end(d)})})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const NAV=['総合ダッシュボード','日報入力','作付計画 / 経営予測','GAP帳票出力','GAPチェックリスト','日報管理','圃場まとめ','収穫予測','出荷記録','マスタ管理','スタッフ管理','技能実習生 作業日誌','多言語マニュアル','機器予約','機械整備記録','収益シミュレーター','作物カテゴリ管理','設定']
const click=(page,t)=>page.evaluate(t=>{const v=e=>e.offsetParent!==null;const cs=[...document.querySelectorAll('button,a,[role=button]')].filter(v);let el=cs.find(e=>e.textContent.trim()===t)||cs.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+18);if(!el){const a=[...document.querySelectorAll('div,span,li')].filter(v);el=a.find(e=>e.textContent.trim()===t)||a.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+14)}if(el){el.click();return true}return false},t)
const expand=(page)=>page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim().startsWith('管理・設定')&&e.offsetParent);if(b)b.click()})
;(async()=>{
  await new Promise(r=>server.listen(PORT,r))
  const errors=[]; let cur='-'
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-dev-shm-usage','--window-size=1600,1000']})
  const page=await b.newPage(); await page.setViewport({width:1600,height:1000})
  page.on('console',m=>{if(m.type()==='error'){const t=m.text();if(!/favicon|unpkg|jsdelivr|cloudflare|tailwind|tabler|net::ERR/.test(t))errors.push({page:cur,type:'console',msg:t.slice(0,240)})}})
  page.on('pageerror',e=>errors.push({page:cur,type:'pageerror',msg:String(e.message||e).slice(0,180),stack:String(e.stack||'').split('\n').slice(1,4).join(' | ')}))
  await page.goto(`http://localhost:${PORT}/`,{waitUntil:'networkidle2',timeout:60000})
  if(!(await page.evaluate(()=>!!document.querySelector('.main')))){
    await page.waitForSelector('input[type=email]',{timeout:30000});await page.type('input[type=email]','demo@syatyo-suport.jp');await page.type('input[type=password]','demo1234')
    await page.evaluate(()=>{const x=[...document.querySelectorAll('button[type=submit]')].find(b=>/ログイン/.test(b.textContent));if(x)x.click()})
    for(let i=0;i<40;i++){if(await page.evaluate(()=>!!document.querySelector('.main')))break;await sleep(500)}
  }
  await page.evaluate(()=>{Object.keys(localStorage).filter(k=>k.startsWith('farm_')).forEach(k=>localStorage.removeItem(k))})
  await page.reload({waitUntil:'networkidle2'});await sleep(1000)
  await click(page,'収穫予測');await sleep(500);await click(page,'編集する');await sleep(300);await click(page,'気温を保存');await sleep(400)
  let fid=await page.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('farm_monthly_temps_'));return k?k.replace('farm_monthly_temps_',''):null})
  if(!fid){fid=await page.evaluate(async()=>{const{data:{user}}=await sb.auth.getUser();const{data:m}=await sb.from('farm_members').select('org_id').eq('user_id',user.id).limit(1);const{data:fa}=await sb.from('farm_farms').select('id').eq('org_id',m[0].org_id).order('created_at');return fa[0].id})}

  const seedInfo=await page.evaluate((fid)=>{
    const set=(k,v)=>localStorage.setItem(k+'_'+fid,JSON.stringify(v))
    const C=['#0D9972','#EA580C','#2563EB','#7C3AED','#B45309','#DC2626','#0891B2','#65A30D']
    const crops=['レタス','とうもろこし','米','ターサイ','','＜壊れ＞名前😀ロング'+'あ'.repeat(30)]
    const cats=['leaf_veg','corn','rice','leaf_veg','other','other']
    const fields=[]
    for(let i=1;i<=25;i++){const ci=(i-1)%crops.length;fields.push({id:i,name:'第'+i+'圃場',field_no:(i%3===0?'':String(i)),crop:crops[ci],area_are:(i%7===0?0:10+(i%5)*5),color:C[i%C.length],row_count:(i%9===0?0:12),crop_category:cats[ci],status:(i%8===0?undefined:['栽培中','収穫済','休耕'][i%3]),lat:35.38+(i%5)*0.004,lng:139.92+Math.floor(i/5)*0.004})}
    set('farm_fields_v2',fields)
    const lots={},records=[],sprays=[],harvs=[],ferts=[];let rid=1000,sid=5000,hid=7000,tid=6000
    const YEARS=[2023,2024,2025,2026]
    fields.forEach(f=>{ lots[f.id]=[]
      YEARS.forEach((yr,yi)=>{
        // 各年に1〜2ロット（3年分の作付履歴・畝重なり含む）
        const st=(yr===2026)?'growing':'harvested'
        lots[f.id].push({id:++rid,row_range:(f.id%11===0?'':'1-'+(4+(f.id%4))),variety:(f.crop||'（無）')+yr,seed_date:yr+'-03-01',transplant_date:yr+'-04-0'+(1+yi%8),seedling_period_days:(f.id%13===0?null:30),status:st,seed_lot_no:'L'+yr})
        if(f.id%5===0) lots[f.id].push({id:++rid,row_range:'1-3',variety:'秋'+yr,seed_date:yr+'-07-25',transplant_date:yr+'-08-28',status:st}) // 畝重なり
        // 収穫（一部は畝未指定・巨大値・ゼロ）
        harvs.push({id:++hid,field_id:f.id,date:yr+'-06-1'+(yi%9),variety:(f.crop||'（無）')+yr,row_range:(f.id%7===0?'':'1-4'),lot_code:'H'+f.id+yr,shipments:[{dest:(f.id%4===0?'':'JA'),grade:'規格内',unit_type:'count_pcs',cases:(f.id%6===0?0:(f.id%17===0?999999:20+f.id))}],total_cases:(f.id%6===0?0:(f.id%17===0?999999:20+f.id)),note:''})
        sprays.push({id:++sid,field_id:f.id,date:yr+'-05-10',weather:'晴',row_range:(f.id%9===0?'':'1-4'),pesticides:[{pesticide_id:(f.id%3)+1,dilution:(f.id%14===0?0:1000),disposal_amount:0}],spray_volume_L:(f.id%14===0?0:100),note:''})
        ferts.push({id:++tid,field_id:f.id,date:yr+'-04-20',fertilizing_type:'元肥',item:f.crop,row_range:'1-4',row_count:4,fertilizers:[{fertilizer_id:(f.id%2)+1,dilution:null,amount_kg:(f.id%15===0?0:20)}],spray_volume_L:null,note:''})
        // 日報（各年・作業種いろいろ・過去含む）
        ;['畝づくり','定植','農薬散布','施肥','除草','灌水','収穫','点検','その他'].forEach((wt,wi)=>{
          const rec={id:100000+f.id*100+yr*10+wi,date:yr+'-0'+(1+wi%9)+'-1'+(wi%9),field_id:f.id,work_type:wt,weather:['晴','曇','雨','強風'][wi%4],worker:(f.id%12===0?'':'今福'),note:'',photos:[]}
          if(wt==='農薬散布'){rec.pesticide_id=(f.id%3)+1;rec.dilution=1000;rec.amount=0.1}
          if(wt==='畝づくり')rec.row_range='1-6'
          records.push(rec)
        })
      })
    })
    set('farm_lots',lots);set('farm_records',records);set('farm_lot_spray_records',sprays);set('farm_harvest_records',harvs);set('farm_top_dressing_records',ferts)
    // マスタ（価格未確定・reg_no無し・極端値 混在）
    set('farm_pesticides',[{id:1,name:'アディオン乳剤',reg_no:'R-18332',max_times:3,preharvest_days:7},{id:2,name:'価格未確定薬',reg_no:'',max_times:0,preharvest_days:0},{id:3,name:'モスピラン',reg_no:'R-20115',max_times:2,preharvest_days:3}])
    set('farm_pesticide_stock',[{pesticide_id:1,stock_L:8,alert_threshold_L:2},{pesticide_id:2,stock_L:-5},{pesticide_id:3,stock_L:0}])
    set('farm_pesticide_purchases',[{id:1,pesticide_id:1,amount_L:4,price_yen:8000}]) // 2,3は仕入無し=単価未確定
    set('farm_fertilizers',[{id:1,name:'化成肥料888',unit_price_yen_per_kg:90},{id:2,name:'価格未入力肥料',unit_price_yen_per_kg:null}])
    set('farm_fertilizer_stock',[{fertilizer_id:1,stock_kg:200},{fertilizer_id:2,stock_kg:0}])
    set('farm_fertilizer_purchases',[{id:1,fertilizer_id:1,amount_kg:100,price_yen:9000}])
    // スタッフ（ビザ期限切れ・空名・多国籍）
    set('farm_staff',[{id:1,name:'中川 太郎',nationality:'JP',role:'manager',skills:[]},{id:2,name:'',nationality:'JP',role:'worker',skills:[]},{id:3,name:'Nguyen',nationality:'VN',role:'trainee',visa_expires_at:'2025-01-01',skills:[]},{id:4,name:'Li',nationality:'CN',role:'trainee',visa_expires_at:'2099-01-01',skills:[]},{id:5,name:'Santos',nationality:'PH',role:'trainee',visa_expires_at:'',skills:[]}])
    // 出荷（収穫超え=ストック残マイナス、品目空）
    set('farm_shipment_records',[{id:1,date:'2025-06-10',variety:'レタス2025',dest:'JA',cases:99999,harvest_date:'2025-06-05',note:''},{id:2,date:'2025-06-11',variety:'',dest:'',cases:0,note:''}])
    // 機器・整備（要対応・空）
    const EQ=(typeof EQUIP_LIST!=='undefined')?EQUIP_LIST:['トラクター']
    set('farm_rentals',[0,1,2,3,4].map(i=>({id:9000+i,equipment:EQ[i%EQ.length],date:'2026-06-0'+(1+i),type:i%2?'rental':'own',note:''})))
    set('farm_maintenance_records',[{id:1,date:'2026-06-03',machine_name:'トラクター',machine_no:'T-01',mtype:'点検',result:'要対応',worker:'中川'},{id:2,date:'',machine_name:'',machine_no:'',mtype:'清掃',result:'異常なし',worker:''}])
    // 作付計画（空・重複月）
    set('farm_crop_plans',[{id:1,field_id:1,crop:'レタス',start_month:9,end_month:12,note:''},{id:2,field_id:1,crop:'とうもろこし',start_month:2,end_month:6,note:''}])
    set('farm_gap',(typeof INITIAL_GAP_CHECKS!=='undefined')?INITIAL_GAP_CHECKS.map(c=>({...c,is_cleared:!c.auto})):[])
    set('farm_monthly_temps',[1,2,6,12,17,21,25,26,21,15,9,3])
    return {fields:fields.length,records:records.length,harvs:harvs.length,lots:Object.values(lots).reduce((a,l)=>a+l.length,0)}
  },fid)

  await page.reload({waitUntil:'networkidle2'});await sleep(2500)
  await expand(page);await sleep(400)
  const sweep=[]
  const badScan=()=>page.evaluate(()=>{const m=document.querySelector('.main');if(!m)return{hasMain:false,len:0,bad:'',ctx:''};const t=m.innerText;const hits=[];let ctx='';[/NaN/,/Infinity/,/undefined/,/\[object Object\]/].forEach(re=>{const mm=t.match(re);if(mm){hits.push(mm[0]);const i=t.indexOf(mm[0]);if(!ctx)ctx=t.slice(Math.max(0,i-50),i+18).replace(/\n/g,'·')}});return{hasMain:true,len:t.length,bad:[...new Set(hits)].join(','),ctx}})
  for(const label of NAV){ cur=label; const ok=await click(page,label); await sleep(650); const s=await badScan(); sweep.push({label,clicked:ok,hasMain:s.hasMain,len:s.len,bad:s.bad,ctx:s.ctx}) }
  // 圃場詳細を数圃場ぶん、サブタブまで巡回（エッジ圃場含む: 5,7,9,11,20,25）
  for(const fno of [5,7,9,11,20,25]){
    cur='圃場一覧'; await click(page,'一覧'); await sleep(500)
    await page.evaluate((fno)=>{const m=document.querySelector('main');const el=[...m.querySelectorAll('*')].find(e=>e.textContent.trim()==='第'+fno+'圃場'&&e.offsetParent);if(el)el.click()},fno); await sleep(700)
    for(const sub of ['圃場ダッシュボード','作付け履歴','日報入力','農薬散布','肥料散布記録','収穫・出荷','実績評価']){
      cur='第'+fno+'圃場:'+sub
      await page.evaluate((sub)=>{const m=document.querySelector('main');const el=[...m.querySelectorAll('button,div,span,li,a')].find(e=>e.textContent.trim()===sub&&e.offsetParent);if(el)el.click()},sub)
      await sleep(500)
      const s=await badScan(); sweep.push({label:cur,hasMain:s.hasMain,len:s.len,bad:s.bad})
    }
  }
  const white=sweep.filter(r=>!r.hasMain)
  const badPages=sweep.filter(r=>r.bad).map(r=>({label:r.label,bad:r.bad,ctx:r.ctx}))
  console.log('QASIM_START')
  console.log(JSON.stringify({seed:seedInfo, pagesSwept:sweep.length, whiteScreens:white.map(w=>w.label), badPages, errorCount:errors.length, errors:errors.slice(0,40)},null,2))
  console.log('QASIM_END')
  await b.close();server.close()
})().catch(e=>{console.error('RUNERR',e);process.exit(1)})
