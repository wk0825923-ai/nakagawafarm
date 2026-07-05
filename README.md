# 農場管理システム（syatyo-suport / nakagawafarm）

畝（ロット）単位で農作業・農薬・施肥・収穫・GAP 書類を管理する、農家向け Web アプリ。
中川農園さま（レタス・とうもろこし・米、技能実習生含む小規模法人）を最初の導入先として開発。

- **本番**: https://syatyo-suport.vercel.app/
- **リポジトリ**: https://github.com/wk0825923-ai/nakagawafarm
- **デモアカウント**: `demo@syatyo-suport.jp` / `demo1234`

> ⚠️ **引き継ぎ担当の方へ**: まず [ARCHITECTURE.md](./ARCHITECTURE.md)（構成・データモデル）と
> [HANDOFF.md](./HANDOFF.md)（既知の課題・最初にやるべきこと）を必ず読んでください。
> 特に「農場データが localStorage 保存である」点は本番化の最重要論点です。

---

## 技術スタック
- **フロントエンド**: React 18（UMD／**ビルドなし**）+ `React.createElement`（**JSX 不使用**）。素の `<script>` 読み込み。
- **スタイル**: `css/app.css` + Tailwind（CDN）+ Tabler Icons（webfont）。
- **地図**: Leaflet（CDN）。
- **帳票**: jsPDF + html2canvas（PDF）、SheetJS/xlsx（Excel）。
- **認証・テナント**: Supabase（`@supabase/supabase-js`）。**認証と組織/農場情報のみ** DB 管理。
- **農場データ**: **ブラウザの localStorage**（記録・ロット・収穫など全て）。→ [ARCHITECTURE.md](./ARCHITECTURE.md) 参照。
- **デプロイ**: Vercel（`main` ブランチ push で自動デプロイ）。ビルドステップ無しの静的配信。

## セットアップ / 実行
ビルド不要。任意の静的サーバでリポジトリ直下を配信するだけ。
```bash
# 例: 適当な静的サーバで配信
npx serve .
#   → http://localhost:3000 を開く
# もしくは Python:
python -m http.server 8000
```
`file://` 直開きは localStorage/認証の origin 都合で不安定なため、**必ず http で配信**すること。

## テスト（回帰）
実ブラウザ E2E ハーネスを同梱。→ [qa/README.md](./qa/README.md)
```bash
cd qa && npm install
npm run test:basic   # 初回/継続の全ページ巡回・保存演出・複数圃場保存
npm run test:farm    # 20圃場の中川農園シナリオ
```

## ディレクトリ構成
```
index.html          読み込み順を定義（config → data → components → auth → app）
css/app.css         スタイル + アニメーション（保存演出 sb-celeb-*）
js/
  config.js         Supabase 初期化・定数(CONFIG)・PDF/Excel 出力・農薬使用回数などの共通関数
  data.js           初期データ(INITIAL_*)・作物カテゴリ・積算温度計算(computeHarvestForecast)
  components.js      ★全 UI コンポーネント（約 15,000 行・1 ファイル）
  auth.js           ログイン/サインアップ/オンボーディング/テナント読込(Root)
  app.js            App 本体・状態管理(useFPS=localStorage)・ページルーティング(pageMap)
qa/                 E2E テストハーネス（puppeteer-core）
```

## デプロイ
`main` に push すると Vercel が自動デプロイ。ビルド設定なし（Output Directory = ルート、静的配信）。
本番反映前の確認は `qa/` の E2E を回すこと。

## ライセンス / 権利
中川農園さま向けの受託開発物。取り扱いは受託契約に準ずる。
