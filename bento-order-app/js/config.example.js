/*
 * 設定ファイルのサンプルです。
 * 本番接続時はこのファイルを js/config.js にコピーし、
 * index.html の読み込み先を config.js に変更して利用する想定です。
 */
const APP_CONFIG = {
  API_BASE_URL: "https://script.google.com/macros/s/AKfycbyzbE-JWnQ7r5ZHrtlT4C1MXwGsxr8txzs-jV1Np9SAK4hyyNsj3WbVOv3OTf4kC-nT6g/exec",
  USE_MOCK_API: true
};

window.APP_CONFIG = APP_CONFIG;
