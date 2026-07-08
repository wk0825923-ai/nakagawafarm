// ============================================================================
// 総合QAスイープ: 追加機能の網羅検証 ＋ 既存機能への影響(回帰) を複合条件で高頻度に。
//  S1 GAPスキーム×レベル網羅(GGAP/McD/両方 × すべて/上位/下位/推奨)
//  S2 混在マップ(輪郭+畝+ロット+記録 / 輪郭なし / row_count無 / 緯度経度無 を同時)→クリップ/色分け/カルテ/GAPフラグ/クラッシュ無
//  S3 大量データ(30圃場/60ロット/300記録)→全ページ描画・NaN/白画面0・時間
//  S4 全ページ巡回(空 と 大量 の2場面で回帰)
// 実行: cd qa && node qa_master.js
// ============================================================================
const http=require('http'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core')
const ROOT=path.resolve(__dirname,'..'),PORT=8234,CHROME=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css'}
const server=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){r.writeHead(404);r.end('404');return}r.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'});r.end(d)})})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const clickInc=(page,t)=>page.evaluate(t=>{const c=[...document.querySelectorAll('button,a,[role=button]')].filter(e=>e.offsetParent);const el=c.find(e=>e.textContent.trim()===t)||c.find(e=>e.textContent.trim().includes(t)&&e.textContent.trim().length<t.length+16);if(el){el.click();return true}return false},t)
const expand=(page)=>page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim().startsWith('管理・設定')&&e.offsetParent);if(b)b.click()})
const total=(page)=>page.evaluate(()=>{const m=(document.querySelector('.main')||{}).innerText||'';const x=m.match(/対応度（\d+\/(\d+)）/);return x?parseInt(x[1]):null})
const NAV=['総合ダッシュボード','日報入力','作付計画','GAP帳票出力','GAPチェックリスト','日報管理','圃場まとめ','収穫予測','出荷記録','マスタ管理','スタッフ管理','技能実習生','機械整備記録','収益シミュレーター']
;(async()=>{
  await new Promise(r=>server.listen(PORT,r))
  const errors=[]
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']})
  const page=await b.newPage(); await page.setViewport({width:1500,height:1000})
  page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,150)))
  page.on('console',m=>{if(m.type()==='error'){const t=m.text();if(!/favicon|unpkg|jsdelivr|cloudflare|tabler|net::ERR|cyberjapan|arcgis|tile/.test(t))errors.push(t.slice(0,150))}})
  await page.goto(`http://localhost:${PORT}/`,{waitUntil:'networkidle2',timeout:60000})
  if(!(await page.evaluate(()=>!!document.querySelector('.main')))){
    await page.waitForSelector('input[type=email]',{timeout:30000});await page.type('input[type=email]','demo@syatyo-suport.jp');await page.type('input[type=password]','demo1234')
    await page.evaluate(()=>{const x=[...document.querySelectorAll('button[type=submit]')].find(b=>/ログイン/.test(b.textContent));if(x)x.click()})
    for(let i=0;i<40;i++){if(await page.evaluate(()=>!!document.querySelector('.main')))break;await sleep(500)}
  }
  const fid=await page.evaluate(()=> (typeof CONFIG!=='undefined'&&CONFIG.CURRENT_FARM_ID)?CONFIG.CURRENT_FARM_ID:null)
  const R={}
  const seed=async(obj)=>{ await page.evaluate((fid,obj)=>{ Object.keys(localStorage).filter(k=>k.startsWith('farm_')).forEach(k=>localStorage.removeItem(k)); Object.entries(obj).forEach(([k,v])=>localStorage.setItem('farm_'+k+'_'+fid,JSON.stringify(v))) },fid,obj); await page.reload({waitUntil:'networkidle2'}); await sleep(1100); await expand(page); await sleep(150) }
  const sweep=async()=>{ const bad=[]; for(const p of NAV){ await clickInc(page,p); await sleep(330); const s=await page.evaluate(()=>{const m=document.querySelector('.main');if(!m)return{white:true};const t=m.innerText;return{white:false,bad:['NaN','undefined','[object Object]','Infinity'].filter(x=>t.includes(x)).join(',')}}); if(s.white||s.bad)bad.push(p+(s.white?':white':':'+s.bad)) } return bad }

  // ── S1 GAPスキーム×レベル網羅 ──
  await seed({})
  await clickInc(page,'GAPチェックリスト'); await sleep(700)
  const grab=async(lab)=>{ await clickInc(page,lab); await sleep(400); return total(page) }
  const s1={}
  s1.ggap_all=await grab('GLOBALG.A.P.'); s1.ggap_major=await grab('上位（必須）'); s1.ggap_minor=await grab('下位（必須）'); s1.ggap_rec=await grab('推奨')
  await grab('すべて'); s1.mcd=await grab('McD Addendum'); s1.both=await grab('両方')
  R.S1_scheme_level={ ...s1, ok: s1.ggap_all===190&&s1.ggap_major===103&&s1.ggap_minor===67&&s1.ggap_rec===20&&s1.mcd===28&&s1.both===218 }

  // ── S2 混在マップ ──
  const bd=[[35.3850,139.9250],[35.3860,139.9250],[35.3850,139.9270]] // 三角形
  await seed({
    fields_v2:[
      {id:1,name:'A輪郭',crop:'レタス',area_are:10,status:'growing',color:'#0D9972',lat:35.385,lng:139.926,row_count:6,boundary:bd},
      {id:2,name:'B輪郭なし',crop:'とうもろこし',area_are:8,status:'growing',color:'#EA580C',lat:35.383,lng:139.924,row_count:5},
      {id:3,name:'C畝数なし',crop:'米',area_are:5,status:'growing',color:'#D97706',lat:35.386,lng:139.923},
      {id:4,name:'D緯度経度なし',crop:'レタス',area_are:4,status:'growing',row_count:4}
    ],
    lots:{1:[{id:'L1',field_id:1,row_range:'1-3',variety:'レタスA',status:'growing'},{id:'L2',field_id:1,row_range:'4-6',variety:'レタスB',status:'ready'}]},
    pesticides:[{id:1,name:'ダコニール',max_times:3,preharvest_days:7}],
    lot_spray_records:[{id:1,field_id:1,row_range:'1-3',date:'2026-05-20',pesticides:[{pesticide_id:1,dilution:1000}]}],
    harvest_records:[{id:1,field_id:1,row_range:'1-3',date:'2026-05-25',variety:'レタスA',total_cases:5}] // PHI違反(5日)
  })
  await page.evaluate(()=>{const el=document.querySelector('[title="圃場マップ"]');if(el)el.click()}); await sleep(2800)
  R.S2_map=await page.evaluate(()=>{
    const polys=document.querySelectorAll('path.leaflet-interactive').length
    return { hasLeaflet:!!document.querySelector('.leaflet-container'), interactivePaths:polys }
  })
  // 畝カルテ(PHI注意)確認
  await page.evaluate(()=>{const p=document.querySelector('path.leaflet-interactive');if(p)p.dispatchEvent(new MouseEvent('click',{bubbles:true}))}); await sleep(600)
  R.S2_karte=await page.evaluate(()=>{const p=document.querySelector('.leaflet-popup-content');return p?p.innerText.replace(/\s+/g,' ').trim():null})

  // ── S3 大量データ ──
  const fieldsL=[],lots={},records=[]
  for(let i=1;i<=30;i++){ fieldsL.push({id:i,name:'圃場'+i,crop:['レタス','とうもろこし','米'][i%3],area_are:5+i%10,status:'growing',color:'#0D9972',lat:35.38+i*0.0005,lng:139.92+i*0.0005,row_count:4+i%6})
    lots[i]=[{id:'L'+i+'a',field_id:i,row_range:'1-2',variety:'V'+i,status:'growing'},{id:'L'+i+'b',field_id:i,row_range:'3-4',variety:'W'+i,status:'ready'}] }
  for(let i=0;i<300;i++){ records.push({id:1000+i,field_id:1+(i%30),date:'2026-0'+(1+i%6)+'-15',work_type:['除草','その他','畝づくり'][i%3],worker:'W'+i, waste:i%50===0?'廃プラ':undefined}) }
  const t0=Date.now()
  await seed({ fields_v2:fieldsL, lots, records, pesticides:[{id:1,name:'ダコニール',max_times:3,preharvest_days:7}] })
  R.S3_large={ seedFields:30, seedRecords:300, sweepBad: await sweep(), loadOkSec: Math.round((Date.now()-t0)/100)/10 }

  // ── S4 空データ回帰(全ページ) ──
  await seed({})
  R.S4_empty_sweepBad = await sweep()

  R.errorCount=errors.length; R.errors=errors.slice(0,10)
  console.log('QAMASTER_START');console.log(JSON.stringify(R,null,2));console.log('QAMASTER_END')
  await b.close();server.close()
})().catch(e=>{console.error('RUNERR',e);process.exit(1)})
