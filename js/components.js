const FIELD_SUB_ITEMS = [
  { id:'dashboard',        label:'圃場ダッシュボード', icon:'home'        },
  { id:'daily',            label:'日報入力',           icon:'notebook'    },
  { id:'pesticide',        label:'農薬散布',           icon:'spray'       },
  { id:'harvest',          label:'収穫・出荷',         icon:'basket'      },
  { id:'field_eval',       label:'実績評価',           icon:'chart-bar'   },
]

const NAV_SECTIONS_TOP = [
  { id:'dashboard', label:'総合ダッシュボード', icon:'home' },
]
// 使用頻度順（毎日→季節ごと→稀）に整理。よく押す記録・確認を上に固める。
const NAV_SECTIONS_DATA = [
  // 【日報入力】全圃場から選んで入力（複数圃場の一括記録に対応）。圃場詳細内の日報入力とは別の全体入口。
  { id:'daily_entry',      label:'日報入力',            icon:'notebook'       },  // 毎日
  { id:'record_list',      label:'日報管理',            icon:'list-details'   },  // 毎日（日報入力の隣）
  { id:'field_summary',    label:'圃場まとめ',          icon:'table'          },  // 週次: ロット別生産履歴
  { id:'harvest_forecast', label:'収穫予測',            icon:'temperature'    },  // 週次: 積算温度
  { id:'shipment_log',     label:'出荷記録',            icon:'truck-delivery' },  // 収穫→ストック→出荷・ストック残
  { id:'crop_plan',        label:'作付計画 / 経営予測', icon:'calendar-event' },  // 季節ごと
  { id:'export',           label:'GAP帳票出力',         icon:'file-export'    },  // 監査時
  { id:'gap',              label:'GAPチェックリスト',   icon:'checklist'      },  // 監査時
  { id:'gap_documents',    label:'必要書類・文書台帳',  icon:'folders'        },  // GAP原則ごとの必要文書の整備状況
  { id:'integrity_check',  label:'整合性チェック',      icon:'checkup-list'   },  // 突合せ: 入力ミス/食い違いを点検
]
// マスタ・設定系をまとめる（見出しは「管理・設定」・既定で折りたたみ）。初期設定中心で頻度は低い。
// 農薬/肥料/作物カテゴリは「マスタ管理」1つに、機器予約と機械整備記録は「機器管理」1つにタブ統合。
const NAV_SECTIONS_SYS = [
  { id:'master_hub',       label:'マスタ管理',          icon:'database'    },  // 農薬/肥料/作物カテゴリ
  { id:'staff',            label:'スタッフ管理',         icon:'users'       },
  { id:'trainee_diary',    label:'技能実習生 作業日誌', icon:'notebook'    },
  { id:'manual',           label:'多言語マニュアル',    icon:'book-2'      },
  { id:'equipment',        label:'機器予約',            icon:'truck'       },
  { id:'maintenance_log',  label:'機械整備記録',        icon:'tool'        },  // GAP機械管理・直アクセス
  { id:'simulator',        label:'収益シミュレーター',  icon:'currency-yen'},
  { id:'settings',         label:'設定',                icon:'settings'    },
]

// 圃場追加モーダル
function AddFieldModal({ onClose, onAdd, initialLatLng, cropCategories: cats }) {
  const categories = (cats && cats.length > 0) ? cats : _CROP_CATEGORIES
  const defaultCat = categories[0] || INITIAL_CROP_CATEGORIES[0]
  const [name,     setName]     = React.useState('')
  const [areaName, setAreaName] = React.useState('')   // エリア(例: 上望陀)=GGAP登録圃場リストの区分
  const [catKey,   setCatKey]   = React.useState(defaultCat.key)
  const [cropName, setCropName] = React.useState('')
  const [area,     setArea]     = React.useState('')
  const [address,  setAddress]  = React.useState('')   // 所在地(GAP登録圃場リストで必要)
  const [emaffNo,  setEmaffNo]  = React.useState('')   // eMAFF農地番号(農地一連番号/筆番号)=eMAFF連携キー
  const [gapTarget, setGapTarget] = React.useState(true) // GGAP認証対象(★)か対象外(NG)か
  // 【明示的オンボーディング】圃場追加を2ステップに。Step1=基本情報、Step2=GAP・所在地(任意・スキップ可)。
  const [step,     setStep]     = React.useState(1)
  const COLORS = ['#0D9972','#2563EB','#EA580C','#7C3AED','#B45309','#DC2626']
  const selectedCat = categories.find(c => c.key === catKey) || defaultCat
  const [color, setColor] = React.useState(selectedCat.color || COLORS[0])
  const disabled = !name.trim() || !area

  // カテゴリ変更時はカラーも自動更新
  const handleCatChange = (key) => {
    setCatKey(key)
    const cat = categories.find(c => c.key === key)
    if (cat) setColor(cat.color)
  }

  const submit = () => {
    if (disabled) return
    // 面積は有限の非負数のみ許可（'abc'→NaN / '1e999'→Infinity / 負数 を弾いて集計汚染を防ぐ・番人監査 BUG#8）
    const areaNum = Number(area)
    if (!Number.isFinite(areaNum) || areaNum < 0) {
      try { if (typeof showToast === 'function') showToast('面積には0以上の数値を入力してください。', 'warn') } catch (e) {}
      return
    }
    onAdd({
      // マスタUUID化第3弾(2026-07-12): 数値ID比較(Number)は全域でmasterById/String比較へ統一済みのため
      // UUID発行に切替（複数端末でも衝突しない・DBのuuid列にそのまま入る）。旧数値IDの圃場はlegacy_idで橋渡し。
      id:           newUuid(),
      name:         name.trim(),
      area_name:    areaName.trim(),
      crop:         cropName.trim() || selectedCat.name,
      crop_category: catKey,
      area_are:     areaNum,
      address:      address.trim(),
      emaff_no:     emaffNo.trim(),
      gap_target:   gapTarget,
      lat:          initialLatLng ? initialLatLng.lat : 35.385,
      lng:          initialLatLng ? initialLatLng.lng : 139.926,
      status:       '栽培中',
      color,
    })
    onClose()
  }

  // 共通ラベル/フィールド（コンパクト化）
  const lbl = (t) => React.createElement('label', { style:{ fontSize:'10.5px', fontWeight:700, color:'#374151', display:'block', marginBottom:'4px', letterSpacing:'.04em' } }, t)
  const field = (label, el) => React.createElement('div', null, lbl(label), el)

  // Step1(基本情報)が有効か。面積の妥当性チェックつきで次へ進む。
  const goNext = () => {
    if (disabled) return
    const areaNum = Number(area)
    if (!Number.isFinite(areaNum) || areaNum < 0) { try { if (typeof showToast === 'function') showToast('面積には0以上の数値を入力してください。', 'warn') } catch (e) {} ; return }
    setStep(2)
  }
  const btnGhost   = { flex:1, padding:'10px', borderRadius:'8px', border:'1.5px solid #D8E4D8', background:'#fff', color:'#374151', fontSize:'13px', fontWeight:600, cursor:'pointer' }
  const btnPrimary = (dis) => ({ flex:1, padding:'10px', borderRadius:'8px', border:'none', background: dis ? '#D1D5DB' : '#0A6B52', color:'#fff', fontSize:'13px', fontWeight:700, cursor: dis ? 'not-allowed' : 'pointer' })
  const stepDot = (n) => React.createElement('div', { style:{ width:'22px', height:'22px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:700, background: step===n ? '#0A6B52' : (step>n ? '#A7F3D0' : '#E2E8F0'), color: step===n ? '#fff' : (step>n ? '#065F46' : '#94A3B8') } }, step>n ? '✓' : n)

  return React.createElement('div', {
    style:{ position:'fixed', inset:0, background:'rgba(0,0,0,.38)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999, padding:'20px' },
    onClick: e => { if (e.target === e.currentTarget) onClose() }
  },
    React.createElement('div', {
      style:{ background:'#fff', borderRadius:'14px', width:'400px', maxWidth:'100%', maxHeight:'88vh', display:'flex', flexDirection:'column', boxShadow:'0 8px 32px rgba(0,0,0,.22)', overflow:'hidden' }
    },
      // ── ヘッダー（固定・ステップ表示）──
      React.createElement('div', { style:{ flexShrink:0, padding:'16px 22px 12px', borderBottom:'1px solid #F1F5F9' } },
        React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'10px' } },
          React.createElement('div', { style:{ fontSize:'15px', fontWeight:700, color:'#111827', flex:1 } }, '➕ 圃場を追加'),
          stepDot(1),
          React.createElement('div', { style:{ width:'14px', height:'2px', background: step>1 ? '#A7F3D0' : '#E2E8F0' } }),
          stepDot(2)
        ),
        React.createElement('div', { style:{ fontSize:'11.5px', color:'#6B7280', marginTop:'6px' } }, step===1 ? 'STEP 1 / 2　基本情報' : 'STEP 2 / 2　GAP・所在地情報（任意・スキップOK）'),
        (step===1 && initialLatLng) && React.createElement('div', { style:{ fontSize:'11px', color:'#0A6B52', background:'#ECFDF5', border:'1px solid #A7F3D0', borderRadius:'6px', padding:'5px 8px', marginTop:'8px' } },
          '📍 選択した地点に登録（' + initialLatLng.lat.toFixed(5) + ', ' + initialLatLng.lng.toFixed(5) + '）'
        )
      ),

      // ── 本文（スクロール・ステップ切替）──
      React.createElement('div', { style:{ flex:1, overflowY:'auto', padding:'16px 22px', display:'flex', flexDirection:'column', gap:'12px' } },
        step === 1
          ? React.createElement(React.Fragment, null,
              field('圃場名（圃場記号）', React.createElement('input', {
                className:'form-input', placeholder:'例: N-2 / 第21圃場', value:name,
                onChange:e=>setName(e.target.value), onKeyDown:e=>e.key==='Enter'&&goNext(), autoFocus:true,
              })),
              React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' } },
                field('エリア（任意）', React.createElement('input', { className:'form-input', placeholder:'例: 上望陀', value:areaName, onChange:e=>setAreaName(e.target.value) })),
                field('面積 (a)', React.createElement('input', { className:'form-input', type:'number', min:'1', placeholder:'例: 20', value:area, onChange:e=>setArea(e.target.value) }))
              ),
              React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' } },
                field('作物カテゴリ', React.createElement('select', { className:'form-select', value:catKey, onChange:e=>handleCatChange(e.target.value) }, categories.map(c => React.createElement('option', { key:c.key, value:c.key }, c.name)))),
                field('品種名（任意）', React.createElement('input', { className:'form-input', placeholder:'グリーンウェーブ 等', value:cropName, onChange:e=>setCropName(e.target.value) }))
              ),
              field('マップ色', React.createElement('div', { style:{ display:'flex', gap:'8px' } },
                COLORS.map(c => React.createElement('button', { key:c, onClick:()=>setColor(c),
                  style:{ width:'26px', height:'26px', borderRadius:'50%', background:c, border: color === c ? '3px solid #111827' : '2px solid transparent', cursor:'pointer', flexShrink:0 } }))
              ))
            )
          : React.createElement(React.Fragment, null,
              React.createElement('div', { style:{ fontSize:'11.5px', color:'#0A6B52', background:'#F0FAF5', border:'1px solid #D1FAE5', borderRadius:'8px', padding:'8px 12px', lineHeight:1.6 } },
                'GAP審査で使う情報です。今は空でもOK（あとで圃場詳細からいつでも登録できます）。'),
              field('所在地（住所）', React.createElement(React.Fragment, null,
                React.createElement('input', { className:'form-input', placeholder:'例: 千葉県木更津市○○ 123-4', value:address, onChange:e=>setAddress(e.target.value) }),
                React.createElement('div', { style:{ fontSize:'10px', color:'#94A3B8', marginTop:'4px', lineHeight:1.5 } },
                  '地番は ',
                  React.createElement('a', { href:'https://map.maff.go.jp/', target:'_blank', rel:'noopener', style:{ color:'#0A6B52', fontWeight:600 } }, 'eMAFF農地ナビ'),
                  ' で確認できます。'
                )
              )),
              field('eMAFF農地番号（任意）', React.createElement('input', { className:'form-input', placeholder:'例: 1234567890123', value:emaffNo, onChange:e=>setEmaffNo(e.target.value) })),
              React.createElement('label', { style:{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontSize:'13px', color:'#374151', fontWeight:600, marginTop:'2px' } },
                React.createElement('input', { type:'checkbox', checked:gapTarget, onChange:e=>setGapTarget(e.target.checked), style:{ width:'16px', height:'16px', accentColor:'#0A6B52', cursor:'pointer' } }),
                'GGAP認証の対象圃場にする（★）'
              )
            )
      ),

      // ── フッター（固定・ステップ別）──
      step === 1
        ? React.createElement('div', { style:{ flexShrink:0, display:'flex', gap:'8px', padding:'14px 22px', borderTop:'1px solid #F1F5F9', flexWrap:'wrap' } },
            React.createElement('button', { onClick:onClose, style:btnGhost }, 'キャンセル'),
            React.createElement('button', { onClick:submit, disabled, style:{ ...btnGhost, flex:1.3, borderColor:'#A7F3D0', color:'#0A6B52', opacity: disabled?0.5:1 }, title:'GAP情報は後で登録' }, 'GAPは後で・追加'),
            React.createElement('button', { onClick:goNext, disabled, style:btnPrimary(disabled) }, '次へ →')
          )
        : React.createElement('div', { style:{ flexShrink:0, display:'flex', gap:'8px', padding:'14px 22px', borderTop:'1px solid #F1F5F9' } },
            React.createElement('button', { onClick:()=>setStep(1), style:btnGhost }, '← 戻る'),
            React.createElement('button', { onClick:submit, style:btnPrimary(false) }, 'この内容で追加する')
          )
    )
  )
}

// ── Step3: アコーディオンアニメーション用サブコンポーネント ──
// Step4: fieldSubItems を props で受け取る形に変更（グローバル依存を排除）
function FieldAccordionItem({ f, isOpen, onChange, onDeleteTarget }) {
  return React.createElement('div', { className:'nav-field-group' },
    React.createElement('div', { style:{ position:'relative', display:'flex', alignItems:'center' } },
      React.createElement('button', {
        className: 'nav-field-parent' + (isOpen ? ' open' : ''),
        onClick: () => onChange('field:' + f.id + ':dashboard'),
        style:{ paddingRight:'36px' },
      },
        React.createElement('span', { className:'nav-icon', style:{ color: isOpen ? '#0A6B52' : '#94A3B8' } },
          React.createElement('i', { className: isOpen ? 'ti ti-folder-open' : 'ti ti-folder' })
        ),
        React.createElement('span', { style:{ flex:1, overflow:'hidden', textOverflow:'ellipsis', fontSize:'13px', fontWeight:700, color: isOpen ? '#0A6B52' : '#374151' } },
          f.name
        ),
        React.createElement('span', { style:{ fontSize:'11px', color:'#94A3B8', fontWeight:500, flexShrink:0 } },
          f.crop
        ),
      ),
      React.createElement('button', {
        onClick: e => { e.stopPropagation(); onDeleteTarget(f.id) },
        title: '削除',
        style:{
          position:'absolute', right:'6px', top:'50%', transform:'translateY(-50%)',
          width:'18px', height:'18px', borderRadius:'50%',
          background:'transparent', border:'none',
          color:'#CBD5E1', fontSize:'12px',
          cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
          transition:'all .1s', flexShrink:0,
        },
        onMouseEnter: e => { e.currentTarget.style.background='#FEE2E2'; e.currentTarget.style.color='#DC2626' },
        onMouseLeave: e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#CBD5E1' },
      }, 'x')
    )
  )
}

// =====================================================
// STAFF-01: スタッフ簡易入力画面（日報だけ）
// 経営者向けフル機能画面とは別の、入力に絞ったシンプル画面。
// RecordForm を「そのまま」再利用するため、ここで入力した記録は経営者画面と
// 完全に同じ state / localStorage キーに書き込まれる。
// → 同一端末（同じブラウザ）なら記録も計算（ダッシュボード/圃場まとめ/収穫予測/
//   GAP自動達成/原価）も自動連動する。端末をまたぐ本連動はバックエンド移行後。
// =====================================================
function StaffQuickView(props) {
  const { fields, records, lotSprayRecords, topDressingRecords, harvestRecords, pesticides,
          currentOrg, currentFarm, authUser, onExit, onSignOut,
          onUpdate, onDelete, onDeleteSpray, onDeleteTopDressing, onDeleteHarvest } = props
  const today = todayYmd()
  // 編集・削除の対象（間違えた日報を直せるように）
  const [detailRecord, setDetailRecord] = React.useState(null)  // 基本日報 → RecordDetailModal(編集/削除)
  const [deleteTarget, setDeleteTarget] = React.useState(null)  // リッチ記録 → 削除確認 {kind,id,label}
  const [showRecent, setShowRecent] = React.useState(false)     // 【#B】直近の記録（過去）の折りたたみ（既定は閉じる）
  const fieldName = (id) => { const f = masterById(fields, id); return f ? f.name : '圃場不明' }

  // 今日入力ぶんを4種横断で1リストに（スタッフが「ちゃんと届いた」実感＋間違いを直せる導線）
  const todayItems = []
  ;(records || []).filter(r => r.date === today).forEach(r =>
    todayItems.push({ kind:'daily', id:r.id, label:r.work_type || '作業', field:fieldName(r.field_id),
      icon:(WORK_ICON_MAP[r.work_type] || WORK_ICON_MAP['その他']), sub:r.worker || '', raw:r }))
  ;(lotSprayRecords || []).filter(r => r.date === today).forEach(r =>
    todayItems.push({ kind:'spray', id:r.id, label:'農薬散布', field:fieldName(r.field_id),
      icon:WORK_ICON_MAP['農薬散布'], sub:r.row_range ? ('畝 '+r.row_range) : '' }))
  ;(topDressingRecords || []).filter(r => r.date === today).forEach(r =>
    todayItems.push({ kind:'fert', id:r.id, label:'施肥', field:fieldName(r.field_id),
      icon:WORK_ICON_MAP['施肥'], sub:r.row_range ? ('畝 '+r.row_range) : '' }))
  ;(harvestRecords || []).filter(r => r.date === today).forEach(r =>
    todayItems.push({ kind:'harvest', id:r.id, label:'収穫', field:fieldName(r.field_id),
      icon:WORK_ICON_MAP['収穫'], sub:(r.total_cases != null ? (r.total_cases+'ケース') : '') }))
  const todayCount = todayItems.length

  // 【#B】直近の記録（昨日〜3日前）をスタッフ自身が後から確認できるように（読み取り専用）。
  // スタッフ画面のシンプルさ(USP)を壊さないため、既定は閉じ・明示的に開いた時だけ表示。編集は経営者側へ。
  const _pad2 = n => String(n).padStart(2, '0')
  const _cut = new Date(today + 'T00:00:00'); _cut.setDate(_cut.getDate() - 3)
  const recentCutoff = _cut.getFullYear() + '-' + _pad2(_cut.getMonth() + 1) + '-' + _pad2(_cut.getDate())
  const inRecent = (d) => !!d && d < today && d >= recentCutoff
  const recentItems = []
  ;(records || []).filter(r => inRecent(r.date)).forEach(r =>
    recentItems.push({ kind:'daily', id:r.id, date:r.date, label:r.work_type || '作業', field:fieldName(r.field_id),
      icon:(WORK_ICON_MAP[r.work_type] || WORK_ICON_MAP['その他']), sub:r.worker || '' }))
  ;(lotSprayRecords || []).filter(r => inRecent(r.date)).forEach(r =>
    recentItems.push({ kind:'spray', id:r.id, date:r.date, label:'農薬散布', field:fieldName(r.field_id),
      icon:WORK_ICON_MAP['農薬散布'], sub:r.row_range ? ('畝 '+r.row_range) : '' }))
  ;(topDressingRecords || []).filter(r => inRecent(r.date)).forEach(r =>
    recentItems.push({ kind:'fert', id:r.id, date:r.date, label:'施肥', field:fieldName(r.field_id),
      icon:WORK_ICON_MAP['施肥'], sub:r.row_range ? ('畝 '+r.row_range) : '' }))
  ;(harvestRecords || []).filter(r => inRecent(r.date)).forEach(r =>
    recentItems.push({ kind:'harvest', id:r.id, date:r.date, label:'収穫', field:fieldName(r.field_id),
      icon:WORK_ICON_MAP['収穫'], sub:(r.total_cases != null ? (r.total_cases+'ケース') : '') }))
  recentItems.sort((a, b) => String(b.date).localeCompare(String(a.date)) || (Number(b.id)||0)-(Number(a.id)||0))

  const DELETERS = { spray:onDeleteSpray, fert:onDeleteTopDressing, harvest:onDeleteHarvest }
  const farmLabel = (currentFarm && currentFarm.name) || (currentOrg && currentOrg.name) || CONFIG.FARM_NAME

  return React.createElement('div', { className:'staff-view', style:{ minHeight:'100vh', width:'100%', background:'#F4FAF6', overflowY:'auto', overflowX:'hidden' } },
    // ── ヘッダー（大きめ・シンプル。高齢/実習生の利用を想定して文字大） ──
    React.createElement('div', { style:{ background:'#0A6B52', color:'#fff', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap', rowGap:10, position:'sticky', top:0, zIndex:10, boxShadow:'0 2px 8px rgba(0,0,0,.12)' } },
      React.createElement('div', { style:{ minWidth:0, flex:'1 1 auto' } },
        React.createElement('div', { style:{ fontSize:13, opacity:.85, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } }, '🌱 ' + farmLabel),
        React.createElement('div', { style:{ fontSize:19, fontWeight:800, letterSpacing:'.01em', whiteSpace:'nowrap' } }, 'スタッフ入力')
      ),
      React.createElement('div', { style:{ display:'flex', gap:8, alignItems:'center', flexShrink:0 } },
        // 今日の入力件数バッジ
        React.createElement('div', { style:{ background:'rgba(255,255,255,.15)', borderRadius:999, padding:'6px 14px', fontSize:13, fontWeight:700, whiteSpace:'nowrap' } },
          '今日 ' + todayCount + ' 件'),
        onExit && React.createElement('button', {
          onClick: onExit,
          style:{ background:'#fff', color:'#0A6B52', border:'none', borderRadius:8, padding:'8px 14px', fontSize:13, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }
        }, '経営者画面へ'),
        onSignOut && React.createElement('button', {
          onClick: onSignOut,
          style:{ background:'none', color:'#fff', border:'1px solid rgba(255,255,255,.5)', borderRadius:8, padding:'8px 12px', fontSize:12, cursor:'pointer', whiteSpace:'nowrap' }
        }, 'ログアウト')
      )
    ),
    // ── 説明バナー ──
    React.createElement('div', { className:'staff-content', style:{ maxWidth:760, margin:'14px auto 0', padding:'0 16px' } },
      React.createElement('div', { style:{ background:'#ECFDF5', border:'1px solid #A7F3D0', borderRadius:10, padding:'12px 16px', fontSize:13, color:'#065F46', lineHeight:1.6 } },
        '今日の作業を記録してください。保存すると経営者の管理画面にそのまま反映されます（同じ端末）。'),
      // ── 日報フォーム本体（フル機能画面と完全に同じ RecordForm を再利用。RecordForm自身が
      //    .page/.card を描画するので、ここで二重にカードで囲まない＝狭幅でのはみ出し防止） ──
      React.createElement('div', { style:{ marginTop:6 } },
        fields && fields.length > 0
          ? React.createElement(RecordForm, {
              fields, pesticides: props.pesticides, records, lotSprayRecords, onSave: props.onSave,
              farmLots: props.farmLots, fertilizers: props.fertilizers, destinations: props.destinations,
              harvestRecords, staff: props.staff,
              onSaveLotSpray: props.onSaveLotSpray, onSaveTopDressing: props.onSaveTopDressing, onSaveHarvest: props.onSaveHarvest,
            })
          : React.createElement('div', { style:{ marginTop:14, background:'#fff', border:'1px solid #DDE8DE', borderRadius:12, padding:'28px 16px', textAlign:'center', color:'#64748B', fontSize:14 } },
              '圃場がまだ登録されていません。経営者画面で圃場を登録すると、ここで日報が入力できます。')
      ),

      // ── 今日入力した記録（間違えたら直せる：基本日報は編集/削除、農薬・施肥・収穫は削除して入力し直し） ──
      fields && fields.length > 0 && React.createElement('div', { style:{ marginTop:22 } },
        React.createElement('div', { style:{ display:'flex', alignItems:'baseline', gap:8, marginBottom:10 } },
          React.createElement('div', { style:{ fontSize:15, fontWeight:800, color:'#0A6B52' } }, '今日入力した記録'),
          React.createElement('div', { style:{ fontSize:12, color:'#6B7280' } }, todayCount + '件')
        ),
        todayCount === 0
          ? React.createElement('div', { style:{ background:'#fff', border:'1px dashed #C6DDD0', borderRadius:12, padding:'20px 16px', textAlign:'center', color:'#94A3B8', fontSize:13 } },
              'まだ今日の記録はありません。上のフォームから入力してください。')
          : React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:8 } },
              ...todayItems.map(it =>
                React.createElement('div', { key: it.kind+'-'+it.id,
                  style:{ display:'flex', alignItems:'center', gap:10, background:'#fff', border:'1px solid #DDE8DE', borderRadius:12, padding:'10px 12px' } },
                  React.createElement('div', { style:{ width:34, height:34, borderRadius:'50%', background:(it.icon&&it.icon.color)||'#6B7280', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 } },
                    React.createElement('i', { className:'ti ti-'+((it.icon&&it.icon.icon)||'dots'), style:{ fontSize:16, color:'#fff' } })),
                  React.createElement('div', { style:{ flex:1, minWidth:0 } },
                    React.createElement('div', { style:{ fontSize:14, fontWeight:700, color:'#1A1F2E' } }, it.label),
                    React.createElement('div', { style:{ fontSize:12, color:'#6B7280', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } },
                      it.field + (it.sub ? '　' + it.sub : ''))
                  ),
                  // 基本日報は「なおす」(編集)、リッチ記録は「けす」(削除して入力し直し)
                  it.kind === 'daily'
                    ? React.createElement('button', { onClick:()=>setDetailRecord(it.raw),
                        style:{ flexShrink:0, background:'#F0F8F4', border:'1px solid #C6DDD0', color:'#0A6B52', borderRadius:8, padding:'8px 14px', fontSize:13, fontWeight:700, cursor:'pointer' } }, 'なおす')
                    : React.createElement('button', { onClick:()=>setDeleteTarget({ kind:it.kind, id:it.id, label:it.label+'（'+it.field+'）' }),
                        style:{ flexShrink:0, background:'#FEF2F2', border:'1px solid #FCA5A5', color:'#DC2626', borderRadius:8, padding:'8px 14px', fontSize:13, fontWeight:700, cursor:'pointer' } }, 'けす')
                )
              )
            ),
        React.createElement('div', { style:{ marginTop:8, fontSize:11, color:'#94A3B8', lineHeight:1.5 } },
          '※「なおす」で内容を修正、「けす」で消して入力し直せます。農薬散布・施肥・収穫は、消してから正しく入れ直してください。')
      ),
      // ── 【#B】直近の記録（昨日〜3日前）: スタッフが自分の入力を後から確認できる（読み取り専用・既定は閉じる） ──
      fields && fields.length > 0 && recentItems.length > 0 && React.createElement('div', { style:{ marginTop:14 } },
        React.createElement('button', {
          onClick: () => setShowRecent(v => !v), type:'button',
          style:{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8,
            background:'#fff', border:'1px solid #DDE8DE', borderRadius:12, padding:'12px 14px', cursor:'pointer' }
        },
          React.createElement('span', { style:{ fontSize:14, fontWeight:700, color:'#374151' } }, '直近の記録（昨日〜3日前）'),
          React.createElement('span', { style:{ display:'flex', alignItems:'center', gap:8 } },
            React.createElement('span', { style:{ fontSize:12, color:'#6B7280' } }, recentItems.length + '件'),
            React.createElement('i', { className:'ti ti-chevron-' + (showRecent ? 'up' : 'down'), style:{ fontSize:16, color:'#94A3B8' } })
          )
        ),
        showRecent && React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:8, marginTop:8 } },
          ...recentItems.map(it =>
            React.createElement('div', { key:'recent-'+it.kind+'-'+it.id,
              style:{ display:'flex', alignItems:'center', gap:10, background:'#FBFCFB', border:'1px solid #E8EEE8', borderRadius:12, padding:'10px 12px' } },
              React.createElement('div', { style:{ width:30, height:30, borderRadius:'50%', background:(it.icon&&it.icon.color)||'#9CA3AF', opacity:.85, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 } },
                React.createElement('i', { className:'ti ti-'+((it.icon&&it.icon.icon)||'dots'), style:{ fontSize:15, color:'#fff' } })),
              React.createElement('div', { style:{ flex:1, minWidth:0 } },
                React.createElement('div', { style:{ fontSize:13, fontWeight:700, color:'#374151' } }, it.label),
                React.createElement('div', { style:{ fontSize:12, color:'#94A3B8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } },
                  it.date + '　' + it.field + (it.sub ? '　' + it.sub : ''))
              ),
              React.createElement('span', { style:{ flexShrink:0, fontSize:11, color:'#94A3B8' } }, '確認のみ')
            )
          ),
          React.createElement('div', { style:{ marginTop:2, fontSize:11, color:'#94A3B8', lineHeight:1.5 } },
            '※ 過去の記録は確認のみです。直したい時は今日ぶんを入れ直すか、経営者にお伝えください。')
        )
      ),
      // ── 保存時の演出の設定（スタッフもこの端末で切り替え可能） ──
      React.createElement('div', { style:{ marginTop:22 } },
        React.createElement(SaveEffectSetting, { compact:true })
      ),
      React.createElement('div', { style:{ height:40 } })
    ),

    // ── 基本日報の編集/削除モーダル（フル機能画面と同じ RecordDetailModal を再利用） ──
    detailRecord && React.createElement(RecordDetailModal, {
      record: detailRecord, fields, pesticides,
      onClose: () => setDetailRecord(null),
      onUpdate: onUpdate ? r => onUpdate(r) : null, // 閉じるのはモーダル側(handleUpdate)が成功時のみ
      onDelete: onDelete ? id => onDelete(id) : null,
    }),
    // ── リッチ記録（農薬/施肥/収穫）の削除確認 ──
    deleteTarget && React.createElement(ConfirmDeleteModal, {
      title: 'この記録を消しますか？',
      targetName: deleteTarget.label,
      detail: '消したあと、正しい内容で入力し直してください。',
      onCancel: () => setDeleteTarget(null),
      // 削除成功(ok===true)を待ってから閉じる。失敗時は確認画面を保持(DB経路のロールバックと整合)
      onConfirm: async () => { const del = DELETERS[deleteTarget.kind]; if (!del) { setDeleteTarget(null); return } const res = await Promise.resolve(del(deleteTarget.id)).catch(() => null); if (res && res.ok === true) setDeleteTarget(null) },
    })
  )
}

function Sidebar({ current, onChange, fields, onAddField, onDeleteField, currentOrg, currentFarm, availableFarms, onFarmChange, onSignOut, authUser, onEnterStaff }) {
  const [farmMenuOpen, setFarmMenuOpen] = React.useState(false)
  // 【メニュー整理】セクションを折りたたみ可能に。普段使わない「管理・設定」は既定で閉じる。
  const [openSections, setOpenSections] = React.useState({ data: true, sys: false })
  const toggleSection = (k) => setOpenSections(s => ({ ...s, [k]: !s[k] }))
  const isCorp    = currentOrg && currentOrg.type === 'corp'
  const multiFarm = isCorp && availableFarms && availableFarms.length > 1
  // 現在の圃場IDとサブタブを解析
  const parseFieldPage = (p) => {
    if (!p.startsWith('field:')) return { fieldId: null, sub: null }
    const parts = p.split(':')
    return { fieldId: parts[1], sub: parts[2] || 'dashboard' }
  }
  const { fieldId: curFieldId, sub: curSub } = parseFieldPage(current)

  // 【UX: サイドバーのスクロール位置保持】NavBtn/SectionHead を「インラインのReactコンポーネント」
  // として React.createElement(NavBtn,...) で描画すると、Sidebar 再描画のたびに毎回“別コンポーネント型”
  // 扱いになり全ナビ項目が破棄→再生成される。その瞬間スクロールコンテナの中身が空になり scrollTop が
  // 0にクランプ＝クリックのたびに最上部へ戻る。これを避けるため、要素を直接返すプレーン関数にして
  // 型が 'button' のまま安定させ、再マウントを防ぐ（keyは返す要素に付ける）。
  const navBtn = (item) =>
    React.createElement('button', {
      key: item.id,
      className: 'nav-item' + (current === item.id ? ' active' : ''),
      onClick: () => onChange(item.id),
    },
      React.createElement('span', { className:'nav-icon' },
        React.createElement('i', { className:'ti ti-' + item.icon, 'aria-hidden':'true' })
      ),
      item.label
    )

  // 折りたたみ式セクション見出し（クリックで開閉。シェブロンで状態表示）
  const sectionHead = (label, sectionKey, open, mt) =>
    React.createElement('button', {
      key: 'sec-' + sectionKey,
      onClick: () => toggleSection(sectionKey),
      className: 'nav-section',
      style:{ marginTop:(mt||'8px'), display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', background:'none', border:'none', cursor:'pointer', padding:'4px 10px' },
    },
      React.createElement('span', null, label),
      React.createElement('i', { className:'ti ti-chevron-' + (open ? 'down' : 'right'), 'aria-hidden':'true', style:{ fontSize:'14px', opacity:.6 } })
    )

  return React.createElement('nav', { className:'sidebar', style:{ display:'flex', flexDirection:'column', overflowY:'auto', overflowX:'hidden' } },
    React.createElement('div', { className:'sb-logo', style:{ flexShrink:0, position:'relative' } },
      React.createElement('div', { className:'farm-name' }, '🌱 ' + (currentFarm ? currentFarm.name : CONFIG.FARM_NAME)),
      React.createElement('div', { className:'farm-sub'  }, isCorp ? (currentOrg.name + ' — 管理システム') : '農場管理システム v2.0'),
      multiFarm && React.createElement('button', {
        onClick: () => setFarmMenuOpen(o => !o),
        style:{ position:'absolute', top:16, right:10, background:'#F0F8F4', border:'1px solid #C6DDD0', borderRadius:6, padding:'3px 8px', fontSize:11, fontWeight:600, color:'#0A6B52', cursor:'pointer' }
      }, '切替 ▾'),
      multiFarm && farmMenuOpen && React.createElement('div', {
        style:{ position:'absolute', top:64, left:12, right:12, background:'#fff', border:'1px solid #DDE8DE', borderRadius:8, boxShadow:'0 4px 12px rgba(0,0,0,.12)', zIndex:1000 }
      },
        availableFarms.map(f =>
          React.createElement('button', { key:f.id,
            onClick: () => { onFarmChange(f); setFarmMenuOpen(false) },
            style:{ display:'block', width:'100%', padding:'10px 14px', textAlign:'left', background:currentFarm.id===f.id?'#F0FDF4':'transparent', border:'none', borderBottom:'1px solid #F0F4F1', fontSize:13, fontWeight:currentFarm.id===f.id?700:500, color:currentFarm.id===f.id?'#0A6B52':'#374151', cursor:'pointer' }
          }, (currentFarm.id === f.id ? '✓ ' : '') + f.name)
        )
      )
    ),

    // ── 上部固定：ダッシュボード ──
    React.createElement('div', { className:'nav-wrap', style:{ flexShrink:0, paddingBottom:0 } },
      ...NAV_SECTIONS_TOP.map(n => navBtn(n)),
      React.createElement('div', { style:{ marginTop:'10px', paddingLeft:'10px', paddingRight:'10px' } },
        React.createElement('div', { className:'nav-section', style:{ marginBottom:'6px', fontSize:'11px', letterSpacing:'.04em' } }, '圃場別管理'),
        React.createElement('div', { style:{ display:'flex', gap:'6px' } },
          React.createElement('button', {
            onClick: () => onChange('fields'),
            title:'圃場一覧',
            style:{
              flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              gap:'4px', padding:'10px 4px', borderRadius:'10px', cursor:'pointer',
              border: (current === 'fields') ? '2px solid #0A6B52' : '2px solid #DDE8DE',
              background: (current === 'fields') ? '#0A6B52' : '#F4FAF6',
              color: (current === 'fields') ? '#fff' : '#3D6B50',
              fontWeight: 600, fontSize:'12px', transition:'all .15s',
            },
            onMouseEnter: e => { if (current !== 'fields') { e.currentTarget.style.background='#E0F0E8'; e.currentTarget.style.borderColor='#0A6B52' } },
            onMouseLeave: e => { if (current !== 'fields') { e.currentTarget.style.background='#F4FAF6'; e.currentTarget.style.borderColor='#DDE8DE' } },
          },
            React.createElement('i', { className:'ti ti-layout-list', style:{ fontSize:'20px' } }),
            '一覧'
          ),
          React.createElement('button', {
            onClick: () => onChange('field_map'),
            title:'圃場マップ',
            style:{
              flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              gap:'4px', padding:'10px 4px', borderRadius:'10px', cursor:'pointer',
              border: (current === 'field_map') ? '2px solid #0A6B52' : '2px solid #DDE8DE',
              background: (current === 'field_map') ? '#0A6B52' : '#F4FAF6',
              color: (current === 'field_map') ? '#fff' : '#3D6B50',
              fontWeight: 600, fontSize:'12px', transition:'all .15s',
            },
            onMouseEnter: e => { if (current !== 'field_map') { e.currentTarget.style.background='#E0F0E8'; e.currentTarget.style.borderColor='#0A6B52' } },
            onMouseLeave: e => { if (current !== 'field_map') { e.currentTarget.style.background='#F4FAF6'; e.currentTarget.style.borderColor='#DDE8DE' } },
          },
            React.createElement('i', { className:'ti ti-map-2', style:{ fontSize:'20px' } }),
            'マップ'
          )
        )
      ),

    ),

    // ── 下部：営農データ・管理設定（折りたたみ式。現在ページを含むセクションは自動で開く） ──
    (() => {
      const dataOpen = openSections.data || NAV_SECTIONS_DATA.some(n => n.id === current)
      const sysOpen  = openSections.sys  || NAV_SECTIONS_SYS.some(n => n.id === current)
      return React.createElement('div', { className:'nav-wrap', style:{ flexShrink:0, paddingTop:'14px' } },
        sectionHead('営農データ', 'data', dataOpen, '4px'),
        ...(dataOpen ? NAV_SECTIONS_DATA.map(n => navBtn(n)) : []),
        sectionHead('管理・設定', 'sys', sysOpen),
        ...(sysOpen ? NAV_SECTIONS_SYS.map(n => navBtn(n)) : []),
      )
    })(),

    // ── フッター: ユーザー情報 + サインアウト ──
    React.createElement('div', { style:{ marginTop:'auto', padding:'12px 14px 14px', borderTop:'1px solid #DDE8DE', flexShrink:0 } },
      authUser && React.createElement('div', { style:{ fontSize:11, color:'#94A3B8', marginBottom:8, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } }, authUser.email),
      onEnterStaff && React.createElement('button', {
        onClick: onEnterStaff,
        style:{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, background:'#F0F8F4', border:'1px solid #C6DDD0', borderRadius:6, padding:'7px 10px', fontSize:12, fontWeight:700, color:'#0A6B52', cursor:'pointer', width:'100%', marginBottom:8 }
      }, React.createElement('i', { className:'ti ti-hard-hat', style:{ fontSize:14 } }), 'スタッフ画面を開く'),
      React.createElement('button', {
        onClick: onSignOut,
        style:{ display:'flex', alignItems:'center', gap:6, background:'none', border:'1px solid #DDE8DE', borderRadius:6, padding:'6px 10px', fontSize:12, color:'#64748B', cursor:'pointer', width:'100%' }
      }, React.createElement('i', { className:'ti ti-logout', style:{ fontSize:14 } }), 'ログアウト')
    )
  )
}

// =====================================================
// INTEGRITY-01: 整合性チェック（突合せ）ページ
// 記録同士の食い違い・人的入力ミスを横断で洗い出し、原因と対処を示す。
// runFarmIntegrityChecks(data.js) の結果を深刻度別に表示。日報管理へ飛べる導線付き。
// =====================================================
const SEV_META = {
  high: { label:'要対応', color:'#DC2626', bg:'#FEF2F2', border:'#FCA5A5', icon:'alert-triangle' },
  mid:  { label:'要確認', color:'#B45309', bg:'#FFFBEB', border:'#FDE68A', icon:'alert-circle' },
  low:  { label:'参考',   color:'#0369A1', bg:'#F0F9FF', border:'#BAE6FD', icon:'info-circle' },
}
// 初見の人向け: 所見が出ていない空状態で「このチェックが何を見ているか」を示す例。
// 実際の突合せ(runFarmIntegrityChecks)の主要カテゴリを平易な言葉にしたもの。
const INTEGRITY_CHECK_EXAMPLES = [
  '農薬の年間使用回数が上限を超えていないか（GAP違反）',
  '収穫前日数(PHI)を空けずに農薬を散布していないか',
  '出荷量が収穫量を上回っていないか（在庫マイナス）',
  '未来の日付や、定植より前の収穫など日付の矛盾がないか',
  '天気・作業者・品種などの記入漏れがないか',
  '同じ作業の二重登録（収穫の二重計上）がないか',
]
function FarmIntegrityPage(props) {
  const findings = React.useMemo(() => {
    try { return runFarmIntegrityChecks(props) } catch (e) { return [] }
  }, [props.records, props.lotSprayRecords, props.topDressingRecords, props.harvestRecords, props.shipmentRecords, props.farmLots, props.fields, props.pesticides, props.pesticidePurchases])
  // 点検対象になる「作業記録」が1件でもあるか。空なら"クリーン"ではなく"まだ点検対象が無い"と示す。
  const hasCheckableData = [
    props.records, props.lotSprayRecords, props.topDressingRecords, props.harvestRecords, props.shipmentRecords,
  ].some(arr => Array.isArray(arr) && arr.length > 0)
  const counts = { high:0, mid:0, low:0 }
  findings.forEach(f => { counts[f.severity] = (counts[f.severity] || 0) + 1 })
  const onNavigate = props.onNavigate

  return React.createElement('div', { className:'page' },
    React.createElement('div', { className:'eyebrow' }, 'RECONCILIATION'),
    React.createElement('div', { className:'page-title' }, '整合性チェック（突合せ）'),
    React.createElement('div', { className:'page-sub' }, '記録の食い違い・入力ミスを横断で点検し、原因と直し方を表示します'),

    // サマリー
    React.createElement('div', { style:{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:20 } },
      ...['high','mid','low'].map(sev => {
        const m = SEV_META[sev]
        return React.createElement('div', { key:sev, style:{ flex:'1 1 140px', background:m.bg, border:'1px solid '+m.border, borderRadius:12, padding:'14px 16px' } },
          React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:6, color:m.color, fontWeight:700, fontSize:13 } },
            React.createElement('i', { className:'ti ti-'+m.icon, style:{ fontSize:16 } }), m.label),
          React.createElement('div', { style:{ fontSize:26, fontWeight:800, color:m.color, fontVariantNumeric:'tabular-nums' } }, counts[sev]),
          React.createElement('div', { style:{ fontSize:11, color:'#6B7280' } }, '件')
        )
      })
    ),

    findings.length === 0
      ? (hasCheckableData
          // 記録があって、かつ不整合なし＝本当にクリーン
          ? React.createElement('div', { style:{ background:'#ECFDF5', border:'1px solid #A7F3D0', borderRadius:14, padding:'32px 20px', textAlign:'center' } },
              React.createElement('i', { className:'ti ti-circle-check', 'aria-hidden':'true', style:{ fontSize:44, color:'#0D9972', marginBottom:8, display:'block' } }),
              React.createElement('div', { style:{ fontSize:16, fontWeight:800, color:'#065F46', marginBottom:4 } }, '食い違いは見つかりませんでした'),
              React.createElement('div', { style:{ fontSize:13, color:'#4B5563' } }, '記録同士の突合せで、要対応の不整合はありません。')
            )
          // 記録がまだ無い＝点検対象が無いだけ。初見の人が「点検された」と誤解しないよう明示。
          : React.createElement('div', { style:{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:14, padding:'28px 22px' } },
              React.createElement('div', { style:{ textAlign:'center', marginBottom:18 } },
                React.createElement('i', { className:'ti ti-checkup-list', 'aria-hidden':'true', style:{ fontSize:42, color:'#94A3B8', marginBottom:8, display:'block' } }),
                React.createElement('div', { style:{ fontSize:16, fontWeight:800, color:'#334155', marginBottom:4 } }, 'まだ点検できる記録がありません'),
                React.createElement('div', { style:{ fontSize:13, color:'#64748B' } }, '日報や農薬・収穫の記録を入力すると、ここで自動的に食い違いを点検します。')
              ),
              React.createElement('div', { style:{ fontSize:12, fontWeight:700, color:'#475569', marginBottom:8 } }, 'このチェックで見ている主な項目'),
              React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:7 } },
                ...INTEGRITY_CHECK_EXAMPLES.map((ex, i) =>
                  React.createElement('div', { key:i, style:{ display:'flex', gap:8, alignItems:'flex-start', fontSize:12.5, color:'#475569' } },
                    React.createElement('i', { className:'ti ti-check', style:{ fontSize:14, color:'#0A6B52', marginTop:2, flexShrink:0 } }),
                    React.createElement('span', null, ex)
                  )
                )
              )
            )
        )
      : React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:12 } },
          ...findings.map(f => {
            const m = SEV_META[f.severity] || SEV_META.low
            return React.createElement('div', { key:f.id, style:{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:12, padding:'14px 16px' } },
              React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:6 } },
                React.createElement('span', { style:{ fontSize:11, fontWeight:700, color:m.color, background:m.bg, border:'1px solid '+m.border, borderRadius:999, padding:'2px 8px' } }, m.label),
                React.createElement('span', { style:{ fontSize:11, fontWeight:600, color:'#6B7280', background:'#F3F4F6', borderRadius:999, padding:'2px 8px' } }, f.category),
                React.createElement('span', { style:{ fontSize:14, fontWeight:700, color:'#111827' } }, f.title)
              ),
              React.createElement('div', { style:{ fontSize:13, color:'#374151', marginBottom:6 } }, f.detail),
              React.createElement('div', { style:{ display:'flex', gap:8, alignItems:'flex-start', marginBottom:4 } },
                React.createElement('span', { style:{ fontSize:11, fontWeight:700, color:'#92400E', flexShrink:0 } }, '原因'),
                React.createElement('span', { style:{ fontSize:12, color:'#6B7280' } }, f.cause)
              ),
              React.createElement('div', { style:{ display:'flex', gap:8, alignItems:'flex-start' } },
                React.createElement('span', { style:{ fontSize:11, fontWeight:700, color:'#065F46', flexShrink:0 } }, '対処'),
                React.createElement('span', { style:{ fontSize:12, color:'#374151' } }, f.fix)
              ),
              React.createElement('div', { style:{ marginTop:8, display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' } },
                (f.refs && f.refs.length > 0) && React.createElement('span', { style:{ fontSize:11, color:'#9CA3AF' } }, '該当:'),
                ...(f.refs || []).slice(0, 8).map((rf, i) => React.createElement('span', { key:i, style:{ fontSize:11, color:'#4B5563', background:'#F3F4F6', borderRadius:6, padding:'2px 7px' } }, rf.label || (rf.kind + '#' + rf.id))),
                (f.refs && f.refs.length > 8) && React.createElement('span', { style:{ fontSize:11, color:'#9CA3AF' } }, '他' + (f.refs.length - 8) + '件'),
                onNavigate && React.createElement('button', { onClick:()=> onNavigate((f.nav && f.nav.page) || 'record_list', f.nav && f.nav.focus),
                  style:{ marginLeft:'auto', fontSize:11, fontWeight:700, color:'#fff', background:'#0A6B52', border:'none', borderRadius:8, padding:'5px 12px', cursor:'pointer' } }, '該当箇所を開く →')
              )
            )
          })
        )
  )
}

function SectionTitle({ icon, children, style }) {
  return React.createElement('div', { className:'section-title', style },
    React.createElement('i', {
      className: 'ti ti-' + icon,
      'aria-hidden': 'true',
      style: { fontSize:'15px', verticalAlign:'-2px', marginRight:'6px' }
    }),
    children
  )
}

// =====================================================
// 折りたたみセクション（振り返り系など、既定で畳んで場所を取らせない用途）
function CollapsibleSection({ title, hint, defaultOpen, children }) {
  const [open, setOpen] = React.useState(!!defaultOpen)
  return React.createElement('div', { style:{ margin:'6px 0 14px' } },
    React.createElement('button', {
      onClick: () => setOpen(o => !o),
      style:{ display:'flex', alignItems:'center', gap:8, width:'100%', textAlign:'left', background:'#fff', border:'1px solid #E5E7EB', borderRadius:10, padding:'10px 14px', cursor:'pointer' },
    },
      React.createElement('i', { className:'ti ti-chevron-' + (open ? 'down' : 'right'), style:{ fontSize:'15px', color:'#0A6B52' } }),
      React.createElement('span', { style:{ fontSize:13, fontWeight:700, color:'#374151' } }, title),
      hint ? React.createElement('span', { style:{ fontSize:11, color:'#9CA3AF', marginLeft:4 } }, hint) : null,
    ),
    open ? React.createElement('div', { style:{ marginTop:10 } }, children) : null
  )
}

// UX-11: 月次作業サマリーグラフ（改善版）
// ・バーをクリックすると月別内訳パネルが展開
// ・今月ミニサマリー（農薬散布・施肥・総作業）を先月比付きでグラフ下に統合
// =====================================================
function MonthlySummaryChart({ records }) {
  const [selectedIdx, setSelectedIdx] = React.useState(null)
  const buckets  = aggregateMonthlyWork(records, 6)
  const workKeys = Object.keys(WORK_ICON_MAP).filter(w =>
    buckets.some(b => b.counts[w] > 0)
  )
  const maxTotal = Math.max(1, ...buckets.map(b => b.total))

  // 今月・先月のバケットを取得
  const thisMonth = buckets[buckets.length - 1]
  const lastMonth = buckets[buckets.length - 2]

  const miniStats = [
    {
      label: '今月の農薬散布',
      now:   thisMonth ? (thisMonth.counts['農薬散布'] || 0) : 0,
      prev:  lastMonth ? (lastMonth.counts['農薬散布'] || 0) : null,
      unit:  '回',
      color: '#DC2626',
    },
    {
      label: '今月の施肥',
      now:   thisMonth ? (thisMonth.counts['施肥'] || 0) : 0,
      prev:  lastMonth ? (lastMonth.counts['施肥'] || 0) : null,
      unit:  '回',
      color: '#0D9972',
    },
    {
      label: '今月の総作業',
      now:   thisMonth ? thisMonth.total : 0,
      prev:  lastMonth ? lastMonth.total : null,
      unit:  '件',
      color: '#2563EB',
    },
  ]

  const W = 600, H = 180, padL = 28, padB = 24, padT = 10
  const chartW = W - padL - 8
  const chartH = H - padT - padB
  const barSlot = chartW / buckets.length
  const barW = Math.min(36, barSlot * 0.5)

  const selectedBucket = selectedIdx !== null ? buckets[selectedIdx] : null

  return React.createElement('div', { className:'card', style:{ marginBottom:'24px' } },
    React.createElement(SectionTitle, { icon:'chart-bar' }, '月次作業サマリー（直近6ヶ月）'),

    workKeys.length === 0
      ? React.createElement('div', { style:{ padding:'24px 0', color:'#94A3B8', fontSize:'13px', textAlign:'center' } },
          '直近6ヶ月の作業記録がありません')
      : React.createElement('div', null,

          // --- SVG 棒グラフ（バークリックで内訳展開） ---
          React.createElement('svg', {
            viewBox: '0 0 '+W+' '+H,
            style: { width:'100%', height:'180px', display:'block', cursor:'pointer' }
          },
            React.createElement('line', {
              x1:padL, y1:H-padB, x2:W-4, y2:H-padB,
              stroke:'#E5EDE5', strokeWidth:1
            }),
            ...buckets.map((b, i) => {
              const x = padL + i * barSlot + (barSlot - barW) / 2
              const isSelected = selectedIdx === i
              let yCursor = H - padB
              const segs = workKeys.map(w => {
                const cnt = b.counts[w] || 0
                if (cnt === 0) return null
                const segH = (cnt / maxTotal) * chartH
                yCursor -= segH
                return React.createElement('rect', {
                  key: w,
                  x, y: yCursor, width: barW, height: segH,
                  fill: WORK_ICON_MAP[w].color,
                  rx: 2,
                  opacity: isSelected ? 1 : (selectedIdx !== null ? 0.45 : 1),
                })
              })
              return React.createElement('g', {
                key: b.key,
                onClick: () => setSelectedIdx(selectedIdx === i ? null : i),
                style:{ cursor:'pointer' },
              },
                // ホバー背景
                React.createElement('rect', {
                  x: padL + i * barSlot, y: padT,
                  width: barSlot, height: chartH + 4,
                  fill: isSelected ? '#F0FDF4' : 'transparent',
                  rx: 4,
                }),
                segs,
                b.total > 0 && React.createElement('text', {
                  x: x + barW / 2, y: yCursor - 6,
                  fontSize: 11, fontWeight: isSelected ? 800 : 700,
                  fill: isSelected ? '#0A6B52' : '#374151',
                  textAnchor:'middle'
                }, b.total),
                React.createElement('text', {
                  x: x + barW / 2, y: H - 6,
                  fontSize: 11,
                  fill: isSelected ? '#0A6B52' : '#94A3B8',
                  fontWeight: isSelected ? 700 : 400,
                  textAnchor:'middle'
                }, b.label)
              )
            })
          ),

          // --- 月別内訳パネル（クリック時に展開） ---
          selectedBucket && React.createElement('div', {
            style:{
              margin:'10px 0', padding:'12px 16px',
              background:'#F0FDF4', border:'1px solid #A7F3D0',
              borderRadius:'10px',
            }
          },
            React.createElement('div', {
              style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }
            },
              React.createElement('span', { style:{ fontSize:'13px', fontWeight:700, color:'#0A6B52' } },
                selectedBucket.label+'の内訳'
              ),
              React.createElement('button', {
                onClick: () => setSelectedIdx(null),
                style:{ background:'none', border:'none', cursor:'pointer', fontSize:'16px', color:'#9CA3AF', lineHeight:1, padding:'2px' }
              }, '✕')
            ),
            React.createElement('div', { style:{ display:'flex', flexWrap:'wrap', gap:'8px' } },
              workKeys.filter(w => (selectedBucket.counts[w] || 0) > 0).map(w =>
                React.createElement('div', {
                  key: w,
                  style:{
                    display:'flex', alignItems:'center', gap:'6px',
                    background:'#fff', border:'1px solid #D1FAE5',
                    borderRadius:'8px', padding:'6px 12px', fontSize:'12px',
                  }
                },
                  React.createElement('span', { style:{ width:8, height:8, borderRadius:'2px', background:WORK_ICON_MAP[w].color, display:'inline-block', flexShrink:0 } }),
                  React.createElement('span', { style:{ color:'#374151' } }, WORK_ICON_MAP[w].emoji+' '+w),
                  React.createElement('span', { style:{ fontWeight:700, color:'#0A6B52', marginLeft:'4px' } }, selectedBucket.counts[w]+'件')
                )
              ),
              selectedBucket.total === 0 && React.createElement('span', { style:{ color:'#94A3B8', fontSize:'12px' } }, 'この月の記録はありません')
            )
          ),

          // --- 凡例 ---
          React.createElement('div', { style:{ display:'flex', flexWrap:'wrap', gap:'12px', marginTop:'8px', paddingTop:'10px', borderTop:'1px solid #EDF2ED' } },
            ...workKeys.map(w =>
              React.createElement('div', { key:w, style:{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', color:'#64748B' } },
                React.createElement('span', { style:{ width:'10px', height:'10px', borderRadius:'2px', background:WORK_ICON_MAP[w].color, display:'inline-block' } }),
                WORK_ICON_MAP[w].emoji + ' ' + w
              )
            )
          ),

          // --- 今月ミニサマリー（先月比付き）---
          React.createElement('div', {
            style:{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px', marginTop:'16px', paddingTop:'14px', borderTop:'1px solid #EDF2ED' }
          },
            ...miniStats.map(s => {
              const diff = s.prev !== null ? s.now - s.prev : null
              const isUp   = diff !== null && diff > 0
              const isDown = diff !== null && diff < 0
              const isFlat = diff === 0
              return React.createElement('div', {
                key: s.label,
                style:{
                  background:'#F8FAF8', borderRadius:'10px', padding:'12px 14px',
                  border:'1px solid #E2E8E2',
                }
              },
                React.createElement('div', { style:{ fontSize:'10px', color:'#94A3B8', fontWeight:600, letterSpacing:'.06em', textTransform:'uppercase', marginBottom:'4px' } }, s.label),
                React.createElement('div', { style:{ display:'flex', alignItems:'baseline', gap:'6px' } },
                  React.createElement('span', { style:{ fontSize:'24px', fontWeight:700, color: s.color, lineHeight:1 } }, s.now),
                  React.createElement('span', { style:{ fontSize:'12px', color:'#94A3B8' } }, s.unit)
                ),
                diff !== null && React.createElement('div', {
                  style:{
                    display:'flex', alignItems:'center', gap:'3px',
                    marginTop:'5px', fontSize:'11px', fontWeight:600,
                    color: isUp ? '#C2410C' : isDown ? '#0A6B52' : '#94A3B8',
                  }
                },
                  React.createElement('i', {
                    className: isUp ? 'ti ti-arrow-up' : isDown ? 'ti ti-arrow-down' : 'ti ti-minus',
                    style:{ fontSize:'12px' }
                  }),
                  isFlat
                    ? '先月と同じ'
                    : '先月比 '+(isUp ? '+' : '')+diff+s.unit
                )
              )
            })
          )
        )
  )
}

// C06-1: WORK_ICON_MAP に emoji を統合し、WORK_TYPES はここから導出（二重定義解消）
const WORK_ICON_MAP = {
  '農薬散布': { icon:'spray',        color:'#DC2626', emoji:'🧴' },
  '施肥':     { icon:'leaf',         color:'#0D9972', emoji:'🌿' },
  '除草':     { icon:'scissors',     color:'#D97706', emoji:'✂️' },
  '収穫':     { icon:'basket',       color:'#7C3AED', emoji:'🌾' },
  '播種':     { icon:'seeding',      color:'#2563EB', emoji:'🌱' },
  '灌水':     { icon:'droplet',      color:'#2563EB', emoji:'💧' },
  '耕起':     { icon:'tractor',      color:'#854D0E', emoji:'🚜' },
  '畝づくり': { icon:'shovel',       color:'#B45309', emoji:'⛏️' },
  '定植':     { icon:'plant-2',      color:'#0D9972', emoji:'🌱' },
  '点検':     { icon:'search',       color:'#64748B', emoji:'🔍' },
  'その他':   { icon:'dots',         color:'#6B7280', emoji:'📝' },
}
// WORK_TYPES は WORK_ICON_MAP から自動生成 — DailyRecord内の独立定義は削除済み
const WORK_TYPES = Object.entries(WORK_ICON_MAP).map(([v, cfg]) => ({
  v, icon: cfg.emoji, color: cfg.color
}))

// C06-2: roleLabel / natLabel をファイルスコープ定数に外出し（StaffList内の重複定義を削除）
const ROLE_LABEL = { manager:'管理者', worker:'一般作業員', trainee:'技能実習生' }
const NAT_LABEL  = { JP:'🇯🇵 日本', VN:'🇻🇳 ベトナム', CN:'🇨🇳 中国', PH:'🇵🇭 フィリピン', ID:'🇮🇩 インドネシア' }

// 【スタッフ スキル管理 Step1-1】スキルマスタ・レベル定義
// スキル項目は実際の作業内容に合わせて要調整（サンプル農園さんへの確認ポイント）
const SKILL_MASTER = [
  { id:'harvest',    label:'収穫',         icon:'basket'   },
  { id:'sorting',    label:'選別・調整',    icon:'filter'   },
  { id:'pesticide',  label:'農薬散布',     icon:'spray'    },
  { id:'fertilize',  label:'施肥',         icon:'leaf'     },
  { id:'machine',    label:'機械操作',     icon:'tractor'  },
  { id:'packing',    label:'梱包・出荷',   icon:'box'      },
]
// レベル定義（1〜3段階。資格・習熟度に対応）
const SKILL_LEVEL_LABEL = { 1:'研修中', 2:'独力可', 3:'指導可' }

// 【スタッフ カタカナ表記 機能】ローマ字→カタカナ簡易自動変換
// ※ 完全な精度は出せないため「下書き」として生成し、必ず人の手で確認・修正する前提の設計
//    ヘボン式ローマ字を主眼に、よくあるベトナム語・中国語ピンインの綴りにも一部対応
function romajiToKatakana(input) {
  if (!input) return ''
  let s = input.trim().toLowerCase()
  if (!s) return ''

  // 長い綴りから優先的にマッチさせるため、置換テーブルは多文字から並べる
  const rules = [
    // ベトナム語によくある二重母音・子音群
    [/nguyen/g, 'グエン'], [/nguy/g, 'グイ'],
    [/thi/g, 'ティ'], [/th/g, 'ト'],
    [/ph/g, 'フ'], [/ng/g, 'ン'], [/nh/g, 'ニ'],
    [/tr/g, 'チ'], [/gi/g, 'ジ'],
    // 中国語ピンインによくある綴り
    [/zh/g, 'ジ'], [/xi/g, 'シ'], [/qi/g, 'チ'], [/x/g, 'シ'], [/q/g, 'チ'], [/zi/g, 'ズ'],
    // 一般的な英字・ローマ字の音節（長いものから。ch/sh等の2文字パターンは単独音節より先に評価しない）
    [/sha/g,'シャ'],[/shi/g,'シ'],[/shu/g,'シュ'],[/sho/g,'ショ'],[/she/g,'シェ'],
    [/cha/g,'チャ'],[/chi/g,'チ'],[/chu/g,'チュ'],[/cho/g,'チョ'],[/che/g,'チェ'],
    [/ch/g, 'チ'],
    [/kya/g,'キャ'],[/kyu/g,'キュ'],[/kyo/g,'キョ'],
    [/tya/g,'チャ'],[/tyu/g,'チュ'],[/tyo/g,'チョ'],
    [/ja/g,'ジャ'],[/ju/g,'ジュ'],[/jo/g,'ジョ'],[/ji/g,'ジ'],
    [/wa/g,'ワ'],[/wo/g,'ヲ'],[/wi/g,'ウィ'],[/we/g,'ウェ'],
    [/ka/g,'カ'],[/ki/g,'キ'],[/ku/g,'ク'],[/ke/g,'ケ'],[/ko/g,'コ'],
    [/sa/g,'サ'],[/si/g,'シ'],[/su/g,'ス'],[/se/g,'セ'],[/so/g,'ソ'],
    [/ta/g,'タ'],[/ti/g,'ティ'],[/tu/g,'トゥ'],[/te/g,'テ'],[/to/g,'ト'],
    [/na/g,'ナ'],[/ni/g,'ニ'],[/nu/g,'ヌ'],[/ne/g,'ネ'],[/no/g,'ノ'],
    [/ha/g,'ハ'],[/hi/g,'ヒ'],[/hu/g,'フ'],[/fu/g,'フ'],[/he/g,'ヘ'],[/ho/g,'ホ'],
    [/ma/g,'マ'],[/mi/g,'ミ'],[/mu/g,'ム'],[/me/g,'メ'],[/mo/g,'モ'],
    [/ya/g,'ヤ'],[/yu/g,'ユ'],[/yo/g,'ヨ'],
    [/ra/g,'ラ'],[/ri/g,'リ'],[/ru/g,'ル'],[/re/g,'レ'],[/ro/g,'ロ'],
    [/la/g,'ラ'],[/li/g,'リ'],[/lu/g,'ル'],[/le/g,'レ'],[/lo/g,'ロ'],
    [/ga/g,'ガ'],[/gi/g,'ギ'],[/gu/g,'グ'],[/ge/g,'ゲ'],[/go/g,'ゴ'],
    [/za/g,'ザ'],[/zu/g,'ズ'],[/ze/g,'ゼ'],[/zo/g,'ゾ'],
    [/da/g,'ダ'],[/di/g,'ディ'],[/du/g,'ドゥ'],[/de/g,'デ'],[/do/g,'ド'],
    [/ba/g,'バ'],[/bi/g,'ビ'],[/bu/g,'ブ'],[/be/g,'ベ'],[/bo/g,'ボ'],
    [/pa/g,'パ'],[/pi/g,'ピ'],[/pu/g,'プ'],[/pe/g,'ペ'],[/po/g,'ポ'],
    [/van/g,'バン'],[/van$/g,'バン'],
    [/a/g,'ア'],[/i/g,'イ'],[/u/g,'ウ'],[/e/g,'エ'],[/o/g,'オ'],
    [/n/g,'ン'],
    [/m/g,'ム'],  // 末尾等に残りがちな子音の保険ルール（例: Pham→Phaの後にmが残る場合）
  ]

  let out = ''
  // 空白・ハイフンで単語ごとに区切り、単語間は中黒（・）でつなぐ
  const words = s.split(/[\s\-]+/).filter(Boolean)
  out = words.map(word => {
    let w = word
    rules.forEach(([pattern, kana]) => { w = w.replace(pattern, kana) })
    return w
  }).join('・')

  return out
}

// C06-3: MONTHS / MONTH_LABELS / CROP_COLORS / CROPS_LIST をファイル上部に集約
//         （CropPlan直前に散在していたものを移動）
const MONTHS       = ['1','2','3','4','5','6','7','8','9','10','11','12']
const MONTH_LABELS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
const CROP_COLORS  = {
  'レタス':'#0D9972','米':'#D97706','とうもろこし':'#EA580C',
  '水稲':'#2563EB','ターサイ':'#a78bfa','トマト':'#ff7070','大豆':'#61b8f5',
  '玉ねぎ':'#86efac','その他':'#9ba4b5'
}
const CROPS_LIST = Object.keys(CROP_COLORS)

// C06-4: MANUAL_DATA / LANG_CONFIG をモックデータセクション上部に集約
// 【実装手順書 B】サンプル農園向けコンテンツに差し替え（2026-06-21）
const MANUAL_DATA = {
  ja: [
    { id:1,  type:'pdf',   title:'農作業 安全マニュアル',              desc:'熱中症・農薬被曝・機械事故の防止手順と緊急時対応フロー',                        thumb:'📄', pages:8,  updated:'2026-04-01' },
    { id:2,  type:'pdf',   title:'レタス収穫 作業手順書',              desc:'サイズ選別（2L／L／M）・コンテナ積み・出荷先仕分けの手順（写真付き）',          thumb:'📄', pages:5,  updated:'2026-03-15' },
    { id:3,  type:'pdf',   title:'とうもろこし 収穫・出荷手順',        desc:'収穫タイミングの見極め・袋詰め・JA／取引先A／直売別の仕分け方法',                  thumb:'📄', pages:4,  updated:'2026-05-10' },
    { id:4,  type:'pdf',   title:'農薬散布 安全マニュアル',            desc:'PPE着用・希釈倍率確認・散布後の記録記入と器具洗浄手順',                        thumb:'📄', pages:6,  updated:'2026-01-10' },
    { id:5,  type:'pdf',   title:'日報アプリ 操作ガイド（収穫記録）',  desc:'収穫記録・出荷内訳・ロット番号の入力ステップを画面キャプチャ付きで解説',        thumb:'📄', pages:7,  updated:'2026-06-01' },
    { id:6,  type:'pdf',   title:'圃場マップ 使い方ガイド',            desc:'畝の選択方法・散布区画の記録・収穫実績の確認方法',                              thumb:'📄', pages:4,  updated:'2026-06-01' },
    { id:7,  type:'video', title:'収穫記録の入力方法（動画）',          desc:'アプリを使った収穫日報の記入から保存までを動画でわかりやすく解説',               thumb:'🎬', duration:'3分20秒', updated:'2026-06-01' },
    { id:8,  type:'video', title:'農薬散布記録の入力方法（動画）',      desc:'農薬選択・散布液量・圃場指定から記録保存までの操作手順',                        thumb:'🎬', duration:'2分50秒', updated:'2026-05-20' },
  ],
  en: [
    { id:9,  type:'pdf',   title:'Farm Work Safety Manual',              desc:'Prevention and emergency procedures for heat stroke, pesticide exposure, and machinery accidents', thumb:'📄', pages:8,  updated:'2026-04-01' },
    { id:10, type:'pdf',   title:'Lettuce Harvest Procedure',             desc:'Size grading (2L/L/M), container loading, and sorting by shipping destination',                    thumb:'📄', pages:5,  updated:'2026-03-15' },
    { id:11, type:'pdf',   title:'Sweet Corn Harvest & Shipping Guide',   desc:'How to judge harvest timing, bag packing, and sorting by destination (JA / dealer_a / Direct)',     thumb:'📄', pages:4,  updated:'2026-05-10' },
    { id:12, type:'pdf',   title:'Pesticide Application Safety Manual',   desc:'PPE requirements, dilution ratios, post-spray record entry, and equipment cleaning',               thumb:'📄', pages:6,  updated:'2026-01-10' },
    { id:13, type:'pdf',   title:'App Guide: Harvest Record Entry',        desc:'Step-by-step screenshots showing how to enter harvest data, shipment breakdown, and lot numbers',  thumb:'📄', pages:7,  updated:'2026-06-01' },
    { id:14, type:'video', title:'How to Enter a Harvest Record (Video)',  desc:'Video walkthrough of filling in and saving a harvest daily report using the app',                  thumb:'🎬', duration:'3:20', updated:'2026-06-01' },
  ],
  vi: [
    { id:15, type:'pdf',   title:'Hướng dẫn an toàn lao động nông nghiệp',  desc:'Phòng tránh say nắng, tiếp xúc hóa chất nông nghiệp và tai nạn máy móc; quy trình xử lý khẩn cấp', thumb:'📄', pages:8,  updated:'2026-04-01' },
    { id:16, type:'pdf',   title:'Quy trình thu hoạch rau diếp',             desc:'Phân loại kích thước (2L/L/M), xếp thùng và phân loại theo điểm giao hàng (có ảnh minh họa)',       thumb:'📄', pages:5,  updated:'2026-03-15' },
    { id:17, type:'pdf',   title:'Quy trình thu hoạch và giao ngô ngọt',     desc:'Cách xác định thời điểm thu hoạch, đóng túi và phân loại theo JA / dealer_a / bán trực tiếp',        thumb:'📄', pages:4,  updated:'2026-05-10' },
    { id:18, type:'pdf',   title:'Hướng dẫn an toàn phun thuốc trừ sâu',    desc:'Yêu cầu PPE, tỷ lệ pha loãng, ghi chép sau khi phun và vệ sinh dụng cụ',                             thumb:'📄', pages:6,  updated:'2026-01-10' },
    { id:19, type:'pdf',   title:'Hướng dẫn ứng dụng: Nhập dữ liệu thu hoạch', desc:'Ảnh chụp màn hình từng bước nhập dữ liệu thu hoạch, chi tiết xuất hàng và mã lô',               thumb:'📄', pages:7,  updated:'2026-06-01' },
    { id:20, type:'video', title:'Cách nhập hồ sơ thu hoạch (Video)',        desc:'Video hướng dẫn điền và lưu nhật ký thu hoạch hàng ngày bằng ứng dụng',                              thumb:'🎬', duration:'3 phút 20 giây', updated:'2026-06-01' },
    { id:21, type:'video', title:'Cách nhập hồ sơ phun thuốc (Video)',       desc:'Các bước chọn thuốc, nhập lượng phun, chỉ định thửa ruộng và lưu hồ sơ',                             thumb:'🎬', duration:'2 phút 50 giây', updated:'2026-05-20' },
  ],
}

const LANG_CONFIG = [
  { key:'ja', label:'🇯🇵 日本語', badge:'JA', color:'#1A5276' },
  { key:'en', label:'🇬🇧 English', badge:'EN', color:'#117A65' },
  { key:'vi', label:'🇻🇳 Tiếng Việt', badge:'VI', color:'#B03A2E' },
]


// =====================================================
// B-1: ダッシュボード画面（完全実装）
// GAP進捗バー / アラートカード / 圃場サマリーカード / 最近の記録ログ
// =====================================================

/* --- サブコンポーネント --- */

// =====================================================
// 在庫アラートウィジェット（ダッシュボード用）
// A-1: 統計カード直下に配置
// 発注アラート閾値以下の農薬を赤バッジで一覧 / 全て余裕あり → グリーン
// =====================================================
function PesticideStockWidget({ pesticides, pesticideStock, onNavigate, _inGrid }) {
  const stockOf  = (p) => {
    const s = (pesticideStock || []).find(s => String(s.pesticide_id) === String(p.id))
    return ((s && s.stock_L != null) ? s.stock_L : p.stock_L) ?? 0
  }
  const threshOf = (p) => {
    const s = (pesticideStock || []).find(s => String(s.pesticide_id) === String(p.id))
    return ((s && s.alert_threshold_L != null) ? s.alert_threshold_L : p.alert_threshold_L) ?? 0
  }

  const alertItems = (pesticides || []).filter(p => stockOf(p) <= threshOf(p))
  const hasAlert   = alertItems.length > 0

  // ── 全在庫余裕あり ──
  if (!hasAlert) {
    return React.createElement('div', {
      style:{
        background:'#ECFDF5', border:'1px solid #A7F3D0', borderRadius:'10px',
        padding:'12px 18px', marginBottom: _inGrid ? 0 : '20px',
        display:'flex', alignItems:'center', gap:'12px', flexDirection:'column',
        justifyContent:'center',
      }
    },
      React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'10px', width:'100%' } },
        React.createElement('i', { className:'ti ti-circle-check', style:{ fontSize:'22px', color:'#0A6B52', flexShrink:0 } }),
        React.createElement('div', { style:{ flex:1 } },
          React.createElement('div', { style:{ fontSize:'13px', fontWeight:700, color:'#065F46' } }, '農薬在庫'),
          React.createElement('div', { style:{ fontSize:'12px', color:'#065F46', fontWeight:600 } }, '全て十分あります'),
          React.createElement('div', { style:{ fontSize:'11px', color:'#6B7280', marginTop:'2px' } }, '発注アラートなし')
        ),
        React.createElement('button', {
          onClick: () => onNavigate('pesticide_master'),
          style:{
            fontSize:'11px', color:'#0A6B52', background:'#fff',
            border:'1px solid #A7F3D0', borderRadius:'7px',
            padding:'5px 10px', cursor:'pointer', fontWeight:600,
            whiteSpace:'nowrap', flexShrink:0,
          }
        }, '一覧 →')
      )
    )
  }

  // ── 要発注あり ──
  return React.createElement('div', {
    style:{
      background:'#fff', border:'1px solid #FECACA', borderRadius:'10px',
      marginBottom: _inGrid ? 0 : '20px', overflow:'hidden',
    }
  },
    // ヘッダー
    React.createElement('div', {
      style:{
        background:'#FFF1F2', padding:'10px 18px',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        borderBottom:'1px solid #FECACA',
      }
    },
      React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px' } },
        React.createElement('i', { className:'ti ti-alert-triangle', style:{ fontSize:'16px', color:'#C2410C' } }),
        React.createElement('span', { style:{ fontSize:'13px', fontWeight:700, color:'#9A3412' } },
          '要発注 ' + alertItems.length + '品目'
        )
      ),
      React.createElement('button', {
        onClick: () => onNavigate('pesticide_master'),
        style:{
          fontSize:'12px', color:'#C2410C', background:'#fff',
          border:'1px solid #FECACA', borderRadius:'7px',
          padding:'5px 14px', cursor:'pointer', fontWeight:600,
          whiteSpace:'nowrap',
        }
      }, '農薬マスタへ →')
    ),
    // アラートリスト
    React.createElement('div', { style:{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:'7px' } },
      ...alertItems.map(p => {
        const stock  = stockOf(p)
        const thresh = threshOf(p)
        const isNeg  = stock < 0
        // 残量バー幅: 0〜100%（マイナスは0扱い）
        const barPct = thresh > 0 ? Math.max(0, Math.min(100, (stock / thresh) * 100)) : 0
        return React.createElement('div', {
          key: p.id,
          style:{
            display:'flex', alignItems:'center', gap:'14px',
            padding:'10px 14px', borderRadius:'9px',
            background: isNeg ? '#FFF1EE' : '#FFFBEB',
            border:'1px solid ' + (isNeg ? '#FECACA' : '#FDE68A'),
          }
        },
          React.createElement('i', {
            className:'ti ti-flask',
            style:{ fontSize:'16px', color: isNeg ? '#C2410C' : '#B45309', flexShrink:0 }
          }),
          // 農薬名 + 残量バー
          React.createElement('div', { style:{ flex:1, minWidth:0 } },
            React.createElement('div', { style:{ fontSize:'13px', fontWeight:600, color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:'5px' } },
              p.name
            ),
            React.createElement('div', { style:{ background:'#E5E7EB', borderRadius:'4px', height:'5px', overflow:'hidden' } },
              React.createElement('div', {
                style:{
                  height:'100%', borderRadius:'4px',
                  background: isNeg ? '#DC2626' : '#F59E0B',
                  width: barPct + '%',
                  transition:'width .4s ease',
                }
              })
            )
          ),
          // 残量数値
          React.createElement('div', { style:{ textAlign:'right', flexShrink:0 } },
            React.createElement('div', {
              style:{ fontSize:'15px', fontWeight:700, color: isNeg ? '#C2410C' : '#B45309', lineHeight:1.2 }
            }, stock + ' L'),
            React.createElement('div', { style:{ fontSize:'10px', color:'#9CA3AF', marginTop:'2px' } },
              '閾値 ' + thresh + ' L'
            )
          )
        )
      })
    )
  )
}

// =====================================================
// 棚卸し入力パネル（農薬マスタページ用）
// =====================================================
function InventoryCheckPanel({ pesticides, pesticideStock, onUpdateStock }) {
  // 変更した行(dirty)だけ値を持つ。未変更行は常に最新のpesticideStockへ追随して表示する。
  // 画面を開いたときのスナップショットを全行送ると、別端末の仕入れ等で進んだDB在庫を
  // 古い画面値で巻き戻してしまうため、送信は「ユーザーが触った行」に限定する。
  const [inputs, setInputs] = React.useState({})
  const inputsRef = React.useRef(inputs)
  inputsRef.current = inputs // 保存完了時に「送信時の値」と「今の値」を照合するため常に最新を持つ
  const [saved, setSaved] = React.useState(false)
  const [failCount, setFailCount] = React.useState(0)

  const stockValOf = (p) => {
    const s = pesticideStock.find(s => String(s.pesticide_id) === String(p.id))
    return String(s ? s.stock_L : 0)
  }
  const valueOf = (p) => inputs[p.id] !== undefined ? inputs[p.id] : stockValOf(p)

  // 行ごとの送信ID: 成功(ok===true)確定まで同じIDを使い回す=応答喪失→再保存でも冪等。
  // 値を変えたらIDを新しくする(同じIDだとサーバが「処理済み」として新しい値を無視するため)
  const submitIdsRef = React.useRef({})
  const savingRef = React.useRef(false)
  const [saving, setSaving] = React.useState(false)
  const savedTimerRef = React.useRef(null)
  // 保存の応答待ち中に打ち替えがあったか。あった場合は「保存しました」を出さず
  // 未保存の変更が残っていることを明示する(利用者が安心して画面を離れるのを防ぐ)
  const editedDuringSaveRef = React.useRef(false)
  const [unsavedNote, setUnsavedNote] = React.useState(false)
  const [invalidIds, setInvalidIds] = React.useState({}) // 空欄/不正値の行(在庫0で上書きせず入力を促す)
  const isValidStock = isValidStockAmount // 共有ヘルパー(config.js)。app層と同一判定で二重防御
  const handleSaveAll = async () => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    // 直前の結果表示をリセット(前回成功の「保存しました」が今回の失敗を隠さない)
    if (savedTimerRef.current) { clearTimeout(savedTimerRef.current); savedTimerRef.current = null }
    setSaved(false)
    setFailCount(0)
    setUnsavedNote(false)
    editedDuringSaveRef.current = false
    let fails = 0
    const invalidVals = {} // {id: 無効だった送信時の値}。保存中に直されたら復活させないため値も持つ
    for (const [id, val] of Object.entries(inputs)) { // 変更行のみ(未変更行は送らない=0記帳ノイズも出さない)
      if (!isValidStock(val)) { invalidVals[id] = val; continue } // 空欄/不正はRPCを呼ばず入力保持(在庫0上書き防止)
      if (!submitIdsRef.current[id]) submitIdsRef.current[id] = newUuid()
      const sentId = submitIdsRef.current[id]
      // idはUUIDのため文字列のまま渡す(Number()はNaN化して棚卸しが全滅する)
      const res = await Promise.resolve(onUpdateStock(id, Number(val), sentId)).catch(() => null)
      if (res && res.ok === true) {
        // 応答待ちの間に同じ欄へ入力されていたら、新しい値をdirtyのまま残す(黙って消さない)
        setInputs(prev => {
          if (prev[id] !== val) return prev
          const next = { ...prev }; delete next[id]; return next // 保存済み=最新在庫へ追随に戻す
        })
        if (submitIdsRef.current[id] === sentId) delete submitIdsRef.current[id]
      } else fails++
    }
    // 保存中に無効行を正しい値へ直していたら、古いエラーを復活させない(送信時の値と現在値を照合)
    const invalid = {}
    for (const [id, badVal] of Object.entries(invalidVals)) {
      if ((inputsRef.current[id] ?? '') === badVal) invalid[id] = true
    }
    setInvalidIds(invalid)
    savingRef.current = false
    setSaving(false)
    setFailCount(fails)
    // 空欄/不正が残っている間は成功表示を出さない(行単位のエラーで入力を促す)
    if (fails === 0 && Object.keys(invalid).length === 0) {
      if (editedDuringSaveRef.current) {
        setUnsavedNote(true) // 送信分は保存済みだが新しい変更が未保存=緑の成功表示は出さない
      } else {
        setSaved(true)
        savedTimerRef.current = setTimeout(() => setSaved(false), 2000)
      }
    }
  }

  const C = { green:'#0A6B52', greenL:'#E8F5F0', red:'#C2410C', redL:'#FFF1EE', border:'#E2E8E2', muted:'#9CA3AF', ink:'#111827', sub:'#4B5563' }

  return React.createElement('div', null,
    // ヘッダーバナー
    React.createElement('div', {
      style:{
        background:'#F5F3FF', border:'1px solid #DDD6FE', borderRadius:'10px',
        padding:'14px 18px', marginBottom:'16px',
        display:'flex', alignItems:'center', gap:'10px'
      }
    },
      React.createElement('i', { className:'ti ti-clipboard-check', style:{ fontSize:'20px', color:'#6D28D9' } }),
      React.createElement('div', null,
        React.createElement('div', { style:{ fontSize:'14px', fontWeight:700, color:'#4C1D95' } }, '棚卸し入力'),
        React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280', marginTop:'2px' } },
          '現在の実在庫量を確認して入力してください。「一括保存」で在庫数が更新されます。'
        )
      )
    ),
    // 農薬ごとの入力行
    React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'16px' } },
      ...pesticides.map(p => {
        const s = pesticideStock.find(s => String(s.pesticide_id) === String(p.id))
        const thresh = s ? s.alert_threshold_L : 0
        const current = Number(valueOf(p)) || 0
        const isAlertNow = current <= thresh
        // 在庫バー: 閾値を100%の基準とし、現在値の位置を可視化（農薬一覧カードと同じ視覚言語）
        const barRatio = thresh > 0
          ? Math.max(0, Math.min(100, (current / thresh) * 100))
          : (current > 0 ? 100 : 0)
        return React.createElement('div', {
          key: p.id,
          style:{
            display:'flex', flexDirection:'column', gap:'10px',
            padding:'12px 16px', background:'#fff',
            border:'1px solid ' + (isAlertNow ? '#FECACA' : C.border),
            borderRadius:'10px',
          }
        },
          React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'12px' } },
            React.createElement('div', {
              style:{
                width:'36px', height:'36px', borderRadius:'9px', flexShrink:0,
                background: isAlertNow ? '#FFF1EE' : '#E8F5F0',
                display:'flex', alignItems:'center', justifyContent:'center'
              }
            },
              React.createElement('i', { className:'ti ti-flask', style:{ fontSize:'17px', color: isAlertNow ? C.red : C.green } })
            ),
            React.createElement('div', { style:{ flex:1, minWidth:0 } },
              React.createElement('div', { style:{ fontSize:'13px', fontWeight:600, color:C.ink, marginBottom:'2px' } }, p.name),
              React.createElement('div', { style:{ fontSize:'11px', color:C.muted } }, '発注閾値: ' + thresh + ' L')
            ),
            React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px', flexShrink:0 } },
              React.createElement('input', {
                type:'number', min:'0', step:'0.1',
                value: valueOf(p),
                onChange: e => {
                  delete submitIdsRef.current[p.id] // 変更した行だけdirty化＋IDを取り直す
                  if (savingRef.current) editedDuringSaveRef.current = true // 保存中の打ち替え=完了時に未保存を明示
                  setUnsavedNote(false) // 新たに編集を始めたら注意書きは畳む(ボタンが「未保存あり」を示す)
                  if (invalidIds[p.id]) setInvalidIds(prev => { const next = { ...prev }; delete next[p.id]; return next }) // 入力し直したらエラー解除
                  setInputs(prev => ({ ...prev, [p.id]: e.target.value }))
                },
                style:{
                  width:'90px', padding:'7px 10px', borderRadius:'7px',
                  border:'1.5px solid ' + (invalidIds[p.id] ? C.red : isAlertNow ? '#FECACA' : '#D8E4D8'),
                  fontSize:'14px', fontWeight:700,
                  color: isAlertNow ? C.red : C.ink,
                  textAlign:'right', outline:'none', background:'#fff',
                }
              }),
              React.createElement('span', { style:{ fontSize:'12px', color:C.muted, width:'14px' } }, 'L'),
              isAlertNow && React.createElement('span', {
                style:{
                  fontSize:'10px', background:'#FFF1EE', color:C.red,
                  border:'1px solid #FECACA', borderRadius:'5px',
                  padding:'2px 7px', fontWeight:700,
                }
              }, '要発注')
            )
          ),
          invalidIds[p.id] && React.createElement('div', {
            style:{ fontSize:'11px', color:C.red, fontWeight:600, display:'flex', alignItems:'center', gap:'4px' }
          },
            React.createElement('i', { className:'ti ti-alert-triangle', style:{ fontSize:'12px' } }),
            '在庫量を入力してください（空欄では保存できません）'
          ),
          React.createElement('div', { style:{ background:'#EDF2ED', borderRadius:'6px', height:'6px', overflow:'hidden' } },
            React.createElement('div', {
              style:{
                height:'100%', borderRadius:'6px',
                width: barRatio + '%',
                background: isAlertNow ? C.red : C.green,
                transition:'width .25s ease',
              }
            })
          )
        )
      })
    ),
    // 一括保存ボタン
    React.createElement('div', { style:{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:'12px' } },
      saved && React.createElement('span', {
        style:{ fontSize:'13px', color:C.green, fontWeight:600, display:'flex', alignItems:'center', gap:'5px' }
      },
        React.createElement('i', { className:'ti ti-circle-check' }), '保存しました'
      ),
      failCount > 0 && !saved && React.createElement('span', {
        style:{ fontSize:'13px', color:C.red, fontWeight:600, display:'flex', alignItems:'center', gap:'5px' }
      },
        React.createElement('i', { className:'ti ti-alert-triangle' }), failCount + '件が保存できませんでした。もう一度お試しください'
      ),
      unsavedNote && React.createElement('span', {
        style:{ fontSize:'13px', color:'#B45309', fontWeight:600, display:'flex', alignItems:'center', gap:'5px' }
      },
        React.createElement('i', { className:'ti ti-alert-triangle' }), '送信した分は保存済みです。保存中に入力した変更が未保存です'
      ),
      React.createElement('button', {
        onClick: handleSaveAll,
        disabled: saving || Object.keys(inputs).length === 0, // 変更ゼロなら押せない(「保存しました」の空振り表示を出さない)
        style:{
          padding:'10px 24px', borderRadius:'8px', border:'none',
          background:C.green, color:'#fff', fontSize:'13px', fontWeight:700,
          cursor: (saving || Object.keys(inputs).length === 0) ? 'default' : 'pointer',
          opacity: (saving || Object.keys(inputs).length === 0) ? 0.55 : 1,
          display:'flex', alignItems:'center', gap:'6px',
        }
      },
        React.createElement('i', { className:'ti ti-device-floppy', style:{ fontSize:'15px' } }),
        saving ? '保存中…' : (Object.keys(inputs).length === 0 ? '変更はありません' : '在庫を一括保存')
      )
    )
  )
}

// =====================================================
// 使用履歴パネル（農薬マスタページ用）
// =====================================================
// =====================================================
// 月別使用量 簡易バーチャート（共通部品）
// 過去6ヶ月分の使用量を月単位の縦バーで表示。
// 農薬の使用履歴・肥料の使用履歴の両パネルで共用する。
// =====================================================
function MonthlyUsageBarChart({ records, unit, color }) {
  const C = { ink:'#111827', sub:'#4B5563', muted:'#9CA3AF', border:'#E2E8E2' }
  const barColor = color || '#1D4ED8'

  // 直近6ヶ月分のYM配列（古い→新しい）を生成
  const now = new Date()
  const months = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({
      ym:    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
      label: (d.getMonth() + 1) + '月',
    })
  }

  const totals = months.map(m =>
    records.filter(r => r.date && r.date.startsWith(m.ym))
           .reduce((a, r) => a + (Number(r.amount) || 0), 0)
  )
  const maxVal = Math.max(1, ...totals)

  return React.createElement('div', { style:{ marginBottom:'20px' } },
    React.createElement('div', { style:{ fontSize:'11px', fontWeight:700, color:C.muted, letterSpacing:'.06em', textTransform:'uppercase', marginBottom:'10px' } },
      '月別使用量（直近6ヶ月）'
    ),
    React.createElement('div', {
      style:{ background:'#fff', border:`1px solid ${C.border}`, borderRadius:'10px', padding:'16px 14px 10px', display:'flex', alignItems:'flex-end', gap:'10px', height:'120px' }
    },
      ...months.map((m, i) => {
        const v = totals[i]
        const h = Math.round((v / maxVal) * 78)
        return React.createElement('div', { key:m.ym, style:{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-end', height:'100%' } },
          React.createElement('div', { style:{ fontSize:'10px', fontWeight:700, color: v > 0 ? C.ink : C.muted, marginBottom:'4px' } },
            v > 0 ? (Math.round(v * 100) / 100) : ''
          ),
          React.createElement('div', {
            style:{
              width:'100%', maxWidth:'28px', minHeight:'2px',
              height: (v > 0 ? Math.max(h, 4) : 2) + 'px',
              background: v > 0 ? barColor : '#EDF2ED',
              borderRadius:'4px 4px 2px 2px',
              transition:'height .4s ease',
            }
          }),
          React.createElement('div', { style:{ fontSize:'10px', color:C.sub, fontWeight:600, marginTop:'6px' } }, m.label)
        )
      })
    )
  )
}

function PesticideHistoryPanel({ pesticides, records }) {
  const [selectedId, setSelectedId] = React.useState(
    pesticides.length > 0 ? pesticides[0].id : null
  )

  // 今月・先月の判定
  const now = new Date()
  const thisYM = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
  const lastDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastYM = lastDate.getFullYear() + '-' + String(lastDate.getMonth() + 1).padStart(2, '0')

  const sprayRecords = records
    .filter(r => r.work_type === '農薬散布' && String(r.pesticide_id) === String(selectedId))
    .sort((a, b) => b.date.localeCompare(a.date))

  const totalUsed   = sprayRecords.reduce((a, r) => a + (Number(r.amount) || 0), 0)
  const thisMonth   = sprayRecords.filter(r => r.date.startsWith(thisYM)).reduce((a, r) => a + (Number(r.amount) || 0), 0)
  const lastMonth   = sprayRecords.filter(r => r.date.startsWith(lastYM)).reduce((a, r) => a + (Number(r.amount) || 0), 0)
  const diff        = Math.round((thisMonth - lastMonth) * 100) / 100
  const diffSign    = diff > 0 ? '+' : ''

  const C = { green:'#0A6B52', blue:'#1D4ED8', blueL:'#EFF6FF', greenL:'#F0FDF4', border:'#E2E8E2', muted:'#9CA3AF', ink:'#111827', sub:'#4B5563' }

  return React.createElement('div', null,
    // 農薬セレクタ（チップ）— 横スクロール時の見切れ防止フェード付き
    React.createElement('div', { style:{ position:'relative', marginBottom:'20px' } },
      React.createElement('div', { style:{ display:'flex', gap:'8px', overflowX:'auto', paddingBottom:'4px' } },
        ...pesticides.map(p => {
          const isActiveChip = String(selectedId) === String(p.id)
          return React.createElement('button', {
            key: p.id,
            onClick: () => setSelectedId(p.id),
            style:{
              padding:'7px 16px', borderRadius:'20px', flexShrink:0, whiteSpace:'nowrap',
              border:'1.5px solid ' + (isActiveChip ? C.green : C.border),
              background: isActiveChip ? C.green : '#fff',
              color: isActiveChip ? '#fff' : C.sub,
              fontSize:'12px', fontWeight:600, cursor:'pointer',
              transition:'all .15s', fontFamily:"'Inter',sans-serif",
            }
          }, p.name)
        })
      ),
      // 左フェード
      React.createElement('div', {
        style:{
          position:'absolute', left:0, top:0, bottom:'4px', width:'20px',
          background:'linear-gradient(90deg, #fff 0%, rgba(255,255,255,0) 100%)',
          pointerEvents:'none',
        }
      }),
      // 右フェード
      React.createElement('div', {
        style:{
          position:'absolute', right:0, top:0, bottom:'4px', width:'20px',
          background:'linear-gradient(270deg, #fff 0%, rgba(255,255,255,0) 100%)',
          pointerEvents:'none',
        }
      })
    ),

    // 月次サマリーカード（3枚）
    React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px', marginBottom:'20px' } },
      // 総使用回数
      React.createElement('div', { style:{ background:C.greenL, border:'1px solid #A7F3D0', borderRadius:'10px', padding:'14px 16px' } },
        React.createElement('div', { style:{ fontSize:'11px', color:'#6B7280', marginBottom:'4px', display:'flex', alignItems:'center', gap:'4px' } },
          React.createElement('i', { className:'ti ti-repeat', style:{ fontSize:'12px' } }), '総使用回数'
        ),
        React.createElement('div', { style:{ fontSize:'24px', fontWeight:700, color:C.green } }, sprayRecords.length + ' 回')
      ),
      // 今月使用量
      React.createElement('div', { style:{ background:C.blueL, border:'1px solid #BFDBFE', borderRadius:'10px', padding:'14px 16px' } },
        React.createElement('div', { style:{ fontSize:'11px', color:'#6B7280', marginBottom:'4px', display:'flex', alignItems:'center', gap:'4px' } },
          React.createElement('i', { className:'ti ti-calendar-month', style:{ fontSize:'12px' } }), '今月使用量'
        ),
        React.createElement('div', { style:{ fontSize:'24px', fontWeight:700, color:C.blue } },
          Math.round(thisMonth * 100) / 100 + ' L'
        )
      ),
      // 先月比
      React.createElement('div', { style:{ background: diff > 0 ? '#FFF1EE' : diff < 0 ? C.greenL : '#F9FAFB', border:'1px solid ' + (diff > 0 ? '#FECACA' : diff < 0 ? '#A7F3D0' : C.border), borderRadius:'10px', padding:'14px 16px' } },
        React.createElement('div', { style:{ fontSize:'11px', color:'#6B7280', marginBottom:'4px', display:'flex', alignItems:'center', gap:'4px' } },
          React.createElement('i', { className:'ti ti-trending-up', style:{ fontSize:'12px' } }), '先月比'
        ),
        React.createElement('div', { style:{ fontSize:'24px', fontWeight:700, color: diff > 0 ? '#C2410C' : diff < 0 ? C.green : C.muted } },
          lastMonth === 0 && thisMonth === 0 ? '—' : diffSign + diff + ' L'
        )
      )
    ),

    // 月別使用量バーチャート
    React.createElement(MonthlyUsageBarChart, { records: sprayRecords, unit:'L', color: C.blue }),

    // 時系列リスト
    React.createElement('div', { style:{ fontSize:'11px', fontWeight:700, color:C.muted, letterSpacing:'.06em', textTransform:'uppercase', marginBottom:'10px' } }, '使用履歴'),
    sprayRecords.length === 0
      ? React.createElement('div', {
          style:{ padding:'40px 0', textAlign:'center', color:C.muted, fontSize:'13px', background:'#F9FAFB', borderRadius:'10px', border:'1px dashed ' + C.border }
        },
          React.createElement('i', { className:'ti ti-flask-off', style:{ fontSize:'28px', display:'block', marginBottom:'8px', color:C.border } }),
          '散布記録がありません'
        )
      : React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:'6px' } },
          ...sprayRecords.map((r) => React.createElement('div', {
            key: r.id,
            style:{
              display:'flex', alignItems:'center', gap:'12px',
              padding:'10px 14px', background:'#fff',
              border:'1px solid ' + C.border, borderRadius:'9px',
            }
          },
            React.createElement('div', {
              style:{
                width:'8px', height:'8px', borderRadius:'50%',
                background:C.green, flexShrink:0
              }
            }),
            React.createElement('div', { style:{ flex:1 } },
              React.createElement('div', { style:{ fontSize:'13px', fontWeight:600, color:C.ink } }, r.date),
              React.createElement('div', { style:{ fontSize:'11px', color:C.muted, marginTop:'2px', display:'flex', gap:'10px' } },
                React.createElement('span', null, '👤 ' + r.worker),
                r.weather && React.createElement('span', null, '☁ ' + r.weather)
              )
            ),
            React.createElement('div', { style:{ fontSize:'14px', fontWeight:700, color:C.blue, flexShrink:0 } },
              (Number(r.amount) || 0) + ' L'
            )
          ))
        )
  )
}

// =====================================================
// 在庫アラートウィジェット（ダッシュボード用）
// 発注アラート閾値以下の農薬を一覧表示
// =====================================================
function PesticideStockWidget({ pesticides, pesticideStock, onNavigate }) {
  const stockOf  = (p) => {
    const s = pesticideStock.find(s => String(s.pesticide_id) === String(p.id))
    return ((s && s.stock_L != null) ? s.stock_L : p.stock_L) ?? 0
  }
  const threshOf = (p) => {
    const s = pesticideStock.find(s => String(s.pesticide_id) === String(p.id))
    return ((s && s.alert_threshold_L != null) ? s.alert_threshold_L : p.alert_threshold_L) ?? 0
  }

  const alertItems = pesticides.filter(p => stockOf(p) <= threshOf(p))
  const hasAlert   = alertItems.length > 0
  // 緊急度が高い（閾値からの不足量が大きい）順にソート
  const sortedAlertItems = [...alertItems].sort((a, b) => (stockOf(a) - threshOf(a)) - (stockOf(b) - threshOf(b)))
  const PREVIEW_COUNT = 3
  const [showAll, setShowAll] = React.useState(false)
  const visibleItems = showAll ? sortedAlertItems : sortedAlertItems.slice(0, PREVIEW_COUNT)
  const hiddenCount  = sortedAlertItems.length - visibleItems.length

  if (!hasAlert) {
    return React.createElement('div', {
      style:{
        background:'#ECFDF5', border:'1px solid #A7F3D0', borderRadius:'10px',
        padding:'12px 16px', marginBottom:'20px',
        display:'flex', alignItems:'center', gap:'12px'
      }
    },
      React.createElement('i', { className:'ti ti-circle-check', style:{ fontSize:'20px', color:'#0A6B52' } }),
      React.createElement('div', { style:{ flex:1 } },
        React.createElement('div', { style:{ fontSize:'14px', fontWeight:600, color:'#065F46' } }, '農薬在庫は全て十分あります'),
        React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280', marginTop:'2px' } },
          '発注アラート閾値を超えている農薬はありません'
        )
      ),
      React.createElement('button', {
        onClick: () => onNavigate('pesticide_master'),
        style:{
          fontSize:'12px', color:'#0A6B52', background:'#fff',
          border:'1px solid #A7F3D0', borderRadius:'6px',
          padding:'5px 12px', cursor:'pointer', fontWeight:600,
          whiteSpace:'nowrap',
        }
      }, '在庫一覧 →')
    )
  }

  return React.createElement('div', {
    style:{
      background:'#fff', border:'1px solid #FECACA', borderRadius:'10px',
      marginBottom:'20px', overflow:'hidden'
    }
  },
    // ヘッダー
    React.createElement('div', {
      style:{
        background:'#FFF1F2', padding:'10px 16px',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        borderBottom:'1px solid #FECACA'
      }
    },
      React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px' } },
        React.createElement('i', { className:'ti ti-alert-triangle', style:{ fontSize:'16px', color:'#C2410C' } }),
        React.createElement('span', { style:{ fontSize:'13px', fontWeight:700, color:'#9A3412' } },
          '要発注 ' + alertItems.length + '品目'
        )
      ),
      React.createElement('button', {
        onClick: () => onNavigate('pesticide_master'),
        style:{
          fontSize:'12px', color:'#C2410C', background:'#fff',
          border:'1px solid #FECACA', borderRadius:'6px',
          padding:'4px 12px', cursor:'pointer', fontWeight:600,
        }
      }, '農薬マスタへ →')
    ),
    // アラートリスト
    React.createElement('div', { style:{ padding:'8px 12px', display:'flex', flexDirection:'column', gap:'6px' } },
      ...visibleItems.map(p => {
        const stock  = stockOf(p)
        const thresh = threshOf(p)
        const isNeg  = stock < 0
        return React.createElement('div', {
          key: p.id,
          style:{
            display:'flex', alignItems:'center', gap:'12px',
            padding:'8px 10px', borderRadius:'8px',
            background: isNeg ? '#FFF1EE' : '#FFFBEB',
            border:'1px solid ' + (isNeg ? '#FECACA' : '#FDE68A'),
          }
        },
          React.createElement('i', { className:'ti ti-flask', style:{ fontSize:'16px', color: isNeg ? '#C2410C' : '#B45309', flexShrink:0 } }),
          React.createElement('div', { style:{ flex:1, minWidth:0 } },
            React.createElement('div', { style:{ fontSize:'13px', fontWeight:600, color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } }, p.name),
            // 残量バー
            React.createElement('div', { style:{ marginTop:'4px', background:'#E5E7EB', borderRadius:'4px', height:'5px', overflow:'hidden' } },
              React.createElement('div', {
                style:{
                  height:'100%', borderRadius:'4px',
                  background: isNeg ? '#DC2626' : '#F59E0B',
                  width: Math.max(0, Math.min(100, thresh > 0 ? (stock / thresh) * 100 : 0)) + '%',
                  transition:'width .4s',
                }
              })
            )
          ),
          React.createElement('div', { style:{ textAlign:'right', flexShrink:0 } },
            React.createElement('div', {
              style:{
                fontSize:'14px', fontWeight:700,
                color: isNeg ? '#C2410C' : '#B45309',
              }
            }, stock + ' L'),
            React.createElement('div', { style:{ fontSize:'10px', color:'#9CA3AF' } }, '閾値 ' + thresh + ' L')
          )
        )
      }),
      // 「他N品目を表示／閉じる」トグル（プレビュー件数を超える場合のみ表示）
      sortedAlertItems.length > PREVIEW_COUNT && React.createElement('button', {
        onClick: () => setShowAll(s => !s),
        style:{
          fontSize:'12px', color:'#C2410C', background:'none',
          border:'none', borderTop:'1px solid #FEE2E2', marginTop:'2px',
          padding:'8px 4px 2px', cursor:'pointer', fontWeight:600,
          display:'flex', alignItems:'center', justifyContent:'center', gap:'4px',
        }
      },
        showAll ? '閉じる' : `他${hiddenCount}品目を表示`,
        React.createElement('i', { className: showAll ? 'ti ti-chevron-up' : 'ti ti-chevron-down', style:{ fontSize:'12px' } })
      )
    )
  )
}

// =====================================================
// 【肥料 発注アラート Step2-1】肥料版 在庫アラートウィジェット
// PesticideStockWidget をコピーし、pesticide→fertilizer / stock_L→stock_kg / L→kg に置換
// =====================================================
function FertilizerStockWidget({ fertilizers, fertilizerStock, onNavigate, _inGrid }) {
  const stockOf  = (f) => {
    const s = fertilizerStock.find(s => String(s.fertilizer_id) === String(f.id))
    return ((s && s.stock_kg != null) ? s.stock_kg : f.stock_kg) ?? 0
  }
  const threshOf = (f) => {
    const s = fertilizerStock.find(s => String(s.fertilizer_id) === String(f.id))
    return ((s && s.alert_threshold_kg != null) ? s.alert_threshold_kg : f.alert_threshold_kg) ?? 0
  }

  const alertItems = fertilizers.filter(f => stockOf(f) <= threshOf(f))
  const hasAlert   = alertItems.length > 0
  // 緊急度が高い（閾値からの不足量が大きい）順にソート
  const sortedAlertItems = [...alertItems].sort((a, b) => (stockOf(a) - threshOf(a)) - (stockOf(b) - threshOf(b)))
  const PREVIEW_COUNT = 3
  const [showAll, setShowAll] = React.useState(false)
  const visibleItems = showAll ? sortedAlertItems : sortedAlertItems.slice(0, PREVIEW_COUNT)
  const hiddenCount  = sortedAlertItems.length - visibleItems.length

  if (!hasAlert) {
    return React.createElement('div', {
      style:{
        background:'#ECFDF5', border:'1px solid #A7F3D0', borderRadius:'10px',
        padding:'12px 16px', marginBottom: _inGrid ? 0 : '20px',
        display:'flex', alignItems:'center', gap:'12px', flexDirection:'column',
        justifyContent:'center',
      }
    },
      React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'10px', width:'100%' } },
        React.createElement('i', { className:'ti ti-circle-check', style:{ fontSize:'20px', color:'#0A6B52', flexShrink:0 } }),
        React.createElement('div', { style:{ flex:1 } },
          React.createElement('div', { style:{ fontSize:'13px', fontWeight:700, color:'#065F46' } }, '肥料在庫'),
          React.createElement('div', { style:{ fontSize:'12px', color:'#065F46', fontWeight:600 } }, '全て十分あります'),
          React.createElement('div', { style:{ fontSize:'11px', color:'#6B7280', marginTop:'2px' } }, '発注アラートなし')
        ),
        React.createElement('button', {
          onClick: () => onNavigate('fertilizer_master'),
          style:{
            fontSize:'11px', color:'#0A6B52', background:'#fff',
            border:'1px solid #A7F3D0', borderRadius:'6px',
            padding:'5px 10px', cursor:'pointer', fontWeight:600,
            whiteSpace:'nowrap', flexShrink:0,
          }
        }, '一覧 →')
      )
    )
  }

  return React.createElement('div', {
    style:{
      background:'#fff', border:'1px solid #FECACA', borderRadius:'10px',
      marginBottom: _inGrid ? 0 : '20px', overflow:'hidden'
    }
  },
    // ヘッダー
    React.createElement('div', {
      style:{
        background:'#FFF1F2', padding:'10px 16px',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        borderBottom:'1px solid #FECACA'
      }
    },
      React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px' } },
        React.createElement('i', { className:'ti ti-alert-triangle', style:{ fontSize:'16px', color:'#C2410C' } }),
        React.createElement('span', { style:{ fontSize:'13px', fontWeight:700, color:'#9A3412' } },
          '要発注 ' + alertItems.length + '品目'
        )
      ),
      React.createElement('button', {
        onClick: () => onNavigate('fertilizer_master'),
        style:{
          fontSize:'12px', color:'#C2410C', background:'#fff',
          border:'1px solid #FECACA', borderRadius:'6px',
          padding:'4px 12px', cursor:'pointer', fontWeight:600,
        }
      }, '肥料マスタへ →')
    ),
    // アラートリスト
    React.createElement('div', { style:{ padding:'8px 12px', display:'flex', flexDirection:'column', gap:'6px' } },
      ...visibleItems.map(f => {
        const stock  = stockOf(f)
        const thresh = threshOf(f)
        const isNeg  = stock < 0
        return React.createElement('div', {
          key: f.id,
          style:{
            display:'flex', alignItems:'center', gap:'12px',
            padding:'8px 10px', borderRadius:'8px',
            background: isNeg ? '#FFF1EE' : '#FFFBEB',
            border:'1px solid ' + (isNeg ? '#FECACA' : '#FDE68A'),
          }
        },
          React.createElement('i', { className:'ti ti-leaf', style:{ fontSize:'16px', color: isNeg ? '#C2410C' : '#B45309', flexShrink:0 } }),
          React.createElement('div', { style:{ flex:1, minWidth:0 } },
            React.createElement('div', { style:{ fontSize:'13px', fontWeight:600, color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } }, f.name),
            // 残量バー
            React.createElement('div', { style:{ marginTop:'4px', background:'#E5E7EB', borderRadius:'4px', height:'5px', overflow:'hidden' } },
              React.createElement('div', {
                style:{
                  height:'100%', borderRadius:'4px',
                  background: isNeg ? '#DC2626' : '#F59E0B',
                  width: Math.max(0, Math.min(100, thresh > 0 ? (stock / thresh) * 100 : 0)) + '%',
                  transition:'width .4s',
                }
              })
            )
          ),
          React.createElement('div', { style:{ textAlign:'right', flexShrink:0 } },
            React.createElement('div', {
              style:{
                fontSize:'14px', fontWeight:700,
                color: isNeg ? '#C2410C' : '#B45309',
              }
            }, stock + ' kg'),
            React.createElement('div', { style:{ fontSize:'10px', color:'#9CA3AF' } }, '閾値 ' + thresh + ' kg')
          )
        )
      }),
      // 「他N品目を表示／閉じる」トグル（プレビュー件数を超える場合のみ表示）
      sortedAlertItems.length > PREVIEW_COUNT && React.createElement('button', {
        onClick: () => setShowAll(s => !s),
        style:{
          fontSize:'12px', color:'#C2410C', background:'none',
          border:'none', borderTop:'1px solid #FEE2E2', marginTop:'2px',
          padding:'8px 4px 2px', cursor:'pointer', fontWeight:600,
          display:'flex', alignItems:'center', justifyContent:'center', gap:'4px',
        }
      },
        showAll ? '閉じる' : `他${hiddenCount}品目を表示`,
        React.createElement('i', { className: showAll ? 'ti ti-chevron-up' : 'ti ti-chevron-down', style:{ fontSize:'12px' } })
      )
    )
  )
}

// GAP進捗バー（ダッシュボード用）
function GapProgressBarDashboard({ pct, _inGrid }) {
  const color  = pct >= 80 ? CONFIG.COLOR.primary : pct >= 50 ? CONFIG.COLOR.amber : '#DC2626'
  const bg     = pct >= 80 ? '#ECFDF5' : pct >= 50 ? '#FFFBEB' : '#FFF1F2'
  const border = pct >= 80 ? '#A7F3D0' : pct >= 50 ? '#FDE68A' : '#FECACA'
  const msg    = pct >= 80 ? '✓ 申請準備ができています' : pct >= 50 ? '引き続き項目をクリアしましょう' : '未完了の項目が多くあります'
  return React.createElement('div', {
    style:{ background:bg, border:'1px solid '+border, borderRadius:'12px', padding:'14px 18px', marginBottom: _inGrid ? 0 : '20px' }
  },
    React.createElement('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'baseline', fontSize:'14px', marginBottom:'8px' } },
      React.createElement('span', { style:{ color:'#374151', fontWeight:500 } }, '📋 GAP認証 進捗'),
      React.createElement('span', { style:{ color, fontWeight:700, fontSize:'18px' } }, pct + '%')
    ),
    React.createElement('div', { style:{ background:'#F4F6F9', borderRadius:'6px', height:'8px', overflow:'hidden' } },
      React.createElement('div', { style:{ height:'100%', borderRadius:'6px', background:color, width:pct+'%', transition:'width .8s ease' } })
    ),
    React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280', marginTop:'6px' } }, msg)
  )
}
// 収穫前日数アラートカード（農薬残留リスク警告）
function HarvestRiskAlertCard({ risk }) {
  const isUrgent = risk.daysToHarvest <= 7
  return React.createElement('div', {
    style:{
      background: isUrgent ? '#FFF1F2' : '#FFFBEB',
      border: '1px solid ' + (isUrgent ? '#FECACA' : '#FDE68A'),
      borderRadius:'8px', padding:'12px 16px', marginBottom:'8px',
      display:'flex', alignItems:'center', gap:'12px'
    }
  },
    React.createElement('span', { style:{ fontSize:'18px' } }, isUrgent ? '🚨' : '⚠️'),
    React.createElement('div', { style:{ flex:1 } },
      React.createElement('div', { style:{ fontSize:'14px', color: isUrgent ? '#B91C1C' : '#92400E', fontWeight:500 } },
        risk.fieldName + '（' + risk.cropName + '）の収穫まで' + risk.daysToHarvest + '日'
      ),
      React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280', marginTop:'2px' } },
        risk.pesticideName + 'の残留期間があと' + risk.daysRemaining + '日あります'
        + (risk.harvestableDateLabel ? '（' + risk.harvestableDateLabel + '〜収穫可能）' : '')
      )
    ),
    React.createElement('span', {
      className:'badge ' + (isUrgent ? 'badge-red' : 'badge-amber')
    }, '残留' + risk.daysRemaining + '日')
  )
}

// 収穫前日数アラート: 0件のときに表示するグリーンバッジ
function HarvestRiskClearBadge() {
  return React.createElement('div', {
    style:{
      background:'#ECFDF5', border:'1px solid #A7F3D0', borderRadius:'8px',
      padding:'12px 16px', marginBottom:'8px',
      display:'flex', alignItems:'center', gap:'12px'
    }
  },
    React.createElement('i', { className:'ti ti-shield-check', 'aria-hidden':'true', style:{ fontSize:'20px', color:'#0D9972', flexShrink:0 } }),
    React.createElement('div', { style:{ flex:1 } },
      React.createElement('div', { style:{ fontSize:'14px', color:'#065F46', fontWeight:500 } }, '今週の農薬リスクはありません'),
      React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280', marginTop:'2px' } }, '近日収穫予定の圃場に残留農薬の懸念はありません')
    )
  )
}

// 来年の作付提案カード（C-5: 作付計画 → 来年同時期の植え付け候補を提示）
// 「記録→来年計画」のバリューを可視化するためのダッシュボード用カード
function CropSuggestionCard({ fields, cropPlans }) {
  const nextMonth = ((new Date().getMonth() + 1) % 12) + 1 // 1-12
  const candidates = (cropPlans || []).filter(p => p.start_month === nextMonth)

  return React.createElement('div', {
    style:{ background:'#F5F3FF', border:'1px solid #DDD6FE', borderRadius:'10px', padding:'16px', marginBottom:'12px' }
  },
    React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' } },
      React.createElement('span', { style:{ fontSize:'18px' } }, '🌱'),
      React.createElement('div', { style:{ fontSize:'14px', fontWeight:600, color:'#5B21B6' } },
        '来年の' + nextMonth + '月、何を植える？'
      )
    ),
    candidates.length === 0
      ? React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280' } },
          '来月の作付記録はまだありません。記録が増えるほど来年の計画づくりが楽になります。'
        )
      : React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:'6px' } },
          ...candidates.map(c => {
            const field = masterById(fields, c.field_id)
            return React.createElement('div', {
              key: c.id,
              style:{ display:'flex', alignItems:'center', gap:'8px', background:'#FFFFFF', borderRadius:'6px', padding:'8px 10px', fontSize:'12px' }
            },
              React.createElement('span', { style:{ width:'8px', height:'8px', borderRadius:'50%', background:c.color, flexShrink:0 } }),
              React.createElement('span', { style:{ fontWeight:600, color:'#1A1F2E' } }, field ? field.name : ('圃場'+c.field_id)),
              React.createElement('span', { style:{ color:'#6B7280' } }, '→ ' + c.crop + (c.note ? '（' + c.note + '）' : '')),
              React.createElement('span', { style:{ marginLeft:'auto', color:'#6B7280' } }, c.start_month + '〜' + c.end_month + '月')
            )
          })
        ),
    React.createElement('div', { style:{ fontSize:'11px', color:'#9CA3AF', marginTop:'8px' } },
      '※ 今年の作付計画記録をもとに表示しています。記録が溜まるほど来年の提案が充実します。'
    )
  )
}

// 圃場サマリーカード
function FieldCard({ field, records }) {
  const fieldRecords = records.filter(r => String(r.field_id) === String(field.id))
  const lastRecord   = fieldRecords.length > 0 ? fieldRecords[fieldRecords.length - 1] : null
  const statusClass  = field.status === '栽培中' ? 'badge-green' : field.status === '休閑' ? 'badge-gray' : field.status === '収穫期' ? 'badge-amber' : 'badge-blue'
  // 【実装手順書 Step0】正式名称に加えて、紙日報での元表記（あれば）を併記する
  const [overrides] = useFieldNoOverrides()
  const rawLabels = getFieldRawLabels(field, overrides).filter(r => r !== field.field_no)
  return React.createElement('div', {
    style:{ background:'#FFFFFF', borderRadius:'10px', padding:'16px', position:'relative', overflow:'hidden', boxShadow:'none', border:'1px solid #D8E0DA' }
  },
    React.createElement('div', { style:{ position:'absolute', top:0, right:0, width:60, height:60, borderRadius:'0 0 0 60px', background:field.color+'12' } }),
    React.createElement('div', { style:{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'12px' } },
      React.createElement('div', null,
        React.createElement('div', { style:{ fontSize:'14px', fontWeight:600, color:'#1A1F2E' } }, field.name),
        React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280', marginTop:'2px' } }, field.crop),
        (field.field_no || rawLabels.length > 0) && React.createElement('div', {
          style:{ fontSize:'10px', color:'#94A3B8', marginTop:'3px' }
        },
          field.field_no ? `圃場番号: ${field.field_no}` : '',
          rawLabels.length > 0 ? `　元表記: ${rawLabels.join('/')}` : ''
        )
      ),
      React.createElement('span', { className:'badge '+statusClass }, field.status)
    ),
    React.createElement('div', { style:{ display:'flex', gap:'16px', marginBottom:'12px' } },
      React.createElement('div', null,
        React.createElement('div', { style:{ fontSize:'18px', fontWeight:600, color:field.color } }, field.area_are + 'a'),
        React.createElement('div', { style:{ fontSize:'10px', color:'#6B7280' } }, '面積')
      ),
      React.createElement('div', null,
        React.createElement('div', { style:{ fontSize:'18px', fontWeight:600, color:'#6B7280' } }, fieldRecords.length),
        React.createElement('div', { style:{ fontSize:'10px', color:'#6B7280' } }, '記録数')
      )
    ),
    React.createElement('div', { style:{ borderTop:'1px solid #F1F5F9', paddingTop:'10px', fontSize:'12px', color:'#6B7280' } },
      lastRecord
        ? '最終作業: ' + lastRecord.date + ' — ' + lastRecord.work_type
        : '記録なし'
    )
  )
}

// =====================================================
// 圃場サマリー — コンパクトカード（ダッシュボード用タブUI向け）
// FieldCard より情報を絞ってサイズを小さくしたバージョン
// =====================================================
function FieldCardCompact({ field, records }) {
  const fieldRecords = records.filter(r => String(r.field_id) === String(field.id))
  const lastRecord   = fieldRecords.length > 0 ? fieldRecords[fieldRecords.length - 1] : null
  const statusColor  = field.status === '栽培中' ? '#0A6B52' : field.status === '収穫期' ? '#B45309' : '#6B7280'
  const statusBg     = field.status === '栽培中' ? '#ECFDF5' : field.status === '収穫期' ? '#FFFBEB' : '#F1F5F9'
  const statusBorder = field.status === '栽培中' ? '#A7F3D0' : field.status === '収穫期' ? '#FDE68A' : '#CBD5E1'
  // 【実装手順書 Step0】元表記（紙日報の書き方）があれば小さく併記する
  const [overrides] = useFieldNoOverrides()
  const rawLabels = getFieldRawLabels(field, overrides).filter(r => r !== field.field_no)
  return React.createElement('div', {
    style:{
      background:'#FFFFFF', borderRadius:'8px', padding:'10px 12px',
      border:'1px solid #DDE8DE', boxShadow:'none',
    }
  },
    // 圃場名 + ステータスバッジ
    React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'6px' } },
      React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'6px', minWidth:0 } },
        React.createElement('span', { style:{ width:'7px', height:'7px', borderRadius:'50%', background:field.color, flexShrink:0 } }),
        React.createElement('span', { style:{ fontSize:'12px', fontWeight:700, color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } }, field.name),
      ),
      React.createElement('span', {
        style:{
          fontSize:'10px', fontWeight:600, padding:'2px 7px', borderRadius:'20px',
          background: statusBg, color: statusColor, border:'1px solid '+statusBorder,
          flexShrink:0, marginLeft:'4px',
        }
      }, field.status)
    ),
    // 作物 + 面積
    React.createElement('div', { style:{ display:'flex', alignItems:'baseline', gap:'8px', marginBottom:'5px', flexWrap:'wrap' } },
      React.createElement('span', { style:{ fontSize:'13px', fontWeight:700, color:field.color } }, field.area_are + 'a'),
      React.createElement('span', { style:{ fontSize:'11px', color:'#6B7280' } }, field.crop),
      rawLabels.length > 0 && React.createElement('span', { style:{ fontSize:'10px', color:'#94A3B8' } },
        '元表記: ' + rawLabels.join('/')
      )
    ),
    // 最終作業
    React.createElement('div', { style:{ fontSize:'10px', color:'#94A3B8', borderTop:'1px solid #F1F5F9', paddingTop:'5px' } },
      lastRecord
        ? (lastRecord.work_type || '作業') + (lastRecord.date ? ' · ' + String(lastRecord.date).slice(5) : '')  // MM-DD のみ
        : '記録なし'
    )
  )
}

// =====================================================
// 圃場サマリー タブパネル
// ステータス（全て / 栽培中 / 収穫期 / 休閑）でフィルタ
// 3列グリッド、最大表示数を超えたら「+N圃場」フッターを表示
// =====================================================
const FIELD_STATUS_TABS = [
  { key: 'all',    label: '全て'  },
  { key: '栽培中', label: '栽培中' },
  { key: '収穫期', label: '収穫期' },
  { key: '休閑',   label: '休閑'  },
]
const SUMMARY_MAX_VISIBLE = 9  // 3列 × 3行

function FieldSummaryTabPanel({ fields, records }) {
  const [activeTab, setActiveTab] = React.useState('all')
  const [showAll,   setShowAll]   = React.useState(false)

  // タブ切り替え時はリセット
  const handleTab = (key) => { setActiveTab(key); setShowAll(false) }

  const filtered = activeTab === 'all' ? fields : fields.filter(f => f.status === activeTab)
  const visible  = showAll ? filtered : filtered.slice(0, SUMMARY_MAX_VISIBLE)
  const overflow = filtered.length - SUMMARY_MAX_VISIBLE

  // タブ件数バッジ
  const countOf = (key) => key === 'all' ? fields.length : fields.filter(f => f.status === key).length

  // タブのスタイル生成
  const tabStyle = (key) => {
    const isActive = activeTab === key
    const colorMap = {
      '栽培中': { bg:'#ECFDF5', color:'#065F46', border:'#A7F3D0', activeBg:'#0A6B52', activeColor:'#fff' },
      '収穫期': { bg:'#FFFBEB', color:'#78350F', border:'#FDE68A', activeBg:'#B45309', activeColor:'#fff' },
      '休閑':   { bg:'#F1F5F9', color:'#475569', border:'#CBD5E1', activeBg:'#475569', activeColor:'#fff' },
      'all':    { bg:'#F0F4F1', color:'#374151', border:'#DDE8DE', activeBg:'#0A6B52', activeColor:'#fff' },
    }
    const c = colorMap[key] || colorMap['all']
    return {
      padding:'4px 11px', borderRadius:'20px', fontSize:'11px', fontWeight:600,
      cursor:'pointer', border:'1px solid', transition:'all .12s',
      background: isActive ? c.activeBg : c.bg,
      color:       isActive ? c.activeColor : c.color,
      borderColor: isActive ? c.activeBg : c.border,
    }
  }

  return React.createElement('div', {
    style:{ background:'#FFFFFF', border:'1px solid #DDE8DE', borderRadius:'10px', overflow:'hidden' }
  },
    // ヘッダー: タイトル + タブ
    React.createElement('div', {
      style:{ padding:'12px 14px', borderBottom:'1px solid #EDF2ED', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'8px' }
    },
      React.createElement('span', { style:{ fontSize:'11px', fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'.06em' } },
        '圃場サマリー'
      ),
      React.createElement('div', { style:{ display:'flex', gap:'4px', flexWrap:'wrap' } },
        ...FIELD_STATUS_TABS.map(tab =>
          React.createElement('button', {
            key: tab.key,
            onClick: () => handleTab(tab.key),
            style: tabStyle(tab.key),
          },
            tab.label,
            React.createElement('span', { style:{ marginLeft:'4px', opacity:.7, fontSize:'10px' } }, countOf(tab.key))
          )
        )
      )
    ),

    // グリッド
    React.createElement('div', {
      style:{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'8px', padding:'12px 14px' }
    },
      filtered.length === 0
        ? React.createElement('div', {
            style:{ gridColumn:'1 / -1', padding:'20px 0', textAlign:'center', fontSize:'13px', color:'#94A3B8' }
          }, 'このステータスの圃場はありません')
        : visible.map(f => React.createElement(FieldCardCompact, { key:f.id, field:f, records }))
    ),

    // フッター: +N件 / 閉じる
    !showAll && overflow > 0 && React.createElement('button', {
      onClick: () => setShowAll(true),
      style:{
        width:'100%', padding:'9px', background:'#F8FAF8',
        border:'none', borderTop:'1px solid #EDF2ED',
        fontSize:'11px', color:'#0A6B52', fontWeight:600,
        cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'5px',
      }
    },
      React.createElement('i', { className:'ti ti-chevron-down', style:{ fontSize:'13px' } }),
      '+ ' + overflow + '圃場をすべて表示'
    ),
    showAll && filtered.length > SUMMARY_MAX_VISIBLE && React.createElement('button', {
      onClick: () => setShowAll(false),
      style:{
        width:'100%', padding:'9px', background:'#F8FAF8',
        border:'none', borderTop:'1px solid #EDF2ED',
        fontSize:'11px', color:'#64748B', fontWeight:600,
        cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'5px',
      }
    },
      React.createElement('i', { className:'ti ti-chevron-up', style:{ fontSize:'13px' } }),
      '折りたたむ'
    )
  )
}

// 記録ログ行
function RecordLogRow({ record, fields }) {
  const field = masterById(fields, record.field_id)
  const cfg = WORK_ICON_MAP[record.work_type] || WORK_ICON_MAP['その他']
  return React.createElement('div', {
    style:{ display:'flex', alignItems:'center', gap:'12px', padding:'10px 0', borderBottom:'1px solid #F1F5F9' }
  },
    React.createElement('div', {
      style:{ width:32, height:32, borderRadius:'50%', background:cfg.color, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }
    },
      React.createElement('i', { className:'ti ti-'+cfg.icon, 'aria-hidden':'true', style:{ fontSize:'16px', color:'#FFFFFF' } })
    ),
    React.createElement('div', { style:{ flex:1, minWidth:0 } },
      React.createElement('div', { style:{ fontSize:'14px', color:'#374151', fontWeight:600 } }, record.work_type + (field ? ' — ' + field.name : '')),
      React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280', marginTop:'2px' } }, record.date + (record.worker ? ' · ' + record.worker : ''))
    ),
    field && React.createElement('div', { style:{ width:8, height:8, borderRadius:'50%', background:field.color, flexShrink:0 } })
  )
}

// =====================================================
// 最近の作業記録パネル（折りたたみ対応）
// ダッシュボード「今日の作業配置」右側に並べる
// =====================================================
function RecentRecordsPanel({ records, fields, onSelectRecord, embedded, selectedId, lotSprayRecords, topDressingRecords, harvestRecords, onNavigate }) {
  const [open, setOpen] = React.useState(true)
  const [showPast, setShowPast] = React.useState(false)

  // 【A案】本日の作業記録を主役に（0時で自動リセット・記録で増える）＋過去も辿れる
  // 基本日報だけでなく 農薬散布/施肥/収穫（リッチ記録）も横断して数える＝現場の最重要作業を取りこぼさない。
  // 基本日報＝編集モーダルを開く / リッチ記録＝該当圃場の詳細へ（読み取り導線）。
  const today = todayYmd()
  const items = []
  ;(records || []).forEach(r => items.push({ key:'d'+r.id, kind:'daily', id:r.id, work_type:r.work_type || '作業', field_id:r.field_id, date:r.date, sub:r.worker || '', raw:r }))
  ;(lotSprayRecords || []).forEach(r => items.push({ key:'s'+r.id, kind:'spray', id:r.id, work_type:'農薬散布', field_id:r.field_id, date:r.date, sub:r.row_range ? ('畝 '+r.row_range) : '', tab:'pesticide' }))
  ;(topDressingRecords || []).forEach(r => items.push({ key:'f'+r.id, kind:'fert', id:r.id, work_type:'施肥', field_id:r.field_id, date:r.date, sub:r.row_range ? ('畝 '+r.row_range) : '', tab:'dashboard' }))
  ;(harvestRecords || []).forEach(r => items.push({ key:'h'+r.id, kind:'harvest', id:r.id, work_type:'収穫', field_id:r.field_id, date:r.date, sub:(r.total_cases != null ? (r.total_cases+'ケース') : ''), tab:'harvest' }))
  // 日付降順→id降順（新しい記録が上）
  items.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (Number(b.id) || 0) - (Number(a.id) || 0))
  const todayRecs = items.filter(r => r.date === today)
  const pastRecs  = items.filter(r => r.date !== today).slice(0, 10)

  const handleRowClick = (it) => {
    if (it.kind === 'daily') { onSelectRecord && onSelectRecord(it.raw); return }
    // リッチ記録（農薬/施肥/収穫）は基本日報用の編集モーダルに載らないため、該当圃場の詳細へ遷移
    if (onNavigate && it.field_id != null) onNavigate('field:' + it.field_id + ':' + (it.tab || 'dashboard'))
  }

  // 1行の描画（本日／過去で共用）
  const renderRow = (it, isLast) => {
    const field = masterById(fields, it.field_id)
    const cfg = WORK_ICON_MAP[it.work_type] || WORK_ICON_MAP['その他']
    const isSel = selectedId != null && it.kind === 'daily' && it.id === selectedId
    return React.createElement('div', {
      key: it.key,
      onClick: () => handleRowClick(it),
      style: {
        display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 16px',
        borderBottom: isLast ? 'none' : '1px solid #F1F5F9', cursor: 'pointer', transition: 'background .1s',
        background: isSel ? '#ECFDF5' : 'transparent', boxShadow: isSel ? 'inset 3px 0 0 #0A6B52' : 'none',
      },
      onMouseEnter: e => { if (!isSel) e.currentTarget.style.background = '#F8FAF8' },
      onMouseLeave: e => { e.currentTarget.style.background = isSel ? '#ECFDF5' : 'transparent' },
    },
      React.createElement('div', { style: { width: 28, height: 28, borderRadius: '50%', background: cfg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 } },
        React.createElement('i', { className: 'ti ti-' + cfg.icon, style: { fontSize: '13px', color: '#fff' } })
      ),
      React.createElement('div', { style: { flex: 1, minWidth: 0 } },
        React.createElement('div', { style: { fontSize: '13px', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, it.work_type + (field ? ' — ' + field.name : '')),
        React.createElement('div', { style: { fontSize: '11px', color: '#94A3B8', marginTop: '1px' } }, it.date + (it.sub ? ' · ' + it.sub : ''))
      ),
      field && React.createElement('div', { style: { width: 7, height: 7, borderRadius: '50%', background: field.color || '#0A6B52', flexShrink: 0 } })
    )
  }

  return React.createElement('div', {
    className: embedded ? '' : 'card',
    style: { padding: '0', overflow: 'hidden', width: '100%',
      background: embedded ? 'transparent' : undefined, border: embedded ? 'none' : undefined, boxShadow: embedded ? 'none' : undefined, transition: 'all .2s' }
  },
    // ── ヘッダー（クリックで折りたたみ） ──
    React.createElement('div', {
      onClick: () => setOpen(o => !o),
      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px', borderBottom: open ? '1px solid #E8EEE8' : 'none', background: '#F8FAF8', cursor: 'pointer', userSelect: 'none' }
    },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '7px' } },
        React.createElement('i', { className: 'ti ti-clipboard-text', 'aria-hidden':'true', style: { fontSize: '16px', color: '#0A6B52' } }),
        React.createElement('span', { style: { fontSize: '13px', fontWeight: 700, color: '#111827' } }, '本日の作業記録'),
        React.createElement('span', { style: { fontSize: '10px', fontWeight: 600, padding: '1px 7px', borderRadius: '20px', background: '#E0F2FE', color: '#0369A1', border: '1px solid #BAE6FD' } }, todayRecs.length + '件')
      ),
      React.createElement('div', { style: { fontSize: '11px', color: '#94A3B8', fontWeight: 700, transition: 'transform .22s cubic-bezier(.4,0,.2,1)', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', lineHeight: 1 } }, '▼')
    ),

    // ── 本体（なめらかな折りたたみ） ──
    React.createElement('div', { className: 'smooth-collapse-wrap' + (open ? ' open' : '') },
      React.createElement('div', { className: 'smooth-collapse-inner' },
        // 本日の記録
        todayRecs.length === 0
          ? React.createElement('div', { style: { padding: '20px 16px', fontSize: '13px', color: '#9CA3AF', textAlign: 'center', lineHeight: 1.6 } },
              '本日の作業記録はまだありません', React.createElement('br', null),
              React.createElement('span', { style: { fontSize: '11px' } }, '日報を入力すると、ここに当日の記録が溜まります'))
          : React.createElement('div', { style: { padding: '4px 0' } },
              todayRecs.map((r, idx) => renderRow(r, idx === todayRecs.length - 1))
            ),
        // 過去の記録も見る（トグル）
        pastRecs.length > 0 && React.createElement('div', {
          onClick: () => setShowPast(s => !s),
          style: { padding: '9px 16px', borderTop: '1px solid #F1F5F9', fontSize: '12px', fontWeight: 600, color: '#0A6B52', cursor: 'pointer', textAlign: 'center', background: '#FAFBFA' }
        }, showPast ? '▲ 過去の記録を閉じる' : '▼ 過去の記録も見る（' + pastRecs.length + '件）'),
        (showPast && pastRecs.length > 0) && React.createElement('div', { style: { padding: '4px 0', background: '#FCFDFC' } },
          React.createElement('div', { style: { fontSize: '10px', fontWeight: 700, color: '#94A3B8', padding: '4px 16px 2px', letterSpacing: '.04em' } }, '過去の記録'),
          pastRecs.map((r, idx) => renderRow(r, idx === pastRecs.length - 1))
        )
      ) // end smooth-collapse-inner
    ) // end smooth-collapse-wrap
  )
}

// =====================================================
// 今日やることリスト — ダッシュボード専用コンポーネント
// 「今日 どの畑で 誰が 何をする」が1秒でわかる
// =====================================================
const TASK_PRIORITY_MAP = {
  high:   { label:'重要', bg:'#FEF2F2', border:'#FECACA', dot:'#EF4444', text:'#DC2626' },
  medium: { label:'通常', bg:'#FFFBEB', border:'#FDE68A', dot:'#F59E0B', text:'#B45309' },
  low:    { label:'低',   bg:'#F0F9FF', border:'#BAE6FD', dot:'#38BDF8', text:'#0369A1' },
}
function TodayTaskList({ tasks, fields, staff, onToggle, onAdd, onOpenRecord }) {
  const sorted    = [...tasks].sort((a, b) => a.time.localeCompare(b.time))
  const doneCount = tasks.filter(t => t.done).length

  // UX-03: インライン追加フォームの state
  const [showForm,  setShowForm]  = React.useState(false)
  const [formField, setFormField] = React.useState(fields[0]?.id ?? '')
  const [formWork,  setFormWork]  = React.useState('農薬散布')
  const [formTime,  setFormTime]  = React.useState('08:00')
  const [formWorker,setFormWorker]= React.useState(staff[0]?.name ?? '')
  const [formPrio,  setFormPrio]  = React.useState('medium')

  const handleAdd = () => {
    if (!formField || !formWork || !formTime || !formWorker) return
    onAdd({
      id:        Date.now(),
      field_id:  Number(formField),
      work_type: formWork,
      time:      formTime,
      worker:    formWorker,
      priority:  formPrio,
      done:      false,
    })
    setShowForm(false)
    setFormWork('農薬散布')
    setFormTime('08:00')
  }

  // フォーム用スタイル定数
  const inputStyle = {
    background:'#FFFFFF', border:'1.5px solid #D8E4D8',
    borderRadius:'7px', padding:'7px 10px', fontSize:'13px',
    color:'#111827', outline:'none', width:'100%'
  }
  const labelStyle = { fontSize:'10px', fontWeight:700, color:'#6B7280',
    letterSpacing:'.05em', textTransform:'uppercase', marginBottom:'4px', display:'block' }

  return React.createElement('div', { className:'card', style:{ padding:'0', overflow:'hidden' } },

    // ヘッダー
    React.createElement('div', {
      style:{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'14px 18px 10px',
        borderBottom:'1px solid #E8EEE8',
        background:'#F8FAF8'
      }
    },
      React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px' } },
        React.createElement('span', { style:{ fontSize:'16px' } }, '📋'),
        React.createElement('span', {
          style:{ fontSize:'14px', fontWeight:700, color:'#111827', letterSpacing:'.01em' }
        }, '今日の作業配置'),
        React.createElement('span', {
          style:{
            fontSize:'10px', fontWeight:600, padding:'2px 8px', borderRadius:'20px',
            background: doneCount === tasks.length ? '#D1FAE5' : '#FEF3C7',
            color:      doneCount === tasks.length ? '#065F46' : '#92400E',
            border:     '1px solid ' + (doneCount === tasks.length ? '#A7F3D0' : '#FDE68A')
          }
        }, doneCount + '/' + tasks.length + ' 完了')
      ),
      // ヘッダー右側：日付 + タスク追加ボタン（モーダル起動）
      React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'10px' } },
        React.createElement('span', { style:{ fontSize:'12px', color:'#94A3B8' } },
          '本日 ' + new Date().toLocaleDateString('ja-JP', { month:'long', day:'numeric' })
        ),
        React.createElement('button', {
          onClick: () => setShowForm(true),
          style:{
            display:'flex', alignItems:'center', gap:'5px',
            fontSize:'12px', fontWeight:600, padding:'5px 12px',
            borderRadius:'7px', cursor:'pointer', border:'none',
            background:'#0A6B52', color:'#FFFFFF',
            boxShadow:'0 1px 4px rgba(10,107,82,.25)',
            transition:'all .15s'
          }
        },
          React.createElement('i', { className:'ti ti-plus', 'aria-hidden':'true', style:{ fontSize:'14px' } }),
          'タスク追加'
        )
      )
    ),

    // タスク追加モーダル
    showForm && React.createElement('div', {
      style:{ position:'fixed', inset:0, background:'rgba(17,24,39,.45)', zIndex:3100, display:'flex', alignItems:'center', justifyContent:'center' },
      onClick: () => setShowForm(false)
    },
      React.createElement('div', {
        style:{ background:'#FFFFFF', borderRadius:'12px', padding:'28px', width:'480px', maxWidth:'95vw', boxShadow:'0 20px 60px rgba(0,0,0,.22)', animation:'fadeInDown .18s ease' },
        onClick: e => e.stopPropagation()
      },
        // モーダルヘッダー
        React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'20px' } },
          React.createElement('div', { style:{ fontSize:'15px', fontWeight:700, color:'#111827' } }, '+ タスクを追加'),
          React.createElement('button', {
            onClick: () => setShowForm(false),
            style:{ background:'none', border:'none', cursor:'pointer', fontSize:'20px', color:'#9CA3AF', lineHeight:1, padding:'4px' }
          }, '✕')
        ),
        // フォーム内容
        React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'14px' } },
          React.createElement('div', null,
            React.createElement('label', { style: labelStyle }, '圃場'),
            React.createElement(FieldSearchSelect, { fields, value: formField, onChange: setFormField })
          ),
          React.createElement('div', null,
            React.createElement('label', { style: labelStyle }, '作業種別'),
            React.createElement('select', { value: formWork, onChange: e => setFormWork(e.target.value), style: inputStyle },
              Object.keys(WORK_ICON_MAP).map(w => React.createElement('option', { key:w, value:w }, w))
            )
          ),
          React.createElement('div', null,
            React.createElement('label', { style: labelStyle }, '開始時刻'),
            React.createElement('input', { type:'time', value:formTime, onChange: e => setFormTime(e.target.value), style: inputStyle })
          ),
          React.createElement('div', null,
            React.createElement('label', { style: labelStyle }, '担当者'),
            React.createElement('select', { value: formWorker, onChange: e => setFormWorker(e.target.value), style: inputStyle },
              (staff || []).map(s => React.createElement('option', { key:s.id, value:s.name }, s.name))
            )
          )
        ),
        // 優先度
        React.createElement('div', { style:{ marginBottom:'20px' } },
          React.createElement('label', { style: labelStyle }, '優先度'),
          React.createElement('div', { style:{ display:'flex', gap:'8px' } },
            [['high','重要','#DC2626','#FEF2F2'],['medium','通常','#B45309','#FFFBEB'],['low','低','#0369A1','#F0F9FF']].map(([val, lbl, clr, bg]) =>
              React.createElement('button', {
                key: val, onClick: () => setFormPrio(val),
                style:{
                  flex:1, padding:'8px 0', borderRadius:'7px', cursor:'pointer', border:'1.5px solid',
                  fontSize:'12px', fontWeight:600,
                  borderColor: formPrio === val ? clr : '#E2E8F0',
                  background:  formPrio === val ? bg  : '#FFFFFF',
                  color:       formPrio === val ? clr : '#94A3B8',
                  transition:  'all .12s'
                }
              }, lbl)
            )
          )
        ),
        // ボタン群
        React.createElement('div', { style:{ display:'flex', gap:'10px' } },
          React.createElement('button', {
            onClick: () => setShowForm(false),
            style:{ flex:1, padding:'10px', borderRadius:'8px', border:'1px solid #D1D5DB', background:'#fff', color:'#374151', fontSize:'13px', fontWeight:600, cursor:'pointer' }
          }, 'キャンセル'),
          React.createElement('button', {
            onClick: handleAdd,
            disabled: !formField || !formWork || !formTime || !formWorker,
            style:{
              flex:2, display:'flex', alignItems:'center', justifyContent:'center', gap:'6px',
              fontSize:'13px', fontWeight:700, padding:'10px',
              borderRadius:'8px', cursor:'pointer', border:'none',
              background: (!formField || !formWork || !formTime || !formWorker) ? '#D1D5DB' : '#0A6B52',
              color:'#FFFFFF', boxShadow:'0 2px 6px rgba(10,107,82,.25)', transition:'opacity .12s'
            }
          },
            React.createElement('i', { className:'ti ti-check', style:{ fontSize:'15px' } }),
            'タスクを追加'
          )
        )
      )
    ),

    // タスク一覧
    React.createElement('div', { style:{ padding:'8px 0' } },
      sorted.map((task, idx) => {
        const field    = masterById(fields, task.field_id)
        const prio     = TASK_PRIORITY_MAP[task.priority] || TASK_PRIORITY_MAP.medium
        const cfg      = WORK_ICON_MAP[task.work_type] || WORK_ICON_MAP['その他']
        const isLast   = idx === sorted.length - 1

        return React.createElement('div', {
          key: task.id,
          style:{
            display:'flex', alignItems:'center', gap:'12px',
            padding:'10px 18px',
            borderBottom: isLast ? 'none' : '1px solid #F0F4F0',
            background: task.done ? '#F9FBF9' : '#FFFFFF',
            opacity: task.done ? 0.7 : 1,
            transition:'background .15s, opacity .15s',
            position:'relative',
          }
        },
          // 時刻バッジ
          React.createElement('div', {
            style:{
              fontSize:'11px', fontWeight:700, color:'#374151',
              background:'#F1F5F9', border:'1px solid #E2E8F0',
              borderRadius:'6px', padding:'3px 7px',
              minWidth:'46px', textAlign:'center', flexShrink:0
            }
          }, task.time),

          // 優先度ドット
          React.createElement('div', {
            style:{
              width:'8px', height:'8px', borderRadius:'50%',
              background: prio.dot, flexShrink:0,
              boxShadow: '0 0 0 3px ' + prio.dot + '30'
            }
          }),

          // 作業アイコン + 内容（クリックで日報入力モーダル）
          React.createElement('div', {
            onClick: () => !task.done && onOpenRecord && onOpenRecord(task),
            style:{
              flex:1, minWidth:0,
              cursor: task.done ? 'default' : 'pointer',
            }
          },
            React.createElement('div', {
              style:{
                display:'flex', alignItems:'center', gap:'6px',
                fontSize:'14px', fontWeight: task.done ? 400 : 600,
                color: task.done ? '#94A3B8' : '#111827',
                textDecoration: task.done ? 'line-through' : 'none'
              }
            },
              React.createElement('div', {
                style:{ width:24, height:24, borderRadius:'50%', background:cfg.color, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }
              },
                React.createElement('i', { className:'ti ti-'+cfg.icon, 'aria-hidden':'true', style:{ fontSize:'14px', color:'#FFFFFF' } })
              ),
              React.createElement('span', null, task.work_type),
              !task.done && React.createElement('span', {
                style:{ fontSize:'10px', color:'#0A6B52', background:'#ECFDF5', border:'1px solid #A7F3D0', borderRadius:'4px', padding:'1px 6px', fontWeight:600, marginLeft:'2px' }
              }, '日報入力 →')
            ),
            React.createElement('div', {
              style:{ fontSize:'12px', color:'#64748B', marginTop:'2px', display:'flex', alignItems:'center', gap:'8px' }
            },
              field && React.createElement('span', {
                style:{
                  display:'inline-flex', alignItems:'center', gap:'3px',
                  background: (field.color || CONFIG.COLOR.primary) + '18',
                  color:       field.color || CONFIG.COLOR.primary,
                  border:     '1px solid ' + (field.color || CONFIG.COLOR.primary) + '40',
                  borderRadius:'4px', padding:'1px 6px', fontSize:'10px', fontWeight:600
                }
              }, '📍 ' + field.name),
              React.createElement('span', { style:{ color:'#94A3B8' } }, '👤 ' + task.worker)
            )
          ),

          // 完了チェック（単独クリック可）
          React.createElement('div', {
            onClick: e => { e.stopPropagation(); onToggle(task.id) },
            style:{
              width:'22px', height:'22px', borderRadius:'50%', flexShrink:0,
              border: task.done ? 'none' : '2px solid #D1D5DB',
              background: task.done ? CONFIG.COLOR.primary : 'transparent',
              display:'flex', alignItems:'center', justifyContent:'center',
              transition:'all .2s', cursor:'pointer',
            }
          }, task.done && React.createElement('span', { style:{ color:'#fff', fontSize:'12px', fontWeight:700 } }, '✓'))
        )
      })
    ),

    // フッター（全完了時メッセージ）
    doneCount === tasks.length && tasks.length > 0 && React.createElement('div', {
      style:{
        padding:'10px 18px', borderTop:'1px solid #D1FAE5',
        background:'#ECFDF5', fontSize:'12px', color:'#065F46',
        fontWeight:500, textAlign:'center'
      }
    }, '🎉 本日の作業配置がすべて完了しました！')
  )
}

// ダッシュボード本体
function Dashboard({ fields, records, staff, gap, todayTasks, onToggleTodayTask, onAddTodayTask, cropPlans, pesticides, pesticideStock, fertilizers, fertilizerStock, lotSprayRecords, maintenanceRecords, gapCtx, onNavigate, onSaveRecord, onUpdateRecord, onDeleteRecord }) {
  // 機械整備アラート: 要対応の記録、または直近60日整備記録なし（GAP機械点検の忘れ防止）
  const _maint = maintenanceRecords || []
  const _maintPending = _maint.filter(m => m.result === '要対応')
  const _maintLast = _maint.map(m => m.date).filter(Boolean).sort().slice(-1)[0] || null
  const _maintOverdue = !_maintLast || (Math.round((Date.now() - new Date(_maintLast)) / 86400000) > 60)
  // 整合性チェック（突合せ）: 記録の食い違い・入力ミスの要対応/要確認件数をダッシュボードで気づけるように。
  // データが年々増えても毎レンダーで再計算しないようメモ化（gapCtx内の配列参照は状態更新時のみ変化）。
  const _integrity = React.useMemo(() => {
    try { return runFarmIntegrityChecks(Object.assign({}, gapCtx, { fields })) } catch (e) { return [] }
  }, [gapCtx.records, gapCtx.lotSprayRecords, gapCtx.topDressingRecords, gapCtx.harvestRecords, gapCtx.shipmentRecords, gapCtx.farmLots, fields, gapCtx.pesticides, gapCtx.pesticidePurchases])
  const _integHigh = _integrity.filter(f => f.severity === 'high').length
  const _integMid  = _integrity.filter(f => f.severity === 'mid').length
  // --- 集計 ---
  const gapPct     = gap.length > 0 ? Math.round(gap.filter(c => c.is_cleared || isGapAutoCleared(c, gapCtx)).length / gap.length * 100) : 0
  const harvestRisks = calcHarvestRisk(records, cropPlans || [], pesticides || [], fields)
  const totalArea  = fields.reduce((a, f) => a + f.area_are, 0)
  const activeF    = fields.filter(f => f.status === '栽培中').length
  const recent     = [...records].reverse().slice(0, 5)
  const today      = new Date().toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric', weekday:'short' })

  // タスクから日報入力モーダルを開くための state
  const [activeTask, setActiveTask] = React.useState(null)
  // 作業記録詳細モーダル用 state
  const [selectedRecord, setSelectedRecord] = React.useState(null)
  // 【UX】最近の作業記録を右上の通知ベル→ポップアップで表示
  const [showRecentPopup, setShowRecentPopup] = React.useState(false)
  // バッジ＝本日の作業記録件数（0時で自動リセット。記録が入ると増える）
  // 基本日報＋農薬散布＋施肥＋収穫の4種を横断（スタッフ画面の「今日N件」と同じ数え方）。
  const _todayY = todayYmd()
  const _todayFert    = (gapCtx.topDressingRecords || []).filter(r => r.date === _todayY).length
  const _todayHarvest = (gapCtx.harvestRecords || []).filter(r => r.date === _todayY).length
  const _todaySpray   = (lotSprayRecords || []).filter(r => r.date === _todayY).length
  const _todayDaily   = (records || []).filter(r => r.date === _todayY).length
  const todayRecordCount = _todayDaily + _todaySpray + _todayFert + _todayHarvest

  // --- 先月比計算ヘルパー ---
  const now = new Date()
  const thisMonthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthKey  = lastMonthDate.getFullYear() + '-' + String(lastMonthDate.getMonth() + 1).padStart(2, '0')
  const thisMonthRecords = records.filter(r => (r.date || '').slice(0, 7) === thisMonthKey)
  const lastMonthRecords = records.filter(r => (r.date || '').slice(0, 7) === lastMonthKey)
  // 作業記録件数の先月比
  const recordsDiff = records.length > 0
    ? thisMonthRecords.length - lastMonthRecords.length
    : null

  // ── 圃場が1件もない場合はオンボーディング画面を表示 ──
  if (fields.length === 0) {
    const steps = [
      { icon:'plant-2', title:'作物カテゴリを確認・設定', desc:'葉物野菜・とうもろこし・水稲など、農場で扱う作物の種類と管理方式を設定します。', page:'crop_categories', btn:'カテゴリ管理へ' },
      { icon:'map-pin',  title:'圃場を登録する',           desc:'管理する圃場を1筆ずつ登録します。地図上でピンを立てると面積・位置情報も記録できます。', page:'fields',          btn:'圃場一覧へ'   },
      { icon:'clipboard-text', title:'作業記録を入力する', desc:'農薬散布・施肥・収穫などの日次作業を記録します。記録が積み上がるとダッシュボードに集計されます。', page:'daily_work', btn:'作業入力へ' },
      { icon:'chart-bar', title:'収穫実績を確認する',      desc:'収穫記録が入力されると、反収・前年比などのKPIが自動集計されます。', page:'field_performance', btn:'実績ページへ' },
    ]
    return React.createElement('div', { className:'page' },
      React.createElement('div', { className:'eyebrow' }, 'FARM OVERVIEW'),
      React.createElement('div', { className:'page-title' }, 'ダッシュボード'),
      React.createElement('div', { className:'page-sub' }, today),

      // ウェルカムヒーロー
      React.createElement('div', { style:{
        background:'linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%)',
        border:'1.5px solid #A7F3D0', borderRadius:14, padding:'32px 36px', marginBottom:28,
        display:'flex', alignItems:'center', gap:24,
      } },
        React.createElement('i', { className:'ti ti-plant-2', 'aria-hidden':'true', style:{ fontSize:52, lineHeight:1, color:'#0D9972', flexShrink:0 } }),
        React.createElement('div', { style:{ flex:1 } },
          React.createElement('div', { style:{ fontSize:20, fontWeight:800, color:'#065F46', marginBottom:6 } }, 'ようこそ！農場管理を始めましょう'),
          React.createElement('div', { style:{ fontSize:14, color:'#047857', lineHeight:1.7, marginBottom:14 } },
            '圃場の登録から始めると、作業記録・農薬管理・収穫実績の自動集計まで一元管理できます。',
            React.createElement('br', null),
            '下のステップを順番に進めてください。'
          ),
          // 【デモ】1から入力せずに試せるよう、デモデータ(20圃場・記録・履歴)をワンクリック投入。?demoで自動seed。
          React.createElement('div', { style:{ display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center' } },
            React.createElement('button', {
              onClick: () => { if (window.confirm('デモデータ（20圃場・作業記録60件・散布/収穫履歴・農薬/肥料マスタ・スタッフ等）を投入します。今の農場の入力内容は上書きされます。よろしいですか？')) { window.location.href = window.location.pathname + '?demo'; } },
              style:{ display:'inline-flex', alignItems:'center', gap:'6px', padding:'10px 18px', background:'#0A6B52', color:'#fff', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:700, cursor:'pointer' }
            },
              React.createElement('i', { className:'ti ti-database-import', 'aria-hidden':'true', style:{ fontSize:'15px' } }),
              'デモデータで試す（ワンクリック投入）'
            ),
            React.createElement('span', { style:{ fontSize:'11px', color:'#6B7280' } }, '※ 後で「まっさら」に戻すには URL に ?reset を付けて開きます')
          )
        )
      ),

      // ステップカード
      React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:14 } },
        steps.map((s, i) => React.createElement('div', {
          key: s.page,
          style:{ background:'#fff', border:'1.5px solid #E2E8E2', borderRadius:10, padding:20, display:'flex', flexDirection:'column', gap:12 }
        },
          React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:10 } },
            React.createElement('div', { style:{
              width:36, height:36, borderRadius:'50%', background:'#F0F8F4',
              display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0
            } },
              React.createElement('i', { className:'ti ti-' + s.icon, style:{ fontSize:18, color:'#0A6B52' } })
            ),
            React.createElement('div', { style:{ fontSize:11, fontWeight:700, color:'#6B7280', letterSpacing:'.08em' } }, 'STEP ' + (i+1))
          ),
          React.createElement('div', { style:{ fontWeight:700, fontSize:14, color:'#111827' } }, s.title),
          React.createElement('div', { style:{ fontSize:12, color:'#6B7280', lineHeight:1.6, flex:1 } }, s.desc),
          React.createElement('button', {
            onClick: () => onNavigate && onNavigate(s.page),
            style:{
              padding:'7px 0', background:'#0A6B52', color:'#fff', border:'none',
              borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer', display:'flex',
              alignItems:'center', justifyContent:'center', gap:4,
            }
          },
            s.btn,
            React.createElement('i', { className:'ti ti-arrow-right', style:{ fontSize:12 } })
          )
        ))
      )
    )
  }

  return React.createElement('div', { className:'page' },

    // --- ページヘッダー ---
    React.createElement('div', { style:{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:'20px' } },
      React.createElement('div', null,
        React.createElement('div', { className:'eyebrow' }, 'FARM OVERVIEW'),
        React.createElement('div', { className:'page-title' }, 'ダッシュボード'),
        React.createElement('div', { className:'page-sub', style:{ marginBottom:0 } }, today)
      ),
      // 右上: 最近の作業記録の通知ベル（クリックでポップアップ）
      React.createElement('div', { style:{ position:'relative', display:'flex', alignItems:'center', gap:'10px' } },
        React.createElement('button', {
          onClick: () => setShowRecentPopup(v => !v),
          title: '最近の作業記録',
          style:{ position:'relative', display:'inline-flex', alignItems:'center', justifyContent:'center', width:'40px', height:'40px', borderRadius:'50%', background: showRecentPopup ? '#ECFDF5' : '#F8FAF9', border:'1px solid ' + (showRecentPopup ? '#A7F3D0' : '#E2E8E2'), cursor:'pointer' }
        },
          React.createElement('i', { className:'ti ti-bell', 'aria-hidden':'true', style:{ fontSize:'19px', color:'#0A6B52' } }),
          // バッジ＝本日の作業記録件数（ポップアップ「本日の作業記録 N件」と一致。0件は非表示）
          (todayRecordCount > 0) && React.createElement('span', {
            style:{ position:'absolute', top:'-2px', right:'-2px', minWidth:'17px', height:'17px', padding:'0 4px', borderRadius:'9px', background:'#DC2626', color:'#fff', fontSize:'10px', fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid #fff' }
          }, todayRecordCount > 99 ? '99+' : String(todayRecordCount))
        ),
        // ポップアップ（詳細を開いても閉じない＝連続閲覧OK。外側クリック捕捉は詳細モーダルより下のz）
        showRecentPopup && React.createElement(React.Fragment, null,
          React.createElement('div', { onClick:()=>setShowRecentPopup(false), style:{ position:'fixed', inset:0, zIndex:1990 } }),
          React.createElement('div', {
            style:{ position:'absolute', top:'48px', right:0, width:'360px', maxWidth:'92vw', maxHeight:'70vh', overflowY:'auto', zIndex:2600, background:'#fff', borderRadius:'12px', boxShadow:'0 12px 40px rgba(0,0,0,.22)', border:'1px solid #E2E8F0' }
          },
            React.createElement(RecentRecordsPanel, { records, fields, selectedId: selectedRecord && selectedRecord.id, onSelectRecord: r => setSelectedRecord(r), embedded:true, lotSprayRecords, topDressingRecords: gapCtx.topDressingRecords, harvestRecords: gapCtx.harvestRecords, onNavigate })
          )
        )
      )
    ),

    // --- 整合性チェック（突合せ）アラート: 記録の食い違い・入力ミスに気づけるように ---
    (_integHigh + _integMid) > 0 && React.createElement('div', {
      style:{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap',
        background: _integHigh > 0 ? '#FEF2F2' : '#FFFBEB', border:'1px solid ' + (_integHigh > 0 ? '#FCA5A5' : '#FDE68A'),
        borderRadius:12, padding:'12px 16px', marginBottom:20 }
    },
      React.createElement('i', { className:'ti ti-' + (_integHigh > 0 ? 'alert-triangle' : 'alert-circle'), style:{ fontSize:20, color: _integHigh > 0 ? '#DC2626' : '#B45309', flexShrink:0 } }),
      React.createElement('div', { style:{ flex:1, minWidth:0 } },
        React.createElement('div', { style:{ fontSize:14, fontWeight:700, color:'#111827' } }, '記録の食い違いが見つかりました'),
        React.createElement('div', { style:{ fontSize:12, color:'#6B7280' } },
          (_integHigh > 0 ? ('要対応 ' + _integHigh + '件') : '') + (_integHigh > 0 && _integMid > 0 ? ' ／ ' : '') + (_integMid > 0 ? ('要確認 ' + _integMid + '件') : '') + ' — 突合せで原因と直し方を確認できます')
      ),
      React.createElement('button', { onClick:()=>onNavigate && onNavigate('integrity_check'),
        style:{ flexShrink:0, background:'#0A6B52', color:'#fff', border:'none', borderRadius:8, padding:'8px 14px', fontSize:13, fontWeight:700, cursor:'pointer' } }, '整合性チェックを開く →')
    ),

    // --- 統計カード 4枚（先月比付き） ---
    React.createElement('div', { className:'stat-grid' },
      React.createElement('div', { className:'stat-card green' },
        React.createElement('div', { className:'stat-n' }, activeF),
        React.createElement('div', { className:'stat-l' }, '稼働中圃場')
      ),
      React.createElement('div', { className:'stat-card blue' },
        React.createElement('div', { className:'stat-n' }, totalArea + 'a'),
        React.createElement('div', { className:'stat-l' }, '総管理面積')
      ),
      React.createElement('div', { className:'stat-card amber' },
        React.createElement('div', { className:'stat-n' }, records.length),
        React.createElement('div', { className:'stat-l' }, '作業記録件数'),
        recordsDiff !== null && React.createElement('div', {
          style:{
            display:'flex', alignItems:'center', gap:'3px',
            marginTop:'6px', fontSize:'11px', fontWeight:600,
            color: recordsDiff > 0 ? '#0A6B52' : recordsDiff < 0 ? '#94A3B8' : '#94A3B8',
          }
        },
          React.createElement('i', {
            className: recordsDiff > 0 ? 'ti ti-arrow-up' : recordsDiff < 0 ? 'ti ti-arrow-down' : 'ti ti-minus',
            style:{ fontSize:'11px' }
          }),
          recordsDiff === 0 ? '先月と同じ' : '先月比 '+(recordsDiff > 0 ? '+' : '')+recordsDiff+'件'
        )
      ),
      React.createElement('div', { className:'stat-card red' },
        React.createElement('div', { className:'stat-n' }, harvestRisks.length),
        React.createElement('div', { className:'stat-l' }, '収穫前日数アラート')
      )
    ),

    // --- 在庫アラート3列グリッド（農薬・肥料・GAP） ---
    React.createElement('div', {
      style:{
        display:'grid',
        gridTemplateColumns:'1fr 1fr 1fr',
        gap:'16px',
        marginBottom:'20px',
        alignItems:'stretch',
      }
    },
      React.createElement(PesticideStockWidget, {
        pesticides:    pesticides    || [],
        pesticideStock: pesticideStock || [],
        onNavigate,
        _inGrid: true,
      }),
      React.createElement(FertilizerStockWidget, {
        fertilizers:    fertilizers    || [],
        fertilizerStock: fertilizerStock || [],
        onNavigate,
        _inGrid: true,
      }),
      React.createElement(GapProgressBarDashboard, { pct: gapPct, _inGrid: true }),
    ),

    // --- アラートカード（収穫前日数 / 農薬残留リスク） ---
    React.createElement('div', { style:{ marginBottom:'4px' } },
      React.createElement(SectionTitle, { icon:'alert-triangle' }, '収穫前日数アラート'),
      harvestRisks.length === 0
        ? React.createElement(HarvestRiskClearBadge)
        : harvestRisks.map(r => React.createElement(HarvestRiskAlertCard, { key:r.id, risk:r })),
      // 防除の使用基準は作物×農薬の組み合わせで法的に決まるため、参考値であることを常に明示
      React.createElement('div', { style:{ fontSize:'11px', color:'#94A3B8', marginTop:'6px', marginBottom:'12px', lineHeight:1.7 } },
        '※ 農薬マスタの「収穫前日数」と作付計画の収穫予定月から算出した参考情報です。',
        '実際の使用可否は必ず農薬ラベル（作物別の使用基準）で確認してください。'
      )
    ),

    // --- 機械整備アラート（要対応 / しばらく整備記録なし）---
    (_maintPending.length > 0 || _maintOverdue) && React.createElement('div', { style:{ marginBottom:'12px' } },
      React.createElement(SectionTitle, { icon:'tool' }, '機械整備アラート'),
      React.createElement('button', {
        onClick: () => onNavigate && onNavigate('maintenance_log'),
        style:{ display:'flex', alignItems:'center', gap:'12px', width:'100%', textAlign:'left', cursor:'pointer',
          background: _maintPending.length ? '#FEF2F2' : '#FFFBEB', border:'1px solid ' + (_maintPending.length ? '#FECACA' : '#FDE68A'), borderRadius:'10px', padding:'12px 16px' },
      },
        React.createElement('i', { className:'ti ti-' + (_maintPending.length ? 'alert-triangle' : 'clock'), style:{ fontSize:'20px', color: _maintPending.length ? '#DC2626' : '#B45309', flexShrink:0 } }),
        React.createElement('div', { style:{ flex:1 } },
          React.createElement('div', { style:{ fontSize:'13px', fontWeight:700, color:'#111827' } },
            _maintPending.length > 0 ? ('要対応の整備が ' + _maintPending.length + ' 件あります') : 'しばらく機械の点検記録がありません'),
          React.createElement('div', { style:{ fontSize:'11px', color:'#6B7280', marginTop:'2px' } },
            _maintPending.length > 0 ? _maintPending.map(m => m.machine_name).join('・') : ('最終整備: ' + (_maintLast || '記録なし') + '　— GAPの機械点検記録を残しましょう'))
        ),
        React.createElement('span', { style:{ fontSize:'12px', fontWeight:700, color:'#0A6B52', flexShrink:0 } }, '記録する →')
      )
    ),

    // --- アラートカード（ビザ期限）---【削除済み】ビザ管理機能はスコープ外

    // 最近の作業記録は右上の通知ベル→ポップアップに移設（本文からは外してスッキリ）。

    // ── タスク日報入力モーダル ──
    activeTask && React.createElement('div', {
      style:{ position:'fixed', inset:0, background:'rgba(17,24,39,.5)', zIndex:3000, display:'flex', alignItems:'center', justifyContent:'center' },
      onClick: () => setActiveTask(null)
    },
      React.createElement('div', {
        style:{ background:'#FFFFFF', borderRadius:'12px', padding:'28px', width:'640px', maxWidth:'95vw', maxHeight:'92vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.25)', animation:'fadeInDown .18s ease' },
        onClick: e => e.stopPropagation()
      },
        React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' } },
          React.createElement('div', null,
            React.createElement('div', { style:{ fontSize:'15px', fontWeight:700, color:'#111827' } }, '日報入力'),
            React.createElement('div', { style:{ fontSize:'12px', color:'#64748B', marginTop:'2px' } },
              activeTask.work_type + ' — ' + (masterById(fields, activeTask.field_id)?.name || '') + '　' + activeTask.time + '〜'
            )
          ),
          React.createElement('button', {
            onClick: () => setActiveTask(null),
            style:{ background:'none', border:'none', cursor:'pointer', fontSize:'20px', color:'#9CA3AF', lineHeight:1, padding:'4px' }
          }, '✕')
        ),
        React.createElement(RecordForm, {
          fields: fields.filter(f => String(f.id) === String(activeTask.field_id)),
          pesticides: pesticides || [],
          records: records || [],
          lotSprayRecords: lotSprayRecords || [],
          inModal: true,
          onSave: r => {
            if (onSaveRecord) onSaveRecord({ ...r, field_id: activeTask.field_id })
            onToggleTodayTask(activeTask.id)
            setActiveTask(null)
          }
        })
      )
    ),

    // ── 作業記録詳細モーダル（最近の作業記録パネルから起動） ──
    selectedRecord && React.createElement(RecordDetailModal, {
      record: selectedRecord,
      fields,
      pesticides: pesticides || [],
      onClose: () => setSelectedRecord(null),
      onUpdate: onUpdateRecord ? r => onUpdateRecord(r) : null, // 閉じるのはモーダル側(handleUpdate)が成功時のみ
      onDelete: onDeleteRecord ? id => onDeleteRecord(id) : null,
    }),

    // 【スッキリ化・ユーザー要望】月次作業サマリー・来年の作付提案・圃場サマリーはダッシュボードから外した。
    // それぞれ「圃場まとめ」「作付計画」の専用ページに集約済みで、ダッシュボードでの重複を解消。
    React.createElement('div', { className:'page-grow' })
  )
}

// =====================================================
// B-3: 農薬散布スライダーUI + バリデーション（独立コンポーネント）
// 農薬選択 → スライダーで希釈倍率・散布量入力
// 同圃場・同農薬の年間使用回数をrecordsから集計して上限チェック
// 超過時は赤バナー + 保存ブロック
// =====================================================
function PesticideInput({ pesticides, records, fieldId, pesticideId, crop, fieldArea, onUpdate, lotSprayRecords }) {
  // 【フェーズ2】作物に応じた使用可能農薬リスト（CROP_PESTICIDE_MAP）
  const cropMap = crop ? CROP_PESTICIDE_MAP[crop] : null
  const availablePesticides = cropMap
    ? pesticides.filter(p => cropMap.some(c => String(c.pesticide_id) === String(p.id) || (p.legacy_id != null && String(c.pesticide_id) === String(p.legacy_id))))
    : pesticides
  // 作物に紐づく農薬が1種類だけなら自動セット（手入力不要）
  const autoSelectId = cropMap && availablePesticides.length === 1 ? availablePesticides[0].id : null

  const [selectedId, setSelectedId] = React.useState((pesticideId != null && pesticideId !== '') ? pesticideId : autoSelectId) // UUID対応: Number()はNaN化するため禁止
  // 【新規】散布液量（L/10a）をスライダーで管理
  const [sprayLiquidPerTenare, setSprayLiquidPerTenare] = React.useState(500)

  const selected   = masterById(pesticides, selectedId)
  // 作物マップに登録された標準希釈倍率（自動セット）。なければ農薬自体の標準倍率を使用
  const mapEntry   = cropMap && selected ? cropMap.find(c => String(c.pesticide_id) === String(selected.id) || (selected.legacy_id != null && String(c.pesticide_id) === String(selected.legacy_id))) : null
  const dilution   = mapEntry ? mapEntry.dilution : (selected ? selected.dilution : 1000)
  // 使用回数は日報の農薬散布 + 農薬散布タブ（ロット単位）の記録を合算した参考値
  const usedTimes  = countPesticideUse(records, fieldId, selectedId, lotSprayRecords || [], selected)
  const isOver     = isPesticideOverLimit(records, fieldId, selected, lotSprayRecords || [])
  const remaining  = selected ? selected.max_times - usedTimes : null

  // 【新規】計算ロジック
  // 面積がない場合は計算できない
  const hasFieldArea = fieldArea && fieldArea > 0
  // 実際の散布液量（L） = 散布液量（L/10a） × 面積（are） / 10
  const actualSprayLiquid = hasFieldArea ? (sprayLiquidPerTenare * fieldArea) / 10 : 0
  // 原液使用量（mL） = 散布液量（L） / 希釈倍率 × 1000
  const concentrateAmount = actualSprayLiquid > 0 ? (actualSprayLiquid / dilution) * 1000 : 0

  // 作物選択時点で農薬が1種類に決まる場合は自動セット
  React.useEffect(() => {
    if (autoSelectId && selectedId !== autoSelectId) setSelectedId(autoSelectId)
  }, [autoSelectId])

  // 親コンポーネントへ値を通知
  // 【変更】amount（原液mL）と spray_liquid_L を両方通知
  React.useEffect(() => {
    onUpdate({
      pesticide_id: selectedId,
      dilution,
      amount: Math.round((concentrateAmount / 1000) * 100) / 100,  // 原液使用量（L）【単位統一】
      spray_liquid_L: Math.round(actualSprayLiquid * 100) / 100,  // 散布液量（L）
      isOver
    })
  }, [selectedId, dilution, sprayLiquidPerTenare, fieldArea, onUpdate])

  return React.createElement('div', null,

    // --- 農薬選択カード一覧（作物が決まっている場合は使用可能な農薬のみ表示） ---
    React.createElement('div', { className:'form-group' },
      React.createElement('label', { className:'form-label' },
        '農薬を選択',
        cropMap && React.createElement('span', { style:{ fontSize:'11px', color:'#0D9972', fontWeight:400, marginLeft:'6px' } },
          '（' + crop + 'で使用可能な農薬のみ表示・倍率は自動セット）'
        )
      ),
      React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:'6px' } },
        ...availablePesticides.map(p => {
          const used = countPesticideUse(records, fieldId, p.id, [], p)
          const over = used >= p.max_times
          const sel  = String(selectedId) === String(p.id)
          const pDilution = cropMap ? (cropMap.find(c => String(c.pesticide_id) === String(p.id) || (p.legacy_id != null && String(c.pesticide_id) === String(p.legacy_id))) || {}).dilution || p.dilution : p.dilution
          return React.createElement('button', {
            key: p.id,
            onClick: () => { if (!over) setSelectedId(p.id) },
            style:{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'12px 14px', borderRadius:'8px', cursor: over ? 'not-allowed' : 'pointer',
              border:'1px solid', textAlign:'left', opacity: over ? .55 : 1,
              borderColor: sel ? CONFIG.COLOR.primary : over ? '#FECACA' : '#DDE2EC',
              background:  sel ? '#ECFDF5' : over ? '#FFF1F2' : '#F8FAFC',
            }
          },
            React.createElement('div', null,
              React.createElement('div', { style:{ fontSize:'14px', fontWeight:600, color: sel ? CONFIG.COLOR.primary : '#374151' } }, p.name),
              React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280', marginTop:'2px' } },
                '登録番号 '+p.reg_no+' ／ 収穫前 '+p.preharvest_days+'日 ／ 希釈 '+pDilution+'倍'
              )
            ),
            React.createElement('div', { style:{ textAlign:'right', flexShrink:0 } },
              React.createElement('span', {
                className:'badge '+(over ? 'badge-red' : used > 0 ? 'badge-amber' : 'badge-green')
              }, used+'/'+p.max_times+'回'),
              over && React.createElement('div', { style:{ fontSize:'10px', color:'#DC2626', marginTop:'3px' } }, '使用不可')
            )
          )
        })
      )
    ),

    // --- 超過バナー ---
    isOver && React.createElement('div', {
      style:{
        background:'#FEF2F2', border:'1px solid #F87171',
        borderRadius:'8px', padding:'12px 16px', marginBottom:'14px',
        display:'flex', alignItems:'flex-start', gap:'10px'
      }
    },
      React.createElement('span', { style:{ fontSize:'18px', flexShrink:0 } }, '🚫'),
      React.createElement('div', null,
        React.createElement('div', { style:{ fontSize:'14px', fontWeight:600, color:'#DC2626', marginBottom:'3px' } },
          '年間使用回数の上限（'+selected.max_times+'回）を超えています'
        ),
        React.createElement('div', { style:{ fontSize:'12px', color:'#991B1B' } },
          'この農薬はこの圃場では使用できません。別の農薬を選択してください。'
        )
      )
    ),

    // --- 【新規】3段構成の散布量計算セクション ---
    selected && !isOver && React.createElement('div', {
      style:{ background:'#ECFDF5', border:'1px solid #A7F3D0', borderRadius:'10px', padding:'16px', marginBottom:'14px' }
    },
      // 残回数サマリー
      React.createElement('div', {
        style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'14px' }
      },
        React.createElement('div', { style:{ fontSize:'14px', color:'#0D9972', fontWeight:600 } }, '✓ '+selected.name),
        React.createElement('span', { className:'badge badge-green' }, '残'+remaining+'回使用可')
      ),

      // 希釈倍率（自動セット・読み取り専用表示）
      React.createElement('div', { className:'form-group', style:{ marginBottom:'14px' } },
        React.createElement('div', {
          style:{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:'6px' }
        },
          React.createElement('label', { className:'form-label', style:{ marginBottom:0 } },
            '希釈倍率',
            React.createElement('span', { style:{ fontSize:'11px', color:'#94A3B8', fontWeight:400, marginLeft:'6px' } }, '（自動セット・入力不要）')
          ),
          React.createElement('span', {
            style:{
              fontSize:'18px', fontWeight:700, color:'#0D9972',
              background:'#0D9972', padding:'2px 12px', borderRadius:'6px'
            }
          }, dilution+'倍')
        ),
        React.createElement('div', {
          style:{
            display:'flex', alignItems:'center', gap:'8px', padding:'10px 12px',
            background:'#F0FDF9', border:'1px solid #A7F3D055', borderRadius:'8px',
            fontSize:'12px', color:'#0D9972'
          }
        },
          React.createElement('i', { className:'ti ti-lock', 'aria-hidden':'true', style:{ fontSize:'14px' } }),
          crop + 'の散布基準として ' + dilution + '倍 が自動セットされています'
        )
      ),

      // 【段階1】散布液量（L/10a）スライダー
      React.createElement('div', { className:'form-group', style:{ marginBottom:'14px' } },
        React.createElement('div', {
          style:{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:'6px' }
        },
          React.createElement('label', { className:'form-label', style:{ marginBottom:0 } },
            '① 散布液量（標準量を調整）',
            React.createElement('span', { style:{ fontSize:'11px', color:'#94A3B8', fontWeight:400, marginLeft:'6px' } }, 'L/10a')
          ),
          React.createElement('span', {
            style:{
              fontSize:'18px', fontWeight:700, color:'#2563EB',
              background:'#EFF6FF', padding:'2px 12px', borderRadius:'6px'
            }
          }, sprayLiquidPerTenare+'L/10a')
        ),
        React.createElement('input', {
          type:'range', min:100, max:1000, step:50, value:sprayLiquidPerTenare,
          onChange: e => setSprayLiquidPerTenare(Number(e.target.value)),
          style:{ width:'100%', accentColor:'#2563EB', cursor:'pointer' }
        }),
        React.createElement('div', {
          style:{ display:'flex', justifyContent:'space-between', fontSize:'10px', color:'#6B7280', marginTop:'3px' }
        },
          React.createElement('span', null, '100'),
          React.createElement('span', null, '1000L/10a')
        )
      ),

      // 【段階2】面積から計算された散布液量
      !hasFieldArea && React.createElement('div', {
        style:{
          background:'#FEF3C7', border:'1px solid #FCD34D',
          borderRadius:'8px', padding:'12px', marginBottom:'14px',
          fontSize:'12px', color:'#92400E'
        }
      },
        '📍 圃場の面積が設定されていません。面積を設定すると自動計算されます。'
      ),

      hasFieldArea && React.createElement('div', { className:'form-group', style:{ marginBottom:'14px', background:'#F0FDF9', padding:'12px', borderRadius:'8px' } },
        React.createElement('div', {
          style:{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:'6px' }
        },
          React.createElement('label', { className:'form-label', style:{ marginBottom:0, color:'#0D9972' } },
            '② 実散布量（面積から自動計算）',
            React.createElement('span', { style:{ fontSize:'11px', color:'#0D9972', fontWeight:400, marginLeft:'6px' } }, 'L')
          ),
          React.createElement('span', {
            style:{
              fontSize:'18px', fontWeight:700, color:'#0D9972',
              background:'#ECFDF5', padding:'2px 12px', borderRadius:'6px'
            }
          }, actualSprayLiquid.toFixed(2)+'L')
        ),
        React.createElement('div', { style:{ fontSize:'11px', color:'#0D9972', marginTop:'6px', lineHeight:'1.5' } },
          '計算式: '+sprayLiquidPerTenare+'L/10a × '+fieldArea+'are ÷ 10 = '+actualSprayLiquid.toFixed(2)+'L'
        )
      ),

      // 【段階3】原液使用量
      hasFieldArea && React.createElement('div', { className:'form-group', style:{ marginBottom:0, background:'#FEF3C7', padding:'12px', borderRadius:'8px' } },
        React.createElement('div', {
          style:{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:'6px' }
        },
          React.createElement('label', { className:'form-label', style:{ marginBottom:0, color:'#92400E', fontWeight:600 } },
            '③ 原液使用量（実申告量）',
            React.createElement('span', { style:{ fontSize:'11px', color:'#92400E', fontWeight:400, marginLeft:'6px' } }, 'L')
          ),
          React.createElement('span', {
            style:{
              fontSize:'20px', fontWeight:700, color:'#DC2626',
              background:'#FEF2F2', padding:'4px 14px', borderRadius:'6px'
            }
          }, (concentrateAmount / 1000).toFixed(2)+'L')
        ),
        React.createElement('div', { style:{ fontSize:'11px', color:'#92400E', marginTop:'6px', lineHeight:'1.5' } },
          '計算式: '+actualSprayLiquid.toFixed(2)+'L ÷ '+dilution+'倍 = '+(concentrateAmount / 1000).toFixed(2)+'L'
        )
      )
    ),

    // --- 選択なし時のプレースホルダー ---
    !selected && React.createElement('div', {
      style:{ background:'#F8FAFF', border:'1.5px dashed #C8D0DC', borderRadius:'8px', padding:'16px', textAlign:'center', color:'#6B7280', fontSize:'14px' }
    }, '↑ 上から農薬を選択してください')
  )
}

// =====================================================
// B-2: 日々の記録フォーム（CAT-05-2対応: コンポーネント分割）
// StepBar / Step1〜Step4 / RecordTable を外部コンポーネントに切り出し
// RecordForm  : フォーム専用ページ（旧 hideList:true）
// RecordTablePage: 一覧専用ページ（旧 hideForm:true）
// =====================================================

// =====================================================
// 【実装手順書 Step1】備考欄の拡張（チェック欄・ヒヤリハット）
// 紙日報にある転記済みチェック欄（□管理表／□肥料在庫表／□農薬・肥料管理／
// □レタス管理表／□SA）と、自由記述の備考・ヒヤリハットメモを各日報入力フォームの
// 末尾に追加する共通コンポーネント。
// - チェックは必須化しない（紙の運用でも空欄のまま運用されているため、未チェック＝エラーにしない）
// - 自由記述欄は折りたたみ式にし、通常時は画面を圧迫しないようにする
// - 一覧画面では NoteChecklistField とセットの TranscribeStatusBadge で
//   転記状況をアイコン／バッジ表示し、未転記が一目でわかるようにする
// =====================================================
const TRANSCRIBE_CHECK_OPTIONS = [
  { key:'mgmt_table',     label:'管理表へ転記済み' },
  { key:'fert_stock',     label:'肥料在庫表へ転記済み' },
  { key:'pesticide_fert', label:'農薬/肥料管理へ転記済み' },
  { key:'lettuce_table',  label:'レタス管理表へ転記済み' },
  { key:'sa',             label:'SA確認済み' },
]

// 【実装手順書 C】担当者IDの配列を名前の文字列に変換する共通ヘルパー
// （農薬散布・追肥・収穫の詳細モーダルで共通利用）
function staffNames(staff, staffIds) {
  if (!staffIds || staffIds.length === 0) return '—'
  return staffIds
    .map(id => { const s = (staff || []).find(x => x.id === id); return s ? s.name : null })
    .filter(Boolean)
    .join('、') || '—'
}
// 詳細モーダルの情報行共通スタイル（日報記録の詳細モーダルと統一）
const rowStyle2 = { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #F1F5F9', fontSize:'13px' }

// 【実装手順書 C】担当者選択 共通コンポーネント
// 農薬散布・追肥記録フォームで共通利用する担当者トグルボタン
function StaffPicker({ staff, staffIds, onChange }) {
  if (!staff || staff.length === 0) {
    return React.createElement('div', { style:{ marginBottom:'14px' } },
      React.createElement('label', {
        style:{ fontSize:'10px', fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:'6px' }
      }, '担当者（複数選択可）'),
      React.createElement('div', { style:{ fontSize:'11px', color:'#9CA3AF', padding:'6px 0' } },
        'スタッフ管理ページでスタッフを登録すると、ここで担当者を選択できます'
      )
    )
  }
  return React.createElement('div', { style:{ marginBottom:'14px' } },
    React.createElement('label', {
      style:{ fontSize:'10px', fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:'6px' }
    }, '担当者（複数選択可）'),
    React.createElement('div', { style:{ display:'flex', flexWrap:'wrap', gap:'6px' } },
      ...staff.map(s =>
        React.createElement('button', {
          key: s.id,
          type: 'button',
          onClick: () => {
            const ids = staffIds || []
            onChange(ids.includes(s.id) ? ids.filter(id => id !== s.id) : [...ids, s.id])
          },
          style:{
            padding:'5px 12px', borderRadius:'20px', border:'1.5px solid',
            fontSize:'12px', fontWeight:600, cursor:'pointer', transition:'all .15s',
            borderColor: (staffIds||[]).includes(s.id) ? '#0A6B52' : '#D8E4D8',
            background:  (staffIds||[]).includes(s.id) ? '#0A6B52' : '#fff',
            color:       (staffIds||[]).includes(s.id) ? '#fff'    : '#6B7280',
          }
        }, s.avatar ? `${s.avatar} ${s.name}` : s.name)
      )
    )
  )
}

// 各日報フォームの末尾に置く、折りたたみ式の「備考・メモ ／ 転記チェック」欄。
// checkKeys を渡すと、その様式に合ったチェック項目だけを表示する（省略時は全項目）。
function NoteChecklistField({ note, onNoteChange, checks, onChecksChange, checkKeys, defaultOpen=false }) {
  const [open, setOpen] = React.useState(defaultOpen)
  const options = TRANSCRIBE_CHECK_OPTIONS.filter(o => !checkKeys || checkKeys.includes(o.key))
  const checkedCount = options.filter(o => checks && checks[o.key]).length
  const toggleCheck = (key) => onChecksChange({ ...(checks || {}), [key]: !(checks && checks[key]) })

  return React.createElement('div', { style:{ marginTop:'14px', marginBottom:'4px', border:'1px solid #E2E8E2', borderRadius:'8px', overflow:'hidden' } },
    React.createElement('button', {
      type:'button',
      onClick: () => setOpen(o => !o),
      style:{
        width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'9px 12px', background:'#F8FAF8', border:'none', cursor:'pointer'
      }
    },
      React.createElement('span', { style:{ display:'flex', alignItems:'center', gap:'7px', fontSize:'12px', fontWeight:700, color:'#374151' } },
        React.createElement('i', { className:'ti ti-notes', style:{ fontSize:'14px', color:'#7C3AED' } }),
        '備考・メモ／転記チェック',
        React.createElement('span', { style:{ fontSize:'11px', color:'#94A3B8', fontWeight:400 } }, '（任意）')
      ),
      React.createElement('span', { style:{ display:'flex', alignItems:'center', gap:'8px' } },
        !open && (note || checkedCount > 0) && React.createElement('span', {
          style:{ fontSize:'10px', fontWeight:700, color:'#0A6B52', background:'#ECFDF5', border:'1px solid #6EE7B7', borderRadius:'10px', padding:'1px 8px' }
        }, (note ? '📝 ' : '') + (checkedCount > 0 ? checkedCount + '/' + options.length + '転記' : '')),
        React.createElement('i', { className:'ti ti-chevron-' + (open ? 'up' : 'down'), style:{ fontSize:'13px', color:'#9CA3AF' } })
      )
    ),
    React.createElement('div', { className: 'smooth-collapse-wrap' + (open ? ' open' : '') },
      React.createElement('div', { className: 'smooth-collapse-inner' },
        React.createElement('div', { style:{ padding:'12px', background:'#FFFFFF' } },
      React.createElement('textarea', {
        value: note || '',
        onChange: e => onNoteChange(e.target.value),
        placeholder: '備考・ヒヤリハットなど自由に記入してください（任意）',
        rows: 3,
        style:{ width:'100%', boxSizing:'border-box', border:'1.5px solid #D8E4D8', borderRadius:'7px', padding:'8px 10px', fontSize:'13px', fontFamily:'inherit', resize:'vertical', marginBottom:'10px', outline:'none' }
      }),
      React.createElement('div', { style:{ fontSize:'10px', fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:'6px' } },
        '転記チェック（紙日報の入力チェック欄に対応・チェックなしでも保存できます）'
      ),
      React.createElement('div', { style:{ display:'flex', flexWrap:'wrap', gap:'8px' } },
        ...options.map(o =>
          React.createElement('label', {
            key: o.key,
            style:{
              display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', color:'#374151',
              padding:'5px 10px', borderRadius:'6px', cursor:'pointer',
              border: '1px solid ' + ((checks && checks[o.key]) ? '#6EE7B7' : '#E2E8E2'),
              background: (checks && checks[o.key]) ? '#F0FDF4' : '#FAFBFA'
            }
          },
            React.createElement('input', {
              type:'checkbox', checked: !!(checks && checks[o.key]),
              onChange: () => toggleCheck(o.key),
              style:{ accentColor:'#0A6B52', width:'14px', height:'14px', cursor:'pointer' }
            }),
            o.label
          )
        )
      )
      ) // end inner padding div
      ) // end smooth-collapse-inner
    ) // end smooth-collapse-wrap
  )
}

// 一覧画面で「転記済みかどうか」が一目でわかるバッジ。
// 紙日報のチェック欄が空欄でも運用上はエラーではないため、強い色は使わず控えめな配色にする。
function TranscribeStatusBadge({ checks, checkKeys, style }) {
  const options = TRANSCRIBE_CHECK_OPTIONS.filter(o => !checkKeys || checkKeys.includes(o.key))
  const checkedCount = options.filter(o => checks && checks[o.key]).length
  if (checkedCount === 0) {
    return React.createElement('span', {
      title: '転記チェック未登録（未入力なだけで、エラーではありません）',
      style:{ fontSize:'10px', fontWeight:700, color:'#92400E', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:'10px', padding:'1px 8px', display:'inline-flex', alignItems:'center', gap:'4px', whiteSpace:'nowrap', ...style }
    },
      React.createElement('i', { className:'ti ti-list-check', style:{ fontSize:'10px' } }),
      '未転記'
    )
  }
  const allChecked = checkedCount === options.length
  return React.createElement('span', {
    title: options.filter(o => checks[o.key]).map(o => o.label).join('\n'),
    style:{
      fontSize:'10px', fontWeight:700, whiteSpace:'nowrap',
      color: allChecked ? '#065F46' : '#1D4ED8',
      background: allChecked ? '#ECFDF5' : '#EFF6FF',
      border: '1px solid ' + (allChecked ? '#6EE7B7' : '#BFDBFE'),
      borderRadius:'10px', padding:'1px 8px', display:'inline-flex', alignItems:'center', gap:'4px',
      ...style
    }
  },
    React.createElement('i', { className:'ti ti-' + (allChecked ? 'check' : 'list-check'), style:{ fontSize:'10px' } }),
    checkedCount + '/' + options.length + ' 転記'
  )
}

// ── ステップインジケーター ──────────────────────────
function StepBar({ step, steps }) {
  return React.createElement('div', {
    style:{ display:'flex', alignItems:'center', marginBottom:'24px' }
  },
    ...steps.map((s, i) => [
      React.createElement('div', { key:'dot'+i, style:{ display:'flex', flexDirection:'column', alignItems:'center', gap:'4px' } },
        React.createElement('div', {
          style:{
            width:30, height:30, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:'12px', fontWeight:600, flexShrink:0,
            background: i+1 < step ? CONFIG.COLOR.primary : i+1 === step ? '#FFFFFF' : '#F1F5F9',
            color:       i+1 < step ? '#FFFFFF' : i+1 === step ? CONFIG.COLOR.primary : '#CBD5E1',
            border:      i+1 <= step ? '2px solid '+CONFIG.COLOR.primary : '1px solid #DDE2EC',
          }
        }, i+1 < step ? '✓' : i+1),
        React.createElement('div', { style:{ fontSize:'10px', color: i+1===step?CONFIG.COLOR.primary:'#94A3B8', whiteSpace:'nowrap' } }, s)
      ),
      i < steps.length-1 && React.createElement('div', { key:'line'+i, style:{ flex:1, height:'1px', background: i+1 < step ? CONFIG.COLOR.primary : '#E2E8F0', margin:'0 6px', marginBottom:'18px' } })
    ]).flat().filter(Boolean)
  )
}

// ── ステップ1: 日付・圃場・天気・作業者 ────────────
function RecordStep1({ form, fields, up, onNext, isFieldPreset, recentFieldIds, hasWeatherHistory }) {
  const WEATHERS = [{ v:'晴', icon:'☀️' }, { v:'曇', icon:'🌤' }, { v:'雨', icon:'🌧' }, { v:'強風', icon:'💨' }]
  const [fieldQuery, setFieldQuery] = React.useState('')  // 圃場が多い時の検索

  // 所要時間（分）を開始・終了・休憩から自動計算
  const calcRequired = () => {
    if (!form.start_time || !form.end_time) return null
    const [sh, sm] = form.start_time.split(':').map(Number)
    const [eh, em] = form.end_time.split(':').map(Number)
    const total = (eh * 60 + em) - (sh * 60 + sm)
    const work  = total - (Number(form.break_minutes) || 0)
    if (total < 0 || work < 0) return null
    const wh = Math.floor(work / 60), wm = work % 60
    return wh > 0 ? wh + '時間' + (wm > 0 ? wm + '分' : '') : wm + '分'
  }
  const workTimeLabel = calcRequired()

  return React.createElement('div', null,
    React.createElement(SectionTitle, { icon:'calendar-event' }, '日付・圃場・作業者'),
    // ── 作業日 + 作業者 ──
    React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' } },
      React.createElement('div', { className:'form-group' },
        React.createElement('label', { className:'form-label' }, '作業日'),
        React.createElement('input', { type:'date', className:'form-input', value:form.date, onChange:e=>up('date',e.target.value) })
      ),
      React.createElement('div', { className:'form-group' },
        React.createElement('label', { className:'form-label' }, '作業者'),
        React.createElement('input', { type:'text', className:'form-input', value:form.worker, onChange:e=>up('worker',e.target.value), placeholder:'例: 田中 太郎' })
      )
    ),

    // ── 圃場選択 or プリセット表示 ──
    isFieldPreset
      ? React.createElement('div', { className:'form-group' },
          React.createElement('label', { className:'form-label' }, '圃場'),
          React.createElement('div', {
            style:{
              display:'flex', alignItems:'center', gap:'10px',
              padding:'10px 14px', borderRadius:'8px',
              background: fields[0].color + '12',
              border:'1px solid ' + fields[0].color + '55',
            }
          },
            React.createElement('div', { style:{ width:10, height:10, borderRadius:'50%', background:fields[0].color, flexShrink:0 } }),
            React.createElement('div', null,
              React.createElement('div', { style:{ fontSize:'14px', color:'#374151', fontWeight:600 } }, fields[0].name),
              React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280' } }, fields[0].crop + ' / ' + fields[0].area_are + 'a')
            ),
            React.createElement('span', { style:{ marginLeft:'auto', fontSize:'11px', color:'#0A6B52', fontWeight:600, background:'#ECFDF5', padding:'2px 8px', borderRadius:'4px' } }, '選択済み')
          )
        )
      : (() => {
          const selectedIds = (form.field_ids && form.field_ids.length) ? form.field_ids : (form.field_id ? [form.field_id] : [])
          const q = fieldQuery.trim().toLowerCase()
          const base = q
            ? fields.filter(f => (f.name||'').toLowerCase().includes(q) || String(f.field_no||'').toLowerCase().includes(q) || (f.crop||'').toLowerCase().includes(q))
            : fields
          // 【P1】最近使った圃場を上に（recentFieldIds の順→未使用は元の順）。検索中はそのまま。
          const rank = (id) => { const i = (recentFieldIds || []).indexOf(id); return i < 0 ? 9999 : i }
          const shown = q ? base : [...base].sort((a, b) => rank(a.id) - rank(b.id))
          const lastUsedId = (recentFieldIds && recentFieldIds.length) ? recentFieldIds[0] : null
          const setSel = (next) => { up('field_ids', next); up('field_id', next.length ? String(next[0]) : '') }
          return React.createElement('div', { className:'form-group' },
            React.createElement('div', { style:{ display:'flex', alignItems:'baseline', gap:8, marginBottom:6 } },
              React.createElement('label', { className:'form-label', style:{ margin:0 } }, '圃場を選択'),
              selectedIds.length > 0 ? React.createElement('span', { style:{ fontSize:'12px', fontWeight:700, color:'#0A6B52' } }, '選択中 ' + selectedIds.length + ' 圃場') : null,
              selectedIds.length > 0 ? React.createElement('button', { onClick:()=>setSel([]), style:{ marginLeft:'auto', fontSize:'11px', color:'#6B7280', background:'none', border:'none', cursor:'pointer' } }, 'クリア') : null,
            ),
            React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280', margin:'0 0 8px' } },
              '複数選択できます（同じ作業を選んだ圃場すべてに一括記録）。※農薬散布のみ主圃場1つに記録します'),
            // 検索（圃場が多い時に絞り込み）
            React.createElement('input', {
              type:'text', className:'form-input', value:fieldQuery, onChange:e=>setFieldQuery(e.target.value),
              placeholder:'🔍 圃場名・番号・作物で絞り込み（例: 16 / レタス）', style:{ marginBottom:'8px' }
            }),
            // チップのグリッド（多くても内側だけスクロール＝ページ全体は動かない）
            React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:'8px', maxHeight:'240px', overflowY:'auto', padding:'2px', border:'1px solid #EEF2F0', borderRadius:'8px' } },
            ...(shown.length === 0 ? [React.createElement('div', { key:'none', style:{ gridColumn:'1/-1', textAlign:'center', color:'#9CA3AF', fontSize:'13px', padding:'16px' } }, '該当する圃場がありません')] : shown.map(f => {
              const isSel = selectedIds.includes(f.id)
              const toggle = () => setSel(isSel ? selectedIds.filter(x => x !== f.id) : [...selectedIds, f.id])
              return React.createElement('button', {
                key: f.id,
                onClick: toggle,
                style:{
                  display:'flex', alignItems:'center', gap:'8px', padding:'9px 10px',
                  borderRadius:'8px', cursor:'pointer', border:'1px solid',
                  borderColor: isSel ? '#0A6B52' : '#DDE2EC',
                  background:  isSel ? '#ECFDF5' : '#fff',
                  textAlign:'left'
                }
              },
                React.createElement('div', { style:{ width:16, height:16, borderRadius:'4px', border:'1px solid '+(isSel?'#0A6B52':'#CBD5E1'), background: isSel ? '#0A6B52' : '#fff', color:'#fff', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', fontWeight:700 } }, isSel ? '✓' : ''),
                React.createElement('div', { style:{ minWidth:0, flex:1 } },
                  React.createElement('div', { style:{ fontSize:'13px', color:'#374151', fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' } }, f.name),
                  React.createElement('div', { style:{ fontSize:'11px', color:'#9CA3AF' } }, f.crop)
                ),
                (f.id === lastUsedId) && React.createElement('span', { title:'前回この圃場に記録しました', style:{ flexShrink:0, fontSize:'9.5px', fontWeight:700, color:'#0A6B52', background:'#ECFDF5', border:'1px solid #A7F3D0', borderRadius:'4px', padding:'1px 5px' } }, '前回')
              )
            }))
          )
        )})(),

    // ── 開始・終了・所要・休憩（常時表示） ──
    React.createElement('div', { className:'form-group' },
      React.createElement('label', { className:'form-label' }, '作業時間'),
      React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:'10px' } },
        // 開始時刻
        React.createElement('div', null,
          React.createElement('label', { style:{ fontSize:'11px', fontWeight:600, color:'#64748B', display:'block', marginBottom:'4px' } }, '開始時刻'),
          React.createElement('input', {
            type:'time', className:'form-input', value:form.start_time,
            onChange:e=>up('start_time',e.target.value)
          })
        ),
        // 終了時刻
        React.createElement('div', null,
          React.createElement('label', { style:{ fontSize:'11px', fontWeight:600, color:'#64748B', display:'block', marginBottom:'4px' } }, '終了時刻'),
          React.createElement('input', {
            type:'time', className:'form-input', value:form.end_time,
            onChange:e=>up('end_time',e.target.value)
          })
        ),
        // 所要時間（自動計算・読み取り専用）
        React.createElement('div', null,
          React.createElement('label', { style:{ fontSize:'11px', fontWeight:600, color:'#64748B', display:'block', marginBottom:'4px' } }, '所要時間'),
          React.createElement('div', {
            style:{
              height:'38px', display:'flex', alignItems:'center', justifyContent:'center',
              background:'#F0F8F4', border:'1px solid #D1FAE5', borderRadius:'6px',
              fontSize:'13px', fontWeight:700, color:'#0A6B52',
            }
          }, workTimeLabel || '—')
        ),
        // 休憩時間
        React.createElement('div', null,
          React.createElement('label', { style:{ fontSize:'11px', fontWeight:600, color:'#64748B', display:'block', marginBottom:'4px' } }, '休憩（分）'),
          React.createElement('input', {
            type:'number', className:'form-input', value:form.break_minutes,
            min:0, step:15, style:{ textAlign:'center' },
            onChange:e=>up('break_minutes',Number(e.target.value))
          })
        ),
      )
    ),

    // ── 天気 ──
    React.createElement('div', { className:'form-group' },
      React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' } },
        React.createElement('label', { className:'form-label', style:{ margin:0 } }, '天気'),
        // 【P4】直近の記録から候補を入れている旨を明示（変更できる）
        hasWeatherHistory && React.createElement('span', { style:{ fontSize:'10.5px', fontWeight:700, color:'#0A6B52', background:'#ECFDF5', border:'1px solid #A7F3D0', borderRadius:'10px', padding:'1px 8px' } }, '候補：前回の天気（変更可）')
      ),
      React.createElement('div', { style:{ display:'flex', gap:'8px' } },
        ...WEATHERS.map(w =>
          React.createElement('button', {
            key: w.v,
            onClick: () => up('weather', w.v),
            style:{
              padding:'8px 16px', borderRadius:'8px', cursor:'pointer', fontSize:'14px', border:'1px solid',
              borderColor: form.weather === w.v ? CONFIG.COLOR.primary : '#DDE2EC',
              background:  form.weather === w.v ? '#ECFDF5' : '#F8FAFC',
              color:       form.weather === w.v ? CONFIG.COLOR.primary : '#64748B',
            }
          }, w.icon + ' ' + w.v)
        )
      )
    ),
    React.createElement('div', { style:{ display:'flex', justifyContent:'flex-end' } },
      React.createElement('button', { className:'btn btn-primary', onClick:()=>{ if(!form.field_id){ showToast('圃場を選んでください', 'warn'); return } onNext() } }, '次へ →')
    )
  )
}

// ── ステップ2: 作業内容（大ボタン選択）──────────────
function RecordStep2({ form, up, onPrev, onNext, onAddPhoto, onRemovePhoto, photoError }) {
  const photos = form.photos || []
  return React.createElement('div', null,
    React.createElement(SectionTitle, { icon:'settings' }, '作業内容を選択'),
    React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'10px', marginBottom:'20px' } },
      ...WORK_TYPES.map(w => {
        const cfg = WORK_ICON_MAP[w.v]
        return React.createElement('button', {
          key: w.v,
          onClick: () => up('work_type', w.v),
          style:{
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            gap:'8px', padding:'18px 12px', borderRadius:'10px', cursor:'pointer', border:'1px solid',
            borderColor: form.work_type === w.v ? w.color : '#DDE2EC',
            background:  form.work_type === w.v ? w.color+'18' : '#F8FAFC',
          }
        },
          React.createElement('div', {
            style:{ width:40, height:40, borderRadius:'50%', background:cfg.color, display:'flex', alignItems:'center', justifyContent:'center' }
          },
            React.createElement('i', { className:'ti ti-'+cfg.icon, 'aria-hidden':'true', style:{ fontSize:'20px', color:'#FFFFFF' } })
          ),
          React.createElement('span', { style:{ fontSize:'12px', fontWeight:500, color: form.work_type===w.v ? w.color : '#64748B' } }, w.v)
        )
      })
    ),

    // ── 写真（任意・最大PHOTO_MAX_PER_RECORD枚） ──
    onAddPhoto && React.createElement('div', { className:'form-group' },
      React.createElement('label', { className:'form-label' }, '写真（任意）'),
      React.createElement('div', { style:{ display:'flex', flexWrap:'wrap', gap:'10px', alignItems:'center' } },
        ...photos.map((src, i) =>
          React.createElement('div', { key:i, style:{ position:'relative', width:72, height:72, borderRadius:'8px', overflow:'hidden', border:'1px solid #DDE2EC' } },
            React.createElement('img', { src, style:{ width:'100%', height:'100%', objectFit:'cover', display:'block' } }),
            React.createElement('button', {
              onClick:()=>onRemovePhoto(i),
              style:{ position:'absolute', top:2, right:2, width:20, height:20, borderRadius:'50%', border:'none', background:'rgba(17,24,39,.7)', color:'#fff', cursor:'pointer', fontSize:'12px', lineHeight:'20px', padding:0 }
            }, '✕')
          )
        ),
        photos.length < PHOTO_MAX_PER_RECORD && React.createElement('label', {
          style:{ width:72, height:72, borderRadius:'8px', border:'1px dashed #9CA3AF', background:'#F8FAFC', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'4px', color:'#6B7280', fontSize:'11px' }
        },
          React.createElement('i', { className:'ti ti-camera', style:{ fontSize:'20px' } }),
          '追加',
          React.createElement('input', {
            type:'file', accept:'image/*', capture:'environment', style:{ display:'none' },
            onChange:e => { const file = e.target.files && e.target.files[0]; if (file) onAddPhoto(file); e.target.value='' }
          })
        )
      ),
      photoError && React.createElement('div', { style:{ fontSize:'12px', color:'#B45309', marginTop:'6px' } }, photoError),
      React.createElement('div', { style:{ fontSize:'11px', color:'#9CA3AF', marginTop:'4px' } }, '端末に合わせて自動で縮小・圧縮して保存します（作物の状態・病害虫の記録などに）')
    ),

    React.createElement('div', { style:{ display:'flex', justifyContent:'space-between' } },
      React.createElement('button', { className:'btn btn-ghost', onClick:onPrev }, '← 戻る'),
      React.createElement('button', { className:'btn btn-primary', onClick:()=>{ if(!form.work_type){ showToast('作業内容を選んでください', 'warn'); return } onNext() } }, '次へ →')
    )
  )
}

// ── ステップ3: 農薬/施肥 詳細入力 ──────────────────
function RecordStep3({ form, up, pesticides, records, lotSprayRecords, isOver, selField, handlePesticideUpdate, onPrev, onNext }) {
  return React.createElement('div', null,
    React.createElement('div', { className:'section-title' }, form.work_type === '農薬散布' ? '🧴 農薬情報' : '📊 作業量を入力'),
    // 【フェーズ2】農薬散布時: 圃場の作物（selField.crop）と面積（selField.area_are）を渡し、農薬・希釈倍率を自動セット。
    // スタッフが入力するのは「使用した農薬名（選択）」と「散布液量」の1項目のみ
    form.work_type === '農薬散布' && React.createElement(PesticideInput, {
      pesticides, records, lotSprayRecords,
      fieldId:     form.field_id,
      pesticideId: form.pesticide_id,
      crop:        selField ? selField.crop : null,
      fieldArea:   selField ? selField.area_are : null,  // 【新規】圃場面積（are）を渡す
      onUpdate: handlePesticideUpdate
    }),
    // 農薬散布以外の作業種では「使用量 / 作業量」を入力
    form.work_type !== '農薬散布' && React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' } },
      React.createElement('div', { className:'form-group' },
        React.createElement('label', { className:'form-label' }, '使用量 / 作業量'),
        React.createElement('input', { type:'number', className:'form-input', value:form.amount, onChange:e=>up('amount',e.target.value), placeholder:'例: 50' })
      ),
      React.createElement('div', { className:'form-group' },
        React.createElement('label', { className:'form-label' }, '単位'),
        React.createElement('select', { className:'form-select', value:form.amount_unit || 'L', onChange:e=>up('amount_unit',e.target.value) },
          React.createElement('option', null, 'L'),
          React.createElement('option', null, 'kg'),
          React.createElement('option', null, 'm²'),
          React.createElement('option', null, '畝'),
          React.createElement('option', null, '反'),
        )
      )
    ),

    // ── 畝づくり専用: 作業項目・肥料・マルチ（紙日報「圃場作り」に対応） ──
    form.work_type === '畝づくり' && React.createElement('div', {
      style:{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:'10px', padding:'16px', marginBottom:'14px' }
    },
      React.createElement('div', { style:{ fontSize:'12px', fontWeight:700, color:'#B45309', marginBottom:'12px', display:'flex', alignItems:'center', gap:'6px' } },
        React.createElement('i', { className:'ti ti-shovel', style:{ fontSize:'14px' } }),
        '畝づくり作業の詳細'
      ),
      // 畝範囲（任意）— 管理表の「ベッド作成日」列のように畝と紐づけたい人向け。空でもOK。
      React.createElement('div', { className:'form-group', style:{ marginBottom:'12px' } },
        React.createElement('label', { className:'form-label' }, '畝範囲（任意）'),
        React.createElement('input', { type:'text', className:'form-input', value:form.row_range || '', onChange:e=>up('row_range', e.target.value), placeholder:'例: 1-6 / 空欄でもOK', style:{ maxWidth:'240px' } })
      ),
      // 作業項目（紙日報の 1〜8 に対応するボタン選択）
      React.createElement('div', { className:'form-group', style:{ marginBottom:'12px' } },
        React.createElement('label', { className:'form-label' }, '作業項目'),
        React.createElement('div', { style:{ display:'flex', gap:'8px', flexWrap:'wrap' } },
          ['草刈り・モア', '施肥（ブロキャス）', '施肥（ブレンドキャスター）', '溝切り', '耕耘', '耕耘（ベッド前）', 'ベッド作り', 'その他'].map(itemName =>
            React.createElement('button', {
              key: itemName,
              onClick: () => up('bed_work_item', form.bed_work_item === itemName ? '' : itemName),
              style:{
                padding:'6px 14px', borderRadius:'20px', fontSize:'12px', fontWeight:600,
                cursor:'pointer', border:'1.5px solid', transition:'all .12s',
                borderColor: form.bed_work_item === itemName ? '#B45309' : '#DDE2EC',
                background:  form.bed_work_item === itemName ? '#FEF3C7' : '#F8FAFC',
                color:       form.bed_work_item === itemName ? '#B45309' : '#64748B',
              }
            }, itemName)
          )
        )
      ),
      // 使用した肥料名・袋数
      React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'12px', marginBottom:'12px' } },
        React.createElement('div', { className:'form-group', style:{ marginBottom:0 } },
          React.createElement('label', { className:'form-label' }, '使用した肥料名'),
          React.createElement('input', {
            type:'text', className:'form-input', value:form.bed_fertilizer_name || '',
            placeholder:'例: 苦土重焼燐', onChange:e=>up('bed_fertilizer_name',e.target.value),
          })
        ),
        React.createElement('div', { className:'form-group', style:{ marginBottom:0 } },
          React.createElement('label', { className:'form-label' }, '使用袋数'),
          React.createElement('input', {
            type:'number', className:'form-input', min:0, value:form.bed_fertilizer_bags || '',
            placeholder:'例: 3', onChange:e=>up('bed_fertilizer_bags',e.target.value),
          })
        )
      ),
      // マルチ種類・使用本数・機械No.
      React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px' } },
        React.createElement('div', { className:'form-group', style:{ marginBottom:0 } },
          React.createElement('label', { className:'form-label' }, 'マルチ種類'),
          React.createElement('select', { className:'form-select', value:form.mulch_type || '', onChange:e=>up('mulch_type',e.target.value) },
            React.createElement('option', { value:'' }, '—'),
            React.createElement('option', null, 'ビニール'),
            React.createElement('option', null, '崩壊'),
          )
        ),
        React.createElement('div', { className:'form-group', style:{ marginBottom:0 } },
          React.createElement('label', { className:'form-label' }, 'マルチ使用本数'),
          React.createElement('input', {
            type:'number', className:'form-input', min:0, value:form.mulch_rolls || '',
            placeholder:'例: 2', onChange:e=>up('mulch_rolls',e.target.value),
          })
        ),
        React.createElement('div', { className:'form-group', style:{ marginBottom:0 } },
          React.createElement('label', { className:'form-label' }, '機械No.'),
          React.createElement('input', {
            type:'text', className:'form-input', value:form.machine_no || '',
            placeholder:'例: トラクター-01', onChange:e=>up('machine_no',e.target.value),
          })
        )
      )
    ),

    // ── 播種・定植専用: 品種・枚数・畝数・は種日（紙日報「播種・定植」に対応） ──
    (form.work_type === '播種' || form.work_type === '定植') && React.createElement('div', {
      style:{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:'10px', padding:'16px', marginBottom:'14px' }
    },
      React.createElement('div', { style:{ fontSize:'12px', fontWeight:700, color:'#0A6B52', marginBottom:'12px', display:'flex', alignItems:'center', gap:'6px' } },
        React.createElement('i', { className:'ti ti-plant-2', style:{ fontSize:'14px' } }),
        (form.work_type === '播種' ? '播種' : '定植') + '作業の詳細'
      ),
      React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'12px' } },
        React.createElement('div', { className:'form-group', style:{ marginBottom:0 } },
          React.createElement('label', { className:'form-label' }, '品種・苗の種類'),
          React.createElement('input', {
            type:'text', className:'form-input', value:form.variety || '',
            placeholder:'例: ブルラッシュ', onChange:e=>up('variety',e.target.value),
          })
        ),
        React.createElement('div', { className:'form-group', style:{ marginBottom:0 } },
          React.createElement('label', { className:'form-label' }, form.work_type === '播種' ? '播種枚数' : '定植枚数'),
          React.createElement('input', {
            type:'number', className:'form-input', min:0, value:form.tray_count || '',
            placeholder:'例: 80', onChange:e=>up('tray_count',e.target.value),
          })
        )
      ),
      React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px' } },
        React.createElement('div', { className:'form-group', style:{ marginBottom:0 } },
          React.createElement('label', { className:'form-label' }, '作業畝数'),
          React.createElement('input', {
            type:'number', className:'form-input', min:0, value:form.rows_worked || '',
            placeholder:'例: 7', onChange:e=>up('rows_worked',e.target.value),
          })
        ),
        form.work_type === '定植' && React.createElement('div', { className:'form-group', style:{ marginBottom:0 } },
          React.createElement('label', { className:'form-label' }, 'は種日'),
          React.createElement('input', {
            type:'date', className:'form-input', value:form.seed_date || '',
            onChange:e=>up('seed_date',e.target.value),
          })
        ),
        React.createElement('div', { className:'form-group', style:{ marginBottom:0 } },
          React.createElement('label', { className:'form-label' }, '機械No.'),
          React.createElement('input', {
            type:'text', className:'form-input', value:form.machine_no || '',
            placeholder:'例: 定植機45', onChange:e=>up('machine_no',e.target.value),
          })
        )
      )
    ),
    // 【実装手順書 Step1】備考・メモ＋転記チェック（紙日報の□管理表／□肥料在庫表／
    // □農薬・肥料管理／□レタス管理表／□SAに対応）。以前は農薬散布以外でのみ表示していたが、
    // 農薬散布の日報にも備考を残せるよう全作業種で表示するように変更。

    // ── 農薬散布専用: 使用方法・使用機械・散布液量管理 ──
    form.work_type === '農薬散布' && React.createElement('div', {
      style:{ background:'#F8FAFF', border:'1px solid #E0E8F8', borderRadius:'10px', padding:'16px', marginBottom:'14px' }
    },
      React.createElement('div', { style:{ fontSize:'12px', fontWeight:700, color:'#1D4ED8', marginBottom:'12px', display:'flex', alignItems:'center', gap:'6px' } },
        React.createElement('i', { className:'ti ti-clipboard-list', style:{ fontSize:'14px' } }),
        '散布作業の詳細'
      ),
      // 使用方法（ボタン選択）
      React.createElement('div', { className:'form-group', style:{ marginBottom:'12px' } },
        React.createElement('label', { className:'form-label' }, '使用方法'),
        React.createElement('div', { style:{ display:'flex', gap:'8px', flexWrap:'wrap' } },
          ['散布', '株元散布', '土壌混和', '灌注'].map(method =>
            React.createElement('button', {
              key: method,
              onClick: () => up('spray_method', form.spray_method === method ? '' : method),
              style:{
                padding:'6px 14px', borderRadius:'20px', fontSize:'12px', fontWeight:600,
                cursor:'pointer', border:'1.5px solid', transition:'all .12s',
                borderColor: form.spray_method === method ? '#1D4ED8' : '#DDE2EC',
                background:  form.spray_method === method ? '#EFF6FF' : '#F8FAFC',
                color:       form.spray_method === method ? '#1D4ED8' : '#64748B',
              }
            }, method)
          )
        )
      ),
      // 使用機械No.
      React.createElement('div', { className:'form-group', style:{ marginBottom:'12px' } },
        React.createElement('label', { className:'form-label' }, '使用機械No.　'),
        React.createElement('input', {
          type: 'text', className: 'form-input',
          value: form.machine_no, placeholder: '例: 散布機-01',
          onChange: e => up('machine_no', e.target.value),
          style:{ maxWidth:'240px' }
        })
      ),
      // 作った散布液量 / 廃棄した散布液量
      React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' } },
        React.createElement('div', { className:'form-group', style:{ marginBottom:0 } },
          React.createElement('label', { className:'form-label' }, '作った散布液量'),
          React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'6px' } },
            React.createElement('input', {
              type:'number', className:'form-input', min:0, step:0.1,
              value: form.spray_made_L, placeholder:'例: 100',
              onChange: e => up('spray_made_L', e.target.value),
            }),
            React.createElement('span', { style:{ fontSize:'13px', color:'#64748B', fontWeight:600, flexShrink:0 } }, 'L')
          )
        ),
        React.createElement('div', { className:'form-group', style:{ marginBottom:0 } },
          React.createElement('label', { className:'form-label' }, '廃棄した散布液量'),
          React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'6px' } },
            React.createElement('input', {
              type:'number', className:'form-input', min:0, step:0.1,
              value: form.spray_discarded_L, placeholder:'例: 5',
              onChange: e => up('spray_discarded_L', e.target.value),
            }),
            React.createElement('span', { style:{ fontSize:'13px', color:'#64748B', fontWeight:600, flexShrink:0 } }, 'L')
          )
        )
      )
    ),
    React.createElement(NoteChecklistField, {
      note: form.note,
      onNoteChange: v => up('note', v),
      checks: form.checks,
      onChecksChange: v => up('checks', v),
      checkKeys: ['mgmt_table', 'pesticide_fert', 'lettuce_table', 'sa'],
    }),
    // 【廃棄物記入】紙の作業日報にある欄。任意。GAP廃棄物管理(FV-Smart 25)の記録として活用する。
    React.createElement('div', { style:{ padding:'0 2px 12px' } },
      React.createElement('label', { style:{ display:'block', fontSize:'12px', fontWeight:600, color:'#64748B', margin:'2px 0 4px' } }, '廃棄物（任意）'),
      React.createElement('input', { type:'text', className:'form-input', value: form.waste || '', onChange: e => up('waste', e.target.value),
        placeholder:'例: 農薬空容器3本 / 廃マルチ / 廃プラ（GAP廃棄物管理に活用）', style:{ width:'100%', boxSizing:'border-box' } })
    ),
    React.createElement('div', { style:{ display:'flex', justifyContent:'space-between' } },
      React.createElement('button', { className:'btn btn-ghost', onClick:onPrev }, '← 戻る'),
      React.createElement('button', { className:'btn btn-primary', disabled:form.work_type==='農薬散布'&&isOver, onClick:onNext }, '確認 →')
    )
  )
}

// ── ステップ4: 確認プレビュー → 保存 ──────────────
function RecordStep4({ form, dilution, selField, selP, isOver, onPrev, onSave, showContinueButton, onContinue }) {
  const workCfg = WORK_ICON_MAP[form.work_type] || WORK_ICON_MAP['その他']
  const fieldColor = selField ? selField.color : '#64748B'
  const rows = [
    ['calendar', '作業日',   form.date,                                       '#64748B'],
    ['user',     '作業者',   form.worker || '—',                               '#64748B'],
    ['plant-2',  '圃場',     selField ? selField.name + '（' + selField.crop + '）' : '—', fieldColor],
    [workCfg.icon, '作業内容', form.work_type,                                 workCfg.color],
    ['cloud',    '天気',     form.weather,                                     '#64748B'],
    ...(form.work_type === '農薬散布' && selP ? [
      ['spray',    '農薬',     selP.name,                                       '#DC2626'],
      ['droplet',  '希釈倍率', dilution + '倍',                                 '#2563EB'],
    ] : []),
    ...(form.work_type === '畝づくり' ? [
      ...(form.row_range ? [['layout-rows', '畝範囲', form.row_range, '#B45309']] : []),
      ...(form.bed_work_item ? [['shovel', '作業項目', form.bed_work_item, '#B45309']] : []),
      ...(form.bed_fertilizer_name ? [['leaf', '肥料', form.bed_fertilizer_name + (form.bed_fertilizer_bags ? '（' + form.bed_fertilizer_bags + '袋）' : ''), '#0D9972']] : []),
      ...(form.mulch_type ? [['layout-rows', 'マルチ', form.mulch_type + (form.mulch_rolls ? '（' + form.mulch_rolls + '本）' : ''), '#64748B']] : []),
    ] : []),
    ...((form.work_type === '播種' || form.work_type === '定植') ? [
      ...(form.variety ? [['plant-2', '品種・苗', form.variety, '#0D9972']] : []),
      ...(form.tray_count ? [['stack-2', (form.work_type === '播種' ? '播種枚数' : '定植枚数'), form.tray_count + '枚', '#0D9972']] : []),
      ...(form.rows_worked ? [['ruler-2', '作業畝数', form.rows_worked + '畝', '#64748B']] : []),
      ...(form.seed_date ? [['calendar', 'は種日', form.seed_date, '#64748B']] : []),
    ] : []),
    ['chart-bar', '使用量',  form.amount ? form.amount + ' ' + (form.amount_unit || 'L/kg') : '—', '#64748B'],
    ...(form.note ? [['notes', '備考', form.note, '#7C3AED']] : []),
    ...(form.waste ? [['trash', '廃棄物', form.waste, '#B45309']] : []),
    ...(form.photos && form.photos.length ? [['camera', '写真', form.photos.length + '枚', '#7C3AED']] : []),
  ]
  const multiFieldCount = (form.field_ids && form.field_ids.length > 1 && form.work_type !== '農薬散布') ? form.field_ids.length : 0
  // 【実装手順書 Step1】転記チェックの状況（チェックが1つも無くてもエラーではない）
  const checkedTranscribe = Object.values(form.checks || {}).filter(Boolean).length
  return React.createElement('div', null,
    React.createElement(SectionTitle, { icon:'checklist' }, '内容を確認して保存'),
    React.createElement('div', {
      style:{ background:'#F8FAFF', borderRadius:'10px', overflow:'hidden', marginBottom:'16px', boxShadow:'none', border:'1px solid #D8E0DA' }
    },
      ...rows.map(([icon, label, v, iconColor], i) =>
        React.createElement('div', {
          key: label,
          style:{ display:'flex', alignItems:'center', padding:'11px 16px', borderBottom: i < rows.length-1 ? '1px solid #F1F5F9' : 'none', fontSize:'14px' }
        },
          React.createElement('span', { style:{ display:'flex', alignItems:'center', gap:'6px', color:'#6B7280', width:'120px', flexShrink:0 } },
            React.createElement('i', { className:'ti ti-'+icon, 'aria-hidden':'true', style:{ fontSize:'14px', color: iconColor || '#64748B', flexShrink:0 } }),
            label
          ),
          React.createElement('span', { style:{ color:'#1A1F2E', fontWeight:600 } }, v)
        )
      )
    ),
    checkedTranscribe > 0 && React.createElement('div', { style:{ marginBottom:'16px' } },
      React.createElement(TranscribeStatusBadge, {
        checks: form.checks,
        checkKeys: ['mgmt_table', 'pesticide_fert', 'lettuce_table', 'sa'],
      })
    ),
    selField && React.createElement('div', {
      style:{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 14px', background:selField.color+'12', border:'1px solid '+selField.color+'40', borderRadius:'8px', marginBottom:'16px', fontSize:'12px', color:'#374151' }
    },
      React.createElement('div', { style:{ width:8, height:8, borderRadius:'50%', background:selField.color } }),
      multiFieldCount > 0
        ? ('保存すると ' + multiFieldCount + ' 圃場に同じ内容で一括記録されます（写真は主圃場「' + selField.name + '」に添付）')
        : ('保存すると ' + selField.name + ' の記録に追加されます')
    ),
    // UX-10: 保存後に「続けて入力」ボタンを表示（3秒で自動非表示）
    showContinueButton && React.createElement('div', {
      style:{ 
        display:'flex', alignItems:'center', gap:'12px', padding:'12px 14px', 
        background:'#ECFDF5', border:'1px solid #A7F3D0', borderRadius:'8px', 
        marginBottom:'16px', fontSize:'13px', color:'#065F46', animation:'slideDown .3s ease-out'
      }
    },
      React.createElement('i', { className:'ti ti-check', 'aria-hidden':'true', style:{ fontSize:'16px', color:'#059669' } }),
      React.createElement('span', { style:{ flex:1 } }, '✓ 保存しました。'),
      React.createElement('button', {
        className:'btn',
        onClick: onContinue,
        style:{ 
          background:'#10B981', color:'#FFFFFF', padding:'6px 12px', fontSize:'12px',
          border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:600,
          transition:'opacity .15s'
        }
      }, '続けて入力 →')
    ),
    // 【フェーズ2】散布記録サマリーカード — 農薬散布の保存完了後、印刷/PDF出力ボタンを表示
    showContinueButton && form.work_type === '農薬散布' && selP && React.createElement('div', {
      style:{
        border:'1px solid #DDE2EC', borderRadius:'8px', padding:'14px 16px',
        marginBottom:'16px', background:'#F8FAFC', animation:'slideDown .3s ease-out'
      }
    },
      React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px' } },
        React.createElement('i', { className:'ti ti-file-text', 'aria-hidden':'true', style:{ fontSize:'16px', color:'#0D9972' } }),
        React.createElement('span', { style:{ fontSize:'13px', fontWeight:600, color:'#374151' } }, '散布記録サマリー')
      ),
      React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280', marginBottom:'10px', lineHeight:1.7 } },
        form.date + ' ／ ' + (selField ? selField.name : '—') + ' ／ ' + selP.name + '（' + dilution + '倍）／ 使用量 ' + (form.amount || '—') + 'L'
      ),
      React.createElement('div', { style:{ display:'flex', gap:'8px' } },
        React.createElement('button', {
          className:'btn btn-ghost',
          onClick: () => printSingleSprayRecord({ ...form, id: form.id || Date.now(), dilution, field_id: String(form.field_id), pesticide_id: selP.id }, [selField], [selP]),
          style:{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', padding:'6px 14px' }
        },
          React.createElement('i', { className:'ti ti-printer', 'aria-hidden':'true' }),
          '印刷'
        ),
        React.createElement('button', {
          className:'btn btn-ghost',
          onClick: () => exportSingleSprayRecordPDF({ ...form, id: form.id || Date.now(), dilution, field_id: String(form.field_id), pesticide_id: selP.id }, [selField], [selP]),
          style:{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', padding:'6px 14px' }
        },
          React.createElement('i', { className:'ti ti-file-download', 'aria-hidden':'true' }),
          'PDF出力'
        )
      )
    ),
    React.createElement('div', { style:{ display:'flex', justifyContent:'space-between' } },
      React.createElement('button', { className:'btn btn-ghost', onClick:onPrev }, '← 戻る'),
      React.createElement('button', {
        className:'btn btn-primary',
        disabled: isOver,
        onClick: onSave,
        style:{ padding:'10px 28px', fontSize:'14px' }
      }, '✓ 保存する')
    )
  )
}

// ── RecordDetailModal: 詳細モーダル（表示・編集・削除）────────────────
function RecordDetailModal({ record, fields, pesticides, onClose, onUpdate, onDelete }) {
  const [isEditing, setIsEditing] = React.useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false)
  const [form, setForm] = React.useState({ ...record })
  const f = masterById(fields, record.field_id)
  const p = masterById(pesticides, record.pesticide_id)
  const cfg = WORK_ICON_MAP[record.work_type] || WORK_ICON_MAP['その他']
  const uf = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  // 更新/削除はawaitし、ok===trueの時だけ閉じる。失敗時(RPCロールバック等)は編集/確認画面を保持し入力を消さない
  const busyRef = React.useRef(false)
  const handleUpdate = async () => {
    if (!onUpdate) { setIsEditing(false); onClose(); return }
    if (busyRef.current) return; busyRef.current = true
    const res = await Promise.resolve(onUpdate({ ...form, field_id: String(form.field_id) })).catch(() => null)
    busyRef.current = false
    if (res && res.ok === true) { setIsEditing(false); onClose() } // 失敗時は編集画面を保持
  }
  const handleDelete = async () => {
    if (!onDelete) { onClose(); return }
    if (busyRef.current) return; busyRef.current = true
    const res = await Promise.resolve(onDelete(record.id)).catch(() => null)
    busyRef.current = false
    if (res && res.ok === true) onClose() // 失敗時は確認画面を保持
  }

  const labelStyle = { fontSize:'10px', fontWeight:700, color:'#4B5563', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:'5px' }
  const rowStyle   = { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #F1F5F9', fontSize:'13px' }

  return React.createElement('div', {
    style:{ position:'fixed', inset:0, background:'rgba(17,24,39,.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' },
    onClick: onClose
  },
    React.createElement('div', {
      style:{ background:'#FFFFFF', borderRadius:'12px', padding:'24px', width:'480px', maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.2)', animation:'fadeInDown .18s ease' },
      onClick: e => e.stopPropagation()
    },
      // ヘッダー
      React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' } },
        React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'10px' } },
          React.createElement('div', { style:{ width:36, height:36, borderRadius:'50%', background:cfg.color, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 } },
            React.createElement('i', { className:'ti ti-'+cfg.icon, style:{ fontSize:'18px', color:'#FFFFFF' } })
          ),
          React.createElement('div', null,
            React.createElement('div', { style:{ fontSize:'15px', fontWeight:700, color:'#111827' } }, record.work_type),
            React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280' } }, record.date + (f ? '　' + f.name : ''))
          )
        ),
        React.createElement('button', {
          onClick: onClose,
          style:{ background:'none', border:'none', cursor:'pointer', fontSize:'20px', color:'#9CA3AF', lineHeight:1, padding:'4px' }
        }, '✕')
      ),

      // --- 表示モード ---
      !isEditing && React.createElement('div', null,
        React.createElement('div', { style:{ background:'#F8FAF8', borderRadius:'8px', padding:'4px 12px', marginBottom:'16px' } },
          React.createElement('div', { style:rowStyle },
            React.createElement('span', { style:{ color:'#6B7280' } }, '日付'),
            React.createElement('span', { style:{ fontWeight:600 } }, record.date)
          ),
          React.createElement('div', { style:rowStyle },
            React.createElement('span', { style:{ color:'#6B7280' } }, '圃場'),
            React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'6px', fontWeight:600 } },
              f && React.createElement('div', { style:{ width:8, height:8, borderRadius:'50%', background:f.color } }),
              f ? f.name : '—'
            )
          ),
          React.createElement('div', { style:rowStyle },
            React.createElement('span', { style:{ color:'#6B7280' } }, '作業種'),
            React.createElement('span', { style:{ fontWeight:600 } }, record.work_type)
          ),
          React.createElement('div', { style:rowStyle },
            React.createElement('span', { style:{ color:'#6B7280' } }, '天気'),
            React.createElement('span', null, record.weather || '—')
          ),
          React.createElement('div', { style:rowStyle },
            React.createElement('span', { style:{ color:'#6B7280' } }, '作業者'),
            React.createElement('span', null, record.worker || '—')
          ),
          record.work_type === '農薬散布' && React.createElement('div', { style:rowStyle },
            React.createElement('span', { style:{ color:'#6B7280' } }, '使用農薬'),
            React.createElement('span', { style:{ fontWeight:600, color:'#B45309' } }, p ? p.name : '—')
          ),
          record.work_type === '農薬散布' && React.createElement('div', { style:rowStyle },
            React.createElement('span', { style:{ color:'#6B7280' } }, '希釈倍率'),
            React.createElement('span', null, record.dilution ? record.dilution + '倍' : '—')
          ),
          record.work_type === '農薬散布' && React.createElement('div', { style:rowStyle },
            React.createElement('span', { style:{ color:'#6B7280' } }, '散布量'),
            React.createElement('span', null, record.amount ? record.amount + ' L/10a' : '—')
          ),
          record.work_type === '農薬散布' && React.createElement('div', { style:rowStyle },
            React.createElement('span', { style:{ color:'#6B7280' } }, '使用方法'),
            React.createElement('span', { style:{ fontWeight:600 } }, record.spray_method || '—')
          ),
          record.work_type === '農薬散布' && React.createElement('div', { style:rowStyle },
            React.createElement('span', { style:{ color:'#6B7280' } }, '使用機械No.'),
            React.createElement('span', null, record.machine_no || '—')
          ),
          record.work_type === '農薬散布' && React.createElement('div', { style:rowStyle },
            React.createElement('span', { style:{ color:'#6B7280' } }, '作った散布液量'),
            React.createElement('span', null, record.spray_made_L ? record.spray_made_L + ' L' : '—')
          ),
          record.work_type === '農薬散布' && React.createElement('div', { style:rowStyle },
            React.createElement('span', { style:{ color:'#6B7280' } }, '廃棄した散布液量'),
            React.createElement('span', null, record.spray_discarded_L ? record.spray_discarded_L + ' L' : '—')
          ),
          // 開始・終了・所要時間
          (record.start_time || record.end_time) && React.createElement('div', { style:rowStyle },
            React.createElement('span', { style:{ color:'#6B7280' } }, '作業時間'),
            React.createElement('span', null,
              (record.start_time || '—') + ' 〜 ' + (record.end_time || '—') +
              (record.break_minutes ? '　休憩 ' + record.break_minutes + '分' : '')
            )
          ),
          React.createElement('div', { style:rowStyle },
            React.createElement('span', { style:{ color:'#6B7280' } }, '備考'),
            React.createElement('span', { style:{ color: record.note ? '#374151' : '#9CA3AF' } }, record.note || 'なし')
          ),
          React.createElement('div', { style:{ ...rowStyle, borderBottom:'none' } },
            React.createElement('span', { style:{ color:'#6B7280' } }, '廃棄物'),
            React.createElement('span', { style:{ color: record.waste ? '#374151' : '#9CA3AF' } }, record.waste || 'なし')
          )
        ),
        // 【写真】添付写真のサムネイル（クリックで別タブ表示）
        record.photos && record.photos.length > 0 && React.createElement('div', { style:{ marginBottom:'16px' } },
          React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280', marginBottom:'6px' } }, '写真'),
          React.createElement('div', { style:{ display:'flex', flexWrap:'wrap', gap:'8px' } },
            ...record.photos.map((src, i) =>
              React.createElement('a', { key:i, href:src, target:'_blank', rel:'noopener', style:{ display:'block', width:80, height:80, borderRadius:'8px', overflow:'hidden', border:'1px solid #E5E7EB' } },
                React.createElement('img', { src, style:{ width:'100%', height:'100%', objectFit:'cover', display:'block' } })
              )
            )
          )
        ),
        // 【実装手順書 Step1】転記チェック状況
        React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'16px' } },
          React.createElement('span', { style:{ fontSize:'12px', color:'#6B7280' } }, '転記チェック'),
          React.createElement(TranscribeStatusBadge, {
            checks: record.checks,
            checkKeys: ['mgmt_table', 'pesticide_fert', 'lettuce_table', 'sa'],
          })
        ),
        // ボタン群（表示モード）
        React.createElement('div', { style:{ display:'flex', gap:'8px' } },
          onUpdate && React.createElement('button', {
            className:'btn btn-ghost',
            style:{ flex:1, justifyContent:'center', gap:'6px' },
            onClick: () => setIsEditing(true)
          },
            React.createElement('i', { className:'ti ti-pencil', style:{ fontSize:'14px' } }),
            '編集'
          ),
          onDelete && !showDeleteConfirm && React.createElement('button', {
            onClick: () => setShowDeleteConfirm(true),
            style:{
              flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'6px',
              padding:'9px 18px', borderRadius:'4px', fontSize:'14px', fontWeight:600,
              cursor:'pointer', border:'1.5px solid #FCA5A5', background:'#FEF2F2', color:'#DC2626'
            }
          },
            React.createElement('i', { className:'ti ti-trash', style:{ fontSize:'14px' } }),
            '削除'
          ),
          showDeleteConfirm && React.createElement('div', { style:{ flex:1, display:'flex', gap:'6px' } },
            React.createElement('button', {
              onClick: handleDelete,
              style:{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'4px', padding:'9px', borderRadius:'4px', fontSize:'13px', fontWeight:700, cursor:'pointer', border:'none', background:'#DC2626', color:'#fff' }
            }, '本当に削除する'),
            React.createElement('button', {
              onClick: () => setShowDeleteConfirm(false),
              style:{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'9px', borderRadius:'4px', fontSize:'13px', fontWeight:600, cursor:'pointer', border:'1px solid #D8E4D8', background:'#fff', color:'#374151' }
            }, 'キャンセル')
          )
        )
      ),

      // --- 編集モード ---
      isEditing && React.createElement('div', null,
        React.createElement('div', { style:{ marginBottom:'12px' } },
          React.createElement('label', { style:labelStyle }, '日付'),
          React.createElement('input', { type:'date', value:form.date, onChange:e=>uf('date',e.target.value), className:'form-input' })
        ),
        React.createElement('div', { style:{ marginBottom:'12px' } },
          React.createElement('label', { style:labelStyle }, '圃場'),
          React.createElement('select', { value:String(form.field_id), onChange:e=>uf('field_id',e.target.value), className:'form-select' },
            ...fields.map(x => React.createElement('option', { key:x.id, value:String(x.id) }, x.name))
          )
        ),
        React.createElement('div', { style:{ marginBottom:'12px' } },
          React.createElement('label', { style:labelStyle }, '作業種'),
          React.createElement('select', { value:form.work_type, onChange:e=>uf('work_type',e.target.value), className:'form-select' },
            ...Object.keys(WORK_ICON_MAP).map(w => React.createElement('option', { key:w, value:w }, w))
          )
        ),
        React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'12px' } },
          React.createElement('div', null,
            React.createElement('label', { style:labelStyle }, '天気'),
            React.createElement('select', { value:form.weather||'晴', onChange:e=>uf('weather',e.target.value), className:'form-select' },
              ...['晴','曇','雨','雪'].map(w => React.createElement('option', { key:w, value:w }, w))
            )
          ),
          React.createElement('div', null,
            React.createElement('label', { style:labelStyle }, '作業者'),
            React.createElement('input', { type:'text', value:form.worker||'', onChange:e=>uf('worker',e.target.value), placeholder:'作業者名', className:'form-input' })
          )
        ),
        form.work_type === '農薬散布' && pesticides && React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px', marginBottom:'12px' } },
          React.createElement('div', null,
            React.createElement('label', { style:labelStyle }, '農薬'),
            React.createElement('select', { value:String(form.pesticide_id||''), onChange:e=>uf('pesticide_id', e.target.value || null), className:'form-select' }, // UUID保持: Number()はNaN化するため禁止
              React.createElement('option', { value:'' }, '—'),
              ...pesticides.map(x => React.createElement('option', { key:x.id, value:String(x.id) }, x.name))
            )
          ),
          React.createElement('div', null,
            React.createElement('label', { style:labelStyle }, '希釈倍率'),
            React.createElement('input', { type:'number', value:form.dilution||'', onChange:e=>uf('dilution',Number(e.target.value)), placeholder:'1000', className:'form-input' })
          ),
          React.createElement('div', null,
            React.createElement('label', { style:labelStyle }, '散布量(L)'),
            React.createElement('input', { type:'number', value:form.amount||'', onChange:e=>uf('amount',Number(e.target.value)), placeholder:'50', className:'form-input' })
          )
        ),
        // ── 農薬散布専用: 使用方法・機械・散布液量 ──
        form.work_type === '農薬散布' && React.createElement('div', {
          style:{ background:'#F8FAFF', border:'1px solid #E0E8F8', borderRadius:'8px', padding:'12px', marginBottom:'12px' }
        },
          React.createElement('div', { style:{ fontSize:'11px', fontWeight:700, color:'#1D4ED8', marginBottom:'10px' } }, '散布作業の詳細'),
          React.createElement('div', { style:{ marginBottom:'10px' } },
            React.createElement('label', { style:labelStyle }, '使用方法'),
            React.createElement('div', { style:{ display:'flex', gap:'6px', flexWrap:'wrap' } },
              ['散布', '株元散布', '土壌混和', '灌注'].map(method =>
                React.createElement('button', {
                  key: method,
                  onClick: () => uf('spray_method', form.spray_method === method ? '' : method),
                  style:{
                    padding:'4px 12px', borderRadius:'20px', fontSize:'11px', fontWeight:600,
                    cursor:'pointer', border:'1.5px solid', transition:'all .12s',
                    borderColor: form.spray_method === method ? '#1D4ED8' : '#DDE2EC',
                    background:  form.spray_method === method ? '#EFF6FF' : '#F8FAFC',
                    color:       form.spray_method === method ? '#1D4ED8' : '#64748B',
                  }
                }, method)
              )
            )
          ),
          React.createElement('div', { style:{ marginBottom:'10px' } },
            React.createElement('label', { style:labelStyle }, '使用機械No.'),
            React.createElement('input', { type:'text', value:form.machine_no||'', onChange:e=>uf('machine_no',e.target.value), placeholder:'例: 散布機-01', className:'form-input' })
          ),
          React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' } },
            React.createElement('div', null,
              React.createElement('label', { style:labelStyle }, '作った散布液量(L)'),
              React.createElement('input', { type:'number', min:0, step:0.1, value:form.spray_made_L||'', onChange:e=>uf('spray_made_L',e.target.value), placeholder:'例: 100', className:'form-input' })
            ),
            React.createElement('div', null,
              React.createElement('label', { style:labelStyle }, '廃棄した散布液量(L)'),
              React.createElement('input', { type:'number', min:0, step:0.1, value:form.spray_discarded_L||'', onChange:e=>uf('spray_discarded_L',e.target.value), placeholder:'例: 5', className:'form-input' })
            )
          )
        ),
        // ── 作業時間 ──
        React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px', marginBottom:'12px' } },
          React.createElement('div', null,
            React.createElement('label', { style:labelStyle }, '開始時刻'),
            React.createElement('input', { type:'time', value:form.start_time||'', onChange:e=>uf('start_time',e.target.value), className:'form-input' })
          ),
          React.createElement('div', null,
            React.createElement('label', { style:labelStyle }, '終了時刻'),
            React.createElement('input', { type:'time', value:form.end_time||'', onChange:e=>uf('end_time',e.target.value), className:'form-input' })
          ),
          React.createElement('div', null,
            React.createElement('label', { style:labelStyle }, '休憩（分）'),
            React.createElement('input', { type:'number', min:0, step:15, value:form.break_minutes||'', onChange:e=>uf('break_minutes',Number(e.target.value)), className:'form-input' })
          )
        ),
        React.createElement(NoteChecklistField, {
          note: form.note,
          onNoteChange: v => uf('note', v),
          checks: form.checks,
          onChecksChange: v => uf('checks', v),
          checkKeys: ['mgmt_table', 'pesticide_fert', 'lettuce_table', 'sa'],
          defaultOpen: true,
        }),
        React.createElement('div', { style:{ display:'flex', gap:'8px' } },
          React.createElement('button', { className:'btn btn-primary', style:{ flex:1, justifyContent:'center' }, onClick:handleUpdate },
            React.createElement('i', { className:'ti ti-check', style:{ fontSize:'14px' } }), '　保存する'
          ),
          React.createElement('button', { className:'btn btn-ghost', style:{ flex:1, justifyContent:'center' }, onClick:()=>{ setForm({...record}); setIsEditing(false) } }, 'キャンセル')
        )
      )
    )
  )
}

// ── UX-04: 記録一覧テーブル（検索・絞り込み対応）────────────────
function RecordTable({ records, fields, pesticides, onUpdate, onDelete, cropCycles=[], onUpdateRecordCycle, focusRecordId, onClearFocus }) {
  // UX-04: 検索・フィルター state
  const [query,      setQuery]      = React.useState('')
  const [filterWork, setFilterWork] = React.useState('all')
  const [filterField,setFilterField]= React.useState('all')
  const [dateFrom,   setDateFrom]   = React.useState('')
  const [dateTo,     setDateTo]     = React.useState('')
  const [expanded,   setExpanded]   = React.useState(false)
  const [selectedRecord, setSelectedRecord] = React.useState(null)

  // 整合性チェックからの「該当箇所を開く」: 指定IDの記録の編集モーダルを自動で開く（一発ジャンプ）
  React.useEffect(() => {
    if (focusRecordId == null) return
    const rec = records.find(r => r.id === focusRecordId)
    if (rec) { setSelectedRecord(rec); setQuery('') }
    if (onClearFocus) onClearFocus()
  }, [focusRecordId])

  // UX-04: フィルタリングロジック
  const filtered = React.useMemo(() => {
    return [...records].reverse().filter(r => {
      const f = masterById(fields, r.field_id)
      // キーワード検索（圃場名・圃場番号・元表記・作業種・作業者・備考）
      // 【実装手順書 Step0】「9s」「3n」のような紙日報の元表記でも検索できるようにする
      if (query.trim()) {
        const q = query.trim().toLowerCase()
        const haystack = [
          f ? f.name : '',
          f ? (f.field_no || '') : '',
          f ? getFieldRawLabels(f).join(' ') : '',
          r.work_type,
          r.worker || '',
          r.note || '',
          r.date
        ].join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      // 作業種絞り込み
      if (filterWork !== 'all' && r.work_type !== filterWork) return false
      // 圃場絞り込み
      if (filterField !== 'all' && String(r.field_id) !== filterField) return false
      // 日付範囲
      if (dateFrom && r.date < dateFrom) return false
      if (dateTo   && r.date > dateTo)   return false
      return true
    })
  }, [records, fields, query, filterWork, filterField, dateFrom, dateTo])

  const hasFilter = query || filterWork !== 'all' || filterField !== 'all' || dateFrom || dateTo
  const clearAll  = () => { setQuery(''); setFilterWork('all'); setFilterField('all'); setDateFrom(''); setDateTo('') }

  // 作業種リスト（記録から動的生成）
  const workTypes = React.useMemo(() => [...new Set(records.map(r => r.work_type))].sort(), [records])

  return React.createElement('div', null,

    // ── UX-04: 検索バー ──
    React.createElement('div', {
      style:{
        background:'#fff', border:'1px solid #E2E8F0', borderRadius:'12px',
        padding:'14px 16px', marginBottom:'12px',
        boxShadow:'0 1px 4px rgba(0,0,0,.05)'
      }
    },
      // 1行目: キーワード検索 + 絞り込みトグル
      React.createElement('div', { style:{ display:'flex', gap:'8px', alignItems:'center' } },
        React.createElement('div', {
          style:{
            flex:1, display:'flex', alignItems:'center', gap:'8px',
            background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:'8px',
            padding:'0 12px', height:'36px'
          }
        },
          React.createElement('i', { className:'ti ti-search', style:{ color:'#94A3B8', fontSize:'15px', flexShrink:0 } }),
          React.createElement('input', {
            type:'text', value:query,
            onChange: e => setQuery(e.target.value),
            placeholder:'圃場名・作業種・作業者で検索…',
            style:{
              flex:1, border:'none', background:'transparent', outline:'none',
              fontSize:'13px', color:'#374151'
            }
          }),
          query && React.createElement('button', {
            onClick: () => setQuery(''),
            style:{ background:'none', border:'none', cursor:'pointer', color:'#94A3B8', padding:'0', lineHeight:1, fontSize:'16px' }
          }, '×')
        ),
        React.createElement('button', {
          onClick: () => setExpanded(v => !v),
          style:{
            display:'flex', alignItems:'center', gap:'5px', height:'36px',
            padding:'0 12px', borderRadius:'8px', fontSize:'12px', fontWeight:500,
            cursor:'pointer', transition:'all .15s', whiteSpace:'nowrap',
            background: expanded ? '#F0FDF9' : '#F8FAFC',
            border: expanded ? '1px solid #0D997255' : '1px solid #E2E8F0',
            color: expanded ? '#0D9972' : '#64748B'
          }
        },
          React.createElement('i', { className:'ti ti-adjustments-horizontal', style:{ fontSize:'14px' } }),
          '絞り込み',
          hasFilter && React.createElement('span', {
            style:{
              background:'#DC2626', color:'#fff', borderRadius:'50%',
              width:'16px', height:'16px', fontSize:'10px', fontWeight:700,
              display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1
            }
          }, [filterWork !== 'all', filterField !== 'all', !!dateFrom || !!dateTo].filter(Boolean).length || '')
        )
      ),

      // 2行目: 詳細フィルター（expanded 時のみ）
      expanded && React.createElement('div', {
        style:{
          marginTop:'12px', paddingTop:'12px',
          borderTop:'1px solid #F1F5F9',
          display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px',
          animation:'fadeInDown .18s ease'
        }
      },
        // 作業種
        React.createElement('div', null,
          React.createElement('div', { style:{ fontSize:'11px', color:'#6B7280', fontWeight:600, marginBottom:'4px', letterSpacing:'.03em' } }, '作業種'),
          React.createElement('select', {
            value: filterWork,
            onChange: e => setFilterWork(e.target.value),
            className:'form-select',
            style:{ fontSize:'12px', height:'32px', padding:'0 8px' }
          },
            React.createElement('option', { value:'all' }, 'すべて'),
            ...workTypes.map(w => React.createElement('option', { key:w, value:w },
              (WORK_ICON_MAP[w] ? WORK_ICON_MAP[w].emoji + ' ' : '') + w
            ))
          )
        ),
        // 圃場
        React.createElement('div', null,
          React.createElement('div', { style:{ fontSize:'11px', color:'#6B7280', fontWeight:600, marginBottom:'4px', letterSpacing:'.03em' } }, '圃場'),
          React.createElement('select', {
            value: filterField,
            onChange: e => setFilterField(e.target.value),
            className:'form-select',
            style:{ fontSize:'12px', height:'32px', padding:'0 8px' }
          },
            React.createElement('option', { value:'all' }, 'すべて'),
            ...fields.map(f => React.createElement('option', { key:f.id, value:String(f.id) }, f.name))
          )
        ),
        // 日付範囲
        React.createElement('div', null,
          React.createElement('div', { style:{ fontSize:'11px', color:'#6B7280', fontWeight:600, marginBottom:'4px', letterSpacing:'.03em' } }, '期間'),
          React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'4px' } },
            React.createElement('input', {
              type:'date', value:dateFrom,
              onChange: e => setDateFrom(e.target.value),
              className:'form-input',
              style:{ fontSize:'12px', height:'32px', padding:'0 6px', flex:1 }
            }),
            React.createElement('span', { style:{ color:'#94A3B8', fontSize:'12px', flexShrink:0 } }, '〜'),
            React.createElement('input', {
              type:'date', value:dateTo,
              onChange: e => setDateTo(e.target.value),
              className:'form-input',
              style:{ fontSize:'12px', height:'32px', padding:'0 6px', flex:1 }
            })
          )
        )
      ),

      // クリアボタン（フィルター適用中のみ）
      hasFilter && React.createElement('div', {
        style:{ marginTop:'10px', display:'flex', alignItems:'center', gap:'8px' }
      },
        React.createElement('span', { style:{ fontSize:'12px', color:'#64748B' } },
          filtered.length + ' / ' + records.length + ' 件を表示中'
        ),
        React.createElement('button', {
          onClick: clearAll,
          style:{
            fontSize:'11px', color:'#DC2626', background:'#FEF2F2',
            border:'1px solid #FCA5A5', borderRadius:'6px',
            padding:'2px 10px', cursor:'pointer', fontWeight:500
          }
        }, '✕ クリア')
      )
    ),

    // ── テーブル本体 ──
    React.createElement('div', { className:'card card-data' },
      filtered.length === 0
        ? React.createElement('div', {
            style:{ padding:'36px 24px', color:'#6B7280', fontSize:'14px', textAlign:'center' }
          },
            React.createElement('i', { className:'ti ti-' + (hasFilter ? 'search' : 'list-details'), 'aria-hidden':'true', style:{ fontSize:38, color:'#94A3B8', marginBottom:8, display:'block' } }),
            hasFilter
              ? React.createElement('div', null,
                  React.createElement('div', { style:{ fontWeight:500, color:'#374151' } }, '該当する記録が見つかりません'),
                  React.createElement('div', { style:{ fontSize:'12px', marginTop:'4px', color:'#94A3B8' } }, '検索条件を変えてみてください')
                )
              : React.createElement('div', null, '記録がまだありません')
          )
        : React.createElement('table', { className:'table' },
            React.createElement('thead', null,
              React.createElement('tr', null,
                ...['', '日付', '圃場', '作業', '作付け', '天気', '作業者', '転記', ''].map((h, i) => React.createElement('th', { key:i }, h))
              )
            ),
            React.createElement('tbody', null,
              ...filtered.map(r => {
                const f = masterById(fields, r.field_id)
                const cfg = WORK_ICON_MAP[r.work_type] || WORK_ICON_MAP['その他']
                // キーワードハイライト用ヘルパー
                const hl = (text) => {
                  if (!query.trim() || !text) return text
                  const q = query.trim()
                  const idx = text.toLowerCase().indexOf(q.toLowerCase())
                  if (idx < 0) return text
                  return React.createElement('span', null,
                    text.slice(0, idx),
                    React.createElement('mark', {
                      style:{ background:'#FEF08A', color:'#374151', borderRadius:'2px', padding:'0 1px' }
                    }, text.slice(idx, idx + q.length)),
                    text.slice(idx + q.length)
                  )
                }
                return React.createElement('tr', { key:r.id, style:{ cursor:'pointer' }, onClick: () => setSelectedRecord(r) },
                  React.createElement('td', { style:{ paddingRight:0 } },
                    React.createElement('div', {
                      style:{ width:24, height:24, borderRadius:'50%', background:cfg.color, display:'flex', alignItems:'center', justifyContent:'center' }
                    },
                      React.createElement('i', { className:'ti ti-'+cfg.icon, 'aria-hidden':'true', style:{ fontSize:'14px', color:'#FFFFFF' } })
                    )
                  ),
                  React.createElement('td', null, hl(r.date)),
                  React.createElement('td', null,
                    f && React.createElement('span', { style:{ display:'flex', alignItems:'center', gap:'6px' } },
                      React.createElement('div', { style:{ width:6, height:6, borderRadius:'50%', background:f.color } }),
                      hl(f.name)
                    )
                  ),
                  React.createElement('td', null, hl(r.work_type)),
                  React.createElement('td', { onClick: e => e.stopPropagation() },
                    onUpdateRecordCycle && React.createElement(CropCycleSelector, {
                      record: r,
                      cropCycles,
                      onUpdate: onUpdateRecordCycle
                    })
                  ),
                  React.createElement('td', { style:{ color:'#6B7280' } }, r.weather),
                  React.createElement('td', { style:{ color:'#6B7280' } }, hl(r.worker || '—')),
                  React.createElement('td', null,
                    React.createElement(TranscribeStatusBadge, {
                      checks: r.checks,
                      checkKeys: ['mgmt_table', 'pesticide_fert', 'lettuce_table', 'sa'],
                    })
                  ),
                  React.createElement('td', { style:{ paddingRight:'16px', textAlign:'right' }, onClick: e => e.stopPropagation() },
                    React.createElement('button', {
                      onClick: () => setSelectedRecord(r),
                      style:{
                        fontSize:'11px', fontWeight:600, color:'#0A6B52', background:'#F0FDF9',
                        border:'1px solid #6EE7B7', borderRadius:'6px', padding:'3px 10px',
                        cursor:'pointer', whiteSpace:'nowrap'
                      }
                    }, '詳細 / 編集')
                  )
                )
              })
            )
          )
    ),
    // 詳細モーダル
    selectedRecord && React.createElement(RecordDetailModal, {
      record: selectedRecord,
      fields,
      pesticides,
      onClose: () => setSelectedRecord(null),
      onUpdate: onUpdate ? (updated) => onUpdate(updated) : null, // 閉じるのはモーダル側(handleUpdate)が成功時のみ
      onDelete: onDelete ? (id) => onDelete(id) : null,
    })
  )
}

// =====================================================
// 【写真アップロード】端末の画像を縮小・JPEG圧縮してdataURL化するヘルパー。
// localStorage肥大化を防ぐため、長辺を縮小し画質を落とす。容量ガードと併用し、
// 上限超過時は写真だけ拒否して記録本体の保存は決して妨げない（データ破損防止）。
// 将来的に外部ストレージ(Supabase Storage等)へ差し替え可能な独立ユーティリティ。
// =====================================================
const PHOTO_MAX_DIM            = 1000        // 長辺の最大px
const PHOTO_QUALITY            = 0.55        // JPEG品質
const PHOTO_MAX_PER_RECORD     = 2           // 1記録あたりの最大枚数
const PHOTO_STORAGE_BUDGET     = 4 * 1024 * 1024  // localStorage(約5MB)に対する安全上限(バイト)

function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) { reject(new Error('not-image')); return }
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        let w = img.width, h = img.height
        const scale = Math.min(1, PHOTO_MAX_DIM / Math.max(w, h))
        w = Math.round(w * scale); h = Math.round(h * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        try { canvas.getContext('2d').drawImage(img, 0, 0, w, h); resolve(canvas.toDataURL('image/jpeg', PHOTO_QUALITY)) }
        catch (e) { reject(e) }
      }
      img.onerror = () => reject(new Error('decode-failed'))
      img.src = reader.result
    }
    reader.onerror = () => reject(new Error('read-failed'))
    reader.readAsDataURL(file)
  })
}

// =====================================================
// 【記録完了アニメーション】celebrateSave — 保存した瞬間に「丸にチェック＋紙吹雪」を再生。
// 高齢の利用者が多く、農作業は楽しくないという前提のため、入力し終えた達成感を演出して
// 「ただのデータ入力」を少しでも報われる体験にする。DOMを直接生成するので全フォームから
// 1行で呼べる（Reactの状態を各フォームに配線しなくてよい）。CSSは app.css に定義。
// =====================================================
// 保存演出の設定（端末ごとに保存）。full=紙吹雪 / lite=一瞬の軽い通知 / off=なし。
// 毎日何十回も入力する熟練スタッフが、演出の重さを避けて軽快に使えるようにする。
const SAVE_EFFECT_KEY = 'sb_save_effect'
function getSaveEffectPref() {
  try { const v = localStorage.getItem(SAVE_EFFECT_KEY); return (v === 'lite' || v === 'off') ? v : 'full' } catch (_) { return 'full' }
}
function setSaveEffectPref(v) {
  try { localStorage.setItem(SAVE_EFFECT_KEY, v) } catch (_) {}
}

function celebrateSave(message) {
  try {
    const pref = getSaveEffectPref()
    if (pref === 'off') return                                              // 演出なし（最速）
    if (pref === 'lite') { showToast(message || '記録しました', 'success', { ttl: 1100 }); return } // 一瞬の軽い通知
    document.querySelectorAll('.sb-celeb-overlay').forEach(n => n.remove())
    const colors = ['#10B981','#34D399','#FBBF24','#60A5FA','#F472B6','#0A6B52','#F97316']
    let confetti = ''
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * 2 * Math.PI
      const dist = 70 + Math.random() * 50
      const dx = Math.cos(a) * dist
      const dy = Math.sin(a) * dist - 24
      const rot = Math.round(Math.random() * 720 - 360)
      const c = colors[i % colors.length]
      const delay = (0.48 + Math.random() * 0.25).toFixed(2)
      confetti += `<span class="sb-confetti" style="left:calc(50% - 4px);background:${c};--dx:${dx.toFixed(0)}px;--dy:${dy.toFixed(0)}px;--rot:${rot}deg;animation-delay:${delay}s"></span>`
    }
    const ov = document.createElement('div')
    ov.className = 'sb-celeb-overlay'
    ov.innerHTML =
      '<div class="sb-celeb-card">' +
        '<div class="sb-celeb-pulse"></div>' +
        '<svg class="sb-celeb-svg" viewBox="0 0 100 100"><circle class="ring" cx="50" cy="50" r="45"/><path class="check" d="M28 52 L44 67 L73 34"/></svg>' +
        confetti +
        '<div class="sb-celeb-title">' + (message || '入力完了！') + '</div>' +
        '<div class="sb-celeb-sub">おつかれさまです 🌱</div>' +
      '</div>'
    document.body.appendChild(ov)
    const card = ov.querySelector('.sb-celeb-card')
    setTimeout(() => { if (card) card.classList.add('out'); ov.style.transition = 'opacity .3s ease'; ov.style.opacity = '0' }, 1300)
    setTimeout(() => { ov.remove() }, 1700)
  } catch (e) {}
}

// 【エラー/通知トースト】showToast — 画面右上に積み上がる通知。エラーは目立つ赤、警告は橙、
// 成功/情報は緑。celebrateSaveと同じくDOM直生成なので、Reactの外(素のalert置換・未捕捉エラー・
// ErrorBoundary)からも1行で呼べる。メッセージはescHtmlでエスケープ。同一メッセージの連投は抑制。
function showToast(message, type, opts) {
  try {
    const meta = ({
      error:   { icon:'alert-triangle', cls:'error',   ttl: 8000 },
      warn:    { icon:'alert-circle',   cls:'warn',    ttl: 6000 },
      success: { icon:'circle-check',   cls:'success', ttl: 3500 },
      info:    { icon:'info-circle',    cls:'info',    ttl: 4500 },
    })[type || 'info'] || { icon:'info-circle', cls:'info', ttl: 4500 }
    const ttl = (opts && opts.ttl) ? opts.ttl : meta.ttl
    let wrap = document.getElementById('sb-toast-wrap')
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'sb-toast-wrap'; document.body.appendChild(wrap) }
    // 同じ文言のトーストが既に出ていれば連投しない（エラーループでの氾濫を防ぐ）
    if ([...wrap.querySelectorAll('.sb-toast-msg')].some(n => n.textContent === String(message == null ? '' : message))) return
    const esc = (typeof escHtml === 'function') ? escHtml : (s) => String(s == null ? '' : s)
    const el = document.createElement('div')
    el.className = 'sb-toast sb-toast-' + meta.cls
    el.innerHTML =
      '<i class="ti ti-' + meta.icon + ' sb-toast-icon" aria-hidden="true"></i>' +
      '<span class="sb-toast-msg">' + esc(message) + '</span>' +
      '<button class="sb-toast-close" aria-label="閉じる">×</button>'
    wrap.appendChild(el)
    requestAnimationFrame(() => el.classList.add('in'))
    const dismiss = () => {
      if (el.__gone) return; el.__gone = true
      el.classList.remove('in'); el.classList.add('out')
      setTimeout(() => { try { el.remove() } catch (_) {} }, 260)
    }
    el.querySelector('.sb-toast-close').addEventListener('click', dismiss)
    setTimeout(dismiss, ttl)
    return dismiss
  } catch (e) { try { console.warn('[showToast]', e) } catch (_) {} }
}

// 【描画エラーの受け皿】ErrorBoundary — ページ描画中に例外が起きても画面全体が白くならないよう、
// その画面だけをフォールバックUIに差し替える（サイドバーは生きたまま）。トーストで気づけるようにし、
// ページ移動(resetKeyの変化)で自動的にエラー状態を解除して再挑戦する。
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) {
    try { console.error('[ErrorBoundary]', error, info) } catch (_) {}
    try { showToast('画面の表示中に問題が発生しました。操作をやり直すか、再読み込みしてください。', 'error') } catch (_) {}
  }
  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) this.setState({ error: null })
  }
  render() {
    if (this.state.error) {
      return React.createElement('div', { className:'sb-eb-fallback' },
        React.createElement('div', { style:{ fontSize:40, marginBottom:10 } }, '⚠️'),
        React.createElement('div', { className:'sb-eb-title' }, 'この画面を表示できませんでした'),
        React.createElement('div', { className:'sb-eb-sub' }, '一時的な不具合の可能性があります。ほかの画面に切り替えるか、再読み込みしてください。入力済みのデータは保存されています。'),
        React.createElement('button', { className:'sb-eb-btn', onClick: () => { try { location.reload() } catch (_) {} } }, '再読み込み')
      )
    }
    return this.props.children
  }
}

// 【保存演出の設定】管理者(設定ページ)とスタッフ(簡易画面)の両方から選べる共有UI。
// この端末のsb_save_effectに保存され、次からの保存演出に即反映される。compactでスタッフ画面向けに小型化。
function SaveEffectSetting({ compact }) {
  const [pref, setPref] = React.useState(getSaveEffectPref())
  const choose = (v) => { setPref(v); setSaveEffectPref(v); if (v === 'full') celebrateSave('プレビュー'); else if (v === 'lite') showToast('プレビュー', 'success', { ttl: 1100 }) }
  const opts = [
    { v:'full', label:'にぎやか', desc:'紙吹雪でお祝い（初期設定）' },
    { v:'lite', label:'あっさり', desc:'一瞬の軽い通知だけ' },
    { v:'off',  label:'オフ',     desc:'演出なし（最速）' },
  ]
  const buttons = React.createElement('div', { style:{ display:'flex', gap:8, flexWrap:'wrap' } },
    ...opts.map(o => React.createElement('button', {
      key:o.v, onClick:()=>choose(o.v),
      style:{ flex:'1 1 110px', textAlign:'left', padding: compact ? '8px 10px' : '10px 12px', borderRadius:10, cursor:'pointer',
        border:'2px solid ' + (pref===o.v ? '#0A6B52' : '#E5E7EB'), background: pref===o.v ? '#F0FDF4' : '#fff' } },
      React.createElement('div', { style:{ fontSize:13, fontWeight:700, color: pref===o.v ? '#0A6B52' : '#374151' } }, (pref===o.v?'✓ ':'') + o.label),
      React.createElement('div', { style:{ fontSize:11, color:'#6B7280', marginTop:2 } }, o.desc)
    ))
  )
  const intro = React.createElement('div', { style:{ fontSize:12, color:'#6B7280', marginBottom:12 } }, '毎日たくさん入力する方は「あっさり」や「オフ」にすると動作が軽く感じられます。')
  if (compact) {
    return React.createElement('div', { style:{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:12, padding:'14px 16px' } },
      React.createElement('div', { style:{ fontSize:13, fontWeight:700, color:'#374151', marginBottom:6 } }, '🎉 保存時の演出'),
      intro, buttons
    )
  }
  return React.createElement('div', { className:'card', style:{ marginBottom:'16px' } },
    React.createElement('div', { className:'section-title' }, '🎉 保存時の演出'),
    intro, buttons
  )
}

// 現在のlocalStorage使用量(概算バイト・UTF-16換算)。写真追加前の容量ガードに使用。
function estimateLocalStorageBytes() {
  let total = 0
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      const v = localStorage.getItem(k) || ''
      total += (k.length + v.length) * 2
    }
  } catch {}
  return total
}

// ── RecordForm: フォーム専用ページ（旧 DailyRecord hideList:true）──
function RecordForm({ fields, pesticides, records, onSave, inModal, lotSprayRecords, farmLots, fertilizers, destinations, harvestRecords, staff, onSaveLotSpray, onSaveTopDressing, onSaveHarvest }) {
  // 【入口一本化】農薬散布/施肥/収穫は畝まで記録するGAP用フォームに切り替える（リッチモード）。
  // これらの保存コールバックが渡された時だけ有効。畝ごとの記録は単一圃場で行う。
  const RICH_FORM = { '農薬散布':'spray', '施肥':'fert', '収穫':'harvest' }
  const richMode = !!(onSaveLotSpray && onSaveTopDressing && onSaveHarvest)
  const STEPS = ['日付・圃場', '作業内容', '農薬/施肥', '確認・保存']
  const [step, setStep]         = React.useState(1)
  const [dilution, setDilution] = React.useState(1000)
  // inModal かつ圃場が1件のとき、その圃場をプリセット
  const isFieldPreset = inModal && fields.length === 1
  const presetFieldId = isFieldPreset ? String(fields[0].id) : ''
  // ログイン時に入力した名前を作業者名の既定に（毎回入れ直さなくてよい）
  const savedWorker = (() => { try { return localStorage.getItem('sb_name') || '' } catch (_) { return '' } })()
  // 【P1: 毎朝の最初の一手を速く】現場は同じ畑を連日触るので、直近の記録から圃場の使用順を覚え、
  // ①最近使った順にチップを並べ替え ②最後に使った圃場を初期選択 する（探す手間を削減）。
  const recentFieldIds = React.useMemo(() => {
    const last = {}
    ;(records || []).forEach(r => {
      if (r.field_id == null) return
      // 妥当な YYYY-MM-DD 以外(空/破損/インポート異常)は最古扱いにして「最新」誤判定を防ぐ（番人監査 P1 Low-1）
      const rawDate = String(r.date || '')
      const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '0000-00-00'
      const key = safeDate + '#' + String(r.id || 0).padStart(16, '0')
      if (!last[r.field_id] || key > last[r.field_id]) last[r.field_id] = key
    })
    return Object.keys(last).map(Number).sort((a, b) => last[b].localeCompare(last[a]))
  }, [records])
  const lastFieldId = (!isFieldPreset && recentFieldIds.length && fields.some(f => f.id === recentFieldIds[0])) ? String(recentFieldIds[0]) : ''
  const initFieldId = presetFieldId || lastFieldId
  // 【P4: 天気の自動候補】その日の天気は決まっているので、初期値を直近の記録の天気にする。
  // 同じ日に既に記録があればその日の天気を優先。無ければ最新記録の天気、いずれも無ければ '晴'。
  const weatherByDate = React.useMemo(() => {
    const m = {}
    ;(records || []).forEach(r => { if (r.date && r.weather && !m[r.date]) m[r.date] = r.weather })
    return m
  }, [records])
  const latestWeather = React.useMemo(() => {
    const s = [...(records || [])].filter(r => r.weather)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (Number(b.id) || 0) - (Number(a.id) || 0))
    return s[0] ? s[0].weather : ''
  }, [records])
  const hasWeatherHistory = !!latestWeather
  const suggestedWeather = weatherByDate[todayYmd()] || latestWeather || '晴'
  const [form, setForm]         = React.useState({
    date: todayYmd(),
    field_id: initFieldId, field_ids: initFieldId ? [initFieldId] : [], work_type: '', pesticide_id: '',
    amount: '', weather: suggestedWeather, worker: savedWorker, note: '', checks: {},
    start_time: '08:00', end_time: '17:00', break_minutes: 60,
    spray_method: '',       // 使用方法（散布・株元散布・土壌混和・灌注）
    machine_no: '',         // 使用機械No.
    spray_made_L: '',       // 作った散布液量（L）
    spray_discarded_L: '',  // 廃棄した散布液量（L）
    photos: [],             // 【写真】圧縮済みdataURL（最大PHOTO_MAX_PER_RECORD枚）
  })
  // UX-10: 保存後の「続けて入力」ボタン用 state
  const [showContinueButton, setShowContinueButton] = React.useState(false)
  const [photoError, setPhotoError] = React.useState('')

  // 【P2: 電波が弱くても消えない】入力途中を下書き自動保存し、リロード/離脱後に復元できる。
  // 現場は圏外気味で「入れた気になって消える」不安が大きい。写真は容量肥大するので下書きには含めない。
  // 対象は主たる日報入力(!inModal)。圃場詳細内の簡易入力は対象外。
  const draftEnabled = !inModal
  const draftKey = 'farm_recordform_draft_' + ((typeof CONFIG !== 'undefined' && CONFIG.CURRENT_FARM_ID) ? CONFIG.CURRENT_FARM_ID : 'x')
  const clearDraft = () => { try { localStorage.removeItem(draftKey) } catch (e) {} }
  const [draftSaved, setDraftSaved] = React.useState(false)  // 「下書き保存済み ✓」表示
  const [restorableDraft, setRestorableDraft] = React.useState(() => {
    if (inModal) return null
    try {
      const d = localStorage.getItem(draftKey); const p = d ? JSON.parse(d) : null
      return (p && p.form && (p.form.work_type || (p.form.note || '').trim() || (p.step || 1) > 1)) ? p : null
    } catch (e) { return null }
  })

  // UX-10: 保存後の「続けて入力」ボタン用 state
  // 多重送信ガード用（保存ボタン連打で二重登録を防ぐ）。フォーム編集で解除。
  const savingRef = React.useRef(false)
  // 【P4】天気を手動で選んだら以降は日付追従を止める（勝手に上書きしないため）
  const weatherTouchedRef = React.useRef(false)
  const updateField = (k, v) => {
    savingRef.current = false
    if (k === 'weather') weatherTouchedRef.current = true
    // 日付を変えたら、その日に既に記録があればその日の天気を候補として追従（手動選択までの間だけ）
    if (k === 'date' && !weatherTouchedRef.current) {
      const w = weatherByDate[v]
      setForm(f => ({ ...f, date: v, weather: w || f.weather }))
      return
    }
    setForm(f => ({ ...f, [k]: v }))
  }

  // 下書き自動保存（意味のある入力がある時だけ書く。空に戻したら下書きも消す）
  React.useEffect(() => {
    if (!draftEnabled) return
    const meaningful = form.work_type || (form.note || '').trim() || step > 1
    try {
      if (meaningful) {
        const { photos, ...rest } = form
        localStorage.setItem(draftKey, JSON.stringify({ form: { ...rest, photos: [] }, step, dilution, savedAt: Date.now() }))
        setDraftSaved(true)
      } else if (!restorableDraft) {
        // 【番人監査 P2 High-1】未復元の下書きが待機中は消さない。マウント直後は live フォームが
        // pristine のためこの分岐に入るが、復元前に永続下書きを消すと再リロードで復元不能になる。
        localStorage.removeItem(draftKey); setDraftSaved(false)
      }
    } catch (e) { /* 容量超過等は握り潰さないが、下書きは記録本体の保存を妨げないため通知は最小 */ }
  }, [form, step, dilution, restorableDraft])

  // 下書きの復元 / 破棄
  const restoreDraft = () => {
    if (!restorableDraft) return
    if (restorableDraft.form) {
      setForm(f => ({ ...f, ...restorableDraft.form, photos: [] }))
      // 【P4×P2 番人監査 High-1】復元した天気はユーザーが選んだ値。日付追従で勝手に上書きしないよう手動相当にする
      if (restorableDraft.form.weather) weatherTouchedRef.current = true
    }
    if (restorableDraft.step) setStep(restorableDraft.step)
    if (restorableDraft.dilution) setDilution(restorableDraft.dilution)
    setRestorableDraft(null)
    try { if (typeof showToast === 'function') showToast('入力途中の下書きを復元しました', 'success') } catch (e) {}
  }
  const discardDraft = () => { clearDraft(); setRestorableDraft(null); setDraftSaved(false) }

  const selP    = masterById(pesticides, form.pesticide_id)
  const isOver  = isPesticideOverLimit(records, form.field_id, selP, lotSprayRecords || [])
  const selField = masterById(fields, form.field_id)

  // C04-1: onUpdate を useCallback でメモ化
  const handlePesticideUpdate = React.useCallback(({ pesticide_id, dilution: d, amount: a, spray_liquid_L: v }) => {
    if (pesticide_id) updateField('pesticide_id', String(pesticide_id))
    setDilution(d)
    updateField('amount', a)           // 原液使用量（L）
    updateField('spray_volume_L', v)   // 散布液量（L）
  }, [])

  // 【写真】選択画像を圧縮→容量ガード→formに追加（超過時は写真だけ拒否し記録保存は妨げない）
  const handleAddPhoto = (file) => {
    setPhotoError('')
    const cur = form.photos || []
    if (cur.length >= PHOTO_MAX_PER_RECORD) { const m = '写真は最大' + PHOTO_MAX_PER_RECORD + '枚までです'; setPhotoError(m); showToast(m, 'warn'); return }
    compressImageFile(file).then(dataUrl => {
      const curBytes  = cur.reduce((a, p) => a + p.length * 2, 0)
      const projected = estimateLocalStorageBytes() + curBytes + dataUrl.length * 2
      if (projected > PHOTO_STORAGE_BUDGET) { const m = '空き容量が不足しているため写真を追加できません（記録は保存できます）'; setPhotoError(m); showToast(m, 'warn'); return }
      setForm(f => ({ ...f, photos: [...(f.photos || []), dataUrl] }))
    }).catch(() => setPhotoError('画像を処理できませんでした'))
  }
  const handleRemovePhoto = (idx) => setForm(f => ({ ...f, photos: (f.photos || []).filter((_, i) => i !== idx) }))

  // 送信ID保持: 圃場ごとの記録に固定UUIDを割り当て、全件成功が確定するまで同じIDを使い回す。
  // (応答喪失→再送でもRPC冪等で二重登録しない。数値ID(Date.now)はDBのuuid列に入らないためUUID化)
  const submitIdsRef = React.useRef(null)
  const handleSave = async () => {
    if (!form.field_id || !form.work_type) { showToast('圃場と作業内容を選んでください', 'warn'); return }
    // 農薬散布は在庫連動RPCが原液使用量(amount)>0を要求する。画面側でも弾く(保存後の失敗を防ぐ)
    if (form.work_type === '農薬散布' && !(form.pesticide_id && Number(form.amount) > 0)) {
      showToast('農薬散布は農薬と使用量（原液L）を入力してください', 'warn'); return
    }
    if (savingRef.current) return // 連打による二重登録を防止
    savingRef.current = true
    // 【複数圃場同時記録】農薬散布は圃場ごとに使用回数・希釈が異なるため主圃場のみ。
    // それ以外の作業は選択圃場ぶんの単一field_id記録へ展開（読み取り側は既存のまま）。
    const isPesticide = form.work_type === '農薬散布'
    const selectedIds = (form.field_ids && form.field_ids.length) ? form.field_ids.slice() : [form.field_id]
    const targetIds   = isPesticide ? [form.field_id] : selectedIds
    const { field_ids, ...base } = form
    if (!submitIdsRef.current || submitIdsRef.current.length !== targetIds.length) submitIdsRef.current = targetIds.map(() => newUuid())
    // 祝福・下書き破棄は「全件成功」確定後だけ。失敗が1件でもあれば入力と送信IDを保持し、再送は同じIDで冪等
    const results = await Promise.all(targetIds.map((fid, i) => Promise.resolve(onSave({
      ...base, id: submitIdsRef.current[i], dilution,
      field_id: fid,
      photos: i === 0 ? (form.photos || []) : [], // 複数展開時は主圃場(先頭)のみ添付
      pesticide_id: form.pesticide_id ? String(form.pesticide_id) : null, // UUID対応: Number()はNaN化するため禁止
    })).catch(() => null)))
    if (!results.every(r => r && r.ok === true)) { savingRef.current = false; return } // 失敗: 保持して再送に備える
    submitIdsRef.current = null // 全件成功: 次の記録は新しいIDで
    setTimeout(() => { savingRef.current = false }, 1200)
    celebrateSave(targetIds.length > 1 ? targetIds.length + '圃場に記録！' : '記録しました！')
    clearDraft(); setDraftSaved(false)   // 保存できたので下書きは破棄（P2）
    setShowContinueButton(true)          // UX-10: 保存完了後、「続けて入力」ボタンを3秒表示
    setTimeout(() => setShowContinueButton(false), 3000)
  }
  
  // UX-10: 「続けて入力」クリック時の処理
  const handleContinueInput = () => {
    savingRef.current = false // 続けて入力するので保存ガードを解除
    // date, weather, work_type だけ引き継いで、field_id と others をリセット
    setForm(f => ({
      date: f.date,
      weather: f.weather,
      work_type: f.work_type,
      field_id: '', field_ids: [], pesticide_id: '', amount: '', worker: savedWorker, note: '', checks: {}, photos: []
    }))
    setDilution(1000)
    setPhotoError('')
    setShowContinueButton(false)
    setStep(1) // ステップ1（圃場選択）から再開
  }

  // CAT-04-2: stepComponents を useMemo でメモ化
  // → step/form/fields 等が変わった時だけ再生成され、無関係な再レンダーで再マウントされない
  const stepComponents = React.useMemo(() => [null,
    () => React.createElement(RecordStep1, { form, fields, up:updateField, onNext:()=>setStep(2), isFieldPreset, recentFieldIds, hasWeatherHistory }),
    () => React.createElement(RecordStep2, { form, up:updateField, onPrev:()=>setStep(1), onNext:()=>setStep(3), onAddPhoto:handleAddPhoto, onRemovePhoto:handleRemovePhoto, photoError }),
    () => React.createElement(RecordStep3, { form, up:updateField, pesticides, records, lotSprayRecords, isOver, selField, handlePesticideUpdate, onPrev:()=>setStep(2), onNext:()=>setStep(4) }),
    () => React.createElement(RecordStep4, { form, dilution, selField, selP, isOver, onPrev:()=>setStep(3), onSave:handleSave, showContinueButton, onContinue:handleContinueInput }),
  ], [step, form, fields, pesticides, records, isOver, dilution, selField, selP, handlePesticideUpdate, showContinueButton, photoError])

  // 農薬散布/施肥/収穫は畝まで記録するGAP用フォームへ切り替え（主圃場＝selFieldで畝ごとに記録）
  const backToStep2 = () => setStep(2)
  const renderRich = () => {
    const kind = RICH_FORM[form.work_type]
    const lots = (farmLots && farmLots[selField.id]) || []
    const header = React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:10, marginBottom:14, flexWrap:'wrap' } },
      React.createElement('button', { className:'btn btn-ghost', onClick:backToStep2 }, '← 作業内容'),
      React.createElement('span', { style:{ fontSize:13, color:'#374151', fontWeight:600 } }, selField.name + '（' + selField.crop + '）'),
      React.createElement('span', { style:{ fontSize:12, color:'#0A6B52' } }, '畝ごとに記録（GAP対応）'),
      (form.field_ids && form.field_ids.length > 1) ? React.createElement('span', { style:{ fontSize:12, color:'#B45309' } }, '※畝の記録は主圃場のみ') : null
    )
    let el
    if (kind === 'spray')     el = React.createElement(LotSprayRecordForm,    { field:selField, pesticides:pesticides||[], lots, staff, defaultWeather:suggestedWeather, pastSprays:lotSprayRecords||[], onCancel:backToStep2, onSave: async (r)=>{ const res = await Promise.resolve(onSaveLotSpray(r)).catch(()=>null); if (!(res && res.ok === true)) return res; clearDraft(); setDraftSaved(false); backToStep2(); return res } })
    else if (kind === 'fert') el = React.createElement(TopDressingRecordForm, { field:selField, fertilizers:fertilizers||[], lots, staff, onCancel:backToStep2, onSave: async (r)=>{ const res = await Promise.resolve(onSaveTopDressing(r)).catch(()=>null); if (!(res && res.ok === true)) return res; clearDraft(); setDraftSaved(false); backToStep2(); return res } })
    else                      el = React.createElement(HarvestRecordForm,     { field:selField, lots, destinations:destinations||[], harvestRecords:harvestRecords||[], staff, onCancel:backToStep2, onSave: async (r)=>{ const res = await Promise.resolve(onSaveHarvest(r)).catch(()=>null); if (res && res.ok === true) { clearDraft(); setDraftSaved(false) } return res } })
    return React.createElement('div', null, header, el)
  }
  const useRich = richMode && !!RICH_FORM[form.work_type] && !!selField && step >= 3

  return React.createElement('div', { className: inModal ? '' : 'page' },
    !inModal && React.createElement('div', { className:'eyebrow' }, 'DAILY REPORT'),
    !inModal && React.createElement('div', { className:'page-title' }, '日報入力'),
    !inModal && React.createElement('div', { className:'page-sub' }, '作業内容を記録してGAP書類を自動生成します'),
    // 【P2】入力途中の下書き復元バナー（現場の圏外・リロードで消える不安への保険）
    restorableDraft && React.createElement('div', {
      style:{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:'10px', padding:'10px 14px', marginBottom:'12px' }
    },
      React.createElement('i', { className:'ti ti-file-pencil', 'aria-hidden':'true', style:{ fontSize:'18px', color:'#B45309', flexShrink:0 } }),
      React.createElement('div', { style:{ flex:1, minWidth:'180px' } },
        React.createElement('div', { style:{ fontSize:'13px', fontWeight:700, color:'#92400E' } }, '入力途中の下書きが残っています'),
        React.createElement('div', { style:{ fontSize:'11px', color:'#B45309' } }, '前回この端末で入力途中だった内容を復元できます（写真は除く）')
      ),
      React.createElement('button', { onClick:restoreDraft, style:{ flexShrink:0, fontSize:'12px', fontWeight:700, color:'#fff', background:'#0A6B52', border:'none', borderRadius:'7px', padding:'7px 14px', cursor:'pointer' } }, '復元する'),
      React.createElement('button', { onClick:discardDraft, style:{ flexShrink:0, fontSize:'12px', fontWeight:600, color:'#6B7280', background:'none', border:'none', cursor:'pointer' } }, '破棄')
    ),
    React.createElement('div', { className: inModal ? '' : 'card' },
      React.createElement(StepBar, { step, steps:STEPS }),
      useRich ? renderRich() : (stepComponents[step] && stepComponents[step]()),
      // 【P2】下書き自動保存の見える化（保存されている安心を明示）
      (draftEnabled && draftSaved && !restorableDraft) && React.createElement('div', {
        style:{ display:'flex', alignItems:'center', gap:'5px', marginTop:'10px', fontSize:'11px', color:'#0A6B52' }
      },
        React.createElement('i', { className:'ti ti-cloud-check', 'aria-hidden':'true', style:{ fontSize:'13px' } }),
        'この端末に下書きを自動保存しました（電波が無くても消えません）'
      )
    )
  )
}

// ── RecordTablePage: 一覧専用ページ（旧 DailyRecord hideForm:true）──
// UX-04: RecordTablePage — 検索・絞り込みバー付き記録一覧ページ
function RecordTablePage({ records, fields, pesticides, onUpdate, onDelete, cropCycles=[], onUpdateRecordCycle, focusRecordId, onClearFocus }) {
  return React.createElement('div', { className:'page' },
    React.createElement('div', { style:{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'6px' } },
      React.createElement('div', null,
        React.createElement('div', { className:'eyebrow' }, 'DAILY REPORT'),
        React.createElement('div', { className:'page-title' }, '日報管理'),
        React.createElement('div', { className:'page-sub' }, '全日報記録 ' + records.length + '件 — キーワード・作業種・圃場・期間で絞り込み可能')
      )
    ),
    React.createElement(RecordTable, { records, fields, pesticides, onUpdate, onDelete, cropCycles, onUpdateRecordCycle, focusRecordId, onClearFocus })
  )
}

// ─────────────────────────────────────────────────────
// 【フェーズE・E-4 Step1】RowMapView — 畝マップビュー（ロット単位）
// 横長グリッドで「畝範囲（ロット）」を品種・ステータスごとに視覚化
// 各ロットセルをクリック → onSelectRow でスライドインパネルを開く
// ─────────────────────────────────────────────────────
function RowMapView({ rows, selectedRowNo, onSelectRow }) {
  return React.createElement('div', null,
    React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' } },
      React.createElement('div', { className:'page-sub', style:{ marginBottom:0 } }, 'ロット（畝範囲）をクリックすると、播種〜収穫の詳細を確認できます'),
      React.createElement('div', { style:{ display:'flex', gap:'12px', fontSize:'11px', color:'#6B7280' } },
        ...Object.entries(ROW_STATUS_CONFIG).map(([key, cfg]) =>
          React.createElement('div', { key, style:{ display:'flex', alignItems:'center', gap:'4px' } },
            React.createElement('div', { style:{ width:10, height:10, borderRadius:'3px', background:cfg.color } }),
            cfg.label
          )
        )
      )
    ),
    React.createElement('div', {
      style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(120px, 1fr))', gap:'8px' }
    },
      ...rows.map(lot => {
        const cfg = ROW_STATUS_CONFIG[lot.status]
        const isSelected = selectedRowNo === lot.id
        return React.createElement('button', {
          key: lot.id,
          onClick: () => onSelectRow(lot.id),
          style:{
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            gap:'4px', padding:'14px 10px', borderRadius:'8px', cursor:'pointer',
            border: isSelected ? '2px solid '+cfg.color : '1px solid #DDE2EC',
            background: cfg.bg,
          }
        },
          React.createElement('div', { style:{ width:18, height:18, borderRadius:'4px', background:cfg.color } }),
          React.createElement('div', { style:{ fontSize:'12px', fontWeight:600, color:'#374151' } }, lot.row_range+'畝'),
          React.createElement('div', { style:{ fontSize:'11px', color:'#374151', fontWeight:500 } }, lot.variety),
          React.createElement('div', { style:{ fontSize:'10px', color: cfg.color } }, cfg.label)
        )
      })
    )
  )
}

// ─────────────────────────────────────────────────────
// 【フェーズE・E-4 Step2】RowDetailPanel — ロット詳細スライドインパネル
// 選択したロット（畝範囲）の播種〜収穫情報＋参考の日報・農薬履歴を表示
// ─────────────────────────────────────────────────────
function RowDetailPanel({ field, row, records, pesticides, onClose }) {
  const lot = row
  const cfg = ROW_STATUS_CONFIG[lot.status]
  // 参考表示: 圃場の記録から代表的な日報・農薬履歴を表示（厳密な畝紐付けは行わない）
  const fieldRecords     = records.filter(r => String(r.field_id) === String(field.id))
  const pesticideRecords = fieldRecords.filter(r => r.work_type === '農薬散布')

  const InfoRow = ({ label, value }) =>
    React.createElement('div', { style:{ display:'flex', justifyContent:'space-between', padding:'4px 0' } },
      React.createElement('span', { style:{ color:'#6B7280' } }, label),
      React.createElement('span', { style:{ fontWeight:600, textAlign:'right' } }, value || '—')
    )

  return React.createElement('div', {
    style:{
      position:'fixed', inset:0, background:'rgba(17,24,39,.35)',
      display:'flex', justifyContent:'flex-end',
      zIndex:1000
    },
    onClick: onClose
  },
    React.createElement('div', {
      style:{
        width:'360px', maxWidth:'100%', height:'100%', background:'#FFFFFF',
        boxShadow:'-8px 0 32px rgba(17,24,39,.15)', padding:'20px',
        overflowY:'auto', animation:'slideInRight .2s ease-out'
      },
      onClick: e => e.stopPropagation()
    },
      // ヘッダー
      React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'4px' } },
        React.createElement('div', { style:{ fontSize:'16px', fontWeight:600, color:'#1A1F2E' } }, field.name + ' ／ ' + lot.row_range + '畝'),
        React.createElement('button', {
          className:'btn btn-ghost', style:{ padding:'4px 8px', fontSize:'16px', lineHeight:1 },
          onClick: onClose
        }, '✕')
      ),
      React.createElement('div', { style:{ marginBottom:'16px', display:'flex', alignItems:'center', gap:'8px' } },
        React.createElement('span', {
          style:{ display:'inline-flex', alignItems:'center', gap:'6px', fontSize:'12px', fontWeight:600, color:cfg.color, background:cfg.bg, border:'1px solid '+cfg.color+'40', borderRadius:'6px', padding:'4px 10px' }
        },
          React.createElement('div', { style:{ width:8, height:8, borderRadius:'2px', background:cfg.color } }),
          cfg.label
        ),
        React.createElement('span', { style:{ fontSize:'13px', fontWeight:600, color:'#111827' } }, lot.variety)
      ),

      // 播種〜定植
      React.createElement(SectionTitle, { icon:'seeding', style:{ marginBottom:'8px' } }, '播種・育苗・定植'),
      React.createElement('div', { style:{ background:'#F8FAFC', borderRadius:'8px', padding:'12px 14px', marginBottom:'16px', fontSize:'13px', color:'#374151' } },
        React.createElement(InfoRow, { label:'品種',         value:lot.variety }),
        React.createElement(InfoRow, { label:'播種日',       value:lot.seed_date }),
        React.createElement(InfoRow, { label:'種苗ロット',   value:lot.seed_lot_no }),
        React.createElement(InfoRow, { label:'苗種類',       value:lot.seedling_type }),
        React.createElement(InfoRow, { label:'定植日',       value:lot.transplant_date }),
        React.createElement(InfoRow, { label:'定植方法',     value:lot.transplant_method }),
        React.createElement(InfoRow, { label:'育苗期間',     value: lot.seedling_period_days != null ? lot.seedling_period_days + '日' : null }),
        React.createElement(InfoRow, { label:'定植枚数',     value: lot.transplant_count != null ? lot.transplant_count + '枚' : null }),
        React.createElement(InfoRow, { label:'1畝苗箱数',   value: lot.trays_per_row != null ? lot.trays_per_row : null }),
      ),

      // 定植前農薬
      React.createElement(SectionTitle, { icon:'spray', style:{ marginBottom:'8px' } }, '定植前農薬'),
      (!lot.pretransplant_pesticides || lot.pretransplant_pesticides.length === 0)
        ? React.createElement('div', { style:{ fontSize:'12px', color:'#94A3B8', marginBottom:'16px' } }, '記録がありません')
        : React.createElement('div', { style:{ marginBottom:'16px', display:'flex', flexDirection:'column', gap:'6px' } },
            ...lot.pretransplant_pesticides.map((p, i) =>
              React.createElement('div', { key:i, style:{ fontSize:'12px', color:'#374151', display:'flex', justifyContent:'space-between', borderBottom:'1px solid #F1F5F9', padding:'4px 0' } },
                React.createElement('span', null, p.name),
                React.createElement('span', null, p.amount)
              )
            )
          ),

      // 収穫
      React.createElement(SectionTitle, { icon:'basket', style:{ marginBottom:'8px' } }, '収穫'),
      React.createElement('div', { style:{ background:'#F8FAFC', borderRadius:'8px', padding:'12px 14px', marginBottom:'16px', fontSize:'13px', color:'#374151' } },
        React.createElement(InfoRow, { label:'収穫開始日', value:lot.harvest_start }),
        React.createElement(InfoRow, { label:'収穫終了日', value:lot.harvest_end }),
        React.createElement(InfoRow, { label:'播種からの日数', value: lot.days_from_seed != null ? lot.days_from_seed + '日' : null }),
        React.createElement(InfoRow, { label:'定植からの日数', value: lot.days_from_transplant != null ? lot.days_from_transplant + '日' : null }),
      ),

      // 日報（参考表示）
      React.createElement(SectionTitle, { icon:'notebook', style:{ marginBottom:'8px' } }, 'この圃場の日報（参考）'),
      fieldRecords.length === 0
        ? React.createElement('div', { style:{ fontSize:'12px', color:'#94A3B8', marginBottom:'16px' } }, '記録がありません')
        : React.createElement('div', { style:{ marginBottom:'16px', display:'flex', flexDirection:'column', gap:'6px' } },
            ...fieldRecords.slice(-3).reverse().map(r =>
              React.createElement('div', { key:r.id, style:{ fontSize:'12px', color:'#374151', display:'flex', justifyContent:'space-between', borderBottom:'1px solid #F1F5F9', padding:'4px 0' } },
                React.createElement('span', null, r.date),
                React.createElement('span', null, r.work_type)
              )
            )
          ),

      // 農薬履歴（参考表示）
      React.createElement(SectionTitle, { icon:'spray', style:{ marginBottom:'8px' } }, 'この圃場の農薬履歴（参考）'),
      pesticideRecords.length === 0
        ? React.createElement('div', { style:{ fontSize:'12px', color:'#94A3B8', marginBottom:'4px' } }, '農薬使用の記録はまだありません')
        : React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:'6px' } },
            ...pesticideRecords.slice(-3).reverse().map(r => {
              const p = masterById(pesticides, r.pesticide_id)
              return React.createElement('div', { key:r.id, style:{ fontSize:'12px', color:'#374151', display:'flex', justifyContent:'space-between', borderBottom:'1px solid #F1F5F9', padding:'4px 0' } },
                React.createElement('span', null, r.date),
                React.createElement('span', null, (p ? p.name : '—') + (r.dilution ? '（'+r.dilution+'倍）' : ''))
              )
            })
          ),

      React.createElement('div', { style:{ fontSize:'11px', color:'#94A3B8', marginTop:'16px', lineHeight:1.6 } },
        '※ 日報・農薬履歴は圃場単位の参考表示です。ロットとの厳密な紐付けは今後対応予定です。'
      )
    )
  )
}

// ─────────────────────────────────────────────────────
// 【フェーズE・E-4 Step3】LotRiskAlertCard / LotRiskClearBadge
// 圃場ダッシュボードの「要防除アラート」表示用（HarvestRiskAlertCardのロット版）
// ─────────────────────────────────────────────────────
function LotRiskAlertCard({ risk }) {
  const isUrgent = risk.daysToHarvest <= 7
  return React.createElement('div', {
    style:{
      background: isUrgent ? '#FFF1F2' : '#FFFBEB',
      border: '1px solid ' + (isUrgent ? '#FECACA' : '#FDE68A'),
      borderRadius:'8px', padding:'12px 16px', marginBottom:'8px',
      display:'flex', alignItems:'center', gap:'12px'
    }
  },
    React.createElement('span', { style:{ fontSize:'18px' } }, isUrgent ? '🚨' : '⚠️'),
    React.createElement('div', { style:{ flex:1 } },
      React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' } },
        React.createElement('span', { style:{ fontSize:'14px', color: isUrgent ? '#B91C1C' : '#92400E', fontWeight:500 } },
          risk.rowRange + '畝（' + risk.variety + '）の収穫まで' + risk.daysToHarvest + '日'
        ),
        // 【Step6】判定の精度を明示するバッジ（畝単位の散布記録と突き合わせたか／圃場全体の参考値か）
        risk.precise
          ? React.createElement('span', {
              title:'この畝に実際に散布された記録（畝マップ入力）と突き合わせた結果です',
              style:{ fontSize:'10px', fontWeight:700, color:'#0A6B52', background:'#ECFDF5', border:'1px solid #6EE7B7', borderRadius:'10px', padding:'1px 8px' }
            }, '畝単位で確認済み')
          : React.createElement('span', {
              title:'この畝専用の散布記録が無いため、圃場全体の日報から参考表示しています',
              style:{ fontSize:'10px', fontWeight:700, color:'#9A6B00', background:'#FEF9E7', border:'1px solid #FDE68A', borderRadius:'10px', padding:'1px 8px' }
            }, '圃場全体の参考値')
      ),
      React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280', marginTop:'2px' } },
        risk.pesticideName + 'の残留期間があと' + risk.daysRemaining + '日あります'
        + (risk.harvestableDateLabel ? '（' + risk.harvestableDateLabel + '〜収穫可能）' : '')
      )
    ),
    React.createElement('span', {
      className:'badge ' + (isUrgent ? 'badge-red' : 'badge-amber')
    }, '残留' + risk.daysRemaining + '日')
  )
}
function LotRiskClearBadge() {
  return React.createElement('div', {
    style:{
      background:'#ECFDF5', border:'1px solid #A7F3D0', borderRadius:'8px',
      padding:'12px 16px', marginBottom:'8px',
      display:'flex', alignItems:'center', gap:'12px'
    }
  },
    React.createElement('span', { style:{ fontSize:'18px' } }, '🌱'),
    React.createElement('div', { style:{ flex:1 } },
      React.createElement('div', { style:{ fontSize:'14px', color:'#065F46', fontWeight:500 } }, '防除アラートはありません'),
      React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280', marginTop:'2px' } }, '進行中ロットの収穫予定に、残留農薬の懸念はありません')
    )
  )
}

// ─────────────────────────────────────────────────────
// 【畝マップ Step1】parseRowRange — 畝範囲文字列をSet<number>に変換するヘルパー
// 対応形式: "1-6"（連続範囲） / "47"（単独番号）/ "1-6,8,10-12"（混在）
// ─────────────────────────────────────────────────────
// 【畝マップ（衛星）】圃場の中心(lat/lng)・面積(are)・畝の総本数(row_count)・植え方角から、
// 各畝の矩形ポリゴン([[lat,lng]×4])を自動生成する。圃場を正方形近似し、畝は南北(縦)に走る前提。
// 方角に「東西/横/EW」があれば畝を東西向きにする。boundaryが無くても衛星上に畝レイアウトを表示できる。
// 畝の矩形を圃場の輪郭ポリゴンに収める（Sutherland-Hodgman）。輪郭は凸を前提（4隅程度の圃場で正確）。
// 座標は[lat,lng]。clip外に完全に出る畝は空になり描画されない。
function _clipToPolygon(subject, clip) {
  if (!Array.isArray(clip) || clip.length < 3) return subject
  const signedArea = (poly) => { let s = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a[1] * b[0] - b[1] * a[0] } return s / 2 }
  let cp = clip.slice(); if (signedArea(cp) < 0) cp = cp.slice().reverse()   // CCWに正規化
  // 点pが辺a→bの内側(左)か。x=lng(idx1), y=lat(idx0)
  const inside = (p, a, b) => ((b[1] - a[1]) * (p[0] - a[0]) - (b[0] - a[0]) * (p[1] - a[1])) >= 0
  const intersect = (s, e, a, b) => {
    const x1=s[1],y1=s[0], x2=e[1],y2=e[0], x3=a[1],y3=a[0], x4=b[1],y4=b[0]
    const den=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4); if (Math.abs(den) < 1e-15) return e.slice()
    const t=((x1-x3)*(y3-y4)-(y1-y3)*(x3-x4))/den
    return [ y1 + t*(y2-y1), x1 + t*(x2-x1) ]   // [lat,lng]
  }
  let out = subject.slice()
  for (let i = 0; i < cp.length; i++) {
    const a = cp[i], b = cp[(i + 1) % cp.length], input = out; out = []
    for (let j = 0; j < input.length; j++) {
      const cur = input[j], prev = input[(j + input.length - 1) % input.length]
      const curIn = inside(cur, a, b), prevIn = inside(prev, a, b)
      if (curIn) { if (!prevIn) out.push(intersect(prev, cur, a, b)); out.push(cur) }
      else if (prevIn) out.push(intersect(prev, cur, a, b))
    }
    if (out.length === 0) break
  }
  return out
}

function generateBedPolygons(field) {
  const n = Math.round(Number(field && field.row_count))
  // 異常な畝数(未入力/巨大値/Infinity/NaN)は描画しない。放置すると畝ループがハングするため上限500でガード。
  if (!n || n < 1 || !Number.isFinite(n) || n > 500) return []
  // 輪郭(boundary=[[lat,lng]...])があれば、その範囲・向きに畝を合わせる（手動微調整の反映）。
  const bd = Array.isArray(field && field.boundary) ? field.boundary.filter(p => Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]))) : null
  let lat0, lng0, widthM, heightM
  const mPerLatBase = 111320
  if (bd && bd.length >= 3) {
    const lats = bd.map(p => Number(p[0])), lngs = bd.map(p => Number(p[1]))
    const minLa = Math.min(...lats), maxLa = Math.max(...lats), minLo = Math.min(...lngs), maxLo = Math.max(...lngs)
    lat0 = (minLa + maxLa) / 2; lng0 = (minLo + maxLo) / 2
    const mPerLng = mPerLatBase * Math.cos(lat0 * Math.PI / 180) || mPerLatBase
    widthM = Math.max(2, (maxLo - minLo) * mPerLng)   // 東西幅(m)
    heightM = Math.max(2, (maxLa - minLa) * mPerLatBase) // 南北高(m)
  } else {
    lat0 = Number(field && field.lat); lng0 = Number(field && field.lng)
    if (!Number.isFinite(lat0) || !Number.isFinite(lng0)) return []
    const areaVal = Number(field.area_are)
    const area = (Number.isFinite(areaVal) && areaVal > 0) ? areaVal : 1
    const side = Math.max(2, Math.min(2000, Math.sqrt(area * 100))) // 正方形近似(異常な面積で座標が発散しないよう上限2000m)
    widthM = side; heightM = side
  }
  const mPerLat = mPerLatBase
  const mPerLng = mPerLatBase * Math.cos(lat0 * Math.PI / 180) || mPerLatBase
  // 畝の向き: 明示指定があれば従う。無ければ長辺方向に畝を走らせる（縦長→縦畝 / 横長→横畝）。
  const dir = String(field.bed_direction || field.direction || field.plant_direction || '')
  const ew = /東西|横|E-?W/i.test(dir) ? true : (/南北|縦|N-?S/i.test(dir) ? false : (widthM > heightM))
  const half = (ew ? widthM : heightM) / 2        // 畝の長さ方向の半分
  const span = (ew ? heightM : widthM)            // 畝を並べる幅方向の総長
  const bedW = span / n
  const polys = []
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * bedW
    let corners
    if (!ew) { // 縦畝(南北): 長さ=南北(lat)、幅=東西(lng)
      const dLng = off / mPerLng, w2 = (bedW / 2) * 0.9 / mPerLng, dLat = half / mPerLat
      corners = [[lat0 - dLat, lng0 + dLng - w2], [lat0 + dLat, lng0 + dLng - w2], [lat0 + dLat, lng0 + dLng + w2], [lat0 - dLat, lng0 + dLng + w2]]
    } else {   // 横畝(東西): 長さ=東西(lng)、幅=南北(lat)
      const dLat = off / mPerLat, w2 = (bedW / 2) * 0.9 / mPerLat, dLng = half / mPerLng
      corners = [[lat0 + dLat - w2, lng0 - dLng], [lat0 + dLat - w2, lng0 + dLng], [lat0 + dLat + w2, lng0 + dLng], [lat0 + dLat + w2, lng0 - dLng]]
    }
    // 輪郭がある場合は畝を輪郭内にクリップ（はみ出しを防ぐ）。輪郭外に完全に出る畝は描画しない。
    if (bd && bd.length >= 3) {
      let clipped
      try { clipped = _clipToPolygon(corners, bd) } catch (e) { clipped = corners }
      if (clipped && clipped.length >= 3) polys.push({ bed: i + 1, corners: clipped })
    } else {
      polys.push({ bed: i + 1, corners })
    }
  }
  return polys
}

function parseRowRange(rangeStr) {
  const set = new Set()
  if (!rangeStr) return set
  // 実データの管理表は全角数字・全角ダッシュ表記（例「１－７」「15－22」「58-60」）が普通に混ざるため、
  // まず正規化してから読む。畝は1始まりの整数のみ（0・負数・小数は不正として捨てる）
  const norm = String(rangeStr)
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[－ー−–—〜～~]/g, '-')
    .replace(/[，、]/g, ',')
  const MAX_ROWS = 1000 // 異常値（破損データ等の巨大レンジ）で数億回ループして画面が固まるのを防ぐ安全上限
  norm.split(',').forEach(part => {
    const trimmed = part.trim()
    if (trimmed.includes('-')) {
      let [start, end] = trimmed.split('-').map(Number)
      if (Number.isInteger(start) && Number.isInteger(end) && start > 0 && end >= start) {
        end = Math.min(end, start + MAX_ROWS - 1)
        for (let i = start; i <= end; i++) set.add(i)
      }
    } else {
      const n = Number(trimmed)
      if (Number.isInteger(n) && n > 0) set.add(n)
    }
  })
  return set
}

// ─────────────────────────────────────────────────────
// 【畝マップ Step4】selectedRowsToRange — Set<number> を row_range 文字列に変換するヘルパー
// 例: Set{1,2,3,6,7,10} → "1-3,6-7,10"
// 連続する番号は "start-end" に圧縮し、単独番号はそのまま残す。
function selectedRowsToRange(set) {
  if (!set || set.size === 0) return ''
  const nums = [...set].map(Number).sort((a, b) => a - b)
  const groups = []
  let start = nums[0], end = nums[0]
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] === end + 1) {
      end = nums[i]
    } else {
      groups.push(start === end ? String(start) : start + '-' + end)
      start = end = nums[i]
    }
  }
  groups.push(start === end ? String(start) : start + '-' + end)
  return groups.join(',')
}

// 【畝マップ Step1 / Step3更新 / 条(W/E)対応】RowMap — 畝番号カードのグリッド表示コンポーネント
//
// Props:
//   lots             : LOTS[field.id] の配列（ロット情報）
//   totalRows        : 畝の総本数（この数だけカードを表示する）
//   selectable       : true=範囲選択モード / false=表示・ハイライトモード
//   selectedRows     : Set<number> — 選択中の畝番号セット（selectable時）
//   onSelectRows     : (newSet) => void（selectable時）
//   highlightedLotId : number|null — クリックでハイライト中のロットID（表示モード時）
//   onClickLot       : (lotId: number|null) => void — 畝クリック時に親へ通知（表示モード時）
//   showSides        : true の場合、各畝番号カードをW（西）/E（東）の2段に分けて表示する。
//                       とうもろこし圃場（条管理あり）向け。畝単位のロット色・選択状態はW/E共通
//                       （現状のデータはまだ畝単位のため。条ごとの個別データ化は将来拡張）。
// ─────────────────────────────────────────────────────
function RowMap({ lots, totalRows, selectable, selectedRows, onSelectRows, highlightedLotId, onClickLot, showSides }) {
  // 畝番号 → ロット の逆引きMap
  const rowToLot = React.useMemo(() => {
    const map = new Map()
    ;(lots || []).forEach(lot => {
      parseRowRange(lot.row_range).forEach(n => map.set(n, lot))
    })
    return map
  }, [lots])

  const [hoveredRow, setHoveredRow] = React.useState(null)

  const handleClick = (rowNum) => {
    const lot = rowToLot.get(rowNum)
    if (selectable) {
      // 範囲選択モード（Step4・5用）
      if (!onSelectRows) return
      const next = new Set(selectedRows || [])
      next.has(rowNum) ? next.delete(rowNum) : next.add(rowNum)
      onSelectRows(next)
    } else {
      // 表示モード: ロットIDをトグルして親に通知（Step3）
      if (!onClickLot) return
      const lotId = lot ? lot.id : null
      onClickLot(highlightedLotId === lotId ? null : lotId)
    }
  }

  // 異常な畝数(巨大値/Infinity/NaN)はセルを大量生成してハングするため上限500でガード。
  const _tr = Math.round(Number(totalRows))
  if (!_tr || _tr < 1 || !Number.isFinite(_tr) || _tr > 500) return null
  totalRows = _tr

  const rows = []
  for (let i = 1; i <= totalRows; i++) {
    const lot          = rowToLot.get(i)
    const cfg          = lot ? ROW_STATUS_CONFIG[lot.status] : null
    const isSelected   = selectable && selectedRows && selectedRows.has(i)
    const isHighlighted = !selectable && lot && lot.id === highlightedLotId
    const isHovered    = hoveredRow === i
    // 別ロットがハイライト中のとき、それ以外は薄く表示
    const isDimmed     = !selectable && highlightedLotId !== null && lot && lot.id !== highlightedLotId

    let bg     = '#F1F5F1'
    let color  = '#9CA3AF'
    let border = '1.5px solid #DDE8DE'
    let opacity = 1
    let boxShadow = 'none'

    if (cfg) {
      bg     = cfg.bg
      color  = cfg.color
      border = '1.5px solid ' + cfg.color + '55'
    }
    // 範囲選択モードの選択済み
    if (isSelected) {
      bg        = '#0A6B52'
      color     = '#FFFFFF'
      border    = '1.5px solid #085A45'
    }
    // 表示モードのクリックハイライト
    if (isHighlighted) {
      bg        = cfg ? cfg.color : '#0A6B52'
      color     = '#FFFFFF'
      border    = '2px solid ' + (cfg ? cfg.color : '#0A6B52')
      boxShadow = '0 0 0 2px ' + (cfg ? cfg.color + '55' : '#0A6B5255')
    }
    // ホバー（選択・ハイライトされていない場合のみ）
    if (isHovered && !isSelected && !isHighlighted) {
      bg     = cfg ? cfg.color + '33' : '#D1FAE5'
      border = '1.5px solid ' + (cfg ? cfg.color : '#0A6B52')
    }
    // 別ロットハイライト中は薄く
    if (isDimmed) {
      opacity = 0.35
    }
    // ロット未設定かつ別ロットがハイライト中
    if (!selectable && highlightedLotId !== null && !lot) {
      opacity = 0.25
    }

    rows.push(
      showSides
        // 【条(W/E)対応】1畝＝縦2段（上:W／下:E）のカードとして表示
        ? React.createElement('div', {
            key: i,
            title: lot
              ? lot.variety + '（' + lot.row_range + '畝）\nは種: ' + lot.seed_date + '\n収穫予定: ' + (lot.harvest_start || '未定')
              : 'ロット未設定',
            style: {
              width: '36px', display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0,
            }
          },
            ['W', 'E'].map(side =>
              React.createElement('div', {
                key: side,
                onClick: () => handleClick(i),
                onMouseEnter: () => setHoveredRow(i),
                onMouseLeave: () => setHoveredRow(null),
                style: {
                  width: '36px', height: '17px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
                  borderRadius: '4px', fontSize: '9px', fontWeight: 700,
                  background: bg, color, border, opacity, boxShadow,
                  cursor: (selectable || onClickLot) ? 'pointer' : 'default',
                  transition: 'all .15s',
                  userSelect: 'none',
                }
              },
                React.createElement('span', { style:{ opacity:0.7, fontSize:'8px' } }, side),
                side === 'W' ? i : ''
              )
            )
          )
        // 通常表示（畝番号カード1枚）
        // ── selectable=false（ダッシュボード表示モード）では縦長の畝帯として描画 ──
        : selectable
          ? React.createElement('div', {
              key: i,
              title: lot
                ? lot.variety + '（' + lot.row_range + '畝）\nは種: ' + lot.seed_date + '\n収穫予定: ' + (lot.harvest_start || '未定')
                : 'ロット未設定',
              onClick: () => handleClick(i),
              onMouseEnter: () => setHoveredRow(i),
              onMouseLeave: () => setHoveredRow(null),
              style: {
                width: '36px', height: '36px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                background: bg, color, border, opacity, boxShadow,
                cursor: 'pointer',
                transition: 'all .15s',
                userSelect: 'none', flexShrink: 0,
              }
            }, i)
          : React.createElement('div', {
              key: i,
              onClick: () => handleClick(i),
              onMouseEnter: () => setHoveredRow(i),
              onMouseLeave: () => setHoveredRow(null),
              style: {
                width: '22px',
                height: '72px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '5px',
                paddingBottom: '5px',
                borderRadius: '4px',
                fontSize: '9px',
                fontWeight: 700,
                background: bg,
                color,
                border,
                opacity,
                boxShadow: isHighlighted
                  ? '0 0 0 2px ' + (cfg ? cfg.color : '#0A6B52') + ', 0 4px 12px ' + (cfg ? cfg.color + '44' : '#0A6B5244')
                  : isHovered && !isHighlighted
                    ? '0 2px 8px rgba(0,0,0,.12)'
                    : 'none',
                cursor: onClickLot ? 'pointer' : 'default',
                transition: 'all .15s',
                userSelect: 'none',
                flexShrink: 0,
                position: 'relative',
                overflow: 'hidden',
              }
            },
              // 畝番号（上部）
              React.createElement('span', {
                style: {
                  fontSize: '8px',
                  fontWeight: 800,
                  color: isHighlighted ? '#fff' : (cfg ? cfg.color : '#9CA3AF'),
                  lineHeight: 1,
                  letterSpacing: '-.02em',
                }
              }, i),
              // 品種名（縦書き風・中央）
              lot ? React.createElement('span', {
                style: {
                  fontSize: '7px',
                  fontWeight: 600,
                  color: isHighlighted ? 'rgba(255,255,255,.85)' : (cfg ? cfg.color + 'CC' : '#9CA3AF'),
                  writingMode: 'vertical-rl',
                  textOrientation: 'mixed',
                  letterSpacing: '.04em',
                  lineHeight: 1,
                  maxHeight: '42px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }
              }, lot.variety) : null,
              // 下部スペーサー（高さ揃え用）
              React.createElement('span', { style:{ height:'8px' } })
            )
    )
  }

  // 表示モード: ホバー中ロット（ハイライト優先）
  const displayLot = hoveredRow ? rowToLot.get(hoveredRow) : null

  return React.createElement('div', null,
    // 凡例
    React.createElement('div', {
      style: { display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '12px', alignItems: 'center' }
    },
      Object.entries(ROW_STATUS_CONFIG).map(([key, cfg]) =>
        React.createElement('div', {
          key,
          style: { display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#6B7280', fontWeight: 500 }
        },
          selectable
            ? React.createElement('div', { style: { width: 10, height: 10, borderRadius: '3px', background: cfg.bg, border: '1.5px solid ' + cfg.color + '88' } })
            : React.createElement('div', { style: { width: 10, height: 22, borderRadius: '3px', background: cfg.bg, border: '1.5px solid ' + cfg.color + '88' } }),
          cfg.label
        )
      ),
      selectable && React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#6B7280', fontWeight: 500 }
      },
        React.createElement('div', { style: { width: 10, height: 10, borderRadius: '3px', background: '#0A6B52' } }),
        '選択中'
      )
    ),

    // 【P3: 複数畝の一括登録】「全畝を選択／クリア」ワンタップ。「1〜6畝ぜんぶ同じ薬を散布」を素早く。
    selectable && onSelectRows && React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }
    },
      React.createElement('button', {
        type: 'button',
        onClick: () => { const s = new Set(); for (let i = 1; i <= totalRows; i++) s.add(i); onSelectRows(s) },
        style: { fontSize: '11.5px', fontWeight: 700, color: '#0A6B52', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '7px', padding: '5px 12px', cursor: 'pointer' }
      }, '全畝を選択（' + totalRows + '畝）'),
      (selectedRows && selectedRows.size > 0) && React.createElement('button', {
        type: 'button', onClick: () => onSelectRows(new Set()),
        style: { fontSize: '11.5px', fontWeight: 600, color: '#6B7280', background: 'none', border: '1px solid #E2E8F0', borderRadius: '7px', padding: '5px 12px', cursor: 'pointer' }
      }, 'クリア'),
      (selectedRows && selectedRows.size > 0) && React.createElement('span', { style: { fontSize: '11px', color: '#0A6B52', fontWeight: 700 } }, selectedRows.size + '畝 選択中')
    ),

    // 畝グリッド
    // ダッシュボード表示モード(selectable=false)では横スクロールの畝帯レイアウト
    // 記録入力モーダル(selectable=true)では従来の折り返しグリッドを維持
    React.createElement('div', {
      style: selectable
        ? { display: 'flex', flexWrap: 'wrap', gap: '4px' }
        : {
            display: 'flex',
            flexWrap: 'nowrap',
            gap: '3px',
            overflowX: 'auto',
            paddingBottom: '8px',
            paddingTop: '4px',
            // スクロールバーを細く
            scrollbarWidth: 'thin',
            scrollbarColor: '#DDE8DE transparent',
          }
    }, ...rows),

    // ホバー時プレビュー（表示モードかつハイライト未選択の場合のみ表示）
    displayLot && !highlightedLotId
      ? React.createElement('div', {
          style: {
            marginTop: '10px', padding: '10px 14px',
            background: ROW_STATUS_CONFIG[displayLot.status]?.bg || '#F8FAFC',
            border: '1px solid ' + (ROW_STATUS_CONFIG[displayLot.status]?.color || '#CBD5E1') + '44',
            borderRadius: '8px', fontSize: '12px', color: '#374151',
            display: 'flex', gap: '18px', flexWrap: 'wrap'
          }
        },
          React.createElement('div', null,
            React.createElement('span', { style:{ color:'#9CA3AF', marginRight:'4px' } }, '畝範囲'),
            React.createElement('strong', null, displayLot.row_range + '畝')
          ),
          React.createElement('div', null,
            React.createElement('span', { style:{ color:'#9CA3AF', marginRight:'4px' } }, '品種'),
            React.createElement('strong', null, displayLot.variety)
          ),
          React.createElement('div', null,
            React.createElement('span', { style:{ color:'#9CA3AF', marginRight:'4px' } }, '収穫予定'),
            (displayLot.harvest_start || '未定') + (displayLot.harvest_end ? '〜' + displayLot.harvest_end : '')
          ),
          React.createElement('div', null,
            React.createElement('span', {
              style: {
                fontSize:'11px', fontWeight:600, padding:'2px 8px', borderRadius:'6px',
                color: ROW_STATUS_CONFIG[displayLot.status]?.color || '#6B7280',
                background: 'white',
                border: '1px solid ' + (ROW_STATUS_CONFIG[displayLot.status]?.color || '#CBD5E1') + '66'
              }
            }, ROW_STATUS_CONFIG[displayLot.status]?.label || displayLot.status)
          )
        )
      : !highlightedLotId
        ? React.createElement('div', {
            style: { marginTop: '10px', fontSize: '12px', color: '#C4CABA', fontStyle: 'italic' }
          }, selectable ? '畝をクリックして選択' : '畝をクリックするとロット詳細を固定表示します')
        : null
  )
}

// ─────────────────────────────────────────────────────
// 【水稲の代替UX】RiceStageTimeline — 圃場一枚＝1管理単位のステージ進捗バー
// 畝マップが「畝ごとの色分けカード」で個体を識別するのに対し、水稲は畝という単位を持たないため、
// 田植え→分げつ→出穂→刈取りという時間軸のステージ進捗を同じ位置（統計カードの下）に表示する。
// field.rice_stage_dates が無い圃場（休閑中など）は「ステージ管理対象外」の旨を表示する。
function RiceStageTimeline({ field }) {
  const dates = field.rice_stage_dates
  if (!dates) {
    return React.createElement('div', {
      style: { padding:'16px', textAlign:'center', color:'#9CA3AF', fontSize:'13px' }
    }, '現在、生育ステージの記録対象期間外です（休閑中）')
  }

  const STAGES = [
    { key:'transplant', label:'田植え', icon:'🌱' },
    { key:'tillering',  label:'分げつ', icon:'🌾' },
    { key:'heading',    label:'出穂',   icon:'🌼' },
    { key:'harvest',    label:'刈取り', icon:'🚜' },
  ]
  const today = new Date('2026-06-19') // システム上の「今日」固定値（他画面と統一）
  // 今日時点で「実施済み」とみなせる最後のステージのindexを求める
  let currentIdx = -1
  STAGES.forEach((s, i) => {
    const d = dates[s.key]
    if (d && new Date(d) <= today) currentIdx = i
  })

  return React.createElement('div', null,
    React.createElement('div', {
      style: { display:'flex', alignItems:'center', position:'relative', padding:'8px 4px 0' }
    },
      STAGES.map((s, i) => {
        const d = dates[s.key]
        const isDone    = i <= currentIdx
        const isCurrent = i === currentIdx
        const isFuture  = i > currentIdx
        return React.createElement(React.Fragment, { key:s.key },
          // ステージ丸印 + ラベル
          React.createElement('div', { style:{ display:'flex', flexDirection:'column', alignItems:'center', flex:'0 0 auto', width:'90px' } },
            React.createElement('div', {
              style: {
                width:'34px', height:'34px', borderRadius:'50%',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:'15px',
                background: isDone ? '#2563EB' : '#F1F5F1',
                border: isCurrent ? '2.5px solid #1D4ED8' : '1.5px solid #DDE8DE',
                boxShadow: isCurrent ? '0 0 0 3px #2563EB33' : 'none',
                opacity: isFuture ? 0.5 : 1,
              }
            }, s.icon),
            React.createElement('div', { style:{ marginTop:'6px', fontSize:'12px', fontWeight:700, color: isFuture ? '#9CA3AF' : '#111827' } }, s.label),
            React.createElement('div', { style:{ fontSize:'10px', color:'#9CA3AF', marginTop:'1px' } }, d || '未定')
          ),
          // 次のステージへの接続線（最後のステージ以外）
          i < STAGES.length - 1
            ? React.createElement('div', {
                style: {
                  flex: 1, height: '3px', marginTop: '-22px',
                  background: i < currentIdx ? '#2563EB' : '#E5E7EB',
                  borderRadius: '2px',
                }
              })
            : null
        )
      })
    ),
    React.createElement('div', {
      style: { marginTop:'14px', fontSize:'12px', color:'#374151', padding:'8px 12px', background:'#EFF6FF', borderRadius:'8px', border:'1px solid #DBEAFE' }
    },
      currentIdx === -1
        ? '田植え前（準備中）'
        : currentIdx === STAGES.length - 1
          ? React.createElement('span', null, '刈取り完了予定: ', React.createElement('strong', null, dates.harvest))
          : React.createElement('span', null, '現在のステージ: ', React.createElement('strong', null, STAGES[currentIdx].label), '　次は「', STAGES[currentIdx+1].label, '」（予定: ' + (dates[STAGES[currentIdx+1].key] || '未定') + '）')
    )
  )
}

// 【フェーズE・E-4 Step3】FieldDashboardSection — 圃場ダッシュボード
// E-2「既存記録＋ロット概要を集約表示」の方針に基づき、
// 「現在進行中のロット数」「直近の収穫予定」「要防除アラート」「最近の作業記録」を集約する。
// FIELD_SUB_ITEMS の先頭タブ（dashboard）として表示される。
// 【Step3追加】畝マップのクリックでロット詳細をハイライト表示する
// ─────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────
// 【畝ロット管理】LotFormModal — 畝ロットの手動登録・編集フォーム
// 定植日報からの自動生成を補完する自由度の高い入力手段。
// 畝範囲は「1-7」「8-15,20」のような表記で入力（散布・収穫記録と同じ形式）。
// ─────────────────────────────────────────────────────
function LotFormModal({ field, lot, existingLots, onSave, onClose }) {
  const isEdit = !!lot
  const [form, setForm] = React.useState({
    row_range:        lot?.row_range        || '',
    variety:          lot?.variety          || '',
    seed_date:        lot?.seed_date        || '',
    transplant_date:  lot?.transplant_date  || '',
    harvest_start:    lot?.harvest_start    || '',
    harvest_end:      lot?.harvest_end      || '',
    seedling_type:    lot?.seedling_type    || '',
    transplant_count: lot?.transplant_count || '',
    status:           lot?.status           || 'growing',
    // 種苗情報（GGAP 26章「種苗」/ McD 6.1.1 種子供給源の証憑。実データ「種苗購入記録表」に対応・任意入力）
    seed_supplier:      lot?.seed_supplier      || '',
    seed_origin:        lot?.seed_origin        || '',
    seed_purchase_date: lot?.seed_purchase_date || '',
    seed_purchase_qty:  lot?.seed_purchase_qty  || '',
    seed_disinfection:  lot?.seed_disinfection  || '',
    seed_gmo:           lot?.seed_gmo           || '',
  })
  const uf = (k, v) => setForm(f => ({ ...f, [k]: v }))
  // 種苗情報は普段の畝ロット登録を煩雑にしないよう折りたたみ。既入力があれば開いた状態で出す
  const [showSeedInfo, setShowSeedInfo] = React.useState(
    !!(lot && (lot.seed_supplier || lot.seed_origin || lot.seed_purchase_date || lot.seed_purchase_qty || lot.seed_disinfection || lot.seed_gmo))
  )

  const rowSet = parseRowRange(form.row_range)
  // 他ロットとの畝番号重複チェック（編集中の自分自身は除外）
  const overlapping = (existingLots || []).some(l => {
    if (isEdit && l.id === lot.id) return false
    const other = parseRowRange(l.row_range)
    for (const n of rowSet) { if (other.has(n)) return true }
    return false
  })
  const valid = rowSet.size > 0 && form.variety.trim() !== ''

  const handleSave = () => {
    if (!valid) { showToast('畝範囲と品種を入力してください', 'warn'); return }
    const seedlingDays = (form.seed_date && form.transplant_date)
      ? Math.round((new Date(form.transplant_date) - new Date(form.seed_date)) / 86400000)
      : (lot?.seedling_period_days ?? null)
    onSave({
      ...(lot || {}),
      ...form,
      variety: form.variety.trim(),
      row_range: form.row_range.trim(),
      transplant_count: Number(form.transplant_count) || null,
      seedling_period_days: seedlingDays,
      seed_purchase_qty: Number(form.seed_purchase_qty) || null,
    })
    onClose()
  }

  const inputStyle = {
    background:'#FFFFFF', border:'1.5px solid #D8E4D8', borderRadius:'7px',
    padding:'7px 10px', fontSize:'13px', color:'#111827', outline:'none', width:'100%', boxSizing:'border-box'
  }
  const labelStyle = {
    fontSize:'10px', fontWeight:700, color:'#6B7280', letterSpacing:'.05em',
    textTransform:'uppercase', marginBottom:'4px', display:'block'
  }
  const fieldBox = (label, key, type = 'text', placeholder = '') =>
    React.createElement('div', null,
      React.createElement('label', { style: labelStyle }, label),
      React.createElement('input', {
        type, placeholder, value: form[key],
        onChange: e => uf(key, e.target.value), style: inputStyle,
      })
    )

  return React.createElement('div', {
    style:{ position:'fixed', inset:0, background:'rgba(17,24,39,.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' },
    onClick: onClose
  },
    React.createElement('div', {
      style:{ background:'#FFFFFF', borderRadius:'12px', padding:'24px', width:'520px', maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.2)', animation:'fadeInDown .18s ease' },
      onClick: e => e.stopPropagation()
    },
      React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' } },
        React.createElement('div', { style:{ fontSize:'15px', fontWeight:700, color:'#111827' } },
          (isEdit ? '畝ロットを編集' : '畝ロットを追加') + ' — ' + field.name),
        React.createElement('button', {
          onClick: onClose,
          style:{ background:'none', border:'none', cursor:'pointer', fontSize:'20px', color:'#9CA3AF', lineHeight:1, padding:'4px' }
        }, '✕')
      ),

      // 畝範囲 + 品種
      React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'12px' } },
        React.createElement('div', null,
          React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'4px' } },
            React.createElement('label', { style:{ ...labelStyle, marginBottom:0 } }, '畝範囲 *'),
            rowSet.size > 0 && React.createElement('span', {
              style:{ fontSize:'10px', fontWeight:700, color:'#0A6B52', background:'#ECFDF5', border:'1px solid #6EE7B7', borderRadius:'10px', padding:'1px 7px' }
            }, rowSet.size + '畝')
          ),
          React.createElement('input', {
            type:'text', placeholder:'例: 1-7 / 8-15,20', value:form.row_range,
            onChange:e=>uf('row_range', e.target.value), style:inputStyle,
          })
        ),
        fieldBox('品種 *', 'variety', 'text', '例: ブルラッシュ')
      ),
      overlapping && React.createElement('div', {
        style:{ fontSize:'11px', color:'#B45309', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:'6px', padding:'6px 10px', marginBottom:'12px' }
      }, '⚠️ 他のロットと畝番号が重なっています（登録は可能です。畝の使い回しの場合はそのままでOK）'),

      // 日付類
      React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'12px' } },
        fieldBox('播種日（は種日）', 'seed_date', 'date'),
        fieldBox('定植日', 'transplant_date', 'date'),
        fieldBox('収穫予定 開始', 'harvest_start', 'date'),
        fieldBox('収穫予定 終了', 'harvest_end', 'date')
      ),
      React.createElement('div', { style:{ fontSize:'11px', color:'#94A3B8', marginBottom:'12px' } },
        '※ 収穫予定開始日を入れると、この畝ロットが防除アラートの判定対象になります'),

      // 苗種類・定植枚数・状態
      React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px', marginBottom:'18px' } },
        fieldBox('苗種類', 'seedling_type', 'text', '例: セル200'),
        fieldBox('定植枚数', 'transplant_count', 'number', '例: 80'),
        React.createElement('div', null,
          React.createElement('label', { style: labelStyle }, '状態'),
          React.createElement('select', {
            value: form.status, onChange: e => uf('status', e.target.value),
            style:{ ...inputStyle, height:'34px' }
          },
            Object.entries(ROW_STATUS_CONFIG).map(([key, cfg]) =>
              React.createElement('option', { key, value:key }, cfg.label)
            )
          )
        )
      ),

      // 種苗情報（GAP証憑・折りたたみ）— GGAP 26章/McD 6.1.1 に対応。実データの「種苗購入記録表」の項目
      React.createElement('div', { style:{ marginBottom:'18px', border:'1px solid #E2E8E2', borderRadius:'8px', overflow:'hidden' } },
        React.createElement('button', {
          onClick: () => setShowSeedInfo(v => !v),
          style:{ width:'100%', textAlign:'left', background:'#F8FAF8', border:'none', padding:'9px 12px', cursor:'pointer', fontSize:'12px', fontWeight:700, color:'#0A6B52', display:'flex', alignItems:'center', justifyContent:'space-between' }
        },
          '🌱 種苗情報（GAP審査用・任意）',
          React.createElement('span', { style:{ fontSize:'11px', color:'#9CA3AF' } }, showSeedInfo ? '閉じる ▲' : '開く ▼')
        ),
        showSeedInfo && React.createElement('div', { style:{ padding:'12px' } },
          React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'12px' } },
            fieldBox('購入先（育成者）', 'seed_supplier', 'text', '例: ㈲葛田園芸'),
            fieldBox('生産地（国）', 'seed_origin', 'text', '例: 日本'),
            fieldBox('購入日', 'seed_purchase_date', 'date'),
            fieldBox('購入量（枚 = 128セル）', 'seed_purchase_qty', 'number', '例: 80')
          ),
          React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' } },
            fieldBox('種子消毒（薬剤名・回数 / なし）', 'seed_disinfection', 'text', '例: なし'),
            React.createElement('div', null,
              React.createElement('label', { style: labelStyle }, '遺伝子組換の有無'),
              React.createElement('select', {
                value: form.seed_gmo, onChange: e => uf('seed_gmo', e.target.value),
                style:{ ...inputStyle, height:'34px' }
              },
                React.createElement('option', { value:'' }, '未記入'),
                React.createElement('option', { value:'無' }, '無'),
                React.createElement('option', { value:'有' }, '有')
              )
            )
          ),
          React.createElement('div', { style:{ fontSize:'10.5px', color:'#94A3B8', marginTop:'8px' } },
            '※ GGAP「26 種苗」/ McD 6.1.1（種子供給源）の証憑になります。ロット№は播種日で管理されます')
        )
      ),

      // ボタン
      React.createElement('div', { style:{ display:'flex', gap:'10px', justifyContent:'flex-end' } },
        React.createElement('button', {
          onClick: onClose,
          style:{ padding:'9px 18px', borderRadius:'8px', border:'1.5px solid #D8E4D8', background:'#fff', color:'#374151', fontSize:'13px', fontWeight:600, cursor:'pointer' }
        }, 'キャンセル'),
        React.createElement('button', {
          onClick: handleSave,
          style:{
            padding:'9px 20px', borderRadius:'8px', border:'none',
            cursor: valid ? 'pointer' : 'not-allowed',
            background: valid ? '#0A6B52' : '#D1D5DB', color:'#fff', fontSize:'13px', fontWeight:700,
          }
        }, isEdit ? '保存する' : '登録する')
      )
    )
  )
}

function FieldDashboardSection({ field, fieldRecords, fieldRows, pesticides, lotSprayRecords, onAddLot, onUpdateLot, onDeleteLot }) {
  const lots          = fieldRows || []
  const activeLots     = lots.filter(l => l.status === 'growing' || l.status === 'ready')
  const harvestedLots  = lots.filter(l => l.status === 'harvested')
  // 【Step6】このロットの圃場に紐づくlotSprayRecordsだけを渡し、畝単位で精密に判定する
  const fieldLotSprayRecords = (lotSprayRecords || []).filter(r => String(r.field_id) === String(field.id))
  const lotRisks       = calcLotHarvestRisk(fieldRecords, lots, pesticides || [], fieldLotSprayRecords)

  // 【Step3】畝マップでクリックされたロットのID（nullで未選択）
  const [highlightedLotId, setHighlightedLotId] = React.useState(null)
  const highlightedLot = highlightedLotId ? lots.find(l => l.id === highlightedLotId) : null

  // 【畝ロット管理】追加・編集モーダル / 削除確認
  const [lotModal, setLotModal] = React.useState(null)             // null | { lot: null(新規) | lotObj(編集) }
  const [lotDeleteTarget, setLotDeleteTarget] = React.useState(null)

  // 直近の収穫予定: 進行中ロットを収穫開始日が近い順に並べる
  const upcomingHarvests = [...activeLots]
    .filter(l => l.harvest_start)
    .sort((a, b) => a.harvest_start.localeCompare(b.harvest_start))
    .slice(0, 5)

  const recentRecords = [...fieldRecords].reverse().slice(0, 5)

  return React.createElement('div', null,

    // --- 統計カード（ロット概要） ---
    React.createElement('div', { className:'stat-grid' },
      React.createElement('div', { className:'stat-card green' },
        React.createElement('div', { className:'stat-n' }, activeLots.length),
        React.createElement('div', { className:'stat-l' }, '進行中ロット')
      ),
      React.createElement('div', { className:'stat-card blue' },
        React.createElement('div', { className:'stat-n' }, lots.length),
        React.createElement('div', { className:'stat-l' }, '総ロット数')
      ),
      React.createElement('div', { className:'stat-card amber' },
        React.createElement('div', { className:'stat-n' }, harvestedLots.length),
        React.createElement('div', { className:'stat-l' }, '収穫済みロット')
      ),
      React.createElement('div', { className:'stat-card red' },
        React.createElement('div', { className:'stat-n' }, lotRisks.length),
        React.createElement('div', { className:'stat-l' }, '要防除アラート')
      )
    ),

    // --- 🆕 畝マップ（Step3: クリックでロット詳細ハイライト） ---
    // 【常時表示】開閉トグルは設けない。表示/非表示の唯一の条件は
    // 「ロットデータがあり、かつ row_count（畝の総本数）が設定されている圃場か」のみ。
    // 条件を満たす圃場では、ダッシュボードを開いた時点で常に畝マップが見える。
    lots.length > 0 && field.row_count
      ? React.createElement('div', { style:{ marginBottom:'24px' } },
          React.createElement(SectionTitle, { icon:'layout-grid' }, '畝マップ'),
          React.createElement('div', { className:'card' },
            React.createElement(RowMap, {
              lots,
              totalRows: field.row_count,
              selectable: false,
              highlightedLotId,
              onClickLot: setHighlightedLotId,
              showSides: field.crop_category === 'corn',
            }),

            // ─ ハイライト中のロット詳細パネル ─
            highlightedLot
              ? React.createElement('div', {
                  style: {
                    marginTop: '16px',
                    borderTop: '1px solid #E8F0E8',
                    paddingTop: '16px',
                  }
                },
                  // ヘッダー行（ロット名 + 閉じるボタン）
                  React.createElement('div', {
                    style: { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }
                  },
                    React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px' } },
                      React.createElement('div', {
                        style: {
                          width: 10, height: 10, borderRadius: '3px', flexShrink: 0,
                          background: ROW_STATUS_CONFIG[highlightedLot.status]?.color || '#9CA3AF'
                        }
                      }),
                      React.createElement('span', { style:{ fontSize:'14px', fontWeight:700, color:'#111827' } },
                        highlightedLot.row_range + '畝　' + highlightedLot.variety
                      ),
                      React.createElement('span', {
                        style: {
                          fontSize:'11px', fontWeight:600, padding:'2px 8px', borderRadius:'6px',
                          color: ROW_STATUS_CONFIG[highlightedLot.status]?.color || '#6B7280',
                          background: ROW_STATUS_CONFIG[highlightedLot.status]?.bg || '#F8FAFC',
                          border: '1px solid ' + (ROW_STATUS_CONFIG[highlightedLot.status]?.color || '#CBD5E1') + '55'
                        }
                      }, ROW_STATUS_CONFIG[highlightedLot.status]?.label || highlightedLot.status)
                    ),
                    React.createElement('button', {
                      onClick: () => setHighlightedLotId(null),
                      style: {
                        border: 'none', background: 'none', cursor: 'pointer',
                        color: '#9CA3AF', fontSize: '18px', lineHeight:1, padding:'2px 4px',
                        borderRadius: '4px',
                      },
                      title: '閉じる'
                    }, '×')
                  ),
                  // 詳細グリッド
                  React.createElement('div', {
                    style: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:'8px' }
                  },
                    [
                      ['は種日',     highlightedLot.seed_date       || '—'],
                      ['定植日',     highlightedLot.transplant_date || '—'],
                      ['収穫予定開始', highlightedLot.harvest_start  || '—'],
                      ['収穫予定終了', highlightedLot.harvest_end    || '—'],
                      ['育苗期間',   highlightedLot.seedling_period_days ? highlightedLot.seedling_period_days + '日' : '—'],
                      ['定植本数',   highlightedLot.transplant_count ? highlightedLot.transplant_count + '本' : '—'],
                    ].map(([label, val]) =>
                      React.createElement('div', {
                        key: label,
                        style: { background:'#F8FAF8', borderRadius:'6px', padding:'8px 12px' }
                      },
                        React.createElement('div', { style:{ fontSize:'10px', color:'#9CA3AF', fontWeight:600, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'3px' } }, label),
                        React.createElement('div', { style:{ fontSize:'13px', color:'#111827', fontWeight:600 } }, val)
                      )
                    )
                  ),
                  // 定植前農薬
                  highlightedLot.pretransplant_pesticides && highlightedLot.pretransplant_pesticides.length > 0
                    ? React.createElement('div', { style:{ marginTop:'10px' } },
                        React.createElement('div', { style:{ fontSize:'10px', color:'#9CA3AF', fontWeight:600, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'6px' } }, '定植前農薬'),
                        React.createElement('div', { style:{ display:'flex', gap:'6px', flexWrap:'wrap' } },
                          highlightedLot.pretransplant_pesticides.map((p, i) =>
                            React.createElement('span', {
                              key: i,
                              style: { fontSize:'12px', background:'#FFF7ED', color:'#92400E', border:'1px solid #FDE68A', borderRadius:'6px', padding:'3px 9px', fontWeight:500 }
                            }, p.name + '　' + p.amount)
                          )
                        )
                      )
                    : null
                )
              : null
          )
        )
      : null,

    // --- 🆕 生育ステージタイムライン（水稲の畝マップ代替） ---
    // 水稲は畝という単位で管理しない（田植え/分げつ/出穂/刈取りという時間軸の管理）ため、
    // 畝マップの代わりに圃場一枚＝1管理単位のステージ進捗バーを同じ位置に表示する。
    field.crop_category === 'rice'
      ? React.createElement('div', { style:{ marginBottom:'24px' } },
          React.createElement(SectionTitle, { icon:'layout-grid' }, '生育ステージ'),
          React.createElement('div', { className:'card' },
            React.createElement(RiceStageTimeline, { field })
          )
        )
      : null,

    // --- 【畝ロット管理】ロット一覧 + 追加・編集・削除 ---
    React.createElement('div', { style:{ marginBottom:'24px' } },
      React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' } },
        React.createElement(SectionTitle, { icon:'rows', style:{ marginBottom:0 } }, '畝ロット管理'),
        onAddLot && React.createElement('button', {
          className:'btn btn-primary',
          style:{ display:'flex', alignItems:'center', gap:'6px' },
          onClick: () => setLotModal({ lot: null })
        },
          React.createElement('i', { className:'ti ti-plus', style:{ fontSize:'14px' } }),
          '畝ロットを追加'
        )
      ),
      lots.length === 0
        ? React.createElement('div', { className:'card', style:{ padding:'24px', textAlign:'center', color:'#94A3B8', fontSize:'13px', lineHeight:1.8 } },
            '畝ロットはまだ登録されていません。', React.createElement('br', null),
            '定植日報（作業畝数入り）を保存すると自動で作成されます。手動でも追加できます。'
          )
        : React.createElement('div', { className:'card', style:{ padding:0, overflowX:'auto' } },
            React.createElement('table', { className:'table', style:{ width:'100%', fontSize:'13px' } },
              React.createElement('thead', null,
                React.createElement('tr', null,
                  ['畝範囲', '品種', '播種日', '定植日', '収穫予定', '状態', ''].map((h, i) =>
                    React.createElement('th', { key:i, style:{ whiteSpace:'nowrap' } }, h))
                )
              ),
              React.createElement('tbody', null,
                lots.map(lot => {
                  const cfg = ROW_STATUS_CONFIG[lot.status] || ROW_STATUS_CONFIG.growing
                  return React.createElement('tr', { key: lot.id },
                    React.createElement('td', { style:{ fontWeight:700, whiteSpace:'nowrap' } }, lot.row_range + '畝'),
                    React.createElement('td', null, lot.variety),
                    React.createElement('td', { style:{ whiteSpace:'nowrap' } }, lot.seed_date || '—'),
                    React.createElement('td', { style:{ whiteSpace:'nowrap' } }, lot.transplant_date || '—'),
                    React.createElement('td', { style:{ whiteSpace:'nowrap' } },
                      lot.harvest_start ? lot.harvest_start + (lot.harvest_end ? '〜' + lot.harvest_end : '〜') : '—'),
                    React.createElement('td', null,
                      React.createElement('span', {
                        style:{ fontSize:'11px', fontWeight:600, color:cfg.color, background:cfg.bg, border:'1px solid '+cfg.color+'40', borderRadius:'6px', padding:'2px 8px', whiteSpace:'nowrap' }
                      }, cfg.label)
                    ),
                    React.createElement('td', { style:{ whiteSpace:'nowrap', textAlign:'right' } },
                      onUpdateLot && React.createElement('button', {
                        onClick: () => setLotModal({ lot }), title:'編集',
                        style:{ background:'none', border:'none', color:'#64748B', cursor:'pointer', fontSize:'15px', padding:'4px' }
                      }, React.createElement('i', { className:'ti ti-pencil' })),
                      onDeleteLot && React.createElement('button', {
                        onClick: () => setLotDeleteTarget(lot), title:'削除',
                        style:{ background:'none', border:'none', color:'#CBD5E1', cursor:'pointer', fontSize:'15px', padding:'4px' }
                      }, React.createElement('i', { className:'ti ti-trash' }))
                    )
                  )
                })
              )
            )
          )
    ),

    // --- 要防除アラート ---
    React.createElement('div', { style:{ marginBottom:'20px' } },
      React.createElement(SectionTitle, { icon:'alert-triangle' }, '要防除アラート'),
      lotRisks.length === 0
        ? React.createElement(LotRiskClearBadge)
        : lotRisks.map(r => React.createElement(LotRiskAlertCard, { key:r.id, risk:r })),
      // 防除は法的な使用基準（作物別の収穫前日数・使用回数・希釈倍率）に関わるため、
      // 本アラートが「参考値」であることを常に明示する
      React.createElement('div', { style:{ fontSize:'11px', color:'#94A3B8', marginTop:'8px', lineHeight:1.7 } },
        '※ 農薬マスタに登録した「収穫前日数」と畝ロットの「収穫予定開始日」から算出した参考情報です。',
        '収穫前日数は作物ごとに異なるため、実際の使用可否は必ず農薬ラベルの使用基準で確認してください。'
      )
    ),

    // --- 直近の収穫予定 ---
    React.createElement('div', { style:{ marginBottom:'20px' } },
      React.createElement(SectionTitle, { icon:'basket' }, '直近の収穫予定'),
      React.createElement('div', { className:'card', style:{ padding: upcomingHarvests.length === 0 ? '24px' : '0 16px' } },
        upcomingHarvests.length === 0
          ? React.createElement('div', { style:{ textAlign:'center', color:'#94A3B8', fontSize:'13px' } }, '収穫予定の進行中ロットはありません')
          : upcomingHarvests.map((lot, i) => {
              const cfg = ROW_STATUS_CONFIG[lot.status]
              return React.createElement('div', {
                key: lot.id,
                style:{
                  display:'flex', alignItems:'center', gap:'12px', padding:'12px 0',
                  borderBottom: i === upcomingHarvests.length - 1 ? 'none' : '1px solid #F1F5F9'
                }
              },
                React.createElement('div', { style:{ width:8, height:8, borderRadius:'2px', background:cfg.color, flexShrink:0 } }),
                React.createElement('div', { style:{ flex:1, minWidth:0 } },
                  React.createElement('div', { style:{ fontSize:'14px', fontWeight:600, color:'#111827' } }, lot.row_range + '畝 ・ ' + lot.variety),
                  React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280', marginTop:'2px' } }, '収穫予定: ' + lot.harvest_start + '〜' + (lot.harvest_end || ''))
                ),
                React.createElement('span', {
                  style:{ fontSize:'11px', fontWeight:600, color:cfg.color, background:cfg.bg, border:'1px solid '+cfg.color+'40', borderRadius:'6px', padding:'3px 8px', flexShrink:0 }
                }, cfg.label)
              )
            })
      )
    ),

    // --- 最近の作業記録（既存記録の集約表示） ---
    React.createElement('div', null,
      React.createElement(SectionTitle, { icon:'notebook' }, '最近の作業記録'),
      React.createElement('div', { className:'card', style:{ padding: recentRecords.length === 0 ? '24px' : '0 16px' } },
        recentRecords.length === 0
          ? React.createElement('div', { style:{ textAlign:'center', color:'#94A3B8', fontSize:'13px' } }, 'この圃場の記録はまだありません')
          : recentRecords.map(r => React.createElement(RecordLogRow, { key:r.id, record:r, fields:[field] }))
      )
    ),

    // --- 【畝ロット管理】追加・編集モーダル ---
    lotModal && React.createElement(LotFormModal, {
      field,
      lot: lotModal.lot,
      existingLots: lots,
      onSave: (lotData) => {
        if (lotModal.lot) { onUpdateLot && onUpdateLot(field.id, lotData) }
        else              { onAddLot && onAddLot(field.id, lotData) }
      },
      onClose: () => setLotModal(null),
    }),

    // --- 【畝ロット管理】削除確認 ---
    lotDeleteTarget && React.createElement(ConfirmDeleteModal, {
      title: '畝ロットを削除しますか？',
      targetName: lotDeleteTarget.row_range + '畝　' + lotDeleteTarget.variety,
      detail: '散布記録・収穫記録は削除されません（畝範囲のテキストは残ります）',
      onCancel: () => setLotDeleteTarget(null),
      onConfirm: () => { onDeleteLot && onDeleteLot(field.id, lotDeleteTarget.id); setLotDeleteTarget(null) },
    })
  )
}

// ─────────────────────────────────────────────────────
// 【フェーズE・E-4 Step4】LotSprayRecordForm — 農薬散布記録（ロット単位）入力フォーム
// 【Step4更新】畝範囲入力を RowMap（selectable:true）に置き換え。
//   lots がある圃場 → 畝マップでクリック選択 → row_range 文字列に自動変換
//   lots がない圃場 → 従来のテキスト入力のみ（フォールバック）
//   両モード共存: 畝マップ下部に手動入力欄も常時表示（微調整用）
// ─────────────────────────────────────────────────────
function LotSprayRecordForm({ field, pesticides, lots, onSave, onCancel, staff, defaultWeather, pastSprays }) {
  // 【P6 次回防除リマインド】この圃場で各農薬を前回撒いた日→経過日数を出し、撒き過ぎ/間隔の判断を助ける。
  const lastSprayFor = (pid) => {
    if (!pid) return null
    const hits = (pastSprays || []).filter(r => String(r.field_id) === String(field.id) && (r.pesticides || []).some(p => String(p.pesticide_id) === String(pid)) && r.date)
    if (!hits.length) return null
    hits.sort((a, b) => String(b.date).localeCompare(String(a.date)))
    const last = hits[0].date
    const days = Math.round((new Date(todayYmd()) - new Date(last)) / 86400000)
    return { last, days: Number.isFinite(days) ? days : null }
  }
  const [date, setDate]               = React.useState(todayYmd())
  const [weather, setWeather]         = React.useState(defaultWeather || '')  // 天気（薬剤散布記録シートの「天気」列に対応・P4で直近の記録から既定候補）
  const [selectedRows, setSelectedRows] = React.useState(new Set())  // 畝マップ選択セット
  const [rowRange, setRowRange]       = React.useState('')            // テキスト入力（フォールバック・手動調整用）
  const [sprayVolume, setSprayVolume] = React.useState('')
  const [staffIds, setStaffIds]       = React.useState([])  // 【実装手順書 C】担当者
  const [items, setItems] = React.useState([
    { pesticide_id: pesticides[0]?.id ?? '', dilution: pesticides[0]?.dilution ?? '', disposal_amount: '' }
  ])
  // 【実装手順書 Step1】備考・メモ＋転記チェック
  const [note, setNote]     = React.useState('')
  const [checks, setChecks] = React.useState({})

  const hasMap = lots && lots.length > 0 && field.row_count

  // 畝マップ選択が変わったら row_range テキストに自動反映
  const handleSelectRows = (newSet) => {
    setSelectedRows(newSet)
    setRowRange(selectedRowsToRange(newSet))
  }

  // テキスト手動編集した場合は、マップ選択との同期を切る（テキスト優先）
  const handleRowRangeText = (val) => {
    setRowRange(val)
    // 手動編集時はマップ選択をリセット（選択状態とテキストの乖離を防ぐ）
    setSelectedRows(new Set())
  }

  const inputStyle = {
    background:'#FFFFFF', border:'1.5px solid #D8E4D8',
    borderRadius:'7px', padding:'7px 10px', fontSize:'13px',
    color:'#111827', outline:'none', width:'100%', boxSizing:'border-box'
  }
  const labelStyle = {
    fontSize:'10px', fontWeight:700, color:'#6B7280',
    letterSpacing:'.05em', textTransform:'uppercase', marginBottom:'4px', display:'block'
  }

  // 希釈倍率の初期値: ①農薬マスタの標準希釈 → ②作物別の推奨希釈 → ③空。
  // undefinedは入れない（controlled→uncontrolled 警告防止のため必ず ''）。
  const recDilution = (pid) => {
    const p = masterById(pesticides, pid)
    if (p && p.dilution != null && p.dilution !== '') return p.dilution
    const list = (typeof RECOMMENDED_DILUTIONS !== 'undefined' && field) ? RECOMMENDED_DILUTIONS[field.crop] : null
    const hit  = list && list.find(r => String(r.pesticide_id) === String(pid))
    return (hit && hit.dilution != null) ? hit.dilution : ''
  }
  const updateItem = (idx, patch) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  const addItem    = () => setItems(prev => [...prev, { pesticide_id: pesticides[0]?.id ?? '', dilution: recDilution(pesticides[0]?.id), disposal_amount: '' }])
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx))

  const handlePesticideChange = (idx, id) => {
    updateItem(idx, { pesticide_id: id ? String(id) : '', dilution: recDilution(id) }) // UUID対応
  }

  // rowRange（テキスト）が最終的な保存値。マップ選択→自動変換 or 手動入力どちらでも同じstateに入る。
  const valid = !!date && rowRange.trim() !== '' && Number(sprayVolume) > 0 &&
    items.length > 0 && items.every(it => it.pesticide_id && Number(it.dilution) > 0)

  const submittingRef = React.useRef(false)
  // 【送信IDの保持(Codexレビュー13 Critical)】保存が成功と確定するまで同じ記録IDを使い回す。
  // 「DBはcommit済みなのに応答だけ喪失→再送」でも、同一IDならRPCの冪等性で二重登録・二重減算にならない。
  const submitIdRef = React.useRef(null)
  const handleSubmit = async () => {
    if (!valid) { showToast('日付・畝範囲・散布量・農薬と希釈倍率を入力してください', 'warn'); return }
    if (submittingRef.current) return   // 連打による二重登録を防止
    submittingRef.current = true
    setTimeout(() => { submittingRef.current = false }, 1200)
    if (!submitIdRef.current) submitIdRef.current = newUuid()
    // 祝福(紙吹雪)は保存側(app.js)がRPC/保存成功をawaitした後に出す。失敗時はフォームを保持する
    const res = await Promise.resolve(onSave({
      id: submitIdRef.current,
      field_id: field.id,
      date,
      weather,
      row_range: rowRange.trim(),
      pesticides: items.map(it => ({
        pesticide_id: String(it.pesticide_id), // UUID対応: Number()はNaN化するため禁止
        dilution: Number(it.dilution),
        disposal_amount: Number(it.disposal_amount) || 0,
      })),
      spray_volume_L: Number(sprayVolume),
      note: note.trim(),
      checks,
      staff_ids: staffIds,
    })).catch(() => null)
    // 成功はok===trueのみ(null/例外/不明応答は失敗扱い=入力と送信IDを保持し、再送は同じIDで冪等)
    if (!(res && res.ok === true)) { submittingRef.current = false; return }
    submitIdRef.current = null // 成功が確定: 次の記録は新しいIDで
  }

  return React.createElement('div', null,

    // ── 散布日・天気（1行） ──
    React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'14px' } },
      React.createElement('div', null,
        React.createElement('label', { style:labelStyle }, '散布日'),
        React.createElement('input', { type:'date', value:date, onChange:e=>setDate(e.target.value), style:inputStyle })
      ),
      React.createElement('div', null,
        React.createElement('label', { style:labelStyle }, '天気'),
        React.createElement('div', { style:{ display:'flex', gap:'6px' } },
          [{ v:'晴', icon:'☀️' }, { v:'曇', icon:'🌤' }, { v:'雨', icon:'🌧' }, { v:'強風', icon:'💨' }].map(w =>
            React.createElement('button', {
              key: w.v,
              onClick: () => setWeather(weather === w.v ? '' : w.v),
              style:{
                padding:'7px 10px', borderRadius:'7px', cursor:'pointer', fontSize:'12px', border:'1.5px solid',
                borderColor: weather === w.v ? '#0A6B52' : '#D8E4D8',
                background:  weather === w.v ? '#ECFDF5' : '#FFFFFF',
                color:       weather === w.v ? '#0A6B52' : '#64748B',
              }
            }, w.icon + ' ' + w.v)
          )
        )
      )
    ),

    // ── 畝範囲（畝マップ or テキスト入力） ──
    React.createElement('div', { style:{ marginBottom:'14px' } },
      React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'6px' } },
        React.createElement('label', { style:{ ...labelStyle, marginBottom:0 } }, '畝範囲'),
        // 選択済み件数バッジ
        selectedRows.size > 0
          ? React.createElement('span', {
              style:{ fontSize:'11px', fontWeight:700, color:'#0A6B52', background:'#ECFDF5', border:'1px solid #6EE7B7', borderRadius:'12px', padding:'2px 9px' }
            }, selectedRows.size + '畝 選択中')
          : null
      ),

      // 畝マップ（lotsがある圃場のみ表示）
      hasMap
        ? React.createElement('div', {
            style:{ border:'1.5px solid #D8E4D8', borderRadius:'8px', padding:'12px', background:'#FAFBFA', marginBottom:'8px' }
          },
            React.createElement(RowMap, {
              lots,
              totalRows: field.row_count,
              selectable: true,
              selectedRows,
              onSelectRows: handleSelectRows,
              showSides: field.crop_category === 'corn',
            })
          )
        : null,

      // テキスト入力（常時表示。畝マップありの場合は「手動調整用」として補助的に使う）
      React.createElement('div', null,
        hasMap
          ? React.createElement('div', { style:{ fontSize:'11px', color:'#9CA3AF', marginBottom:'4px', fontStyle:'italic' } },
              '↑ 畝をクリックして選択。または下記に直接入力（例: 1-40, 1-6,8）'
            )
          : null,
        React.createElement('input', {
          type:'text',
          placeholder: hasMap ? '直接入力で上書き可（例: 1-40）' : '例: 1-40',
          value: rowRange,
          onChange: e => handleRowRangeText(e.target.value),
          style: {
            ...inputStyle,
            borderColor: rowRange.trim() ? '#0A6B52' : '#D8E4D8',
            background: rowRange.trim() ? '#F0FDF4' : '#FFFFFF',
          }
        })
      )
    ),

    // ── 使用農薬 ──
    React.createElement('label', { style:labelStyle }, '使用農薬'),
    React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'4px' } },
      ...items.map((it, idx) =>
        React.createElement('div', {
          key:idx,
          style:{ display:'flex', flexDirection:'column', gap:'8px', padding:'10px', background:'#F8FAF8', border:'1px solid #E5ECE5', borderRadius:'8px' }
        },
          React.createElement('div', { style:{ display:'flex', gap:'8px', alignItems:'center' } },
            React.createElement('select', {
              value: it.pesticide_id ?? '',
              onChange: e => handlePesticideChange(idx, e.target.value),
              style: { ...inputStyle, flex:2, background:'#FFFFFF' }
            },
              pesticides.map(p => React.createElement('option', { key:p.id, value:p.id }, p.name))
            ),
            React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'4px', flex:1 } },
              React.createElement('input', {
                type:'number', value:it.dilution ?? '',
                onChange: e => updateItem(idx, { dilution: e.target.value }),
                style: { ...inputStyle, background:'#FFFFFF' }
              }),
              React.createElement('span', { style:{ fontSize:'12px', color:'#6B7280', flexShrink:0 } }, '倍')
            ),
            items.length > 1 && React.createElement('button', {
              onClick: () => removeItem(idx), title:'この薬剤を削除',
              style:{ background:'none', border:'none', color:'#94A3B8', cursor:'pointer', fontSize:'16px', padding:'4px', flexShrink:0 }
            }, '✕')
          ),
          // 【P6 希釈計算ヘルパー】散布液量×1000÷希釈倍率＝必要な原液量(mL)。計量ミスを防ぐ。
          (Number(sprayVolume) > 0 && Number(it.dilution) > 0) && React.createElement('div', {
            style:{ fontSize:'11.5px', color:'#0A6B52', background:'#ECFDF5', border:'1px solid #A7F3D0', borderRadius:'6px', padding:'5px 9px', display:'flex', alignItems:'center', gap:'5px', flexWrap:'wrap' }
          },
            React.createElement('i', { className:'ti ti-calculator', 'aria-hidden':'true', style:{ fontSize:'12px', flexShrink:0 } }),
            React.createElement('span', { style:{ fontWeight:700 } }, '必要な原液量：約 ' + (Math.round(Number(sprayVolume) * 1000 / Number(it.dilution) * 10) / 10) + ' mL'),
            React.createElement('span', { style:{ color:'#6B7280' } }, '（散布液 ' + sprayVolume + 'L ÷ ' + it.dilution + '倍）')
          ),
          // 【P6 次回防除リマインド】この圃場でこの薬を前回撒いた日と経過日数
          (() => {
            const ls = lastSprayFor(it.pesticide_id)
            // 日数が正常(0以上の有限値)な時だけ表示（壊れた日付の「—」や未来日誤入力の負日数を出さない・番人監査 P6 Low）
            if (!ls || ls.days == null || ls.days < 0) return null
            return React.createElement('div', { style:{ fontSize:'11px', color:'#92400E', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:'6px', padding:'4px 9px', display:'flex', alignItems:'center', gap:'5px', flexWrap:'wrap' } },
              React.createElement('i', { className:'ti ti-bell', 'aria-hidden':'true', style:{ fontSize:'12px', flexShrink:0 } }),
              React.createElement('span', null, 'この圃場に前回この薬を撒いてから ' + (ls.days != null ? ls.days + '日' : '—') + '（' + ls.last + '）')
            )
          })(),
          React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'6px' } },
            React.createElement('span', { style:{ fontSize:'11px', color:'#9CA3AF', fontWeight:600, flexShrink:0, whiteSpace:'nowrap' } },
              React.createElement('i', { className:'ti ti-trash', style:{ fontSize:'12px', verticalAlign:'-1px', marginRight:'3px', color:'#C2410C' } }),
              '廃棄量'
            ),
            React.createElement('input', {
              type:'number', step:'0.1', min:'0', placeholder:'0',
              value: it.disposal_amount ?? '',
              onChange: e => updateItem(idx, { disposal_amount: e.target.value }),
              style: { ...inputStyle, background:'#FFFFFF', maxWidth:'110px' }
            }),
            React.createElement('span', { style:{ fontSize:'12px', color:'#6B7280', flexShrink:0 } }, 'L（希釈後の使い切れず廃棄した量）')
          )
        )
      ),
      React.createElement('button', {
        onClick: addItem,
        style:{
          display:'flex', alignItems:'center', gap:'5px', fontSize:'12px', fontWeight:600,
          color:'#0A6B52', background:'none', border:'1.5px dashed #B8D4C0', borderRadius:'7px',
          padding:'6px 10px', cursor:'pointer', alignSelf:'flex-start', marginTop:'2px'
        }
      },
        React.createElement('i', { className:'ti ti-plus', style:{ fontSize:'13px' } }),
        '農薬を追加'
      )
    ),

    // ── 散布液量 ──
    React.createElement('div', { style:{ margin:'14px 0 18px' } },
      React.createElement('label', { style:labelStyle }, '散布液量（L）'),
      React.createElement('input', { type:'number', placeholder:'例: 500', value:sprayVolume, onChange:e=>setSprayVolume(e.target.value), style:inputStyle })
    ),

    // 【実装手順書 C】担当者選択（収穫記録と同パターン）
    React.createElement(StaffPicker, {
      staff, staffIds, onChange: setStaffIds,
    }),

    // 【実装手順書 Step1】備考・メモ＋転記チェック
    React.createElement(NoteChecklistField, {
      note, onNoteChange: setNote,
      checks, onChecksChange: setChecks,
      checkKeys: ['pesticide_fert', 'mgmt_table', 'sa'],
    }),

    // ── ボタン ──
    React.createElement('div', { style:{ display:'flex', gap:'10px', justifyContent:'flex-end', marginTop:'14px' } },
      React.createElement('button', {
        onClick: onCancel,
        style:{ padding:'9px 18px', borderRadius:'8px', border:'1.5px solid #D8E4D8', background:'#fff', color:'#374151', fontSize:'13px', fontWeight:600, cursor:'pointer' }
      }, 'キャンセル'),
      React.createElement('button', {
        onClick: handleSubmit,
        style:{
          padding:'9px 20px', borderRadius:'8px', border:'none',
          cursor: valid ? 'pointer' : 'not-allowed',
          background: valid ? '#0A6B52' : '#D1D5DB', color:'#fff', fontSize:'13px', fontWeight:700,
          boxShadow: valid ? '0 2px 6px rgba(10,107,82,.25)' : 'none'
        }
      }, '記録する')
    )
  )
}

// ─────────────────────────────────────────────────────
// 【フェーズE・E-4 Step4】LotSprayRecordList — ロット単位の散布記録一覧
// ─────────────────────────────────────────────────────
function LotSprayRecordList({ records, pesticides, onDelete, field, staff }) {
  // 【削除確認モーダル統一】どの削除ボタンも一旦ConfirmDeleteModalで確認を取る
  const [deleteTarget, setDeleteTarget] = React.useState(null)
  const [selectedRecord, setSelectedRecord] = React.useState(null)  // 詳細モーダル対象
  if (records.length === 0) {
    return React.createElement('div', { className:'card', style:{ padding:'32px', textAlign:'center', color:'#6B7280', fontSize:'14px' } },
      React.createElement('i', { className:'ti ti-spray', style:{ fontSize:'28px', display:'block', marginBottom:'8px', color:'#CBD5E1' } }),
      'この圃場のロット単位の散布記録はまだありません'
    )
  }
  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date))
  return React.createElement(React.Fragment, null,
  React.createElement('div', { className:'card', style:{ padding:'0' } },
    sorted.map((r, idx) =>
      React.createElement('div', {
        key: r.id,
        onClick: () => setSelectedRecord(r),
        style:{
          padding:'14px 18px',
          borderBottom: idx === sorted.length - 1 ? 'none' : '1px solid #F1F5F9',
          display:'flex', alignItems:'flex-start', gap:'14px',
          cursor:'pointer', transition:'background .12s'
        },
        onMouseEnter: e => { e.currentTarget.style.background = '#F8FAF8' },
        onMouseLeave: e => { e.currentTarget.style.background = 'transparent' },
      },
        React.createElement('div', {
          style:{ width:32, height:32, borderRadius:'50%', background:'#0A6B52', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }
        }, React.createElement('i', { className:'ti ti-spray', style:{ fontSize:'16px', color:'#FFFFFF' } })),
        React.createElement('div', { style:{ flex:1, minWidth:0 } },
          React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'5px' } },
            React.createElement('span', { style:{ fontSize:'14px', fontWeight:700, color:'#111827' } }, r.row_range + '畝'),
            React.createElement('span', { style:{ fontSize:'12px', color:'#94A3B8' } }, r.date),
            React.createElement(TranscribeStatusBadge, { checks: r.checks, checkKeys:['pesticide_fert','mgmt_table','sa'] })
          ),
          React.createElement('div', { style:{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'6px' } },
            ...(r.pesticides || []).map((p, i) => {
              const pest = masterById(pesticides, p.pesticide_id)
              const disposal = Number(p.disposal_amount) || 0
              return React.createElement('span', {
                key:i,
                style:{ fontSize:'11px', fontWeight:600, color:'#0A6B52', background:'#F0FDF4', border:'1px solid #BBE5CF', borderRadius:'5px', padding:'2px 8px' }
              },
                (pest ? pest.name : '不明な農薬') + '（' + p.dilution + '倍）',
                disposal > 0 && React.createElement('span', { style:{ color:'#C2410C', fontWeight:700, marginLeft:'5px' } }, '廃棄' + disposal + 'L')
              )
            })
          ),
          React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280', display:'flex', gap:'14px' } },
            React.createElement('span', null, '散布液量: ' + r.spray_volume_L + 'L'),
            (() => {
              const totalDisposal = (r.pesticides || []).reduce((sum, p) => sum + (Number(p.disposal_amount) || 0), 0)
              return totalDisposal > 0
                ? React.createElement('span', { style:{ color:'#C2410C', fontWeight:600 } },
                    React.createElement('i', { className:'ti ti-trash', style:{ fontSize:'12px', verticalAlign:'-1px', marginRight:'3px' } }),
                    '廃棄量合計: ' + Math.round(totalDisposal * 100) / 100 + 'L'
                  )
                : null
            })()
          ),
          r.note && React.createElement('div', { style:{ fontSize:'11px', color:'#7C3AED', marginTop:'4px', display:'flex', alignItems:'flex-start', gap:'4px' } },
            React.createElement('i', { className:'ti ti-notes', style:{ fontSize:'11px', marginTop:'1px', flexShrink:0 } }),
            React.createElement('span', null, r.note)
          )
        ),
        React.createElement('button', {
          onClick: e => { e.stopPropagation(); setDeleteTarget(r) }, title:'削除',
          style:{ background:'none', border:'none', color:'#CBD5E1', cursor:'pointer', fontSize:'15px', padding:'4px', flexShrink:0 }
        }, React.createElement('i', { className:'ti ti-trash' }))
      )
    )
  ),

    // ── 詳細モーダル（日報記録の詳細モーダルと同じ見た目に統一） ──
    selectedRecord && React.createElement('div', {
      style:{ position:'fixed', inset:0, background:'rgba(17,24,39,.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' },
      onClick: () => setSelectedRecord(null)
    },
      React.createElement('div', {
        style:{ background:'#FFFFFF', borderRadius:'12px', padding:'24px', width:'480px', maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.2)', animation:'fadeInDown .18s ease' },
        onClick: e => e.stopPropagation()
      },
        // ヘッダー
        React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' } },
          React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'10px' } },
            React.createElement('div', { style:{ width:36, height:36, borderRadius:'50%', background:'#DC2626', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 } },
              React.createElement('i', { className:'ti ti-spray', style:{ fontSize:'18px', color:'#FFFFFF' } })
            ),
            React.createElement('div', null,
              React.createElement('div', { style:{ fontSize:'15px', fontWeight:700, color:'#111827' } }, '農薬散布記録'),
              React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280' } }, selectedRecord.date + (field ? '　' + field.name : ''))
            )
          ),
          React.createElement('button', {
            onClick: () => setSelectedRecord(null),
            style:{ background:'none', border:'none', cursor:'pointer', fontSize:'20px', color:'#9CA3AF', lineHeight:1, padding:'4px' }
          }, '✕')
        ),

        // 情報行
        React.createElement('div', { style:{ background:'#F8FAF8', borderRadius:'8px', padding:'4px 12px', marginBottom:'16px' } },
          React.createElement('div', { style:rowStyle2 },
            React.createElement('span', { style:{ color:'#6B7280' } }, '日付'),
            React.createElement('span', { style:{ fontWeight:600 } }, selectedRecord.date)
          ),
          selectedRecord.weather && React.createElement('div', { style:rowStyle2 },
            React.createElement('span', { style:{ color:'#6B7280' } }, '天気'),
            React.createElement('span', { style:{ fontWeight:600 } }, selectedRecord.weather)
          ),
          field && React.createElement('div', { style:rowStyle2 },
            React.createElement('span', { style:{ color:'#6B7280' } }, '圃場'),
            React.createElement('span', { style:{ fontWeight:600 } }, field.name)
          ),
          React.createElement('div', { style:rowStyle2 },
            React.createElement('span', { style:{ color:'#6B7280' } }, '畝範囲'),
            React.createElement('span', { style:{ fontWeight:600 } }, selectedRecord.row_range + '畝')
          ),
          React.createElement('div', { style:{ ...rowStyle2, alignItems:'flex-start' } },
            React.createElement('span', { style:{ color:'#6B7280', flexShrink:0 } }, '使用農薬'),
            React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:'4px', alignItems:'flex-end' } },
              ...(selectedRecord.pesticides || []).map((p, i) => {
                const pest = masterById(pesticides, p.pesticide_id)
                const disposal = Number(p.disposal_amount) || 0
                return React.createElement('div', { key:i, style:{ fontWeight:600, color:'#B45309', textAlign:'right' } },
                  (pest ? pest.name : '不明な農薬') + '（' + p.dilution + '倍）',
                  disposal > 0 && React.createElement('span', { style:{ color:'#C2410C', marginLeft:'6px', fontWeight:700 } }, '廃棄' + disposal + 'L')
                )
              })
            )
          ),
          React.createElement('div', { style:rowStyle2 },
            React.createElement('span', { style:{ color:'#6B7280' } }, '散布液量'),
            React.createElement('span', null, selectedRecord.spray_volume_L + ' L')
          ),
          React.createElement('div', { style:rowStyle2 },
            React.createElement('span', { style:{ color:'#6B7280' } }, '担当者'),
            React.createElement('span', null, staffNames(staff, selectedRecord.staff_ids))
          ),
          React.createElement('div', { style:{ ...rowStyle2, borderBottom:'none' } },
            React.createElement('span', { style:{ color:'#6B7280' } }, '備考'),
            React.createElement('span', { style:{ color: selectedRecord.note ? '#374151' : '#9CA3AF' } }, selectedRecord.note || 'なし')
          )
        ),

        // 転記チェック状況
        React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'16px' } },
          React.createElement('span', { style:{ fontSize:'12px', color:'#6B7280' } }, '転記チェック'),
          React.createElement(TranscribeStatusBadge, { checks: selectedRecord.checks, checkKeys:['pesticide_fert','mgmt_table','sa'] })
        ),

        // ボタン群
        React.createElement('div', { style:{ display:'flex', gap:'8px' } },
          React.createElement('button', {
            onClick: () => { setDeleteTarget(selectedRecord); setSelectedRecord(null) },
            style:{
              flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'6px',
              padding:'9px 18px', borderRadius:'4px', fontSize:'14px', fontWeight:600,
              cursor:'pointer', border:'1.5px solid #FCA5A5', background:'#FEF2F2', color:'#DC2626'
            }
          },
            React.createElement('i', { className:'ti ti-trash', style:{ fontSize:'14px' } }),
            '削除'
          ),
          React.createElement('button', {
            onClick: () => setSelectedRecord(null),
            style:{ flex:1, padding:'9px 18px', borderRadius:'4px', border:'none', background:'#0A6B52', color:'#fff', fontSize:'14px', fontWeight:700, cursor:'pointer' }
          }, '閉じる')
        )
      )
    ),

    deleteTarget && React.createElement(ConfirmDeleteModal, {
      title: '散布記録を削除しますか？',
      targetName: deleteTarget.row_range + '畝　' + deleteTarget.date,
      onCancel: () => setDeleteTarget(null),
      onConfirm: () => { onDelete(deleteTarget.id); setDeleteTarget(null) }
    })
  )
}

// ─────────────────────────────────────────────────────
// 【フェーズE・E-4 Step4】LotSprayRecordSection — 「農薬散布記録」タブ本体
// E-2の確定仕様「pesticide: ロット単位の散布記録一覧＋新規入力」に対応
// ─────────────────────────────────────────────────────
function LotSprayRecordSection({ field, lotSprayRecords, pesticides, onSave, onDelete, staff, lots: lotsProp }) {
  const [showAddModal, setShowAddModal] = React.useState(false)
  const fieldSprayRecords = lotSprayRecords.filter(r => String(r.field_id) === String(field.id))
  const lots = lotsProp || []

  return React.createElement('div', null,
    React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' } },
      React.createElement(SectionTitle, { icon:'spray', style:{ marginBottom:0 } }, 'ロット単位の散布記録一覧'),
      React.createElement('button', {
        className:'btn btn-primary',
        style:{ display:'flex', alignItems:'center', gap:'6px' },
        onClick: () => setShowAddModal(true)
      },
        React.createElement('i', { className:'ti ti-plus', style:{ fontSize:'14px' } }),
        '新規入力'
      )
    ),
    React.createElement(LotSprayRecordList, { records: fieldSprayRecords, pesticides, onDelete, field, staff }),

    // 新規入力モーダル
    showAddModal && React.createElement('div', {
      style:{ position:'fixed', inset:0, background:'rgba(17,24,39,.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' },
      onClick: () => setShowAddModal(false)
    },
      React.createElement('div', {
        style:{ background:'#FFFFFF', borderRadius:'12px', padding:'24px', width:'520px', maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.2)', animation:'fadeInDown .18s ease' },
        onClick: e => e.stopPropagation()
      },
        React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' } },
          React.createElement('div', { style:{ fontSize:'15px', fontWeight:700, color:'#111827' } }, '農薬散布記録（ロット単位）の新規入力'),
          React.createElement('button', {
            onClick: () => setShowAddModal(false),
            style:{ background:'none', border:'none', cursor:'pointer', fontSize:'20px', color:'#9CA3AF', lineHeight:1, padding:'4px' }
          }, '✕')
        ),
        React.createElement(LotSprayRecordForm, {
          field, pesticides, lots,
          onSave: r => { onSave(r); setShowAddModal(false) },
          onCancel: () => setShowAddModal(false),
          staff
        })
      )
    )
  )
}

// ─────────────────────────────────────────────────────
// 【サンプル農園実データ統合 フェーズ4・Step4-1】TopDressingRecordForm — 追肥記録入力フォーム
// LotSprayRecordForm（農薬散布記録フォーム）と同構造で新規作成。
// 畝マップ（RowMap）をそのまま再利用する（畝マップ機能の汎用性がここで生きる）。
// 入力項目: 日付・品目・追肥畝数（畝範囲から自動算出）・畝番号・肥料名・希釈倍率・
//          散布液量(L)・散布量(kg)（「サンプル農園追肥」シートの列構成に準拠）
// 実データでは「希釈倍率×散布液量」と「散布量(kg)直接入力」の両パターンが混在しているため、
// 肥料1件ごとに希釈倍率 or 散布量(kg) のどちらか一方が入力されていればOKとする
// （在庫減算側の優先ロジックは Step1-2 の onSaveTopDressingRecord 側で対応済み）。
// ─────────────────────────────────────────────────────
function TopDressingRecordForm({ field, fertilizers, lots, onSave, onCancel, staff }) {
  const [date, setDate]                 = React.useState(todayYmd())
  // 散布区分: 中川農園の記録手順では堆肥・元肥（ベッド前）・追肥がすべて「肥料散布記録」に集約されるため区分で管理
  const [fertilizingType, setFertilizingType] = React.useState('追肥')
  const [item, setItem]                 = React.useState(lots[0]?.variety || '')   // 品目（作物・品種）
  const [selectedRows, setSelectedRows] = React.useState(new Set())                // 畝マップ選択セット
  const [rowRange, setRowRange]         = React.useState('')                       // テキスト入力（フォールバック・手動調整用）
  const [sprayVolume, setSprayVolume]   = React.useState('')                       // 散布液量(L)（希釈倍率方式の場合のみ使用）
  const [staffIds, setStaffIds]         = React.useState([])  // 【実装手順書 C】担当者
  const [items, setItems] = React.useState([
    { fertilizer_id: fertilizers[0]?.id ?? '', dilution: '', amount_kg: '' }
  ])
  // 【実装手順書 Step1】備考・メモ＋転記チェック
  const [note, setNote]     = React.useState('')
  const [checks, setChecks] = React.useState({})

  const hasMap = lots && lots.length > 0 && field.row_count

  // 畝マップ選択が変わったら row_range テキストに自動反映
  const handleSelectRows = (newSet) => {
    setSelectedRows(newSet)
    setRowRange(selectedRowsToRange(newSet))
  }

  // テキスト手動編集した場合は、マップ選択との同期を切る（テキスト優先）
  const handleRowRangeText = (val) => {
    setRowRange(val)
    setSelectedRows(new Set())
  }

  // 追肥畝数 = 畝範囲文字列から実際の畝本数を算出（"1-6,8" → 7）
  const rowCount = parseRowRange(rowRange).size

  const inputStyle = {
    background:'#FFFFFF', border:'1.5px solid #D8E4D8',
    borderRadius:'7px', padding:'7px 10px', fontSize:'13px',
    color:'#111827', outline:'none', width:'100%', boxSizing:'border-box'
  }
  const labelStyle = {
    fontSize:'10px', fontWeight:700, color:'#6B7280',
    letterSpacing:'.05em', textTransform:'uppercase', marginBottom:'4px', display:'block'
  }

  const updateItem = (idx, patch) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  const addItem    = () => setItems(prev => {
    const firstFert = fertilizers[0]
    const suggested = getSuggestedFertilizerDilution(firstFert, item)
    return [...prev, { fertilizer_id: firstFert?.id ?? '', dilution: suggested != null ? String(suggested) : '', amount_kg: '' }]
  })
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx))

  const handleFertilizerChange = (idx, id) => {
    const fert = masterById(fertilizers, id) // UUID対応: Number()はNaN化するため禁止(masterByで両ID解決)
    // 【肥料 希釈倍率 案③】肥料マスタに登録があれば、品目(作物)に応じた倍率を自動セット（編集は常に可能）
    const suggested = getSuggestedFertilizerDilution(fert, item)
    updateItem(idx, {
      fertilizer_id: id, // UUIDはそのまま保持(NaN化させない)
      dilution: suggested != null ? String(suggested) : '',
    })
  }

  // rowRange（テキスト）が最終的な保存値。マップ選択→自動変換 or 手動入力どちらでも同じstateに入る。
  // 肥料の各行は「散布量(kg)直接」か「希釈倍率×散布液量」で使用量を確定できること。
  // 希釈方式は散布液量(L)が無いと使用量を計算できずRPCに拒否される→画面側でも同じ条件で弾く(保存失敗を未然に防ぐ)
  const valid = !!date && rowRange.trim() !== '' &&
    items.length > 0 && items.every(it => it.fertilizer_id &&
      (Number(it.amount_kg) > 0 || (Number(it.dilution) > 0 && Number(sprayVolume) > 0)))

  const submittingRef = React.useRef(false)
  // 送信ID保持: 成功(ok===true)確定まで同じIDを使い回す(応答喪失→再送でもRPC冪等で二重登録しない)
  const submitIdRef = React.useRef(null)
  const handleSubmit = async () => {
    if (!valid) { showToast('日付・畝範囲・肥料と量を入力してください（希釈倍率で入れる場合は散布液量も必須）', 'warn'); return }
    if (submittingRef.current) return   // 連打による二重登録を防止
    submittingRef.current = true
    setTimeout(() => { submittingRef.current = false }, 1200)
    if (!submitIdRef.current) submitIdRef.current = newUuid()
    // 祝福(紙吹雪)は保存側(app.js)がRPC/保存成功をawaitした後に出す。失敗時はフォームを保持する
    const res = await Promise.resolve(onSave({
      id: submitIdRef.current,
      field_id: field.id,
      date,
      fertilizing_type: fertilizingType,
      item: item.trim(),
      row_range: rowRange.trim(),
      row_count: rowCount,
      fertilizers: items.map(it => ({
        fertilizer_id: String(it.fertilizer_id), // UUID対応: Number()はNaN化するため禁止
        dilution: Number(it.dilution) || null,
        amount_kg: Number(it.amount_kg) || null,
      })),
      spray_volume_L: Number(sprayVolume) || null,
      note: note.trim(),
      checks,
      staff_ids: staffIds,
    })).catch(() => null)
    // 成功はok===trueのみ(null/例外/不明応答は失敗扱い=入力と送信IDを保持し、再送は同じIDで冪等)
    if (!(res && res.ok === true)) { submittingRef.current = false; return }
    submitIdRef.current = null // 成功が確定: 次の記録は新しいIDで
  }

  return React.createElement('div', null,

    // ── 散布日・散布区分 ──
    React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'14px' } },
      React.createElement('div', null,
        React.createElement('label', { style:labelStyle }, '散布日'),
        React.createElement('input', { type:'date', value:date, onChange:e=>setDate(e.target.value), style:inputStyle })
      ),
      React.createElement('div', null,
        React.createElement('label', { style:labelStyle }, '散布区分'),
        React.createElement('div', { style:{ display:'flex', gap:'6px' } },
          ['堆肥', '元肥', '追肥'].map(t =>
            React.createElement('button', {
              key: t,
              onClick: () => setFertilizingType(t),
              style:{
                padding:'7px 14px', borderRadius:'7px', cursor:'pointer', fontSize:'12px', fontWeight:600, border:'1.5px solid',
                borderColor: fertilizingType === t ? '#0A6B52' : '#D8E4D8',
                background:  fertilizingType === t ? '#ECFDF5' : '#FFFFFF',
                color:       fertilizingType === t ? '#0A6B52' : '#64748B',
              }
            }, t)
          )
        )
      )
    ),

    // ── 品目 ──
    React.createElement('div', { style:{ marginBottom:'14px' } },
      React.createElement('label', { style:labelStyle }, '品目'),
      React.createElement('input', {
        type:'text', placeholder:'例: レタス、スイートコーン',
        value:item, onChange:e=>setItem(e.target.value), style:inputStyle
      })
    ),

    // ── 畝範囲（畝マップ or テキスト入力）＋ 追肥畝数の自動表示 ──
    React.createElement('div', { style:{ marginBottom:'14px' } },
      React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'6px' } },
        React.createElement('label', { style:{ ...labelStyle, marginBottom:0 } }, '畝番号（散布畝数は自動計算）'),
        rowCount > 0
          ? React.createElement('span', {
              style:{ fontSize:'11px', fontWeight:700, color:'#0A6B52', background:'#ECFDF5', border:'1px solid #6EE7B7', borderRadius:'12px', padding:'2px 9px' }
            }, rowCount + '畝 選択中')
          : null
      ),

      // 畝マップ（lotsがある圃場のみ表示）
      hasMap
        ? React.createElement('div', {
            style:{ border:'1.5px solid #D8E4D8', borderRadius:'8px', padding:'12px', background:'#FAFBFA', marginBottom:'8px' }
          },
            React.createElement(RowMap, {
              lots,
              totalRows: field.row_count,
              selectable: true,
              selectedRows,
              onSelectRows: handleSelectRows,
              showSides: field.crop_category === 'corn',
            })
          )
        : null,

      // テキスト入力（常時表示。畝マップありの場合は「手動調整用」として補助的に使う）
      React.createElement('div', null,
        hasMap
          ? React.createElement('div', { style:{ fontSize:'11px', color:'#9CA3AF', marginBottom:'4px', fontStyle:'italic' } },
              '↑ 畝をクリックして選択。または下記に直接入力（例: 1-40, 1-6,8）'
            )
          : null,
        React.createElement('input', {
          type:'text',
          placeholder: hasMap ? '直接入力で上書き可（例: 1-40）' : '例: 1-40',
          value: rowRange,
          onChange: e => handleRowRangeText(e.target.value),
          style: {
            ...inputStyle,
            borderColor: rowRange.trim() ? '#0A6B52' : '#D8E4D8',
            background: rowRange.trim() ? '#F0FDF4' : '#FFFFFF',
          }
        })
      )
    ),

    // ── 使用肥料 ──
    React.createElement('label', { style:labelStyle }, '使用肥料'),
    fertilizers.length === 0
      ? React.createElement('div', {
          style:{ fontSize:'12px', color:'#B45309', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:'7px', padding:'8px 10px', marginBottom:'8px' }
        }, '⚠️ 肥料マスタが未登録です。先に「肥料マスタ管理」から肥料を登録してください。')
      : null,
    React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'4px' } },
      ...items.map((it, idx) => {
        // 【肥料 希釈倍率 案③】選択中の肥料に登録された倍率があるかどうかをヒント表示
        const selectedFert  = masterById(fertilizers, it.fertilizer_id)
        const suggestedDilu = getSuggestedFertilizerDilution(selectedFert, item)
        const isAutoFilled   = suggestedDilu != null && Number(it.dilution) === Number(suggestedDilu)
        return React.createElement('div', {
          key:idx,
          style:{ display:'flex', flexDirection:'column', gap:'8px', padding:'10px', background:'#F8FAF8', border:'1px solid #E5ECE5', borderRadius:'8px' }
        },
          React.createElement('div', { style:{ display:'flex', gap:'8px', alignItems:'center' } },
            React.createElement('select', {
              value: it.fertilizer_id,
              onChange: e => handleFertilizerChange(idx, e.target.value),
              style: { ...inputStyle, flex:2, background:'#FFFFFF' }
            },
              fertilizers.map(f => React.createElement('option', { key:f.id, value:f.id }, f.name))
            ),
            items.length > 1 && React.createElement('button', {
              onClick: () => removeItem(idx), title:'この肥料を削除',
              style:{ background:'none', border:'none', color:'#94A3B8', cursor:'pointer', fontSize:'16px', padding:'4px', flexShrink:0 }
            }, '✕')
          ),
          // 希釈倍率 と 散布量(kg) — どちらか一方を入力（実データの両パターンに対応）
          React.createElement('div', { style:{ display:'flex', gap:'10px', flexWrap:'wrap' } },
            React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'4px', flex:1, minWidth:'120px' } },
              React.createElement('span', { style:{ fontSize:'11px', color:'#9CA3AF', fontWeight:600, flexShrink:0, whiteSpace:'nowrap' } }, '希釈倍率'),
              React.createElement('input', {
                type:'number', placeholder:'例: 500',
                value:it.dilution,
                onChange: e => updateItem(idx, { dilution: e.target.value }),
                style: { ...inputStyle, background:'#FFFFFF' }
              }),
              React.createElement('span', { style:{ fontSize:'12px', color:'#6B7280', flexShrink:0 } }, '倍')
            ),
            React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'4px', flex:1, minWidth:'120px' } },
              React.createElement('span', { style:{ fontSize:'11px', color:'#9CA3AF', fontWeight:600, flexShrink:0, whiteSpace:'nowrap' } }, '散布量'),
              React.createElement('input', {
                type:'number', step:'0.1', min:'0', placeholder:'例: 5',
                value:it.amount_kg,
                onChange: e => updateItem(idx, { amount_kg: e.target.value }),
                style: { ...inputStyle, background:'#FFFFFF' }
              }),
              React.createElement('span', { style:{ fontSize:'12px', color:'#6B7280', flexShrink:0 } }, 'kg')
            )
          ),
          // 【肥料 希釈倍率 案③】肥料マスタに倍率が登録されている場合のヒント表示
          suggestedDilu != null
            ? React.createElement('div', { style:{ fontSize:'10px', color: isAutoFilled ? '#0A6B52' : '#9CA3AF', fontWeight: isAutoFilled ? 600 : 400 } },
                isAutoFilled
                  ? '✓ 肥料マスタの目安倍率(' + suggestedDilu + '倍)を自動入力しました（変更可）'
                  : '肥料マスタの目安倍率: ' + suggestedDilu + '倍（手動で変更されています）'
              )
            : React.createElement('div', { style:{ fontSize:'10px', color:'#9CA3AF' } },
                '肥料マスタに倍率が未登録です（「肥料マスタ管理」から登録すると次回以降自動入力されます）'
              ),
          React.createElement('div', { style:{ fontSize:'10px', color:'#9CA3AF', fontStyle:'italic' } },
            '※ 希釈倍率・散布量(kg)のどちらか一方を入力してください（両方ある場合は散布量(kg)を優先して在庫から減算します）'
          )
        )
      }),
      React.createElement('button', {
        onClick: addItem,
        disabled: fertilizers.length === 0,
        style:{
          display:'flex', alignItems:'center', gap:'5px', fontSize:'12px', fontWeight:600,
          color: fertilizers.length === 0 ? '#9CA3AF' : '#0A6B52',
          background:'none', border:'1.5px dashed #B8D4C0', borderRadius:'7px',
          padding:'6px 10px', cursor: fertilizers.length === 0 ? 'not-allowed' : 'pointer',
          alignSelf:'flex-start', marginTop:'2px'
        }
      },
        React.createElement('i', { className:'ti ti-plus', style:{ fontSize:'13px' } }),
        '肥料を追加'
      )
    ),

    // ── 散布液量（希釈倍率方式の場合のみ使用） ──
    React.createElement('div', { style:{ margin:'14px 0 18px' } },
      React.createElement('label', { style:labelStyle }, '散布液量（L）（希釈倍率方式の場合のみ入力）'),
      React.createElement('input', { type:'number', placeholder:'例: 500', value:sprayVolume, onChange:e=>setSprayVolume(e.target.value), style:inputStyle })
    ),

    // 【実装手順書 C】担当者選択（収穫記録と同パターン）
    React.createElement(StaffPicker, {
      staff, staffIds, onChange: setStaffIds,
    }),

    // 【実装手順書 Step1】備考・メモ＋転記チェック
    React.createElement(NoteChecklistField, {
      note, onNoteChange: setNote,
      checks, onChecksChange: setChecks,
      checkKeys: ['fert_stock', 'pesticide_fert', 'mgmt_table'],
    }),

    // ── ボタン ──
    React.createElement('div', { style:{ display:'flex', gap:'10px', justifyContent:'flex-end', marginTop:'14px' } },
      React.createElement('button', {
        onClick: onCancel,
        style:{ padding:'9px 18px', borderRadius:'8px', border:'1.5px solid #D8E4D8', background:'#fff', color:'#374151', fontSize:'13px', fontWeight:600, cursor:'pointer' }
      }, 'キャンセル'),
      React.createElement('button', {
        onClick: handleSubmit,
        style:{
          padding:'9px 20px', borderRadius:'8px', border:'none',
          cursor: valid ? 'pointer' : 'not-allowed',
          background: valid ? '#0A6B52' : '#D1D5DB', color:'#fff', fontSize:'13px', fontWeight:700,
          boxShadow: valid ? '0 2px 6px rgba(10,107,82,.25)' : 'none'
        }
      }, '記録する')
    )
  )
}

// ─────────────────────────────────────────────────────
// 【サンプル農園実データ統合 フェーズ4・Step4-1】TopDressingRecordList — 追肥記録一覧
// LotSprayRecordListと同構造（肥料名・希釈倍率 or 散布量(kg)を表示）
// ─────────────────────────────────────────────────────
function TopDressingRecordList({ records, fertilizers, onDelete, field, staff }) {
  const [deleteTarget, setDeleteTarget] = React.useState(null)
  const [selectedRecord, setSelectedRecord] = React.useState(null)  // 詳細モーダル対象
  if (records.length === 0) {
    return React.createElement('div', { className:'card', style:{ padding:'32px', textAlign:'center', color:'#6B7280', fontSize:'14px' } },
      React.createElement('i', { className:'ti ti-droplet', style:{ fontSize:'28px', display:'block', marginBottom:'8px', color:'#CBD5E1' } }),
      'この圃場の肥料散布記録はまだありません'
    )
  }
  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date))
  return React.createElement(React.Fragment, null,
  React.createElement('div', { className:'card', style:{ padding:'0' } },
    sorted.map((r, idx) =>
      React.createElement('div', {
        key: r.id,
        onClick: () => setSelectedRecord(r),
        style:{
          padding:'14px 18px',
          borderBottom: idx === sorted.length - 1 ? 'none' : '1px solid #F1F5F9',
          display:'flex', alignItems:'flex-start', gap:'14px',
          cursor:'pointer', transition:'background .12s'
        },
        onMouseEnter: e => { e.currentTarget.style.background = '#F8FAF8' },
        onMouseLeave: e => { e.currentTarget.style.background = 'transparent' },
      },
        React.createElement('div', {
          style:{ width:32, height:32, borderRadius:'50%', background:'#0A6B52', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }
        }, React.createElement('i', { className:'ti ti-droplet', style:{ fontSize:'16px', color:'#FFFFFF' } })),
        React.createElement('div', { style:{ flex:1, minWidth:0 } },
          React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'5px', flexWrap:'wrap' } },
            React.createElement('span', { style:{ fontSize:'14px', fontWeight:700, color:'#111827' } }, r.row_range + '畝'),
            r.fertilizing_type && React.createElement('span', {
              style:{ fontSize:'10px', fontWeight:700, color:'#B45309', background:'#FEF3C7', border:'1px solid #FDE68A', borderRadius:'10px', padding:'1px 8px' }
            }, r.fertilizing_type),
            r.item && React.createElement('span', { style:{ fontSize:'12px', color:'#64748B' } }, r.item),
            React.createElement('span', { style:{ fontSize:'12px', color:'#94A3B8' } }, r.date),
            React.createElement(TranscribeStatusBadge, { checks: r.checks, checkKeys:['fert_stock','pesticide_fert','mgmt_table'] })
          ),
          React.createElement('div', { style:{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'6px' } },
            ...(r.fertilizers || []).map((f, i) => {
              const fert = masterById(fertilizers, f.fertilizer_id)
              const detail = Number(f.amount_kg) > 0
                ? f.amount_kg + 'kg'
                : Number(f.dilution) > 0 ? f.dilution + '倍' : '—'
              return React.createElement('span', {
                key:i,
                style:{ fontSize:'11px', fontWeight:600, color:'#0A6B52', background:'#F0FDF4', border:'1px solid #BBE5CF', borderRadius:'5px', padding:'2px 8px' }
              }, (fert ? fert.name : '不明な肥料') + '（' + detail + '）')
            })
          ),
          r.spray_volume_L ? React.createElement('div', { style:{ fontSize:'11px', color:'#94A3B8' } }, '散布液量: ' + r.spray_volume_L + 'L') : null,
          r.note && React.createElement('div', { style:{ fontSize:'11px', color:'#7C3AED', marginTop:'4px', display:'flex', alignItems:'flex-start', gap:'4px' } },
            React.createElement('i', { className:'ti ti-notes', style:{ fontSize:'11px', marginTop:'1px', flexShrink:0 } }),
            React.createElement('span', null, r.note)
          )
        ),
        React.createElement('button', {
          onClick: e => { e.stopPropagation(); setDeleteTarget(r) }, title:'削除',
          style:{ background:'none', border:'none', color:'#CBD5E1', cursor:'pointer', fontSize:'15px', padding:'4px', flexShrink:0 }
        }, React.createElement('i', { className:'ti ti-trash' }))
      )
    )
  ),

    // ── 詳細モーダル（日報記録の詳細モーダルと同じ見た目に統一） ──
    selectedRecord && React.createElement('div', {
      style:{ position:'fixed', inset:0, background:'rgba(17,24,39,.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' },
      onClick: () => setSelectedRecord(null)
    },
      React.createElement('div', {
        style:{ background:'#FFFFFF', borderRadius:'12px', padding:'24px', width:'480px', maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.2)', animation:'fadeInDown .18s ease' },
        onClick: e => e.stopPropagation()
      },
        // ヘッダー
        React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' } },
          React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'10px' } },
            React.createElement('div', { style:{ width:36, height:36, borderRadius:'50%', background:'#0D9972', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 } },
              React.createElement('i', { className:'ti ti-droplet', style:{ fontSize:'18px', color:'#FFFFFF' } })
            ),
            React.createElement('div', null,
              React.createElement('div', { style:{ fontSize:'15px', fontWeight:700, color:'#111827' } }, '肥料散布記録'),
              React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280' } }, selectedRecord.date + (field ? '　' + field.name : ''))
            )
          ),
          React.createElement('button', {
            onClick: () => setSelectedRecord(null),
            style:{ background:'none', border:'none', cursor:'pointer', fontSize:'20px', color:'#9CA3AF', lineHeight:1, padding:'4px' }
          }, '✕')
        ),

        // 情報行
        React.createElement('div', { style:{ background:'#F8FAF8', borderRadius:'8px', padding:'4px 12px', marginBottom:'16px' } },
          React.createElement('div', { style:rowStyle2 },
            React.createElement('span', { style:{ color:'#6B7280' } }, '日付'),
            React.createElement('span', { style:{ fontWeight:600 } }, selectedRecord.date)
          ),
          selectedRecord.fertilizing_type && React.createElement('div', { style:rowStyle2 },
            React.createElement('span', { style:{ color:'#6B7280' } }, '散布区分'),
            React.createElement('span', { style:{ fontWeight:600 } }, selectedRecord.fertilizing_type)
          ),
          field && React.createElement('div', { style:rowStyle2 },
            React.createElement('span', { style:{ color:'#6B7280' } }, '圃場'),
            React.createElement('span', { style:{ fontWeight:600 } }, field.name)
          ),
          selectedRecord.item && React.createElement('div', { style:rowStyle2 },
            React.createElement('span', { style:{ color:'#6B7280' } }, '品目'),
            React.createElement('span', { style:{ fontWeight:600 } }, selectedRecord.item)
          ),
          React.createElement('div', { style:rowStyle2 },
            React.createElement('span', { style:{ color:'#6B7280' } }, '畝範囲'),
            React.createElement('span', { style:{ fontWeight:600 } }, selectedRecord.row_range + '畝')
          ),
          React.createElement('div', { style:{ ...rowStyle2, alignItems:'flex-start' } },
            React.createElement('span', { style:{ color:'#6B7280', flexShrink:0 } }, '使用肥料'),
            React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:'4px', alignItems:'flex-end' } },
              ...(selectedRecord.fertilizers || []).map((f, i) => {
                const fert = masterById(fertilizers, f.fertilizer_id)
                const detail = Number(f.amount_kg) > 0
                  ? f.amount_kg + 'kg'
                  : Number(f.dilution) > 0 ? f.dilution + '倍' : '—'
                return React.createElement('div', { key:i, style:{ fontWeight:600, color:'#0A6B52' } },
                  (fert ? fert.name : '不明な肥料') + '（' + detail + '）'
                )
              })
            )
          ),
          selectedRecord.spray_volume_L ? React.createElement('div', { style:rowStyle2 },
            React.createElement('span', { style:{ color:'#6B7280' } }, '散布液量'),
            React.createElement('span', null, selectedRecord.spray_volume_L + ' L')
          ) : null,
          React.createElement('div', { style:rowStyle2 },
            React.createElement('span', { style:{ color:'#6B7280' } }, '担当者'),
            React.createElement('span', null, staffNames(staff, selectedRecord.staff_ids))
          ),
          React.createElement('div', { style:{ ...rowStyle2, borderBottom:'none' } },
            React.createElement('span', { style:{ color:'#6B7280' } }, '備考'),
            React.createElement('span', { style:{ color: selectedRecord.note ? '#374151' : '#9CA3AF' } }, selectedRecord.note || 'なし')
          )
        ),

        // 転記チェック状況
        React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'16px' } },
          React.createElement('span', { style:{ fontSize:'12px', color:'#6B7280' } }, '転記チェック'),
          React.createElement(TranscribeStatusBadge, { checks: selectedRecord.checks, checkKeys:['fert_stock','pesticide_fert','mgmt_table'] })
        ),

        // ボタン群
        React.createElement('div', { style:{ display:'flex', gap:'8px' } },
          React.createElement('button', {
            onClick: () => { setDeleteTarget(selectedRecord); setSelectedRecord(null) },
            style:{
              flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'6px',
              padding:'9px 18px', borderRadius:'4px', fontSize:'14px', fontWeight:600,
              cursor:'pointer', border:'1.5px solid #FCA5A5', background:'#FEF2F2', color:'#DC2626'
            }
          },
            React.createElement('i', { className:'ti ti-trash', style:{ fontSize:'14px' } }),
            '削除'
          ),
          React.createElement('button', {
            onClick: () => setSelectedRecord(null),
            style:{ flex:1, padding:'9px 18px', borderRadius:'4px', border:'none', background:'#0A6B52', color:'#fff', fontSize:'14px', fontWeight:700, cursor:'pointer' }
          }, '閉じる')
        )
      )
    ),

    deleteTarget && React.createElement(ConfirmDeleteModal, {
      title: '肥料散布記録を削除しますか？',
      targetName: deleteTarget.row_range + '畝　' + deleteTarget.date,
      onCancel: () => setDeleteTarget(null),
      onConfirm: () => { onDelete(deleteTarget.id); setDeleteTarget(null) }
    })
  )
}

// ─────────────────────────────────────────────────────
// 【サンプル農園実データ統合 フェーズ4・Step4-1】TopDressingRecordSection
// LotSprayRecordSectionと同構造（一覧＋新規入力モーダル）
// ─────────────────────────────────────────────────────
function TopDressingRecordSection({ field, topDressingRecords, fertilizers, onSave, onDelete, staff, lots: lotsProp }) {
  const [showAddModal, setShowAddModal] = React.useState(false)
  const fieldRecords = (topDressingRecords || []).filter(r => String(r.field_id) === String(field.id))
  const lots = lotsProp || []

  return React.createElement('div', null,
    React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' } },
      React.createElement(SectionTitle, { icon:'droplet', style:{ marginBottom:0 } }, '肥料散布記録一覧（堆肥・元肥・追肥）'),
      React.createElement('button', {
        className:'btn btn-primary',
        style:{ display:'flex', alignItems:'center', gap:'6px' },
        onClick: () => setShowAddModal(true)
      },
        React.createElement('i', { className:'ti ti-plus', style:{ fontSize:'14px' } }),
        '新規入力'
      )
    ),
    React.createElement(TopDressingRecordList, { records: fieldRecords, fertilizers, onDelete, field, staff }),

    // 新規入力モーダル
    showAddModal && React.createElement('div', {
      style:{ position:'fixed', inset:0, background:'rgba(17,24,39,.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' },
      onClick: () => setShowAddModal(false)
    },
      React.createElement('div', {
        style:{ background:'#FFFFFF', borderRadius:'12px', padding:'24px', width:'520px', maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.2)', animation:'fadeInDown .18s ease' },
        onClick: e => e.stopPropagation()
      },
        React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' } },
          React.createElement('div', { style:{ fontSize:'15px', fontWeight:700, color:'#111827' } }, '肥料散布記録の新規入力'),
          React.createElement('button', {
            onClick: () => setShowAddModal(false),
            style:{ background:'none', border:'none', cursor:'pointer', fontSize:'20px', color:'#9CA3AF', lineHeight:1, padding:'4px' }
          }, '✕')
        ),
        React.createElement(TopDressingRecordForm, {
          field, fertilizers, lots,
          onSave: async r => { const res = await Promise.resolve(onSave(r)).catch(() => null); if (res && res.ok === true) setShowAddModal(false); return res }, // 成功時だけ閉じる(失敗は入力保持)
          onCancel: () => setShowAddModal(false),
          staff
        })
      )
    )
  )
}

// ─────────────────────────────────────────────────────
// 【実装手順書 Step2】ShipmentDestinationManageModal — 出荷先マスタ管理
// 出荷先（JA・取引先A・取引先C・取引先B・直売・袋詰め等）をハードコードせず、
// 後から追加・名称編集・削除できるようにする簡易マスタ管理モーダル。
// 「よく使う出荷先」(frequent) フラグも切り替え可能（収穫記録フォームの初期表示行に反映）。
// ─────────────────────────────────────────────────────
function ShipmentDestinationManageModal({ destinations, onChange, onClose }) {
  const [newLabel, setNewLabel] = React.useState('')
  const [deleteTarget, setDeleteTarget] = React.useState(null)

  const updateLabel = (key, label) => onChange(destinations.map(d => d.key === key ? { ...d, label } : d))
  const toggleFrequent = (key) => onChange(destinations.map(d => d.key === key ? { ...d, frequent: !d.frequent } : d))
  const removeDest = (key) => { onChange(destinations.filter(d => d.key !== key)); setDeleteTarget(null) }
  const addDest = () => {
    const label = newLabel.trim()
    if (!label) return
    const key = 'dest_' + Date.now()
    onChange([...destinations, { key, label, frequent:false }])
    setNewLabel('')
  }

  const rowStyle = { display:'flex', alignItems:'center', gap:'8px', padding:'7px 0', borderBottom:'1px solid #F1F5F9' }
  const inputStyle = { flex:1, padding:'6px 9px', borderRadius:'6px', border:'1.5px solid #D8E4D8', fontSize:'13px', color:'#111827', outline:'none' }

  return React.createElement('div', {
    style:{ position:'fixed', inset:0, background:'rgba(17,24,39,.45)', zIndex:2100, display:'flex', alignItems:'center', justifyContent:'center' },
    onClick: onClose
  },
    React.createElement('div', {
      style:{ background:'#FFFFFF', borderRadius:'12px', padding:'22px', width:'460px', maxWidth:'95vw', maxHeight:'85vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.2)' },
      onClick: e => e.stopPropagation()
    },
      React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'4px' } },
        React.createElement('div', { style:{ fontSize:'15px', fontWeight:700, color:'#111827' } }, '出荷先マスタ管理'),
        React.createElement('button', {
          onClick: onClose,
          style:{ background:'none', border:'none', cursor:'pointer', fontSize:'20px', color:'#9CA3AF', lineHeight:1, padding:'4px' }
        }, '✕')
      ),
      React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280', marginBottom:'14px' } },
        '名称の変更・削除や、新しい出荷先の追加ができます。「よく使う」をONにすると、収穫記録の新規入力時に最初から行として表示されます。'
      ),
      React.createElement('div', { style:{ marginBottom:'10px' } },
        ...destinations.map(d =>
          React.createElement('div', { key:d.key, style:rowStyle },
            React.createElement('input', { type:'text', value:d.label, onChange:e=>updateLabel(d.key, e.target.value), style:inputStyle }),
            React.createElement('label', {
              title:'よく使う出荷先（収穫記録フォームの初期行に表示）',
              style:{ display:'flex', alignItems:'center', gap:'4px', fontSize:'11px', color: d.frequent ? '#0A6B52' : '#9CA3AF', cursor:'pointer', whiteSpace:'nowrap' }
            },
              React.createElement('input', { type:'checkbox', checked:!!d.frequent, onChange:()=>toggleFrequent(d.key), style:{ accentColor:'#0A6B52', cursor:'pointer' } }),
              'よく使う'
            ),
            deleteTarget === d.key
              ? React.createElement('div', { style:{ display:'flex', gap:'4px' } },
                  React.createElement('button', {
                    onClick: () => removeDest(d.key),
                    style:{ fontSize:'11px', fontWeight:700, color:'#fff', background:'#DC2626', border:'none', borderRadius:'5px', padding:'4px 8px', cursor:'pointer' }
                  }, '削除する'),
                  React.createElement('button', {
                    onClick: () => setDeleteTarget(null),
                    style:{ fontSize:'11px', color:'#374151', background:'#fff', border:'1px solid #D8E4D8', borderRadius:'5px', padding:'4px 8px', cursor:'pointer' }
                  }, 'やめる')
                )
              : React.createElement('button', {
                  onClick: () => setDeleteTarget(d.key), title:'削除',
                  style:{ background:'none', border:'none', color:'#CBD5E1', cursor:'pointer', fontSize:'15px', padding:'4px', flexShrink:0 }
                }, React.createElement('i', { className:'ti ti-trash' }))
          )
        )
      ),
      React.createElement('div', { style:{ display:'flex', gap:'8px', marginTop:'12px' } },
        React.createElement('input', {
          type:'text', value:newLabel, onChange:e=>setNewLabel(e.target.value),
          placeholder:'新しい出荷先名（例: 道の駅）', style:inputStyle,
          onKeyDown: e => { if (e.key === 'Enter') addDest() }
        }),
        React.createElement('button', {
          onClick: addDest,
          disabled: !newLabel.trim(),
          style:{
            padding:'7px 14px', borderRadius:'6px', border:'none', fontSize:'12px', fontWeight:700,
            cursor: newLabel.trim() ? 'pointer' : 'not-allowed',
            background: newLabel.trim() ? '#0A6B52' : '#D1D5DB', color:'#fff'
          }
        }, '+ 追加')
      ),
      React.createElement('div', { style:{ marginTop:'16px', textAlign:'right' } },
        React.createElement('button', {
          onClick: onClose,
          style:{ padding:'8px 18px', borderRadius:'7px', border:'1.5px solid #D8E4D8', background:'#fff', color:'#374151', fontSize:'13px', fontWeight:600, cursor:'pointer' }
        }, '閉じる')
      )
    )
  )
}

// ─────────────────────────────────────────────────────
// 【フェーズE・E-4 Step5】HarvestRecordForm — 収穫記録入力フォーム
// 出荷先×サイズの組み合わせを動的行で追加できるフォーム
// 【フェーズ5・Step5-2】出荷先マスタ(SHIPMENT_DESTINATIONS)・規格マスタ(getHarvestGrades)・
// 単位マスタ(SHIPMENT_UNIT_TYPES)に接続。旧来のHARVEST_DEST_LIST/HARVEST_GRADE_LISTは廃止。
// ─────────────────────────────────────────────────────

function HarvestRecordForm({ field, lots, destinations, harvestRecords, onSave, onCancel, staff }) {
  // 【実装手順書 Step2】出荷先マスタは固定リストではなくApp側で管理される
  // destinations（後から追加・編集できる）を使う。万一空の場合はSHIPMENT_DESTINATIONSにフォールバック。
  const destList = (destinations && destinations.length > 0) ? destinations : SHIPMENT_DESTINATIONS
  const today = todayYmd()
  const [form, setForm] = React.useState({
    date:      today,
    variety:   lots.length > 0 ? lots[0].variety : '',
    row_range: '',
    lot_code:  '',
    note:      '',
    checks:    {},
    staff_ids: [],  // 【実装手順書 C】担当者（複数選択可）
  })
  // 出荷明細行（出荷先・サイズ・単位・数量）
  // 【フェーズ5・Step5-1】出荷先はSHIPMENT_DESTINATIONS（朝採りJA／取引先A／取引先A（午後）／
  // 取引先B／取引先C／直売／B品袋詰め）から選択。
  // 【フェーズ5・Step5-3】規格(grade)は作物ごとに表記が異なるため、
  // field.cropに応じた規格リスト（getHarvestGrades）の先頭値を初期値にする。
  // 【フェーズ5・Step5-2】unit_typeで「本数」「コンテナ数」を切り替え。
  // ※ 数値を保持するフィールド名は既存データとの後方互換のため`cases`のまま変更しない。
  const cropGrades = getHarvestGrades(field.crop)
  // 【実装手順書 Step2】UX上の注意点: 出荷先の数が多い（紙日報で7種類前後）ため、
  // デフォルトでは「よく使う出荷先」(frequent:true)のみ行を表示し、
  // 残りは「+ 出荷先を追加」で必要な分だけ広げられるようにする。
  const frequentDests = destList.filter(d => d.frequent)
  const initialDests = frequentDests.length > 0 ? frequentDests : destList.slice(0, 1)
  const makeRow = (dest) => ({ dest: dest.label, grade: cropGrades[0] || '', unit_type: SHIPMENT_UNIT_TYPES[0].key, cases: '' })
  const [shipments, setShipments] = React.useState(initialDests.map(makeRow))
  const [saved, setSaved] = React.useState(false)

  const uf = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ─────────────────────────────────────────────────────
  // 【Step5】畝マップ選択 ⇄ row_range / lot_code 連動
  //   lotsがある圃場 → 畝マップでクリック選択 → row_range文字列に自動変換
  //   lotsがない圃場 → 従来のテキスト入力のみ（フォールバック、Step4と同方式）
  //   lot_codeは「圃場番号 + 日付(MMDD) + 畝範囲」から自動生成。
  //   ユーザーが直接編集した場合は自動生成を止め、手入力を優先する。
  // ─────────────────────────────────────────────────────
  const hasMap = lots && lots.length > 0 && field.row_count
  const [selectedRows, setSelectedRows] = React.useState(new Set())
  const [lotCodeManual, setLotCodeManual] = React.useState(false)

  const generateLotCode = (dateStr, rangeStr) => {
    if (!dateStr || !rangeStr) return ''
    return `(${field.id})${dateStr.replace(/-/g, '').slice(4)}${rangeStr.replace(/[-,]/g, '')}`
  }

  // 【実装手順書 Step3】ロット番号の重複チェック
  // 過去の収穫記録（この圃場）の中に同じlot_codeが存在するか確認する。
  // 編集中の入力値が変わるたびにリアルタイム判定し、バッジで通知する。
  const isDuplicateLotCode = (code) => {
    if (!code) return false
    return (harvestRecords || []).some(r => String(r.field_id) === String(field.id) && r.lot_code === code)
  }

  // 畝マップでクリック選択 → row_rangeへ反映 → lot_codeも自動更新（手動編集していない場合）
  const handleSelectRows = (newSet) => {
    setSelectedRows(newSet)
    const newRange = selectedRowsToRange(newSet)
    uf('row_range', newRange)
    if (!lotCodeManual) uf('lot_code', generateLotCode(form.date, newRange))
  }

  // 畝範囲を直接テキスト編集した場合（畝マップが無い圃場、または微調整）
  const handleRowRangeText = (val) => {
    uf('row_range', val)
    setSelectedRows(new Set())
    if (!lotCodeManual) uf('lot_code', generateLotCode(form.date, val))
  }

  // 収穫日変更時もlot_codeを再生成（手動編集していない場合）
  const handleDateChange = (val) => {
    uf('date', val)
    if (!lotCodeManual) uf('lot_code', generateLotCode(val, form.row_range))
  }

  // 収穫ロット番号を直接編集した場合は、以後の自動生成を停止する
  const handleLotCodeText = (val) => {
    setLotCodeManual(true)
    uf('lot_code', val)
  }

  // 行追加・変更・削除
  // 【実装手順書 Step2】「+ 出荷先を追加」では、まだ行に出ていない出荷先（あれば残りのfrequent優先、
  // 無ければマスタの先頭から）を自動選択する。出荷先名はdestList（編集可能マスタ）から取る。
  const addRow = () => setShipments(s => {
    const usedLabels = new Set(s.map(r => r.dest))
    const next = destList.find(d => !usedLabels.has(d.label)) || destList[0]
    return [...s, makeRow(next || { label: '' })]
  })
  const removeRow = (i) => setShipments(s => s.filter((_, idx) => idx !== i))
  const updateRow = (i, k, v) => setShipments(s => s.map((r, idx) => idx === i ? { ...r, [k]: v } : r))

  const totalCases = shipments.reduce((acc, r) => acc + (Number(r.cases) || 0), 0)
  const canSave    = form.date && form.variety.trim() && form.row_range.trim()
                    && shipments.length > 0 && shipments.some(r => Number(r.cases) > 0)

  const submittingRef = React.useRef(false)
  // 送信ID保持: 成功(ok===true)確定まで同じIDを使い回す(応答喪失→再送でもDBは冪等で二重登録しない)
  const submitIdRef = React.useRef(null)
  const handleSave = async () => {
    if (!canSave) { showToast('日付・品種・畝範囲・出荷ケース数を入力してください', 'warn'); return }
    if (submittingRef.current) return   // 連打による二重登録を防止
    submittingRef.current = true
    if (!submitIdRef.current) submitIdRef.current = newUuid()
    const filledRows = shipments.filter(r => Number(r.cases) > 0)
    const res = await Promise.resolve(onSave({
      id:          submitIdRef.current,
      field_id:    field.id,
      date:        form.date,
      variety:     form.variety.trim(),
      row_range:   form.row_range.trim(),
      lot_code:    form.lot_code.trim() || generateLotCode(form.date, form.row_range),
      shipments:   filledRows.map(r => ({ ...r, cases: Number(r.cases) })),
      total_cases: totalCases,
      note:        form.note.trim(),
      checks:      form.checks,
    })).catch(() => null)
    if (!(res && res.ok === true)) { submittingRef.current = false; return } // 失敗: 入力と送信IDを保持
    submitIdRef.current = null // 成功確定
    setTimeout(() => { submittingRef.current = false }, 1200)
    celebrateSave('収穫を記録！🌾')
    setSaved(true)
    setTimeout(() => { setSaved(false); onCancel() }, 1500)
  }

  const inp = (label, key, type='text', placeholder='', onChangeOverride=null) =>
    React.createElement('div', { style:{ marginBottom:'14px' } },
      React.createElement('label', { style:{ fontSize:'10px', fontWeight:700, color:'#4B5563', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:'5px' } }, label),
      React.createElement('input', {
        type, value: form[key], placeholder,
        onChange: e => (onChangeOverride ? onChangeOverride(e.target.value) : uf(key, e.target.value)),
        style:{ width:'100%', padding:'9px 12px', borderRadius:'8px', border:'1.5px solid #D8E4D8', background:'#fff', fontSize:'13px', color:'#111827', outline:'none', boxSizing:'border-box' },
        onFocus: e => { e.target.style.borderColor='#0A6B52'; e.target.style.boxShadow='0 0 0 3px rgba(10,107,82,.1)' },
        onBlur:  e => { e.target.style.borderColor='#D8E4D8'; e.target.style.boxShadow='none' },
      })
    )

  if (saved) return React.createElement('div', { style:{ textAlign:'center', padding:'32px 0' } },
    React.createElement('i', { className:'ti ti-circle-check', style:{ fontSize:'40px', color:'#0A6B52', display:'block', marginBottom:'10px' } }),
    React.createElement('div', { style:{ fontSize:'15px', fontWeight:700, color:'#0A6B52' } }, '収穫記録を保存しました'),
    React.createElement('div', { style:{ fontSize:'13px', color:'#6B7280', marginTop:'6px' } }, '合計 ' + totalCases + ' 件（本数・コンテナ数混在の場合あり）')
  )

  return React.createElement('div', null,

    // ── 基本情報ブロック ──
    React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'4px' } },
      inp('収穫日 *', 'date', 'date', '', handleDateChange),
      React.createElement('div', { style:{ marginBottom:'14px' } },
        React.createElement('label', { style:{ fontSize:'10px', fontWeight:700, color:'#4B5563', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:'5px' } }, '品種 *'),
        React.createElement('select', {
          value: form.variety,
          onChange: e => uf('variety', e.target.value),
          style:{ width:'100%', padding:'9px 12px', borderRadius:'8px', border:'1.5px solid #D8E4D8', background:'#fff', fontSize:'13px', color:'#111827', outline:'none' },
          onFocus: e => { e.target.style.borderColor='#0A6B52' },
          onBlur:  e => { e.target.style.borderColor='#D8E4D8' },
        },
          React.createElement('option', { value:'' }, '-- 選択 --'),
          // LOTSから品種一覧を生成 + 手入力用「その他」
          ...[...new Set(lots.map(l => l.variety)), 'その他'].map(v =>
            React.createElement('option', { key:v, value:v }, v)
          )
        )
      ),
    ),

    // ── 畝範囲（畝マップ or テキスト入力）【Step5】 ──
    React.createElement('div', { style:{ marginBottom:'14px' } },
      React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'6px' } },
        React.createElement('label', { style:{ fontSize:'10px', fontWeight:700, color:'#4B5563', textTransform:'uppercase', letterSpacing:'.06em' } }, '畝範囲 *'),
        // 選択済み件数バッジ
        selectedRows.size > 0
          ? React.createElement('span', {
              style:{ fontSize:'11px', fontWeight:700, color:'#0A6B52', background:'#ECFDF5', border:'1px solid #6EE7B7', borderRadius:'12px', padding:'2px 9px' }
            }, selectedRows.size + '畝 選択中')
          : null
      ),

      // 畝マップ（lotsがある圃場のみ表示）
      hasMap
        ? React.createElement('div', {
            style:{ border:'1.5px solid #D8E4D8', borderRadius:'8px', padding:'12px', background:'#FAFBFA', marginBottom:'8px' }
          },
            React.createElement(RowMap, {
              lots,
              totalRows: field.row_count,
              selectable: true,
              selectedRows,
              onSelectRows: handleSelectRows,
              showSides: field.crop_category === 'corn',
            })
          )
        : null,

      // テキスト入力（常時表示。畝マップありの場合は「手動調整用」として補助的に使う）
      hasMap
        ? React.createElement('div', { style:{ fontSize:'11px', color:'#9CA3AF', marginBottom:'4px', fontStyle:'italic' } },
            '↑ 畝をクリックして選択。または下記に直接入力（例: 6-17）'
          )
        : null,
      React.createElement('input', {
        type:'text',
        placeholder: hasMap ? '直接入力で上書き可（例: 6-17）' : '例: 6-17',
        value: form.row_range,
        onChange: e => handleRowRangeText(e.target.value),
        style:{
          width:'100%', padding:'9px 12px', borderRadius:'8px',
          border: form.row_range.trim() ? '1.5px solid #0A6B52' : '1.5px solid #D8E4D8',
          background: form.row_range.trim() ? '#F0FDF4' : '#FFFFFF',
          fontSize:'13px', color:'#111827', outline:'none', boxSizing:'border-box'
        },
      })
    ),

    // ── 担当者選択 【実装手順書 C】──
    React.createElement('div', { style:{ marginBottom:'14px' } },
      React.createElement('label', {
        style:{ fontSize:'10px', fontWeight:700, color:'#4B5563', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:'6px' }
      }, '担当者（複数選択可）'),
      (staff && staff.length > 0)
        ? React.createElement('div', { style:{ display:'flex', flexWrap:'wrap', gap:'6px' } },
            ...(staff).map(s =>
              React.createElement('button', {
                key: s.id,
                type: 'button',
                onClick: () => {
                  const ids = form.staff_ids || []
                  uf('staff_ids', ids.includes(s.id)
                    ? ids.filter(id => id !== s.id)
                    : [...ids, s.id])
                },
                style:{
                  padding:'5px 12px', borderRadius:'20px', border:'1.5px solid',
                  fontSize:'12px', fontWeight:600, cursor:'pointer', transition:'all .15s',
                  borderColor: (form.staff_ids||[]).includes(s.id) ? '#0A6B52' : '#D8E4D8',
                  background:  (form.staff_ids||[]).includes(s.id) ? '#0A6B52' : '#fff',
                  color:       (form.staff_ids||[]).includes(s.id) ? '#fff'    : '#6B7280',
                }
              },
                s.avatar ? `${s.avatar} ${s.name}` : s.name
              )
            )
          )
        : React.createElement('div', { style:{ fontSize:'11px', color:'#9CA3AF', padding:'8px 0' } },
            'スタッフ管理ページでスタッフを登録すると、ここで担当者を選択できます'
          )
    ),

    // ── 収穫ロット番号（row_range・日付から自動生成）【Step5】 ──
    // 【実装手順書 Step3】重複チェック結果をリアルタイムで表示
    (() => {
      const isDup = isDuplicateLotCode(form.lot_code)
      const borderColor = isDup ? '#F59E0B' : '#D8E4D8'
      return React.createElement('div', { style:{ marginBottom:'14px' } },
        React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'5px' } },
          React.createElement('label', { style:{ fontSize:'10px', fontWeight:700, color:'#4B5563', textTransform:'uppercase', letterSpacing:'.06em' } }, '収穫ロット番号'),
          React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'6px' } },
            // 【Step3】重複バッジ
            isDup
              ? React.createElement('span', {
                  style:{
                    fontSize:'10px', fontWeight:700, color:'#92400E',
                    background:'#FEF3C7', border:'1px solid #FDE68A',
                    borderRadius:'4px', padding:'2px 7px',
                    display:'inline-flex', alignItems:'center', gap:'3px'
                  }
                },
                React.createElement('i', { className:'ti ti-alert-triangle', style:{ fontSize:'11px' } }),
                '同じロット番号が既に存在します'
              )
              : null,
            // 自動生成バッジ
            !lotCodeManual && form.lot_code && !isDup
              ? React.createElement('span', { style:{ fontSize:'10px', color:'#0A6B52', fontWeight:600 } }, '自動生成')
              : null,
          )
        ),
        React.createElement('input', {
          type:'text', value: form.lot_code, placeholder:'例: (49)11120617',
          onChange: e => handleLotCodeText(e.target.value),
          style:{
            width:'100%', padding:'9px 12px', borderRadius:'8px',
            border:`1.5px solid ${borderColor}`,
            background: isDup ? '#FFFBEB' : '#fff',
            fontSize:'13px', color:'#111827', outline:'none', boxSizing:'border-box',
            transition:'border-color .15s, background .15s'
          },
          onFocus: e => {
            e.target.style.borderColor = isDup ? '#F59E0B' : '#0A6B52'
            e.target.style.boxShadow = isDup ? '0 0 0 3px rgba(245,158,11,.12)' : '0 0 0 3px rgba(10,107,82,.1)'
          },
          onBlur: e => {
            e.target.style.borderColor = isDup ? '#F59E0B' : '#D8E4D8'
            e.target.style.boxShadow = 'none'
          },
        }),
        // ヘルプテキスト or 重複詳細メッセージ
        isDup
          ? React.createElement('div', {
              style:{ fontSize:'11px', color:'#92400E', marginTop:'5px', display:'flex', alignItems:'flex-start', gap:'4px' }
            },
            React.createElement('i', { className:'ti ti-info-circle', style:{ fontSize:'12px', marginTop:'1px', flexShrink:0 } }),
            'この圃場でこのロット番号はすでに使われています。内容が同一のロットでなければ、番号を変更してください。'
          )
          : React.createElement('div', { style:{ fontSize:'11px', color:'#9CA3AF', marginTop:'4px' } },
              '圃場番号＋日付＋畝範囲から自動入力されます（直接編集も可能）'
            )
      )
    })(),

    // ── 出荷明細テーブル ──
    React.createElement('div', { style:{ marginBottom:'16px' } },
      React.createElement('div', { style:{ fontSize:'10px', fontWeight:700, color:'#4B5563', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'8px' } }, '出荷内訳（出荷先・サイズ・単位・数量）'),

      // 行ヘッダー
      React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1.3fr 1fr 0.9fr 0.8fr auto', gap:'6px', marginBottom:'4px', padding:'0 4px' } },
        React.createElement('span', { style:{ fontSize:'10px', color:'#94A3B8', fontWeight:700, letterSpacing:'.06em' } }, '出荷先'),
        React.createElement('span', { style:{ fontSize:'10px', color:'#94A3B8', fontWeight:700, letterSpacing:'.06em' } }, 'サイズ / 規格'),
        React.createElement('span', { style:{ fontSize:'10px', color:'#94A3B8', fontWeight:700, letterSpacing:'.06em' } }, '単位'),
        React.createElement('span', { style:{ fontSize:'10px', color:'#94A3B8', fontWeight:700, letterSpacing:'.06em' } }, '数量'),
        React.createElement('span', null),
      ),

      // 明細行
      ...shipments.map((row, i) =>
        React.createElement('div', {
          key: i,
          style:{ display:'grid', gridTemplateColumns:'1.3fr 1fr 0.9fr 0.8fr auto', gap:'6px', marginBottom:'6px', alignItems:'center' }
        },
          // 出荷先【フェーズ5・Step5-1】SHIPMENT_DESTINATIONSマスタから選択。
          // 旧データ（生協コンテナ／JA出荷／直販／市場等）がマスタに無い場合はフォールバック表示。
          React.createElement('select', {
            value: row.dest,
            onChange: e => updateRow(i, 'dest', e.target.value),
            style:{ padding:'7px 10px', borderRadius:'7px', border:'1.5px solid #D8E4D8', background:'#fff', fontSize:'13px', color:'#111827', outline:'none' },
          },
            ...(destList.some(d => d.label === row.dest) ? [] : [React.createElement('option', { key:'__current_dest', value: row.dest }, row.dest + '（旧データ）')]),
            ...destList.map(d => React.createElement('option', { key:d.key, value:d.label }, d.label))
          ),

          // サイズ／規格（作物ごとにcropGradesを切り替え。既存データに無い値はフォールバック表示）
          React.createElement('select', {
            value: row.grade,
            onChange: e => updateRow(i, 'grade', e.target.value),
            style:{ padding:'7px 10px', borderRadius:'7px', border:'1.5px solid #D8E4D8', background:'#fff', fontSize:'13px', color:'#111827', outline:'none' },
          },
            ...(cropGrades.includes(row.grade) ? [] : [React.createElement('option', { key:'__current', value: row.grade }, row.grade + '（旧データ）')]),
            ...cropGrades.map(g => React.createElement('option', { key:g, value:g }, g))
          ),

          // 単位【フェーズ5・Step5-2】SHIPMENT_UNIT_TYPES（本数／コンテナ数）から選択。
          // 旧データはunit_type未設定のため、選択中はSHIPMENT_UNIT_TYPES[0]（本数）にフォールバック表示。
          React.createElement('select', {
            value: row.unit_type || SHIPMENT_UNIT_TYPES[0].key,
            onChange: e => updateRow(i, 'unit_type', e.target.value),
            style:{ padding:'7px 10px', borderRadius:'7px', border:'1.5px solid #D8E4D8', background:'#fff', fontSize:'13px', color:'#111827', outline:'none' },
          }, ...SHIPMENT_UNIT_TYPES.map(u => React.createElement('option', { key:u.key, value:u.key }, u.label))),

          // 数量（既存の`cases`フィールドをそのまま使用。単位は左の選択に応じて変わる）
          React.createElement('input', {
            type:'number', min:'0', step:'1', placeholder:'0',
            value: row.cases,
            onChange: e => updateRow(i, 'cases', e.target.value),
            style:{ width:'100%', padding:'7px 10px', borderRadius:'7px', border:'1.5px solid #D8E4D8', background:'#fff', fontSize:'13px', color:'#111827', outline:'none', textAlign:'right' },
          }),

          // 削除ボタン
          React.createElement('button', {
            onClick: () => removeRow(i),
            disabled: shipments.length === 1,
            style:{
              background:'none', border:'none', cursor: shipments.length === 1 ? 'default' : 'pointer',
              color: shipments.length === 1 ? '#CBD5E1' : '#94A3B8', fontSize:'16px', padding:'4px',
            }
          }, React.createElement('i', { className:'ti ti-x' }))
        )
      ),

      // 行追加ボタン
      React.createElement('button', {
        onClick: addRow,
        style:{
          width:'100%', padding:'8px', borderRadius:'8px', border:'1.5px dashed #B8D4C0',
          background:'transparent', cursor:'pointer', color:'#0A6B52', fontSize:'12px', fontWeight:600,
          display:'flex', alignItems:'center', justifyContent:'center', gap:'5px', marginTop:'4px',
        },
        onMouseEnter: e => { e.currentTarget.style.background='#F0FDF4' },
        onMouseLeave: e => { e.currentTarget.style.background='transparent' },
      },
        React.createElement('i', { className:'ti ti-plus', style:{ fontSize:'13px' } }),
        '出荷行を追加'
      ),
    ),

    // ── 合計バー ──
    totalCases > 0 && React.createElement('div', {
      style:{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:'10px', padding:'12px 16px', marginBottom:'16px', display:'flex', alignItems:'center', justifyContent:'space-between' }
    },
      React.createElement('span', { style:{ fontSize:'13px', color:'#374151', fontWeight:500 } }, '合計数量'),
      React.createElement('span', { style:{ fontSize:'22px', fontWeight:700, color:'#0A6B52' } }, totalCases + ' 件')
    ),

    // 【実装手順書 Step1】備考・メモ＋転記チェック
    React.createElement(NoteChecklistField, {
      note: form.note, onNoteChange: v => uf('note', v),
      checks: form.checks, onChecksChange: v => uf('checks', v),
      checkKeys: ['mgmt_table', 'lettuce_table', 'sa'],
    }),

    // ── 保存・キャンセルボタン ──
    React.createElement('div', { style:{ display:'flex', gap:'10px', marginTop:'14px' } },
      React.createElement('button', {
        onClick: onCancel,
        style:{ flex:1, padding:'11px', borderRadius:'8px', border:'1.5px solid #D8E4D8', background:'#fff', color:'#64748B', fontSize:'13px', fontWeight:600, cursor:'pointer' }
      }, 'キャンセル'),
      React.createElement('button', {
        onClick: handleSave,
        style:{
          flex:2, padding:'11px', borderRadius:'8px', border:'none',
          background: canSave ? '#0A6B52' : '#D1D5DB',
          color:'#fff', fontSize:'13px', fontWeight:700, cursor: canSave ? 'pointer' : 'not-allowed',
          display:'flex', alignItems:'center', justifyContent:'center', gap:'6px',
        }
      },
        React.createElement('i', { className:'ti ti-basket', style:{ fontSize:'15px' } }),
        '収穫記録を保存する'
      )
    )
  )
}

// ─────────────────────────────────────────────────────
// 【フェーズE・E-4 Step5】HarvestRecordList — 収穫記録一覧
// ─────────────────────────────────────────────────────
function HarvestRecordList({ records, onDelete, field, staff }) {
  const [deleteTarget, setDeleteTarget] = React.useState(null)
  const [selectedRecord, setSelectedRecord] = React.useState(null)  // 詳細モーダル対象
  if (records.length === 0) {
    return React.createElement('div', { className:'card', style:{ padding:'32px', textAlign:'center', color:'#6B7280', fontSize:'14px' } },
      React.createElement('i', { className:'ti ti-basket', style:{ fontSize:'28px', display:'block', marginBottom:'8px', color:'#CBD5E1' } }),
      'この圃場の収穫記録はまだありません'
    )
  }
  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date))

  return React.createElement(React.Fragment, null,
  React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:'12px' } },
    ...sorted.map((r, idx) =>
      React.createElement('div', {
        key: r.id,
        className: 'card',
        onClick: () => setSelectedRecord(r),
        style:{ padding:'16px 20px', cursor:'pointer', transition:'box-shadow .12s, border-color .12s' },
        onMouseEnter: e => { e.currentTarget.style.borderColor = '#0A6B52'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(10,107,82,.1)' },
        onMouseLeave: e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.boxShadow = '' },
      },
        // カードヘッダー行
        React.createElement('div', { style:{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'12px' } },
          React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'10px' } },
            React.createElement('div', {
              style:{ width:34, height:34, borderRadius:'50%', background:'#0D9972', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }
            }, React.createElement('i', { className:'ti ti-basket', style:{ fontSize:'16px', color:'#FFFFFF' } })),
            React.createElement('div', null,
              React.createElement('div', { style:{ fontSize:'14px', fontWeight:700, color:'#111827', display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' } },
                r.variety + '　' + r.row_range + '畝',
                React.createElement(TranscribeStatusBadge, { checks: r.checks, checkKeys:['mgmt_table','lettuce_table','sa'] })
              ),
              React.createElement('div', { style:{ fontSize:'12px', color:'#94A3B8', marginTop:'2px' } },
                r.date + (r.lot_code ? '　ロット: ' + r.lot_code : '')
              )
            )
          ),
          React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'10px' } },
            React.createElement('div', { style:{ textAlign:'right' } },
              React.createElement('div', { style:{ fontSize:'22px', fontWeight:700, color:'#0A6B52', lineHeight:1 } }, r.total_cases),
              React.createElement('div', { style:{ fontSize:'10px', color:'#94A3B8', fontWeight:600, letterSpacing:'.04em' } }, 'ケース')
            ),
            React.createElement('button', {
              onClick: e => { e.stopPropagation(); setDeleteTarget(r) }, title:'削除',
              style:{ background:'none', border:'none', color:'#CBD5E1', cursor:'pointer', fontSize:'15px', padding:'4px', flexShrink:0 }
            }, React.createElement('i', { className:'ti ti-trash' }))
          )
        ),

        // 出荷内訳テーブル
        React.createElement('div', { style:{ borderRadius:'8px', overflow:'hidden', border:'1px solid #E2E8E2' } },
          // ヘッダー
          React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', background:'#F8FAF8', padding:'7px 14px', borderBottom:'1px solid #E2E8E2' } },
            React.createElement('span', { style:{ fontSize:'10px', fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'.06em' } }, '出荷先'),
            React.createElement('span', { style:{ fontSize:'10px', fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'.06em' } }, 'サイズ'),
            React.createElement('span', { style:{ fontSize:'10px', fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'.06em', textAlign:'right' } }, '数量'),
          ),
          // 明細行
          // 【フェーズ5・Step5-2】unit_typeがあればその単位（本数／コンテナ数）で表示。
          // unit_type未設定の旧データは従来通り「ケース」表記にフォールバックする。
          ...(r.shipments || []).map((s, si) => {
            const unitLabel = s.unit_type
              ? (SHIPMENT_UNIT_TYPES.find(u => u.key === s.unit_type)?.label || 'ケース')
              : 'ケース'
            return React.createElement('div', {
              key: si,
              style:{
                display:'grid', gridTemplateColumns:'2fr 1fr 1fr', padding:'8px 14px',
                borderBottom: si < (r.shipments.length - 1) ? '1px solid #F1F5F1' : 'none',
                background: si % 2 === 1 ? '#FAFBFA' : '#FFFFFF',
              }
            },
              React.createElement('span', { style:{ fontSize:'13px', color:'#374151' } }, s.dest),
              React.createElement('span', { style:{ fontSize:'13px', color:'#374151' } },
                React.createElement('span', { className:'badge badge-blue', style:{ fontSize:'10px' } }, s.grade)
              ),
              React.createElement('span', { style:{ fontSize:'13px', fontWeight:600, color:'#111827', textAlign:'right' } }, s.cases + ' ' + unitLabel)
            )
          }),
          // 合計行（単位が混在する場合があるため、合計は単位を付けない総数として表示）
          React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', padding:'8px 14px', background:'#F0FDF4', borderTop:'2px solid #BBF7D0' } },
            React.createElement('span', { style:{ fontSize:'12px', fontWeight:700, color:'#065F46' } }, '合計'),
            React.createElement('span', null),
            React.createElement('span', { style:{ fontSize:'14px', fontWeight:700, color:'#0A6B52', textAlign:'right' } }, r.total_cases + ' 件')
          )
        ),
        r.note && React.createElement('div', { style:{ fontSize:'11px', color:'#7C3AED', marginTop:'8px', display:'flex', alignItems:'flex-start', gap:'4px' } },
          React.createElement('i', { className:'ti ti-notes', style:{ fontSize:'11px', marginTop:'1px', flexShrink:0 } }),
          React.createElement('span', null, r.note)
        )
      )
    )
  ),

    // ── 詳細モーダル（日報記録の詳細モーダルと同じ見た目に統一） ──
    selectedRecord && React.createElement('div', {
      style:{ position:'fixed', inset:0, background:'rgba(17,24,39,.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' },
      onClick: () => setSelectedRecord(null)
    },
      React.createElement('div', {
        style:{ background:'#FFFFFF', borderRadius:'12px', padding:'24px', width:'480px', maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.2)', animation:'fadeInDown .18s ease' },
        onClick: e => e.stopPropagation()
      },
        // ヘッダー
        React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' } },
          React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'10px' } },
            React.createElement('div', { style:{ width:36, height:36, borderRadius:'50%', background:'#0D9972', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 } },
              React.createElement('i', { className:'ti ti-basket', style:{ fontSize:'18px', color:'#FFFFFF' } })
            ),
            React.createElement('div', null,
              React.createElement('div', { style:{ fontSize:'15px', fontWeight:700, color:'#111827' } }, '収穫記録'),
              React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280' } }, selectedRecord.date + (field ? '　' + field.name : ''))
            )
          ),
          React.createElement('button', {
            onClick: () => setSelectedRecord(null),
            style:{ background:'none', border:'none', cursor:'pointer', fontSize:'20px', color:'#9CA3AF', lineHeight:1, padding:'4px' }
          }, '✕')
        ),

        // 情報行
        React.createElement('div', { style:{ background:'#F8FAF8', borderRadius:'8px', padding:'4px 12px', marginBottom:'16px' } },
          React.createElement('div', { style:rowStyle2 },
            React.createElement('span', { style:{ color:'#6B7280' } }, '日付'),
            React.createElement('span', { style:{ fontWeight:600 } }, selectedRecord.date)
          ),
          field && React.createElement('div', { style:rowStyle2 },
            React.createElement('span', { style:{ color:'#6B7280' } }, '圃場'),
            React.createElement('span', { style:{ fontWeight:600 } }, field.name)
          ),
          React.createElement('div', { style:rowStyle2 },
            React.createElement('span', { style:{ color:'#6B7280' } }, '品種'),
            React.createElement('span', { style:{ fontWeight:600 } }, selectedRecord.variety)
          ),
          React.createElement('div', { style:rowStyle2 },
            React.createElement('span', { style:{ color:'#6B7280' } }, '畝範囲'),
            React.createElement('span', { style:{ fontWeight:600 } }, selectedRecord.row_range + '畝')
          ),
          selectedRecord.lot_code && React.createElement('div', { style:rowStyle2 },
            React.createElement('span', { style:{ color:'#6B7280' } }, 'ロット'),
            React.createElement('span', null, selectedRecord.lot_code)
          ),
          React.createElement('div', { style:rowStyle2 },
            React.createElement('span', { style:{ color:'#6B7280' } }, '担当者'),
            React.createElement('span', null, staffNames(staff, selectedRecord.staff_ids))
          ),
          React.createElement('div', { style:{ ...rowStyle2, borderBottom:'none' } },
            React.createElement('span', { style:{ color:'#6B7280' } }, '備考'),
            React.createElement('span', { style:{ color: selectedRecord.note ? '#374151' : '#9CA3AF' } }, selectedRecord.note || 'なし')
          )
        ),

        // 出荷内訳
        React.createElement('div', { style:{ marginBottom:'16px' } },
          React.createElement('div', { style:{ fontSize:'10px', fontWeight:700, color:'#4B5563', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'6px' } }, '出荷内訳'),
          React.createElement('div', { style:{ borderRadius:'8px', overflow:'hidden', border:'1px solid #E2E8E2' } },
            React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', background:'#F8FAF8', padding:'7px 14px', borderBottom:'1px solid #E2E8E2' } },
              React.createElement('span', { style:{ fontSize:'10px', fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'.06em' } }, '出荷先'),
              React.createElement('span', { style:{ fontSize:'10px', fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'.06em' } }, 'サイズ'),
              React.createElement('span', { style:{ fontSize:'10px', fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'.06em', textAlign:'right' } }, '数量'),
            ),
            ...(selectedRecord.shipments || []).map((s, si) => {
              const unitLabel = s.unit_type
                ? (SHIPMENT_UNIT_TYPES.find(u => u.key === s.unit_type)?.label || 'ケース')
                : 'ケース'
              return React.createElement('div', {
                key: si,
                style:{
                  display:'grid', gridTemplateColumns:'2fr 1fr 1fr', padding:'8px 14px',
                  borderBottom: si < (selectedRecord.shipments.length - 1) ? '1px solid #F1F5F1' : 'none',
                  background: si % 2 === 1 ? '#FAFBFA' : '#FFFFFF',
                }
              },
                React.createElement('span', { style:{ fontSize:'13px', color:'#374151' } }, s.dest),
                React.createElement('span', { style:{ fontSize:'13px', color:'#374151' } },
                  React.createElement('span', { className:'badge badge-blue', style:{ fontSize:'10px' } }, s.grade)
                ),
                React.createElement('span', { style:{ fontSize:'13px', fontWeight:600, color:'#111827', textAlign:'right' } }, s.cases + ' ' + unitLabel)
              )
            }),
            React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', padding:'8px 14px', background:'#F0FDF4', borderTop:'2px solid #BBF7D0' } },
              React.createElement('span', { style:{ fontSize:'12px', fontWeight:700, color:'#065F46' } }, '合計'),
              React.createElement('span', null),
              React.createElement('span', { style:{ fontSize:'14px', fontWeight:700, color:'#0A6B52', textAlign:'right' } }, selectedRecord.total_cases + ' 件')
            )
          )
        ),

        // 転記チェック状況
        React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'16px' } },
          React.createElement('span', { style:{ fontSize:'12px', color:'#6B7280' } }, '転記チェック'),
          React.createElement(TranscribeStatusBadge, { checks: selectedRecord.checks, checkKeys:['mgmt_table','lettuce_table','sa'] })
        ),

        // ボタン群
        React.createElement('div', { style:{ display:'flex', gap:'8px' } },
          React.createElement('button', {
            onClick: () => { setDeleteTarget(selectedRecord); setSelectedRecord(null) },
            style:{
              flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'6px',
              padding:'9px 18px', borderRadius:'4px', fontSize:'14px', fontWeight:600,
              cursor:'pointer', border:'1.5px solid #FCA5A5', background:'#FEF2F2', color:'#DC2626'
            }
          },
            React.createElement('i', { className:'ti ti-trash', style:{ fontSize:'14px' } }),
            '削除'
          ),
          React.createElement('button', {
            onClick: () => setSelectedRecord(null),
            style:{ flex:1, padding:'9px 18px', borderRadius:'4px', border:'none', background:'#0A6B52', color:'#fff', fontSize:'14px', fontWeight:700, cursor:'pointer' }
          }, '閉じる')
        )
      )
    ),

    deleteTarget && React.createElement(ConfirmDeleteModal, {
      title: '収穫記録を削除しますか？',
      targetName: deleteTarget.variety + '　' + deleteTarget.row_range + '畝　' + deleteTarget.date,
      onCancel: () => setDeleteTarget(null),
      // 削除成功(ok===true)を待ってから閉じる。失敗時は確認画面を保持(DB経路のロールバックと整合)
      onConfirm: async () => { const res = await Promise.resolve(onDelete(deleteTarget.id)).catch(() => null); if (res && res.ok === true) setDeleteTarget(null) }
    })
  )
}

// ─────────────────────────────────────────────────────
// 【フェーズE・E-4 Step5】HarvestRecordSection — 「収穫記録」タブ本体
// E-2確定仕様「harvest: ロット単位の収穫記録一覧＋新規入力」に対応
// ─────────────────────────────────────────────────────
function HarvestRecordSection({ field, harvestRecords, lots, onSave, onDelete, destinations, onChangeDestinations, staff }) {
  const [showAddModal, setShowAddModal] = React.useState(false)
  const [showDestModal, setShowDestModal] = React.useState(false)
  const fieldHarvestRecords = harvestRecords.filter(r => String(r.field_id) === String(field.id))

  // 合計集計
  const totalCases  = fieldHarvestRecords.reduce((acc, r) => acc + (Number(r.total_cases) || 0), 0)
  const totalByDest = {}
  fieldHarvestRecords.forEach(r => (r.shipments || []).forEach(s => {
    totalByDest[s.dest] = (totalByDest[s.dest] || 0) + s.cases
  }))

  return React.createElement('div', null,
    // ── セクションヘッダー ──
    React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' } },
      React.createElement(SectionTitle, { icon:'basket', style:{ marginBottom:0 } }, '収穫記録一覧'),
      React.createElement('div', { style:{ display:'flex', gap:'8px' } },
        React.createElement('button', {
          className:'btn btn-ghost',
          style:{ display:'flex', alignItems:'center', gap:'6px', fontSize:'13px' },
          onClick: () => setShowDestModal(true)
        },
          React.createElement('i', { className:'ti ti-settings', style:{ fontSize:'14px' } }),
          '出荷先マスタ'
        ),
        React.createElement('button', {
          className:'btn btn-primary',
          style:{ display:'flex', alignItems:'center', gap:'6px' },
          onClick: () => setShowAddModal(true)
        },
          React.createElement('i', { className:'ti ti-plus', style:{ fontSize:'14px' } }),
          '新規入力'
        )
      )
    ),
    // 【実装手順書 Step2】出荷先マスタ管理モーダル
    showDestModal && React.createElement(ShipmentDestinationManageModal, {
      destinations: destinations || SHIPMENT_DESTINATIONS,
      onChange: onChangeDestinations || (() => {}),
      onClose: () => setShowDestModal(false)
    }),

    // ── サマリーカード（記録がある場合のみ表示） ──
    fieldHarvestRecords.length > 0 && React.createElement('div', {
      style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px, 1fr))', gap:'10px', marginBottom:'20px' }
    },
      // 合計ケース数
      React.createElement('div', { className:'stat-card green', style:{ padding:'14px 16px' } },
        React.createElement('div', { style:{ fontSize:'10px', fontWeight:600, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'.06em' } }, '合計'),
        React.createElement('div', { className:'stat-n', style:{ fontSize:'24px' } }, totalCases.toLocaleString()),
        React.createElement('div', { className:'stat-l' }, 'ケース合計')
      ),
      // 収穫回数
      React.createElement('div', { className:'stat-card', style:{ padding:'14px 16px' } },
        React.createElement('div', { style:{ fontSize:'10px', fontWeight:600, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'.06em' } }, '収穫回数'),
        React.createElement('div', { className:'stat-n', style:{ fontSize:'24px', color:'#1D4ED8' } }, fieldHarvestRecords.length),
        React.createElement('div', { className:'stat-l' }, '記録件数')
      ),
      // 出荷先別（上位2件）
      ...Object.entries(totalByDest).slice(0, 2).map(([dest, cnt]) =>
        React.createElement('div', { key:dest, className:'stat-card', style:{ padding:'14px 16px' } },
          React.createElement('div', { style:{ fontSize:'10px', fontWeight:600, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'.06em', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' } }, dest),
          React.createElement('div', { className:'stat-n', style:{ fontSize:'22px', color:'#B45309' } }, cnt),
          React.createElement('div', { className:'stat-l' }, 'ケース')
        )
      )
    ),

    // ── 記録一覧 ──
    React.createElement(HarvestRecordList, { records: fieldHarvestRecords, onDelete }),

    // ── 新規入力モーダル ──
    showAddModal && React.createElement('div', {
      style:{ position:'fixed', inset:0, background:'rgba(17,24,39,.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' },
      onClick: () => setShowAddModal(false)
    },
      React.createElement('div', {
        style:{ background:'#FFFFFF', borderRadius:'12px', padding:'24px', width:'560px', maxWidth:'95vw', maxHeight:'92vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.2)', animation:'fadeInDown .18s ease' },
        onClick: e => e.stopPropagation()
      },
        React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'20px' } },
          React.createElement('div', null,
            React.createElement('div', { style:{ fontSize:'15px', fontWeight:700, color:'#111827' } }, '収穫記録の新規入力'),
            React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280', marginTop:'4px' } }, field.name + ' — 出荷先・サイズ・単位別の数量を記録します')
          ),
          React.createElement('button', {
            onClick: () => setShowAddModal(false),
            style:{ background:'none', border:'none', cursor:'pointer', fontSize:'20px', color:'#9CA3AF', lineHeight:1, padding:'4px' }
          }, '✕')
        ),
        React.createElement(HarvestRecordForm, {
          field,
          lots,
          destinations: destinations || SHIPMENT_DESTINATIONS,
          harvestRecords,
          staff,
          onSave: r => onSave(r), // 閉じるのはフォーム側(handleSave)が成功時onCancelで
          onCancel: () => setShowAddModal(false)
        })
      )
    )
  )
}

// ─────────────────────────────────────────────────────
// FieldDetailPage — 圃場別・サブページ単一表示
// sub='dashboard'|'rows'|'daily'|'pesticide'|'harvest' でコンテンツを切り替え
// ─────────────────────────────────────────────────────
// ── DailySection: 圃場別「日報」サブページ — 一覧メイン + 新規入力モーダル ──
function DailySection({ field, fieldRecords, allRecords, pesticides, onSaveRecord, onUpdateRecord, onDeleteRecord, lotSprayRecords, farmLots, fertilizers, destinations, harvestRecords, staff, onSaveLotSpray, onSaveTopDressing, onSaveHarvest }) {
  const [showAddModal, setShowAddModal] = React.useState(false)
  return React.createElement('div', null,
    // ヘッダー行: タイトル + 新規入力ボタン
    React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' } },
      React.createElement(SectionTitle, { icon:'notebook', style:{ marginBottom:0 } }, 'この圃場の日報一覧'),
      React.createElement('button', {
        className:'btn btn-primary',
        style:{ display:'flex', alignItems:'center', gap:'6px' },
        onClick: () => setShowAddModal(true)
      },
        React.createElement('i', { className:'ti ti-plus', style:{ fontSize:'14px' } }),
        '新規入力'
      )
    ),
    React.createElement(RecordTable, { records: fieldRecords, fields:[field], pesticides, onUpdate: onUpdateRecord, onDelete: onDeleteRecord }),

    // 新規入力モーダル
    showAddModal && React.createElement('div', {
      style:{ position:'fixed', inset:0, background:'rgba(17,24,39,.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' },
      onClick: () => setShowAddModal(false)
    },
      React.createElement('div', {
        style:{ background:'#FFFFFF', borderRadius:'12px', padding:'28px', width:'640px', maxWidth:'95vw', maxHeight:'92vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.2)', animation:'fadeInDown .18s ease' },
        onClick: e => e.stopPropagation()
      },
        React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' } },
          React.createElement('div', { style:{ fontSize:'15px', fontWeight:700, color:'#111827' } }, '新規日報入力'),
          React.createElement('button', {
            onClick: () => setShowAddModal(false),
            style:{ background:'none', border:'none', cursor:'pointer', fontSize:'20px', color:'#9CA3AF', lineHeight:1, padding:'4px' }
          }, '✕')
        ),
        React.createElement(RecordForm, { fields:[field], pesticides, records:allRecords, lotSprayRecords, inModal:true, onSave: r => onSaveRecord({ ...r, field_id: field.id }),
          farmLots, fertilizers, destinations, harvestRecords, staff, onSaveLotSpray, onSaveTopDressing, onSaveHarvest })
      )
    )
  )
}


// =====================================================
// 【実装手順書 3.2.2】作物別管理項目パネル
// ─────────────────────────────────────────────────────
// field.crop に応じて CROP_SPECIFIC_FIELD_DEFS から表示・入力項目を
// 動的に切り替える。定義が無い作物（レタス・水稲・ターサイ等、既存の
// 画面で十分な作物）では何も表示せず、既存画面に影響を与えない。
// 圃場詳細画面（FieldDetailPageの全サブページ＝ダッシュボード／
// 日報・作業入力／畝マップ／農薬散布／収穫記録）の先頭に共通表示することで、
// 「圃場詳細画面」「作業記録画面」の両方で確認・入力できるようにしている。
// =====================================================
function CropSpecificDetailsPanel({ field, onUpdate }) {
  const defs = CROP_SPECIFIC_FIELD_DEFS[field.crop]
  const [editing, setEditing] = React.useState(false)
  const [draft,   setDraft]   = React.useState(field.crop_specific_details || {})

  // 表示中の圃場が切り替わったら編集状態・ドラフトをリセット
  React.useEffect(() => {
    setDraft(field.crop_specific_details || {})
    setEditing(false)
  }, [field.id])

  // この作物には特有の管理項目定義が無い → パネル自体を表示しない
  if (!defs || defs.length === 0) return null

  const saved       = field.crop_specific_details || {}
  const filledCount = defs.filter(d => saved[d.key]).length

  const handleSave = () => {
    if (onUpdate) onUpdate(field.id, draft)
    setEditing(false)
  }
  const handleCancel = () => {
    setDraft(saved)
    setEditing(false)
  }

  return React.createElement('div', { className:'card', style:{ marginBottom:'20px' } },
    React.createElement('div', { style:{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'14px', gap:'10px' } },
      React.createElement('div', null,
        React.createElement(SectionTitle, { icon:'plant-2', style:{ marginBottom:'4px' } }, field.crop + ' 専用の管理項目'),
        React.createElement('div', { style:{ fontSize:'11px', color:'#94A3B8' } },
          '記録済み ' + filledCount + ' / ' + defs.length + ' 項目　｜　作物に応じて自動で表示される専用項目です'
        )
      ),
      editing
        ? React.createElement('div', { style:{ display:'flex', gap:'8px', flexShrink:0 } },
            React.createElement('button', {
              className:'btn btn-ghost', style:{ padding:'6px 14px', fontSize:'12px' }, onClick:handleCancel
            }, 'キャンセル'),
            React.createElement('button', {
              className:'btn btn-primary', style:{ padding:'6px 14px', fontSize:'12px' }, onClick:handleSave
            }, '保存')
          )
        : React.createElement('button', {
            className:'btn btn-ghost', style:{ padding:'6px 14px', fontSize:'12px', flexShrink:0 },
            onClick: () => setEditing(true)
          },
            React.createElement('i', { className:'ti ti-pencil', style:{ fontSize:'13px', marginRight:'2px' } }),
            '編集'
          )
    ),
    React.createElement('div', {
      style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(170px, 1fr))', gap:'14px 18px' }
    },
      defs.map(d => React.createElement('div', { key:d.key },
        React.createElement('div', {
          style:{ fontSize:'10px', fontWeight:700, color:'#94A3B8', letterSpacing:'.05em', textTransform:'uppercase', marginBottom:'5px' }
        }, d.label),
        editing
          ? React.createElement('input', {
              type: d.type, className:'form-input', style:{ fontSize:'13px', padding:'7px 10px' },
              value: draft[d.key] || '',
              onChange: e => setDraft(prev => ({ ...prev, [d.key]: e.target.value }))
            })
          : React.createElement('div', {
              style:{ fontSize:'14px', fontWeight:600, color: saved[d.key] ? '#111827' : '#CBD5E1' }
            }, saved[d.key] || '未記録')
      ))
    )
  )
}

// ── 記録と作付けの紐付け修正用コンポーネント ──
function CropCycleSelector({ record, cropCycles, onUpdate }) {
  const [isEditing, setIsEditing] = React.useState(false)
  const history = getCropCycleHistory(cropCycles, record.field_id)
  // DB往復でcrop_cycle_idはtext("123")になる一方サイクルidが数値123のことがある→String比較で揃える(紐付け済みが未紐付け表示になるのを防ぐ)
  const current = history.find(c => String(c.id) === String(record.crop_cycle_id))

  if (!isEditing) {
    return React.createElement('div', {
      onClick: () => setIsEditing(true),
      style: {
        fontSize: '10px', color: current ? '#0A6B52' : '#94A3B8',
        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px',
        padding: '2px 6px', borderRadius: '4px', background: current ? '#ECFDF5' : '#F1F5F1'
      }
    },
      React.createElement('i', { className: 'ti ti-edit', style: { fontSize: '10px' } }),
      current ? current.crop : '未紐付け'
    )
  }

  return React.createElement('select', {
    className: 'form-select',
    style: { fontSize: '10px', padding: '2px 4px', width: 'auto', height: 'auto' },
    value: record.crop_cycle_id || '',
    onChange: (e) => {
      onUpdate(record.id, e.target.value ? Number(e.target.value) : null)
      setIsEditing(false)
    },
    onBlur: () => setIsEditing(false),
    autoFocus: true
  },
    React.createElement('option', { value: '' }, '選択なし'),
    history.map(c => React.createElement('option', { key: c.id, value: c.id },
      `${c.crop} (${c.start_month}月〜${c.end_month}月)`
    ))
  )
}

function FieldDetailPage({ field, fields, records, pesticides, onSaveRecord, onUpdateRecord, onDeleteRecord, lotSprayRecords, onSaveLotSprayRecord, onDeleteLotSprayRecord, harvestRecords, onSaveHarvestRecord, onDeleteHarvestRecord, onUpdateFieldCropDetails, sub, cropCycles, onAddCropCycle, onUpdateCropCycle, onDeleteCropCycle, onCompleteCropCycle,
  // 【サンプル農園実データ統合 フェーズ4・Step4-1(画面接続)】追肥記録を圃場詳細ページから使えるようにする
  fertilizers, topDressingRecords, onSaveTopDressingRecord, onDeleteTopDressingRecord,
  // 【実装手順書 Step2】出荷先マスタ
  destinations, onChangeDestinations,
  // 【実装手順書 C】担当者連携
  staff,
  // 【畝ロット管理】動的ロット + CRUD（旧・静的LOTSの置き換え）
  lots, onAddLot, onUpdateLot, onDeleteLot,
  onUpdateField }) {
  const fieldRecords = records.filter(r => String(r.field_id) === String(field.id))
  // 所在地(住所)・eMAFF農地番号のインライン編集。既存圃場に後から入れられるように。
  const [addrEditing, setAddrEditing]   = React.useState(false)
  const [addrDraft, setAddrDraft]       = React.useState('')
  const [emaffEditing, setEmaffEditing] = React.useState(false)
  const [emaffDraft, setEmaffDraft]     = React.useState('')
  // 【見やすさ】GAP・所在地情報(所在地/eMAFF/GGAP対象)は既定で畳む。未登録が並ぶ見づらさを解消し、
  // 初回はサマリ→登録、後からまとめて編集(スキップ可)できるように。
  const [gapInfoOpen, setGapInfoOpen]   = React.useState(false)
  const fieldRows    = lots || []
  const [selectedRowNo, setSelectedRowNo] = React.useState(null)

  const statusClass = field.status === '栽培中' ? 'badge-green'
    : field.status === '休閑'   ? 'badge-gray'
    : field.status === '収穫期' ? 'badge-amber' : 'badge-blue'

  // ── タブ定義（5タブ構成）──
  const TABS = [
    { id:'dashboard',    label:'圃場ダッシュボード', icon:'home'      },
    { id:'crop_history', label:'作付け履歴',         icon:'history'   },
    { id:'daily',        label:'日報入力',           icon:'notebook'  },
    { id:'pesticide',    label:'農薬散布',           icon:'spray'     },
    // 【サンプル農園実データ統合 フェーズ4・Step4-1(画面接続)】追肥記録タブ
    { id:'topdressing',  label:'肥料散布記録',       icon:'droplet'   },
    { id:'harvest',      label:'収穫・出荷',         icon:'basket'    },
    { id:'field_eval',   label:'実績評価',           icon:'chart-bar' },
  ]
  const activeSub = TABS.some(t => t.id === sub) ? sub : 'dashboard'

  // ── コンテンツ定義 ──
  const content = {
    dashboard: () => React.createElement(FieldDashboardSection, {
      field, fieldRecords, fieldRows, pesticides, lotSprayRecords: lotSprayRecords || [],
      onAddLot, onUpdateLot, onDeleteLot,
    }),
    crop_history: () => React.createElement(CropCycleHistorySection, {
      field, cropCycles: cropCycles || [], onAdd: onAddCropCycle,
      onUpdate: onUpdateCropCycle, onDelete: onDeleteCropCycle,
      onComplete: onCompleteCropCycle,
    }),
    daily: () => React.createElement(DailySection, {
      field, fieldRecords, allRecords:records, pesticides, onSaveRecord, onUpdateRecord, onDeleteRecord,
      lotSprayRecords: lotSprayRecords || [],
      // 【入口一本化】農薬散布/施肥/収穫は畝対応フォームに切替（トップの日報入力と同じ挙動）
      farmLots: { [field.id]: (fieldRows || []) }, fertilizers, destinations, harvestRecords, staff,
      onSaveLotSpray: onSaveLotSprayRecord, onSaveTopDressing: onSaveTopDressingRecord, onSaveHarvest: onSaveHarvestRecord,
    }),
    pesticide: () => React.createElement(LotSprayRecordSection, {
      field,
      lots: fieldRows,
      lotSprayRecords: lotSprayRecords || [],
      pesticides,
      onSave: onSaveLotSprayRecord,
      onDelete: onDeleteLotSprayRecord,
      // 【実装手順書 C】担当者連携（収穫記録と同パターンで農薬散布にも対応）
      staff
    }),
    // 【サンプル農園実データ統合 フェーズ4・Step4-1(画面接続)】追肥記録セクション
    // TopDressingRecordSection自体はStep4-1で実装済みだったが、
    // FieldDetailPageのタブ・contentマップに接続されていなかったため追加。
    topdressing: () => React.createElement(TopDressingRecordSection, {
      field,
      lots: fieldRows,
      topDressingRecords: topDressingRecords || [],
      fertilizers: fertilizers || [],
      onSave: onSaveTopDressingRecord,
      onDelete: onDeleteTopDressingRecord,
      // 【実装手順書 C】担当者連携（収穫記録と同パターンで追肥にも対応）
      staff
    }),
    harvest: () => React.createElement(HarvestRecordSection, {
      field,
      harvestRecords: harvestRecords || [],
      lots: fieldRows,
      onSave: onSaveHarvestRecord,
      onDelete: onDeleteHarvestRecord,
      destinations: destinations,
      onChangeDestinations: onChangeDestinations,
      staff,
    }),
    field_eval: () => React.createElement(FieldEvalTab, { field, fieldRecords, harvestRecords: harvestRecords || [] }),
  }

  return React.createElement('div', { className:'page', style:{ padding:'0', display:'flex', flexDirection:'column', height:'100%' } },

    // ── ① ヘッダーエリア（圃場名・作物・ステータス）──
    React.createElement('div', {
      style:{
        padding:'20px 32px 0',
        borderBottom:'1px solid #DDE8DE',
        background:'#FFFFFF',
        flexShrink:0,
      }
    },
      // パンくず
      React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'6px' } },
        React.createElement('i', { className:'ti ti-folder-open', style:{ fontSize:'14px', color:'#94A3B8' } }),
        React.createElement('span', { style:{ fontSize:'12px', color:'#94A3B8', fontWeight:500 } }, '圃場別管理'),
        React.createElement('span', { style:{ fontSize:'12px', color:'#CBD5E1' } }, '/'),
        React.createElement('span', { style:{ fontSize:'12px', color:'#0A6B52', fontWeight:600 } }, field.name),
      ),
      // 圃場名・情報行
      React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'16px' } },
        React.createElement('div', {
          style:{
            width:'36px', height:'36px', borderRadius:'8px',
            background: field.color || '#0A6B52',
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
          }
        },
          React.createElement('i', { className:'ti ti-plant-2', style:{ fontSize:'18px', color:'#fff' } })
        ),
        React.createElement('div', null,
          React.createElement('div', { style:{ fontSize:'18px', fontWeight:700, color:'#111827', lineHeight:1.2 } }, field.name),
          React.createElement('div', { style:{ fontSize:'12px', color:'#64748B', marginTop:'2px' } },
            (field.area_name ? field.area_name + '　·　' : '') + field.crop + '　·　' + field.area_are + 'a'
          ),
          // 【集約】GAP・所在地情報（所在地/eMAFF/GGAP対象）を1つの折りたたみに。既定は畳む。
          React.createElement('div', { style:{ marginTop:'5px' } },
            React.createElement('button', {
              onClick: () => setGapInfoOpen(v => !v),
              style:{ display:'flex', alignItems:'center', gap:'7px', background:'none', border:'none', cursor:'pointer', padding:'2px 0', fontSize:'11.5px', color:'#475569', flexWrap:'wrap' }
            },
              React.createElement('i', { className:'ti ti-chevron-' + (gapInfoOpen ? 'down' : 'right'), 'aria-hidden':'true', style:{ fontSize:'13px', color:'#94A3B8' } }),
              React.createElement('span', { style:{ fontWeight:700, color:'#334155' } }, '🗂 GAP・所在地情報'),
              (() => {
                const setN = (field.address ? 1 : 0) + (field.emaff_no ? 1 : 0)
                const meta = setN === 2 ? { t:'設定済み', c:'#0A6B52', bg:'#ECFDF5', bd:'#A7F3D0' }
                  : setN === 1 ? { t:'一部設定', c:'#B45309', bg:'#FFFBEB', bd:'#FDE68A' }
                  : { t:'未設定', c:'#94A3B8', bg:'#F1F5F9', bd:'#E2E8F0' }
                return React.createElement('span', { style:{ fontSize:'10px', fontWeight:700, color:meta.c, background:meta.bg, border:'1px solid '+meta.bd, borderRadius:10, padding:'1px 8px' } }, meta.t)
              })(),
              !gapInfoOpen && React.createElement('span', { style:{ fontSize:'10.5px', color:'#0A6B52', fontWeight:600 } }, '登録 / 編集')
            ),
            gapInfoOpen && React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:'7px', marginTop:'8px', paddingLeft:'20px', borderLeft:'2px solid #EDF2ED' } },
              // 所在地
              React.createElement('div', { style:{ fontSize:'11px', color:'#6B7280', display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' } },
                addrEditing
                  ? React.createElement(React.Fragment, null,
                      React.createElement('input', { autoFocus:true, value:addrDraft, onChange:e=>setAddrDraft(e.target.value), placeholder:'例: 千葉県木更津市○○ 123-4',
                        style:{ fontSize:'12px', padding:'3px 7px', border:'1px solid #D8E4D8', borderRadius:5, width:'230px', outline:'none' } }),
                      React.createElement('button', { onClick:()=>{ if(onUpdateField) onUpdateField({ address: addrDraft.trim() }); setAddrEditing(false); try{ if(typeof showToast==='function') showToast('所在地を保存しました','success') }catch(e){} },
                        style:{ fontSize:11, fontWeight:700, color:'#fff', background:'#0A6B52', border:'none', borderRadius:5, padding:'3px 10px', cursor:'pointer' } }, '保存'),
                      React.createElement('button', { onClick:()=>setAddrEditing(false), style:{ fontSize:11, color:'#6B7280', background:'none', border:'none', cursor:'pointer' } }, '取消')
                    )
                  : React.createElement(React.Fragment, null,
                      field.address ? React.createElement('span', null, '📍 ' + field.address) : React.createElement('span', { style:{ color:'#94A3B8' } }, '📍 所在地 未登録'),
                      React.createElement('button', { onClick:()=>{ setAddrDraft(field.address||''); setAddrEditing(true) },
                        style:{ fontSize:11, color:'#0A6B52', background:'none', border:'none', cursor:'pointer', fontWeight:600 } }, field.address ? '編集' : '登録')
                    )
              ),
              // eMAFF農地番号
              React.createElement('div', { style:{ fontSize:'11px', color:'#6B7280', display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' } },
                emaffEditing
                  ? React.createElement(React.Fragment, null,
                      React.createElement('input', { autoFocus:true, value:emaffDraft, onChange:e=>setEmaffDraft(e.target.value), placeholder:'例: 1234567890123（農地一連番号）',
                        style:{ fontSize:'12px', padding:'3px 7px', border:'1px solid #D8E4D8', borderRadius:5, width:'230px', outline:'none' } }),
                      React.createElement('button', { onClick:()=>{ if(onUpdateField) onUpdateField({ emaff_no: emaffDraft.trim() }); setEmaffEditing(false); try{ if(typeof showToast==='function') showToast('eMAFF農地番号を保存しました','success') }catch(e){} },
                        style:{ fontSize:11, fontWeight:700, color:'#fff', background:'#0A6B52', border:'none', borderRadius:5, padding:'3px 10px', cursor:'pointer' } }, '保存'),
                      React.createElement('button', { onClick:()=>setEmaffEditing(false), style:{ fontSize:11, color:'#6B7280', background:'none', border:'none', cursor:'pointer' } }, '取消')
                    )
                  : React.createElement(React.Fragment, null,
                      field.emaff_no ? React.createElement('span', null, '🗺 eMAFF農地番号: ' + field.emaff_no) : React.createElement('span', { style:{ color:'#94A3B8' } }, '🗺 eMAFF農地番号 未登録'),
                      React.createElement('button', { onClick:()=>{ setEmaffDraft(field.emaff_no||''); setEmaffEditing(true) },
                        style:{ fontSize:11, color:'#0A6B52', background:'none', border:'none', cursor:'pointer', fontWeight:600 } }, field.emaff_no ? '編集' : '登録')
                    )
              ),
              // GGAP認証対象
              React.createElement('div', { style:{ fontSize:'11px', color:'#6B7280', display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' } },
                (field.gap_target === false)
                  ? React.createElement('span', { style:{ color:'#94A3B8' } }, '☆ GGAP認証 対象外')
                  : React.createElement('span', { style:{ color:'#0A6B52', fontWeight:700 } }, '★ GGAP認証 対象'),
                React.createElement('button', { onClick:()=>{ if(onUpdateField){ const next = !(field.gap_target !== false); onUpdateField({ gap_target: next }); try{ if(typeof showToast==='function') showToast(next?'GGAP認証の対象にしました':'GGAP認証の対象外にしました','success') }catch(e){} } },
                  style:{ fontSize:11, color:'#0A6B52', background:'none', border:'none', cursor:'pointer', fontWeight:600 } }, '切替')
              )
            )
          ),
        ),
        React.createElement('span', { className:'badge ' + statusClass, style:{ marginLeft:'4px' } }, field.status),
      ),

      // ── ② タブバー ──
      React.createElement('div', { style:{ display:'flex', gap:'0', marginBottom:'-1px' } },
        TABS.map(tab =>
          React.createElement('button', {
            key: tab.id,
            onClick: () => {
              // サイドバーのURLも連動させるためwindow経由でonChangeを呼ぶ
              // FieldDetailPageはApp側から page state で制御されているので
              // ここでは直接 window.__fieldTabChange を使う（App側で設定）
              if (window.__fieldTabChange) window.__fieldTabChange('field:' + field.id + ':' + tab.id)
            },
            style:{
              display:'flex', alignItems:'center', gap:'6px',
              padding:'10px 18px',
              border:'none', background:'none', cursor:'pointer',
              fontSize:'13px', fontWeight: activeSub === tab.id ? 700 : 500,
              color: activeSub === tab.id ? '#0A6B52' : '#64748B',
              borderBottom: activeSub === tab.id ? '2px solid #0A6B52' : '2px solid transparent',
              borderRadius:'0',
              transition:'all .15s',
              whiteSpace:'nowrap',
            },
            onMouseEnter: e => { if (activeSub !== tab.id) e.currentTarget.style.color = '#0A6B52' },
            onMouseLeave: e => { if (activeSub !== tab.id) e.currentTarget.style.color = '#64748B' },
          },
            React.createElement('i', { className:'ti ti-' + tab.icon, style:{ fontSize:'15px' } }),
            tab.label
          )
        )
      )
    ),

    // ── ③ 作物別管理項目パネル（作物に応じて自動表示）──
    React.createElement('div', { style:{ padding:'0 32px', flexShrink:0, marginTop:'20px' } },
      React.createElement(CropSpecificDetailsPanel, { field, onUpdate: onUpdateFieldCropDetails })
    ),

    // ── ④ コンテンツエリア ──
    React.createElement('div', { style:{ flex:1, overflowY:'auto', padding:'24px 32px' } },
      (content[activeSub] || content.dashboard)()
    )
  )
}

// ── 圃場別「作付け履歴」タブ ──
// 圃場に対する作付け（crop_cycle）の追加・一覧・終了操作を行う
function CropCycleHistorySection({ field, cropCycles, onAdd, onUpdate, onDelete, onComplete }) {
  const [showForm, setShowForm] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState(null)
  const [form, setForm] = React.useState({
    field_id: field.id, crop: field.crop, start_month: 4, end_month: 6, note: '',
  })
  const updateField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const history = getCropCycleHistory(cropCycles, field.id)
  const current = history.find(c => c.status === 'active')

  const handleAdd = () => {
    if (!form.crop) return
    onAdd({ ...form, field_id: field.id })
    setForm({ field_id: field.id, crop: field.crop, start_month: 4, end_month: 6, note: '' })
    setShowForm(false)
  }

  const statusLabel = { active: '栽培中', completed: '終了', planned: '計画中' }
  const statusBadge = { active: 'badge-green', completed: 'badge-gray', planned: 'badge-blue' }

  return React.createElement('div', null,
    // 現在の作付け（強調表示）
    current && React.createElement('div', { className:'card', style:{ marginBottom:'16px' } },
      React.createElement('div', { style:{ fontSize:'11px', color:'#94A3B8', marginBottom:'4px' } }, '現在の作付け'),
      React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'10px' } },
        React.createElement('span', { style:{ fontSize:'17px', fontWeight:700 } }, current.crop),
        React.createElement('span', { className:'badge badge-green' }, statusLabel[current.status]),
        React.createElement('button', {
          className:'btn btn-sm', style:{ marginLeft:'auto' },
          onClick: () => onComplete(current.id),
        }, '今期を終了する')
      ),
      React.createElement('div', { style:{ fontSize:'12px', color:'#64748B', marginTop:'6px' } },
        current.start_month + '月 〜 ' + current.end_month + '月　' + (current.note || '')
      )
    ),

    // 履歴一覧
    React.createElement('div', { className:'card' },
      React.createElement('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' } },
        React.createElement('div', { className:'section-title' }, '作付け履歴'),
        React.createElement('button', { className:'btn btn-primary btn-sm', onClick:()=>setShowForm(true) }, '+ 新しい作付けを開始')
      ),
      history.length === 0
        ? React.createElement('div', { style:{ color:'#94A3B8', fontSize:'13px', padding:'16px 0', textAlign:'center' } }, '作付け履歴がありません')
        : React.createElement('table', { style:{ width:'100%', borderCollapse:'collapse', fontSize:'13px' } },
            React.createElement('thead', null,
              React.createElement('tr', { style:{ borderBottom:'1px solid #E5E9F0' } },
                ['作物','期間','状態','メモ',''].map(h =>
                  React.createElement('th', { key:h, style:{ padding:'8px 12px', textAlign:'left', color:'#94A3B8', fontWeight:600, fontSize:'11px' } }, h)
                )
              )
            ),
            React.createElement('tbody', null,
              history.map(c =>
                React.createElement('tr', { key:c.id, style:{ borderBottom:'1px solid #F3F4F6' } },
                  React.createElement('td', { style:{ padding:'10px 12px', fontWeight:600 } }, c.crop),
                  React.createElement('td', { style:{ padding:'10px 12px', color:'#64748B' } }, c.start_month+'月〜'+c.end_month+'月'),
                  React.createElement('td', { style:{ padding:'10px 12px' } },
                    React.createElement('span', { className:'badge ' + (statusBadge[c.status]||'badge-gray') }, statusLabel[c.status]||c.status)
                  ),
                  React.createElement('td', { style:{ padding:'10px 12px', color:'#94A3B8', fontSize:'12px' } }, c.note || '—'),
                  React.createElement('td', { style:{ padding:'10px 12px', textAlign:'right' } },
                    React.createElement('button', {
                      style:{ color:'#C2410C', background:'none', border:'none', cursor:'pointer', fontSize:'12px' },
                      onClick: () => setDeleteTarget(c),
                    }, '削除')
                  )
                )
              )
            )
          )
    ),

    deleteTarget && React.createElement(ConfirmDeleteModal, {
      title: '作付け履歴を削除しますか？',
      targetName: deleteTarget.crop + '　' + deleteTarget.start_month + '月〜' + deleteTarget.end_month + '月',
      onCancel: () => setDeleteTarget(null),
      onConfirm: () => { onDelete(deleteTarget.id); setDeleteTarget(null) }
    }),

    // 新規作付け追加フォーム（モーダル簡易実装）
    showForm && React.createElement('div', {
      style:{ position:'fixed', inset:0, background:'rgba(0,0,0,.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 },
      onClick: e => { if (e.target === e.currentTarget) setShowForm(false) }
    },
      React.createElement('div', { className:'card', style:{ width:'420px', background:'#fff' } },
        React.createElement('div', { className:'section-title', style:{ marginBottom:'12px' } }, '新しい作付けを開始'),
        React.createElement('label', { style:{ fontSize:'12px', color:'#64748B' } }, '作物'),
        React.createElement('select', {
          className:'form-select', value:form.crop, onChange:e=>updateField('crop', e.target.value),
          style:{ width:'100%', marginBottom:'10px' }
        },
          ['レタス','ターサイ','水稲','とうもろこし'].map(c => React.createElement('option', { key:c, value:c }, c))
        ),
        React.createElement('div', { style:{ display:'flex', gap:'8px', marginBottom:'10px' } },
          React.createElement('div', { style:{ flex:1 } },
            React.createElement('label', { style:{ fontSize:'12px', color:'#64748B' } }, '開始月'),
            React.createElement('input', { type:'number', min:1, max:12, className:'form-input', style:{width:'100%'},
              value:form.start_month, onChange:e=>updateField('start_month', e.target.value) })
          ),
          React.createElement('div', { style:{ flex:1 } },
            React.createElement('label', { style:{ fontSize:'12px', color:'#64748B' } }, '終了月'),
            React.createElement('input', { type:'number', min:1, max:12, className:'form-input', style:{width:'100%'},
              value:form.end_month, onChange:e=>updateField('end_month', e.target.value) })
          ),
        ),
        React.createElement('label', { style:{ fontSize:'12px', color:'#64748B' } }, 'メモ'),
        React.createElement('input', { type:'text', className:'form-input', style:{width:'100%', marginBottom:'14px'},
          value:form.note, onChange:e=>updateField('note', e.target.value) }),
        React.createElement('div', { style:{ display:'flex', gap:'8px', justifyContent:'flex-end' } },
          React.createElement('button', { className:'btn', onClick:()=>setShowForm(false) }, 'キャンセル'),
          React.createElement('button', { className:'btn btn-primary', onClick:handleAdd }, '開始する')
        )
      )
    )
  )
}

// ── 圃場別「実績評価」タブ ──
// 圃場ごとの収穫集計・反収・前年比を表示するシンプルなサマリー
function FieldEvalTab({ field, fieldRecords, harvestRecords }) {
  const totalCases = harvestRecords
    .filter(r => String(r.field_id) === String(field.id))
    .reduce((sum, r) => {
      const cases = Object.values(r.cases || {}).reduce((s, v) => s + Number(v || 0), 0)
      return sum + cases
    }, 0)
  const perTan = field.area_are > 0 ? Math.round((totalCases / field.area_are) * 10 * 10) / 10 : 0
  const workCount = fieldRecords.length

  return React.createElement('div', null,
    React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'14px', marginBottom:'24px' } },
      // 合計収穫ケース数
      React.createElement('div', { className:'stat-card green' },
        React.createElement('div', { className:'stat-l' }, '合計収穫ケース数'),
        React.createElement('div', { className:'stat-n' }, totalCases.toLocaleString()),
        React.createElement('div', { style:{ fontSize:'11px', color:'#94A3B8', marginTop:'4px' } }, 'ケース')
      ),
      // 反収（10aあたり）
      React.createElement('div', { className:'stat-card blue' },
        React.createElement('div', { className:'stat-l' }, '反収（10aあたり）'),
        React.createElement('div', { className:'stat-n', style:{ color:'#1D4ED8' } }, perTan.toLocaleString()),
        React.createElement('div', { style:{ fontSize:'11px', color:'#94A3B8', marginTop:'4px' } }, 'ケース / 10a')
      ),
      // 作業記録数
      React.createElement('div', { className:'stat-card' },
        React.createElement('div', { className:'stat-l' }, '作業記録数'),
        React.createElement('div', { className:'stat-n', style:{ color:'#6D28D9' } }, workCount),
        React.createElement('div', { style:{ fontSize:'11px', color:'#94A3B8', marginTop:'4px' } }, '件')
      ),
    ),
    // 収穫記録一覧（簡易）
    React.createElement('div', { className:'card' },
      React.createElement('div', { className:'section-title', style:{ marginBottom:'12px' } }, '収穫記録サマリー'),
      harvestRecords.filter(r => String(r.field_id) === String(field.id)).length === 0
        ? React.createElement('div', { style:{ color:'#94A3B8', fontSize:'13px', padding:'16px 0', textAlign:'center' } },
            'この圃場の収穫記録はまだありません'
          )
        : React.createElement('table', { style:{ width:'100%', borderCollapse:'collapse', fontSize:'13px' } },
            React.createElement('thead', null,
              React.createElement('tr', { style:{ borderBottom:'1px solid #E5E9F0' } },
                ['収穫日','ロット','合計ケース数'].map(h =>
                  React.createElement('th', { key:h, style:{ padding:'8px 12px', textAlign:'left', color:'#94A3B8', fontWeight:600, fontSize:'11px', letterSpacing:'.06em', textTransform:'uppercase' } }, h)
                )
              )
            ),
            React.createElement('tbody', null,
              harvestRecords.filter(r => String(r.field_id) === String(field.id)).map((r, i) => {
                const total = Object.values(r.cases || {}).reduce((s, v) => s + Number(v || 0), 0)
                return React.createElement('tr', { key:r.id || i, style:{ borderBottom:'1px solid #F3F4F6' } },
                  React.createElement('td', { style:{ padding:'10px 12px', color:'#374151' } }, r.date || '—'),
                  React.createElement('td', { style:{ padding:'10px 12px', color:'#64748B', fontSize:'12px' } }, r.lot_code || '—'),
                  React.createElement('td', { style:{ padding:'10px 12px', fontWeight:600, color:'#0A6B52' } }, total + ' ケース'),
                )
              })
            )
          )
    )
  )
}


// =====================================================
// 共通: 削除確認モーダル（システム全体のデザイントーンに統一）
// ブラウザ標準のwindow.confirm()の代わりに使用する、
// 緑×ゴールドのテーマに合わせたカスタム確認ダイアログ。
// =====================================================
function ConfirmDeleteModal({ title='削除しますか？', targetName, detail, onCancel, onConfirm }) {
  // 削除処理中は再クリック・Esc・背景クリック・キャンセルを一時無効化(通信が遅い時の二重送信=余分な競合通知を防ぐ)
  const [busy, setBusy] = React.useState(false)
  const handleConfirm = async () => {
    if (busy) return
    setBusy(true)
    try { await Promise.resolve(onConfirm()) } catch (_) {}
    setBusy(false) // 成功時は親がモーダルを閉じる(このコンポーネントはアンマウントされる)・失敗時は再操作可へ戻す
  }
  React.useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, busy])

  return React.createElement('div', {
    style:{
      position:'fixed', inset:0, background:'rgba(17,24,39,.45)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:10000,
      backdropFilter:'blur(2px)',
    },
    onClick: e => { if (e.target === e.currentTarget && !busy) onCancel() }
  },
    React.createElement('div', {
      style:{
        background:'#fff', borderRadius:'14px', padding:'26px', width:'360px',
        boxShadow:'0 20px 48px rgba(17,24,39,.25)',
        border:'1px solid #E2E8E2',
        position:'relative', overflow:'hidden',
        animation:'confirmModalIn .18s ease-out',
      }
    },
      // アイコン + タイトル
      React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'14px' } },
        React.createElement('div', {
          style:{
            width:'40px', height:'40px', borderRadius:'50%', background:'#FEF2F2',
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
          }
        },
          React.createElement('i', { className:'ti ti-trash', style:{ fontSize:'19px', color:'#DC2626' } })
        ),
        React.createElement('div', { style:{ fontSize:'15px', fontWeight:700, color:'#111827', lineHeight:1.3 } }, title)
      ),
      // 対象名（強調表示）
      targetName && React.createElement('div', {
        style:{
          background:'#F8FAF8', border:'1px solid #E2E8E2', borderRadius:'8px',
          padding:'10px 12px', marginBottom:'14px',
        }
      },
        React.createElement('div', { style:{ fontSize:'14px', fontWeight:700, color:'#111827' } }, targetName),
        detail && React.createElement('div', { style:{ fontSize:'12px', color:'#64748B', marginTop:'2px' } }, detail)
      ),
      React.createElement('div', { style:{ fontSize:'13px', color:'#64748B', marginBottom:'22px', lineHeight:1.6 } },
        'この操作は元に戻せません。本当に削除してよろしいですか？'
      ),
      // ボタン
      React.createElement('div', { style:{ display:'flex', gap:'8px' } },
        React.createElement('button', {
          onClick: () => { if (!busy) onCancel() },
          disabled: busy,
          style:{
            flex:1, padding:'10px', borderRadius:'8px', border:'1.5px solid #D8E4D8',
            background:'#fff', color:'#374151', fontSize:'13px', fontWeight:600,
            cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1,
          }
        }, 'キャンセル'),
        React.createElement('button', {
          onClick: handleConfirm,
          disabled: busy,
          style:{
            flex:1, padding:'10px', borderRadius:'8px', border:'none',
            background:'#DC2626', color:'#fff', fontSize:'13px', fontWeight:700,
            cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1,
          },
          onMouseEnter: e => { if (!busy) e.currentTarget.style.background='#B91C1C' },
          onMouseLeave: e => { if (!busy) e.currentTarget.style.background='#DC2626' },
        }, busy ? '削除中…' : '削除する')
      )
    )
  )
}

function FieldList({ fields, onAdd, onDelete, onUpdateField, mode='full', cropCycles=[], onNavigate, cropCategories, farmLots={}, lotSprayRecords=[], topDressingRecords=[], harvestRecords=[], pesticides=[] }) {
  const [showAdd,setShowAdd] = React.useState(false)
  // 地図クリックで新規圃場を登録する際の選択地点（モーダル表示トリガー）
  const [pendingLatLng, setPendingLatLng] = React.useState(null)
  const [cropTab, setCropTab] = React.useState('all')
  const [statusFilter, setStatusFilter] = React.useState([]) // 複数選択。空配列=すべて表示
  const toggleStatusFilter = (s) => setStatusFilter(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  const clearStatusFilter  = () => setStatusFilter([])
  // 削除確認モーダル用: 削除対象の圃場を保持（nullなら非表示）
  const [deleteTarget, setDeleteTarget] = React.useState(null)

  // 作物タブの選択肢: 圃場一覧から動的に抽出（現在の作付け基準。crop_cycleが無ければfield.cropにフォールバック）
  const cropOf = (f) => {
    const cur = getCurrentCropCycle(cropCycles, f.id)
    return cur ? cur.crop : f.crop
  }
  const cropOptions = ['all', ...Array.from(new Set(fields.map(cropOf)))]
  // 作物タブで絞り込んだ後の母集合（ステータスごとの件数カウント用）
  const cropFilteredFields = fields.filter(f => cropTab === 'all' || cropOf(f) === cropTab)
  // status未設定の圃場（過去データ取り込み等）は絞り込みチップから除外し、keyのundefined重複を防ぐ
  const statusOptions = Array.from(new Set(fields.map(f => f.status).filter(Boolean)))
  const statusCounts  = Object.fromEntries(
    statusOptions.map(s => [s, cropFilteredFields.filter(f => f.status === s).length])
  )
  const visibleFields = cropFilteredFields
    .filter(f => statusFilter.length === 0 || statusFilter.includes(f.status))
  const mapRef         = React.useRef(null)
  const mapInstanceRef = React.useRef(null)
  // 【輪郭の手動微調整】衛星を見ながら圃場の角をタップして輪郭を描き、畝を実形状に合わせる。
  const [drawFieldId, setDrawFieldId] = React.useState(null)   // 描画中の圃場ID（nullなら非描画）
  const drawModeRef   = React.useRef(null)
  const drawPointsRef = React.useRef([])
  const drawLayerRef  = React.useRef(null)
  const [drawTick, setDrawTick] = React.useState(0)            // 再描画トリガー
  React.useEffect(()=>{ drawModeRef.current = drawFieldId },[drawFieldId])
  const crops=['レタス','米','とうもろこし','ターサイ','トマト','大豆','玉ねぎ']
  const colors=['#0D9972','#D97706','#2563EB','#7C3AED','#DC2626']
  // 作物カラーマップ（B-4仕様）
  const cropColorMap = { レタス:'#0D9972', 米:'#D97706', とうもろこし:'#EA580C', ターサイ:'#0891B2', トマト:'#DC2626', 大豆:'#7C3AED', 玉ねぎ:'#65A30D' }

  React.useEffect(()=>{
    if (!mapRef.current||mapInstanceRef.current) return
    const map = L.map(mapRef.current).setView([35.384,139.925],15)
    // 衛星写真を既定に（現場の圃場は形・位置が衛星で分かる）。国土地理院(日本公式・無料・キー不要)を基本、
    // 高解像のEsri、通常地図も切り替え可能。畝マップ(次段階)の背景にもこの衛星レイヤを使う。
    const gsiPhoto = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', { attribution:'地理院タイル（シームレス空中写真）', maxZoom:18 })
    const esriImg  = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution:'© Esri World Imagery', maxZoom:19 })
    const osm      = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'© OpenStreetMap', maxZoom:19 })
    gsiPhoto.addTo(map)
    L.control.layers({ '衛星写真（地理院）':gsiPhoto, '衛星写真（Esri・高解像）':esriImg, '地図':osm }, null, { collapsed:false, position:'topright' }).addTo(map)
    mapInstanceRef.current = map

    // B-4: マップクリックで新規圃場登録 → モーダルで入力（旧: window.prompt連打）
    map.on('click', e => {
      if (drawModeRef.current != null) {           // 輪郭描画中: 角を追加
        drawPointsRef.current.push([e.latlng.lat, e.latlng.lng])
        setDrawTick(t => t + 1)
      } else {
        setPendingLatLng(e.latlng)
      }
    })

    return ()=>{ map.remove(); mapInstanceRef.current=null }
  },[])
  React.useEffect(()=>{
    const map=mapInstanceRef.current; if (!map) return
    map.eachLayer(l=>{if (l instanceof L.CircleMarker || l instanceof L.Polygon) map.removeLayer(l)})
    // 【畝マップ】row_count と緯度経度がある圃場は、衛星の上に畝の矩形を自動生成して重ねる。
    // 各畝は「その畝番号を含むロット(作付)」の状態で色分けし、どの畝に何が植わっているか一目で分かる。
    // 畝をタップすると圃場詳細へ。輪郭の手動登録が無くても畝レイアウトが見える（自動生成）。
    const BED_STATUS_COLOR = { growing:'#0D9972', ready:'#D97706', harvested:'#94A3B8', fallow:'#CBD5E1' }
    // 指定畝(field×bed)に重なる記録を数える（畝カルテ用）
    const bedOverlap = (recs, fid, bed) => (recs||[]).filter(r => r.field_id===fid && (()=>{ try { return parseRowRange(r.row_range).has(bed) } catch(e){ return false } })())
    fields.filter(f=>Number.isFinite(Number(f.lat))&&Number.isFinite(Number(f.lng))&&Number(f.row_count)>0).forEach(f=>{
      const lots = (farmLots && farmLots[f.id]) || []
      const lotOfBed = (bed) => lots.find(l => { try { return parseRowRange(l.row_range).has(bed) } catch(e){ return false } })
      generateBedPolygons(f).forEach(bp=>{
        const lot = lotOfBed(bp.bed)
        const col = lot ? (BED_STATUS_COLOR[lot.status] || f.color || '#0A6B52') : (f.color || '#0A6B52')
        const filled = !!lot
        const stLabel = lot && lot.status ? (ROW_STATUS_CONFIG[lot.status] ? ROW_STATUS_CONFIG[lot.status].label : lot.status) : ''
        // Leafletのtooltip/popupはHTMLとして描画されるため、ユーザー入力値（圃場名・品種・状態）は必ずエスケープする（stored XSS防止）
        const escT = (typeof escHtml==='function') ? escHtml : (s)=>String(s==null?'':s)
        const tip = escT(f.name) + ' 畝' + bp.bed + (lot ? '｜' + escT(lot.variety || f.crop || '') + (stLabel ? '（' + escT(stLabel) + '）' : '') : '｜空き')
        // 畝カルテ: この畝に重なる施肥/防除/収穫を集計
        const sprayRecs = bedOverlap(lotSprayRecords, f.id, bp.bed)
        const sprays = sprayRecs.length
        const ferts  = bedOverlap(topDressingRecords, f.id, bp.bed).length
        const harvs  = bedOverlap(harvestRecords, f.id, bp.bed)
        const cases  = harvs.reduce((a,h)=> a + (Number(h.total_cases)|| (h.shipments||[]).reduce((s,x)=>s+(Number(x.cases)||0),0) || 0), 0)
        // 【畝カルテのGAP適合フラグ】この畝で PHI(収穫前日数)違反 / 農薬の年間使用回数オーバー が無いか。
        const pById = (id) => (pesticides||[]).find(p=>p.id===id)
        const dayDiff = (a,b)=>{ try{ return Math.round((new Date(b)-new Date(a))/86400000) }catch(e){ return NaN } }
        let phiIssue=false, overIssue=false
        try {
          harvs.forEach(h=> sprayRecs.forEach(sr=> (sr.pesticides||[]).forEach(pp=>{ const pe=pById(pp.pesticide_id); if(pe&&pe.preharvest_days!=null&&sr.date&&h.date){ const g=dayDiff(sr.date,h.date); if(g>=0&&g<pe.preharvest_days) phiIssue=true } })))
          const cnt={}; sprayRecs.forEach(sr=> (sr.pesticides||[]).forEach(pp=>{ const y=(sr.date||'').slice(0,4); const k=pp.pesticide_id+'|'+y; cnt[k]=(cnt[k]||0)+1 }))
          Object.entries(cnt).forEach(([k,n])=>{ const pe=pById(Number(k.split('|')[0])); if(pe&&pe.max_times&&n>pe.max_times) overIssue=true })
        } catch(e){}
        const esc = (typeof escHtml==='function') ? escHtml : (s)=>String(s==null?'':s)
        const flags = (phiIssue?'<span style="color:#DC2626;font-weight:700">⚠️ PHI注意</span>':'') + (phiIssue&&overIssue?'　':'') + (overIssue?'<span style="color:#DC2626;font-weight:700">⚠️ 農薬回数超過</span>':'')
        const okFlag = (!phiIssue&&!overIssue&&(sprays>0||harvs.length>0)) ? '<span style="color:#0A6B52;font-weight:700">✅ GAP適合</span>' : ''
        const popup = '<div style="min-width:190px">'
          + '<div style="font-weight:800;color:#0A6B52">' + esc(f.name) + ' ／ 畝' + bp.bed + '</div>'
          + '<div style="font-size:12px;color:#374151;margin:3px 0">' + (lot ? esc(lot.variety||f.crop||'') + (stLabel?'（'+esc(stLabel)+'）':'') : '<span style="color:#94A3B8">空き畝</span>') + '</div>'
          + '<div style="display:flex;gap:10px;font-size:12px;margin:6px 0;color:#475569">'
          +   '<span>💊 防除 <b>' + sprays + '</b></span><span>🌱 施肥 <b>' + ferts + '</b></span><span>🧺 収穫 <b>' + cases + '</b></span>'
          + '</div>'
          + ((flags||okFlag) ? '<div style="font-size:11px;margin:2px 0 6px">' + (flags||okFlag) + '</div>' : '')
          + '<div class="popup-draw-boundary" data-field-id="' + f.id + '" style="margin-top:6px;padding:6px 10px;background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE;border-radius:6px;text-align:center;font-size:12px;font-weight:600;cursor:pointer">✏️ 輪郭を描く（畝を形に合わせる）</div>'
          + '<div class="popup-goto-field" data-field-id="' + f.id + '" style="margin-top:6px;padding:6px 10px;background:#0A6B52;color:#fff;border-radius:6px;text-align:center;font-size:12px;font-weight:600;cursor:pointer">圃場詳細を見る →</div>'
          + '</div>'
        // 非有限座標(異常データ由来)はLeafletが例外を投げるため描画しない
        if (!bp.corners.every(c => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]))) return
        L.polygon(bp.corners,{ color:col, weight:1, fillColor:col, fillOpacity: filled ? .45 : .12 })
          .bindTooltip(tip,{direction:'top',opacity:.9})
          .bindPopup(popup)
          .addTo(map)
      })
    })
    // 緯度経度が未設定の圃場（地図でピン留めせずに登録した圃場）はマーカーを作らない。
    // Leafletは(undefined,undefined)で例外を投げアプリ全体を巻き込んで落ちるため、必ずガードする。
    // ポップアップに入るユーザー入力値（圃場名/作物/状態/住所）は全てエスケープする（stored XSS防止・畝ポリゴン側と同基準）
    const _escP = (typeof escHtml==='function') ? escHtml : (s)=>String(s==null?'':s)
    fields.filter(f=>Number.isFinite(Number(f.lat))&&Number.isFinite(Number(f.lng))).forEach(f=>L.circleMarker([Number(f.lat),Number(f.lng)],{color:f.color,fillColor:f.color,fillOpacity:.7,radius:10,weight:2}).bindPopup(
      '<div style="min-width:150px">'
      + '<b>'+_escP(f.name)+'</b><br>'+_escP(f.crop)+' / '+(Number(f.area_are)||0)+'a — '+_escP(f.status)
      + (f.address ? '<div style="font-size:11px;color:#6B7280;margin-top:3px">📍 '+_escP(f.address)+'</div>' : '')
      + '<div class="popup-goto-field" data-field-id="'+_escP(f.id)+'" style="margin-top:8px;padding:6px 10px;background:#0A6B52;color:#fff;border-radius:6px;text-align:center;font-size:12px;font-weight:600;cursor:pointer;">圃場詳細を見る →</div>'
      + '</div>'
    ).addTo(map))
    // ポップアップ内「圃場詳細を見る →」タップで圃場詳細・ダッシュボードへ遷移
    map.off('popupopen')
    map.on('popupopen', e => {
      const node = e.popup.getElement ? e.popup.getElement() : e.popup._contentNode
      const btn  = node && node.querySelector('.popup-goto-field')
      if (btn) btn.onclick = () => onNavigate && onNavigate('field:' + btn.getAttribute('data-field-id') + ':dashboard')
      const dbtn = node && node.querySelector('.popup-draw-boundary')
      if (dbtn) dbtn.onclick = () => startBoundary(dbtn.getAttribute('data-field-id')) // UUID対応: masterByIdがString解決する
    })
  },[fields, farmLots, lotSprayRecords, topDressingRecords, harvestRecords, pesticides])
  // 描画中の輪郭（点線ポリゴン＋角マーカー）を再描画
  React.useEffect(()=>{
    const map=mapInstanceRef.current; if(!map) return
    if(drawLayerRef.current){ map.removeLayer(drawLayerRef.current); drawLayerRef.current=null }
    const pts=drawPointsRef.current
    if(drawFieldId!=null && pts.length>0){
      const g=L.layerGroup()
      if(pts.length>=2) L.polygon(pts,{color:'#1D4ED8',weight:2,dashArray:'5,5',fillColor:'#1D4ED8',fillOpacity:.12}).addTo(g)
      pts.forEach(p=>L.circleMarker(p,{radius:4,color:'#1D4ED8',fillColor:'#fff',fillOpacity:1,weight:2}).addTo(g))
      g.addTo(map); drawLayerRef.current=g
    }
  },[drawTick, drawFieldId])
  // 輪郭描画の確定/取消
  const finishBoundary = () => {
    if(drawFieldId!=null && drawPointsRef.current.length>=3 && onUpdateField){
      onUpdateField(drawFieldId,{ boundary: drawPointsRef.current.slice() })
      try{ if(typeof showToast==='function') showToast('輪郭を保存しました。畝を形状に合わせました。','success') }catch(e){}
    } else if (drawPointsRef.current.length<3) {
      try{ if(typeof showToast==='function') showToast('角を3点以上タップしてください。','warn') }catch(e){}
      return
    }
    setDrawFieldId(null); drawPointsRef.current=[]; setDrawTick(t=>t+1)
  }
  const cancelBoundary = () => { setDrawFieldId(null); drawPointsRef.current=[]; setDrawTick(t=>t+1) }
  const startBoundary = (fid) => { const f=masterById(fields, fid); drawPointsRef.current=(f&&Array.isArray(f.boundary)?f.boundary.slice():[]); setDrawFieldId(fid); setDrawTick(t=>t+1); if(mapInstanceRef.current) mapInstanceRef.current.closePopup() }
  // 描画中の操作バー（画面下部）
  const drawBarEl = drawFieldId!=null && React.createElement('div',{ style:{ position:'fixed', left:'50%', bottom:'24px', transform:'translateX(-50%)', zIndex:1200, background:'#fff', border:'1px solid #DDE8DE', borderRadius:12, boxShadow:'0 8px 28px rgba(0,0,0,.18)', padding:'10px 14px', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', maxWidth:'92vw' } },
    React.createElement('span',{ style:{ fontSize:13, fontWeight:700, color:'#1D4ED8' } }, '✏️ 輪郭を描く'),
    React.createElement('span',{ style:{ fontSize:12, color:'#64748B' } }, '地図の角をタップ（'+drawPointsRef.current.length+'点）'),
    React.createElement('button',{ onClick:()=>{ drawPointsRef.current.pop(); setDrawTick(t=>t+1) }, style:{ padding:'6px 12px', borderRadius:8, border:'1px solid #DDE2EC', background:'#fff', color:'#374151', fontSize:12, fontWeight:600, cursor:'pointer' } }, '1つ戻す'),
    React.createElement('button',{ onClick:cancelBoundary, style:{ padding:'6px 12px', borderRadius:8, border:'1px solid #FCA5A5', background:'#fff', color:'#DC2626', fontSize:12, fontWeight:600, cursor:'pointer' } }, '取消'),
    React.createElement('button',{ onClick:finishBoundary, style:{ padding:'6px 14px', borderRadius:8, border:'none', background:'#0A6B52', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' } }, '確定')
  )
  const listEl = fields.length === 0
    ? React.createElement('div', { style:{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'56px 24px', gap:14, textAlign:'center', background:'#fff', borderRadius:12, border:'1.5px dashed #C6DDD0' } },
        React.createElement('div', { style:{ width:64, height:64, borderRadius:'50%', background:'#F0F8F4', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:4 } },
          React.createElement('i', { className:'ti ti-map-pin', style:{ fontSize:28, color:'#0A6B52' } })
        ),
        React.createElement('div', { style:{ fontSize:16, fontWeight:700, color:'#111827' } }, 'まだ圃場が登録されていません'),
        React.createElement('div', { style:{ fontSize:13, color:'#6B7280', maxWidth:320, lineHeight:1.7 } },
          '圃場を登録すると作業記録・農薬管理・収穫実績の管理が始まります。',
          React.createElement('br', null),
          '地図上をクリックするか、右上のボタンから追加できます。'
        ),
        React.createElement('button', { className:'btn btn-primary', onClick:()=>setShowAdd(true) }, '+ 最初の圃場を登録する')
      )
    : React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:'12px' } },
    visibleFields.map(f => React.createElement('div', {
      key: f.id,
      onClick: () => onNavigate && onNavigate('field:' + f.id + ':dashboard'),
      style:{
        background:'#fff', borderRadius:'12px', padding:'16px',
        border:'1.5px solid #E8F0EA', cursor:'pointer',
        boxShadow:'0 1px 4px rgba(0,0,0,.05)',
        transition:'box-shadow .15s, border-color .15s',
        display:'flex', flexDirection:'column', gap:'8px',
      },
      onMouseEnter: e => { e.currentTarget.style.boxShadow='0 4px 12px rgba(10,107,82,.12)'; e.currentTarget.style.borderColor='#0A6B52' },
      onMouseLeave: e => { e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,.05)'; e.currentTarget.style.borderColor='#E8F0EA' },
    },
      // ヘッダー行: カラードット + 名前
      React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px' } },
        React.createElement('div', { style:{ width:10, height:10, borderRadius:'50%', background:f.color, flexShrink:0 } }),
        React.createElement('div', { style:{ fontSize:'14px', fontWeight:700, color:'#1F2937', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } }, f.name),
        (f.gap_target === false) && React.createElement('span', { title:'GGAP認証 対象外', style:{ fontSize:'9px', fontWeight:700, color:'#94A3B8', background:'#F1F5F9', border:'1px solid #E2E8F0', borderRadius:4, padding:'1px 5px', flexShrink:0 } }, '対象外')
      ),
      // エリア + 作物 + 面積
      React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280' } }, (f.area_name ? f.area_name + '　·　' : '') + cropOf(f) + '　·　' + f.area_are + 'a'),
      // フッター: ステータス + 削除
      React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'4px' } },
        React.createElement('span', { className:'badge ' + (f.status==='栽培中'?'badge-green':f.status==='休閑'?'badge-gray':f.status==='収穫期'?'badge-amber':'badge-blue') }, f.status),
        React.createElement('button', {
          onClick: e => { e.stopPropagation(); setDeleteTarget(f) },
          style:{ fontSize:'11px', color:'#CBD5E1', background:'none', border:'none', cursor:'pointer', padding:'2px 4px', borderRadius:'4px' },
          onMouseEnter: e => { e.currentTarget.style.color='#DC2626' },
          onMouseLeave: e => { e.currentTarget.style.color='#CBD5E1' },
        }, '削除')
      )
    ))
  )

  const mapEl = React.createElement('div',{className:'page-grow',style:{display:'flex',flexDirection:'column'}},
    React.createElement('div',{ref:mapRef,id:'field-map',style:{flex:1,minHeight:'320px'}}),
    React.createElement('div',{style:{fontSize:'12px',color:'#6B7280',marginTop:'6px',textAlign:'center'}},'📍 地図上をクリックして新規圃場を登録できます')
  )

  // ステータスの色（既存バッジと同じ配色ルールに合わせる）
  const statusColor = (s) => s==='栽培中' ? { bg:'#ECFDF5', border:'#6EE7B7', text:'#047857', activeBg:'#0A6B52' }
    : s==='休閑'   ? { bg:'#F1F5F9', border:'#CBD5E1', text:'#475569', activeBg:'#475569' }
    : s==='収穫期' ? { bg:'#FFFBEB', border:'#FDE68A', text:'#92400E', activeBg:'#B45309' }
    : { bg:'#EFF6FF', border:'#BFDBFE', text:'#1D4ED8', activeBg:'#1D4ED8' }

  // ステータス絞り込み行（複数選択トグル + 右端に一括クリア）
  const statusFilterRowEl = React.createElement('div', {
    style:{ display:'flex', gap:'6px', marginBottom:'18px', flexWrap:'wrap', alignItems:'center' }
  },
    statusOptions.map(s => {
      const c = statusColor(s)
      const active = statusFilter.includes(s)
      return React.createElement('button', {
        key:s,
        onClick: () => toggleStatusFilter(s),
        style:{
          display:'flex', alignItems:'center', gap:'6px',
          padding:'6px 12px', borderRadius:'16px', fontSize:'12px', fontWeight:600,
          border: active ? '1.5px solid '+c.activeBg : '1.5px solid '+c.border,
          background: active ? c.activeBg : c.bg,
          color: active ? '#fff' : c.text,
          cursor:'pointer', transition:'all .12s',
        }
      },
        s,
        React.createElement('span', {
          style:{
            fontSize:'11px', fontWeight:700, padding:'0 5px', borderRadius:'8px',
            background: active ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.06)',
          }
        }, statusCounts[s] || 0)
      )
    }),
    statusFilter.length > 0 && React.createElement('button', {
      onClick: clearStatusFilter,
      style:{
        marginLeft:'auto', display:'flex', alignItems:'center', gap:'4px',
        padding:'6px 12px', borderRadius:'16px', fontSize:'12px', fontWeight:600,
        border:'1.5px solid #DDE8DE', background:'#fff', color:'#64748B', cursor:'pointer',
      }
    },
      React.createElement('i', { className:'ti ti-x', style:{ fontSize:'12px' } }),
      '一括クリア'
    )
  )

  const addFormEl = showAdd && React.createElement(AddFieldModal, {
    onClose: () => setShowAdd(false),
    onAdd: (f) => { onAdd(f); setShowAdd(false) },
    cropCategories,
  })

  // 地図クリックで開く新規圃場追加モーダル（旧: window.prompt連打）
  const pendingAddModalEl = pendingLatLng && React.createElement(AddFieldModal, {
    initialLatLng: pendingLatLng,
    onClose: () => setPendingLatLng(null),
    onAdd: (f) => { onAdd(f); setPendingLatLng(null) },
    cropCategories,
  })

  // 削除確認モーダル（おしゃれ版・アプリ共通デザイン準拠）
  // 【番人監査 BUG#6】圃場を消すと、その圃場を参照する記録が圃場未紐付け（孤児）になる。
  // 消える前に「この圃場を参照している記録が何件あるか」を数えて確認文で明示し、不意のデータ濁りを防ぐ。
  const refCount = deleteTarget ? (() => {
    const fid = deleteTarget.id
    const lotN   = (farmLots && farmLots[fid]) ? farmLots[fid].length : 0
    const sprayN = (lotSprayRecords || []).filter(r => String(r.field_id) === String(fid)).length
    const harvN  = (harvestRecords  || []).filter(r => String(r.field_id) === String(fid)).length
    return lotN + sprayN + harvN
  })() : 0
  const deleteModalEl = deleteTarget && React.createElement(ConfirmDeleteModal, {
    title: '圃場を削除しますか？',
    targetName: deleteTarget.name,
    detail: cropOf(deleteTarget) + '　·　' + deleteTarget.area_are + 'a　·　' + deleteTarget.status
      + (refCount > 0 ? '　／　⚠ この圃場に紐づく記録 ' + refCount + '件（ロット・散布・収穫）は圃場未紐付けになります' : ''),
    onCancel: () => setDeleteTarget(null),
    onConfirm: () => { onDelete(deleteTarget.id); setDeleteTarget(null) },
  })

  // CAT-05-3: mode で表示内容を切り替え
  // mode='map'   → マップのみ（FieldMapPage から呼ばれる）
  // mode='list'  → リスト+追加フォームのみ（FieldTablePage から呼ばれる）
  // mode='full'  → マップ+リスト+追加フォーム（デフォルト）
  if (mode === 'map') return React.createElement('div', { className:'page' },
    React.createElement('div', { className:'eyebrow' }, 'FIELD MAP'),
    React.createElement('div', { className:'page-title' }, '圃場マップ'),
    React.createElement('div', { className:'page-sub' }, fields.length + '圃場 — 地図上をクリックして新規登録／畝をタップで輪郭を描いて形を合わせる'),
    mapEl,
    drawBarEl,
    pendingAddModalEl,
    deleteModalEl
  )

  if (mode === 'list') return React.createElement('div', { className:'page' },
    React.createElement('div', { className:'eyebrow' }, 'FIELD MANAGEMENT'),
    React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'6px' } },
      React.createElement('div', { className:'page-title' }, '圃場一覧・管理'),
      React.createElement('button', { className:'btn btn-primary', onClick:()=>setShowAdd(!showAdd) }, '+ 圃場を追加')
    ),
    React.createElement('div', { className:'page-sub' }, fields.length+'圃場登録済 / 総面積: '+fields.reduce((a,f)=>a+f.area_are,0)+'a'),
    React.createElement('div', { style:{ display:'flex', gap:'6px', marginBottom:'18px', flexWrap:'wrap' } },
      cropOptions.map(c =>
        React.createElement('button', {
          key:c,
          onClick: () => setCropTab(c),
          style:{
            padding:'6px 14px', borderRadius:'16px', fontSize:'12px', fontWeight:600,
            border: cropTab===c ? '1.5px solid #0A6B52' : '1.5px solid #DDE8DE',
            background: cropTab===c ? '#0A6B52' : '#fff',
            color: cropTab===c ? '#fff' : '#64748B',
            cursor:'pointer',
          }
        }, c === 'all' ? 'すべて' : c)
      )
    ),
    statusFilterRowEl,
    addFormEl,
    listEl,
    deleteModalEl
  )

  return React.createElement('div',{className:'page'},
    React.createElement('div', { className:'eyebrow' }, 'FIELD MANAGEMENT'),
    React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'6px' } },
      React.createElement('div', { className:'page-title' }, '圃場管理'),
      React.createElement('button', { className:'btn btn-primary', onClick:()=>setShowAdd(!showAdd) }, '+ 圃場を追加')
    ),
    React.createElement('div',{className:'page-sub'},fields.length+'圃場登録済 / 総面積: '+fields.reduce((a,f)=>a+f.area_are,0)+'a'),
    React.createElement('div', { style:{ display:'flex', gap:'6px', marginBottom:'18px', flexWrap:'wrap' } },
      cropOptions.map(c =>
        React.createElement('button', {
          key:c,
          onClick: () => setCropTab(c),
          style:{
            padding:'6px 14px', borderRadius:'16px', fontSize:'12px', fontWeight:600,
            border: cropTab===c ? '1.5px solid #0A6B52' : '1.5px solid #DDE8DE',
            background: cropTab===c ? '#0A6B52' : '#fff',
            color: cropTab===c ? '#fff' : '#64748B',
            cursor:'pointer',
          }
        }, c === 'all' ? 'すべて' : c)
      )
    ),
    statusFilterRowEl,
    addFormEl,
    React.createElement('div',{className:'page-grow',style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}},
      listEl, mapEl
    ),
    pendingAddModalEl,
    deleteModalEl
  )
}

// =====================================================
// CAT-05-3: FieldMapPage / FieldTablePage — FieldList から分割した専用コンポーネント
// =====================================================
function FieldMapPage({ fields, onAdd, onDelete, onUpdateField, cropCycles, onNavigate, cropCategories, farmLots, lotSprayRecords, topDressingRecords, harvestRecords, pesticides }) {
  return React.createElement(FieldList, { fields, onAdd, onDelete, onUpdateField, mode:'map', cropCycles, onNavigate, cropCategories, farmLots, lotSprayRecords, topDressingRecords, harvestRecords, pesticides })
}
function FieldTablePage({ fields, onAdd, onDelete, cropCycles, onNavigate, cropCategories, farmLots, lotSprayRecords, topDressingRecords, harvestRecords, pesticides }) {
  // farmLots/harvestRecords 等を渡すことで、削除確認の「紐づく記録N件」警告(BUG#6)を list モードでも機能させる
  return React.createElement(FieldList, { fields, onAdd, onDelete, mode:'list', cropCycles, onNavigate, cropCategories, farmLots, lotSprayRecords, topDressingRecords, harvestRecords, pesticides })
}

// =====================================================
// 【圃場まとめ / ロット別生産履歴】FieldSummaryPage
// aKnow（エイノウ）の「作付別の生産履歴」に相当する、Google Drive管理表
// （レタス/とうもろこし管理表）シートをロット単位で自動再構築するページ。
// farmLots（動的ロット）を軸に、農薬散布・施肥・収穫の各記録を
// 「同一圃場 × 畝範囲の重なり」で自動的に紐付け、1ロット=1行として一覧する。
// records（日報）とは別テーブルのため、field_id + row_range の重なりで突合する。
// 畝未指定（row_range空）の記録はどのロットにも属さないため、末尾に「畝未指定」件数を明示。
// =====================================================
// 原価が「概算」であることを分かりやすく誘導するバナー（今福さんの入力を促す）。
// 肥料マスタで単価が未入力の品目があれば件数も動的表示。原価を出す画面の上部に置く。
function costApproxBanner(fertilizers) {
  const miss = (fertilizers || []).filter(f => f && f.unit_price_yen_per_kg == null).length
  return React.createElement('div', {
    style:{ display:'flex', gap:10, alignItems:'flex-start', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:10, padding:'12px 16px', marginBottom:16 }
  },
    React.createElement('span', { style:{ fontSize:18, lineHeight:1.2 } }, '💡'),
    React.createElement('div', null,
      React.createElement('div', { style:{ fontSize:13, fontWeight:700, color:'#92400E', marginBottom:2 } }, '原価は現在「概算」です'),
      React.createElement('div', { style:{ fontSize:12, color:'#B45309', lineHeight:1.6 } },
        '肥料マスタの単価・重量、農薬の購入実績を入力すると、原価は自動で正確になります。' +
        (miss > 0 ? `（単価が未入力の肥料：${miss}品目）` : '')
      )
    )
  )
}

function FieldSummaryPage({ fields, farmLots, lotSprayRecords, topDressingRecords, harvestRecords, pesticides, fertilizers, pesticidePurchases }) {
  farmLots = farmLots || {}
  const [season, setSeason]       = React.useState('all')
  const [fieldFilter, setFieldFilter] = React.useState('all')
  const [expanded, setExpanded]   = React.useState(null)
  const [selectedFid, setSelectedFid] = React.useState(null)  // グリッドでタップした圃場（明細表示対象）

  // 9月以降を新シーズン起点として "YYYY-YYYY" を導出（FieldPerformancePageと同一基準）
  const seasonOf = (dateStr) => {
    if (!dateStr) return null
    const d = new Date(dateStr); if (isNaN(d)) return null
    const y = d.getFullYear(), m = d.getMonth() + 1
    return m >= 9 ? `${y}-${y+1}` : `${y-1}-${y}`
  }
  const fmtDate = (s) => s ? String(s).slice(0, 10) : '—'
  const fieldLabel = (f) => f ? (f.name + (f.field_no ? `（${f.field_no}）` : '')) : '（不明な圃場）'

  // 畝範囲の重なり判定（どちらか空なら重なり無しとして扱う → 畝未指定記録は紐付かない）
  const overlaps = (rangeStr, lotSet) => {
    const set = parseRowRange(rangeStr)
    if (set.size === 0 || lotSet.size === 0) return false
    for (const n of set) if (lotSet.has(n)) return true
    return false
  }

  // マスタ名の逆引き
  const pestName = (id) => (masterById(pesticides, id) || {}).name || '農薬'
  const fertName = (id) => (masterById(fertilizers, id) || {}).name || '肥料'

  // ── 資材原価の単価ソース（既存「圃場実績・評価」原価タブと同一の単価定義で揃える） ──
  // 農薬: マスタに単価が無いため pesticidePurchases の購入実績から平均単価(円/L)を算出
  const pestAvg = {}
  ;(pesticidePurchases || []).forEach(pu => {
    const k = canonicalMasterId(pesticides, pu.pesticide_id) // 旧数値ID仕入もUUIDマスタに集約
    if (!pestAvg[k]) pestAvg[k] = { amount:0, price:0 }
    pestAvg[k].amount += Number(pu.amount_L) || 0
    pestAvg[k].price  += Number(pu.price_yen) || 0
  })
  const priceOfPesticide  = (id) => { const a = pestAvg[canonicalMasterId(pesticides, id)]; return (a && a.amount > 0) ? a.price / a.amount : null }
  // 肥料: マスタの unit_price_yen_per_kg（null=価格未確定）
  const priceOfFertilizer = (id) => { const f = masterById(fertilizers, id); return (f && f.unit_price_yen_per_kg != null) ? f.unit_price_yen_per_kg : null }

  // 農薬の原液使用量(L) = 散布液量(L) ÷ 希釈倍率（在庫減算ロジックと同一の消費モデル）。
  // 希釈倍率が無い記録は消費量を確定できないため0扱い。
  const pesticideUsedL = (rec, pe) =>
    (Number(rec.spray_volume_L) > 0 && Number(pe.dilution) > 0) ? Number(rec.spray_volume_L) / Number(pe.dilution) : 0
  // 肥料の使用量(kg) = amount_kg 優先、無ければ 散布液量 ÷ 希釈倍率（実データは両パターン混在）
  const fertilizerUsedKg = (rec, fe) =>
    (Number(fe.amount_kg) > 0) ? Number(fe.amount_kg)
      : (Number(rec.spray_volume_L) > 0 && Number(fe.dilution) > 0) ? Number(rec.spray_volume_L) / Number(fe.dilution) : 0

  // 全ロットをフラット化して記録を集計
  const allLots = []
  ;(fields || []).forEach(f => {
    ;(farmLots[f.id] || []).forEach(lot => allLots.push({ ...lot, field: f, fieldId: f.id }))
  })

  // ── 各記録を「1ロットだけ」に割り当てる（畝が重なる複数ロットへの二重計上を防ぐ）──
  // 米→レタス転換のように旧作(畝1-12)と新作(畝1-6)が重なる場合、旧作の収穫が新ロットにも
  // 紐付いて二重計上されるのを防ぐ。優先順: ①品種一致(収穫) ②起算日が記録日以前で最新のロット
  // (散布/施肥の時系列) ③先頭。畝未指定(row_range空)はどのロットにも割り当てず末尾で件数警告。
  const bucket = {}
  allLots.forEach(l => { bucket[l.id] = { sprays: [], ferts: [], harvs: [] } })
  const assignRecord = (rec, kind) => {
    const set = parseRowRange(rec.row_range)
    if (set.size === 0) return
    const cands = allLots.filter(l => String(l.fieldId) === String(rec.field_id) && (() => { const ls = parseRowRange(l.row_range); for (const n of set) if (ls.has(n)) return true; return false })())
    if (cands.length === 0) return
    let chosen = rec.variety ? cands.find(l => l.variety === rec.variety) : null
    if (!chosen && rec.date) chosen = cands.filter(l => l.transplant_date && String(l.transplant_date) <= String(rec.date)).sort((a, b) => String(b.transplant_date).localeCompare(String(a.transplant_date)))[0]
    if (!chosen) chosen = cands[0]
    bucket[chosen.id][kind].push(rec)
  }
  ;(harvestRecords || []).forEach(r => assignRecord(r, 'harvs'))
  ;(lotSprayRecords || []).forEach(r => assignRecord(r, 'sprays'))
  ;(topDressingRecords || []).forEach(r => assignRecord(r, 'ferts'))

  const enriched = allLots.map(lot => {
    const sprays = bucket[lot.id].sprays
    const ferts  = bucket[lot.id].ferts
    const harvs  = bucket[lot.id].harvs
    const totalCases   = harvs.reduce((a, r) => a + (Number(r.total_cases) || 0), 0)
    const harvestDates = harvs.map(r => r.date).filter(Boolean).sort()
    const s = seasonOf(lot.transplant_date) || seasonOf(lot.seed_date) || seasonOf(harvestDates[0]) || '未設定'

    // ── 資材原価: 使用量×単価。単価未確定の品目はコストに含めずフラグを立てる（隠さない） ──
    let pesticideCost = 0, fertilizerCost = 0, unknownPrice = false, hasMaterial = false
    sprays.forEach(rec => (rec.pesticides || []).forEach(pe => {
      hasMaterial = true
      const price = priceOfPesticide(pe.pesticide_id)
      if (price == null) { unknownPrice = true; return }
      pesticideCost += pesticideUsedL(rec, pe) * price
    }))
    ferts.forEach(rec => (rec.fertilizers || []).forEach(fe => {
      hasMaterial = true
      const price = priceOfFertilizer(fe.fertilizer_id)
      if (price == null) { unknownPrice = true; return }
      fertilizerCost += fertilizerUsedKg(rec, fe) * price
    }))
    const totalCost   = pesticideCost + fertilizerCost
    const costPerCase = (totalCases > 0 && totalCost > 0) ? totalCost / totalCases : null

    return {
      lot, fieldId: lot.fieldId, sprays, ferts, harvs, totalCases,
      firstHarvest: harvestDates[0] || null,
      lastHarvest:  harvestDates[harvestDates.length - 1] || null,
      season: s,
      pesticideCost, fertilizerCost, totalCost, costPerCase, unknownPrice, hasMaterial,
    }
  })

  // 畝未指定（どのロットにも紐付かない）記録件数 — データ欠落を隠さない
  const unmatched =
    (lotSprayRecords || []).filter(r => parseRowRange(r.row_range).size === 0).length +
    (topDressingRecords || []).filter(r => parseRowRange(r.row_range).size === 0).length +
    (harvestRecords || []).filter(r => parseRowRange(r.row_range).size === 0).length

  // フィルタ選択肢
  const allSeasons = [...new Set(enriched.map(e => e.season))].sort().reverse()
  const usedFieldIds = [...new Set(enriched.map(e => e.fieldId))]

  const visible = enriched
    .filter(e => season === 'all' || e.season === season)
    .filter(e => fieldFilter === 'all' || String(e.fieldId) === String(fieldFilter))

  // サマリー集計
  const sumCases = visible.reduce((a, e) => a + e.totalCases, 0)
  const sumCost  = visible.reduce((a, e) => a + e.totalCost, 0)
  const anyUnknownPrice = visible.some(e => e.unknownPrice)
  const cnt = { growing:0, ready:0, harvested:0, fallow:0 }
  visible.forEach(e => { cnt[e.lot.status] = (cnt[e.lot.status] || 0) + 1 })

  // 圃場ごとにグループ化（表示順は圃場ID昇順）
  const groups = {}
  visible.forEach(e => { (groups[e.fieldId] = groups[e.fieldId] || []).push(e) })
  const groupIds = Object.keys(groups).map(Number).sort((a, b) => a - b)

  // ── CSV出力（管理表シート相当・Excel向けにBOM付与） ──
  const csvCell = (v) => {
    let s = v == null ? '' : String(v)
    // CSVインジェクション対策: 圃場名・品種などに = + @ 等が入るとExcel/Sheetsが数式として
    // 実行してしまう。数式トリガー文字始まりのセルは、全体が純粋な数値（-5 や +81）の時だけ
    // そのまま通し、それ以外（例: +1+SUM(A1:A2) のような数字始まりの式）は先頭に ' を付けて無害化。
    if (/^[=+\-@\t\r]/.test(s) && !(s.trim() !== '' && Number.isFinite(Number(s)))) s = "'" + s
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const downloadCsv = async () => {
    if (!(await confirmDownload({ icon:'📊', title:'圃場まとめをCSV出力', desc:'表示中の圃場・畝の管理表をCSV(Excel対応)で出力します。', filename:`圃場まとめ_${season === 'all' ? '全シーズン' : season}.csv` }))) return
    const header = ['圃場','畝範囲','品種','は種日','定植日','育苗日数','状態','農薬散布(回)','施肥(回)','収穫(回)','収穫ケース計','農薬原価(円)','肥料原価(円)','資材原価計(円)','円/ケース','初回収穫','最終収穫','シーズン']
    const lines = [header.map(csvCell).join(',')]
    visible.forEach(e => {
      lines.push([
        fieldLabel(e.lot.field), e.lot.row_range, e.lot.variety,
        fmtDate(e.lot.seed_date), fmtDate(e.lot.transplant_date),
        e.lot.seedling_period_days != null ? e.lot.seedling_period_days : '',
        (ROW_STATUS_CONFIG[e.lot.status] || {}).label || e.lot.status,
        e.sprays.length, e.ferts.length, e.harvs.length, e.totalCases,
        Math.round(e.pesticideCost), Math.round(e.fertilizerCost), Math.round(e.totalCost),
        e.costPerCase != null ? Math.round(e.costPerCase) : '',
        fmtDate(e.firstHarvest), fmtDate(e.lastHarvest), e.season,
      ].map(csvCell).join(','))
    })
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type:'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `圃場まとめ_${season === 'all' ? '全シーズン' : season}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // ── スタイル ──
  const wrap = { padding:'24px 32px 48px', maxWidth:'none', margin:'0' }
  const card = { background:'#fff', border:'1px solid #E5E7EB', borderRadius:12, padding:'16px 18px' }
  const th = { padding:'10px 12px', fontSize:12, fontWeight:700, color:'#6B7280', textAlign:'left', whiteSpace:'nowrap', borderBottom:'2px solid #E5E7EB' }
  const td = { padding:'10px 12px', fontSize:13, color:'#111827', borderBottom:'1px solid #F1F5F9', verticalAlign:'middle' }
  const selectStyle = { padding:'7px 10px', border:'1px solid #D1D5DB', borderRadius:8, fontSize:13, background:'#fff', cursor:'pointer' }
  const statusChip = (st) => {
    const c = ROW_STATUS_CONFIG[st] || { label:st, color:'#6B7280', bg:'#F8FAFC' }
    return React.createElement('span', { style:{ display:'inline-block', padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:700, color:c.color, background:c.bg } }, c.label)
  }
  const statCard = (label, value, color) => React.createElement('div',
    { style:{ ...card, flex:1, textAlign:'center', padding:'14px 10px' } },
    React.createElement('div', { style:{ fontSize:24, fontWeight:800, color, lineHeight:1.1 } }, value),
    React.createElement('div', { style:{ fontSize:12, color:'#6B7280', marginTop:4 } }, label),
  )

  // ── ヘッダ ──
  const headerEl = React.createElement('div', { style:{ marginBottom:20 } },
    React.createElement('div', { style:{ fontSize:12, fontWeight:700, color:'#0A6B52', letterSpacing:'.04em' } }, 'ロット別 生産履歴'),
    React.createElement('h1', { style:{ fontSize:22, fontWeight:800, color:'#111827', margin:'2px 0 4px' } }, '圃場まとめ'),
    React.createElement('p', { style:{ fontSize:13, color:'#6B7280', margin:0 } },
      'は種・定植・農薬・施肥・収穫の記録をロット単位で自動集約した、管理表シート相当の一覧です。'),
  )

  // ── 空状態 ──
  if (allLots.length === 0) {
    return React.createElement('div', { style:wrap },
      headerEl,
      React.createElement('div', { style:{ ...card, textAlign:'center', padding:'56px 24px' } },
        React.createElement('i', { className:'ti ti-plant-2', 'aria-hidden':'true', style:{ fontSize:44, color:'#0D9972', marginBottom:12, display:'block' } }),
        React.createElement('div', { style:{ fontSize:15, fontWeight:700, color:'#374151', marginBottom:6 } }, 'まだロットがありません'),
        React.createElement('div', { style:{ fontSize:13, color:'#6B7280', lineHeight:1.7, maxWidth:520, margin:'0 auto' } },
          '圃場詳細から定植日報を入力するとロットが自動生成され、以降の農薬散布・施肥・収穫記録がこのページにロット単位で自動集約されます。'),
      ),
    )
  }

  // ── フィルタ行 ──
  const filterBar = React.createElement('div', { style:{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', marginBottom:16 } },
    React.createElement('select', { style:selectStyle, value:season, onChange:e => setSeason(e.target.value) },
      React.createElement('option', { value:'all' }, '全シーズン'),
      ...allSeasons.map(s => React.createElement('option', { key:s, value:s }, s + ' シーズン')),
    ),
    React.createElement('select', { style:selectStyle, value:fieldFilter, onChange:e => setFieldFilter(e.target.value) },
      React.createElement('option', { value:'all' }, '全圃場'),
      ...usedFieldIds.map(id => {
        const f = masterById(fields, id)
        return React.createElement('option', { key:id, value:id }, fieldLabel(f))
      }),
    ),
    React.createElement('div', { style:{ flex:1 } }),
    React.createElement('button', {
      style:{ padding:'8px 14px', border:'1px solid #0A6B52', background:'#0A6B52', color:'#fff', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' },
      onClick: downloadCsv, disabled: visible.length === 0,
    }, '⬇ CSVダウンロード'),
  )

  // ── サマリーカード ──
  const summaryRow = React.createElement('div', { style:{ display:'flex', gap:12, marginBottom:16 } },
    statCard('対象ロット', visible.length + ' 件', '#111827'),
    statCard('栽培中', (cnt.growing || 0) + ' 件', '#0D9972'),
    statCard('収穫待ち', (cnt.ready || 0) + ' 件', '#B45309'),
    statCard('収穫済', (cnt.harvested || 0) + ' 件', '#1D4ED8'),
    statCard('収穫ケース計', sumCases.toLocaleString(), '#0A6B52'),
    statCard('資材原価計', '¥' + Math.round(sumCost).toLocaleString(), '#B45309'),
  )

  // ── ロット明細（展開時のタイムライン） ──
  const detailRow = (e) => {
    const events = [
      ...e.sprays.map(r => ({ date:r.date, kind:'農薬', color:'#B91C1C', text:(r.pesticides || []).map(p => pestName(p.pesticide_id)).join('・') + (r.weather ? `（${r.weather}）` : '') })),
      ...e.ferts.map(r => ({ date:r.date, kind:'施肥', color:'#B45309', text:(r.fertilizing_type ? r.fertilizing_type + '：' : '') + (r.fertilizers || []).map(p => fertName(p.fertilizer_id)).join('・') })),
      ...e.harvs.map(r => ({ date:r.date, kind:'収穫', color:'#0A6B52', text:`${r.total_cases || 0} ケース` + (r.shipments && r.shipments.length ? `（${r.shipments.length}出荷先）` : '') })),
    ].filter(ev => ev.date).sort((a, b) => String(a.date).localeCompare(String(b.date)))
    return React.createElement('tr', { key:e.lot.id + '_d' },
      React.createElement('td', { style:{ ...td, background:'#F8FAFC', padding:'12px 16px' }, colSpan:11 },
        events.length === 0
          ? React.createElement('div', { style:{ fontSize:12, color:'#9CA3AF' } }, '紐付く作業記録はまだありません（は種・定植のみ）')
          : React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:6 } },
              ...events.map((ev, i) => React.createElement('div', { key:i, style:{ display:'flex', gap:10, alignItems:'center', fontSize:12 } },
                React.createElement('span', { style:{ color:'#6B7280', width:88, flexShrink:0 } }, fmtDate(ev.date)),
                React.createElement('span', { style:{ color:ev.color, fontWeight:700, width:44, flexShrink:0 } }, ev.kind),
                React.createElement('span', { style:{ color:'#374151' } }, ev.text || '—'),
              )),
            ),
      ),
    )
  }

  // ── 圃場グループ集計（タイル用） ──
  const groupStat = (fid) => {
    const list = groups[fid] || []
    const c = { growing:0, ready:0, harvested:0, fallow:0 }
    list.forEach(e => { c[e.lot.status] = (c[e.lot.status] || 0) + 1 })
    return { list, cases: list.reduce((a,e)=>a+e.totalCases,0), cost: list.reduce((a,e)=>a+e.totalCost,0), cnt:c }
  }

  // ── 選択された圃場の明細テーブル（タップで表示） ──
  const renderFieldTable = (fid) => {
    const f = masterById(fields, fid)
    const list = (groups[fid] || []).slice().sort((a, b) => String(a.lot.transplant_date || '').localeCompare(String(b.lot.transplant_date || '')))
    const grpCases = list.reduce((a, e) => a + e.totalCases, 0)
    const grpCost  = list.reduce((a, e) => a + e.totalCost, 0)
    return React.createElement('div', { key:'detail_'+fid, style:{ background:'#fff', borderRadius:14, width:'92vw', maxWidth:'1100px', maxHeight:'86vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.25)' }, onClick:e=>e.stopPropagation() },
      React.createElement('div', { style:{ padding:'14px 18px', background:'#F0FDF4', borderBottom:'1px solid #E5E7EB', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', position:'sticky', top:0, zIndex:2 } },
        React.createElement('span', { style:{ fontSize:16, fontWeight:800, color:'#0A6B52' } }, fieldLabel(f)),
        f && f.crop ? React.createElement('span', { style:{ fontSize:12, color:'#64748B', fontWeight:600 } }, f.crop) : null,
        React.createElement('span', { style:{ fontSize:12, color:'#9CA3AF' } }, list.length + ' ロット'),
        React.createElement('div', { style:{ marginLeft:'auto', display:'flex', gap:16, fontSize:13, alignItems:'center' } },
          React.createElement('span', { style:{ color:'#6B7280' } }, '収穫 ', React.createElement('b', { style:{ color:'#0F766E' } }, grpCases.toLocaleString()), ' ケース'),
          grpCost > 0 ? React.createElement('span', { style:{ color:'#6B7280' } }, '原価 ', React.createElement('b', { style:{ color:'#B45309' } }, '¥' + Math.round(grpCost).toLocaleString())) : null,
          React.createElement('button', { onClick:()=>setSelectedFid(null), style:{ background:'none', border:'none', fontSize:'20px', color:'#9CA3AF', cursor:'pointer', lineHeight:1, padding:'0 2px' } }, '✕'),
        ),
      ),
      React.createElement('div', { style:{ overflowX:'auto' } },
        React.createElement('table', { style:{ width:'100%', borderCollapse:'collapse', minWidth:900 } },
          React.createElement('thead', null,
            React.createElement('tr', null,
              ['畝範囲','品種','は種日','定植日','育苗日数','状態','農薬','施肥','収穫ケース','資材原価','最終収穫'].map((h, i) =>
                React.createElement('th', { key:i, style:{ ...th, textAlign: i >= 6 && i <= 9 ? 'right' : 'left' } }, h)),
            ),
          ),
          React.createElement('tbody', null,
            ...list.flatMap((e, idx) => {
              const isOpen = expanded === e.lot.id
              const mainTr = React.createElement('tr', {
                key:e.lot.id,
                style:{ cursor:'pointer', background: isOpen ? '#EFF6FF' : (idx % 2 ? '#FAFCFB' : '#fff') },
                onClick: () => setExpanded(isOpen ? null : e.lot.id),
              },
                React.createElement('td', { style:{ ...td, fontWeight:700 } },
                  React.createElement('span', { style:{ color:'#9CA3AF', marginRight:6, fontSize:11 } }, isOpen ? '▼' : '▶'),
                  e.lot.row_range || '—'),
                React.createElement('td', { style:td }, e.lot.variety || '（品種未入力）'),
                React.createElement('td', { style:td }, fmtDate(e.lot.seed_date)),
                React.createElement('td', { style:td }, fmtDate(e.lot.transplant_date)),
                React.createElement('td', { style:td }, e.lot.seedling_period_days != null ? e.lot.seedling_period_days + '日' : '—'),
                React.createElement('td', { style:td }, statusChip(e.lot.status)),
                React.createElement('td', { style:{ ...td, textAlign:'right' } }, e.sprays.length ? e.sprays.length + '回' : '—'),
                React.createElement('td', { style:{ ...td, textAlign:'right' } }, e.ferts.length ? e.ferts.length + '回' : '—'),
                React.createElement('td', { style:{ ...td, textAlign:'right', fontWeight:700, color: e.totalCases ? '#0A6B52' : '#9CA3AF' } }, e.totalCases ? e.totalCases.toLocaleString() : '—'),
                React.createElement('td', { style:{ ...td, textAlign:'right' } },
                  e.totalCost > 0
                    ? React.createElement('div', null,
                        React.createElement('div', { style:{ fontWeight:700, color:'#B45309' } }, '¥' + Math.round(e.totalCost).toLocaleString() + (e.unknownPrice ? '＋' : '')),
                        e.costPerCase != null ? React.createElement('div', { style:{ fontSize:11, color:'#9CA3AF' } }, '¥' + Math.round(e.costPerCase).toLocaleString() + '/ケース') : null,
                      )
                    : (e.hasMaterial ? React.createElement('span', { style:{ color:'#B45309', fontSize:11 } }, '単価未確定') : '—')),
                React.createElement('td', { style:td }, fmtDate(e.lastHarvest)),
              )
              return isOpen ? [mainTr, detailRow(e)] : [mainTr]
            }),
          ),
        ),
      ),
    )
  }

  // ── 圃場タイルのグリッド（落ち着いた配色。タップでその圃場の明細をモーダル表示） ──
  const statusText = (st) => {
    const parts = []
    if (st.cnt.growing)   parts.push('栽培中' + st.cnt.growing)
    if (st.cnt.ready)     parts.push('収穫待ち' + st.cnt.ready)
    if (st.cnt.harvested) parts.push('収穫済' + st.cnt.harvested)
    return parts.join(' ・ ') || '—'
  }
  const fieldGrid = React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(230px, 1fr))', gap:12 } },
    ...groupIds.map(fid => {
      const f = masterById(fields, fid)
      const st = groupStat(fid)
      const sel = selectedFid === fid
      return React.createElement('button', {
        key:fid,
        onClick: () => setSelectedFid(fid),
        style:{ textAlign:'left', cursor:'pointer', background:'#fff', border:'1px solid '+(sel?'#0A6B52':'#E5E7EB'), boxShadow:'0 1px 2px rgba(0,0,0,.04)', borderRadius:12, padding:'14px 16px', display:'flex', flexDirection:'column', gap:9, transition:'border-color .12s' },
      },
        React.createElement('div', { style:{ display:'flex', alignItems:'baseline', gap:8 } },
          React.createElement('span', { style:{ fontSize:14, fontWeight:700, color:'#111827' } }, f ? f.name : '—'),
          f && f.crop ? React.createElement('span', { style:{ marginLeft:'auto', fontSize:11, color:'#94A3B8', fontWeight:600 } }, f.crop) : null,
        ),
        React.createElement('div', { style:{ display:'flex', alignItems:'baseline', gap:6 } },
          React.createElement('span', { style:{ fontSize:22, fontWeight:800, color:'#0F766E', lineHeight:1 } }, st.cases.toLocaleString()),
          React.createElement('span', { style:{ fontSize:11, color:'#94A3B8' } }, 'ケース収穫'),
          st.cost > 0 ? React.createElement('span', { style:{ marginLeft:'auto', fontSize:12, color:'#94A3B8', fontWeight:600 } }, '¥' + Math.round(st.cost).toLocaleString()) : null,
        ),
        React.createElement('div', { style:{ display:'flex', gap:8, alignItems:'center', fontSize:11, color:'#9CA3AF' } },
          React.createElement('span', null, st.list.length + 'ロット'),
          React.createElement('span', { style:{ color:'#CBD5E1' } }, '｜'),
          React.createElement('span', null, statusText(st)),
        ),
        React.createElement('div', { style:{ fontSize:11, fontWeight:700, color:'#0F766E' } }, '明細を見る →'),
      )
    })
  )

  const noteStyle = { fontSize:12, color:'#B45309', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, padding:'10px 14px', marginTop:8 }
  const notes = []
  if (unmatched > 0) notes.push(React.createElement('div', { key:'unmatched', style:noteStyle },
    `⚠️ 畝範囲が未指定の作業記録が ${unmatched} 件あります。これらはロットに自動紐付けできないため、この一覧には集計されていません。記録時に畝範囲を入力すると反映されます。`))
  if (anyUnknownPrice) notes.push(React.createElement('div', { key:'price', style:noteStyle },
    '⚠️ 資材原価は「使用量×単価」の参考値です。農薬は購入実績（円/L）、肥料はマスタ単価（円/kg）を使用し、単価未確定の品目はコストに含めていません（金額末尾の「＋」は未確定品目を含むロット）。'))
  const footNote = notes.length ? React.createElement('div', null, ...notes) : null

  const validSelected = selectedFid != null && groupIds.includes(selectedFid)
  return React.createElement('div', { style:wrap },
    headerEl,
    filterBar,
    summaryRow,
    costApproxBanner(fertilizers),
    visible.length === 0
      ? React.createElement('div', { style:{ ...card, textAlign:'center', color:'#9CA3AF', fontSize:13, padding:'32px' } }, '該当するロットがありません（フィルタ条件を変更してください）')
      : fieldGrid,
    footNote,
    // タップした圃場の明細はモーダルで（下に出て気づかない問題を解消）
    validSelected ? React.createElement('div', {
      style:{ position:'fixed', inset:0, background:'rgba(17,24,39,.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' },
      onClick: () => setSelectedFid(null),
    }, renderFieldTable(selectedFid)) : null,
  )
}

// =====================================================
// 【収穫予測 / 積算温度】HarvestForecastPage
// aKnow（エイノウ）の収穫予測に相当。月別平均気温（1回だけ設定・永続化）と、
// 作物カテゴリの基準温度・必要積算温度（同じく1回設定）だけで、栽培中の各ロットの
// 予測収穫日を computeHarvestForecast で自動算出する。ロットごとの追加入力は不要。
// 簡易版（月別平均気温は手入力）→ 将来は気象庁アメダス実測へ差し替え予定。
// =====================================================
function HarvestForecastPage({ fields, farmLots, harvestRecords, cropCategories, monthlyTemps, onSaveMonthlyTemps }) {
  farmLots = farmLots || {}
  const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
  const [temps, setTemps] = React.useState(() => (Array.isArray(monthlyTemps) && monthlyTemps.length === 12) ? monthlyTemps.map(String) : (INITIAL_MONTHLY_TEMPS.map(String)))
  const [tempOpen, setTempOpen] = React.useState(false)
  const [saved, setSaved] = React.useState(false)

  const fieldLabel = (f) => f ? (f.name + (f.field_no ? `（${f.field_no}）` : '')) : '（不明な圃場）'
  const fmtDate = (d) => {
    if (!d) return '—'
    const x = (d instanceof Date) ? d : new Date(d)
    if (isNaN(x)) return '—'
    return `${x.getFullYear()}/${String(x.getMonth()+1).padStart(2,'0')}/${String(x.getDate()).padStart(2,'0')}`
  }
  const numericTemps = temps.map(t => Number(t))

  // カテゴリ逆引き（field.crop → category）— cropCategoriesは_CROP_CATEGORIESに同期済み
  const catOf = (crop) => getCropCategoryObj(getCropCategory(crop))

  // 栽培中（収穫前）ロットを集約して予測
  const rows = []
  ;(fields || []).forEach(f => {
    ;(farmLots[f.id] || []).forEach(lot => {
      if (lot.status === 'harvested' || lot.status === 'fallow') return
      const start = lot.transplant_date || lot.seed_date || null
      const cat = catOf(f.crop)
      const fc = computeHarvestForecast(start, numericTemps, cat ? cat.base_temp_c : null, cat ? cat.required_gdd : null)
      rows.push({ field:f, lot, start, cat, fc })
    })
  })
  // 予測日が近い順（予測不可は末尾）
  rows.sort((a, b) => {
    const ad = a.fc && a.fc.predictedDate ? a.fc.predictedDate.getTime() : Infinity
    const bd = b.fc && b.fc.predictedDate ? b.fc.predictedDate.getTime() : Infinity
    return ad - bd
  })

  const saveTemps = () => {
    const arr = temps.map(t => { const n = Number(t); return isNaN(n) ? 0 : n })
    onSaveMonthlyTemps(arr)
    setSaved(true); setTimeout(() => setSaved(false), 1600)
  }

  // ── スタイル ──
  const wrap = { padding:'24px 32px 48px', maxWidth:'none', margin:'0' }
  const card = { background:'#fff', border:'1px solid #E5E7EB', borderRadius:12, padding:'16px 18px' }
  const th = { padding:'10px 12px', fontSize:12, fontWeight:700, color:'#6B7280', textAlign:'left', whiteSpace:'nowrap', borderBottom:'2px solid #E5E7EB' }
  const td = { padding:'10px 12px', fontSize:13, color:'#111827', borderBottom:'1px solid #F1F5F9', verticalAlign:'middle' }

  const headerEl = React.createElement('div', { style:{ marginBottom:20 } },
    React.createElement('div', { style:{ fontSize:12, fontWeight:700, color:'#0A6B52', letterSpacing:'.04em' } }, '積算温度モデル'),
    React.createElement('h1', { style:{ fontSize:22, fontWeight:800, color:'#111827', margin:'2px 0 4px' } }, '収穫予測'),
    React.createElement('p', { style:{ fontSize:13, color:'#6B7280', margin:0 } },
      '月別平均気温と作物ごとの基準温度・必要積算温度から、栽培中ロットの収穫予測日を自動算出します。'),
  )

  // ── 月別平均気温エディタ（1回設定すれば永続化） ──
  const tempEditor = React.createElement('div', { style:{ ...card, marginBottom:18 } },
    React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }, onClick:() => setTempOpen(o => !o) },
      React.createElement('span', { style:{ fontSize:14, fontWeight:700, color:'#111827' } }, '🌡 月別平均気温（平年値）'),
      React.createElement('span', { style:{ fontSize:12, color:'#6B7280' } }, '一度設定すると保存され、以降の予測に使われます'),
      React.createElement('span', { style:{ marginLeft:'auto', color:'#9CA3AF', fontSize:12 } }, tempOpen ? '閉じる ▲' : '編集する ▼'),
    ),
    tempOpen ? React.createElement('div', { style:{ marginTop:14 } },
      React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:10 } },
        ...MONTHS.map((m, i) => React.createElement('label', { key:i, style:{ display:'block' } },
          React.createElement('span', { style:{ fontSize:11, color:'#6B7280', display:'block', marginBottom:3 } }, m),
          React.createElement('input', {
            type:'number', step:'0.1', value:temps[i],
            onChange:e => setTemps(prev => prev.map((v, j) => j === i ? e.target.value : v)),
            style:{ width:'100%', padding:'7px 8px', border:'1px solid #D1D5DB', borderRadius:6, fontSize:13, boxSizing:'border-box', textAlign:'right' },
          }),
        )),
      ),
      React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:12, marginTop:14 } },
        React.createElement('button', {
          onClick:saveTemps,
          style:{ padding:'8px 16px', background:'#0A6B52', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' },
        }, '気温を保存'),
        saved ? React.createElement('span', { style:{ fontSize:12, color:'#0A6B52', fontWeight:700 } }, '✓ 保存しました') : null,
        React.createElement('span', { style:{ fontSize:11, color:'#9CA3AF' } }, '※ 単位は℃。将来的に気象庁アメダスの実測値へ自動連携予定'),
      ),
    ) : null,
  )

  // ── 予測テーブル ──
  const progressBar = (pct, color) => React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:10, minWidth:220 } },
    React.createElement('div', { style:{ flex:1, height:12, background:'#EEF2F0', borderRadius:6, overflow:'hidden' } },
      React.createElement('div', { style:{ height:'100%', width:pct + '%', background:color, borderRadius:6, transition:'width .4s ease' } })),
    React.createElement('span', { style:{ fontSize:12, fontWeight:700, color:'#6B7280', width:40, textAlign:'right' } }, pct + '%'),
  )

  let body
  if (rows.length === 0) {
    body = React.createElement('div', { style:{ ...card, textAlign:'center', padding:'56px 24px' } },
      React.createElement('i', { className:'ti ti-temperature', 'aria-hidden':'true', style:{ fontSize:44, color:'#0D9972', marginBottom:12, display:'block' } }),
      React.createElement('div', { style:{ fontSize:15, fontWeight:700, color:'#374151', marginBottom:6 } }, '栽培中のロットがありません'),
      React.createElement('div', { style:{ fontSize:13, color:'#6B7280', lineHeight:1.7, maxWidth:520, margin:'0 auto' } },
        '定植日報を入力するとロットが自動生成され、収穫前（栽培中・収穫待ち）のロットがここに予測付きで並びます。'),
    )
  } else {
    body = React.createElement('div', { style:{ ...card, padding:0, overflow:'hidden' } },
      React.createElement('div', { style:{ overflowX:'auto' } },
        React.createElement('table', { style:{ width:'100%', borderCollapse:'collapse', minWidth:940 } },
          React.createElement('thead', null,
            React.createElement('tr', null,
              ['圃場','品種','起算日','作物カテゴリ','基準/必要','積算温度','進捗','予測収穫日','残り'].map((h, i) =>
                React.createElement('th', { key:i, style:th }, h)),
            ),
          ),
          React.createElement('tbody', null,
            ...rows.map(r => {
              const fc = r.fc
              const noThreshold = !fc
              const predicted = fc && fc.predictedDate
              const color = !predicted ? '#9CA3AF' : (fc.daysToHarvest != null && fc.daysToHarvest <= 7 ? '#B45309' : '#0A6B52')
              return React.createElement('tr', { key:r.lot.id },
                React.createElement('td', { style:td }, fieldLabel(r.field)),
                React.createElement('td', { style:{ ...td, fontWeight:600 } }, r.lot.variety || '（品種未入力）'),
                React.createElement('td', { style:td }, fmtDate(r.start)),
                React.createElement('td', { style:td }, r.cat ? r.cat.name : '—'),
                React.createElement('td', { style:td }, (r.cat && r.cat.base_temp_c != null && r.cat.required_gdd != null) ? `${r.cat.base_temp_c}℃ / ${r.cat.required_gdd}` : React.createElement('span', { style:{ color:'#B45309', fontSize:12 } }, '未設定')),
                React.createElement('td', { style:td }, noThreshold ? '—' : `${fc.currentGdd} / ${fc.requiredGdd}`),
                React.createElement('td', { style:td }, noThreshold ? '—' : progressBar(fc.progressPct, color)),
                React.createElement('td', { style:{ ...td, fontWeight:700, color } },
                  noThreshold
                    ? React.createElement('span', { style:{ color:'#B45309', fontSize:12, fontWeight:600 } }, 'しきい値未設定')
                    : (predicted ? fmtDate(fc.predictedDate) : React.createElement('span', { style:{ color:'#9CA3AF', fontSize:12 } }, '気温不足で未到達'))),
                React.createElement('td', { style:td },
                  (fc && fc.daysToHarvest != null)
                    ? (fc.daysToHarvest <= 0 ? React.createElement('span', { style:{ color:'#B45309', fontWeight:700 } }, '収穫適期') : `あと${fc.daysToHarvest}日`)
                    : '—'),
              )
            }),
          ),
        ),
      ),
    )
  }

  const anyNoThreshold = rows.some(r => !r.fc)
  const note = anyNoThreshold
    ? React.createElement('div', { style:{ fontSize:12, color:'#B45309', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, padding:'10px 14px', marginTop:12 } },
        '⚠️ 「しきい値未設定」の作物は、作物カテゴリ管理で基準温度・必要積算温度を入力すると予測されます（一度設定すれば以降は自動）。')
    : null

  return React.createElement('div', { style:wrap }, headerEl, tempEditor, body, note)
}

// =====================================================
// =====================================================
// 【実装手順書 3.2.1】圃場実績・評価機能の強化
// harvestRecordsから圃場別・シーズン別の合計ケース数を自動集計し、
// 圃場面積(area_are)から反収(10aあたりケース数)を算出。
// fieldPerformance(静的データ)を前シーズン参照として前年比を計算。
// =====================================================
function FieldPerformancePage({ fields, harvestRecords, fieldPerformance, performanceComments, onAddComment, cropComments, onAddCropComment, lotSprayRecords, topDressingRecords, pesticides, pesticidePurchases, fertilizers, cropCycles }) {
  // ── Step1: harvestRecordsからシーズン導出 ──
  // 月 >= 9 (秋〜冬) → `${year}-${year+1}`, 月 < 9 → `${year-1}-${year}`
  function deriveSeason(dateStr) {
    const d = new Date(dateStr)
    const y = d.getFullYear(), m = d.getMonth() + 1
    return m >= 9 ? `${y}-${y+1}` : `${y-1}-${y}`
  }

  // ── Step1: 収穫記録を圃場別・シーズン別に集計 ──
  const computedBySeason = {}
  ;(harvestRecords || []).forEach(rec => {
    if (!rec.date) return
    const season = deriveSeason(rec.date)
    if (!computedBySeason[season]) computedBySeason[season] = {}
    const fid = rec.field_id
    if (!computedBySeason[season][fid]) {
      computedBySeason[season][fid] = { field_id: fid, total_cases: 0, varieties: new Set() }
    }
    computedBySeason[season][fid].total_cases += (rec.total_cases || 0)
    if (rec.variety) computedBySeason[season][fid].varieties.add(rec.variety)
  })

  // 全シーズン一覧: 収穫記録 + 静的データのシーズンを統合
  const computedSeasons  = Object.keys(computedBySeason)
  const perfSeasons      = [...new Set((fieldPerformance || []).map(p => p.season))]
  const allSeasons       = [...new Set([...computedSeasons, ...perfSeasons])].sort().reverse()

  const [season, setSeason]           = React.useState(allSeasons[0] || '')
  const [showCommentForm, setShowCommentForm] = React.useState(false)
  const [commentText, setCommentText] = React.useState('')
  const [perfTab, setPerfTab]         = React.useState('summary') // 'summary' | 'cost'
  // ── 圃場別実績テーブル: 絞り込み・ソート ──
  const [varietyFilter, setVarietyFilter] = React.useState('all')
  const [sortKey, setSortKey]             = React.useState('fid')   // 'fid' | 'name' | 'area' | 'cases_per_are' | 'total_cases' | 'prev_cases' | 'yoy_pct'
  const [sortDir, setSortDir]             = React.useState('asc')   // 'asc' | 'desc'
  // ── 作物別サマリー: メモ入力用 ──
  const [cropCommentText, setCropCommentText]     = React.useState('')
  const [cropCommentTarget, setCropCommentTarget] = React.useState('')
  const [showCropCommentForm, setShowCropCommentForm] = React.useState(false)

  // 前シーズン算出（前年比用）: "2024-2025" → "2023-2024"
  const prevSeason = (() => {
    if (!season) return null
    const [y1, y2] = season.split('-').map(Number)
    return isNaN(y1) || isNaN(y2) ? null : `${y1-1}-${y2-1}`
  })()

  // 前シーズンの静的パフォーマンスデータ（前年比の基準）
  const prevPerfByField = {}
  ;(fieldPerformance || []).filter(p => p.season === prevSeason).forEach(p => {
    prevPerfByField[p.field_id] = p
  })

  // 選択シーズンの静的データ（収穫記録が無い圃場の補完 / 昨年参照値）
  const staticPerfByField = {}
  ;(fieldPerformance || []).filter(p => p.season === season).forEach(p => {
    staticPerfByField[p.field_id] = p
  })

  // ── Step2: 表示行を構築（集計 → 反収算出） ──
  // 収穫記録がある圃場 + 静的データにしかない圃場を統合
  const fieldIds = new Set([
    ...Object.keys(computedBySeason[season] || {}).map(Number),
    ...Object.keys(staticPerfByField).map(Number),
  ])

  const rows = [...fieldIds].map(fid => {
    const field   = masterById(fields, fid)
    const comp    = (computedBySeason[season] || {})[fid]
    const stat    = staticPerfByField[fid]
    const prev    = prevPerfByField[fid]

    // ── Step1 合計ケース数: 収穫記録優先、なければ静的データ ──
    // ?? 0 で undefined（とうもろこし等ケース数管理外の作物）を 0 に正規化する
    const total_cases    = comp ? (comp.total_cases ?? 0) : (stat ? (stat.total_cases ?? 0) : 0)
    // ── Step2 反収算出: 圃場面積で割る（1a = 1アール = 0.1反 → 10aあたり） ──
    const area_are       = field ? field.area_are : (stat ? stat.area_are : null)
    // 反収 = total_cases / (area_are / 10) = total_cases * 10 / area_are
    const cases_per_are  = (area_are && area_are > 0)
      ? Math.round(total_cases * 10 / area_are * 10) / 10
      : null
    const varieties      = comp
      ? [...comp.varieties]
      : (stat ? stat.varieties || [] : [])
    // ── Step3 前年比: 前シーズンの静的データ or 現シーズン静的データのprev_season_cases ──
    const prev_cases     = prev
      ? prev.total_cases
      : (stat ? stat.prev_season_cases : null)
    const yoy_pct        = (prev_cases && prev_cases > 0)
      ? Math.round((total_cases - prev_cases) / prev_cases * 100)
      : null
    const is_computed    = !!comp          // 収穫記録から算出された実値
    const is_estimated   = !comp && !!(stat && stat.is_estimated)  // 静的サンプル値

    // 【とうもろこし両方表示対応】本数・重量(kg)は収穫記録(harvestRecords)に未対応のため
    // 静的データ(fieldPerformance)のみから取得。無い場合(レタス等)はnullのまま「—」表示。
    const total_stems       = stat ? (stat.total_stems ?? null) : null
    const total_weight_kg   = stat ? (stat.total_weight_kg ?? null) : null
    const stems_per_are     = (total_stems != null && area_are && area_are > 0)
      ? Math.round(total_stems * 10 / area_are * 10) / 10
      : (stat ? (stat.stems_per_are ?? null) : null)
    const weight_per_are_kg = (total_weight_kg != null && area_are && area_are > 0)
      ? Math.round(total_weight_kg * 10 / area_are * 10) / 10
      : (stat ? (stat.weight_per_are_kg ?? null) : null)
    const prev_stems        = prev ? (prev.total_stems ?? null) : (stat ? (stat.prev_season_stems ?? null) : null)
    const prev_weight_kg    = prev ? (prev.total_weight_kg ?? null) : (stat ? (stat.prev_season_weight_kg ?? null) : null)
    const stems_yoy_pct     = (prev_stems && prev_stems > 0 && total_stems != null)
      ? Math.round((total_stems - prev_stems) / prev_stems * 100) : null
    const weight_yoy_pct    = (prev_weight_kg && prev_weight_kg > 0 && total_weight_kg != null)
      ? Math.round((total_weight_kg - prev_weight_kg) / prev_weight_kg * 100) : null

    return { fid, field, total_cases, area_are, cases_per_are, varieties, prev_cases, yoy_pct, is_computed, is_estimated,
      total_stems, total_weight_kg, stems_per_are, weight_per_are_kg, prev_stems, prev_weight_kg, stems_yoy_pct, weight_yoy_pct }
  }).sort((a, b) => a.fid - b.fid)

  // ── 品種フィルタ選択肢: rowsに実在する品種から動的生成（ハードコードしない） ──
  const availableVarieties = [...new Set(rows.flatMap(r => r.varieties))].sort()

  // ── 絞り込み: 選択中の品種を含む圃場のみ表示（'all'は全件） ──
  const filteredRows = varietyFilter === 'all'
    ? rows
    : rows.filter(r => r.varieties.includes(varietyFilter))

  // ── ソート: 圃場名/面積/反収/合計ケース数/前年実績/前年比のいずれかで並び替え ──
  const sortAccessor = {
    fid:           r => r.fid,
    name:          r => r.field ? r.field.name : '',
    area:          r => r.area_are,
    cases_per_are: r => r.cases_per_are,
    total_cases:   r => r.total_cases,
    prev_cases:    r => r.prev_cases,
    yoy_pct:       r => r.yoy_pct,
  }
  const sortedRows = [...filteredRows].sort((a, b) => {
    const get = sortAccessor[sortKey] || sortAccessor.fid
    let va = get(a), vb = get(b)
    // null/undefinedは常に末尾（昇順・降順どちらでも下に固定）
    const aNull = va == null, bNull = vb == null
    if (aNull && bNull) return 0
    if (aNull) return 1
    if (bNull) return -1
    if (typeof va === 'string') {
      return sortDir === 'asc' ? va.localeCompare(vb, 'ja') : vb.localeCompare(va, 'ja')
    }
    return sortDir === 'asc' ? va - vb : vb - va
  })

  const SORT_COLUMNS = [
    { key:'name',          label:'圃場名' },
    { key:'area',          label:'面積' },
    { key:'cases_per_are', label:'反収(10aあたり)' },
    { key:'total_cases',   label:'合計ケース数' },
    { key:'prev_cases',    label:'前年実績' },
    { key:'yoy_pct',       label:'前年比' },
  ]
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  // ── テーブル内「合計/平均」行用: 絞り込み中の表示行のみで再集計 ──
  const filteredTotalCases = filteredRows.reduce((s, r) => s + r.total_cases, 0)
  const filteredPrevTotal  = filteredRows.reduce((s, r) => s + (r.prev_cases || 0), 0)
  const filteredAvgPerAre  = filteredRows.length
    ? Math.round(filteredRows.reduce((s, r) => s + (r.cases_per_are || 0), 0) / filteredRows.length * 10) / 10
    : 0
  const filteredYoyPct     = filteredPrevTotal > 0
    ? Math.round((filteredTotalCases - filteredPrevTotal) / filteredPrevTotal * 100)
    : null
  // 【とうもろこし両方表示対応】本数・重量(kg)の合計（値がある行のみ集計）
  const filteredTotalStems   = filteredRows.reduce((s, r) => s + (r.total_stems || 0), 0)
  const filteredTotalWeight  = filteredRows.reduce((s, r) => s + (r.total_weight_kg || 0), 0)
  const hasStemsOrWeight     = filteredRows.some(r => r.total_stems != null || r.total_weight_kg != null)

  // ── 転作対応: そのシーズンに実際に栽培されていた作物をcropCyclesから引く ──
  // season "2024-2025" のとき、年2024 or 2025 のcropCycleが対象。
  // 見つからなければ圃場マスタのcrop（現在の作物）にフォールバック。
  const getCropForSeason = (fieldId, seasonStr) => {
    if (!cropCycles || !cropCycles.length || !seasonStr) return null
    const parts = seasonStr.split('-').map(Number)
    if (parts.length < 2 || isNaN(parts[0])) return null
    const [y1, y2] = parts
    const matches = cropCycles.filter(c => String(c.field_id) === String(fieldId) && (c.year === y1 || c.year === y2))
    if (!matches.length) return null
    return matches.reduce((a, b) => b.id > a.id ? b : a).crop || null
  }

  // ── 作物別サマリー: そのシーズンの作物でグループ化（転作圃場も正しく集計される） ──
  // 品種（varieties: オーウェン・アイゴ等）とは別の粒度。作物=栽培品目そのもの。
  const cropGroups = {}
  rows.forEach(r => {
    const cropName = getCropForSeason(r.fid, season) || (r.field && r.field.crop) || '未分類'
    if (!cropGroups[cropName]) {
      cropGroups[cropName] = { crop: cropName, fieldCount: 0, total_cases: 0, prev_cases: 0, hasPrev: false, perAreSum: 0, perAreCount: 0 }
    }
    const g = cropGroups[cropName]
    g.fieldCount += 1
    g.total_cases += r.total_cases
    if (r.prev_cases != null) { g.prev_cases += r.prev_cases; g.hasPrev = true }
    if (r.cases_per_are != null) { g.perAreSum += r.cases_per_are; g.perAreCount += 1 }
  })
  const cropSummaryRows = Object.values(cropGroups).map(g => ({
    crop: g.crop,
    fieldCount: g.fieldCount,
    total_cases: g.total_cases,
    avg_cases_per_are: g.perAreCount > 0 ? Math.round(g.perAreSum / g.perAreCount * 10) / 10 : null,
    prev_cases: g.hasPrev ? g.prev_cases : null,
    yoy_pct: (g.hasPrev && g.prev_cases > 0) ? Math.round((g.total_cases - g.prev_cases) / g.prev_cases * 100) : null,
  })).sort((a, b) => b.total_cases - a.total_cases)

  // ── 作物別メモ（評価コメントと同様の仕組み。数値は自動集計のみ・メモは自由記述） ──
  const seasonCropComments = (cropComments || []).filter(c => c.season === season)
  const handleAddCropComment = () => {
    if (!cropCommentText.trim() || !cropCommentTarget) return
    if (onAddCropComment) onAddCropComment({ season, crop: cropCommentTarget, comment: cropCommentText.trim() })
    setCropCommentText('')
    setShowCropCommentForm(false)
  }

  // ── 資材コスト集計（使用量→コストの単純集計。最適化判定はしない・参考値） ──
  // 農薬: 単価が無いためpesticidePurchasesから平均単価(円/L)を算出する
  const pesticideAvgPrice = {}
  ;(pesticidePurchases || []).forEach(pu => {
    const k = canonicalMasterId(pesticides, pu.pesticide_id) // 旧数値ID仕入もUUIDマスタに集約
    if (!pesticideAvgPrice[k]) pesticideAvgPrice[k] = { amount:0, price:0 }
    pesticideAvgPrice[k].amount += Number(pu.amount_L) || 0
    pesticideAvgPrice[k].price  += Number(pu.price_yen) || 0
  })
  const priceOfPesticide = (id) => {
    const a = pesticideAvgPrice[canonicalMasterId(pesticides, id)]
    return (a && a.amount > 0) ? a.price / a.amount : null
  }
  // 肥料: マスタの unit_price_yen_per_kg をそのまま使用（null=価格未確定）
  const priceOfFertilizer = (id) => {
    const f = masterById(fertilizers, id)
    return (f && f.unit_price_yen_per_kg != null) ? f.unit_price_yen_per_kg : null
  }

  const costByField = {}
  ;[...fieldIds].forEach(fid => { costByField[fid] = { pesticideCost:0, fertilizerCost:0, hasUnknownPrice:false, hasRecord:false } })

  ;(lotSprayRecords || []).forEach(rec => {
    if (!costByField[rec.field_id]) return
    if ((rec.pesticides || []).length > 0) costByField[rec.field_id].hasRecord = true
    ;(rec.pesticides || []).forEach(pe => {
      const amount = Number(pe.disposal_amount) || 0
      const price  = priceOfPesticide(pe.pesticide_id)
      if (price == null) { costByField[rec.field_id].hasUnknownPrice = true; return }
      costByField[rec.field_id].pesticideCost += amount * price
    })
  })
  ;(topDressingRecords || []).forEach(rec => {
    if (!costByField[rec.field_id]) return
    if ((rec.fertilizers || []).length > 0) costByField[rec.field_id].hasRecord = true
    ;(rec.fertilizers || []).forEach(fe => {
      const amount = Number(fe.amount_kg) || 0
      const price  = priceOfFertilizer(fe.fertilizer_id)
      if (price == null) { costByField[rec.field_id].hasUnknownPrice = true; return }
      costByField[rec.field_id].fertilizerCost += amount * price
    })
  })

  const costRows = rows.map(r => {
    const c = costByField[r.fid] || { pesticideCost:0, fertilizerCost:0, hasUnknownPrice:false, hasRecord:false }
    const totalCost   = c.pesticideCost + c.fertilizerCost
    const costPerCase = (c.hasRecord && r.total_cases > 0) ? totalCost / r.total_cases : null
    return { ...r, pesticideCost:c.pesticideCost, fertilizerCost:c.fertilizerCost, totalCost, costPerCase, hasUnknownPrice:c.hasUnknownPrice, hasRecord:c.hasRecord }
  })
  const hasAnyCostData    = costRows.some(r => r.hasRecord)
  const hasAnyUnknownCost = costRows.some(r => r.hasUnknownPrice)
  const maxCostPerCase    = Math.max(1, ...costRows.map(r => r.costPerCase || 0))



  const totalCases  = rows.reduce((s, r) => s + r.total_cases, 0)
  const prevTotal   = rows.reduce((s, r) => s + (r.prev_cases || 0), 0)
  const avgPerAre   = rows.length
    ? Math.round(rows.reduce((s, r) => s + (r.cases_per_are || 0), 0) / rows.length * 10) / 10
    : 0
  const yoyPct      = prevTotal > 0
    ? Math.round((totalCases - prevTotal) / prevTotal * 100)
    : null
  const hasEstimated  = rows.some(r => r.is_estimated)
  const hasComputed   = rows.some(r => r.is_computed)

  // 評価コメント（選択シーズンのみ）
  const seasonComments = (performanceComments || []).filter(c => c.season === season)

  const handleAddComment = () => {
    if (!commentText.trim()) return
    if (onAddComment) onAddComment({ season, comment: commentText.trim() })
    setCommentText('')
    setShowCommentForm(false)
  }

  return React.createElement('div', { className:'page' },

    // ── ヘッダー ──
    React.createElement('div', { style:{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'16px', flexWrap:'wrap', gap:'12px' } },
      React.createElement('div', null,
        React.createElement('div', { className:'eyebrow' }, 'FIELD PERFORMANCE'),
        React.createElement('div', { className:'page-title' }, '圃場実績・評価'),
        React.createElement('div', { className:'page-sub', style:{ marginBottom:0 } },
          '収穫記録から自動集計した圃場別KPIと前年比を横断で確認できます'
        )
      ),
      React.createElement('div', { style:{ display:'flex', gap:'8px', alignItems:'center' } },
        allSeasons.length > 0 && React.createElement('select', {
          value: season,
          onChange: e => setSeason(e.target.value),
          className:'form-select',
          style:{ width:'auto', minWidth:'150px' }
        },
          ...allSeasons.map(s => React.createElement('option', { key:s, value:s }, s+'年度'))
        )
      )
    ),

    rows.length === 0
      ? React.createElement('div', { style:{
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          padding:'56px 24px', gap:14, textAlign:'center',
          background:'#fff', borderRadius:12, border:'1.5px dashed #C6DDD0'
        } },
          React.createElement('div', { style:{ width:64, height:64, borderRadius:'50%', background:'#F0F8F4', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:4 } },
            React.createElement('i', { className:'ti ti-chart-area', style:{ fontSize:28, color:'#0A6B52' } })
          ),
          React.createElement('div', { style:{ fontSize:16, fontWeight:700, color:'#111827' } }, '収穫記録がまだありません'),
          React.createElement('div', { style:{ fontSize:13, color:'#6B7280', maxWidth:380, lineHeight:1.7 } },
            '圃場詳細の「収穫」タブから収穫記録を入力すると、',
            React.createElement('br', null),
            '反収・前年比などのKPIがここに自動集計されます。'
          ),
          React.createElement('div', { style:{ display:'flex', gap:8 } },
            React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#6B7280', background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:8, padding:'10px 16px' } },
              React.createElement('i', { className:'ti ti-map-pin', style:{ fontSize:15, color:'#0A6B52' } }),
              '①圃場一覧から圃場を選ぶ'
            ),
            React.createElement('i', { className:'ti ti-arrow-right', style:{ fontSize:14, color:'#CBD5E1' } }),
            React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#6B7280', background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:8, padding:'10px 16px' } },
              React.createElement('i', { className:'ti ti-basket', style:{ fontSize:15, color:'#0A6B52' } }),
              '②「収穫」タブで記録する'
            ),
            React.createElement('i', { className:'ti ti-arrow-right', style:{ fontSize:14, color:'#CBD5E1' } }),
            React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#6B7280', background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:8, padding:'10px 16px' } },
              React.createElement('i', { className:'ti ti-chart-area', style:{ fontSize:15, color:'#0A6B52' } }),
              '③ここに自動反映'
            )
          )
        )
      : React.createElement('div', null,

          // ── 自動集計バナー ──
          hasComputed && React.createElement('div', {
            style:{ background:'#ECFDF5', border:'1px solid #6EE7B7', borderRadius:'8px', padding:'10px 14px', marginBottom:'16px', fontSize:'12px', color:'#065F46', display:'flex', alignItems:'center', gap:'8px' }
          },
            React.createElement('i', { className:'ti ti-refresh', style:{ fontSize:'14px', flexShrink:0 } }),
            '収穫記録から自動集計しています。圃場詳細の収穫タブに記録を追加すると、このページのKPIがリアルタイムで更新されます。'
          ),

          // ── サンプル値の注記 ──
          hasEstimated && React.createElement('div', {
            style:{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:'8px', padding:'10px 14px', marginBottom:'16px', fontSize:'12px', color:'#78350F', display:'flex', alignItems:'center', gap:'8px' }
          },
            React.createElement('i', { className:'ti ti-alert-triangle', style:{ fontSize:'14px', flexShrink:0 } }),
            '「参照値」の付いた圃場は収穫記録がなく静的マスタの仮値です。圃場詳細に収穫記録を入力すると自動集計値に切り替わります。'
          ),

          // ── Step4: サマリーKPIカード ──
          React.createElement('div', { className:'stat-grid' },
            React.createElement('div', { className:'stat-card' },
              React.createElement('div', { className:'stat-l' }, '集計対象圃場'),
              React.createElement('div', { className:'stat-n' }, rows.length+'圃場')
            ),
            React.createElement('div', { className:'stat-card green' },
              React.createElement('div', { className:'stat-l' }, '合計ケース数（自動集計）'),
              React.createElement('div', { className:'stat-n' }, totalCases.toLocaleString())
            ),
            React.createElement('div', { className:'stat-card blue' },
              React.createElement('div', { className:'stat-l' }, '平均反収（10aあたり）'),
              React.createElement('div', { className:'stat-n' }, avgPerAre.toLocaleString()+'ケース')
            ),
            React.createElement('div', { className:'stat-card '+(yoyPct == null ? '' : yoyPct >= 0 ? 'green' : 'red') },
              React.createElement('div', { className:'stat-l' }, '前年比（合計）'),
              React.createElement('div', { className:'stat-n' }, yoyPct == null ? '—' : (yoyPct >= 0 ? '+' : '')+yoyPct+'%')
            )
          ),

          // ── 作物別サマリー（圃場マスタのcropでグループ化。品種より一段上の粒度） ──
          cropSummaryRows.length > 0 && React.createElement('div', { className:'card card-data', style:{ marginBottom:'16px' } },
            React.createElement(SectionTitle, { icon:'leaf' }, season+'年度　作物別サマリー'),
            React.createElement('div', {
              style:{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:'12px', padding:'4px 20px 20px' }
            },
              ...cropSummaryRows.map(c => {
                const fieldColor = (rows.find(r => r.field && r.field.crop === c.crop) || {}).field
                const accent = (fieldColor && fieldColor.color) ? fieldColor.color : '#0A6B52'
                const yoyColor = c.yoy_pct == null ? '#94A3B8' : c.yoy_pct >= 0 ? '#0A6B52' : '#C2410C'
                return React.createElement('div', {
                  key: c.crop,
                  style:{
                    background:'#FFFFFF', border:'1px solid var(--border-color)', borderRadius:'8px',
                    padding:'14px 16px', boxShadow:'var(--shadow-flat)'
                  }
                },
                  React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' } },
                    React.createElement('div', { style:{ fontSize:'14px', fontWeight:700, color:'#111827' } }, c.crop),
                    React.createElement('span', { style:{ fontSize:'10px', color:'#94A3B8', fontWeight:600 } }, c.fieldCount+'圃場')
                  ),
                  React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:'6px' } },
                    React.createElement('div', { style:{ display:'flex', justifyContent:'space-between', fontSize:'12px' } },
                      React.createElement('span', { style:{ color:'#64748B' } }, '合計ケース数'),
                      React.createElement('span', { style:{ fontWeight:700, color:accent } }, c.total_cases.toLocaleString()+'ケース')
                    ),
                    React.createElement('div', { style:{ display:'flex', justifyContent:'space-between', fontSize:'12px' } },
                      React.createElement('span', { style:{ color:'#64748B' } }, '平均反収(10aあたり)'),
                      React.createElement('span', { style:{ fontWeight:600 } }, c.avg_cases_per_are != null ? c.avg_cases_per_are.toLocaleString()+'ケース' : '—')
                    ),
                    React.createElement('div', { style:{ display:'flex', justifyContent:'space-between', fontSize:'12px' } },
                      React.createElement('span', { style:{ color:'#64748B' } }, '前年比'),
                      React.createElement('span', { style:{ fontWeight:700, color:yoyColor } },
                        c.yoy_pct == null ? '—' : (c.yoy_pct >= 0 ? '+' : '')+c.yoy_pct+'%'
                      )
                    )
                  )
                )
              })
            ),

            // ── 作物別メモ（自由記述。数値は自動集計のみで上書き不可） ──
            React.createElement('div', { style:{ borderTop:'1px solid #EDF2ED', padding:'14px 20px 18px' } },
              React.createElement('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' } },
                React.createElement('div', { style:{ fontSize:'12px', fontWeight:700, color:'#374151' } }, '作物別メモ'),
                React.createElement('button', {
                  className:'btn btn-ghost',
                  style:{ fontSize:'12px', padding:'5px 10px' },
                  onClick: () => setShowCropCommentForm(v => !v)
                },
                  React.createElement('i', { className:'ti ti-plus' }),
                  showCropCommentForm ? 'キャンセル' : 'メモ追加'
                )
              ),

              showCropCommentForm && React.createElement('div', { style:{ background:'#F8FAF8', border:'1px solid #E2E8E2', borderRadius:'8px', padding:'12px', marginBottom:'12px' } },
                React.createElement('select', {
                  value: cropCommentTarget,
                  onChange: e => setCropCommentTarget(e.target.value),
                  className:'form-select',
                  style:{ marginBottom:'8px', width:'auto', minWidth:'140px' }
                },
                  React.createElement('option', { value:'' }, '対象の作物を選択'),
                  ...cropSummaryRows.map(c => React.createElement('option', { key:c.crop, value:c.crop }, c.crop))
                ),
                React.createElement('textarea', {
                  className:'form-input',
                  rows:3,
                  placeholder:'この作物の気づき・次年度への申し送り事項を入力...',
                  value: cropCommentText,
                  onChange: e => setCropCommentText(e.target.value),
                  style:{ resize:'vertical' }
                }),
                React.createElement('div', { style:{ marginTop:'8px', display:'flex', gap:'8px', justifyContent:'flex-end' } },
                  React.createElement('button', {
                    className:'btn btn-primary',
                    style:{ fontSize:'12px', padding:'6px 14px' },
                    onClick: handleAddCropComment,
                    disabled: !cropCommentText.trim() || !cropCommentTarget
                  }, '保存')
                )
              ),

              seasonCropComments.length === 0
                ? React.createElement('div', { style:{ color:'#94A3B8', fontSize:'12px', padding:'4px 0' } },
                    'このシーズンの作物別メモはまだありません'
                  )
                : React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:'8px' } },
                    ...seasonCropComments.map((c, i) => React.createElement('div', {
                      key:i,
                      style:{ background:'#F8FAF8', border:'1px solid #E2E8E2', borderRadius:'8px', padding:'10px 14px' }
                    },
                      React.createElement('div', { style:{ fontSize:'11px', fontWeight:700, color:'#0A6B52', marginBottom:'4px' } }, c.crop),
                      React.createElement('div', { style:{ fontSize:'13px', color:'#374151', lineHeight:1.6 } }, c.comment)
                    ))
                  )
            )
          ),

          // ── タブ切替（圃場別実績 / 資材コスト）──
          React.createElement('div', { style:{ display:'flex', gap:'4px', marginBottom:'16px', borderBottom:'1px solid #E2E8E2' } },
            ...[
              { key:'summary', label:'圃場別実績', icon:'list-details' },
              { key:'cost',    label:'資材コスト', icon:'report-money' },
            ].map(t => {
              const isActiveTab = perfTab === t.key
              return React.createElement('button', {
                key: t.key,
                onClick: () => setPerfTab(t.key),
                style:{
                  display:'flex', alignItems:'center', gap:'6px',
                  padding:'9px 16px', border:'none', background:'none', cursor:'pointer',
                  fontSize:'13px', fontWeight: isActiveTab ? 700 : 500,
                  color: isActiveTab ? '#0A6B52' : '#64748B',
                  borderBottom: isActiveTab ? '2px solid #0A6B52' : '2px solid transparent',
                  marginBottom:'-1px', transition:'all .12s',
                }
              },
                React.createElement('i', { className:'ti ti-'+t.icon, style:{ fontSize:'14px' } }),
                t.label
              )
            })
          ),

          // ── Step2+3: 圃場別実績テーブル ──
          perfTab === 'summary' && React.createElement('div', { className:'card card-data', style:{ marginBottom:'16px' } },
            React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'8px', marginBottom:'4px' } },
              React.createElement(SectionTitle, { icon:'list-details' }, season+'年度　圃場別実績（反収・前年比）'),
              availableVarieties.length > 1 && React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'6px' } },
                React.createElement('span', { style:{ fontSize:'12px', color:'#64748B', fontWeight:600 } }, '品種で絞り込み'),
                React.createElement('select', {
                  value: varietyFilter,
                  onChange: e => setVarietyFilter(e.target.value),
                  className:'form-select',
                  style:{ width:'auto', minWidth:'140px', fontSize:'12px', padding:'5px 10px' }
                },
                  React.createElement('option', { value:'all' }, '全品種'),
                  ...availableVarieties.map(v => React.createElement('option', { key:v, value:v }, v))
                )
              )
            ),
            React.createElement('table', { className:'table' },
              React.createElement('thead', null,
                React.createElement('tr', null,
                  ...SORT_COLUMNS.map(col =>
                    React.createElement('th', {
                      key: col.key,
                      onClick: () => handleSort(col.key),
                      style:{ cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }
                    },
                      col.label,
                      React.createElement('i', {
                        className:'ti ti-'+(sortKey !== col.key ? 'arrows-sort' : (sortDir === 'asc' ? 'sort-ascending' : 'sort-descending')),
                        style:{ fontSize:'12px', marginLeft:'4px', color: sortKey === col.key ? '#0A6B52' : '#CBD5E1' }
                      })
                    )
                  ),
                  React.createElement('th', { key:'variety' }, '主な品種'),
                  // 【とうもろこし両方表示対応】本数・重量(kg)列（レタス等は値が無いため「—」表示）
                  hasStemsOrWeight && React.createElement('th', { key:'stems', style:{ whiteSpace:'nowrap' } }, '合計本数'),
                  hasStemsOrWeight && React.createElement('th', { key:'weight', style:{ whiteSpace:'nowrap' } }, '合計重量(kg)'),
                  React.createElement('th', { key:'data-type' }, 'データ種別')
                )
              ),
              React.createElement('tbody', null,
                sortedRows.length === 0 && React.createElement('tr', null,
                  React.createElement('td', { colSpan: hasStemsOrWeight ? 10 : 8, style:{ textAlign:'center', color:'#94A3B8', fontSize:'13px', padding:'20px 0' } },
                    '選択した品種に該当する圃場がありません'
                  )
                ),
                ...sortedRows.map(r => {
                  const yoyColor = r.yoy_pct == null ? '#94A3B8' : r.yoy_pct >= 0 ? '#0A6B52' : '#C2410C'
                  return React.createElement('tr', { key:r.fid },
                    React.createElement('td', { style:{ fontWeight:600, color:'#374151' } },
                      r.field ? r.field.name : ('圃場#'+r.fid)
                    ),
                    React.createElement('td', null, r.area_are != null ? r.area_are+'a' : '—'),
                    // Step2: 反収 = 合計ケース数 × 10 / 面積(a)
                    React.createElement('td', { style:{ fontWeight:600 } },
                      r.cases_per_are != null ? r.cases_per_are.toLocaleString()+'ケース' : '—'
                    ),
                    React.createElement('td', { style:{ fontWeight:700, color:'#0A6B52' } },
                      r.total_cases.toLocaleString()+'ケース'
                    ),
                    // Step3: 前年実績
                    React.createElement('td', { style:{ color:'#64748B' } },
                      r.prev_cases != null ? r.prev_cases.toLocaleString()+'ケース' : '—'
                    ),
                    // Step3: 前年比
                    React.createElement('td', { style:{ color: yoyColor, fontWeight:600 } },
                      r.yoy_pct == null ? '—' : (r.yoy_pct >= 0 ? '+' : '')+r.yoy_pct+'%'
                    ),
                    React.createElement('td', { style:{ color:'#6B7280', fontSize:'12px' } },
                      r.varieties.length > 0 ? r.varieties.join('・') : '—'
                    ),
                    // 【とうもろこし両方表示対応】本数・重量(kg)（前年比は色分けして括弧内に表示）
                    hasStemsOrWeight && React.createElement('td', { style:{ fontWeight:600 } },
                      r.total_stems != null
                        ? React.createElement(React.Fragment, null,
                            r.total_stems.toLocaleString()+'本',
                            r.stems_yoy_pct != null && React.createElement('span', {
                              style:{ marginLeft:'4px', fontSize:'11px', fontWeight:600, color: r.stems_yoy_pct >= 0 ? '#0A6B52' : '#C2410C' }
                            }, '('+(r.stems_yoy_pct >= 0 ? '+' : '')+r.stems_yoy_pct+'%)')
                          )
                        : '—'
                    ),
                    hasStemsOrWeight && React.createElement('td', { style:{ fontWeight:600 } },
                      r.total_weight_kg != null
                        ? React.createElement(React.Fragment, null,
                            r.total_weight_kg.toLocaleString()+'kg',
                            r.weight_yoy_pct != null && React.createElement('span', {
                              style:{ marginLeft:'4px', fontSize:'11px', fontWeight:600, color: r.weight_yoy_pct >= 0 ? '#0A6B52' : '#C2410C' }
                            }, '('+(r.weight_yoy_pct >= 0 ? '+' : '')+r.weight_yoy_pct+'%)')
                          )
                        : '—'
                    ),
                    React.createElement('td', null,
                      r.is_computed
                        ? React.createElement('span', { className:'badge badge-green' }, '自動集計')
                        : r.is_estimated
                          ? React.createElement('span', { className:'badge badge-amber' }, '参照値')
                          : React.createElement('span', { className:'badge badge-gray' }, '静的データ')
                    )
                  )
                }),
                // 合計行（絞り込み中の表示行のみで再集計）
                React.createElement('tr', { style:{ background:'#F8FAF8', borderTop:'2px solid #D8E8D8' } },
                  React.createElement('td', { style:{ fontWeight:700, color:'#111827' } }, '合計 / 平均'),
                  React.createElement('td', null, ''),
                  React.createElement('td', { style:{ fontWeight:600 } }, filteredAvgPerAre+'ケース'),
                  React.createElement('td', { style:{ fontWeight:700, color:'#0A6B52' } }, filteredTotalCases.toLocaleString()+'ケース'),
                  React.createElement('td', { style:{ color:'#64748B' } }, filteredPrevTotal > 0 ? filteredPrevTotal.toLocaleString()+'ケース' : '—'),
                  React.createElement('td', { style:{ color: filteredYoyPct == null ? '#94A3B8' : filteredYoyPct >= 0 ? '#0A6B52' : '#C2410C', fontWeight:700 } },
                    filteredYoyPct == null ? '—' : (filteredYoyPct >= 0 ? '+' : '')+filteredYoyPct+'%'
                  ),
                  React.createElement('td', null, ''),
                  // 【とうもろこし両方表示対応】本数・重量(kg)の合計
                  hasStemsOrWeight && React.createElement('td', { style:{ fontWeight:700 } }, filteredTotalStems > 0 ? filteredTotalStems.toLocaleString()+'本' : '—'),
                  hasStemsOrWeight && React.createElement('td', { style:{ fontWeight:700 } }, filteredTotalWeight > 0 ? filteredTotalWeight.toLocaleString()+'kg' : '—'),
                  React.createElement('td', null, '')
                )
              )
            )
          ),

          // ── 資材コスト（参考値）── 使用量→コストの単純集計。最適化判定は行わない ──
          hasAnyCostData && React.createElement('div', { className:'card card-data', style:{ marginBottom:'16px' } },
            React.createElement(SectionTitle, { icon:'report-money' }, season+'年度　圃場別 資材コスト（参考値）'),
            React.createElement('div', {
              style:{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:'8px', padding:'10px 14px', marginBottom:'14px', fontSize:'12px', color:'#78350F', display:'flex', alignItems:'flex-start', gap:'8px' }
            },
              React.createElement('i', { className:'ti ti-alert-triangle', style:{ fontSize:'14px', flexShrink:0, marginTop:'1px' } }),
              React.createElement('div', null,
                '農薬の散布記録・追肥記録から使用量×単価で算出した参考値です。価格が未確定の品目はコストに含めていません'
                + (hasAnyUnknownCost ? '（一部の圃場で未確定品目を含むため、実際のコストより低く出ています）。' : '。'),
                React.createElement('br', null),
                '「コスト効率が良い/悪い」「最適化されている」といった判定は行っていません。圃場間の相対比較の参考としてご活用ください。'
              )
            ),
            React.createElement('table', { className:'table' },
              React.createElement('thead', null,
                React.createElement('tr', null,
                  ...['圃場名','農薬コスト','肥料コスト','合計コスト','合計ケース数','1ケースあたりコスト','備考'].map(h =>
                    React.createElement('th', { key:h }, h)
                  )
                )
              ),
              React.createElement('tbody', null,
                ...[...costRows].sort((a,b) => (b.costPerCase||0) - (a.costPerCase||0)).map(r =>
                  React.createElement('tr', { key:r.fid },
                    React.createElement('td', { style:{ fontWeight:600, color:'#374151' } },
                      r.field ? r.field.name : ('圃場#'+r.fid)
                    ),
                    React.createElement('td', null, r.hasRecord ? '¥'+Math.round(r.pesticideCost).toLocaleString() : '—'),
                    React.createElement('td', null, r.hasRecord ? '¥'+Math.round(r.fertilizerCost).toLocaleString() : '—'),
                    React.createElement('td', { style:{ fontWeight:700, color:'#111827' } }, r.hasRecord ? '¥'+Math.round(r.totalCost).toLocaleString() : '—'),
                    React.createElement('td', null, r.total_cases.toLocaleString()+'ケース'),
                    React.createElement('td', null,
                      r.costPerCase != null
                        ? React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px' } },
                            React.createElement('span', { style:{ fontWeight:700, color:'#B45309', minWidth:'64px' } }, '¥'+Math.round(r.costPerCase).toLocaleString()),
                            React.createElement('div', { style:{ flex:1, maxWidth:'90px', background:'#EDF2ED', borderRadius:'4px', height:'6px', overflow:'hidden' } },
                              React.createElement('div', { style:{ height:'100%', borderRadius:'4px', width:(r.costPerCase/maxCostPerCase*100)+'%', background:'#B45309' } })
                            )
                          )
                        : '—'
                    ),
                    React.createElement('td', null,
                      r.hasUnknownPrice
                        ? React.createElement('span', { style:{ fontSize:'11px', color:'#B45309' } }, '⚠ 未確定品目あり')
                        : (!r.hasRecord ? React.createElement('span', { style:{ fontSize:'11px', color:'#9CA3AF' } }, '記録なし') : '')
                    )
                  )
                )
              )
            )
          ),

          // ── 評価コメント ──
          React.createElement('div', { className:'card' },
            React.createElement('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' } },
              React.createElement(SectionTitle, { icon:'message-2' }, season+'年度　評価コメント'),
              React.createElement('button', {
                className:'btn btn-ghost',
                style:{ fontSize:'12px', padding:'6px 12px' },
                onClick: () => setShowCommentForm(v => !v)
              },
                React.createElement('i', { className:'ti ti-plus' }),
                showCommentForm ? 'キャンセル' : 'コメント追加'
              )
            ),

            // コメント追加フォーム
            showCommentForm && React.createElement('div', { style:{ background:'#F8FAF8', border:'1px solid #E2E8E2', borderRadius:'8px', padding:'12px', marginBottom:'12px' } },
              React.createElement('textarea', {
                className:'form-input',
                rows:3,
                placeholder:`${season}年度の評価・気づき・次年度への申し送り事項を入力...`,
                value: commentText,
                onChange: e => setCommentText(e.target.value),
                style:{ resize:'vertical' }
              }),
              React.createElement('div', { style:{ marginTop:'8px', display:'flex', gap:'8px', justifyContent:'flex-end' } },
                React.createElement('button', {
                  className:'btn btn-primary',
                  style:{ fontSize:'12px', padding:'6px 14px' },
                  onClick: handleAddComment,
                  disabled: !commentText.trim()
                }, '保存')
              )
            ),

            seasonComments.length === 0
              ? React.createElement('div', { style:{ color:'#94A3B8', fontSize:'13px', padding:'8px 0' } },
                  React.createElement('i', { className:'ti ti-message-off', style:{ marginRight:'6px' } }),
                  'このシーズンの評価コメントはまだありません'
                )
              : React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:'8px' } },
                  ...seasonComments.map((c, i) => React.createElement('div', {
                    key:i,
                    style:{ background:'#F8FAF8', border:'1px solid #E2E8E2', borderRadius:'8px', padding:'12px 14px' }
                  },
                    React.createElement('div', { style:{ fontSize:'11px', fontWeight:700, color:'#0A6B52', marginBottom:'4px' } }, c.season+'年度'),
                    React.createElement('div', { style:{ fontSize:'13px', color:'#374151', lineHeight:1.6 } }, c.comment)
                  ))
                )
          )
        )
  )
}

// CAT-05-4: VisaPage — UX-08: スタッフ追加フォーム（在留カード番号フィールド付き）を追加
function VisaPage({ staff, onAdd, onDelete }) {
  // UX-08: showForm / form state を追加
  const [showForm, setShowForm] = React.useState(false)
  const [form, setForm]         = React.useState({ name:'', nationality:'VN', role:'trainee', visa_expires_at:'', residence_card_no:'' })
  const [toast, setToast]       = React.useState(null)

  const sortedStaff = [...staff].sort((a,b)=>a.name.localeCompare(b.name,'ja'))
  const alertStaff  = sortedStaff.filter(s => { const d=calcDaysLeft(s.visa_expires_at); return d!==null && d<=CONFIG.VISA_ALERT_DAYS.warn })
  const getVisaStatus = s => {
    const d = calcDaysLeft(s.visa_expires_at)
    if (d===null) return { label:'該当なし', badgeClass:'badge-gray', days:null, type:'none' }
    if (d<0)      return { label:'期限切れ', badgeClass:'badge-red',  days:d,    type:'expired' }
    if (d<=CONFIG.VISA_ALERT_DAYS.urgent) return { label:'要対応',  badgeClass:'badge-red',   days:d, type:'urgent' }
    if (d<=CONFIG.VISA_ALERT_DAYS.warn)   return { label:'要確認',  badgeClass:'badge-amber', days:d, type:'warn' }
    return { label:'正常', badgeClass:'badge-green', days:d, type:'ok' }
  }
  const roleLabel = ROLE_LABEL
  const natLabel  = NAT_LABEL

  // UX-08: 登録ハンドラ
  const handleAdd = () => {
    if (!form.name.trim()) return
    const newStaff = { ...form, id:Date.now(), avatar:form.name.slice(0,2), visa_expires_at:form.visa_expires_at||null }
    onAdd(newStaff)
    setForm({ name:'', nationality:'VN', role:'trainee', visa_expires_at:'', residence_card_no:'' })
    setShowForm(false)
    setToast(newStaff.name + ' を登録しました')
    setTimeout(() => setToast(null), 3000)
  }

  const handleCancel = () => {
    setForm({ name:'', nationality:'VN', role:'trainee', visa_expires_at:'', residence_card_no:'' })
    setShowForm(false)
  }

  return React.createElement('div', { className:'page' },

    // UX-08: 成功トースト
    toast && React.createElement('div', {
      style:{
        position:'fixed', bottom:'28px', right:'28px', zIndex:9999,
        background:'#065F46', color:'#fff', borderRadius:'10px',
        padding:'12px 20px', fontSize:'13px', fontWeight:500,
        boxShadow:'0 4px 20px rgba(0,0,0,0.18)',
        display:'flex', alignItems:'center', gap:'10px'
      }
    },
      React.createElement('span', null, '✅'),
      React.createElement('span', null, toast)
    ),

    // ヘッダー — UX-08: 「+ スタッフを追加」ボタン追加
    React.createElement('div', { style:{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'6px' } },
      React.createElement('div', null,
        React.createElement('div', { className:'page-title' }, 'ビザ・在留管理'),
        React.createElement('div', { className:'page-sub' },
          '在留資格・ビザ期限の管理 — 外国籍スタッフ '+sortedStaff.filter(s=>s.visa_expires_at).length+'名'
        )
      ),
      React.createElement('button', {
        className: showForm ? 'btn' : 'btn btn-primary',
        style:{ display:'flex', alignItems:'center', gap:'6px', fontSize:'13px', marginTop:'2px' },
        onClick: showForm ? handleCancel : () => setShowForm(true)
      },
        React.createElement('span', { style:{ fontSize:'16px', lineHeight:1 } }, showForm ? '✕' : '+'),
        showForm ? 'キャンセル' : 'スタッフを追加'
      )
    ),

    // UX-08: スライドインフォーム（在留カード番号フィールド付き）
    showForm && React.createElement('div', {
      className: 'card',
      style:{
        marginBottom:'20px', borderColor: CONFIG.COLOR.primary+'55',
        background:'#F0FDF9', animation:'fadeInDown .2s ease'
      }
    },
      React.createElement(SectionTitle, { icon:'user-plus' }, '外国籍スタッフを登録'),

      React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' } },

        // 氏名
        React.createElement('div', { className:'form-group', style:{ gridColumn:'1 / -1' } },
          React.createElement('label', { className:'form-label' }, '氏名 *'),
          React.createElement('input', {
            type:'text', className:'form-input', value:form.name, autoFocus:true,
            onChange: e => setForm(f=>({...f,name:e.target.value})),
            placeholder:'Nguyen Van B',
            onKeyDown: e => { if(e.key==='Enter' && form.name.trim()) handleAdd() }
          })
        ),

        // 国籍
        React.createElement('div', { className:'form-group' },
          React.createElement('label', { className:'form-label' }, '国籍'),
          React.createElement('select', {
            className:'form-select', value:form.nationality,
            onChange: e => setForm(f=>({...f,nationality:e.target.value}))
          }, ...Object.entries(natLabel).map(([v,l]) => React.createElement('option',{key:v,value:v},l)))
        ),

        // 役割
        React.createElement('div', { className:'form-group' },
          React.createElement('label', { className:'form-label' }, '役割'),
          React.createElement('select', {
            className:'form-select', value:form.role,
            onChange: e => setForm(f=>({...f,role:e.target.value}))
          }, ...Object.entries(roleLabel).map(([v,l]) => React.createElement('option',{key:v,value:v},l)))
        ),

        // ビザ期限
        React.createElement('div', { className:'form-group' },
          React.createElement('label', { className:'form-label' }, 'ビザ・在留期限'),
          React.createElement('input', {
            type:'date', className:'form-input', value:form.visa_expires_at,
            onChange: e => setForm(f=>({...f,visa_expires_at:e.target.value}))
          })
        ),

        // 在留カード番号（UX-08仕様: VisaPage 専用フィールド）
        React.createElement('div', { className:'form-group' },
          React.createElement('label', { className:'form-label' }, '在留カード番号'),
          React.createElement('input', {
            type:'text', className:'form-input', value:form.residence_card_no,
            onChange: e => setForm(f=>({...f,residence_card_no:e.target.value})),
            placeholder:'AB12345678CD'
          })
        )
      ),

      // 登録ボタン行
      React.createElement('div', { style:{ display:'flex', gap:'10px', marginTop:'4px' } },
        React.createElement('button', {
          className:'btn btn-primary', disabled: !form.name.trim(),
          onClick: handleAdd, style:{ flex:1 }
        }, '登録する'),
        React.createElement('button', {
          className:'btn', onClick: handleCancel, style:{ minWidth:'80px' }
        }, 'キャンセル')
      )
    ),

    // ビザアラートバナー
    alertStaff.length > 0 && React.createElement('div', {
      style:{ background:'#FEF2F2', border:'1px solid #F87171', borderRadius:'10px', padding:'14px 18px', marginBottom:'20px', display:'flex', alignItems:'flex-start', gap:'12px' }
    },
      React.createElement('span', { style:{ fontSize:'20px', flexShrink:0 } }, '🚨'),
      React.createElement('div', { style:{ flex:1 } },
        React.createElement('div', { style:{ fontSize:'14px', fontWeight:600, color:'#DC2626', marginBottom:'8px' } }, 'ビザ期限アラート — '+alertStaff.length+'名が要対応'),
        React.createElement('div', { style:{ display:'flex', flexWrap:'wrap', gap:'8px' } },
          ...alertStaff.map(s => {
            const st = getVisaStatus(s)
            return React.createElement('div', { key:s.id, style:{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:'8px', padding:'6px 12px', fontSize:'12px' } },
              React.createElement('span', { style:{ color:'#DC2626', fontWeight:500 } }, s.name),
              React.createElement('span', { style:{ color:'#991B1B', marginLeft:'6px' } }, st.type==='expired'?'⚠️ 期限切れ':'残'+st.days+'日')
            )
          })
        )
      )
    ),

    // スタッフテーブル
    React.createElement('div', { className:'card card-data' },
      React.createElement('table', { className:'table' },
        React.createElement('thead', null,
          React.createElement('tr', null,
            ...['氏名','国籍','役割','ビザ期限','状態'].map(h => React.createElement('th',{key:h},h))
          )
        ),
        React.createElement('tbody', null,
          ...sortedStaff.map(s => {
            const st = getVisaStatus(s)
            return React.createElement('tr', { key:s.id },
              React.createElement('td', { style:{ fontWeight:600, color:'#374151' } }, s.name),
              React.createElement('td', null, natLabel[s.nationality] || s.nationality),
              React.createElement('td', null, roleLabel[s.role]),
              React.createElement('td', { style:{ color:'#374151' } }, s.visa_expires_at || '—'),
              React.createElement('td', null, React.createElement('span', { className:'badge '+st.badgeClass }, st.label))
            )
          })
        )
      )
    )
  )
}

// =====================================================
// C05-1: GapSupport を3コンポーネントに分割
//   GapChecklist — チェックリスト専用ページ
//   GapExport    — 帳票出力 / 申請パッケージ専用ページ
//   GapFull      — 両方を組み合わせたフルページ（旧デフォルト表示）
// =====================================================

// ── 共通フック: GAP集計・PDF/Excel出力処理 ──────────────────
function useGapBase({ gap, records, fields, pesticides, ctx }) {
  const [open, setOpen] = React.useState({})
  const [exporting,  setExporting]     = React.useState(false)

  // 自動達成（記録あり）または手動チェックで「達成」とみなす
  const isDone     = (c) => c.is_cleared || isGapAutoCleared(c, ctx)
  const cats       = [...new Set(gap.map(c => c.category))]
  const total      = gap.length
  const done       = gap.filter(isDone).length
  const pct        = total ? Math.round(done / total * 100) : 0
  const sprayCount = records.filter(r => r.work_type === '農薬散布').length

  const handleExportPDF = async () => {
    setExporting(true)
    try { await exportSprayPDF(records, fields, pesticides) }
    catch(e) { showToast('PDF出力に失敗しました: ' + e.message, 'error') }
    finally  { setExporting(false) }
  }
  const handleExportExcel = () => {
    try { exportFertilizerExcel(records, fields) }
    catch(e) { showToast('Excel出力に失敗しました: ' + e.message, 'error') }
  }
  const handleExportEmaff = () => {
    try { exportEmaffCSV(records, fields, pesticides) }
    catch(e) { showToast('eMAFF連携CSV出力に失敗しました: ' + e.message, 'error') }
  }

  return { open, setOpen, exporting, cats, total, done, pct, sprayCount, isDone,
           handleExportPDF, handleExportExcel, handleExportEmaff }
}

// ── 共通UI: 全体進捗バー ────────────────────────────────────
function GapProgressBar({ done, total, pct }) {
  return React.createElement('div',{style:{display:'flex',alignItems:'center',gap:'16px',marginBottom:'24px'}},
    React.createElement('div',{style:{flex:1}},
      React.createElement('div',{className:'prog-label'},
        React.createElement('span',null,'全体進捗 ('+done+'/'+total+'項目)'),
        React.createElement('span',{style:{color:'#0D9972',fontWeight:500}},pct+'%')
      ),
      React.createElement('div',{className:'prog-bg',style:{height:'10px'}},
        React.createElement('div',{className:'prog-fill',style:{width:pct+'%'}})
      )
    ),
    React.createElement('div',{style:{background:'#ECFDF5',border:'1px solid #A7F3D0',borderRadius:'8px',padding:'10px 20px',textAlign:'center'}},
      React.createElement('div',{style:{fontSize:'22px',fontWeight:600,color:'#0D9972'}},pct+'%'),
      React.createElement('div',{style:{fontSize:'12px',color:'#6B7280',marginTop:'2px'}},'達成')
    )
  )
}

// ── 共通UI: チェックリスト＋カテゴリ別進捗 ─────────────────
// GGAPの管理点レベル表示メタ（上位=Major Must / 下位=Minor Must / 推奨=Recommendation）
const GAP_LEVEL_META = {
  major: { label:'上位', color:'#DC2626', bg:'#FEF2F2', bd:'#FCA5A5' },
  minor: { label:'下位', color:'#B45309', bg:'#FFFBEB', bd:'#FDE68A' },
  rec:   { label:'推奨', color:'#475569', bg:'#F1F5F9', bd:'#E2E8F0' },
}
function GapChecklistPanel({ gap, cats, open, setOpen, onToggle, ctx }) {
  const auto = (c) => isGapAutoCleared(c, ctx)
  const eff  = (c) => c.is_cleared || auto(c)
  return React.createElement('div',{className:'page-grow',style:{display:'grid',gridTemplateColumns:'1fr 280px',gap:'24px',alignItems:'start'}},
    React.createElement('div',null,
      ...cats.map(cat => {
        const items   = gap.filter(c => c.category === cat)
        const catDone = items.filter(eff).length
        const isOpen  = open[cat]
        return React.createElement('div',{key:cat,className:'gap-check-cat'},
          React.createElement('div',{className:'gap-cat-hdr',onClick:()=>setOpen(o=>({...o,[cat]:!o[cat]}))},
            React.createElement('span',null,cat),
            React.createElement('div',{style:{display:'flex',alignItems:'center',gap:'10px'}},
              React.createElement('span',{className:'badge '+(catDone===items.length?'badge-green':'badge-amber')},catDone+'/'+items.length+'完了'),
              React.createElement('span',{style:{
                color:'#6B7280', fontSize:'12px',
                display:'inline-block',
                transition:'transform .3s cubic-bezier(.4,0,.2,1)',
                transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
              }},'▼')
            )
          ),
          React.createElement('div', { className: 'smooth-collapse-wrap' + (isOpen ? ' open' : '') },
            React.createElement('div', { className: 'smooth-collapse-inner' },
            items.map(c => {
              const isAuto = auto(c) && !c.is_cleared
              const checked = eff(c)
              return React.createElement('div',{key:c.id,className:'gap-item '+(checked?'done':''),onClick:()=> isAuto ? null : onToggle(c.id), style: isAuto ? { cursor:'default' } : null },
                React.createElement('div', {
                  style: {
                    width:18, height:18, borderRadius:'4px', border:'1px solid',
                    borderColor:  checked ? CONFIG.COLOR.primary : '#CBD5E1',
                    background:   checked ? CONFIG.COLOR.primary : 'transparent',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    flexShrink:0, fontSize:12, color:'#fff'
                  }
                }, checked ? '✓' : ''),
                React.createElement('div', { style:{ flex:1, minWidth:0 } },
                  React.createElement('span', null,
                    c.code && React.createElement('span', { style:{ fontSize:10, fontWeight:700, color:'#94A3B8', marginRight:6, fontVariantNumeric:'tabular-nums' } }, c.code),
                    c.item
                  ),
                  (!isAuto && c.doc) && React.createElement('div', { style:{ fontSize:10, color:'#94A3B8', marginTop:2 } }, '要書類: ' + c.doc)
                ),
                // 管理点レベル（上位/下位/推奨）
                c.level && GAP_LEVEL_META[c.level] && React.createElement('span', { style:{ fontSize:9.5, fontWeight:700, color:GAP_LEVEL_META[c.level].color, background:GAP_LEVEL_META[c.level].bg, border:'1px solid '+GAP_LEVEL_META[c.level].bd, borderRadius:4, padding:'1px 5px', flexShrink:0 } }, GAP_LEVEL_META[c.level].label),
                // 自動達成の根拠 / 手動チェック
                isAuto
                  ? React.createElement('span', { style:{ fontSize:10, fontWeight:700, color:'#0A6B52', background:'#ECFDF5', border:'1px solid #A7F3D0', borderRadius:5, padding:'1px 6px', flexShrink:0 } }, '自動✓ ' + (c.evidence || '記録あり'))
                  : (c.auto ? React.createElement('span', { style:{ fontSize:10, color:'#B45309', flexShrink:0 } }, '記録待ち') : React.createElement('span', { style:{ fontSize:10, color:'#94A3B8', flexShrink:0 } }, '現場確認'))
              )
            })
          ) // end smooth-collapse-inner
          ) // end smooth-collapse-wrap
        )
      })
    ),
    React.createElement('div',null,
      React.createElement('div',{className:'section-title'},'カテゴリ別達成率'),
      ...cats.map(cat => {
        const items   = gap.filter(c => c.category === cat)
        const catDone = items.filter(eff).length
        const catPct  = Math.round(catDone / items.length * 100)
        return React.createElement('div',{key:cat,className:'card-sm',style:{marginBottom:'8px'}},
          React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'6px'}},
            React.createElement('span',{style:{fontSize:'12px',color:'#374151',fontWeight:500}},cat),
            React.createElement('span',{style:{fontSize:'12px',color:catDone===items.length?CONFIG.COLOR.primary:'#B45309',fontWeight:600}},catPct+'%')
          ),
          React.createElement('div',{style:{background:'#E5E9F0',borderRadius:'4px',height:'5px',overflow:'hidden'}},
            React.createElement('div',{style:{height:'100%',borderRadius:'4px',background:catDone===items.length?CONFIG.COLOR.primary:'#D97706',width:catPct+'%',transition:'width .4s'}})
          ),
          React.createElement('div',{style:{fontSize:'10px',color:'#6B7280',marginTop:'4px'}},catDone+'/'+items.length+' 完了')
        )
      })
    )
  )
}

// ── 共通UI: 帳票出力ボタン群 ────────────────────────────────
function GapExportButtons({ exporting, sprayCount, handleExportPDF, handleExportExcel, handleExportEmaff }) {
  return React.createElement('div',{style:{display:'flex',gap:'8px',flexShrink:0,marginTop:'4px',flexWrap:'wrap'}},
    React.createElement('button',{
      className:'btn btn-primary', onClick:handleExportPDF, disabled:exporting,
      style:{ background: exporting ? CONFIG.COLOR.primaryDark : CONFIG.COLOR.primary }
    }, exporting ? '⏳ 生成中...' : '📄 農薬散布PDF ('+sprayCount+'件)'),
    React.createElement('button',{
      className:'btn btn-ghost', onClick:handleExportExcel,
      style:{ borderColor:'#0D9972', color:'#0D9972' }
    }, '📊 施肥記録 Excel'),
    React.createElement('button',{
      className:'btn btn-ghost', onClick:handleExportEmaff,
      style:{ borderColor:'#0D9972', color:'#0D9972' },
      title:'農薬散布・施肥・収穫の記録に圃場のeMAFF農地番号を紐づけたCSVを出力します'
    }, '🗺 eMAFF連携CSV')
  )
}

// ── GapChecklist: チェックリスト専用ページ（UX-06: 未完了タブ追加）─
function GapChecklist({ gap, onToggle, ctx }) {
  const { open, setOpen, isDone } = useGapBase({ gap, records:[], fields:[], pesticides:[], ctx })
  // UX-06: タブ状態管理（'all' | 'incomplete'）
  const [activeTab, setActiveTab] = React.useState('all')
  // 【GAP認証対応】スキーム(GLOBALG.A.P. / McD Addendum / 両方)＋GGAPの管理点レベルで絞り込み。
  const [schemeSel, setSchemeSel] = React.useState('GGAP')   // 'GGAP' | 'McD' | 'both'
  const [scheme, setScheme] = React.useState('all')          // 'all' | 'major' | 'minor' | 'rec'（GGAPのみ）
  const inScheme = (c) => {
    const sc = c.schemes || ['GGAP']
    if (!(schemeSel === 'both' || sc.includes(schemeSel))) return false
    // レベル絞込: レベルを持つ項目のみ対象。McD等レベル無し項目は絞込時に除外（推奨等への誤混入を防ぐ）
    if (scheme !== 'all' && c.level !== scheme) return false
    return true
  }

  // スキームで絞った母集合と対応度（システム自動達成／手動／要対応）
  const schemeGap = gap.filter(inScheme)
  const total     = schemeGap.length
  const autoN     = schemeGap.filter(c => !c.is_cleared && isGapAutoCleared(c, ctx)).length  // システムが記録で満たす
  const manualN   = schemeGap.filter(c => c.is_cleared).length                                // 人が確認済み
  const done      = schemeGap.filter(isDone).length
  const todoN     = total - done
  const pct       = total ? Math.round(done / total * 100) : 0
  const cats      = [...new Set(schemeGap.map(c => c.category))]

  // 未完了件数（自動達成を除く）
  const incompleteCount = schemeGap.filter(c => !isDone(c)).length

  // タブに応じてフィルターしたgapリストを生成
  const filteredGap = activeTab === 'incomplete'
    ? schemeGap.filter(c => !isDone(c))
    : schemeGap

  // 未完了タブ時は空カテゴリを除外
  const filteredCats = cats.filter(cat => filteredGap.some(c => c.category === cat))
  const schemeLabel = schemeSel === 'McD' ? 'McD Addendum' : schemeSel === 'GRASP' ? 'GRASP 2.0（労務）' : schemeSel === 'both' ? 'GGAP＋McD＋GRASP' : 'GLOBALG.A.P. Ver6'

  // タブスタイル定義
  const tabBase = {
    display:'inline-flex', alignItems:'center', gap:'6px',
    padding:'7px 16px', borderRadius:'8px', fontSize:'13px',
    fontWeight:600, cursor:'pointer', border:'none',
    transition:'all .15s', whiteSpace:'nowrap'
  }
  const tabActive   = { ...tabBase, background:CONFIG.COLOR.primary, color:'#fff', boxShadow:'0 2px 8px rgba(10,107,82,.25)' }
  const tabInactive = { ...tabBase, background:'#F1F5F1', color:'#64748B' }

  // 未完了バッジ（タブ内）
  const incompleteBadge = React.createElement('span',{
    style:{
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      minWidth:'18px', height:'18px', borderRadius:'9px',
      background: activeTab === 'incomplete' ? 'rgba(255,255,255,.3)' : '#C2410C',
      color: activeTab === 'incomplete' ? '#fff' : '#fff',
      fontSize:'10px', fontWeight:700, padding:'0 4px'
    }
  }, incompleteCount)

  return React.createElement('div',{className:'page'},
    // ページタイトル
    React.createElement('div',{style:{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:'6px',flexWrap:'wrap',gap:'10px'}},
      React.createElement('div',null,
        React.createElement('div',{className:'eyebrow'},'GAP CHECKLIST'),
        React.createElement('div',{className:'page-title'},'GAP対応チェックリスト'),
        React.createElement('div',{className:'page-sub'},'GLOBALG.A.P. Ver6(2024) FV-Smart（190管理点）＋ McDonald\'s Addendum1.1（31監査ポイント）＋ GRASP 2.0（労務・67項目）に対応。記録・帳票・トレーサビリティの管理点はシステムが自動で満たします（審査に提出可能）。物理・書面の管理点は現場でご対応ください。')
      ),
      React.createElement('button',{ onClick:()=>window.print(), style:{ display:'inline-flex', alignItems:'center', gap:6, padding:'8px 14px', border:'1px solid #0A6B52', background:'#fff', color:'#0A6B52', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer', flexShrink:0 } },
        React.createElement('i',{ className:'ti ti-printer', style:{ fontSize:15 } }), '審査用に印刷 / PDF')
    ),

    // 対象スキーム（GLOBALG.A.P. / McD Addendum / 両方）
    React.createElement('div',{ style:{ display:'flex', gap:8, alignItems:'center', margin:'8px 0 8px', flexWrap:'wrap' } },
      React.createElement('span',{ style:{ fontSize:12, color:'#6B7280', fontWeight:600 } }, '対象スキーム'),
      ...[['GGAP','GLOBALG.A.P.'],['McD','McD Addendum'],['GRASP','GRASP（労務）'],['both','全スキーム']].map(([k,lab]) =>
        React.createElement('button',{ key:k, onClick:()=>{ setSchemeSel(k); setScheme('all') },   // スキーム切替時はレベル絞込をリセット（stale 0件表示を防ぐ）
          style:{ padding:'6px 14px', borderRadius:16, fontSize:12, fontWeight:700, cursor:'pointer', border:'1px solid',
            borderColor: schemeSel===k ? '#0A6B52' : '#DDE2EC', background: schemeSel===k ? '#ECFDF5' : '#fff', color: schemeSel===k ? '#0A6B52' : '#64748B' } }, lab))
    ),
    // 管理点レベルで絞り込み（GGAPのみ・McD単独選択時は非表示）
    schemeSel !== 'McD' && React.createElement('div',{ style:{ display:'flex', gap:8, alignItems:'center', margin:'0 0 16px', flexWrap:'wrap' } },
      React.createElement('span',{ style:{ fontSize:12, color:'#6B7280', fontWeight:600 } }, '管理点レベル'),
      ...[['all','すべて'],['major','上位（必須）'],['minor','下位（必須）'],['rec','推奨']].map(([k,lab]) =>
        React.createElement('button',{ key:k, onClick:()=>setScheme(k),
          style:{ padding:'6px 14px', borderRadius:16, fontSize:12, fontWeight:700, cursor:'pointer', border:'1px solid',
            borderColor: scheme===k ? '#0A6B52' : '#DDE2EC', background: scheme===k ? '#ECFDF5' : '#fff', color: scheme===k ? '#0A6B52' : '#64748B' } }, lab))
    ),

    // 対応度サマリー（システムが満たす／人が確認／要対応）
    React.createElement('div',{ style:{ display:'flex', gap:12, marginBottom:16, flexWrap:'wrap' } },
      React.createElement('div',{ style:{ flex:1, minWidth:150, background:'#fff', border:'1px solid #E5E7EB', borderRadius:12, padding:'14px 16px' } },
        React.createElement('div',{ style:{ fontSize:26, fontWeight:800, color:'#0A6B52', lineHeight:1 } }, pct + '%'),
        React.createElement('div',{ style:{ fontSize:12, color:'#6B7280', marginTop:4 } }, schemeLabel + ' 対応度（' + done + '/' + total + '）')),
      React.createElement('div',{ style:{ flex:1, minWidth:150, background:'#ECFDF5', border:'1px solid #A7F3D0', borderRadius:12, padding:'14px 16px' } },
        React.createElement('div',{ style:{ fontSize:26, fontWeight:800, color:'#0A6B52', lineHeight:1 } }, autoN + ' 件'),
        React.createElement('div',{ style:{ fontSize:12, color:'#166534', marginTop:4 } }, '✅ システムが記録で自動達成')),
      React.createElement('div',{ style:{ flex:1, minWidth:150, background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:12, padding:'14px 16px' } },
        React.createElement('div',{ style:{ fontSize:26, fontWeight:800, color:'#0369A1', lineHeight:1 } }, manualN + ' 件'),
        React.createElement('div',{ style:{ fontSize:12, color:'#0369A1', marginTop:4 } }, '☑ 人が確認済み')),
      React.createElement('div',{ style:{ flex:1, minWidth:150, background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:12, padding:'14px 16px' } },
        React.createElement('div',{ style:{ fontSize:26, fontWeight:800, color:'#B45309', lineHeight:1 } }, todoN + ' 件'),
        React.createElement('div',{ style:{ fontSize:12, color:'#B45309', marginTop:4 } }, '🖐 要対応（多くは物理・書面）')),
    ),
    // UX-06: タブ切り替えUI
    React.createElement('div',{
      style:{
        display:'flex', alignItems:'center', gap:'6px',
        marginBottom:'20px',
        background:'#F8FAF8', borderRadius:'10px',
        padding:'4px', width:'fit-content',
        border:'1px solid #DDE8DE'
      }
    },
      // 全項目タブ
      React.createElement('button',{
        style: activeTab === 'all' ? tabActive : tabInactive,
        onClick:() => setActiveTab('all')
      },
        React.createElement('i',{className:'ti ti-list-check','aria-hidden':'true',style:{fontSize:'15px'}}),
        '全項目',
        React.createElement('span',{
          style:{
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            minWidth:'18px', height:'18px', borderRadius:'9px',
            background: activeTab === 'all' ? 'rgba(255,255,255,.3)' : '#E2E8E2',
            color: activeTab === 'all' ? '#fff' : '#64748B',
            fontSize:'10px', fontWeight:700, padding:'0 4px'
          }
        }, total)
      ),
      // 未完了のみタブ
      React.createElement('button',{
        style: activeTab === 'incomplete' ? {...tabActive, background:'#B45309', boxShadow:'0 2px 8px rgba(180,83,9,.25)'} : tabInactive,
        onClick:() => setActiveTab('incomplete')
      },
        React.createElement('i',{className:'ti ti-alert-circle','aria-hidden':'true',style:{fontSize:'15px'}}),
        '未完了のみ',
        incompleteBadge
      )
    ),
    // 未完了タブで全部クリア済みの場合
    activeTab === 'incomplete' && incompleteCount === 0
      ? React.createElement('div',{
          style:{
            display:'flex', flexDirection:'column', alignItems:'center',
            justifyContent:'center', padding:'48px 24px',
            background:'#ECFDF5', borderRadius:'14px',
            border:'1px solid #A7F3D0', gap:'12px'
          }
        },
          React.createElement('div',{style:{fontSize:'36px'}},'🎉'),
          React.createElement('div',{style:{fontSize:'16px',fontWeight:700,color:'#065F46'}},
            '全項目クリア済みです！'
          ),
          React.createElement('div',{style:{fontSize:'13px',color:'#059669'}},
            'GAP申請の準備が整っています。帳票を出力して提出してください。'
          )
        )
      : React.createElement(GapChecklistPanel,{ gap:filteredGap, cats:filteredCats, open, setOpen, onToggle, ctx })
  )
}

// ── 生成される書類一覧（チェックリスト表示） ──────────────
function GapDocumentList({ sprayCount }) {
  const docs = [
    { icon:'file-text',   name:'農薬散布記録簿',     format:'PDF',   desc:'JGAP / GlobalGAP 様式 GAP-P-001　｜　'+sprayCount+'件の散布記録' },
    { icon:'file-spreadsheet', name:'施肥記録簿',     format:'Excel', desc:'肥料種別・施肥量・作業者の一覧（GAP様式 xlsx）' },
    { icon:'clipboard-check',  name:'審査チェックリスト概要', format:'PDF', desc:'カテゴリ別達成率サマリー（現在 '+CONFIG.CURRENT_YEAR+' 年度）' },
  ]
  return React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:'2px',marginBottom:'22px'}},
    ...docs.map((d,i) => React.createElement('div',{
      key:i,
      style:{display:'flex',alignItems:'center',gap:'14px',padding:'13px 4px',
             borderBottom: i<docs.length-1 ? '1px solid rgba(255,255,255,.08)' : 'none'}
    },
      React.createElement('div',{style:{
        width:'34px',height:'34px',borderRadius:'9px',
        background:'rgba(255,255,255,.08)',
        display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0
      }},
        React.createElement('i',{className:'ti ti-'+d.icon,'aria-hidden':'true',style:{fontSize:'17px',color:'#fff'}})
      ),
      React.createElement('div',{style:{flex:1}},
        React.createElement('div',{style:{fontWeight:600,fontSize:'13px',color:'#fff'}},d.name),
        React.createElement('div',{style:{fontSize:'11px',color:'rgba(255,255,255,.55)',marginTop:'2px'}},d.desc)
      ),
      React.createElement('span',{
        style:{fontSize:'10px',padding:'3px 10px',borderRadius:'20px',fontWeight:700,letterSpacing:'.04em',
               background:'rgba(255,255,255,.1)',color:'#fff',border:'1px solid rgba(255,255,255,.15)'}
      },d.format)
    ))
  )
}

// ── GAP達成率ヒーロー：①書類確認→②生成中→③完成 の「わー！」体験 ─
function GapExportHero({ done, total, pct, sprayCount, onGenerateAll, isGenerating, justCompleted }) {
  // 【主張を代作しない】昨年度の達成率は実データが無い（前年の達成率を保存していない）ため、
  // 以前の「昨年比+12pt」は逆算した常時プラスのモック値だった＝根拠なき改善主張（景表法/優良誤認リスク）。
  // 前年実績が保存されるまで昨年比バッジは表示しない。達成率%と項目数は事実なので残す。
  const lastYearPct = null            // 前年の達成率実績（未保存）。保存する仕組みを入れたら値を渡す。
  const hasLastYear = lastYearPct != null
  const delta = hasLastYear ? (pct - lastYearPct) : null

  return React.createElement('div',{
    style:{
      background:'#0A6B52',
      borderRadius:'16px', padding:'30px 32px', marginBottom:'16px',
      color:'#fff', boxShadow:'none',
      position:'relative', overflow:'hidden'
    }
  },
    React.createElement('div',{style:{display:'flex',alignItems:'flex-end',justifyContent:'space-between',flexWrap:'wrap',gap:'20px',marginBottom:'22px'}},
      React.createElement('div',null,
        React.createElement('div',{style:{fontSize:'12px',opacity:.65,letterSpacing:'.08em',marginBottom:'6px'}},'GAP 審査基準 達成率（全スキーム ' + total + '項目 基準）'),
        React.createElement('div',{style:{display:'flex',alignItems:'baseline',gap:'12px'}},
          React.createElement('span',{style:{fontSize:'46px',fontWeight:700,lineHeight:1,letterSpacing:'-.02em'}},pct+'%'),
          // 昨年比バッジ: 前年実績が保存されている時だけ表示（無根拠のモック表示を廃止）
          hasLastYear && React.createElement('span',{
            style:{fontSize:'12px',fontWeight:700,padding:'4px 10px',borderRadius:'20px',
                   background: delta >= 0 ? 'rgba(74,222,128,.18)' : 'rgba(248,113,113,.18)',
                   color: delta >= 0 ? '#86EFAC' : '#FCA5A5',
                   border: '1px solid ' + (delta >= 0 ? 'rgba(74,222,128,.35)' : 'rgba(248,113,113,.35)')}
          }, (delta >= 0 ? '▲ 昨年比+' : '▼ 昨年比') + delta + 'pt')
        ),
        React.createElement('div',{style:{fontSize:'12px',opacity:.6,marginTop:'6px'}},done+' / '+total+' 項目クリア')
      ),
      React.createElement('div',{style:{textAlign:'right'}},
        React.createElement('div',{style:{fontSize:'11px',opacity:.6,marginBottom:'4px'}},'GAP審査 提出書類パッケージ'),
        React.createElement('div',{style:{fontSize:'20px',fontWeight:700}},'3点の書類を一括生成')
      )
    ),
    React.createElement(GapDocumentList,{ sprayCount }),
    React.createElement('button',{
      onClick:onGenerateAll, disabled:isGenerating,
      style:{
        width:'100%', background: isGenerating ? 'rgba(255,255,255,.15)' : '#FAC775',
        color: isGenerating ? '#fff' : '#06382C', border:'none',
        borderRadius:'10px', padding:'16px', fontSize:'15px', fontWeight:700,
        cursor: isGenerating ? 'not-allowed' : 'pointer',
        display:'flex', alignItems:'center', justifyContent:'center', gap:'10px',
        transition:'all .2s', letterSpacing:'.02em'
      }
    },
      React.createElement('i',{
        className: 'ti ti-' + (isGenerating ? 'loader-2' : (justCompleted ? 'circle-check' : 'package')),
        'aria-hidden':'true',
        style:{fontSize:'18px', animation: isGenerating ? 'spin 0.8s linear infinite' : 'none'}
      }),
      isGenerating ? '生成中...' : (justCompleted ? '3点の書類が完成しました' : '書類パッケージを生成する')
    ),
    React.createElement('style',null,'@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}')
  )
}

// ── GapDocumentRegistry: 必要書類ナビ ＋ 文書管理台帳 ───────────
// 中川農園「01_必要文書一覧」の実データ(36文書)を、GAP原則ごとに整備状況で管理する。
// 「どのGAP項目に何の書類が要るか」で今福さんが迷わないようにする。整備済み/更新日/メモを永続化。
function GapDocumentRegistry({ gap, docsState, onUpdateDoc }) {
  const checks = (gap && gap.length) ? gap : INITIAL_GAP_CHECKS
  const docs   = INITIAL_GAP_DOCUMENTS
  const state  = docsState || {}                                  // { [docId]: {ready, updated, note} }（Appで農場スコープ永続化）
  const [filter, setFilter] = React.useState('all')               // 'all' | 'todo'

  const readyCount = docs.filter(d => state[d.id] && state[d.id].ready).length
  const pct = docs.length ? Math.round(readyCount / docs.length * 100) : 0

  const groups = {}
  docs.forEach(d => { (groups[d.smart] = groups[d.smart] || []).push(d) })
  const smartKeys = Object.keys(groups).sort((a, b) =>
    a === 'common' ? 1 : b === 'common' ? -1 : Number(a) - Number(b))

  const update = (id, patch) => { if (onUpdateDoc) onUpdateDoc(id, patch) }
  const dispName = (f) => f.replace(/^[0-9]{2}_/, '').replace(/^★/, '')

  return React.createElement('div', { className:'page' },
    React.createElement('div', { style:{ marginBottom:'6px' } },
      React.createElement('div', { className:'eyebrow' }, 'GAP DOCUMENT REGISTRY'),
      React.createElement('div', { className:'page-title' }, '必要書類ナビ / 文書管理台帳'),
      React.createElement('div', { className:'page-sub' }, '中川農園の必要文書一覧（実データ36文書）をGAP項目ごとに整備状況で管理します')
    ),
    // 進捗＋フィルタ
    React.createElement('div', { className:'card', style:{ marginBottom:'16px', display:'flex', alignItems:'center', gap:'20px', flexWrap:'wrap' } },
      React.createElement('div', { style:{ flex:1, minWidth:'220px' } },
        React.createElement('div', { className:'prog-label' },
          React.createElement('span', null, '整備状況（' + readyCount + '/' + docs.length + '文書）'),
          React.createElement('span', { style:{ color:'#0D9972', fontWeight:600 } }, pct + '%')
        ),
        React.createElement('div', { className:'prog-bg', style:{ height:'10px' } },
          React.createElement('div', { className:'prog-fill', style:{ width:pct + '%' } })
        )
      ),
      React.createElement('div', { style:{ display:'flex', gap:'6px', flexShrink:0 } },
        ...[['all','すべて'],['todo','未整備のみ']].map(([k,lab]) =>
          React.createElement('button', {
            key:k, onClick:()=>setFilter(k),
            className:'btn ' + (filter===k?'btn-primary':'btn-ghost'),
            style: filter===k ? {} : { borderColor:'#0D9972', color:'#0D9972' }
          }, lab)
        )
      )
    ),
    // 原則ごとの書類
    ...smartKeys.map(smart => {
      const list = groups[smart].filter(d => filter==='all' || !(state[d.id] && state[d.id].ready))
      if (!list.length) return null
      const cat = gapCategoryForSmart(smart, checks)
      const label = smart === 'common' ? '共通（全体）' : ('FV-Smart ' + smart + (cat ? '　' + cat : ''))
      const grpReady = groups[smart].filter(d => state[d.id] && state[d.id].ready).length
      return React.createElement('div', { key:smart, className:'card', style:{ marginBottom:'12px', padding:'14px 18px' } },
        React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' } },
          React.createElement('div', { style:{ fontSize:'13px', fontWeight:700, color:'#0A6B52' } }, label),
          React.createElement('span', { className:'badge ' + (grpReady===groups[smart].length?'badge-green':'badge-amber') }, grpReady + '/' + groups[smart].length + ' 整備')
        ),
        ...list.map(d => {
          const st = state[d.id] || {}
          return React.createElement('div', { key:d.id, style:{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 0', borderTop:'1px solid #F1F5F9', flexWrap:'wrap' } },
            React.createElement('label', { style:{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', flex:1, minWidth:'220px' } },
              React.createElement('input', { type:'checkbox', checked:!!st.ready,
                onChange:e=>{ update(d.id, { ready:e.target.checked, updated: e.target.checked ? (st.updated || new Date().toISOString().slice(0,10)) : st.updated }); },
                style:{ width:'16px', height:'16px', accentColor:'#0A6B52', cursor:'pointer', flexShrink:0 } }),
              React.createElement('span', { style:{ fontSize:'13px', color: st.ready ? '#0A6B52' : '#374151', fontWeight: st.ready ? 600 : 500 } }, dispName(d.file))
            ),
            React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'6px', flexShrink:0 } },
              React.createElement('span', { style:{ fontSize:'10px', color:'#94A3B8' } }, '更新日'),
              React.createElement('input', { type:'date', value: st.updated || '',
                onChange:e=>update(d.id, { updated:e.target.value }),
                style:{ fontSize:'11px', padding:'3px 6px', border:'1px solid #E2E8F0', borderRadius:5, color:'#475569' } })
            ),
            React.createElement('input', { type:'text', placeholder:'メモ（保管場所・担当など）', value: st.note || '',
              onChange:e=>update(d.id, { note:e.target.value }),
              style:{ fontSize:'11px', padding:'4px 8px', border:'1px solid #E2E8F0', borderRadius:5, width:'180px', flexShrink:0 } })
          )
        })
      )
    }),
    React.createElement('div', { style:{ fontSize:'11px', color:'#94A3B8', marginTop:'8px', lineHeight:1.6 } },
      '※ 一覧は中川農園「01_必要文書一覧」の実データに基づく雛形です。書類そのものはこのシステムには保存せず、整備状況・更新日・保管場所メモだけを管理します。'
    )
  )
}

// ── GapExport: 帳票出力 / 申請パッケージ専用ページ ─────────
function GapExport({ gap, records, fields, pesticides, ctx }) {
  const { exporting, done, total, pct, sprayCount,
          handleExportPDF, handleExportExcel, handleExportEmaff } = useGapBase({ gap, records, fields, pesticides, ctx })

  const [isGenerating, setIsGenerating] = React.useState(false)
  const [justCompleted, setJustCompleted] = React.useState(false)
  const [packageToast, setPackageToast] = React.useState(null)

  const handleGenerateAll = async () => {
    // まとめて出力は個別確認を出さず、ここで1回だけ確認する（二重ポップアップ防止）
    if (!(await confirmDownload({ icon:'🗂', title:'GAP書類3点をまとめて出力', desc:'農薬散布PDF・施肥Excelをまとめて出力します。', okLabel:'出力する' }))) return
    setIsGenerating(true)
    setJustCompleted(false)
    try {
      await Promise.all([
        new Promise(r => setTimeout(r, 800)),
        exportSprayPDF(records, fields, pesticides, true),   // skipConfirm=true
      ])
      exportFertilizerExcel(records, fields, true)           // skipConfirm=true
      setJustCompleted(true)
      setPackageToast('3点の書類が完成しました')
      setTimeout(() => setPackageToast(null), 3000)
      setTimeout(() => setJustCompleted(false), 4000)
    } catch (e) {
      showToast('書類パッケージの生成に失敗しました: ' + e.message, 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  return React.createElement('div',{className:'page'},
    packageToast && React.createElement('div',{
      style:{
        position:'fixed', bottom:'28px', right:'28px', zIndex:9999,
        background:'#065F46', color:'#fff', borderRadius:'10px',
        padding:'12px 20px', fontSize:'13px', fontWeight:500,
        boxShadow:'0 4px 20px rgba(0,0,0,0.18)',
        display:'flex', alignItems:'center', gap:'10px'
      }
    },
      React.createElement('span', null, '✅'),
      React.createElement('span', null, packageToast)
    ),
    React.createElement('div',{style:{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:'6px'}},
      React.createElement('div',null,
        React.createElement('div',{className:'eyebrow'},'GAP DOCUMENT EXPORT'),
        React.createElement('div',{className:'page-title'},'帳票出力 / 申請パッケージ'),
        React.createElement('div',{className:'page-sub'},'GAP審査提出用の書類を出力します')
      )
    ),
    React.createElement(GapProgressBar,{ done, total, pct }),
    React.createElement(GapExportHero,{
      done, total, pct, sprayCount,
      onGenerateAll: handleGenerateAll,
      isGenerating, justCompleted
    }),
    /* ── eMAFF連携CSV出力 ── */
    React.createElement('div',{className:'card',style:{marginBottom:'16px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'16px',flexWrap:'wrap'}},
      React.createElement('div',{style:{flex:1,minWidth:'240px'}},
        React.createElement('div',{style:{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}},
          React.createElement('span',{style:{fontSize:'16px'}},'🗺'),
          React.createElement('span',{style:{fontSize:'14px',fontWeight:700,color:'#1F2937'}},'eMAFF連携用CSV'),
          React.createElement('span',{style:{fontSize:'10px',padding:'2px 8px',borderRadius:'20px',background:'#EFF6FF',color:'#1D4ED8',border:'1px solid #BFDBFE',fontWeight:600}},'農地番号つき実績台帳')
        ),
        React.createElement('div',{style:{fontSize:'11.5px',color:'#6B7280',lineHeight:1.6}},
          '農薬散布・施肥・収穫の記録に、各圃場の eMAFF農地番号・所在地を紐づけて出力します。',
          React.createElement('br',null),
          '※ eMAFFの正式インポート様式は申請メニューごとに列並びが異なります。本CSVはその転記元となる台帳です。'
        )
      ),
      React.createElement('button',{
        className:'btn btn-ghost', onClick:handleExportEmaff,
        style:{ borderColor:'#0D9972', color:'#0D9972', flexShrink:0, fontWeight:600 }
      }, '🗺 eMAFF連携CSVを出力')
    ),
    /* ── 様式プレビューカード ── */
    React.createElement('div',{className:'card',style:{marginBottom:'16px'}},
      React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px'}},
        React.createElement(SectionTitle,{icon:'file-text',style:{margin:0}},'様式プレビュー（農薬散布記録簿）'),
        React.createElement('div',{style:{display:'flex',gap:'6px'}},
          React.createElement('span',{style:{fontSize:'10px',padding:'2px 8px',borderRadius:'20px',background:'#ECFDF5',color:CONFIG.COLOR.primary,border:'1px solid #A7F3D0',fontWeight:600}},'JGAP / GlobalGAP 様式'),
          React.createElement('span',{style:{fontSize:'10px',padding:'2px 8px',borderRadius:'20px',background:'#EFF6FF',color:'#1D4ED8',border:'1px solid #BFDBFE',fontWeight:600}},'GAP-P-001 Rev.3')
        )
      ),
      React.createElement('div',{style:{border:'1px solid #E2E8F0',borderRadius:'6px',overflow:'hidden',fontSize:'12px',background:'#fff',boxShadow:'0 2px 8px rgba(0,0,0,.06)'}},
        /* ヘッダー帯 */
        React.createElement('div',{style:{background:CONFIG.COLOR.primary,color:'#fff',padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}},
          React.createElement('div',null,
            React.createElement('div',{style:{fontSize:'15px',fontWeight:700,letterSpacing:'.06em'}},'農薬散布記録簿'),
            React.createElement('div',{style:{fontSize:'9px',opacity:.8,marginTop:'2px'}},'PESTICIDE APPLICATION RECORD　｜　JGAP / GlobalGAP 農薬管理基準様式　｜　※ 仮様式')
          ),
          React.createElement('div',{style:{textAlign:'right',fontSize:'9px'}},
            React.createElement('div',{style:{fontWeight:700,letterSpacing:'.05em'}},'様式番号：GAP-P-001'),
            React.createElement('div',{style:{opacity:.8}},'改訂：Rev.3　｜　'+new Date().getFullYear()+'年度版')
          )
        ),
        /* 農園情報行 */
        React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',borderBottom:'1px solid #cde8e0'}},
          ...[
            ['農業者名称 / Organization',CONFIG.FARM_NAME],
            ['JGAP認証番号 / Certificate No.',CONFIG.JGAP_CERT_NO],
            ['出力日 / Issued Date',''+new Date().toLocaleDateString('ja-JP',{year:'numeric',month:'long',day:'numeric'})+'（'+sprayCount+'件）']
          ].map(([label,val],i)=>
            React.createElement('div',{key:i,style:{padding:'7px 12px',borderRight:i<2?'1px solid #cde8e0':'none'}},
              React.createElement('div',{style:{fontSize:'8px',color:CONFIG.COLOR.primary,fontWeight:700,letterSpacing:'.06em',marginBottom:'2px'}},label),
              React.createElement('div',{style:{fontWeight:600,color:'#111',fontSize:'11px'}},val)
            )
          )
        ),
        /* 公印スペース */
        React.createElement('div',{style:{display:'flex',justifyContent:'flex-end',alignItems:'center',gap:'8px',padding:'8px 16px',borderBottom:'1px solid #E2E8F0'}},
          React.createElement('span',{style:{fontSize:'9px',color:'#9CA3AF'}},'捺印欄'),
          ...[['代表者印'],['管理責任者印']].map(([label])=>
            React.createElement('div',{key:label,style:{display:'flex',flexDirection:'column',alignItems:'center',gap:'3px'}},
              React.createElement('div',{style:{width:'52px',height:'52px',borderRadius:'50%',border:'1.5px dashed #CBD5E1',display:'flex',alignItems:'center',justifyContent:'center',background:'#FAFAFA'}},''),
              React.createElement('span',{style:{fontSize:'8px',color:'#9CA3AF'}},label)
            )
          )
        ),
        /* テーブル */
        React.createElement('div',{style:{overflowX:'auto'}},
          React.createElement('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'9px',minWidth:'640px'}},
            React.createElement('thead',null,
              React.createElement('tr',null,
                ...['No.','作業日','圃場名','作物名','農薬名（商品名）','農薬登録番号','希釈倍率','散布量(L/10a)','天気','作業者','収穫前日数制限'].map((h,i)=>
                  React.createElement('th',{key:i,style:{background:CONFIG.COLOR.primary,color:'#fff',padding:'5px 6px',textAlign:'center',border:'1px solid #088060',fontWeight:600,whiteSpace:'nowrap'}},h)
                )
              )
            ),
            React.createElement('tbody',null,
              ...records.filter(r=>r.work_type==='農薬散布').slice(0,3).map((r,i)=>{
                const field=masterById(fields, r.field_id)
                const pest=masterById(pesticides, r.pesticide_id)
                return React.createElement('tr',{key:r.id,style:{background:i%2===1?'#f4faf8':'#fff'}},
                  ...[i+1,r.date,field?field.name:'—',field?field.crop:'—',pest?pest.name:'—',pest?pest.reg_no:'—',r.dilution?r.dilution+'倍':'—',r.amount||'—',r.weather||'—',r.worker||'—',pest?pest.preharvest_days+'日':'—'].map((v,j)=>
                    React.createElement('td',{key:j,style:{padding:'4px 6px',border:'1px solid #ccc',textAlign:'center'}},v)
                  )
                )
              }),
              ...[0,1,2].map(i=>React.createElement('tr',{key:'empty-'+i},
                ...Array(11).fill(null).map((_,j)=>React.createElement('td',{key:j,style:{padding:'4px 6px',border:'1px solid #E5E7EB',height:'22px',background:i%2===1?'#f4faf8':'#fff'}},''))
              ))
            )
          )
        ),
        /* フッター */
        React.createElement('div',{style:{display:'flex',justifyContent:'space-between',padding:'8px 14px',borderTop:'1px solid #E2E8F0',background:'#FAFAFA'}},
          React.createElement('div',{style:{fontSize:'8.5px',color:'#6B7280',lineHeight:'1.6'}},
            React.createElement('div',null,'※ 本記録はJGAP基準 / GlobalGAP AF 4.1「農薬使用記録の保管（5年間）」に基づき作成'),
            React.createElement('div',null,'※ 使用農薬はすべて農薬取締法に基づく登録農薬であることを確認済み')
          ),
          React.createElement('div',{style:{fontSize:'8.5px',color:'#9CA3AF'}},'農場名　｜　1 / 1')
        )
      )
    ),
    React.createElement('div',{className:'card'},
      React.createElement(SectionTitle,{icon:'download'},'書類ダウンロード'),
      React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:'12px',padding:'8px 0'}},
        React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 0',borderBottom:'1px solid #F1F5F9'}},
          React.createElement('div',null,
            React.createElement('div',{style:{fontSize:'14px',fontWeight:600,color:'#374151'}},'農薬散布記録簿 (PDF)'),
            React.createElement('div',{style:{fontSize:'12px',color:'#6B7280',marginTop:'2px'}},'散布記録 '+sprayCount+'件 — JGAP様式')
          ),
          React.createElement('button',{className:'btn btn-primary',onClick:handleExportPDF,disabled:exporting,style:{background:exporting?CONFIG.COLOR.primaryDark:CONFIG.COLOR.primary}},exporting?'⏳ 生成中...':'📄 PDF出力')
        ),
        React.createElement('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 0'}},
          React.createElement('div',null,
            React.createElement('div',{style:{fontSize:'14px',fontWeight:600,color:'#374151'}},'施肥記録簿 (Excel)'),
            React.createElement('div',{style:{fontSize:'12px',color:'#6B7280',marginTop:'2px'}},'施肥記録 — GAP様式 xlsx')
          ),
          React.createElement('button',{className:'btn btn-ghost',onClick:handleExportExcel,style:{borderColor:'#0D9972',color:'#0D9972'}},'📊 Excel出力')
        )
      )
    )
  )
}

// ── GapFull: チェックリスト＋出力ボタンのフルページ ────────
function GapFull({ gap, onToggle, records, fields, pesticides, ctx }) {
  const { open, setOpen, exporting, done, total, pct, cats, sprayCount,
          handleExportPDF, handleExportExcel, handleExportEmaff } = useGapBase({ gap, records, fields, pesticides, ctx })
  return React.createElement('div',{className:'page'},
    React.createElement('div',{style:{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:'6px'}},
      React.createElement('div',null,
        React.createElement('div',{className:'eyebrow'},'GAP CHECKLIST'),
        React.createElement('div',{className:'page-title'},'GAP申請サポート'),
        React.createElement('div',{className:'page-sub'},'JGAP / GlobalGAP 対応チェックリスト')
      ),
      React.createElement(GapExportButtons,{ exporting, sprayCount, handleExportPDF, handleExportExcel, handleExportEmaff })
    ),
    React.createElement(GapProgressBar,{ done, total, pct }),
    React.createElement(GapChecklistPanel,{ gap, cats, open, setOpen, onToggle })
  )
}

// =====================================================
// C-4: 機器シェア予約カレンダー（完全実装）
// ・月次カレンダー表示（自社=緑 / 外部貸出=琥珀で色分け）
// ・カレンダーセルをクリック → 日付プリセット済みで予約フォームを開く
// ・ダブルブッキング防止ロジック（同機器×同日付をブロック）
// ・機器別フィルタータブ
// ※ EQUIP_LIST / EQUIP_DEFAULTS はファイル上部モックデータセクション参照（C06-4）
// =====================================================

// =====================================================
// 収益シミュレーター
// =====================================================
function RevenueSimulator() {
  const [equip,    setEquip]    = React.useState('トラクター')
  const [days,     setDays]     = React.useState(8)
  const [rate,     setRate]     = React.useState(EQUIP_DEFAULTS['トラクター'].rate)
  const [cost,     setCost]     = React.useState(EQUIP_DEFAULTS['トラクター'].cost)
  const [months,   setMonths]   = React.useState(12)

  const handleEquipChange = (e) => {
    const eq = e.target.value
    setEquip(eq)
    setRate(EQUIP_DEFAULTS[eq].rate)
    setCost(EQUIP_DEFAULTS[eq].cost)
  }

  const revenuePerDay  = rate - cost
  const revenuePerMonth = revenuePerDay * days
  const revenuePerYear  = revenuePerMonth * months
  const fmtYen = (n) => (n >= 10000
    ? Math.floor(n / 10000) + '万' + (n % 10000 > 0 ? (n % 10000).toLocaleString() : '') + '円'
    : n.toLocaleString() + '円')

  const barPct = Math.min(100, Math.round(revenuePerYear / 1200000 * 100))
  const barColor = revenuePerYear >= 500000 ? CONFIG.COLOR.primary : revenuePerYear >= 200000 ? CONFIG.COLOR.amber : '#6B7280'

  const scenarios = [
    { label: '月4日貸出', val: revenuePerDay * 4  * months },
    { label: '月8日貸出', val: revenuePerDay * 8  * months },
    { label: '月15日貸出',val: revenuePerDay * 15 * months },
  ]
  const maxScenario = Math.max(...scenarios.map(s => s.val))

  return React.createElement('div', { className:'page' },

    React.createElement('div', { style:{ marginBottom:'6px' } },
      React.createElement('div', { className:'eyebrow' }, 'REVENUE SIMULATOR'),
      React.createElement('div', { className:'page-title' },
        React.createElement('i', { className:'ti ti-currency-yen', 'aria-hidden':'true', style:{ fontSize:'20px', verticalAlign:'-2px', marginRight:'8px' } }),
        '機器シェア収益シミュレーター'
      ),
      React.createElement('div', { className:'page-sub' }, '農機の空き時間を貸し出すと年間いくら稼げるか試算できます')
    ),

    // ─── メインカード ───
    React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px', alignItems:'start' } },

      // 左: パラメーター入力
      React.createElement('div', { className:'card' },
        React.createElement(SectionTitle, { icon:'ruler-2' }, 'シミュレーション条件'),

        // 機器選択
        React.createElement('div', { className:'form-group' },
          React.createElement('label', { className:'form-label' }, '貸出機器'),
          React.createElement('select', {
            className:'form-select', value:equip, onChange:handleEquipChange
          }, ...EQUIP_LIST.map(e => React.createElement('option',{key:e,value:e},e)))
        ),

        // 月間貸出日数スライダー
        React.createElement('div', { className:'form-group' },
          React.createElement('div', { style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'6px'} },
            React.createElement('label', { className:'form-label', style:{marginBottom:0} }, '月間貸出日数'),
            React.createElement('span', { style:{fontSize:'22px',fontWeight:700,color:CONFIG.COLOR.primary} }, days+'日/月')
          ),
          React.createElement('input', {
            type:'range', min:1, max:25, step:1, value:days,
            onChange: e => setDays(Number(e.target.value)),
            style:{ width:'100%', accentColor:CONFIG.COLOR.primary, cursor:'pointer' }
          }),
          React.createElement('div', { style:{display:'flex',justifyContent:'space-between',fontSize:'10px',color:'#94A3B8',marginTop:'3px'} },
            React.createElement('span',null,'1日'),
            React.createElement('span',null,'週1回目安: 4日'),
            React.createElement('span',null,'25日')
          )
        ),

        // 1日あたり貸出単価
        React.createElement('div', { className:'form-group' },
          React.createElement('div', { style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'6px'} },
            React.createElement('label', { className:'form-label', style:{marginBottom:0} }, '1日あたり貸出単価'),
            React.createElement('span', { style:{fontSize:'22px',fontWeight:700,color:'#1D4ED8'} }, rate.toLocaleString()+'円')
          ),
          React.createElement('input', {
            type:'range', min:3000, max:80000, step:1000, value:rate,
            onChange: e => setRate(Number(e.target.value)),
            style:{ width:'100%', accentColor:'#1D4ED8', cursor:'pointer' }
          }),
          React.createElement('div', { style:{display:'flex',justifyContent:'space-between',fontSize:'10px',color:'#94A3B8',marginTop:'3px'} },
            React.createElement('span',null,'3,000円'),
            React.createElement('span',null,'市場相場'),
            React.createElement('span',null,'80,000円')
          )
        ),

        // 1日あたりコスト
        React.createElement('div', { className:'form-group' },
          React.createElement('div', { style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'6px'} },
            React.createElement('label', { className:'form-label', style:{marginBottom:0} }, '1日あたり燃料・消耗品代'),
            React.createElement('span', { style:{fontSize:'18px',fontWeight:600,color:'#C2410C'} }, '−'+cost.toLocaleString()+'円')
          ),
          React.createElement('input', {
            type:'range', min:0, max:10000, step:100, value:cost,
            onChange: e => setCost(Number(e.target.value)),
            style:{ width:'100%', accentColor:'#C2410C', cursor:'pointer' }
          }),
          React.createElement('div', { style:{display:'flex',justifyContent:'space-between',fontSize:'10px',color:'#94A3B8',marginTop:'3px'} },
            React.createElement('span',null,'0円'), React.createElement('span',null,'10,000円')
          )
        ),

        // 稼働月数
        React.createElement('div', { className:'form-group', style:{marginBottom:0} },
          React.createElement('div', { style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'6px'} },
            React.createElement('label', { className:'form-label', style:{marginBottom:0} }, '年間稼働月数（農繁期除く）'),
            React.createElement('span', { style:{fontSize:'22px',fontWeight:700,color:'#6D28D9'} }, months+'ヶ月')
          ),
          React.createElement('input', {
            type:'range', min:1, max:12, step:1, value:months,
            onChange: e => setMonths(Number(e.target.value)),
            style:{ width:'100%', accentColor:'#6D28D9', cursor:'pointer' }
          }),
          React.createElement('div', { style:{display:'flex',justifyContent:'space-between',fontSize:'10px',color:'#94A3B8',marginTop:'3px'} },
            React.createElement('span',null,'1ヶ月'), React.createElement('span',null,'12ヶ月（通年）')
          )
        )
      ),

      // 右: 結果パネル
      React.createElement('div', null,

        // メイン結果カード
        React.createElement('div', {
          className:'card',
          style:{ background:CONFIG.COLOR.primary, marginBottom:'14px', border:'none' }
        },
          React.createElement('div', { style:{fontSize:'12px',color:'rgba(255,255,255,.75)',marginBottom:'4px',fontWeight:600,letterSpacing:'.06em',textTransform:'uppercase'} }, '年間収益（試算）'),
          React.createElement('div', { style:{fontSize:'48px',fontWeight:700,color:'#FFFFFF',lineHeight:1,letterSpacing:'-.03em',margin:'8px 0'} },
            fmtYen(revenuePerYear)
          ),
          React.createElement('div', { style:{fontSize:'14px',color:'rgba(255,255,255,.8)',marginTop:'6px'} },
            '月間: '+fmtYen(revenuePerMonth)+'　／　1日純利益: '+fmtYen(revenuePerDay)
          ),

          // プログレスバー（120万円を100%とする）
          React.createElement('div', { style:{marginTop:'16px'} },
            React.createElement('div', { style:{height:'6px',background:'rgba(255,255,255,.25)',borderRadius:'4px',overflow:'hidden'} },
              React.createElement('div', {
                style:{ height:'100%', width:barPct+'%', background:'#FFFFFF', borderRadius:'4px', transition:'width .6s ease' }
              })
            ),
            React.createElement('div', { style:{fontSize:'10px',color:'rgba(255,255,255,.6)',marginTop:'4px',textAlign:'right'} }, '目標120万円の '+barPct+'%')
          )
        ),

        // 内訳カード
        React.createElement('div', { className:'card', style:{marginBottom:'14px'} },
          React.createElement(SectionTitle, { icon:'chart-bar' }, '月間内訳'),
          ...[
            { label:'貸出収入',   val:'+'+fmtYen(rate*days),         color:CONFIG.COLOR.primary, bold:true },
            { label:'経費（燃料等）', val:'−'+fmtYen(cost*days),     color:'#C2410C', bold:false },
            { label:'月間純利益', val:fmtYen(revenuePerMonth),        color:'#1D4ED8', bold:true },
          ].map(item =>
            React.createElement('div', {
              key:item.label,
              style:{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom:'1px solid #F1F5F9' }
            },
              React.createElement('span', { style:{fontSize:'14px',color:'#64748B'} }, item.label),
              React.createElement('span', { style:{fontSize:'14px',fontWeight:item.bold?700:400,color:item.color} }, item.val)
            )
          )
        ),

        // 比較シナリオ
        React.createElement('div', { className:'card' },
          React.createElement(SectionTitle, { icon:'arrows-shuffle' }, '貸出日数別シナリオ比較'),
          ...scenarios.map((s, i) =>
            React.createElement('div', { key:i, style:{ marginBottom:'10px' } },
              React.createElement('div', { style:{display:'flex',justifyContent:'space-between',fontSize:'12px',marginBottom:'4px'} },
                React.createElement('span', { style:{color:'#374151',fontWeight:500} }, s.label),
                React.createElement('span', { style:{color:CONFIG.COLOR.primary,fontWeight:700} }, fmtYen(s.val)+'/年')
              ),
              React.createElement('div', { style:{background:'#F1F5F9',borderRadius:'4px',height:'7px',overflow:'hidden'} },
                React.createElement('div', {
                  style:{
                    height:'100%', borderRadius:'4px',
                    width: (s.val / maxScenario * 100)+'%',
                    background: i===0 ? '#94A3B8' : i===1 ? '#0D9972' : CONFIG.COLOR.primary,
                    transition:'width .5s ease'
                  }
                })
              )
            )
          ),
          React.createElement('div', {
            style:{ marginTop:'10px', padding:'10px 12px', background:'#ECFDF5', border:'1px solid #A7F3D0', borderRadius:'8px', fontSize:'12px', color:'#065F46', lineHeight:1.6 }
          }, '💡 農繁期（4〜6月・9〜10月）を除いた閑散期に貸し出すだけで、'+equip+'1台で大きな副収入が生まれます。')
        )
      )
    )
  )
}

// =====================================================
// UX-07: 機器予約の詳細モーダル（確認・編集）
// ・カレンダーのイベント or 予約一覧の行クリックで開く
// ・機器/日付/種別/備考を編集して保存
// ・ダブルブッキング検知（自身を除外して判定）
// ・削除も可能（確認つき）
// =====================================================
function RentalDetailModal({ rental, onClose, onSave, onDelete, conflictCheck }) {
  const [form, setForm] = React.useState({ ...rental })
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  const isConflict = conflictCheck(form.equipment, form.date, rental.id)
  const isDirty = JSON.stringify(form) !== JSON.stringify(rental)

  return React.createElement('div', {
    style:{
      position:'fixed', inset:0, background:'rgba(17,24,39,.45)',
      display:'flex', alignItems:'center', justifyContent:'center',
      zIndex:1000, padding:'16px'
    },
    onClick: onClose
  },
    React.createElement('div', {
      className:'card',
      style:{ width:'420px', maxWidth:'100%', boxShadow:'0 8px 40px rgba(17,24,39,.25)' },
      onClick: e => e.stopPropagation()
    },
      // ヘッダー
      React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'14px' } },
        React.createElement(SectionTitle, { icon:'calendar-event' }, '予約の詳細'),
        React.createElement('button', {
          className:'btn btn-ghost', style:{ padding:'4px 8px', fontSize:'16px', lineHeight:1 },
          onClick: onClose
        }, '✕')
      ),

      // 機器
      React.createElement('div', { className:'form-group' },
        React.createElement('label', { className:'form-label' }, '機器'),
        React.createElement('select', {
          className:'form-select', value:form.equipment,
          onChange: e => setForm(f=>({...f, equipment:e.target.value}))
        }, ...EQUIP_LIST.map(e => React.createElement('option',{key:e,value:e},e)))
      ),

      // 日付
      React.createElement('div', { className:'form-group' },
        React.createElement('label', { className:'form-label' }, '日付'),
        React.createElement('input', {
          type:'date', className:'form-input', value:form.date,
          onChange: e => setForm(f=>({...f, date:e.target.value}))
        })
      ),

      // 種別
      React.createElement('div', { className:'form-group' },
        React.createElement('label', { className:'form-label' }, '種別'),
        React.createElement('select', {
          className:'form-select', value:form.type,
          onChange: e => setForm(f=>({...f, type:e.target.value}))
        },
          React.createElement('option',{value:'own'},'🟢 自社使用'),
          React.createElement('option',{value:'rent'},'🟡 外部貸出')
        )
      ),

      // 備考
      React.createElement('div', { className:'form-group' },
        React.createElement('label', { className:'form-label' }, '備考'),
        React.createElement('input', {
          type:'text', className:'form-input', value:form.note,
          onChange: e => setForm(f=>({...f, note:e.target.value})),
          placeholder:'例: A農園'
        })
      ),

      // ダブルブッキング警告
      isConflict && React.createElement('div', {
        style:{
          background:'#FEF2F2', border:'1px solid #F87171',
          borderRadius:'8px', padding:'10px 14px', marginBottom:'12px',
          fontSize:'14px', color:'#DC2626', display:'flex', gap:'8px', alignItems:'flex-start'
        }
      },
        React.createElement('span',null,'🚫'),
        React.createElement('div',null,
          React.createElement('div',{style:{fontWeight:600,marginBottom:'2px'}},'ダブルブッキング'),
          React.createElement('div',{style:{fontSize:'12px',color:'#991B1B'}},form.equipment+'はこの日付にすでに別の予約が入っています')
        )
      ),

      // 削除確認
      confirmDelete && React.createElement('div', {
        style:{
          background:'#FFF7ED', border:'1px solid #FDBA74',
          borderRadius:'8px', padding:'10px 14px', marginBottom:'12px',
          fontSize:'13px', color:'#9A3412'
        }
      }, 'この予約を削除します。よろしいですか？'),

      // アクション
      React.createElement('div', { style:{ display:'flex', gap:'8px', marginTop:'4px' } },
        confirmDelete
          ? React.createElement(React.Fragment, null,
              React.createElement('button', {
                className:'btn btn-primary', style:{ flex:1, background:'#DC2626', borderColor:'#DC2626' },
                onClick: () => onDelete(rental.id)
              }, '削除する'),
              React.createElement('button', {
                className:'btn btn-ghost',
                onClick: () => setConfirmDelete(false)
              }, 'キャンセル')
            )
          : React.createElement(React.Fragment, null,
              React.createElement('button', {
                className:'btn btn-primary', style:{ flex:1 },
                disabled: !form.date || !isDirty || isConflict,
                onClick: () => onSave(form)
              }, '保存する'),
              React.createElement('button', {
                className:'btn btn-ghost',
                style:{ color:'#DC2626', borderColor:'#FDBA74' },
                onClick: () => setConfirmDelete(true)
              }, '削除'),
              React.createElement('button', {
                className:'btn btn-ghost',
                onClick: onClose
              }, '閉じる')
            )
      )
    )
  )
}

// =====================================================
// Equipment — カレンダー／一覧 タブ切り替え + 機器フィルター
// ・上部: 機器フィルタータグ（すべて / 機器名）
// ・中段: ビュータブ（📅 カレンダー ／ 📋 一覧）
// ・カレンダービュー: セルクリック → 新規予約フォームをスライドイン
// ・一覧ビュー: ソート・件数バッジ付きテーブル + 予約追加ボタン
// =====================================================
function Equipment({ rentals, onAdd, onUpdate, onDelete }) {
  const [viewTab,  setViewTab]  = React.useState('calendar') // 'calendar' | 'list'
  const [filterEq, setFilterEq] = React.useState('すべて')
  const [mo,       setMo]       = React.useState(new Date().getMonth() + 1)
  const [showForm, setShowForm]  = React.useState(false)
  const [form,     setForm]     = React.useState({ equipment:'トラクター', date:'', type:'own', note:'' })
  const [selectedRental, setSelectedRental] = React.useState(null)
  // 一覧ビュー: ソート
  const [sortKey,  setSortKey]  = React.useState('date') // 'date' | 'equipment' | 'type'
  const [sortAsc,  setSortAsc]  = React.useState(true)

  const year     = 2026
  const days     = new Date(year, mo, 0).getDate()
  const firstDow = new Date(year, mo - 1, 1).getDay()

  const isConflict = form.date && hasDateConflict(rentals, form.equipment, form.date)

  const handleAdd = () => {
    if (!form.date || isConflict) return
    onAdd({ ...form, id: Date.now() })
    setForm({ equipment:'トラクター', date:'', type:'own', note:'' })
    setShowForm(false)
  }

  const handleDayClick = (dateStr) => {
    setForm(f => ({ ...f, date: dateStr }))
    setShowForm(true)
    // カレンダービューのまま、フォームはスライドイン
  }

  const openAddForm = () => {
    setForm(f => ({ ...f, date:'' }))
    setShowForm(s => !s)
  }

  // フィルター適用済みリスト
  const visibleRentals = filterEq === 'すべて'
    ? rentals
    : rentals.filter(r => r.equipment === filterEq)

  // 一覧ビュー: ソート
  const sortedRentals = React.useMemo(() => {
    return [...visibleRentals].sort((a, b) => {
      const va = a[sortKey] || ''
      const vb = b[sortKey] || ''
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
    })
  }, [visibleRentals, sortKey, sortAsc])

  const toggleSort = (key) => {
    if (sortKey === key) setSortAsc(v => !v)
    else { setSortKey(key); setSortAsc(true) }
  }

  // ── 統計バッジ（フィルター後）
  const ownCount  = visibleRentals.filter(r => r.type === 'own').length
  const rentCount = visibleRentals.filter(r => r.type === 'rent').length

  // ── スタイル定数
  const TAB_BASE = {
    display:'inline-flex', alignItems:'center', gap:'6px',
    padding:'8px 20px', border:'none', cursor:'pointer',
    fontSize:'13px', fontWeight:600, transition:'all .15s',
  }

  // ── 新規予約フォーム（カレンダー・一覧両ビューで共用）
  const AddForm = () => React.createElement('div', {
    style:{
      background:'#F6FBF7', border:'1px solid #C8E6D0',
      borderRadius:'12px', padding:'20px', marginBottom:'16px',
      animation:'fadeInDown .18s ease',
    }
  },
    React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' } },
      React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px' } },
        React.createElement('div', { style:{ width:30, height:30, borderRadius:'8px', background:'#ECFDF5', display:'flex', alignItems:'center', justifyContent:'center' } },
          React.createElement('i', { className:'ti ti-calendar-plus', style:{ fontSize:'15px', color:CONFIG.COLOR.primary } })
        ),
        React.createElement('span', { style:{ fontSize:'14px', fontWeight:700, color:'#111827' } }, '新規予約登録'),
      ),
      React.createElement('button', {
        onClick: () => setShowForm(false),
        style:{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:'18px', lineHeight:1, padding:'4px' }
      }, React.createElement('i', { className:'ti ti-x' }))
    ),
    React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' } },
      // 機器
      React.createElement('div', { className:'form-group', style:{ marginBottom:0 } },
        React.createElement('label', { className:'form-label' }, '機器'),
        React.createElement('select', {
          className:'form-select', value:form.equipment,
          onChange: e => setForm(f=>({...f, equipment:e.target.value}))
        }, ...EQUIP_LIST.map(e => React.createElement('option',{key:e,value:e},e)))
      ),
      // 日付
      React.createElement('div', { className:'form-group', style:{ marginBottom:0 } },
        React.createElement('label', { className:'form-label' }, '日付'),
        React.createElement('input', {
          type:'date', className:'form-input', value:form.date,
          onChange: e => setForm(f=>({...f, date:e.target.value}))
        })
      ),
      // 種別
      React.createElement('div', { className:'form-group', style:{ marginBottom:0 } },
        React.createElement('label', { className:'form-label' }, '種別'),
        React.createElement('select', {
          className:'form-select', value:form.type,
          onChange: e => setForm(f=>({...f, type:e.target.value}))
        },
          React.createElement('option',{value:'own'},'🟢 自社使用'),
          React.createElement('option',{value:'rent'},'🟡 外部貸出')
        )
      ),
      // 備考
      React.createElement('div', { className:'form-group', style:{ marginBottom:0 } },
        React.createElement('label', { className:'form-label' }, '備考'),
        React.createElement('input', {
          type:'text', className:'form-input', value:form.note,
          onChange: e => setForm(f=>({...f, note:e.target.value})),
          placeholder:'例: A農園'
        })
      ),
    ),
    // ダブルブッキング警告
    isConflict && React.createElement('div', {
      style:{ background:'#FEF2F2', border:'1px solid #F87171', borderRadius:'8px', padding:'10px 14px', marginTop:'12px', fontSize:'13px', color:'#DC2626', display:'flex', gap:'8px', alignItems:'center' }
    },
      React.createElement('i', { className:'ti ti-alert-circle', style:{ fontSize:'16px', flexShrink:0 } }),
      React.createElement('span', null, form.equipment + ' はこの日にすでに予約が入っています（ダブルブッキング）')
    ),
    React.createElement('div', { style:{ display:'flex', gap:'8px', marginTop:'14px' } },
      React.createElement('button', {
        className:'btn btn-primary', style:{ flex:1 },
        disabled: !form.date || isConflict,
        onClick: handleAdd
      },
        React.createElement('i', { className:'ti ti-check', style:{ fontSize:'14px' } }),
        '　登録する'
      ),
      React.createElement('button', {
        className:'btn btn-ghost',
        onClick: () => setShowForm(false)
      }, 'キャンセル')
    )
  )

  // ── カレンダービュー
  const CalendarView = () => React.createElement('div', null,
    // フォーム（スライドイン）
    showForm && React.createElement(AddForm),

    // 月ナビ + 凡例
    React.createElement('div', {
      style:{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px', flexWrap:'wrap' }
    },
      React.createElement('button', {
        className:'btn btn-ghost', style:{ padding:'6px 12px' },
        onClick: () => setMo(m => Math.max(1, m-1))
      }, React.createElement('i', { className:'ti ti-chevron-left', style:{ fontSize:'14px' } })),
      React.createElement('div', {
        style:{ fontSize:'16px', fontWeight:700, color:'#111827', minWidth:'90px', textAlign:'center' }
      }, year + '年 ' + mo + '月'),
      React.createElement('button', {
        className:'btn btn-ghost', style:{ padding:'6px 12px' },
        onClick: () => setMo(m => Math.min(12, m+1))
      }, React.createElement('i', { className:'ti ti-chevron-right', style:{ fontSize:'14px' } })),
      React.createElement('div', { style:{ marginLeft:'auto', display:'flex', gap:'10px', alignItems:'center', fontSize:'11px', color:'#64748B' } },
        React.createElement('span', { style:{ display:'flex', alignItems:'center', gap:'4px' } },
          React.createElement('span', { style:{ width:10, height:10, borderRadius:'2px', background:'#ECFDF5', border:'1px solid #6EE7B7', display:'inline-block' } }),
          '自社'
        ),
        React.createElement('span', { style:{ display:'flex', alignItems:'center', gap:'4px' } },
          React.createElement('span', { style:{ width:10, height:10, borderRadius:'2px', background:'#FFFBEB', border:'1px solid #FDE68A', display:'inline-block' } }),
          '外部貸出'
        ),
        React.createElement('span', { style:{ display:'flex', alignItems:'center', gap:'4px' } },
          React.createElement('span', { style:{ width:10, height:10, borderRadius:'2px', background:'#FEF2F2', border:'1px solid #FECACA', display:'inline-block' } }),
          '競合'
        ),
      )
    ),

    // 曜日ヘッダー
    React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'3px', marginBottom:'3px' } },
      ...['日','月','火','水','木','金','土'].map((d, i) =>
        React.createElement('div', {
          key: d,
          style:{ fontSize:'11px', textAlign:'center', padding:'5px 2px', fontWeight:700,
                  color: i===0?'#DC2626': i===6?'#2563EB':'#94A3B8' }
        }, d)
      )
    ),

    // カレンダーグリッド
    React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'3px' } },
      ...[...Array(firstDow)].map((_, i) => React.createElement('div', { key:'e'+i, style:{ minHeight:64 } })),
      ...[...Array(days)].map((_, i) => {
        const d       = i + 1
        const dateStr = year + '-' + String(mo).padStart(2,'0') + '-' + String(d).padStart(2,'0')
        const dayR    = visibleRentals.filter(r => r.date === dateStr)
        const isToday = dateStr === todayYmd()
        const dow     = (firstDow + i) % 7
        const hasDbl  = EQUIP_LIST.some(eq => rentals.filter(r => r.date===dateStr && r.equipment===eq).length > 1)

        return React.createElement('div', {
          key: d,
          className: 'cal-day',
          onClick: () => handleDayClick(dateStr),
          style:{
            minHeight: 64,
            cursor: 'pointer',
            borderColor: isToday ? CONFIG.COLOR.primary : hasDbl ? '#F87171' : '#E2E8F0',
            background: isToday ? '#F0FDF9' : '#FFFFFF',
            transition: 'background .1s, box-shadow .1s',
            position: 'relative',
          }
        },
          React.createElement('div', {
            style:{
              fontSize:'11px', fontWeight:700, marginBottom:'3px',
              color: isToday ? CONFIG.COLOR.primary : dow===0 ? '#DC2626' : dow===6 ? '#2563EB' : '#374151',
            }
          }, isToday ? '● ' + d : d),
          ...dayR.map(r =>
            React.createElement('div', {
              key: r.id,
              className: 'cal-event ' + r.type,
              title: r.equipment + ' — ' + (r.note||'') + '（クリックで詳細）',
              onClick: e => { e.stopPropagation(); setSelectedRental(r) },
              style:{ fontSize:'9px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', cursor:'pointer', marginBottom:'1px' }
            },
              React.createElement('i', { className:'ti ti-'+(r.type==='own'?'tractor':'arrow-right'), style:{ fontSize:'8px', marginRight:'2px' } }),
              r.equipment.length > 4 ? r.equipment.slice(0,4)+'…' : r.equipment
            )
          )
        )
      })
    ),

    // 月サマリー
    React.createElement('div', {
      style:{ display:'flex', gap:'16px', marginTop:'10px', paddingTop:'10px', borderTop:'1px solid #EDF2ED', fontSize:'12px', color:'#64748B', alignItems:'center' }
    },
      React.createElement('span', { style:{ display:'flex', alignItems:'center', gap:'4px' } },
        React.createElement('span', { style:{ width:8, height:8, borderRadius:'50%', background:CONFIG.COLOR.primary, display:'inline-block' } }),
        '自社 ' + ownCount + '件'
      ),
      React.createElement('span', { style:{ display:'flex', alignItems:'center', gap:'4px' } },
        React.createElement('span', { style:{ width:8, height:8, borderRadius:'50%', background:'#D97706', display:'inline-block' } }),
        '外部貸出 ' + rentCount + '件'
      ),
      React.createElement('span', { style:{ color:'#94A3B8' } }, '計 ' + visibleRentals.length + '件'),
      React.createElement('span', { style:{ marginLeft:'auto', fontSize:'11px', color:'#94A3B8' } }, '📅 日付セルをクリックして予約追加')
    )
  )

  // ── 一覧ビュー
  const ListView = () => {
    const SortTh = ({ label, k }) => {
      const active = sortKey === k
      return React.createElement('th', {
        onClick: () => toggleSort(k),
        style:{ cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }
      },
        React.createElement('span', { style:{ display:'inline-flex', alignItems:'center', gap:'4px', color: active ? CONFIG.COLOR.primary : '#64748B' } },
          label,
          React.createElement('i', {
            className: 'ti ti-' + (active ? (sortAsc ? 'sort-ascending' : 'sort-descending') : 'selector'),
            style:{ fontSize:'11px' }
          })
        )
      )
    }

    return React.createElement('div', null,
      // フォーム（スライドイン）
      showForm && React.createElement(AddForm),

      // 統計サマリーカード 3枚
      React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px', marginBottom:'16px' } },
        React.createElement('div', { className:'stat-card green' },
          React.createElement('div', { className:'stat-n' }, ownCount),
          React.createElement('div', { className:'stat-l' }, '自社使用件数')
        ),
        React.createElement('div', { className:'stat-card amber' },
          React.createElement('div', { className:'stat-n' }, rentCount),
          React.createElement('div', { className:'stat-l' }, '外部貸出件数')
        ),
        React.createElement('div', { className:'stat-card blue' },
          React.createElement('div', { className:'stat-n' }, visibleRentals.length),
          React.createElement('div', { className:'stat-l' }, '合計予約件数')
        ),
      ),

      // テーブル
      visibleRentals.length === 0
        ? React.createElement('div', {
            style:{ background:'#F8FAFF', border:'1.5px dashed #C8D0DC', borderRadius:'10px', padding:'40px', textAlign:'center', color:'#94A3B8' }
          },
            React.createElement('i', { className:'ti ti-calendar-off', style:{ fontSize:'32px', display:'block', marginBottom:'8px' } }),
            React.createElement('div', { style:{ fontSize:'14px', fontWeight:500 } }, '予約がありません'),
            React.createElement('div', { style:{ fontSize:'12px', marginTop:'4px' } }, '右上の「+ 予約」から登録できます')
          )
        : React.createElement('div', { className:'card card-data' },
            React.createElement('table', { className:'table' },
              React.createElement('thead', null,
                React.createElement('tr', null,
                  React.createElement(SortTh, { label:'機器', k:'equipment' }),
                  React.createElement(SortTh, { label:'日付', k:'date' }),
                  React.createElement(SortTh, { label:'種別', k:'type' }),
                  React.createElement('th', null, '備考'),
                  React.createElement('th', null, '')
                )
              ),
              React.createElement('tbody', null,
                ...sortedRentals.map(r => {
                  const isUpcoming = r.date >= todayYmd()
                  return React.createElement('tr', {
                    key: r.id,
                    onClick: () => setSelectedRental(r),
                    style:{ cursor:'pointer', opacity: isUpcoming ? 1 : 0.6 }
                  },
                    React.createElement('td', { style:{ fontWeight:600, color:'#374151' } },
                      React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px' } },
                        React.createElement('div', {
                          style:{ width:28, height:28, borderRadius:'6px', background:'#F0F4F8', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }
                        }, React.createElement('i', { className:'ti ti-tractor', style:{ fontSize:'14px', color:'#64748B' } })),
                        r.equipment
                      )
                    ),
                    React.createElement('td', null,
                      React.createElement('span', { style:{ fontWeight: isUpcoming ? 600 : 400, color: isUpcoming ? '#111827' : '#94A3B8' } }, r.date),
                      isUpcoming && React.createElement('span', {
                        style:{ fontSize:'10px', marginLeft:'6px', background:'#EFF6FF', color:'#1D4ED8', border:'1px solid #BFDBFE', borderRadius:'4px', padding:'1px 5px', fontWeight:600 }
                      }, '予定')
                    ),
                    React.createElement('td', null,
                      React.createElement('span', { className:'badge ' + (r.type==='own' ? 'badge-green' : 'badge-amber') },
                        r.type === 'own' ? '自社使用' : '外部貸出'
                      )
                    ),
                    React.createElement('td', { style:{ color:'#6B7280', fontSize:'12px' } }, r.note || '—'),
                    React.createElement('td', { style:{ textAlign:'right', paddingRight:'16px' }, onClick: e => e.stopPropagation() },
                      React.createElement('button', {
                        onClick: () => setSelectedRental(r),
                        style:{ fontSize:'11px', fontWeight:600, color:CONFIG.COLOR.primary, background:'#F0FDF9', border:'1px solid #6EE7B7', borderRadius:'6px', padding:'3px 10px', cursor:'pointer' }
                      }, '詳細 / 編集')
                    )
                  )
                })
              )
            )
          )
    )
  }

  return React.createElement('div', { className:'page' },

    // ── ページヘッダー
    React.createElement('div', { style:{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'16px' } },
      React.createElement('div', null,
        React.createElement('div', { className:'eyebrow' }, 'EQUIPMENT BOOKING'),
        React.createElement('div', { className:'page-title' }, '機器シェア予約'),
        React.createElement('div', { className:'page-sub', style:{ marginBottom:0 } }, '農機具の自家使用・外部貸出スケジュールを管理します')
      ),
      React.createElement('button', {
        className: 'btn btn-primary',
        style:{ display:'flex', alignItems:'center', gap:'6px' },
        onClick: openAddForm
      },
        React.createElement('i', { className: showForm ? 'ti ti-x' : 'ti ti-plus', style:{ fontSize:'14px' } }),
        showForm ? 'キャンセル' : '予約を追加'
      )
    ),

    // ── 機器フィルター + ビュータブ（同一行）
    React.createElement('div', {
      style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px', gap:'12px', flexWrap:'wrap' }
    },

      // 機器フィルター（チップ型）
      React.createElement('div', { style:{ display:'flex', gap:'6px', flexWrap:'wrap', alignItems:'center' } },
        React.createElement('span', { style:{ fontSize:'11px', fontWeight:700, color:'#94A3B8', letterSpacing:'.06em', marginRight:'2px' } }, '機器'),
        ...['すべて', ...EQUIP_LIST].map(eq => {
          const count = eq === 'すべて' ? rentals.length : rentals.filter(r => r.equipment === eq).length
          return React.createElement('button', {
            key: eq,
            onClick: () => setFilterEq(eq),
            style:{
              display:'inline-flex', alignItems:'center', gap:'5px',
              padding:'4px 12px', borderRadius:'20px', fontSize:'12px', fontWeight:600,
              cursor:'pointer', border:'1px solid', transition:'all .12s',
              borderColor: filterEq===eq ? CONFIG.COLOR.primary : '#DDE2EC',
              background:  filterEq===eq ? CONFIG.COLOR.primary : '#FFFFFF',
              color:       filterEq===eq ? '#FFFFFF' : '#64748B',
            }
          },
            eq,
            React.createElement('span', {
              style:{
                fontSize:'10px', fontWeight:700, minWidth:'16px', height:'16px',
                borderRadius:'8px', display:'inline-flex', alignItems:'center', justifyContent:'center',
                background: filterEq===eq ? 'rgba(255,255,255,.25)' : '#F1F5F9',
                color:       filterEq===eq ? '#FFFFFF' : '#94A3B8',
              }
            }, count)
          )
        })
      ),

      // ビュータブ（カレンダー ／ 一覧）
      React.createElement('div', {
        style:{ display:'flex', background:'#F1F5F1', borderRadius:'10px', padding:'3px', flexShrink:0 }
      },
        ...[
          { id:'calendar', label:'カレンダー', icon:'calendar-month' },
          { id:'list',     label:'一覧',       icon:'list-details'    },
        ].map(tab =>
          React.createElement('button', {
            key: tab.id,
            onClick: () => setViewTab(tab.id),
            style:{
              ...TAB_BASE,
              borderRadius:'8px',
              background:  viewTab === tab.id ? '#FFFFFF' : 'transparent',
              color:       viewTab === tab.id ? CONFIG.COLOR.primary : '#94A3B8',
              boxShadow:   viewTab === tab.id ? '0 1px 4px rgba(17,24,39,.10)' : 'none',
            }
          },
            React.createElement('i', { className:'ti ti-'+tab.icon, style:{ fontSize:'14px' } }),
            tab.label
          )
        )
      )
    ),

    // ── ビュー本体
    viewTab === 'calendar'
      ? React.createElement(CalendarView)
      : React.createElement(ListView),

    // 予約詳細モーダル
    selectedRental && React.createElement(RentalDetailModal, {
      rental: selectedRental,
      onClose: () => setSelectedRental(null),
      onSave:   r  => { onUpdate(r); setSelectedRental(null) },
      onDelete: id => { onDelete(id); setSelectedRental(null) },
      conflictCheck: (equipment, date, excludeId) =>
        rentals.some(x => x.id !== excludeId && x.equipment === equipment && x.date === date)
    })
  )
}

// =====================================================
// C-5: スタッフ名簿 + ビザ期限アラート（完全実装）
// ・ビザ期限30日以内 → 赤バッジ（C-5仕様通り）
// ・30〜60日 → 黄バッジで事前警告
// ・期限切れ → 専用エラー表示
// ・ページ上部にアラートバナー（要対応者をまとめて表示）
// ・役割別統計サマリー
// ・ビザ期限昇順ソート（要対応者が上位に来る）
// =====================================================
// UX-09: スタッフ追加を「モーダル」化 + ビザ管理機能を削除（組合が管理するため不要）+ カード一覧をグリッド化
function StaffList({ staff, onAdd, onDelete, onUpdate }) {
  const [showAddModal, setShowAddModal] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState(null)
  const [selectedStaff, setSelectedStaff] = React.useState(null)  // 【Step1-3】詳細モーダル対象
  const [toast, setToast]               = React.useState(null)  // 登録完了トースト

  const roleLabel = ROLE_LABEL
  const natLabel  = NAT_LABEL
  const avatarPalette = [CONFIG.COLOR.primary,'#1D4ED8','#B45309','#6D28D9','#C2410C','#0369A1','#047857']

  // UX-09: 登録ハンドラ — モーダルから受け取った form をそのまま登録
  const handleAdd = (form) => {
    if (!form.name.trim()) return
    const newStaff = { name:form.name, name_kana:(form.name_kana||'').trim(), nationality:form.nationality, role:form.role, id:Date.now(), avatar:form.name.slice(0,2), skills:[] }
    onAdd(newStaff)
    setShowAddModal(false)
    setToast(newStaff.name + ' を登録しました')
    setTimeout(() => setToast(null), 3000)
  }

  const roleCounts = Object.keys(roleLabel).reduce((acc, r) => {
    acc[r] = staff.filter(s => s.role === r).length
    return acc
  }, {})

  // UX-09: スタッフ追加モーダル（氏名・国籍・役割のみ。ビザ期限は組合管理のため削除）
  const StaffAddModal = ({ onClose, onSave }) => {
    const [form, setForm] = React.useState({ name:'', name_kana:'', nationality:'JP', role:'worker' })
    // kanaTouched: カタカナ欄をユーザーが一度でも手動編集したら true。
    // true になった後は氏名を変更しても自動上書きしない（手直しした内容を勝手に消さないため）
    const [kanaTouched, setKanaTouched] = React.useState(false)
    const uf = (k, v) => setForm(f => ({ ...f, [k]: v }))
    const canSave = form.name.trim().length > 0

    // 氏名が変わるたびカタカナを自動生成（まだ手で触っていない場合のみ）
    const handleNameChange = (value) => {
      setForm(f => ({
        ...f,
        name: value,
        name_kana: kanaTouched ? f.name_kana : romajiToKatakana(value)
      }))
    }
    const handleKanaChange = (value) => {
      setKanaTouched(true)
      uf('name_kana', value)
    }
    // 手動編集後でも「自動生成に戻す」をワンクリックでできるように
    const regenerateKana = () => {
      setKanaTouched(false)
      uf('name_kana', romajiToKatakana(form.name))
    }

    const inputStyle = { width:'100%', padding:'8px 10px', borderRadius:'6px', border:'1px solid #D1D5DB', fontSize:'13px', color:'#111827', boxSizing:'border-box', outline:'none' }
    const labelStyle = { fontSize:'10px', fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:'4px' }
    return React.createElement('div', {
      style:{ position:'fixed', inset:0, background:'rgba(17,24,39,.5)', zIndex:2100, display:'flex', alignItems:'center', justifyContent:'center' },
      onClick: onClose
    },
      React.createElement('div', {
        style:{ background:'#FFFFFF', borderRadius:'12px', padding:'24px', width:'440px', maxWidth:'95vw', maxHeight:'92vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.25)', animation:'fadeInDown .18s ease' },
        onClick: e => e.stopPropagation()
      },
        // ヘッダー
        React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'20px' } },
          React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'10px' } },
            React.createElement('div', { style:{ width:36, height:36, borderRadius:'50%', background:'#0A6B52', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 } },
              React.createElement('i', { className:'ti ti-user-plus', style:{ fontSize:'18px', color:'#FFFFFF' } })
            ),
            React.createElement('div', null,
              React.createElement('div', { style:{ fontSize:'15px', fontWeight:700, color:'#111827' } }, 'スタッフを追加'),
              React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280' } }, '氏名・国籍・役割を登録します')
            )
          ),
          React.createElement('button', {
            onClick: onClose,
            style:{ background:'none', border:'none', cursor:'pointer', fontSize:'20px', color:'#9CA3AF', lineHeight:1, padding:'4px' }
          }, '✕')
        ),

        // 氏名
        React.createElement('div', { style:{ marginBottom:'14px' } },
          React.createElement('label', { style: labelStyle }, '氏名 *'),
          React.createElement('input', {
            type:'text', value:form.name, autoFocus:true,
            onChange: e => handleNameChange(e.target.value),
            placeholder:'山田 一郎 / Nguyen Van B',
            onKeyDown: e => { if (e.key==='Enter' && canSave) onSave(form) },
            style: inputStyle
          })
        ),

        // 【スタッフ カタカナ表記】カタカナ表記（氏名から自動生成・手直し可能）
        React.createElement('div', { style:{ marginBottom:'14px' } },
          React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'4px' } },
            React.createElement('label', { style:{ ...labelStyle, marginBottom:0 } }, 'カタカナ表記'),
            form.name.trim() && React.createElement('button', {
              type:'button',
              onClick: regenerateKana,
              title:'氏名から自動生成し直す',
              style:{ background:'none', border:'none', cursor:'pointer', fontSize:'10px', color:'#0A6B52', fontWeight:600, display:'flex', alignItems:'center', gap:'3px' }
            },
              React.createElement('i', { className:'ti ti-refresh', style:{ fontSize:'11px' } }),
              '自動生成し直す'
            )
          ),
          React.createElement('input', {
            type:'text', value: form.name_kana,
            onChange: e => handleKanaChange(e.target.value),
            placeholder:'グエン・バン・ビー',
            style: inputStyle
          }),
          React.createElement('div', { style:{ fontSize:'10px', color:'#9CA3AF', marginTop:'3px' } },
            '氏名から自動入力されます。読み方が違う場合は直接修正してください。'
          )
        ),

        // 国籍・役割（2カラム）
        React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'20px' } },
          React.createElement('div', null,
            React.createElement('label', { style: labelStyle }, '国籍'),
            React.createElement('select', {
              value: form.nationality,
              onChange: e => uf('nationality', e.target.value),
              style: inputStyle
            }, ...Object.entries(natLabel).map(([v,l]) => React.createElement('option', { key:v, value:v }, l)))
          ),
          React.createElement('div', null,
            React.createElement('label', { style: labelStyle }, '役割'),
            React.createElement('select', {
              value: form.role,
              onChange: e => uf('role', e.target.value),
              style: inputStyle
            }, ...Object.entries(roleLabel).map(([v,l]) => React.createElement('option', { key:v, value:v }, l)))
          )
        ),

        // ボタン群
        React.createElement('div', { style:{ display:'flex', gap:'8px' } },
          React.createElement('button', {
            onClick: onClose,
            style:{ flex:1, padding:'10px 18px', borderRadius:'6px', border:'1px solid #D1D5DB', background:'#fff', color:'#374151', fontSize:'13px', fontWeight:600, cursor:'pointer' }
          }, 'キャンセル'),
          React.createElement('button', {
            onClick: () => { if (!canSave) { showToast('名前を入力してください', 'warn'); return } onSave(form) },
            style:{ flex:2, padding:'10px 18px', borderRadius:'6px', border:'none', fontSize:'13px', fontWeight:700, cursor: canSave ? 'pointer' : 'not-allowed',
              background: canSave ? '#0A6B52' : '#D1D5DB', color:'#fff' }
          }, '登録する')
        )
      )
    )
  }

  // 【スタッフ スキル管理 Step1-4】詳細モーダル（スキル編集UI付き）
  const StaffDetailModal = ({ staffMember, onClose, onSave }) => {
    // editSkills: 編集中のスキル配列（保存前はローカルstateで保持）
    const [editSkills, setEditSkills] = React.useState(staffMember.skills || [])
    // expandedSkillId: インライン編集フォームを開いているスキルID
    const [expandedSkillId, setExpandedSkillId] = React.useState(null)
    const [dirty, setDirty] = React.useState(false)  // 未保存変更あり
    // 【スタッフ カタカナ表記】カタカナ表記のインライン編集
    const [editKana, setEditKana] = React.useState(staffMember.name_kana || '')
    const [kanaEditing, setKanaEditing] = React.useState(false)

    const inputStyle = { padding:'5px 8px', borderRadius:'5px', border:'1px solid #D1D5DB', fontSize:'12px', color:'#111827', background:'#fff', outline:'none' }
    const labelStyle = { fontSize:'10px', fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:'3px' }

    // スキル行をクリック → 展開/折りたたみ
    const toggleExpand = (skillId) => {
      setExpandedSkillId(prev => prev === skillId ? null : skillId)
    }

    // スキルのフィールドを更新（level/certified_at/note）
    const updateSkillField = (skillId, field, value) => {
      setDirty(true)
      setEditSkills(prev => {
        const existing = prev.find(x => x.skill_id === skillId)
        if (existing) {
          return prev.map(x => x.skill_id === skillId ? { ...x, [field]: value } : x)
        } else {
          // 未登録スキルを新規追加
          return [...prev, { skill_id: skillId, level: 1, certified_at: null, note: '', [field]: value }]
        }
      })
    }

    // スキルを削除（未登録に戻す）
    const removeSkill = (skillId) => {
      setDirty(true)
      setEditSkills(prev => prev.filter(x => x.skill_id !== skillId))
      setExpandedSkillId(null)
    }

    // 保存
    const handleSave = () => {
      onSave({ ...staffMember, skills: editSkills, name_kana: editKana.trim() })
      setDirty(false)
      onClose()
    }

    return React.createElement('div', {
      style:{ position:'fixed', inset:0, background:'rgba(17,24,39,.5)', zIndex:2100, display:'flex', alignItems:'center', justifyContent:'center' },
      onClick: onClose
    },
      React.createElement('div', {
        style:{ background:'#FFFFFF', borderRadius:'12px', padding:'24px', width:'480px', maxWidth:'95vw', maxHeight:'92vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.25)', animation:'fadeInDown .18s ease' },
        onClick: e => e.stopPropagation()
      },
        // ヘッダー（アバター・氏名・国籍・役割）
        React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' } },
          React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'12px' } },
            React.createElement('div', {
              className: 'staff-avatar',
              style:{ width:46, height:46, fontSize:'16px', background:'#0A6B52', color:'#FFFFFF', flexShrink:0 }
            }, staffMember.avatar || staffMember.name.slice(0,2)),
            React.createElement('div', null,
              React.createElement('div', { style:{ fontSize:'15px', fontWeight:700, color:'#111827' } }, staffMember.name),
              React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280' } },
                (natLabel[staffMember.nationality] || staffMember.nationality) + ' · ' + roleLabel[staffMember.role]
              )
            )
          ),
          React.createElement('button', {
            onClick: onClose,
            style:{ background:'none', border:'none', cursor:'pointer', fontSize:'20px', color:'#9CA3AF', lineHeight:1, padding:'4px' }
          }, '✕')
        ),

        // 【スタッフ カタカナ表記】カタカナ表記（クリックでインライン編集）
        React.createElement('div', { style:{ marginBottom:'18px', paddingLeft:'58px' } },
          kanaEditing
            ? React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'6px' } },
                React.createElement('input', {
                  type:'text', value: editKana, autoFocus:true,
                  onChange: e => setEditKana(e.target.value),
                  onBlur: () => setKanaEditing(false),
                  onKeyDown: e => { if (e.key === 'Enter') setKanaEditing(false) },
                  placeholder:'カタカナ表記を入力',
                  style:{ ...inputStyle, width:'200px' }
                }),
                React.createElement('button', {
                  onClick: () => setEditKana(romajiToKatakana(staffMember.name)),
                  title:'氏名から自動生成し直す',
                  style:{ background:'none', border:'none', cursor:'pointer', color:'#0A6B52', fontSize:'13px', padding:'2px' }
                }, React.createElement('i', { className:'ti ti-refresh' }))
              )
            : React.createElement('div', {
                onClick: () => setKanaEditing(true),
                style:{ fontSize:'12px', color: editKana ? '#6B7280' : '#B0B8C1', cursor:'pointer', display:'flex', alignItems:'center', gap:'5px' }
              },
                React.createElement('i', { className:'ti ti-edit', style:{ fontSize:'11px' } }),
                editKana || 'カタカナ表記を追加'
              )
        ),

        // スキルセクションラベル
        React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px' } },
          React.createElement('div', { style:{ fontSize:'11px', fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'.05em' } }, 'スキル'),
          React.createElement('div', { style:{ fontSize:'11px', color:'#9CA3AF' } }, 'スキル行をクリックして編集')
        ),

        // スキル一覧（SKILL_MASTER全件。クリックでインライン編集フォーム展開）
        React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:'4px', marginBottom:'20px' } },
          ...SKILL_MASTER.map(meta => {
            const sk = editSkills.find(x => x.skill_id === meta.id)
            const isOpen = expandedSkillId === meta.id
            return React.createElement('div', { key: meta.id },
              // スキル行（クリッカブル）
              React.createElement('div', {
                onClick: () => toggleExpand(meta.id),
                style:{
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'9px 12px', borderRadius: isOpen ? '8px 8px 0 0' : '8px',
                  background: isOpen ? '#EEF6F2' : (sk ? '#F0F8F4' : '#F9FAFB'),
                  border: '1px solid ' + (isOpen ? '#B6D9C8' : (sk ? '#DDE8DE' : '#E5E7EB')),
                  cursor:'pointer', transition:'background .1s',
                  borderBottom: isOpen ? '1px solid #B6D9C8' : undefined
                }
              },
                React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px' } },
                  React.createElement('i', { className:'ti ti-' + meta.icon, style:{ fontSize:'15px', color: sk ? '#0A6B52' : '#9CA3AF' } }),
                  React.createElement('span', { style:{ fontSize:'13px', fontWeight:600, color: sk ? '#111827' : '#9CA3AF' } }, meta.label)
                ),
                React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px' } },
                  sk
                    ? React.createElement('div', { style:{ textAlign:'right' } },
                        React.createElement('span', {
                          style:{ fontSize:'11px', fontWeight:700, color:'#0A6B52', background:'#DDF3E8', borderRadius:'10px', padding:'2px 8px' }
                        }, SKILL_LEVEL_LABEL[sk.level] || sk.level),
                        sk.certified_at && React.createElement('div', { style:{ fontSize:'10px', color:'#6B7280', marginTop:'1px' } }, sk.certified_at + ' 習得')
                      )
                    : React.createElement('span', { style:{ fontSize:'11px', color:'#B0B8C1' } }, '未登録'),
                  React.createElement('i', {
                    className: 'ti ti-chevron-down',
                    style:{ fontSize:'13px', color:'#9CA3AF', transition:'transform .28s cubic-bezier(.4,0,.2,1)', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }
                  })
                )
              ),

              // インライン編集フォーム（smooth-collapse でなめらかに展開）
              React.createElement('div', { className: 'smooth-collapse-wrap' + (isOpen ? ' open' : '') },
              React.createElement('div', { className: 'smooth-collapse-inner' },
              React.createElement('div', {
                style:{
                  padding:'12px 14px', background:'#F7FBF9',
                  border:'1px solid #B6D9C8', borderTop:'none',
                  borderRadius:'0 0 8px 8px'
                }
              },
                // レベル・習得日（2カラム）
                React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'10px' } },
                  // レベル
                  React.createElement('div', null,
                    React.createElement('label', { style: labelStyle }, 'レベル'),
                    React.createElement('select', {
                      value: sk ? sk.level : '',
                      onChange: e => updateSkillField(meta.id, 'level', Number(e.target.value)),
                      style: { ...inputStyle, width:'100%' }
                    },
                      React.createElement('option', { value:'' }, '— 選択 —'),
                      ...Object.entries(SKILL_LEVEL_LABEL).map(([v, l]) =>
                        React.createElement('option', { key:v, value:v }, l)
                      )
                    )
                  ),
                  // 習得日
                  React.createElement('div', null,
                    React.createElement('label', { style: labelStyle }, '習得日（任意）'),
                    React.createElement('input', {
                      type:'date',
                      value: sk?.certified_at || '',
                      onChange: e => updateSkillField(meta.id, 'certified_at', e.target.value || null),
                      style: { ...inputStyle, width:'100%' }
                    })
                  )
                ),
                // メモ
                React.createElement('div', { style:{ marginBottom:'10px' } },
                  React.createElement('label', { style: labelStyle }, 'メモ（任意）'),
                  React.createElement('input', {
                    type:'text',
                    value: sk?.note || '',
                    placeholder:'例：単独作業可、研修中 等',
                    onChange: e => updateSkillField(meta.id, 'note', e.target.value),
                    style: { ...inputStyle, width:'100%' }
                  })
                ),
                // フォーム内ボタン
                React.createElement('div', { style:{ display:'flex', justifyContent:'flex-end', gap:'6px' } },
                  sk && React.createElement('button', {
                    onClick: () => removeSkill(meta.id),
                    style:{ padding:'5px 12px', borderRadius:'5px', border:'1px solid #FCA5A5', background:'#FFF5F5', color:'#DC2626', fontSize:'11px', fontWeight:600, cursor:'pointer' }
                  }, '未登録に戻す'),
                  React.createElement('button', {
                    onClick: () => setExpandedSkillId(null),
                    style:{ padding:'5px 12px', borderRadius:'5px', border:'1px solid #D1D5DB', background:'#fff', color:'#374151', fontSize:'11px', fontWeight:600, cursor:'pointer' }
                  }, '折りたたむ')
                )
              )
              ) // end smooth-collapse-inner
              ) // end smooth-collapse-wrap
            )
          })
        ),

        // フッター（保存・閉じる）
        React.createElement('div', { style:{ display:'flex', gap:'8px' } },
          React.createElement('button', {
            onClick: onClose,
            style:{ flex:1, padding:'10px 18px', borderRadius:'6px', border:'1px solid #D1D5DB', background:'#fff', color:'#374151', fontSize:'13px', fontWeight:600, cursor:'pointer' }
          }, 'キャンセル'),
          React.createElement('button', {
            onClick: handleSave,
            style:{ flex:2, padding:'10px 18px', borderRadius:'6px', border:'none', background: dirty ? '#0A6B52' : '#34A97A', color:'#fff', fontSize:'13px', fontWeight:700, cursor:'pointer' }
          }, dirty ? '💾 保存する' : '閉じる（変更なし）')
        )
      )
    )
  }

  return React.createElement('div', { className: 'page' },  // 【UIバグ修正】Fragmentだったため.pageのpaddingが効かず画面端に張り付いていた問題を修正
    toast && React.createElement('div', {
      style:{
        position:'fixed', bottom:'28px', right:'28px', zIndex:9999,
        background:'#065F46', color:'#fff', borderRadius:'10px',
        padding:'12px 20px', fontSize:'13px', fontWeight:500,
        boxShadow:'0 4px 20px rgba(0,0,0,0.18)',
        display:'flex', alignItems:'center', gap:'10px',
        animation:'fadeInUp .25s ease'
      }
    },
      React.createElement('span', null, '✅'),
      React.createElement('span', null, toast)
    ),

    // ヘッダー
    React.createElement('div', { style:{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'16px' } },
      React.createElement('div', null,
        React.createElement('div', { className:'eyebrow' }, 'STAFF MANAGEMENT'),
        React.createElement('div', { className:'page-title' }, 'スタッフ管理'),
        React.createElement('div', { className:'page-sub' }, staff.length+'名登録 — 技能実習生 '+staff.filter(s=>s.role==='trainee').length+'名')
      ),
      React.createElement('button', {
        className: 'btn btn-primary',
        style:{ display:'flex', alignItems:'center', gap:'6px', fontSize:'13px', marginTop:'2px' },
        onClick: () => setShowAddModal(true)
      },
        React.createElement('i', { className:'ti ti-plus', style:{ fontSize:'14px' } }),
        'スタッフを追加'
      )
    ),

    // 役割別サマリーカード
    React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px', marginBottom:'24px' } },
      ...Object.entries(roleLabel).map(([r, l]) =>
        React.createElement('div', { key:r, className:'card-sm', style:{ textAlign:'center', padding:'12px' } },
          React.createElement('div', { style:{ fontSize:'22px', fontWeight:600, color:'#374151', lineHeight:1 } }, roleCounts[r]),
          React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280', marginTop:'4px' } }, l)
        )
      )
    ),

    // スタッフ一覧（UX-09: カード型グリッドに変更。横長で見づらかった一覧をやめ、人物カードを並べる形に）
    React.createElement('div', { className:'section-title' }, 'スタッフ一覧'),
    React.createElement('div', {
      style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:'14px' }
    },
      ...staff.map((s, i) =>
        React.createElement('div', {
          key: s.id,
          className: 'card-sm',
          onClick: () => setSelectedStaff(s),  // 【Step1-3】カードクリックで詳細モーダルを開く
          style:{
            padding:'18px 16px', display:'flex', flexDirection:'column', alignItems:'center',
            textAlign:'center', gap:'4px', position:'relative', cursor:'pointer'
          }
        },
          // 削除ボタン（右上）
          React.createElement('button', {
            title:'削除',
            onClick: (e) => { e.stopPropagation(); setDeleteTarget(s) },  // 【Step1-3】カードのクリックに伝播させない
            style:{
              position:'absolute', top:'8px', right:'8px',
              padding:'4px 6px', fontSize:'12px', color:'#9CA3AF',
              background:'transparent', border:'none', cursor:'pointer', lineHeight:1
            }
          }, React.createElement('i', { className:'ti ti-trash', style:{ fontSize:'14px' } })),

          // アバター
          React.createElement('div', {
            className: 'staff-avatar',
            style:{ background: avatarPalette[i % avatarPalette.length], color:'#FFFFFF', width:'52px', height:'52px', fontSize:'16px', marginBottom:'6px' }
          }, s.avatar || s.name.slice(0,2)),

          // 氏名
          React.createElement('div', { style:{ fontSize:'14px', fontWeight:700, color:'#374151', width:'100%', overflow:'hidden', textOverflow:'ellipsis' } }, s.name),

          // 【スタッフ カタカナ表記】カタカナ表記（登録されている場合のみ表示）
          s.name_kana && React.createElement('div', { style:{ fontSize:'11px', color:'#9CA3AF', width:'100%', overflow:'hidden', textOverflow:'ellipsis' } }, s.name_kana),

          // 国籍・役割
          React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280' } },
            (natLabel[s.nationality] || s.nationality) + ' · ' + roleLabel[s.role]
          ),

          // 【スタッフ スキル管理 Step1-2】スキル概要バッジ（最大3件＋「+N」表記）
          // skills が未設定の既存データでも落ちないよう s.skills || [] でフォールバック
          (() => {
            const skills = s.skills || []
            if (skills.length === 0) {
              return React.createElement('div', { style:{ fontSize:'11px', color:'#B0B8C1', marginTop:'6px' } }, 'スキル未登録')
            }
            const visible = skills.slice(0, 3)
            const restCount = skills.length - visible.length
            return React.createElement('div', {
              style:{ display:'flex', flexWrap:'wrap', justifyContent:'center', gap:'4px', marginTop:'6px' }
            },
              ...visible.map(sk => {
                const meta = SKILL_MASTER.find(m => m.id === sk.skill_id)
                return React.createElement('span', {
                  key: sk.skill_id,
                  style:{
                    fontSize:'10px', fontWeight:600, color:'#0A6B52',
                    background:'#F0F8F4', border:'1px solid #DDE8DE',
                    borderRadius:'10px', padding:'2px 8px'
                  }
                }, meta ? meta.label : sk.skill_id)
              }),
              restCount > 0 && React.createElement('span', {
                style:{
                  fontSize:'10px', fontWeight:600, color:'#6B7280',
                  background:'#F1F5F9', borderRadius:'10px', padding:'2px 8px'
                }
              }, '+' + restCount)
            )
          })()
        )
      )
    ),

    showAddModal && React.createElement(StaffAddModal, {
      onClose: () => setShowAddModal(false),
      onSave: handleAdd
    }),

    // 【Step1-4】スタッフ詳細モーダル（スキル編集UI付き）
    selectedStaff && React.createElement(StaffDetailModal, {
      staffMember: selectedStaff,
      onClose: () => setSelectedStaff(null),
      onSave: (updated) => {
        if (onUpdate) onUpdate(updated)
        setSelectedStaff(null)
      }
    }),

    deleteTarget && React.createElement(ConfirmDeleteModal, {
      title: 'スタッフを削除しますか？',
      targetName: deleteTarget.name + '（' + (natLabel[deleteTarget.nationality] || deleteTarget.nationality) + ' · ' + roleLabel[deleteTarget.role] + '）',
      onCancel: () => setDeleteTarget(null),
      onConfirm: () => { onDelete(deleteTarget.id); setDeleteTarget(null) }
    })
  )
}

// =====================================================
// 【日誌UX改善 Step2】技能実習生 作業日誌: 月次PDF出力（html2canvas利用）
// 既存の exportCropPlanPDF と同じパターン（非表示プレビュー→キャプチャ→jsPDF）を流用
// =====================================================
// 技能実習日誌(参考様式第4-2号/規則第22条第1項第3号関係)の業務区分。公式左欄に直結。
// 休日は「全暦日を埋める月次表示」で記録の無い日に使う。
const TRAINEE_WORK_DIVISIONS = ['必須作業', '関連作業', '周辺作業', '安全衛生作業', '休日']
// 実習区分(公式様式の注記 A〜F)。PDFに再現して監査提出に耐えるようにする。
const TRAINEE_PLAN_CATEGORIES = [
  ['A', '必須作業（技能等の習得に直接必要な作業）'],
  ['B', '関連作業（必須作業に関連して行う作業）'],
  ['C', '周辺作業（必須・関連作業に付随して通常携わる作業）'],
  ['D', '安全衛生に係る作業'],
  ['E', '休日'],
  ['F', 'その他'],
]
// 後方互換: 旧データは自由記述 tasks 1欄。新データは work_content(従事した業務)/guidance_content(指導の内容)に分離。
// 表示・PDFは常にこのヘルパー経由で読む(旧レコードは tasks を「従事した業務」として扱う)。
function diaryWorkContent(d) { return (d && (d.work_content || d.tasks)) || '' }
function diaryGuidance(d) { return (d && d.guidance_content) || '' }

async function exportTraineeDiaryPDF(staffMember, monthLabel, diaryRows, summary) {
  if (!(await confirmDownload({ icon:'📄', title:'作業日誌をPDF出力', desc:(staffMember && staffMember.name ? staffMember.name + 'さんの' : '') + monthLabel + 'の作業日誌をPDFで出力します。', filename:'作業日誌_' + ((staffMember && staffMember.name) || '') + '_' + monthLabel + '.pdf' }))) return
  await ensurePdfLibs()
  const el = document.getElementById('diary-pdf-preview')
  const today = new Date().toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric' })
  const natLabel = NAT_LABEL

  const sortedRows = [...diaryRows].sort((a, b) => a.date.localeCompare(b.date))
  const byDate = {}
  sortedRows.forEach(d => { if (!byDate[d.date]) byDate[d.date] = d }) // 1日1件(複数あれば先頭)
  const farmName = (typeof CONFIG !== 'undefined' && CONFIG.FARM_NAME) ? CONFIG.FARM_NAME : '' // プレースホルダ「農場名」直書きの不具合を修正
  // monthLabel '2026年7月' から年月を取り、休日含む全暦日を並べる(公式様式は非稼働日も「休日」と1行記載)
  const mMatch = String(monthLabel).match(/(\d{4})\D+(\d{1,2})/)
  const yy = mMatch ? Number(mMatch[1]) : new Date().getFullYear()
  const mo = mMatch ? Number(mMatch[2]) : (new Date().getMonth() + 1)
  const daysInMonth = new Date(yy, mo, 0).getDate()
  const ym = yy + '-' + String(mo).padStart(2, '0')
  const divShort = { '必須作業':'必須', '関連作業':'関連', '周辺作業':'周辺', '安全衛生作業':'安全', '休日':'休日' }
  const workMins = (d) => {
    if (!d || !d.start_time || !d.end_time) return 0
    const [sh, sm] = d.start_time.split(':').map(Number)
    const [eh, em] = d.end_time.split(':').map(Number)
    const t = (eh*60+em) - (sh*60+sm) - (d.break_minutes||0)
    return t > 0 ? t : 0
  }
  let bodyRows = ''
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = ym + '-' + String(day).padStart(2, '0')
    const wday = ['日','月','火','水','木','金','土'][new Date(dateStr + 'T00:00:00').getDay()]
    const wcolor = wday === '日' ? '#DC2626' : wday === '土' ? '#1D4ED8' : '#555'
    const d = byDate[dateStr]
    const isHoliday = !d || d.work_division === '休日'
    const bg = isHoliday ? 'background:#FBF3F3' : (day % 2 === 0 ? 'background:#f9f9f9' : '')
    const mins = workMins(d)
    const hh = Math.floor(mins/60), mm = mins%60
    const work = d ? diaryWorkContent(d) : ''
    const guide = d ? diaryGuidance(d) : ''
    bodyRows += `<tr style="${bg}">
      <td style="padding:4px 5px;border:1px solid #ccc;text-align:center;font-weight:600">${day}</td>
      <td style="padding:4px 5px;border:1px solid #ccc;text-align:center;color:${wcolor}">${wday}</td>
      <td style="padding:4px 5px;border:1px solid #ccc;text-align:center">${escHtml(d ? (divShort[d.work_division] || d.work_division || '必須') : '休日')}</td>
      <td style="padding:4px 5px;border:1px solid #ccc;text-align:center">${escHtml((d && d.plan_no) || '')}</td>
      <td style="padding:4px 6px;border:1px solid #ccc;white-space:pre-wrap">${work ? escHtml(work) : '<span style="color:#B91C1C">休日</span>'}</td>
      <td style="padding:4px 6px;border:1px solid #ccc;white-space:pre-wrap">${escHtml(guide)}</td>
      <td style="padding:4px 5px;border:1px solid #ccc;text-align:center">${mins ? hh+'h'+(mm?mm+'m':'') : '—'}</td>
      <td style="padding:4px 5px;border:1px solid #ccc;text-align:center">${d && d.supervisor ? escHtml(d.supervisor) : '—'}</td>
    </tr>`
  }
  const categoryNote = TRAINEE_PLAN_CATEGORIES.map(([k, v]) => `${k}: ${v}`).join('　')

  el.innerHTML = `
    <div style="font-family:'Noto Sans JP','Hiragino Sans','Yu Gothic','Meiryo',sans-serif;padding:22px;background:#fff;color:#111;width:960px">
      <div style="font-size:9.5px;color:#666;text-align:right;margin-bottom:2px">参考様式第4-2号（規則第22条第1項第3号関係）</div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:12px;border-bottom:2px solid #1a5276;padding-bottom:8px">
        <div>
          <h2 style="font-size:19px;font-weight:700;margin:0 0 4px">技能実習日誌</h2>
          <div style="font-size:11px;color:#555">実習実施者（実習実施機関）: <b>${escHtml(farmName)}</b>　／　対象月: ${escHtml(monthLabel)}</div>
        </div>
        <div style="font-size:10px;color:#888;text-align:right">作成日: ${today}<br>技能実習制度 報告資料</div>
      </div>

      <div style="display:flex;gap:10px;border:1px solid #ccc;border-radius:6px;padding:9px 14px;margin-bottom:12px;background:#F8FAF8">
        <div style="flex:1.4"><div style="font-size:9px;color:#777">技能実習生</div><div style="font-size:13px;font-weight:700">${escHtml(staffMember.name)}</div></div>
        <div style="flex:1"><div style="font-size:9px;color:#777">国籍</div><div style="font-size:13px;font-weight:700">${escHtml(natLabel[staffMember.nationality] || staffMember.nationality || '—')}</div></div>
        <div style="flex:1"><div style="font-size:9px;color:#777">従事日数</div><div style="font-size:13px;font-weight:700">${summary.count}日</div></div>
        <div style="flex:1"><div style="font-size:9px;color:#777">実働時間合計</div><div style="font-size:13px;font-weight:700">${summary.totalHours}h${summary.totalMins ? summary.totalMins+'m' : ''}</div></div>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:10px;table-layout:fixed">
        <thead>
          <tr style="background:#1a5276;color:#fff">
            <th style="padding:5px 4px;border:1px solid #aaa;width:34px">月日</th>
            <th style="padding:5px 4px;border:1px solid #aaa;width:28px">曜</th>
            <th style="padding:5px 4px;border:1px solid #aaa;width:44px">業務区分</th>
            <th style="padding:5px 4px;border:1px solid #aaa;width:52px">実習計画番号</th>
            <th style="padding:5px 4px;border:1px solid #aaa">従事した業務の内容</th>
            <th style="padding:5px 4px;border:1px solid #aaa">指導の内容</th>
            <th style="padding:5px 4px;border:1px solid #aaa;width:48px">実働</th>
            <th style="padding:5px 4px;border:1px solid #aaa;width:58px">指導者</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>

      <div style="margin-top:10px;font-size:8.5px;color:#555;line-height:1.6;border:1px solid #ddd;border-radius:5px;padding:7px 10px;background:#FCFCFC">
        <b>【業務区分】</b>${escHtml(categoryNote)}<br>
        ※ 本日誌は技能実習の実施状況を記録するものです。休日を含む全ての暦日を記載しています。従事した業務・指導の内容は技能実習計画に基づき記入しています。
      </div>
      <div style="margin-top:8px;display:flex;justify-content:space-between;font-size:10px;color:#333">
        <div>実習実施者: <b>${escHtml(farmName)}</b></div>
        <div>技能実習指導員（署名）: ______________________</div>
      </div>
    </div>
  `
  el.style.display = 'block'
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false })
  el.style.display = 'none'
  el.innerHTML = ''

  const { jsPDF } = window.jspdf
  const pdf  = new jsPDF('p', 'mm', 'a4')
  const imgW = 190
  const imgH = canvas.height * imgW / canvas.width
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, 10, imgW, imgH)
  pdf.save(`作業日誌_${staffMember.name}_${monthLabel}.pdf`)
}

// =====================================================
// 【実装手順書 A】技能実習生 作業日誌ページ
// =====================================================
function TraineeDiaryPage({ staff, fields, diaries, onAdd, onDelete }) {
  const trainees = (staff || []).filter(s => s.role === 'trainee')
  const [selectedStaff, setSelectedStaff] = React.useState(trainees[0]?.id || null)
  const [selectedDiary, setSelectedDiary] = React.useState(null)  // 詳細モーダル対象
  const [deleteTarget, setDeleteTarget]   = React.useState(null)  // 削除確認モーダル対象
  const [showAddModal, setShowAddModal]   = React.useState(false) // 新規追加モーダル
  const [editTarget, setEditTarget]       = React.useState(null)  // 編集モーダル対象
  const today = todayYmd()
  // 【日誌UX改善 Step1】月次フィルター — 'YYYY-MM' 形式。初期値は当月
  const [selectedMonth, setSelectedMonth] = React.useState(today.slice(0, 7))
  const [exportingPdf, setExportingPdf]   = React.useState(false)

  const emptyForm = () => ({
    date: today, staff_id: selectedStaff, start_time:'08:00', end_time:'17:00',
    break_minutes: 60,
    work_division:'必須作業',   // 業務区分(公式左欄)
    plan_no:'',                 // 実習計画の番号(実習実施予定表の内容欄番号)
    work_content:'',            // 従事した業務(公式・従来tasksを分離)
    guidance_content:'',        // 指導の内容(公式)
    field_ids:[], supervisor:'', notes:'', tasks:''  // tasksは後方互換用(旧データ表示のため保持)
  })

  // スタッフ絞り込みのみ（月をまたいだ「全期間」リストが必要な場面向け）
  const filteredByStaff = (diaries || [])
    .filter(d => !selectedStaff || d.staff_id === selectedStaff)
    .sort((a, b) => b.date.localeCompare(a.date))

  // 【日誌UX改善 Step1】スタッフ＋選択中の月で絞り込み
  const filtered = filteredByStaff.filter(d => d.date.slice(0, 7) === selectedMonth)

  // 実働分を数値で返す（サマリー集計用）。calcWorkHoursは表示文字列専用として残す
  const calcWorkMinutes = (d) => {
    if (!d.start_time || !d.end_time) return 0
    const [sh, sm] = d.start_time.split(':').map(Number)
    const [eh, em] = d.end_time.split(':').map(Number)
    const total = (eh * 60 + em) - (sh * 60 + sm) - (d.break_minutes || 0)
    return total > 0 ? total : 0
  }

  const calcWorkHours = (d) => {
    if (!d.start_time || !d.end_time) return '—'
    const [sh, sm] = d.start_time.split(':').map(Number)
    const [eh, em] = d.end_time.split(':').map(Number)
    const total = (eh * 60 + em) - (sh * 60 + sm) - (d.break_minutes || 0)
    return total > 0 ? `${Math.floor(total/60)}h${total%60 ? total%60+'m' : ''}` : '—'
  }

  // 【日誌UX改善 Step1】月送り（前月／翌月）
  const shiftMonth = (delta) => {
    const [y, m] = selectedMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const monthLabel = (() => {
    const [y, m] = selectedMonth.split('-').map(Number)
    return `${y}年${m}月`
  })()
  const isCurrentMonth = selectedMonth === today.slice(0, 7)

  // 【日誌UX改善 Step1】月次サマリー（記録日数・実働時間合計・指導者記載数）
  const monthSummary = React.useMemo(() => {
    const totalMinutes = filtered.reduce((sum, d) => sum + calcWorkMinutes(d), 0)
    return {
      count: filtered.length,
      totalHours: Math.floor(totalMinutes / 60),
      totalMins: totalMinutes % 60,
      withSupervisor: filtered.filter(d => d.supervisor).length,
    }
  }, [filtered])

  // ── 追加・編集フォームモーダル（共通） ──
  const DiaryFormModal = ({ initialValues, isEdit, onClose, onSave }) => {
    // 旧データ(tasksのみ)を編集する時は「従事した業務」に引き継ぐ。区分の既定も補う
    const [form, setForm] = React.useState(() => Object.assign({ work_division:'必須作業', plan_no:'', guidance_content:'' }, initialValues, {
      work_content: (initialValues.work_content != null && initialValues.work_content !== '') ? initialValues.work_content : (initialValues.tasks || '')
    }))
    const uf = (k, v) => setForm(f => ({ ...f, [k]: v }))
    // 休日は従事業務が無くても保存可。それ以外は従事した業務が必須
    const canSave = form.date && form.staff_id && (form.work_division === '休日' || (form.work_content || '').trim())
    const inputStyle = { width:'100%', padding:'8px 10px', borderRadius:'6px', border:'1px solid #D1D5DB', fontSize:'13px', color:'#111827', boxSizing:'border-box', outline:'none' }
    const labelStyle = { fontSize:'10px', fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:'4px' }
    return React.createElement('div', {
      style:{ position:'fixed', inset:0, background:'rgba(17,24,39,.5)', zIndex:2100, display:'flex', alignItems:'center', justifyContent:'center' },
      onClick: onClose
    },
      React.createElement('div', {
        style:{ background:'#FFFFFF', borderRadius:'12px', padding:'24px', width:'520px', maxWidth:'95vw', maxHeight:'92vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.25)', animation:'fadeInDown .18s ease' },
        onClick: e => e.stopPropagation()
      },
        // ヘッダー
        React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'20px' } },
          React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'10px' } },
            React.createElement('div', { style:{ width:36, height:36, borderRadius:'50%', background: isEdit ? '#1D4ED8' : '#0A6B52', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 } },
              React.createElement('i', { className: isEdit ? 'ti ti-edit' : 'ti ti-notebook', style:{ fontSize:'18px', color:'#FFFFFF' } })
            ),
            React.createElement('div', null,
              React.createElement('div', { style:{ fontSize:'15px', fontWeight:700, color:'#111827' } }, isEdit ? '日誌を編集' : '日誌を追加'),
              React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280' } }, isEdit ? '内容を修正して保存してください' : '新しい作業日誌を記録します')
            )
          ),
          React.createElement('button', {
            onClick: onClose,
            style:{ background:'none', border:'none', cursor:'pointer', fontSize:'20px', color:'#9CA3AF', lineHeight:1, padding:'4px' }
          }, '✕')
        ),

        // 実習生選択（追加時のみ・編集時は固定）
        !isEdit && React.createElement('div', { style:{ marginBottom:'14px' } },
          React.createElement('label', { style: labelStyle }, '実習生 *'),
          React.createElement('select', {
            value: form.staff_id || '',
            onChange: e => uf('staff_id', Number(e.target.value)),
            style:{ ...inputStyle }
          },
            React.createElement('option', { value:'' }, '— 選択してください —'),
            ...trainees.map(s =>
              React.createElement('option', { key:s.id, value:s.id }, s.name)
            )
          )
        ),

        // 日付・開始・終了・休憩（4カラム）
        React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 100px', gap:'10px', marginBottom:'14px' } },
          ...[
            ['date',         '日付',     'date'],
            ['start_time',   '開始時刻', 'time'],
            ['end_time',     '終了時刻', 'time'],
          ].map(([key, label, type]) =>
            React.createElement('div', { key },
              React.createElement('label', { style: labelStyle }, label),
              React.createElement('input', {
                type, value: form[key],
                onChange: e => uf(key, e.target.value),
                style: inputStyle
              })
            )
          ),
          React.createElement('div', null,
            React.createElement('label', { style: labelStyle }, '休憩（分）'),
            React.createElement('input', {
              type:'number', value: form.break_minutes, min:0, step:15,
              onChange: e => uf('break_minutes', Number(e.target.value)),
              style: inputStyle
            })
          )
        ),

        // 実働時間プレビュー
        React.createElement('div', { style:{ background:'#F0F8F4', borderRadius:'6px', padding:'8px 12px', marginBottom:'14px', display:'flex', alignItems:'center', gap:'6px' } },
          React.createElement('i', { className:'ti ti-clock', style:{ color:'#0A6B52', fontSize:'14px' } }),
          React.createElement('span', { style:{ fontSize:'12px', color:'#6B7280' } }, '実働時間:'),
          React.createElement('span', { style:{ fontSize:'13px', fontWeight:700, color:'#0A6B52' } }, calcWorkHours(form))
        ),

        // 業務区分・実習計画番号（公式様式に直結・2カラム）
        React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'14px' } },
          React.createElement('div', null,
            React.createElement('label', { style: labelStyle }, '業務区分 *'),
            React.createElement('select', {
              value: form.work_division || '必須作業',
              onChange: e => uf('work_division', e.target.value),
              style: inputStyle
            }, ...TRAINEE_WORK_DIVISIONS.map(v => React.createElement('option', { key:v, value:v }, v)))
          ),
          React.createElement('div', null,
            React.createElement('label', { style: labelStyle }, '実習計画番号'),
            React.createElement('input', {
              type:'text', value: form.plan_no || '', placeholder:'例: ①〜⑤ / ②',
              onChange: e => uf('plan_no', e.target.value),
              style: inputStyle
            })
          )
        ),

        // 従事した業務（休日以外は必須）
        React.createElement('div', { style:{ marginBottom:'14px' } },
          React.createElement('label', { style: labelStyle }, form.work_division === '休日' ? '従事した業務（休日は任意）' : '従事した業務 *'),
          React.createElement('textarea', {
            value: form.work_content || '', rows:3,
            onChange: e => uf('work_content', e.target.value),
            placeholder:'例: 9号圃場 レタス収穫。サイズ選別・コンテナ積み込み。',
            style:{ ...inputStyle, resize:'vertical' }
          })
        ),

        // 指導の内容（公式様式の右欄）
        React.createElement('div', { style:{ marginBottom:'14px' } },
          React.createElement('label', { style: labelStyle }, '指導の内容'),
          React.createElement('textarea', {
            value: form.guidance_content || '', rows:2,
            onChange: e => uf('guidance_content', e.target.value),
            placeholder:'例: 収穫適期の見極め方・出荷規格・衛生管理を指導。',
            style:{ ...inputStyle, resize:'vertical' }
          })
        ),

        // 指導者・特記事項（2カラム）
        React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'20px' } },
          React.createElement('div', null,
            React.createElement('label', { style: labelStyle }, '指導者名'),
            React.createElement('input', {
              type:'text', value: form.supervisor, placeholder:'田中',
              onChange: e => uf('supervisor', e.target.value),
              style: inputStyle
            })
          ),
          React.createElement('div', null,
            React.createElement('label', { style: labelStyle }, '特記事項'),
            React.createElement('input', {
              type:'text', value: form.notes, placeholder:'体調良好・特記事項なし',
              onChange: e => uf('notes', e.target.value),
              style: inputStyle
            })
          )
        ),

        // ボタン群
        React.createElement('div', { style:{ display:'flex', gap:'8px' } },
          React.createElement('button', {
            onClick: onClose,
            style:{ flex:1, padding:'10px 18px', borderRadius:'6px', border:'1px solid #D1D5DB', background:'#fff', color:'#374151', fontSize:'13px', fontWeight:600, cursor:'pointer' }
          }, 'キャンセル'),
          React.createElement('button', {
            onClick: () => {
              if (!canSave) { showToast('日付・実習生・業務区分・従事した業務を入力してください（休日は業務任意）', 'warn'); return }
              // tasksは後方互換のため従事業務を同期(旧集計・旧表示が落ちないように)
              onSave(Object.assign({}, form, { work_content:(form.work_content||'').trim(), guidance_content:(form.guidance_content||'').trim(), tasks:(form.work_content||'').trim() }))
            },
            style:{ flex:2, padding:'10px 18px', borderRadius:'6px', border:'none', fontSize:'13px', fontWeight:700, cursor: canSave ? 'pointer' : 'not-allowed',
              background: canSave ? (isEdit ? '#1D4ED8' : '#0A6B52') : '#D1D5DB', color:'#fff' }
          }, isEdit ? '変更を保存' : '日誌を登録')
        )
      )
    )
  }

  const handleAdd = (form) => {
    onAdd({ ...form, id: Date.now(), created_at: new Date().toISOString() })
    setShowAddModal(false)
    // 【日誌UX改善】登録した日誌の月が現在の表示月と異なる場合、その月へ自動で切り替える
    // （過去日付で記録した直後に一覧から消えて見える、という混乱を防ぐため）
    setSelectedMonth(form.date.slice(0, 7))
  }

  const handleEdit = (form) => {
    // onAddを使ってIDを保持したまま上書き（既存レコードを削除→追加）
    onDelete(editTarget.id)
    onAdd({ ...form, id: editTarget.id, created_at: editTarget.created_at, updated_at: new Date().toISOString() })
    setEditTarget(null)
    setSelectedDiary(null)
    setSelectedMonth(form.date.slice(0, 7))
  }

  return React.createElement('div', { className:'page' },
    // ヘッダー
    React.createElement('div', { className:'eyebrow' }, 'TRAINEE DIARY'),
    React.createElement('div', { className:'page-title' }, '技能実習生 作業日誌'),
    React.createElement('div', { className:'page-sub' },
      `実習生 ${trainees.length}名 — 月次報告・在留資格管理に対応`
    ),

    trainees.length === 0
      ? React.createElement('div', {
          style:{ padding:'48px', textAlign:'center', color:'#9CA3AF', fontSize:'14px' }
        }, 'スタッフ管理ページで「技能実習生」ロールのスタッフを登録してください')
      : React.createElement(React.Fragment, null,

        // 実習生タブ + 追加ボタン
        React.createElement('div', {
          style:{ display:'flex', gap:'8px', marginTop:'20px', marginBottom:'20px', flexWrap:'wrap', alignItems:'center' }
        },
          ...trainees.map(s =>
            React.createElement('button', {
              key: s.id,
              onClick: () => setSelectedStaff(s.id),
              style:{
                padding:'7px 18px', borderRadius:'24px', border:'none', cursor:'pointer',
                fontSize:'13px', fontWeight:600, transition:'all .15s',
                background: selectedStaff===s.id ? '#0A6B52' : '#F1F5F9',
                color:       selectedStaff===s.id ? '#fff'    : '#64748B',
              }
            }, s.avatar ? `${s.avatar} ${s.name}` : s.name)
          ),
          React.createElement('div', { style:{ flex:1 } }),
          React.createElement('button', {
            onClick: () => setShowAddModal(true),
            style:{
              display:'flex', alignItems:'center', gap:'6px',
              padding:'8px 18px', borderRadius:'8px', border:'none', cursor:'pointer',
              background:'#0A6B52', color:'#fff', fontSize:'13px', fontWeight:600
            }
          },
            React.createElement('i', { className:'ti ti-plus', style:{ fontSize:'14px' } }),
            '日誌を追加'
          )
        ),

        // 【スタッフ スキル管理 Step1-6】選択中の実習生の主要スキルを参照表示
        // skills が未設定の既存データでも落ちないよう s.skills || [] でフォールバック
        (() => {
          const current = trainees.find(s => s.id === selectedStaff)
          if (!current) return null
          const skills = current.skills || []
          return React.createElement('div', {
            style:{
              display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap',
              background:'#F8FAF8', border:'1px solid #E5E7EB', borderRadius:'8px',
              padding:'10px 14px', marginBottom:'16px', marginTop:'-8px'
            }
          },
            React.createElement('span', { style:{ fontSize:'11px', fontWeight:700, color:'#6B7280', flexShrink:0 } }, 'スキル:'),
            skills.length === 0
              ? React.createElement('span', { style:{ fontSize:'12px', color:'#B0B8C1' } }, '未登録')
              : React.createElement(React.Fragment, null,
                  ...skills.map(sk => {
                    const meta = SKILL_MASTER.find(m => m.id === sk.skill_id)
                    return React.createElement('span', {
                      key: sk.skill_id,
                      style:{
                        fontSize:'11px', fontWeight:600, color:'#0A6B52',
                        background:'#F0F8F4', border:'1px solid #DDE8DE',
                        borderRadius:'10px', padding:'2px 9px'
                      }
                    }, (meta ? meta.label : sk.skill_id) + (sk.level ? '・' + (SKILL_LEVEL_LABEL[sk.level] || sk.level) : ''))
                  })
                )
          )
        })(),

        // 【日誌UX改善 Step1・Step2】月次フィルター + サマリー + PDF出力
        (() => {
          const current = trainees.find(s => s.id === selectedStaff)
          const navBtnStyle = {
            width:'30px', height:'30px', display:'flex', alignItems:'center', justifyContent:'center',
            borderRadius:'6px', border:'1px solid #D1D5DB', background:'#fff', color:'#374151',
            cursor:'pointer', fontSize:'13px', flexShrink:0
          }
          return React.createElement('div', {
            style:{
              display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'12px',
              background:'#fff', border:'1px solid #E5E7EB', borderRadius:'10px',
              padding:'12px 16px', marginBottom:'16px'
            }
          },
            // 月送りナビ
            React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px' } },
              React.createElement('button', { onClick: () => shiftMonth(-1), style: navBtnStyle, title:'前月' },
                React.createElement('i', { className:'ti ti-chevron-left' })
              ),
              React.createElement('div', { style:{ fontSize:'15px', fontWeight:700, color:'#111827', minWidth:'92px', textAlign:'center' } }, monthLabel),
              React.createElement('button', { onClick: () => shiftMonth(1), style: navBtnStyle, title:'翌月' },
                React.createElement('i', { className:'ti ti-chevron-right' })
              ),
              !isCurrentMonth && React.createElement('button', {
                onClick: () => setSelectedMonth(today.slice(0, 7)),
                style:{
                  marginLeft:'4px', padding:'5px 12px', borderRadius:'20px', border:'1px solid #DDE8DE',
                  background:'#F0F8F4', color:'#0A6B52', fontSize:'11px', fontWeight:600, cursor:'pointer'
                }
              }, '今月へ戻る')
            ),

            // サマリー
            React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'18px', fontSize:'12px', color:'#6B7280' } },
              React.createElement('span', null,
                '記録 ',
                React.createElement('b', { style:{ color:'#111827', fontSize:'14px' } }, monthSummary.count),
                ' 日'
              ),
              React.createElement('span', null,
                '実働計 ',
                React.createElement('b', { style:{ color:'#0A6B52', fontSize:'14px' } },
                  `${monthSummary.totalHours}h${monthSummary.totalMins ? monthSummary.totalMins+'m' : ''}`
                )
              ),
              // PDF出力ボタン
              React.createElement('button', {
                disabled: !current || exportingPdf,
                onClick: async () => {
                  if (!current) return
                  setExportingPdf(true)
                  try {
                    await exportTraineeDiaryPDF(current, monthLabel, filtered, monthSummary)
                  } finally {
                    setExportingPdf(false)
                  }
                },
                style:{
                  display:'flex', alignItems:'center', gap:'6px',
                  padding:'7px 14px', borderRadius:'7px', border:'1px solid #1D4ED8',
                  background: exportingPdf ? '#93C5FD' : '#EFF6FF', color:'#1D4ED8',
                  fontSize:'12px', fontWeight:700, cursor: (!current || exportingPdf) ? 'not-allowed' : 'pointer'
                }
              },
                React.createElement('i', { className: exportingPdf ? 'ti ti-loader-2' : 'ti ti-file-type-pdf', style:{ fontSize:'14px' } }),
                exportingPdf ? '出力中…' : 'PDF出力'
              )
            )
          )
        })(),

        // 日誌一覧
        filtered.length === 0
          ? React.createElement('div', { style:{ padding:'40px', textAlign:'center', color:'#9CA3AF', fontSize:'13px' } },
              filteredByStaff.length === 0
                ? '日誌がまだありません。「+ 日誌を追加」から記録してください。'
                : `${monthLabel}の記録はありません。月を切り替えるか、新しく記録してください。`
            )
          : React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:'10px' } },
              ...filtered.map(d => {
                const s = (staff||[]).find(x => x.id === d.staff_id)
                return React.createElement('div', {
                  key: d.id,
                  onClick: () => setSelectedDiary(d),
                  style:{
                    background:'#fff', border:'1px solid #E5E7EB', borderRadius:'10px',
                    padding:'14px 18px', display:'flex', gap:'16px', alignItems:'flex-start',
                    cursor:'pointer', transition:'all .12s'
                  },
                  onMouseEnter: e => { e.currentTarget.style.borderColor = '#0A6B52'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(10,107,82,.1)' },
                  onMouseLeave: e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.boxShadow = 'none' },
                },
                  // 日付バッジ
                  React.createElement('div', {
                    style:{ minWidth:'52px', textAlign:'center', background:'#F0F8F4', borderRadius:'8px', padding:'8px 6px' }
                  },
                    React.createElement('div', { style:{ fontSize:'18px', fontWeight:800, color:'#0A6B52', lineHeight:1 } }, d.date.slice(8)),
                    React.createElement('div', { style:{ fontSize:'10px', color:'#6B7280', marginTop:'2px' } }, d.date.slice(5, 7) + '月')
                  ),
                  // 内容
                  React.createElement('div', { style:{ flex:1, minWidth:0 } },
                    React.createElement('div', { style:{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'5px', flexWrap:'wrap' } },
                      React.createElement('span', { style:{ fontSize:'13px', fontWeight:700, color:'#111827' } }, s ? s.name : `ID:${d.staff_id}`),
                      d.work_division && React.createElement('span', {
                        style:{ fontSize:'10px', fontWeight:700, padding:'2px 8px', borderRadius:'20px',
                          background: d.work_division === '休日' ? '#FEF2F2' : '#EEF6F2', color: d.work_division === '休日' ? '#B91C1C' : '#0A6B52' }
                      }, d.work_division),
                      d.plan_no && React.createElement('span', { style:{ fontSize:'11px', color:'#6B7280' } }, `計画 ${d.plan_no}`),
                      React.createElement('span', { style:{ fontSize:'12px', color:'#6B7280' } },
                        `${d.start_time}〜${d.end_time}（休憩${d.break_minutes}分 / 実働 ${calcWorkHours(d)}）`
                      ),
                    ),
                    React.createElement('div', { style:{ fontSize:'13px', color:'#374151', lineHeight:1.6, marginBottom:'4px' } }, diaryWorkContent(d) || '（休日）'),
                    diaryGuidance(d) && React.createElement('div', { style:{ fontSize:'12px', color:'#0A6B52', lineHeight:1.5, marginBottom:'2px' } }, `指導: ${diaryGuidance(d)}`),
                    d.notes && React.createElement('div', { style:{ fontSize:'11px', color:'#9CA3AF' } }, `📝 ${d.notes}`),
                    d.supervisor && React.createElement('div', { style:{ fontSize:'11px', color:'#9CA3AF' } }, `👤 指導者: ${d.supervisor}`),
                  ),
                  // 編集ボタン（カード右上）
                  React.createElement('button', {
                    onClick: e => { e.stopPropagation(); setEditTarget(d); setSelectedDiary(null) },
                    style:{ background:'none', border:'none', cursor:'pointer', color:'#94A3B8', fontSize:'15px', padding:'4px' }
                  }, React.createElement('i', { className:'ti ti-edit' }))
                )
              })
            )
      ),

    // ── 詳細モーダル ──
    selectedDiary && (() => {
      const d = selectedDiary
      const s = (staff||[]).find(x => x.id === d.staff_id)
      return React.createElement('div', {
        style:{ position:'fixed', inset:0, background:'rgba(17,24,39,.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' },
        onClick: () => setSelectedDiary(null)
      },
        React.createElement('div', {
          style:{ background:'#FFFFFF', borderRadius:'12px', padding:'24px', width:'480px', maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.2)', animation:'fadeInDown .18s ease' },
          onClick: e => e.stopPropagation()
        },

          // ── ヘッダー ──
          React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' } },
            React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'10px' } },
              React.createElement('div', { style:{ width:36, height:36, borderRadius:'50%', background:'#0A6B52', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 } },
                React.createElement('i', { className:'ti ti-notebook', style:{ fontSize:'18px', color:'#FFFFFF' } })
              ),
              React.createElement('div', null,
                React.createElement('div', { style:{ fontSize:'15px', fontWeight:700, color:'#111827' } }, '作業日誌'),
                React.createElement('div', { style:{ fontSize:'12px', color:'#6B7280' } }, d.date + (s ? '　' + s.name : ''))
              )
            ),
            React.createElement('button', {
              onClick: () => setSelectedDiary(null),
              style:{ background:'none', border:'none', cursor:'pointer', fontSize:'20px', color:'#9CA3AF', lineHeight:1, padding:'4px' }
            }, '✕')
          ),

          // 【スタッフ スキル管理 Step1-6】対象実習生の主要スキルを参照表示
          // skills が未設定の既存データでも落ちないよう s.skills || [] でフォールバック
          s && (() => {
            const skills = s.skills || []
            return React.createElement('div', {
              style:{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap', marginBottom:'14px' }
            },
              React.createElement('span', { style:{ fontSize:'10px', fontWeight:700, color:'#9CA3AF', flexShrink:0 } }, 'スキル:'),
              skills.length === 0
                ? React.createElement('span', { style:{ fontSize:'11px', color:'#B0B8C1' } }, '未登録')
                : React.createElement(React.Fragment, null,
                    ...skills.map(sk => {
                      const meta = SKILL_MASTER.find(m => m.id === sk.skill_id)
                      return React.createElement('span', {
                        key: sk.skill_id,
                        style:{
                          fontSize:'10px', fontWeight:600, color:'#0A6B52',
                          background:'#F0F8F4', border:'1px solid #DDE8DE',
                          borderRadius:'10px', padding:'1px 8px'
                        }
                      }, meta ? meta.label : sk.skill_id)
                    })
                  )
            )
          })(),

          // ── 情報行（グレー背景ブロック） ──
          React.createElement('div', { style:{ background:'#F8FAF8', borderRadius:'8px', padding:'4px 12px', marginBottom:'16px' } },
            React.createElement('div', { style:rowStyle2 },
              React.createElement('span', { style:{ color:'#6B7280' } }, '日付'),
              React.createElement('span', { style:{ fontWeight:600 } }, d.date)
            ),
            React.createElement('div', { style:rowStyle2 },
              React.createElement('span', { style:{ color:'#6B7280' } }, '実習生'),
              React.createElement('span', { style:{ fontWeight:600 } }, s ? s.name : `ID:${d.staff_id}`)
            ),
            React.createElement('div', { style:rowStyle2 },
              React.createElement('span', { style:{ color:'#6B7280' } }, '作業時間'),
              React.createElement('span', { style:{ fontWeight:600 } }, `${d.start_time}〜${d.end_time}`)
            ),
            React.createElement('div', { style:rowStyle2 },
              React.createElement('span', { style:{ color:'#6B7280' } }, '休憩'),
              React.createElement('span', null, `${d.break_minutes}分`)
            ),
            React.createElement('div', { style:rowStyle2 },
              React.createElement('span', { style:{ color:'#6B7280' } }, '実働時間'),
              React.createElement('span', { style:{ fontWeight:700, color:'#0A6B52' } }, calcWorkHours(d))
            ),
            d.work_division && React.createElement('div', { style:rowStyle2 },
              React.createElement('span', { style:{ color:'#6B7280' } }, '業務区分'),
              React.createElement('span', { style:{ fontWeight:600 } }, d.work_division)
            ),
            d.plan_no && React.createElement('div', { style:rowStyle2 },
              React.createElement('span', { style:{ color:'#6B7280' } }, '実習計画番号'),
              React.createElement('span', { style:{ fontWeight:600 } }, d.plan_no)
            ),
            d.supervisor && React.createElement('div', { style:rowStyle2 },
              React.createElement('span', { style:{ color:'#6B7280' } }, '指導者'),
              React.createElement('span', null, d.supervisor)
            ),
            React.createElement('div', { style:{ ...rowStyle2, alignItems:'flex-start', borderBottom: diaryGuidance(d) ? '1px solid #F1F5F9' : 'none' } },
              React.createElement('span', { style:{ color:'#6B7280', flexShrink:0 } }, '従事した業務'),
              React.createElement('span', { style:{ fontWeight:600, textAlign:'right', whiteSpace:'pre-wrap', lineHeight:1.6 } }, diaryWorkContent(d) || '（休日）')
            ),
            diaryGuidance(d) && React.createElement('div', { style:{ ...rowStyle2, alignItems:'flex-start', borderBottom:'none' } },
              React.createElement('span', { style:{ color:'#6B7280', flexShrink:0 } }, '指導の内容'),
              React.createElement('span', { style:{ fontWeight:600, textAlign:'right', whiteSpace:'pre-wrap', lineHeight:1.6, color:'#0A6B52' } }, diaryGuidance(d))
            ),
          ),

          // ── 特記事項（黄色ブロック・値がある場合のみ） ──
          d.notes && React.createElement('div', { style:{ display:'flex', alignItems:'flex-start', gap:'8px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:'8px', padding:'10px 12px', marginBottom:'16px' } },
            React.createElement('i', { className:'ti ti-note', style:{ fontSize:'15px', color:'#B45309', flexShrink:0, marginTop:'1px' } }),
            React.createElement('div', null,
              React.createElement('div', { style:{ fontSize:'11px', fontWeight:700, color:'#B45309', marginBottom:'2px' } }, '特記事項'),
              React.createElement('div', { style:{ fontSize:'13px', color:'#78350F', lineHeight:1.6 } }, d.notes)
            )
          ),

          // ── ボタン群（削除・編集・閉じる） ──
          React.createElement('div', { style:{ display:'flex', gap:'8px' } },
            React.createElement('button', {
              onClick: () => { setDeleteTarget(d); setSelectedDiary(null) },
              style:{
                display:'flex', alignItems:'center', justifyContent:'center', gap:'5px',
                padding:'9px 14px', borderRadius:'4px', fontSize:'13px', fontWeight:600,
                cursor:'pointer', border:'1.5px solid #FCA5A5', background:'#FEF2F2', color:'#DC2626'
              }
            },
              React.createElement('i', { className:'ti ti-trash', style:{ fontSize:'13px' } }),
              '削除'
            ),
            React.createElement('button', {
              onClick: () => { setEditTarget(d); setSelectedDiary(null) },
              style:{
                flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'5px',
                padding:'9px 18px', borderRadius:'4px', fontSize:'13px', fontWeight:600,
                cursor:'pointer', border:'1.5px solid #93C5FD', background:'#EFF6FF', color:'#1D4ED8'
              }
            },
              React.createElement('i', { className:'ti ti-edit', style:{ fontSize:'13px' } }),
              '編集'
            ),
            React.createElement('button', {
              onClick: () => setSelectedDiary(null),
              style:{ flex:1, padding:'9px 18px', borderRadius:'4px', border:'none', background:'#0A6B52', color:'#fff', fontSize:'13px', fontWeight:700, cursor:'pointer' }
            }, '閉じる')
          )
        )
      )
    })(),

    // ── 削除確認モーダル ──
    deleteTarget && React.createElement(ConfirmDeleteModal, {
      title: '日誌を削除しますか？',
      targetName: (() => {
        const s = (staff||[]).find(x => x.id === deleteTarget.staff_id)
        return (s ? s.name : `ID:${deleteTarget.staff_id}`) + '　' + deleteTarget.date
      })(),
      onCancel: () => setDeleteTarget(null),
      onConfirm: () => { onDelete(deleteTarget.id); setDeleteTarget(null) }
    }),

    // ── 新規追加モーダル ──
    showAddModal && React.createElement(DiaryFormModal, {
      initialValues: emptyForm(),
      isEdit: false,
      onClose: () => setShowAddModal(false),
      onSave: handleAdd
    }),

    // ── 編集モーダル ──
    editTarget && React.createElement(DiaryFormModal, {
      initialValues: editTarget,
      isEdit: true,
      onClose: () => setEditTarget(null),
      onSave: handleEdit
    })
  )
}

function PlanCompareCard() {
  const [active, setActive] = React.useState(null)

  const plans = [
    {
      id: 'A',
      label: 'プランA',
      subtitle: '専用カスタム開発モデル',
      accentColor: CONFIG.COLOR.primary,
      accentBg: '#ECFDF5',
      accentBorder: '#6EE7B7',
      icon: '🏛️',
      price: '¥500〜700万',
      priceSub: '農場名の業務に合わせた専用設計',
      period: '約18週間（4.5ヶ月）',
      tag: '農場名 専用設計',
      tagColor: '#065F46',
      tagBg: '#D1FAE5',
      features: [
        { icon: '✅', text: '農場名の業務フローに100%合わせた設計' },
        { icon: '✅', text: 'スタッフ増員・圃場拡大にも耐える堅牢なインフラ' },
        { icon: '✅', text: '栽培データ（秘伝レシピ）の完全な知財保護' },
        { icon: '✅', text: 'GAP更新・大手スーパー取引に必要な監査ログ完備' },
        { icon: '✅', text: '外国人実習生向け多言語マニュアル機能' },
      ],
      summary: '売値を自分たちで決められない業界で、GAP管理を武器に差別化する「攻めの投資」',
    },
    {
      id: 'B',
      label: 'プランB',
      subtitle: '共同開発・パッケージ展開モデル',
      accentColor: '#1D4ED8',
      accentBg: '#EFF6FF',
      accentBorder: '#93C5FD',
      icon: '🤝',
      price: '¥300万〜',
      priceSub: '初期費用を大幅に抑えたスタート',
      period: '約8週間（MVP版）',
      tag: '千葉県・全国展開 第一号',
      tagColor: '#1E3A8A',
      tagBg: '#DBEAFE',
      features: [
        { icon: '✅', text: '初期費用を最小化してシステムをスタート' },
        { icon: '✅', text: '農場名がパッケージ開発の「第一号ユーザー」として参画' },
        { icon: '✅', text: 'フィードバックにより仕様に優先的に反映' },
        { icon: '✅', text: 'SaaS横展開後の収益分配モデルを協議可能' },
        { icon: '⚠️', text: '他農家にも展開する汎用設計（農園独自仕様は制限あり）' },
        { icon: '⚠️', text: '農場名の栽培データが設計に影響する可能性' },
      ],
      summary: 'コストを抑えつつ、将来のSaaS展開で「開発パートナー」として関与する共創モデル',
    },
  ]

  const compare = [
    { label: '初期費用',        A: '500〜700万円', B: '300万円〜' },
    { label: '開発期間',        A: '約18週間',      B: '約8週間（MVP）' },
    { label: 'カスタマイズ性',  A: '100%自由',      B: '汎用ベース' },
    { label: 'データ独占権',    A: '完全に農園が保有', B: '要協議' },
    { label: '将来の拡張性',    A: '無制限',        B: 'SaaS機能に準拠' },
    { label: '他農家への展開',  A: 'なし（専用）',  B: 'あり（パッケージ）' },
  ]

  return React.createElement('div', { style:{marginTop:'32px'} },

    // ── セクションヘッダー
    React.createElement('div', { style:{display:'flex',alignItems:'center',gap:'10px',marginBottom:'6px'} },
      React.createElement('div', { style:{width:'3px',height:'20px',background:'linear-gradient(180deg,#B8976A,'+CONFIG.COLOR.primary+')',borderRadius:'2px'} }),
      React.createElement('div', { className:'page-title', style:{margin:0,fontSize:'18px'} }, '開発モデル 比較'),
    ),
    React.createElement('div', { className:'page-sub', style:{marginBottom:'20px'} },
      'プランA（専用カスタム）とプランB（共同開発パッケージ）の特徴・費用・期間を比較します'
    ),

    // ── 2カラムカード
    React.createElement('div', { style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'20px'} },
      ...plans.map(plan =>
        React.createElement('div', {
          key: plan.id,
          onClick: () => setActive(active === plan.id ? null : plan.id),
          style:{
            background:'#FFFFFF',
            border: `1.5px solid ${active===plan.id ? plan.accentColor : '#D8E4D8'}`,
            borderRadius:'16px',
            padding:'24px',
            cursor:'pointer',
            transition:'all .18s',
            boxShadow: 'none',
          }
        },

          // ヘッダー行
          React.createElement('div', { style:{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:'16px'} },
            React.createElement('div', null,
              React.createElement('div', { style:{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'} },
                React.createElement('span', { style:{fontSize:'22px'} }, plan.icon),
                React.createElement('span', {
                  style:{fontSize:'18px',fontWeight:700,color:'#111827',letterSpacing:'-.02em'}
                }, plan.label)
              ),
              React.createElement('div', { style:{fontSize:'12px',color:'#64748B',fontWeight:500} }, plan.subtitle)
            ),
            React.createElement('span', {
              style:{
                fontSize:'10px',fontWeight:700,padding:'3px 9px',borderRadius:'20px',
                background:plan.tagBg,color:plan.tagColor,border:`1px solid ${plan.accentBorder}`,
                whiteSpace:'nowrap',flexShrink:0,marginTop:'2px'
              }
            }, plan.tag)
          ),

          // 価格・期間
          React.createElement('div', {
            style:{
              background:plan.accentBg,border:`1px solid ${plan.accentBorder}`,
              borderRadius:'10px',padding:'14px 16px',marginBottom:'16px'
            }
          },
            React.createElement('div', { style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'12px'} },
              React.createElement('div', null,
                React.createElement('div', { style:{fontSize:'11px',fontWeight:700,color:plan.accentColor,letterSpacing:'.06em',textTransform:'uppercase',marginBottom:'4px'} }, '想定費用'),
                React.createElement('div', { style:{fontSize:'22px',fontWeight:700,color:'#111827',letterSpacing:'-.02em'} }, plan.price),
                React.createElement('div', { style:{fontSize:'12px',color:'#64748B',marginTop:'3px'} }, plan.priceSub)
              ),
              React.createElement('div', { style:{textAlign:'right'} },
                React.createElement('div', { style:{fontSize:'11px',fontWeight:700,color:plan.accentColor,letterSpacing:'.06em',textTransform:'uppercase',marginBottom:'4px'} }, '開発期間'),
                React.createElement('div', { style:{fontSize:'18px',fontWeight:700,color:'#111827'} }, plan.period)
              )
            )
          ),

          // 特徴リスト
          React.createElement('div', { style:{marginBottom:'14px'} },
            ...plan.features.map((f,i) =>
              React.createElement('div', {
                key:i,
                style:{
                  display:'flex',alignItems:'flex-start',gap:'8px',
                  padding:'6px 0',
                  borderBottom: i < plan.features.length-1 ? '1px solid #F1F5F1' : 'none',
                  fontSize:'12px',color:'#374151',lineHeight:'1.5'
                }
              },
                React.createElement('span', { style:{fontSize:'13px',flexShrink:0,marginTop:'1px'} }, f.icon),
                f.text
              )
            )
          ),

          // サマリー
          React.createElement('div', {
            style:{
              fontSize:'11px',color:plan.accentColor,fontWeight:600,
              background:plan.accentBg,borderRadius:'8px',padding:'10px 12px',
              lineHeight:'1.6'
            }
          }, plan.summary)
        )
      )
    ),

    // ── 比較テーブル
    React.createElement('div', { className:'card', style:{padding:0,overflow:'hidden'} },
      React.createElement('div', {
        style:{
          padding:'14px 20px',borderBottom:'1px solid #E2E8E2',
          background:'#F8FAF8',
          display:'flex',alignItems:'center',gap:'8px'
        }
      },
        React.createElement('span', { style:{fontSize:'14px'} }, '📊'),
        React.createElement('span', { style:{fontSize:'12px',fontWeight:700,color:'#374151',letterSpacing:'.04em',textTransform:'uppercase'} }, 'プラン比較表')
      ),
      React.createElement('table', { className:'table', style:{margin:0} },
        React.createElement('thead', null,
          React.createElement('tr', null,
            React.createElement('th', { style:{width:'160px',background:'#F8FAF8'} }, '比較項目'),
            React.createElement('th', { style:{textAlign:'center',background:'#ECFDF5',color:'#065F46'} }, '🏛️ プランA（専用）'),
            React.createElement('th', { style:{textAlign:'center',background:'#EFF6FF',color:'#1E3A8A'} }, '🤝 プランB（共同）'),
          )
        ),
        React.createElement('tbody', null,
          ...compare.map((row, i) =>
            React.createElement('tr', { key:i },
              React.createElement('td', {
                style:{fontWeight:600,color:'#374151',fontSize:'12px',background:'#FAFBFA'}
              }, row.label),
              React.createElement('td', {
                style:{textAlign:'center',fontSize:'12px',color:'#065F46',fontWeight:500,background: i%2===0?'#F0FDF4':'#FFFFFF'}
              }, row.A),
              React.createElement('td', {
                style:{textAlign:'center',fontSize:'12px',color:'#1E3A8A',fontWeight:500,background: i%2===0?'#EFF6FF22':'#FFFFFF'}
              }, row.B),
            )
          )
        )
      )
    ),

    // ── 推奨メモ
    React.createElement('div', {
      style:{
        marginTop:'16px',
        background:'#FFFBEB',
        border:'1px solid #FDE68A',borderRadius:'12px',
        padding:'16px 20px',display:'flex',alignItems:'flex-start',gap:'12px'
      }
    },
      React.createElement('span', { style:{fontSize:'20px',flexShrink:0} }, '💡'),
      React.createElement('div', null,
        React.createElement('div', { style:{fontSize:'14px',fontWeight:700,color:'#78350F',marginBottom:'4px'} }, '開発モデルの選択について'),
        React.createElement('div', { style:{fontSize:'12px',color:'#92400E',lineHeight:'1.65'} },
          'グローバルGAP対応の中核データ（農薬散布記録・施肥記録）は農場名の「知的財産」です。' +
          'プランAは初期投資が大きい一方、データを完全に農園が保有し、GAP更新リスクを排除できます。' +
          'プランBはスモールスタートに適していますが、汎用設計のため独自業務フローへの対応に限界があります。'
        )
      )
    )
  )
}

// =====================================================
// ⑤ 多言語マニュアルライブラリ（モック実装）
// 日本語 / 英語 / ベトナム語 の3言語タブ
// PDF・動画マニュアルをカード表示
// =====================================================
function ManualLibrary() {
  const [lang,    setLang]    = React.useState('ja')
  const [preview, setPreview] = React.useState(null)
  const [search,  setSearch]  = React.useState('')

  const cfg     = LANG_CONFIG.find(l => l.key === lang)
  const manuals = (MANUAL_DATA[lang] || []).filter(m =>
    m.title.toLowerCase().includes(search.toLowerCase()) ||
    m.desc.toLowerCase().includes(search.toLowerCase())
  )
  const pdfCount   = (MANUAL_DATA[lang]||[]).filter(m=>m.type==='pdf').length
  const videoCount = (MANUAL_DATA[lang]||[]).filter(m=>m.type==='video').length

  return React.createElement('div', { className:'page' },
    // ヘッダー
    React.createElement('div', { className:'eyebrow' }, 'STAFF MANUAL LIBRARY'),
    React.createElement('div', { className:'page-title' }, '多言語マニュアルライブラリ'),
    React.createElement('div', { className:'page-sub' },
      '外国人実習生・スタッフ向けマニュアルを言語別に管理。PDF・動画を一元管理。'
    ),

    // 言語タブ
    React.createElement('div', {
      style:{ display:'flex', gap:'8px', marginTop:'20px', marginBottom:'16px', flexWrap:'wrap' }
    },
      ...LANG_CONFIG.map(l =>
        React.createElement('button', {
          key: l.key,
          onClick: () => { setLang(l.key); setSearch('') },
          style:{
            padding:'8px 20px', borderRadius:'24px', border:'none', cursor:'pointer',
            fontSize:'14px', fontWeight:600, transition:'all .15s',
            background: lang===l.key ? l.color : '#F1F5F9',
            color:       lang===l.key ? '#fff'   : '#64748B',
            boxShadow:   lang===l.key ? '0 2px 8px rgba(0,0,0,.18)' : 'none',
          }
        }, l.label)
      )
    ),

    // サマリーバー
    React.createElement('div', {
      style:{
        display:'flex', gap:'12px', marginBottom:'16px',
        background:'#F8FAFC', border:'1px solid #E2E8F0',
        borderRadius:'10px', padding:'12px 16px', alignItems:'center'
      }
    },
      React.createElement('span', {
        style:{ fontSize:'11px', fontWeight:700, color:cfg.color,
                background:cfg.color+'18', padding:'2px 10px', borderRadius:'20px' }
      }, cfg.badge),
      React.createElement('span', { style:{ fontSize:'12px', color:'#64748B' } },
        `PDF ${pdfCount}件  ／  動画 ${videoCount}件`
      ),
      React.createElement('div', { style:{ flex:1 } }),
      // 検索
      React.createElement('input', {
        type:'text', placeholder:'マニュアルを検索…', value:search,
        onChange: e => setSearch(e.target.value),
        style:{
          padding:'6px 12px', borderRadius:'8px', border:'1px solid #CBD5E1',
          fontSize:'12px', color:'#334155', background:'#fff', outline:'none', width:'180px'
        }
      })
    ),

    // マニュアルカード一覧
    manuals.length === 0
      ? React.createElement('div', {
          className:'page-grow',
          style:{ textAlign:'center', padding:'48px', color:'#94A3B8', fontSize:'14px' }
        }, '該当するマニュアルが見つかりません')
      : React.createElement('div', {
          className:'page-grow',
          style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:'12px', alignContent:'start' }
        },
          ...manuals.map(m =>
            React.createElement('div', {
              key: m.id,
              onClick: () => setPreview(m),
              className: 'manual-card',
              style:{ borderColor: cfg ? cfg.color : '#E2E8F0' },
            },
              React.createElement('div', { style:{ display:'flex', alignItems:'flex-start', gap:'12px' } },
                React.createElement('div', {
                  style:{
                    width:'44px', height:'44px', borderRadius:'10px',
                    background: m.type==='pdf' ? '#EFF6FF' : '#FFF7ED',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:'22px', flexShrink:0,
                  }
                }, m.thumb),
                React.createElement('div', { style:{ flex:1, minWidth:0 } },
                  React.createElement('div', {
                    style:{ fontSize:'14px', fontWeight:600, color:'#1E293B', lineHeight:1.4, marginBottom:'4px' }
                  }, m.title),
                  React.createElement('div', {
                    style:{ fontSize:'12px', color:'#64748B', lineHeight:1.5, marginBottom:'8px' }
                  }, m.desc)
                )
              ),
              React.createElement('div', {
                style:{ display:'flex', alignItems:'center', gap:'6px', marginTop:'8px' }
              },
                React.createElement('span', {
                  style:{
                    fontSize:'10px', fontWeight:600, padding:'2px 8px', borderRadius:'20px',
                    background: m.type==='pdf' ? '#DBEAFE' : '#FED7AA',
                    color:      m.type==='pdf' ? '#1D4ED8' : '#92400E',
                  }
                }, m.type==='pdf' ? 'PDF' : '動画'),
                React.createElement('span', { style:{ fontSize:'12px', color:'#94A3B8' } },
                  m.type==='pdf' ? `${m.pages}ページ` : m.duration
                ),
                React.createElement('div', { style:{ flex:1 } }),
                React.createElement('span', { style:{ fontSize:'10px', color:'#CBD5E1' } }, m.updated)
              )
            )
          )
        ),

    // プレビューモーダル
    preview && React.createElement('div', {
      onClick: () => setPreview(null),
      style:{
        position:'fixed', inset:0, background:'rgba(0,0,0,.5)',
        display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000
      }
    },
      React.createElement('div', {
        onClick: e => e.stopPropagation(),
        style:{
          background:'#fff', borderRadius:'16px', padding:'28px',
          width:'480px', maxWidth:'90vw', boxShadow:'0 20px 60px rgba(0,0,0,.25)'
        }
      },
        React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'16px' } },
          React.createElement('div', {
            style:{
              width:'48px', height:'48px', borderRadius:'12px', flexShrink:0,
              background: preview.type==='pdf' ? '#EFF6FF' : '#FFF7ED',
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:'24px'
            }
          }, preview.thumb),
          React.createElement('div', null,
            React.createElement('div', { style:{ fontSize:'14px', fontWeight:700, color:'#1E293B' } }, preview.title),
            React.createElement('div', { style:{ fontSize:'12px', color:'#64748B', marginTop:'2px' } }, preview.desc)
          )
        ),
        React.createElement('div', {
          style:{
            background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:'10px',
            padding:'16px', marginBottom:'16px'
          }
        },
          React.createElement('div', { style:{ fontSize:'12px', color:'#64748B', lineHeight:1.8 } },
            React.createElement('div', null, `📁 種別：${preview.type==='pdf'?'PDFドキュメント':'研修動画'}`),
            React.createElement('div', null, preview.type==='pdf'
              ? `📄 ページ数：${preview.pages}ページ`
              : `⏱ 視聴時間：${preview.duration}`),
            React.createElement('div', null, `🕐 最終更新：${preview.updated}`),
            React.createElement('div', null, `🌐 言語：${LANG_CONFIG.find(l=>l.key===lang)?.label}`)
          )
        ),
        // モックプレビューエリア
        React.createElement('div', {
          style:{
            background: preview.type==='pdf' ? '#F0F4FF' : '#FFF3E0',
            border:`2px dashed ${preview.type==='pdf'?'#93C5FD':'#FCA5A5'}`,
            borderRadius:'10px', padding:'24px', textAlign:'center',
            marginBottom:'16px', color:'#64748B', fontSize:'12px'
          }
        },
          React.createElement('div', { style:{ fontSize:'32px', marginBottom:'8px' } },
            preview.type==='pdf' ? '📄' : '▶️'
          ),
          React.createElement('div', { style:{ fontWeight:600, marginBottom:'4px' } },
            preview.type==='pdf' ? 'PDFビューアー' : '動画プレイヤー'
          ),
          React.createElement('div', null, '（本番環境ではSupabase Storageから読み込まれます）')
        ),
        React.createElement('div', { style:{ display:'flex', gap:'8px' } },
          React.createElement('button', {
            style:{
              flex:1, padding:'10px', borderRadius:'8px', border:'none', cursor:'pointer',
              background:cfg.color, color:'#fff', fontSize:'14px', fontWeight:600
            }
          }, preview.type==='pdf' ? '📥 ダウンロード（モック）' : '▶️ 再生（モック）'),
          React.createElement('button', {
            onClick: () => setPreview(null),
            style:{
              padding:'10px 16px', borderRadius:'8px', cursor:'pointer',
              background:'#F1F5F9', border:'none', color:'#64748B', fontSize:'14px'
            }
          }, '閉じる')
        )
      )
    )
  )
}

function Settings() {
  return React.createElement('div',{className:'page'},
    React.createElement('div',{className:'eyebrow'},'SYSTEM SETTINGS'),
    React.createElement('div',{className:'page-title'},'設定'),
    React.createElement('div',{className:'page-sub'},'農園情報とシステム設定'),

    React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'24px',alignItems:'start'}},

      // 左: 農園情報
      React.createElement('div',{className:'card'},
        React.createElement('div',{className:'section-title'},'🌾 農園情報'),
        ...[['農園名','農場名'],['代表者','中川啓大'],['所在地','神奈川県相模原市'],['連絡先','042-xxx-xxxx'],['メール','nakagawa@farm.example.jp']].map(([k,v])=>
          React.createElement('div',{key:k,className:'form-group'},
            React.createElement('label',{className:'form-label'},k),
            React.createElement('input',{type:'text',className:'form-input',defaultValue:v})
          )
        ),
        React.createElement('button',{className:'btn btn-primary',style:{width:'100%'}},'保存する')
      ),

      // 右: 保存演出 + Supabase設定 + その他
      React.createElement('div',null,
        React.createElement(SaveEffectSetting, null),
        React.createElement('div',{className:'card',style:{marginBottom:'16px'}},
          React.createElement('div',{className:'section-title'},'🔌 Supabase 接続設定'),
          React.createElement('div',{className:'sup-note',style:{marginBottom:'16px'}},'現在: モックデータ動作中 — Supabase URL を設定するとリアルDBに切り替わります'),
          React.createElement('div', { className:'form-group' },
            React.createElement('label', { className:'form-label' }, 'Supabase URL'),
            React.createElement('input', { type:'text', className:'form-input', placeholder:'https://xxxx.supabase.co' })
          ),
          React.createElement('div', { className:'form-group' },
            React.createElement('label', { className:'form-label' }, 'Anon Key'),
            React.createElement('input', { type:'password', className:'form-input', placeholder:'eyJhbGciOiJIUzI1NiIs...' })
          ),
          React.createElement('button',{className:'btn btn-primary',style:{width:'100%'}},'接続テスト')
        ),
        React.createElement('div',{className:'card'},
          React.createElement('div',{className:'section-title'},'⚙️ システム'),
          ...[['GAP認証種別','JGAP'],['データエクスポート形式','PDF + Excel'],['言語','日本語']].map(([k,v])=>
            React.createElement('div',{key:k,style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #F1F5F9',fontSize:'14px'}},
              React.createElement('span',{style:{color:'#6B7280'}},k),
              React.createElement('span',{style:{color:'#374151',fontWeight:600}},v)
            )
          )
        )
      )
    )
  )
}

// =====================================================
// 作付計画: モックデータ
// =====================================================
// =====================================================
// 作付計画: PDF出力（html2canvas利用）
// =====================================================
async function exportCropPlanPDF(plans, fields) {
  if (!(await confirmDownload({ icon:'📄', title:'栽培計画書をPDF出力', desc:'作付計画（栽培計画書）をPDFで出力します。', filename:'栽培計画書_農場名.pdf' }))) return
  await ensurePdfLibs()
  const el = document.getElementById('crop-plan-pdf-preview')
  const today = new Date().toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric' })

  const rows = fields.map(f => {
    const fPlans = plans.filter(p => String(p.field_id) === String(f.id))
    return { field: f, plans: fPlans }
  })

  el.innerHTML = `
    <div style="font-family:'Noto Sans JP','Hiragino Sans','Yu Gothic','Meiryo',sans-serif;padding:24px;background:#fff;color:#111;width:900px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
        <div>
          <h2 style="font-size:18px;font-weight:700;margin:0 0 4px">栽培計画書</h2>
          <div style="font-size:11px;color:#555">農園名: 農場名　／　作成日: ${today}</div>
        </div>
        <div style="font-size:10px;color:#888;text-align:right">JGAP / GlobalGAP 対応<br>農薬管理・トレーサビリティ用</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr style="background:#1a5276;color:#fff">
            <th style="padding:7px 10px;text-align:left;border:1px solid #aaa;width:90px">圃場</th>
            <th style="padding:7px 10px;text-align:left;border:1px solid #aaa;width:70px">作物</th>
            ${MONTHS.map(m => `<th style="padding:7px 4px;text-align:center;border:1px solid #aaa;width:56px">${m}</th>`).join('')}
            <th style="padding:7px 10px;text-align:left;border:1px solid #aaa">備考</th>
          </tr>
        </thead>
        <tbody>
          ${rows.flatMap(({field, plans}) => {
            if (plans.length === 0) {
              return [`<tr>
                <td style="padding:6px 10px;border:1px solid #ddd">${escHtml(field.name)}</td>
                <td style="padding:6px 10px;border:1px solid #ddd;color:#aaa">—</td>
                ${MONTHS.map(()=>`<td style="border:1px solid #ddd"></td>`).join('')}
                <td style="border:1px solid #ddd"></td>
              </tr>`]
            }
            return plans.map((plan, pi) => `<tr style="${pi%2===1?'background:#f9f9f9':''}">
              <td style="padding:6px 10px;border:1px solid #ddd">${pi===0 ? escHtml(field.name) : ''}</td>
              <td style="padding:6px 10px;border:1px solid #ddd;font-weight:500">${escHtml(plan.crop)}</td>
              ${MONTHS.map((_,i) => {
                const m = i + 1
                const inRange = m >= plan.start_month && m <= plan.end_month
                return `<td style="border:1px solid #ddd;padding:3px;text-align:center">
                  ${inRange ? `<div style="background:${escHtml(plan.color)};border-radius:3px;height:18px;font-size:9px;line-height:18px;color:#fff;font-weight:600">${m===plan.start_month?escHtml(plan.crop):''}</div>` : ''}
                </td>`
              }).join('')}
              <td style="padding:6px 10px;border:1px solid #ddd;font-size:10px;color:#555">${escHtml(plan.note)}</td>
            </tr>`)
          }).join('')}
        </tbody>
      </table>
      <div style="margin-top:14px;font-size:9px;color:#888;text-align:right">
        ※ 本栽培計画書はGAP審査提出用に作成　農場名
      </div>
    </div>
  `
  el.style.display = 'block'
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false })
  el.style.display = 'none'
  el.innerHTML = ''

  const { jsPDF } = window.jspdf
  const pdf  = new jsPDF('l', 'mm', 'a4')
  const imgW = 277
  const imgH = canvas.height * imgW / canvas.width
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, 10, imgW, imgH)
  pdf.save('栽培計画書_農場名.pdf')
}

// =====================================================
// 作付計画: CropPlan コンポーネント（シンプルガント）
// ※ MONTHS / MONTH_LABELS / CROP_COLORS / CROPS_LIST はファイル上部定数セクション参照（C06-3）
// =====================================================
function CropPlan({ fields, plans, records, pesticides, onAdd, onDelete }) {
  const [showForm, setShowForm] = React.useState(false)
  const [exporting, setExporting]     = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState(null)
  const [form, setForm]         = React.useState({
    field_id: '', crop: 'レタス', start_month: 4, end_month: 6, note: ''
  })
  const updateField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // 収穫前日数違反チェック: 作付期間終了月の前 preharvest_days 日以内に農薬散布があるか
  const violations = React.useMemo(() => {
    const result = []
    plans.forEach(plan => {
      records
        .filter(r => String(r.field_id) === String(plan.field_id) && r.work_type === '農薬散布' && r.pesticide_id)
        .forEach(r => {
          const pest = masterById(pesticides, r.pesticide_id)
          if (!pest) return
          const harvestDate = new Date(CONFIG.CURRENT_YEAR, plan.end_month, 1) // 収穫月の1日
          const sprayDate   = new Date(r.date)
          const diffDays    = Math.ceil((harvestDate - sprayDate) / 86400000)
          if (diffDays >= 0 && diffDays < pest.preharvest_days) {
            result.push({
              planId: plan.id, recordId: r.id,
              fieldName: masterById(fields, plan.field_id)?.name || '?',
              crop: plan.crop, pestName: pest.name,
              sprayDate: r.date, preharvest: pest.preharvest_days, diffDays
            })
          }
        })
    })
    return result
  }, [plans, records, pesticides, fields])

  // 重複チェック（C02-4: 共通ユーティリティ使用）
  const hasOverlap = React.useMemo(() => {
    if (!form.field_id) return false
    return hasCropOverlap(plans, form.field_id, form.start_month, form.end_month)
  }, [form, plans])

  const handleAdd = () => {
    if (!form.field_id || hasOverlap) return
    const crop = form.crop
    onAdd({
      ...form, id: Date.now(),
      field_id: String(form.field_id),
      start_month: Number(form.start_month),
      end_month: Number(form.end_month),
      color: CROP_COLORS[crop] || '#94A3B8'
    })
    setForm({ field_id:'', crop:'レタス', start_month:4, end_month:6, note:'' })
    setShowForm(false)
  }

  const handleExportPDF = async () => {
    setExporting(true)
    try { await exportCropPlanPDF(plans, fields) }
    catch(e) { showToast('PDF出力に失敗しました: '+e.message, 'error') }
    finally { setExporting(false) }
  }

  // 月幅 (%)
  const monthW = 100 / 12

  return React.createElement('div', { className:'page' },

    // ヘッダー
    React.createElement('div', { style:{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:'6px'} },
      React.createElement('div', null,
        React.createElement('div', { className:'eyebrow' }, 'CROP PLANNING'),
        React.createElement('div', { className:'page-title' }, '作付計画'),
        React.createElement('div', { className:'page-sub', style:{marginBottom:0} }, '年間の圃場別作付スケジュール / GAP栽培計画書として出力できます')
      ),
      React.createElement('div', { style:{display:'flex',gap:'8px',flexShrink:0,marginTop:'4px'} },
        React.createElement('button', {
          className:'btn btn-primary',
          onClick: handleExportPDF,
          disabled: exporting
        }, exporting ? '⏳ 生成中...' : '📄 栽培計画書 PDF'),
        React.createElement('button', {
          className:'btn btn-ghost',
          onClick: () => setShowForm(s => !s)
        }, showForm ? '✕ キャンセル' : '+ 作付を追加')
      )
    ),

    // 違反アラート
    violations.length > 0 && React.createElement('div', {
      style:{background:'#FEF2F2',border:'1px solid #FCA5A5',borderRadius:'8px',padding:'12px 16px',marginBottom:'16px'}
    },
      React.createElement('div', { style:{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px'} },
        React.createElement('span', { style:{fontSize:'18px'} }, '🚨'),
        React.createElement('span', { style:{fontSize:'14px',fontWeight:600,color:'#DC2626'} }, '収穫前日数違反の可能性 (' + violations.length + '件)')
      ),
      ...violations.map((v, i) =>
        React.createElement('div', {
          key: i,
          style:{fontSize:'12px',color:'#991B1B',padding:'4px 0',borderTop:i>0?'1px solid #3d1515':'none'}
        },
          `⚠️ ${v.fieldName}「${v.crop}」収穫予定 ${v.preharvest}日前以内に「${v.pestName}」散布 (${v.sprayDate}・残${v.diffDays}日)`
        )
      )
    ),

    // 追加フォーム
    showForm && React.createElement('div', { className:'card', style:{marginBottom:'16px'} },
      React.createElement(SectionTitle, { icon:'calendar-event' }, '作付を追加'),
      React.createElement('div', { style:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'12px',marginBottom:'12px'} },
        // 圃場（Step0: 元表記でも検索できるコンボボックスに変更）
        React.createElement('div', { className:'form-group', style:{marginBottom:0} },
          React.createElement('label', { className:'form-label' }, '圃場'),
          React.createElement(FieldSearchSelect, {
            fields, value: form.field_id, onChange: v => updateField('field_id', v)
          })
        ),
        // 作物
        React.createElement('div', { className:'form-group', style:{marginBottom:0} },
          React.createElement('label', { className:'form-label' }, '作物'),
          React.createElement('select', {
            className:'form-select', value:form.crop,
            onChange:e => updateField('crop', e.target.value)
          },
            ...CROPS_LIST.map(c => React.createElement('option', {key:c, value:c}, c))
          )
        ),
        // 開始月
        React.createElement('div', { className:'form-group', style:{marginBottom:0} },
          React.createElement('label', { className:'form-label' }, '開始月'),
          React.createElement('select', {
            className:'form-select', value:form.start_month,
            onChange:e => updateField('start_month', Number(e.target.value))
          },
            ...MONTH_LABELS.map((m,i) => React.createElement('option', {key:i, value:i+1}, m))
          )
        ),
        // 終了月
        React.createElement('div', { className:'form-group', style:{marginBottom:0} },
          React.createElement('label', { className:'form-label' }, '終了月'),
          React.createElement('select', {
            className:'form-select', value:form.end_month,
            onChange:e => updateField('end_month', Number(e.target.value))
          },
            ...MONTH_LABELS.map((m,i) => React.createElement('option', {key:i, value:i+1}, m))
          )
        )
      ),
      React.createElement('div', { style:{display:'grid',gridTemplateColumns:'1fr auto',gap:'12px',alignItems:'flex-end'} },
        React.createElement('div', { className:'form-group', style:{marginBottom:0} },
          React.createElement('label', { className:'form-label' }, '備考（任意）'),
          React.createElement('input', {
            type:'text', className:'form-input', value:form.note,
            onChange:e => updateField('note', e.target.value), placeholder:'例: 春作・連作注意'
          })
        ),
        React.createElement('div', null,
          hasOverlap && React.createElement('div', {
            style:{fontSize:'12px',color:'#DC2626',marginBottom:'6px'}
          }, '⚠️ 同圃場の期間が重複しています'),
          React.createElement('button', {
            className:'btn btn-primary',
            disabled: !form.field_id || form.start_month > form.end_month || hasOverlap,
            onClick: handleAdd
          }, '追加する')
        )
      )
    ),

    // ガントチャート本体
    React.createElement('div', { className:'card page-grow', style:{padding:'16px 20px'} },
      // 月ヘッダー
      React.createElement('div', { style:{display:'grid',gridTemplateColumns:'130px 1fr',gap:0,marginBottom:'8px'} },
        React.createElement('div', { style:{fontSize:'12px',color:'#6B7280'} }, '圃場'),
        React.createElement('div', { style:{display:'flex'} },
          ...MONTH_LABELS.map((m, i) =>
            React.createElement('div', {
              key:i,
              style:{
                flex:1, fontSize:'11px', fontWeight:600, color:'#6B7280',
                textAlign:'center', padding:'4px 0',
                background: i % 2 === 0 ? '#1a1e28' : 'transparent',
                borderRadius:'4px'
              }
            }, m)
          )
        )
      ),

      // 圃場ごとの行（UX-09: 計画 vs 実績バーを重ねて表示）
      React.createElement('div', { style:{display:'flex',flexDirection:'column',gap:'6px'} },
        ...fields.map(field => {
          const fieldPlans = plans.filter(p => String(p.field_id) === String(field.id))
          
          // UX-09: 実績バーの計算関数
          const getActualCoverage = () => {
            // この圃場の作付期間内での実績（作業記録）を集計
            const fieldRecords = records.filter(r => String(r.field_id) === String(field.id))
            if (fieldRecords.length === 0) return []
            
            // 月ごとに実績があるかを判定（1月=1, 2月=2, ..., 12月=12）
            const months = {}
            fieldRecords.forEach(r => {
              if (r.date) {
                const month = parseInt(r.date.slice(5, 7), 10)
                months[month] = true
              }
            })
            
            // 実績がある連続月の範囲を抽出
            const sortedMonths = Object.keys(months).map(Number).sort((a,b) => a-b)
            if (sortedMonths.length === 0) return []
            
            const ranges = []
            let rangeStart = sortedMonths[0]
            let rangeLast = sortedMonths[0]
            
            for (let i = 1; i < sortedMonths.length; i++) {
              if (sortedMonths[i] - rangeLast === 1) {
                rangeLast = sortedMonths[i]
              } else {
                ranges.push({ start: rangeStart, end: rangeLast })
                rangeStart = sortedMonths[i]
                rangeLast = sortedMonths[i]
              }
            }
            ranges.push({ start: rangeStart, end: rangeLast })
            return ranges
          }
          
          const actualRanges = getActualCoverage()
          
          return React.createElement('div', {
            key: field.id,
            style:{display:'grid',gridTemplateColumns:'130px 1fr',gap:0,alignItems:'center',minHeight:'40px'}
          },
            // 圃場名
            React.createElement('div', { style:{paddingRight:'12px'} },
              React.createElement('div', { style:{fontSize:'14px',fontWeight:600,color:'#374151'} }, field.name),
              React.createElement('div', { style:{fontSize:'12px',color:'#6B7280'} }, field.crop)
            ),
            // バー領域
            React.createElement('div', {
              style:{position:'relative',height:'36px',background:'#F8FAFF',borderRadius:'6px',overflow:'visible'}
            },
              // 月グリッド線
              ...MONTHS.map((_, i) =>
                i > 0 ? React.createElement('div', {
                  key:'grid'+i,
                  style:{
                    position:'absolute', left:(i/12*100)+'%', top:0, bottom:0,
                    width:'1px', background:'#E5E9F0', pointerEvents:'none'
                  }
                }) : null
              ).filter(Boolean),

              // UX-09: 実績バー（背後・薄い色）
              ...actualRanges.map((range, idx) => {
                const left  = ((range.start - 1) / 12 * 100)
                const width = ((range.end - range.start + 1) / 12 * 100)
                return React.createElement('div', {
                  key: 'actual-'+idx,
                  style:{
                    position:'absolute',
                    left: left+'%', width: 'calc('+width+'% - 4px)',
                    top:'8px', bottom:'8px', marginLeft:'2px',
                    background: '#0A6B5233',  // 薄いフォレストグリーン（背景）
                    borderRadius:'4px',
                    border:'1px dashed #0A6B5266',
                    zIndex:1,
                    pointerEvents:'none'
                  },
                  title: '実績: '+range.start+'月〜'+range.end+'月'
                })
              }),

              // 今月マーカー
              React.createElement('div', {
                style:{
                  position:'absolute',
                  left:((new Date().getMonth()) / 12 * 100)+'%',
                  top:'-4px', bottom:'-4px', width:'2px',
                  background:'#DC2626', opacity:.7, borderRadius:'2px',
                  zIndex:3, pointerEvents:'none'
                }
              }),

              // 作付バー（前面・濃い色）
              ...fieldPlans.map(plan => {
                const left  = ((plan.start_month - 1) / 12 * 100)
                const width = ((plan.end_month - plan.start_month + 1) / 12 * 100)
                const hasViol = violations.some(v => v.planId === plan.id)
                return React.createElement('div', {
                  key: plan.id,
                  title: `${plan.crop} ${plan.start_month}月〜${plan.end_month}月${plan.note?' ('+plan.note+')':''}`,
                  style:{
                    position:'absolute',
                    left: left+'%', width: 'calc('+width+'% - 4px)',
                    top:'4px', bottom:'4px', marginLeft:'2px',
                    background: plan.color,
                    borderRadius:'5px',
                    display:'flex', alignItems:'center', paddingLeft:'8px',
                    fontSize:'11px', fontWeight:600, color:'#fff',
                    overflow:'hidden', whiteSpace:'nowrap',
                    boxShadow: hasViol ? '0 0 0 2px #ff7070' : 'none',
                    cursor:'pointer', zIndex:2,
                    opacity:.9
                  },
                  onClick: () => setDeleteTarget(plan)
                },
                  React.createElement('span', { style:{overflow:'hidden',textOverflow:'ellipsis'} },
                    (hasViol ? '⚠️ ' : '') + plan.crop
                  )
                )
              })
            )
          )
        })
      ),

      // 凡例（UX-09: 実績バーの説明を追加）
      React.createElement('div', { style:{display:'flex',alignItems:'center',gap:'16px',marginTop:'16px',paddingTop:'12px',borderTop:'1px solid #E5E9F0',flexWrap:'wrap'} },
        React.createElement('div', { style:{fontSize:'12px',color:'#6B7280'} }, '作物:'),
        ...Object.entries(CROP_COLORS).map(([crop, color]) =>
          React.createElement('div', { key:crop, style:{display:'flex',alignItems:'center',gap:'5px'} },
            React.createElement('div', { style:{width:12,height:12,borderRadius:'3px',background:color} }),
            React.createElement('span', { style:{fontSize:'12px',color:'#6B7280'} }, crop)
          )
        ),
        React.createElement('div', { style:{display:'flex',alignItems:'center',gap:'5px'} },
          React.createElement('div', { style:{width:16,height:14,borderRadius:'3px',background:'#0A6B5233',border:'1px dashed #0A6B5266'} }),
          React.createElement('span', { style:{fontSize:'12px',color:'#6B7280'} }, '📊 実績期間')
        ),
        React.createElement('div', { style:{marginLeft:'auto',display:'flex',alignItems:'center',gap:'5px'} },
          React.createElement('div', { style:{width:2,height:14,background:'#DC2626',borderRadius:'2px'} }),
          React.createElement('span', { style:{fontSize:'12px',color:'#6B7280'} }, '今月')
        )
      )
    ),

    // サマリーテーブル
    React.createElement('div', { style:{marginTop:'16px'} },
      React.createElement('div', { className:'section-title' }, '作付一覧'),
      React.createElement('div', { className:'card card-data' },
        plans.length === 0
          ? React.createElement('div', { style:{padding:'24px',color:'#6B7280',fontSize:'14px',textAlign:'center'} }, '作付計画がまだありません。「+ 作付を追加」から登録してください。')
          : React.createElement('table', { className:'table' },
              React.createElement('thead', null,
                React.createElement('tr', null,
                  ...['圃場', '作物', '期間', '備考', ''].map(h => React.createElement('th', {key:h}, h))
                )
              ),
              React.createElement('tbody', null,
                ...plans.map(plan => {
                  const field = masterById(fields, plan.field_id)
                  const hasViol = violations.some(v => v.planId === plan.id)
                  return React.createElement('tr', { key:plan.id },
                    React.createElement('td', null,
                      React.createElement('div', { style:{display:'flex',alignItems:'center',gap:'8px'} },
                        React.createElement('div', { style:{width:8,height:8,borderRadius:'50%',background:field?.color||'#9ba4b5'} }),
                        field?.name || '—'
                      )
                    ),
                    React.createElement('td', null,
                      React.createElement('span', {
                        style:{display:'inline-flex',alignItems:'center',gap:'6px',padding:'2px 10px',borderRadius:'20px',background:plan.color+'22',color:plan.color,fontSize:'12px',fontWeight:600,border:'1px solid '+plan.color+'44'}
                      }, (hasViol?'⚠️ ':'')+plan.crop)
                    ),
                    React.createElement('td', null,
                      React.createElement('span', { style:{color:'#374151'} }, plan.start_month+'月 〜 '+plan.end_month+'月'),
                      React.createElement('span', { style:{fontSize:'12px',color:'#6B7280',marginLeft:'6px'} }, '('+((plan.end_month-plan.start_month+1))+'ヶ月)')
                    ),
                    React.createElement('td', { style:{color:'#6B7280',fontSize:'12px'} }, plan.note || '—'),
                    React.createElement('td', null,
                      React.createElement('button', {
                        style:{padding:'4px 10px',fontSize:'12px',color:'#6B7280',background:'transparent',border:'1px solid #E5E9F0',borderRadius:'6px',cursor:'pointer'},
                        onClick: () => setDeleteTarget(plan)
                      }, '削除')
                    )
                  )
                })
              )
            )
      )
    ),

    deleteTarget && React.createElement(ConfirmDeleteModal, {
      title: '作付け計画を削除しますか？',
      targetName: deleteTarget.crop + '　' + deleteTarget.start_month + '月〜' + deleteTarget.end_month + '月',
      onCancel: () => setDeleteTarget(null),
      onConfirm: () => { onDelete(deleteTarget.id); setDeleteTarget(null) }
    })
  )
}

// =====================================================
// LOGIN-01: LoginScreen — モック認証
// =====================================================
const DEMO_ACCOUNTS = {
  'owner@nakagawa.farm':  { pw:'demo1234', role:'経営者', color:'#0A6B52', bg:'#ECFDF5', border:'#6EE7B7', text:'#065F46' },
  'tanaka@nakagawa.farm': { pw:'demo1234', role:'スタッフ', color:'#1D4ED8', bg:'#EFF6FF', border:'#93C5FD', text:'#1E3A8A' },
  'nguyen@nakagawa.farm': { pw:'demo1234', role:'実習生', color:'#6D28D9', bg:'#F5F3FF', border:'#C4B5FD', text:'#4C1D95' },
}

function LoginScreen({ onLogin }) {
  const [email, setEmail]     = React.useState('')
  const [pw,    setPw]        = React.useState('')
  const [showPw, setShowPw]   = React.useState(false)
  const [role,   setRole]     = React.useState('経営者')
  const [error,  setError]    = React.useState('')
  const [loading, setLoading] = React.useState(false)

  const ROLES = [
    { label:'経営者', icon:'ti-briefcase',  accent:'#0A6B52' },
    { label:'スタッフ', icon:'ti-hard-hat', accent:'#1D4ED8' },
    { label:'実習生', icon:'ti-plant-2',    accent:'#6D28D9' },
  ]
  const FEATURES = [
    { icon:'ti-clipboard-check', label:'GAP申請サポート',   sub:'チェックリスト・書類一括出力',     color:'#0A6B52', bg:'#ECFDF5' },
    { icon:'ti-droplet',         label:'農薬散布記録',       sub:'法定上限チェック・PDF出力',        color:'#B45309', bg:'#FFFBEB' },
    { icon:'ti-map-pin',         label:'圃場マップ管理',     sub:'畑・畝の2階層管理・ピン登録',      color:'#1D4ED8', bg:'#EFF6FF' },
    { icon:'ti-calendar-stats',  label:'作付計画',             sub:'記録が溜まるほど来年が楽になる',   color:'#6D28D9', bg:'#F5F3FF' },
  ]

  function fillDemo(em) {
    setEmail(em)
    setPw(DEMO_ACCOUNTS[em].pw)
    setRole(DEMO_ACCOUNTS[em].role)
    setError('')
  }

  function doLogin() {
    setError('')
    if (!email) { setError('メールアドレスを入力してください'); return }
    if (!pw)    { setError('パスワードを入力してください'); return }
    const acc = DEMO_ACCOUNTS[email]
    if (!acc || acc.pw !== pw)   { setError('メールアドレスまたはパスワードが正しくありません'); return }
    if (acc.role !== role)       { setError(`このアカウントのロールは「${acc.role}」です`); return }
    setLoading(true)
    setTimeout(() => onLogin({ email, role: acc.role }), 900)
  }

  const activeAccent = ROLES.find(r => r.label === role)?.accent || '#0A6B52'

  return React.createElement('div', {
    style:{
      display:'flex', width:'100vw', height:'100vh', overflow:'hidden',
      fontFamily:"'Inter',system-ui,sans-serif",
    }
  },
    // ── 左パネル（ブランド） ──
    React.createElement('div', {
      style:{
        width:'320px', flexShrink:0, position:'relative', overflow:'hidden',
        background:'linear-gradient(160deg, #0B1C15 0%, #0A2E22 40%, #061B14 100%)',
        display:'flex', flexDirection:'column', padding:'0',
      }
    },
      // ゴールドライン
      React.createElement('div', { style:{position:'absolute',left:0,top:0,bottom:0,width:'3px',background:'linear-gradient(180deg,#B8976A 0%,#0A6B52 60%,#061B14 100%)'} }),
      // 背景装飾 — 光のリング
      React.createElement('div', { style:{position:'absolute',top:'-80px',right:'-80px',width:'300px',height:'300px',borderRadius:'50%',background:'radial-gradient(circle, rgba(10,107,82,0.18) 0%, transparent 70%)',pointerEvents:'none'} }),
      React.createElement('div', { style:{position:'absolute',bottom:'-60px',left:'-60px',width:'240px',height:'240px',borderRadius:'50%',background:'radial-gradient(circle, rgba(184,151,106,0.12) 0%, transparent 70%)',pointerEvents:'none'} }),

      React.createElement('div', { style:{padding:'40px 36px', display:'flex', flexDirection:'column', height:'100%', position:'relative', zIndex:1} },
        // ロゴ
        React.createElement('div', { style:{marginBottom:'48px'} },
          React.createElement('div', {
            style:{width:'52px',height:'52px',borderRadius:'14px',background:'linear-gradient(135deg,#0A6B52,#34D399)',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:'18px',boxShadow:'0 4px 20px rgba(10,107,82,0.4)'}
          }, React.createElement('i', { className:'ti ti-plant-2', style:{fontSize:'26px',color:'#fff'} })),
          React.createElement('div', { style:{fontSize:'20px',fontWeight:700,color:'#F8FAFC',letterSpacing:'-.02em',lineHeight:1.2} }, '農場名'),
          React.createElement('div', { style:{fontSize:'10px',color:'#B8976A',letterSpacing:'.12em',fontWeight:600,textTransform:'uppercase',marginTop:'5px'} }, 'Farm Management System'),
        ),

        // 区切り
        React.createElement('div', { style:{height:'1px',background:'linear-gradient(90deg,rgba(184,151,106,0.5),transparent)',marginBottom:'28px'} }),

        // 機能リスト
        React.createElement('div', { style:{fontSize:'9px',fontWeight:700,color:'rgba(255,255,255,0.3)',letterSpacing:'.12em',textTransform:'uppercase',marginBottom:'16px'} }, '主な機能'),
        React.createElement('div', { style:{display:'flex',flexDirection:'column',gap:'4px'} },
          ...FEATURES.map(f =>
            React.createElement('div', { key:f.label, style:{display:'flex',alignItems:'center',gap:'12px',padding:'11px 14px',borderRadius:'10px',background:'rgba(255,255,255,0.04)',border:'0.5px solid rgba(255,255,255,0.07)'} },
              React.createElement('div', { style:{width:'34px',height:'34px',borderRadius:'8px',background:f.bg+'22',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0} },
                React.createElement('i', { className:`ti ${f.icon}`, style:{fontSize:'17px',color:f.color} })
              ),
              React.createElement('div', null,
                React.createElement('div', { style:{fontSize:'12px',fontWeight:600,color:'rgba(255,255,255,0.88)',lineHeight:1.3} }, f.label),
                React.createElement('div', { style:{fontSize:'10px',color:'rgba(255,255,255,0.38)',marginTop:'1px'} }, f.sub),
              )
            )
          )
        ),

        // バージョン
        React.createElement('div', { style:{marginTop:'auto',paddingTop:'24px'} },
          React.createElement('div', { style:{display:'inline-flex',alignItems:'center',gap:'6px',fontSize:'10px',color:'rgba(255,255,255,0.3)',background:'rgba(255,255,255,0.06)',border:'0.5px solid rgba(255,255,255,0.1)',padding:'5px 12px',borderRadius:'20px'} },
            React.createElement('i', { className:'ti ti-shield-check', style:{fontSize:'12px',color:'#B8976A'} }),
            'v1.0.0-beta  © 農場名'
          )
        )
      )
    ),

    // ── 右パネル（フォーム） ──
    React.createElement('div', {
      style:{flex:1,display:'flex',alignItems:'center',justifyContent:'center',background:'#FAFBFA',padding:'40px'}
    },
      React.createElement('div', { style:{width:'100%',maxWidth:'380px'} },
        React.createElement('div', { style:{marginBottom:'8px',fontSize:'26px',fontWeight:700,color:'#111827',letterSpacing:'-.025em'} }, 'おかえりなさい'),
        React.createElement('div', { style:{marginBottom:'32px',fontSize:'14px',color:'#64748B'} }, 'アカウントにサインインしてください'),

        // ロール選択
        React.createElement('div', { style:{fontSize:'9px',fontWeight:700,color:'#94A3B8',letterSpacing:'.1em',textTransform:'uppercase',marginBottom:'10px'} }, 'ロール'),
        React.createElement('div', { style:{display:'flex',gap:'8px',marginBottom:'24px'} },
          ...ROLES.map(r =>
            React.createElement('button', {
              key:r.label,
              onClick: () => { setRole(r.label); setError('') },
              style:{
                flex:1, padding:'10px 4px', borderRadius:'10px', cursor:'pointer',
                border: role===r.label ? `2px solid ${r.accent}` : '1.5px solid #D8E4D8',
                background: role===r.label ? r.accent+'12' : '#fff',
                fontFamily:"'Inter',sans-serif", transition:'all .12s',
              }
            },
              React.createElement('i', { className:`ti ${r.icon}`, style:{fontSize:'18px',color: role===r.label ? r.accent : '#94A3B8',display:'block',marginBottom:'3px'} }),
              React.createElement('div', { style:{fontSize:'11px',fontWeight:700,color: role===r.label ? r.accent : '#64748B',letterSpacing:'.01em'} }, r.label)
            )
          )
        ),

        // メール
        React.createElement('div', { style:{marginBottom:'16px'} },
          React.createElement('label', { style:{fontSize:'11px',fontWeight:700,color:'#374151',letterSpacing:'.06em',textTransform:'uppercase',display:'block',marginBottom:'8px'} }, 'メールアドレス'),
          React.createElement('div', { style:{position:'relative'} },
            React.createElement('i', { className:'ti ti-mail', style:{position:'absolute',left:'12px',top:'50%',transform:'translateY(-50%)',fontSize:'16px',color:'#94A3B8',pointerEvents:'none'} }),
            React.createElement('input', {
              type:'email', value:email, placeholder:'example@nakagawa.farm',
              onChange:e=>{setEmail(e.target.value);setError('')},
              onKeyDown:e=>e.key==='Enter'&&doLogin(),
              style:{width:'100%',padding:'11px 12px 11px 38px',border:'1.5px solid #D8E4D8',borderRadius:'8px',fontSize:'14px',fontFamily:"'Inter',sans-serif",color:'#111827',background:'#fff',outline:'none',transition:'border-color .15s, box-shadow .15s'},
              onFocus:e=>{e.target.style.borderColor=activeAccent;e.target.style.boxShadow=`0 0 0 3px ${activeAccent}22`},
              onBlur:e=>{e.target.style.borderColor='#D8E4D8';e.target.style.boxShadow='none'},
            })
          )
        ),

        // パスワード
        React.createElement('div', { style:{marginBottom:'8px'} },
          React.createElement('label', { style:{fontSize:'11px',fontWeight:700,color:'#374151',letterSpacing:'.06em',textTransform:'uppercase',display:'block',marginBottom:'8px'} }, 'パスワード'),
          React.createElement('div', { style:{position:'relative'} },
            React.createElement('i', { className:'ti ti-lock', style:{position:'absolute',left:'12px',top:'50%',transform:'translateY(-50%)',fontSize:'16px',color:'#94A3B8',pointerEvents:'none'} }),
            React.createElement('input', {
              type:showPw?'text':'password', value:pw, placeholder:'パスワードを入力',
              onChange:e=>{setPw(e.target.value);setError('')},
              onKeyDown:e=>e.key==='Enter'&&doLogin(),
              style:{width:'100%',padding:'11px 40px 11px 38px',border:'1.5px solid #D8E4D8',borderRadius:'8px',fontSize:'14px',fontFamily:"'Inter',sans-serif",color:'#111827',background:'#fff',outline:'none',transition:'border-color .15s, box-shadow .15s'},
              onFocus:e=>{e.target.style.borderColor=activeAccent;e.target.style.boxShadow=`0 0 0 3px ${activeAccent}22`},
              onBlur:e=>{e.target.style.borderColor='#D8E4D8';e.target.style.boxShadow='none'},
            }),
            React.createElement('button', {
              onClick:()=>setShowPw(!showPw),
              style:{position:'absolute',right:'10px',top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'#94A3B8',fontSize:'16px',display:'flex',padding:'2px'}
            }, React.createElement('i', { className: showPw ? 'ti ti-eye-off' : 'ti ti-eye' }))
          )
        ),

        // エラー
        error && React.createElement('div', {
          style:{display:'flex',alignItems:'center',gap:'8px',background:'#FFF7ED',border:'1px solid #FDBA74',borderRadius:'7px',padding:'9px 13px',fontSize:'12px',color:'#9A3412',marginBottom:'14px',marginTop:'12px'}
        }, React.createElement('i', { className:'ti ti-alert-circle', style:{fontSize:'15px',flexShrink:0} }), error),

        // ログインボタン
        React.createElement('button', {
          onClick:doLogin,
          style:{
            width:'100%',marginTop:'20px',padding:'13px',borderRadius:'9px',border:'none',
            background: loading ? '#64748B' : `linear-gradient(135deg, ${activeAccent}, ${activeAccent}DD)`,
            fontSize:'14px',fontWeight:700,color:'#fff',cursor:loading?'not-allowed':'pointer',
            fontFamily:"'Inter',sans-serif",letterSpacing:'.01em',
            display:'flex',alignItems:'center',justifyContent:'center',gap:'8px',
            boxShadow: loading ? 'none' : `0 4px 18px ${activeAccent}44`,
            transition:'all .15s',
          }
        },
          loading
            ? React.createElement(React.Fragment, null, React.createElement('i', { className:'ti ti-loader-2', style:{fontSize:'16px',animation:'spin 1s linear infinite'} }), '認証中...')
            : React.createElement(React.Fragment, null, React.createElement('i', { className:'ti ti-login', style:{fontSize:'16px'} }), 'サインイン')
        ),

        // デモアカウント
        React.createElement('div', { style:{marginTop:'28px'} },
          React.createElement('div', { style:{display:'flex',alignItems:'center',gap:'10px',marginBottom:'14px'} },
            React.createElement('div', { style:{flex:1,height:'0.5px',background:'#DDE8DE'} }),
            React.createElement('div', { style:{fontSize:'10px',color:'#94A3B8',fontWeight:600,letterSpacing:'.06em'} }, 'デモアカウント'),
            React.createElement('div', { style:{flex:1,height:'0.5px',background:'#DDE8DE'} }),
          ),
          React.createElement('div', { style:{background:'#F8FAF8',border:'0.5px solid #DDE8DE',borderRadius:'10px',padding:'4px',display:'flex',flexDirection:'column',gap:'2px'} },
            ...Object.entries(DEMO_ACCOUNTS).map(([em, acc]) =>
              React.createElement('button', {
                key:em,
                onClick:()=>fillDemo(em),
                style:{display:'flex',alignItems:'center',gap:'10px',padding:'10px 12px',borderRadius:'7px',border:'none',background:email===em?acc.bg:'transparent',cursor:'pointer',textAlign:'left',fontFamily:"'Inter',sans-serif",transition:'background .1s',width:'100%'}
              },
                React.createElement('span', {
                  style:{fontSize:'10px',fontWeight:700,padding:'2px 9px',borderRadius:'20px',background:acc.bg,color:acc.text,border:`1px solid ${acc.border}`,whiteSpace:'nowrap',flexShrink:0}
                }, acc.role),
                React.createElement('span', { style:{fontSize:'12px',color:'#374151',fontWeight:500,flex:1} }, em),
                React.createElement('i', { className:'ti ti-arrow-right', style:{fontSize:'13px',color:'#B8C9B8',flexShrink:0} })
              )
            )
          )
        )
      )
    )
  )
}

// ── spin keyframe（ローディング用） ──
const _spinStyle = document.createElement('style')
_spinStyle.textContent = '@keyframes spin{to{transform:rotate(360deg)}}'
document.head.appendChild(_spinStyle)

// =====================================================
// 農薬マスタ管理ページ（Step①: 新規追加）
// 農薬の追加・編集・削除と在庫初期値の確認
// =====================================================
function PesticideMasterPage({ pesticides, pesticideStock, pesticidePurchases, onAdd, onUpdate, onDelete, onAddPurchase, onUpdateStock, records }) {
  const EMPTY_FORM = { name:'', reg_no:'', dilution:'', max_times:'', preharvest_days:'', stock_L:'', alert_threshold_L:'' }
  const [form,       setForm]       = React.useState(EMPTY_FORM)
  const [editId,     setEditId]     = React.useState(null)  // null = 新規, number = 編集中
  const [showForm,   setShowForm]   = React.useState(false)
  const [deleteConf,  setDeleteConf]  = React.useState(null)  // 削除確認対象のid
  const [detailModalId, setDetailModalId] = React.useState(null)  // 詳細モーダル対象の農薬ID（IDのみ保持して常に最新データを参照）
  const [activeTab,  setActiveTab]  = React.useState('list')  // 'list' | 'inventory' | 'history'

  const pf = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const startEdit = (p) => {
    const stockEntry = pesticideStock.find(s => String(s.pesticide_id) === String(p.id))
    setForm({
      name:               p.name,
      reg_no:             p.reg_no,
      dilution:           String(p.dilution),
      max_times:          String(p.max_times),
      preharvest_days:    String(p.preharvest_days),
      stock_L:            String(stockEntry ? stockEntry.stock_L : (p.stock_L ?? '')),
      alert_threshold_L:  String(stockEntry ? stockEntry.alert_threshold_L : (p.alert_threshold_L ?? '')),
    })
    setEditId(p.id)
    setShowForm(true)
  }

  const savingRef = React.useRef(false) // 二重押しでマスタが2件登録されるのを防ぐ
  const handleSave = async () => {
    if (!form.name.trim()) return
    if (savingRef.current) return
    savingRef.current = true
    const payload = {
      name:               form.name.trim(),
      reg_no:             form.reg_no.trim(),
      dilution:           Number(form.dilution) || 0,
      max_times:          Number(form.max_times) || 0,
      preharvest_days:    Number(form.preharvest_days) || 0,
      stock_L:            Number(form.stock_L) || 0,
      alert_threshold_L:  Number(form.alert_threshold_L) || 0,
    }
    if (editId !== null) {
      onUpdate({ ...payload, id: editId })
    } else {
      // 初期在庫の反映(DB経路はRPC)まで待ってから閉じる。失敗してもマスタ自体は登録済みのため
      // 閉じてよい(祝福はapp側が成功時のみ・失敗時は棚卸し入力へ誘導するトーストが出る)
      await Promise.resolve(onAdd(payload)).catch(() => null)
    }
    savingRef.current = false
    setForm(EMPTY_FORM)
    setEditId(null)
    setShowForm(false)
  }

  const handleCancel = () => {
    setForm(EMPTY_FORM)
    setEditId(null)
    setShowForm(false)
  }

  // 在庫率（%）
  const stockRatio = (p) => {
    const s = pesticideStock.find(s => String(s.pesticide_id) === String(p.id))
    if (!s || s.stock_L === 0) return 0
    const purchases = pesticidePurchases.filter(pu => refMatchesMaster(p, pu.pesticide_id)) // 旧数値ID仕入も表示
    const totalBought = purchases.reduce((a, b) => a + (b.amount_L || 0), 0)
    if (!totalBought) return 100
    return Math.min(100, Math.round((s.stock_L / totalBought) * 100))
  }

  const stockOf = (p) => {
    const s = pesticideStock.find(s => String(s.pesticide_id) === String(p.id))
    const v = (s && s.stock_L != null) ? s.stock_L : p.stock_L
    return v ?? 0
  }

  const threshOf = (p) => {
    const s = pesticideStock.find(s => String(s.pesticide_id) === String(p.id))
    const v = (s && s.alert_threshold_L != null) ? s.alert_threshold_L : p.alert_threshold_L
    return v ?? 0
  }

  const isAlert = (p) => stockOf(p) <= threshOf(p)

  // ── カラーパレット ──
  const C = {
    green:  '#0A6B52', greenL: '#E8F5F0', greenM: '#34A87E',
    amber:  '#B45309', amberL: '#FFFBEB',
    red:    '#C2410C', redL:   '#FFF1EE',
    ink:    '#111827', sub:    '#4B5563', muted: '#9CA3AF',
    border: '#E2E8E2', bg:     '#F8FAF8',
  }

  const inp = (label, key, type='text', placeholder='') =>
    React.createElement('div', { style:{ marginBottom:'16px' } },
      React.createElement('label', {
        style:{ fontSize:'10px', fontWeight:700, color:C.sub, textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:'6px' }
      }, label),
      React.createElement('input', {
        type, value: form[key],
        placeholder,
        onChange: e => pf(key, e.target.value),
        style:{
          width:'100%', padding:'9px 12px', borderRadius:'8px',
          border: `1.5px solid ${C.border}`, background:'#fff',
          fontSize:'13px', color:C.ink, outline:'none', fontFamily:"'Inter',sans-serif",
        },
        onFocus: e => { e.target.style.borderColor = C.green; e.target.style.boxShadow = '0 0 0 3px rgba(10,107,82,.1)' },
        onBlur:  e => { e.target.style.borderColor = C.border; e.target.style.boxShadow = 'none' },
      })
    )

  return React.createElement('div', { className:'page', style:{ padding:'28px 32px' } },

    // ── ページヘッダー ──
    React.createElement('div', { style:{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'28px' } },
      React.createElement('div', null,
        React.createElement('p', { className:'eyebrow', style:{ margin:0 } }, 'PESTICIDE MASTER'),
        React.createElement('h1', { style:{ fontSize:'22px', fontWeight:700, color:C.ink, margin:0, letterSpacing:'-.02em' } }, '農薬マスタ管理'),
        React.createElement('p',  { style:{ fontSize:'13px', color:C.muted, marginTop:'4px', marginBottom:0 } },
          '登録農薬の一覧・追加・編集・削除。在庫の初期値もここで設定します。'
        ),
      ),
      !showForm && activeTab === 'list' && React.createElement('button', {
        onClick: () => { setForm(EMPTY_FORM); setEditId(null); setShowForm(true) },
        style:{
          display:'flex', alignItems:'center', gap:'6px',
          padding:'9px 18px', borderRadius:'8px', border:'none', cursor:'pointer',
          background:C.green,
          color:'#fff', fontSize:'13px', fontWeight:600,
          boxShadow:'none',
          fontFamily:"'Inter',sans-serif",
        }
      },
        React.createElement('i', { className:'ti ti-plus', style:{ fontSize:'15px' } }),
        '農薬を追加'
      )
    ),

    // ── タブ切替（農薬一覧 / 棚卸し入力 / 使用履歴） ──
    React.createElement('div', { style:{ display:'flex', gap:'4px', marginBottom:'24px', borderBottom:`1px solid ${C.border}`, paddingBottom:'0' } },
      ...['list','inventory','history'].map(tab => {
        const labels = { list:'農薬一覧', inventory:'棚卸し入力', history:'使用履歴' }
        const isActiveTab = activeTab === tab
        return React.createElement('button', {
          key: tab,
          onClick: () => setActiveTab(tab),
          style:{
            padding:'8px 18px', border:'none', background:'none', cursor:'pointer',
            fontSize:'13px', fontWeight: isActiveTab ? 700 : 500,
            color: isActiveTab ? C.green : C.sub,
            borderBottom: isActiveTab ? `2px solid ${C.green}` : '2px solid transparent',
            marginBottom:'-1px', transition:'all .12s',
            fontFamily:"'Inter',sans-serif",
          }
        }, labels[tab])
      })
    ),

    // ── 追加・編集モーダル（肥料マスタの登録モーダルとUXを統一） ──
    showForm && React.createElement('div', {
      style:{ position:'fixed', inset:0, background:'rgba(17,24,39,.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' },
      onClick: handleCancel,
    },
      React.createElement('div', {
        id: 'pesticide-edit-form',
        style:{ background:'#FFFFFF', borderRadius:'16px', width:'480px', maxWidth:'95vw', maxHeight:'92vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,.22)', padding:'24px' },
        onClick: e => e.stopPropagation(),
      },
        // ── ヘッダー ──
        React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'20px' } },
          React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'12px' } },
            React.createElement('div', {
              style:{ width:40, height:40, borderRadius:'10px', background:C.greenL, display:'flex', alignItems:'center', justifyContent:'center' }
            }, React.createElement('i', { className:'ti ti-flask', style:{ color:C.green, fontSize:'20px' } })),
            React.createElement('div', null,
              React.createElement('div', { style:{ fontSize:'16px', fontWeight:700, color:C.ink } },
                form.name || (editId !== null ? '農薬を編集' : '新しい農薬を登録')
              ),
              React.createElement('div', { style:{ fontSize:'11px', color:C.muted, marginTop:'2px' } },
                form.reg_no || '農薬登録番号未入力'
              ),
            )
          ),
          React.createElement('button', {
            onClick: handleCancel,
            style:{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:'20px', lineHeight:1, padding:'4px' }
          }, '✕')
        ),

        // フォーム2カラムグリッド
        React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 16px' } },
          inp('農薬名（商品名）', 'name',            'text',   'スミチオン乳剤'),
          inp('農薬登録番号',     'reg_no',           'text',   '農林123号'),
          inp('希釈倍率',         'dilution',         'number', '1000'),
          inp('使用上限回数（回/シーズン）', 'max_times', 'number', '3'),
          inp('収穫前日数（日）', 'preharvest_days',  'number', '7'),
          inp('現在の在庫量（L）','stock_L',          'number', '20'),
        ),
        inp('発注アラート閾値（L）', 'alert_threshold_L', 'number', '4'),

        // ── ボタン ──
        React.createElement('div', { style:{ display:'flex', gap:'10px', marginTop:'4px' } },
          React.createElement('button', {
            onClick: handleCancel,
            style:{
              flex:1, padding:'10px', borderRadius:'8px', border:`1.5px solid ${C.border}`,
              background:'#fff', color:C.sub, fontSize:'13px', fontWeight:600, cursor:'pointer',
              fontFamily:"'Inter',sans-serif",
            }
          }, 'キャンセル'),
          React.createElement('button', {
            onClick: handleSave,
            disabled: !form.name.trim(),
            style:{
              flex:2, padding:'10px', borderRadius:'8px', border:'none',
              cursor: form.name.trim() ? 'pointer' : 'not-allowed',
              background:C.green,
              color:'#fff', fontSize:'13px', fontWeight:700,
              opacity: form.name.trim() ? 1 : .45,
              fontFamily:"'Inter',sans-serif",
              display:'flex', alignItems:'center', justifyContent:'center', gap:'6px',
            }
          },
            React.createElement('i', { className: editId !== null ? 'ti ti-device-floppy' : 'ti ti-check' }),
            editId !== null ? '変更を保存' : '登録する'
          ),
        )
      )
    ),

    // ── 棚卸し入力タブ ──
    activeTab === 'inventory' && React.createElement(InventoryCheckPanel, {
      pesticides,
      pesticideStock,
      onUpdateStock,
    }),

    // ── 使用履歴タブ ──
    activeTab === 'history' && React.createElement(PesticideHistoryPanel, {
      pesticides,
      records: records || [],
    }),

    // ── 農薬一覧カード ──
    activeTab === 'list' && (pesticides.length === 0
      ? React.createElement('div', {
          style:{
            background:'#fff', borderRadius:'14px', padding:'60px 0', textAlign:'center',
            border:`1.5px dashed ${C.border}`,
          }
        },
          React.createElement('i', { className:'ti ti-flask-off', style:{ fontSize:'40px', color:C.border, display:'block', marginBottom:'12px' } }),
          React.createElement('div', { style:{ color:C.muted, fontSize:'14px' } }, '農薬が登録されていません。「農薬を追加」から登録してください。')
        )
      : React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:'12px' } },
          ...pesticides.map(p => {
            const stock  = stockOf(p)
            const thresh = threshOf(p)
            const alert  = isAlert(p)
            const ratio  = stockRatio(p)

            return React.createElement('div', {
              key: p.id,
              onClick: () => setDetailModalId(p.id),
              style:{
                background:'#fff', borderRadius:'12px', padding:'16px',
                boxShadow:'0 1px 3px rgba(10,107,82,.05),0 2px 8px rgba(17,24,39,.06)',
                border: alert ? '1.5px solid rgba(194,65,12,.25)' : '1px solid '+C.border,
                cursor:'pointer', transition:'box-shadow .15s, border-color .15s',
                display:'flex', flexDirection:'column', gap:'10px',
              },
              onMouseEnter: e => { e.currentTarget.style.boxShadow='0 4px 16px rgba(10,107,82,.13)'; e.currentTarget.style.borderColor = alert ? 'rgba(194,65,12,.5)' : '#0A6B52' },
              onMouseLeave: e => { e.currentTarget.style.boxShadow='0 1px 3px rgba(10,107,82,.05),0 2px 8px rgba(17,24,39,.06)'; e.currentTarget.style.borderColor = alert ? 'rgba(194,65,12,.25)' : C.border },
            },
              // ── 上段：アイコン + 名前 + アラートバッジ ──
              React.createElement('div', { style:{ display:'flex', alignItems:'flex-start', gap:'10px' } },
                React.createElement('div', {
                  style:{
                    width:'32px', height:'32px', borderRadius:'8px', flexShrink:0,
                    background: alert ? '#FFF1EE' : C.greenL,
                    display:'flex', alignItems:'center', justifyContent:'center',
                  }
                },
                  React.createElement('i', { className:'ti ti-flask', style:{ fontSize:'16px', color: alert ? C.red : C.green } })
                ),
                React.createElement('div', { style:{ flex:1, minWidth:0 } },
                  React.createElement('div', { style:{ fontSize:'13px', fontWeight:700, color:C.ink, lineHeight:1.3, wordBreak:'break-all' } }, p.name),
                  React.createElement('div', { style:{ fontSize:'10px', color:C.muted, marginTop:'2px' } }, p.reg_no),
                ),
                alert && React.createElement('span', {
                  style:{
                    fontSize:'9px', fontWeight:700, padding:'2px 6px', borderRadius:'20px', flexShrink:0,
                    background:'#FFF1EE', color:C.red, border:'1px solid rgba(194,65,12,.2)',
                  }
                }, '⚠ 要発注'),
              ),

              // ── 在庫バー + 数値 ──
              React.createElement('div', null,
                React.createElement('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'5px' } },
                  React.createElement('span', { style:{ fontSize:'10px', color:C.sub, fontWeight:600 } }, '在庫'),
                  React.createElement('span', { style:{ fontSize:'13px', fontWeight:700, color: stock < 0 ? C.red : alert ? C.red : C.ink } },
                    stock+' L',
                    stock >= 0 && React.createElement('span', { style:{ fontSize:'10px', color:C.muted, fontWeight:400, marginLeft:'3px' } },
                      '/ 閾値 '+thresh+' L'
                    )
                  ),
                ),
                React.createElement('div', { style:{ background:'#EDF2ED', borderRadius:'6px', height:'6px', overflow:'hidden' } },
                  React.createElement('div', {
                    style:{
                      height:'100%', borderRadius:'6px',
                      width: (stock < 0 ? 100 : ratio)+'%',
                      background: stock < 0 ? C.red : alert ? C.red : ratio > 50 ? C.green : C.amber,
                      transition:'width .6s ease',
                      opacity: stock < 0 ? 0.5 : 1,
                    }
                  })
                ),
                stock < 0 && React.createElement('div', { style:{ fontSize:'10px', color:C.red, fontWeight:600, marginTop:'4px' } }, '⚠ マイナス在庫')
              ),

              // ── 下段：3バッジ（詳細情報） ──
              React.createElement('div', { style:{ display:'flex', gap:'5px' } },
                React.createElement('div', {
                  style:{
                    flex:1, textAlign:'center',
                    background:'#EFF6FF', border:'1px solid #BFDBFE',
                    borderRadius:'7px', padding:'4px 4px',
                  }
                },
                  React.createElement('div', { style:{ fontSize:'12px', fontWeight:700, color:'#1D4ED8', lineHeight:1.2 } },
                    p.dilution == null || p.dilution === '' ? '—' : (Number(p.dilution) === 1 ? '原液' : p.dilution+'倍')
                  ),
                  React.createElement('div', { style:{ fontSize:'9px', color:'#3B82F6', fontWeight:600, marginTop:'2px' } }, '希釈')
                ),
                React.createElement('div', {
                  style:{
                    flex:1, textAlign:'center',
                    background: p.preharvest_days <= 3 ? '#FFF7ED' : p.preharvest_days <= 7 ? '#FFFBEB' : '#F0FDF4',
                    border:'1px solid '+(p.preharvest_days <= 3 ? '#FED7AA' : p.preharvest_days <= 7 ? '#FDE68A' : '#BBF7D0'),
                    borderRadius:'7px', padding:'4px 4px',
                  }
                },
                  React.createElement('div', {
                    style:{
                      fontSize:'12px', fontWeight:700, lineHeight:1.2,
                      color: p.preharvest_days <= 3 ? C.red : p.preharvest_days <= 7 ? C.amber : C.green,
                    }
                  }, p.preharvest_days+'日'),
                  React.createElement('div', { style:{ fontSize:'9px', fontWeight:600, marginTop:'2px', color: p.preharvest_days <= 3 ? '#EA580C' : p.preharvest_days <= 7 ? '#D97706' : '#059669' } }, '収穫前')
                ),
                React.createElement('div', {
                  style:{
                    flex:1, textAlign:'center',
                    background:'#F8FAFC', border:'1px solid #E2E8F0',
                    borderRadius:'7px', padding:'4px 4px',
                  }
                },
                  React.createElement('div', { style:{ fontSize:'12px', fontWeight:700, color:'#475569', lineHeight:1.2 } }, p.max_times+'回'),
                  React.createElement('div', { style:{ fontSize:'9px', color:'#94A3B8', fontWeight:600, marginTop:'2px' } }, '年間上限')
                ),
              )
            )
          })
        )),

    // ── 農薬詳細モーダル ──
    // detailModalId を元に pesticides から最新オブジェクトを取得することで
    // 編集・保存後も常に最新データをモーダルに反映する
    (() => {
      const detailPesticide = masterById(pesticides, detailModalId)
      return detailPesticide ? React.createElement(PesticideDetailModal, {
        pesticide:    detailPesticide,
        stock:        stockOf(detailPesticide),
        thresh:       threshOf(detailPesticide),
        ratio:        stockRatio(detailPesticide),
        isAlert:      isAlert(detailPesticide),
        purchases:    pesticidePurchases.filter(pu => refMatchesMaster(detailPesticide, pu.pesticide_id)),
        onAddPurchase: onAddPurchase,
        onClose:      () => setDetailModalId(null),
        onEdit:       (p) => { setDetailModalId(null); startEdit(p) },
        onDelete:     (id) => { onDelete(id); setDetailModalId(null) },
      }) : null
    })()
  )
}

// ── 農薬詳細モーダル ──────────────────────────────────
function PesticideDetailModal({ pesticide: p, stock, thresh, ratio, isAlert: alert, purchases, onClose, onEdit, onDelete, onAddPurchase }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false)
  // view: 'detail' | 'purchase' | 'history'
  const [view, setView] = React.useState(alert ? 'detail' : 'detail')
  const [showPurchaseForm, setShowPurchaseForm] = React.useState(false)
  const [purchaseForm, setPurchaseForm] = React.useState({
    date: todayYmd(),
    amount_L: '',
    supplier: '',
    price_yen: '',
  })
  const [purchaseDone, setPurchaseDone] = React.useState(false)

  const C = {
    green:  '#0A6B52', greenL: '#E8F5F0',
    amber:  '#B45309', amberL: '#FFFBEB',
    red:    '#C2410C', redL:   '#FFF1EE',
    ink:    '#111827', sub:    '#4B5563', muted: '#9CA3AF',
    border: '#E2E8E2', bg:     '#F8FAF8',
  }
  const rowStyle = { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom:'1px solid #F1F5F9', fontSize:'13px' }

  // 送信ID保持: 成功(ok===true)が確定するまで同じIDを使い回す(応答喪失→再登録でも冪等で二重加算しない)
  const purchaseSubmitIdRef = React.useRef(null)
  const handlePurchaseSave = async () => {
    if (!purchaseForm.amount_L || Number(purchaseForm.amount_L) <= 0) return
    if (!purchaseSubmitIdRef.current) purchaseSubmitIdRef.current = newUuid()
    const res = await Promise.resolve(onAddPurchase({
      id:           purchaseSubmitIdRef.current,
      pesticide_id: p.id,
      date:         purchaseForm.date,
      amount_L:     Number(purchaseForm.amount_L),
      supplier:     purchaseForm.supplier.trim() || '—',
      price_yen:    Number(purchaseForm.price_yen) || 0,
    })).catch(() => null)
    if (!(res && res.ok === true)) return // 失敗/不明: 入力とIDを保持(成功表示を出さない)
    purchaseSubmitIdRef.current = null
    setPurchaseDone(true)
    setTimeout(() => {
      setPurchaseDone(false)
      setShowPurchaseForm(false)
      setPurchaseForm({ date: todayYmd(), amount_L:'', supplier:'', price_yen:'' })
    }, 1800)
  }

  const inputSt = { width:'100%', padding:'9px 12px', borderRadius:'8px', border:'1.5px solid '+C.border, background:'#fff', fontSize:'13px', color:C.ink, outline:'none', boxSizing:'border-box', fontFamily:"'Inter',sans-serif" }

  // 購入履歴（この農薬のみ・新しい順）
  const myPurchases = (purchases || [])
    .filter(pu => refMatchesMaster(p, pu.pesticide_id))
    .sort((a,b) => b.date.localeCompare(a.date))

  return React.createElement('div', {
    style:{ position:'fixed', inset:0, background:'rgba(17,24,39,.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' },
    onClick: onClose,
  },
    React.createElement('div', {
      style:{ background:'#FFFFFF', borderRadius:'16px', width:'460px', maxWidth:'95vw', maxHeight:'92vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,.22)', display:'flex', flexDirection:'column' },
      onClick: e => e.stopPropagation(),
    },

      // ── ヘッダー（固定） ──
      React.createElement('div', {
        style:{ padding:'20px 24px 0', flexShrink:0 }
      },
        React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' } },
          React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'12px' } },
            React.createElement('div', {
              style:{ width:40, height:40, borderRadius:'10px', flexShrink:0, background: alert ? '#FFF1EE' : C.greenL, display:'flex', alignItems:'center', justifyContent:'center' }
            },
              React.createElement('i', { className:'ti ti-flask', style:{ fontSize:'20px', color: alert ? C.red : C.green } })
            ),
            React.createElement('div', null,
              React.createElement('div', { style:{ fontSize:'16px', fontWeight:700, color:C.ink } }, p.name),
              React.createElement('div', { style:{ fontSize:'11px', color:C.muted, marginTop:'2px' } }, p.reg_no),
            )
          ),
          React.createElement('button', {
            onClick: onClose,
            style:{ background:'none', border:'none', cursor:'pointer', fontSize:'20px', color:'#9CA3AF', lineHeight:1, padding:'4px' }
          }, '✕')
        ),

        // タブ
        React.createElement('div', { style:{ display:'flex', gap:'2px', background:'#F1F5F1', borderRadius:'10px', padding:'3px', marginBottom:'0' } },
          [
            { key:'detail',  label:'詳細', icon:'ti-info-circle' },
            { key:'purchase', label:'仕入れ登録', icon:'ti-package-import' },
            { key:'history', label:'仕入れ履歴', icon:'ti-history' },
          ].map(tab =>
            React.createElement('button', {
              key: tab.key,
              onClick: () => { setView(tab.key); setShowPurchaseForm(false); setPurchaseDone(false) },
              style:{
                flex:1, padding:'7px 4px', borderRadius:'8px', border:'none', cursor:'pointer',
                fontSize:'12px', fontWeight:600,
                background: view === tab.key ? '#fff' : 'transparent',
                color: view === tab.key ? C.green : C.muted,
                boxShadow: view === tab.key ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
                transition:'all .15s', display:'flex', alignItems:'center', justifyContent:'center', gap:'5px',
                fontFamily:"'Inter',sans-serif",
              }
            },
              React.createElement('i', { className:'ti '+tab.icon, style:{ fontSize:'13px' } }),
              tab.label
            )
          )
        ),
      ),

      // ── コンテンツ ──
      React.createElement('div', { style:{ padding:'20px 24px 24px', flex:1 } },

        // ========== 詳細タブ ==========
        view === 'detail' && React.createElement('div', null,

          // 在庫アラートバナー
          alert && React.createElement('div', {
            style:{ background:'#FFF1EE', border:'1px solid rgba(194,65,12,.25)', borderRadius:'10px', padding:'12px 14px', marginBottom:'16px', display:'flex', alignItems:'center', gap:'10px' }
          },
            React.createElement('i', { className:'ti ti-alert-triangle', style:{ fontSize:'18px', color:C.red, flexShrink:0 } }),
            React.createElement('div', null,
              React.createElement('div', { style:{ fontSize:'13px', fontWeight:700, color:C.red } }, '在庫がアラート閾値を下回っています'),
              React.createElement('div', { style:{ fontSize:'12px', color:'#9A3412', marginTop:'2px' } }, '「仕入れ登録」タブから補充を記録できます'),
            ),
            React.createElement('button', {
              onClick: () => setView('purchase'),
              style:{
                marginLeft:'auto', padding:'7px 14px', borderRadius:'7px', border:'none',
                background:C.red, color:'#fff', fontSize:'12px', fontWeight:700, cursor:'pointer', flexShrink:0,
                fontFamily:"'Inter',sans-serif",
              }
            }, '仕入れる →')
          ),

          // 詳細情報
          React.createElement('div', { style:{ background:'#F8FAF8', borderRadius:'10px', padding:'4px 14px', marginBottom:'16px' } },
            React.createElement('div', { style:rowStyle },
              React.createElement('span', { style:{ color:C.sub } }, '希釈倍率'),
              React.createElement('span', { style:{ fontWeight:700, color:'#1D4ED8' } }, p.dilution == null || p.dilution === '' ? '—' : (Number(p.dilution) === 1 ? '原液（希釈不要）' : p.dilution+'倍'))
            ),
            React.createElement('div', { style:rowStyle },
              React.createElement('span', { style:{ color:C.sub } }, '収穫前日数'),
              React.createElement('span', { style:{ fontWeight:700, color: p.preharvest_days <= 3 ? C.red : p.preharvest_days <= 7 ? C.amber : C.green } }, p.preharvest_days+'日')
            ),
            React.createElement('div', { style:rowStyle },
              React.createElement('span', { style:{ color:C.sub } }, '年間使用上限'),
              React.createElement('span', { style:{ fontWeight:600, color:C.ink } }, p.max_times+'回')
            ),
            React.createElement('div', { style:{ ...rowStyle, borderBottom:'none' } },
              React.createElement('span', { style:{ color:C.sub } }, '現在の在庫量'),
              React.createElement('span', { style:{ fontWeight:700, color: stock < 0 ? C.red : alert ? C.red : C.ink } },
                stock+' L',
                React.createElement('span', { style:{ fontSize:'11px', color:C.muted, fontWeight:400, marginLeft:'4px' } }, '（閾値: '+thresh+' L）')
              )
            ),
          ),

          // 在庫バー
          React.createElement('div', { style:{ marginBottom:'22px' } },
            React.createElement('div', { style:{ background:'#EDF2ED', borderRadius:'6px', height:'8px', overflow:'hidden' } },
              React.createElement('div', {
                style:{ height:'100%', borderRadius:'6px', width:(stock < 0 ? 100 : ratio)+'%', background: stock < 0 ? C.red : alert ? C.red : ratio > 50 ? C.green : C.amber, transition:'width .6s ease', opacity: stock < 0 ? 0.5 : 1 }
              })
            )
          ),

          // ボタン群
          !showDeleteConfirm && React.createElement('div', { style:{ display:'flex', gap:'8px' } },
            React.createElement('button', {
              onClick: () => onEdit(p),
              style:{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', padding:'10px', borderRadius:'8px', border:'1.5px solid '+C.border, background:'#fff', color:C.sub, fontSize:'13px', fontWeight:600, cursor:'pointer', fontFamily:"'Inter',sans-serif" }
            },
              React.createElement('i', { className:'ti ti-pencil', style:{ fontSize:'14px' } }), '編集'
            ),
            React.createElement('button', {
              onClick: () => setShowDeleteConfirm(true),
              style:{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', padding:'10px', borderRadius:'8px', border:'1.5px solid #FCA5A5', background:'#FEF2F2', color:'#DC2626', fontSize:'13px', fontWeight:600, cursor:'pointer', fontFamily:"'Inter',sans-serif" }
            },
              React.createElement('i', { className:'ti ti-trash', style:{ fontSize:'14px' } }), '削除'
            ),
          ),

          showDeleteConfirm && React.createElement('div', {
            style:{ background:'#FFF1EE', border:'1px solid rgba(194,65,12,.2)', borderRadius:'10px', padding:'14px 16px' }
          },
            React.createElement('div', { style:{ fontSize:'13px', color:C.red, fontWeight:600, marginBottom:'12px' } }, '「'+p.name+'」を削除します。この操作は元に戻せません。'),
            React.createElement('div', { style:{ display:'flex', gap:'8px' } },
              React.createElement('button', { onClick:()=>setShowDeleteConfirm(false), style:{ flex:1, padding:'9px', borderRadius:'8px', border:'1.5px solid '+C.border, background:'#fff', color:C.sub, fontSize:'13px', fontWeight:600, cursor:'pointer', fontFamily:"'Inter',sans-serif" } }, 'キャンセル'),
              React.createElement('button', { onClick:()=>onDelete(p.id), style:{ flex:1, padding:'9px', borderRadius:'8px', border:'none', background:C.red, color:'#fff', fontSize:'13px', fontWeight:700, cursor:'pointer', fontFamily:"'Inter',sans-serif" } }, '削除する'),
            )
          )
        ),

        // ========== 仕入れ登録タブ ==========
        view === 'purchase' && React.createElement('div', null,

          // 現在の在庫サマリー
          React.createElement('div', {
            style:{ background: alert ? '#FFF1EE' : '#F0FDF4', border:'1px solid '+(alert ? 'rgba(194,65,12,.2)' : '#BBF7D0'), borderRadius:'10px', padding:'12px 16px', marginBottom:'20px', display:'flex', justifyContent:'space-between', alignItems:'center' }
          },
            React.createElement('div', null,
              React.createElement('div', { style:{ fontSize:'11px', fontWeight:600, color: alert ? C.red : C.green, letterSpacing:'.06em', textTransform:'uppercase' } }, '現在の在庫'),
              React.createElement('div', { style:{ fontSize:'22px', fontWeight:700, color: alert ? C.red : C.green, lineHeight:1.2, marginTop:'2px' } }, stock+' L'),
              React.createElement('div', { style:{ fontSize:'11px', color: alert ? '#9A3412' : '#065F46', marginTop:'2px' } }, 'アラート閾値: '+thresh+' L'),
            ),
            alert
              ? React.createElement('div', { style:{ fontSize:'28px' } }, '⚠️')
              : React.createElement('i', { className:'ti ti-circle-check', style:{ fontSize:'28px', color:C.green } })
          ),

          // 成功メッセージ
          purchaseDone && React.createElement('div', {
            style:{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:'10px', padding:'16px', textAlign:'center', marginBottom:'16px' }
          },
            React.createElement('i', { className:'ti ti-circle-check', style:{ fontSize:'28px', color:C.green, display:'block', marginBottom:'6px' } }),
            React.createElement('div', { style:{ fontSize:'14px', fontWeight:700, color:C.green } }, '仕入れを登録しました'),
            React.createElement('div', { style:{ fontSize:'12px', color:'#065F46', marginTop:'4px' } }, '在庫量に反映されました')
          ),

          // 仕入れフォーム
          !purchaseDone && React.createElement('div', null,
            React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'12px' } },
              React.createElement('div', null,
                React.createElement('label', { style:{ fontSize:'10px', fontWeight:700, color:C.sub, textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:'6px' } }, '仕入れ日 *'),
                React.createElement('input', {
                  type:'date', value:purchaseForm.date,
                  onChange: e => setPurchaseForm(f => ({...f, date:e.target.value})),
                  style: inputSt,
                  onFocus: e => { e.target.style.borderColor=C.green; e.target.style.boxShadow='0 0 0 3px rgba(10,107,82,.1)' },
                  onBlur:  e => { e.target.style.borderColor=C.border; e.target.style.boxShadow='none' },
                })
              ),
              React.createElement('div', null,
                React.createElement('label', { style:{ fontSize:'10px', fontWeight:700, color:C.sub, textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:'6px' } }, '仕入れ量 (L) *'),
                React.createElement('input', {
                  type:'number', min:'0', step:'0.1', placeholder:'例: 20',
                  value: purchaseForm.amount_L,
                  onChange: e => setPurchaseForm(f => ({...f, amount_L:e.target.value})),
                  style: inputSt,
                  onFocus: e => { e.target.style.borderColor=C.green; e.target.style.boxShadow='0 0 0 3px rgba(10,107,82,.1)' },
                  onBlur:  e => { e.target.style.borderColor=C.border; e.target.style.boxShadow='none' },
                })
              ),
            ),
            React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'20px' } },
              React.createElement('div', null,
                React.createElement('label', { style:{ fontSize:'10px', fontWeight:700, color:C.sub, textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:'6px' } }, '仕入れ先'),
                React.createElement('input', {
                  type:'text', placeholder:'例: JAみどり',
                  value: purchaseForm.supplier,
                  onChange: e => setPurchaseForm(f => ({...f, supplier:e.target.value})),
                  style: inputSt,
                  onFocus: e => { e.target.style.borderColor=C.green; e.target.style.boxShadow='0 0 0 3px rgba(10,107,82,.1)' },
                  onBlur:  e => { e.target.style.borderColor=C.border; e.target.style.boxShadow='none' },
                })
              ),
              React.createElement('div', null,
                React.createElement('label', { style:{ fontSize:'10px', fontWeight:700, color:C.sub, textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:'6px' } }, '金額 (円)'),
                React.createElement('input', {
                  type:'number', min:'0', placeholder:'例: 8400',
                  value: purchaseForm.price_yen,
                  onChange: e => setPurchaseForm(f => ({...f, price_yen:e.target.value})),
                  style: inputSt,
                  onFocus: e => { e.target.style.borderColor=C.green; e.target.style.boxShadow='0 0 0 3px rgba(10,107,82,.1)' },
                  onBlur:  e => { e.target.style.borderColor=C.border; e.target.style.boxShadow='none' },
                })
              ),
            ),

            // 仕入れ後の在庫プレビュー
            purchaseForm.amount_L && Number(purchaseForm.amount_L) > 0 && React.createElement('div', {
              style:{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:'10px', padding:'12px 14px', marginBottom:'20px', display:'flex', alignItems:'center', gap:'10px' }
            },
              React.createElement('i', { className:'ti ti-calculator', style:{ fontSize:'16px', color:'#1D4ED8', flexShrink:0 } }),
              React.createElement('div', { style:{ fontSize:'13px', color:'#1E3A8A' } },
                '登録後の在庫: ',
                React.createElement('strong', null, Math.round((stock + Number(purchaseForm.amount_L)) * 100) / 100 + ' L'),
                '（現在 '+stock+' L + 仕入れ '+purchaseForm.amount_L+' L）'
              )
            ),

            React.createElement('button', {
              onClick: handlePurchaseSave,
              disabled: !purchaseForm.amount_L || Number(purchaseForm.amount_L) <= 0,
              style:{
                width:'100%', padding:'12px', borderRadius:'10px', border:'none',
                background: (!purchaseForm.amount_L || Number(purchaseForm.amount_L) <= 0) ? '#D1FAE5' : C.green,
                color:'#fff', fontSize:'14px', fontWeight:700, cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
                fontFamily:"'Inter',sans-serif", opacity: (!purchaseForm.amount_L || Number(purchaseForm.amount_L) <= 0) ? 0.5 : 1,
              }
            },
              React.createElement('i', { className:'ti ti-package-import', style:{ fontSize:'16px' } }),
              '仕入れを登録して在庫に追加'
            )
          )
        ),

        // ========== 仕入れ履歴タブ ==========
        view === 'history' && React.createElement('div', null,
          myPurchases.length === 0
            ? React.createElement('div', { style:{ textAlign:'center', padding:'40px 0', color:C.muted } },
                React.createElement('i', { className:'ti ti-package-off', style:{ fontSize:'36px', display:'block', marginBottom:'10px' } }),
                React.createElement('div', { style:{ fontSize:'13px' } }, 'まだ仕入れ記録がありません')
              )
            : React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:'8px' } },
                ...myPurchases.map((pu, i) =>
                  React.createElement('div', {
                    key: pu.id || i,
                    style:{ background:'#F8FAF8', borderRadius:'10px', padding:'12px 14px', border:'1px solid '+C.border }
                  },
                    React.createElement('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px' } },
                      React.createElement('span', { style:{ fontSize:'13px', fontWeight:700, color:C.ink } }, pu.date),
                      React.createElement('span', { style:{ fontSize:'14px', fontWeight:700, color:C.green } }, '+'+pu.amount_L+' L')
                    ),
                    React.createElement('div', { style:{ display:'flex', gap:'16px' } },
                      React.createElement('span', { style:{ fontSize:'11px', color:C.muted } },
                        React.createElement('i', { className:'ti ti-building-store', style:{ fontSize:'11px', marginRight:'3px' } }),
                        pu.supplier || '—'
                      ),
                      pu.price_yen > 0 && React.createElement('span', { style:{ fontSize:'11px', color:C.muted } },
                        React.createElement('i', { className:'ti ti-currency-yen', style:{ fontSize:'11px', marginRight:'3px' } }),
                        pu.price_yen.toLocaleString()+'円'
                      )
                    )
                  )
                )
              )
        )
      )
    )
  )
}

// =====================================================
// 【サンプル農園実データ統合 フェーズ3・Step3-1】肥料マスタ管理ページ
// PesticideMasterPage（農薬マスタ）と同じ構造・見た目でコピーして作成。
// 農薬特有の項目（農薬登録番号・希釈倍率・使用上限回数・収穫前日数）の代わりに、
// 「価格マスタ」シート相当の肥料項目（メーカー・1袋の重さ・1袋の価格・1kg単価）を使用。
// 単位は「kg単位に統一」という仮ルール（Step3-3で確認事項）。
// =====================================================
function FertilizerMasterPage({ fertilizers, fertilizerStock, fertilizerPurchases, topDressingRecords, fields, onAdd, onUpdate, onDelete, onAddPurchase, onUpdateStock }) {
  const [showAddModal,   setShowAddModal]   = React.useState(false)
  const [detailModalId, setDetailModalId] = React.useState(null)
  const [activeTab, setActiveTab] = React.useState('list')

  const stockOf  = (f) => { const s = fertilizerStock.find(s => String(s.fertilizer_id) === String(f.id)); return ((s && s.stock_kg != null) ? s.stock_kg : f.stock_kg) ?? 0 }
  const threshOf = (f) => { const s = fertilizerStock.find(s => String(s.fertilizer_id) === String(f.id)); return ((s && s.alert_threshold_kg != null) ? s.alert_threshold_kg : f.alert_threshold_kg) ?? 0 }
  const isAlert  = (f) => stockOf(f) <= threshOf(f)

  // ── カラーパレット（農薬マスタと共通トーン） ──
  const C = {
    green:  '#0A6B52', greenL: '#E8F5F0', greenM: '#34A87E',
    amber:  '#B45309', amberL: '#FFFBEB',
    red:    '#C2410C', redL:   '#FFF1EE',
    ink:    '#111827', sub:    '#4B5563', muted: '#9CA3AF',
    border: '#E2E8E2', bg:     '#F8FAF8',
  }

  return React.createElement('div', { className:'page', style:{ padding:'28px 32px' } },

    // ── ページヘッダー ──
    React.createElement('div', { style:{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'28px' } },
      React.createElement('div', null,
        React.createElement('p', { className:'eyebrow', style:{ margin:0 } }, 'FERTILIZER MASTER'),
        React.createElement('h1', { style:{ fontSize:'22px', fontWeight:700, color:C.ink, margin:0, letterSpacing:'-.02em' } }, '肥料マスタ管理'),
        React.createElement('p',  { style:{ fontSize:'13px', color:C.muted, marginTop:'4px', marginBottom:0 } },
          '登録肥料の一覧・追加・編集・削除。「価格マスタ」シートの肥料名・価格・重さ・1kg単価をもとにした初期データです。'
        ),
      ),
      React.createElement('button', {
        onClick: () => setShowAddModal(true),
        style:{
          display:'flex', alignItems:'center', gap:'6px',
          padding:'9px 18px', borderRadius:'8px', border:'none', cursor:'pointer',
          background:C.green, color:'#fff', fontSize:'13px', fontWeight:600,
          fontFamily:"'Inter',sans-serif",
        }
      },
        React.createElement('i', { className:'ti ti-plus', style:{ fontSize:'15px' } }),
        '肥料を追加'
      )
    ),

    // ── タブ切替（肥料一覧 / 棚卸し入力 / 使用履歴 / 仕入れ履歴） ──
    React.createElement('div', { style:{ display:'flex', gap:4, borderBottom:`1px solid ${C.border}`, marginBottom:'16px' } },
      ...['list','inventory','usage','history'].map(tab => {
        const labels = { list:'肥料一覧', inventory:'棚卸し入力', usage:'使用履歴', history:'仕入れ履歴' }
        const isActiveTab = activeTab === tab
        return React.createElement('button', {
          key: tab,
          onClick: () => setActiveTab(tab),
          style:{
            padding:'8px 14px', border:'none', background:'none', cursor:'pointer',
            fontSize:'13px', fontWeight: isActiveTab ? 700 : 500,
            color: isActiveTab ? C.green : C.sub,
            borderBottom: isActiveTab ? `2px solid ${C.green}` : '2px solid transparent',
          }
        }, labels[tab])
      })
    ),

    // ── 棚卸し入力タブ ──
    activeTab === 'inventory' && React.createElement(FertilizerInventoryCheckPanel, {
      fertilizers, fertilizerStock, onUpdateStock
    }),
    // ── 使用履歴タブ ──
    activeTab === 'usage' && React.createElement(FertilizerUsageHistoryPanel, {
      fertilizers, topDressingRecords: topDressingRecords || [], fields: fields || []
    }),
    // ── 仕入れ履歴タブ ──
    activeTab === 'history' && React.createElement(FertilizerPurchaseHistoryPanel, {
      fertilizers, fertilizerPurchases
    }),

    // ── 肥料一覧カード ──
    activeTab === 'list' && (fertilizers.length === 0
      ? React.createElement('div', {
          style:{
            background:'#fff', borderRadius:'14px', padding:'60px 0', textAlign:'center',
            border:`1.5px dashed ${C.border}`,
          }
        },
          React.createElement('i', { className:'ti ti-leaf-off', style:{ fontSize:'40px', color:C.border, display:'block', marginBottom:'12px' } }),
          React.createElement('div', { style:{ color:C.muted, fontSize:'14px' } }, '肥料が登録されていません。「肥料を追加」から登録してください。')
        )
      : React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:'12px' } },
          ...fertilizers.map(f => {
            const stock  = stockOf(f)
            const thresh = threshOf(f)
            const alert  = isAlert(f)
            const ratio  = stock <= 0 ? 0 : Math.min(100, Math.round((stock / Math.max(stock, thresh * 2 || stock || 1)) * 100))

            return React.createElement('div', {
              key: f.id,
              onClick: () => setDetailModalId(f.id),
              style:{
                background:'#fff', borderRadius:'12px', padding:'16px',
                boxShadow:'0 1px 3px rgba(10,107,82,.05),0 2px 8px rgba(17,24,39,.06)',
                border: alert ? '1.5px solid rgba(194,65,12,.25)' : '1px solid '+C.border,
                cursor:'pointer', transition:'box-shadow .15s, border-color .15s',
                display:'flex', flexDirection:'column', gap:'10px',
              },
              onMouseEnter: e => { e.currentTarget.style.boxShadow='0 4px 16px rgba(10,107,82,.13)'; e.currentTarget.style.borderColor = alert ? 'rgba(194,65,12,.5)' : '#0A6B52' },
              onMouseLeave: e => { e.currentTarget.style.boxShadow='0 1px 3px rgba(10,107,82,.05),0 2px 8px rgba(17,24,39,.06)'; e.currentTarget.style.borderColor = alert ? 'rgba(194,65,12,.25)' : C.border },
            },
              // ── 上段：アイコン + 名前 + アラートバッジ ──
              React.createElement('div', { style:{ display:'flex', alignItems:'flex-start', gap:'10px' } },
                React.createElement('div', {
                  style:{
                    width:'32px', height:'32px', borderRadius:'8px', flexShrink:0,
                    background: alert ? '#FFF1EE' : C.greenL,
                    display:'flex', alignItems:'center', justifyContent:'center',
                  }
                },
                  React.createElement('i', { className:'ti ti-leaf', style:{ fontSize:'16px', color: alert ? C.red : C.green } })
                ),
                React.createElement('div', { style:{ flex:1, minWidth:0 } },
                  React.createElement('div', { style:{ fontSize:'13px', fontWeight:700, color:C.ink, lineHeight:1.3, wordBreak:'break-all' } }, f.name),
                  React.createElement('div', { style:{ fontSize:'10px', color:C.muted, marginTop:'2px' } },
                    (f.blend_components && f.blend_components.length > 0)
                      ? '配合: ' + f.blend_components.map(c => {
                          const cf = masterById(fertilizers, c.fertilizer_id)
                          return (cf ? cf.name : '肥料#' + c.fertilizer_id) + '×' + c.bags
                        }).join(' + ')
                      : (f.maker || '—')
                  ),
                ),
                alert && React.createElement('span', {
                  style:{
                    fontSize:'9px', fontWeight:700, padding:'2px 6px', borderRadius:'20px', flexShrink:0,
                    background:'#FFF1EE', color:C.red, border:'1px solid rgba(194,65,12,.2)',
                  }
                }, '⚠ 要発注'),
              ),

              // ── 在庫バー + 数値 ──
              React.createElement('div', null,
                React.createElement('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'5px' } },
                  React.createElement('span', { style:{ fontSize:'10px', color:C.sub, fontWeight:600 } }, '在庫'),
                  React.createElement('span', { style:{ fontSize:'13px', fontWeight:700, color: stock < 0 ? C.red : alert ? C.red : C.ink } },
                    stock+' kg',
                    stock >= 0 && React.createElement('span', { style:{ fontSize:'10px', color:C.muted, fontWeight:400, marginLeft:'3px' } },
                      '/ 閾値 '+thresh+' kg'
                    )
                  ),
                ),
                React.createElement('div', { style:{ background:'#EDF2ED', borderRadius:'6px', height:'6px', overflow:'hidden' } },
                  React.createElement('div', {
                    style:{
                      height:'100%', borderRadius:'6px',
                      width: (stock < 0 ? 100 : ratio)+'%',
                      background: stock < 0 ? C.red : alert ? C.red : ratio > 50 ? C.green : C.amber,
                      transition:'width .6s ease',
                      opacity: stock < 0 ? 0.5 : 1,
                    }
                  })
                ),
                stock < 0 && React.createElement('div', { style:{ fontSize:'10px', color:C.red, fontWeight:600, marginTop:'4px' } }, '⚠ マイナス在庫')
              ),

              // ── 下段：3バッジ（価格情報） ──
              React.createElement('div', { style:{ display:'flex', gap:'5px' } },
                React.createElement('div', {
                  style:{
                    flex:1, textAlign:'center',
                    background: f.weight_unconfirmed ? '#FFFBEB' : '#EFF6FF',
                    border: f.weight_unconfirmed ? '1px solid #FDE68A' : '1px solid #BFDBFE',
                    borderRadius:'7px', padding:'4px 4px',
                  }
                },
                  React.createElement('div', { style:{ fontSize:'12px', fontWeight:700, color: f.weight_unconfirmed ? '#B45309' : '#1D4ED8', lineHeight:1.2 } },
                    (f.weight_unconfirmed ? '⚠ ' : '') + (f.weight_per_bag_kg || 0)+'kg'
                  ),
                  React.createElement('div', { style:{ fontSize:'9px', color: f.weight_unconfirmed ? '#92400E' : '#3B82F6', fontWeight:600, marginTop:'2px' } },
                    f.weight_unconfirmed ? '1袋(要確認)' : '1袋の重さ'
                  )
                ),
                React.createElement('div', {
                  style:{
                    flex:1, textAlign:'center',
                    background: f.price_per_bag_yen == null ? '#F8FAFC' : '#F0FDF4',
                    border: f.price_per_bag_yen == null ? '1px solid #E2E8F0' : '1px solid #BBF7D0',
                    borderRadius:'7px', padding:'4px 4px',
                  }
                },
                  React.createElement('div', { style:{ fontSize:'12px', fontWeight:700, color: f.price_per_bag_yen == null ? '#94A3B8' : '#059669', lineHeight:1.2 } },
                    f.price_per_bag_yen == null ? '—' : '¥'+(f.price_per_bag_yen || 0).toLocaleString()
                  ),
                  React.createElement('div', { style:{ fontSize:'9px', fontWeight:600, marginTop:'2px', color: f.price_per_bag_yen == null ? '#94A3B8' : '#059669' } },
                    f.price_per_bag_yen == null ? '要確認' : '1袋の価格'
                  )
                ),
                React.createElement('div', {
                  style:{
                    flex:1, textAlign:'center',
                    background: f.unit_price_yen_per_kg == null ? '#F8FAFC' : '#F8FAFC',
                    border:'1px solid #E2E8F0',
                    borderRadius:'7px', padding:'4px 4px',
                  }
                },
                  React.createElement('div', { style:{ fontSize:'12px', fontWeight:700, color: f.unit_price_yen_per_kg == null ? '#94A3B8' : '#475569', lineHeight:1.2 } },
                    f.unit_price_yen_per_kg == null ? '—' : '¥'+f.unit_price_yen_per_kg
                  ),
                  React.createElement('div', { style:{ fontSize:'9px', color:'#94A3B8', fontWeight:600, marginTop:'2px' } },
                    f.unit_price_yen_per_kg == null ? '要確認' : '1kg単価'
                  )
                ),
              )
            )
          })
        )),

    // ── 肥料詳細モーダル（農薬モーダルと同等レベル：タブ + 在庫バー） ──
    (() => {
      const detailFertilizer = masterById(fertilizers, detailModalId)
      if (!detailFertilizer) return null
      const stock  = stockOf(detailFertilizer)
      const thresh = threshOf(detailFertilizer)
      const alert  = isAlert(detailFertilizer)
      const ratio  = stock <= 0 ? 0 : Math.min(100, Math.round((stock / Math.max(thresh * 2 || stock || 1, stock)) * 100))

      return React.createElement(FertilizerDetailModal, {
        f: detailFertilizer, stock, thresh, alert, ratio, C,
        onClose: () => setDetailModalId(null),
        onUpdate,
        onDelete: () => { onDelete(detailFertilizer.id); setDetailModalId(null) },
        fertilizerPurchases, onAddPurchase,
        fertilizerStock,
      })
    })(),

    // ── 新規追加モーダル ──
    showAddModal && React.createElement(FertilizerAddModal, {
      C, fertilizers,
      onClose: () => setShowAddModal(false),
      onSave: (payload) => onAdd(payload), // {ok}を返す。閉じるのはモーダル側(結果確定後)
    })
  )
}

// ── 肥料 新規追加モーダル ──
// 【肥料 希釈倍率 案③】肥料マスタの「基本希釈倍率」＋「作物別の上書き（任意）」を編集する共通UI。
// 農薬の希釈倍率（マスタ登録時に固定・現場では自動セットのみ）とは異なり、
// 肥料はメーカー推奨値＋現場調整の「目安」という位置づけのため、常に編集可能な入力として提供する。
function FertilizerDilutionEditor({ defaultDilution, setDefaultDilution, cropRows, setCropRows, C }) {
  const updateRow = (idx, patch) => setCropRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  const addRow    = () => setCropRows(prev => [...prev, { crop:'', dilution:'' }])
  const removeRow = (idx) => setCropRows(prev => prev.filter((_, i) => i !== idx))

  const inputStyle = { width:'100%', padding:'9px 12px', borderRadius:'8px', border:`1.5px solid ${C.border}`, background:'#fff', fontSize:'13px', color:C.ink, outline:'none', fontFamily:"'Inter',sans-serif", boxSizing:'border-box' }
  const labelStyle = { fontSize:'10px', fontWeight:700, color:C.sub, textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:5 }

  return React.createElement('div', { style:{ marginTop:6, marginBottom:14, paddingTop:14, borderTop:`1px dashed ${C.border}` } },
    React.createElement('div', { style:{ fontSize:'11px', fontWeight:700, color:C.green, marginBottom:8, display:'flex', alignItems:'center', gap:5 } },
      React.createElement('i', { className:'ti ti-droplet', style:{ fontSize:'12px' } }),
      '希釈倍率（任意・農薬と違い法定の固定値ではありません）'
    ),
    React.createElement('div', { style:{ marginBottom:10 } },
      React.createElement('label', { style:labelStyle }, '基本希釈倍率（倍・未設定でも可）'),
      React.createElement('input', {
        type:'number', value:defaultDilution, placeholder:'例: 1000',
        onChange: e => setDefaultDilution(e.target.value),
        style:inputStyle,
        onFocus: e => { e.target.style.borderColor=C.green; e.target.style.boxShadow='0 0 0 3px rgba(10,107,82,.1)' },
        onBlur:  e => { e.target.style.borderColor=C.border; e.target.style.boxShadow='none' },
      })
    ),
    React.createElement('div', { style:{ fontSize:'10px', color:C.muted, marginBottom:8 } },
      '作物によって倍率を変えている場合のみ、下に作物名と倍率を登録してください（未登録の作物は基本希釈倍率が使われます）'
    ),
    ...cropRows.map((row, idx) =>
      React.createElement('div', { key:idx, style:{ display:'flex', gap:8, marginBottom:6, alignItems:'center' } },
        React.createElement('input', {
          type:'text', value:row.crop, placeholder:'作物名（例: レタス）',
          onChange: e => updateRow(idx, { crop: e.target.value }),
          style:{ ...inputStyle, flex:2 },
        }),
        React.createElement('input', {
          type:'number', value:row.dilution, placeholder:'倍率',
          onChange: e => updateRow(idx, { dilution: e.target.value }),
          style:{ ...inputStyle, flex:1 },
        }),
        React.createElement('span', { style:{ fontSize:'12px', color:C.sub, flexShrink:0 } }, '倍'),
        React.createElement('button', {
          onClick: () => removeRow(idx), title:'この行を削除',
          style:{ background:'none', border:'none', color:'#94A3B8', cursor:'pointer', fontSize:'16px', padding:'4px', flexShrink:0 }
        }, '✕')
      )
    ),
    React.createElement('button', {
      onClick: addRow,
      style:{ display:'flex', alignItems:'center', gap:5, fontSize:'12px', fontWeight:600, color:C.green, background:'none', border:'1.5px dashed #B8D4C0', borderRadius:'7px', padding:'6px 10px', cursor:'pointer' }
    },
      React.createElement('i', { className:'ti ti-plus', style:{ fontSize:'13px' } }),
      '作物別の倍率を追加'
    )
  )
}

// 肥料マスタの crop_dilutions（オブジェクト）と編集用の行配列（cropRows）を相互変換するヘルパー
function fertilizerCropDilutionsToRows(crop_dilutions) {
  return Object.entries(crop_dilutions || {}).map(([crop, dilution]) => ({ crop, dilution: String(dilution) }))
}
function fertilizerCropRowsToObject(cropRows) {
  const out = {}
  cropRows.forEach(r => {
    const crop = r.crop.trim()
    const dilution = Number(r.dilution)
    if (crop && dilution > 0) out[crop] = dilution
  })
  return out
}

function FertilizerAddModal({ C, fertilizers, onClose, onSave }) {
  const EMPTY = { name:'', maker:'', weight_per_bag_kg:'', price_per_bag_yen:'', unit_price_yen_per_kg:'', stock_kg:'', alert_threshold_kg:'' }
  const [form, setForm] = React.useState(EMPTY)
  const [saved, setSaved] = React.useState(false)
  // 【肥料 希釈倍率 案③】基本希釈倍率＋作物別の上書き（任意）
  const [defaultDilution, setDefaultDilution] = React.useState('')
  const [cropRows, setCropRows] = React.useState([])
  // 【配合肥料】実データ「肥料メモ」の 6:1（Dd404 6袋＋苦土重焼燐 1袋）等に対応。
  // 現場語彙の配合名のまま登録でき、構成肥料からkg単価を自動計算するので原価計算から漏れない。
  const [isBlend, setIsBlend] = React.useState(false)
  const [blendRows, setBlendRows] = React.useState([{ fertilizer_id:'', bags:'' }, { fertilizer_id:'', bags:'' }])
  const blendComponents = blendRows
    .map(r => ({ fertilizer_id: r.fertilizer_id ? String(r.fertilizer_id) : '', bags: Number(r.bags) })) // UUID対応
    .filter(r => r.fertilizer_id && r.bags > 0)
  const blendCalc = (() => {
    if (!isBlend || blendComponents.length === 0) return null
    let kg = 0, yen = 0, priceOk = true
    blendComponents.forEach(c => {
      const f = masterById(fertilizers, c.fertilizer_id); if (!f) { priceOk = false; return }
      kg  += (Number(f.weight_per_bag_kg) || 0) * c.bags
      if (Number(f.price_per_bag_yen) > 0) yen += Number(f.price_per_bag_yen) * c.bags; else priceOk = false
    })
    return { kg, yen, unit: (kg > 0 && priceOk) ? Math.round((yen / kg) * 10) / 10 : null }
  })()

  const pf = (k, v) => setForm(prev => {
    const next = { ...prev, [k]: v }
    if ((k === 'weight_per_bag_kg' || k === 'price_per_bag_yen') && next.weight_per_bag_kg && next.price_per_bag_yen) {
      const w = Number(next.weight_per_bag_kg), p = Number(next.price_per_bag_yen)
      if (w > 0) next.unit_price_yen_per_kg = String(Math.round((p / w) * 10) / 10)
    }
    return next
  })

  const savingRef = React.useRef(false) // 二重押しでマスタが2件登録されるのを防ぐ
  const handleSave = async () => {
    if (!form.name.trim()) return
    if (savingRef.current) return
    savingRef.current = true
    // 「保存しました」は初期在庫の反映まで成功が確定してから出す(先出しすると失敗が成功に見える)
    const res = await Promise.resolve(onSave({
      name:                  form.name.trim(),
      maker:                 form.maker.trim(),
      weight_per_bag_kg:     Number(form.weight_per_bag_kg) || (blendCalc ? blendCalc.kg : 0),
      price_per_bag_yen:     Number(form.price_per_bag_yen) || (blendCalc && blendCalc.unit != null ? blendCalc.yen : 0),
      unit_price_yen_per_kg: Number(form.unit_price_yen_per_kg) || (blendCalc && blendCalc.unit != null ? blendCalc.unit : 0),
      stock_kg:              Number(form.stock_kg) || 0,
      alert_threshold_kg:    Number(form.alert_threshold_kg) || 0,
      default_dilution:      Number(defaultDilution) || null,
      crop_dilutions:        fertilizerCropRowsToObject(cropRows),
      blend_components:      (isBlend && blendComponents.length > 0) ? blendComponents : null,
    })).catch(() => null)
    savingRef.current = false
    if (res && res.ok === true) {
      setSaved(true)
      setTimeout(() => onClose(), 600)
    } else {
      onClose() // 失敗でもマスタ自体は登録済み(棚卸しへ誘導するトーストが出ている)。成功表示は出さない
    }
  }

  const fieldInp = (label, key, type='text', placeholder='') =>
    React.createElement('div', { style:{ marginBottom:14 } },
      React.createElement('label', { style:{ fontSize:'10px', fontWeight:700, color:C.sub, textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:5 } }, label),
      React.createElement('input', {
        type, value: form[key], placeholder,
        onChange: e => pf(key, e.target.value),
        style:{ width:'100%', padding:'9px 12px', borderRadius:'8px', border:`1.5px solid ${C.border}`, background:'#fff', fontSize:'13px', color:C.ink, outline:'none', fontFamily:"'Inter',sans-serif", boxSizing:'border-box' },
        onFocus: e => { e.target.style.borderColor=C.green; e.target.style.boxShadow='0 0 0 3px rgba(10,107,82,.1)' },
        onBlur:  e => { e.target.style.borderColor=C.border; e.target.style.boxShadow='none' },
      })
    )

  return React.createElement('div', {
    style:{ position:'fixed', inset:0, background:'rgba(17,24,39,.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' },
    onClick: onClose,
  },
    React.createElement('div', {
      style:{ background:'#FFFFFF', borderRadius:'16px', width:'480px', maxWidth:'95vw', maxHeight:'92vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,.22)', padding:'24px' },
      onClick: e => e.stopPropagation(),
    },
      // ── ヘッダー ──
      React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'20px' } },
        React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'12px' } },
          React.createElement('div', { style:{ width:40, height:40, borderRadius:'10px', background:C.greenL, display:'flex', alignItems:'center', justifyContent:'center' } },
            React.createElement('i', { className:'ti ti-leaf', style:{ fontSize:'20px', color:C.green } })
          ),
          React.createElement('div', null,
            React.createElement('div', { style:{ fontSize:'16px', fontWeight:700, color:C.ink } },
              form.name || '新しい肥料を登録'
            ),
            React.createElement('div', { style:{ fontSize:'11px', color:C.muted, marginTop:2 } },
              form.maker || 'メーカー未入力'
            ),
          )
        ),
        React.createElement('button', { onClick:onClose, style:{ background:'none', border:'none', cursor:'pointer', fontSize:'20px', color:'#9CA3AF', lineHeight:1, padding:'4px' } }, '✕')
      ),

      // ── フォーム 2カラムグリッド ──
      React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 16px' } },
        fieldInp('肥料名',             'name',                  'text',   'IB化成S1'),
        fieldInp('メーカー',           'maker',                 'text',   'JA'),
        fieldInp('1袋の重さ（kg）',     'weight_per_bag_kg',     'number', '20'),
        fieldInp('1袋の価格（円）',     'price_per_bag_yen',     'number', '3200'),
        fieldInp('1kg単価（円）',       'unit_price_yen_per_kg', 'number', '160'),
        fieldInp('現在の在庫量（kg）',  'stock_kg',              'number', '0'),
      ),
      fieldInp('発注アラート閾値（kg）', 'alert_threshold_kg', 'number', '30'),

      // 1kg単価の自動計算ヒント
      form.weight_per_bag_kg && form.price_per_bag_yen && React.createElement('div', {
        style:{ fontSize:'11px', color:C.green, background:C.greenL, borderRadius:6, padding:'6px 10px', marginBottom:14, marginTop:-8 }
      }, `✓ 1kg単価を自動計算しました: ¥${form.unit_price_yen_per_kg}`),

      // 希釈倍率（基本＋作物別の上書き・任意）
      React.createElement(FertilizerDilutionEditor, { defaultDilution, setDefaultDilution, cropRows, setCropRows, C }),

      // ── 配合肥料（任意）: 現場の「6:1」等の混合レシピをそのまま登録できる ──
      React.createElement('div', { style:{ marginTop:6, marginBottom:14, paddingTop:14, borderTop:`1px dashed ${C.border}` } },
        React.createElement('label', { style:{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:'12px', fontWeight:700, color:C.green, marginBottom: isBlend ? 10 : 0 } },
          React.createElement('input', { type:'checkbox', checked:isBlend, onChange:e=>setIsBlend(e.target.checked) }),
          '配合肥料として登録（例: 6:1 ＝ Dd404 6袋 ＋ 苦土重焼燐 1袋）'
        ),
        isBlend && React.createElement('div', null,
          ...blendRows.map((r, idx) =>
            React.createElement('div', { key:idx, style:{ display:'grid', gridTemplateColumns:'1fr 90px 28px', gap:8, marginBottom:8, alignItems:'center' } },
              React.createElement('select', {
                value:r.fertilizer_id,
                onChange:e=>setBlendRows(prev=>prev.map((x,i)=>i===idx?{ ...x, fertilizer_id:e.target.value }:x)),
                style:{ padding:'8px 10px', borderRadius:'8px', border:`1.5px solid ${C.border}`, fontSize:'12.5px', color:C.ink, background:'#fff' }
              },
                React.createElement('option', { value:'' }, '構成肥料を選択'),
                ...(fertilizers || []).filter(f => !f.blend_components).map(f =>
                  React.createElement('option', { key:f.id, value:f.id }, f.name))
              ),
              React.createElement('input', {
                type:'number', min:0, step:'0.5', placeholder:'袋数', value:r.bags,
                onChange:e=>setBlendRows(prev=>prev.map((x,i)=>i===idx?{ ...x, bags:e.target.value }:x)),
                style:{ padding:'8px 10px', borderRadius:'8px', border:`1.5px solid ${C.border}`, fontSize:'12.5px', boxSizing:'border-box', width:'100%' }
              }),
              React.createElement('button', {
                onClick:()=>setBlendRows(prev=>prev.filter((_,i)=>i!==idx)),
                style:{ background:'none', border:'none', color:'#DC2626', cursor:'pointer', fontSize:'15px', padding:0 }
              }, '✕')
            )
          ),
          React.createElement('button', {
            onClick:()=>setBlendRows(prev=>[...prev, { fertilizer_id:'', bags:'' }]),
            style:{ background:'none', border:`1px dashed ${C.border}`, borderRadius:'8px', padding:'6px 12px', fontSize:'12px', color:C.sub, cursor:'pointer', marginBottom:8 }
          }, '＋ 構成肥料を追加'),
          blendCalc && blendCalc.kg > 0 && React.createElement('div', {
            style:{ fontSize:'11px', color:C.green, background:C.greenL, borderRadius:6, padding:'6px 10px' }
          },
            `✓ 1セット ${blendCalc.kg}kg` +
            (blendCalc.unit != null ? ` / ¥${blendCalc.yen.toLocaleString()} → 1kg単価 ¥${blendCalc.unit} を自動計算` : '（構成肥料に価格未登録があるため単価は手入力してください）')
          )
        )
      ),

      // ── ボタン ──
      React.createElement('div', { style:{ display:'flex', gap:'10px', marginTop:4 } },
        React.createElement('button', {
          onClick: onClose,
          style:{ flex:1, padding:'10px', borderRadius:'8px', border:`1.5px solid ${C.border}`, background:'#fff', color:C.sub, fontSize:'13px', fontWeight:600, cursor:'pointer' }
        }, 'キャンセル'),
        React.createElement('button', {
          onClick: handleSave,
          disabled: !form.name.trim() || saved,
          style:{ flex:2, padding:'10px', borderRadius:'8px', border:'none', cursor: form.name.trim() ? 'pointer' : 'not-allowed', background: saved ? '#059669' : C.green, color:'#fff', fontSize:'13px', fontWeight:700, opacity: form.name.trim() ? 1 : .45, transition:'background .3s', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }
        },
          saved
            ? '✓ 登録しました'
            : React.createElement(React.Fragment, null, React.createElement('i', { className:'ti ti-check' }), ' 登録する')
        )
      )
    )
  )
}
function FertilizerDetailModal({ f, stock, thresh, alert, ratio, C, onClose, onUpdate, onDelete, fertilizerPurchases, onAddPurchase, fertilizerStock }) {
  const [modalTab, setModalTab] = React.useState('detail') // 'detail' | 'edit' | 'purchase' | 'history'
  const [purchaseForm, setPurchaseForm] = React.useState({ date: todayYmd(), amount_kg: '', supplier: '', price_yen: '' })
  const [purchaseSaved, setPurchaseSaved] = React.useState(false)
  const [editSaved, setEditSaved] = React.useState(false)
  const [deleteConfirm, setDeleteConfirm] = React.useState(false)

  // 編集フォーム — f の現在値で初期化
  const stockEntry = (fertilizerStock || []).find(s => String(s.fertilizer_id) === String(f.id))
  const [editForm, setEditForm] = React.useState({
    name:                  f.name,
    maker:                 f.maker || '',
    weight_per_bag_kg:     String(f.weight_per_bag_kg ?? ''),
    price_per_bag_yen:     String(f.price_per_bag_yen ?? ''),
    unit_price_yen_per_kg: String(f.unit_price_yen_per_kg ?? ''),
    stock_kg:              String(stockEntry ? stockEntry.stock_kg : (f.stock_kg ?? '')),
    alert_threshold_kg:    String(stockEntry ? stockEntry.alert_threshold_kg : (f.alert_threshold_kg ?? '')),
  })
  // 【肥料 希釈倍率 案③】基本希釈倍率＋作物別の上書き（任意）— f の現在値で初期化
  const [defaultDilution, setDefaultDilution] = React.useState(f.default_dilution != null ? String(f.default_dilution) : '')
  const [cropRows, setCropRows] = React.useState(fertilizerCropDilutionsToRows(f.crop_dilutions))

  const pef = (k, v) => setEditForm(prev => {
    const next = { ...prev, [k]: v }
    if ((k === 'weight_per_bag_kg' || k === 'price_per_bag_yen') && next.weight_per_bag_kg && next.price_per_bag_yen) {
      const w = Number(next.weight_per_bag_kg), p = Number(next.price_per_bag_yen)
      if (w > 0) next.unit_price_yen_per_kg = String(Math.round((p / w) * 10) / 10)
    }
    return next
  })

  const handleEditSave = () => {
    if (!editForm.name.trim()) return
    onUpdate({
      id: f.id,
      name:                  editForm.name.trim(),
      maker:                 editForm.maker.trim(),
      weight_per_bag_kg:     Number(editForm.weight_per_bag_kg) || 0,
      price_per_bag_yen:     Number(editForm.price_per_bag_yen) || 0,
      unit_price_yen_per_kg: Number(editForm.unit_price_yen_per_kg) || 0,
      stock_kg:              Number(editForm.stock_kg) || 0,
      alert_threshold_kg:    Number(editForm.alert_threshold_kg) || 0,
      default_dilution:      Number(defaultDilution) || null,
      crop_dilutions:        fertilizerCropRowsToObject(cropRows),
    })
    setEditSaved(true)
    setTimeout(() => { setEditSaved(false); setModalTab('detail') }, 900)
  }

  const myPurchases = (fertilizerPurchases || []).filter(p => String(p.fertilizer_id) === String(f.id)).sort((a,b) => a.date < b.date ? 1 : -1)

  // 送信ID保持: 成功(ok===true)が確定するまで同じIDを使い回す(応答喪失→再登録でも冪等で二重加算しない)
  const purchaseSubmitIdRef = React.useRef(null)
  const handlePurchaseSave = async () => {
    if (!purchaseForm.amount_kg) return
    if (!onAddPurchase) return
    if (!purchaseSubmitIdRef.current) purchaseSubmitIdRef.current = newUuid()
    const res = await Promise.resolve(onAddPurchase({ id: purchaseSubmitIdRef.current, fertilizer_id: f.id, ...purchaseForm, amount_kg: Number(purchaseForm.amount_kg), price_yen: Number(purchaseForm.price_yen) || null })).catch(() => null)
    if (!(res && res.ok === true)) return // 失敗/不明: 入力とIDを保持(成功表示を出さない)
    purchaseSubmitIdRef.current = null
    setPurchaseSaved(true)
    setTimeout(() => { setPurchaseSaved(false); setModalTab('history') }, 800)
    setPurchaseForm({ date: todayYmd(), amount_kg: '', supplier: '', price_yen: '' })
  }

  const rowStyle = { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid #F1F5F9', fontSize:'13px' }

  const tabBtnStyle = (t) => ({
    flex:1, padding:'8px 2px', border:'none', background:'none', cursor:'pointer',
    fontSize:'11px', fontWeight: modalTab === t ? 700 : 500,
    color: modalTab === t ? C.green : C.sub,
    borderBottom: modalTab === t ? `2px solid ${C.green}` : '2px solid transparent',
    transition:'all .15s', whiteSpace:'nowrap',
  })

  const fieldInp = (label, key, type='text', placeholder='') =>
    React.createElement('div', { style:{ marginBottom:14 } },
      React.createElement('label', { style:{ fontSize:'10px', fontWeight:700, color:C.sub, textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:5 } }, label),
      React.createElement('input', {
        type, value: editForm[key], placeholder,
        onChange: e => pef(key, e.target.value),
        style:{ width:'100%', padding:'9px 12px', borderRadius:'8px', border:`1.5px solid ${C.border}`, background:'#fff', fontSize:'13px', color:C.ink, outline:'none', fontFamily:"'Inter',sans-serif", boxSizing:'border-box' },
        onFocus: e => { e.target.style.borderColor=C.green; e.target.style.boxShadow='0 0 0 3px rgba(10,107,82,.1)' },
        onBlur:  e => { e.target.style.borderColor=C.border; e.target.style.boxShadow='none' },
      })
    )

  return React.createElement('div', {
    style:{ position:'fixed', inset:0, background:'rgba(17,24,39,.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' },
    onClick: onClose,
  },
    React.createElement('div', {
      style:{ background:'#FFFFFF', borderRadius:'16px', width:'480px', maxWidth:'95vw', maxHeight:'92vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,.22)', padding:'24px' },
      onClick: e => e.stopPropagation(),
    },
      // ── ヘッダー ──
      React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' } },
        React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'12px' } },
          React.createElement('div', {
            style:{ width:40, height:40, borderRadius:'10px', flexShrink:0, background: alert ? '#FFF1EE' : C.greenL, display:'flex', alignItems:'center', justifyContent:'center' }
          }, React.createElement('i', { className:'ti ti-leaf', style:{ fontSize:'20px', color: alert ? C.red : C.green } })),
          React.createElement('div', null,
            React.createElement('div', { style:{ fontSize:'16px', fontWeight:700, color:C.ink } },
              modalTab === 'edit' ? editForm.name || f.name : f.name
            ),
            React.createElement('div', { style:{ fontSize:'11px', color:C.muted, marginTop:'2px' } },
              modalTab === 'edit' ? (editForm.maker || '—') : (f.maker || '—')
            ),
          )
        ),
        React.createElement('button', {
          onClick: onClose,
          style:{ background:'none', border:'none', cursor:'pointer', fontSize:'20px', color:'#9CA3AF', lineHeight:1, padding:'4px' }
        }, '✕')
      ),

      // ── タブ切替（4タブ） ──
      React.createElement('div', { style:{ display:'flex', borderBottom:`1px solid ${C.border}`, marginBottom:'16px' } },
        React.createElement('button', { style:tabBtnStyle('detail'),   onClick:()=>setModalTab('detail') },
          React.createElement('i', { className:'ti ti-info-circle', style:{marginRight:3, fontSize:11} }), '詳細'),
        React.createElement('button', { style:tabBtnStyle('edit'),     onClick:()=>setModalTab('edit') },
          React.createElement('i', { className:'ti ti-edit', style:{marginRight:3, fontSize:11} }), '編集'),
        React.createElement('button', { style:tabBtnStyle('purchase'), onClick:()=>setModalTab('purchase') },
          React.createElement('i', { className:'ti ti-package-import', style:{marginRight:3, fontSize:11} }), '仕入れ登録'),
        React.createElement('button', { style:tabBtnStyle('history'),  onClick:()=>setModalTab('history') },
          React.createElement('i', { className:'ti ti-history', style:{marginRight:3, fontSize:11} }), '仕入れ履歴'),
      ),

      // ── 詳細タブ ──
      modalTab === 'detail' && React.createElement('div', null,

        // 在庫アラートバナー（農薬モーダルと統一）
        alert && React.createElement('div', {
          style:{ background:'#FFF1EE', border:'1px solid rgba(194,65,12,.25)', borderRadius:'10px', padding:'12px 14px', marginBottom:'16px', display:'flex', alignItems:'center', gap:'10px' }
        },
          React.createElement('i', { className:'ti ti-alert-triangle', style:{ fontSize:'18px', color:C.red, flexShrink:0 } }),
          React.createElement('div', null,
            React.createElement('div', { style:{ fontSize:'13px', fontWeight:700, color:C.red } }, '在庫がアラート閾値を下回っています'),
            React.createElement('div', { style:{ fontSize:'12px', color:'#9A3412', marginTop:'2px' } }, '「仕入れ登録」タブから補充を記録できます'),
          ),
          React.createElement('button', {
            onClick: () => setModalTab('purchase'),
            style:{ marginLeft:'auto', padding:'7px 14px', borderRadius:'7px', border:'none', background:C.red, color:'#fff', fontSize:'12px', fontWeight:700, cursor:'pointer', flexShrink:0 }
          }, '仕入れる →')
        ),

        // 詳細情報（農薬モーダルと統一：ラベル＋強調値の行リスト。在庫量もこの中に統合）
        React.createElement('div', { style:{ background:'#F8FAF8', borderRadius:'10px', padding:'4px 14px', marginBottom:'16px' } },
          React.createElement('div', { style:rowStyle },
            React.createElement('span', {style:{color:C.sub}}, '1袋の重さ'),
            React.createElement('span', {style:{fontWeight:700, color:C.ink}}, (f.weight_per_bag_kg||0)+' kg')
          ),
          React.createElement('div', { style:rowStyle },
            React.createElement('span', {style:{color:C.sub}}, '1袋の価格'),
            React.createElement('span', {style:{fontWeight:700, color:C.ink}}, f.price_per_bag_yen!=null ? '¥'+(f.price_per_bag_yen||0).toLocaleString() : '—')
          ),
          React.createElement('div', { style:rowStyle },
            React.createElement('span', {style:{color:C.sub}}, '1kg単価'),
            React.createElement('span', {style:{fontWeight:700, fontSize:'16px', color:C.amber}}, f.unit_price_yen_per_kg!=null ? '¥'+f.unit_price_yen_per_kg : '—')
          ),
          React.createElement('div', { style:{ ...rowStyle, borderBottom:'none' } },
            React.createElement('span', {style:{color:C.sub}}, '現在の在庫量'),
            React.createElement('span', { style:{ fontWeight:700, color: stock < 0 ? C.red : alert ? C.red : C.ink } },
              stock+' kg',
              React.createElement('span', { style:{ fontSize:'11px', color:C.muted, fontWeight:400, marginLeft:'4px' } }, '（閾値: '+thresh+' kg）')
            )
          ),
        ),

        // 希釈倍率（基本＋作物別の上書き・設定されている場合のみ表示）
        (f.default_dilution != null || Object.keys(f.crop_dilutions || {}).length > 0) && React.createElement('div', {
          style:{ background:'#F8FAF8', borderRadius:'10px', padding:'10px 14px', marginBottom:'16px' }
        },
          React.createElement('div', { style:{ fontSize:'10px', fontWeight:700, color:C.sub, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 } }, '希釈倍率（目安）'),
          f.default_dilution != null && React.createElement('div', { style:{ fontSize:'13px', color:C.ink, marginBottom:4 } },
            '基本: ', React.createElement('span', { style:{ fontWeight:700 } }, f.default_dilution + '倍')
          ),
          ...Object.entries(f.crop_dilutions || {}).map(([crop, dilution], i) =>
            React.createElement('div', { key:i, style:{ fontSize:'12px', color:C.sub, marginBottom:2 } },
              crop + ': ', React.createElement('span', { style:{ fontWeight:700, color:C.ink } }, dilution + '倍')
            )
          )
        ),

        // 在庫バー
        React.createElement('div', { style:{ marginBottom:'18px' } },
          React.createElement('div', { style:{ background:'#EDF2ED', borderRadius:'6px', height:'8px', overflow:'hidden' } },
            React.createElement('div', { style:{ height:'100%', borderRadius:'6px', width:(stock<0?100:ratio)+'%', background: stock<0?C.red:alert?C.red:ratio>50?C.green:C.amber, transition:'width .6s ease', opacity: stock<0?0.5:1 } })
          )
        ),

        // 詳細タブからも編集へ誘導 + 削除
        React.createElement('div', { style:{ display:'flex', gap:'10px' } },
          React.createElement('button', {
            onClick: () => setModalTab('edit'),
            style:{ flex:1, padding:'10px', borderRadius:'8px', border:`1.5px solid ${C.border}`, background:'#fff', color:C.sub, fontSize:'13px', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }
          }, React.createElement('i', { className:'ti ti-edit' }), '編集'),
          !deleteConfirm
            ? React.createElement('button', {
                onClick: () => setDeleteConfirm(true),
                style:{ flex:1, padding:'10px', borderRadius:'8px', border:'1.5px solid rgba(194,65,12,.3)', background:'#FFF8F6', color:C.red, fontSize:'13px', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }
              }, React.createElement('i', { className:'ti ti-trash' }), '削除')
            : React.createElement('div', { style:{ flex:1, display:'flex', gap:6 } },
                React.createElement('button', { onClick:()=>setDeleteConfirm(false), style:{ flex:1, padding:'10px', borderRadius:'8px', border:`1.5px solid ${C.border}`, background:'#fff', color:C.sub, fontSize:'12px', fontWeight:600, cursor:'pointer' } }, 'キャンセル'),
                React.createElement('button', { onClick:onDelete, style:{ flex:1, padding:'10px', borderRadius:'8px', border:'none', background:C.red, color:'#fff', fontSize:'12px', fontWeight:700, cursor:'pointer' } }, '本当に削除'),
              )
        )
      ),

      // ── 編集タブ ──
      modalTab === 'edit' && React.createElement('div', null,
        React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 16px' } },
          fieldInp('肥料名',               'name',                  'text',   'IB化成S1'),
          fieldInp('メーカー',             'maker',                 'text',   'JA'),
          fieldInp('1袋の重さ（kg）',       'weight_per_bag_kg',     'number', '20'),
          fieldInp('1袋の価格（円）',       'price_per_bag_yen',     'number', '3200'),
          fieldInp('1kg単価（円）',         'unit_price_yen_per_kg', 'number', '160'),
          fieldInp('現在の在庫量（kg）',    'stock_kg',              'number', '120'),
        ),
        fieldInp('発注アラート閾値（kg）', 'alert_threshold_kg', 'number', '30'),
        React.createElement(FertilizerDilutionEditor, { defaultDilution, setDefaultDilution, cropRows, setCropRows, C }),
        React.createElement('div', { style:{ display:'flex', gap:'10px', marginTop:'4px' } },
          React.createElement('button', {
            onClick: () => setModalTab('detail'),
            style:{ flex:1, padding:'10px', borderRadius:'8px', border:`1.5px solid ${C.border}`, background:'#fff', color:C.sub, fontSize:'13px', fontWeight:600, cursor:'pointer' }
          }, 'キャンセル'),
          React.createElement('button', {
            onClick: handleEditSave,
            disabled: !editForm.name.trim(),
            style:{ flex:2, padding:'10px', borderRadius:'8px', border:'none', cursor:'pointer', background: editSaved ? '#059669' : C.green, color:'#fff', fontSize:'13px', fontWeight:700, opacity: editForm.name.trim() ? 1 : .45, transition:'background .3s', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }
          },
            editSaved
              ? '✓ 保存しました'
              : React.createElement(React.Fragment, null, React.createElement('i', { className:'ti ti-device-floppy' }), ' 変更を保存')
          )
        )
      ),

      // ── 仕入れ登録タブ ──
      modalTab === 'purchase' && React.createElement('div', null,
        ['date','amount_kg','supplier','price_yen'].map((key) => {
          const labels = { date:'仕入れ日', amount_kg:'仕入れ量（kg）', supplier:'仕入れ先', price_yen:'金額（円）' }
          const types  = { date:'date', amount_kg:'number', supplier:'text', price_yen:'number' }
          return React.createElement('div', { key, style:{ marginBottom:14 } },
            React.createElement('label', { style:{ fontSize:'10px', fontWeight:700, color:C.sub, textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:5 } }, labels[key]),
            React.createElement('input', {
              type: types[key], value: purchaseForm[key],
              onChange: e => setPurchaseForm(prev => ({...prev, [key]: e.target.value})),
              style:{ width:'100%', padding:'9px 12px', borderRadius:'8px', border:`1.5px solid ${C.border}`, background:'#fff', fontSize:'13px', color:C.ink, outline:'none', fontFamily:"'Inter',sans-serif" },
              onFocus: e => { e.target.style.borderColor=C.green; e.target.style.boxShadow='0 0 0 3px rgba(10,107,82,.1)' },
              onBlur:  e => { e.target.style.borderColor=C.border; e.target.style.boxShadow='none' },
            })
          )
        }),
        React.createElement('button', {
          onClick: handlePurchaseSave,
          disabled: !purchaseForm.amount_kg,
          style:{ width:'100%', padding:'10px', borderRadius:'8px', border:'none', cursor:'pointer', background: purchaseSaved ? '#059669' : C.green, color:'#fff', fontSize:'13px', fontWeight:700, opacity: purchaseForm.amount_kg ? 1 : .45, transition:'background .3s' }
        }, purchaseSaved ? '✓ 保存しました' : React.createElement(React.Fragment, null, React.createElement('i', { className:'ti ti-check', style:{marginRight:5} }), '仕入れを登録'))
      ),

      // ── 仕入れ履歴タブ ──
      modalTab === 'history' && React.createElement('div', null,
        myPurchases.length === 0
          ? React.createElement('div', { style:{ textAlign:'center', padding:'32px 0', color:C.muted, fontSize:'13px' } }, '仕入れ記録がありません')
          : myPurchases.map((p, i) =>
              React.createElement('div', { key:i, style:{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom:`1px solid ${C.border}`, fontSize:'12px' } },
                React.createElement('div', null,
                  React.createElement('div', { style:{ fontWeight:600, color:C.ink } }, p.date),
                  React.createElement('div', { style:{ color:C.muted, marginTop:2 } }, p.supplier || '—')
                ),
                React.createElement('div', { style:{ textAlign:'right' } },
                  React.createElement('div', { style:{ fontWeight:700, color:C.green } }, p.amount_kg+' kg'),
                  p.price_yen && React.createElement('div', { style:{ color:C.sub } }, '¥'+Number(p.price_yen).toLocaleString())
                )
              )
            )
      )
    )
  )
}

// ── Step3-2: 肥料 棚卸し入力パネル ──
function FertilizerInventoryCheckPanel({ fertilizers, fertilizerStock, onUpdateStock }) {
  const [edits, setEdits] = React.useState({})  // { [fertilizer_id]: '入力中の新在庫値(kg)' }

  const stockOf = (f) => {
    const s = fertilizerStock.find(s => String(s.fertilizer_id) === String(f.id))
    return ((s && s.stock_kg != null) ? s.stock_kg : f.stock_kg) ?? 0
  }

  // 行ごとの送信ID: 成功(ok===true)確定まで同じIDを使い回す(応答喪失→再送でも冪等)。値変更でIDを取り直す
  const submitIdsRef = React.useRef({})
  const applyingRef = React.useRef({})
  const [applying, setApplying] = React.useState({}) // 行別の「反映中…」表示(農薬側の保存中…と一貫)
  const [invalidIds, setInvalidIds] = React.useState({}) // 不正値の行(赤枠+エラー・農薬側と同型)
  const isValidStock = isValidStockAmount // 共有ヘルパー(config.js)。空欄/NaN/非有限/負数を弾く
  const handleApply = async (f) => {
    const val = edits[f.id]
    if (val === undefined || val === '') return
    if (!isValidStock(val)) { setInvalidIds(prev => ({ ...prev, [f.id]: true })); return } // 負数/不正は無言拒否せず行エラー
    if (applyingRef.current[f.id]) return // 同一行の二重押しガード
    applyingRef.current[f.id] = true
    setApplying(prev => ({ ...prev, [f.id]: true }))
    if (!submitIdsRef.current[f.id]) submitIdsRef.current[f.id] = newUuid()
    const sentId = submitIdsRef.current[f.id]
    const res = await Promise.resolve(onUpdateStock(f.id, Number(val), sentId)).catch(() => null)
    applyingRef.current[f.id] = false
    setApplying(prev => { const next = { ...prev }; delete next[f.id]; return next })
    if (!(res && res.ok === true)) return // 失敗/不明: 入力とIDを保持(トーストはapp側)
    if (submitIdsRef.current[f.id] === sentId) delete submitIdsRef.current[f.id]
    // 応答待ちの間に同じ欄へ入力されていたら、新しい値を残す(黙って消さない・農薬側と同型)
    setEdits(prev => {
      if (prev[f.id] !== val) return prev
      const next = { ...prev }; delete next[f.id]; return next
    })
  }

  const C2 = { green:'#0A6B52', greenL:'#E8F5F0', amber:'#B45309', amberL:'#FFFBEB', red:'#C2410C', ink:'#111827', sub:'#4B5563', muted:'#9CA3AF', border:'#E2E8E2' }

  return React.createElement('div', null,
    React.createElement('div', { style:{ fontSize:'12px', color:C2.sub, marginBottom:'16px' } },
      '現在庫を確認し、実際の在庫量(kg)を入力して反映してください。'
    ),
    React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:'12px' } },
      fertilizers.map(f => {
        const current = stockOf(f)
        const val = edits[f.id] ?? ''
        const hasInput = val !== ''
        const newVal = hasInput ? Number(val) : null
        const diff = newVal !== null ? newVal - current : null
        return React.createElement('div', {
          key: f.id,
          style:{
            background:'#fff', borderRadius:'12px', padding:'14px 16px',
            border: hasInput ? `1.5px solid ${C2.green}` : `1px solid ${C2.border}`,
            boxShadow: hasInput ? '0 0 0 3px rgba(10,107,82,.07)' : '0 1px 3px rgba(17,24,39,.05)',
            transition:'border-color .15s, box-shadow .15s',
            display:'flex', flexDirection:'column', gap:'10px',
          }
        },
          // 肥料名
          React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px' } },
            React.createElement('div', {
              style:{ width:28, height:28, borderRadius:'7px', background:C2.greenL, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }
            }, React.createElement('i', { className:'ti ti-leaf', style:{ color:C2.green, fontSize:'14px' } })),
            React.createElement('div', { style:{ fontSize:'13px', fontWeight:700, color:C2.ink, lineHeight:1.3, wordBreak:'break-all' } }, f.name)
          ),
          // 現在庫表示
          React.createElement('div', { style:{ background:'#F8FAF8', borderRadius:'7px', padding:'7px 10px', display:'flex', justifyContent:'space-between', alignItems:'center' } },
            React.createElement('span', { style:{ fontSize:'10px', color:C2.sub, fontWeight:600 } }, '現在の在庫'),
            React.createElement('span', { style:{ fontSize:'15px', fontWeight:700, color:C2.ink } }, current+' kg')
          ),
          // 新在庫入力
          React.createElement('div', null,
            React.createElement('div', { style:{ fontSize:'10px', fontWeight:600, color:C2.sub, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'5px' } }, '新しい在庫量（kg）'),
            React.createElement('input', {
              type:'number', min:'0', step:'0.1', placeholder:'例: 90',
              value: val,
              onChange: e => {
                delete submitIdsRef.current[f.id]
                if (invalidIds[f.id]) setInvalidIds(prev => { const next = { ...prev }; delete next[f.id]; return next }) // 入力し直したらエラー解除
                setEdits(prev => ({ ...prev, [f.id]: e.target.value }))
              },
              style:{ width:'100%', padding:'8px 10px', border:`1.5px solid ${invalidIds[f.id] ? C2.red : hasInput ? C2.green : C2.border}`, borderRadius:'7px', fontSize:'13px', fontWeight:600, color:C2.ink, outline:'none', boxSizing:'border-box' },
              onFocus: e => { if (!invalidIds[f.id]) { e.target.style.borderColor=C2.green; e.target.style.boxShadow='0 0 0 3px rgba(10,107,82,.1)' } },
              onBlur:  e => { if (!invalidIds[f.id]) { e.target.style.borderColor = hasInput ? C2.green : C2.border; e.target.style.boxShadow='none' } },
            }),
            invalidIds[f.id] && React.createElement('div', {
              style:{ fontSize:'11px', color:C2.red, fontWeight:600, marginTop:'5px', display:'flex', alignItems:'center', gap:'4px' }
            },
              React.createElement('i', { className:'ti ti-alert-triangle', style:{ fontSize:'12px' } }),
              '0以上の在庫量を入力してください'
            )
          ),
          // 差分プレビュー + 反映ボタン
          React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:'8px' } },
            diff !== null && React.createElement('span', {
              style:{
                fontSize:'11px', fontWeight:700, padding:'2px 7px', borderRadius:'20px',
                background: diff > 0 ? '#F0FDF4' : diff < 0 ? '#FFF1EE' : '#F8FAFC',
                color: diff > 0 ? '#059669' : diff < 0 ? C2.red : C2.muted,
                border: `1px solid ${diff > 0 ? '#BBF7D0' : diff < 0 ? 'rgba(194,65,12,.2)' : '#E2E8F0'}`,
              }
            }, diff > 0 ? `+${diff} kg` : diff < 0 ? `${diff} kg` : '変更なし'),
            React.createElement('button', {
              onClick: () => handleApply(f),
              disabled: !hasInput || !!applying[f.id],
              style:{
                marginLeft:'auto', padding:'7px 14px', background: hasInput ? C2.green : '#E2E8E2',
                color: hasInput ? '#fff' : C2.muted,
                border:'none', borderRadius:'7px', fontSize:'12px',
                cursor: (hasInput && !applying[f.id]) ? 'pointer' : 'not-allowed', fontWeight:600,
                opacity: applying[f.id] ? 0.6 : 1, transition:'background .15s',
              }
            }, applying[f.id] ? '反映中…' : '反映')
          )
        )
      })
    )
  )
}

// ── Step3-2: 肥料 仕入れ履歴パネル ──
function FertilizerPurchaseHistoryPanel({ fertilizers, fertilizerPurchases }) {
  const nameOf = (id) => (masterById(fertilizers, id) || {}).name || '（不明）'
  const sorted = [...fertilizerPurchases].sort((a, b) => (a.date < b.date ? 1 : -1))

  if (sorted.length === 0) {
    return React.createElement('div', { style:{ fontSize:'13px', color:'#9CA3AF' } }, 'まだ仕入れ記録がありません')
  }

  return React.createElement('table', { style:{ width:'100%', borderCollapse:'collapse', fontSize:'12px' } },
    React.createElement('thead', null,
      React.createElement('tr', null,
        ['日付','肥料名','仕入れ量(kg)','仕入れ先','金額(円)'].map((h,i) =>
          React.createElement('th', { key:i, style:{ textAlign:'left', borderBottom:'1px solid #ddd', padding:'4px 6px', color:'#64748B' } }, h)
        )
      )
    ),
    React.createElement('tbody', null,
      sorted.map((p,i) =>
        React.createElement('tr', { key:i },
          React.createElement('td', { style:{ padding:'4px 6px', borderBottom:'1px solid #f0f0f0' } }, p.date),
          React.createElement('td', { style:{ padding:'4px 6px', borderBottom:'1px solid #f0f0f0' } }, nameOf(p.fertilizer_id)),
          React.createElement('td', { style:{ padding:'4px 6px', borderBottom:'1px solid #f0f0f0' } }, p.amount_kg),
          React.createElement('td', { style:{ padding:'4px 6px', borderBottom:'1px solid #f0f0f0' } }, p.supplier || '—'),
          React.createElement('td', { style:{ padding:'4px 6px', borderBottom:'1px solid #f0f0f0' } }, p.price_yen ?? '—'),
        )
      )
    )
  )
}

// =====================================================
// 肥料の使用履歴パネル（肥料マスタページ用）
// 追肥記録（topDressingRecords）を肥料ごとに展開・集計し、
// 農薬マスタの使用履歴タブと同じ構成（サマリーカード＋月別バーチャート＋時系列リスト）で表示する。
// =====================================================
function FertilizerUsageHistoryPanel({ fertilizers, topDressingRecords, fields }) {
  const [selectedId, setSelectedId] = React.useState(
    fertilizers.length > 0 ? fertilizers[0].id : null
  )

  const fieldNameOf = (id) => {
    const f = masterById(fields, id)
    return f ? (f.name || f.field_no_raw || ('圃場#' + id)) : ('圃場#' + id)
  }

  // topDressingRecords は1レコードに複数肥料を含むため、選択中の肥料分だけ展開する
  const usageRecords = (topDressingRecords || [])
    .flatMap(r => (r.fertilizers || [])
      .filter(fe => String(fe.fertilizer_id) === String(selectedId))
      .map(fe => ({
        id:       r.id + '-' + fe.fertilizer_id,
        date:     r.date,
        amount:   Number(fe.amount_kg) || 0,
        field_id: r.field_id,
        memo:     r.memo,
      }))
    )
    .sort((a, b) => b.date.localeCompare(a.date))

  // 今月・先月の判定
  const now = new Date()
  const thisYM = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
  const lastDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastYM = lastDate.getFullYear() + '-' + String(lastDate.getMonth() + 1).padStart(2, '0')

  const totalUsed = usageRecords.reduce((a, r) => a + r.amount, 0)
  const thisMonth = usageRecords.filter(r => r.date && r.date.startsWith(thisYM)).reduce((a, r) => a + r.amount, 0)
  const lastMonth = usageRecords.filter(r => r.date && r.date.startsWith(lastYM)).reduce((a, r) => a + r.amount, 0)
  const diff      = Math.round((thisMonth - lastMonth) * 100) / 100
  const diffSign  = diff > 0 ? '+' : ''

  const C = { green:'#0A6B52', blue:'#1D4ED8', blueL:'#EFF6FF', greenL:'#F0FDF4', border:'#E2E8E2', muted:'#9CA3AF', ink:'#111827', sub:'#4B5563' }

  return React.createElement('div', null,
    // 肥料セレクタ（チップ）
    React.createElement('div', { style:{ position:'relative', marginBottom:'20px' } },
      React.createElement('div', { style:{ display:'flex', gap:'8px', overflowX:'auto', paddingBottom:'4px' } },
        ...fertilizers.map(f => {
          const isActiveChip = String(selectedId) === String(f.id)
          return React.createElement('button', {
            key: f.id,
            onClick: () => setSelectedId(f.id),
            style:{
              padding:'7px 16px', borderRadius:'20px', flexShrink:0, whiteSpace:'nowrap',
              border:'1.5px solid ' + (isActiveChip ? C.green : C.border),
              background: isActiveChip ? C.green : '#fff',
              color: isActiveChip ? '#fff' : C.sub,
              fontSize:'12px', fontWeight:600, cursor:'pointer',
              transition:'all .15s', fontFamily:"'Inter',sans-serif",
            }
          }, f.name)
        })
      ),
      React.createElement('div', {
        style:{ position:'absolute', left:0, top:0, bottom:'4px', width:'20px', background:'linear-gradient(90deg, #fff 0%, rgba(255,255,255,0) 100%)', pointerEvents:'none' }
      }),
      React.createElement('div', {
        style:{ position:'absolute', right:0, top:0, bottom:'4px', width:'20px', background:'linear-gradient(270deg, #fff 0%, rgba(255,255,255,0) 100%)', pointerEvents:'none' }
      })
    ),

    // 月次サマリーカード（3枚）
    React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px', marginBottom:'20px' } },
      React.createElement('div', { style:{ background:C.greenL, border:'1px solid #A7F3D0', borderRadius:'10px', padding:'14px 16px' } },
        React.createElement('div', { style:{ fontSize:'11px', color:'#6B7280', marginBottom:'4px', display:'flex', alignItems:'center', gap:'4px' } },
          React.createElement('i', { className:'ti ti-repeat', style:{ fontSize:'12px' } }), '総使用回数'
        ),
        React.createElement('div', { style:{ fontSize:'24px', fontWeight:700, color:C.green } }, usageRecords.length + ' 回')
      ),
      React.createElement('div', { style:{ background:C.blueL, border:'1px solid #BFDBFE', borderRadius:'10px', padding:'14px 16px' } },
        React.createElement('div', { style:{ fontSize:'11px', color:'#6B7280', marginBottom:'4px', display:'flex', alignItems:'center', gap:'4px' } },
          React.createElement('i', { className:'ti ti-calendar-month', style:{ fontSize:'12px' } }), '今月使用量'
        ),
        React.createElement('div', { style:{ fontSize:'24px', fontWeight:700, color:C.blue } }, Math.round(thisMonth * 100) / 100 + ' kg')
      ),
      React.createElement('div', { style:{ background: diff > 0 ? '#FFF1EE' : diff < 0 ? C.greenL : '#F9FAFB', border:'1px solid ' + (diff > 0 ? '#FECACA' : diff < 0 ? '#A7F3D0' : C.border), borderRadius:'10px', padding:'14px 16px' } },
        React.createElement('div', { style:{ fontSize:'11px', color:'#6B7280', marginBottom:'4px', display:'flex', alignItems:'center', gap:'4px' } },
          React.createElement('i', { className:'ti ti-trending-up', style:{ fontSize:'12px' } }), '先月比'
        ),
        React.createElement('div', { style:{ fontSize:'24px', fontWeight:700, color: diff > 0 ? '#C2410C' : diff < 0 ? C.green : C.muted } },
          lastMonth === 0 && thisMonth === 0 ? '—' : diffSign + diff + ' kg'
        )
      )
    ),

    // 月別使用量バーチャート
    React.createElement(MonthlyUsageBarChart, { records: usageRecords, unit:'kg', color: C.blue }),

    // 時系列リスト
    React.createElement('div', { style:{ fontSize:'11px', fontWeight:700, color:C.muted, letterSpacing:'.06em', textTransform:'uppercase', marginBottom:'10px' } }, '使用履歴'),
    usageRecords.length === 0
      ? React.createElement('div', {
          style:{ padding:'40px 0', textAlign:'center', color:C.muted, fontSize:'13px', background:'#F9FAFB', borderRadius:'10px', border:'1px dashed ' + C.border }
        },
          React.createElement('i', { className:'ti ti-leaf-off', style:{ fontSize:'28px', display:'block', marginBottom:'8px', color:C.border } }),
          '追肥記録がありません'
        )
      : React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:'6px' } },
          ...usageRecords.map((r) => React.createElement('div', {
            key: r.id,
            style:{
              display:'flex', alignItems:'center', gap:'12px',
              padding:'10px 14px', background:'#fff',
              border:'1px solid ' + C.border, borderRadius:'9px',
            }
          },
            React.createElement('div', { style:{ width:'8px', height:'8px', borderRadius:'50%', background:C.green, flexShrink:0 } }),
            React.createElement('div', { style:{ flex:1 } },
              React.createElement('div', { style:{ fontSize:'13px', fontWeight:600, color:C.ink } }, r.date),
              React.createElement('div', { style:{ fontSize:'11px', color:C.muted, marginTop:'2px', display:'flex', gap:'10px' } },
                React.createElement('span', null, '📍 ' + fieldNameOf(r.field_id)),
                r.memo && React.createElement('span', null, r.memo)
              )
            ),
            React.createElement('div', { style:{ fontSize:'14px', fontWeight:700, color:C.blue, flexShrink:0 } }, r.amount + ' kg')
          ))
        )
  )
}

// =====================================================
// 作物カテゴリ管理ページ（汎用化）
// categories: カテゴリ配列, onSave: setCropCategories
// =====================================================

// 代表的な作物の管理方式・収穫規格テンプレ（農場ごとに自由編集可）
const CROP_TEMPLATES = {
  // ── 果菜類 ──
  'トマト':        { ui_mode:'standard',     harvest_grades:['秀品','優品','B品'],              color:'#DC2626' },
  'ミニトマト':    { ui_mode:'standard',     harvest_grades:['秀品','優品','B品'],              color:'#EA580C' },
  'キュウリ':      { ui_mode:'row_map',      harvest_grades:['秀品','優品','2L','L','M','B品'], color:'#65A30D' },
  'ナス':          { ui_mode:'row_map',      harvest_grades:['秀品','優品','B品'],              color:'#7C3AED' },
  'ピーマン':      { ui_mode:'row_map',      harvest_grades:['秀品','優品','B品'],              color:'#16A34A' },
  'パプリカ':      { ui_mode:'row_map',      harvest_grades:['秀品','優品','B品'],              color:'#EA580C' },
  'ししとう':      { ui_mode:'row_map',      harvest_grades:['秀品','B品'],                     color:'#65A30D' },
  '唐辛子':        { ui_mode:'row_map',      harvest_grades:['規格内','B品'],                   color:'#DC2626' },
  'ズッキーニ':    { ui_mode:'row_map',      harvest_grades:['L','M','S','B品'],               color:'#65A30D' },
  'ゴーヤ':        { ui_mode:'row_map',      harvest_grades:['L','M','S','B品'],               color:'#0D9972' },
  'おくら':        { ui_mode:'row_map',      harvest_grades:['秀品','優品','B品'],              color:'#0D9972' },
  'かぼちゃ':      { ui_mode:'standard',     harvest_grades:['規格内','B品'],                   color:'#EA580C' },
  'スイカ':        { ui_mode:'standard',     harvest_grades:['大','中','小','B品'],             color:'#DC2626' },
  'メロン':        { ui_mode:'standard',     harvest_grades:['秀品','優品','B品'],              color:'#65A30D' },
  // ── 葉物・茎葉野菜 ──
  'レタス':        { ui_mode:'row_map',      harvest_grades:['規格内','B品'],                   color:'#0D9972' },
  'ほうれん草':    { ui_mode:'row_map',      harvest_grades:['規格内','B品'],                   color:'#15803D' },
  'キャベツ':      { ui_mode:'row_map',      harvest_grades:['秀品','優品','B品'],              color:'#65A30D' },
  'ブロッコリー':  { ui_mode:'row_map',      harvest_grades:['L','M','S','B品'],               color:'#0D9972' },
  'カリフラワー':  { ui_mode:'row_map',      harvest_grades:['L','M','S','B品'],               color:'#6B7280' },
  '白菜':          { ui_mode:'row_map',      harvest_grades:['秀品','優品','B品'],              color:'#65A30D' },
  '水菜':          { ui_mode:'row_map',      harvest_grades:['規格内','B品'],                   color:'#0D9972' },
  '小松菜':        { ui_mode:'row_map',      harvest_grades:['規格内','B品'],                   color:'#15803D' },
  'チンゲン菜':    { ui_mode:'row_map',      harvest_grades:['規格内','B品'],                   color:'#16A34A' },
  'ターサイ':      { ui_mode:'row_map',      harvest_grades:['規格内','B品'],                   color:'#0D9972' },
  '春菊':          { ui_mode:'row_map',      harvest_grades:['規格内','B品'],                   color:'#65A30D' },
  'ルッコラ':      { ui_mode:'row_map',      harvest_grades:['規格内','B品'],                   color:'#65A30D' },
  'セロリ':        { ui_mode:'row_map',      harvest_grades:['秀品','B品'],                     color:'#65A30D' },
  'シソ':          { ui_mode:'row_map',      harvest_grades:['規格内','B品'],                   color:'#0D9972' },
  '三つ葉':        { ui_mode:'row_map',      harvest_grades:['規格内','B品'],                   color:'#65A30D' },
  'パクチー':      { ui_mode:'row_map',      harvest_grades:['規格内','B品'],                   color:'#65A30D' },
  // ── ネギ類 ──
  'ネギ':          { ui_mode:'row_map',      harvest_grades:['秀品','優品','B品'],              color:'#B45309' },
  '青ネギ':        { ui_mode:'row_map',      harvest_grades:['秀品','優品','B品'],              color:'#65A30D' },
  'にら':          { ui_mode:'row_map',      harvest_grades:['規格内','B品'],                   color:'#15803D' },
  'アスパラガス':  { ui_mode:'row_map',      harvest_grades:['2L','L','M','S','B品'],          color:'#65A30D' },
  // ── 根菜類 ──
  '玉ねぎ':        { ui_mode:'standard',     harvest_grades:['2L','L','M','S','B品'],          color:'#B45309' },
  'ニンジン':      { ui_mode:'standard',     harvest_grades:['2L','L','M','S','B品'],          color:'#EA580C' },
  '大根':          { ui_mode:'standard',     harvest_grades:['2L','L','M','S','B品'],          color:'#6B7280' },
  'かぶ':          { ui_mode:'standard',     harvest_grades:['2L','L','M','B品'],              color:'#6B7280' },
  'ごぼう':        { ui_mode:'standard',     harvest_grades:['L','M','S','B品'],               color:'#B45309' },
  'にんにく':      { ui_mode:'standard',     harvest_grades:['2L','L','M','S','B品'],          color:'#6B7280' },
  'ショウガ':      { ui_mode:'standard',     harvest_grades:['規格内','B品'],                   color:'#B45309' },
  'れんこん':      { ui_mode:'standard',     harvest_grades:['2L','L','M','S','B品'],          color:'#B45309' },
  // ── いも類 ──
  'じゃがいも':    { ui_mode:'standard',     harvest_grades:['2L','L','M','S','B品'],          color:'#B45309' },
  'サツマイモ':    { ui_mode:'standard',     harvest_grades:['2L','L','M','S','B品'],          color:'#EA580C' },
  '里芋':          { ui_mode:'standard',     harvest_grades:['2L','L','M','S','B品'],          color:'#B45309' },
  '長芋':          { ui_mode:'standard',     harvest_grades:['L','M','S','B品'],               color:'#6B7280' },
  // ── 豆類 ──
  'えだまめ':      { ui_mode:'row_map',      harvest_grades:['秀品','優品','B品'],              color:'#65A30D' },
  'いんげん':      { ui_mode:'row_map',      harvest_grades:['秀品','B品'],                     color:'#0D9972' },
  'さやえんどう':  { ui_mode:'row_map',      harvest_grades:['秀品','B品'],                     color:'#0D9972' },
  'スナップえんどう':{ ui_mode:'row_map',    harvest_grades:['秀品','B品'],                     color:'#65A30D' },
  'そらまめ':      { ui_mode:'row_map',      harvest_grades:['秀品','優品','B品'],              color:'#65A30D' },
  '大豆':          { ui_mode:'growth_stage', harvest_grades:['規格内','B品'],                   color:'#B45309' },
  '黒大豆':        { ui_mode:'growth_stage', harvest_grades:['規格内','B品'],                   color:'#6B7280' },
  // ── 果樹 ──
  'イチゴ':        { ui_mode:'standard',     harvest_grades:['秀品','優品','B品'],              color:'#DC2626' },
  'りんご':        { ui_mode:'standard',     harvest_grades:['特秀','秀品','優品','B品'],       color:'#DC2626' },
  'みかん':        { ui_mode:'standard',     harvest_grades:['秀品','優品','B品'],              color:'#EA580C' },
  '梨':            { ui_mode:'standard',     harvest_grades:['秀品','優品','B品'],              color:'#B45309' },
  '柿':            { ui_mode:'standard',     harvest_grades:['秀品','優品','B品'],              color:'#EA580C' },
  'ぶどう':        { ui_mode:'standard',     harvest_grades:['秀品','優品','B品'],              color:'#7C3AED' },
  'もも':          { ui_mode:'standard',     harvest_grades:['秀品','優品','B品'],              color:'#DB2777' },
  'さくらんぼ':    { ui_mode:'standard',     harvest_grades:['秀品','優品','B品'],              color:'#DC2626' },
  'ブルーベリー':  { ui_mode:'standard',     harvest_grades:['秀品','B品'],                     color:'#7C3AED' },
  'キウイ':        { ui_mode:'standard',     harvest_grades:['秀品','優品','B品'],              color:'#65A30D' },
  'いちじく':      { ui_mode:'standard',     harvest_grades:['秀品','優品','B品'],              color:'#7C3AED' },
  'プラム':        { ui_mode:'standard',     harvest_grades:['秀品','優品','B品'],              color:'#7C3AED' },
  // ── 穀物 ──
  'とうもろこし':  { ui_mode:'row_map',      harvest_grades:['2L','L','M','S','B品'],          color:'#EA580C' },
  '水稲':          { ui_mode:'growth_stage', harvest_grades:['一等米','二等米','くず米'],       color:'#2563EB' },
  'もち米':        { ui_mode:'growth_stage', harvest_grades:['一等米','二等米','くず米'],       color:'#0891B2' },
  '小麦':          { ui_mode:'growth_stage', harvest_grades:['一等','二等','規格外'],           color:'#B45309' },
  '大麦':          { ui_mode:'growth_stage', harvest_grades:['一等','二等','規格外'],           color:'#B45309' },
  'そば':          { ui_mode:'growth_stage', harvest_grades:['規格内','B品'],                   color:'#6B7280' },
  'ライ麦':        { ui_mode:'growth_stage', harvest_grades:['規格内','B品'],                   color:'#6B7280' },
  // ── ハーブ・香辛料 ──
  'バジル':        { ui_mode:'standard',     harvest_grades:['規格内','B品'],                   color:'#65A30D' },
  'パセリ':        { ui_mode:'standard',     harvest_grades:['規格内','B品'],                   color:'#65A30D' },
  'ミント':        { ui_mode:'standard',     harvest_grades:['規格内','B品'],                   color:'#0D9972' },
  'ローズマリー':  { ui_mode:'standard',     harvest_grades:['規格内','B品'],                   color:'#0891B2' },
  // ── その他 ──
  'お茶':          { ui_mode:'standard',     harvest_grades:['一番茶','二番茶','秋番茶'],       color:'#0D9972' },
  'ごま':          { ui_mode:'growth_stage', harvest_grades:['規格内','B品'],                   color:'#6B7280' },
  'なたね':        { ui_mode:'growth_stage', harvest_grades:['規格内','B品'],                   color:'#65A30D' },
}
// 完全一致→長いキー優先の順でマッチ（ミニトマト→トマトに引っ張られるバグを防ぐ）
const findCropTemplate = (name) => {
  if (!name || name.length < 2) return null
  if (CROP_TEMPLATES[name]) return CROP_TEMPLATES[name]
  const keys = Object.keys(CROP_TEMPLATES).sort((a, b) => b.length - a.length)
  const key = keys.find(k => name.includes(k) || k.includes(name))
  return key ? CROP_TEMPLATES[key] : null
}

function CropCategoryPage({ categories, onSave }) {
  const UI_MODES = [
    { key:'row_map',      label:'畝マップ',     desc:'畝ごとの播種・収穫・農薬散布を管理' },
    { key:'growth_stage', label:'生育ステージ', desc:'育苗〜登熟まで時系列で進捗管理（水稲等）' },
    { key:'standard',     label:'シンプル',     desc:'作業記録のみのシンプルモード' },
  ]
  const PALETTE = ['#0D9972','#EA580C','#2563EB','#7C3AED','#B45309','#DC2626','#0891B2','#65A30D','#DB2777','#6B7280']
  const blank = () => ({ key:'cat_' + Date.now(), name:'', ui_mode:'row_map', harvest_grades:['規格内','B品'], color:'#0D9972', sort_order:(categories.length * 10), base_temp_c:null, required_gdd:null })
  const [editing, setEditing]     = React.useState(null)
  const [gradesText, setGradesText] = React.useState('')
  const [suggestion, setSuggestion] = React.useState(null)  // テンプレ候補
  const [deleteTarget, setDeleteTarget] = React.useState(null)  // 削除確認モーダル対象（共通ConfirmDeleteModal）

  const openNew  = () => { const c = blank(); setEditing(c); setGradesText(c.harvest_grades.join(', ')); setSuggestion(null) }
  const openEdit = (cat) => { setEditing({...cat}); setGradesText(cat.harvest_grades.join(', ')); setSuggestion(null) }
  const closeEdit = () => { setEditing(null); setSuggestion(null) }

  const handleNameChange = (name) => {
    setEditing(p => ({...p, name}))
    setSuggestion(name.length >= 2 ? findCropTemplate(name) : null)
  }

  const applySuggestion = () => {
    if (!suggestion) return
    setEditing(p => ({...p, ui_mode: suggestion.ui_mode, color: suggestion.color}))
    setGradesText(suggestion.harvest_grades.join(', '))
    setSuggestion(null)
  }

  const saveEdit = () => {
    if (!editing.name.trim()) return
    const grades = gradesText.split(',').map(s => s.trim()).filter(Boolean)
    const numOrNull = (v) => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v)
    const updated = { ...editing, name: editing.name.trim(), harvest_grades: grades.length ? grades : ['規格内','B品'],
      base_temp_c: numOrNull(editing.base_temp_c), required_gdd: numOrNull(editing.required_gdd) }
    const exists = categories.find(c => c.key === updated.key)
    if (exists) {
      onSave(categories.map(c => c.key === updated.key ? updated : c))
    } else {
      onSave([...categories, updated])
      celebrateSave('カテゴリを追加！')
    }
    closeEdit()
  }

  const deleteCat = (key) => {
    if (categories.length <= 1) return
    onSave(categories.filter(c => c.key !== key))
  }

  const isBuiltin = (key) => ['leaf_veg','corn','rice','other'].includes(key)

  const L = { fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:4, letterSpacing:'.06em', textTransform:'uppercase' }
  const I = { width:'100%', padding:'8px 10px', border:'1px solid #D8E0DA', borderRadius:6, fontSize:13, outline:'none', boxSizing:'border-box' }

  return React.createElement('div', { className:'page' },
    // ヘッダー
    React.createElement('div', { style:{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24 } },
      React.createElement('div', null,
        React.createElement('div', { className:'eyebrow' }, 'CROP CATEGORIES'),
        React.createElement('div', { className:'page-title' }, '作物カテゴリ管理'),
        React.createElement('div', { className:'page-sub', style:{ marginBottom:0 } }, '作物の種類ごとに管理方式と収穫規格を設定します。農場のナレッジに合わせて自由に編集できます。')
      ),
      React.createElement('button', { className:'btn btn-primary', onClick:openNew, style:{ flexShrink:0, marginLeft:16 } }, '+ カテゴリを追加')
    ),

    // カテゴリ一覧グリッド
    React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:16 } },
      categories.map(cat =>
        React.createElement('div', { key:cat.key, style:{ background:'#fff', border:'1.5px solid #E2E8E2', borderRadius:10, padding:16, display:'flex', flexDirection:'column' } },
          React.createElement('div', { style:{ height:4, background:cat.color, borderRadius:4, marginBottom:14 } }),
          React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:8, marginBottom:6 } },
            React.createElement('div', { style:{ width:10, height:10, borderRadius:'50%', background:cat.color, flexShrink:0 } }),
            React.createElement('div', { style:{ fontWeight:700, fontSize:14, color:'#111827' } }, cat.name),
            React.createElement('div', { style:{ fontSize:10, color:'#94A3B8', background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:4, padding:'1px 5px', marginLeft:'auto' } }, cat.key)
          ),
          React.createElement('div', { style:{ fontSize:12, color:'#64748B', marginBottom:8 } },
            '管理方式: ',
            React.createElement('span', { style:{ fontWeight:600, color:'#0A6B52' } },
              (UI_MODES.find(m => m.key === cat.ui_mode) || UI_MODES[0]).label
            )
          ),
          React.createElement('div', { style:{ fontSize:11, color:'#64748B', marginBottom:8 } },
            '🌡 収穫予測: ',
            (cat.base_temp_c != null && cat.required_gdd != null)
              ? React.createElement('span', { style:{ fontWeight:600, color:'#B45309' } }, `基準${cat.base_temp_c}℃ / 必要${cat.required_gdd}℃・日`)
              : React.createElement('span', { style:{ color:'#B45309' } }, '未設定')
          ),
          React.createElement('div', { style:{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:14, flex:1 } },
            React.createElement('span', { style:{ fontSize:11, color:'#64748B', marginRight:2 } }, '規格:'),
            ...(cat.harvest_grades || []).map(g =>
              React.createElement('span', { key:g, style:{ fontSize:11, background:'#F1F5F9', border:'1px solid #E2E8F0', borderRadius:4, padding:'1px 6px', color:'#374151' } }, g)
            )
          ),
          React.createElement('div', { style:{ display:'flex', gap:6 } },
            React.createElement('button', { onClick:()=>openEdit(cat), style:{ flex:1, padding:'6px 0', background:'#F0F8F4', border:'1px solid #C6DDD0', borderRadius:6, fontSize:12, fontWeight:600, color:'#0A6B52', cursor:'pointer' } }, '✏ 編集'),
            !isBuiltin(cat.key) && React.createElement('button', {
              onClick:()=> setDeleteTarget(cat),
              style:{ padding:'6px 12px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:6, fontSize:12, fontWeight:600, color:'#DC2626', cursor:'pointer' }
            }, '✕')
          )
        )
      )
    ),

    // ── 編集モーダル ──
    editing && React.createElement('div', { style:{ position:'fixed', inset:0, background:'rgba(0,0,0,.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 }, onClick:e=>{ if(e.target===e.currentTarget) closeEdit() } },
      React.createElement('div', { style:{ background:'#fff', borderRadius:12, padding:28, width:460, boxShadow:'0 8px 32px rgba(0,0,0,.18)', maxHeight:'90vh', overflowY:'auto' } },
        React.createElement('div', { style:{ fontWeight:700, fontSize:16, color:'#111827', marginBottom:20 } },
          categories.find(c => c.key === editing.key) ? '✏ カテゴリを編集' : '＋ 新しいカテゴリ'
        ),

        // カテゴリ名（テンプレ候補トリガー）
        React.createElement('div', { style:{ marginBottom:14 } },
          React.createElement('span', { style:L }, 'カテゴリ名 *'),
          React.createElement('input', { style:I, value:editing.name, onChange:e=>handleNameChange(e.target.value), placeholder:'例: トマト, じゃがいも, そば …' }),
          suggestion && React.createElement('div', {
            style:{ marginTop:6, padding:'8px 10px', background:'#FFFBEB', border:'1px solid #FCD34D', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }
          },
            React.createElement('div', { style:{ fontSize:12, color:'#92400E' } },
              React.createElement('span', { style:{ fontSize:13 } }, '💡 '),
              React.createElement('strong', null, 'テンプレ候補: '),
              (UI_MODES.find(m => m.key === suggestion.ui_mode) || UI_MODES[0]).label,
              ' / ',
              suggestion.harvest_grades.join(', ')
            ),
            React.createElement('button', { onClick:applySuggestion, style:{ padding:'3px 10px', background:'#D97706', color:'#fff', border:'none', borderRadius:5, fontSize:11, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' } }, '適用')
          )
        ),

        // 管理方式
        React.createElement('label', { style:{ display:'block', marginBottom:14 } },
          React.createElement('span', { style:L }, '管理方式'),
          React.createElement('select', { style:I, value:editing.ui_mode, onChange:e=>setEditing(p=>({...p, ui_mode:e.target.value})) },
            UI_MODES.map(m => React.createElement('option', { key:m.key, value:m.key }, m.label + ' — ' + m.desc))
          )
        ),

        // 収穫規格
        React.createElement('label', { style:{ display:'block', marginBottom:14 } },
          React.createElement('span', { style:L }, '収穫規格（カンマ区切り）'),
          React.createElement('input', { style:I, value:gradesText, onChange:e=>setGradesText(e.target.value), placeholder:'例: 2L, L, M, S, B品' })
        ),

        // 収穫予測（積算温度）のしきい値 — 一度入力すれば以降の予測は自動
        React.createElement('div', { style:{ marginBottom:14, padding:'12px 12px 4px', background:'#F0FDF4', border:'1px solid #C6DDD0', borderRadius:8 } },
          React.createElement('div', { style:{ fontSize:11, fontWeight:700, color:'#0A6B52', marginBottom:8, letterSpacing:'.04em' } }, '🌡 収穫予測（積算温度）'),
          React.createElement('div', { style:{ display:'flex', gap:12 } },
            React.createElement('label', { style:{ display:'block', flex:1 } },
              React.createElement('span', { style:L }, '基準温度（℃）'),
              React.createElement('input', { style:I, type:'number', step:'0.5', value: editing.base_temp_c == null ? '' : editing.base_temp_c, onChange:e=>setEditing(p=>({...p, base_temp_c:e.target.value})), placeholder:'例: 4' })
            ),
            React.createElement('label', { style:{ display:'block', flex:1 } },
              React.createElement('span', { style:L }, '必要積算温度（℃・日）'),
              React.createElement('input', { style:I, type:'number', step:'10', value: editing.required_gdd == null ? '' : editing.required_gdd, onChange:e=>setEditing(p=>({...p, required_gdd:e.target.value})), placeholder:'例: 900' })
            )
          ),
          React.createElement('div', { style:{ fontSize:10.5, color:'#64748B', margin:'6px 2px 8px', lineHeight:1.5 } },
            '定植/は種日からの日々の（平均気温−基準温度）の積算が必要積算温度に達した日を収穫予測日とします。空欄なら予測しません。')
        ),

        // カラー
        React.createElement('div', { style:{ marginBottom:22 } },
          React.createElement('span', { style:L }, 'カラー'),
          React.createElement('div', { style:{ display:'flex', gap:8, flexWrap:'wrap', marginTop:4 } },
            PALETTE.map(c => React.createElement('button', { key:c, onClick:()=>setEditing(p=>({...p, color:c})), style:{ width:30, height:30, borderRadius:'50%', background:c, border: editing.color===c ? '3px solid #111827' : '2px solid #fff', cursor:'pointer', boxShadow:'0 0 0 1.5px #D1D5DB' } }))
          )
        ),

        React.createElement('div', { style:{ display:'flex', gap:8 } },
          React.createElement('button', { onClick:saveEdit, disabled:!editing.name.trim(), style:{ flex:1, padding:10, background: editing.name.trim() ? '#0A6B52' : '#9CA3AF', color:'#fff', border:'none', borderRadius:6, fontSize:14, fontWeight:600, cursor: editing.name.trim() ? 'pointer' : 'default' } }, '保存'),
          React.createElement('button', { onClick:closeEdit, style:{ padding:'10px 16px', background:'#F1F5F9', border:'1px solid #E2E8F0', borderRadius:6, fontSize:14, color:'#64748B', cursor:'pointer' } }, 'キャンセル')
        )
      )
    ),

    // 削除確認（共通ConfirmDeleteModalに統一。旧window.confirmを置換）
    deleteTarget && React.createElement(ConfirmDeleteModal, {
      title: '作物カテゴリを削除しますか？',
      targetName: deleteTarget.name,
      onCancel: () => setDeleteTarget(null),
      onConfirm: () => { deleteCat(deleteTarget.key); setDeleteTarget(null) }
    })
  )
}

// =====================================================
// 【メニュー整理】TabHubPage — 複数の既存ページをタブでまとめる汎用ハブ。
// 各タブは { key, label, render:()=>ReactElement }。render は既存ページを返すだけなので
// 既存ページ自体は無改修（プロップスはapp.js側から渡す）。マスタ管理・機器管理で使用。
// =====================================================
function TabHubPage({ tabs }) {
  const [active, setActive] = React.useState(0)
  const list = tabs || []
  const cur = list[active] || list[0]
  return React.createElement('div', null,
    React.createElement('div', { style:{ display:'flex', gap:'2px', padding:'18px 28px 0', borderBottom:'1px solid #E5E7EB', background:'#fff', flexWrap:'wrap', position:'sticky', top:0, zIndex:5 } },
      ...list.map((t, i) => React.createElement('button', {
        key: t.key,
        onClick: () => setActive(i),
        style:{ padding:'10px 20px', border:'none', background:'none', cursor:'pointer', fontSize:'14px',
          fontWeight: i===active ? 700 : 600, color: i===active ? '#0A6B52' : '#6B7280',
          borderBottom: i===active ? '3px solid #0A6B52' : '3px solid transparent', marginBottom:'-1px' } },
        t.label))
    ),
    cur ? cur.render() : null
  )
}

// =====================================================
// 【機械整備記録】MaintenanceLogPage（GAP審査4要件「機械・器具の点検・清掃記録」対応）
// 紙日報「作業日報(機械)＝機械整備記録」に相当。圃場に依存しない農場全体の記録。
// 純追加: 専用 localStorage キー(farm_maintenance_records)。既存スキーマ・集計に非依存。
// =====================================================
function MaintenanceLogPage({ records, staff, onSave, onDelete }) {
  const MTYPES  = ['点検', '整備', '清掃']
  const RESULTS = ['異常なし', '要対応', '対応済']
  const today = todayYmd()
  const blank = { date: today, machine_name:'', machine_no:'', mtype:'点検', result:'異常なし', worker:'', note:'' }
  const [form, setForm] = React.useState(blank)
  const [deleteTarget, setDeleteTarget] = React.useState(null)
  const up = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const valid = form.machine_name.trim() !== ''
  // 送信ID保持: 成功が確定するまで同じIDを使い回す(応答喪失→再送でも冪等で二重登録しない)
  const submitIdRef = React.useRef(null)
  const submit = async () => {
    if (!valid) { showToast('機械名を入力してください', 'warn'); return }
    if (!submitIdRef.current) submitIdRef.current = newUuid()
    // 保存が失敗したら入力内容を残す(再入力の手間をなくす)。成功(ok===true)の時だけフォームを空に戻す
    const res = await Promise.resolve(onSave({ ...form, id: submitIdRef.current, machine_name: form.machine_name.trim(), machine_no: form.machine_no.trim(), worker: form.worker.trim(), note: form.note.trim() })).catch(() => null)
    if (!(res && res.ok === true)) return
    submitIdRef.current = null
    setForm(blank)
  }
  const rows = [...(records || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)))
  const resultColor = (r) => r === '要対応' ? '#DC2626' : (r === '対応済' ? '#B45309' : '#0A6B52')
  const pill = (opts, cur, onPick) => React.createElement('div', { style:{ display:'flex', gap:'8px', flexWrap:'wrap' } },
    ...opts.map(o => React.createElement('button', { key:o, onClick:()=>onPick(o),
      style:{ padding:'6px 14px', borderRadius:'16px', fontSize:'13px', fontWeight:600, cursor:'pointer', border:'1px solid',
        borderColor: cur===o ? '#0A6B52' : '#DDE2EC', background: cur===o ? '#ECFDF5' : '#F8FAFC', color: cur===o ? '#0A6B52' : '#64748B' } }, o)))
  const th = { padding:'10px 12px', fontSize:12, fontWeight:700, color:'#6B7280', textAlign:'left', borderBottom:'2px solid #E5E7EB', whiteSpace:'nowrap' }
  const td = { padding:'10px 12px', fontSize:13, color:'#111827', borderBottom:'1px solid #F1F5F9' }

  return React.createElement('div', { className:'page' },
    React.createElement('div', { className:'eyebrow' }, 'EQUIPMENT MAINTENANCE'),
    React.createElement('div', { className:'page-title' }, '機械整備記録'),
    React.createElement('div', { className:'page-sub' }, 'トラクター・収穫機・コンテナ等の点検/整備/清掃を記録します（GAP審査の機械管理記録に対応）'),

    // 入力フォーム
    React.createElement('div', { className:'card', style:{ marginBottom:'18px' } },
      React.createElement(SectionTitle, { icon:'tool' }, '記録を追加'),
      React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'14px' } },
        React.createElement('div', { className:'form-group' }, React.createElement('label', { className:'form-label' }, '日付'),
          React.createElement('input', { type:'date', className:'form-input', value:form.date, onChange:e=>up('date', e.target.value) })),
        React.createElement('div', { className:'form-group' }, React.createElement('label', { className:'form-label' }, '機械名 *'),
          React.createElement('input', { type:'text', className:'form-input', value:form.machine_name, onChange:e=>up('machine_name', e.target.value), placeholder:'例: トラクター / 定植機45 / コンテナ' })),
        React.createElement('div', { className:'form-group' }, React.createElement('label', { className:'form-label' }, '機械No.'),
          React.createElement('input', { type:'text', className:'form-input', value:form.machine_no, onChange:e=>up('machine_no', e.target.value), placeholder:'例: T-01' })),
      ),
      React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' } },
        React.createElement('div', { className:'form-group' }, React.createElement('label', { className:'form-label' }, '種別'), pill(MTYPES, form.mtype, v=>up('mtype', v))),
        React.createElement('div', { className:'form-group' }, React.createElement('label', { className:'form-label' }, '結果'), pill(RESULTS, form.result, v=>up('result', v))),
      ),
      React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:'14px' } },
        React.createElement('div', { className:'form-group' }, React.createElement('label', { className:'form-label' }, '作業者'),
          staff && staff.length > 0
            ? React.createElement('select', { className:'form-input', value:form.worker, onChange:e=>up('worker', e.target.value) },
                React.createElement('option', { value:'' }, '（選択）'), ...staff.map(s=>React.createElement('option', { key:s.id, value:s.name }, s.name)))
            : React.createElement('input', { type:'text', className:'form-input', value:form.worker, onChange:e=>up('worker', e.target.value), placeholder:'作業者名' })),
        React.createElement('div', { className:'form-group' }, React.createElement('label', { className:'form-label' }, '内容・備考'),
          React.createElement('input', { type:'text', className:'form-input', value:form.note, onChange:e=>up('note', e.target.value), placeholder:'例: エンジンオイル交換 / 刃の清掃 / 異常なし' })),
      ),
      React.createElement('button', { className:'btn btn-primary', onClick:submit, style:{ opacity: valid?1:.6 } }, '記録する')
    ),

    // 一覧
    React.createElement('div', { className:'card', style:{ padding:0, overflow:'hidden' } },
      rows.length === 0
        ? React.createElement('div', { style:{ padding:'40px', textAlign:'center', color:'#9CA3AF', fontSize:13 } }, 'まだ記録がありません')
        : React.createElement('div', { style:{ overflowX:'auto' } },
            React.createElement('table', { style:{ width:'100%', borderCollapse:'collapse', minWidth:720 } },
              React.createElement('thead', null, React.createElement('tr', null,
                ...['日付','機械名','No.','種別','結果','作業者','内容',''].map((h,i)=>React.createElement('th', { key:i, style:th }, h)))),
              React.createElement('tbody', null,
                ...rows.map(r => React.createElement('tr', { key:r.id },
                  React.createElement('td', { style:td }, r.date),
                  React.createElement('td', { style:{ ...td, fontWeight:600 } }, r.machine_name),
                  React.createElement('td', { style:td }, r.machine_no || '—'),
                  React.createElement('td', { style:td }, r.mtype),
                  React.createElement('td', { style:{ ...td, fontWeight:700, color:resultColor(r.result) } }, r.result),
                  React.createElement('td', { style:td }, r.worker || '—'),
                  React.createElement('td', { style:td }, r.note || '—'),
                  React.createElement('td', { style:td }, React.createElement('button', { onClick:()=>setDeleteTarget(r),
                    style:{ background:'none', border:'none', color:'#DC2626', cursor:'pointer', fontSize:13 } }, '削除')),
                ))))),
    ),

    deleteTarget && React.createElement(ConfirmDeleteModal, {
      title: '整備記録を削除しますか？',
      targetName: deleteTarget.date + '　' + deleteTarget.machine_name,
      onCancel: () => setDeleteTarget(null),
      onConfirm: () => { onDelete(deleteTarget.id); setDeleteTarget(null) }
    })
  )
}

// =====================================================
// 【出荷記録】ShipmentLogPage（収穫→ストック→出荷の分離。ストック残を自動計算）
// 紙日報「レタス出荷（出荷先・品目・収穫日・コンテナ数・ストック残）」に相当。
// 安全設計: 既存の収穫記録(harvestRecords)は無傷のまま。出荷は専用キー(farm_shipment_records)に
// 追記し、ストック残 = Σ収穫(品目別) − Σ出荷(品目別) を計算で表示する。既存集計に非依存。
// =====================================================
function ShipmentLogPage({ shipmentRecords, harvestRecords, fields, destinations, onSave, onDelete }) {
  const today = todayYmd()
  const varieties = [...new Set((harvestRecords || []).map(r => r.variety).filter(Boolean))]
  const destList = (destinations || []).map(d => d.label)

  // 品目別ストック残
  const harvBy = {}; (harvestRecords || []).forEach(r => { if (r.variety) harvBy[r.variety] = (harvBy[r.variety] || 0) + (Number(r.total_cases) || 0) })
  const shipBy = {}; (shipmentRecords || []).forEach(r => { if (r.variety) shipBy[r.variety] = (shipBy[r.variety] || 0) + (Number(r.cases) || 0) })
  const stockRows = [...new Set([...Object.keys(harvBy), ...Object.keys(shipBy)])]
    .map(v => ({ variety:v, harvested:harvBy[v] || 0, shipped:shipBy[v] || 0, stock:(harvBy[v] || 0) - (shipBy[v] || 0) }))
    .sort((a, b) => b.stock - a.stock)

  const blank = { date: today, variety: varieties[0] || '', harvest_date:'', lot_code:'', dest: destList[0] || '', cases:'', note:'' }
  const [form, setForm] = React.useState(blank)
  const [deleteTarget, setDeleteTarget] = React.useState(null)
  const up = (k, v) => setForm(f => ({ ...f, [k]: v }))
  // 選択中の品目の収穫ロット候補（新しい順）。実運用の出荷記録表は収穫ロット単位でトレースするため（GGAP トレーサビリティ）
  const fieldNameOf = (id) => { const f = masterById(fields, id); return f ? f.name : '' }
  const lotOptions = (harvestRecords || [])
    .filter(r => r.variety === form.variety && r.lot_code)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 30)
  // ロットを選んだら収穫日も自動で埋める（手入力の手間と転記ミスを減らす）
  const pickLot = (code) => {
    const rec = lotOptions.find(r => r.lot_code === code)
    setForm(f => ({ ...f, lot_code: code, harvest_date: (rec && rec.date) ? rec.date : f.harvest_date }))
  }
  const valid = form.variety && form.dest && Number(form.cases) > 0
  // 送信ID保持: 成功が確定するまで同じIDを使い回す(応答喪失→再送でも冪等で二重登録しない)
  const submitIdRef = React.useRef(null)
  const submit = async () => {
    if (!valid) { showToast('品目・出荷先・数量を入力してください', 'warn'); return }
    if (!submitIdRef.current) submitIdRef.current = newUuid()
    // 保存が失敗したら入力内容を残す。成功(ok===true)の時だけフォームを次の入力用に戻す
    const res = await Promise.resolve(onSave({ ...form, id: submitIdRef.current, cases: Number(form.cases), note: form.note.trim() })).catch(() => null)
    if (!(res && res.ok === true)) return
    submitIdRef.current = null
    setForm({ ...blank, variety: form.variety, dest: form.dest })
  }
  const rows = [...(shipmentRecords || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)))
  const th = { padding:'10px 12px', fontSize:12, fontWeight:700, color:'#6B7280', textAlign:'left', borderBottom:'2px solid #E5E7EB', whiteSpace:'nowrap' }
  const td = { padding:'10px 12px', fontSize:13, color:'#111827', borderBottom:'1px solid #F1F5F9' }

  return React.createElement('div', { className:'page' },
    React.createElement('div', { className:'eyebrow' }, 'SHIPMENT LOG'),
    React.createElement('div', { className:'page-title' }, '出荷記録 / ストック残'),
    React.createElement('div', { className:'page-sub' }, '収穫はそのまま、後日の出荷を記録します。ストック残（=収穫−出荷）は品目別に自動計算されます'),

    // ストック残サマリー
    React.createElement('div', { className:'card', style:{ marginBottom:'18px', padding:0, overflow:'hidden' } },
      React.createElement('div', { style:{ padding:'12px 16px', background:'#F0FDF4', borderBottom:'1px solid #E5E7EB', fontWeight:700, color:'#0A6B52', fontSize:14 } }, '📦 品目別ストック残'),
      stockRows.length === 0
        ? React.createElement('div', { style:{ padding:'28px', textAlign:'center', color:'#9CA3AF', fontSize:13 } }, '収穫記録がまだありません（先に「収穫・出荷」で収穫を記録してください）')
        : React.createElement('div', { style:{ overflowX:'auto' } },
            React.createElement('table', { style:{ width:'100%', borderCollapse:'collapse', minWidth:520 } },
              React.createElement('thead', null, React.createElement('tr', null,
                ...['品目','収穫計','出荷計','ストック残'].map((h,i)=>React.createElement('th', { key:i, style:{ ...th, textAlign: i===0?'left':'right' } }, h)))),
              React.createElement('tbody', null,
                ...stockRows.map(r => React.createElement('tr', { key:r.variety },
                  React.createElement('td', { style:{ ...td, fontWeight:600 } }, r.variety),
                  React.createElement('td', { style:{ ...td, textAlign:'right' } }, r.harvested.toLocaleString()),
                  React.createElement('td', { style:{ ...td, textAlign:'right' } }, r.shipped.toLocaleString()),
                  React.createElement('td', { style:{ ...td, textAlign:'right', fontWeight:700, color: r.stock < 0 ? '#DC2626' : '#0A6B52' } }, r.stock.toLocaleString()),
                ))))),
    ),

    // 出荷入力フォーム
    React.createElement('div', { className:'card', style:{ marginBottom:'18px' } },
      React.createElement(SectionTitle, { icon:'truck-delivery' }, '出荷を記録'),
      React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'14px' } },
        React.createElement('div', { className:'form-group' }, React.createElement('label', { className:'form-label' }, '出荷日'),
          React.createElement('input', { type:'date', className:'form-input', value:form.date, onChange:e=>up('date', e.target.value) })),
        React.createElement('div', { className:'form-group' }, React.createElement('label', { className:'form-label' }, '品目 *'),
          varieties.length > 0
            ? React.createElement('select', { className:'form-input', value:form.variety, onChange:e=>up('variety', e.target.value) }, ...varieties.map(v=>React.createElement('option', { key:v, value:v }, v)))
            : React.createElement('input', { type:'text', className:'form-input', value:form.variety, onChange:e=>up('variety', e.target.value), placeholder:'収穫記録が必要です' })),
        React.createElement('div', { className:'form-group' }, React.createElement('label', { className:'form-label' }, '収穫ロット（任意）'),
          lotOptions.length > 0
            ? React.createElement('select', { className:'form-input', value:form.lot_code, onChange:e=>pickLot(e.target.value) },
                React.createElement('option', { value:'' }, '— 指定しない —'),
                ...lotOptions.map(r=>React.createElement('option', { key:r.id, value:r.lot_code },
                  r.lot_code + '（' + r.date + (fieldNameOf(r.field_id) ? '・' + fieldNameOf(r.field_id) : '') + '）')))
            : React.createElement('input', { type:'text', className:'form-input', value:form.lot_code, onChange:e=>up('lot_code', e.target.value), placeholder:'例: (45)11120106' })),
      ),
      React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:'14px' } },
        React.createElement('div', { className:'form-group' }, React.createElement('label', { className:'form-label' }, '収穫日（任意）'),
          React.createElement('input', { type:'date', className:'form-input', value:form.harvest_date, onChange:e=>up('harvest_date', e.target.value) })),
        React.createElement('div', { className:'form-group', style:{ alignSelf:'end' } },
          React.createElement('div', { style:{ fontSize:'11px', color:'#94A3B8', paddingBottom:'10px' } },
            'ロットを選ぶと収穫日は自動で入ります。ロット単位の記録は回収（リコール）時のトレーサビリティに使えます')),
      ),
      React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr 2fr', gap:'14px' } },
        React.createElement('div', { className:'form-group' }, React.createElement('label', { className:'form-label' }, '出荷先 *'),
          destList.length > 0
            ? React.createElement('select', { className:'form-input', value:form.dest, onChange:e=>up('dest', e.target.value) }, ...destList.map(d=>React.createElement('option', { key:d, value:d }, d)))
            : React.createElement('input', { type:'text', className:'form-input', value:form.dest, onChange:e=>up('dest', e.target.value), placeholder:'出荷先' })),
        React.createElement('div', { className:'form-group' }, React.createElement('label', { className:'form-label' }, '数量（コンテナ/ケース） *'),
          React.createElement('input', { type:'number', className:'form-input', value:form.cases, onChange:e=>up('cases', e.target.value), placeholder:'0', min:0 })),
        React.createElement('div', { className:'form-group' }, React.createElement('label', { className:'form-label' }, '備考'),
          React.createElement('input', { type:'text', className:'form-input', value:form.note, onChange:e=>up('note', e.target.value), placeholder:'例: 朝出し / 直売分' })),
      ),
      React.createElement('button', { className:'btn btn-primary', onClick:submit, style:{ opacity: valid?1:.6 } }, '出荷を記録する')
    ),

    // 出荷一覧
    React.createElement('div', { className:'card', style:{ padding:0, overflow:'hidden' } },
      React.createElement('div', { style:{ padding:'12px 16px', borderBottom:'1px solid #E5E7EB', fontWeight:700, color:'#111827', fontSize:14 } }, '出荷履歴'),
      rows.length === 0
        ? React.createElement('div', { style:{ padding:'32px', textAlign:'center', color:'#9CA3AF', fontSize:13 } }, 'まだ出荷記録がありません')
        : React.createElement('div', { style:{ overflowX:'auto' } },
            React.createElement('table', { style:{ width:'100%', borderCollapse:'collapse', minWidth:640 } },
              React.createElement('thead', null, React.createElement('tr', null,
                ...['出荷日','品目','出荷先','数量','収穫ロット','収穫日','備考',''].map((h,i)=>React.createElement('th', { key:i, style:th }, h)))),
              React.createElement('tbody', null,
                ...rows.map(r => React.createElement('tr', { key:r.id },
                  React.createElement('td', { style:td }, r.date),
                  React.createElement('td', { style:{ ...td, fontWeight:600 } }, r.variety),
                  React.createElement('td', { style:td }, r.dest),
                  React.createElement('td', { style:{ ...td, textAlign:'right', fontWeight:700, color:'#0A6B52' } }, (Number(r.cases)||0).toLocaleString()),
                  React.createElement('td', { style:{ ...td, fontVariantNumeric:'tabular-nums' } }, r.lot_code || '—'),
                  React.createElement('td', { style:td }, r.harvest_date || '—'),
                  React.createElement('td', { style:td }, r.note || '—'),
                  React.createElement('td', { style:td }, React.createElement('button', { onClick:()=>setDeleteTarget(r),
                    style:{ background:'none', border:'none', color:'#DC2626', cursor:'pointer', fontSize:13 } }, '削除')),
                ))))),
    ),

    deleteTarget && React.createElement(ConfirmDeleteModal, {
      title: '出荷記録を削除しますか？',
      targetName: deleteTarget.date + '　' + deleteTarget.variety + '　' + deleteTarget.dest,
      onCancel: () => setDeleteTarget(null),
      onConfirm: () => { onDelete(deleteTarget.id); setDeleteTarget(null) }
    })
  )
}

// =====================================================
// A-3: App — useState ルーティング
// =====================================================

// LS-01: localStorage 永続化ヘルパー
// 【フェーズ2〜4】localStorageを直接触らず farmRepo（変換アダプタ/ルーター）経由にする。
// 呼び出し側(useFPS 26箇所)は無変更。localStorage経路は同期即読み＝挙動不変。
// Supabaseに切り替えたコレクションだけ、初期値で描き始め→非同期でDBから最新化＋リアルタイム購読。
function usePersistState(key, initial) {
  const [state, setState] = React.useState(() => {
    // 同期読み（localStorage）。DB経路は found:false で初期値スタート→下のeffectで最新化。
    const r = farmRepo.readSync ? farmRepo.readSync(key) : farmRepo.read(key)
    if (!r || !r.ok) {
      if (r && r.error) console.warn('[usePersistState] 読込失敗（初期値に復帰）:', key, r.error)
      return initial
    }
    return r.found ? r.value : initial
  })
  // 編集済みフラグ: 非同期の初期ロードが遅れて届いても、既にユーザーが編集していたら上書きしない。
  const dirtyRef = React.useRef(false)
  // リモート更新フラグ: subscribe経由で新しい値を受け取った後は、遅延した初期ロードで巻き戻さない。
  const remoteRef = React.useRef(false)
  // 初回読込完了フラグ: DB経路(非同期ソース)ではDBの現在値が届く前の編集を保留する。
  // 届く前に書くと「初期値ベースの内容」で差分deleteが走りDB側にしかない行が消えるため（読込前write事故防止）。
  // localStorage経路は同期読み済み(=常にloaded)なので従来挙動のまま。
  const loadedRef = React.useRef(!(farmRepo.isAsync && farmRepo.isAsync(key)))
  // 世代トークン(農場/キー切替ごと+1)と編集リビジョン(setPersistごと+1)。
  // 遅れて届いた保存失敗ロールバックが「新しい編集」や「切替後の別農場」を上書きしないための門番
  //（Codexレビュー8 High対応。useRecordCollectionのgenRefと同型）。
  const genRef = React.useRef(0)
  const editRevRef = React.useRef(0)
  const lastWarnRef = React.useRef(0)
  // 非同期ソース（Supabase）からの初期ロード。localStorageは同期で読めているので実質no-op。
  React.useEffect(() => {
    let alive = true
    genRef.current++ // 農場/キー切替=旧世代の遅延ロールバックを無効化
    editRevRef.current = 0
    lastWarnRef.current = 0
    dirtyRef.current = false // 別コレクション(key変更)に切り替わったら未編集から開始
    remoteRef.current = false // key変更時はリモート更新もリセット
    loadedRef.current = !(farmRepo.isAsync && farmRepo.isAsync(key)) // key変更時は読込状態も判定し直す
    Promise.resolve(farmRepo.readAsync ? farmRepo.readAsync(key) : null).then(r => {
      // alive必須: 農場切替後に旧農場の読込完了が届くと、新農場の読込前なのに編集ロックが解除され
      // 初期値ベースの差分deleteで新農場のDB行を消し得る（Codexレビュー High対応）
      if (alive && r && r.ok) loadedRef.current = true // 読込成功=以降の編集を許可（失敗時は保留のまま=オフライン等で書けない状況と一致）
      // 遅れて届いた古いDB値でユーザーの編集・リモート更新を潰さない（stale overwrite対策）
      if (alive && !dirtyRef.current && !remoteRef.current && r && r.ok && r.found) setState(r.value)
    }).catch(() => {})
    return () => { alive = false }
  }, [key])
  const setPersist = React.useCallback(updater => {
    // DB経路で初回読込が終わる前の編集は受け付けない（初期値ベースの全置換でDBを壊さない・数秒の話）
    if (!loadedRef.current) {
      try { showToast('データを読み込み中です。少し待ってからもう一度お試しください。', 'error') } catch (_) {}
      return
    }
    dirtyRef.current = true // この瞬間以降、初期ロードでの上書きを禁止
    const gen = genRef.current            // この編集が属する農場世代
    const rev = ++editRevRef.current      // この編集のリビジョン番号
    // DB経路の保存失敗時ロールバック: DBの権威状態を読み直して画面を一致させる
    //（楽観更新が画面に残ったまま「保存できたように見えて再読込で消える」のを防ぐ。Codexレビュー7 High対応）
    // 世代・リビジョンが進んでいたら適用しない=遅延ロールバックが新しい編集/別農場を上書きしない（レビュー8 High対応）
    const rollbackFromDb = () => {
      if (!(farmRepo.isAsync && farmRepo.isAsync(key))) return // localStorage経路は編集内容を画面に残す(容量整理後に再保存できる方が親切)
      Promise.resolve(farmRepo.readAsync(key)).then(r => {
        if (genRef.current !== gen || editRevRef.current !== rev) return // 切替済み/より新しい編集あり
        if (r && r.ok) setState((r.found && r.value !== undefined) ? r.value : initial)
      }).catch(() => {})
    }
    // 保存失敗の通知: DB経路は毎回通知(同一キー4秒debounce)=「変更だけ消えて説明が出ない」を防ぐ(レビュー8 Med対応)。
    // localStorage経路(容量警告)は従来どおり全体で1回。
    const notifyFail = () => {
      const dbPath = !!(farmRepo.isAsync && farmRepo.isAsync(key))
      if (dbPath) {
        const now = Date.now()
        if (now - lastWarnRef.current < 4000) return
        lastWarnRef.current = now
        try { showToast('サーバーへの保存に失敗しました。直前の変更は画面から取り消されています。通信状態を確認してもう一度お試しください。', 'error') } catch (_) {}
      } else if (typeof window !== 'undefined' && !window.__storageWarned) {
        window.__storageWarned = true
        try { showToast('データの保存に失敗しました。ブラウザの空き容量が不足している可能性があります。写真を減らすか不要なデータを整理してください。', 'error') } catch (_) {}
      }
    }
    setState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      // 楽観的更新: 画面は即反映。永続化は成否を受け取り、失敗時は見える化＋ロールバック。
      Promise.resolve(farmRepo.write(key, next)).then(w => {
        if (w && !w.ok) {
          console.warn('[usePersistState] 保存失敗:', key, w.error)
          rollbackFromDb()
          notifyFail()
        }
      }).catch(e => { console.warn('[usePersistState] 保存失敗:', key, e); rollbackFromDb(); notifyFail() })
      return next
    })
  }, [key])
  // 【同時利用の手戻り防止】別タブ(将来はSupabaseリアルタイム)が同じキーを更新したら自分のstateも追随。
  React.useEffect(() => {
    const unsubscribe = farmRepo.subscribe(key, (value, meta) => {
      remoteRef.current = true // 以降、遅延した初期ロードでこのリモート更新を上書きさせない
      loadedRef.current = true // リモート更新=DBの現在値が届いた＝編集を解禁してよい
      setState(meta && meta.found ? value : initial)
    })
    return unsubscribe
  }, [key])
  // 第3戻り値reload: DBの権威状態を明示的に読み直す(在庫RPC成功後のマスタ残高即時反映用。realtimeが保険)。
  // 世代・編集リビジョンの門番つき=遅延したreloadが新しい編集/別農場を上書きしない。
  const reload = React.useCallback(async () => {
    const gen = genRef.current
    const rev = editRevRef.current
    const r = await Promise.resolve(farmRepo.readAsync(key)).catch(() => null)
    if (genRef.current !== gen || editRevRef.current !== rev) return
    if (r && r.ok) setState((r.found && r.value !== undefined) ? r.value : initial)
  }, [key])
  return [state, setPersist, reload]
}

// 【記録系専用】1行単位CRUDのコレクションフック（設計書: 中川農園_記録系CRUD移行設計.html）
// usePersistStateとの違い: 保存は配列まるごとではなく create/remove/update の「意図」を1行ずつ明示。
// 楽観的更新＋失敗時ロールバック。祝福表示は呼び出し側が add の結果を await してから行うこと。
// リアルタイムはINSERT/UPDATE/DELETEをID単位で適用（全件再読込しない＝編集中UIを壊さない）。
function useRecordCollection(collection, farmId, initial) {
  const key = collection + '_' + farmId
  const [list, setList] = React.useState(() => {
    const r = farmRepo.readSync(key)
    return (r.ok && r.found && Array.isArray(r.value)) ? r.value : (initial || [])
  })
  const listRef = React.useRef(list)
  React.useEffect(() => { listRef.current = list }, [list])
  const loadedRef = React.useRef(!(farmRepo.isAsync && farmRepo.isAsync(key)))
  // 世代トークン: 農場切替(key変更)ごとに+1。旧農場向けの非同期結果(初期読込/CRUD/リアルタイム)は
  // 世代が違ったら一切stateへ作用させない（Codexレビュー4 High1対応）。
  const genRef = React.useRef(0)
  React.useEffect(() => {
    const gen = ++genRef.current
    loadedRef.current = !(farmRepo.isAsync && farmRepo.isAsync(key))
    // 農場切替の瞬間に前農場の一覧を必ずリセット（DB経路は空から読込・localStorageは同期読み）
    const rs = farmRepo.readSync(key)
    setList((rs.ok && rs.found && Array.isArray(rs.value)) ? rs.value : (initial || []))
    // Realtime受信フラグ: 受信後は「それより前に開始した初期読込」で巻き戻さない（High2対応・remoteRef同型）
    let gotRows = false
    Promise.resolve(farmRepo.readAsync ? farmRepo.readAsync(key) : null).then(r => {
      if (genRef.current !== gen || !r || !r.ok) return
      loadedRef.current = true
      if (gotRows) return
      // found:false(新農場のDBが0件)でも必ず置換する＝前農場の表示を残さない（High1対応）
      setList((r.found && Array.isArray(r.value)) ? r.value : [])
    }).catch(() => {})
    const unsub = farmRepo.subscribeRows ? farmRepo.subscribeRows(collection, farmId, (evt) => {
      if (genRef.current !== gen) return
      gotRows = true
      loadedRef.current = true
      setList(prev => {
        if (evt.type === 'replace') return Array.isArray(evt.list) ? evt.list : prev
        if (evt.type === 'DELETE') return prev.filter(x => String(x.id) !== String(evt.id))
        if (evt.type === 'INSERT') return prev.some(x => String(x.id) === String(evt.record.id)) ? prev : prev.concat([evt.record])
        if (evt.type === 'UPDATE') return prev.map(x => String(x.id) === String(evt.record.id) ? evt.record : x)
        return prev
      })
    }) : function () {}
    return () => { unsub() }
  }, [key])
  const reload = React.useCallback(async () => {
    const r = await Promise.resolve(farmRepo.readAsync(key)).catch(() => null)
    if (r && r.ok && r.found && Array.isArray(r.value)) setList(r.value)
  }, [key])
  const notLoaded = () => { try { showToast('データを読み込み中です。少し待ってからもう一度お試しください。', 'error') } catch (_) {} ; return { ok: false } }
  const conflictRecover = () => { try { showToast('別の端末で更新されています。最新の状態を読み込みました。', 'warn') } catch (_) {} ; reload() }
  const add = React.useCallback(async (record) => {
    if (!loadedRef.current) return notLoaded()
    const gen = genRef.current // この操作が属する農場世代（切替後は結果を新農場に作用させない）
    const rec = Object.assign({}, record)
    if (rec.id == null) rec.id = newUuid()
    const prevRec = listRef.current.find(x => String(x.id) === String(rec.id)) // 既存IDなら更新前レコード(部分成功→再送で来る)
    const existed = !!prevRec
    setList(prev => existed ? prev.map(x => String(x.id) === String(rec.id) ? rec : x) : prev.concat([rec])) // 楽観的更新(ID単位upsert=重複追加しない)
    const res = await Promise.resolve(farmRepo.create(collection, farmId, rec)).catch(e => ({ ok: false, error: e }))
    if (!res || !res.ok) {
      // ロールバック: 新規は削除・既存は更新前へ復元(既存を置換したまま失敗すると画面だけ未保存内容になる)
      if (genRef.current === gen) setList(prev => existed ? prev.map(x => String(x.id) === String(rec.id) ? prevRec : x) : prev.filter(x => String(x.id) !== String(rec.id)))
      console.warn('[useRecordCollection] 追加失敗:', collection, res && res.error)
      try { showToast('保存に失敗しました。通信状態を確認してもう一度お試しください。', 'error') } catch (_) {}
    }
    return res || { ok: false }
  }, [collection, farmId])
  const updateById = React.useCallback(async (id, patch) => {
    if (!loadedRef.current) return notLoaded()
    const gen = genRef.current
    const cur = listRef.current.find(x => String(x.id) === String(id))
    if (!cur) return { ok: false }
    const expected = cur.version || 1
    setList(prev => prev.map(x => String(x.id) === String(id) ? Object.assign({}, x, patch, { version: expected + 1 }) : x))
    const res = await Promise.resolve(farmRepo.update(collection, farmId, id, patch, expected)).catch(e => ({ ok: false, error: e }))
    if (!res || !res.ok) {
      if (res && res.conflict) { if (genRef.current === gen) conflictRecover() }
      else {
        if (genRef.current === gen) setList(prev => prev.map(x => String(x.id) === String(id) ? cur : x)) // ロールバック
        try { showToast('保存に失敗しました。通信状態を確認してもう一度お試しください。', 'error') } catch (_) {}
      }
    }
    return res || { ok: false }
  }, [collection, farmId])
  const removeById = React.useCallback(async (id) => {
    if (!loadedRef.current) return notLoaded()
    const gen = genRef.current
    const cur = listRef.current.find(x => String(x.id) === String(id))
    if (!cur) return { ok: true }
    setList(prev => prev.filter(x => String(x.id) !== String(id)))
    const res = await Promise.resolve(farmRepo.remove(collection, farmId, id, cur.version || 1)).catch(e => ({ ok: false, error: e }))
    if (!res || !res.ok) {
      if (res && res.conflict) { if (genRef.current === gen) conflictRecover() }
      else {
        if (genRef.current === gen) setList(prev => prev.some(x => String(x.id) === String(id)) ? prev : prev.concat([cur])) // ロールバック(復元)
        try { showToast('削除に失敗しました。通信状態を確認してもう一度お試しください。', 'error') } catch (_) {}
      }
    }
    return res || { ok: false }
  }, [collection, farmId])
  // ── 在庫連動記録(RPC経由)。routed=DBならRPC(記録+通帳+残高が1トランザクション)、
  //    localStorage経路なら通常create/remove(在庫調整は呼び出し側=app.jsの従来ロジックが担当) ──
  const addWithStock = React.useCallback(async (record, movements) => {
    if (!loadedRef.current) return notLoaded()
    const gen = genRef.current
    const rec = Object.assign({}, record)
    if (rec.id == null) rec.id = newUuid()
    if (rec.version == null) rec.version = 1
    const prevRec = listRef.current.find(x => String(x.id) === String(rec.id)) // 既存IDなら更新前レコード(部分成功→再送で来る)
    const existed = !!prevRec
    setList(prev => existed ? prev.map(x => String(x.id) === String(rec.id) ? rec : x) : prev.concat([rec])) // 楽観的更新(ID単位upsert=重複追加しない)
    const res = await Promise.resolve(farmRepo.createWithStock(collection, farmId, rec, movements)).catch(e => ({ ok: false, error: e }))
    if (!res || !res.ok) {
      // ロールバック: 新規は削除・既存は更新前へ復元(既存を置換したまま失敗すると画面だけ未保存内容になる)
      if (genRef.current === gen) setList(prev => existed ? prev.map(x => String(x.id) === String(rec.id) ? prevRec : x) : prev.filter(x => String(x.id) !== String(rec.id)))
      console.warn('[useRecordCollection] 追加失敗(在庫連動):', collection, res && res.error)
      try { showToast('保存に失敗しました: ' + ((res && res.error && res.error.message) || '通信状態を確認してください'), 'error') } catch (_) {}
    }
    return res || { ok: false }
  }, [collection, farmId])
  const removeWithStock = React.useCallback(async (id) => {
    if (!loadedRef.current) return notLoaded()
    const gen = genRef.current
    const cur = listRef.current.find(x => String(x.id) === String(id))
    if (!cur) return { ok: true }
    setList(prev => prev.filter(x => String(x.id) !== String(id)))
    const res = await Promise.resolve(farmRepo.removeWithStock(collection, farmId, id, cur.version || 1)).catch(e => ({ ok: false, error: e }))
    if (!res || !res.ok) {
      if (res && res.conflict) { if (genRef.current === gen) conflictRecover() }
      else {
        if (genRef.current === gen) setList(prev => prev.some(x => String(x.id) === String(id)) ? prev : prev.concat([cur]))
        try { showToast('削除に失敗しました。通信状態を確認してもう一度お試しください。', 'error') } catch (_) {}
      }
    }
    return res || { ok: false }
  }, [collection, farmId])
  // 在庫連動記録の編集: 逆仕訳RPC(farm_update_record_with_stock)で旧movementsを戻し新movementsを適用。
  // version楽観ロック(0件更新=競合→再読込促し)。失敗時は旧値へロールバック。
  const updateWithStock = React.useCallback(async (record, movements) => {
    if (!loadedRef.current) return notLoaded()
    const gen = genRef.current
    const old = listRef.current.find(x => String(x.id) === String(record.id))
    const expectedVersion = (old && old.version) || record.version || 1
    const next = Object.assign({}, record, { version: expectedVersion + 1 })
    setList(prev => prev.map(x => String(x.id) === String(record.id) ? next : x)) // 楽観的更新
    const res = await Promise.resolve(farmRepo.updateWithStock(collection, farmId, record, movements, expectedVersion)).catch(e => ({ ok: false, error: e }))
    if (!res || !res.ok) {
      if (res && res.conflict) { if (genRef.current === gen) conflictRecover() }
      else {
        if (genRef.current === gen && old) setList(prev => prev.map(x => String(x.id) === String(record.id) ? old : x)) // ロールバック
        try { showToast('更新に失敗しました。通信状態を確認してもう一度お試しください。', 'error') } catch (_) {}
      }
    }
    return res || { ok: false }
  }, [collection, farmId])
  // 仕入れ登録(履歴+在庫を1トランザクション): farm_add_purchase_with_stock RPC。purchase.idが冪等キー。
  // 楽観追加はID単位upsert(再送で重複追加しない)・失敗時は新規追加分のみロールバック。
  const addPurchase = React.useCallback(async (purchase) => {
    if (!loadedRef.current) return notLoaded()
    const gen = genRef.current
    const rec = Object.assign({}, purchase)
    if (rec.id == null) rec.id = newUuid()
    const prevRec = listRef.current.find(x => String(x.id) === String(rec.id)) // 既存IDなら更新前(異内容再送で来る)
    const existed = !!prevRec
    setList(prev => existed ? prev.map(x => String(x.id) === String(rec.id) ? rec : x) : prev.concat([rec])) // 楽観的更新(ID単位upsert)
    const res = await Promise.resolve(farmRepo.addPurchaseWithStock(collection, farmId, rec)).catch(e => ({ ok: false, error: e }))
    if (!res || !res.ok) {
      // ロールバック: 新規は削除・既存は更新前へ復元(異内容再送がRPCで拒否された時に画面だけ書き換わらない)
      if (genRef.current === gen) setList(prev => existed ? prev.map(x => String(x.id) === String(rec.id) ? prevRec : x) : prev.filter(x => String(x.id) !== String(rec.id)))
      try { showToast('仕入れの登録に失敗しました: ' + ((res && res.error && res.error.message) || '通信状態を確認してください'), 'error') } catch (_) {}
    }
    return res || { ok: false }
  }, [collection, farmId])
  return { list, add, updateById, removeById, reload, addWithStock, updateWithStock, removeWithStock, addPurchase }
}

