# アーキテクチャ / データモデル

## 全体像
ビルドの無い静的 SPA。`index.html` が以下の順で素の `<script>` を読み込み、グローバルに関数/定数を定義していく（モジュールシステムは使っていない）。

```
config.js → data.js → components.js → auth.js → app.js
```
各ファイルはトップレベルに `const`/`function` を定義し、後続ファイルからグローバル参照する。
そのため**読み込み順と、同名グローバルの衝突に注意**（例: `_CROP_CATEGORIES` は app が毎レンダー同期）。

## レンダリング
- React 18 UMD。JSX は使わず全て `React.createElement(...)`。
- `auth.js` の `Root` が認証状態で分岐:
  - `loading` → `LoadingScreen`
  - `unauthenticated` → `LoginScreen`
  - `onboarding` → `OnboardingScreen`（組織/農場が未作成）
  - `ready` → `App`（`app.js`）
- `App` は `page` state（文字列）でページを切り替える。`pageMap[page]()` が対応コンポーネントを返す。
  - 圃場詳細のみ `field:<id>:<sub>` 形式（例 `field:1:daily`）。

## 状態と永続化 ★重要
農場データは **localStorage** に保存される。`app.js` の `useFPS(key, initial)` が本体：
```js
const farmKey = currentFarm.id                       // Supabase の農場ID(UUID)
const useFPS  = (k, i) => usePersistState(k + '_' + farmKey, i)
```
→ 実際の localStorage キーは **`<key>_<farmId>`**。農場ごとに名前空間が分かれる。

### localStorage キー一覧（すべて `_<farmId>` サフィックス付き）
| キー | 内容 |
|---|---|
| `farm_fields_v2` | 圃場マスタ（id,name,field_no,crop,area_are,color,row_count,crop_category…） |
| `farm_lots` | 圃場ID→ロット配列（畝範囲・品種・は種/定植日・status: growing/ready/harvested/fallow） |
| `farm_records` | 日報（date,field_id,work_type,weather,worker,pesticide_id,photos[]…） |
| `farm_lot_spray_records` | 農薬散布（ロット単位。field_id,row_range,pesticides[],spray_volume_L…） |
| `farm_top_dressing_records` | 施肥（field_id,row_range,fertilizing_type,fertilizers[]…） |
| `farm_harvest_records` | 収穫（field_id,row_range,variety,shipments[],total_cases…） |
| `farm_pesticides` / `farm_pesticide_stock` / `farm_pesticide_purchases` | 農薬マスタ・在庫・仕入 |
| `farm_fertilizers` / `farm_fertilizer_stock` / `farm_fertilizer_purchases` | 肥料マスタ・在庫・仕入 |
| `farm_crop_categories` | 作物カテゴリ（管理方式・収穫規格・base_temp_c・required_gdd） |
| `farm_crop_cycles` / `farm_crop_plans` | 作付けサイクル / 作付計画 |
| `farm_field_performance` / `farm_field_performance_comments` / `farm_crop_comments` | 圃場実績・評価とメモ |
| `farm_staff` | スタッフ（role: manager/worker/trainee, nationality, visa_expires_at…） |
| `farm_trainee_diaries` | 技能実習生 作業日誌 |
| `farm_rentals` | 機器予約 |
| `farm_shipment_destinations` | 出荷先マスタ |
| `farm_today_tasks` | ダッシュボードの今日のタスク |
| `farm_gap` | GAP チェックリスト状態 |
| `farm_monthly_temps` | 月別平均気温（収穫予測の積算温度に使用・長さ12） |

その他 localStorage: `last_farm_<orgId>`（最後に選んだ農場）、`sb-*`（supabase-js の認証セッション）。

### Supabase（DB で管理しているのは認証+テナントのみ）
| テーブル | 用途 |
|---|---|
| `farm_organizations` | 組織（個人 solo / 法人 corp・JGAP番号） |
| `farm_farms` | 農場（org_id 紐付け） |
| `farm_members` | user_id ↔ org_id ↔ role ↔ farm_ids |
接続情報は `config.js` に**直書き**（`SUPABASE_URL` / `SUPABASE_ANON_KEY`）。RLS 前提の anon key。

## データフローの要点
- 記録系（日報/農薬/施肥/収穫）と `farm_lots` は**別テーブル**。突合は `field_id` + 畝範囲（`parseRowRange` で集合化し重なり判定）で行う（厳密な外部キーは持たない）。
- 「圃場まとめ」(`FieldSummaryPage`) と「収穫予測」(`HarvestForecastPage`) はこの突合ロジックでロット単位に集約している。
- 保存演出 `celebrateSave(msg)`（components.js・DOM 直生成）を新規追加/記録保存で呼ぶ。CSS は `css/app.css` の `sb-celeb-*`。

## なぜ localStorage なのか / リスク
短期間でデモ〜初期導入を回すため、バックエンド実装を省いて localStorage に寄せた経緯。
**本番運用では次が問題になる**（→ [HANDOFF.md](./HANDOFF.md) で優先度付き）:
- 多端末で同期しない／同一農場を複数人で編集すると衝突・不整合。
- ブラウザのデータ削除・機種変更でデータ消失。サーバ側バックアップが無い。
- 写真は localStorage に base64 保存（容量ガードで上限 4MB。超過分は写真のみ拒否＝記録は保存される設計）。実運用では外部ストレージへ移すべき。
