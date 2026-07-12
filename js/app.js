function App({ currentOrg, currentFarm, availableFarms, authUser, onFarmChange, onSignOut }) {
  const farmKey = currentFarm.id
  // 圃場番号の手動上書き(farm_field_no_overrides)は data.js のモジュール関数で扱うため、
  // 現在の農場IDを CONFIG 経由で渡してキーを農場ごとにスコープする（法人の農場間で漏らさない）。
  CONFIG.CURRENT_FARM_ID = farmKey
  CONFIG.FARM_NAME    = currentOrg.type === 'corp' ? currentOrg.name + ' / ' + currentFarm.name : (currentFarm.name || currentOrg.name)
  CONFIG.JGAP_CERT_NO = currentFarm.jgap_cert_no || currentOrg.jgap_cert_no || 'JGAP-XXXX-XXXXX'
  // 【フルスタック移行】Supabase経路の安全ガード用コンテキストを配線。
  // org_id未確定だと書き込み全拒否・farmIds外は越境拒否になるため、起動時(＋農場切替時)に必ず渡す。
  farmRepo.setContext({ orgId: currentOrg.id, farmIds: (availableFarms || []).map(f => f.id) })
  const useFPS = (k, i) => usePersistState(k + '_' + farmKey, i)
  // 【デモ】?demo=20 付きで開いたら20圃場デモデータを自動投入（tools/demo-seed.js）。
  // リンクを踏むだけで見られるようにするための仕組み。投入後は自身でクリーンURLへ遷移する。
  React.useEffect(() => {
    // 値なし ?demo でも効くよう has() を使う（get() は '' を返し falsy になる。?reset と同じ罠）
    if (new URLSearchParams(window.location.search).has('demo') && !window.__demoSeeding) {
      window.__demoSeeding = true
      const s = document.createElement('script')
      s.src = '/tools/demo-seed.js?' + Date.now()
      document.body.appendChild(s)
    }
  }, [])
  // 【エラーの受け皿】ErrorBoundaryが拾えない非同期・イベントハンドラ内の例外や未処理のPromise拒否を
  // トーストで可視化する（黙って失敗するのを防ぐ）。リソース404(img/script)は e.error が無いので除外し、
  // 通知の氾濫を避ける。
  React.useEffect(() => {
    const onErr = (e) => { if (!e || !e.error) return; try { showToast('エラーが発生しました: ' + (e.error.message || '不明なエラー'), 'error') } catch (_) {} }
    const onRej = (e) => { const r = e && e.reason; try { showToast('処理に失敗しました: ' + ((r && r.message) || (typeof r === 'string' ? r : '') || '不明なエラー'), 'error') } catch (_) {} }
    window.addEventListener('error', onErr)
    window.addEventListener('unhandledrejection', onRej)
    return () => { window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onRej) }
  }, [])
  // 【まっさら表示】?reset の farm_* 消去は index.html 冒頭で同期実行済み（認証/マウント前）。
  // 以前ここの useEffect にあったが認証済み再マウントで走らないことがあったため移設（番人監査 BUG#1）。
  // 【P5: 現場モード】屋外・手袋向けに文字大・タップ領域拡大・コントラスト強を body.field-mode で適用。
  // トグルは管理者/スタッフ両画面で使えるよう、body直下に固定ボタンとして生成する（showToastと同じDOM直生成方式）。
  React.useEffect(() => {
    let on = false
    try { on = localStorage.getItem('sb_field_mode') === '1' } catch (e) {}
    document.body.classList.toggle('field-mode', on)
    const btn = document.createElement('button')
    btn.id = 'sb-field-mode-toggle'
    btn.type = 'button'
    btn.setAttribute('aria-label', '現場モード切り替え')
    const paint = () => {
      btn.innerHTML = '<i class="ti ti-' + (on ? 'sun-high' : 'sun') + '" aria-hidden="true"></i><span>' + (on ? '現場モード ON' : '現場モード') + '</span>'
      btn.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:9000;display:flex;align-items:center;gap:6px;padding:9px 14px;border-radius:999px;border:1px solid ' + (on ? '#0A6B52' : '#D8E4D8') + ';background:' + (on ? '#0A6B52' : '#fff') + ';color:' + (on ? '#fff' : '#0A6B52') + ';font-size:12.5px;font-weight:700;box-shadow:0 2px 12px rgba(0,0,0,.18);cursor:pointer;font-family:inherit'
    }
    paint()
    btn.onclick = () => { on = !on; document.body.classList.toggle('field-mode', on); try { localStorage.setItem('sb_field_mode', on ? '1' : '0') } catch (e) {}; paint() }
    document.body.appendChild(btn)
    return () => { try { btn.remove(); document.body.classList.remove('field-mode') } catch (e) {} }
  }, [])
  const [page,      setPage]     = React.useState('dashboard')
  // 【スタッフ画面】'admin'(経営者フル機能) / 'staff'(日報だけの簡易入力)。
  // ?view=staff で初期表示をスタッフ画面に。データは同じstate/localStorageなので同一端末で連動。
  const [viewMode, setViewMode] = React.useState(() => {
    // ?view=staff または ログイン時に「スタッフ」を選んだ場合(sb_role)はスタッフ画面で開始
    if (new URLSearchParams(window.location.search).get('view') === 'staff') return 'staff'
    try { if (localStorage.getItem('sb_role') === 'staff') return 'staff' } catch (_) {}
    return 'admin'
  })
  // 整合性チェックの「該当箇所を開く」で、日報管理に飛んで該当記録の編集モーダルを直接開くための一発ジャンプ
  const [focusRecordId, setFocusRecordId] = React.useState(null)
  const navigateTo = (p, focus) => { if (focus != null) setFocusRecordId(focus); setPage(p) }
  const [fields,    setFields]   = useFPS('farm_fields_v2',     INITIAL_FIELDS)
  const [cropCycles, setCropCycles] = useFPS('farm_crop_cycles', INITIAL_CROP_CYCLES)
  const [records,   setRecords]  = useFPS('farm_records',    INITIAL_RECORDS)
  const [staff,     setStaff]    = useFPS('farm_staff',      INITIAL_STAFF)
  // 【実装手順書 A】技能実習生日誌
  const [traineeDiaries, setTraineeDiaries] = useFPS('farm_trainee_diaries', [])
  const [gap,       setGap]      = useFPS('farm_gap',        INITIAL_GAP_CHECKS)
  const [gapDocs,   setGapDocs]  = useFPS('farm_gap_documents', {})  // 文書管理台帳: { [docId]: {ready,updated,note} }
  const [rentals,   setRentals]  = useFPS('farm_rentals',    INITIAL_RENTALS)
  const [cropPlans, setCropPlans]= useFPS('farm_crop_plans', INITIAL_CROP_PLANS)
  const [todayTasks, setTodayTasks] = useFPS('farm_today_tasks', INITIAL_TODAY_TASKS)

  // ── 農薬在庫管理 state（Step①: 新規追加） ──
  const [pesticides,        setPesticides]       = useFPS('farm_pesticides',         INITIAL_PESTICIDES)
  const [pesticideStock,    setPesticideStock]   = useFPS('farm_pesticide_stock',    INITIAL_PESTICIDE_STOCK)
  const [pesticidePurchases,setPesticidePurchases] = useFPS('farm_pesticide_purchases', INITIAL_PESTICIDE_PURCHASES)

  // ── 【サンプル農園実データ統合 フェーズ1・Step1-1】肥料マスタ・肥料在庫・肥料仕入れ・追肥記録 state ──
  // 既存のpesticides系stateとは完全に独立（混在させない）
  const [fertilizers,         setFertilizers]         = useFPS('farm_fertilizers',           INITIAL_FERTILIZERS)
  const [fertilizerStock,     setFertilizerStock]     = useFPS('farm_fertilizer_stock',      INITIAL_FERTILIZER_STOCK)
  const [fertilizerPurchases, setFertilizerPurchases] = useFPS('farm_fertilizer_purchases',  INITIAL_FERTILIZER_PURCHASES)
  const [topDressingRecords,  setTopDressingRecords]  = useFPS('farm_top_dressing_records',  INITIAL_TOP_DRESSING_RECORDS)


  // ── 【フェーズE・E-4 Step4】ロット単位の農薬散布記録 state ──
  const [lotSprayRecords, setLotSprayRecords] = useFPS('farm_lot_spray_records', INITIAL_LOT_SPRAY_RECORDS)

  // ── 【畝ロット管理】圃場ごとの畝ロット（旧・静的LOTSの動的化） ──
  // { [field_id]: [lot, ...] } 形式。定植日報の保存で自動生成されるほか、
  // 圃場ダッシュボードから手動で追加・編集・削除できる。
  const [farmLots, setFarmLots] = useFPS('farm_lots', {})

  // ロット追加共通処理: 畝マップ表示のため、圃場のrow_count（畝の総本数）が
  // ロットの最大畝番号より小さい場合は自動で広げる
  const extendRowCount = (fieldId, rowRange) => {
    const rows = parseRowRange(rowRange)
    if (rows.size === 0) return
    const maxRow = Math.max(...rows)
    setFields(prev => prev.map(f =>
      String(f.id) === String(fieldId) && (!f.row_count || f.row_count < maxRow)
        ? { ...f, row_count: maxRow }
        : f
    ))
  }
  const onAddLot = (fieldId, lot) => {
    const entry = { ...lot, id: Date.now() }
    setFarmLots(prev => ({ ...prev, [fieldId]: [...(prev[fieldId] || []), entry] }))
    extendRowCount(fieldId, lot.row_range)
  }
  const onUpdateLot = (fieldId, lot) => {
    setFarmLots(prev => ({ ...prev, [fieldId]: (prev[fieldId] || []).map(l => l.id === lot.id ? lot : l) }))
    extendRowCount(fieldId, lot.row_range)
  }
  const onDeleteLot = (fieldId, lotId) => {
    setFarmLots(prev => ({ ...prev, [fieldId]: (prev[fieldId] || []).filter(l => l.id !== lotId) }))
  }

  // 定植日報の保存 → 畝ロットを自動生成する。
  // 日報には「作業畝数」しか無く畝番号の範囲は分からないため、
  // 既存ロットの最終畝番号の続きに仮置きする（圃場ダッシュボードから編集可能）。
  const autoCreateLotFromTransplant = (r) => {
    if (r.work_type !== '定植') return
    const rows = Number(r.rows_worked) || 0
    if (rows <= 0) return
    const existing = farmLots[r.field_id] || []
    const usedMax = existing.reduce((m, l) => {
      const set = parseRowRange(l.row_range)
      return set.size > 0 ? Math.max(m, ...set) : m
    }, 0)
    const start = usedMax + 1
    const row_range = rows === 1 ? String(start) : start + '-' + (start + rows - 1)
    const seedlingDays = (r.seed_date && r.date)
      ? Math.round((new Date(r.date) - new Date(r.seed_date)) / 86400000)
      : null
    onAddLot(r.field_id, {
      row_range,
      variety:              r.variety || '（品種未入力）',
      seed_date:            r.seed_date || '',
      transplant_date:      r.date,
      transplant_count:     Number(r.tray_count) || null,
      seedling_period_days: seedlingDays,
      status:               'growing',
      source_record_id:     r.id,  // 生成元の定植日報
    })
  }

  // ── 【フェーズE・E-4 Step5】収穫記録（出荷先別ケース数）state ──
  const [harvestRecords, setHarvestRecords] = useFPS('farm_harvest_records', INITIAL_HARVEST_RECORDS)

  // ── 【実装手順書 Step2】出荷先マスタ state（SHIPMENT_DESTINATIONSを初期値にApp側で管理） ──
  const [shipmentDestinations, setShipmentDestinations] = useFPS('farm_shipment_destinations', SHIPMENT_DESTINATIONS)

  // ── 【フェーズE・E-4 Step6】圃場実績・評価 state（年度別・圃場別サマリー） ──
  const [fieldPerformance] = useFPS('farm_field_performance', INITIAL_FIELD_PERFORMANCE)
  const [performanceComments, setPerformanceComments] = useFPS('farm_field_performance_comments', INITIAL_FIELD_PERFORMANCE_COMMENTS)
  // 品種（作物）別メモ。評価コメントと同様の仕組みでシーズン×品種単位にメモを保存
  const [cropComments, setCropComments] = useFPS('farm_crop_comments', [])

  // ── 作物カテゴリ（汎用化）──
  const [cropCategories, setCropCategories] = useFPS('farm_crop_categories', INITIAL_CROP_CATEGORIES)
  // ── 収穫予測: 月別平均気温（平年値・1回設定で永続化） ──
  const [monthlyTemps, setMonthlyTemps] = useFPS('farm_monthly_temps', INITIAL_MONTHLY_TEMPS)
  // ── 機械整備記録（GAP機械管理）・出荷記録（収穫→ストック→出荷）: いずれも純追加の専用キー ──
  // 【記録系CRUDパイロット】整備記録は1行単位CRUD(useRecordCollection)。祝福は保存成功後だけ。
  const maintenance = useRecordCollection('farm_maintenance_records', farmKey, [])
  const maintenanceRecords = maintenance.list
  // 【記録系CRUD第2弾】出荷記録も1行単位CRUD。祝福は保存成功後だけ。
  const shipment = useRecordCollection('farm_shipment_records', farmKey, [])
  const shipmentRecords = shipment.list
  const onAddMaintenance    = async (r) => { const res = await maintenance.add(r); if (res && res.ok) celebrateSave('整備を記録！'); return res }
  const onDeleteMaintenance = (id) => { maintenance.removeById(id) }
  const onAddShipment       = async (r) => { const res = await shipment.add(r); if (res && res.ok) celebrateSave('出荷を記録！'); return res }
  const onDeleteShipment    = (id) => { shipment.removeById(id) }
  // モジュールレベル参照を同期 — グローバル関数 getCropCategory / getHarvestGrades が最新を参照できる
  _CROP_CATEGORIES = cropCategories

  // =====================================================
  // 農薬在庫連動ヘルパー（3点セット）
  // ・保存時: 在庫から amount を減算
  // ・更新時: 旧 amount を戻して新 amount を減算（差分処理）
  // ・削除時: amount を在庫に戻す
  // マイナス在庫は許容し、UI側で警告表示する
  // =====================================================
  const adjustStock = (pesticideId, deltaL) => {
    if (!pesticideId || !deltaL) return
    setPesticideStock(prev => prev.map(s =>
      String(s.pesticide_id) === String(pesticideId) // UUID/旧数値ID両対応(Number()はUUIDでNaN化するため禁止)
        ? { ...s, stock_L: Math.round((s.stock_L - deltaL) * 100) / 100 }
        : s
    ))
  }

  // 記録保存時: 農薬散布なら在庫を減算 / 定植なら畝ロットを自動生成
  const onSaveRecordWithStock = (r) => {
    setRecords(p => [...p, r])
    if (r.work_type === '農薬散布' && r.pesticide_id && r.amount) {
      adjustStock(r.pesticide_id, Number(r.amount))
    }
    autoCreateLotFromTransplant(r)
  }

  // 記録更新時: 差分計算で在庫を調整
  const onUpdateRecordWithStock = (newRecord) => {
    setRecords(p => p.map(x => x.id === newRecord.id ? newRecord : x))
    const oldRecord = records.find(x => x.id === newRecord.id)
    if (!oldRecord) return
    // 旧記録が農薬散布だった場合は旧 amount を在庫に戻す
    if (oldRecord.work_type === '農薬散布' && oldRecord.pesticide_id && oldRecord.amount) {
      adjustStock(oldRecord.pesticide_id, -Number(oldRecord.amount))
    }
    // 新記録が農薬散布なら新 amount を減算
    if (newRecord.work_type === '農薬散布' && newRecord.pesticide_id && newRecord.amount) {
      adjustStock(newRecord.pesticide_id, Number(newRecord.amount))
    }
  }

  // 記録削除時: 農薬散布なら amount を在庫に戻す
  const onDeleteRecordWithStock = (id) => {
    const rec = records.find(x => x.id === id)
    setRecords(p => p.filter(x => x.id !== id))
    if (rec && rec.work_type === '農薬散布' && rec.pesticide_id && rec.amount) {
      adjustStock(rec.pesticide_id, -Number(rec.amount))
    }
  }

  // 記録の作付け紐付け（crop_cycle_id）のみを更新する
  const onUpdateRecordCycle = (recordId, newCycleId) => {
    setRecords(prev => prev.map(r =>
      r.id === recordId ? { ...r, crop_cycle_id: newCycleId } : r
    ))
  }

  // =====================================================
  // 【フェーズE・E-4 Step4】ロット単位の農薬散布記録 — 在庫連動
  // 既存のadjustStockロジックを流用し、各薬剤ごとに
  // 「使用した原液量（L）＝ 散布液量(L) ÷ 希釈倍率」を在庫から減算/復元する
  // =====================================================
  const onSaveLotSprayRecord = (record) => {
    const entry = { ...record, id: Date.now() }
    setLotSprayRecords(prev => [...prev, entry])
    ;(entry.pesticides || []).forEach(p => {
      if (p.pesticide_id && Number(p.dilution) > 0 && Number(entry.spray_volume_L) > 0) {
        const concentrateL = Number(entry.spray_volume_L) / Number(p.dilution)
        adjustStock(p.pesticide_id, concentrateL)
      }
    })
  }
  const onDeleteLotSprayRecord = (id) => {
    const rec = lotSprayRecords.find(x => x.id === id)
    setLotSprayRecords(prev => prev.filter(x => x.id !== id))
    if (!rec) return
    ;(rec.pesticides || []).forEach(p => {
      if (p.pesticide_id && Number(p.dilution) > 0 && Number(rec.spray_volume_L) > 0) {
        const concentrateL = Number(rec.spray_volume_L) / Number(p.dilution)
        adjustStock(p.pesticide_id, -concentrateL)
      }
    })
  }

  // =====================================================
  // 【フェーズE・E-4 Step5】収穫記録（出荷先別ケース数）保存・削除
  // E-3-4のHARVEST_RECORDS構造に対応。records（日報）とは独立したデータ。
  // =====================================================
  const onSaveHarvestRecord = (record) => {
    setHarvestRecords(prev => [...prev, { ...record, id: Date.now() }])
  }
  const onDeleteHarvestRecord = (id) => {
    setHarvestRecords(prev => prev.filter(r => r.id !== id))
  }

  // 仕入れ登録: 購入履歴に追記 + 在庫に加算
  const onAddPurchase = (purchase) => {
    const entry = { ...purchase, id: Date.now() }
    setPesticidePurchases(prev => [...prev, entry])
    setPesticideStock(prev => prev.map(s =>
      String(s.pesticide_id) === String(purchase.pesticide_id)
        ? { ...s, stock_L: Math.round((s.stock_L + Number(purchase.amount_L)) * 100) / 100 }
        : s
    ))
    celebrateSave('仕入れを登録！')
  }

  // 農薬マスタ CRUD
  // 作付け（crop_cycle）CRUD
  // 新規作付け開始: 同一圃場の既存activeを自動でcompletedに変更してから追加
  const onAddCropCycle = (cycle) => {
    setCropCycles(prev => {
      const closed = prev.map(c =>
        String(c.field_id) === String(cycle.field_id) && c.status === 'active'
          ? { ...c, status:'completed' }
          : c
      )
      return [...closed, {
        ...cycle,
        id: Date.now(),
        field_id: String(cycle.field_id),
        start_month: Number(cycle.start_month),
        end_month: Number(cycle.end_month),
        status: cycle.status || 'active',
        color: CROP_COLORS[cycle.crop] || '#94A3B8',
      }]
    })
    celebrateSave('作付けを追加！')
  }
  const onUpdateCropCycle = (cycle) =>
    setCropCycles(prev => prev.map(c => c.id === cycle.id ? cycle : c))
  const onDeleteCropCycle = (id) =>
    setCropCycles(prev => prev.filter(c => c.id !== id))
  // 作付け終了（収穫完了）操作専用ショートカット
  const onCompleteCropCycle = (id) =>
    setCropCycles(prev => prev.map(c => c.id === id ? { ...c, status:'completed' } : c))

  // 新規追加時は pesticideStock にも対応エントリを作成する
  // （これが無いと仕入れ登録・棚卸しの更新が pesticideStock.map() でヒットせず、
  //   カードの在庫表示に反映されない不具合になる）
  const onAddPesticide = (p) => {
    // マスタUUID化: 新規農薬はUUIDを発行(Date.now()は複数端末で衝突・DBのuuid列に入らない)
    const newId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now())
    setPesticides(prev => [...prev, { ...p, id: newId }])
    setPesticideStock(prev => [...prev, {
      pesticide_id:       newId,
      stock_L:            Number(p.stock_L) || 0,
      alert_threshold_L:  Number(p.alert_threshold_L) || 0,
    }])
    celebrateSave('農薬を登録！')
  }
  const onUpdatePesticide = (p) => setPesticides(prev => prev.map(x => String(x.id) === String(p.id) ? p : x))
  const onDeletePesticide = (id) => {
    setPesticides(prev => prev.filter(p => String(p.id) !== String(id)))
    setPesticideStock(prev => prev.filter(s => String(s.pesticide_id) !== String(id)))
  }
  // 棚卸し: 在庫量を直接更新
  const onUpdateStock = (pesticideId, newStockL) => {
    setPesticideStock(prev => prev.map(s =>
      String(s.pesticide_id) === String(pesticideId)
        ? { ...s, stock_L: Math.round(newStockL * 100) / 100 }
        : s
    ))
  }

  // =====================================================
  // 【サンプル農園実データ統合 フェーズ1・Step1-2】肥料マスタ CRUD
  // onAddPesticide / onUpdatePesticide / onDeletePesticide と同パターン。
  // 既存のpesticides系ロジックには触れず、肥料用に完全に独立して追加する。
  // =====================================================
  const onAddFertilizer = (f) => {
    // マスタUUID化: 新規肥料はUUIDを発行(Date.now()は複数端末で衝突・DBのuuid列に入らない)
    const newId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now())
    setFertilizers(prev => [...prev, { ...f, id: newId }])
    setFertilizerStock(prev => [...prev, {
      fertilizer_id:      newId,
      stock_kg:           Number(f.stock_kg) || 0,
      alert_threshold_kg: Number(f.alert_threshold_kg) || 0,
    }])
    celebrateSave('肥料を登録！')
  }
  const onUpdateFertilizer = (f) => setFertilizers(prev => prev.map(x => String(x.id) === String(f.id) ? f : x))
  const onDeleteFertilizer = (id) => {
    setFertilizers(prev => prev.filter(f => String(f.id) !== String(id)))
    setFertilizerStock(prev => prev.filter(s => String(s.fertilizer_id) !== String(id)))
  }

  // 肥料仕入れ登録: 購入履歴に追記 + 在庫に加算（onAddPurchaseと同パターン）
  const onAddFertilizerPurchase = (purchase) => {
    const entry = { ...purchase, id: Date.now() }
    setFertilizerPurchases(prev => [...prev, entry])
    setFertilizerStock(prev => prev.map(s =>
      String(s.fertilizer_id) === String(purchase.fertilizer_id)
        ? { ...s, stock_kg: Math.round((s.stock_kg + Number(purchase.amount_kg)) * 100) / 100 }
        : s
    ))
    celebrateSave('仕入れを登録！')
  }

  // 肥料棚卸し: 在庫量を直接更新（onUpdateStockと同パターン）
  const onUpdateFertilizerStock = (fertilizerId, newStockKg) => {
    setFertilizerStock(prev => prev.map(s =>
      String(s.fertilizer_id) === String(fertilizerId)
        ? { ...s, stock_kg: Math.round(newStockKg * 100) / 100 }
        : s
    ))
  }

  // 肥料在庫連動ヘルパー（adjustStockの肥料版）
  const adjustFertilizerStock = (fertilizerId, deltaKg) => {
    if (!fertilizerId || !deltaKg) return
    setFertilizerStock(prev => prev.map(s =>
      String(s.fertilizer_id) === String(fertilizerId) // UUID/旧数値ID両対応(Number()はUUIDでNaN化するため禁止)
        ? { ...s, stock_kg: Math.round((s.stock_kg - deltaKg) * 100) / 100 }
        : s
    ))
  }

  // =====================================================
  // 【サンプル農園実データ統合 フェーズ1・Step1-2】追肥記録 — 在庫連動
  // onSaveLotSprayRecord/onDeleteLotSprayRecordと同パターンだが、
  // 実データでは「希釈倍率÷散布液量」と「散布量(kg)直接入力」の両パターンが混在するため、
  // amount_kgが入力されている場合はそちらを優先して減算する分岐を追加する。
  // =====================================================
  const onSaveTopDressingRecord = (record) => {
    const entry = { ...record, id: Date.now() }
    setTopDressingRecords(prev => [...prev, entry])
    ;(entry.fertilizers || []).forEach(f => {
      if (!f.fertilizer_id) return
      if (Number(f.amount_kg) > 0) {
        // 散布量(kg)が直接入力されている場合はそちらを優先
        adjustFertilizerStock(f.fertilizer_id, Number(f.amount_kg))
      } else if (Number(f.dilution) > 0 && Number(entry.spray_volume_L) > 0) {
        // 希釈倍率×散布液量(L)から使用量(kg)を算出
        const usedKg = Number(entry.spray_volume_L) / Number(f.dilution)
        adjustFertilizerStock(f.fertilizer_id, usedKg)
      }
    })
  }
  const onDeleteTopDressingRecord = (id) => {
    const rec = topDressingRecords.find(x => x.id === id)
    setTopDressingRecords(prev => prev.filter(x => x.id !== id))
    if (!rec) return
    ;(rec.fertilizers || []).forEach(f => {
      if (!f.fertilizer_id) return
      if (Number(f.amount_kg) > 0) {
        adjustFertilizerStock(f.fertilizer_id, -Number(f.amount_kg))
      } else if (Number(f.dilution) > 0 && Number(rec.spray_volume_L) > 0) {
        const usedKg = Number(rec.spray_volume_L) / Number(f.dilution)
        adjustFertilizerStock(f.fertilizer_id, -usedKg)
      }
    })
  }

  const toggleTodayTask = id  => setTodayTasks(p => p.map(t => t.id===id ? {...t, done:!t.done} : t))
  const addTodayTask    = task => setTodayTasks(p => [...p, task])

  const pageMap = {
    dashboard:         () => React.createElement(Dashboard,   { fields, records, staff, gap, todayTasks, onToggleTodayTask:toggleTodayTask, onAddTodayTask:addTodayTask, cropPlans, pesticides, pesticideStock, fertilizers, fertilizerStock, lotSprayRecords, maintenanceRecords, gapCtx:{ records, lotSprayRecords, pesticides, pesticidePurchases, topDressingRecords, fertilizerPurchases, harvestRecords, shipmentRecords, maintenanceRecords, staff, farmLots, fields }, onNavigate: p => setPage(p), onSaveRecord: onSaveRecordWithStock, onUpdateRecord: onUpdateRecordWithStock, onDeleteRecord: onDeleteRecordWithStock }),
    record_list:       () => React.createElement(RecordTablePage, { records, fields, pesticides, onUpdate: onUpdateRecordWithStock, onDelete: onDeleteRecordWithStock, cropCycles, onUpdateRecordCycle, focusRecordId, onClearFocus: () => setFocusRecordId(null) }),
    export:            () => React.createElement(GapExport,  { gap, onToggle:id=>setGap(p=>p.map(c=>c.id===id?{...c,is_cleared:!c.is_cleared}:c)), records, fields, pesticides, ctx:{ records, lotSprayRecords, pesticides, pesticidePurchases, topDressingRecords, fertilizerPurchases, harvestRecords, shipmentRecords, maintenanceRecords, staff, farmLots, fields } }),
    field_map:         () => React.createElement(FieldMapPage,   { fields, onAdd:f=>{setFields(p=>[...p,f]);celebrateSave('圃場を追加！')}, onDelete:id=>setFields(p=>p.filter(f=>f.id!==id)), onUpdateField:(id,patch)=>setFields(p=>p.map(f=>f.id===id?{...f,...patch}:f)), cropCycles, onNavigate:setPage, cropCategories, farmLots, lotSprayRecords, topDressingRecords, harvestRecords, pesticides }),
    fields:            () => React.createElement(FieldTablePage, { fields, onAdd:f=>{setFields(p=>[...p,f]);celebrateSave('圃場を追加！')}, onDelete:id=>setFields(p=>p.filter(f=>f.id!==id)), cropCycles, onNavigate:setPage, cropCategories, farmLots, lotSprayRecords, topDressingRecords, harvestRecords, pesticides }),
    crop_plan:         () => React.createElement(CropPlan,    { fields, plans:cropPlans, records, pesticides, onAdd:p=>{setCropPlans(prev=>[...prev,p]);celebrateSave('作付計画を追加！')}, onDelete:id=>setCropPlans(prev=>prev.filter(p=>p.id!==id)) }),
    gap:               () => React.createElement(GapChecklist, { gap, onToggle:id=>setGap(p=>p.map(c=>c.id===id?{...c,is_cleared:!c.is_cleared}:c)), ctx:{ records, lotSprayRecords, pesticides, pesticidePurchases, topDressingRecords, fertilizerPurchases, harvestRecords, shipmentRecords, maintenanceRecords, staff, farmLots, fields } }),
    // 【必要書類ナビ/文書管理台帳】GAP原則ごとに必要文書(実データ36)の整備状況を管理
    gap_documents:     () => React.createElement(GapDocumentRegistry, { gap, docsState:gapDocs, onUpdateDoc:(id,patch)=>setGapDocs(s=>({ ...s, [id]:{ ...(s[id]||{}), ...patch } })) }),
    // 【突合せ】記録の食い違い・入力ミスを横断点検（原因と対処つき）
    integrity_check:   () => React.createElement(FarmIntegrityPage, { records, lotSprayRecords, topDressingRecords, harvestRecords, shipmentRecords, farmLots, fields, pesticides, fertilizers, pesticideStock, pesticidePurchases, fertilizerStock, fertilizerPurchases, onNavigate:navigateTo }),
    gap_package:       () => React.createElement(GapExport,   { gap, onToggle:id=>setGap(p=>p.map(c=>c.id===id?{...c,is_cleared:!c.is_cleared}:c)), records, fields, pesticides, ctx:{ records, lotSprayRecords, pesticides, pesticidePurchases, topDressingRecords, fertilizerPurchases, harvestRecords, shipmentRecords, maintenanceRecords, staff, farmLots, fields } }),
    staff:             () => React.createElement(StaffList,   { staff, onAdd:s=>{setStaff(p=>[...p,s]);celebrateSave('スタッフを追加！')}, onDelete:id=>setStaff(p=>p.filter(s=>s.id!==id)), onUpdate:s=>setStaff(p=>p.map(x=>x.id===s.id?s:x)) }),
    // 【実装手順書 A】技能実習生 作業日誌
    trainee_diary:     () => React.createElement(TraineeDiaryPage, {
      staff,
      fields,
      diaries:  traineeDiaries,
      onAdd:    d => { setTraineeDiaries(p => [...p, d]); celebrateSave('作業日誌を記録！') },
      onDelete: id => setTraineeDiaries(p => p.filter(d => d.id !== id)),
    }),
    equipment:         () => React.createElement(Equipment, { rentals, onAdd:r=>{setRentals(p=>[...p,r]);celebrateSave('予約を追加！')}, onUpdate:r=>setRentals(p=>p.map(x=>x.id===r.id?r:x)), onDelete:id=>setRentals(p=>p.filter(r=>r.id!==id)) }),
    simulator:         () => React.createElement(RevenueSimulator, null),
    manual:            () => React.createElement(ManualLibrary,    null),
    settings:          () => React.createElement(Settings,    null),
    // 【マスタ管理】農薬/肥料/作物カテゴリ をタブ統合（個別pageMapを再利用するので二重定義しない）
    master_hub:        () => React.createElement(TabHubPage, { tabs: [
      { key:'pest', label:'農薬マスタ',   render: pageMap.pesticide_master },
      { key:'fert', label:'肥料マスタ',   render: pageMap.fertilizer_master },
      { key:'cat',  label:'作物カテゴリ', render: pageMap.crop_categories },
    ] }),
    crop_categories:   () => React.createElement(CropCategoryPage, { categories: cropCategories, onSave: setCropCategories }),
    pesticide_master:  () => React.createElement(PesticideMasterPage, {
      pesticides,
      pesticideStock,
      pesticidePurchases,
      onAdd:         onAddPesticide,
      onUpdate:      onUpdatePesticide,
      onDelete:      onDeletePesticide,
      onAddPurchase: onAddPurchase,
      onUpdateStock,
      records,
    }),
    // 【サンプル農園実データ統合 フェーズ3・Step3-1】肥料マスタ管理ページ
    fertilizer_master: () => React.createElement(FertilizerMasterPage, {
      fertilizers,
      fertilizerStock,
      fertilizerPurchases,
      topDressingRecords,
      fields,
      onAdd:    onAddFertilizer,
      onUpdate: onUpdateFertilizer,
      onDelete: onDeleteFertilizer,
      onAddPurchase: onAddFertilizerPurchase,
      onUpdateStock: onUpdateFertilizerStock,
    }),
    // 【圃場まとめ】ロット別生産履歴（管理表シート相当の自動再構築）
    // 【圃場まとめ】生産履歴（ロット別）＋ 実績・評価（KPI）をタブ統合（集計が被る2ページを1つに）
    field_summary: () => React.createElement(TabHubPage, { tabs: [
      { key:'history', label:'生産履歴（ロット別）', render: () => React.createElement(FieldSummaryPage, {
        fields, farmLots, lotSprayRecords, topDressingRecords, harvestRecords, pesticides, fertilizers, pesticidePurchases,
      }) },
      { key:'perf', label:'実績・評価（KPI）', render: pageMap.field_performance },
    ] }),
    // 【収穫予測】積算温度モデルによる収穫予測
    harvest_forecast: () => React.createElement(HarvestForecastPage, {
      fields, farmLots, harvestRecords, cropCategories, monthlyTemps, onSaveMonthlyTemps: setMonthlyTemps,
    }),
    // 【日報入力】全圃場から選択して入力。農薬散布/施肥/収穫は畝まで記録するGAP用フォームに切替。
    daily_entry: () => React.createElement(RecordForm, {
      fields, pesticides, records, lotSprayRecords, onSave: onSaveRecordWithStock,
      farmLots, fertilizers, destinations: shipmentDestinations, harvestRecords, staff,
      onSaveLotSpray: onSaveLotSprayRecord, onSaveTopDressing: onSaveTopDressingRecord, onSaveHarvest: onSaveHarvestRecord,
    }),
    // 【機械整備記録】GAP機械管理（純追加・専用キー）
    maintenance_log: () => React.createElement(MaintenanceLogPage, {
      records: maintenanceRecords, staff, onSave: onAddMaintenance, onDelete: onDeleteMaintenance,
    }),
    // 【出荷記録】収穫→ストック→出荷。ストック残は収穫記録との差で自動計算（既存収穫は無傷）
    shipment_log: () => React.createElement(ShipmentLogPage, {
      shipmentRecords, harvestRecords, fields, destinations: shipmentDestinations,
      onSave: onAddShipment, onDelete: onDeleteShipment,
    }),
    // 【フェーズE・E-4 Step6】圃場実績・評価ページ
    field_performance: () => React.createElement(FieldPerformancePage, {
      fields, fieldPerformance, performanceComments, harvestRecords,
      onAddComment: (c) => setPerformanceComments(prev => [...(prev||[]), c]),
      cropComments,
      onAddCropComment: (c) => setCropComments(prev => [...(prev||[]), c]),
      lotSprayRecords, topDressingRecords, pesticides, pesticidePurchases, fertilizers,
      cropCycles,
    }),
  }

  // 圃場サブページ: 'field:1:daily' / 'field:2:rows' など
  let mainContent
  if (page.startsWith('field:')) {
    const parts   = page.split(':')
    const fieldId = parts[1]
    const sub     = parts[2] || 'dashboard'
    const field   = masterById(fields, fieldId)
    mainContent = field
      ? React.createElement(FieldDetailPage, {
          field, fields, records, pesticides,
          // 【畝ロット管理】動的ロット + CRUD
          lots: farmLots[field.id] || [],
          onAddLot, onUpdateLot, onDeleteLot,
          onSaveRecord: onSaveRecordWithStock,
          onUpdateRecord: onUpdateRecordWithStock,
          onDeleteRecord: onDeleteRecordWithStock,
          lotSprayRecords,
          onSaveLotSprayRecord,
          onDeleteLotSprayRecord,
          harvestRecords,
          onSaveHarvestRecord,
          onDeleteHarvestRecord,
          cropCycles, onAddCropCycle, onUpdateCropCycle, onDeleteCropCycle, onCompleteCropCycle,
          // 【サンプル農園実データ統合 フェーズ4・Step4-1(画面接続)】追肥記録
          fertilizers, topDressingRecords, onSaveTopDressingRecord, onDeleteTopDressingRecord,
          destinations: shipmentDestinations,
          onChangeDestinations: setShipmentDestinations,
          // 【実装手順書 C】担当者連携
          staff,
          // 圃場情報(所在地など)の更新。既存圃場に後から住所を入れられるように。
          onUpdateField: patch => setFields(p => p.map(f => String(f.id) === String(field.id) ? { ...f, ...patch } : f)),
          // 作物別詳細(温度・積算温度など)の保存。従来どこからも渡されず保存が無効だったため配線。
          onUpdateFieldCropDetails: (id, details) => setFields(p => p.map(f => f.id === id ? { ...f, crop_specific_details: details } : f)),
          sub
        })
      : (pageMap.dashboard)()
  } else {
    mainContent = (pageMap[page] || pageMap.dashboard)()
  }

  // タブクリックでsetPageが呼べるようにwindowに登録
  window.__fieldTabChange = (newPage) => setPage(newPage)

  // 【スタッフ画面】日報だけの簡易入力。RecordFormを同じ保存ハンドラで再利用するため、
  // ここで入力した記録・計算は経営者画面にそのまま連動する（同一端末）。
  if (viewMode === 'staff') {
    return React.createElement(StaffQuickView, {
      fields, pesticides, records, lotSprayRecords, topDressingRecords, harvestRecords,
      onSave: onSaveRecordWithStock, farmLots, fertilizers, destinations: shipmentDestinations, staff,
      onSaveLotSpray: onSaveLotSprayRecord, onSaveTopDressing: onSaveTopDressingRecord, onSaveHarvest: onSaveHarvestRecord,
      // 間違えた日報を直せるように（基本日報=編集/削除、農薬/施肥/収穫=削除して入力し直し）
      onUpdate: onUpdateRecordWithStock, onDelete: onDeleteRecordWithStock,
      onDeleteSpray: onDeleteLotSprayRecord, onDeleteTopDressing: onDeleteTopDressingRecord, onDeleteHarvest: onDeleteHarvestRecord,
      currentOrg, currentFarm, authUser,
      onExit: () => setViewMode('admin'),
      onSignOut,
    })
  }

  return React.createElement('div', { style:{display:'flex',height:'100vh',width:'100vw',overflow:'hidden'} },
    React.createElement(Sidebar, {
      current:       page,
      onChange:      p => setPage(p),
      fields,
      onAddField:    f  => { setFields(p => [...p, f]); celebrateSave('圃場を追加！') },
      onDeleteField: id => setFields(p => p.filter(f => f.id !== id)),
      currentOrg,
      currentFarm,
      availableFarms,
      onFarmChange,
      onSignOut,
      authUser,
      onEnterStaff: () => setViewMode('staff'),
    }),
    React.createElement('main',  { className:'main' },
      React.createElement(ErrorBoundary, { resetKey: page }, mainContent))
  )
}

// =====================================================
// 【サンプル農園実データ統合 Step2-2 動作確認用・一時コンポーネント】
// ① LOTSの再構築結果（とうもろこし2025/2026シーズン全圃場 + レタス圃場）を表示
// ② 圃場番号の表記ゆれ正規化テーブル（FIELD_NO_NORMALIZE）を一覧表示
// ③ 月曜の打ち合わせで確認すべき⚠️ポイントをハイライト
// フェーズ2完了・月曜確認後の本反映が終わり次第このパネルは削除してよい。
// =====================================================
function LotsStep2DebugPanel() {
  const [open, setOpen] = React.useState(false)
  const [tab, setTab] = React.useState('lots') // 'lots' | 'normalize' | 'issues'

  // LOTSから全エントリを集計（圃場ID → ロット一覧）
  const allFieldIds = Object.keys(LOTS).map(Number).sort((a,b)=>a-b)
  const cornIds  = allFieldIds.filter(id => id >= 100)
  const lettuceIds = allFieldIds.filter(id => id < 10)

  // 確認必須の⚠️issue一覧（data_noteから自動抽出）
  const issues = []
  allFieldIds.forEach(fid => {
    LOTS[fid].forEach(lot => {
      if (lot.data_note && lot.data_note.includes('⚠️')) {
        issues.push({ field_id: fid, field_no: lot.field_no_raw, season: lot.season, note: lot.data_note })
      }
    })
  })
  // FIELD_NO_NORMALIZEの確認が必要なエントリ
  Object.entries(FIELD_NO_NORMALIZE).forEach(([key, v]) => {
    if (v.note) issues.push({ field_id: '-', field_no: key, season: '-', note: `[正規化] ${v.note}` })
  })

  const tabBtnStyle = (t) => ({
    padding:'4px 10px', border:'none', borderRadius:4, cursor:'pointer', fontSize:11, fontWeight:700,
    background: tab === t ? '#1D4ED8' : '#EFF6FF', color: tab === t ? '#fff' : '#1D4ED8',
  })

  if (!open) {
    return React.createElement('button', {
      onClick: () => setOpen(true),
      style:{ position:'fixed', right:16, bottom:64, zIndex:9999, background:'#1D4ED8', color:'#fff', border:'none', borderRadius:8, padding:'8px 14px', fontSize:12, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(0,0,0,.2)' }
    }, `🌽 実データ確認パネルを開く（⚠️${issues.filter(x=>x.field_id!=='-').length}件）`)
  }

  return React.createElement('div', {
    style:{ position:'fixed', left:16, bottom:16, width:460, maxHeight:'82vh', overflowY:'auto', zIndex:9999, background:'#fff', border:'2px solid #1D4ED8', borderRadius:10, padding:14, boxShadow:'0 8px 24px rgba(0,0,0,.25)', fontSize:12, fontFamily:'monospace' }
  },
    // ヘッダー
    React.createElement('div', { style:{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10} },
      React.createElement('strong', { style:{fontSize:13, color:'#1D4ED8'} }, '🌽 実データ確認パネル（打ち合わせ確認用）'),
      React.createElement('button', { onClick:()=>setOpen(false), style:{border:'none', background:'none', cursor:'pointer', fontSize:14} }, '✕')
    ),
    // タブ
    React.createElement('div', { style:{display:'flex', gap:4, marginBottom:10} },
      React.createElement('button', { onClick:()=>setTab('lots'),       style:tabBtnStyle('lots')      }, `LOTS一覧（${allFieldIds.length}圃場）`),
      React.createElement('button', { onClick:()=>setTab('normalize'),  style:tabBtnStyle('normalize') }, `表記ゆれ正規化（${Object.keys(FIELD_NO_NORMALIZE).length}件）`),
      React.createElement('button', { onClick:()=>setTab('issues'),     style:tabBtnStyle('issues')    }, `⚠️要確認（${issues.length}件）`),
    ),

    // ── タブ: LOTS一覧 ──
    tab === 'lots' && React.createElement('div', null,
      React.createElement('div', { style:{fontWeight:700, color:'#0A6B52', marginBottom:4} }, '✅ レタス圃場（既存データ + field_no_raw追記済み）'),
      React.createElement('table', { style:{width:'100%', borderCollapse:'collapse', marginBottom:10, fontSize:11} },
        React.createElement('thead', null,
          React.createElement('tr', null,
            ['field_id','圃場番号','シーズン','ロット数','品種（1件目）','状態'].map((h,i) =>
              React.createElement('th', { key:i, style:{textAlign:'left', borderBottom:'1px solid #ddd', padding:'2px 4px', color:'#64748B'} }, h)
            )
          )
        ),
        React.createElement('tbody', null,
          lettuceIds.map(fid => {
            const lots = LOTS[fid]
            const first = lots[0]
            return React.createElement('tr', { key:fid },
              React.createElement('td', { style:tdStyle2 }, fid),
              React.createElement('td', { style:{...tdStyle2, fontWeight:600, color:'#0A6B52'} }, first.field_no_raw || '—'),
              React.createElement('td', { style:tdStyle2 }, first.season || '2024-2025'),
              React.createElement('td', { style:tdStyle2 }, lots.length + '件'),
              React.createElement('td', { style:tdStyle2 }, first.variety),
              React.createElement('td', { style:tdStyle2 }, first.status),
            )
          })
        )
      ),
      React.createElement('div', { style:{fontWeight:700, color:'#B45309', marginBottom:4} }, '🌽 とうもろこし圃場（2025/2026シーズン・仮ID 101〜210）'),
      React.createElement('table', { style:{width:'100%', borderCollapse:'collapse', marginBottom:8, fontSize:11} },
        React.createElement('thead', null,
          React.createElement('tr', null,
            ['仮ID','圃場番号(元表記)','シーズン','畝数','品種','状態'].map((h,i) =>
              React.createElement('th', { key:i, style:{textAlign:'left', borderBottom:'1px solid #ddd', padding:'2px 4px', color:'#64748B'} }, h)
            )
          )
        ),
        React.createElement('tbody', null,
          cornIds.map(fid => {
            const lots = LOTS[fid]
            const first = lots[0]
            const hasIssue = first.data_note && first.data_note.includes('⚠️')
            return React.createElement('tr', { key:fid, style:{background: hasIssue ? '#FFFBEB' : 'transparent'} },
              React.createElement('td', { style:tdStyle2 }, fid),
              React.createElement('td', { style:{...tdStyle2, fontWeight:600, color: hasIssue ? '#B45309' : '#1D4ED8'} },
                (hasIssue ? '⚠️ ' : '') + (first.field_no_raw || '—')
              ),
              React.createElement('td', { style:tdStyle2 }, first.season),
              React.createElement('td', { style:tdStyle2 }, first.row_count + '畝'),
              React.createElement('td', { style:tdStyle2 }, first.variety),
              React.createElement('td', { style:tdStyle2 }, first.status),
            )
          })
        )
      ),
      React.createElement('div', { style:{fontSize:11, color:'#64748B'} },
        `合計: レタス${lettuceIds.length}圃場 / とうもろこし${cornIds.length}圃場（2025: ${cornIds.filter(id=>LOTS[id][0].season==='2025').length}・2026: ${cornIds.filter(id=>LOTS[id][0].season==='2026').length}）`
      )
    ),

    // ── タブ: 表記ゆれ正規化 ──
    tab === 'normalize' && React.createElement('div', null,
      React.createElement('div', { style:{fontWeight:700, color:'#1D4ED8', marginBottom:4} }, '📋 圃場番号 表記ゆれ正規化テーブル（FIELD_NO_NORMALIZE）'),
      React.createElement('div', { style:{fontSize:11, color:'#64748B', marginBottom:8} }, '元表記 → 正規化キー の対応一覧。⚠️マークは月曜に要確認。'),
      React.createElement('table', { style:{width:'100%', borderCollapse:'collapse', fontSize:11} },
        React.createElement('thead', null,
          React.createElement('tr', null,
            ['元表記','正規化キー','ラベル','作物','確認メモ'].map((h,i) =>
              React.createElement('th', { key:i, style:{textAlign:'left', borderBottom:'1px solid #ddd', padding:'2px 4px', color:'#64748B'} }, h)
            )
          )
        ),
        React.createElement('tbody', null,
          Object.entries(FIELD_NO_NORMALIZE).map(([raw, v]) =>
            React.createElement('tr', { key:raw, style:{background: v.note ? '#FFFBEB' : 'transparent'} },
              React.createElement('td', { style:{...tdStyle2, fontWeight:600} }, raw),
              React.createElement('td', { style:{...tdStyle2, color:'#1D4ED8'} }, v.canonical),
              React.createElement('td', { style:tdStyle2 }, v.label),
              React.createElement('td', { style:tdStyle2 }, v.crop === 'lettuce' ? '🥬' : v.crop === 'corn' ? '🌽' : '両方'),
              React.createElement('td', { style:{...tdStyle2, color:'#92400E', fontSize:10} }, v.note || '—'),
            )
          )
        )
      )
    ),

    // ── タブ: 要確認事項 ──
    tab === 'issues' && React.createElement('div', null,
      React.createElement('div', { style:{fontWeight:700, color:'#C2410C', marginBottom:8} }, `⚠️ 月曜に確認が必要な事項（${issues.length}件）`),
      issues.map((issue, i) =>
        React.createElement('div', { key:i, style:{marginBottom:8, padding:'6px 8px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:6} },
          React.createElement('div', { style:{fontWeight:700, fontSize:11, color:'#92400E', marginBottom:2} },
            `[field_no: ${issue.field_no}  season: ${issue.season}]`
          ),
          React.createElement('div', { style:{fontSize:11, color:'#78350F', lineHeight:1.5} }, issue.note),
        )
      ),
      React.createElement('div', { style:{marginTop:10, padding:8, background:'#F0F8F4', border:'1px solid #6EE7B7', borderRadius:6, color:'#065F46', fontSize:11} },
        '✅ 実データ反映後の残タスク: 月曜確認 → 圃場番号の正式ルール決定 → INITIAL_FIELDSへfield_noを正式追加 → LOTSの仮ID（101〜210）を実ID（7/11/15/19等）に統合'
      )
    )
  )
}
const tdStyle2 = { padding:'2px 4px', borderBottom:'1px solid #f0f0f0' }

ReactDOM.createRoot(document.getElementById('app')).render(React.createElement(Root))
