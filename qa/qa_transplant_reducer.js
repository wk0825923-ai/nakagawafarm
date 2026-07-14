// qa_transplant_reducer.js — 定植ロット追記 appendTransplantLot の純粋関数QA（Codexレビュー29対応）
// setFarmLots(prev => appendTransplantLot(prev, ...)) を「異なる日報で2回・同じ基底stateへ直列適用」した時、
// 畝範囲が連続し重複しないこと=同時保存(Reactの関数更新直列化)でも安全なことを検証する。
// 実行: cd qa && node qa_transplant_reducer.js
const fs = require('fs'); const path = require('path')
const checks = []
const ok = (name, cond, extra) => checks.push({ name, pass: !!cond, extra: extra == null ? '' : String(extra) })

// config.js から appendTransplantLot、components.js から parseRowRange を切り出す
function extract(src, sig) {
  const start = src.indexOf(sig)
  if (start < 0) throw new Error('not found: ' + sig)
  let depth = 0, end = -1
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break } }
  }
  return src.slice(start, end)
}
const cfgSrc = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'config.js'), 'utf8')
const compSrc = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'components.js'), 'utf8')
const parseRowRange = new Function('return ' + extract(compSrc, 'function parseRowRange(rangeStr) {'))()
const appendTransplantLot = new Function('parseRowRange', 'return ' + extract(cfgSrc, 'function appendTransplantLot(farmLots, fieldId, sourceId, rows, lotFields, mkId) {'))(parseRowRange)

let idn = 0
const mkId = () => 'lot-' + (++idn)
const rangeSet = (farmLots, fid) => (farmLots[fid] || []).map(l => l.row_range)
const overlap = (arr) => { // どれか2つの畝範囲が畝番号を共有するか
  const sets = arr.map(rr => parseRowRange(rr))
  for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++)
    for (const v of sets[i]) if (sets[j].has(v)) return true
  return false
}

const F = 'field-1'
// ── R1: 異なる日報A・Bを同じ基底stateへ直列適用(関数更新の直列化を再現)→ 畝範囲が連続・重複しない ──
{
  const base = { [F]: [{ id: 'x', row_range: '1-10', source_record_id: 'old' }] } // 最大畝=10
  const s1 = appendTransplantLot(base, F, 'a', 5, { variety: 'A' }, mkId) // A: 11-15
  const s2 = appendTransplantLot(s1, F, 'b', 5, { variety: 'B' }, mkId)   // B(s1基準): 16-20
  const ranges = rangeSet(s2, F)
  ok('R1 異なる日報の直列適用: 畝範囲が連続(11-15,16-20)し重複しない',
    ranges.length === 3 && ranges.includes('11-15') && ranges.includes('16-20') && !overlap(ranges),
    JSON.stringify(ranges))
}
// ── R1-bad: アンチパターン(同じ基底から2回計算=関数更新の外でusedMax計算)だと畝範囲が重複する ──
{
  const base = { [F]: [{ id: 'x', row_range: '1-10', source_record_id: 'old' }] }
  const a = appendTransplantLot(base, F, 'a', 5, { variety: 'A' }, mkId) // base基準: 11-15
  const b = appendTransplantLot(base, F, 'b', 5, { variety: 'B' }, mkId) // 同じbase基準: 11-15(重複!)
  const merged = [...(a[F]), ...(b[F].filter(l => l.source_record_id === 'b'))].map(l => l.row_range)
  ok('R1-bad 同一基底から2回計算すると重複する(=なぜ関数更新内で直列化が必要かの反証)',
    overlap(merged) === true, JSON.stringify(merged))
}
// ── R2: 同一 source_record_id の再適用は追記しない(二重生成防止) ──
{
  const base = { [F]: [] }
  const s1 = appendTransplantLot(base, F, 'a', 3, { variety: 'A' }, mkId) // 1-3
  const s2 = appendTransplantLot(s1, F, 'a', 3, { variety: 'A' }, mkId)   // 同一a → 追記なし
  ok('R2 同一source_record_idの再適用は追記しない(二重生成防止)',
    (s1[F].length === 1) && (s2[F].length === 1) && s2[F][0].row_range === '1-3', JSON.stringify(rangeSet(s2, F)))
}
// ── R3: 単一畝(rows=1)は '1' 形式、ロット無し圃場は 1 始まり ──
{
  const s = appendTransplantLot({}, F, 'a', 1, { variety: 'A' }, mkId)
  ok('R3 ロット無し圃場に1畝→ row_range="1"・status=growing・source_record_id保持',
    s[F].length === 1 && s[F][0].row_range === '1' && s[F][0].status === 'growing' && s[F][0].source_record_id === 'a',
    JSON.stringify(s[F][0]))
}

const pass = checks.filter(c => c.pass).length
console.log('QATRANSREDUCER_START')
checks.forEach(c => console.log((c.pass ? 'PASS' : 'FAIL') + ' ' + c.name + (c.extra ? ' [' + c.extra + ']' : '')))
console.log(pass + '/' + checks.length)
console.log('QATRANSREDUCER_END')
process.exit(pass === checks.length ? 0 : 1)
