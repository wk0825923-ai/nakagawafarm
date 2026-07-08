// =====================================================
// A-2: モックデータ定義
// Supabase移行時はここだけ置き換える
// =====================================================
// 【20圃場対応】農場名さんの実圃場数（20）に合わせて拡張。
// id5〜20は面積・座標・ステータスがまだ未確定のプレースホルダー。
// 実データ（畝数・面積・座標）が届いたら値を差し替える。
const INITIAL_FIELDS = []

// =====================================================
// 【サンプル農園実データ統合 フェーズ6・Step B】crop_category の正式導入
// ─────────────────────────────────────────────────────
// 旧実装は「field.crop === 'とうもろこし'」のような作物名の文字列比較で
// とうもろこし／水稲を判定していた（畝マップ表示切替・水稲ステージ表示など）。
// 今後 field.crop に新しい作物名（例: 大豆・玉ねぎ等）が増えるたびに
// 判定箇所を一つずつ洗い直す必要があり、保守性が低い。
//
// そこで「表示用の作物名（field.crop）」と「システムが分岐に使うカテゴリ
// （field.crop_category）」を分離する。INITIAL_FIELDS本体の各要素は
// 変更せず（既存ロジックを壊さない方針）、生成直後に1回だけ
// crop_category を自動付与するマッピングを通す。
//
//   crop_category: 'leaf_veg' | 'corn' | 'rice'
//   - 'corn'    : とうもろこし（畝マップ表示・トンネル等の専用項目あり）
//   - 'rice'    : 水稲（畝マップなし・生育ステージタイムライン表示）
//   - 'leaf_veg': それ以外（レタス・ターサイ等、従来通り畝マップ表示）
//
// ── 作物カテゴリマスタ（汎用化済み）──
// ui_mode: 'row_map'=畝マップ管理 | 'growth_stage'=生育ステージ | 'standard'=シンプル
// =====================================================
// base_temp_c=生育起算の基準温度(℃), required_gdd=定植/は種〜収穫までの必要積算温度(℃・日)。
// 収穫予測(積算温度モデル)で使用。値は目安の初期値で、作物カテゴリ管理からいつでも上書き可能。
// 一度設定すれば永続化され、以降の収穫予測は各ロットで自動計算される（追加入力不要）。
const INITIAL_CROP_CATEGORIES = [
  { key:'leaf_veg', name:'葉物野菜',     ui_mode:'row_map',      harvest_grades:['規格内','B品'],             color:'#0D9972', sort_order:0, base_temp_c:4,  required_gdd:900  },
  { key:'corn',     name:'とうもろこし', ui_mode:'row_map',      harvest_grades:['2L','L','M','S','B品'],     color:'#EA580C', sort_order:1, base_temp_c:10, required_gdd:850  },
  { key:'rice',     name:'水稲',         ui_mode:'growth_stage', harvest_grades:['一等米','二等米','くず米'],  color:'#2563EB', sort_order:2, base_temp_c:10, required_gdd:1000 },
  { key:'other',    name:'その他',       ui_mode:'standard',     harvest_grades:['規格内','B品'],             color:'#6B7280', sort_order:9, base_temp_c:null, required_gdd:null },
]

// ── 月別平均気温の初期値（℃）: 収穫予測の簡易版で使う平年値。中信〜長野の内陸目安。
// 「収穫予測」ページで1回だけ設定すれば永続化され、以降は各ロットの収穫予測が自動算出される。
// 将来的に気象庁アメダスの実測値へ差し替え予定（簡易版→自動化）。index0=1月 … index11=12月。
const INITIAL_MONTHLY_TEMPS = [1, 2, 6, 12, 17, 21, 25, 26, 21, 15, 9, 3]

// モジュールレベル参照 — Appが毎レンダー同期するのでグローバル関数が常に最新カテゴリを参照できる
let _CROP_CATEGORIES = INITIAL_CROP_CATEGORIES

const getCropCategoryObj = (key) =>
  _CROP_CATEGORIES.find(c => c.key === key) || _CROP_CATEGORIES[0] || INITIAL_CROP_CATEGORIES[0]

// 作物名 → categoryキー（後方互換: 既存コードがcrop名でlookupしている箇所対応）
const getCropCategory = (cropName) => {
  if (!cropName) return _CROP_CATEGORIES[0]?.key || 'leaf_veg'
  const exact = _CROP_CATEGORIES.find(c => c.name === cropName)
  return exact ? exact.key : (_CROP_CATEGORIES[0]?.key || 'leaf_veg')
}

INITIAL_FIELDS.forEach(f => {
  if (!f.crop_category) f.crop_category = getCropCategory(f.crop)
})

// =====================================================
// 【収穫予測 / 積算温度モデル】computeHarvestForecast
// 起算日(定植日 or は種日)から、月別平均気温(monthlyTemps)を使って日々の
// 有効積算温度 = Σ max(0, その日の平均気温 − 基準温度) を足し込み、
// 必要積算温度(requiredGdd)に到達した日を「予測収穫日」とする簡易モデル。
// 起算日〜今日 までの積算(currentGdd)と進捗率も返す。
// ・monthlyTemps: 長さ12（index0=1月 … index11=12月）の平均気温配列
// ・しきい値未設定(baseTemp/requiredGdd が null)の場合は null を返す（予測不可）
// ・到達しない場合(最長730日)は predictedDate=null（気温不足）
// =====================================================
function computeHarvestForecast(startDateStr, monthlyTemps, baseTemp, requiredGdd, today) {
  if (!startDateStr || baseTemp == null || requiredGdd == null || !(requiredGdd > 0)) return null
  if (!Array.isArray(monthlyTemps) || monthlyTemps.length !== 12) return null
  const start = new Date(startDateStr)
  if (isNaN(start)) return null
  const ref = today ? new Date(today) : new Date()
  ref.setHours(0, 0, 0, 0)

  let cumulative = 0
  let currentGdd = 0
  let predicted = null
  const cursor = new Date(start)
  cursor.setHours(0, 0, 0, 0)
  for (let i = 0; i < 730; i++) {
    const t = Number(monthlyTemps[cursor.getMonth()])
    const dayGdd = Math.max(0, (isNaN(t) ? 0 : t) - baseTemp)
    cumulative += dayGdd
    if (cursor <= ref) currentGdd = cumulative
    if (predicted == null && cumulative >= requiredGdd) {
      predicted = new Date(cursor)
      if (cursor > ref) break   // 予測日が未来なら currentGdd は確定済み
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  const progressPct   = Math.min(100, Math.round(currentGdd / requiredGdd * 100))
  const daysToHarvest = predicted ? Math.round((predicted - ref) / 86400000) : null
  return { predictedDate: predicted, currentGdd: Math.round(currentGdd), requiredGdd, progressPct, daysToHarvest }
}

// =====================================================
// 【サンプル農園実データ統合 フェーズ2・Step2-1】圃場まとめ系シート 実データ参照テーブル
// ─────────────────────────────────────────────────────
// 受領した5シートから「圃場番号 → 畝本数(row_count)」を解析した結果。
//   レタス: 「レタス圃場情報まとめ」(2024-2025) / 「R7レタス圃場情報まとめ(2)」(2025-2026) / 「レタス圃場情報まとめ」(2025-2026最終版)
//   とうもろこし: 「スイートコーン圃場まとめ」(2025) / 「スイートコーン圃場まとめ」(2026)
//
// 【重要】実際の圃場番号（49,25,42n,3n,2001 等）は、現在のINITIAL_FIELDSのid/name
// （第4圃場〜第20圃場という連番の仮名称）とは対応していない（圃場番号の表記ゆれ問題＝G5/確認事項3）。
// 圃場の再構築（LOTSの実データ化・圃場番号の正規化）はフェーズ2のStep2-2の作業範囲のため、
// 今回のStep2-1では「既存のINITIAL_FIELDSに実在する第49・第25・第42n圃場」のrow_countの照合のみ反映し、
// それ以外の実圃場番号については下記参照テーブルとして記録するのみに留める
// （月曜の打ち合わせで圃場番号の正式なルールを確認してからStep2-2で本反映する）。
// 条（W/E）の情報は畝マップの設計方針どおり今回は使用しない。
// =====================================================
const REAL_FIELD_LAYOUT_REFERENCE = {}


// =====================================================
// 【サンプル農園実データ統合 フェーズ2・Step2-2】圃場番号の表記ゆれ正規化テーブル
// ─────────────────────────────────────────────────────
// 「管理表」シートに現れる圃場番号の表記バリエーションを正規化キーにマッピングする。
// 月曜の打ち合わせで担当者に「これが正式ルールか」を確認する前提で、
// 今回は実データから読み取れる表記パターンをすべて一覧化した。
//
// 正規化ルール（仮・要確認）:
//   - アルファベットは大文字統一（3s→3S, 3n→3N）
//   - 「～」や「・」で結合されたロット番号（2001～2002）はそれぞれ独立して扱う
//   - ハウス表記（2000(ハウス東)など）はカッコを除去してハウスフラグで区別
// =====================================================
const FIELD_NO_NORMALIZE = {}

// =====================================================
// 【実装手順書 Step0】圃場番号 表記ゆれ正規化 ― 検索・表示・登録用ヘルパー
// ─────────────────────────────────────────────────────
// 目的: FIELD_NO_NORMALIZE（紙日報からわかっている表記ゆれ）を、デバッグパネル
// だけでなく実際の入力フォーム・一覧表示でも使えるようにする。
// 見た目（圃場名の表示）は今までと変えず、検索・登録のみ拡張する方針。
//
// 手動登録分（オペレーターが「この表記はこの圃場です」と登録したもの）は
// localStorage に保存し、ページをまたいでも消えないようにする。
// プロップで毎回バケツリレーしなくて済むよう、シンプルな購読の仕組みにしている。
// =====================================================
const FIELD_NO_OVERRIDE_KEY = 'farm_field_no_overrides_v1'
const _fieldNoOverrideListeners = new Set()
// 上書きマップは fieldId を指すため、農場をまたいで共有すると法人の農場間で
// 圃場番号が誤マッチする。他の記録と同じく農場IDでスコープする。
function _fieldNoOverrideKey() {
  const fid = (typeof CONFIG !== 'undefined' && CONFIG.CURRENT_FARM_ID) ? CONFIG.CURRENT_FARM_ID : ''
  return fid ? FIELD_NO_OVERRIDE_KEY + '_' + fid : FIELD_NO_OVERRIDE_KEY
}
function _readFieldNoOverrides() {
  try {
    const raw = localStorage.getItem(_fieldNoOverrideKey())
    if (raw != null) return JSON.parse(raw)
    // 旧・農場非スコープキーからの読み取りフォールバック（既存の登録を失わない。書込は必ずスコープ側へ）
    const legacy = localStorage.getItem(FIELD_NO_OVERRIDE_KEY)
    return legacy ? JSON.parse(legacy) : {}
  } catch { return {} }
}
function _writeFieldNoOverrides(next) {
  // 保存失敗(多くは容量超過)を黙って握り潰すと登録が消えたのに気づけない。usePersistStateと同様に可視化。
  try { localStorage.setItem(_fieldNoOverrideKey(), JSON.stringify(next)) }
  catch (e) { try { if (typeof showToast === 'function') showToast('圃場番号の登録を保存できませんでした（ブラウザの空き容量不足の可能性）。', 'error') } catch (_) {} }
  _fieldNoOverrideListeners.forEach(fn => fn(next))
}
// 圃場選択UIから呼び出す共通フック。登録すると同じページを開いている他のUIにも即反映される。
function useFieldNoOverrides() {
  const [overrides, setOverridesState] = React.useState(_readFieldNoOverrides)
  React.useEffect(() => {
    const listener = (next) => setOverridesState(next)
    _fieldNoOverrideListeners.add(listener)
    return () => _fieldNoOverrideListeners.delete(listener)
  }, [])
  const registerOverride = React.useCallback((raw, fieldId) => {
    const key = (raw || '').trim()
    if (!key) return
    _writeFieldNoOverrides({ ..._readFieldNoOverrides(), [key]: fieldId })
  }, [])
  return [overrides, registerOverride]
}

// ある圃場(field)に紐づく「元表記（紙日報での書かれ方）」をすべて集める
// （FIELD_NO_NORMALIZEの定義分 ＋ 手動登録分）
function getFieldRawLabels(field, overrides) {
  const raws = new Set()
  if (field.field_no) raws.add(field.field_no)
  Object.entries(FIELD_NO_NORMALIZE).forEach(([raw, v]) => {
    if (v.canonical === field.field_no) raws.add(raw)
  })
  if (overrides) {
    Object.entries(overrides).forEach(([raw, fid]) => {
      if (Number(fid) === field.id) raws.add(raw)
    })
  }
  return [...raws]
}

// 圃場名・正式番号・元表記のいずれかにマッチするか（検索用）
function fieldMatchesQuery(field, query, overrides) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return true
  if (field.name && field.name.toLowerCase().includes(q)) return true
  if (field.field_no && field.field_no.toLowerCase().includes(q)) return true
  return getFieldRawLabels(field, overrides).some(r => r.toLowerCase().includes(q))
}

// 入力された表記が「既存の圃場にも正規化テーブルにも一致しない＝未登録」かどうか
function isUnregisteredFieldQuery(fields, query, overrides) {
  const q = (query || '').trim()
  if (!q) return false
  const inFields     = fields.some(f => f.field_no === q || f.name === q)
  const inNormalize  = Object.prototype.hasOwnProperty.call(FIELD_NO_NORMALIZE, q)
  const inOverrides  = overrides && Object.prototype.hasOwnProperty.call(overrides, q)
  return !inFields && !inNormalize && !inOverrides
}

// =====================================================
// 【実装手順書 Step0】圃場選択コンボボックス（表記ゆれ対応）
// ─────────────────────────────────────────────────────
// 見た目は通常のプルダウンと同じだが、クリックすると検索欄が開き、
// 圃場名だけでなく「9s」「3n」のような紙日報の元表記でも検索できる。
// 検索語がどの圃場にも一致しない場合は、控えめな黄色バッジで
// 「未登録の表記です」と知らせ、その場でどの圃場の表記かを選んで登録できる。
// =====================================================
function FieldSearchSelect({ fields, value, onChange, placeholder }) {
  const [overrides, registerOverride] = useFieldNoOverrides()
  const selectedField = fields.find(f => String(f.id) === String(value))
  const [open, setOpen]     = React.useState(false)
  const [query, setQuery]   = React.useState('')
  const [registerTarget, setRegisterTarget] = React.useState('')
  const wrapRef = React.useRef(null)

  React.useEffect(() => {
    const onClickOutside = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filtered     = fields.filter(f => fieldMatchesQuery(f, query, overrides))
  const unregistered = isUnregisteredFieldQuery(fields, query, overrides)

  const boxStyle = {
    background:'#FFFFFF', border:'1.5px solid #D8E4D8',
    borderRadius:'7px', padding:'7px 10px', fontSize:'13px',
    color:'#111827', outline:'none', width:'100%', boxSizing:'border-box'
  }

  return React.createElement('div', { ref: wrapRef, style:{ position:'relative' } },
    // 表示部分（既存の<select>と見た目を揃える）
    React.createElement('div', {
      onClick: () => setOpen(o => !o),
      style:{ ...boxStyle, display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer' }
    },
      React.createElement('span', { style:{ color: selectedField ? '#111827' : '#94A3B8' } },
        selectedField
          ? selectedField.name + (selectedField.field_no ? `（${selectedField.field_no}）` : '')
          : (placeholder || '圃場を選択')
      ),
      React.createElement('i', { className:'ti ti-chevron-down', 'aria-hidden':'true', style:{ fontSize:'13px', color:'#94A3B8' } })
    ),
    open && React.createElement('div', {
      style:{
        position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:60,
        background:'#FFFFFF', border:'1px solid #DDE8DE', borderRadius:'8px',
        boxShadow:'0 8px 24px rgba(17,24,39,.14)', padding:'8px',
        display:'flex', flexDirection:'column', gap:'6px'
      }
    },
      React.createElement('input', {
        autoFocus: true,
        value: query,
        onChange: e => setQuery(e.target.value),
        placeholder: '圃場名・番号・元表記（例: 9s, 3n）で検索',
        style:{ ...boxStyle, padding:'6px 8px' }
      }),
      React.createElement('div', { style:{ overflowY:'auto', maxHeight:'200px' } },
        filtered.length === 0
          ? React.createElement('div', { style:{ fontSize:'12px', color:'#94A3B8', padding:'8px 4px' } }, '該当する圃場がありません')
          : filtered.map(f => {
              const raws = getFieldRawLabels(f, overrides).filter(r => r !== f.field_no)
              const isSelected = String(f.id) === String(value)
              return React.createElement('div', {
                key: f.id,
                onClick: () => { onChange(String(f.id)); setOpen(false); setQuery('') },
                style:{
                  display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px',
                  padding:'7px 8px', borderRadius:'6px', cursor:'pointer', fontSize:'13px',
                  background: isSelected ? '#F0F8F4' : 'transparent'
                }
              },
                React.createElement('span', { style:{ color:'#111827', fontWeight: isSelected ? 600 : 500 } },
                  f.name + (f.field_no ? `（${f.field_no}）` : '')
                ),
                raws.length > 0 && React.createElement('span', { style:{ fontSize:'10px', color:'#94A3B8', flexShrink:0 } },
                  '元表記: ' + raws.join('/')
                )
              )
            })
      ),
      // 未登録の表記に対する控えめな警告 + その場で登録できるミニUI
      unregistered && React.createElement('div', {
        style:{ borderTop:'1px solid #F0F4F0', paddingTop:'6px', marginTop:'2px' }
      },
        React.createElement('div', {
          style:{
            display:'flex', alignItems:'center', gap:'6px', fontSize:'11px',
            color:'#92400E', background:'#FFFBEB', border:'1px solid #FDE68A',
            borderRadius:'6px', padding:'6px 8px'
          }
        },
          React.createElement('span', null, '⚠️'),
          React.createElement('span', null, `「${query}」は未登録の表記です`)
        ),
        React.createElement('div', { style:{ display:'flex', gap:'6px', marginTop:'6px' } },
          React.createElement('select', {
            value: registerTarget,
            onChange: e => setRegisterTarget(e.target.value),
            style:{ ...boxStyle, padding:'5px 6px', fontSize:'12px', flex:1 }
          },
            React.createElement('option', { value:'' }, 'どの圃場の表記？'),
            fields.map(f => React.createElement('option', { key:f.id, value:f.id },
              f.name + (f.field_no ? `（${f.field_no}）` : '')
            ))
          ),
          React.createElement('button', {
            type: 'button',
            disabled: !registerTarget,
            onClick: () => { registerOverride(query, Number(registerTarget)); setRegisterTarget('') },
            style:{
              fontSize:'11px', fontWeight:600, padding:'5px 10px', borderRadius:'6px',
              border:'none', cursor: registerTarget ? 'pointer' : 'not-allowed',
              background: registerTarget ? '#0A6B52' : '#E5E7EB',
              color:      registerTarget ? '#FFFFFF' : '#9CA3AF'
            }
          }, '登録')
        )
      )
    )
  )
}

// =====================================================
// 【サンプル農園実データ統合 フェーズ2・Step2-2】LOTSを実データの作付け記録に置き換え
// ─────────────────────────────────────────────────────
// 「管理表」シート（とうもろこし・レタス両方）の
// 圃場番号・畝番号・品種・播種日・定植日・収穫開始/終了日からLOTSを再構築。
//
// 【方針】
//   ・既存フィールド（id/row_range/variety/seed_date等）はそのまま保持
//   ・新規フィールドとして field_no_raw（元表記）・season（年度）・crop_type を追加
//   ・とうもろこし圃場: 2025シーズン（3S/3N/12/4/2001W/2002E/2000H/25/37）
//                       2026シーズン（3N/3/12/4/2001W/2002E/2000H/25/37/2）を追加
//   ・レタス圃場: 既存データ（field_id 1/2/3 = 圃場番号49/25/42N）は継続使用
//   ・施肥情報・農薬情報は同一行に同居するため、
//     fertilizer_refs / pesticide_refs フィールドで参照IDを保持（Step3・4の元データ）
//
// 【圃場ID割当ルール（仮）】
//   field_id 1-3: レタス圃場（49/25/42N）- 既存のまま
//   field_id 4-20: 仮の連番圃場 - Step2-2以降で実圃場番号に紐付ける予定
//   とうもろこし実圃場のfield_idは月曜確認後に正式割当予定のため、
//   今回はcorn_3S=101, corn_3N=102, corn_12=103, corn_4=104,
//   corn_2001W=105, corn_2002E=106, corn_2000H=107, corn_25=108, corn_37=109, corn_2=110
//   という仮IDで管理し、確認後にINITIAL_FIELDSの実データと結合する。
// =====================================================

// =====================================================
// 【実装手順書 3.2.2】作物別管理項目の柔軟な対応
// ─────────────────────────────────────────────────────
// 作物（crop）ごとに異なる特有の管理項目（例: とうもろこしの
// 「トンネル解体日」「パスライト回収日」など、レタス等には無い項目）を、
// 圃場(field)単位のデータとして記録・表示するための仕組み。
//
// ・CROP_SPECIFIC_FIELD_DEFS: 作物名 → 入力項目定義の配列。
//   新しい作物の特有項目を増やしたい場合は、このオブジェクトに
//   エントリを追加するだけで、入力フォーム・表示画面の両方に
//   自動的に反映される（個別のUIコードの追加は不要）。
// ・各圃場(field)は crop_specific_details オブジェクトに
//   { 項目key: 値 } の形で実データを保持する（INITIAL_FIELDS参照）。
// =====================================================
const CROP_SPECIFIC_FIELD_DEFS = {
  'とうもろこし': [
    { key:'tunnel_set_date',       label:'トンネル設置日',     type:'date' },
    { key:'tunnel_removed_date',   label:'トンネル解体日',     type:'date' },
    { key:'passlite_set_date',     label:'パスライト設置日',   type:'date' },
    { key:'passlite_removed_date', label:'パスライト回収日',   type:'date' },
    { key:'harvest_start_date',    label:'収穫開始日',         type:'date' },
    { key:'harvest_end_date',      label:'収穫終了日',         type:'date' },
  ],
  // 他の作物に特有の管理項目が出てきた場合も、同じ形式でここに追記するだけで対応できる。
  // 例: 'レタス': [ { key:'mulch_removed_date', label:'マルチ除去日', type:'date' } ],
}

// 【フェーズE / Step2-2】圃場 → ロット（畝範囲）の2階層管理用データ
// ロット = 同じ品種・播種日で植えられた畝範囲が管理の基本単位
// ステータス: growing(栽培中) = 緑 / ready(収穫待ち) = 金 / harvested(収穫済) = 青 / fallow(休耕) = グレー
const ROW_STATUS_CONFIG = {
  growing:   { label:'栽培中',   color:'#0D9972', bg:'#ECFDF5' },
  ready:     { label:'収穫待ち', color:'#B45309', bg:'#FFFBEB' },
  harvested: { label:'収穫済',   color:'#1D4ED8', bg:'#EFF6FF' },
  fallow:    { label:'休耕',     color:'#6B7280', bg:'#F8FAFC' },
}
const LOTS = {}
const INITIAL_PESTICIDES = []

// =====================================================
// 【フェーズE・E-3-3／E-4 Step4】ロット単位の農薬散布記録（LOT_SPRAY_RECORDS）
// records（日報）とは別に、畝範囲（row_range）・複数薬剤・散布液量を持つ専用データとして保持する。
// E-0の方針: records テーブルとの厳密な紐付けは行わず、field_id 単位の独立データとする。
// 在庫連動は既存pesticidesマスタのpesticide_idで紐付け、adjustStockロジックを流用する。
// 【実装手順書 3.1.1】薬剤散布記録における廃棄量管理
//   pesticides 配列の各要素に disposal_amount（廃棄量・L）を追加。
//   薬剤ごとに廃棄量を記録できるようにし、栽培プロセス管理の要件
//   （廃棄量まで詳細に記録する独立した薬剤散布記録）に対応する。
// =====================================================
const INITIAL_LOT_SPRAY_RECORDS = []

// =====================================================
// 【サンプル農園実データ統合 フェーズ5・Step5-1】出荷先マスタの一元化
// 「サンプル農園収穫集計表」の列構成（朝採りJA／取引先A／取引先A（午後）／取引先B／
// 取引先C／直売／B品袋詰め）をSHIPMENT_DESTINATIONSとして一元管理する。
// 各出荷先は規格別に「本数」「コンテナ数」の両方を記録できる想定（収穫集計表の列構造に対応）。
// 畝マップ実装時のStep7「命名の一元化」と同じ考え方で、出荷先名の表記揺れを防ぐ。
// 【注記】規格（グレード）自体は作物ごとに異なるため、規格リストはStep5-3で別途対応する。
// 【実装手順書 Step2】このリストは初期値（デフォルト出荷先）として使う。
// 実際の出荷先マスタはApp側でusePersistStateにより状態化し、後から
// 追加・編集（名称変更）・削除できるようにする（ShipmentDestinationManageModal）。
// frequent: true の出荷先は、収穫記録フォームの新規入力時にデフォルトで行を表示する
// 「よく使う出荷先」。frequent: false は「+ 出荷先を追加」で必要な時だけ追加する。
// =====================================================
const SHIPMENT_DESTINATIONS = [
  { key:'ja_morning',         label:'朝採りJA',       frequent:true  },
  { key:'dealer_a',            label:'取引先A',           frequent:true  },
  { key:'dealer_a_afternoon',  label:'取引先A（午後）',    frequent:false },
  { key:'dealer_b',              label:'取引先B',       frequent:true  },
  { key:'dealer_c',          label:'取引先C',         frequent:true  },
  { key:'direct',             label:'直売',           frequent:false },
  { key:'b_grade_bag',        label:'B品袋詰め',      frequent:true  },
]
// 各出荷先で記録する単位（規格別に本数・コンテナ数の両方を持てる）
const SHIPMENT_UNIT_TYPES = [
  { key:'count_pcs',       label:'本数' },
  { key:'container_count', label:'コンテナ数' },
]

// =====================================================
// 【サンプル農園実データ統合 フェーズ5・Step5-3】作物別 収穫規格マスタ
// 規格（グレード）は作物ごとに表記が異なるため、field.cropをキーに切り替える。
// （例: とうもろこし=2L/L/M、レタス=玉数規格など）
// 月曜確認後、正式な規格マスタとして確定する想定の仮データ。
// =====================================================
// getHarvestGrades は _CROP_CATEGORIES を動的参照するのでカテゴリ編集が即反映
const getHarvestGrades = (crop) => {
  if (!crop) return ['規格内', 'B品']
  // まず作物名でカテゴリを検索、次にキーで検索
  const cat = _CROP_CATEGORIES.find(c => c.name === crop) || _CROP_CATEGORIES.find(c => c.key === crop)
  return cat ? cat.harvest_grades : (_CROP_CATEGORIES[0]?.harvest_grades || ['規格内', 'B品'])
}

// =====================================================
// 【フェーズE・E-3-4／E-4 Step5】収穫記録（HARVEST_RECORDS）── 新規定数
// ロット単位・出荷先別ケース数を記録する。records（日報）とは独立したデータとして保持。
// 出荷先×サイズの組み合わせが多い（20列以上）ため、shipmentsを動的配列で保持する。
// =====================================================
const INITIAL_HARVEST_RECORDS = []

// =====================================================
// 【フェーズE・E-3-5／E-4 Step6】圃場実績・評価（FIELD_PERFORMANCE）── 新規定数
// 年度別・圃場別の合計ケース数・反収（10aあたりケース数）・前年比を
// 全圃場横断（圃場詳細ページの外）で一覧するためのデータ。
// 【注記】field_id:1（第49圃場）はヒアリング資料に記載された実データ値
//   （area_are/total_cases/cases_per_are/prev_season_cases）をそのまま使用。
//   field_id:2,3（第25・第42n圃場）は実データの管理表が未着のため、
//   面積・畝数のみLOTSと整合させた上でのサンプル値（is_estimated:true）。
//   実データ入手後はtotal_cases等を差し替えること。
// =====================================================
const INITIAL_FIELD_PERFORMANCE = []

// 年度ごとの評価コメント（自由記述）── ヒアリング資料に記載の実データ（原文ママ、以下略部分は省略表記）
const INITIAL_FIELD_PERFORMANCE_COMMENTS = []

// ── 農薬在庫管理データ（Step①: 新規追加） ──
// pesticide_stock: INITIAL_PESTICIDESのstock_Lを初期値として同期させる
// Supabase移行時は pesticide_stock テーブルに置き換える
const INITIAL_PESTICIDE_STOCK = INITIAL_PESTICIDES.map(p => ({
  pesticide_id:        p.id,
  stock_L:             p.stock_L,
  alert_threshold_L:   p.alert_threshold_L,
}))

// pesticide_purchases: 購入履歴のモックデータ（実データが届いたら差し替え）
const INITIAL_PESTICIDE_PURCHASES = []

// =====================================================
// 【サンプル農園実データ統合 フェーズ3・Step3-2〜3-3】肥料マスタ・肥料在庫・肥料仕入れ
// 既存のpesticides系データ構造とは完全に独立させる（混在させない）。
// 「肥料在庫管理台帳（サンプル農園）」「2025年肥料在庫表 サンプル農園」（xlsx原本）を実データとして投入。
//   - name / weight_per_bag_kg ＝ 肥料在庫管理台帳の「肥料名」「容量」
//   - stock_kg（初期在庫）＝ 2025年肥料在庫表の最新の「在庫数」行（2026/1月末時点）
//
// 【Step3-3】単位の整理 & 価格マスタ実データ反映
//   ■ 単位ルール（仮・月曜確認事項）
//     農薬: 「希釈倍率×散布液量(L)」で原液消費量を計算 → 単位 L
//     肥料: 「袋数」「kg」の両方の表記が実データに混在するため、
//           月曜の確認まで「kg単位に統一」という仮ルールで実装する。
//           weight_per_bag_kg を持つことで、袋⇔kg の変換は常に可能な状態にしておく。
//     ⚠️ 月曜確認: 袋管理にするか kg管理にするか → UNIT_NOTE フラグを参照
//   ■ 価格マスタ（レタス管理表_2025-2026 > 「肥料.農薬マスタ」シート）の実データを反映
//     price_per_bag_yen / unit_price_yen_per_kg:
//       苦土重焼燐１号  ¥2,972 / 20kg / ¥148.6/kg
//       苦土石灰(粒状)  ¥430   / 20kg / ¥21.5/kg
//       ジシアン555     ¥2,713 / 20kg / ¥135.65/kg
//       SUPER BIO-X(SBX) ¥0   / 12kg / ¥0/kg（価格未記入）
//     価格マスタに名称が見つからないものは null のまま（月曜確認事項として残す）
//   - エコレット〜BOSOペレットの4品目は在庫管理台帳に記載が無く容量未確定のため
//     weight_per_bag_kgは20kg仮置き（要確認）
// =====================================================

// 単位管理方針フラグ（Step3-3 仮ルール）
// unit: 'kg'（固定）。袋数入力された場合は weight_per_bag_kg で換算する。
// confirmed: false = 月曜に担当者へ確認が必要
const FERTILIZER_UNIT_POLICY = {
  unit: 'kg',
  confirmed: false,  // ⚠️ 月曜確認: 袋管理か kg管理か
  note: '在庫台帳は「袋数」「kg」が混在。月曜確認まで kg単位に統一して運用。weight_per_bag_kg で袋⇔kg変換可能。',
}

const INITIAL_FERTILIZERS = [].map(f => ({ default_dilution: null, crop_dilutions: {}, ...f }))

// 肥料の希釈倍率を、肥料マスタの設定（基本倍率 or 作物別の上書き）から取得するヘルパー。
// 農薬と違い法定の固定値ではないため、ここで返す値は「目安」であり、入力画面側で編集可能にする。
function getSuggestedFertilizerDilution(fertilizer, cropName) {
  if (!fertilizer) return null
  const crop = (cropName || '').trim()
  if (crop && fertilizer.crop_dilutions && fertilizer.crop_dilutions[crop] != null) {
    return fertilizer.crop_dilutions[crop]
  }
  return fertilizer.default_dilution ?? null
}

// fertilizer_stock: INITIAL_FERTILIZERSのstock_kgを初期値として同期させる（pesticide_stockと同パターン）
const INITIAL_FERTILIZER_STOCK = INITIAL_FERTILIZERS.map(f => ({
  fertilizer_id:       f.id,
  stock_kg:            f.stock_kg,
  alert_threshold_kg:  f.alert_threshold_kg,
}))

// fertilizer_purchases: 仕入れ履歴。実データの「2025年肥料在庫表」は日次の入庫(+)・出庫(-)の
// 増減ログ形式のため、仕入れ＝入庫があった日を抽出して購入履歴として投入（仕入れ先・金額は未記載のため空欄）。
const INITIAL_FERTILIZER_PURCHASES = []

// top_dressing_records: 追肥記録のモックデータ（「サンプル農園追肥」シート列構成に準拠した仮データ）
// pesticidesのdilution（希釈倍率）入力に加え、amount_kg（散布量kg直接入力）にも対応する点が
// 既存のlotSprayRecordsとの違い（フェーズ4-2 在庫連動ロジックで両対応する）
const INITIAL_TOP_DRESSING_RECORDS = []

// =====================================================
// 【実装手順書 3.1.2】在庫管理の5段階チェック構造の導入
// 農薬・肥料の在庫管理を「前回数→使用量→残予定数→今回数→差」の
// 5段階チェック構造で月次運用できるようにするためのデータ構造一式。
// =====================================================

// ── Step1: 肥料の在庫管理用データ構造（新規定義） ──
// 「肥料の袋写し」マスタ: 肥料袋に記載された正式名称・メーカー・規格を
// 参照情報として保持する。肥料名入力時のサジェスト・名称バリデーションに使用。
const INITIAL_FERTILIZER_BAG_MASTER = []

// 【メモ】肥料マスタ（INITIAL_FERTILIZERS）・肥料在庫（INITIAL_FERTILIZER_STOCK）・
// 仕入れ履歴（INITIAL_FERTILIZER_PURCHASES）は、上部の
// 「サンプル農園実データ統合 フェーズ1・Step1-1」ブロックで定義済み（kg単位の仮ルールに統一）。
// ここでは official_name を袋写しマスタと紐付けるための参照情報のみ残す。

// ── Step4: 月次棚卸しシート（5段階チェック構造）の履歴データ ──
// 「前回数→使用量→残予定数→今回数→差」の5項目を月単位でスナップショットとして保存する。
// 農薬・肥料はそれぞれ別配列で管理し、pesticide_id / fertilizer_id で対象資材と紐付ける。
const INITIAL_PESTICIDE_MONTHLY_CHECKS = []
const INITIAL_FERTILIZER_MONTHLY_CHECKS = []

// 【フェーズ2】作物ごとの使用可能農薬・希釈倍率を自動セットするためのマップ
// 作物を選択した時点で、使用できる農薬とその倍率はシステム側で自動セットされる
// （育てる作物ごとに法律・マニュアルで決まっているため、現場での倍率入力は不要）
const CROP_PESTICIDE_MAP = {
  'レタス':      [{ pesticide_id:1, dilution:1000 }, { pesticide_id:3, dilution:1500 }, { pesticide_id:4, dilution:2000 }, { pesticide_id:5, dilution:2000 }],
  'とうもろこし': [{ pesticide_id:2, dilution:2000 }, { pesticide_id:6, dilution:2000 }, { pesticide_id:7, dilution:1 }],
  '水稲':        [{ pesticide_id:8, dilution:1 }, { pesticide_id:9, dilution:1000 }],
  'ターサイ':    [{ pesticide_id:1, dilution:1000 }],
}
const INITIAL_STAFF = []
const INITIAL_RECORDS = []
// GLOBALG.A.P. Ver6(2024) FV-Smart 標準の実チェックリスト（中川農園のGGAP資料 簡易版より）。
// 190管理点/33原則群。level: major(上位=Major Must) / minor(下位=Minor Must) / rec(推奨)。
// auto: システムに記録があれば自動達成(isGapAutoCleared)。doc: 対応する必要書類のヒント。
// ※ McD(マクドナルド)Addendumは別スキームで後日追加。合否は最終的に審査機関の判断。
const INITIAL_GAP_CHECKS = [
  // -- 内部文書化 --
  { id:1, code:"01.01", category:"内部文書化", item:"文書と記録を管理およびコントロールするための手順がある。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"01_文書管理の規定" },
  { id:2, code:"01.02", category:"内部文書化", item:"審査対象の記録は現状を反映して更新している。記録は、さらに長い期間が要求される場合を除き、最低2年間保管している。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"01_文書管理の規定" },
  { id:3, code:"01.03", category:"内部文書化", item:"生産者は、本規格に対して、毎年最低1回の自己評価/内部監査を実施している。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"01_文書管理の規定" },
  { id:4, code:"01.04", category:"内部文書化", item:"自己評価/内部監査で検出された不順守に対処するために、有効な是正処置をとっている。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"01_文書管理の規定" },
  // -- 継続的改善計画 --
  { id:5, code:"02.01", category:"継続的改善計画", item:"継続的改善計画を文書化している。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"02_継続的改善計画" },
  { id:6, code:"02.02", category:"継続的改善計画", item:"継続的改善計画を実施している証拠がある。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"02_継続的改善計画" },
  // -- リソース管理及びトレーニング --
  { id:7, code:"03.01", category:"リソース管理及びトレーニング", item:"規格の実施に影響を与える職務担当者の役割と責任を定めている。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"03_作業別一覧/リスク評価" },
  { id:8, code:"03.02", category:"リソース管理及びトレーニング", item:"使用する資材に関する技術的な意思決定の責任者は、その力量を実証することができる。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"03_作業別一覧/リスク評価" },
  { id:9, code:"03.03", category:"リソース管理及びトレーニング", item:"働く人の教育訓練は、必要なスキルと力量を含んでおり、記録によって裏付けている。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"03_作業別一覧/リスク評価" },
  { id:10, code:"03.04", category:"リソース管理及びトレーニング", item:"すべての教育訓練活動が記録されている。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"03_作業別一覧/リスク評価" },
  // -- アウトソーシング活動（外部委託業者） --
  { id:11, code:"04.01", category:"アウトソーシング活動（外部委託業者）", item:"生産者は、外部委託した活動が、提供されるサービスに関連する本規格の原則及び基準に適合していることを確実にしている。", level:"major", schemes:["GGAP"], is_cleared:false },
  // -- 仕様書、供給業者、在庫管理 --
  { id:12, code:"05.01", category:"仕様書、供給業者、在庫管理", item:"食品安全に関連する資材とサービスの仕様書が閲覧可能である。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"05_在庫表/供給業者仕様書" },
  { id:13, code:"05.02", category:"仕様書、供給業者、在庫管理", item:"サイトの在庫を管理するために、在庫表を作成している。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"05_在庫表/供給業者仕様書" },
  // -- トレーサビリティー --
  { id:14, code:"06.01", category:"トレーサビリティー", item:"すべてのGLOBALG.A.P.登録生産物は、生産された（および該当する場合、取り扱われた）登録農場まで追跡可能である。", level:"major", schemes:["GGAP"], is_cleared:false, auto:"traceability" },
  // -- 並行所有、トレーサビリティー、分離 --
  { id:15, code:"07.01", category:"並行所有、トレーサビリティー、分離", item:"GLOBALG.A.P.認証プロセスを通じたすべての生産物を識別し、非認証プロセスを通じた生産物と分別するための有効なシステムがある。", level:"major", schemes:["GGAP"], is_cleared:false },
  { id:16, code:"07.02", category:"並行所有、トレーサビリティー、分離", item:"並行所有を登録している場合、GLOBALG.A.P.ナンバー（GGN）を、認証生産プロセスを通じたすべての最終生産物に表示する。", level:"major", schemes:["GGAP"], is_cleared:false },
  { id:17, code:"07.03", category:"並行所有、トレーサビリティー、分離", item:"認証生産プロセスと非認証生産プロセスを通じた生産物の正しい出荷を確実にするための最終確認を行っている。", level:"major", schemes:["GGAP"], is_cleared:false },
  { id:18, code:"07.04", category:"並行所有、トレーサビリティー、分離", item:"異なる仕入先から購入した生産物を識別している。", level:"major", schemes:["GGAP"], is_cleared:false },
  // -- マスバランス --
  { id:19, code:"08.01", category:"マスバランス", item:"すべての登録生産物の販売数量についての記録が閲覧可能である。", level:"major", schemes:["GGAP"], is_cleared:false, auto:"shipment_record" },
  { id:20, code:"08.02", category:"マスバランス", item:"すべての生産物について、数量（生産、在庫、及び/又は 購入）を記録し、まとめている。", level:"major", schemes:["GGAP"], is_cleared:false, auto:"shipment_record" },
  // -- リコールと撤回 --
  { id:21, code:"09.01", category:"リコールと撤回", item:"市場からの生産物のリコール及び撤収を管理するために文書化した手順があり、その手順を毎年テストしている。", level:"major", schemes:["GGAP"], is_cleared:false },
  // -- 苦情 --
  { id:22, code:"10.01", category:"苦情", item:"規格の対象となる内部及び外部の問題に関連する苦情処理手順を閲覧でき、運用している。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"10_申し立ての仕組み" },
  { id:23, code:"10.02", category:"苦情", item:"働く人は規格に関する自らの権利について知らされており、また、働く人が報復を恐れることなく内密に懸念を申し立てることができる苦情処理のしくみを利用でき、実施している。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"10_申し立ての仕組み" },
  // -- 不適合生産物 --
  { id:24, code:"11.01", category:"不適合生産物", item:"不適合品を管理し、取り扱うための手順がある。", level:"major", schemes:["GGAP"], is_cleared:false },
  // -- 試験所検査 --
  { id:25, code:"12.01", category:"試験所検査", item:"検査機関による検査は、業界の要求事項と整合した方法で実施している。", level:"minor", schemes:["GGAP"], is_cleared:false },
  // -- 機械および装置 --
  { id:26, code:"13.01", category:"機械および装置", item:"機器、用具、および装置は目的に適ったもので、メンテナンスされている。", level:"major", schemes:["GGAP"], is_cleared:false, auto:"machine_maint" },
  { id:27, code:"13.02", category:"機械および装置", item:"生産物を汚染しない方法で機器を保管している。", level:"major", schemes:["GGAP"], is_cleared:false, auto:"machine_maint" },
  { id:28, code:"13.03", category:"機械および装置", item:"収穫物の積み込み、輸送、保管に使用する車両と機器は、用途に適しており、清掃し、メンテナンスされている。", level:"major", schemes:["GGAP"], is_cleared:false, auto:"machine_maint" },
  // -- 食品安全方針 --
  { id:29, code:"14.01", category:"食品安全方針", item:"生産者は、食品安全方針宣言を記入し、署名している。", level:"major", schemes:["GGAP"], is_cleared:false },
  // -- フードディフェンス --
  { id:30, code:"15.01", category:"フードディフェンス", item:"悪意のある攻撃や汚染に関連するリスクに対処するため、フードディフェンスのしくみがある。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"15_フードディフェンス評価" },
  // -- 食品偽装 --
  { id:31, code:"16.01", category:"食品偽装", item:"食品偽装に関連するリスクに対処するしくみがある。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"16_食品偽装評価" },
  // -- ロゴの使用 --
  { id:32, code:"17.01", category:"ロゴの使用", item:"GLOBALG.A.P.の文言、商標、QRコードとロゴ、GLOBALG.A.P.ナンバー（GGN）は、「GLOBALG.A.P.商標の使用：方針と指針」に従って使用している。", level:"major", schemes:["GGAP"], is_cleared:false },
  // -- GLOBALG.A.P.状況 --
  { id:33, code:"18.01", category:"GLOBALG.A.P.状況", item:"取引文書に、GLOBALG.A.P.認証ステータス及びGLOBALG.A.P.ナンバー（GGN）を記載している。", level:"major", schemes:["GGAP"], is_cleared:false },
  // -- 衛生 --
  { id:34, code:"19.01", category:"衛生", item:"農場には、文書化された衛生リスク評価がある。", level:"major", schemes:["GGAP"], is_cleared:false },
  { id:35, code:"19.02", category:"衛生", item:"食品安全リスクを最小限に抑えるために、文書化された衛生手順を実施している。", level:"major", schemes:["GGAP"], is_cleared:false },
  { id:36, code:"19.03", category:"衛生", item:"農場で働くすべての人が衛生教育を受けている。", level:"major", schemes:["GGAP"], is_cleared:false },
  { id:37, code:"19.04", category:"衛生", item:"喫煙、飲食（ガムを噛むことを含む）は指定された場所に限定されている。", level:"major", schemes:["GGAP"], is_cleared:false },
  { id:38, code:"19.05", category:"衛生", item:"働く人、来訪者、下請け業者のために、作業現場付近で清潔なトイレを提供している。", level:"major", schemes:["GGAP"], is_cleared:false },
  { id:39, code:"19.06", category:"衛生", item:"生産物に直接触れるすべての働く人、来訪者、下請け業者のために手洗い設備が利用可能である。", level:"major", schemes:["GGAP"], is_cleared:false },
  { id:40, code:"19.07", category:"衛生", item:"生産物汚染につながる可能性のある動物の活動を管理している。", level:"minor", schemes:["GGAP"], is_cleared:false },
  { id:41, code:"19.08", category:"衛生", item:"生産と収穫に使用する容器は洗浄され、メンテナンスされ、使用に適した状態である。", level:"major", schemes:["GGAP"], is_cleared:false },
  // -- 労働者の健康、安全、および福祉 --
  { id:42, code:"20.01.01", category:"労働者の健康、安全、および福祉", item:"働く人の健康と安全に関する文書化されたリスク評価がある。", level:"major", schemes:["GGAP"], is_cleared:false },
  { id:43, code:"20.01.02", category:"労働者の健康、安全、および福祉", item:"農場には健康と安全の手順がある。（文書とは明記されていない）", level:"major", schemes:["GGAP"], is_cleared:false },
  { id:44, code:"20.01.03", category:"労働者の健康、安全、および福祉", item:"P: リスク評価に基づき、すべての担当者が健康と安全に関する教育訓練を受けている。", level:"major", schemes:["GGAP"], is_cleared:false },
  { id:45, code:"20.02.01", category:"労働者の健康、安全、および福祉", item:"事故・緊急時の手順を掲示し、周知している。", level:"major", schemes:["GGAP"], is_cleared:false },
  { id:46, code:"20.02.02", category:"労働者の健康、安全、および福祉", item:"働く人の健康と安全に有害な物質に関する安全アドバイスがすぐに閲覧でき、利用可能である。", level:"minor", schemes:["GGAP"], is_cleared:false },
  { id:47, code:"20.02.03", category:"労働者の健康、安全、および福祉", item:"作業現場近くのすべての常設の施設と 圃場において、救急箱が利用できる。", level:"minor", schemes:["GGAP"], is_cleared:false },
  { id:48, code:"20.02.04", category:"労働者の健康、安全、および福祉", item:"農場での活動が行われているときは、応急処置の訓練を受けた者が少なくとも1名、農場に常駐している。", level:"minor", schemes:["GGAP"], is_cleared:false },
  { id:49, code:"20.03.01", category:"労働者の健康、安全、および福祉", item:"働く人、来訪者、下請け業者は適切な個人用保護具（PPE）を装備している。", level:"major", schemes:["GGAP"], is_cleared:false },
  { id:50, code:"20.03.02", category:"労働者の健康、安全、および福祉", item:"個人用保護具（PPE）は、身の回り品に汚染リスクを与えないように、清潔な状態を維持し、適切に保管している。", level:"major", schemes:["GGAP"], is_cleared:false },
  { id:51, code:"20.03.03", category:"労働者の健康、安全、および福祉", item:"提供された個人用保護具（PPE）を働く人が使用していることを示す証拠がある。", level:"minor", schemes:["GGAP"], is_cleared:false },
  { id:52, code:"20.03.04", category:"労働者の健康、安全、および福祉", item:"必要に応じて適切な更衣室が利用可能である。", level:"minor", schemes:["GGAP"], is_cleared:false },
  { id:53, code:"20.04.01", category:"労働者の健康、安全、および福祉", item:"働く人の健康、安全、福祉に関する問題について、管理者と働く人の間でコミュニケーションが取れている。", level:"minor", schemes:["GGAP"], is_cleared:false },
  { id:54, code:"20.04.02", category:"労働者の健康、安全、および福祉", item:"働く人は清潔な飲料水、食品置場、食事と休憩をする場所を利用できる。", level:"major", schemes:["GGAP"], is_cleared:false },
  { id:55, code:"20.04.03", category:"労働者の健康、安全、および福祉", item:"農場内住居は、該当する法的規制に適合しており、居住に適し、基本的なサービスと設備を備えている。", level:"major", schemes:["GGAP"], is_cleared:false },
  { id:56, code:"20.04.04", category:"労働者の健康、安全、および福祉", item:"働く人に提供している移動手段は作業者の健康と安全に関する一般的な規制に従い安全である。", level:"minor", schemes:["GGAP"], is_cleared:false },
  // -- 現場管理 --
  { id:57, code:"21.01", category:"現場管理", item:"登録されたすべてのサイトについて、文書化されたリスク評価が完了している。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"21_圃場カルテ" },
  { id:58, code:"21.02", category:"現場管理", item:"管理計画に、運用の適切性に関するリスク評価で特定したリスクを最小限に抑える戦略を定めており、その計画を策定・実行し、定期的に見直している。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"21_圃場カルテ" },
  { id:59, code:"21.03", category:"現場管理", item:"生産に使用するサイトと設備を識別する仕組みがある。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"21_圃場カルテ" },
  { id:60, code:"21.04", category:"現場管理", item:"サイトは整理整頓されている。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"21_圃場カルテ" },
  { id:61, code:"21.05", category:"現場管理", item:"生産者は、農場を周囲の景観と影響しあう農業生態系の一部として認識している（ただし、生産者の法的責任は農場内にとどまる）。", level:"rec", schemes:["GGAP"], is_cleared:false, doc:"21_圃場カルテ" },
  { id:62, code:"21.06", category:"現場管理", item:"アレルゲンを取扱う、又は保管する場合、その作業についての文書化されたアレルゲン管理プログラムがある。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"21_圃場カルテ" },
  // -- 生物多様性と生息地 --
  { id:63, code:"22.01.01", category:"生物多様性と生息地", item:"生物多様性の保護と強化を可能にするよう管理している。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"22_生物多様性の保護と増進" },
  { id:64, code:"22.01.02", category:"生物多様性と生息地", item:"生物多様性を保護している。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"22_生物多様性の保護と増進" },
  { id:65, code:"22.01.03", category:"生物多様性と生息地", item:"生物多様性を強化している。", level:"rec", schemes:["GGAP"], is_cleared:false, doc:"22_生物多様性の保護と増進" },
  { id:66, code:"22.02.01", category:"生物多様性と生息地", item:"耕作不適地は、生物多様性を保護・強化するための生態学的重点地域として利用している", level:"rec", schemes:["GGAP"], is_cleared:false, doc:"22_生物多様性の保護と増進" },
  { id:67, code:"22.03.01", category:"生物多様性と生息地", item:"農場内（農場敷地内）において、2014年1月1日以降、法的に保護価値が認められた（又は他の手段で有効に保護された）地域を、農地又は他の用途に転換していない。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"22_生物多様性の保護と増進" },
  { id:68, code:"22.03.02", category:"生物多様性と生息地", item:"農場内（農場敷地内）において、2008年1月1日から2014年1月1日の間に、農地又は他の用途に転換された法的に保護価値が認められた（又は他の手段による実質的に保護された）地域を、すでに復元済み、復元途上、又は拘束力のある復元を予定している。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"22_生物多様性の保護と増進" },
  { id:69, code:"22.03.03", category:"生物多様性と生息地", item:"生物多様性の管理は測定指標で裏付けられている。", level:"rec", schemes:["GGAP"], is_cleared:false, doc:"22_生物多様性の保護と増進" },
  // -- エネルギー効率 --
  { id:70, code:"23.01", category:"エネルギー効率", item:"農場でのエネルギー使用量をモニタリングしている。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"23_エネルギーモニタリング" },
  { id:71, code:"23.02", category:"エネルギー効率", item:"モニタリングの結果に基づき、農場のエネルギー効率改善計画がある。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"23_エネルギーモニタリング" },
  { id:72, code:"23.03", category:"エネルギー効率", item:"エネルギー効率改善計画は、非再生可能エネルギーの使用量を最小限にすることを考慮している。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"23_エネルギーモニタリング" },
  { id:73, code:"23.04", category:"エネルギー効率", item:"エネルギーの管理は測定指標で裏付けられている。", level:"rec", schemes:["GGAP"], is_cleared:false, doc:"23_エネルギーモニタリング" },
  // -- 温室効果ガスと気候変動 --
  { id:74, code:"24.01", category:"温室効果ガスと気候変動", item:"農場はGHG*排出量の削減と大気からの吸収に貢献している。 *温室効果ガス（GHG）排出量とは、二酸化炭素（CO₂）、メタン（CH₄）、亜酸化窒素（N₂O）、フッ素系ガスなどを指す。地球温暖化への影響がそれぞれ異なるため、CO₂ 相当量（CO₂e）として算出されることもある。", level:"rec", schemes:["GGAP"], is_cleared:false },
  { id:75, code:"24.02", category:"温室効果ガスと気候変動", item:"農場では、土壌とバイオマス中の有機炭素の形成を促進している。", level:"rec", schemes:["GGAP"], is_cleared:false },
  { id:76, code:"24.03", category:"温室効果ガスと気候変動", item:"大気中の温室効果ガス（GHG）の削減と吸収に対する農場の貢献は測定指標で裏付けられている。", level:"rec", schemes:["GGAP"], is_cleared:false },
  // -- 廃棄物管理 --
  { id:77, code:"25.01", category:"廃棄物管理", item:"廃棄物管理の仕組みを実施している。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"25_廃棄物管理プラン", auto:"waste_record" },
  { id:78, code:"25.02", category:"廃棄物管理", item:"農場全域において、廃棄物や汚染源を特定している。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"25_廃棄物管理プラン" },
  { id:79, code:"25.03", category:"廃棄物管理", item:"すべてのフォークリフト及びその他の自走式運搬車両は、清潔で手入れが行き届き、排気ガスによる汚染を回避するのに適切な種類のものである。", level:"rec", schemes:["GGAP"], is_cleared:false, doc:"25_廃棄物管理プラン" },
  { id:80, code:"25.04", category:"廃棄物管理", item:"軽油やその他の燃料油タンクの貯蔵区域は環境に配慮され安全である。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"25_廃棄物管理プラン" },
  { id:81, code:"25.05", category:"廃棄物管理", item:"有機廃棄物は、環境汚染のリスクを低減するために適切な方法で管理している。", level:"rec", schemes:["GGAP"], is_cleared:false, doc:"25_廃棄物管理プラン" },
  { id:82, code:"25.06", category:"廃棄物管理", item:"洗浄と清掃に使用した水は、環境、健康、および安全への影響を最小限に抑える方法で処分している。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"25_廃棄物管理プラン" },
  { id:83, code:"25.07", category:"廃棄物管理", item:"包装資材の破片や小片、その他の生産物以外の廃棄物は、圃場から除去している", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"25_廃棄物管理プラン" },
  { id:84, code:"25.08", category:"廃棄物管理", item:"プラスチックは責任ある方法で管理している。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"25_廃棄物管理プラン" },
  { id:85, code:"25.09", category:"廃棄物管理", item:"食品廃棄物*の発生を防止・管理している。 *食品廃棄物：人による消費、動物の飼料、又はバイオベース資材として利用しない食品。", level:"rec", schemes:["GGAP"], is_cleared:false, doc:"25_廃棄物管理プラン" },
  // -- 種苗 --
  { id:86, code:"26.01", category:"種苗", item:"該当する場合、種苗は、品種登録に関する法令に適合したものを入手している。", level:"major", schemes:["GGAP"], is_cleared:false },
  { id:87, code:"26.02", category:"種苗", item:"種苗は知的財産に関する法令に適合したものを入手している。", level:"major", schemes:["GGAP"], is_cleared:false },
  { id:88, code:"26.03", category:"種苗", item:"農場内で育苗・増殖した種苗について、植物の健康をコントロールする仕組みを運用し、記録している。", level:"minor", schemes:["GGAP"], is_cleared:false },
  { id:89, code:"26.04", category:"種苗", item:"農場内で育苗・増殖した種苗に施用した全ての化学処理に関する最新の記録が利用可能である。", level:"major", schemes:["GGAP"], is_cleared:false },
  { id:90, code:"26.05", category:"種苗", item:"購入した種苗の化学処理に関する情報が利用可能である。", level:"major", schemes:["GGAP"], is_cleared:false },
  // -- 遺伝子組み換え生物 --
  { id:91, code:"27.01", category:"遺伝子組み換え生物", item:"遺伝子組換え（GM）資材の使用と取扱いに関する手順が利用可能である。", level:"minor", schemes:["GGAP"], is_cleared:false },
  { id:92, code:"27.02", category:"遺伝子組み換え生物", item:"遺伝子組換え作物及び/又は試料の栽培は、生産国の現行の規制を遵守している", level:"major", schemes:["GGAP"], is_cleared:false },
  { id:93, code:"27.03", category:"遺伝子組み換え生物", item:"生産者の直接の顧客に、生産物の遺伝子組換え作物(GMO）ステータスを知らせている。", level:"major", schemes:["GGAP"], is_cleared:false },
  { id:94, code:"27.04", category:"遺伝子組み換え生物", item:"遺伝子組換え（GM）作物と従来の作物が予期せず混ざることを防いでいる。", level:"major", schemes:["GGAP"], is_cleared:false },
  // -- 土壌と培地の管理 --
  { id:95, code:"28.01.01", category:"土壌と培地の管理", item:"生産者には、土壌の健全性を改善・最適化するための土壌管理計画がある。", level:"major", schemes:["GGAP"], is_cleared:false },
  { id:96, code:"28.01.02", category:"土壌と培地の管理", item:"農場の土壌地図がある。", level:"rec", schemes:["GGAP"], is_cleared:false },
  { id:97, code:"28.01.03", category:"土壌と培地の管理", item:"可能な場合、一年生作物の輪作を実施している。", level:"minor", schemes:["GGAP"], is_cleared:false },
  { id:98, code:"28.01.04", category:"土壌と培地の管理", item:"土壌構造を改善又は維持し、ソイルコンパクションの可能性を減らすための技術を使用している。", level:"minor", schemes:["GGAP"], is_cleared:false },
  { id:99, code:"28.01.05", category:"土壌と培地の管理", item:"生産者は土壌侵食の可能性を減らすための技術を使用している。", level:"minor", schemes:["GGAP"], is_cleared:false },
  { id:100, code:"28.02.01", category:"土壌と培地の管理", item:"土壌消毒剤の使用の正当性を示す文書がある。", level:"minor", schemes:["GGAP"], is_cleared:false },
  { id:101, code:"28.02.02", category:"土壌と培地の管理", item:"土壌消毒後、作付けまでの期間を厳守している。", level:"minor", schemes:["GGAP"], is_cleared:false },
  { id:102, code:"28.03.01", category:"土壌と培地の管理", item:"生産者は培地のリサイクルに参加している。", level:"rec", schemes:["GGAP"], is_cleared:false },
  { id:103, code:"28.03.02", category:"土壌と培地の管理", item:"再利用を目的として培地の殺菌に使用したあらゆる薬剤を記録している。", level:"minor", schemes:["GGAP"], is_cleared:false },
  { id:104, code:"28.03.03", category:"土壌と培地の管理", item:"天然由来の培地は、指定保護区域から採取したものではない。", level:"minor", schemes:["GGAP"], is_cleared:false },
  // -- 肥料とバイオスティミュラント --
  { id:105, code:"29.01.01", category:"肥料とバイオスティミュラント", item:"すべての肥料とバイオスティミュラントの施用に関する最新の記録がある。", level:"major", schemes:["GGAP"], is_cleared:false, auto:"fert_record", doc:"29_有機質肥料リスク検討表" },
  { id:106, code:"29.01.02", category:"肥料とバイオスティミュラント", item:"すべての肥料散布の記録は以下を含まなければならない。 地理的な地域、および圃場、果樹園、温室の名称又は参照情報", level:"minor", schemes:["GGAP"], is_cleared:false, auto:"fert_record", doc:"29_有機質肥料リスク検討表" },
  { id:107, code:"29.01.03", category:"肥料とバイオスティミュラント", item:"すべての肥料散布の記録は以下を含まなければならない。日付", level:"minor", schemes:["GGAP"], is_cleared:false, auto:"fert_record", doc:"29_有機質肥料リスク検討表" },
  { id:108, code:"29.01.04", category:"肥料とバイオスティミュラント", item:"すべての肥料散布の記録は以下を含まなければならない。名前と種類", level:"minor", schemes:["GGAP"], is_cleared:false, auto:"fert_record", doc:"29_有機質肥料リスク検討表" },
  { id:109, code:"29.01.05", category:"肥料とバイオスティミュラント", item:"すべての肥料散布の記録は以下を含まなければならない。量（該当する場合、施用率又は濃度）", level:"minor", schemes:["GGAP"], is_cleared:false, auto:"fert_record", doc:"29_有機質肥料リスク検討表" },
  { id:110, code:"29.01.06", category:"肥料とバイオスティミュラント", item:"すべての肥料散布の記録は以下を含まなければならない。施肥を行った者を明確に特定するための個人または複数の施肥者名", level:"minor", schemes:["GGAP"], is_cleared:false, auto:"fert_record", doc:"29_有機質肥料リスク検討表" },
  { id:111, code:"29.01.07", category:"肥料とバイオスティミュラント", item:"肥料の管理は測定指標で裏付けられている。", level:"rec", schemes:["GGAP"], is_cleared:false, auto:"fert_record", doc:"29_有機質肥料リスク検討表" },
  { id:112, code:"29.02.01", category:"肥料とバイオスティミュラント", item:"肥料とバイオスティミュラントを、食品安全上のリスクを低減する適切な方法で保管している。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"29_有機質肥料リスク検討表" },
  { id:113, code:"29.02.02", category:"肥料とバイオスティミュラント", item:"肥料とバイオスティミュラントを、環境汚染のリスクを低減する適切な方法で保管している。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"29_有機質肥料リスク検討表" },
  { id:114, code:"29.03.01", category:"肥料とバイオスティミュラント", item:"有機肥料のリスク評価を、使用目的に沿って実施している。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"29_有機質肥料リスク検討表" },
  { id:115, code:"29.03.02", category:"肥料とバイオスティミュラント", item:"有機肥料の施用から収穫までの間隔は、食品の安全性を損なっていない。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"29_有機質肥料リスク検討表" },
  { id:116, code:"29.03.03", category:"肥料とバイオスティミュラント", item:"農場では人糞尿を含む下水汚泥を使用することを禁止している。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"29_有機質肥料リスク検討表" },
  { id:117, code:"29.04.01", category:"肥料とバイオスティミュラント", item:"施用した肥料に含まれる主要養分（窒素、リン、カリウム）の含有量を把握している。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"29_有機質肥料リスク検討表" },
  { id:118, code:"29.04.02", category:"肥料とバイオスティミュラント", item:"購入した無機肥料に、重金属を含む化学物質の含有量の証拠文書が添付されている。", level:"rec", schemes:["GGAP"], is_cleared:false, doc:"29_有機質肥料リスク検討表" },
  // -- 水管理 --
  { id:119, code:"30.01.01", category:"水管理", item:"収穫まで、及び収穫後に使用する水について、食品安全のリスク評価がある。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"30_使用水リスク評価" },
  { id:120, code:"30.01.02", category:"水管理", item:"農場（収穫まで、および収穫後）の水管理の環境への影響を評価するために、リスク評価を実施している。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"30_使用水リスク評価" },
  { id:121, code:"30.01.03", category:"水管理", item:"水管理計画が利用可能である。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"30_使用水リスク評価" },
  { id:122, code:"30.01.04", category:"水管理", item:"農場内での水管理を農場外での活動で補完するための措置をとっている（ただし、生産者の法的範囲は農場内である）。", level:"rec", schemes:["GGAP"], is_cleared:false, doc:"30_使用水リスク評価" },
  { id:123, code:"30.02.01", category:"水管理", item:"法的に要求されている場合、農場レベルでの水使用について 有効な許認可を取得している。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"30_使用水リスク評価" },
  { id:124, code:"30.02.02", category:"水管理", item:"水に関する許認可に記載されている制限事項に適合している。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"30_使用水リスク評価" },
  { id:125, code:"30.03.01", category:"水管理", item:"実行可能な場合、水を集水し、必要に応じて再利用するための措置を実施している。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"30_使用水リスク評価" },
  { id:126, code:"30.04.01", category:"水管理", item:"貯水施設があり、水量が最も豊富な期間に有効活用できるよう、手入れが行き届いている。", level:"rec", schemes:["GGAP"], is_cleared:false, doc:"30_使用水リスク評価" },
  { id:127, code:"30.04.02", category:"水管理", item:"貯水は、食品安全上のリスクをもたらしていない。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"30_使用水リスク評価" },
  { id:128, code:"30.05.01", category:"水管理", item:"リスク評価に基づき、食品安全の観点から水の分析を行っている。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"30_使用水リスク評価" },
  { id:129, code:"30.05.02", category:"水管理", item:"リスク評価の結果及び水質分析の結果に基づいて是正処置を講じている。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"30_使用水リスク評価" },
  { id:130, code:"30.05.03", category:"水管理", item:"下水処理水の使用は、食品安全上のリスクをもたらすものではない。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"30_使用水リスク評価" },
  { id:131, code:"30.05.04", category:"水管理", item:"収穫時及び収穫後に生産物と接触する水は、飲料水の微生物基準を満たしていなければならない。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"30_使用水リスク評価" },
  { id:132, code:"30.05.05", category:"水管理", item:"生産、収穫、収穫後に使用する循環利用水を、適切な頻度で交換又は補充している。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"30_使用水リスク評価" },
  { id:133, code:"30.05.06", category:"水管理", item:"収穫時又は収穫後に使用する処理水を適切にモニタリングしている。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"30_使用水リスク評価" },
  { id:134, code:"30.06.01", category:"水管理", item:"作物の灌漑量を計算し、最適化するためのツールを常に使用している。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"30_使用水リスク評価" },
  { id:135, code:"30.06.02", category:"水管理", item:"水の使用量を把握し、水の使用効率を高めるために特定した対策を講じている。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"30_使用水リスク評価" },
  { id:136, code:"30.06.03", category:"水管理", item:"水の管理は測定指標で裏付けられている。", level:"rec", schemes:["GGAP"], is_cleared:false, doc:"30_使用水リスク評価" },
  // -- 総合的有害生物管理（IPM） --
  { id:137, code:"31.01", category:"総合的有害生物管理（IPM）", item:"総合的病害虫管理（IPM）を、教育訓練やアドバイスを通じた支援を受けて実施している。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"31_IPM計画/実践計画" },
  { id:138, code:"31.02", category:"総合的有害生物管理（IPM）", item:"生産者は、登録作物に影響を及ぼす関連する病害虫・雑草についての情報を得ている。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"31_IPM計画/実践計画" },
  { id:139, code:"31.03", category:"総合的有害生物管理（IPM）", item:"登録農作物に影響を及ぼす関連病害虫・雑草を管理するために農場レベルで使用する手段を記述した総合的病害虫管理（IPM）計画がある。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"31_IPM計画/実践計画" },
  { id:140, code:"31.04", category:"総合的有害生物管理（IPM）", item:"生産者は予防策を講じている。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"31_IPM計画/実践計画" },
  { id:141, code:"31.05", category:"総合的有害生物管理（IPM）", item:"生産者は、病害虫の管理を計画するために、登録作物のモニタリングを実施している。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"31_IPM計画/実践計画" },
  { id:142, code:"31.06", category:"総合的有害生物管理（IPM）", item:"生産者は病害虫を管理するための介入を行っている。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"31_IPM計画/実践計画" },
  { id:143, code:"31.07", category:"総合的有害生物管理（IPM）", item:"利用可能な農薬及び特定防除資材(PPP)の効力を維持するため、耐性/抵抗性を生じさせないための推奨事項に従っている。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"31_IPM計画/実践計画" },
  { id:144, code:"31.08", category:"総合的有害生物管理（IPM）", item:"生産者は、総合的病害虫管理（IPM）の結果を、IPM計画の学習と改善に活用している。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"31_IPM計画/実践計画" },
  // -- 農薬及び特定防除資材 --
  { id:145, code:"32.01.01", category:"農薬及び特定防除資材", item:"生産国で認可された農薬及び特定防除資材（PPP）のみを使用している。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:146, code:"32.01.02", category:"農薬及び特定防除資材", item:"農薬及び特定防除資材（PPP）及びその他の処理を、製品ラベルの推奨事項に従って適切に施用している。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:147, code:"32.01.03", category:"農薬及び特定防除資材", item:"生産者は、近隣の圃場への農薬のドリフトを防ぐための積極的な手段を講じている", level:"major", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:148, code:"32.01.04", category:"農薬及び特定防除資材", item:"生産者は、近隣の圃場からの農薬のドリフトを防ぐための積極的な手段を講じている。", level:"rec", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:149, code:"32.02.01", category:"農薬及び特定防除資材", item:"農薬及び特定防除資材（PPP）の施用について記録している。", level:"major", schemes:["GGAP"], is_cleared:false, auto:"spray_record", doc:"32_農薬散布/残留手順" },
  { id:150, code:"32.02.02", category:"農薬及び特定防除資材", item:"施用時の天候を記録している。", level:"major", schemes:["GGAP"], is_cleared:false, auto:"spray_record", doc:"32_農薬散布/残留手順" },
  { id:151, code:"32.02.03", category:"農薬及び特定防除資材", item:"農薬及び特定防除資材（PPP）の管理は、測定指標で裏付けられている。", level:"rec", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:152, code:"32.03.01", category:"農薬及び特定防除資材", item:"登録された収穫前期間を遵守していることを示す証拠がある。", level:"major", schemes:["GGAP"], is_cleared:false, auto:"spray_record", doc:"32_農薬散布/残留手順" },
  { id:153, code:"32.04.01", category:"農薬及び特定防除資材", item:"農薬及び特定防除資材（PPP）の空容器は、保管・廃棄前に水で3回洗浄し、すすぎ液は環境にリスクを与えない方法で廃棄している。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:154, code:"32.04.02", category:"農薬及び特定防除資材", item:"農薬及び特定防除資材（PPP）の空容器を、同一製品の補充・運搬以外の目的で再利用していない。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:155, code:"32.04.03", category:"農薬及び特定防除資材", item:"空容器は、廃棄が可能になるまで安全に保管している。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:156, code:"32.04.04", category:"農薬及び特定防除資材", item:"農薬及び特定防除資材（PPP）の空容器は、人及び環境へのリスクを低減するような方法で廃棄している。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:157, code:"32.04.05", category:"農薬及び特定防除資材", item:"利用可能であれば、公的な回収および廃棄システムを利用し、回収システムの規則に従い、空容器を適切に保管、識別、取扱いをしている。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:158, code:"32.04.06", category:"農薬及び特定防除資材", item:"農薬及び特定防除資材（PPP）容器の廃棄又は破壊に関するすべての現地の規制を遵守している。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:159, code:"32.05.01", category:"農薬及び特定防除資材", item:"使用期限切れ農薬及び特定防除資材（PPP）は、安全に保管し、識別し、認可又は承認されたルートを経て廃棄している。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:160, code:"32.06.01", category:"農薬及び特定防除資材", item:"余った混合済み薬液やタンクゆすぎ液は、責任を持って廃棄している。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:161, code:"32.07.01", category:"農薬及び特定防除資材", item:"生産物が取引される販売先の市場についての最大残留基準値（MRL）に関する情報が利用可能である。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:162, code:"32.07.02", category:"農薬及び特定防除資材", item:"すべての登録生産物のリスク評価が完了し、該当する市場の最大残留基準値（MRL）の要件を満たしている。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:163, code:"32.07.03", category:"農薬及び特定防除資材", item:"最大残留基準値（MRL）のサンプリング及び試験手順が正しく守られている。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:164, code:"32.07.04", category:"農薬及び特定防除資材", item:"最大残留基準値（MRL）のサンプリングで未承認の農薬及び特定防除資材（PPP）が検出された場合の対処方法を記述した行動計画書が利用可能である。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:165, code:"32.07.05", category:"農薬及び特定防除資材", item:"最大残留基準値（MRL）を超過した場合に取るべき措置を記述した行動計画書が利用可能である。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:166, code:"32.08.01", category:"農薬及び特定防除資材", item:"どの項目にも該当しない全てのその他資材について、現状を反映した使用記録がある。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:167, code:"32.09.01", category:"農薬及び特定防除資材", item:"農薬及び特定防除資材(PPP)、生物的防除剤、その他の処理製品を、関連するリスクを確実に管理する方法で保管している。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:168, code:"32.09.02", category:"農薬及び特定防除資材", item:"農薬及び特定防除資材（PPP）保管庫は、構造的に頑丈で堅固である。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:169, code:"32.09.03", category:"農薬及び特定防除資材", item:"農薬及び特定防除資材（PPP）の保管が、作業者にリスクを与えたり、交差汚染の機会を作ったりしていない。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:170, code:"32.09.04", category:"農薬及び特定防除資材", item:"農薬及び特定防除資材（PPP）は適切な温度で保管している。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:171, code:"32.09.05", category:"農薬及び特定防除資材", item:"農薬及び特定防除資材（PPP）保管庫内は明るさがある。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:172, code:"32.09.06", category:"農薬及び特定防除資材", item:"農薬及び特定防除資材（PPP）保管庫は、流出を貯留及び管理できる。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:173, code:"32.10.01", category:"農薬及び特定防除資材", item:"リスク評価又は製品の暴露や毒性に応じて、該当する農薬及び特定防除資材（PPP）に暴露される作業者は、健康診断を受けることができる。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:174, code:"32.10.02", category:"農薬及び特定防除資材", item:"農薬及び特定防除資材（PPP）をラベルの要求事項に従って混合し、取り扱っている。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:175, code:"32.10.03", category:"農薬及び特定防除資材", item:"事故対応手順書は、農薬及び特定防除資材（PPP）/化学物質保管庫の近くで利用可能である。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:176, code:"32.10.04", category:"農薬及び特定防除資材", item:"作業者の偶発的な汚染事故に対処するための設備が利用可能である。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:177, code:"32.10.05", category:"農薬及び特定防除資材", item:"生産サイト間において、農薬及び特定防除資材（PPP）を、安全かつ確実な方法で運搬している。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:178, code:"32.10.06", category:"農薬及び特定防除資材", item:"農場には農薬及び特定防除資材（PPP）使用後の再入場時期に関する文書化された手順がある。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"32_農薬散布/残留手順" },
  { id:179, code:"32.11.01", category:"農薬及び特定防除資材", item:"すべての農薬及び特定防除資材（PPP）及びポストハーベスト処理資材の請求書及び/又は調達の証拠文書を保管している。", level:"major", schemes:["GGAP"], is_cleared:false, auto:"pest_purchase", doc:"32_農薬散布/残留手順" },
  // -- ポストハーベスト処理 --
  { id:180, code:"33.01.01", category:"ポストハーベスト処理", item:"収穫及び包装した生産物は食品安全リスクを最小限に抑えるように保管している。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"33_衛生/トイレ掃除" },
  { id:181, code:"33.01.02", category:"ポストハーベスト処理", item:"包装した生産物の集荷、保管、分配のためのすべての場所を清掃し維持している。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"33_衛生/トイレ掃除" },
  { id:182, code:"33.01.03", category:"ポストハーベスト処理", item:"包装資材は、使用目的に適い、汚染を防止する条件下で保管している。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"33_衛生/トイレ掃除" },
  { id:183, code:"33.01.04", category:"ポストハーベスト処理", item:"清掃用具、薬剤、潤滑剤などは、生産物の化学的汚染を防ぐ方法で保管及び使用され、食品業界での使用が認められている。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"33_衛生/トイレ掃除" },
  { id:184, code:"33.02.01", category:"ポストハーベスト処理", item:"生産物への異物混入を防ぐことを確実にする仕組みがある。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"33_衛生/トイレ掃除" },
  { id:185, code:"33.02.02", category:"ポストハーベスト処理", item:"異物混入に対処する仕組みがある。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"33_衛生/トイレ掃除" },
  { id:186, code:"33.03.01", category:"ポストハーベスト処理", item:"コントロールした保管状態を維持している。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"33_衛生/トイレ掃除" },
  { id:187, code:"33.04.01", category:"ポストハーベスト処理", item:"害虫・害獣管理計画があり、実施している。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"33_衛生/トイレ掃除" },
  { id:188, code:"33.04.02", category:"ポストハーベスト処理", item:"害虫・害獣駆除の検査と実施した是正処置の記録がある。", level:"major", schemes:["GGAP"], is_cleared:false, doc:"33_衛生/トイレ掃除" },
  { id:189, code:"33.05.01", category:"ポストハーベスト処理", item:"最終生産物の表示は適切である。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"33_衛生/トイレ掃除" },
  { id:190, code:"33.06.01", category:"ポストハーベスト処理", item:"生産物取扱い区域では、リスクに基づく微生物環境モニタリングプログラムがある。", level:"minor", schemes:["GGAP"], is_cleared:false, doc:"33_衛生/トイレ掃除" },
  // ═══ McDonald's GAP Addendum 1.1（取引先マクドナルドの上乗せ監査ポイント）═══
  // -- McD: 食品安全プログラム --
  { id:191, code:"McD 2.4.1", category:"McD: 食品安全プログラム", item:"第2者および第3者監査人が、マクドナルドのGAP研修を受け、マクドナルドの農産物の食品安全に関する技能試験に合格したことを示す証拠があるか？生産者の少なくとも1人の代表者が、マクドナルドのGAPトレーニングを受け、マクドナルドの農産物の食品安全性に関する技能試験に合格していますか？", schemes:["McD"], is_cleared:false },
  // -- McD: リスクアセスメント --
  { id:192, code:"McD 3.1.1", category:"McD: リスクアセスメント", item:"定植前前および収穫前のリスクアセスメントプログラムが存在しますか？", schemes:["McD"], is_cleared:false },
  { id:193, code:"McD 3.2.1", category:"McD: リスクアセスメント", item:"収穫前のリスクアセスメントに関する文書があり、それは7日ルールに準拠していますか？", schemes:["McD"], is_cleared:false },
  { id:194, code:"McD 3.3.1", category:"McD: リスクアセスメント", item:"不適合が発生した場合、その欠陥を合理的な時間内に解決するための是正措置が開始されたことを示す証拠がありますか？ ガイダンス 問題が重大であればあるほど、是正措置の期間は短くなります。", schemes:["McD"], is_cleared:false },
  // -- McD: 土地使用評価 --
  { id:195, code:"McD 4.1.1", category:"McD: 土地使用評価", item:"過去5年間の当該農場／栽培地域に特化した過去の土地使用記録、または土地所有者からの保証書がありますか？", schemes:["McD"], is_cleared:false },
  { id:196, code:"McD 4.2.1", category:"McD: 土地使用評価", item:"潜在的な危険（CAFO:Concentrated Animal Feeding Operations、廃棄物処理場、大量の排気ガスを出す工場など）は地図上で適切に特定されていますか？", schemes:["McD"], is_cleared:false },
  { id:197, code:"McD 4.3.1", category:"McD: 土地使用評価", item:"必要に応じて、リスクアセスメントにより汚染の潜在的なリスクとして特定された隣接物件から、栽培エリアが物理的に保護されていますか？", schemes:["McD"], is_cleared:false },
  { id:198, code:"McD 4.4.1", category:"McD: 土地使用評価", item:"栽培事業所の半径1.6km以内に、1エーカーあたり25頭以上の動物を飼っているCAFO、酪農場、CAOがありますか？はいの場合、生産者はリスクアセスメントが実施された証拠と、マクドナルドが提案されたリスク軽減申請を承認したことを示す文書を持っていますか？", schemes:["McD"], is_cleared:false },
  { id:199, code:"McD 4.5.1", category:"McD: 土地使用評価", item:"堆肥化エリアは、栽培エリアやその他の潜在的に影響を受けやすい場所から推奨される距離を離して配置されているか、また流出の可能性がないように地形を考慮していますか？ 対象となる作物の方向に流出しないように地形が考慮されていますか？そうでない場合、生産者はリスクアセスメントが実施された証拠と、マクドナルドに承認されたリスク軽減申請を持っていますか？", schemes:["McD"], is_cleared:false },
  { id:200, code:"McD 4.6.1", category:"McD: 土地使用評価", item:"洪水によって汚染された作物の取り扱いに関する手順が書かれた文書はありますか？", schemes:["McD"], is_cleared:false },
  // -- McD: 灌漑と水管理 --
  { id:201, code:"McD 5.1.1", category:"McD: 灌漑と水管理", item:"大腸菌、サルモネラ菌、寄生虫(例:サイクロスポラ)、ノロウイルスなどの病原体を考慮した水のリスクアセスメントが行われていますか? リスクアセスメントは、洗浄/バイオフィルム/スケール除去の有効性を含め、灌漑用配管システムの洗浄、衛生、検証を評価していますか? 高リスクが確認された場合、緩和策が定義され、実施されていますか?", schemes:["McD"], is_cleared:false },
  { id:202, code:"McD 5.2.1", category:"McD: 灌漑と水管理", item:"現在のすべての水源について、青果物食品安全基準の 5.10 項の手順に従って水サンプルを採取していますか?", schemes:["McD"], is_cleared:false },
  { id:203, code:"McD 5.3.1", category:"McD: 灌漑と水管理", item:"水のサンプルを採取する人は、水のサンプルの汚染を防ぐための予防措置を講じるよう適切に訓練されているという証拠がありますか？", schemes:["McD"], is_cleared:false },
  { id:204, code:"McD 5.4.1", category:"McD: 灌漑と水管理", item:"現在使用されているすべての水源からの灌漑用水は、移動幾何平均値の妥当性を維持するために、適用可能な水サンプリング計画（5.11.1 表 1 および 5.11.2 に記載）に従って必要な頻度でサンプリングされているか?", schemes:["McD"], is_cleared:false },
  { id:205, code:"McD 5.5.1", category:"McD: 灌漑と水管理", item:"水処理は適切に文書化され、要求に応じて確認できるように なっていますか?", schemes:["McD"], is_cleared:false },
  { id:206, code:"McD 5.6.1", category:"McD: 灌漑と水管理", item:"水源と未処理の糞尿の間の必要な距離を満たしていますか?", schemes:["McD"], is_cleared:false },
  { id:207, code:"McD 5.7.1", category:"McD: 灌漑と水管理", item:"農場で再生水を使用している場合、その水がEPAの水再利用ガイドラインを満たすようにろ過・消毒されたことを確認する文書がありますか？ ガイダンス 出典 カリフォルニア州規則集、タイトル22第3章（水のリサイクル基準）セクション60301.203(b)。", schemes:["McD"], is_cleared:false },
  { id:208, code:"McD 5.9.1", category:"McD: 灌漑と水管理", item:"灌漑用水の一次および二次（非常用）供給源に関して、青 果物食品安全基準の5.11.2項のフローチャートが順守されていますか？", schemes:["McD"], is_cleared:false },
  { id:209, code:"McD 5.10.1", category:"McD: 灌漑と水管理", item:"作物の食用部分と接触する可能性のある、収穫 および/または収穫後の作業中に使用される水が、5.10 項 で要求される微生物の基準を確実に満たすのに十分な頻度で、 定期的に検査されているという証拠がありますか?", schemes:["McD"], is_cleared:false },
  // -- McD: 肥料・土壌改良剤・農薬 --
  { id:210, code:"McD 6.2.1", category:"McD: 肥料・土壌改良剤・農薬", item:"禁止されている肥料、土壌添加物、農薬が使用されていない", schemes:["McD"], is_cleared:false },
  { id:211, code:"McD 6.7.1", category:"McD: 肥料・土壌改良剤・農薬", item:"動物の糞尿又は動物の副産物を含む非合成の作物処理剤が作物又は栽培地域に適用されたことがあり、それらは6.7項の要求事項を満たしていますか？", schemes:["McD"], is_cleared:false },
  // -- McD: 個人衛生・圃場衛生・労働条件 --
  { id:212, code:"McD 7.5.1", category:"McD: 個人衛生・圃場衛生・労働条件", item:"トイレは職場から 1/4 マイル（400m）以内（徒歩or車で 5 分）の場所にありますか？そうでない場合、従業員がトイレ施設にアクセスするための交通手段を提供できますか？", schemes:["McD"], is_cleared:false },
  { id:213, code:"McD 7.6.1", category:"McD: 個人衛生・圃場衛生・労働条件", item:"トイレ施設の点検の証拠が近接して掲示されていますか？", schemes:["McD"], is_cleared:false },
  { id:214, code:"McD 7.7.1", category:"McD: 個人衛生・圃場衛生・労働条件", item:"トイレ施設には無香料ハンドソープ、使い捨てペーパータオル、又は空気式ハンドドライヤーが適切に備えられていますか? 手洗い用の水は用意されていますか？ 手洗い用の水タンクがある場合清掃と衛生管理の記録が毎月、あるいは手洗い用の水に残留塩素などの酸化剤が含まれていない場合はより頻繁に行わ れていますか?", schemes:["McD"], is_cleared:false },
  // -- McD: 圃場異物管理 --
  { id:215, code:"McD 8.4.1", category:"McD: 圃場異物管理", item:"生産者はガラスが破損した場合の製品汚染の可能性を排除するため、保管場所の清掃と衛生に関するプログラムがありますか?", schemes:["McD"], is_cleared:false },
  // -- McD: 並行生産(GGAP PLUS) --
  { id:216, code:"McD 9.1.1", category:"McD: 並行生産(GGAP PLUS)", item:"GLOBALG.A.P.PLUSの要求事項に適合しない作物・製品がマクドナルドのサプライチェーンに入ることを防ぐための手順がありますか？ 登録された製品の一部のみがマクドナルドに供給される場合、すなわち生産者が並行して生産/所有している場合、GLOBALG.A.P.コントロールポイントに設定された要求事項と準拠基準AF13（「トレーサビリティーと分別」…", schemes:["McD"], is_cleared:false },
  // -- McD: eラーニング --
  { id:217, code:"McD 10.1.1", category:"McD: eラーニング", item:"生産者は、このeラーニングへの参加を実証し、過去12ヶ月間に発行された修了証書が必要です。", schemes:["McD"], is_cleared:false },
  // -- McD: データアクセス --
  { id:218, code:"McD 11.1.1", category:"McD: データアクセス", item:"CB は、PLUS データ・アクセス・ルールを生産者に伝え、生産者がそれを受け入れたことを証明し、最新版の「サブライ センスおよび認証契約書」を受け入れ、生産者が署名している必要があります。", schemes:["McD"], is_cleared:false },
]

// GAP項目の自動達成判定: システムに該当記録があれば true（人手のチェック不要にする）。
// ctx = { records, lotSprayRecords, pesticides, pesticidePurchases, topDressingRecords,
//         fertilizerPurchases, harvestRecords, shipmentRecords, maintenanceRecords, staff, farmLots }
function isGapAutoCleared(item, ctx) {
  if (!item || !item.auto || !ctx) return false
  const has = (a) => Array.isArray(a) && a.length > 0
  const lots = () => Object.values(ctx.farmLots || {})
  switch (item.auto) {
    case 'records_exist':    return has(ctx.records)
    case 'spray_record':     return has(ctx.lotSprayRecords) || (ctx.records || []).some(r => r.work_type === '農薬散布')
    case 'pesticide_master': return has(ctx.pesticides)
    case 'pest_purchase':    return has(ctx.pesticidePurchases)
    case 'fert_record':      return has(ctx.topDressingRecords) || (ctx.records || []).some(r => r.work_type === '施肥')
    case 'fert_purchase':    return has(ctx.fertilizerPurchases)
    case 'harvest_record':   return has(ctx.harvestRecords)
    case 'shipment_record':  return has(ctx.shipmentRecords)
    case 'machine_maint':    return has(ctx.maintenanceRecords)
    case 'waste_record':     return (ctx.records || []).some(r => r.waste && String(r.waste).trim())
    case 'worker_managed':   return has(ctx.staff)
    case 'trainee_visa':     return (ctx.staff || []).some(s => s.role === 'trainee' && s.visa_expires_at)
    case 'traceability':     return has(ctx.harvestRecords) && lots().some(a => (a || []).length > 0)
    case 'seed_lot':         return lots().some(a => (a || []).some(l => l.seed_lot_no || l.variety))
    default:                 return false
  }
}

// 各GAP項目に「自動達成の根拠ラベル」を付与。スキームは生成時に GGAP を設定済み。
const _GAP_EVIDENCE = { records_exist:'作業記録', spray_record:'農薬散布記録', pesticide_master:'農薬マスタ', pest_purchase:'農薬仕入記録', fert_record:'施肥記録', fert_purchase:'肥料仕入記録', harvest_record:'収穫記録', shipment_record:'出荷記録', machine_maint:'機械整備記録', worker_managed:'作業者名簿', trainee_visa:'ビザ管理', traceability:'ロット追跡', seed_lot:'種苗ロット', waste_record:'廃棄物記録' }
INITIAL_GAP_CHECKS.forEach(c => {
  if (!c.schemes) c.schemes = ['GGAP']
  c.evidence = c.auto ? (_GAP_EVIDENCE[c.auto] || '記録') : null
})
// =====================================================
// 【突合せ / 整合性チェック】人的な入力ミスや記録同士の食い違いを横断で洗い出す。
// 1年運用しても手戻りを最小化するため、記録を突き合わせて「原因」と「対処」まで示す。
// 返り値: [{ id, severity:'high'|'mid'|'low', category, title, detail, cause, fix, refs:[{kind,id,label}] }]
// 純関数（stateを変更しない）。データ形状のゆれに強いよう各チェックはtry/catchで隔離。
// parseRowRange は components.js のグローバル関数を利用（読み込み順で定義済み）。
// =====================================================
function runFarmIntegrityChecks(ctx) {
  ctx = ctx || {}
  const findings   = []
  const records    = ctx.records || []
  const sprays     = ctx.lotSprayRecords || []
  const ferts      = ctx.topDressingRecords || []
  const harvests   = ctx.harvestRecords || []
  const shipments  = ctx.shipmentRecords || []
  const fields     = ctx.fields || []
  const lotsMap    = ctx.farmLots || {}
  const pesticides = ctx.pesticides || []
  const today  = todayYmd()  // ローカル日付(config.js)。UTC基準だとJST早朝に未来日付を誤検知するため。
  const fname  = (id) => { const f = fields.find(x => x.id === id); return f ? f.name : ('圃場#' + id) }
  const pById  = (id) => pesticides.find(p => p.id === id)
  const days   = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000)
  const yearOf = (d) => (d || '').slice(0, 4)
  const rowset = (s) => (typeof parseRowRange === 'function' ? parseRowRange(s) : new Set())
  // 「直す」で該当画面へ一発ジャンプするための遷移先ヒント
  const navRecord = (id) => ({ page: 'record_list', focus: id })
  const navField  = (fid, sub) => ({ page: 'field:' + fid + ':' + (sub || 'dashboard') })
  const subFor    = (kind) => (kind === 'spray' ? 'pesticide' : kind === 'harvest' ? 'harvest' : 'dashboard')
  let seq = 0
  const push = (o) => findings.push(Object.assign({ id: 'chk' + (++seq), refs: [] }, o))
  const run  = (fn) => { try { fn() } catch (e) { /* 1チェックの失敗で全体を止めない */ } }

  // 農薬適用イベントを正規化（畝別散布 + 基本日報の農薬散布）
  const sprayEvents = []
  sprays.forEach(r => (r.pesticides || []).forEach(p =>
    sprayEvents.push({ field_id: r.field_id, date: r.date, row_range: r.row_range, pesticide_id: p.pesticide_id, dilution: p.dilution, spray_volume_L: r.spray_volume_L, src: { kind: 'spray', id: r.id } })))
  records.filter(r => r.work_type === '農薬散布' && r.pesticide_id).forEach(r =>
    sprayEvents.push({ field_id: r.field_id, date: r.date, row_range: r.row_range, pesticide_id: r.pesticide_id, src: { kind: 'record', id: r.id } }))

  // H2 農薬の年間使用回数オーバー（GAP違反）
  run(() => {
    const cnt = {}
    sprayEvents.forEach(e => { const k = e.field_id + '|' + e.pesticide_id + '|' + yearOf(e.date); (cnt[k] = cnt[k] || []).push(e) })
    Object.entries(cnt).forEach(([k, evs]) => {
      const [fid, pid, yr] = k.split('|')
      const p = pById(Number(pid)); if (!p || !p.max_times) return
      if (evs.length > p.max_times) push({
        severity: 'high', category: '農薬', title: p.name + ' の使用回数オーバー',
        detail: fname(Number(fid)) + ' で ' + yr + '年に ' + evs.length + '回（上限 ' + p.max_times + '回）',
        cause: '同じ圃場で同じ農薬を上限より多く使用（記録ミス、または実際の使用超過）。',
        fix: '誤登録なら記録を訂正、実使用なら次作で剤をローテーション。',
        refs: evs.map(e => ({ kind: e.src.kind, id: e.src.id, label: e.date })),
        nav: navField(Number(fid), 'pesticide'),
      })
    })
  })

  // H3 収穫前日数(PHI)違反の疑い
  run(() => {
    harvests.forEach(h => {
      const hset = h.row_range ? rowset(h.row_range) : null
      sprayEvents.filter(e => e.field_id === h.field_id && e.date && h.date && e.date <= h.date).forEach(e => {
        const p = pById(e.pesticide_id); if (!p || p.preharvest_days == null) return
        const gap = days(e.date, h.date)
        if (gap < p.preharvest_days) {
          if (hset && e.row_range) { const eset = rowset(e.row_range); if (![...eset].some(n => hset.has(n))) return }
          push({
            severity: 'high', category: '食品安全', title: '収穫前日数(PHI)違反の疑い: ' + p.name,
            detail: fname(h.field_id) + ' 収穫' + h.date + ' の ' + gap + '日前に散布（要 ' + p.preharvest_days + '日以上）',
            cause: '収穫前日数を空けずに農薬を使用（散布日/収穫日の入力ミス、または実際の違反）。',
            fix: '日付の誤りが無いか確認。実際に違反ならロットの出荷可否を要判断。',
            refs: [{ kind: e.src.kind, id: e.src.id, label: '散布 ' + e.date }, { kind: 'harvest', id: h.id, label: '収穫 ' + h.date }],
            nav: navField(h.field_id, 'harvest'),
          })
        }
      })
    })
  })

  // H1 収穫と出荷の突合。品種(variety)単位で集計（出荷記録の集計軸に一致）。
  //   歩留まり・繰越で収穫≠出荷の増減は自然に起こりうるため、出荷>収穫（＝在庫がマイナス＝
  //   実際にはあり得ない）だけを「要確認」として挙げる。出荷<収穫（ロス/自家消費/在庫残）は正常。
  run(() => {
    const harv = {}, ship = {}
    harvests.forEach(h => { const k = h.variety || ('圃場#' + h.field_id); harv[k] = (harv[k] || 0) + (Number(h.total_cases) || 0) })
    shipments.forEach(s => { const k = s.variety || ('圃場#' + s.field_id); const c = Number(s.cases != null ? s.cases : s.total_cases) || 0; ship[k] = (ship[k] || 0) + c })
    Object.keys(ship).forEach(k => {
      if ((ship[k] || 0) > (harv[k] || 0) + 0.001) push({
        severity: 'mid', category: '出荷', title: '出荷が収穫を超えている（在庫がマイナス）',
        detail: k + '：収穫 ' + (harv[k] || 0) + 'ケース ＜ 出荷 ' + ship[k] + 'ケース（差 ' + (ship[k] - (harv[k] || 0)) + '）',
        cause: '歩留まりや繰越で収穫と出荷に増減は出ますが、出荷が収穫を上回るのは通常あり得ません。収穫記録の漏れ、前年繰越の未計上、または出荷数の入力ミスの可能性。',
        fix: '収穫記録の抜けが無いか、前年からの繰越が別で計上されていないか、出荷数の誤りが無いかを確認。',
        nav: { page: 'shipment_log' },
      })
    })
  })

  // M1 記録の畝がロットに紐づかない（圃場/畝の選び間違い）
  run(() => {
    const checkRow = (r, kind, label) => {
      const lots = lotsMap[r.field_id] || []
      if (!r.row_range || lots.length === 0) return
      const rset = rowset(r.row_range); if (rset.size === 0) return
      const overlap = lots.some(l => { const lset = rowset(l.row_range); return [...rset].some(n => lset.has(n)) })
      if (!overlap) push({
        severity: 'mid', category: '突合', title: label + 'の畝がロットに一致しない',
        detail: fname(r.field_id) + ' ' + r.date + ' 畝' + r.row_range + ' は登録ロットの畝範囲外',
        cause: '圃場や畝範囲の選び間違いの可能性（別圃場の記録が紛れている等）。',
        fix: '記録の圃場・畝範囲、またはロット登録を確認して合わせる。',
        refs: [{ kind, id: r.id, label: r.date }],
        nav: navField(r.field_id, subFor(kind)),
      })
    }
    sprays.forEach(r => checkRow(r, 'spray', '農薬散布'))
    ferts.forEach(r => checkRow(r, 'fert', '施肥'))
    harvests.forEach(r => checkRow(r, 'harvest', '収穫'))
  })

  // M2 未来日付の記録（作業日の打ち間違い）
  run(() => {
    const all = [
      ...records.map(r => ({ r, kind: 'record', wt: r.work_type })),
      ...sprays.map(r => ({ r, kind: 'spray', wt: '農薬散布' })),
      ...ferts.map(r => ({ r, kind: 'fert', wt: '施肥' })),
      ...harvests.map(r => ({ r, kind: 'harvest', wt: '収穫' })),
    ]
    all.forEach(({ r, kind, wt }) => { if (r.date && r.date > today) push({
      severity: 'mid', category: '日付', title: '未来日付の記録',
      detail: fname(r.field_id) + ' ' + wt + ' が ' + r.date + '（今日 ' + today + ' より先）',
      cause: '作業日の打ち間違いの可能性。', fix: '正しい作業日に訂正。',
      refs: [{ kind, id: r.id, label: r.date }],
      nav: kind === 'record' ? navRecord(r.id) : navField(r.field_id, subFor(kind)),
    }) })
  })

  // M3 農薬の使用が仕入を超過（在庫マイナス・保守的に仕入総量で判定）
  run(() => {
    const purchased = {}; (ctx.pesticidePurchases || []).forEach(p => { purchased[p.pesticide_id] = (purchased[p.pesticide_id] || 0) + (Number(p.amount_L) || 0) })
    const used = {}
    sprays.forEach(r => (r.pesticides || []).forEach(pi => { const dil = Number(pi.dilution) || 0, vol = Number(r.spray_volume_L) || 0; if (dil > 0 && vol > 0) used[pi.pesticide_id] = (used[pi.pesticide_id] || 0) + vol / dil }))
    Object.keys(used).forEach(pid => {
      const avail = purchased[pid] || 0
      if (avail > 0 && used[pid] > avail + 0.001) { const p = pById(Number(pid)); push({
        severity: 'mid', category: '在庫', title: (p ? p.name : '農薬#' + pid) + ' の使用が仕入を超過',
        detail: '使用推定 ' + used[pid].toFixed(2) + 'L > 仕入 ' + avail + 'L',
        cause: '仕入記録の漏れ、または散布液量/希釈の入力ミス。',
        fix: '仕入記録の追加、または散布記録の数値を確認。',
        nav: { page: 'master_hub' },
      }) }
    })
  })

  // L1 重複入力の疑い（基本日報）
  run(() => {
    const seen = {}
    records.forEach(r => { const k = [r.field_id, r.date, r.work_type, r.row_range || ''].join('|'); (seen[k] = seen[k] || []).push(r) })
    Object.values(seen).forEach(arr => { if (arr.length > 1) push({
      severity: 'low', category: '重複', title: '同じ内容の日報が重複',
      detail: fname(arr[0].field_id) + ' ' + arr[0].date + ' ' + arr[0].work_type + ' が ' + arr.length + '件',
      cause: '二重登録の可能性（保存ボタンの押し過ぎ等）。', fix: '重複ぶんを削除。',
      refs: arr.map(r => ({ kind: 'record', id: r.id, label: r.date })),
      nav: navRecord(arr[0].id),
    }) })
  })

  // L2 作業者名が未記入（GAPでは作業者の記録が必要）
  run(() => {
    const missing = records.filter(r => !r.worker || !String(r.worker).trim())
    if (missing.length > 0) push({
      severity: 'low', category: '記入', title: '作業者名が未記入の日報',
      detail: missing.length + '件で作業者が空欄',
      cause: '入力時に作業者名を入れ忘れ。', fix: '各記録に作業者名を追記。',
      refs: missing.slice(0, 20).map(r => ({ kind: 'record', id: r.id, label: r.date })),
      nav: navRecord(missing[0].id),
    })
  })

  // ===== 拡充チェック（数値の打ち間違い / 日付順序矛盾 / 記入漏れ / 二重計上）=====
  // ロットの定植（無ければ播種）日を、記録の畝範囲に重なるロットから引くヘルパー
  const plantDateFor = (fid, rowStr) => {
    const lots = lotsMap[fid] || []; if (lots.length === 0) return null
    const rset = rowStr ? rowset(rowStr) : null
    const match = lots.find(l => { if (!rset) return true; const lset = rowset(l.row_range); return [...rset].some(n => lset.has(n)) })
    return match ? (match.transplant_date || match.seed_date || null) : null
  }

  // N1 農薬の希釈倍率が規定と大きく違う（桁間違い等）
  run(() => {
    sprays.forEach(r => (r.pesticides || []).forEach(pi => {
      const p = pById(pi.pesticide_id); const md = p && Number(p.dilution); const rd = Number(pi.dilution)
      if (md > 0 && rd > 0) { const ratio = rd / md; if (ratio >= 5 || ratio <= 0.2) push({
        severity: 'mid', category: '数値', title: (p ? p.name : '農薬') + ' の希釈倍率が規定と大きく違う',
        detail: fname(r.field_id) + ' ' + r.date + '：記録 ' + rd + '倍 / 規定 ' + md + '倍',
        cause: '希釈倍率の桁間違い等の入力ミスの可能性（薬害・残留リスク）。',
        fix: '散布記録の希釈倍率を確認して訂正。',
        refs: [{ kind: 'spray', id: r.id, label: r.date }],
        nav: navField(r.field_id, 'pesticide'),
      }) }
    }))
  })

  // N2 数量が0以下（収穫・出荷ケース数）
  run(() => {
    harvests.forEach(h => { if (Number(h.total_cases) <= 0) push({
      severity: 'mid', category: '数値', title: '収穫ケース数が0以下',
      detail: fname(h.field_id) + ' ' + h.date + '：' + h.total_cases + 'ケース',
      cause: 'ケース数の入力漏れ/誤り。', fix: '正しいケース数に訂正。',
      refs: [{ kind: 'harvest', id: h.id, label: h.date }],
      nav: navField(h.field_id, 'harvest'),
    }) })
    shipments.forEach(s => { if (Number(s.cases) <= 0) push({
      severity: 'mid', category: '数値', title: '出荷ケース数が0以下',
      detail: (s.variety || fname(s.field_id)) + ' ' + s.date + '：' + s.cases + 'ケース',
      cause: '出荷数の入力漏れ/誤り。', fix: '正しい出荷数に訂正。',
      nav: { page: 'shipment_log' },
    }) })
  })

  // N3 散布液量が未入力/0（在庫計算に影響）
  run(() => {
    const bad = sprays.filter(r => (r.pesticides || []).length > 0 && !(Number(r.spray_volume_L) > 0))
    if (bad.length > 0) push({
      severity: 'low', category: '数値', title: '散布液量が未入力/0の農薬散布',
      detail: bad.length + '件（在庫の減算計算に影響）',
      cause: '散布液量の入力漏れ。', fix: '各散布記録に散布液量(L)を入力。',
      refs: bad.slice(0, 20).map(r => ({ kind: 'spray', id: r.id, label: r.date })),
      nav: navField(bad[0].field_id, 'pesticide'),
    })
  })

  // D1 収穫日が定植日より前（時系列の矛盾・重大）
  run(() => {
    harvests.forEach(h => {
      const plant = plantDateFor(h.field_id, h.row_range)
      if (plant && h.date && h.date < plant) push({
        severity: 'high', category: '日付順序', title: '収穫日が定植日より前',
        detail: fname(h.field_id) + '：収穫 ' + h.date + ' < 定植 ' + plant,
        cause: '収穫日または定植日の入力ミス（時系列の矛盾）。',
        fix: '日付を確認して訂正。',
        refs: [{ kind: 'harvest', id: h.id, label: h.date }],
        nav: navField(h.field_id, 'harvest'),
      })
    })
  })

  // D2 散布/施肥が定植日より前（畝がロットに重なる場合のみ）
  run(() => {
    const chk = (r, kind, label) => {
      const plant = plantDateFor(r.field_id, r.row_range)
      if (plant && r.date && r.date < plant) push({
        severity: 'mid', category: '日付順序', title: label + 'が定植日より前',
        detail: fname(r.field_id) + '：' + label + ' ' + r.date + ' < 定植 ' + plant,
        cause: '作業日または定植日の入力ミス。', fix: '日付を確認して訂正。',
        refs: [{ kind, id: r.id, label: r.date }],
        nav: navField(r.field_id, subFor(kind)),
      })
    }
    sprays.forEach(r => chk(r, 'spray', '散布'))
    ferts.forEach(r => chk(r, 'fert', '施肥'))
  })

  // R2 天気が未記入の農薬散布（GAP・ドリフト管理で必要）
  run(() => {
    const nw = sprays.filter(r => !r.weather || !String(r.weather).trim())
    if (nw.length > 0) push({
      severity: 'low', category: '記入', title: '天気が未記入の農薬散布',
      detail: nw.length + '件',
      cause: '天気の入力漏れ。', fix: '各散布記録に天気を追記。',
      refs: nw.slice(0, 20).map(r => ({ kind: 'spray', id: r.id, label: r.date })),
      nav: navField(nw[0].field_id, 'pesticide'),
    })
  })

  // R3 品種が未記入の収穫（トレーサビリティに必要）
  run(() => {
    const nv = harvests.filter(h => !h.variety || !String(h.variety).trim())
    if (nv.length > 0) push({
      severity: 'low', category: '記入', title: '品種が未記入の収穫',
      detail: nv.length + '件',
      cause: '品種の入力漏れ。', fix: '各収穫記録に品種を追記。',
      refs: nv.slice(0, 20).map(h => ({ kind: 'harvest', id: h.id, label: h.date })),
      nav: navField(nv[0].field_id, 'harvest'),
    })
  })

  // DUP2 農薬散布/施肥/収穫の重複疑い
  run(() => {
    const dupBy = (arr, keyFn, kind, label) => {
      const seen = {}
      arr.forEach(r => { const k = keyFn(r); (seen[k] = seen[k] || []).push(r) })
      Object.values(seen).forEach(a => { if (a.length > 1) push({
        severity: 'low', category: '重複', title: label + 'の重複疑い',
        detail: fname(a[0].field_id) + ' ' + a[0].date + (a[0].row_range ? (' 畝' + a[0].row_range) : '') + ' が ' + a.length + '件',
        cause: '二重登録の可能性。', fix: '重複ぶんを削除。',
        refs: a.map(r => ({ kind, id: r.id, label: r.date })),
        nav: navField(a[0].field_id, subFor(kind)),
      }) })
    }
    dupBy(sprays, r => [r.field_id, r.date, r.row_range || '', (r.pesticides || []).map(p => p.pesticide_id).sort().join(',')].join('|'), 'spray', '農薬散布')
    dupBy(ferts, r => [r.field_id, r.date, r.row_range || ''].join('|'), 'fert', '施肥')
    dupBy(harvests, r => [r.field_id, r.date, r.row_range || '', r.variety || ''].join('|'), 'harvest', '収穫')
  })

  // OVL1 同じ畝に「栽培中/収穫待ち」ロットが重複（収穫の二重計上の温床）
  run(() => {
    Object.entries(lotsMap).forEach(([fid, lots]) => {
      const act = (lots || []).filter(l => l.status === 'growing' || l.status === 'ready')
      for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
        const a = rowset(act[i].row_range), b = rowset(act[j].row_range)
        if ([...a].some(n => b.has(n))) push({
          severity: 'mid', category: 'ロット重複', title: '同じ畝に栽培中ロットが重複',
          detail: fname(Number(fid)) + ' 畝 ' + act[i].row_range + ' と ' + act[j].row_range + ' が重複',
          cause: '旧作の終了処理漏れ、または畝範囲の入力ミス（収穫が二重に集計される温床）。',
          fix: '古いロットを収穫済/終了にするか、畝範囲を修正。',
          nav: navField(Number(fid), 'dashboard'),
        })
      }
    })
  })

  const order = { high: 0, mid: 1, low: 2 }
  findings.sort((a, b) => order[a.severity] - order[b.severity])
  return findings
}

const INITIAL_RENTALS = []
// ===== 今日のタスクモックデータ =====
// 「今日 どの畑で 誰が 何をする」を一目で把握するためのデータ
// Supabase接続後は work_schedules テーブルに移行
const INITIAL_TODAY_TASKS = []

// C06-4: INITIAL_CROP_PLANS をモックデータセクションに集約
const INITIAL_CROP_PLANS = []

// =====================================================
// 【作付け構造リファクタリング フェーズ1】作付け（crop_cycle）エンティティ
// ─────────────────────────────────────────────────────
// 既存の CROP_PLANS（作付け計画）を土台に、圃場ごとの作付け履歴を
// 正式なエンティティとして管理する。
// status: 'planned'（計画中）/ 'active'（栽培中）/ 'completed'（収穫完了・終了）
// 既存の CROP_PLANS データはそのまま「作付け履歴の初期データ」として転用する。
// =====================================================
const INITIAL_CROP_CYCLES = INITIAL_CROP_PLANS.map(p => ({
  ...p,
  status: 'active',       // 既存データは「現在進行中」として扱う
  year: CONFIG.CURRENT_YEAR,
}))

// 圃場の「現在の作付け」を取得するヘルパー
// ※ 同一圃場に複数のactiveがある場合は最新（id最大）を採用
function getCurrentCropCycle(cropCycles, fieldId) {
  const actives = cropCycles.filter(c => c.field_id === fieldId && c.status === 'active')
  if (actives.length === 0) return null
  return actives.reduce((a, b) => (b.id > a.id ? b : a))
}

// 圃場の作付け履歴を時系列（新しい順）で取得するヘルパー
function getCropCycleHistory(cropCycles, fieldId) {
  return cropCycles
    .filter(c => c.field_id === fieldId)
    .sort((a, b) => b.id - a.id)
}

// C06-4: EQUIP_LIST / EQUIP_DEFAULTS をモックデータセクションに集約
//         （Equipmentコンポーネント直前から移動）
const EQUIP_LIST = ['トラクター','スプレーヤー','田植え機','コンバイン','管理機']
const EQUIP_DEFAULTS = {
  'トラクター':    { rate: 25000, cost: 3000 },
  'スプレーヤー':  { rate: 15000, cost: 1500 },
  '田植え機':      { rate: 20000, cost: 2500 },
  'コンバイン':    { rate: 30000, cost: 4000 },
  '管理機':        { rate: 8000,  cost: 800  },
}

// =====================================================
// A-4: 共通サイドバーコンポーネント
// ナビアイテムをクリックで画面切り替え
// アクティブ状態ハイライト / アイコンはテキスト絵文字
// =====================================================
// =====================================================
// A-4: サイドバー（A案: 検索+2列グリッド）
// ・圃場を検索でフィルタリング
// ・2列グリッドで圃場ボタン一覧
// ・選択中圃場のサブメニューをグリッド下に展開
// ・「+ 追加」ボタンと各圃場の削除ボタン内蔵
// ・畝マップ想定: FIELD_SUB_ITEMS に 'rows' を追加済み
// =====================================================
// 【フェーズE・E-4 Step3】E-2確定版の並び順（dashboard→rows→daily→pesticide→harvest）に合わせて
// 「圃場ダッシュボード」を先頭に追加
