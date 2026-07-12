// =====================================================
// repository.js — データの出し入れを1か所に集約する「変換アダプタ」（フルスタック移行フェーズ2〜4）
//
// ねらい: アプリ画面は「farmRepo という窓口」だけを見る。窓口の中身(localStorage/Supabase)は
//   キー単位で差し替えられる。差し替えても画面は1行も変わらない（＝電源変換アダプタ）。
//
// 契約(interface): どの実装も次を持つ。
//   readSync(key)      -> { ok, found, value, error }         同期読み（localStorageのみ・初期表示のちらつき防止）
//   readAsync(key)     -> Promise<{ ok, found, value, error }> 非同期読み（Supabase/localStorage共通）
//   write(key, value)  -> { ok, error } または Promise<同>     保存成否を返す
//   subscribe(key, cb) -> unsubscribe()                        別の場所での更新を購読（別タブ同期 / リアルタイム）
// =====================================================
(function (global) {
  'use strict'

  // ── コレクション名⇔テーブル対応（フェーズ1の照合表） ──
  // key は 'farm_xxx_<farmId(uuid)>' 形式。末尾uuidを外した部分がコレクション名。
  const KEY_TABLE = {
    farm_fields_v2: 'farm_fields', farm_staff: 'farm_staff',
    farm_pesticides: 'farm_pesticides', farm_fertilizers: 'farm_fertilizers',
    farm_crop_categories: 'farm_crop_categories', farm_shipment_destinations: 'farm_shipment_destinations',
    farm_lots: 'farm_lots', farm_records: 'farm_work_records',
    farm_lot_spray_records: 'farm_lot_spray_records', farm_top_dressing_records: 'farm_top_dressing_records',
    farm_harvest_records: 'farm_harvest_records', farm_shipment_records: 'farm_shipment_records',
    farm_maintenance_records: 'farm_maintenance_records', farm_trainee_diaries: 'farm_trainee_diaries',
    farm_today_tasks: 'farm_today_tasks', farm_rentals: 'farm_rentals', farm_crop_plans: 'farm_crop_plans',
    farm_pesticide_purchases: 'farm_pesticide_purchases', farm_fertilizer_purchases: 'farm_fertilizer_purchases',
    farm_gap: 'farm_gap_checks', farm_gap_documents: 'farm_gap_documents', farm_monthly_temps: 'farm_monthly_temps',
    farm_field_performance_comments: 'farm_field_performance_comments', farm_crop_comments: 'farm_crop_comments',
  }
  const UUID_TAIL = /_([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/
  const collectionOf = (key) => key.replace(UUID_TAIL, '')
  const farmIdOf = (key) => { const m = key.match(UUID_TAIL); return m ? m[1] : null }

  // ── 実装その1: localStorage（現状維持の土台） ──
  const LocalStorageRepository = {
    kind: 'localStorage',
    readSync(key) {
      try {
        const raw = localStorage.getItem(key)
        return { ok: true, found: raw != null, value: raw != null ? JSON.parse(raw) : undefined }
      } catch (e) {
        return { ok: false, found: false, value: undefined, error: e }
      }
    },
    read(key) { return this.readSync(key) }, // 後方互換
    readAsync(key) { return Promise.resolve(this.readSync(key)) },
    write(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return { ok: true } }
      catch (e) { return { ok: false, error: e } }
    },
    subscribe(key, cb) {
      if (typeof window === 'undefined') return function () {}
      const handler = function (e) {
        if (e.key !== key) return
        try { cb(e.newValue != null ? JSON.parse(e.newValue) : undefined, { found: e.newValue != null }) }
        catch (_) { /* 壊れた値は無視 */ }
      }
      window.addEventListener('storage', handler)
      return function () { window.removeEventListener('storage', handler) }
    },
  }

  // ── コレクションごとの「DB行⇔アプリ形」変換（フェーズ4で1テーブルずつ実装して横展開） ──
  // アプリはコレクション全体(配列/オブジェクト)を扱う。DBは行の集合。両者を相互変換する。
  const CONVERTERS = {
    // 出荷先マスタ（参照なし・列名もほぼ一致＝最初に切り替える一番やさしいテーブル）
    farm_shipment_destinations: {
      conflict: 'farm_id,key', // upsertの衝突キー（DBに unique(farm_id,key) あり）＝全置換をやめて安全に同期
      toRows(value, ctx) {
        return (Array.isArray(value) ? value : []).map(d => ({
          org_id: ctx.orgId, farm_id: ctx.farmId,
          key: String(d.key == null ? '' : d.key), label: String(d.label == null ? '' : d.label),
          frequent: !!d.frequent, sort_order: Number.isFinite(Number(d.sort_order)) ? Math.trunc(Number(d.sort_order)) : 0,
        }))
      },
      fromRows(rows) {
        return (rows || [])
          .slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          .map(r => ({ key: r.key, label: r.label, frequent: !!r.frequent, sort_order: r.sort_order || 0 }))
      },
    },
  }

  const getSb = () => (typeof sb !== 'undefined' && sb) ? sb
    : (typeof global !== 'undefined' && global.sb) ? global.sb : null

  // ── 実装その2: Supabase（本物のDB。端末をまたいで同期する） ──
  const SupabaseRepository = {
    kind: 'supabase',
    _ctx: { orgId: null, farmIds: null },
    // 端末が最後に見たDB状態のスナップショット { 'table|farmId': { keyVal: 行JSON } }。
    // writeはこの差分だけを送る＝他端末が同時に追加した行を「自分の画面に無いから」と消さない(Codex High対応)。
    _snap: {},
    setContext(ctx) { this._ctx = Object.assign({}, this._ctx, ctx || {}) },
    _snapshotOf(conv, table, farmId, value) {
      const keyCol = conv.conflict ? conv.conflict.split(',').map(s => s.trim()).filter(c => c !== 'farm_id')[0] : null
      if (!keyCol) return null
      const ns = {}
      conv.toRows(value, { orgId: this._ctx.orgId, farmId }).forEach(rw => { ns[String(rw[keyCol])] = JSON.stringify(rw) })
      return ns
    },

    // farm_idがキーから取れて、かつ許可された農場かを検証（誤キー/改竄キーで別農場を触らせない）
    _checkFarm(farmId) {
      if (!farmId) return '書き込み先のfarm_idが不明（キー不正）'
      if (Array.isArray(this._ctx.farmIds) && this._ctx.farmIds.length && this._ctx.farmIds.indexOf(farmId) < 0)
        return '許可されていないfarm_id: ' + farmId
      return null
    },

    // 同期読みは非対応（DBは非同期）。初期値で描き始め、readAsyncで最新化する。
    readSync() { return { ok: true, found: false, value: undefined } },

    async readAsync(key) {
      const collection = collectionOf(key), farmId = farmIdOf(key)
      const table = KEY_TABLE[collection], conv = CONVERTERS[collection]
      const client = getSb()
      if (!table || !conv || !client) return { ok: false, found: false, error: new Error('未対応コレクション: ' + collection) }
      const bad = this._checkFarm(farmId); if (bad) return { ok: false, found: false, error: new Error(bad) }
      try {
        const { data, error } = await client.from(table).select('*').eq('farm_id', farmId)
        if (error) return { ok: false, found: false, error }
        const value = conv.fromRows(data)
        // 読めた=この端末が知るDBの最新状態としてスナップショット更新（次回writeの差分基準）
        try { const ns = this._snapshotOf(conv, table, farmId, value); if (ns) this._snap[table + '|' + farmId] = ns } catch (_) {}
        return { ok: true, found: true, value }
      } catch (e) { return { ok: false, found: false, error: e } }
    },

    // ── 連続編集の逆転防止(Codex High対応): キー単位でwriteを直列化し、待機中は最新値だけ送る ──
    // 「A→B→C」と速く編集した時、通信の追い越しで画面はCなのにDBがBで止まる事故を防ぐ。
    // 実行中に来た値はキューに1つだけ保持し、さらに新しい値が来たら置き換える(中間値は送らない=coalescing)。
    _wq: {},
    write(key, value) {
      const st = this._wq[key] || (this._wq[key] = { busy: false, next: null })
      if (st.busy) {
        if (st.next) { st.next.value = value; return st.next.promise } // より新しい値で置換(結果Promiseは共有)
        const nx = { value: value, resolve: null, promise: null }
        nx.promise = new Promise(res => { nx.resolve = res })
        st.next = nx
        return nx.promise
      }
      st.busy = true
      return this._pump(key, st, value)
    },
    _pump(key, st, value) {
      const self = this
      return this._writeOnce(key, value)
        .catch(e => ({ ok: false, error: e })) // 万一の例外でもキューを詰まらせない
        .then(res => {
          const nx = st.next
          if (nx) { st.next = null; self._pump(key, st, nx.value).then(nx.resolve); return res }
          st.busy = false
          return res
        })
    },
    async _writeOnce(key, value) {
      const collection = collectionOf(key), farmId = farmIdOf(key)
      const table = KEY_TABLE[collection], conv = CONVERTERS[collection]
      const client = getSb()
      const orgId = this._ctx.orgId
      if (!table || !conv || !client) return { ok: false, error: new Error('未対応コレクション: ' + collection) }
      // 安全ガード: org_id/farm_id が未確定・不許可なら「絶対に何も書かない」（暴発でデータを消さない）
      if (!orgId) return { ok: false, error: new Error('org_idが未確定のため書き込み中止') }
      const bad = this._checkFarm(farmId); if (bad) return { ok: false, error: new Error(bad) }
      try {
        const rows = conv.toRows(value, { orgId, farmId })
        if (conv.conflict) {
          // ── 行単位の差分同期(スナップショット基準・Codex High対応) ──
          // 「前回このwrite元がDBから読んだ状態」との差分だけ送る:
          //   変更/追加された行のみupsert・スナップショットにあって今回に無い行のみ狙い撃ちdelete。
          // 現DB全体との突き合わせ(delete not-in)をやめたので、他端末が同時に追加した行は
          // この端末の画面に無くても消えない。未変更行は送らない＝他端末で削除済みの行を蘇生させない。
          const keyCol = conv.conflict.split(',').map(s => s.trim()).filter(c => c !== 'farm_id')[0]
          const snapKey = table + '|' + farmId
          const snap = this._snap[snapKey] || null
          const changed = snap ? rows.filter(rw => snap[String(rw[keyCol])] !== JSON.stringify(rw)) : rows
          if (changed.length) {
            const up = await client.from(table).upsert(changed, { onConflict: conv.conflict })
            if (up.error) return { ok: false, error: up.error }
          }
          if (snap && keyCol) {
            const newKeys = {}
            rows.forEach(rw => { newKeys[String(rw[keyCol])] = true })
            const removed = Object.keys(snap).filter(k => !newKeys[k])
            if (removed.length) {
              const del = await client.from(table).delete().eq('farm_id', farmId).in(keyCol, removed)
              if (del.error) return { ok: false, error: del.error }
            }
          }
          // ※スナップショット未取得(初回読込前)はupsertのみ・deleteなし＝安全側。
          //   アプリ経路ではloadedRefガードにより必ずreadAsync成功後にしかwriteされない。
          try { const ns = this._snapshotOf(conv, table, farmId, value); if (ns) this._snap[snapKey] = ns } catch (_) {}
          return { ok: true }
        }
        // conflictキーが無いコレクション(記録系)は現状フォールバックの全置換。
        // ※記録系の本番切替はCRUD粒度化とセット(フェーズ4後半)。それまで route しない。
        const del = await client.from(table).delete().eq('farm_id', farmId)
        if (del.error) return { ok: false, error: del.error }
        if (rows.length) { const ins = await client.from(table).insert(rows); if (ins.error) return { ok: false, error: ins.error } }
        return { ok: true }
      } catch (e) { return { ok: false, error: e } }
    },

    subscribe(key, cb) {
      const collection = collectionOf(key), farmId = farmIdOf(key)
      const table = KEY_TABLE[collection]
      const client = getSb()
      if (!table || !client || !client.channel) return function () {}
      try {
        // チャンネル名は購読ごとに一意化: 同一キーを複数箇所が購読した時に同名topicの二重joinで
        // 2本目が死ぬ(実測: CHANNEL_ERROR)のを防ぐ。realtimeサーバ側はtopic名でなくfilterで配信判定する。
        const ch = client.channel('rt_' + table + '_' + farmId + '_' + Math.random().toString(36).slice(2, 10))
          .on('postgres_changes', { event: '*', schema: 'public', table: table, filter: 'farm_id=eq.' + farmId }, async () => {
            const r = await SupabaseRepository.readAsync(key)
            if (r.ok && r.found) cb(r.value, { found: true })
          })
          .subscribe()
        return function () { try { client.removeChannel(ch) } catch (_) {} }
      } catch (e) { return function () {} }
    },
  }

  // ── ルーター: キー(コレクション)ごとに実装を振り分ける窓口 ──
  // 既定は全部 localStorage（＝今の挙動）。route() で特定コレクションだけ Supabase へ向ける。
  function makeRouter() {
    const routes = {} // collection -> repository
    const pick = (key) => routes[collectionOf(key)] || LocalStorageRepository
    return {
      kind: 'router',
      routes,
      route(collection, repo) { routes[collection] = repo; return this },
      unroute(collection) { delete routes[collection]; return this },
      setContext(ctx) { SupabaseRepository.setContext(ctx); return this },
      // 非同期ソース(DB)か？ usePersistStateが「初回読込完了までwrite保留」ガードの要否判定に使う
      isAsync(key) { return pick(key).kind === 'supabase' },
      readSync(key) { const r = pick(key); return r.readSync ? r.readSync(key) : { ok: true, found: false } },
      readAsync(key) { const r = pick(key); return Promise.resolve(r.readAsync ? r.readAsync(key) : r.readSync(key)) },
      write(key, value) { return pick(key).write(key, value) },
      subscribe(key, cb) { return pick(key).subscribe(key, cb) },
    }
  }

  const router = makeRouter()
  // ▼ フェーズ4の実切り替えはここに1テーブルずつ足す。setContextはapp.js起動時に配線済み。
  // 【既定ON】出荷先マスタはDB経路が既定(2026-07-12・Codexゲート条件=行単位差分同期を実装済み)。
  //   問題が出た端末は ?dbdest=0 を付けて開くと旧経路(localStorage)へ退避できる(記憶される)。
  //   ?dbdest=1 で退避を解除。node(QAハーネス)ではrouteしない=テストが自分で管理する。
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('dbdest')
      if (q === '0') localStorage.setItem('sb_route_dest_off', '1')
      if (q === '1') localStorage.removeItem('sb_route_dest_off')
      if (localStorage.getItem('sb_route_dest_off') !== '1') router.route('farm_shipment_destinations', SupabaseRepository)
    }
  } catch (_) { /* localStorage不可環境では従来挙動(localStorage経路)のまま */ }

  global.farmRepo = router
  global.FarmRepositories = { LocalStorageRepository, SupabaseRepository }
  global.FarmRepoInternals = { KEY_TABLE, CONVERTERS, collectionOf, farmIdOf, makeRouter }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this))

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof global !== 'undefined')
    ? { farmRepo: global.farmRepo, FarmRepositories: global.FarmRepositories, FarmRepoInternals: global.FarmRepoInternals }
    : {}
}
