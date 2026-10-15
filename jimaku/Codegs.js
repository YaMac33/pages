/**
 * 字幕メーカー（バックエンド）
 *
 * MP3 を Gemini 3.5 Transcribe で文字起こしし、単語ごとの時刻を返す。
 * 字幕への分割・SRT 化・編集・再生はすべてブラウザ側（index.html）で行う。
 *
 * ■ スクリプトプロパティ（プロジェクトの設定 → スクリプト プロパティ）
 *   GEMINI_API_KEY … Google AI Studio で取得した API キー（必須）
 *   GEMINI_MODEL   … 使うモデル名（省略可。省略時は gemini-3.5-transcribe）
 *
 * ■ デプロイ設定
 *   種類：ウェブアプリ / 次のユーザーとして実行：自分 / アクセスできるユーザー：自分のみ
 */

const API_BASE = 'https://generativelanguage.googleapis.com';
const DEFAULT_MODEL = 'gemini-3.5-transcribe';

/** 画面を返す */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('字幕メーカー')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ------------------------------------------------------------------ */
/* 画面（google.script.run）から呼ばれる関数                            */
/* ------------------------------------------------------------------ */

/**
 * ステップ1：音声を Gemini の Files API にアップロードする
 * @param {string} base64   MP3 の Base64 文字列
 * @param {string} mimeType 'audio/mp3'
 * @return {{name:string, uri:string, mimeType:string}}
 */
function uploadAudio(base64, mimeType) {
  const key = getApiKey_();
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType);
  const size = blob.getBytes().length;

  // 1) アップロード開始（アップロード先 URL を受け取る）
  const start = UrlFetchApp.fetch(API_BASE + '/upload/v1beta/files', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-goog-api-key': key,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(size),
      'X-Goog-Upload-Header-Content-Type': mimeType
    },
    // 元のファイル名は送らない
    payload: JSON.stringify({ file: { display_name: 'subtitle-' + Date.now() } }),
    muteHttpExceptions: true
  });
  if (start.getResponseCode() !== 200) throw apiError_(start, 'アップロード準備');
  const uploadUrl = headerValue_(start.getAllHeaders(), 'x-goog-upload-url');
  if (!uploadUrl) throw new Error('アップロード先 URL を取得できませんでした。');

  // 2) 本体を送信
  const up = UrlFetchApp.fetch(uploadUrl, {
    method: 'post',
    headers: {
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize'
    },
    payload: blob,
    muteHttpExceptions: true
  });
  if (up.getResponseCode() !== 200) throw apiError_(up, 'アップロード');
  const file = JSON.parse(up.getContentText()).file;

  // 3) 処理可能になるまで待つ
  waitActive_(file, key);
  return { name: file.name, uri: file.uri, mimeType: file.mimeType || mimeType };
}

/**
 * ステップ2：文字起こし（単語ごとの時刻つき）。終わったらアップロードした音声を削除する
 * @param {{name:string, uri:string, mimeType:string}} fileInfo uploadAudio の戻り値
 * @return {{text:string, words:Array<{w:string, s:?number, e:?number}>}}
 */
function transcribe(fileInfo) {
  const key = getApiKey_();
  try {
    const body = {
      contents: [{
        parts: [{ fileData: { fileUri: fileInfo.uri, mimeType: fileInfo.mimeType } }]
      }],
      generationConfig: {
        audioTranscriptionConfig: {
          languageCodes: ['ja-JP'],
          wordTimestamp: true
        }
      }
    };
    const res = UrlFetchApp.fetch(
      API_BASE + '/v1beta/models/' + getModel_() + ':generateContent', {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-goog-api-key': key },
        payload: JSON.stringify(body),
        muteHttpExceptions: true
      });
    if (res.getResponseCode() !== 200) throw apiError_(res, '文字起こし');
    return parseTranscription_(JSON.parse(res.getContentText()));
  } finally {
    deleteFile_(fileInfo.name, key);
  }
}

/* ------------------------------------------------------------------ */
/* エディタから手動で実行する補助関数                                    */
/* ------------------------------------------------------------------ */

/** 設定確認：API キーとモデル名が正しいかをログに出す */
function checkSetup() {
  const key = getApiKey_();
  const res = UrlFetchApp.fetch(API_BASE + '/v1beta/models/' + getModel_(), {
    headers: { 'x-goog-api-key': key },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() === 200) {
    Logger.log('OK：API キーとモデル（' + getModel_() + '）を確認できました。');
  } else {
    throw apiError_(res, '設定確認');
  }
}

/** 掃除：Files API に残っている音声をすべて削除する（通常は不要。48時間で自動削除もされる） */
function cleanupFiles() {
  const key = getApiKey_();
  let pageToken = '';
  let count = 0;
  do {
    const url = API_BASE + '/v1beta/files?pageSize=100' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const res = UrlFetchApp.fetch(url, { headers: { 'x-goog-api-key': key }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw apiError_(res, 'ファイル一覧の取得');
    const json = JSON.parse(res.getContentText());
    (json.files || []).forEach(function (f) { deleteFile_(f.name, key); count++; });
    pageToken = json.nextPageToken || '';
  } while (pageToken);
  Logger.log(count + ' 件削除しました。');
}

/* ------------------------------------------------------------------ */
/* 内部処理                                                             */
/* ------------------------------------------------------------------ */

function getApiKey_() {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('スクリプトプロパティ GEMINI_API_KEY が設定されていません。');
  return key.trim();
}

function getModel_() {
  const m = PropertiesService.getScriptProperties().getProperty('GEMINI_MODEL');
  return (m && m.trim()) || DEFAULT_MODEL;
}

/** レスポンスヘッダーを大文字小文字を区別せずに取り出す */
function headerValue_(headers, name) {
  const lower = name.toLowerCase();
  for (const k in headers) {
    if (k.toLowerCase() === lower) {
      const v = headers[k];
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return null;
}

/** API エラーを日本語のメッセージにする */
function apiError_(res, step) {
  const code = res.getResponseCode();
  let msg = res.getContentText();
  try {
    const j = JSON.parse(msg);
    if (j.error && j.error.message) msg = j.error.message;
  } catch (e) { /* JSON でなければそのまま */ }
  if (msg.length > 300) msg = msg.slice(0, 300) + '…';
  if (code === 429) {
    return new Error(step + '：無料枠の利用上限に達しました。時間をおいて再実行してください。（' + msg + '）');
  }
  if (code === 400 || code === 403) {
    return new Error(step + '（HTTP ' + code + '）：API キー・モデル名・音声ファイルを確認してください。（' + msg + '）');
  }
  return new Error(step + '（HTTP ' + code + '）：' + msg);
}

/** アップロードした音声が ACTIVE になるまで待つ */
function waitActive_(file, key) {
  let f = file;
  for (let i = 0; i < 30 && f.state === 'PROCESSING'; i++) {
    Utilities.sleep(2000);
    const r = UrlFetchApp.fetch(API_BASE + '/v1beta/' + f.name, {
      headers: { 'x-goog-api-key': key },
      muteHttpExceptions: true
    });
    if (r.getResponseCode() !== 200) throw apiError_(r, 'ファイル状態の確認');
    f = JSON.parse(r.getContentText());
  }
  if (f.state === 'FAILED') throw new Error('Gemini 側で音声ファイルの処理に失敗しました。');
  if (f.state === 'PROCESSING') throw new Error('音声ファイルの準備が時間内に終わりませんでした。');
}

/** アップロードした音声を削除（失敗しても処理は止めない） */
function deleteFile_(name, key) {
  if (!name) return;
  try {
    UrlFetchApp.fetch(API_BASE + '/v1beta/' + name, {
      method: 'delete',
      headers: { 'x-goog-api-key': key },
      muteHttpExceptions: true
    });
  } catch (e) {
    console.warn('一時ファイルの削除に失敗：' + e);
  }
}

/** 文字起こし結果から全文と単語ごとの時刻を取り出す */
function parseTranscription_(json) {
  const cand = (json.candidates || [])[0];
  if (!cand || !cand.content) {
    const reason = cand ? cand.finishReason
      : (json.promptFeedback && json.promptFeedback.blockReason);
    throw new Error('文字起こし結果が空でした。' + (reason ? '（理由：' + reason + '）' : ''));
  }
  let text = '';
  const words = [];
  (cand.content.parts || []).forEach(function (p) {
    if (typeof p.text === 'string') text += p.text;
    const t = p.audioTranscription;
    if (t && t.words) {
      t.words.forEach(function (w) {
        words.push({ w: String(w.word || ''), s: toSec_(w.startOffset), e: toSec_(w.endOffset) });
      });
    }
  });
  if (!words.length) {
    throw new Error('単語ごとの時刻情報が返ってきませんでした。音声に発話が含まれているか確認してください。');
  }
  return { text: text, words: words };
}

/** "1.250s" などの時間表記を秒（数値）にする */
function toSec_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object') return (Number(v.seconds) || 0) + (Number(v.nanos) || 0) / 1e9;
  const n = parseFloat(String(v).replace(/s$/, ''));
  return isNaN(n) ? null : n;
}
