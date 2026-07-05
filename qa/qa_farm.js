const http = require('http')
const fs = require('fs')
const path = require('path')
const puppeteer = require('puppeteer-core')

const ROOT = require('path').resolve(__dirname, '..')
const PORT = 8124
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon', '.json':'application/json' }

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = path.join(ROOT, p)
  fs.readFile(fp, (err, data) => { if (err) { res.writeHead(404); res.end('404'); return } res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' }); res.end(data) })
})

const NAV = ['総合ダッシュボード','日報入力','作付計画 / 経営予測','GAP帳票出力','GAPチェックリスト','日報管理','農薬マスタ管理','肥料マスタ管理','圃場まとめ','収穫予測','圃場実績・評価','スタッフ管理','技能実習生 作業日誌','機器予約','収益シミュレーター','多言語マニュアル','作物カテゴリ管理','設定']
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function clickByText(page, text) {
  return page.evaluate((text) => {
    const vis = e => e.offsetParent !== null
    const clickable = [...document.querySelectorAll('button, a, [role=button]')].filter(vis)
    let t = clickable.find(e => e.textContent.trim() === text) || clickable.find(e => e.textContent.trim().includes(text) && e.textContent.trim().length < text.length + 20)
    if (!t) { const all = [...document.querySelectorAll('div, span, li')].filter(vis); t = all.find(e => e.textContent.trim() === text) || all.find(e => e.textContent.trim().includes(text) && e.textContent.trim().length < text.length + 16) }
    if (t) { t.click(); return true } return false
  }, text)
}
async function mainSummary(page) {
  return page.evaluate(() => { const m = document.querySelector('main.main') || document.querySelector('.main'); if (!m) return { hasMain:false, len:0, text:'' }; return { hasMain:true, len:m.innerText.length, text:m.innerText.slice(0,70).replace(/\n/g,' ') } })
}

async function run() {
  await new Promise(r => server.listen(PORT, r))
  const errors = []; let phase = 'boot', current = '-'
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage'] })
  const page = await browser.newPage()
  page.on('console', m => { if (m.type() === 'error') errors.push({ phase, page: current, type:'console', msg: m.text().slice(0,260) }) })
  page.on('pageerror', e => errors.push({ phase, page: current, type:'pageerror', msg: String(e.message||e).slice(0,200), stack:String(e.stack||'').split('\n').slice(0,4).join(' | ') }))
  const results = { sweep: [] }

  await page.goto(`http://localhost:${PORT}/`, { waitUntil:'networkidle2', timeout:60000 })
  if (!(await page.evaluate(() => !!document.querySelector('.main')))) {
    await page.waitForSelector('input[type=email]', { timeout:30000 })
    await page.type('input[type=email]', 'demo@syatyo-suport.jp'); await page.type('input[type=password]', 'demo1234')
    await page.evaluate(() => { const b=[...document.querySelectorAll('button[type=submit]')].find(b=>/ログイン/.test(b.textContent)); if(b)b.click() })
    let st='wait'; for(let i=0;i<40;i++){ st=await page.evaluate(()=>document.querySelector('.main')?'ready':([...document.querySelectorAll('*')].some(e=>/正しくありません|Invalid/.test(e.textContent))?'autherr':'wait')); if(st!=='wait')break; await sleep(500) }
    if (st!=='ready'){ console.log(JSON.stringify({fatal:'login',st,errors})); await browser.close(); server.close(); return }
  }
  await page.evaluate(() => { Object.keys(localStorage).filter(k=>k.startsWith('farm_')).forEach(k=>localStorage.removeItem(k)) })
  await page.reload({ waitUntil:'networkidle2' }); await sleep(1200)
  await clickByText(page,'収穫予測'); await sleep(600); await clickByText(page,'編集する'); await sleep(300); await clickByText(page,'気温を保存'); await sleep(500)
  let farmId = await page.evaluate(() => { const k=Object.keys(localStorage).find(k=>k.startsWith('farm_monthly_temps_')); return k?k.replace('farm_monthly_temps_',''):null })
  if (!farmId) { farmId = await page.evaluate(async()=>{ try{ const {data:{user}}=await sb.auth.getUser(); const {data:m}=await sb.from('farm_members').select('org_id').eq('user_id',user.id).limit(1); const {data:fa}=await sb.from('farm_farms').select('id').eq('org_id',m[0].org_id).order('created_at'); const s=localStorage.getItem('last_farm_'+m[0].org_id); const f=fa.find(x=>x.id===s)||fa[0]; return f?f.id:null }catch(e){return 'ERR:'+e.message} }) }
  results.farmId = farmId
  if (!farmId || String(farmId).startsWith('ERR')) { console.log(JSON.stringify({fatal:'farmId',farmId,errors})); await browser.close(); server.close(); return }

  results.seed = await page.evaluate((fid) => {
    const set=(k,v)=>localStorage.setItem(k+'_'+fid,JSON.stringify(v))
    const COLORS=['#0D9972','#EA580C','#2563EB','#7C3AED','#B45309','#DC2626','#0891B2','#65A30D']
    const def=[]
    for(let i=0;i<8;i++) def.push({crop:'レタス',cat:'leaf_veg'})
    for(let i=0;i<7;i++) def.push({crop:'とうもろこし',cat:'corn'})
    for(let i=0;i<5;i++) def.push({crop:'米',cat:'rice'})
    const fields=def.map((d,idx)=>({id:idx+1,name:'第'+(idx+1)+'圃場',field_no:String(idx+1),crop:d.crop,area_are:10+((idx+1)%5)*5,color:COLORS[idx%COLORS.length],row_count:12,crop_category:d.cat}))
    set('farm_fields_v2',fields)
    const lots={},records=[],sprays=[],harvs=[],ferts=[]; let rid=1000,sid=5000,hid=7000,tid=6000
    fields.forEach(f=>{
      lots[f.id]=[]
      if(f.crop==='レタス'){
        lots[f.id].push({id:++rid,row_range:'1-4',variety:'シスコ',seed_date:'2025-03-01',transplant_date:'2025-04-01',seedling_period_days:31,status:'harvested'})
        lots[f.id].push({id:++rid,row_range:'5-8',variety:'ラプトル',seed_date:'2025-07-25',transplant_date:'2025-08-28',seedling_period_days:34,status:'growing'})
        harvs.push({id:++hid,field_id:f.id,date:'2025-06-05',variety:'シスコ',row_range:'1-4',lot_code:'L'+f.id,shipments:[{dest:'朝採りJA',grade:'規格内',unit_type:'count_pcs',cases:40+f.id}],total_cases:40+f.id,note:''})
        sprays.push({id:++sid,field_id:f.id,date:'2025-05-10',weather:'晴',row_range:'1-4',pesticides:[{pesticide_id:1,dilution:1000,disposal_amount:0}],spray_volume_L:100,note:''})
        ferts.push({id:++tid,field_id:f.id,date:'2025-04-20',fertilizing_type:'元肥',item:'レタス',row_range:'1-4',row_count:4,fertilizers:[{fertilizer_id:1,dilution:null,amount_kg:25}],spray_volume_L:null,note:''})
      } else if(f.crop==='とうもろこし'){
        lots[f.id].push({id:++rid,row_range:'1-6',variety:'ゴールドラッシュ',seed_date:'2025-04-15',transplant_date:'2025-05-10',seedling_period_days:25,status:'harvested'})
        lots[f.id].push({id:++rid,row_range:'7-12',variety:'おひさまコーン',seed_date:'2025-05-15',transplant_date:'2025-06-05',seedling_period_days:21,status:'ready'})
        harvs.push({id:++hid,field_id:f.id,date:'2025-07-20',variety:'ゴールドラッシュ',row_range:'1-6',lot_code:'C'+f.id,shipments:[{dest:'取引先A',grade:'2L',unit_type:'container_count',cases:20+f.id}],total_cases:20+f.id,note:''})
        sprays.push({id:++sid,field_id:f.id,date:'2025-06-10',weather:'曇',row_range:'1-6',pesticides:[{pesticide_id:2,dilution:2000,disposal_amount:0}],spray_volume_L:120,note:''})
      } else {
        lots[f.id].push({id:++rid,row_range:'1-12',variety:'コシヒカリ',seed_date:'2025-04-10',transplant_date:'2025-05-20',seedling_period_days:40,status:'harvested'})
        lots[f.id].push({id:++rid,row_range:'1-6',variety:'秋レタス転換',seed_date:'2025-07-25',transplant_date:'2025-08-28',seedling_period_days:34,status:'growing'})
        harvs.push({id:++hid,field_id:f.id,date:'2025-09-25',variety:'コシヒカリ',row_range:'1-12',lot_code:'R'+f.id,shipments:[{dest:'JA',grade:'一等米',unit_type:'count_pcs',cases:30+f.id}],total_cases:30+f.id,note:'稲刈り'})
        ferts.push({id:++tid,field_id:f.id,date:'2025-08-30',fertilizing_type:'元肥',item:'レタス',row_range:'1-6',row_count:6,fertilizers:[{fertilizer_id:1,dilution:null,amount_kg:30}],spray_volume_L:null,note:'転換後'})
      }
      records.push({id:100000+f.id,date:'2024-05-10',field_id:f.id,work_type:'定植',weather:'晴',worker:'今福',variety:f.crop,rows_worked:4,note:'過去データ',photos:[]})
      records.push({id:200000+f.id,date:'2023-06-15',field_id:f.id,work_type:'農薬散布',weather:'晴',worker:'今福',pesticide_id:1,dilution:1000,amount:0.1,note:'過去'})
    })
    set('farm_lots',lots); set('farm_records',records); set('farm_lot_spray_records',sprays); set('farm_harvest_records',harvs); set('farm_top_dressing_records',ferts)
    set('farm_pesticides',[{id:1,name:'アディオン乳剤',reg_no:'R-18332',max_times:3,preharvest_days:7},{id:2,name:'ダコニール1000',reg_no:'R-9188',max_times:5,preharvest_days:14},{id:3,name:'モスピラン',reg_no:'R-20115',max_times:2,preharvest_days:3}])
    set('farm_pesticide_stock',[{pesticide_id:1,stock_L:8},{pesticide_id:2,stock_L:5},{pesticide_id:3,stock_L:3}])
    set('farm_pesticide_purchases',[{id:1,pesticide_id:1,amount_L:4,price_yen:8000},{id:2,pesticide_id:2,amount_L:3,price_yen:6000}])
    set('farm_fertilizers',[{id:1,name:'化成肥料888',unit_price_yen_per_kg:90},{id:2,name:'有機配合',unit_price_yen_per_kg:120}])
    set('farm_fertilizer_stock',[{fertilizer_id:1,stock_kg:200},{fertilizer_id:2,stock_kg:150}])
    set('farm_staff',[
      {id:1,name:'中川 太郎',name_kana:'ナカガワ タロウ',nationality:'JP',role:'manager',skills:[],avatar:'中'},
      {id:2,name:'佐藤 花子',name_kana:'サトウ ハナコ',nationality:'JP',role:'worker',skills:[],avatar:'佐'},
      {id:3,name:'Nguyen Van A',name_kana:'グエン',nationality:'VN',role:'trainee',visa_expires_at:'2026-11-30',skills:[],avatar:'Ng'},
      {id:4,name:'Li Wei',name_kana:'リー ウェイ',nationality:'CN',role:'trainee',visa_expires_at:'2027-03-15',skills:[],avatar:'Li'},
      {id:5,name:'Santos Maria',name_kana:'サントス',nationality:'PH',role:'trainee',visa_expires_at:'2026-08-20',skills:[],avatar:'Sa'},
    ])
    set('farm_crop_categories',[
      {key:'leaf_veg',name:'葉物野菜',ui_mode:'row_map',harvest_grades:['規格内','B品'],color:'#0D9972',sort_order:0,base_temp_c:4,required_gdd:900},
      {key:'corn',name:'とうもろこし',ui_mode:'row_map',harvest_grades:['2L','L','M','S','B品'],color:'#EA580C',sort_order:1,base_temp_c:10,required_gdd:850},
      {key:'rice',name:'水稲',ui_mode:'growth_stage',harvest_grades:['一等米','二等米','くず米'],color:'#2563EB',sort_order:2,base_temp_c:10,required_gdd:1000},
      {key:'other',name:'その他',ui_mode:'standard',harvest_grades:['規格内','B品'],color:'#6B7280',sort_order:9,base_temp_c:null,required_gdd:null},
    ])
    set('farm_monthly_temps',[1,2,6,12,17,21,25,26,21,15,9,3])
    return { fields:fields.length, lots:Object.values(lots).reduce((a,l)=>a+l.length,0), records:records.length, harvs:harvs.length, sprays:sprays.length, ferts:ferts.length }
  }, farmId)

  await page.reload({ waitUntil:'networkidle2' }); await sleep(2000); phase = 'scenario'
  for (const label of NAV) { current = label; const ok = await clickByText(page, label); await sleep(750); const s = await mainSummary(page); results.sweep.push({ label, clicked:ok, hasMain:s.hasMain, len:s.len, head:s.text }) }
  // 米→レタス転換圃場（第16圃場）詳細＋サブタブ
  current='圃場一覧'; await clickByText(page,'一覧'); await sleep(700)
  await page.evaluate(() => { const el=[...document.querySelectorAll('*')].find(e=>e.textContent.trim()==='第16圃場'&&e.offsetParent); if(el)el.click() })
  await sleep(1000); current='圃場詳細(米→レタス)'; results.riceFieldDetail = await mainSummary(page)
  for (const sub of ['日報入力','農薬散布','収穫・出荷','実績評価']) { current='field16:'+sub; await clickByText(page, sub); await sleep(700); const s=await mainSummary(page); results.sweep.push({ label:'field16:'+sub, clicked:true, hasMain:s.hasMain, len:s.len }) }

  results.errors = errors; results.errorCount = errors.length
  console.log('QARESULT_START'); console.log(JSON.stringify(results, null, 2)); console.log('QARESULT_END')
  await browser.close(); server.close()
}
run().catch(e => { console.error('RUNERR', e); process.exit(1) })
