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
    // ── 記録系CRUD(同contract): localStorage版は配列を読み→1行操作→書き戻す ──
    _recordList(collection, farmId) {
      const key = collection + '_' + farmId
      const r = this.readSync(key)
      return { key, arr: (r.ok && r.found && Array.isArray(r.value)) ? r.value : [] }
    },
    createRecord(collection, farmId, record) {
      const { key, arr } = this._recordList(collection, farmId)
      if (arr.some(x => String(x.id) === String(record.id))) return { ok: true, duplicate: true, record } // 冪等
      const w = this.write(key, arr.concat([record]))
      return w.ok ? { ok: true, record } : w
    },
    updateRecord(collection, farmId, id, patch, expectedVersion) {
      const { key, arr } = this._recordList(collection, farmId)
      const idx = arr.findIndex(x => String(x.id) === String(id))
      if (idx < 0) return { ok: false, error: new Error('対象の記録が見つかりません') }
      const cur = arr[idx]
      if (expectedVersion != null && (cur.version || 1) !== expectedVersion)
        return { ok: false, conflict: true, error: new Error('別の端末で更新されています') }
      const next = arr.slice(); next[idx] = Object.assign({}, cur, patch, { version: (cur.version || 1) + 1 })
      const w = this.write(key, next)
      return w.ok ? { ok: true } : w
    },
    removeRecord(collection, farmId, id, expectedVersion) {
      const { key, arr } = this._recordList(collection, farmId)
      const cur = arr.find(x => String(x.id) === String(id))
      if (!cur) return { ok: true, alreadyGone: true } // 冪等
      if (expectedVersion != null && (cur.version || 1) !== expectedVersion)
        return { ok: false, conflict: true, error: new Error('別の端末で更新されています') }
      const w = this.write(key, arr.filter(x => String(x.id) !== String(id)))
      return w.ok ? { ok: true } : w
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
    // GAP文書管理台帳: アプリ形 { [docId]: {ready, updated, note} } ⇔ DB行(doc_idで一意)
    farm_gap_documents: {
      conflict: 'farm_id,doc_id',
      toRows(value, ctx) {
        const obj = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {}
        return Object.keys(obj).sort().map(docId => {
          const d = obj[docId] || {}
          // updatedはDBがdate型。YYYY-MM-DD以外(壊れた値)はnullに落として行ごと弾かれるのを防ぐ
          const up = typeof d.updated === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d.updated) ? d.updated.slice(0, 10) : null
          return { org_id: ctx.orgId, farm_id: ctx.farmId, doc_id: String(docId), ready: !!d.ready, updated: up, note: String(d.note == null ? '' : d.note) }
        })
      },
      fromRows(rows) {
        const out = {}
        ;(rows || []).forEach(r => { out[r.doc_id] = { ready: !!r.ready, updated: r.updated || '', note: r.note || '' } })
        return out
      },
    },
    // 農薬マスタ(マスタUUID化第1弾): id(uuid)をそのまま衝突キーにした行単位差分同期。
    // 在庫列(stock_l/alert_threshold_l)はtoRowsに含めない＝DB側の残高を上書きしない(在庫は在庫RPCフェーズで統合)。
    farm_pesticides: {
      conflict: 'id', // PK衝突でupsert=id保持(参照が崩れない)
      toRows(value, ctx) {
        const iv = (v) => (v == null || v === '' || !Number.isFinite(Number(v))) ? null : Math.trunc(Number(v))
        const nv = (v) => (v == null || v === '' || !Number.isFinite(Number(v))) ? null : Number(v)
        return (Array.isArray(value) ? value : []).map(p => ({
          id: String(p.id), org_id: ctx.orgId, farm_id: ctx.farmId,
          name: String(p.name == null ? '' : p.name),
          reg_no: String(p.reg_no == null ? '' : p.reg_no),
          dilution: nv(p.dilution), max_times: iv(p.max_times), preharvest_days: iv(p.preharvest_days),
          target_crop: String(p.target_crop == null ? '' : p.target_crop),
          legacy_id: (typeof p.legacy_id === 'number') ? p.legacy_id : null,
        }))
      },
      fromRows(rows) {
        return (rows || []).map(r => {
          const out = {
            id: r.id, name: r.name || '', reg_no: r.reg_no || '',
            dilution: r.dilution != null ? Number(r.dilution) : null,
            max_times: r.max_times != null ? Number(r.max_times) : null,
            preharvest_days: r.preharvest_days != null ? Number(r.preharvest_days) : null,
            target_crop: r.target_crop || '',
          }
          if (r.legacy_id != null) out.legacy_id = Number(r.legacy_id) // masterByIdの旧数値ID解決に使う
          return out
        })
      },
    },
    // 肥料マスタ(マスタUUID化第2弾): 農薬と同型。在庫列(stock_kg/alert_threshold_kg)はtoRowsに含めない。
    // blend_components(配合肥料の内訳)はjsonbのまま保持(中のfertilizer_id参照はmasterByIdが新旧両対応)。
    farm_fertilizers: {
      conflict: 'id',
      toRows(value, ctx) {
        const iv = (v) => (v == null || v === '' || !Number.isFinite(Number(v))) ? null : Math.trunc(Number(v))
        const nv = (v) => (v == null || v === '' || !Number.isFinite(Number(v))) ? null : Number(v)
        return (Array.isArray(value) ? value : []).map(f => ({
          id: String(f.id), org_id: ctx.orgId, farm_id: ctx.farmId,
          name: String(f.name == null ? '' : f.name),
          maker: String(f.maker == null ? '' : f.maker),
          weight_per_bag_kg: nv(f.weight_per_bag_kg), price_per_bag_yen: iv(f.price_per_bag_yen),
          unit_price_yen_per_kg: nv(f.unit_price_yen_per_kg),
          default_dilution: nv(f.default_dilution),
          crop_dilutions: (f.crop_dilutions && typeof f.crop_dilutions === 'object') ? f.crop_dilutions : {}, // DBはnot null既定'{}'

          blend_components: Array.isArray(f.blend_components) ? f.blend_components : null,
          weight_unconfirmed: !!f.weight_unconfirmed,
          legacy_id: (typeof f.legacy_id === 'number') ? f.legacy_id : null,
        }))
      },
      fromRows(rows) {
        return (rows || []).map(r => {
          const out = {
            id: r.id, name: r.name || '', maker: r.maker || '',
            weight_per_bag_kg: r.weight_per_bag_kg != null ? Number(r.weight_per_bag_kg) : null,
            price_per_bag_yen: r.price_per_bag_yen != null ? Number(r.price_per_bag_yen) : null,
            unit_price_yen_per_kg: r.unit_price_yen_per_kg != null ? Number(r.unit_price_yen_per_kg) : null,
            default_dilution: r.default_dilution != null ? Number(r.default_dilution) : null,
            crop_dilutions: r.crop_dilutions || null,
            blend_components: r.blend_components || null,
            weight_unconfirmed: !!r.weight_unconfirmed,
          }
          if (r.legacy_id != null) out.legacy_id = Number(r.legacy_id)
          return out
        })
      },
    },
    // 整備記録(記録系CRUDパイロット): 1行単位のcreate/update/remove専用。write()全置換は禁止。
    // 記録IDはクライアント発行のUUID。旧数値IDは移行時にlegacy_idへ。versionは楽観ロック用。
    farm_maintenance_records: {
      recordCrud: true,
      toRow(rec, ctx) {
        return {
          id: String(rec.id), org_id: ctx.orgId, farm_id: ctx.farmId,
          date: /^\d{4}-\d{2}-\d{2}/.test(String(rec.date)) ? String(rec.date).slice(0, 10) : null,
          machine_name: String(rec.machine_name == null ? '' : rec.machine_name),
          machine_no: String(rec.machine_no == null ? '' : rec.machine_no),
          mtype: String(rec.mtype == null ? '' : rec.mtype),
          result: String(rec.result == null ? '' : rec.result),
          worker: String(rec.worker == null ? '' : rec.worker),
          note: String(rec.note == null ? '' : rec.note),
          version: Number.isFinite(Number(rec.version)) ? Math.trunc(Number(rec.version)) : 1,
          legacy_id: (typeof rec.legacy_id === 'number') ? rec.legacy_id : null,
        }
      },
      fromRow(r) {
        return { id: r.id, date: r.date, machine_name: r.machine_name || '', machine_no: r.machine_no || '',
          mtype: r.mtype || '', result: r.result || '', worker: r.worker || '', note: r.note || '', version: r.version || 1 }
      },
      fromRows(rows) { return (rows || []).map(r => this.fromRow(r)) },
    },
    // 出荷記録(記録系CRUD第2弾): 参照なし・アプリ形とDB列が1:1。整備記録と同じ1行単位CRUD型
    farm_shipment_records: {
      recordCrud: true,
      toRow(rec, ctx) {
        const d = (v) => /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null
        return {
          id: String(rec.id), org_id: ctx.orgId, farm_id: ctx.farmId,
          date: d(rec.date), harvest_date: d(rec.harvest_date),
          variety: String(rec.variety == null ? '' : rec.variety),
          lot_code: String(rec.lot_code == null ? '' : rec.lot_code),
          dest: String(rec.dest == null ? '' : rec.dest),
          cases: Number(rec.cases) || 0,
          note: String(rec.note == null ? '' : rec.note),
          version: Number.isFinite(Number(rec.version)) ? Math.trunc(Number(rec.version)) : 1,
          legacy_id: (typeof rec.legacy_id === 'number') ? rec.legacy_id : null,
        }
      },
      fromRow(r) {
        return { id: r.id, date: r.date, harvest_date: r.harvest_date || '', variety: r.variety || '',
          lot_code: r.lot_code || '', dest: r.dest || '', cases: Number(r.cases) || 0, note: r.note || '', version: r.version || 1 }
      },
      fromRows(rows) { return (rows || []).map(r => this.fromRow(r)) },
    },
    // 月別平均気温: アプリ形 [12ヶ月の数値] ⇔ DB1行(farm_idで一意・temps jsonb)。1農場1行のsingleton型
    farm_monthly_temps: {
      conflict: 'farm_id',
      toRows(value, ctx) {
        const arr = Array.isArray(value) ? value.map(v => Number(v) || 0) : []
        if (!arr.length) return []
        return [{ org_id: ctx.orgId, farm_id: ctx.farmId, field_id: null, temps: arr }]
      },
      fromRows(rows) {
        const r = (rows || [])[0]
        return (r && Array.isArray(r.temps)) ? r.temps.map(Number) : []
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
    // 行の識別キー: 通常はconflictのfarm_id以外の列。singleton型(conflict='farm_id'のみ=1農場1行)は固定キー'_'
    _keyColOf(conv) { return conv.conflict ? (conv.conflict.split(',').map(s => s.trim()).filter(c => c !== 'farm_id')[0] || null) : null },
    _snapshotOf(conv, table, farmId, value) {
      if (!conv.conflict) return null
      const keyCol = this._keyColOf(conv)
      const ns = {}
      conv.toRows(value, { orgId: this._ctx.orgId, farmId }).forEach(rw => { ns[keyCol ? String(rw[keyCol]) : '_'] = JSON.stringify(rw) })
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
      // 記録系(1行単位CRUD)は配列全体の全置換writeを禁止＝削除意図の誤推測で他端末の記録を消さない
      if (conv.recordCrud) return { ok: false, error: new Error('記録系はcreate/update/removeを使用（全置換write禁止）: ' + collection) }
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
          const keyCol = this._keyColOf(conv)
          const rowKey = (rw) => keyCol ? String(rw[keyCol]) : '_' // singleton型は固定キー
          const snapKey = table + '|' + farmId
          const snap = this._snap[snapKey] || null
          const changed = snap ? rows.filter(rw => snap[rowKey(rw)] !== JSON.stringify(rw)) : rows
          if (changed.length) {
            const up = await client.from(table).upsert(changed, { onConflict: conv.conflict })
            if (up.error) return { ok: false, error: up.error }
          }
          if (snap) {
            const newKeys = {}
            rows.forEach(rw => { newKeys[rowKey(rw)] = true })
            const removed = Object.keys(snap).filter(k => !newKeys[k])
            if (removed.length) {
              // singleton型(keyColなし)は自farmの行そのものを削除。通常型はリスト内keyだけ狙い撃ち
              const dq = client.from(table).delete().eq('farm_id', farmId)
              const del = await (keyCol ? dq.in(keyCol, removed) : dq)
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

    // ── 記録系専用の1行単位CRUD（設計書: 記録系CRUD移行設計） ──
    _recordGuard(collection, farmId) {
      const table = KEY_TABLE[collection], conv = CONVERTERS[collection], client = getSb()
      if (!table || !conv || !conv.recordCrud || !client) return { error: new Error('記録系CRUD未対応: ' + collection) }
      if (!this._ctx.orgId) return { error: new Error('org_idが未確定のため中止') }
      const bad = this._checkFarm(farmId); if (bad) return { error: new Error(bad) }
      return { table, conv, client, orgId: this._ctx.orgId }
    },
    async createRecord(collection, farmId, record) {
      const g = this._recordGuard(collection, farmId); if (g.error) return { ok: false, error: g.error }
      try {
        const row = g.conv.toRow(record, { orgId: g.orgId, farmId })
        const ins = await g.client.from(g.table).insert([row])
        if (ins.error) {
          // 冪等: 同じidの再送(通信リトライ等)は二重登録せず成功扱い。
          // ただし23505を無条件に信じない: 同idの行が本当に存在する時だけ冪等成功
          // (将来別のunique制約が増えた時、本当の不整合を成功扱いしないため。Codexレビュー4 Med対応)
          if (String(ins.error.code) === '23505') {
            const chk = await g.client.from(g.table).select('id').eq('farm_id', farmId).eq('id', String(row.id)).limit(1)
            if (!chk.error && chk.data && chk.data.length) return { ok: true, duplicate: true, record: g.conv.fromRow(row) }
          }
          return { ok: false, error: ins.error }
        }
        return { ok: true, record: g.conv.fromRow(row) }
      } catch (e) { return { ok: false, error: e } }
    },
    async updateRecord(collection, farmId, id, patch, expectedVersion) {
      const g = this._recordGuard(collection, farmId); if (g.error) return { ok: false, error: g.error }
      try {
        // patchはDB列名で渡す(整備記録はアプリ形と列名が1:1)。id/org/farm/legacyは書換禁止
        const upd = Object.assign({}, patch, { version: (Number(expectedVersion) || 1) + 1 })
        delete upd.id; delete upd.org_id; delete upd.farm_id; delete upd.legacy_id
        let q = g.client.from(g.table).update(upd).eq('farm_id', farmId).eq('id', id)
        if (expectedVersion != null) q = q.eq('version', expectedVersion) // 楽観ロック: 版が合う時だけ更新
        const { data, error } = await q.select('id')
        if (error) return { ok: false, error }
        if (!data || !data.length) return { ok: false, conflict: true, error: new Error('別の端末で更新されています') }
        return { ok: true }
      } catch (e) { return { ok: false, error: e } }
    },
    async removeRecord(collection, farmId, id, expectedVersion) {
      const g = this._recordGuard(collection, farmId); if (g.error) return { ok: false, error: g.error }
      try {
        let q = g.client.from(g.table).delete().eq('farm_id', farmId).eq('id', id)
        if (expectedVersion != null) q = q.eq('version', expectedVersion)
        const { data, error } = await q.select('id')
        if (error) return { ok: false, error }
        if (data && data.length) return { ok: true }
        // 0件削除: 既に消えている(冪等=ok) or 版ズレ(conflict)。行の実在で判別する
        const chk = await g.client.from(g.table).select('id').eq('farm_id', farmId).eq('id', id).limit(1)
        if (chk.error) return { ok: false, error: chk.error }
        if (chk.data && chk.data.length) return { ok: false, conflict: true, error: new Error('別の端末で更新されています') }
        return { ok: true, alreadyGone: true }
      } catch (e) { return { ok: false, error: e } }
    },
    // 記録系のリアルタイム: 全件再読込ではなくINSERT/UPDATE/DELETEを1行ずつ通知（編集中UIを壊さない）
    subscribeRows(collection, farmId, cb) {
      const table = KEY_TABLE[collection], conv = CONVERTERS[collection], client = getSb()
      if (!table || !conv || !conv.recordCrud || !client || !client.channel) return function () {}
      try {
        const ch = client.channel('rtr_' + table + '_' + farmId + '_' + Math.random().toString(36).slice(2, 10))
          .on('postgres_changes', { event: '*', schema: 'public', table: table, filter: 'farm_id=eq.' + farmId }, (payload) => {
            try {
              if (payload.eventType === 'DELETE') cb({ type: 'DELETE', id: payload.old && payload.old.id })
              else cb({ type: payload.eventType, record: conv.fromRow(payload.new) })
            } catch (_) {}
          })
          .subscribe()
        return function () { try { client.removeChannel(ch) } catch (_) {} }
      } catch (e) { return function () {} }
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
      // ── 記録系の1行単位CRUD(意図明示・設計書参照)。routeに応じてDB/localStorageへ委譲 ──
      create(collection, farmId, record) { const r = routes[collection] || LocalStorageRepository; return Promise.resolve(r.createRecord(collection, farmId, record)) },
      update(collection, farmId, id, patch, expectedVersion) { const r = routes[collection] || LocalStorageRepository; return Promise.resolve(r.updateRecord(collection, farmId, id, patch, expectedVersion)) },
      remove(collection, farmId, id, expectedVersion) { const r = routes[collection] || LocalStorageRepository; return Promise.resolve(r.removeRecord(collection, farmId, id, expectedVersion)) },
      // 記録系のリアルタイム(1行単位)。localStorage経路は全量イベントをreplaceに変換して届ける
      subscribeRows(collection, farmId, cb) {
        const r = routes[collection] || LocalStorageRepository
        if (r.subscribeRows) return r.subscribeRows(collection, farmId, cb)
        return r.subscribe(collection + '_' + farmId, (value, meta) => cb({ type: 'replace', list: (meta && meta.found && Array.isArray(value)) ? value : [] }))
      },
    }
  }

  const router = makeRouter()
  // ▼ フェーズ4の実切り替え: DB経路が既定のコレクション一覧（1テーブルずつここに足して横展開する）。
  // 【既定ON・本番のみ】(2026-07-12・Codexゲート条件=行単位差分同期/直列化/fail-closed対応済み)
  //   問題が出た端末は ?dbdest=0 を付けて開くと全テーブル旧経路(localStorage)へ退避できる(記憶される)。
  //   ?dbdest=1 で退避を解除。node(QAハーネス)ではrouteしない=テストが自分で管理する。
  //   localhost(ブラウザQAハーネス環境)は既定OFF: 約45本のハーネスがlocalStorage直注入の従来挙動を
  //   前提にしているため。localhostでDB経路を試す時だけ ?dbdest=1 を付ける。DB経路の検証はqa_dbdest_live担当。
  const ROUTED_COLLECTIONS = ['farm_shipment_destinations', 'farm_gap_documents', 'farm_monthly_temps', 'farm_maintenance_records', 'farm_shipment_records', 'farm_pesticides', 'farm_fertilizers']
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('dbdest')
      if (q === '0') localStorage.setItem('sb_route_dest_off', '1')
      if (q === '1') localStorage.removeItem('sb_route_dest_off')
      const isLocalQA = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
      if (localStorage.getItem('sb_route_dest_off') !== '1' && (!isLocalQA || q === '1'))
        ROUTED_COLLECTIONS.forEach(c => router.route(c, SupabaseRepository))
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
