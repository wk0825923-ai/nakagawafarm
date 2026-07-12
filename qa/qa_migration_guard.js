// qa_migration_guard.js — フェーズ4安全化: runMigration の冪等ガード検証（Node・モック）
// 対象farmに既存データがあると再実行を中断して二重挿入を防ぐことを確認。
const M = require('../js/migration.js')
const checks = []
const ok = (name, cond, extra) => checks.push({ name, pass: !!cond, extra: extra == null ? '' : String(extra) })

const ORG = '11111111-1111-1111-1111-111111111111'
const FARM = '22222222-2222-2222-2222-222222222222'
// 最小の移行プラン（farm_fields に1行）
const plan = { plans: { farm_fields: [{ id: 'f1', org_id: ORG, farm_id: FARM, name: '第1圃場' }] }, warnings: [] }

const makeSb = (seedExisting, opts) => {
  const t = {}
  opts = opts || {}
  return {
    _tables: t,
    from(table) {
      t[table] = t[table] || []
      if (seedExisting && table === 'farm_fields') t[table] = [{ id: 'x', farm_id: FARM }]
      const q = { _f: null, _n: null,
        select() { return this }, eq(c, v) { this._f = { c, v }; return this }, limit(n) { this._n = n; return this },
        insert(rows) {
          if (opts.insertFailTable === table) return Promise.resolve({ error: { message: 'insert失敗(モック)' } })
          t[table].push(...rows); return Promise.resolve({ error: null })
        },
        then(res) {
          if (opts.selectError) { res({ data: null, error: { message: '読込失敗(モック)' } }); return }
          let rows = t[table]; if (this._f) rows = rows.filter(r => r[this._f.c] === this._f.v); if (this._n) rows = rows.slice(0, this._n); res({ data: rows, error: null })
        } }
      return q
    },
  }
}

;(async () => {
  const guarded = await M.runMigration(makeSb(true), plan, {})
  ok('G14 既存データありなら再実行を中断(二重挿入防止)', guarded.aborted === true && guarded.existing.indexOf('farm_fields') >= 0, JSON.stringify({ ab: guarded.aborted, ex: guarded.existing }))

  const fresh = await M.runMigration(makeSb(false), plan, {})
  ok('G15 空DBなら通常insert(中断しない)', fresh.aborted === false && (fresh.inserted.farm_fields || 0) === 1, JSON.stringify({ ab: fresh.aborted, ins: fresh.inserted.farm_fields }))

  const forced = await M.runMigration(makeSb(true), plan, { force: true })
  ok('G16 force:trueなら既存ありでも実行', forced.aborted === false, JSON.stringify({ ab: forced.aborted }))

  const dry = await M.runMigration(makeSb(true), plan, { dryRun: true })
  ok('G17 dryRunは中断せず件数のみ', dry.dryRun === true && dry.aborted === false && dry.inserted.farm_fields === 1)

  // 18) fail-closed: 既存確認の照会が失敗したら「既存なし」扱いにせず中断(Codex High対応)
  const sbErr = makeSb(false, { selectError: true })
  const closed = await M.runMigration(sbErr, plan, {})
  ok('G18 既存確認が読めない時は移行を始めない(fail-closed)',
    closed.aborted === true && Array.isArray(closed.unknown) && closed.unknown.indexOf('farm_fields') >= 0 && (sbErr._tables.farm_fields || []).length === 0,
    JSON.stringify({ ab: closed.aborted, unknown: closed.unknown, inserted: (sbErr._tables.farm_fields || []).length }))

  // 19) 途中失敗で全停止: 後続テーブルへ進まず、再開位置と復旧方法を結果に残す(Codex Med対応)
  const plan3 = { plans: {
    farm_fields: [{ id: 'f1', org_id: ORG, farm_id: FARM, name: '第1圃場' }],
    farm_staff:  [{ id: 's1', org_id: ORG, farm_id: FARM, name: '作業者' }],
    farm_lots:   [{ id: 'l1', org_id: ORG, farm_id: FARM }],
  }, warnings: [] }
  const sbMid = makeSb(false, { insertFailTable: 'farm_staff' })
  const mid = await M.runMigration(sbMid, plan3, {})
  ok('G19 途中失敗で全停止・後続テーブルに進まない・再開情報あり',
    mid.aborted === true && mid.failedTable === 'farm_staff' &&
    mid.inserted.farm_fields === 1 && mid.inserted.farm_lots == null &&
    Array.isArray(mid.remaining) && mid.remaining.indexOf('farm_lots') >= 0 &&
    (sbMid._tables.farm_lots || []).length === 0 &&
    mid.errors.some(e => String(e.error).indexOf('復旧') >= 0),
    JSON.stringify({ ab: mid.aborted, failed: mid.failedTable, remaining: mid.remaining, lots: (sbMid._tables.farm_lots || []).length }))

  const pass = checks.filter(c => c.pass).length
  console.log('QAGUARD_BEGIN'); console.log(JSON.stringify({ pass, total: checks.length, failed: checks.filter(c => !c.pass) }, null, 1)); console.log('QAGUARD_END')
  process.exit(pass === checks.length ? 0 : 1)
})()
