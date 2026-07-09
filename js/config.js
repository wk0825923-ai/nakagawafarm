// =====================================================
// CAT-01: CONFIG — マジックナンバー・ハードコード値の集約
// テーマカラー・閾値・農園情報をここで一元管理
// =====================================================
const SUPABASE_URL      = 'https://jfalipljqvuzigmxzeoy.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmYWxpcGxqcXZ1emlnbXh6ZW95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MDc2ODcsImV4cCI6MjA5ODM4MzY4N30.Wqw8W3LBJetv0edidP8QJNuuQh0-sRjPgB9kXKmcvjA'
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// 「今日」のローカル日付(YYYY-MM-DD)。記録日は<input type="date">のローカル日付で
// 保存されるため、比較・初期値もローカルで作る。toISOStringはUTC基準で、JSTの
// 早朝(0:00-8:59)は前日になり、当日の記録が未来扱い/初期値が前日になる不具合があった。
function todayYmd(d) {
  const t = d || new Date()
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0')
}

// PDF/印刷用HTMLに差し込むユーザー入力(圃場名/作業者名/品種/備考など)のエスケープ。
// これらは el.innerHTML や window.open+document.write に渡すため、<img onerror=...> 等が
// そのまま実行される。テンプレートリテラルに埋める前に必ず通す。
function escHtml(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// 【出力の確認ダイアログ】confirmDownload — ファイル出力の前に「出力する / キャンセル」を挟む。
// いきなりダウンロードが始まるのを防ぐ。Promise<boolean> を返す（出力する=true / キャンセル=false）。
// showToast / celebrateSave と同じくDOM直生成なので config.js からも components.js からも呼べる。
function confirmDownload(opts) {
  opts = opts || {}
  return new Promise((resolve) => {
    const esc = (typeof escHtml === 'function') ? escHtml : (s) => String(s == null ? '' : s)
    // アニメーション用styleを一度だけ注入
    if (!document.getElementById('sb-cf-style')) {
      const st = document.createElement('style')
      st.id = 'sb-cf-style'
      st.textContent = '@keyframes sbCfFade{from{opacity:0}to{opacity:1}}@keyframes sbCfPop{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}'
      document.head.appendChild(st)
    }
    document.querySelectorAll('.sb-confirm-overlay').forEach(n => n.remove())

    const title    = opts.title || 'ファイルを出力します'
    const desc     = opts.desc || 'この内容でファイルをダウンロードします。よろしいですか？'
    const filename = opts.filename || ''
    const okLabel  = opts.okLabel || '出力する'

    const ov = document.createElement('div')
    ov.className = 'sb-confirm-overlay'
    ov.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:20px;animation:sbCfFade .18s ease'
    ov.innerHTML =
      '<div class="sb-confirm-card" style="background:#fff;border-radius:14px;max-width:400px;width:100%;padding:26px 24px 22px;box-shadow:0 20px 60px rgba(0,0,0,.28);animation:sbCfPop .22s cubic-bezier(.34,1.4,.64,1)">' +
        '<div style="font-size:16.5px;font-weight:700;color:#1F2937;margin-bottom:10px">' + esc(title) + '</div>' +
        '<div style="font-size:12.5px;color:#6B7280;line-height:1.7;margin-bottom:' + (filename ? '14px' : '22px') + '">' + esc(desc) + '</div>' +
        (filename ? '<div style="background:#F1F5F9;border:1px solid #E2E8F0;border-radius:8px;padding:9px 12px;font-size:12px;color:#334155;margin-bottom:22px;word-break:break-all"><span style="opacity:.55">ファイル名：</span>' + esc(filename) + '</div>' : '') +
        '<div style="display:flex;gap:10px">' +
          '<button class="sb-cf-cancel" style="flex:1;padding:11px;border-radius:9px;border:1px solid #D1D5DB;background:#fff;color:#374151;font-weight:600;font-size:14px;cursor:pointer">キャンセル</button>' +
          '<button class="sb-cf-ok" style="flex:1;padding:11px;border-radius:9px;border:none;background:#0A6B52;color:#fff;font-weight:700;font-size:14px;cursor:pointer">' + esc(okLabel) + '</button>' +
        '</div>' +
      '</div>'
    document.body.appendChild(ov)

    let done = false
    const close = (val) => {
      if (done) return
      done = true
      document.removeEventListener('keydown', onKey)
      ov.style.transition = 'opacity .15s ease'
      ov.style.opacity = '0'
      setTimeout(() => ov.remove(), 160)
      resolve(val)
    }
    const onKey = (e) => { if (e.key === 'Escape') close(false); else if (e.key === 'Enter') close(true) }
    document.addEventListener('keydown', onKey)
    ov.querySelector('.sb-cf-ok').addEventListener('click', () => close(true))
    ov.querySelector('.sb-cf-cancel').addEventListener('click', () => close(false))
    ov.addEventListener('click', (e) => { if (e.target === ov) close(false) })
    setTimeout(() => { const b = ov.querySelector('.sb-cf-ok'); if (b) b.focus() }, 60)
  })
}

// 重い出力ライブラリ(jsPDF/html2canvas/xlsx=計約1.5MB)は初期ロードから外し、PDF/Excel出力を
// 押した時に遅延ロードする。日々の記録入力（特に低速回線の現場スタッフ）の初期表示を軽くするため。
function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const found = [...document.scripts].find(s => s.dataset && s.dataset.lazySrc === src)
    if (found) {
      if (found.dataset.loaded === '1') return resolve()
      found.addEventListener('load', () => resolve()); found.addEventListener('error', () => reject(new Error('読み込み失敗')))
      return
    }
    const s = document.createElement('script')
    s.src = src; s.dataset.lazySrc = src
    s.onload = () => { s.dataset.loaded = '1'; resolve() }
    s.onerror = () => reject(new Error('スクリプトの読み込みに失敗しました（通信環境をご確認ください）'))
    document.head.appendChild(s)
  })
}
async function ensurePdfLibs() {
  if (typeof window.jspdf === 'undefined') await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
  if (typeof window.html2canvas === 'undefined') await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
}
async function ensureXlsx() {
  if (typeof window.XLSX === 'undefined') await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js')
}

const CONFIG = {
  FARM_NAME:     '農場名',
  JGAP_CERT_NO:  'JGAP-XXXX-XXXXX',
  COLOR: {
    primary:      '#0A6B52',   // フォレストグリーン
    primaryDark:  '#085A45',   // プライマリ暗色（ホバー・押下状態）
    sapphire:     '#1D4ED8',   // サファイアブルー
    amber:        '#B45309',   // バーントアンバー
    red:          '#C2410C',   // コーラルレッド
    amethyst:     '#6D28D9',   // アメジスト
  },
  CURRENT_YEAR: new Date().getFullYear(),
  // C-5仕様: ビザ期限アラートのしきい値（残日数）。30日以内=urgent(赤)、90日以内=warn(amber)
  VISA_ALERT_DAYS: { urgent: 30, warn: 90 },
}

// ①-2 ビザ・在留期限の残日数を計算（StaffList / VisaPage 共通利用）
// dateStr が未設定なら null を返す
function calcDaysLeft(dateStr) {
  if (!dateStr) return null
  const today  = new Date(); today.setHours(0,0,0,0)
  const target = new Date(dateStr); target.setHours(0,0,0,0)
  return Math.round((target - today) / (1000*60*60*24))
}

// =====================================================
// CAT-02: 共通ユーティリティ関数
// 重複していたビザ残日数計算・農薬使用回数チェックを一本化
// =====================================================
// ② 農薬使用回数チェック（PesticideInput / DailyRecord で重複していたロジック）
// lotSprayRecords（農薬散布タブのロット単位記録）も同じ圃場×農薬の使用回数として合算する。
// 日報とロット記録で同じ散布を二重登録した場合は多めにカウントされる（安全側に倒す）。
// ※ 使用回数の上限は本来「作付け1回あたり」「有効成分ごと」で決まるため、これは参考値。
function countPesticideUse(records, fieldId, pesticideId, lotSprayRecords = []) {
  const dailyCount = records.filter(
    r => r.field_id === Number(fieldId) && r.pesticide_id === pesticideId
  ).length
  const lotCount = lotSprayRecords.filter(
    r => r.field_id === Number(fieldId) && (r.pesticides || []).some(p => p.pesticide_id === pesticideId)
  ).length
  return dailyCount + lotCount
}
function isPesticideOverLimit(records, fieldId, pesticide, lotSprayRecords = []) {
  if (!pesticide) return false
  return countPesticideUse(records, fieldId, pesticide.id, lotSprayRecords) >= pesticide.max_times
}

// ②-2 収穫前日数アラート（ダッシュボード用）
// 各作付計画の収穫予定（end_month の1日と仮定）に対し、
// 直近の農薬散布が残留期間（preharvest_days）にかかる場合に警告を返す
function calcHarvestRisk(records, plans, pesticides, fields) {
  const today = new Date()
  const alerts = []
  plans.forEach(plan => {
    const harvestDate = new Date(CONFIG.CURRENT_YEAR, plan.end_month, 1) // 収穫予定月の1日
    const daysToHarvest = Math.ceil((harvestDate - today) / 86400000)
    if (daysToHarvest < 0 || daysToHarvest > 60) return // 収穫済み or 60日超先は対象外

    const sprayRecords = records
      .filter(r => r.field_id === plan.field_id && r.work_type === '農薬散布' && r.pesticide_id)
      .sort((a, b) => b.date.localeCompare(a.date))

    sprayRecords.forEach(sr => {
      const pest = pesticides.find(p => p.id === sr.pesticide_id)
      if (!pest) return
      const sprayDate = new Date(sr.date)
      const daysSinceSpray = Math.ceil((today - sprayDate) / 86400000)
      const daysRemaining  = pest.preharvest_days - daysSinceSpray // 残留期間が明けるまでの日数

      // 残留期間が明けていない、かつ収穫予定がその期間内に来る場合は危険
      if (daysRemaining > 0 && daysToHarvest <= daysRemaining) {
        // 【UX改善】残留期間が明ける（＝収穫可能になる）実際の日付を算出
        const harvestableDate = new Date(sprayDate)
        harvestableDate.setDate(harvestableDate.getDate() + pest.preharvest_days)
        alerts.push({
          id: plan.id + '-' + sr.id,
          fieldName: fields.find(f => f.id === plan.field_id)?.name ?? '不明',
          cropName: plan.crop,
          pesticideName: pest.name,
          daysToHarvest,
          daysRemaining,
          harvestableDate,
          harvestableDateLabel: harvestableDate.toLocaleDateString('ja-JP', { month:'long', day:'numeric' }),
        })
      }
    })
  })
  return alerts
}

// ②-3【フェーズE・E-4 Step3 → Step6で精度向上】ロット単位の防除アラート（圃場ダッシュボード用）
// E-0の方針どおり、calcHarvestRisk と同じ「preharvest_days違反チェック」ロジックを
// ロットの収穫予定日（harvest_start）基準で流用する。
// 【Step6】lotSprayRecords（畝マップで選んだ正しいrow_range入り）が存在する場合は、
//   ロットのrow_rangeと突き合わせて「このロットに実際に散布された記録」だけで判定する（精密判定）。
//   該当するlotSprayRecordsが無いロット（畝マップ未導入の圃場や、まだ日報側でしか
//   記録していない場合）は、従来通り「圃場全体の日報」を参考にする簡易判定にフォールバックする。
//   → 既存ロジックを壊さず、精度だけを段階的に上げる安全な実装。
function calcLotHarvestRisk(fieldRecords, lots, pesticides, lotSprayRecords) {
  const today = new Date()
  const alerts = []
  const hasLotSprayData = Array.isArray(lotSprayRecords) && lotSprayRecords.length > 0

  ;(lots || []).forEach(lot => {
    if (lot.status === 'harvested' || lot.status === 'fallow') return
    if (!lot.harvest_start) return
    const harvestDate   = new Date(lot.harvest_start)
    const daysToHarvest = Math.ceil((harvestDate - today) / 86400000)
    if (daysToHarvest < 0 || daysToHarvest > 60) return // 収穫済み or 60日超先は対象外

    // 【Step6】このロットの畝番号と1本でも重なるlotSprayRecordsを抽出（畝単位の正確な紐付け）
    const lotRowSet = parseRowRange(lot.row_range)
    const matchedLotSprays = hasLotSprayData
      ? lotSprayRecords.filter(rec => {
          const recRowSet = parseRowRange(rec.row_range)
          for (const n of recRowSet) { if (lotRowSet.has(n)) return true }
          return false
        })
      : []

    if (matchedLotSprays.length > 0) {
      // ── 精密判定: ロットの畝と重なるlotSprayRecordsだけを参照 ──
      const sorted = [...matchedLotSprays].sort((a, b) => b.date.localeCompare(a.date))
      sorted.forEach(rec => {
        ;(rec.pesticides || []).forEach(item => {
          const pest = pesticides.find(p => p.id === item.pesticide_id)
          if (!pest) return
          const sprayDate      = new Date(rec.date)
          const daysSinceSpray = Math.ceil((today - sprayDate) / 86400000)
          const daysRemaining  = pest.preharvest_days - daysSinceSpray // 残留期間が明けるまでの日数

          if (daysRemaining > 0 && daysToHarvest <= daysRemaining) {
            // 【UX改善】残留期間が明ける（＝収穫可能になる）実際の日付を算出
            const harvestableDate = new Date(sprayDate)
            harvestableDate.setDate(harvestableDate.getDate() + pest.preharvest_days)
            alerts.push({
              id: lot.id + '-ls-' + rec.id + '-' + item.pesticide_id,
              rowRange: lot.row_range,
              variety: lot.variety,
              pesticideName: pest.name,
              daysToHarvest,
              daysRemaining,
              harvestableDate,
              harvestableDateLabel: harvestableDate.toLocaleDateString('ja-JP', { month:'long', day:'numeric' }),
              precise: true, // 畝単位で正確に紐付けられた判定
            })
          }
        })
      })
    } else {
      // ── フォールバック: 畝単位の散布記録が無いロットは、圃場全体の日報を参考にする簡易判定 ──
      const sprayRecords = fieldRecords
        .filter(r => r.work_type === '農薬散布' && r.pesticide_id)
        .sort((a, b) => b.date.localeCompare(a.date))

      sprayRecords.forEach(sr => {
        const pest = pesticides.find(p => p.id === sr.pesticide_id)
        if (!pest) return
        const sprayDate      = new Date(sr.date)
        const daysSinceSpray = Math.ceil((today - sprayDate) / 86400000)
        const daysRemaining  = pest.preharvest_days - daysSinceSpray // 残留期間が明けるまでの日数

        if (daysRemaining > 0 && daysToHarvest <= daysRemaining) {
          // 【UX改善】残留期間が明ける（＝収穫可能になる）実際の日付を算出
          const harvestableDate = new Date(sprayDate)
          harvestableDate.setDate(harvestableDate.getDate() + pest.preharvest_days)
          alerts.push({
            id: lot.id + '-' + sr.id,
            rowRange: lot.row_range,
            variety: lot.variety,
            pesticideName: pest.name,
            daysToHarvest,
            daysRemaining,
            harvestableDate,
            harvestableDateLabel: harvestableDate.toLocaleDateString('ja-JP', { month:'long', day:'numeric' }),
            precise: false, // 圃場全体の日報を参考にした簡易判定
          })
        }
      })
    }
  })
  return alerts
}

// ③ 月次作業サマリー集計（UX-11: ダッシュボードの実績振り返り用）
// records を直近6ヶ月 × 作業種別でグループ化し、グラフ・サマリーカード用に整形する
function aggregateMonthlyWork(records, months = 6) {
  const now = new Date()
  const buckets = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    buckets.push({
      key:   d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
      label: (d.getMonth() + 1) + '月',
      counts: {},
      total: 0,
    })
  }
  const byKey = Object.fromEntries(buckets.map(b => [b.key, b]))
  records.forEach(r => {
    const key = (r.date || '').slice(0, 7)
    const bucket = byKey[key]
    if (!bucket) return
    bucket.counts[r.work_type] = (bucket.counts[r.work_type] || 0) + 1
    bucket.total += 1
  })
  return buckets
}

// =====================================================
// C02-4: 期間重複チェック共通ユーティリティ
// Equipment(hasConflict) と CropPlan(hasOverlap) の両方で使用
// =====================================================
function hasDateConflict(rentals, equipment, date) {
  return rentals.some(r => r.equipment === equipment && r.date === date)
}
function hasCropOverlap(plans, fieldId, startMonth, endMonth) {
  return plans.some(p =>
    p.field_id === Number(fieldId) &&
    !(endMonth < p.start_month || startMonth > p.end_month)
  )
}

// =====================================================
// C02-3: 農薬散布テーブルHTML生成（共通ユーティリティ）
// exportSprayPDF と GapSupport インラインプレビューで共用
// =====================================================
// 【実装手順書 3.1.1】PDF出力（buildSprayTableHTML）に廃棄量を含める。
// 既存の日次作業記録（単一 pesticide_id）はそのまま1行として出力し、
// ロット単位記録（pesticides 配列を持つ INITIAL_LOT_SPRAY_RECORDS 形式）は
// 薬剤ごとに1行へ展開して出力する。いずれの場合も「廃棄量」列を表示する。
function buildSprayTableHTML(sprayRecords, fields, pesticides) {
  const today = new Date().toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric' })
  const year  = new Date().getFullYear()

  // ロット単位記録（pesticides配列を持つ）は薬剤ごとに1行へ展開。
  // 日次作業記録（単一 pesticide_id）はそのまま1件1行として扱う。
  const flatRows = []
  sprayRecords.forEach(r => {
    if (Array.isArray(r.pesticides)) {
      r.pesticides.forEach(p => {
        flatRows.push({
          date: r.date,
          field_id: r.field_id,
          pesticide_id: p.pesticide_id,
          dilution: p.dilution,
          amount: r.spray_volume_L,
          disposal_amount: p.disposal_amount,
          weather: r.weather,
          worker: r.worker,
        })
      })
    } else {
      flatRows.push(r)
    }
  })

  const rows  = flatRows.length === 0
    ? '<tr><td colspan="12" style="text-align:center;color:#888;padding:20px;font-size:11px">農薬散布記録がありません</td></tr>'
    : flatRows.map((r, i) => {
        const field = fields.find(f => f.id === r.field_id)
        const pest  = pesticides.find(p => p.id === r.pesticide_id)
        const disposal = Number(r.disposal_amount) || 0
        return `<tr>
          <td>${i + 1}</td>
          <td>${escHtml(r.date)}</td>
          <td>${field ? escHtml(field.name) : '—'}</td>
          <td>${field ? escHtml(field.crop) : '—'}</td>
          <td style="text-align:left">${pest  ? escHtml(pest.name)  : '—'}</td>
          <td>${pest  ? escHtml(pest.reg_no) : '—'}</td>
          <td>${r.dilution ? escHtml(r.dilution) + '倍' : '—'}</td>
          <td>${r.amount || '—'}</td>
          <td>${disposal > 0 ? disposal + 'L' : '—'}</td>
          <td>${r.weather ? escHtml(r.weather) : '—'}</td>
          <td>${r.worker ? escHtml(r.worker) : '—'}</td>
          <td>${pest ? escHtml(pest.preharvest_days) + '日' : '—'}</td>
        </tr>`
      }).join('')
  const emptyRows = [1,2,3].map(() =>
    `<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`
  ).join('')

  return `
    <!-- ── 様式ヘッダー ── -->
    <div class="pdf-doc-header">
      <div class="pdf-doc-header-top">
        <div>
          <div class="pdf-doc-title">農薬散布記録簿</div>
          <div class="pdf-doc-subtitle">PESTICIDE APPLICATION RECORD &nbsp;｜&nbsp; JGAP / GlobalGAP 農薬管理基準様式 &nbsp;｜&nbsp; <span style="color:#FCD34D;font-weight:700">※ 仮様式</span></div>
        </div>
        <div class="pdf-doc-cert-badge">
          <div style="font-size:10px;font-weight:700;letter-spacing:.05em">様式番号：GAP-P-001</div>
          <div style="opacity:.8">改訂：Rev.3 &nbsp;｜&nbsp; ${year}年度版</div>
        </div>
      </div>
      <div class="pdf-doc-header-body">
        <div class="pdf-doc-field">
          <div class="pdf-doc-field-label">農業者名称 / Organization</div>
          <div class="pdf-doc-field-value">${escHtml(CONFIG.FARM_NAME)}</div>
        </div>
        <div class="pdf-doc-field">
          <div class="pdf-doc-field-label">JGAP認証番号 / Certificate No.</div>
          <div class="pdf-doc-field-value" style="letter-spacing:.05em">${escHtml(CONFIG.JGAP_CERT_NO)}</div>
        </div>
        <div class="pdf-doc-field">
          <div class="pdf-doc-field-label">出力日 / Issued Date &nbsp;｜&nbsp; 対象件数</div>
          <div class="pdf-doc-field-value">${today} &nbsp;（${sprayRecords.length}件）</div>
        </div>
      </div>
    </div>

    <!-- ── 公印スペース ── -->
    <div class="pdf-seal-row">
      <div class="pdf-seal-label">代表者印</div>
      <div class="pdf-seal-box">公<br>印</div>
      <div class="pdf-seal-label">管理責任者印</div>
      <div class="pdf-seal-box">公<br>印</div>
    </div>

    <!-- ── 記録テーブル ── -->
    <table>
      <thead>
        <tr>
          <th style="width:26px">No.</th>
          <th style="width:64px">作業日</th>
          <th style="width:54px">圃場名</th>
          <th style="width:50px">作物名</th>
          <th style="width:80px">農薬名（商品名）</th>
          <th style="width:62px">農薬登録番号</th>
          <th style="width:48px">希釈倍率</th>
          <th style="width:46px">散布量<br>(L/10a)</th>
          <th style="width:42px">廃棄量<br>(L)</th>
          <th style="width:32px">天気</th>
          <th style="width:56px">作業者</th>
          <th style="width:46px">収穫前<br>日数制限</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <!-- 空白行（手書き追記用） -->
        ${emptyRows}
      </tbody>
    </table>

    <!-- ── フッター ── -->
    <div class="pdf-footer-row">
      <div class="pdf-footer-note">
        ※ 本記録はJGAP基準 / GlobalGAP AF 4.1「農薬使用記録の保管（5年間）」に基づき作成<br>
        ※ 使用農薬はすべて農薬取締法に基づく登録農薬であることを確認済み
      </div>
      <div class="pdf-footer-page">農場名 &nbsp;｜&nbsp; 1 / 1</div>
    </div>
  `
}

// =====================================================
// 【フェーズ2】散布記録サマリーカード — 単票PDF出力
// 入力完了直後の1件分の散布記録を buildSprayTableHTML で様式化してPDF出力
// =====================================================
async function exportSingleSprayRecordPDF(record, fields, pesticides, skipConfirm) {
  if (!skipConfirm && !(await confirmDownload({ icon:'📄', title:'農薬散布記録をPDF出力', desc:'この記録1件をPDFで出力します。', filename:'農薬散布記録_' + record.date + '.pdf' }))) return
  const el = document.getElementById('pdf-preview')
  try {
    await ensurePdfLibs()
    el.innerHTML = buildSprayTableHTML([record], fields, pesticides)
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false })
    const { jsPDF } = window.jspdf
    const pdf   = new jsPDF('p', 'mm', 'a4')
    const imgW  = 190
    const imgH  = canvas.height * imgW / canvas.width
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, 10, imgW, imgH)
    pdf.save('農薬散布記録_' + record.date + '.pdf')
  } catch (err) {
    console.error('PDF出力エラー:', err)
    showToast('PDF出力に失敗しました: ' + err.message, 'error')
  } finally {
    el.innerHTML = ''
  }
}

function printSingleSprayRecord(record, fields, pesticides) {
  const tableHTML = buildSprayTableHTML([record], fields, pesticides)
  const win = window.open('', '_blank')
  win.document.write(`
    <html>
      <head>
        <meta charset="utf-8">
        <title>農薬散布記録_${record.date}</title>
        <style>
          body{font-family:'Noto Sans JP','Hiragino Sans','Yu Gothic','Meiryo',sans-serif;font-size:11px;padding:28px 32px;color:#000}
          .pdf-doc-header{margin-bottom:12px}
          .pdf-doc-header-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px}
          .pdf-doc-title{font-size:18px;font-weight:700}
          .pdf-doc-subtitle{font-size:10px;color:#555;margin-top:2px}
          .pdf-doc-cert-badge{background:#0D9972;color:#fff;padding:6px 12px;border-radius:6px;font-size:10px;text-align:right}
          .pdf-doc-header-body{display:flex;border:1px solid #ccc;border-radius:6px;overflow:hidden}
          .pdf-doc-field{flex:1;padding:8px 12px;border-right:1px solid #ccc}
          .pdf-doc-field:last-child{border-right:none}
          .pdf-doc-field-label{font-size:9px;color:#777;margin-bottom:2px}
          .pdf-doc-field-value{font-weight:600;color:#111}
          .pdf-seal-row{display:flex;align-items:center;gap:10px;margin:10px 0}
          .pdf-seal-box{width:46px;height:46px;border:1px solid #999;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#999}
          .pdf-seal-label{font-size:10px;color:#555}
          table{width:100%;border-collapse:collapse;font-size:9.5px;margin-top:8px}
          thead tr:first-child th{background:#0D9972;color:#fff;padding:6px 4px}
          td{padding:5px 7px;border:1px solid #ccc;vertical-align:middle;text-align:center}
          tr:nth-child(even) td{background:#f4faf8}
          .pdf-footer-row{display:flex;justify-content:space-between;margin-top:8px}
          .pdf-footer-note{font-size:8.5px;color:#777;line-height:1.6}
          .pdf-footer-page{font-size:8.5px;color:#aaa}
        </style>
      </head>
      <body>${tableHTML}</body>
    </html>
  `)
  win.document.close()
  win.onload = () => { win.focus(); win.print() }
}

// =====================================================
// C-2: 農薬散布記録簿 PDF出力
// records → GAP様式HTMLテーブル → html2canvas → jsPDF
// 日本語対応: html2canvasがbodyフォントをそのままキャプチャするため
//             pdf-previewのfont-familyに日本語フォントを指定して対処
// =====================================================
async function exportSprayPDF(records, fields, pesticides, skipConfirm) {
  const sprayCnt = records.filter(r => r.work_type === '農薬散布').length
  if (!skipConfirm && !(await confirmDownload({ icon:'📄', title:'農薬散布記録簿をPDF出力', desc:'農薬散布の記録 ' + sprayCnt + '件 をGAP様式のPDFで出力します。', filename:'農薬散布記録簿_農場名.pdf' }))) return
  // CAT-07-1: try-catch でキャプチャ・PDF生成エラーを捕捉
  const el = document.getElementById('pdf-preview')
  try {
    await ensurePdfLibs()
    const sprayRecords = records.filter(r => r.work_type === '農薬散布')

    // GAP様式テーブルHTML を生成（C02-3: buildSprayTableHTML 共通関数を使用）
    el.innerHTML = buildSprayTableHTML(sprayRecords, fields, pesticides)

    // html2canvas でキャプチャ → jsPDF で出力
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false })
    const { jsPDF } = window.jspdf
    const pdf   = new jsPDF('p', 'mm', 'a4')
    const imgW  = 190
    const imgH  = canvas.height * imgW / canvas.width
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, 10, imgW, imgH)
    pdf.save('農薬散布記録簿_農場名.pdf')
  } catch (err) {
    console.error('PDF出力エラー:', err)
    showToast('PDF出力に失敗しました: ' + err.message, 'error')
  } finally {
    // 成功・失敗いずれの場合もプレビューをリセット
    el.innerHTML = ''
  }
}

// =====================================================
// C-3: 施肥記録 Excel出力（SheetJS）
// fertilizer_records モックデータを xlsx として出力
// =====================================================
async function exportFertilizerExcel(records, fields, skipConfirm) {
  const fertRecords = records.filter(r => r.work_type === '施肥')

  // CAT-07-2: 0件の場合は空ファイルを渡すのではなく早期returnでユーザーに通知
  if (fertRecords.length === 0) {
    showToast('施肥記録がまだありません。日次作業入力から施肥作業を記録してください。', 'warn')
    return
  }
  if (!skipConfirm && !(await confirmDownload({ icon:'📊', title:'施肥記録をExcel出力', desc:'施肥の記録 ' + fertRecords.length + '件 をExcel(.xlsx)で出力します。', filename:'施肥記録簿_農場名.xlsx' }))) return

  const data = fertRecords.map(r => {
    const field = fields.find(f => f.id === r.field_id)
    return {
      '日付':       r.date,
      '圃場名':     field ? field.name : '—',
      '作物名':     field ? field.crop : '—',
      '肥料名':     r.fertilizer_name || '（記録なし）',
      '施肥量(kg)': r.amount || 0,
      '作業者':     r.worker || '—',
      '天気':       r.weather || '—',
      '備考':       r.note || '',
    }
  })

  try {
    await ensureXlsx()
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [{ wch:12 },{ wch:15 },{ wch:15 },{ wch:20 },{ wch:12 },{ wch:15 },{ wch:8 },{ wch:20 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '施肥記録')
    XLSX.writeFile(wb, '施肥記録簿_農場名.xlsx')
  } catch (e) {
    showToast('Excel出力に失敗しました: ' + e.message, 'error')
  }
}

// =====================================================
// eMAFF連携用 CSV出力
// 農薬散布 / 施肥 / 収穫 の記録に、圃場のeMAFF農地番号・所在地を紐づけ、
// eMAFF（農林水産省 共通申請サービス）へ取り込みやすい中間フォーマットで出力する。
//
// ※注意: eMAFFの正式インポートテンプレートは申請メニュー（作目・様式）ごとに
//   列並び・セル位置が異なり、単一の固定公開フォーマットが存在しない。
//   本CSVは「農地番号つきの実績台帳」として、各農家が自分のeMAFF様式へ
//   転記・貼り付けする土台。そのままアップロードで完了、とは謳わない。
// =====================================================
async function exportEmaffCSV(records, fields, pesticides, skipConfirm) {
  const _kinds = ['農薬散布', '施肥', '収穫']
  const _cnt = (records || []).filter(r => _kinds.includes(r.work_type)).length
  if (_cnt === 0) { showToast('eMAFFに連携できる記録（農薬散布・施肥・収穫）がまだありません。', 'warn'); return }
  if (!skipConfirm && !(await confirmDownload({ icon:'🗺', title:'eMAFF連携用CSVを出力', desc:'農薬散布・施肥・収穫の記録 ' + _cnt + '件 に農地番号を紐づけたCSVを出力します。', filename:'eMAFF連携_実績台帳_' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '.csv' }))) return
  // CSVインジェクション対策（=,+,-,@ で始まるセルを ' で無害化）＋ クォート
  const csvCell = (v) => {
    let s = (v == null) ? '' : String(v)
    if (/^[=+\-@]/.test(s)) s = "'" + s
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"'
    return s
  }

  const KINDS = ['農薬散布', '施肥', '収穫']
  const rows = (records || []).filter(r => KINDS.includes(r.work_type))

  if (rows.length === 0) {
    showToast('eMAFFに連携できる記録（農薬散布・施肥・収穫）がまだありません。', 'warn')
    return
  }

  const header = [
    'eMAFF農地番号', '所在地', '圃場名', '作物',
    '作業日', '作業区分', '使用資材', '登録番号', '希釈倍数', '数量', '単位',
    '作業者', '天気', '備考',
  ]

  const findField = (id) => (fields || []).find(f => f.id === id) || {}
  const findPest  = (id) => (pesticides || []).find(p => p.id === id) || null

  const lines = [header.map(csvCell).join(',')]

  rows.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
       .forEach(r => {
    const f = findField(r.field_id)
    let material = '', regNo = '', dilution = '', qty = '', unit = ''

    if (r.work_type === '農薬散布') {
      const p  = findPest(r.pesticide_id)
      material = p ? p.name : (r.pesticide_name || '')
      regNo    = p ? (p.reg_no || '') : ''
      dilution = r.dilution || ''
      qty      = (r.amount != null ? r.amount : '')
      unit     = r.amount != null ? 'L' : ''
    } else if (r.work_type === '施肥') {
      material = r.fertilizer_name || ''
      qty      = (r.amount != null ? r.amount : '')
      unit     = r.amount != null ? 'kg' : ''
    } else if (r.work_type === '収穫') {
      qty  = (r.total_cases != null ? r.total_cases : (r.amount != null ? r.amount : ''))
      unit = r.total_cases != null ? 'ケース' : (r.amount != null ? 'kg' : '')
    }

    lines.push([
      f.emaff_no || '', f.address || '', f.name || '', f.crop || '',
      r.date || '', r.work_type, material, regNo, dilution, qty, unit,
      r.worker || '', r.weather || '', r.note || '',
    ].map(csvCell).join(','))
  })

  // Excel（日本語Windows）での文字化け防止に BOM 付き UTF-8
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  a.href = url
  a.download = 'eMAFF連携_実績台帳_' + stamp + '.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  const missing = new Set(rows.map(r => findField(r.field_id)).filter(f => !f.emaff_no).map(f => f.name || '?'))
  if (missing.size > 0) {
    showToast('CSVを出力しました。ただし ' + [...missing].slice(0,3).join('・') + (missing.size>3?' 他':'') + ' はeMAFF農地番号が未登録です（圃場詳細で登録できます）。', 'warn')
  } else {
    showToast('eMAFF連携用CSVを出力しました（' + rows.length + '件）。', 'success')
  }
}

