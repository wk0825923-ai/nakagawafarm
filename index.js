const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  LevelFormat, PageNumber, PageBreak, VerticalAlign
} = require('docx');
const fs = require('fs');

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const headerBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const headerBorders = { top: headerBorder, bottom: headerBorder, left: headerBorder, right: headerBorder };

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 160 },
    children: [new TextRun({ text, bold: true, size: 32, font: "Arial", color: "1E3A5F" })]
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true, size: 26, font: "Arial", color: "2E5EA8" })]
  });
}

function h3(text) {
  return new Paragraph({
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, size: 22, font: "Arial", color: "333333" })]
  });
}

function p(text, options = {}) {
  return new Paragraph({
    spacing: { before: 40, after: 80 },
    children: [new TextRun({ text, size: 20, font: "Arial", color: "333333", ...options })]
  });
}

function bullet(text, indent = 360) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 40, after: 40 },
    indent: { left: indent },
    children: [new TextRun({ text, size: 20, font: "Arial", color: "333333" })]
  });
}

function bulletBold(text, sub = "") {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 40, after: 40 },
    children: [
      new TextRun({ text, bold: true, size: 20, font: "Arial", color: "222222" }),
      ...(sub ? [new TextRun({ text: "  " + sub, size: 20, font: "Arial", color: "555555" })] : [])
    ]
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function divider() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCDDEE", space: 4 } },
    spacing: { before: 120, after: 120 },
    children: []
  });
}

function tableRow(cells, isHeader = false) {
  return new TableRow({
    children: cells.map(({ text, width, bold, color, bg, colspan }) =>
      new TableCell({
        borders,
        width: { size: width || 2400, type: WidthType.DXA },
        columnSpan: colspan,
        shading: bg ? { fill: bg, type: ShadingType.CLEAR } : undefined,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          children: [new TextRun({
            text,
            bold: bold || isHeader,
            size: isHeader ? 18 : 19,
            font: "Arial",
            color: color || (isHeader ? "FFFFFF" : "333333")
          })]
        })]
      })
    )
  });
}

function makeTable(headers, rows, widths) {
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({
        children: headers.map((text, i) =>
          new TableCell({
            borders: headerBorders,
            width: { size: widths[i], type: WidthType.DXA },
            shading: { fill: "1E3A5F", type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({
              children: [new TextRun({ text, bold: true, size: 18, font: "Arial", color: "FFFFFF" })]
            })]
          })
        )
      }),
      ...rows.map((row, ri) =>
        new TableRow({
          children: row.map((cell, ci) => {
            const cellData = typeof cell === 'string' ? { text: cell } : cell;
            return new TableCell({
              borders,
              width: { size: widths[ci], type: WidthType.DXA },
              shading: (ri % 2 === 0) ? undefined : { fill: "F7F9FC", type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({
                children: [new TextRun({
                  text: cellData.text,
                  bold: cellData.bold || false,
                  size: 18,
                  font: "Arial",
                  color: cellData.color || "333333"
                })]
              })]
            });
          })
        })
      )
    ]
  });
}

// ============================================================
//  DOCUMENT CONTENT
// ============================================================

const doc = new Document({
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 280 } } }
        }]
      }
    ]
  },
  styles: {
    default: { document: { run: { font: "Arial", size: 20 } } },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: "1E3A5F" },
        paragraph: { spacing: { before: 400, after: 160 }, outlineLevel: 0 }
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: "2E5EA8" },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 }
      }
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 }
      }
    },
    children: [

      // ── 表紙 ──────────────────────────────────────────────
      new Paragraph({ spacing: { before: 1200 }, children: [] }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 600, after: 120 },
        children: [new TextRun({ text: "oku株式会社", size: 24, font: "Arial", color: "888888" })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 200 },
        children: [new TextRun({ text: "社長サポートシステム", size: 52, bold: true, font: "Arial", color: "1E3A5F" })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 80 },
        children: [new TextRun({ text: "詳細システム要件定義書", size: 36, bold: true, font: "Arial", color: "2E5EA8" })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 600 },
        children: [new TextRun({ text: "v1.0  ／  2026年6月", size: 22, font: "Arial", color: "999999" })]
      }),
      divider(),
      new Paragraph({
        spacing: { before: 240, after: 60 },
        children: [new TextRun({ text: "作成者", size: 20, font: "Arial", color: "888888" })]
      }),
      new Paragraph({
        spacing: { before: 0, after: 60 },
        children: [new TextRun({ text: "だいや（社長サポート責任者）", size: 24, bold: true, font: "Arial", color: "333333" })]
      }),
      new Paragraph({
        spacing: { before: 0, after: 240 },
        children: [new TextRun({ text: "目的：社長を開発・経営戦略に専念させるため、バックオフィス業務を全てシステムに集約する", size: 20, font: "Arial", color: "555555" })]
      }),
      pageBreak(),

      // ── 0. 目次 ──────────────────────────────────────────
      h1("目次"),
      p("1. プロジェクト概要・背景"),
      p("2. システム設計思想"),
      p("3. ユーザーロールと権限"),
      p("4. 機能要件（モジュール別詳細）"),
      p("   4.1 ダッシュボード"),
      p("   4.2 書類スピード生成"),
      p("   4.3 契約書ウィザード"),
      p("   4.4 クライアント管理"),
      p("   4.5 フォローアップ管理"),
      p("   4.6 イベント運営管理"),
      p("   4.7 SNS管理"),
      p("   4.8 スケジュール管理"),
      p("   4.9 財務ダッシュボード"),
      p("5. 非機能要件"),
      p("6. データ設計"),
      p("7. 外部連携"),
      p("8. 今後のロードマップ"),
      p("9. 付録：用語定義"),
      pageBreak(),

      // ── 1. プロジェクト概要 ──────────────────────────────
      h1("1. プロジェクト概要・背景"),
      h2("1.1 背景と課題"),
      p("oku株式会社は年間売上30億円・利益率60%・年間取引件数12,000件規模の事業を展開している。社長（奥村航稀）はビジネスの戦略立案・開発・講演活動においてコアバリューを発揮する一方、以下のバックオフィス業務が社長の時間を圧迫している問題がある。"),
      bullet("書類作成（見積書・請求書・契約書）のたびに社長が対応"),
      bullet("クライアントからの連絡受け・ヒアリング整理"),
      bullet("イベント・セミナーの運営準備・チェックリスト管理"),
      bullet("SNS投稿の進捗把握・ディレクター管理"),
      bullet("リード（見込み客）のフォローアップ追跡"),
      bullet("スケジュール・財務の可視化"),

      h2("1.2 プロジェクトの目的"),
      p("「社長のめんどくさいを全部ここで完結」をコンセプトに、社長サポート責任者（だいや）が全バックオフィス業務を一元管理できるWebアプリケーションを構築する。社長は戦略判断・最終承認・開発にのみ集中できる環境を実現する。"),

      h2("1.3 スコープ"),
      makeTable(
        ["項目", "スコープ内", "スコープ外（将来対応）"],
        [
          ["書類生成・管理", "○", "—"],
          ["契約書ウィザード", "○", "電子署名連携"],
          ["クライアントCRM", "○", "外部CRM統合（Salesforce等）"],
          ["フォローアップ", "○", "MAツール連携"],
          ["イベント運営", "○", "外部チケット販売"],
          ["SNS管理", "スケジュール・進捗管理", "自動投稿・API連携"],
          ["スケジュール", "○", "Google Calendar双方向同期"],
          ["財務", "売上・トレンド可視化", "会計ソフト自動連携"],
          ["AI書類生成", "フェーズ2", "—"],
        ],
        [2800, 2200, 4026]
      ),
      new Paragraph({ spacing: { before: 80 }, children: [] }),
      pageBreak(),

      // ── 2. 設計思想 ──────────────────────────────────────
      h1("2. システム設計思想"),
      h2("2.1 コアコンセプト"),

      makeTable(
        ["原則", "内容"],
        [
          [{ text: "社長ゼロタッチ", bold: true }, "書類生成・日程調整・フォロー追跡は全てだいやが完結。社長は「確認→承認」のみ"],
          [{ text: "アクション駆動UI", bold: true }, "ダッシュボードを開いた瞬間に「何をすべきか」が分かるデザイン"],
          [{ text: "シングルソースオブトゥルース", bold: true }, "クライアント情報・イベント情報・SNS進捗は一箇所に集約"],
          [{ text: "ゼロフリクション入力", bold: true }, "テンプレート・チップ選択・ウィザード形式で入力負荷を最小化"],
          [{ text: "将来拡張性", bold: true }, "フェーズ2でのAI連携・外部API統合を前提にモジュール分割設計"],
        ],
        [2800, 6226]
      ),
      new Paragraph({ spacing: { before: 80 }, children: [] }),

      h2("2.2 技術スタック方針"),
      bullet("フロントエンド：React（または現行のバニラHTML/JS → Reactマイグレーション推奨）"),
      bullet("データ永続化：フェーズ1はlocalStorage、フェーズ2でSupabase/Firebase移行"),
      bullet("書類出力：Google Docs API連携（URLパラメータ渡し→テンプレート展開）"),
      bullet("ホスティング：Vercel / Netlify（静的配信）"),
      pageBreak(),

      // ── 3. ロール ─────────────────────────────────────────
      h1("3. ユーザーロールと権限"),
      makeTable(
        ["ロール", "対象者", "主な権限", "制限"],
        [
          ["管理者（サポート責任者）", "だいや", "全機能の読み書き・削除", "なし"],
          ["社長（閲覧・承認）", "奥村航稀", "全データ閲覧・書類承認フラグ設定", "データ編集は要承認ステップ"],
          ["ディレクター（将来）", "外部SNSディレクター", "SNS管理ページのみ", "クライアント情報・財務非表示"],
        ],
        [2200, 1800, 3000, 2026]
      ),
      new Paragraph({ spacing: { before: 80 }, children: [] }),

      p("※ フェーズ1はだいや専用シングルユーザー運用。フェーズ2でマルチロール対応。"),
      pageBreak(),

      // ── 4. 機能要件 ───────────────────────────────────────
      h1("4. 機能要件（モジュール別詳細）"),

      // 4.1 Dashboard
      h2("4.1 ダッシュボード"),
      h3("概要"),
      p("社長サポートの全状況を一画面で把握できるコントロールタワー。開いた瞬間に「今日やること」が明確になるUXを実現する。"),
      h3("機能一覧"),
      makeTable(
        ["機能ID", "機能名", "詳細", "優先度"],
        [
          ["DB-01", "KPIメトリクス", "今期売上・アクティブ案件数・フォロー待ち件数・次イベントまでの日数をリアルタイム集計", "最高"],
          ["DB-02", "クイックアクション", "書類生成・契約書作成・クライアント追加・フォローアップ・イベント準備・SNS管理への1クリック遷移", "最高"],
          ["DB-03", "イベント進捗バー", "直近イベントのチェックリスト完了率をプログレスバーで表示", "高"],
          ["DB-04", "直近クライアント", "最新登録順で5件表示、クリックで詳細へ遷移", "高"],
          ["DB-05", "直近タスク", "スケジュールから直近3件を表示", "中"],
          ["DB-06", "日付表示", "現在日時をリアルタイム表示（自動更新）", "中"],
        ],
        [1000, 1800, 4500, 800]
      ),
      new Paragraph({ spacing: { before: 80 }, children: [] }),

      // 4.2 書類生成
      h2("4.2 書類スピード生成"),
      h3("概要"),
      p("見積書・請求書・発注書・NDA・業務報告書を入力フォームから即時生成し、Google Docsで社長に共有するまでをワンフロー化する。"),
      h3("対応書類種別"),
      bullet("見積書（Estimate）"),
      bullet("請求書（Invoice）"),
      bullet("発注書（Purchase Order）"),
      bullet("NDA（秘密保持契約書）"),
      bullet("業務報告書"),
      h3("機能一覧"),
      makeTable(
        ["機能ID", "機能名", "詳細", "優先度"],
        [
          ["DOC-01", "書類種別選択", "タイル型UIで5種類から選択、選択後フォームが切り替わる", "最高"],
          ["DOC-02", "宛先入力", "企業名・担当者名・発行日・有効期限/支払期限", "最高"],
          ["DOC-03", "明細行管理", "内容・数量・単価の行追加/削除、小計・税額・合計を自動計算", "最高"],
          ["DOC-04", "備考欄", "振込先・支払条件・補足事項の自由記述", "高"],
          ["DOC-05", "プレビュー", "生成前に書類内容をモーダルで確認", "高"],
          ["DOC-06", "Google Docs出力", "入力データをURLパラメータ/クリップボードとしてGoogle Docsテンプレートに展開", "最高"],
          ["DOC-07", "書類番号自動採番", "種別・年月・連番形式（例：EST-202606-001）で採番", "中"],
          ["DOC-08", "書類履歴", "生成履歴を一覧管理し再編集可能にする（フェーズ2）", "低"],
        ],
        [1000, 1800, 4500, 800]
      ),
      new Paragraph({ spacing: { before: 80 }, children: [] }),

      h3("業務フロー"),
      bullet("種別選択 → 宛先入力 → 明細入力 → プレビュー確認 → Google Docs出力 → 社長へ共有URL送付 → 社長確認→承認 → 先方へ送付"),
      p("※ 先方への直接送付は社長が行う（だいやからの直送禁止ルール）"),

      // 4.3 契約書ウィザード
      h2("4.3 契約書ウィザード"),
      h3("概要"),
      p("業務委託契約書（第1〜14条）を3ステップウィザードで自動生成する。法的文書のため社長確認ステップを必須とし、だいやからの直接送付は禁止とする。"),
      h3("ウィザードステップ"),
      makeTable(
        ["ステップ", "内容", "入力項目"],
        [
          ["Step 1: 基本情報", "委託者・受託者情報", "委託者企業名・代表者名・住所、受託者（oku株式会社）、契約開始日・期間"],
          ["Step 2: 業務内容・報酬", "委託業務の定義と報酬設定", "業務種別チップ選択（SNS運用・HP制作・システム開発・AI導入支援・国産AI OEM・顧問契約・代理店契約）、報酬形態・金額・支払日"],
          ["Step 3: 条項確認・生成", "自動生成された全条項の確認と出力", "第1〜14条プレビュー、修正メモ欄、Google Docs出力"],
        ],
        [2000, 2500, 4526]
      ),
      new Paragraph({ spacing: { before: 80 }, children: [] }),

      makeTable(
        ["機能ID", "機能名", "詳細", "優先度"],
        [
          ["CON-01", "ウィザード3ステップUI", "進捗インジケーター付き、各ステップの入力バリデーション", "最高"],
          ["CON-02", "業務種別チップ", "複数選択可、選択内容が第1条に自動反映", "最高"],
          ["CON-03", "報酬形態分岐", "月額固定/成果報酬/時間単価/案件単価で入力フォームが動的変化", "高"],
          ["CON-04", "条項自動生成", "入力値を埋め込んだ第1〜14条の契約書本文を自動生成", "最高"],
          ["CON-05", "条項プレビュー", "条番号・条文を一覧表示、修正箇所をメモで記録", "高"],
          ["CON-06", "Google Docs出力", "完成したたたき台をGoogle Docsとして出力", "最高"],
          ["CON-07", "承認フラグ", "社長確認済みフラグをつけた後のみ「先方送付可能」状態に変更", "高"],
        ],
        [1000, 1800, 4500, 800]
      ),
      new Paragraph({ spacing: { before: 80 }, children: [] }),

      // 4.4 クライアント管理
      h2("4.4 クライアント管理"),
      h3("概要"),
      p("全クライアント・商談相手の情報を一元管理するCRM機能。ヒアリング記録から案件金額・ステータスまでを追跡する。"),
      makeTable(
        ["機能ID", "機能名", "詳細", "優先度"],
        [
          ["CRM-01", "クライアント登録", "企業名・担当者名・電話・メール・業種・案件種別・金額・ステータス・ヒアリングメモ", "最高"],
          ["CRM-02", "ステータス管理", "リード→商談中→契約済→納品中→完了→保留 の6段階", "最高"],
          ["CRM-03", "業種分類", "IT・SNS/Webマーケ・士業・飲食・宿泊・スポーツ施設・一次産業・製造業・小売EC・医療介護・建設不動産・教育・その他", "高"],
          ["CRM-04", "案件種別", "システム開発・Web開発・SNS運用・AI導入・AI OEM・顧問契約・代理店契約", "高"],
          ["CRM-05", "検索・フィルター", "ステータス・業種・案件種別での絞り込み", "高"],
          ["CRM-06", "クライアント一覧", "テーブル形式、ステータスバッジ・金額表示", "最高"],
          ["CRM-07", "編集・削除", "既存レコードの編集、削除前確認", "高"],
          ["CRM-08", "フォローアップ連携", "クライアントからフォローアップ画面への直接遷移", "中"],
        ],
        [1000, 1800, 4500, 800]
      ),
      new Paragraph({ spacing: { before: 80 }, children: [] }),

      // 4.5 フォローアップ
      h2("4.5 フォローアップ管理"),
      h3("概要"),
      p("イベント・SNS・紹介等で獲得したリードを商談化するまでのパイプライン管理。優先度・次のアクション・期限を明確化し、リードがこぼれるのを防ぐ。"),
      makeTable(
        ["機能ID", "機能名", "詳細", "優先度"],
        [
          ["FU-01", "リード登録", "企業名・担当者名・接触経路・連絡先・業種・優先度・課題メモ・次アクション・期限", "最高"],
          ["FU-02", "優先度分類", "高（すぐ連絡）/ 中（1週間以内）/ 低（今月中）の3段階", "最高"],
          ["FU-03", "次アクション設定", "LINE追加・電話ヒアリング・商談設定・資料送付・見積書送付・契約書作成から選択", "最高"],
          ["FU-04", "完了マーク", "対応完了としてマーク、完了済みリストに移行", "高"],
          ["FU-05", "接触経路", "中小企業同友会講演・oku自社説明会・SNS経由・紹介・その他", "高"],
          ["FU-06", "期限超過アラート", "期限を過ぎたリードをダッシュボードに赤バッジで表示", "高"],
          ["FU-07", "フィルター", "優先度・接触経路・完了/未完了での絞り込み", "中"],
          ["FU-08", "クライアント昇格", "商談化したリードをクライアント管理に1クリックで移行", "中"],
        ],
        [1000, 1800, 4500, 800]
      ),
      new Paragraph({ spacing: { before: 80 }, children: [] }),

      // 4.6 イベント運営
      h2("4.6 イベント運営管理"),
      h3("概要"),
      p("セミナー・説明会・講演会の運営準備を一元管理。チェックリスト管理・進捗の可視化により、だいやが社長の講演準備を完全に代行できる状態を実現する。"),
      h3("現行イベント（v3プリセット）"),
      bullet("中小企業同友会 奥村航稀 講演（2026年6月28日）"),
      bullet("oku株式会社 自社サービス説明会（2026年6月30日）"),
      makeTable(
        ["機能ID", "機能名", "詳細", "優先度"],
        [
          ["SEM-01", "イベント登録", "イベント名・開催日・時間・会場・目標集客数・ターゲット・備考", "最高"],
          ["SEM-02", "チェックリスト", "項目追加・チェック・削除、完了率の自動計算とプログレスバー表示", "最高"],
          ["SEM-03", "プリセットチェックリスト", "イベント種別ごとのデフォルトチェックリストを自動セット", "高"],
          ["SEM-04", "集客進捗", "目標人数に対する現在の申込数の表示（フェーズ2でフォーム連携）", "中"],
          ["SEM-05", "担当者アサイン", "スタッフ・ディレクターへの役割割り振り記録", "中"],
          ["SEM-06", "リード回収設計", "終了後フォロー動線（LINE QRコード・窓口アナウンス）の設計メモ", "高"],
          ["SEM-07", "複数イベント管理", "2件以上の同時管理、ダッシュボードに進捗サマリー表示", "最高"],
          ["SEM-08", "アーカイブ", "終了したイベントをアーカイブ、リード獲得実績の記録", "低"],
        ],
        [1000, 1800, 4500, 800]
      ),
      new Paragraph({ spacing: { before: 80 }, children: [] }),

      h3("イベント別 標準チェックリスト（講演）"),
      bullet("会場の確認・予約（日程・レイアウト・AV機器）"),
      bullet("社長の講演資料の最終確認（社長に依頼）"),
      bullet("参加者への案内メール・LINE一斉送付"),
      bullet("リード回収用 LINE公式アカウントQRコード準備"),
      bullet("当日の名刺・チラシ・oku説明資料の印刷"),
      bullet("「本日の窓口はだいや」動線の設計（アナウンス準備）"),
      bullet("終了後フォロー連絡テンプレートの作成"),
      bullet("当日運営スタッフの確定"),

      // 4.7 SNS管理
      h2("4.7 SNS管理"),
      h3("概要"),
      p("LINE・Instagram・TikTok・YouTubeの4媒体にわたるコンテンツ投稿スケジュール管理。投稿カテゴリ・担当ディレクター・ステータスを管理し、300名規模の集客兵団（委託ディレクター）の動きを把握する。"),
      makeTable(
        ["機能ID", "機能名", "詳細", "優先度"],
        [
          ["SNS-01", "投稿登録", "プラットフォーム・カテゴリ・ステータス・投稿日時・タイトル・担当ディレクター・メモ・ハッシュタグ", "最高"],
          ["SNS-02", "プラットフォーム管理", "LINE / Instagram / TikTok / YouTube の4媒体、件数集計", "最高"],
          ["SNS-03", "投稿カテゴリ分類", "訴求回（直接CTA）/ 認知LP（ランディング訴求）/ ルーク（興味・フック）/ 教育資産（中長期）", "高"],
          ["SNS-04", "ステータス管理", "予約済 / 下書き / 投稿済 の3段階", "最高"],
          ["SNS-05", "プラットフォームフィルター", "媒体別フィルタリング、全表示", "高"],
          ["SNS-06", "日付順ソート", "投稿予定日の昇順で自動ソート", "高"],
          ["SNS-07", "ディレクター管理", "担当者名の記録（フェーズ2でディレクターアカウント連携）", "中"],
          ["SNS-08", "月間投稿カレンダー", "スケジュールページと連携した月次俯瞰ビュー（フェーズ2）", "低"],
        ],
        [1000, 1800, 4500, 800]
      ),
      new Paragraph({ spacing: { before: 80 }, children: [] }),

      // 4.8 スケジュール
      h2("4.8 スケジュール管理"),
      h3("概要"),
      p("社長のスケジュールを一元管理し、商談・講演・移動・社内MTGを俯瞰できるカレンダーUIを提供する。"),
      makeTable(
        ["機能ID", "機能名", "詳細", "優先度"],
        [
          ["SCH-01", "カレンダー表示", "月次グリッドカレンダー、イベント有り日にドット表示", "最高"],
          ["SCH-02", "予定登録", "タイトル・日付・時間・種別・メモの入力", "最高"],
          ["SCH-03", "種別分類", "商談・講演/セミナー・社内MTG・訪問・移動・締め切り・その他", "高"],
          ["SCH-04", "月次一覧", "カレンダー横に当月の予定リストを時系列表示", "最高"],
          ["SCH-05", "前後月ナビ", "前月・翌月への移動ボタン", "高"],
          ["SCH-06", "今日ハイライト", "当日の日付をアクセントカラーで強調", "中"],
          ["SCH-07", "ダッシュボード連携", "直近予定をダッシュボードに表示、次イベントまでの日数計算", "高"],
          ["SCH-08", "Google Calendar連携", "双方向同期（フェーズ2）", "低"],
        ],
        [1000, 1800, 4500, 800]
      ),
      new Paragraph({ spacing: { before: 80 }, children: [] }),

      // 4.9 財務
      h2("4.9 財務ダッシュボード"),
      h3("概要"),
      p("売上・利益率・月次トレンドを可視化する。oku株式会社の財務規模（年商30億円・利益率60%・月1,000件・単価30万円〜）を前提とした設計。"),
      makeTable(
        ["機能ID", "機能名", "詳細", "優先度"],
        [
          ["FIN-01", "KPIサマリー", "年間売上・経常利益・月次売上平均・案件単価平均を固定表示（実績値ハードコード+手入力更新）", "最高"],
          ["FIN-02", "月次売上入力", "月・金額（万円）の手入力で月次データを蓄積", "最高"],
          ["FIN-03", "売上トレンド表示", "月次データをテーブル表示、前月比（増減率・色分け）を自動計算", "高"],
          ["FIN-04", "未入金アラート", "書類生成履歴と連動した未確認請求書の一覧表示（フェーズ2）", "中"],
          ["FIN-05", "利益率計算", "売上入力から利益率を自動算出・表示（フェーズ2）", "低"],
          ["FIN-06", "グラフ表示", "月次推移グラフ（棒グラフ・折れ線）（フェーズ2）", "低"],
        ],
        [1000, 1800, 4500, 800]
      ),
      new Paragraph({ spacing: { before: 80 }, children: [] }),
      pageBreak(),

      // ── 5. 非機能要件 ──────────────────────────────────────
      h1("5. 非機能要件"),
      makeTable(
        ["カテゴリ", "要件", "基準"],
        [
          ["パフォーマンス", "画面遷移速度", "200ms以内"],
          ["パフォーマンス", "初回ロード", "3秒以内（3G環境）"],
          ["可用性", "稼働率", "99%以上（ホスティング依存）"],
          ["セキュリティ", "データ保護", "フェーズ1: localStorage暗号化なし（社内端末限定）、フェーズ2: HTTPS+認証"],
          ["セキュリティ", "アクセス制限", "フェーズ1: URL共有制限、フェーズ2: Google OAuth認証"],
          ["ユーザビリティ", "レスポンシブ", "PC（1280px以上）優先、タブレット対応"],
          ["ユーザビリティ", "ダークモード", "デフォルトダーク（現行デザイン継承）"],
          ["保守性", "コンポーネント設計", "モジュール単位で機能追加・修正が独立可能"],
          ["保守性", "データバックアップ", "フェーズ1: exportJSON、フェーズ2: クラウド自動バックアップ"],
          ["アクセシビリティ", "文字サイズ", "12px以上、コントラスト比4.5:1以上"],
        ],
        [2400, 2600, 4026]
      ),
      new Paragraph({ spacing: { before: 80 }, children: [] }),
      pageBreak(),

      // ── 6. データ設計 ──────────────────────────────────────
      h1("6. データ設計"),
      h2("6.1 データモデル概要"),
      makeTable(
        ["エンティティ", "主キー", "主要フィールド", "関連エンティティ"],
        [
          ["Client（クライアント）", "id (timestamp)", "co, person, tel, email, industry, dealType, amount, status, note", "FollowUp, Document"],
          ["FollowUp（フォローアップ）", "id (timestamp)", "co, person, source, contact, industry, priority, note, nextAction, deadline, done", "Client"],
          ["Seminar（イベント）", "id (string)", "name, date, time, venue, capacity, target, note, checklist[]", "—"],
          ["SnsPost（SNS投稿）", "id (timestamp)", "platform, category, status, date, title, director, note", "—"],
          ["Event（スケジュール）", "id (timestamp)", "title, date, time, type, note", "—"],
          ["FinEntry（財務）", "id (timestamp)", "month, amt", "—"],
          ["Document（書類）", "id (timestamp)", "type, toCompany, toPerson, date, due, lines[], note, status（フェーズ2）", "Client"],
        ],
        [2000, 1500, 3600, 1926]
      ),
      new Paragraph({ spacing: { before: 80 }, children: [] }),

      h2("6.2 ステータス定義"),
      makeTable(
        ["エンティティ", "ステータス値", "意味"],
        [
          ["Client", "リード → 商談中 → 契約済 → 納品中 → 完了 → 保留", "営業パイプラインの段階"],
          ["FollowUp", "done: false / true", "未対応 / 対応完了"],
          ["SnsPost", "scheduled / draft / posted", "予約済 / 下書き / 投稿済"],
          ["Document", "draft / sent / confirmed（フェーズ2）", "下書き / 送付済 / 社長確認済"],
        ],
        [2200, 4000, 2826]
      ),
      new Paragraph({ spacing: { before: 80 }, children: [] }),
      pageBreak(),

      // ── 7. 外部連携 ────────────────────────────────────────
      h1("7. 外部連携"),
      makeTable(
        ["連携先", "方式", "フェーズ", "目的"],
        [
          ["Google Docs", "URLパラメータ渡し → テンプレート展開", "1", "書類・契約書のたたき台作成・社長共有"],
          ["Google Calendar", "Google Calendar API（双方向同期）", "2", "スケジュール同期"],
          ["LINE公式アカウント", "QRコード生成・メッセージテンプレート管理", "1（部分）", "リード回収・フォローアップ"],
          ["Supabase / Firebase", "データベース移行（REST API）", "2", "マルチデバイス対応・データ永続化"],
          ["Google OAuth", "認証API", "2", "マルチユーザー・ロール管理"],
          ["Zapier / Make", "Webhook連携", "2", "フォーム申込→自動返信→Zoom案内フロー"],
          ["申込フォーム（Googleフォーム等）", "スプレッドシート連携", "1.5", "イベント申込→自動Zoom案内"],
        ],
        [2000, 2500, 900, 3626]
      ),
      new Paragraph({ spacing: { before: 80 }, children: [] }),
      pageBreak(),

      // ── 8. ロードマップ ──────────────────────────────────────
      h1("8. 今後のロードマップ"),
      makeTable(
        ["フェーズ", "期間", "主な実装内容", "ゴール"],
        [
          ["Phase 1（現行）", "〜2026年6月", "全9モジュールのHTML/JS実装、localStorage永続化、Google Docs出力", "だいやが全バックオフィスを代行できる状態"],
          ["Phase 1.5", "2026年7月〜8月", "イベント申込フォーム自動化（申込→自動返信→Zoom案内）、LINE QRコード生成機能強化", "説明会の申込フロー完全自動化"],
          ["Phase 2", "2026年9月〜12月", "Supabase移行、Google OAuth認証、マルチロール（社長/だいや/ディレクター）、書類承認フラグ、未入金アラート", "チームでの運用・社長承認フロー"],
          ["Phase 3", "2027年〜", "AI書類生成（Anthropic API連携）、Google Calendar双方向同期、SNS自動投稿連携、会計ソフト連携", "完全自動化・AIアシスト化"],
        ],
        [1500, 2000, 3800, 1726]
      ),
      new Paragraph({ spacing: { before: 80 }, children: [] }),

      h2("8.1 フェーズ1 優先実装順"),
      makeTable(
        ["優先順位", "モジュール", "理由"],
        [
          ["1位", "イベント運営管理（チェックリスト）", "6月28日・30日の直近イベントが迫っている"],
          ["2位", "書類スピード生成", "社長の時間を最も圧迫している業務"],
          ["3位", "契約書ウィザード", "取引規模・件数を考慮した法的リスク管理"],
          ["4位", "フォローアップ管理", "イベントで獲得したリードの商談化が急務"],
          ["5位", "クライアント管理", "案件情報の一元化"],
          ["6位", "SNS管理", "300名ディレクター体制の管理"],
          ["7位", "スケジュール・財務", "現状でも運用可能だが将来的に必要"],
        ],
        [1000, 2800, 5226]
      ),
      new Paragraph({ spacing: { before: 80 }, children: [] }),
      pageBreak(),

      // ── 9. 付録 ──────────────────────────────────────────
      h1("9. 付録：用語定義"),
      makeTable(
        ["用語", "定義"],
        [
          ["社長", "oku株式会社 代表取締役 奥村航稀。システムの最終承認者"],
          ["だいや", "社長サポート責任者。本システムのメインユーザー"],
          ["リード", "商談前の見込み客（イベント・SNS等で接触した未契約者）"],
          ["フォローアップ", "リードへの継続的なアクション管理（連絡・提案・商談設定）"],
          ["国産AI OEM", "oku株式会社が提供する国産AI製品のホワイトラベル提供サービス"],
          ["集客兵団", "oku株式会社が組織する300名規模のSNSディレクター委託チーム"],
          ["ルーク（SNSカテゴリ）", "興味・フックを目的とした投稿コンテンツカテゴリ"],
          ["教育資産（SNSカテゴリ）", "中長期的なブランド構築・教育目的のコンテンツ"],
          ["たたき台", "社長に確認してもらうための契約書・書類の初稿。だいやが直接先方に送付することはない"],
          ["KPI", "ダッシュボードに表示する主要業績指標（売上・案件数・フォロー数等）"],
        ],
        [2800, 6226]
      ),
      new Paragraph({ spacing: { before: 80 }, children: [] }),
      divider(),

      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 300, after: 100 },
        children: [new TextRun({ text: "— 以上 —", size: 20, font: "Arial", color: "999999" })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: "oku株式会社 社長サポートシステム 詳細システム要件定義書 v1.0", size: 18, font: "Arial", color: "BBBBBB" })]
      }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync('/mnt/user-data/outputs/oku_system_requirements_v1.docx', buffer);
  console.log('Done!');
});
