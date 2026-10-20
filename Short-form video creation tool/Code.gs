/**
 * ショート動画メーカー（GAS 側）
 *
 * 画面（index.html）から呼ばれて、次の2つだけを行う。
 *   1. 原稿 → 音声（Gemini の音声生成）
 *   2. 音声 → 単語ごとの時刻つき文字起こし（Gemini 3.5 Transcribe）
 * テロップへの分割・編集・プレビュー・動画の書き出しは、すべてブラウザ側で行う。
 *
 * ■ スクリプトプロパティ（プロジェクトの設定 → スクリプト プロパティ）
 *   GEMINI_API_KEY   … Google AI Studio で取得した API キー（必須）
 *   TTS_MODEL        … 音声生成のモデル名（省略可。省略時は gemini-3.8-flash-tts）
 *   TRANSCRIBE_MODEL … 文字起こしのモデル名（省略可。省略時は gemini-3.5-transcribe）
 *
 * ■ デプロイ設定
 *   種類：ウェブアプリ / 次のユーザーとして実行：自分 / アクセスできるユーザー：自分のみ
 */

const API_BASE = 'https://generativelanguage.googleapis.com';

/** 画面を返す */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('ショート動画メーカー')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ------------------------------------------------------------------ */
/* 画面（google.script.run）から呼ばれる関数                            */
/* ------------------------------------------------------------------ */

/**
 * 原稿から音声を作る
 * @param {{text:string, voice:string, style:string}} req
 * @return {{data:string, mime:string}} data は音声の Base64（WAV または生の PCM）
 */
function generateSpeech(req) {
  const key = getApiKey_();
  const text = String((req && req.text) || '').trim();
  if (!text) throw new Error('原稿が空です。');
  if (text.length > 5000) throw new Error('原稿が長すぎます（5000文字まで）。');
  const voice = String((req && req.voice) || 'Kore');
  const style = String((req && req.style) || '').trim();
  const model = getProp_('TTS_MODEL', 'gemini-3.8-flash-tts');

  // 1) 現在の呼び出し方（Interactions API）
  const item = { type: 'text', text: text };
  if (style) item.annotations = [{ type: 'speech_metadata', style: style }];
  const first = postJson_(API_BASE + '/v1beta/interactions', {
    model: model,
    input: [{ type: 'user_input', content: [item] }],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice: voice }] }
  }, key);
  if (first.code === 200) {
    const audio = findAudio_(first.json);
    if (audio) return audio;
    throw new Error('音声の生成：応答に音声が含まれていませんでした。');
  }
  // 利用上限・課金・キーの問題は、別の呼び出し方を試しても同じなのでそのまま知らせる
  if (first.code === 429 || first.code === 402 || first.code === 401 || first.code === 403) {
    throw apiError_(first, '音声の生成');
  }

  // 2) 以前の呼び出し方（generateContent）でも試す
  const second = postJson_(API_BASE + '/v1beta/models/' + model + ':generateContent', {
    contents: [{ parts: [{ text: style ? style + '：' + text : text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
    }
  }, key);
  if (second.code === 200) {
    const audio = findAudio_(second.json);
    if (audio) return audio;
  }
  throw apiError_(first, '音声の生成');
}

/**
 * 音声を文字起こしする（単語ごとの時刻つき）。アップロードした音声は最後に削除する
 * @param {{data:string, mimeType:string}} req data は音声の Base64
 * @return {{text:string, words:Array<{w:string, s:?number, e:?number}>}}
 */
function transcribeAudio(req) {
  const key = getApiKey_();
  const mimeType = String((req && req.mimeType) || 'audio/wav');
  const file = uploadFile_(Utilities.base64Decode(req.data), mimeType, key);
  try {
    const res = postJson_(API_BASE + '/v1beta/models/' + getProp_('TRANSCRIBE_MODEL', 'gemini-3.5-transcribe') + ':generateContent', {
      contents: [{ parts: [{ fileData: { fileUri: file.uri, mimeType: file.mimeType || mimeType } }] }],
      generationConfig: { audioTranscriptionConfig: { languageCodes: ['ja-JP'], wordTimestamp: true } }
    }, key);
    if (res.code !== 200) throw apiError_(res, '文字起こし');
    return parseTranscription_(res.json);
  } finally {
    deleteFile_(file.name, key);
  }
}

/* ------------------------------------------------------------------ */
/* エディタから手動で実行する補助関数                                    */
/* ------------------------------------------------------------------ */

/** 設定確認：API キーと2つのモデル名が使えるかをログに出す */
function checkSetup() {
  const key = getApiKey_();
  [getProp_('TTS_MODEL', 'gemini-3.8-flash-tts'), getProp_('TRANSCRIBE_MODEL', 'gemini-3.5-transcribe')].forEach(function (m) {
    const res = UrlFetchApp.fetch(API_BASE + '/v1beta/models/' + m, { headers: { 'x-goog-api-key': key }, muteHttpExceptions: true });
    Logger.log((res.getResponseCode() === 200 ? 'OK：' : 'NG（HTTP ' + res.getResponseCode() + '）：') + m);
  });
}

/** 掃除：Files API に残っている音声をすべて削除する（通常は不要。48時間で自動削除もされる） */
function cleanupFiles() {
  const key = getApiKey_();
  let pageToken = '', count = 0;
  do {
    const url = API_BASE + '/v1beta/files?pageSize=100' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const res = UrlFetchApp.fetch(url, { headers: { 'x-goog-api-key': key }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('ファイル一覧を取得できませんでした（HTTP ' + res.getResponseCode() + '）');
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

function getProp_(name, def) {
  const v = PropertiesService.getScriptProperties().getProperty(name);
  return (v && v.trim()) || def;
}

/** JSON を POST して {code, json, text} を返す */
function postJson_(url, body, key) {
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': key },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  const text = res.getContentText();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* JSON でない */ }
  return { code: res.getResponseCode(), json: json, text: text };
}

/** API エラーを日本語のメッセージにする */
function apiError_(res, step) {
  const code = res.code;
  let msg = (res.json && res.json.error && res.json.error.message) || res.text || '';
  if (msg.length > 300) msg = msg.slice(0, 300) + '…';
  if (code === 429) return new Error(step + '：無料枠の利用上限に達しました。時間をおいて再実行してください。（' + msg + '）');
  if (code === 402) return new Error(step + '：API キーのプロジェクトの課金（前払い残高）に問題があります。AI Studio で確認してください。（' + msg + '）');
  if (code === 400 || code === 403 || code === 404) {
    return new Error(step + '（HTTP ' + code + '）：API キー・モデル名を確認してください。（' + msg + '）');
  }
  return new Error(step + '（HTTP ' + code + '）：' + msg);
}

/** 応答の中から音声データを探す（新旧どちらの形にも対応） */
function findAudio_(json) {
  let found = null;
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const inline = node.inlineData || node.inline_data;
    if (inline && typeof inline.data === 'string') {
      found = { data: inline.data, mime: inline.mimeType || inline.mime_type || '' };
    } else if (node.type === 'audio' && typeof node.data === 'string') {
      found = { data: node.data, mime: node.mime_type || node.mimeType || '' };
    }
    Object.keys(node).forEach(function (k) { if (node[k] && typeof node[k] === 'object') walk(node[k]); });
  })(json);
  return found;
}

/** Files API にアップロードし、処理可能になるまで待つ */
function uploadFile_(bytes, mimeType, key) {
  const start = UrlFetchApp.fetch(API_BASE + '/upload/v1beta/files', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-goog-api-key': key,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.length),
      'X-Goog-Upload-Header-Content-Type': mimeType
    },
    payload: JSON.stringify({ file: { display_name: 'short-video-' + Date.now() } }),
    muteHttpExceptions: true
  });
  if (start.getResponseCode() !== 200) throw apiError_({ code: start.getResponseCode(), text: start.getContentText(), json: safeJson_(start.getContentText()) }, 'アップロード準備');
  const headers = start.getAllHeaders();
  let uploadUrl = null;
  Object.keys(headers).forEach(function (k) { if (k.toLowerCase() === 'x-goog-upload-url') uploadUrl = [].concat(headers[k])[0]; });
  if (!uploadUrl) throw new Error('アップロード先 URL を取得できませんでした。');

  const up = UrlFetchApp.fetch(uploadUrl, {
    method: 'post',
    headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
    payload: bytes,
    muteHttpExceptions: true
  });
  if (up.getResponseCode() !== 200) throw apiError_({ code: up.getResponseCode(), text: up.getContentText(), json: safeJson_(up.getContentText()) }, 'アップロード');
  let f = JSON.parse(up.getContentText()).file;
  for (let i = 0; i < 30 && f.state === 'PROCESSING'; i++) {
    Utilities.sleep(2000);
    const r = UrlFetchApp.fetch(API_BASE + '/v1beta/' + f.name, { headers: { 'x-goog-api-key': key }, muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) break;
    f = JSON.parse(r.getContentText());
  }
  if (f.state === 'FAILED') throw new Error('Gemini 側で音声ファイルの処理に失敗しました。');
  return f;
}

function safeJson_(t) { try { return JSON.parse(t); } catch (e) { return null; } }

/** アップロードした音声を削除（失敗しても処理は止めない） */
function deleteFile_(name, key) {
  if (!name) return;
  try {
    UrlFetchApp.fetch(API_BASE + '/v1beta/' + name, { method: 'delete', headers: { 'x-goog-api-key': key }, muteHttpExceptions: true });
  } catch (e) {
    console.warn('一時ファイルの削除に失敗：' + e);
  }
}

/** 文字起こし結果から全文と単語ごとの時刻を取り出す */
function parseTranscription_(json) {
  const cand = ((json && json.candidates) || [])[0];
  if (!cand || !cand.content) throw new Error('文字起こし結果が空でした。音声に発話が含まれているか確認してください。');
  let text = '';
  const words = [];
  (cand.content.parts || []).forEach(function (p) {
    if (typeof p.text === 'string') text += p.text;
    const t = p.audioTranscription;
    if (t && t.words) {
      t.words.forEach(function (w) { words.push({ w: String(w.word || ''), s: toSec_(w.startOffset), e: toSec_(w.endOffset) }); });
    }
  });
  if (!words.length) throw new Error('単語ごとの時刻情報が返ってきませんでした。音声に発話が含まれているか確認してください。');
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