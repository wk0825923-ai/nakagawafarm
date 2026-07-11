// qa_persist_race.js — usePersistState の「遅延初期ロード vs リモート更新」レース検証（Node・モックReact）
// 対象: js/components.js の usePersistState。remoteRef 追加で、subscribe経由のリモート更新の後に
// 遅れて届いた古い readAsync 結果が state を巻き戻さないことを確認する。
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
function makeMockRepo() {
  let resolveRead = null
  let subCb = null
  return {
    readSync() { return { ok: true, found: false, value: undefined } },
    readAsync() { return new Promise(r => { resolveRead = r }) },
    write() { return Promise.resolve({ ok: true }) },
    subscribe(key, cb) { subCb = cb; return () => { subCb = null } },
    fireRemote(value) { if (subCb) subCb(value, { found: true }) },
    resolveInitialLoad(r) { if (resolveRead) { const f = resolveRead; resolveRead = null; f(r) } },
  }
}

const tick = () => new Promise(r => setImmediate(r))

;(async () => {
  // R1: リモート更新が先→遅延初期ロード(古い値)が後 → 巻き戻らない（今回の修正の本丸）
  {
    const rt = makeRuntime()
    const repo = makeMockRepo()
    const usePersistState = new Function('React', 'farmRepo', 'showToast', 'window', 'return ' + fnSrc)(rt.React, repo, () => {}, {})
    rt.mount(() => usePersistState('farm_x_1', ['initial']))
    repo.fireRemote(['remote-new'])                        // ①リモート更新が届く
    repo.resolveInitialLoad({ ok: true, found: true, value: ['stale-db'] }) // ②古い初期ロードが遅れて到着
    await tick()
    const [state] = rt.result
    ok('R1: リモート更新後の遅延初期ロードで巻き戻らない', state[0] === 'remote-new', 'state=' + JSON.stringify(state))
  }

  // R2: リモート更新が無い通常時 → 初期ロードの値はちゃんと反映される（ガードが効きすぎない）
  {
    const rt = makeRuntime()
    const repo = makeMockRepo()
    const usePersistState = new Function('React', 'farmRepo', 'showToast', 'window', 'return ' + fnSrc)(rt.React, repo, () => {}, {})
    rt.mount(() => usePersistState('farm_x_1', ['initial']))
    repo.resolveInitialLoad({ ok: true, found: true, value: ['db-value'] })
    await tick()
    const [state] = rt.result
    ok('R2: 通常時は初期ロードの値が反映される', state[0] === 'db-value', 'state=' + JSON.stringify(state))
  }

  // R3: ユーザー編集が先→遅延初期ロードが後 → 既存dirtyRefガードが引き続き効く（デグレなし）
  {
    const rt = makeRuntime()
    const repo = makeMockRepo()
    const usePersistState = new Function('React', 'farmRepo', 'showToast', 'window', 'return ' + fnSrc)(rt.React, repo, () => {}, {})
    rt.mount(() => usePersistState('farm_x_1', ['initial']))
    const [, setPersist] = rt.result
    setPersist(['user-edit'])
    repo.resolveInitialLoad({ ok: true, found: true, value: ['stale-db'] })
    await tick()
    const [state] = rt.result
    ok('R3: ユーザー編集後の遅延初期ロードで巻き戻らない(既存ガード維持)', state[0] === 'user-edit', 'state=' + JSON.stringify(state))
  }

  // R4: リモート更新自体はstateに反映される（ガードを足しても購読追随は生きている）
  {
    const rt = makeRuntime()
    const repo = makeMockRepo()
    const usePersistState = new Function('React', 'farmRepo', 'showToast', 'window', 'return ' + fnSrc)(rt.React, repo, () => {}, {})
    rt.mount(() => usePersistState('farm_x_1', ['initial']))
    repo.fireRemote(['remote-value'])
    await tick()
    const [state] = rt.result
    ok('R4: リモート更新がstateに反映される', state[0] === 'remote-value', 'state=' + JSON.stringify(state))
  }

  const pass = checks.filter(c => c.pass).length
  console.log('QAPERSISTRACE_START')
  checks.forEach(c => console.log((c.pass ? 'PASS' : 'FAIL') + ' ' + c.name + (c.extra ? ' [' + c.extra + ']' : '')))
  console.log(pass + '/' + checks.length)
  console.log('QAPERSISTRACE_END')
  process.exit(pass === checks.length ? 0 : 1)
})().catch(e => { console.error('RUNERR', e); process.exit(1) })
