window.CASE_HISTORY_DATA = [
  {
    id: "case-001",
    name: "基幹システム更新",
    customer: "青葉製作所",
    status: "open",
    owner: "佐藤",
    color: "blue",
    histories: [
      { date: "2026-04-02", type: "訪問", text: "現行運用の課題をヒアリング。月次締め処理の待ち時間が主な論点。", owner: "佐藤" },
      { date: "2026-04-08", type: "見積", text: "サーバ更新案とクラウド移行案の概算を提出。", owner: "田中" },
      { date: "2026-04-17", type: "会議", text: "移行リハーサルを5月中旬に実施する方向で合意。", owner: "佐藤" },
      { date: "2026-04-28", type: "予定", text: "部門長向けの費用対効果説明会。", owner: "佐藤" }
    ]
  },
  {
    id: "case-002",
    name: "問い合わせ管理導入",
    customer: "北都サービス",
    status: "waiting",
    owner: "鈴木",
    color: "green",
    histories: [
      { date: "2026-04-04", type: "メール", text: "要件整理シートを送付。一次回答期限を4月11日に設定。", owner: "鈴木" },
      { date: "2026-04-12", type: "電話", text: "回答遅延の連絡。担当部門内で承認待ち。", owner: "鈴木" },
      { date: "2026-04-23", type: "確認", text: "必須項目と権限ロールの追加要望を受領。", owner: "山本" }
    ]
  },
  {
    id: "case-003",
    name: "セキュリティ診断",
    customer: "南町クリニック",
    status: "done",
    owner: "山本",
    color: "orange",
    histories: [
      { date: "2026-04-01", type: "受付", text: "Webサイト診断の依頼を受付。診断範囲を確認。", owner: "山本" },
      { date: "2026-04-10", type: "作業", text: "脆弱性診断を実施。重大リスクは検出なし。", owner: "山本" },
      { date: "2026-04-16", type: "報告", text: "報告書を提出。軽微な設定改善を案内。", owner: "山本" }
    ]
  },
  {
    id: "case-004",
    name: "予約サイト改修",
    customer: "花岡ホール",
    status: "open",
    owner: "田中",
    color: "red",
    histories: [
      { date: "2026-04-06", type: "会議", text: "キャンセル待ち機能の優先度を確認。", owner: "田中" },
      { date: "2026-04-15", type: "設計", text: "管理画面の導線案を共有。文言調整の依頼あり。", owner: "田中" },
      { date: "2026-04-24", type: "レビュー", text: "画面モックを確認。公開前チェック項目を整理。", owner: "佐藤" },
      { date: "2026-05-01", type: "予定", text: "改修範囲を確定し開発着手。", owner: "田中" }
    ]
  }
];
