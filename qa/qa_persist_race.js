// qa_persist_race.js — usePersistState のレース＋読込前write保留ガード検証（Node・モックReact）
// 対象: js/components.js の usePersistState。
//  - remoteRef: subscribe経由のリモート更新後、遅延した readAsync の古い値で巻き戻さない
//  - loadedRef: DB経路(isAsync)では初回読込完了までユーザー編集を保留（初期値ベースの全置換でDBを壊さない）
//  - dirtyRef : localStorage経路の従来ガード維持（編集後の遅延ロードで巻き戻さない）
// 実行: cd qa && node qa_persist_race.js
const fs = require('fs')
const path = require('path')

const checks = []
const ok = (name, cond, extra) => checks.push({ name, pass: !!cond, extra: extra == null ? '' : String(extra) })

// ── components.js から usePersistState 関数だけを切り出す（ブラウザ専用の巨大ファイルはrequire不可のため） ──
const src = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'components.js'), 'utf8')
const start = src.indexOf('function usePersistState(key, initial) {')
if (start < 0) { console.error('usePersistState が見つからない'); process.exit(1) }
// 関数末尾: ブレース対応で閉じ位置を探す
let depth = 0, end = -1
for (let i = src.indexOf('{', start); i < src.length; i++) {
  if (src[i] === '{') depth++
  else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break } }
}
const fnSrc = src.slice(start, end)

// ── ミニReactランタイム（useState/useRef/useEffect/useCallbackだけの手作りフック） ──
function makeRuntime() {
  const hooks = []
  let cursor = 0
  let pendingEffects = []
  let component = null
  let lastResult = null
  let rendering = false
  let renderQueued = false
  const React = {
    useState(init) {
      const i = cursor++
      if (!(i in hooks)) hooks[i] = { v: typeof init === 'function' ? init() : init }
      const slot = hooks[i]
      const set = (updater) => {
        slot.v = typeof updater === 'function' ? updater(slot.v) : updater
        if (rendering) renderQueued = true
        else render()
      }
      return [slot.v, set]
    },
    useRef(init) {
      const i = cursor++
      if (!(i in hooks)) hooks[i] = { v: { current: init } }
      return hooks[i].v
    },
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
      hooks[i] = { deps, v: fn }
      return fn
    },
  }
  function render() {
    cursor = 0; pendingEffects = []; rendering = true; renderQueued = false
    lastResult = component()
    rendering = false
    // effect実行（クリーンアップ→本体。本物のReactと同じ順序感）
    const effs = pendingEffects; pendingEffects = []
    effs.forEach(({ i, fn }) => {
      if (hooks[i].cleanup) { try { hooks[i].cleanup() } catch (_) {} }
      const c = fn(); hooks[i].cleanup = typeof c === 'function' ? c : null
    })
    if (renderQueued) render()
    return lastResult
  }
  return { React, mount(fn) { component = fn; return render() }, render, get result() { return lastResult } }
}

// ── モックfarmRepo: readAsyncは手動resolve（遅延を再現）・subscribeはコールバックを外に晒す ──
// asyncMode=true でDB経路(isAsync→writeガード対象)、false でlocalStorage経路を再現。
function makeMockRepo(asyncMode) {
  const resolvers = [] // readAsync呼び出し順のキュー（農場切替レース再現用に古い読込を後から解決できる）
  let subCb = null
  const writes = []
  return {
    writes,
    isAsync() { return !!asyncMode },
    readSync() { return { ok: true, found: false, value: undefined } },
    readAsync() { return new Promise(r => { resolvers.push(r) }) },
    write(key, value) { writes.push(value); return Promise.resolve({ ok: true }) },
    subscribe(key, cb) { subCb = cb; return () => { subCb = null } },
    fireRemote(value) { if (subCb) subCb(value, { found: true }) },
    resolveInitialLoad(r) { const f = resolvers.shift(); if (f) f(r) }, // 最も古い未解決readを解決
  }
}

const tick = () => new Promise(r => setImmediate(r))
const build = (repo, keyBox) => {
  const rt = makeRuntime()
  const toasts = []
  const box = keyBox || { k: 'farm_x_1' }
  const showToast = (msg) => toasts.push(msg)
  const usePersistState = new Function('React', 'farmRepo', 'showToast', 'window', 'return ' + fnSrc)(rt.React, repo, showToast, {})
  rt.mount(() => usePersistState(box.k, ['initial']))
  return { rt, toasts }
}

;(async () => {
  // R1: [DB経路] リモート更新が先→遅延初期ロード(古い値)が後 → 巻き戻らない
  {
    const repo = makeMockRepo(true)
    const { rt } = build(repo)
    repo.fireRemote(['remote-new'])                        // ①リモート更新が届く
    repo.resolveInitialLoad({ ok: true, found: true, value: ['stale-db'] }) // ②古い初期ロードが遅れて到着
    await tick()
    const [state] = rt.result
    ok('R1: リモート更新後の遅延初期ロードで巻き戻らない', state[0] === 'remote-new', 'state=' + JSON.stringify(state))
  }

  // R2: [DB経路] リモート更新が無い通常時 → 初期ロードの値はちゃんと反映される
  {
    const repo = makeMockRepo(true)
    const { rt } = build(repo)
    repo.resolveInitialLoad({ ok: true, found: true, value: ['db-value'] })
    await tick()
    const [state] = rt.result
    ok('R2: 通常時は初期ロードの値が反映される', state[0] === 'db-value', 'state=' + JSON.stringify(state))
  }

  // R3: [DB経路] 初回読込前の編集は保留（write発生なし・トースト表示）→ 読込後の編集は通る
  {
    const repo = makeMockRepo(true)
    const { rt, toasts } = build(repo)
    const [, setPersist] = rt.result
    setPersist(['too-early'])                              // ①読込前に編集 → 保留されるべき
    await tick()
    const blockedState = rt.result[0]
    const blockedWrites = repo.writes.length
    repo.resolveInitialLoad({ ok: true, found: true, value: ['db-value'] }) // ②読込完了
    await tick()
    rt.result[1](['after-load'])                           // ③読込後の編集 → 通るべき
    await tick()
    const [state] = rt.result
    ok('R3a: 読込前の編集は保留される(state不変・write0件・トースト有)',
      blockedState[0] === 'initial' && blockedWrites === 0 && toasts.length === 1,
      'state=' + JSON.stringify(blockedState) + ' writes=' + blockedWrites + ' toasts=' + toasts.length)
    ok('R3b: 読込完了後の編集は通ってwriteされる',
      state[0] === 'after-load' && repo.writes.length === 1 && repo.writes[0][0] === 'after-load',
      'state=' + JSON.stringify(state) + ' writes=' + repo.writes.length)
  }

  // R4: [DB経路] リモート更新がstateに反映され、その後の編集は解禁される(リモート値=DB現在値)
  {
    const repo = makeMockRepo(true)
    const { rt } = build(repo)
    repo.fireRemote(['remote-value'])
    await tick()
    const afterRemote = rt.result[0]
    rt.result[1](['edit-after-remote'])
    await tick()
    const [state] = rt.result
    ok('R4: リモート更新が反映され、その後の編集も解禁される',
      afterRemote[0] === 'remote-value' && state[0] === 'edit-after-remote' && repo.writes.length === 1,
      'afterRemote=' + JSON.stringify(afterRemote) + ' state=' + JSON.stringify(state))
  }

  // R5: [localStorage経路] 同期読み済みなので編集は即時に通る（ガードが誤発動しない＝従来挙動不変）
  {
    const repo = makeMockRepo(false)
    const { rt, toasts } = build(repo)
    rt.result[1](['instant-edit'])
    await tick()
    const [state] = rt.result
    ok('R5: localStorage経路は読込待ちなしで編集できる(従来挙動)',
      state[0] === 'instant-edit' && repo.writes.length === 1 && toasts.length === 0,
      'state=' + JSON.stringify(state) + ' toasts=' + toasts.length)
  }

  // R6: [localStorage経路] 編集後に遅延readAsyncの古い値が届いても巻き戻らない(dirtyRef維持)
  {
    const repo = makeMockRepo(false)
    const { rt } = build(repo)
    rt.result[1](['user-edit'])
    repo.resolveInitialLoad({ ok: true, found: true, value: ['stale-db'] })
    await tick()
    const [state] = rt.result
    ok('R6: 編集後の遅延初期ロードで巻き戻らない(dirtyRef維持)', state[0] === 'user-edit', 'state=' + JSON.stringify(state))
  }

  // R7: [DB経路] 初回読込が失敗(オフライン等)した場合は編集は保留のまま（書けない状況で状態だけ進めない）
  {
    const repo = makeMockRepo(true)
    const { rt, toasts } = build(repo)
    repo.resolveInitialLoad({ ok: false, found: false, error: new Error('offline') })
    await tick()
    rt.result[1](['edit-while-offline'])
    await tick()
    const [state] = rt.result
    ok('R7: 読込失敗中の編集は保留(初期値のまま・write0件)',
      state[0] === 'initial' && repo.writes.length === 0 && toasts.length === 1,
      'state=' + JSON.stringify(state) + ' writes=' + repo.writes.length)
  }

  // R8: [DB経路] 農場切替レース — 農場Aの読込中にBへ切替→遅れてAの読込完了→Bの読込前の編集は保留のまま
  // （Codexレビュー High: 旧読込完了が新農場の編集ロックを解除してはならない）
  {
    const repo = makeMockRepo(true)
    const keyBox = { k: 'farm_x_A' }
    const { rt, toasts } = build(repo, keyBox)          // 農場Aの読込開始(未解決)
    keyBox.k = 'farm_x_B'; rt.render()                  // 農場Bへ切替(Aはcleanupでalive=false・Bの読込開始)
    repo.resolveInitialLoad({ ok: true, found: true, value: ['A-db'] }) // 遅れてAの読込完了
    await tick()
    rt.result[1](['edit-before-B-load'])                // Bの読込前に編集を試みる → 保留されるべき
    await tick()
    const blockedState = rt.result[0]
    const blockedWrites = repo.writes.length
    repo.resolveInitialLoad({ ok: true, found: true, value: ['B-db'] }) // Bの読込完了
    await tick()
    const [state] = rt.result
    ok('R8a: 旧農場の遅延読込完了では編集ロックが解除されない(切替レース)',
      blockedState[0] === 'initial' && blockedWrites === 0 && toasts.length === 1,
      'state=' + JSON.stringify(blockedState) + ' writes=' + blockedWrites + ' toasts=' + toasts.length)
    ok('R8b: 旧農場の値も混入せず、新農場の読込値が反映される',
      state[0] === 'B-db', 'state=' + JSON.stringify(state))
  }

  const pass = checks.filter(c => c.pass).length
  console.log('QAPERSISTRACE_START')
  checks.forEach(c => console.log((c.pass ? 'PASS' : 'FAIL') + ' ' + c.name + (c.extra ? ' [' + c.extra + ']' : '')))
  console.log(pass + '/' + checks.length)
  console.log('QAPERSISTRACE_END')
  process.exit(pass === checks.length ? 0 : 1)
})().catch(e => { console.error('RUNERR', e); process.exit(1) })
