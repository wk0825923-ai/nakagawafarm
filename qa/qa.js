const http = require('http')
const fs = require('fs')
const path = require('path')
const puppeteer = require('puppeteer-core')

const ROOT = require('path').resolve(__dirname, '..')
const PORT = 8123
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon', '.json':'application/json' }

// ── 静的サーバ ──
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0])
  if (p === '/') p = '/index.html'
  const fp = path.join(ROOT, p)
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' })
    res.end(data)
  })
})

const NAV = [
  '総合ダッシュボード','日報入力','作付計画 / 経営予測','GAP帳票出力','GAPチェックリスト','日報管理',
  '農薬マスタ管理','肥料マスタ管理','圃場まとめ','収穫予測','圃場実績・評価',
  'スタッフ管理','技能実習生 作業日誌','機器予約','収益シミュレーター','多言語マニュアル','作物カテゴリ管理','設定',
]

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function clickByText(page, text) {
  return page.evaluate((text) => {
    const vis = e => e.offsetParent !== null
    // 1) button/a/role=button で完全一致 → 部分一致（囲みdivを誤クリックしないよう最優先）
    const clickable = [...document.querySelectorAll('button, a, [role=button]')].filter(vis)
    let t = clickable.find(e => e.textContent.trim() === text)
      || clickable.find(e => e.textContent.trim().includes(text) && e.textContent.trim().length < text.length + 20)
    // 2) それでも無ければ div 等（ナビ項目など）
    if (!t) {
      const all = [...document.querySelectorAll('div, span, li')].filter(vis)
      t = all.find(e => e.textContent.trim() === text)
        || all.find(e => e.textContent.trim().includes(text) && e.textContent.trim().length < text.length + 16)
    }
    if (t) { t.click(); return true }
    return false
  }, text)
}

async function mainSummary(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main.main') || document.querySelector('.main')
    if (!main) return { hasMain:false, len:0, text:'' }
    return { hasMain:true, len: main.innerText.length, text: main.innerText.slice(0, 60).replace(/\n/g,' ') }
  })
}

async function run() {
  await new Promise(r => server.listen(PORT, r))
  const errors = []       // {phase, page, type, msg}
  let phase = 'boot', current = '-'
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage'] })
  const page = await browser.newPage()
  page.on('console', m => { if (m.type() === 'error') errors.push({ phase, page: current, type:'console', msg: m.text().slice(0,300) }) })
  page.on('pageerror', e => errors.push({ phase, page: current, type:'pageerror', msg: String(e.message || e).slice(0,300), stack: String(e.stack||'').split('\n').slice(0,6).join(' | ') }))
  page.on('requestfailed', r => { const u=r.url(); if (!/unpkg|jsdelivr|cloudflare|tailwind|tabler/.test(u)) errors.push({ phase, page: current, type:'reqfail', msg: u.slice(0,150)+' '+(r.failure()&&r.failure().errorText) }) })

  const results = { phaseA: [], phaseB: [], interaction: [] }

  // ============ LOGIN ============
  async function login() {
    await page.goto(`http://localhost:${PORT}/`, { waitUntil:'networkidle2', timeout:60000 })
    // 既にサイドバーがあればログイン済み
    const ready = await page.evaluate(() => !!document.querySelector('.main'))
    if (ready) return 'already'
    await page.waitForSelector('input[type=email]', { timeout:30000 })
    await page.type('input[type=email]', 'demo@syatyo-suport.jp')
    await page.type('input[type=password]', 'demo1234')
    await Promise.all([
      page.evaluate(() => {
        const btn = [...document.querySelectorAll('button[type=submit]')].find(b => /ログイン/.test(b.textContent))
        if (btn) btn.click()
      }),
    ])
    // ready or onboarding
    for (let i=0;i<40;i++){
      const st = await page.evaluate(() => {
        if (document.querySelector('.main')) return 'ready'
        if ([...document.querySelectorAll('*')].some(e=>e.textContent==='ようこそ！')) return 'onboarding'
        if ([...document.querySelectorAll('*')].some(e=>/正しくありません|Invalid/.test(e.textContent))) return 'autherr'
        return 'wait'
      })
      if (st !== 'wait') return st
      await sleep(500)
    }
    return 'timeout'
  }

  const loginResult = await login()
  if (loginResult !== 'ready' && loginResult !== 'already') {
    console.log(JSON.stringify({ fatal:'login', loginResult, errors }, null, 2))
    await browser.close(); server.close(); return
  }

  // ============ PHASE A: 初期ユーザー（空データ） ============
  phase = 'A'
  // farm_* データを消して「初回」状態に（認証セッションは残す）
  await page.evaluate(() => { Object.keys(localStorage).filter(k=>k.startsWith('farm_')).forEach(k=>localStorage.removeItem(k)) })
  await page.reload({ waitUntil:'networkidle2' })
  await sleep(1500)
  for (const label of NAV) {
    current = label
    const ok = await clickByText(page, label)
    await sleep(650)
    const s = await mainSummary(page)
    results.phaseA.push({ label, clicked:ok, hasMain:s.hasMain, len:s.len, head:s.text })
  }
  // 圃場一覧
  current = '圃場一覧'; await clickByText(page,'一覧'); await sleep(500)
  results.phaseA.push({ label:'圃場一覧', ...(await mainSummary(page)) })

  // ============ farmId 特定 ============
  // 方法1: 収穫予測で月別気温を保存 → farm_monthly_temps_<id> キー生成
  await clickByText(page, '収穫予測'); await sleep(700)
  await clickByText(page, '編集する'); await sleep(400)
  await clickByText(page, '気温を保存'); await sleep(600)
  let farmId = await page.evaluate(() => {
    const k = Object.keys(localStorage).find(k => k.startsWith('farm_monthly_temps_'))
    return k ? k.replace('farm_monthly_temps_', '') : null
  })
  // 方法2フォールバック: Supabaseから現在の農場IDを再現取得
  if (!farmId) {
    farmId = await page.evaluate(async () => {
      try {
        const { data:{ user } } = await sb.auth.getUser()
        const { data:members } = await sb.from('farm_members').select('org_id').eq('user_id', user.id).limit(1)
        const orgId = members[0].org_id
        const { data:farms } = await sb.from('farm_farms').select('id').eq('org_id', orgId).order('created_at')
        const saved = localStorage.getItem('last_farm_' + orgId)
        const f = farms.find(x => x.id === saved) || farms[0]
        return f ? f.id : null
      } catch (e) { return 'ERR:' + e.message }
    })
  }
  results.farmId = farmId
  if (!farmId) { console.log(JSON.stringify({ fatal:'no-farmId', errors, results }, null, 2)); await browser.close(); server.close(); return }

  // ============ PHASE B: 使い続けたユーザー（データ投入） ============
  const seed = await page.evaluate((fid) => {
    const set = (k,v) => localStorage.setItem(k+'_'+fid, JSON.stringify(v))
    set('farm_fields_v2', [
      { id:1, name:'第1圃場', field_no:'1', crop:'レタス', area_are:20, color:'#0D9972', row_count:10, crop_category:'leaf_veg' },
      { id:2, name:'第2圃場', field_no:'2', crop:'とうもろこし', area_are:30, color:'#EA580C', row_count:12, crop_category:'corn' },
    ])
    set('farm_lots', {
      '1':[{ id:1001, row_range:'1-3', variety:'シスコ', seed_date:'2026-03-01', transplant_date:'2026-04-01', transplant_count:120, seedling_period_days:31, status:'growing' },
           { id:1002, row_range:'4-6', variety:'シスコ', seed_date:'2026-03-20', transplant_date:'2026-04-20', transplant_count:120, seedling_period_days:31, status:'harvested' }],
      '2':[{ id:2001, row_range:'1-4', variety:'ゴールドラッシュ', seed_date:'2026-04-20', transplant_date:'2026-05-10', status:'growing' }],
    })
    set('farm_records', [
      { id:9001, date:'2026-04-01', field_id:1, work_type:'定植', weather:'晴', worker:'田中', variety:'シスコ', rows_worked:3, note:'', photos:[] },
      { id:9002, date:'2026-05-01', field_id:1, work_type:'農薬散布', weather:'晴', pesticide_id:1, dilution:1000, amount:0.1, note:'' },
      { id:9003, date:'2026-05-15', field_id:1, work_type:'畝づくり', weather:'曇', note:'テスト', photos:[] },
    ])
    set('farm_lot_spray_records', [
      { id:5001, field_id:1, date:'2026-05-01', weather:'晴', row_range:'1-3', pesticides:[{ pesticide_id:1, dilution:1000, disposal_amount:0 }], spray_volume_L:100, note:'' },
    ])
    set('farm_harvest_records', [
      { id:7001, field_id:1, date:'2026-06-20', variety:'シスコ', row_range:'4-6', lot_code:'L-1', shipments:[{ dest:'朝採りJA', grade:'規格内', unit_type:'count_pcs', cases:50 }], total_cases:50, note:'' },
    ])
    set('farm_top_dressing_records', [
      { id:6001, field_id:1, date:'2026-05-15', fertilizing_type:'追肥', item:'レタス', row_range:'1-3', row_count:3, fertilizers:[{ fertilizer_id:1, dilution:null, amount_kg:20 }], spray_volume_L:null, note:'' },
    ])
    set('farm_pesticides', [{ id:1, name:'テスト殺虫剤', reg_no:'R-1', max_times:3, preharvest_days:7 }])
    set('farm_pesticide_stock', [{ pesticide_id:1, stock_L:5 }])
    set('farm_pesticide_purchases', [{ id:1, pesticide_id:1, amount_L:2, price_yen:4000 }])
    set('farm_fertilizers', [{ id:1, name:'化成肥料', unit_price_yen_per_kg:80 }])
    set('farm_fertilizer_stock', [{ fertilizer_id:1, stock_kg:100 }])
    return Object.keys(localStorage).filter(k=>k.includes(fid)).length
  }, farmId)
  results.seededKeys = seed

  await page.reload({ waitUntil:'networkidle2' })
  await sleep(1800)
  phase = 'B'
  results.diag = await page.evaluate((fid) => {
    const fields = JSON.parse(localStorage.getItem('farm_fields_v2_'+fid)||'[]')
    const lots = JSON.parse(localStorage.getItem('farm_lots_'+fid)||'{}')
    const out = {}
    Object.keys(lots).forEach(k => out[k] = (lots[k]||[]).map(l=>({id:l.id, status:l.status})))
    return { fieldIds: fields.map(f=>({id:f.id, t:typeof f.id, crop:f.crop})), lotKeys:Object.keys(lots), lotsByKey: out }
  }, farmId)
  for (const label of NAV) {
    current = label
    const ok = await clickByText(page, label)
    await sleep(700)
    const s = await mainSummary(page)
    results.phaseB.push({ label, clicked:ok, hasMain:s.hasMain, len:s.len, head:s.text })
  }
  results.fsDiag = await page.evaluate(() => window.__fsDiag || null)
  // 圃場詳細（クラッシュ多発地点）
  current='圃場詳細'; await clickByText(page,'一覧'); await sleep(600)
  await page.evaluate(() => { const el=[...document.querySelectorAll('*')].find(e=>e.textContent.includes('第1圃場')&&e.offsetParent); if(el) el.click() })
  await sleep(900)
  results.fieldDetail = await mainSummary(page)

  // ============ INTERACTION: 複数圃場＋写真の日報保存 ============
  const stages = []
  const snap = (tag) => page.evaluate(() => ({ t:(document.querySelector('.main')||document.body).innerText.replace(/\s+/g,' ').slice(0,80), imgs:document.querySelectorAll('main img').length })).then(s=>stages.push({tag, ...s}))
  try {
    await clickByText(page, '日報入力'); await sleep(800); await snap('open')
    // 圃場を2つ選択（トグル式ボタン。React再描画のため1つずつ間隔を空ける）
    const clickField = (name) => page.evaluate((name) => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(name)); if(b){b.click();return true} return false }, name)
    const p1 = await clickField('第1圃場'); await sleep(400)
    const p2 = await clickField('第2圃場'); await sleep(400)
    const picked = (p1?1:0)+(p2?1:0)
    const nextState = await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('次へ')); return b?{disabled:b.disabled}:null })
    stages.push({ tag:'pickState', p1, p2, nextState })
    await snap('picked')
    await clickByText(page, '次へ'); await sleep(600); await snap('step2')
    // 作業内容: 畝づくり（大ボタン）
    const wt = await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='畝づくり'); if(b){b.click();return true} return false })
    await sleep(400)
    // 写真アップロード
    const fileInput = await page.$('input[type=file]')
    let uploaded = false
    if (fileInput) { await fileInput.uploadFile(path.join(__dirname,'test.png')); uploaded = true; await sleep(1200) }
    await snap('afterPhoto')
    const photoCount = await page.evaluate(() => document.querySelectorAll('main img').length)
    await clickByText(page, '次へ'); await sleep(600); await snap('step3')   // step2→3
    await clickByText(page, '確認'); await sleep(600); await snap('step4')   // step3→4（ボタンは「確認 →」）
    const confirmText = await page.evaluate(() => (document.querySelector('.main')||document.body).innerText)
    const multiNote = /圃場に同じ内容で一括記録/.test(confirmText)
    const saveClicked = await clickByText(page, '保存する'); await sleep(450)
    const celebration = await page.evaluate(() => ({ overlay: !!document.querySelector('.sb-celeb-overlay'), title: (document.querySelector('.sb-celeb-title')||{}).textContent||'', confetti: document.querySelectorAll('.sb-confetti').length }))
    results.celebration = celebration
    await sleep(1300); await snap('afterSave')
    // 設定ページ: 開発モデル比較が消えているか
    await clickByText(page, '設定'); await sleep(700)
    results.settingsCheck = await page.evaluate(() => { const t=(document.querySelector('.main')||document.body).innerText; return { hasMain: !!document.querySelector('.main'), hasDevModel: /開発モデル/.test(t) } })
    const recCheck = await page.evaluate((fid) => {
      const recs = JSON.parse(localStorage.getItem('farm_records_'+fid) || '[]')
      const bed = recs.filter(r => r.work_type === '畝づくり')
      return { total: recs.length, bedRecords: bed.length, withPhoto: bed.filter(r=>r.photos&&r.photos.length).length, fields: bed.map(r=>r.field_id) }
    }, farmId)
    results.interaction = { pickedButtons:picked, workTypeClicked:wt, uploaded, photoThumbs:photoCount, multiNoteShown:multiNote, saveClicked, recordsAfter:recCheck, stages }
  } catch (e) {
    results.interaction = { error: String(e.message||e), stages }
  }

  results.errors = errors
  results.errorCount = errors.length
  console.log('QARESULT_START')
  console.log(JSON.stringify(results, null, 2))
  console.log('QARESULT_END')
  await browser.close()
  server.close()
}

run().catch(e => { console.error('RUNERR', e); process.exit(1) })
