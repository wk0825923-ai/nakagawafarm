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
function _readFieldNoOverrides() {
  try { return JSON.parse(localStorage.getItem(FIELD_NO_OVERRIDE_KEY) || '{}') } catch { return {} }
}
function _writeFieldNoOverrides(next) {
  try { localStorage.setItem(FIELD_NO_OVERRIDE_KEY, JSON.stringify(next)) } catch {}
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
// GLOBALG.A.P. IFA（統合農場保証）／JGAP の主要管理点をベースにしたチェックリスト。
// auto: システムに記録があれば自動で達成扱いにする判定キー（isGapAutoCleared 参照）。
// 物理確認（施錠・手洗い設備・水質検査 等）は auto を付けず人手で確認する。
// ※ 正式な認証取得時は、取得する認証の最新版（GLOBALG.A.P. IFA v6 等）の公式チェックリストと最終照合すること。
const INITIAL_GAP_CHECKS = [
  // ── 記録・トレーサビリティ ──
  { id:1,  category:'記録・トレーサビリティ', item:'圃場ごとの作業記録の作成・保管（5年間）',        auto:'records_exist',  is_cleared:false },
  { id:2,  category:'記録・トレーサビリティ', item:'種苗→畝→農薬・肥料→収穫の追跡（トレーサビリティ）', auto:'traceability', is_cleared:false },
  { id:3,  category:'記録・トレーサビリティ', item:'収穫ロット番号の採番・記録',                      auto:'harvest_record', is_cleared:false },
  { id:4,  category:'記録・トレーサビリティ', item:'出荷先・出荷量の記録（引渡記録）',                auto:'shipment_record',is_cleared:false },
  // ── 種苗 ──
  { id:5,  category:'種苗',                  item:'種苗の入手先・品種・ロットの記録',                auto:'seed_lot',       is_cleared:false },
  { id:6,  category:'種苗',                  item:'自家育苗・購入苗の管理記録',                                             is_cleared:false },
  // ── 農薬（植物保護資材）──
  { id:7,  category:'農薬（植物保護資材）',   item:'農薬使用記録（作物・日付・希釈・散布量）の作成',  auto:'spray_record',   is_cleared:false },
  { id:8,  category:'農薬（植物保護資材）',   item:'登録農薬・適用作物・使用回数上限の整備',          auto:'pesticide_master',is_cleared:false },
  { id:9,  category:'農薬（植物保護資材）',   item:'農薬の購入・入庫・在庫記録の保管',                auto:'pest_purchase',  is_cleared:false },
  { id:10, category:'農薬（植物保護資材）',   item:'収穫前日数（PHI）の遵守確認',                                            is_cleared:false },
  { id:11, category:'農薬（植物保護資材）',   item:'農薬保管庫の施錠・分別保管',                                            is_cleared:false },
  { id:12, category:'農薬（植物保護資材）',   item:'PPE（防護具）の使用・保管',                                             is_cleared:false },
  { id:13, category:'農薬（植物保護資材）',   item:'IPM（総合的病害虫管理）の実施記録',                                     is_cleared:false },
  // ── 施肥・土壌管理 ──
  { id:14, category:'施肥・土壌管理',         item:'施肥記録（圃場・日付・肥料・量）の作成',          auto:'fert_record',    is_cleared:false },
  { id:15, category:'施肥・土壌管理',         item:'肥料・堆肥の購入・在庫記録の保管',                auto:'fert_purchase',  is_cleared:false },
  { id:16, category:'施肥・土壌管理',         item:'土壌診断・土壌管理の記録',                                              is_cleared:false },
  // ── 水管理 ──
  { id:17, category:'水管理',                item:'灌漑用水の水源・水質リスク評価（年1回以上）',                            is_cleared:false },
  { id:18, category:'水管理',                item:'水使用の記録',                                                          is_cleared:false },
  // ── 収穫・調製・衛生 ──
  { id:19, category:'収穫・調製・衛生',       item:'収穫・出荷記録の作成',                            auto:'harvest_record', is_cleared:false },
  { id:20, category:'収穫・調製・衛生',       item:'収穫・調製時の衛生管理（手洗い・容器の洗浄）',                          is_cleared:false },
  { id:21, category:'収穫・調製・衛生',       item:'作業者の衛生・健康管理',                                                is_cleared:false },
  // ── 労働安全・福祉 ──
  { id:22, category:'労働安全・福祉',         item:'作業者名簿・雇用記録の整備',                      auto:'worker_managed', is_cleared:false },
  { id:23, category:'労働安全・福祉',         item:'外国人技能実習生の在留資格（ビザ）管理',          auto:'trainee_visa',   is_cleared:false },
  { id:24, category:'労働安全・福祉',         item:'安全教育・多言語教育の実施記録',                                        is_cleared:false },
  { id:25, category:'労働安全・福祉',         item:'緊急時連絡先の掲示・救急用具の常備',                                    is_cleared:false },
  // ── 機械・器具の保守 ──
  { id:26, category:'機械・器具の保守',       item:'機械・器具の点検・整備記録',                      auto:'machine_maint',  is_cleared:false },
  { id:27, category:'機械・器具の保守',       item:'散布機・収穫機の洗浄記録（農薬残留防止）',        auto:'machine_maint',  is_cleared:false },
  // ── 環境・廃棄物 ──
  { id:28, category:'環境・廃棄物',           item:'廃棄物（農薬空容器・廃プラ）の分別・処理記録',                          is_cleared:false },
  { id:29, category:'環境・廃棄物',           item:'エネルギー・資源使用の把握',                                            is_cleared:false },
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
    case 'worker_managed':   return has(ctx.staff)
    case 'trainee_visa':     return (ctx.staff || []).some(s => s.role === 'trainee' && s.visa_expires_at)
    case 'traceability':     return has(ctx.harvestRecords) && lots().some(a => (a || []).length > 0)
    case 'seed_lot':         return lots().some(a => (a || []).some(l => l.seed_lot_no || l.variety))
    default:                 return false
  }
}

// 各GAP項目に「適用スキーム(JGAP/GGAP)」と「自動達成の根拠ラベル」を付与。
// 記録・帳票・トレーサビリティ系はJGAP/GGAP共通。IPM・エネルギー/資源はGGAP色が濃い(JGAPは推奨寄り)。
const _GAP_GGAP_LEANING = new Set([13, 29])
const _GAP_EVIDENCE = { records_exist:'作業記録', spray_record:'農薬散布記録', pesticide_master:'農薬マスタ', pest_purchase:'農薬仕入記録', fert_record:'施肥記録', fert_purchase:'肥料仕入記録', harvest_record:'収穫記録', shipment_record:'出荷記録', machine_maint:'機械整備記録', worker_managed:'作業者名簿', trainee_visa:'ビザ管理', traceability:'ロット追跡', seed_lot:'種苗ロット' }
INITIAL_GAP_CHECKS.forEach(c => {
  c.schemes  = _GAP_GGAP_LEANING.has(c.id) ? ['GGAP'] : ['JGAP', 'GGAP']
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
  const today  = new Date().toISOString().slice(0, 10)
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
