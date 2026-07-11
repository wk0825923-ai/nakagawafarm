// =====================================================
// repository.js — データの出し入れを1か所に集約する「変換アダプタ」（フルスタック移行フェーズ2）
//
// ねらい: アプリ画面は「farmRepo という窓口」の read / write / subscribe だけを見る。
//   いまは窓口の中身が localStorage（今までと全く同じ挙動）。
//   フェーズ4で、この中身をテーブルごとに Supabase へ差し替えれば、
//   画面を1行も変えずに本物のDBへ移行できる（＝海外の電源変換アダプタと同じ発想）。
//
// 契約(interface): どの実装も必ずこの3つを持つ。
//   read(key)          -> { ok, found, value, error }   同期的に読む
//   write(key, value)  -> { ok, error }                 保存の成否を返す（保存できてから成功表示する土台）
//   subscribe(key, cb) -> unsubscribe()                 別の場所での更新を購読（別タブ同期／将来はリアルタイム）
// =====================================================
(function (global) {
  'use strict'

  // ── 実装その1: localStorage（現状維持。移行が終わるまでの土台） ──
  const LocalStorageRepository = {
    kind: 'localStorage',

    read(key) {
      try {
        const raw = localStorage.getItem(key)
        return { ok: true, found: raw != null, value: raw != null ? JSON.parse(raw) : undefined }
      } catch (e) {
        // 破損データは呼び出し側で初期値に戻す。握り潰さず error を返す（引き継ぎ時の調査のため）
        return { ok: false, found: false, value: undefined, error: e }
      }
    },

    write(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value))
        return { ok: true }
      } catch (e) {
        // 保存失敗（多くは容量超過）は ok:false で返す。呼び出し側が"見える化"する。
        return { ok: false, error: e }
      }
    },

    subscribe(key, cb) {
      if (typeof window === 'undefined') return function () {}
      const handler = function (e) {
        if (e.key !== key) return
        try { cb(e.newValue != null ? JSON.parse(e.newValue) : undefined, { found: e.newValue != null }) }
        catch (_) { /* 壊れた値は無視（現状維持） */ }
      }
      window.addEventListener('storage', handler)
      return function () { window.removeEventListener('storage', handler) }
    },
  }

  // 現在アクティブな窓口。フェーズ4ではここを差し替える（あるいはキー別に振り分ける）だけ。
  global.farmRepo = LocalStorageRepository
  // 実装の入れ物（将来 SupabaseRepository をここに足す）
  global.FarmRepositories = { LocalStorageRepository }
})(typeof window !== 'undefined' ? window : this)
