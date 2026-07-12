// qa_record_hook.js — useRecordCollection（記録系CRUDフック）の検証（Node・モックReact/farmRepo）
// 検証: 楽観的更新＋失敗ロールバック / UUID自動発行 / version渡し / conflictで再読込 / ID単位リアルタイム適用
// 実行: cd qa && node qa_record_hook.js
const fs = require('fs')
const path = require('path')
const checks = []
const ok = (name, cond, extra) => checks.push({ name, pass: !!cond, extra: extra == null ? '' : String(extra) })

// ── components.js から useRecordCollection を切り出し ──
const src = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'components.js'), 'utf8')
const start = src.indexOf('function useRecordCollection(collection, farmId, initial) {')
if (start < 0) { console.error('useRecordCollection が見つからない'); process.exit(1) }
let depth = 0, end = -1
for (let i = src.indexOf('{', start); i < src.length; i++) {
  if (src[i] === '{') depth++
  else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break } }
}
const fnSrc = src.slice(start, end)

// ── ミニReactランタイム（qa_persist_race.jsと同じ手作りフック） ──
function makeRuntime() {
  const hooks = []
  let cursor = 0, pendingEffects = [], component = null, lastResult = null, rendering = false, renderQueued = false
  const React = {
    useState(init) {
      const i = cursor++
      if (!(i in hooks)) hooks[i] = { v: typeof init === 'function' ? init() : init }
      const slot = hooks[i]
      const set = (u) => { slot.v = typeof u === 'function' ? u(slot.v) : u; if (rendering) renderQueued = true; else render() }
      return [slot.v, set]
    },
    useRef(init) { const i = cursor++; if (!(i in hooks)) hooks[i] = { v: { current: init } }; return hooks[i].v },
    useEffect(fn, deps) {
      const i = cursor++
      const prev = hooks[i]
      const changed = !prev || !deps || !prev.deps || deps.some((d, k) => d !== prev.deps[k])
      hooks[i] = { deps, cleanup: prev ? prev.cleanup : null }
      if (changed) pendingEffects.push({ i, fn })
    },
    useCallback(fn, deps) {
      const i = cursor++
      const prev = hooks[i]
      if (prev && deps && prev.deps && deps.every((d, k) => d === prev.deps[k])) return prev.v
      hooks[i] = { deps, v: fn }; return fn
    },
  }
  function render() {
    cursor = 0; pendingEffects = []; rendering = true; renderQueued = false
    lastResult = component()
    rendering = false
    const effs = pendingEffects; pendingEffects = []
    effs.forEach(({ i, fn }) => { if (hooks[i].cleanup) { try { hooks[i].cleanup() } catch (_) {} } const c = fn(); hooks[i].cleanup = typeof c === 'function' ? c : null })
    if (renderQueued) render()
    return lastResult
  }
  return { React, mount(fn) { component = fn; return render() }, render, get result() { return lastResult } }
}

// ── モックfarmRepo（記録系contract） ──
function makeRepo(opts) {
  opts = opts || {}
  let rowsCb = null
  const readResolvers = []   // deferRead時: 読込を手動resolveして遅延を再現
  const removeResolvers = [] // deferRemove時: 削除完了を手動resolve
  const calls = { create: [], remove: [], update: [], readAsync: 0 }
  return {
    calls,
    isAsync() { return true }, // DB経路を再現
    readSync() { return { ok: true, found: false, value: undefined } },
    readAsync() {
      calls.readAsync++
      if (opts.deferRead) return new Promise(r => readResolvers.push(r))
      return Promise.resolve({ ok: true, found: true, value: (opts.dbList || []).slice() })
    },
    resolveRead(r) { const f = readResolvers.shift(); if (f) f(r) },
    create(collection, farmId, rec) { calls.create.push(rec); return Promise.resolve(opts.createResult || { ok: true, record: rec }) },
    update(collection, farmId, id, patch, ev) { calls.update.push({ id, patch, ev }); return Promise.resolve(opts.updateResult || { ok: true }) },
    remove(collection, farmId, id, ev) {
      calls.remove.push({ id, ev })
      if (opts.deferRemove) return new Promise(r => removeResolvers.push(r))
      return Promise.resolve(opts.removeResult || { ok: true })
    },
    resolveRemove(r) { const f = removeResolvers.shift(); if (f) f(r) },
    subscribeRows(collection, farmId, cb) { rowsCb = cb; return () => { rowsCb = null } },
    fireRows(evt) { if (rowsCb) rowsCb(evt) },
  }
}

const tick = () => new Promise(r => setImmediate(r))
const build = (repo, farmBox) => {
  const rt = makeRuntime()
  const toasts = []
  const box = farmBox || { f: 'farm-1' }
  const useRecordCollection = new Function('React', 'farmRepo', 'showToast', 'console', 'return ' + fnSrc)(rt.React, repo, m => toasts.push(m), { warn: () => {} })
  rt.mount(() => useRecordCollection('farm_maintenance_records', box.f, []))
  return { rt, toasts, render: () => rt.render() }
}

;(async () => {
  const REC = { id: 'u-1', date: '2026-07-12', machine_name: 'トラクター', version: 1 }

  // H1: add成功 → 楽観反映が残り、UUIDが自動発行され、createに渡る
  {
    const repo = makeRepo({ dbList: [] })
    const { rt } = build(repo); await tick()
    const res = await rt.result.add({ date: '2026-07-12', machine_name: '収穫機' })
    await tick()
    const id = repo.calls.create[0] && repo.calls.create[0].id
    ok('H1 add成功: 楽観反映＋UUID自動発行＋create呼び出し',
      res.ok && rt.result.list.length === 1 && typeof id === 'string' && id.length >= 13,
      JSON.stringify({ n: rt.result.list.length, id }))
  }

  // H2: add失敗 → ロールバック(listから消える)＋トースト
  {
    const repo = makeRepo({ dbList: [], createResult: { ok: false, error: new Error('offline') } })
    const { rt, toasts } = build(repo); await tick()
    const res = await rt.result.add({ date: '2026-07-12', machine_name: '収穫機' })
    await tick()
    ok('H2 add失敗: ロールバックされ祝福対象にならない(ok:false)＋トースト',
      !res.ok && rt.result.list.length === 0 && toasts.length === 1,
      JSON.stringify({ n: rt.result.list.length, toasts: toasts.length }))
  }

  // H3: removeById成功 → 楽観削除・expectedVersionにversionが渡る
  {
    const repo = makeRepo({ dbList: [REC] })
    const { rt } = build(repo); await tick()
    const res = await rt.result.removeById('u-1')
    await tick()
    ok('H3 remove成功: 楽観削除＋versionを楽観ロックに渡す',
      res.ok && rt.result.list.length === 0 && repo.calls.remove[0].ev === 1,
      JSON.stringify(repo.calls.remove[0]))
  }

  // H4: removeがconflict → 再読込で最新に戻し・警告トースト
  {
    const repo = makeRepo({ dbList: [REC], removeResult: { ok: false, conflict: true } })
    const { rt, toasts } = build(repo); await tick()
    const before = repo.calls.readAsync
    await rt.result.removeById('u-1')
    await tick()
    ok('H4 removeのconflict: 最新を再読込(list復元)＋案内トースト',
      repo.calls.readAsync > before && rt.result.list.length === 1 && toasts.length === 1,
      JSON.stringify({ reads: repo.calls.readAsync - before, n: rt.result.list.length }))
  }

  // H5: updateById成功 → 楽観反映＋version+1、失敗(通信)ならロールバック
  {
    const repo = makeRepo({ dbList: [REC] })
    const { rt } = build(repo); await tick()
    await rt.result.updateById('u-1', { note: 'オイル交換' })
    await tick()
    const okCase = rt.result.list[0].note === 'オイル交換' && rt.result.list[0].version === 2
    const repo2 = makeRepo({ dbList: [REC], updateResult: { ok: false, error: new Error('offline') } })
    const b2 = build(repo2); await tick()
    await b2.rt.result.updateById('u-1', { note: '失敗する編集' })
    await tick()
    ok('H5 update: 成功で楽観反映+version+1 / 通信失敗はロールバック',
      okCase && b2.rt.result.list[0].note !== '失敗する編集' && b2.rt.result.list[0].version === 1,
      JSON.stringify({ okCase, rolled: b2.rt.result.list[0] }))
  }

  // H6: リアルタイムのID単位適用(INSERT/UPDATE/DELETE/replace)
  {
    const repo = makeRepo({ dbList: [REC] })
    const { rt } = build(repo); await tick()
    repo.fireRows({ type: 'INSERT', record: { id: 'u-2', machine_name: '別端末の追加', version: 1 } })
    const afterIns = rt.result.list.length
    repo.fireRows({ type: 'UPDATE', record: { id: 'u-1', machine_name: '別端末の更新', version: 2 } })
    const afterUpd = rt.result.list.find(x => x.id === 'u-1').machine_name
    repo.fireRows({ type: 'DELETE', id: 'u-2' })
    const afterDel = rt.result.list.length
    repo.fireRows({ type: 'replace', list: [] })
    ok('H6 リアルタイム: INSERT/UPDATE/DELETE/replaceをID単位で適用',
      afterIns === 2 && afterUpd === '別端末の更新' && afterDel === 1 && rt.result.list.length === 0,
      JSON.stringify({ afterIns, afterUpd, afterDel, final: rt.result.list.length }))
  }

  // H7: 農場切替 — 一覧が即リセットされ、旧農場の遅延読込は適用されず、新農場0件なら空のまま
  // （Codexレビュー4 High-1: 前農場の記録が新農場に表示され続ける穴）
  {
    const repo = makeRepo({ deferRead: true })
    const box = { f: 'farm-1' }
    const { rt } = build(repo, box); await tick()
    repo.resolveRead({ ok: true, found: true, value: [REC] }) // 農場Aの読込完了
    await tick()
    const onA = rt.result.list.length
    box.f = 'farm-2'; rt.render()                              // 農場Bへ切替(Bの読込はまだ)
    const justAfterSwitch = rt.result.list.length              // 即リセットされているべき
    repo.resolveRead({ ok: true, found: false, value: undefined }) // 農場Bは0件(found:false)
    await tick()
    const onB = rt.result.list.length
    ok('H7 農場切替: 一覧が即リセット・新農場0件でも空(前農場の記録が残らない)',
      onA === 1 && justAfterSwitch === 0 && onB === 0,
      JSON.stringify({ onA, justAfterSwitch, onB }))
  }

  // H7b: 切替後に旧農場の遅延読込が届いても新農場の一覧に混ざらない(世代トークン)
  {
    const repo = makeRepo({ deferRead: true })
    const box = { f: 'farm-1' }
    const { rt } = build(repo, box); await tick()               // 農場Aの読込は未解決のまま
    box.f = 'farm-2'; rt.render()                               // Bへ切替(A・Bの読込が両方未解決)
    repo.resolveRead({ ok: true, found: true, value: [REC] })   // 遅れてAの読込完了(古い世代)
    await tick()
    const stale = rt.result.list.length                         // 混ざっていないべき
    repo.resolveRead({ ok: true, found: false, value: undefined }) // Bの読込完了(0件)
    await tick()
    ok('H7b 旧農場の遅延読込は新農場に混ざらない(世代トークン)',
      stale === 0 && rt.result.list.length === 0, JSON.stringify({ stale, final: rt.result.list.length }))
  }

  // H8: Realtime受信後に遅い初期読込が返っても巻き戻さない（High-2: usePersistStateのremoteRef同型）
  {
    const repo = makeRepo({ deferRead: true })
    const { rt } = build(repo); await tick()                    // 初期読込は未解決
    repo.fireRows({ type: 'INSERT', record: { id: 'u-9', machine_name: 'RTで先に届いた行', version: 1 } })
    repo.resolveRead({ ok: true, found: true, value: [] })      // 遅れて古い初期読込(空)が到着
    await tick()
    ok('H8 Realtime受信後の遅延初期読込で巻き戻らない',
      rt.result.list.length === 1 && rt.result.list[0].id === 'u-9', JSON.stringify(rt.result.list))
  }

  // H9: CRUD実行中に農場切替 → 失敗ロールバックが新農場の一覧に作用しない
  {
    const repo = makeRepo({ deferRead: true, deferRemove: true })
    const box = { f: 'farm-1' }
    const { rt } = build(repo, box); await tick()
    repo.resolveRead({ ok: true, found: true, value: [REC] })   // 農場A読込済み(u-1の1件)
    await tick()
    const p = rt.result.removeById('u-1')                       // 楽観削除(通信は未完了)
    box.f = 'farm-2'; rt.render()                               // 削除の返事を待たずBへ切替
    repo.resolveRead({ ok: true, found: false, value: undefined }) // 農場Bは0件
    await tick()
    repo.resolveRemove({ ok: false, error: new Error('offline') }) // Aの削除が失敗→ロールバック発動
    await p; await tick()
    ok('H9 CRUD実行中の農場切替: 失敗ロールバックの復活行が新農場に混ざらない',
      rt.result.list.length === 0, JSON.stringify(rt.result.list.map(x => x.id)))
  }

  const pass = checks.filter(c => c.pass).length
  console.log('QARECORDHOOK_START')
  checks.forEach(c => console.log((c.pass ? 'PASS' : 'FAIL') + ' ' + c.name + (c.extra ? ' [' + c.extra + ']' : '')))
  console.log(pass + '/' + checks.length)
  console.log('QARECORDHOOK_END')
  process.exit(pass === checks.length ? 0 : 1)
})().catch(e => { console.error('RUNERR', e); process.exit(1) })
