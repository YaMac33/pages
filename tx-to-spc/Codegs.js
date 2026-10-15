/**
 * ナレーション音声作成ツール（最小版）
 * Google Cloud Text-to-Speech を呼び出して MP3 を作る GAS Webアプリ
 *
 * 事前準備：
 *   プロジェクトの設定 → スクリプト プロパティ に
 *   TTS_API_KEY = （Google Cloud で作成した API キー）を登録
 */

const TTS_API = 'https://texttospeech.googleapis.com/v1';
const MAX_INPUT_BYTES = 5000; // API の1回あたりの上限

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('ナレーション音声作成')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** 日本語の声の一覧を返す */
function listVoices() {
  const res = callApi_('get', '/voices?languageCode=ja-JP');
  return (res.voices || [])
    .filter(v => (v.languageCodes || []).indexOf('ja-JP') >= 0)
    .map(v => ({ name: v.name, gender: v.ssmlGender, type: voiceType_(v.name) }))
    .sort((a, b) => a.type.order - b.type.order || a.name.localeCompare(b.name));
}

/**
 * 音声を合成して MP3（base64）を返す
 * @param {{text:string, ssml:boolean, voice:string, rate:number, pitch:number}} req
 */
function synthesize(req) {
  const text = String(req.text || '').trim();
  if (!text) throw new Error('テキストが空です');
  const bytes = Utilities.newBlob(text).getBytes().length;
  if (bytes > MAX_INPUT_BYTES) throw new Error('1回に送れる文章が長すぎます（全角で約1,600文字まで）');

  const audioConfig = {
    audioEncoding: 'MP3',
    speakingRate: clamp_(Number(req.rate) || 1, 0.25, 4),
  };
  // Chirp 3 HD は高さ（pitch）の指定に対応していないため送らない
  if (!/Chirp/i.test(req.voice)) audioConfig.pitch = clamp_(Number(req.pitch) || 0, -20, 20);

  const body = {
    input: req.ssml ? { ssml: text } : { text: text },
    voice: { languageCode: 'ja-JP', name: req.voice },
    audioConfig: audioConfig,
  };
  const res = callApi_('post', '/text:synthesize', body);
  return { audio: res.audioContent, chars: text.length };
}

// ---------- 内部関数 ----------

function callApi_(method, path, body) {
  const key = PropertiesService.getScriptProperties().getProperty('TTS_API_KEY');
  if (!key) throw new Error('スクリプトプロパティ「TTS_API_KEY」が設定されていません');
  const url = TTS_API + path + (path.indexOf('?') >= 0 ? '&' : '?') + 'key=' + encodeURIComponent(key);
  const opt = { method: method, muteHttpExceptions: true, contentType: 'application/json' };
  if (body) opt.payload = JSON.stringify(body);
  const r = UrlFetchApp.fetch(url, opt);
  const json = JSON.parse(r.getContentText() || '{}');
  if (r.getResponseCode() !== 200) {
    const msg = (json.error && json.error.message) || ('HTTP ' + r.getResponseCode());
    throw new Error('音声合成APIのエラー：' + msg);
  }
  return json;
}

function voiceType_(name) {
  if (/Chirp3-HD/i.test(name)) return { label: 'Chirp 3 HD（最も自然）', order: 1 };
  if (/Chirp/i.test(name))     return { label: 'Chirp', order: 2 };
  if (/Neural2/i.test(name))   return { label: 'Neural2（自然）', order: 3 };
  if (/Wavenet/i.test(name))   return { label: 'WaveNet', order: 4 };
  if (/Standard/i.test(name))  return { label: 'Standard（機械的）', order: 5 };
  if (/Studio/i.test(name))    return { label: 'Studio（料金が高い）', order: 6 };
  return { label: 'その他', order: 9 };
}

function clamp_(v, a, b) { return Math.min(b, Math.max(a, v)); }
