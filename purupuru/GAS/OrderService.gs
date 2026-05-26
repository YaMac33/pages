// ==============================
// 注文受付・ordersシート書き込み
// ==============================

function handleOrderPost_(e) {
  const lock = LockService.getScriptLock();
  let locked = false;

  try {
    lock.waitLock(10000);
    locked = true;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const orderSheet = ss.getSheetByName(SHEET_NAME_ORDERS);

    if (!orderSheet) {
      return createJsonResponse_({
        ok: false,
        message: SHEET_NAME_ORDERS + ' シートが見つかりません。'
      });
    }

    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse_({
        ok: false,
        message: '送信データがありません。'
      });
    }

    const data = JSON.parse(e.postData.contents);

    const orderInput = normalizeOrderInput_(data);
    const validationError = validateOrderInput_(orderInput);

    if (validationError) {
      return createJsonResponse_({
        ok: false,
        message: validationError
      });
    }

    const validItems = buildValidOrderItems_(ss, orderInput.items);

    if (validItems.length === 0) {
      return createJsonResponse_({
        ok: false,
        message: '有効な注文メニューがありません。'
      });
    }

    const timestamp = new Date();

    const rows = buildOrderRows_({
      timestamp: timestamp,
      department: orderInput.department,
      name: orderInput.name,
      contact: orderInput.contact,
      note: orderInput.note,
      items: validItems
    });

    writeOrderRows_(orderSheet, rows);

    // Slack通知
    // Slack通知に失敗しても、注文登録自体は成功扱いにする
    try {
      sendOrderSlackNotification_({
        timestamp: timestamp,
        department: orderInput.department,
        name: orderInput.name,
        contact: orderInput.contact,
        note: orderInput.note,
        items: validItems,
        insertedRows: rows.length
      });
    } catch (slackError) {
      Logger.log('Slack通知に失敗しました: ' + formatErrorForLog_(slackError));
    }

    // 公開用シート同期
    // 同期に失敗しても、注文登録自体は成功扱いにする
    try {
      if (typeof syncPublicSheet === 'function') {
        syncPublicSheet();
      } else {
        Logger.log('syncPublicSheet が定義されていないため、公開用シートの同期をスキップしました。');
      }
    } catch (syncError) {
      Logger.log('公開用シートの同期に失敗しました: ' + formatErrorForLog_(syncError));
    }

    return createJsonResponse_({
      ok: true,
      insertedRows: rows.length
    });

  } catch (error) {
    return createJsonResponse_({
      ok: false,
      message: error.message
    });

  } finally {
    if (locked) {
      lock.releaseLock();
    }
  }
}

function normalizeOrderInput_(data) {
  return {
    department: String(data.department || '').trim(),
    name: String(data.name || '').trim(),
    contact: String(data.contact || '').trim(),
    note: String(data.note || '').trim(),
    items: Array.isArray(data.items) ? data.items : []
  };
}

function validateOrderInput_(orderInput) {
  if (!orderInput.department) {
    return '部署が未入力です。';
  }

  if (!orderInput.name) {
    return '名前が未入力です。';
  }

  if (orderInput.items.length === 0) {
    return '注文メニューがありません。';
  }

  return '';
}

function buildValidOrderItems_(ss, items) {
  const optionMap = getMenuOptionMap_();
  const validItems = [];

  items.forEach(function(item) {
    const menuName = String(item.menuName || item.menu || '').trim();
    const requestedSize = String(item.size || '').trim();
    const quantity = Number(item.quantity);

    if (!menuName) return;
    if (!requestedSize) return;
    if (!Number.isInteger(quantity) || quantity <= 0) return;

    const optionKey = buildMenuOptionKey_(menuName, requestedSize);
    const option = optionMap[optionKey];

    if (!option) {
      throw new Error('menus シートに存在しないメニューまたは盛り方です: ' + menuName + ' / ' + requestedSize);
    }

    const unitPrice = option.price;
    const subtotal = unitPrice * quantity;

    validItems.push({
      menuName: menuName,
      menu: menuName,
      size: requestedSize,
      price: unitPrice,
      unitPrice: unitPrice,
      quantity: quantity,
      subtotal: subtotal
    });
  });

  return validItems;
}

function getMenuOptionMap_() {
  const groups = getMenuGroups_();
  const map = {};

  groups.forEach(function(group) {
    group.options.forEach(function(option) {
      map[buildMenuOptionKey_(group.menuName, option.size)] = {
        menuName: group.menuName,
        size: option.size,
        price: Number(option.price || 0)
      };
    });
  });

  return map;
}

function buildMenuOptionKey_(menuName, sizeName) {
  return String(menuName || '').trim() + '\u0000' + String(sizeName || '').trim();
}

function buildOrderRows_(order) {
  return order.items.map(function(item) {
    return [
      order.timestamp,
      order.department,
      order.name,
      order.contact,
      item.menu,
      item.size,
      item.price,
      '',
      item.unitPrice,
      item.quantity,
      '有効',
      order.note
    ];
  });
}

function writeOrderRows_(orderSheet, rows) {
  const startRow = orderSheet.getLastRow() + 1;
  const numRows = rows.length;

  orderSheet
    .getRange(startRow, 1, numRows, 1)
    .setNumberFormat('yyyy/MM/dd HH:mm:ss');

  orderSheet
    .getRange(startRow, 4, numRows, 1)
    .setNumberFormat('@');

  orderSheet
    .getRange(startRow, 1, numRows, ORDER_HEADERS_COUNT)
    .setValues(rows);
}
