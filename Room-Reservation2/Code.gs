/*************************************************************
 * 会議室予約申請システム — GASバックエンド
 *
 * 【初回セットアップ手順】
 *  1. スプレッドシートを1つ作成し、そのバインドスクリプトとして
 *     この Code.gs を貼り付ける（拡張機能→Apps Script）
 *  2. Slack の Incoming Webhook URL を取得しておく
 *  3. Apps Scriptエディタで setup 関数を一度だけ実行
 *     （シート初期化＋Webhook URL登録のダイアログが出ます）
 *     ※ setup を使わず手動で登録する場合は、
 *       プロジェクトの設定→スクリプトプロパティに
 *       キー: SLACK_WEBHOOK_URL / 値: あなたのWebhook URL を追加
 *  4. デプロイ→新しいデプロイ→種類「ウェブアプリ」
 *       実行するユーザー: 自分
 *       アクセスできるユーザー: 全員
 *     を選び、発行された /exec URL を index.html の GAS_URL に設定
 *
 * 【シート構成】
 *  - Reservations : 予約データ（複数日は1日1行に展開）
 *  - Users        : userId / PINハッシュ / 登録日時
 *************************************************************/

var SHEET_RESERVATIONS = 'Reservations';
var SHEET_USERS        = 'Users';
var PROP_WEBHOOK       = 'SLACK_WEBHOOK_URL';

var RES_HEADERS = [
  'reservationId', 'userId', 'dept', 'name', 'role',
  'room', 'date', 'startTime', 'endTime',
  'content', 'headcount', 'status', 'submittedAt'
];
var USER_HEADERS = ['userId', 'pinHash', 'registeredAt'];

/*************************************************************
 * セットアップ（初回のみ手動実行）
 *************************************************************/
function setup() {
  initSheets_();
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt(
    'Slack Webhook URL の登録',
    'Incoming Webhook の URL を貼り付けてください（後で変更可）:',
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() === ui.Button.OK) {
    var url = res.getResponseText().trim();
    if (url) {
      PropertiesService.getScriptProperties().setProperty(PROP_WEBHOOK, url);
      ui.alert('登録しました。ウェブアプリとしてデプロイしてください。');
    } else {
      ui.alert('URLが空でした。スクリプトプロパティから後で登録できます。');
    }
  }
}

function initSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, SHEET_RESERVATIONS, RES_HEADERS);
  ensureSheet_(ss, SHEET_USERS, USER_HEADERS);
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  var firstRow = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  var empty = firstRow.every(function (c) { return c === '' || c === null; });
  if (empty) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sh;
}

/*************************************************************
 * ルーティング
 *************************************************************/
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'list';
  try {
    if (action === 'list')    return json_(handleList_());
    if (action === 'checkId') return json_(handleCheckId_(e.parameter.userId));
    if (action === 'history') return json_(handleHistory_(e.parameter.userId, e.parameter.pin));
    return json_({ ok: false, error: 'unknown action: ' + action });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action || 'reserve';
    if (action === 'reserve') return json_(handleReserve_(body));
    return json_({ ok: false, error: 'unknown action: ' + action });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/*************************************************************
 * ID存在チェック
 *  返り値: { ok, exists }
 *************************************************************/
function handleCheckId_(userId) {
  userId = normalizeId_(userId);
  if (!userId) return { ok: false, error: 'userId is empty' };
  return { ok: true, exists: findUser_(userId) !== null };
}

/*************************************************************
 * 履歴取得（ID + PIN照合）
 *  返り値: { ok, authed, reservations }
 *************************************************************/
function handleHistory_(userId, pin) {
  userId = normalizeId_(userId);
  if (!userId || !pin) return { ok: false, error: 'userId/pin required' };
  var user = findUser_(userId);
  if (!user) return { ok: true, authed: false, reason: 'not_found' };
  if (user.pinHash !== hashPin_(userId, pin)) {
    return { ok: true, authed: false, reason: 'pin_mismatch' };
  }
  var list = readReservations_().filter(function (r) { return r.userId === userId; });
  list.sort(function (a, b) { return a.date < b.date ? 1 : -1; }); // 新しい順
  return { ok: true, authed: true, reservations: list };
}

/*************************************************************
 * 予約登録
 *  body: { userId, pin, dept, name, role, rooms[],
 *          content, headcount, isMulti,
 *          startDt, endDt          (単一日)
 *          dates:[{date,startTime,endTime}] (複数日) }
 *  返り値: { ok, registered, reservationId, count } or auth error
 *************************************************************/
function handleReserve_(body) {
  var userId = normalizeId_(body.userId);
  var pin = String(body.pin || '').trim();
  if (!userId) return { ok: false, error: 'userIdが空です' };
  if (!/^\d{4}$/.test(pin)) return { ok: false, error: 'PINは4桁の数字です' };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var registeredNow = false;
  try {
    var user = findUser_(userId);
    if (!user) {
      // 新規登録
      registerUser_(userId, pin);
      registeredNow = true;
    } else {
      // 既存 → PIN照合必須
      if (user.pinHash !== hashPin_(userId, pin)) {
        return { ok: true, authed: false, reason: 'pin_mismatch',
                 message: 'そのIDは既に使われています。PINが一致しません。' };
      }
    }

    // 予約行を組み立て
    var rows = buildReservationRows_(body, userId);
    if (rows.length === 0) return { ok: false, error: '予約日時がありません' };

    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_RESERVATIONS);
    var reservationId = 'R' + Date.now();
    var submittedAt = new Date();
    var values = rows.map(function (r, i) {
      return [
        reservationId + '-' + (i + 1), userId, body.dept || '', body.name || '',
        body.role || '', r.room, r.date, r.startTime, r.endTime,
        body.content || '', body.headcount || '', '確認中', submittedAt
      ];
    });
    sh.getRange(sh.getLastRow() + 1, 1, values.length, RES_HEADERS.length).setValues(values);

    // Slack通知
    notifySlack_(body, userId, rows, reservationId, registeredNow);

    return { ok: true, authed: true, registered: registeredNow,
             reservationId: reservationId, count: values.length };
  } finally {
    lock.releaseLock();
  }
}

/*************************************************************
 * 予約行の展開（会議室 × 日付）
 *************************************************************/
function buildReservationRows_(body, userId) {
  var rooms = Array.isArray(body.rooms) ? body.rooms : (body.rooms ? [body.rooms] : []);
  if (rooms.length === 0) rooms = ['(未指定)'];
  var rows = [];

  if (body.isMulti && Array.isArray(body.dates)) {
    body.dates.forEach(function (d) {
      rooms.forEach(function (room) {
        rows.push({ room: room, date: d.date, startTime: d.startTime, endTime: d.endTime });
      });
    });
  } else {
    var s = splitDatetime_(body.startDt);
    var e = splitDatetime_(body.endDt);
    // 単一日：開始日を採用。開始・終了時刻を保持
    rooms.forEach(function (room) {
      rows.push({ room: room, date: s.date, startTime: s.time, endTime: e.time });
    });
  }
  return rows;
}

function splitDatetime_(dtStr) {
  // "2026-07-02T09:00" → {date:"2026-07-02", time:"09:00"}
  if (!dtStr) return { date: '', time: '' };
  var parts = String(dtStr).split('T');
  return { date: parts[0] || '', time: (parts[1] || '').slice(0, 5) };
}

/*************************************************************
 * 予約一覧（公開用：個人情報を含めない）
 *  status順ではなく日付昇順、直近を上に出したいのでソートは画面側と合わせる
 *************************************************************/
function handleList_() {
  var list = readReservations_().map(function (r) {
    return {
      date: r.date, startTime: r.startTime, endTime: r.endTime,
      rooms: [r.room], dept: r.dept, status: r.status
    };
  });
  // 日付昇順（今日/直近を上に）
  list.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.startTime < b.startTime ? -1 : 1;
  });
  return { ok: true, reservations: list };
}

/*************************************************************
 * データ読み取り
 *************************************************************/
function readReservations_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_RESERVATIONS);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, RES_HEADERS.length).getValues();
  return values.map(function (row) {
    var o = {};
    RES_HEADERS.forEach(function (h, i) { o[h] = row[i]; });
    o.date      = toDateStr_(o.date);
    o.startTime = toTimeStr_(o.startTime);
    o.endTime   = toTimeStr_(o.endTime);
    return o;
  });
}

// セルが Date 型で返る場合に備えて文字列へ正規化
function toDateStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v);
}
function toTimeStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
  return String(v);
}

/*************************************************************
 * ユーザー管理
 *************************************************************/
function findUser_(userId) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
  if (!sh || sh.getLastRow() < 2) return null;
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, USER_HEADERS.length).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === userId) {
      return { userId: userId, pinHash: String(values[i][1]), row: i + 2 };
    }
  }
  return null;
}

function registerUser_(userId, pin) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USERS);
  sh.appendRow([userId, hashPin_(userId, pin), new Date()]);
}

/*************************************************************
 * PINハッシュ（userIdをソルト代わりに連結）
 *************************************************************/
function hashPin_(userId, pin) {
  var raw = 'v1:' + userId + ':' + pin;
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function normalizeId_(id) {
  return String(id == null ? '' : id).trim();
}

/*************************************************************
 * Slack通知
 *************************************************************/
function notifySlack_(body, userId, rows, reservationId, registeredNow) {
  var url = PropertiesService.getScriptProperties().getProperty(PROP_WEBHOOK);
  if (!url) return; // 未設定なら黙ってスキップ

  var rooms = Array.isArray(body.rooms) ? body.rooms.join(' / ') : String(body.rooms || '');
  var WD = ['日','月','火','水','木','金','土'];
  function fmt(dateStr, st, et) {
    var d = new Date(dateStr + 'T00:00:00');
    var w = isNaN(d.getTime()) ? '' : '（' + WD[d.getDay()] + '）';
    return dateStr + w + ' ' + st + '〜' + et;
  }
  // 日付ごとに1行（会議室展開ぶんは重複するのでユニーク化）
  var seen = {};
  var lines = [];
  rows.forEach(function (r) {
    var key = r.date + r.startTime + r.endTime;
    if (seen[key]) return;
    seen[key] = true;
    lines.push('• ' + fmt(r.date, r.startTime, r.endTime));
  });

  var text =
    '*会議室予約が申請されました*\n' +
    '担当課: ' + (body.dept || '―') + '\n' +
    '担当者: ' + (body.name || '―') + (body.role ? '（' + body.role + '）' : '') + '\n' +
    '会議室: ' + rooms + '\n' +
    '日時:\n' + lines.join('\n') + '\n' +
    '人数: ' + (body.headcount ? body.headcount + '名' : '―') + '\n' +
    '内容: ' + (body.content || '―') + '\n' +
    'ID: ' + userId + (registeredNow ? '（新規登録）' : '') + '\n' +
    '受付番号: ' + reservationId + '\n' +
    'ステータス: 確認中';

  var payload = { text: text };
  try {
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (err) {
    // 通知失敗は予約自体を止めない
    console.error('Slack通知失敗: ' + err);
  }
}

/*************************************************************
 * JSONレスポンス
 *************************************************************/
function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
