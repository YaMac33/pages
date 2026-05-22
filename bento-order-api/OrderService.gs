function getInitialData() {
  initializeSheetsIfNeeded_();
  return {
    menus: getActiveMenusForApi_(),
    deliveryDates: getActiveDeliveryDatesForApi_(),
    orders: getPublicOrdersForApi_(),
    summaries: getSummaries()
  };
}

function getOrdersPublic() {
  initializeSheetsIfNeeded_();
  return getPublicOrdersForApi_();
}

function submitOrder(payload) {
  return withDocumentLock_(function () {
    initializeSheetsIfNeeded_();
    var prepared = normalizeOrderPayload_(payload);
    var errors = validateOrderPayload(prepared);
    throwIfValidationErrors_(errors, prepared.email, '');

    var deliveryInfo = getDeliveryDateInfo_(prepared.deliveryDate, true);
    var menuMap = getActiveMenuMap_();
    var resolvedItems = resolveItemsAgainstMenuMaster_(prepared.items, menuMap);
    var status = isAfterDeadline_(deliveryInfo) ? BENTO_STATUS.REJECTED : BENTO_STATUS.ACTIVE;
    var deadlineStatus = status === BENTO_STATUS.ACTIVE ? '締切前' : '締切後';
    var acceptedAt = nowString();
    var existingIds = getExistingOrderIdSet_();
    var orderIds = [];
    var totalAmount = 0;
    var totalQuantity = 0;

    var adminRows = resolvedItems.map(function (item) {
      var orderId = generateUniqueOrderId_(prepared.deliveryDate, existingIds);
      orderIds.push(orderId);
      totalAmount += item.subtotal;
      totalQuantity += item.quantity;
      return {
        '注文ID': orderId,
        '受付日時': acceptedAt,
        '受取日': prepared.deliveryDate,
        '担当部署': prepared.department,
        '注文担当者名': prepared.applicantName,
        'メールアドレス': prepared.email,
        'メニューID': item.menuId,
        'メニュー': item.menuName,
        '単価': item.unitPrice,
        '個数': item.quantity,
        '小計': item.subtotal,
        'ステータス': status,
        '変更前注文ID': '',
        '備考': prepared.note,
        '締切判定': deadlineStatus,
        '処理種別': BENTO_PROCESS_TYPE.ORDER,
        '更新日時': acceptedAt,
        '内部メモ': status === BENTO_STATUS.ACTIVE ? '' : '締切後のため無効'
      };
    });

    appendAdminRows_(adminRows);
    rebuildOrdersPublic();
    rebuildSummaries();

    var result = {
      orderIds: orderIds,
      totalQuantity: totalQuantity,
      totalAmount: totalAmount,
      status: status,
      acceptedAt: acceptedAt,
      items: resolvedItems
    };

    if (status === BENTO_STATUS.ACTIVE) {
      sendOrderReceiptMail(prepared, result, deliveryInfo);
      logEvent('ORDER_REGISTERED', '注文を登録しました。', prepared.email, orderIds.join(','), result);
    } else {
      logEvent('DEADLINE_AFTER', '締切後の注文としてREJECTEDで記録しました。', prepared.email, orderIds.join(','), result);
      sendRejectedMail('order', prepared, deliveryInfo, '締切日時を過ぎています。');
    }

    return result;
  });
}

function submitChange(payload) {
  return withDocumentLock_(function () {
    initializeSheetsIfNeeded_();
    var prepared = normalizeChangePayload_(payload);
    var errors = validateChangePayload(prepared);
    throwIfValidationErrors_(errors, prepared.email, prepared.targetOrderId);

    var targetRows = findAdminRowsByOrderId_(prepared.targetOrderId);
    var activeRows = targetRows.filter(function (row) {
      return sanitizeText(row['ステータス']) === BENTO_STATUS.ACTIVE;
    });
    if (targetRows.length === 0) throw new Error('対象の注文IDが見つかりません。');
    if (activeRows.length === 0) throw new Error('対象の注文は有効な状態ではありません。');

    var targetEmail = normalizeEmail(activeRows[0]['メールアドレス']);
    if (targetEmail !== prepared.email) {
      logEvent('VALIDATION_ERROR', '変更時のメールアドレス照合に失敗しました。', prepared.email, prepared.targetOrderId, '');
      throw new Error('注文IDとメールアドレスが一致しません。');
    }

    var oldDeliveryInfo = getDeliveryDateInfo_(activeRows[0]['受取日'], false);
    var newDeliveryInfo = getDeliveryDateInfo_(prepared.newDeliveryDate, true);
    if (isAfterDeadline_(oldDeliveryInfo) || isAfterDeadline_(newDeliveryInfo)) {
      var deadlineInfo = isAfterDeadline_(oldDeliveryInfo) ? oldDeliveryInfo : newDeliveryInfo;
      logEvent('DEADLINE_AFTER', '締切後のため変更処理を行いませんでした。', prepared.email, prepared.targetOrderId, prepared);
      sendRejectedMail('change', prepared, deadlineInfo, '対象注文または変更後受取日の締切日時を過ぎています。');
      return {
        targetOrderId: prepared.targetOrderId,
        orderIds: [],
        totalQuantity: 0,
        totalAmount: 0,
        status: BENTO_STATUS.REJECTED,
        changed: false,
        acceptedAt: nowString()
      };
    }

    var menuMap = getActiveMenuMap_();
    var resolvedItems = resolveItemsAgainstMenuMaster_(prepared.items, menuMap);
    var acceptedAt = nowString();
    var existingIds = getExistingOrderIdSet_();
    var orderIds = [];
    var totalAmount = 0;
    var totalQuantity = 0;

    updateAdminRowsStatus_(
      activeRows.map(function (row) {
        return row._rowNumber;
      }),
      BENTO_STATUS.CHANGED,
      BENTO_PROCESS_TYPE.CHANGE,
      prepared.note,
      '変更処理により変更済み'
    );

    var adminRows = resolvedItems.map(function (item) {
      var orderId = generateUniqueOrderId_(prepared.newDeliveryDate, existingIds);
      orderIds.push(orderId);
      totalAmount += item.subtotal;
      totalQuantity += item.quantity;
      return {
        '注文ID': orderId,
        '受付日時': acceptedAt,
        '受取日': prepared.newDeliveryDate,
        '担当部署': prepared.department,
        '注文担当者名': prepared.applicantName,
        'メールアドレス': prepared.email,
        'メニューID': item.menuId,
        'メニュー': item.menuName,
        '単価': item.unitPrice,
        '個数': item.quantity,
        '小計': item.subtotal,
        'ステータス': BENTO_STATUS.ACTIVE,
        '変更前注文ID': prepared.targetOrderId,
        '備考': prepared.note,
        '締切判定': '締切前',
        '処理種別': BENTO_PROCESS_TYPE.CHANGE,
        '更新日時': acceptedAt,
        '内部メモ': '変更後注文'
      };
    });

    appendAdminRows_(adminRows);
    rebuildOrdersPublic();
    rebuildSummaries();

    var result = {
      targetOrderId: prepared.targetOrderId,
      orderIds: orderIds,
      totalQuantity: totalQuantity,
      totalAmount: totalAmount,
      status: BENTO_STATUS.ACTIVE,
      changed: true,
      acceptedAt: acceptedAt,
      items: resolvedItems
    };
    sendChangeReceiptMail(prepared, result, newDeliveryInfo);
    logEvent('CHANGE_REGISTERED', '注文変更を登録しました。', prepared.email, prepared.targetOrderId, result);

    return result;
  });
}

function submitCancel(payload) {
  return withDocumentLock_(function () {
    initializeSheetsIfNeeded_();
    var prepared = normalizeCancelPayload_(payload);
    var errors = validateCancelPayload(prepared);
    throwIfValidationErrors_(errors, prepared.email, prepared.targetOrderId);

    var targetRows = findAdminRowsByOrderId_(prepared.targetOrderId);
    var activeRows = targetRows.filter(function (row) {
      return sanitizeText(row['ステータス']) === BENTO_STATUS.ACTIVE;
    });
    if (targetRows.length === 0) throw new Error('対象の注文IDが見つかりません。');
    if (activeRows.length === 0) throw new Error('対象の注文は有効な状態ではありません。');

    var targetEmail = normalizeEmail(activeRows[0]['メールアドレス']);
    if (targetEmail !== prepared.email) {
      logEvent('VALIDATION_ERROR', 'キャンセル時のメールアドレス照合に失敗しました。', prepared.email, prepared.targetOrderId, '');
      throw new Error('注文IDとメールアドレスが一致しません。');
    }

    var deliveryInfo = getDeliveryDateInfo_(activeRows[0]['受取日'], false);
    if (isAfterDeadline_(deliveryInfo)) {
      logEvent('DEADLINE_AFTER', '締切後のためキャンセル処理を行いませんでした。', prepared.email, prepared.targetOrderId, prepared);
      sendRejectedMail('cancel', prepared, deliveryInfo, '対象注文の締切日時を過ぎています。');
      return {
        canceledOrderId: prepared.targetOrderId,
        status: BENTO_STATUS.REJECTED,
        canceled: false,
        acceptedAt: nowString()
      };
    }

    var acceptedAt = nowString();
    updateAdminRowsStatus_(
      activeRows.map(function (row) {
        return row._rowNumber;
      }),
      BENTO_STATUS.CANCELED,
      BENTO_PROCESS_TYPE.CANCEL,
      prepared.note,
      'キャンセル処理済み'
    );
    rebuildOrdersPublic();
    rebuildSummaries();

    var result = {
      canceledOrderId: prepared.targetOrderId,
      status: BENTO_STATUS.CANCELED,
      canceled: true,
      acceptedAt: acceptedAt
    };
    sendCancelReceiptMail(prepared, activeRows, result);
    logEvent('CANCEL_REGISTERED', '注文キャンセルを登録しました。', prepared.email, prepared.targetOrderId, result);

    return result;
  });
}

function normalizeOrderPayload_(payload) {
  return {
    type: 'order',
    department: sanitizeText(payload && payload.department),
    applicantName: sanitizeText(payload && payload.applicantName),
    email: normalizeEmail(payload && payload.email),
    deliveryDate: formatDate(payload && payload.deliveryDate),
    items: normalizeItems_(payload && payload.items),
    note: sanitizeText(payload && payload.note)
  };
}

function normalizeChangePayload_(payload) {
  return {
    type: 'change',
    targetOrderId: sanitizeText(payload && payload.targetOrderId),
    department: sanitizeText(payload && payload.department),
    applicantName: sanitizeText(payload && payload.applicantName),
    email: normalizeEmail(payload && payload.email),
    newDeliveryDate: formatDate(payload && payload.newDeliveryDate),
    items: normalizeItems_(payload && payload.items),
    note: sanitizeText(payload && payload.note)
  };
}

function normalizeCancelPayload_(payload) {
  return {
    type: 'cancel',
    targetOrderId: sanitizeText(payload && payload.targetOrderId),
    department: sanitizeText(payload && payload.department),
    applicantName: sanitizeText(payload && payload.applicantName),
    email: normalizeEmail(payload && payload.email),
    note: sanitizeText(payload && payload.note)
  };
}

function normalizeItems_(items) {
  if (!Array.isArray(items)) return [];
  return items.map(function (item) {
    return {
      menuId: sanitizeText(item && item.menuId),
      menuName: sanitizeText(item && item.menuName),
      unitPrice: Number(item && item.unitPrice) || 0,
      quantity: Number(item && item.quantity) || 0,
      subtotal: Number(item && item.subtotal) || 0
    };
  });
}

function resolveItemsAgainstMenuMaster_(items, menuMap) {
  return items
    .filter(function (item) {
      return Number(item.quantity) > 0;
    })
    .map(function (item) {
      var menu = menuMap[item.menuId];
      if (!menu) {
        throw new Error('受付中のメニューに存在しないメニューIDです: ' + item.menuId);
      }
      var quantity = Number(item.quantity);
      var unitPrice = Number(menu.price);
      return {
        menuId: menu.id,
        menuName: menu.name,
        unitPrice: unitPrice,
        quantity: quantity,
        subtotal: unitPrice * quantity
      };
    });
}

function generateUniqueOrderId_(deliveryDate, existingIds) {
  for (var i = 0; i < 50; i += 1) {
    var orderId = createOrderIdCandidate_(deliveryDate, BENTO_ORDER_ID_RANDOM_LENGTH);
    if (!existingIds[orderId]) {
      existingIds[orderId] = true;
      return orderId;
    }
  }

  var fallback = 'ORDER-' + formatDate(deliveryDate).replace(/-/g, '') + '-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  existingIds[fallback] = true;
  return fallback;
}

function withDocumentLock_(callback) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(BENTO_LOCK_WAIT_MS);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function initializeSheetsIfNeeded_() {
  var spreadsheet = getSpreadsheet_();
  var requiredNames = Object.keys(BENTO_SHEET_NAMES).map(function (key) {
    return BENTO_SHEET_NAMES[key];
  });
  var missing = requiredNames.some(function (name) {
    return !spreadsheet.getSheetByName(name);
  });
  if (missing) {
    initializeSheets();
  } else {
    seedMasterSheetsIfEmpty_();
  }
}
