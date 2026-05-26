// ==============================
// 共通設定
// ==============================

const SHEET_NAME_ORDERS = 'orders';
const SHEET_NAME_MENUS = 'menus';
const PUBLIC_SHEET_NAME = '公開用';

// 公開用スプレッドシート
// URLのままでもOK。getPublicSpreadsheetId_() でIDだけ抽出します。
const PUBLIC_SPREADSHEET_ID = '1rx1_QIHQMr2B5f-Bqo-YOyu7O0QOF4rqwKt2yAgr7pA/edit?gid=0#gid=0';

// Slack Webhook URLはスクリプトプロパティに保存する
const SLACK_WEBHOOK_URL_PROPERTY_KEY = 'SLACK_WEBHOOK_URL';

const PUBLIC_HEADERS = [
  'タイムスタンプ',
  '部署',
  'メニュー',
  'サイズ',
  '単価',
  '数量'
];

const ORDER_HEADERS_COUNT = 12;
