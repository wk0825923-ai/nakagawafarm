# QA ハーネス（E2E 回帰テスト）

ビルドの無い静的サイトのため、**実ブラウザ（ヘッドレス Chrome）を puppeteer-core で自動操縦**し、
実 Supabase 認証を通してから全ページを巡回・操作してエラー/白画面/クラッシュを検出する。

> 単体テストは無い。UI が React UMD + `React.createElement`（JSX 無し）で密結合のため、
> 現状は「実ブラウザでの通し検査」が最も費用対効果が高い。将来ビルド化したら Vitest 等へ移行推奨。

## 前提
- Node.js 18+（開発時は v24 で確認）
- Google Chrome がインストール済み（`puppeteer-core` は Chrome 本体をダウンロードしない）
- ネットワーク接続（CDN と Supabase 認証にアクセスするため）
- デモアカウント `demo@syatyo-suport.jp` / `demo1234` が Supabase 上に存在すること

## セットアップ
```bash
cd qa
npm install
```
Chrome のパスが既定と違う場合は環境変数で指定：
```bash
# Windows 既定: C:/Program Files/Google/Chrome/Application/chrome.exe
CHROME_PATH="/path/to/chrome" node qa.js
```

## 実行
| コマンド | 内容 |
|---|---|
| `npm run test:basic`    | 初回(空データ)＋継続(データ投入)の2パターンで全ページ巡回。複数圃場＋写真保存・保存演出・設定を検査（`qa.js`） |
| `npm run test:farm`     | 中川農園シナリオ（20圃場・レタス/とうもろこし/米・米→8月末レタス転換・過去データ・実習生3名）で全ページ巡回（`qa_farm.js`） |
| `npm run test:category` | 作物カテゴリの新規追加演出・削除確認モーダルを検査（`qa_cat.js`） |
| `node qa_sim.js`     | **3年運用シミュレーション**。25圃場×4年×エッジ(空名/巨大値/null価格/畝未指定/ビザ切れ/status欠落等)900記録で全ページ＋圃場詳細サブタブを巡回。`whiteScreens`/`badPages`(NaN/undefined/Infinity表示)/`errorCount` を検査 |
| `node qa_actions.js` | **使い倒し**。GAP帳票PDF/Excel出力・農薬/施肥/収穫のリッチ保存・出荷/マスタ/整備の追加・削除・収益シミュレーターを実操作し `errorCount` を検査 |
| `node qa_empty.js`   | **新規ユーザー(データ空)** で全ページが白画面/壊れ表示/クラッシュしないか検査 |

> 引き継ぎ前の回帰確認は最低限この3本（`qa_sim` / `qa_actions` / `qa_empty`）を回し、`errorCount:0` / `whiteScreens:[]` / `badPages:[]` を確認すること。

## 結果の見方
標準出力の `QARESULT_START ... QARESULT_END` 間が JSON。主に見る値：
- `errorCount` … 0 が正常（console.error / pageerror の合計）
- `hasMain: false` の行 … 白画面/クラッシュしたページ
- `celebration.overlay` / `nativeDialogFired` … 保存演出の発火 / ネイティブダイアログの有無

## 仕組み・注意
- 各スクリプトは一時 http サーバでリポジトリ直下を配信 → ヘッドレス Chrome で `http://localhost:812x/` を開く。
- **認証セッションは残したまま `farm_*` の localStorage キーだけ消して「初回状態」を作る**。データはヘッドレス Chrome の使い捨てプロファイル内のみ（利用者の実ブラウザや本番には影響しない）。
- `farmId` は `farm_farms` から現在の農場 ID を再現取得（localStorage キーは `<key>_<farmId>`）。
- クリックはラベル文字列で対象を探す。**囲み div を誤クリックしないよう button/a を優先**。ステップ送りは「次へ」だが Step3 のみ「確認 →」なので注意。
