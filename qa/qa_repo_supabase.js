// qa_repo_supabase.js — フェーズ4 SupabaseRepository/ルーターの検証（Node・モックSupabase・本番未接続）
// 実Supabaseに触れず、read/write(upsert+差分delete)/subscribe/ルーター振り分け/安全ガードを検証。
const checks = []
const ok = (name, cond, extra) => checks.push({ name, pass: !!cond, extra: extra == null ? '' : String(extra) })

// ── モックSupabaseクライアント（実API準拠: select/delete がビルダー→eq/notでフィルタ→await実行） ──
function makeMockSb() {
  const tables = {}
  const api = {
    _tables: tables,
    _channels: [],
    _upsertLog: [],
    _upsertDelays: [],
    from(table) {
      tables[table] = tables[table] || []
      const q = {
        _table: table, _op: 'select', _filter: null, _notIn: null, _limit: null,
        select() { this._op = 'select'; return this },
        delete() { this._op = 'delete'; return this },
        eq(col, val) { this._filter = { col, val }; return this },
        in(col, vals) { this._in = { col, vals: vals.map(String) }; return this },
        not(col, op, listStr) {
          const vals = String(listStr).replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, ''))
          this._notIn = { col, vals }; return this
        },
        limit(n) { this._limit = n; return this },
        insert(rows) { tables[table].push(...rows.map(r => Object.assign({}, r))); return Promise.resolve({ error: null }) },
        upsert(rows, opts) {
          api._upsertLog.push(rows.map(r => Object.assign({}, r))) // 何行送られたかの検証用(R15)
          const cols = (opts && opts.onConflict ? opts.onConflict : 'id').split(',').map(s => s.trim())
          const apply = () => rows.forEach(nr => {
            const idx = tables[table].findIndex(er => cols.every(c => er[c] === nr[c]))
            if (idx >= 0) tables[table][idx] = Object.assign({}, nr) // 既存を更新（消さない）
            else tables[table].push(Object.assign({}, nr))
          })
          // _upsertDelaysに値があると通信遅延を再現（連続write逆転のR17/R18用）
          const d = api._upsertDelays.length ? api._upsertDelays.shift() : 0
          if (!d) { apply(); return Promise.resolve({ error: null }) }
          return new Promise(res => setTimeout(() => { apply(); res({ error: null }) }, d))
        },
        then(resolve) {
          if (this._op === 'delete') {
            let keep = tables[table]
            if (this._filter) {
              keep = keep.filter(r => {
                if (r[this._filter.col] !== this._filter.val) return true // 別farmは残す
                if (this._in) return this._in.vals.indexOf(String(r[this._in.col])) < 0 // in指定: リスト内keyだけ消す
                if (this._notIn) return this._notIn.vals.indexOf(r[this._notIn.col]) >= 0 // リスト内keyは残す
                return false // farm一致・追加条件なし＝消す
              })
            } else keep = []
            tables[table] = keep
            resolve({ data: null, error: null })
          } else {
            let rows = tables[table]
            if (this._filter) rows = rows.filter(r => r[this._filter.col] === this._filter.val)
            if (this._limit != null) rows = rows.slice(0, this._limit)
            resolve({ data: rows.map(r => Object.assign({}, r)), error: null })
          }
        },
      }
      return q
    },
    channel(name) {
      const ch = { _name: name, _cb: null,
        on(_ev, _opts, cb) { this._cb = cb; return this },
        subscribe() { api._channels.push(this); return this },
      }
      return ch
    },
    removeChannel() {},
    _emit(table) { this._channels.forEach(ch => { if (ch._name.indexOf(table) >= 0 && ch._cb) ch._cb({}) }) },
  }
  return api
}

global.sb = makeMockSb()
const { farmRepo, FarmRepositories, FarmRepoInternals } = require('../js/repository.js')
const { SupabaseRepository } = FarmRepositories

const ORG = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const FARM = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const KEY = 'farm_shipment_destinations_' + FARM

;(async () => {
  // 1) コレクション名/farmId 抽出
  ok('R1 キーからコレクション名とfarmIdを抽出',
    FarmRepoInternals.collectionOf(KEY) === 'farm_shipment_destinations' && FarmRepoInternals.farmIdOf(KEY) === FARM)

  // 2) ルーター既定は localStorage（何もrouteしていない＝挙動不変）
  ok('R2 既定ルーターはSupabaseへ向かない（未route時）', farmRepo.routes && Object.keys(farmRepo.routes).length === 0)

  // 3) 出荷先マスタを Supabase にrouteして write
  farmRepo.setContext({ orgId: ORG })
  farmRepo.route('farm_shipment_destinations', SupabaseRepository)
  const value = [
    { key: 'ja', label: 'JA木更津', frequent: true, sort_order: 0 },
    { key: 'yk', label: 'ヨーカドー', frequent: false, sort_order: 1 },
  ]
  const w = await farmRepo.write(KEY, value)
  const rowsInDb = global.sb._tables['farm_shipment_destinations'] || []
  ok('R3 write成功・DBに2行・org_id/farm_id付与',
    w.ok && rowsInDb.length === 2 && rowsInDb.every(r => r.org_id === ORG && r.farm_id === FARM),
    JSON.stringify({ ok: w.ok, n: rowsInDb.length }))

  // 4) readAsync で DB→アプリ形（配列・sort_order順）に復元
  const r = await farmRepo.readAsync(KEY)
  ok('R4 readAsyncでDB→アプリ形に復元（sort順・key/label保持）',
    r.ok && r.found && Array.isArray(r.value) && r.value.length === 2 &&
    r.value[0].key === 'ja' && r.value[0].label === 'JA木更津' && r.value[0].frequent === true &&
    r.value[1].key === 'yk',
    JSON.stringify(r.value))

  // 5) 差分同期: 別内容でwriteしたら今回に無い古いkeyは消える
  await farmRepo.write(KEY, [{ key: 'direct', label: '直売', frequent: false, sort_order: 0 }])
  const r2 = await farmRepo.readAsync(KEY)
  ok('R5 差分同期で今回に無い古い行が消える', r2.value.length === 1 && r2.value[0].key === 'direct', JSON.stringify(r2.value))

  // 6) subscribe: DB変更通知でコールバックに最新値が届く
  let pushed = null
  const unsub = farmRepo.subscribe(KEY, (val) => { pushed = val })
  global.sb._emit('farm_shipment_destinations')
  await new Promise(res => setTimeout(res, 20))
  ok('R6 リアルタイム購読で最新値が届く', Array.isArray(pushed) && pushed.length === 1 && pushed[0].key === 'direct', JSON.stringify(pushed))
  unsub()

  // 7) route解除で localStorage に戻る
  farmRepo.unroute('farm_shipment_destinations')
  ok('R7 unrouteでSupabase経路が外れる', Object.keys(farmRepo.routes).length === 0)

  // 8) 未対応コレクションをSupabaseへ向けたら ok:false（誤爆でデータ消失しない）
  farmRepo.route('farm_harvest_records', SupabaseRepository) // CONVERTER未実装
  const wBad = await farmRepo.write('farm_harvest_records_' + FARM, [{ id: 1 }])
  ok('R8 変換未実装コレクションはwrite失敗を返す（安全に弾く）', wBad && wBad.ok === false)
  farmRepo.unroute('farm_harvest_records')

  // ── フェーズ4 安全化(Codex指摘への対応)の検証 ──
  farmRepo.route('farm_shipment_destinations', SupabaseRepository)
  await farmRepo.write(KEY, [{ key: 'ja', label: 'JA木更津', frequent: true, sort_order: 0 }]) // 既知状態に

  // 9) org_id未確定なら write を中止し、DBを1行も消さない（暴発防止）
  farmRepo.setContext({ orgId: null })
  const beforeN = (global.sb._tables['farm_shipment_destinations'] || []).filter(r => r.farm_id === FARM).length
  const wNoOrg = await farmRepo.write(KEY, [{ key: 'zzz', label: 'ダミー' }])
  const afterN = (global.sb._tables['farm_shipment_destinations'] || []).filter(r => r.farm_id === FARM).length
  ok('R9 org_id未確定でwrite中止・既存を消さない(暴発防止)', wNoOrg.ok === false && beforeN === afterN && beforeN === 1, JSON.stringify({ ok: wNoOrg.ok, b: beforeN, a: afterN }))
  farmRepo.setContext({ orgId: ORG })

  // 10) 許可外farm_idは拒否（越境防止）
  farmRepo.setContext({ farmIds: ['99999999-9999-9999-9999-999999999999'] })
  const wCross = await farmRepo.write(KEY, [{ key: 'zzz', label: 'ダミー' }])
  ok('R10 許可外farm_idはwrite拒否(越境防止)', wCross.ok === false)
  farmRepo.setContext({ farmIds: null })

  // 11) 差分同期は自farmのみ触り、別farmの行は無傷
  global.sb._tables['farm_shipment_destinations'].push({ org_id: ORG, farm_id: 'other-farm', key: 'ot', label: '他農場', frequent: false, sort_order: 0 })
  await farmRepo.write(KEY, [{ key: 'ja', label: 'JA木更津', frequent: true, sort_order: 0 }])
  const others = global.sb._tables['farm_shipment_destinations'].filter(r => r.farm_id === 'other-farm')
  ok('R11 差分deleteは自farmのみ・別farmは無傷', others.length === 1 && others[0].key === 'ot')

  // 12) 同一keyのwriteは重複せず更新（upsert・insert失敗で全消しにならない設計の核）
  await farmRepo.write(KEY, [{ key: 'ja', label: 'JA木更津(更新)', frequent: false, sort_order: 0 }])
  const r12 = await farmRepo.readAsync(KEY)
  ok('R12 同一keyは重複せず更新される(upsert)', r12.value.length === 1 && r12.value[0].label === 'JA木更津(更新)', JSON.stringify(r12.value))

  // ── 行単位差分同期(スナップショット基準・Codex High「同時保存の相互消し」対応)の検証 ──
  const SK = 'farm_shipment_destinations|' + FARM
  const JA = { key: 'ja', label: 'JA木更津(更新)', frequent: false, sort_order: 0 }

  // 13) 2端末がほぼ同時に別々の行を追加しても、後勝ちが先の追加を消さない
  await farmRepo.readAsync(KEY) // 端末A/B共通の「読んだ状態」= {ja}
  const staleSnap = Object.assign({}, SupabaseRepository._snap[SK]) // 端末Bのstaleスナップショットを退避
  await farmRepo.write(KEY, [JA, { key: 'x', label: '端末Aの追加', frequent: false, sort_order: 1 }]) // 端末Aが x を追加
  SupabaseRepository._snap[SK] = staleSnap // 端末Bはまだ x を知らない状態を再現
  await farmRepo.write(KEY, [JA, { key: 'y', label: '端末Bの追加', frequent: false, sort_order: 2 }]) // 端末Bが y を追加
  const r13 = await farmRepo.readAsync(KEY)
  const keys13 = r13.value.map(d => d.key).sort()
  ok('R13 同時追加で先の端末の行が消えない(相互消し解消)',
    keys13.join(',') === 'ja,x,y', JSON.stringify(keys13))

  // 14) 削除はスナップショット基準で狙い撃ち（自分が消した行だけ・他端末の追加行は無傷）
  // 直前のreadAsyncでsnap={ja,x,y}。ここで ja だけ消す → x,y は残るべき
  await farmRepo.write(KEY, [
    { key: 'x', label: '端末Aの追加', frequent: false, sort_order: 1 },
    { key: 'y', label: '端末Bの追加', frequent: false, sort_order: 2 },
  ])
  const r14 = await farmRepo.readAsync(KEY)
  const keys14 = r14.value.map(d => d.key).sort()
  ok('R14 削除は自分が消した行だけ狙い撃ち(jaだけ消えx,yは残る)',
    keys14.join(',') === 'x,y', JSON.stringify(keys14))

  // 15) 未変更行はupsertに載せない（他端末で削除済みの行を蘇生させない・通信も最小）
  global.sb._upsertLog.length = 0
  await farmRepo.write(KEY, [
    { key: 'x', label: '端末Aの追加', frequent: false, sort_order: 1 },      // 未変更
    { key: 'y', label: '端末Bの追加(改名)', frequent: false, sort_order: 2 }, // 変更
  ])
  const sent = global.sb._upsertLog.length ? global.sb._upsertLog[0] : []
  ok('R15 未変更行はupsertに載らない(変更行yのみ送信)',
    global.sb._upsertLog.length === 1 && sent.length === 1 && sent[0].key === 'y', JSON.stringify(sent.map(s => s.key)))

  // 16) スナップショット未取得(初回読込前)ではdeleteを発行しない＝安全側でupsertのみ
  delete SupabaseRepository._snap[SK]
  await farmRepo.write(KEY, [{ key: 'x', label: '端末Aの追加', frequent: false, sort_order: 1 }]) // yに触れない
  const r16 = await farmRepo.readAsync(KEY)
  const keys16 = r16.value.map(d => d.key).sort()
  ok('R16 スナップショット無しではdeleteしない(yが残る)', keys16.join(',') === 'x,y', JSON.stringify(keys16))

  // ── 連続write直列化＋coalescing(Codex High「連続編集の逆転」対応)の検証 ──
  const X1 = (label) => [{ key: 'x', label, frequent: false, sort_order: 1 }, { key: 'y', label: '端末Bの追加', frequent: false, sort_order: 2 }]

  // 17) 通信の追い越しがあっても後の編集が最終値になる（1本目が遅く2本目が速い状況）
  await farmRepo.readAsync(KEY) // スナップショット最新化
  global.sb._upsertDelays = [40, 0] // 1本目のupsertだけ遅延
  const p17a = farmRepo.write(KEY, X1('連打1'))
  const p17b = farmRepo.write(KEY, X1('連打2'))
  await Promise.all([p17a, p17b])
  const r17 = await farmRepo.readAsync(KEY)
  const x17 = r17.value.find(d => d.key === 'x')
  ok('R17 連続writeは直列化され最後の編集がDBに残る(追い越し逆転なし)',
    x17 && x17.label === '連打2', JSON.stringify(x17))

  // 18) 実行中の連打は最新値だけ送る（中間値はスキップ・通信も節約）
  global.sb._upsertLog.length = 0
  global.sb._upsertDelays = [30]
  const p18 = Promise.all([farmRepo.write(KEY, X1('連打A')), farmRepo.write(KEY, X1('連打B')), farmRepo.write(KEY, X1('連打C'))])
  await p18
  const r18 = await farmRepo.readAsync(KEY)
  const x18 = r18.value.find(d => d.key === 'x')
  const sentLabels = global.sb._upsertLog.map(rows => (rows.find(r => r.key === 'x') || {}).label)
  ok('R18 実行中の連打は最新値だけ送る(中間値Bはスキップ)',
    x18 && x18.label === '連打C' && sentLabels.length === 2 && sentLabels[0] === '連打A' && sentLabels[1] === '連打C',
    JSON.stringify({ final: x18 && x18.label, sent: sentLabels }))
  farmRepo.unroute('farm_shipment_destinations')

  // ── 横展開テーブルの検証: gap_documents(オブジェクト形) / monthly_temps(singleton・1農場1行) ──
  const { SupabaseRepository: SR } = FarmRepositories

  // 19) gap_documents: アプリ形{docId:{...}}⇔DB行の往復＋差分更新
  farmRepo.route('farm_gap_documents', SR)
  const GKEY = 'farm_gap_documents_' + FARM
  const w19 = await farmRepo.write(GKEY, { doc1: { ready: true, updated: '2026-07-12', note: '整備済み' }, doc2: { ready: false, updated: '', note: '' } })
  const r19 = await farmRepo.readAsync(GKEY)
  ok('R19 gap_documents: オブジェクト形の往復(2文書・ready/updated/note保持)',
    w19.ok && r19.ok && r19.value.doc1 && r19.value.doc1.ready === true && r19.value.doc1.updated === '2026-07-12' &&
    r19.value.doc1.note === '整備済み' && r19.value.doc2 && r19.value.doc2.ready === false,
    JSON.stringify(r19.value))

  // 20) gap_documents: 片方だけ更新→もう片方は無傷(差分同期がオブジェクト形でも効く)
  await farmRepo.write(GKEY, { doc1: { ready: true, updated: '2026-07-12', note: '整備済み' }, doc2: { ready: true, updated: '2026-07-13', note: '完了' } })
  const r20 = await farmRepo.readAsync(GKEY)
  ok('R20 gap_documents: 差分更新(doc2のみ変更が反映・doc1無傷)',
    r20.value.doc2.ready === true && r20.value.doc2.updated === '2026-07-13' && r20.value.doc1.note === '整備済み',
    JSON.stringify(r20.value))
  farmRepo.unroute('farm_gap_documents')

  // 21) monthly_temps: singleton(1農場1行)の往復と更新
  farmRepo.route('farm_monthly_temps', SR)
  const TKEY = 'farm_monthly_temps_' + FARM
  const temps = [1, 2, 6, 12, 17, 21, 25, 26, 21, 15, 9, 3]
  const w21 = await farmRepo.write(TKEY, temps)
  const r21 = await farmRepo.readAsync(TKEY)
  const temps2 = temps.slice(); temps2[0] = -2
  await farmRepo.write(TKEY, temps2)
  const r21b = await farmRepo.readAsync(TKEY)
  const rowsT = global.sb._tables['farm_monthly_temps'].filter(r => r.farm_id === FARM)
  ok('R21 monthly_temps: singleton往復＋更新で行が増えない(常に1行)',
    w21.ok && r21.value.join(',') === temps.join(',') && r21b.value[0] === -2 && rowsT.length === 1,
    JSON.stringify({ v: r21b.value[0], rows: rowsT.length }))

  // 22) monthly_temps: 空配列write=行削除(singletonのremoved処理)
  await farmRepo.write(TKEY, [])
  const rowsT2 = global.sb._tables['farm_monthly_temps'].filter(r => r.farm_id === FARM)
  ok('R22 monthly_temps: 空writeでsingleton行が消える(他farmは無傷)', rowsT2.length === 0)
  farmRepo.unroute('farm_monthly_temps')

  const pass = checks.filter(c => c.pass).length
  const summary = { pass, total: checks.length, failed: checks.filter(c => !c.pass) }
  console.log('QAREPO_BEGIN'); console.log(JSON.stringify(summary, null, 1)); console.log('QAREPO_END')
  process.exit(pass === checks.length ? 0 : 1)
})()
