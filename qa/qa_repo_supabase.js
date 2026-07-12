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
        _table: table, _op: 'select', _filters: [], _in: null, _notIn: null, _limit: null, _patch: null, _returning: false,
        // update/delete後の.select()は「変更行を返す」指定(実API準拠)。それ以外は読み取り
        select() { if (this._op === 'update' || this._op === 'delete') this._returning = true; else this._op = 'select'; return this },
        update(patch) { this._op = 'update'; this._patch = patch; return this },
        delete() { this._op = 'delete'; return this },
        eq(col, val) { this._filters.push({ col, val }); return this },
        in(col, vals) { this._in = { col, vals: vals.map(String) }; return this },
        not(col, op, listStr) {
          const vals = String(listStr).replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, ''))
          this._notIn = { col, vals }; return this
        },
        limit(n) { this._limit = n; return this },
        insert(rows) {
          // 偽23505の再現(PK以外のunique制約違反。R31用): 行は存在しないのに23505が返る状況
          if (api._forceInsert23505) { api._forceInsert23505 = false; return Promise.resolve({ error: { code: '23505', message: 'duplicate key value violates unique constraint "other_uniq"' } }) }
          // PK重複は23505(実DBのunique violation)を再現 → 冪等createの検証用
          const dup = rows.some(nr => nr.id != null && tables[table].some(er => String(er.id) === String(nr.id)))
          if (dup) return Promise.resolve({ error: { code: '23505', message: 'duplicate key value' } })
          tables[table].push(...rows.map(r => Object.assign({}, r))); return Promise.resolve({ error: null })
        },
        upsert(rows, opts) {
          api._upsertLog.push(rows.map(r => Object.assign({}, r))) // 何行送られたかの検証用(R15)
          const cols = (opts && opts.onConflict ? opts.onConflict : 'id').split(',').map(s => s.trim())
          const apply = () => rows.forEach(nr => {
            const idx = tables[table].findIndex(er => cols.every(c => String(er[c]) === String(nr[c])))
            // 実PostgREST準拠: on conflict do update は「渡した列だけ」更新(渡さない列=在庫残高等は保持)
            if (idx >= 0) tables[table][idx] = Object.assign({}, tables[table][idx], nr)
            else tables[table].push(Object.assign({}, nr))
          })
          // _upsertDelaysに値があると通信遅延を再現（連続write逆転のR17/R18用）
          const d = api._upsertDelays.length ? api._upsertDelays.shift() : 0
          if (!d) { apply(); return Promise.resolve({ error: null }) }
          return new Promise(res => setTimeout(() => { apply(); res({ error: null }) }, d))
        },
        then(resolve) {
          const match = (r) => this._filters.every(f => String(r[f.col]) === String(f.val))
          if (this._op === 'delete') {
            const removed = []
            tables[table] = tables[table].filter(r => {
              if (this._filters.length && !match(r)) return true // 条件外は残す
              if (this._in && this._in.vals.indexOf(String(r[this._in.col])) < 0) return true // in指定: リスト内だけ消す
              if (this._notIn && this._notIn.vals.indexOf(r[this._notIn.col]) >= 0) return true // リスト内keyは残す
              removed.push(Object.assign({}, r)); return false
            })
            resolve({ data: this._returning ? removed : null, error: null })
          } else if (this._op === 'update') {
            const hit = []
            tables[table] = tables[table].map(r => {
              if (!match(r)) return r
              const nr = Object.assign({}, r, this._patch); hit.push(Object.assign({}, nr)); return nr
            })
            resolve({ data: this._returning ? hit : null, error: null })
          } else {
            let rows = tables[table].filter(r => match(r))
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

  // ── 記録系CRUD(整備記録パイロット・設計書: create/update/remove＋version楽観ロック＋冪等) ──
  farmRepo.route('farm_maintenance_records', SR)
  const MC = 'farm_maintenance_records'
  const MREC = { id: 'aaaa1111-0000-0000-0000-000000000001', date: '2026-07-12', machine_name: 'トラクター', machine_no: 'T-01', mtype: '点検', result: '異常なし', worker: '今福', note: '' }

  // 23) create: 1行insert・org/farm/version付与・fromRowで返る
  const c23 = await farmRepo.create(MC, FARM, MREC)
  const mRows = () => global.sb._tables[MC].filter(r => r.farm_id === FARM)
  ok('R23 create: 1行追加(org/farm/version=1付与)',
    c23.ok && c23.record && c23.record.version === 1 && mRows().length === 1 && mRows()[0].org_id === ORG,
    JSON.stringify({ ok: c23.ok, n: mRows().length }))

  // 24) createの冪等性: 同じidの再送(通信リトライ)は二重登録せず成功扱い
  const c24 = await farmRepo.create(MC, FARM, MREC)
  ok('R24 create再送は冪等(duplicate=ok・行は増えない)', c24.ok && c24.duplicate === true && mRows().length === 1,
    JSON.stringify({ ok: c24.ok, dup: c24.duplicate, n: mRows().length }))

  // 25) update: versionが合えば更新されversionが上がる
  const u25 = await farmRepo.update(MC, FARM, MREC.id, { note: 'オイル交換' }, 1)
  ok('R25 update: version一致で更新・version+1', u25.ok && mRows()[0].note === 'オイル交換' && mRows()[0].version === 2,
    JSON.stringify({ ok: u25.ok, v: mRows()[0].version }))

  // 26) update: 古いversion(既に他端末が更新)はconflictで拒否・値は変わらない
  const u26 = await farmRepo.update(MC, FARM, MREC.id, { note: '古い編集' }, 1)
  ok('R26 update: version不一致はconflict(無言の上書きなし)', !u26.ok && u26.conflict === true && mRows()[0].note === 'オイル交換',
    JSON.stringify({ ok: u26.ok, conflict: u26.conflict }))

  // 27) remove: version不一致はconflict / 一致で削除 / 再送は冪等ok
  const d27a = await farmRepo.remove(MC, FARM, MREC.id, 1)
  const d27b = await farmRepo.remove(MC, FARM, MREC.id, 2)
  const d27c = await farmRepo.remove(MC, FARM, MREC.id, 2)
  ok('R27 remove: 版ズレconflict→一致で削除→再送は冪等ok',
    !d27a.ok && d27a.conflict === true && d27b.ok && mRows().length === 0 && d27c.ok && d27c.alreadyGone === true,
    JSON.stringify({ a: d27a.conflict, b: d27b.ok, c: d27c.alreadyGone, n: mRows().length }))

  // 28) 越境ガード: 許可外farmへのcreateは拒否
  farmRepo.setContext({ farmIds: ['99999999-9999-9999-9999-999999999999'] })
  const c28 = await farmRepo.create(MC, FARM, Object.assign({}, MREC, { id: 'aaaa1111-0000-0000-0000-000000000002' }))
  farmRepo.setContext({ farmIds: null })
  ok('R28 create: 許可外farmは拒否(越境防止)', !c28.ok && mRows().length === 0)

  // 29) 記録系への全置換write()は禁止(削除意図の誤推測で他端末の記録を消さない)
  const w29 = await farmRepo.write(MC + '_' + FARM, [])
  ok('R29 記録系への全置換writeは拒否される', w29.ok === false && String(w29.error && w29.error.message).indexOf('create/update/remove') >= 0,
    String(w29.error && w29.error.message))
  farmRepo.unroute('farm_maintenance_records')

  // 30) 出荷記録(記録系CRUD第2弾): 往復＋数値/日付の型保持＋version更新＋削除
  farmRepo.route('farm_shipment_records', SR)
  const SC = 'farm_shipment_records'
  const SREC = { id: 'bbbb2222-0000-0000-0000-000000000001', date: '2026-07-12', variety: 'シスコ', harvest_date: '2026-07-10', lot_code: '(45)07100106', dest: 'JA木更津', cases: 12, note: '' }
  const c30 = await farmRepo.create(SC, FARM, SREC)
  const r30 = await farmRepo.readAsync(SC + '_' + FARM)
  const got30 = r30.value.find(x => x.id === SREC.id)
  const u30 = await farmRepo.update(SC, FARM, SREC.id, { cases: 15 }, 1)
  const r30b = await farmRepo.readAsync(SC + '_' + FARM)
  const d30 = await farmRepo.remove(SC, FARM, SREC.id, 2)
  // 31) 偽23505(PK以外のunique違反): 同idの行が実在しない23505は冪等成功にせず失敗を返す
  global.sb._forceInsert23505 = true
  const c31 = await farmRepo.create(SC, FARM, Object.assign({}, SREC, { id: 'bbbb2222-0000-0000-0000-000000000099' }))
  ok('R31 行が実在しない23505は冪等成功にしない(本当の不整合を隠さない)',
    c31.ok === false && global.sb._tables[SC].filter(r => r.farm_id === FARM && r.id === 'bbbb2222-0000-0000-0000-000000000099').length === 0,
    JSON.stringify({ ok: c31.ok }))

  ok('R30 出荷記録CRUD: 往復(cases数値/lot_code/日付保持)＋version更新＋削除',
    c30.ok && got30 && got30.cases === 12 && got30.lot_code === '(45)07100106' && got30.harvest_date === '2026-07-10' &&
    u30.ok && r30b.value[0].cases === 15 && r30b.value[0].version === 2 && d30.ok &&
    global.sb._tables[SC].filter(r => r.farm_id === FARM).length === 0,
    JSON.stringify({ got: got30, after: r30b.value[0] }))
  farmRepo.unroute('farm_shipment_records')

  // 32) 農薬マスタ(マスタUUID化第1弾): id保持upsert往復・legacy_id保持・在庫列に触れない
  farmRepo.route('farm_pesticides', SR)
  const PKEY = 'farm_pesticides_' + FARM
  const PID = 'cccc3333-0000-0000-0000-000000000001'
  // DB側に在庫残高がある状態を再現(在庫列はconverterが触れない=保持されるべき)
  global.sb._tables['farm_pesticides'] = [{ id: PID, org_id: ORG, farm_id: FARM, name: 'ダントツ', reg_no: '21501', dilution: 1000, max_times: 3, preharvest_days: 7, target_crop: 'レタス', stock_l: 18, legacy_id: 3 }]
  const r32 = await farmRepo.readAsync(PKEY)
  const p32 = r32.value[0]
  await farmRepo.write(PKEY, [Object.assign({}, p32, { dilution: 1500 })]) // 希釈倍率だけ変更
  const rowP = global.sb._tables['farm_pesticides'].find(r => r.id === PID)
  ok('R32 農薬マスタ: 往復でid/legacy_id保持・更新反映・DBの在庫列(stock_l)を上書きしない',
    r32.ok && p32.id === PID && p32.legacy_id === 3 && p32.dilution === 1000 &&
    rowP.dilution === 1500 && rowP.stock_l === 18 && rowP.legacy_id === 3,
    JSON.stringify({ app: p32, db: { dilution: rowP.dilution, stock_l: rowP.stock_l } }))
  farmRepo.unroute('farm_pesticides')

  // 33) 肥料マスタ(マスタUUID化第2弾): 往復・配合肥料(blend_components jsonb)保持・在庫列不干渉
  farmRepo.route('farm_fertilizers', SR)
  const FKEY = 'farm_fertilizers_' + FARM
  const FID = 'dddd4444-0000-0000-0000-000000000001'
  global.sb._tables['farm_fertilizers'] = [{ id: FID, org_id: ORG, farm_id: FARM, name: '配合セットA', maker: 'JA',
    weight_per_bag_kg: 20, price_per_bag_yen: 3000, unit_price_yen_per_kg: 150, stock_kg: 300,
    blend_components: [{ fertilizer_id: 2, bags: 6 }, { fertilizer_id: 3, bags: 1 }], weight_unconfirmed: false, legacy_id: 9 }]
  const r33 = await farmRepo.readAsync(FKEY)
  const f33 = r33.value[0]
  await farmRepo.write(FKEY, [Object.assign({}, f33, { maker: '全農' })]) // maker だけ変更
  const rowF = global.sb._tables['farm_fertilizers'].find(r => r.id === FID)
  ok('R33 肥料マスタ: 往復でid/legacy_id/blend_components保持・更新反映・在庫列(stock_kg)不干渉',
    r33.ok && f33.id === FID && f33.legacy_id === 9 && Array.isArray(f33.blend_components) && f33.blend_components.length === 2 &&
    rowF.maker === '全農' && rowF.stock_kg === 300 && rowF.legacy_id === 9 && Array.isArray(rowF.blend_components),
    JSON.stringify({ app: { legacy: f33.legacy_id, blend: f33.blend_components }, db: { maker: rowF.maker, stock_kg: rowF.stock_kg } }))
  farmRepo.unroute('farm_fertilizers')

  // 34) 圃場マスタ(マスタUUID化第3弾): 往復・crop_categoryキー名変換・boundary/legacy_id保持・not null jsonb
  farmRepo.route('farm_fields_v2', SR)
  const FLKEY = 'farm_fields_v2_' + FARM
  const FLID = 'eeee5555-0000-0000-0000-000000000001'
  global.sb._tables['farm_fields'] = [{ id: FLID, org_id: ORG, farm_id: FARM, name: '第1圃場', field_no: '1',
    area_are: 60, crop: 'レタス', crop_category_key: 'leaf_veg', lat: 35.4, lng: 139.9, status: '栽培中', color: '#0D9972',
    row_count: 41, crop_specific_details: {}, rice_stage_dates: {}, area_name: '上望陀', address: '木更津市', emaff_no: '1234567890123',
    gap_target: true, boundary: [[35.4, 139.9], [35.41, 139.91]], legacy_id: 1 }]
  const r34 = await farmRepo.readAsync(FLKEY)
  const fl = r34.value[0]
  await farmRepo.write(FLKEY, [Object.assign({}, fl, { row_count: 45 })]) // 畝数だけ変更
  const rowFl = global.sb._tables['farm_fields'].find(r => r.id === FLID)
  ok('R34 圃場マスタ: 往復(crop_category変換/boundary/legacy_id保持)＋更新反映＋jsonb not null適合',
    r34.ok && fl.id === FLID && fl.crop_category === 'leaf_veg' && fl.legacy_id === 1 &&
    Array.isArray(fl.boundary) && fl.boundary.length === 2 && fl.gap_target === true &&
    rowFl.row_count === 45 && rowFl.crop_category_key === 'leaf_veg' && rowFl.legacy_id === 1 &&
    rowFl.crop_specific_details != null && Array.isArray(rowFl.boundary),
    JSON.stringify({ app: { cat: fl.crop_category, legacy: fl.legacy_id, b: fl.boundary && fl.boundary.length }, db: { rc: rowFl.row_count, cat: rowFl.crop_category_key } }))
  farmRepo.unroute('farm_fields_v2')

  // 35) 畝ロット(マスタUUID化第4弾): {圃場ID:[lots]}のflatten⇔group往復・レガシー行ガード・jsonb既定
  farmRepo.route('farm_lots', SR)
  const LKEY = 'farm_lots_' + FARM
  const LFLD = 'eeee5555-0000-0000-0000-000000000001' // R34の圃場uuid
  const LID = 'ffff6666-0000-0000-0000-000000000001'
  global.sb._tables['farm_lots'] = []
  const lotsValue = {}
  lotsValue[LFLD] = [
    { id: LID, field_id: LFLD, row_range: '1-3', variety: 'シスコ', status: 'growing', seed_date: '2026-05-01', legacy_id: 11 },
    { id: 9001, field_id: 1, row_range: '4-6', variety: 'ラプター', status: 'growing' }, // レガシー行(数値ID)=DBに送らない
  ]
  // レガシー行(数値ID)が混在 → 黙殺せず保存全体を失敗させる(fail-closed・Codexレビュー7 High対応)
  const w35bad = await farmRepo.write(LKEY, lotsValue)
  const dbAfterBad = global.sb._tables['farm_lots'].filter(r => r.farm_id === FARM)
  ok('R35a 畝ロット: 旧形式ID行が混在したら保存全体を明示的に失敗(黙って消さない)',
    w35bad.ok === false && String(w35bad.error && w35bad.error.message).indexOf('旧形式ID') >= 0 && dbAfterBad.length === 0,
    JSON.stringify({ ok: w35bad.ok, db: dbAfterBad.length }))

  // 純uuidのみなら成功(flatten⇔group往復・source_record_id/legacy_id保持・jsonb配列既定)
  const lotsClean = {}
  lotsClean[LFLD] = [{ id: LID, field_id: LFLD, row_range: '1-3', variety: 'シスコ', status: 'growing', seed_date: '2026-05-01', legacy_id: 11, source_record_id: 45123 }]
  const w35 = await farmRepo.write(LKEY, lotsClean)
  const dbLots = global.sb._tables['farm_lots'].filter(r => r.farm_id === FARM)
  const r35 = await farmRepo.readAsync(LKEY)
  const grp = r35.value[LFLD] || []
  ok('R35b 畝ロット: flatten往復＋group復元＋source_record_id/legacy_id保持＋jsonb配列既定',
    w35.ok && dbLots.length === 1 && dbLots[0].id === LID && dbLots[0].field_id === LFLD &&
    Array.isArray(dbLots[0].pretransplant_pesticides) && dbLots[0].data_note === '' && dbLots[0].source_record_id === '45123' &&
    r35.ok && grp.length === 1 && grp[0].id === LID && grp[0].variety === 'シスコ' && grp[0].legacy_id === 11 &&
    grp[0].source_record_id === '45123' && grp[0].status === 'growing' && Array.isArray(grp[0].fertilizer_refs),
    JSON.stringify({ db: dbLots.length, app: grp[0] && { id: grp[0].id, src: grp[0].source_record_id, legacy: grp[0].legacy_id } }))
  farmRepo.unroute('farm_lots')

  const pass = checks.filter(c => c.pass).length
  const summary = { pass, total: checks.length, failed: checks.filter(c => !c.pass) }
  console.log('QAREPO_BEGIN'); console.log(JSON.stringify(summary, null, 1)); console.log('QAREPO_END')
  process.exit(pass === checks.length ? 0 : 1)
})()
