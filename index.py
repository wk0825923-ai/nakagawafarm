bash

cat > /home/claude/oku_system_v4.html << 'HTMLEOF'
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>oku株式会社 社長サポートシステム v4</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#0c0e12;--bg2:#121418;--bg3:#191c22;--bg4:#1f232c;--bg5:#252931;
  --border:#272b35;--border2:#32374a;
  --text:#e2e4ec;--text2:#8892a4;--text3:#4e5568;
  --accent:#5b7fff;--accent2:#4a6dee;--accent-glow:rgba(91,127,255,0.12);
  --teal:#26d4b8;--teal-bg:rgba(38,212,184,0.08);
  --amber:#f5a623;--amber-bg:rgba(245,166,35,0.08);
  --coral:#ff6b7a;--coral-bg:rgba(255,107,122,0.08);
  --green:#4ade80;--green-bg:rgba(74,222,128,0.08);
  --purple:#a78bfa;--purple-bg:rgba(167,139,250,0.08);

  /* デザイン4原則に基づく余白・サイズ変数 */
  --space-xs:4px;   /* 極小：アイコン内の詰め */
  --space-sm:8px;   /* 小：バッジ・インライン要素間 */
  --space-md:16px;  /* 中：フォーム項目間・カード内要素間 */
  --space-lg:24px;  /* 大：カード間・セクション間 */
  --space-xl:36px;  /* 特大：ページ上部余白 */

  --r:8px;--rl:14px;
  --font:'Noto Sans JP',sans-serif;--mono:'DM Mono',monospace;

  /* カード・コンポーネント共通 */
  --card-pad:24px;
  --card-gap:16px;
  --section-gap:28px;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-size:13px}
body{font-family:var(--font);background:var(--bg);color:var(--text);min-height:100vh;line-height:1.6;-webkit-font-smoothing:antialiased}
button{font-family:var(--font);cursor:pointer;border:none;background:none}
input,textarea,select{font-family:var(--font);font-size:12px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);color:var(--text);padding:8px 12px;outline:none;transition:border-color .18s;width:100%}
input:focus,textarea:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(91,127,255,0.1)}
textarea{resize:vertical;min-height:72px}
select option{background:var(--bg3)}

/* LAYOUT */
#app{display:flex;min-height:100vh}
#sidebar{width:220px;min-width:220px;background:var(--bg2);border-right:1px solid var(--border);display:flex;flex-direction:column;position:sticky;top:0;height:100vh;overflow-y:auto;z-index:10}
.sidebar-logo{padding:22px 20px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px}
.logo-mark{font-family:var(--mono);font-size:16px;font-weight:500;color:var(--accent)}
.logo-version{font-size:9px;color:var(--text3);background:var(--bg3);padding:2px 7px;border-radius:4px;letter-spacing:0.5px;margin-top:1px}
/* 近接の原則：同じグループのナビは密に、グループ間はセクション区切り */
.nav-section{padding:12px 0;border-bottom:1px solid var(--border)}
.nav-section:last-of-type{border-bottom:none}
.nav-label{font-size:9px;font-weight:700;color:var(--text3);letter-spacing:1.4px;text-transform:uppercase;padding:0 16px 6px}
.nav-item{display:flex;align-items:center;gap:10px;padding:9px 16px;font-size:12px;color:var(--text2);cursor:pointer;transition:all .12s;border-left:2px solid transparent;user-select:none}
.nav-item:hover{background:var(--bg3);color:var(--text)}
.nav-item.active{background:var(--accent-glow);color:var(--accent);border-left-color:var(--accent);font-weight:500}
.nav-icon{font-size:13px;width:16px;text-align:center;flex-shrink:0}
.nav-badge{margin-left:auto;background:var(--coral-bg);color:var(--coral);font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px}
.sidebar-footer{margin-top:auto;padding:16px;border-top:1px solid var(--border);font-size:10px;color:var(--text3)}
#main{flex:1;overflow-y:auto}

/* PAGE WRAP — ページ左右余白・最大幅を統一（整列の原則） */
.page-wrap{padding:var(--space-xl) 32px;max-width:1100px}
.page{display:none}.page.active{display:block}

/* CARDS — 全カードの内側余白・角丸・ボーダーを統一（反復の原則） */
.card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:var(--card-pad)}
.card+.card{margin-top:var(--card-gap)}
/* カードタイトル: ラベル的な小さいテキストでコンテキストを与える */
.card-title{font-size:9px;font-weight:700;color:var(--text3);letter-spacing:1.2px;text-transform:uppercase;margin-bottom:var(--space-md)}
/* セクション間の余白は大きく取り、グループ内は密に（近接） */
.card-section{margin-top:var(--space-lg)}

/* グリッド — gap を統一して整列感を出す */
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:var(--card-gap)}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--card-gap)}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}

/* METRICS — KPIカードはより広い余白でスキャンしやすく */
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:var(--section-gap)}
.metric{background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:20px 20px 18px}
.metric-l{font-size:10px;color:var(--text3);margin-bottom:6px;letter-spacing:.3px}
.metric-v{font-size:22px;font-weight:700;font-family:var(--mono);line-height:1.2}
.metric-s{font-size:10px;color:var(--text3);margin-top:4px}

/* BUTTONS — サイズ・パディングを整合（反復） */
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:var(--r);font-size:12px;font-weight:500;cursor:pointer;transition:all .12s;white-space:nowrap}
.btn-primary{background:var(--accent);color:#fff;border:1px solid var(--accent)}
.btn-primary:hover{background:var(--accent2)}
.btn-ghost{background:transparent;color:var(--text2);border:1px solid var(--border)}
.btn-ghost:hover{background:var(--bg3);color:var(--text)}
.btn-teal{background:var(--teal-bg);color:var(--teal);border:1px solid rgba(38,212,184,.2)}
.btn-teal:hover{background:rgba(38,212,184,.14)}
.btn-amber{background:var(--amber-bg);color:var(--amber);border:1px solid rgba(245,166,35,.2)}
.btn-coral{background:var(--coral-bg);color:var(--coral);border:1px solid rgba(255,107,122,.2)}
.btn-sm{padding:4px 10px;font-size:11px}
.btn-lg{padding:11px 22px;font-size:13px}

/* BADGES */
.badge{display:inline-block;padding:3px 8px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.2px}
.b-blue{background:rgba(91,127,255,.14);color:var(--accent)}
.b-teal{background:var(--teal-bg);color:var(--teal)}
.b-amber{background:var(--amber-bg);color:var(--amber)}
.b-coral{background:var(--coral-bg);color:var(--coral)}
.b-green{background:var(--green-bg);color:var(--green)}
.b-purple{background:var(--purple-bg);color:var(--purple)}
.b-gray{background:var(--bg4);color:var(--text3)}

/* TABLE — 行の余白を適度に確保し読みやすく */
.tbl-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:9px;font-weight:700;color:var(--text3);letter-spacing:.8px;text-transform:uppercase;padding:10px 14px;border-bottom:1px solid var(--border)}
td{padding:11px 14px;font-size:12px;border-bottom:1px solid var(--border);vertical-align:middle}
tr:last-child td{border-bottom:none}
tr:hover td{background:var(--bg3)}

/* FORM — ラベル・インプット間の近接を統一 */
.fgrid{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-md)}
.ffull{grid-column:1/-1}
.fg label{display:block;font-size:10px;color:var(--text3);margin-bottom:5px;font-weight:500;letter-spacing:.3px}
.fhint{font-size:9px;color:var(--text3);margin-top:3px}

/* SECTION HEADERS — ページ上部タイトルエリア */
.sh{display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-md)}
.st{font-size:14px;font-weight:700}
.ph{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:var(--space-lg);gap:var(--space-md)}
.pt{font-size:20px;font-weight:700;letter-spacing:-.3px}
.ps{font-size:11px;color:var(--text3);margin-top:4px}

/* TABS */
.tabs{display:flex;gap:4px;margin-bottom:var(--space-lg)}
.tab{padding:7px 16px;border-radius:7px;font-size:11px;font-weight:500;color:var(--text3);cursor:pointer;transition:all .12s;border:1px solid transparent}
.tab:hover{color:var(--text2);background:var(--bg3)}
.tab.active{background:var(--accent-glow);color:var(--accent);border-color:rgba(91,127,255,.22)}

/* MODAL */
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:1000;align-items:center;justify-content:center;backdrop-filter:blur(3px)}
.modal-overlay.open{display:flex}
.modal{background:var(--bg2);border:1px solid var(--border2);border-radius:var(--rl);padding:28px;width:600px;max-width:95vw;max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.6)}
.modal-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px}
.modal-t{font-size:16px;font-weight:700}
.modal-x{width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:6px;color:var(--text3);cursor:pointer;font-size:16px;transition:all .12s}
.modal-x:hover{background:var(--bg3);color:var(--text)}
.modal-foot{display:flex;gap:10px;justify-content:flex-end;margin-top:22px}

/* ALERTS — 内側余白を広めに取り視認性アップ */
.alert{padding:12px 16px;border-radius:var(--r);font-size:11px;display:flex;align-items:flex-start;gap:8px;margin-bottom:var(--space-md);line-height:1.7}
.alert-amber{background:var(--amber-bg);color:var(--amber);border:1px solid rgba(245,166,35,.2)}
.alert-coral{background:var(--coral-bg);color:var(--coral);border:1px solid rgba(255,107,122,.2)}
.alert-teal{background:var(--teal-bg);color:var(--teal);border:1px solid rgba(38,212,184,.2)}
.alert-blue{background:var(--accent-glow);color:var(--accent);border:1px solid rgba(91,127,255,.2)}

/* TOAST */
#toast-c{position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px}
.toast{background:var(--bg3);border:1px solid var(--border2);border-radius:var(--r);padding:10px 16px;font-size:12px;color:var(--text);box-shadow:0 4px 20px rgba(0,0,0,.4);animation:toastIn .18s ease;display:flex;align-items:center;gap:8px}
.toast.ok{border-left:3px solid var(--green)}.toast.err{border-left:3px solid var(--coral)}
@keyframes toastIn{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:translateX(0)}}

/* PROGRESS */
.pbar{height:4px;background:var(--bg4);border-radius:3px;overflow:hidden;margin-top:6px}
.pfill{height:100%;border-radius:3px;transition:width .4s ease}

/* WIZARD */
.wsteps{display:flex;gap:0;margin-bottom:var(--space-lg);border-bottom:1px solid var(--border)}
.wstep{flex:1;padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:var(--text3);border-bottom:2px solid transparent;cursor:pointer;transition:all .12s}
.wstep.active{color:var(--accent);border-bottom-color:var(--accent)}
.wstep.done{color:var(--green);border-bottom-color:var(--green)}
.wpanel{display:none}.wpanel.active{display:block}

/* CONTRACT PREVIEW */
.cpreview{background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:20px;font-size:11px;line-height:2;white-space:pre-wrap;font-family:var(--mono);max-height:440px;overflow-y:auto;color:var(--text2)}
.clause-row{display:flex;align-items:baseline;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)}
.clause-num{font-family:var(--mono);font-size:10px;color:var(--accent);min-width:72px;font-weight:700}

/* CHECKLIST */
.ck-list{list-style:none}
.ck-item{display:flex;align-items:center;gap:10px;padding:8px 0;font-size:12px;color:var(--text2);border-bottom:1px solid var(--border)}
.ck-item:last-child{border:none}
.ck-item input[type=checkbox]{width:auto;accent-color:var(--accent)}
.ck-item label{cursor:pointer;flex:1}
.ck-item.done label{text-decoration:line-through;color:var(--text3)}

/* FOLLOWUP CARDS — 左ボーダーで優先度を視覚的に区別（コントラストの原則） */
.fu-card{background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:16px;margin-bottom:10px}
.fu-urgent{border-left:3px solid var(--coral)}
.fu-normal{border-left:3px solid var(--amber)}
.fu-done-c{border-left:3px solid var(--green);opacity:.7}

/* SEMINAR CARD */
.sem-card{border:1px solid var(--border);border-radius:var(--rl);overflow:hidden;margin-bottom:var(--card-gap)}
.sem-head{padding:18px 22px;background:var(--bg3);display:flex;align-items:center;gap:12px}
.sem-body{padding:18px 22px}
.sem-date{font-family:var(--mono);font-size:10px;color:var(--text3);background:var(--bg4);padding:3px 8px;border-radius:4px}

/* CALENDAR */
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
.cal-hd{text-align:center;font-size:9px;font-weight:700;color:var(--text3);padding:6px 0;letter-spacing:.5px}
.cal-day{aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:5px;border-radius:6px;font-size:11px;color:var(--text2);cursor:pointer;border:1px solid transparent;transition:all .12s;position:relative}
.cal-day:hover{background:var(--bg3)}
.cal-day.today{border-color:var(--accent);color:var(--accent);font-weight:700}
.cal-day.has-ev::after{content:'';width:4px;height:4px;border-radius:50%;background:var(--accent);position:absolute;bottom:3px}
.cal-day.other{color:var(--text3)}

/* GOOGLE DOCS BUTTON */
.gdoc-btn{display:inline-flex;align-items:center;gap:8px;padding:9px 16px;background:rgba(66,133,244,.1);border:1px solid rgba(66,133,244,.25);border-radius:var(--r);color:#4285F4;font-size:12px;font-weight:500;cursor:pointer;transition:all .12s}
.gdoc-btn:hover{background:rgba(66,133,244,.17)}

/* QUICK ACTION — 2カラムグリッドでアイコン・ラベルを整列 */
.qa-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.qa{padding:16px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);cursor:pointer;transition:all .12s}
.qa:hover{border-color:var(--border2);background:var(--bg4);transform:translateY(-1px)}
.qa-i{font-size:20px;margin-bottom:8px}
.qa-l{font-size:12px;font-weight:600}
.qa-s{font-size:10px;color:var(--text3);margin-top:2px}

/* DOC TYPE SELECTOR */
.doc-types{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-bottom:var(--space-lg)}
.dt-card{background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:14px;cursor:pointer;transition:all .12s;text-align:center}
.dt-card:hover,.dt-card.sel{border-color:var(--accent);background:var(--accent-glow)}
.dt-i{font-size:22px;margin-bottom:6px}
.dt-n{font-size:10px;font-weight:500}

/* EVENT ITEMS */
.ev-item{display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);margin-bottom:6px}
.ev-time{font-family:var(--mono);font-size:10px;color:var(--text3);min-width:56px}
.ev-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}

/* WORK TYPE CHIPS */
.chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
.chip{padding:4px 12px;border-radius:20px;font-size:10px;font-weight:500;cursor:pointer;border:1px solid var(--border);background:var(--bg3);color:var(--text3);transition:all .12s;user-select:none}
.chip.on{background:var(--accent-glow);color:var(--accent);border-color:rgba(91,127,255,.3)}

/* FILTER CHIPS */
.filter-bar{display:flex;gap:6px;margin-bottom:var(--space-md);flex-wrap:wrap}
.fb{padding:5px 12px;border-radius:20px;font-size:10px;font-weight:500;cursor:pointer;border:1px solid var(--border);background:var(--bg3);color:var(--text3);transition:all .12s}
.fb.active{background:var(--accent-glow);color:var(--accent);border-color:rgba(91,127,255,.3)}
</style>
</head>
<body>
<div id="app">
<nav id="sidebar">
  <div class="sidebar-logo">
    <div>
      <div class="logo-mark">oku(株)</div>
      <div style="display:flex;gap:5px;margin-top:3px"><span class="logo-version">v4.0</span><span class="logo-version" style="color:var(--text3)">だいや専用</span></div>
    </div>
  </div>
  <div class="nav-section">
    <div class="nav-label">メイン</div>
    <div class="nav-item active" data-page="dashboard"><span class="nav-icon">◈</span>ダッシュボード</div>
  </div>
  <div class="nav-section">
    <div class="nav-label">★ 優先機能</div>
    <div class="nav-item" data-page="docs"><span class="nav-icon">📄</span>書類スピード生成</div>
    <div class="nav-item" data-page="contract"><span class="nav-icon">📋</span>契約書ウィザード</div>
    <div class="nav-item" data-page="seminar"><span class="nav-icon">🎤</span>イベント運営管理 <span class="nav-badge" id="nb-sem">2</span></div>
  </div>
  <div class="nav-section">
    <div class="nav-label">クライアント</div>
    <div class="nav-item" data-page="clients"><span class="nav-icon">◎</span>クライアント管理</div>
    <div class="nav-item" data-page="followup"><span class="nav-icon">🔗</span>フォローアップ <span class="nav-badge" id="nb-fu" style="display:none">0</span></div>
  </div>
  <div class="nav-section">
    <div class="nav-label">運用</div>
    <div class="nav-item" data-page="schedule"><span class="nav-icon">◷</span>スケジュール</div>
  </div>
  <div class="sidebar-footer">
    <div style="font-weight:500;color:var(--text2)">だいや</div>
    <div style="margin-top:2px">社長サポート責任者</div>
  </div>
</nav>

<div id="main">

<!-- ========== DASHBOARD ========== -->
<div id="page-dashboard" class="page active">
<div class="page-wrap">
  <div class="ph">
    <div><div class="pt">ダッシュボード</div><div class="ps">社長のめんどくさいを全部ここで完結</div></div>
    <div id="dash-date" style="font-family:var(--mono);font-size:11px;color:var(--text3);align-self:center"></div>
  </div>
  <div class="metrics">
    <div class="metric"><div class="metric-l">今期売上</div><div class="metric-v" style="color:var(--teal)">¥30.0億</div><div class="metric-s">経常利益率 60%</div></div>
    <div class="metric"><div class="metric-l">アクティブ案件</div><div class="metric-v" style="color:var(--accent)" id="m-deals">0</div><div class="metric-s">商談中・契約・納品中</div></div>
    <div class="metric"><div class="metric-l">フォロー待ち</div><div class="metric-v" style="color:var(--coral)" id="m-fu">0</div><div class="metric-s">要アクション</div></div>
    <div class="metric"><div class="metric-l">次イベントまで</div><div class="metric-v" style="color:var(--amber)" id="m-ev-days">—</div><div class="metric-s" id="m-ev-name">未登録</div></div>
    <div class="metric"><div class="metric-l">年間取引件数</div><div class="metric-v" style="color:var(--purple)">12,000</div><div class="metric-s">月1,000件・単価30万円〜</div></div>
  </div>
  <div class="grid2">
    <div>
      <div class="card">
        <div class="card-title">クイックアクション</div>
        <div class="qa-grid">
          <div class="qa" onclick="goPage('contract')"><div class="qa-i">📋</div><div class="qa-l">契約書を作る</div><div class="qa-s">第1〜14条 ウィザード</div></div>
          <div class="qa" onclick="goPage('docs');selDocType('請求書')"><div class="qa-i">🧾</div><div class="qa-l">請求書・見積書</div><div class="qa-s">Google Docs 1タップ出力</div></div>
          <div class="qa" onclick="goPage('clients');openClientModal()"><div class="qa-i">🏢</div><div class="qa-l">クライアント追加</div><div class="qa-s">ヒアリング記録もまとめて</div></div>
          <div class="qa" onclick="goPage('followup')"><div class="qa-i">🔗</div><div class="qa-l">フォローアップ</div><div class="qa-s">リード → 商談化</div></div>
          <div class="qa" onclick="goPage('seminar')"><div class="qa-i">🎤</div><div class="qa-l">イベント運営準備</div><div class="qa-s">6月末 2イベント</div></div>
          <div class="qa" onclick="goPage('schedule')"><div class="qa-i">◷</div><div class="qa-l">スケジュール確認</div><div class="qa-s">商談・講演・移動</div></div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">6月末 イベント準備状況</div>
        <div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:11px">中小企業同友会 講演</span><span class="badge b-amber" id="sp1-pct">0%</span></div>
          <div class="pbar"><div class="pfill" id="sp1-bar" style="width:0%;background:var(--amber)"></div></div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:11px">oku自社サービス説明会</span><span class="badge b-teal" id="sp2-pct">0%</span></div>
          <div class="pbar"><div class="pfill" id="sp2-bar" style="width:0%;background:var(--teal)"></div></div>
        </div>
      </div>
    </div>
    <div>
      <div class="card"><div class="card-title">直近のクライアント</div><div id="dash-clients"><div style="color:var(--text3);font-size:11px;padding:8px 0">クライアント管理から追加してください</div></div></div>
      <div class="card"><div class="card-title">直近タスク</div><div id="dash-tasks"><div style="color:var(--text3);font-size:11px;padding:8px 0">スケジュールに予定を追加すると表示されます</div></div></div>
    </div>
  </div>
</div>
</div>

<!-- ========== DOCS ========== -->
<div id="page-docs" class="page">
<div class="page-wrap">
  <div class="ph"><div><div class="pt">書類スピード生成</div><div class="ps">見積書・請求書・発注書・NDA → Google Docs に 1 タップ出力</div></div></div>
  <div class="alert alert-teal">💡 業務委託契約書（第1〜14条）は「契約書ウィザード」ページからどうぞ。社長に確認してもらってから送付。</div>
  <div class="card-title" style="margin-bottom:12px">書類の種類を選択</div>
  <div class="doc-types">
    <div class="dt-card sel" data-type="見積書" onclick="selDocType('見積書')"><div class="dt-i">📋</div><div class="dt-n">見積書</div></div>
    <div class="dt-card" data-type="請求書" onclick="selDocType('請求書')"><div class="dt-i">🧾</div><div class="dt-n">請求書</div></div>
    <div class="dt-card" data-type="発注書" onclick="selDocType('発注書')"><div class="dt-i">📤</div><div class="dt-n">発注書</div></div>
    <div class="dt-card" data-type="NDA" onclick="selDocType('NDA')"><div class="dt-i">🔒</div><div class="dt-n">NDA（秘密保持）</div></div>
    <div class="dt-card" data-type="業務報告書" onclick="selDocType('業務報告書')"><div class="dt-i">📊</div><div class="dt-n">業務報告書</div></div>
  </div>
  <div class="card">
    <div class="card-title" id="doc-form-title">見積書 — 入力フォーム</div>
    <div class="fgrid" style="margin-bottom:var(--space-md)">
      <div class="fg"><label>宛先（企業名）</label><input id="doc-to-co" type="text" placeholder="株式会社〇〇"></div>
      <div class="fg"><label>宛先（担当者名）</label><input id="doc-to-p" type="text" placeholder="田中様"></div>
      <div class="fg"><label>発行日</label><input id="doc-date" type="date"></div>
      <div class="fg"><label>有効期限 / 支払期限</label><input id="doc-due" type="date"></div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <span style="font-size:11px;font-weight:700;color:var(--text2)">明細</span>
      <button class="btn btn-ghost btn-sm" onclick="addLine()">+ 行を追加</button>
    </div>
    <div class="tbl-wrap">
      <table>
        <thead><tr><th style="width:40%">内容・サービス名</th><th style="width:14%">数量</th><th style="width:20%">単価</th><th style="width:18%">小計</th><th style="width:8%"></th></tr></thead>
        <tbody id="line-items"></tbody>
      </table>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:14px">
      <div style="text-align:right">
        <div style="font-size:11px;color:var(--text3);margin-bottom:4px">小計: <span id="subtotal" style="font-family:var(--mono)">¥0</span></div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:4px">消費税(10%): <span id="tax-amt" style="font-family:var(--mono)">¥0</span></div>
        <div style="font-size:15px;font-weight:700;color:var(--teal)">合計: <span id="total" style="font-family:var(--mono)">¥0</span></div>
      </div>
    </div>
    <div class="fg" style="margin-top:var(--space-md)"><label>備考・補足（任意）</label><textarea id="doc-note" placeholder="振込先・支払い条件・備考など"></textarea></div>
    <div style="display:flex;gap:10px;margin-top:var(--space-md);flex-wrap:wrap">
      <button class="btn btn-ghost" onclick="previewDoc()">👁 プレビュー</button>
      <button class="gdoc-btn" onclick="genDocLink()">📄 Google Docsで開く（社長確認用）</button>
    </div>
  </div>
</div>
</div>

<!-- ========== CONTRACT ========== -->
<div id="page-contract" class="page">
<div class="page-wrap">
  <div class="ph"><div><div class="pt">契約書ウィザード</div><div class="ps">業務委託契約書（第1〜14条）を 3 ステップで自動生成 — 社長は確認→署名のみ</div></div></div>
  <div class="alert alert-blue">📌 生成した契約書のたたき台は必ず社長に確認してもらい、先方への送付は社長から行います。あなたから直接送付しない。</div>
  <div class="wsteps">
    <div class="wstep active" id="ws1" onclick="goWiz(1)">① 基本情報</div>
    <div class="wstep" id="ws2" onclick="goWiz(2)">② 業務内容・報酬</div>
    <div class="wstep" id="ws3" onclick="goWiz(3)">③ 条項確認・生成</div>
  </div>
  <div id="wp1" class="wpanel active">
    <div class="card">
      <div class="card-title">基本情報</div>
      <div class="fgrid">
        <div class="fg"><label>委託者（先方・企業名）*</label><input id="cw-client" type="text" placeholder="株式会社〇〇"></div>
        <div class="fg"><label>委託者 代表者名</label><input id="cw-crep" type="text" placeholder="代表取締役 田中 太郎"></div>
        <div class="fg"><label>委託者 住所</label><input id="cw-caddr" type="text" placeholder="東京都〇〇区..."></div>
        <div class="fg"><label>受託者</label><input id="cw-oku" type="text" value="oku株式会社"></div>
        <div class="fg"><label>契約開始日</label><input id="cw-start" type="date"></div>
        <div class="fg"><label>契約期間</label>
          <select id="cw-period">
            <option>1年・自動更新</option><option>6ヶ月・自動更新</option><option>3ヶ月・更新協議</option><option>期間の定めなし</option>
          </select>
        </div>
      </div>
      <div style="margin-top:var(--space-lg);display:flex;justify-content:flex-end"><button class="btn btn-primary" onclick="goWiz(2)">次へ →</button></div>
    </div>
  </div>
  <div id="wp2" class="wpanel">
    <div class="card">
      <div class="card-title">業務内容・報酬設定</div>
      <div class="fgrid">
        <div class="fg ffull">
          <label>委託業務の内容（第1条）— 複数選択可</label>
          <div class="chips" id="work-chips">
            <span class="chip" onclick="toggleChip(this,'SNS運用')">SNS運用</span>
            <span class="chip" onclick="toggleChip(this,'HP制作')">HP制作</span>
            <span class="chip" onclick="toggleChip(this,'HP運用保守')">HP運用保守</span>
            <span class="chip" onclick="toggleChip(this,'システム開発')">システム開発</span>
            <span class="chip" onclick="toggleChip(this,'AI導入支援')">AI導入支援</span>
            <span class="chip" onclick="toggleChip(this,'AIシステム提供')">AIシステム提供</span>
            <span class="chip" onclick="toggleChip(this,'代理店支援')">代理店支援</span>
            <span class="chip" onclick="toggleChip(this,'顧問・コンサル')">顧問・コンサル</span>
            <span class="chip" onclick="toggleChip(this,'EC・物販支援')">EC・物販支援</span>
          </div>
          <input id="cw-work" type="text" placeholder="または直接入力" style="margin-top:6px">
        </div>
        <div class="fg"><label>報酬形態</label>
          <select id="cw-fee-type" onchange="updFeeFields()">
            <option value="monthly">月額固定のみ</option>
            <option value="monthly+init">月額＋初期費用</option>
            <option value="monthly+perf">月額＋成果報酬</option>
            <option value="monthly+init+perf">複合（月額＋初期＋成果）</option>
          </select>
        </div>
        <div class="fg"><label>月額委託料（万円・税別）</label><input id="cw-monthly" type="number" placeholder="30"></div>
        <div class="fg" id="cw-init-g" style="display:none"><label>初期費用（万円・税別）</label><input id="cw-init" type="number" placeholder="50"></div>
        <div class="fg ffull" id="cw-perf-g" style="display:none"><label>成果報酬の内容</label><input id="cw-perf" type="text" placeholder="新規契約1件につき〇〇万円など"></div>
        <div class="fg"><label>支払いサイクル</label>
          <select id="cw-cycle">
            <option>月末締め翌月末払い</option><option>月末締め翌々月末払い</option><option>20日締め翌月末払い</option><option>前払い</option>
          </select>
        </div>
      </div>
      <div style="margin-top:var(--space-lg);display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-ghost" onclick="goWiz(1)">← 戻る</button>
        <button class="btn btn-primary" onclick="goWiz(3)">次へ →</button>
      </div>
    </div>
  </div>
  <div id="wp3" class="wpanel">
    <div class="card" style="margin-bottom:var(--card-gap)">
      <div class="card-title">条項の確認（第1条〜第14条）</div>
      <div id="clause-list"></div>
    </div>
    <div class="card">
      <div class="card-title">契約書プレビュー（たたき台）</div>
      <div class="cpreview" id="cpreview">ステップ①②を入力すると自動生成されます</div>
      <div style="display:flex;gap:10px;margin-top:var(--space-md);flex-wrap:wrap">
        <button class="btn btn-ghost" onclick="goWiz(2)">← 戻る</button>
        <button class="gdoc-btn" onclick="genContractDoc()">📄 Google Docsで開く（社長確認用）</button>
        <button class="btn btn-teal" onclick="copyCT()">📋 テキストコピー</button>
      </div>
    </div>
  </div>
</div>
</div>

<!-- ========== SEMINAR ========== -->
<div id="page-seminar" class="page">
<div class="page-wrap">
  <div class="ph">
    <div><div class="pt">イベント運営管理</div><div class="ps">社長は「喋るだけ」— 準備・集客・当日運営・フォローは全部ここで完結</div></div>
    <button class="btn btn-primary" onclick="openSemModal()">+ イベント追加</button>
  </div>
  <div class="alert alert-amber">🎯 6月末の2大イベントが最優先。チェックリストを毎日更新して社長が安心して喋れる状態を作ること。</div>
  <div id="seminar-list"></div>
</div>
</div>

<!-- ========== CLIENTS ========== -->
<div id="page-clients" class="page">
<div class="page-wrap">
  <div class="ph">
    <div><div class="pt">クライアント管理</div><div class="ps">案件・ヒアリング記録・ステータスを一元管理</div></div>
    <button class="btn btn-primary" onclick="openClientModal()">+ 新規追加</button>
  </div>
  <div class="filter-bar">
    <div class="fb active" onclick="filterC('all',this)">すべて</div>
    <div class="fb" onclick="filterC('リード',this)">リード</div>
    <div class="fb" onclick="filterC('商談中',this)">商談中</div>
    <div class="fb" onclick="filterC('契約済',this)">契約済</div>
    <div class="fb" onclick="filterC('納品中',this)">納品中</div>
    <div class="fb" onclick="filterC('完了',this)">完了</div>
  </div>
  <div class="card">
    <div class="tbl-wrap">
      <table>
        <thead><tr><th>企業名 / 担当者</th><th>業種</th><th>案件種別</th><th>金額</th><th>ステータス</th><th>最終更新</th><th></th></tr></thead>
        <tbody id="clients-tb"></tbody>
      </table>
    </div>
    <div id="clients-empty" style="font-size:11px;color:var(--text3);padding:20px;text-align:center">クライアントが登録されていません</div>
  </div>
</div>
</div>

<!-- ========== FOLLOWUP ========== -->
<div id="page-followup" class="page">
<div class="page-wrap">
  <div class="ph">
    <div><div class="pt">フォローアップ管理</div><div class="ps">講演・セミナーでこぼれたリード → ヒアリング → 商談化</div></div>
    <button class="btn btn-primary" onclick="openFuModal()">+ リード追加</button>
  </div>
  <div class="alert alert-amber">🎯 社長の講演後に名刺交換・LINE登録した経営者は全員ここに記録。あなたが窓口として受けてフォロー → 契約書ウィザードへ繋ぐ。</div>
  <div class="tabs">
    <div class="tab active" onclick="switchFuTab('active',this)">フォロー中</div>
    <div class="tab" onclick="switchFuTab('hearing',this)">ヒアリング済</div>
    <div class="tab" onclick="switchFuTab('done',this)">商談化・完了</div>
  </div>
  <div id="fu-list"></div>
</div>
</div>

<!-- ========== SCHEDULE ========== -->
<div id="page-schedule" class="page">
<div class="page-wrap">
  <div class="ph">
    <div><div class="pt">スケジュール管理</div><div class="ps">社長の時間を守る — 商談・講演・移動を一元管理</div></div>
    <button class="btn btn-primary" onclick="openEvModal()">+ 予定を追加</button>
  </div>
  <div class="grid2">
    <div>
      <div class="card">
        <div class="card-title" id="cal-month-lbl">2026年6月</div>
        <div class="cal-grid" id="cal-hdr"></div>
        <div class="cal-grid" id="cal-days"></div>
      </div>
    </div>
    <div>
      <div class="card"><div class="card-title">今月の予定</div><div id="ev-list"><div style="font-size:11px;color:var(--text3);padding:8px 0">予定はありません</div></div></div>
    </div>
  </div>
</div>
</div>

</div><!-- /main -->
</div><!-- /app -->

<!-- ===== MODALS ===== -->
<!-- Client Modal -->
<div class="modal-overlay" id="client-modal">
  <div class="modal">
    <div class="modal-h"><div class="modal-t" id="c-modal-t">クライアント追加</div><div class="modal-x" onclick="closeMod('client-modal')">×</div></div>
    <div class="fgrid">
      <div class="fg"><label>企業名 *</label><input id="c-co" type="text" placeholder="株式会社〇〇"></div>
      <div class="fg"><label>担当者名</label><input id="c-person" type="text" placeholder="田中 太郎"></div>
      <div class="fg"><label>電話番号</label><input id="c-tel" type="tel" placeholder="090-XXXX-XXXX"></div>
      <div class="fg"><label>メールアドレス</label><input id="c-email" type="email" placeholder="tanaka@co.jp"></div>
      <div class="fg"><label>業種</label>
        <select id="c-ind">
          <option value="">選択</option><option>IT・システム開発</option><option>SNS・Webマーケティング</option><option>士業（税理士・社労士等）</option><option>飲食</option><option>宿泊・観光</option><option>スポーツ施設（体育館・バドミントン・フットサル等）</option><option>一次産業（農業・漁業・養豚等）</option><option>製造業</option><option>小売・EC</option><option>医療・介護</option><option>建設・不動産</option><option>教育</option><option>その他</option>
        </select>
      </div>
      <div class="fg"><label>案件種別</label>
        <select id="c-deal">
          <option value="">選択</option><option>システム開発</option><option>Web開発</option><option>SNS運用</option><option>AI導入（国産AI）</option><option>AI OEM提供（ホワイトラベル）</option><option>顧問契約</option><option>代理店契約</option><option>その他</option>
        </select>
      </div>
      <div class="fg"><label>案件金額（万円）</label><input id="c-amt" type="number" placeholder="300"></div>
      <div class="fg"><label>ステータス</label>
        <select id="c-status"><option>リード</option><option>商談中</option><option>契約済</option><option>納品中</option><option>完了</option><option>保留</option></select>
      </div>
      <div class="fg ffull"><label>ヒアリング記録・メモ</label><textarea id="c-note" placeholder="どこで繋がった、何に困っている、提案内容、次のアクションなど"></textarea></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeMod('client-modal')">キャンセル</button>
      <button class="btn btn-primary" onclick="saveClient()">保存</button>
    </div>
  </div>
</div>

<!-- Followup Modal -->
<div class="modal-overlay" id="fu-modal">
  <div class="modal">
    <div class="modal-h"><div class="modal-t">リード追加（フォローアップ）</div><div class="modal-x" onclick="closeMod('fu-modal')">×</div></div>
    <div class="fgrid">
      <div class="fg"><label>企業名 *</label><input id="fu-co" type="text" placeholder="株式会社〇〇"></div>
      <div class="fg"><label>担当者名 *</label><input id="fu-person" type="text" placeholder="田中 太郎"></div>
      <div class="fg"><label>接触経路</label>
        <select id="fu-src"><option>中小企業同友会講演</option><option>oku自社説明会</option><option>SNS経由</option><option>紹介</option><option>その他</option></select>
      </div>
      <div class="fg"><label>連絡先（LINE/Tel/Mail）</label><input id="fu-contact" type="text" placeholder="LINE: @xxx / 090-..."></div>
      <div class="fg"><label>業種</label>
        <select id="fu-ind"><option value="">選択</option><option>士業</option><option>飲食</option><option>宿泊・観光</option><option>スポーツ施設</option><option>一次産業</option><option>IT・Web</option><option>製造業</option><option>その他</option></select>
      </div>
      <div class="fg"><label>優先度</label>
        <select id="fu-pri"><option value="high">高（すぐ連絡）</option><option value="mid">中（1週間以内）</option><option value="low">低（今月中）</option></select>
      </div>
      <div class="fg ffull"><label>課題・ヒアリングメモ</label><textarea id="fu-note" placeholder="何に困っていた、どんな反応だったか、提案できそうなサービスなど"></textarea></div>
      <div class="fg"><label>次のアクション</label>
        <select id="fu-next"><option>LINE追加・挨拶</option><option>電話でヒアリング</option><option>個別商談設定</option><option>資料送付</option><option>見積書送付</option><option>契約書作成</option></select>
      </div>
      <div class="fg"><label>期限</label><input id="fu-deadline" type="date"></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeMod('fu-modal')">キャンセル</button>
      <button class="btn btn-primary" onclick="saveFu()">保存</button>
    </div>
  </div>
</div>

<!-- Seminar Modal -->
<div class="modal-overlay" id="sem-modal">
  <div class="modal">
    <div class="modal-h"><div class="modal-t">イベント追加</div><div class="modal-x" onclick="closeMod('sem-modal')">×</div></div>
    <div class="fgrid">
      <div class="fg ffull"><label>イベント名 *</label><input id="s-name" type="text" placeholder="oku株式会社 自社サービス説明会"></div>
      <div class="fg"><label>開催日</label><input id="s-date" type="date"></div>
      <div class="fg"><label>開催時間</label><input id="s-time" type="time"></div>
      <div class="fg"><label>会場</label><input id="s-venue" type="text" placeholder="〇〇ホール 3F 会議室"></div>
      <div class="fg"><label>目標集客人数</label><input id="s-cap" type="number" placeholder="50"></div>
      <div class="fg ffull"><label>ターゲット</label><input id="s-target" type="text" placeholder="中小企業経営者、IT化を検討している経営者"></div>
      <div class="fg ffull"><label>備考</label><textarea id="s-note" placeholder="チラシ完成済み、SNS告知は〇〇に依頼予定など"></textarea></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeMod('sem-modal')">キャンセル</button>
      <button class="btn btn-primary" onclick="saveSem()">保存</button>
    </div>
  </div>
</div>

<!-- Schedule Modal -->
<div class="modal-overlay" id="ev-modal">
  <div class="modal">
    <div class="modal-h"><div class="modal-t">予定を追加</div><div class="modal-x" onclick="closeMod('ev-modal')">×</div></div>
    <div class="fgrid">
      <div class="fg ffull"><label>タイトル *</label><input id="ev-title" type="text" placeholder="〇〇株式会社 商談"></div>
      <div class="fg"><label>日付</label><input id="ev-date" type="date"></div>
      <div class="fg"><label>時間</label><input id="ev-time" type="time"></div>
      <div class="fg"><label>種別</label>
        <select id="ev-type"><option>商談</option><option>講演・セミナー</option><option>社内MTG</option><option>訪問</option><option>移動</option><option>締め切り</option><option>その他</option></select>
      </div>
      <div class="fg ffull"><label>メモ</label><textarea id="ev-note" placeholder="場所、準備物、アジェンダなど"></textarea></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeMod('ev-modal')">キャンセル</button>
      <button class="btn btn-primary" onclick="saveEv()">保存</button>
    </div>
  </div>
</div>

<!-- Doc Preview Modal -->
<div class="modal-overlay" id="preview-modal">
  <div class="modal" style="width:640px">
    <div class="modal-h"><div class="modal-t" id="prev-title">書類プレビュー</div><div class="modal-x" onclick="closeMod('preview-modal')">×</div></div>
    <div id="prev-body" style="font-size:11px;line-height:1.9;white-space:pre-wrap;font-family:var(--mono);background:var(--bg3);padding:18px;border-radius:var(--r);max-height:400px;overflow-y:auto;color:var(--text2)"></div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="closeMod('preview-modal')">閉じる</button>
      <button class="btn btn-primary" onclick="genDocLink()">Google Docsで開く</button>
    </div>
  </div>
</div>

<div id="toast-c"></div>

<script>
// ===== STATE =====
const S = {
  clients: [],
  seminars: [],
  events: [],
  followups: []
};

const DEF_SEMINARS = [
  {
    id: 'sem1', name: '中小企業同友会 奥村航稀 講演', date: '2026-06-28', time: '14:00',
    venue: '中小企業同友会 会場（調整中）', capacity: 80,
    target: '中小企業経営者、IT化に課題を感じている経営者',
    note: '社長の講演。終了後のリード回収動線（だいや窓口）を必ず設計すること。',
    checklist: [
      {id:'c1',label:'会場の確認・予約（日程・レイアウト・AV機器）',done:false},
      {id:'c2',label:'社長の講演資料の最終確認（社長に依頼）',done:false},
      {id:'c3',label:'参加者への案内メール・LINE一斉送付',done:false},
      {id:'c4',label:'リード回収用 LINE公式アカウントQRコード準備',done:false},
      {id:'c5',label:'当日の名刺・チラシ・oku説明資料の印刷',done:false},
      {id:'c6',label:'「本日の窓口はだいや」動線の設計（アナウンス準備）',done:false},
      {id:'c7',label:'終了後フォロー連絡テンプレートの作成',done:false},
      {id:'c8',label:'当日運営スタッフの確定',done:false}
    ]
  },
  {
    id: 'sem2', name: 'oku株式会社 自社サービス説明会', date: '2026-06-30', time: '13:00',
    venue: '調整中', capacity: 50,
    target: '代理店候補企業・IT化を検討している中小企業経営者',
    note: 'チラシほぼ完成。申込フォームの自動化（申込→自動返信→Zoom案内）が次のタスク。300人の委託を集客兵団として動かす。',
    checklist: [
      {id:'d1',label:'チラシ最終版の確認・印刷・データ配布',done:false},
      {id:'d2',label:'申込フォーム（自動応答・Zoom案内自動送付）の作成',done:false},
      {id:'d3',label:'SNS告知スケジュール作成（LINE/IG/TikTok/YT）',done:false},
      {id:'d4',label:'ディレクター15人への集客タスク割り振り（目標人数設定）',done:false},
      {id:'d5',label:'会場手配・設営確認（プロジェクター・椅子レイアウト）',done:false},
      {id:'d6',label:'当日の受付担当・運営体制の確定',done:false},
      {id:'d7',label:'参加者リード管理スプレッドシートの準備',done:false},
      {id:'d8',label:'終了後フォロー連絡テンプレートの作成',done:false},
      {id:'d9',label:'リード回収用LINE QRコード準備',done:false}
    ]
  }
];

function saveState() {
  try { localStorage.setItem('oku_v4', JSON.stringify(S)); } catch(e) {}
}
function loadState() {
  try {
    const d = localStorage.getItem('oku_v4');
    if (d) Object.assign(S, JSON.parse(d));
  } catch(e) {}
  if (!S.seminars || S.seminars.length === 0) {
    S.seminars = JSON.parse(JSON.stringify(DEF_SEMINARS));
    saveState();
  }
  if (!S.followups) S.followups = [];
}

// ===== NAVIGATION =====
function goPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pg = document.getElementById('page-' + id);
  if (pg) pg.classList.add('active');
  const ni = document.querySelector('[data-page="' + id + '"]');
  if (ni) ni.classList.add('active');
  const refreshMap = {
    dashboard: refreshDash, docs: refreshDocs, clients: refreshClients,
    followup: refreshFu, seminar: refreshSeminar, schedule: refreshCal,
    contract: refreshContract
  };
  if (refreshMap[id]) refreshMap[id]();
}
document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', () => goPage(el.dataset.page));
});

// ===== UTILS =====
function fmtN(n) { return Math.round(n).toLocaleString('ja-JP'); }
function openMod(id) { document.getElementById(id).classList.add('open'); }
function closeMod(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) closeMod(el.id); });
});
function toast(msg, type = '') {
  const c = document.getElementById('toast-c');
  const el = document.createElement('div');
  el.className = 'toast ' + (type === 'success' ? 'ok' : type === 'error' ? 'err' : '');
  el.textContent = (type === 'success' ? '✓ ' : type === 'error' ? '✕ ' : '') + msg;
  c.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3000);
}
function statusBadge(s) {
  const m = { リード: 'b-gray', 商談中: 'b-amber', 契約済: 'b-blue', 納品中: 'b-teal', 完了: 'b-green', 保留: 'b-coral' };
  return m[s] || 'b-gray';
}
function evColor(t) {
  const m = { 商談: '#5b7fff', '講演・セミナー': '#f5a623', 社内MTG: '#a78bfa', 訪問: '#26d4b8', 移動: '#4e5568', 締め切り: '#ff6b7a' };
  return m[t] || '#4e5568';
}

// ===== DASHBOARD =====
function refreshDash() {
  document.getElementById('dash-date').textContent = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  document.getElementById('m-deals').textContent = S.clients.filter(c => ['商談中','契約済','納品中'].includes(c.status)).length;
  const fuActive = (S.followups || []).filter(f => f.tab === 'active');
  document.getElementById('m-fu').textContent = fuActive.length;
  const nbFu = document.getElementById('nb-fu');
  if (fuActive.length > 0) { nbFu.style.display = ''; nbFu.textContent = fuActive.length; } else { nbFu.style.display = 'none'; }
  const today = new Date();
  const upSem = S.seminars.filter(s => new Date(s.date) >= today).sort((a, b) => new Date(a.date) - new Date(b.date));
  if (upSem.length > 0) {
    const n = upSem[0];
    const d = Math.ceil((new Date(n.date) - today) / 86400000);
    document.getElementById('m-ev-days').textContent = d + '日';
    document.getElementById('m-ev-name').textContent = n.name.substring(0, 14) + '…';
  }
  S.seminars.forEach((s, i) => {
    if (i >= 2) return;
    const pct = s.checklist.length > 0 ? Math.round(s.checklist.filter(c => c.done).length / s.checklist.length * 100) : 0;
    const bar = document.getElementById('sp' + (i+1) + '-bar');
    const pctEl = document.getElementById('sp' + (i+1) + '-pct');
    if (bar) bar.style.width = pct + '%';
    if (pctEl) pctEl.textContent = pct + '%';
  });
  const rc = document.getElementById('dash-clients');
  const recent = [...S.clients].reverse().slice(0, 4);
  rc.innerHTML = recent.length === 0
    ? '<div style="color:var(--text3);font-size:11px;padding:8px 0">クライアントがいません</div>'
    : recent.map(c => `<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border)"><div><div style="font-size:12px;font-weight:500">${c.company}</div><div style="font-size:10px;color:var(--text3)">${c.dealType||'—'}</div></div><span class="badge ${statusBadge(c.status)}">${c.status}</span></div>`).join('');
  const dt = document.getElementById('dash-tasks');
  const upcoming = [...S.events].filter(e => new Date(e.date) >= today).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 4);
  dt.innerHTML = upcoming.length === 0
    ? '<div style="color:var(--text3);font-size:11px;padding:8px 0">スケジュールにタスクを追加すると表示されます</div>'
    : upcoming.map(e => `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)"><div style="width:7px;height:7px;border-radius:50%;background:${evColor(e.type)};flex-shrink:0"></div><div style="flex:1"><div style="font-size:11px;font-weight:500">${e.title}</div><div style="font-size:10px;color:var(--text3)">${e.date} ${e.time||''}</div></div><span class="badge b-gray" style="font-size:9px">${e.type}</span></div>`).join('');
}

// ===== DOCUMENTS =====
let curDocType = '見積書';
let lineItems = [];
function selDocType(type) {
  curDocType = type;
  document.querySelectorAll('.dt-card').forEach(c => c.classList.toggle('sel', c.dataset.type === type));
  document.getElementById('doc-form-title').textContent = type + ' — 入力フォーム';
}
function refreshDocs() {
  if (lineItems.length === 0) addLine('サービス名', 1, 300000);
  const today = new Date().toISOString().split('T')[0];
  if (!document.getElementById('doc-date').value) document.getElementById('doc-date').value = today;
}
function addLine(desc = '', qty = 1, price = 0) {
  const id = Date.now() + Math.random();
  lineItems.push({ id, desc, qty, price });
  renderLines();
}
function removeLine(id) { lineItems = lineItems.filter(i => i.id != id); renderLines(); }
function renderLines() {
  document.getElementById('line-items').innerHTML = lineItems.map(item =>
    `<tr>
      <td><input type="text" value="${item.desc}" onchange="updLine(${item.id},'desc',this.value)" style="background:transparent;border:none;border-bottom:1px solid var(--border);border-radius:0;padding:3px 0"></td>
      <td><input type="number" value="${item.qty}" onchange="updLine(${item.id},'qty',this.value)" style="background:transparent;border:none;border-bottom:1px solid var(--border);border-radius:0;padding:3px 0;width:50px"></td>
      <td><input type="number" value="${item.price}" onchange="updLine(${item.id},'price',this.value)" style="background:transparent;border:none;border-bottom:1px solid var(--border);border-radius:0;padding:3px 0"></td>
      <td style="font-family:var(--mono)">¥${fmtN(item.qty * item.price)}</td>
      <td><button class="btn btn-ghost btn-sm" style="color:var(--coral)" onclick="removeLine(${item.id})">×</button></td>
    </tr>`
  ).join('');
  calcTotals();
}
function updLine(id, field, val) {
  const item = lineItems.find(i => i.id == id);
  if (!item) return;
  item[field] = field === 'desc' ? val : parseFloat(val) || 0;
  calcTotals();
}
function calcTotals() {
  const sub = lineItems.reduce((s, i) => s + i.qty * i.price, 0);
  const tax = Math.floor(sub * 0.1);
  document.getElementById('subtotal').textContent = '¥' + fmtN(sub);
  document.getElementById('tax-amt').textContent = '¥' + fmtN(tax);
  document.getElementById('total').textContent = '¥' + fmtN(sub + tax);
}
function previewDoc() {
  const sub = lineItems.reduce((s, i) => s + i.qty * i.price, 0);
  const tax = Math.floor(sub * 0.1);
  const text = `【${curDocType}】\n発行日: ${document.getElementById('doc-date').value}\n宛先: ${document.getElementById('doc-to-co').value} ${document.getElementById('doc-to-p').value}\n\n【明細】\n${lineItems.map(i => `・${i.desc}  ${i.qty}点  ¥${fmtN(i.price)}  = ¥${fmtN(i.qty * i.price)}`).join('\n')}\n\n小計: ¥${fmtN(sub)}\n消費税(10%): ¥${fmtN(tax)}\n合計: ¥${fmtN(sub + tax)}\n\n備考: ${document.getElementById('doc-note').value}\n\n発行者: oku株式会社`;
  document.getElementById('prev-title').textContent = curDocType + ' プレビュー';
  document.getElementById('prev-body').textContent = text;
  openMod('preview-modal');
}
function genDocLink() {
  closeMod('preview-modal');
  const enc = encodeURIComponent(curDocType + '_' + (document.getElementById('doc-to-co').value || '') + '_' + new Date().toLocaleDateString('ja-JP'));
  window.open('https://docs.google.com/document/create?title=' + enc, '_blank');
  toast('Google Docsを開きました — テキストを貼り付けてください', 'success');
}

// ===== CONTRACT WIZARD =====
let wizStep = 1;
let cwWorkTypes = [];
function goWiz(step) {
  wizStep = step;
  [1, 2, 3].forEach(i => {
    document.getElementById('wp' + i).classList.toggle('active', i === step);
    const ws = document.getElementById('ws' + i);
    ws.classList.toggle('active', i === step);
    ws.classList.toggle('done', i < step);
  });
  if (step === 3) refreshContract();
}
function toggleChip(el, type) {
  if (cwWorkTypes.includes(type)) { cwWorkTypes = cwWorkTypes.filter(t => t !== type); el.classList.remove('on'); }
  else { cwWorkTypes.push(type); el.classList.add('on'); }
  document.getElementById('cw-work').value = cwWorkTypes.join('、');
}
function updFeeFields() {
  const t = document.getElementById('cw-fee-type').value;
  document.getElementById('cw-init-g').style.display = t.includes('init') ? 'block' : 'none';
  document.getElementById('cw-perf-g').style.display = t.includes('perf') ? 'block' : 'none';
}
function buildCT() {
  const client = document.getElementById('cw-client')?.value || '委託者（企業名）';
  const crep = document.getElementById('cw-crep')?.value || '代表取締役 〇〇 〇〇';
  const caddr = document.getElementById('cw-caddr')?.value || '〇〇都〇〇市...';
  const oku = document.getElementById('cw-oku')?.value || 'oku株式会社';
  const start = document.getElementById('cw-start')?.value || '____年__月__日';
  const period = document.getElementById('cw-period')?.value || '1年・自動更新';
  const work = document.getElementById('cw-work')?.value || '〇〇業務';
  const monthly = document.getElementById('cw-monthly')?.value || '〇〇';
  const feeType = document.getElementById('cw-fee-type')?.value || 'monthly';
  const initFee = document.getElementById('cw-init')?.value || '';
  const perf = document.getElementById('cw-perf')?.value || '';
  const cycle = document.getElementById('cw-cycle')?.value || '月末締め翌月末払い';
  let feeText = `月額委託料 金${monthly}万円（税別）`;
  if (feeType.includes('init') && initFee) feeText += `\n　　初期費用 金${initFee}万円（税別）`;
  if (feeType.includes('perf') && perf) feeText += `\n　　成果報酬 ${perf}`;
  return `業務委託契約書\n\n${client}（以下「委託者」という）と${oku}（以下「受託者」という）は、以下のとおり業務委託契約を締結する。\n\n委託者住所：${caddr}\n委託者代表者：${crep}\n受託者：${oku}\n\n第1条（委託業務の内容）\n委託者は受託者に対し、以下の業務を委託し、受託者はこれを受託する。\n　業務内容：${work}\n\n第2条（契約期間）\n本契約の有効期間は${start}から${period}とする。期間満了の1ヶ月前までに当事者いずれかから書面による解約の申し出がない場合、同条件で自動更新する。\n\n第3条（委託料）\n委託者は受託者に対し、本業務の対価として以下のとおり委託料を支払う。\n　${feeText}\n　支払方法：${cycle}、銀行振込（振込手数料は委託者負担）\n\n第4条（業務報告）\n受託者は委託者に対し、月1回以上の業務報告を行う。報告の形式・頻度については両者協議のうえ決定する。\n\n第5条（知的財産権）\n本業務を通じて生じた成果物の著作権その他の知的財産権は、委託料の支払い完了をもって委託者に帰属する。ただし、受託者が本業務以前から保有するノウハウ・ライブラリ等の権利は受託者に留保される。\n\n第6条（秘密保持）\n各当事者は、本契約の履行に際して知り得た相手方の業務上の秘密情報を第三者に漏洩・開示してはならない。本条の義務は本契約終了後も3年間存続する。\n\n第7条（個人情報の取り扱い）\n受託者は、業務遂行上取り扱う個人情報について、個人情報の保護に関する法律及び関連法令を遵守し、適切に管理する。\n\n第8条（再委託）\n受託者は、委託者の事前の書面による承諾を得た場合に限り、本業務の一部を第三者に再委託することができる。この場合、受託者は再委託先に本契約と同等の義務を課する。\n\n第9条（契約の解除）\n各当事者は、相手方が本契約に違反し、催告後14日以内に是正されない場合、本契約を解除することができる。また、各当事者は60日前の書面による通知をもって本契約を解除することができる。\n\n第10条（損害賠償）\n各当事者は、本契約の違反により相手方に損害を与えた場合、現実に生じた通常損害を賠償する責任を負う。ただし、受託者の損害賠償額は当該月の委託料を上限とする。\n\n第11条（反社会的勢力の排除）\n各当事者は、自己が反社会的勢力に該当しないこと、及び今後も該当しないことを表明・保証する。違反した場合、相手方は何ら催告なく本契約を解除できる。\n\n第12条（契約内容の変更）\n本契約の内容を変更する場合は、両当事者の書面による合意を要する。\n\n第13条（準拠法・管轄裁判所）\n本契約は日本法に準拠する。本契約に関する紛争は、東京地方裁判所を第一審の専属的合意管轄裁判所とする。\n\n第14条（協議）\n本契約に定めのない事項及び疑義が生じた場合、両当事者は誠実に協議のうえ解決する。\n\n\n以上を証するため、本契約書2通を作成し、委託者及び受託者が各1通を保有する。\n　${start}\n\n委託者　${caddr}\n　　　　${client}\n　　　　${crep}　　印\n\n受託者　oku株式会社\n　　　　代表取締役　奥村 航稀　　印`;
}
function refreshContract() {
  const clauses = [
    {num:'第1条',title:'委託業務の内容'},{num:'第2条',title:'契約期間'},{num:'第3条',title:'委託料'},
    {num:'第4条',title:'業務報告'},{num:'第5条',title:'知的財産権'},{num:'第6条',title:'秘密保持'},
    {num:'第7条',title:'個人情報の取り扱い'},{num:'第8条',title:'再委託'},{num:'第9条',title:'契約の解除'},
    {num:'第10条',title:'損害賠償'},{num:'第11条',title:'反社会的勢力の排除'},{num:'第12条',title:'契約内容の変更'},
    {num:'第13条',title:'準拠法・管轄裁判所'},{num:'第14条',title:'協議'}
  ];
  const cl = document.getElementById('clause-list');
  if (cl) cl.innerHTML = clauses.map(c => `<div class="clause-row"><div class="clause-num">${c.num}</div><div style="font-size:12px;font-weight:500">${c.title}</div></div>`).join('');
  const prev = document.getElementById('cpreview');
  if (prev) prev.textContent = buildCT();
}
function genContractDoc() {
  const enc = encodeURIComponent('業務委託契約書_' + (document.getElementById('cw-client')?.value || '') + '_oku株式会社');
  window.open('https://docs.google.com/document/create?title=' + enc, '_blank');
  toast('Google Docsを開きました — テキストをコピーして貼り付けてください', 'success');
}
function copyCT() {
  navigator.clipboard.writeText(buildCT())
    .then(() => toast('契約書テキストをコピーしました', 'success'))
    .catch(() => toast('コピーに失敗しました', 'error'));
}

// ===== SEMINAR =====
function openSemModal() {
  ['s-name','s-venue','s-target','s-note'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('s-cap').value = '';
  openMod('sem-modal');
}
function saveSem() {
  const name = document.getElementById('s-name').value.trim();
  if (!name) { toast('イベント名を入力してください', 'error'); return; }
  S.seminars.push({
    id: 'sem_' + Date.now(), name,
    date: document.getElementById('s-date').value,
    time: document.getElementById('s-time').value,
    venue: document.getElementById('s-venue').value,
    capacity: document.getElementById('s-cap').value,
    target: document.getElementById('s-target').value,
    note: document.getElementById('s-note').value,
    checklist: [
      {id:'a1',label:'会場の確認・予約',done:false},
      {id:'a2',label:'集客・告知（SNS/チラシ）',done:false},
      {id:'a3',label:'参加者への案内送付',done:false},
      {id:'a4',label:'リード回収の仕組み準備',done:false},
      {id:'a5',label:'当日運営体制の確定',done:false}
    ]
  });
  saveState(); closeMod('sem-modal'); refreshSeminar(); refreshDash();
  toast('イベントを追加しました', 'success');
}
function toggleCk(semId, ckId) {
  const sem = S.seminars.find(s => s.id === semId);
  if (!sem) return;
  const ck = sem.checklist.find(c => c.id === ckId);
  if (!ck) return;
  ck.done = !ck.done;
  saveState(); refreshSeminar(); refreshDash();
}
function refreshSeminar() {
  const container = document.getElementById('seminar-list');
  if (!container) return;
  if (S.seminars.length === 0) {
    container.innerHTML = '<div style="color:var(--text3);font-size:11px;padding:20px;text-align:center">イベントが登録されていません</div>';
    return;
  }
  container.innerHTML = S.seminars.map(s => {
    const pct = s.checklist.length > 0 ? Math.round(s.checklist.filter(c => c.done).length / s.checklist.length * 100) : 0;
    const daysLeft = s.date ? Math.ceil((new Date(s.date) - new Date()) / 86400000) : null;
    const daysStr = daysLeft !== null ? (daysLeft >= 0 ? `あと<strong style="color:var(--coral)">${daysLeft}日</strong>` : `<span style="color:var(--text3)">終了</span>`) : '';
    return `<div class="sem-card">
      <div class="sem-head">
        <div style="flex:1">
          <div style="font-size:15px;font-weight:700;margin-bottom:6px">${s.name}</div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="sem-date">${s.date || '日付未定'} ${s.time || ''}</span>
            ${daysStr ? `<span style="font-size:10px;color:var(--text2)">${daysStr}</span>` : ''}
            <span class="badge b-gray">${s.venue || '会場未定'}</span>
            <span class="badge b-teal">目標 ${s.capacity || '?'}名</span>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;margin-left:16px">
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px">準備 ${pct}%</div>
          <div style="width:90px"><div class="pbar"><div class="pfill" style="width:${pct}%;background:${pct>=80?'var(--green)':pct>=50?'var(--amber)':'var(--coral)'}"></div></div></div>
        </div>
      </div>
      <div class="sem-body">
        ${s.note ? `<div style="font-size:11px;color:var(--text3);margin-bottom:12px;background:var(--bg4);padding:10px 12px;border-radius:6px;line-height:1.7">${s.note}</div>` : ''}
        ${s.target ? `<div style="font-size:11px;color:var(--text2);margin-bottom:12px">🎯 ターゲット：${s.target}</div>` : ''}
        <div style="font-size:9px;font-weight:700;color:var(--text3);letter-spacing:1.2px;text-transform:uppercase;margin-bottom:10px">準備チェックリスト</div>
        <ul class="ck-list">
          ${s.checklist.map(ck => `
            <li class="ck-item ${ck.done ? 'done' : ''}">
              <input type="checkbox" id="ck_${ck.id}" ${ck.done ? 'checked' : ''} onchange="toggleCk('${s.id}','${ck.id}')">
              <label for="ck_${ck.id}">${ck.label}</label>
            </li>
          `).join('')}
        </ul>
        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="goPage('followup')">🔗 リードフォロー管理へ</button>
          <button class="btn btn-coral btn-sm" onclick="deleteSem('${s.id}')">削除</button>
        </div>
      </div>
    </div>`;
  }).join('');
}
function deleteSem(id) {
  S.seminars = S.seminars.filter(s => s.id !== id);
  saveState(); refreshSeminar(); refreshDash();
  toast('削除しました', 'success');
}

// ===== CLIENTS =====
let curCFilter = 'all';
let editingCId = null;
function openClientModal(cid = null) {
  editingCId = cid;
  if (cid) {
    const c = S.clients.find(c => c.id === cid);
    if (!c) return;
    document.getElementById('c-modal-t').textContent = 'クライアント編集';
    document.getElementById('c-co').value = c.company;
    document.getElementById('c-person').value = c.person || '';
    document.getElementById('c-tel').value = c.tel || '';
    document.getElementById('c-email').value = c.email || '';
    document.getElementById('c-ind').value = c.industry || '';
    document.getElementById('c-deal').value = c.dealType || '';
    document.getElementById('c-amt').value = c.amount || '';
    document.getElementById('c-status').value = c.status || 'リード';
    document.getElementById('c-note').value = c.note || '';
  } else {
    document.getElementById('c-modal-t').textContent = 'クライアント追加';
    ['c-co','c-person','c-tel','c-email','c-amt','c-note'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('c-ind').value = '';
    document.getElementById('c-deal').value = '';
    document.getElementById('c-status').value = 'リード';
  }
  openMod('client-modal');
}
function saveClient() {
  const company = document.getElementById('c-co').value.trim();
  if (!company) { toast('企業名を入力してください', 'error'); return; }
  const obj = {
    id: editingCId || Date.now(), company,
    person: document.getElementById('c-person').value,
    tel: document.getElementById('c-tel').value,
    email: document.getElementById('c-email').value,
    industry: document.getElementById('c-ind').value,
    dealType: document.getElementById('c-deal').value,
    amount: document.getElementById('c-amt').value,
    status: document.getElementById('c-status').value,
    note: document.getElementById('c-note').value,
    updatedAt: new Date().toLocaleDateString('ja-JP')
  };
  if (editingCId) {
    const idx = S.clients.findIndex(c => c.id === editingCId);
    if (idx !== -1) S.clients[idx] = obj;
  } else S.clients.push(obj);
  saveState(); closeMod('client-modal'); refreshClients(); refreshDash();
  toast('保存しました', 'success');
}
function filterC(filter, el) {
  curCFilter = filter;
  document.querySelectorAll('.fb').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  refreshClients();
}
function refreshClients() {
  const tbody = document.getElementById('clients-tb');
  const empty = document.getElementById('clients-empty');
  let list = S.clients;
  if (curCFilter !== 'all') list = list.filter(c => c.status === curCFilter);
  if (list.length === 0) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = list.map(c => `<tr>
    <td><div style="font-size:12px;font-weight:500">${c.company}</div><div style="font-size:10px;color:var(--text3)">${c.person||'—'}</div></td>
    <td><span class="badge b-gray" style="font-size:9px">${c.industry||'—'}</span></td>
    <td style="font-size:11px;color:var(--text2)">${c.dealType||'—'}</td>
    <td style="font-family:var(--mono);font-size:11px">${c.amount?'¥'+fmtN(c.amount)+'万':'—'}</td>
    <td><span class="badge ${statusBadge(c.status)}">${c.status}</span></td>
    <td style="font-size:10px;color:var(--text3)">${c.updatedAt||'—'}</td>
    <td><div style="display:flex;gap:5px">
      <button class="btn btn-ghost btn-sm" onclick="openClientModal(${c.id})">編集</button>
      <button class="btn btn-ghost btn-sm" onclick="goPage('contract');setTimeout(()=>{document.getElementById('cw-client').value='${c.company.replace(/'/g,"\\'")}';},100)" title="契約書作成">📋</button>
      <button class="btn btn-ghost btn-sm" style="color:var(--coral)" onclick="deleteC(${c.id})">×</button>
    </div></td>
  </tr>`).join('');
}
function deleteC(id) { S.clients = S.clients.filter(c => c.id !== id); saveState(); refreshClients(); refreshDash(); }

// ===== FOLLOWUP =====
let curFuTab = 'active';
function openFuModal() {
  ['fu-co','fu-person','fu-contact','fu-note'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('fu-ind').value = '';
  document.getElementById('fu-deadline').value = '';
  openMod('fu-modal');
}
function saveFu() {
  const company = document.getElementById('fu-co').value.trim();
  const person = document.getElementById('fu-person').value.trim();
  if (!company || !person) { toast('企業名と担当者名を入力してください', 'error'); return; }
  S.followups.push({
    id: Date.now(), company, person,
    source: document.getElementById('fu-src').value,
    contact: document.getElementById('fu-contact').value,
    industry: document.getElementById('fu-ind').value,
    priority: document.getElementById('fu-pri').value,
    note: document.getElementById('fu-note').value,
    next: document.getElementById('fu-next').value,
    deadline: document.getElementById('fu-deadline').value,
    tab: 'active',
    createdAt: new Date().toLocaleDateString('ja-JP')
  });
  saveState(); closeMod('fu-modal'); refreshFu(); refreshDash();
  toast('リードを追加しました', 'success');
}
function switchFuTab(tab, el) {
  curFuTab = tab;
  document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  refreshFu();
}
function advFu(id, newTab) {
  const f = S.followups.find(f => f.id === id);
  if (f) { f.tab = newTab; saveState(); refreshFu(); refreshDash(); toast('ステータスを更新しました', 'success'); }
}
function deleteFu(id) { S.followups = S.followups.filter(f => f.id !== id); saveState(); refreshFu(); refreshDash(); }
function refreshFu() {
  const container = document.getElementById('fu-list');
  const list = (S.followups || []).filter(f => f.tab === curFuTab);
  if (list.length === 0) { container.innerHTML = '<div style="color:var(--text3);font-size:11px;padding:20px;text-align:center">リードはありません</div>'; return; }
  const pc = { high: 'var(--coral)', mid: 'var(--amber)', low: 'var(--text3)' };
  const pl = { high: '緊急', mid: '中', low: '低' };
  container.innerHTML = list.map(f => `
    <div class="fu-card ${f.priority==='high'?'fu-urgent':f.tab==='done'?'fu-done-c':'fu-normal'}">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="width:8px;height:8px;border-radius:50%;background:${pc[f.priority]};flex-shrink:0;margin-top:2px"></div>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:600">${f.company} <span style="font-weight:400;color:var(--text3)">${f.person}</span></div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">${f.source} / ${f.createdAt}</div>
        </div>
        <span class="badge b-gray" style="color:${pc[f.priority]}">${pl[f.priority]}</span>
      </div>
      ${f.note ? `<div style="font-size:11px;color:var(--text2);margin-bottom:10px;line-height:1.6">${f.note}</div>` : ''}
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <span class="badge b-blue" style="font-size:9px">次: ${f.next}</span>
        ${f.deadline ? `<span class="badge b-amber" style="font-size:9px">期限: ${f.deadline}</span>` : ''}
        ${f.contact ? `<span style="font-size:10px;color:var(--text3)">${f.contact}</span>` : ''}
        <div style="margin-left:auto;display:flex;gap:6px">
          ${f.tab==='active' ? `<button class="btn btn-ghost btn-sm" onclick="advFu(${f.id},'hearing')">ヒアリング済 →</button>` : ''}
          ${f.tab==='hearing' ? `<button class="btn btn-teal btn-sm" onclick="advFu(${f.id},'done')">商談化 →</button><button class="btn btn-primary btn-sm" onclick="goPage('contract');setTimeout(()=>{document.getElementById('cw-client').value='${f.company.replace(/'/g,"\\'")}';},100)">契約書作成</button>` : ''}
          ${f.tab==='done' ? `<button class="btn btn-ghost btn-sm" onclick="goPage('clients');openClientModal()">クライアント登録</button>` : ''}
          <button class="btn btn-ghost btn-sm" style="color:var(--coral)" onclick="deleteFu(${f.id})">×</button>
        </div>
      </div>
    </div>
  `).join('');
}

// ===== SCHEDULE =====
let calYear = 2026, calMonth = 5;
function openEvModal() {
  ['ev-title','ev-note'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('ev-date').value = '';
  document.getElementById('ev-time').value = '';
  openMod('ev-modal');
}
function saveEv() {
  const title = document.getElementById('ev-title').value.trim();
  if (!title) { toast('タイトルを入力してください', 'error'); return; }
  S.events.push({
    id: Date.now(), title,
    date: document.getElementById('ev-date').value,
    time: document.getElementById('ev-time').value,
    type: document.getElementById('ev-type').value,
    note: document.getElementById('ev-note').value
  });
  saveState(); closeMod('ev-modal'); refreshCal(); refreshDash();
  toast('予定を追加しました', 'success');
}
function refreshCal() {
  const mn = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  document.getElementById('cal-month-lbl').textContent = `${calYear}年${mn[calMonth]}`;
  const hdr = document.getElementById('cal-hdr');
  const days = document.getElementById('cal-days');
  const dow = ['日','月','火','水','木','金','土'];
  hdr.innerHTML = dow.map(d => `<div class="cal-hd">${d}</div>`).join('');
  const first = new Date(calYear, calMonth, 1).getDay();
  const lastDay = new Date(calYear, calMonth + 1, 0).getDate();
  const today = new Date();
  const eventDays = new Set(S.events.filter(e => {
    const d = new Date(e.date);
    return d.getFullYear() === calYear && d.getMonth() === calMonth;
  }).map(e => new Date(e.date).getDate()));
  let html = '';
  for (let i = 0; i < first; i++) html += '<div class="cal-day other"></div>';
  for (let d = 1; d <= lastDay; d++) {
    const isToday = today.getFullYear()===calYear && today.getMonth()===calMonth && today.getDate()===d;
    const hasEv = eventDays.has(d);
    html += `<div class="cal-day ${isToday?'today':''} ${hasEv?'has-ev':''}">${d}</div>`;
  }
  days.innerHTML = html;
  const evList = document.getElementById('ev-list');
  const monthEvs = S.events.filter(e => {
    const d = new Date(e.date);
    return d.getFullYear() === calYear && d.getMonth() === calMonth;
  }).sort((a,b) => new Date(a.date) - new Date(b.date));
  evList.innerHTML = monthEvs.length === 0
    ? '<div style="font-size:11px;color:var(--text3);padding:8px 0">予定はありません</div>'
    : monthEvs.map(e => `<div class="ev-item"><div class="ev-time">${e.time||'—'}</div><div class="ev-dot" style="background:${evColor(e.type)}"></div><div style="flex:1"><div style="font-size:12px;font-weight:500">${e.title}</div><div style="font-size:10px;color:var(--text3)">${e.date} ${e.type}</div></div><button class="btn btn-ghost btn-sm" style="color:var(--coral)" onclick="deleteEv(${e.id})">×</button></div>`).join('');
}
function deleteEv(id) { S.events = S.events.filter(e => e.id !== id); saveState(); refreshCal(); refreshDash(); }

// ===== INIT =====
loadState();
refreshDash();
refreshSeminar();
refreshCal();
</script>
</body>
</html>
HTMLEOF
echo "done: $(wc -l < /home/claude/oku_system_v4.html) lines"
出力

done: 1217 lines
