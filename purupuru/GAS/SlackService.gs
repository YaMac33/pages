// ==============================
// Slack通知
// ==============================

function sendOrderSlackNotification_(order) {
  const webhookUrl = getSlackWebhookUrl_();

  let totalAmount = 0;

  const itemLines = order.items.map(function(item, index) {
    const subtotal = Number(item.unitPrice || 0) * Number(item.quantity || 0);
    totalAmount += subtotal;

    return [
      '【' + (index + 1) + '】' + item.menu,
      '盛り方：' + (item.size || 'なし'),
      '単価：' + formatYen_(item.unitPrice),
      '数量：' + item.quantity,
      '小計：' + formatYen_(subtotal)
    ].join('\n');
  }).join('\n\n');

  const text =
    '🍱 新しい注文が追加されました\n\n' +
    '受付日時：' + formatDateTime_(order.timestamp) + '\n' +
    '部署：' + order.department + '\n' +
    '名前：' + order.name + '\n' +
    '連絡先：' + (order.contact || '未入力') + '\n' +
    '登録行数：' + order.insertedRows + '行\n\n' +
    '--- 注文内容 ---\n' +
    itemLines + '\n\n' +
    '合計金額：' + formatYen_(totalAmount) + '\n' +
    '備考：' + (order.note || 'なし');

  const response = UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      text: text
    }),
    muteHttpExceptions: true
  });

  const responseCode = response.getResponseCode();

  if (responseCode < 200 || responseCode >= 300) {
    throw new Error(
      'Slack通知に失敗しました。HTTPステータス: ' +
      responseCode +
      ' / レスポンス: ' +
      response.getContentText()
    );
  }
}

function getSlackWebhookUrl_() {
  const webhookUrl = PropertiesService
    .getScriptProperties()
    .getProperty(SLACK_WEBHOOK_URL_PROPERTY_KEY);

  if (!webhookUrl) {
    throw new Error(
      'スクリプトプロパティに ' +
      SLACK_WEBHOOK_URL_PROPERTY_KEY +
      ' が設定されていません。'
    );
  }

  return webhookUrl;
}

// Slack通知だけを手動テストしたい場合に使う
function testSlackNotification() {
  sendOrderSlackNotification_({
    timestamp: new Date(),
    department: 'テスト部署',
    name: 'テスト太郎',
    contact: 'test@example.com',
    note: 'Slack通知テストです。',
    insertedRows: 2,
    items: [
      {
        menu: '鮭弁当',
        size: '普通',
        price: 500,
        unitPrice: 500,
        subtotal: 1000,
        quantity: 2
      },
      {
        menu: 'お茶',
        size: '',
        price: 120,
        unitPrice: 120,
        subtotal: 120,
        quantity: 1
      }
    ]
  });
}
