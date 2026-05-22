function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getOrCreateSheet_(sheetName) {
  var spreadsheet = getSpreadsheet_();
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  return sheet;
}

function ensureHeaderRow_(sheet, headers) {
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
}

function initializeSheets() {
  var definitions = [
    [BENTO_SHEET_NAMES.ordersAdmin, BENTO_HEADERS.ordersAdmin],
    [BENTO_SHEET_NAMES.ordersPublic, BENTO_HEADERS.ordersPublic],
    [BENTO_SHEET_NAMES.summaryDepartment, BENTO_HEADERS.summaryDepartment],
    [BENTO_SHEET_NAMES.summaryTotal, BENTO_HEADERS.summaryTotal],
    [BENTO_SHEET_NAMES.menuMaster, BENTO_HEADERS.menuMaster],
    [BENTO_SHEET_NAMES.deliveryDates, BENTO_HEADERS.deliveryDates],
    [BENTO_SHEET_NAMES.settings, BENTO_HEADERS.settings],
    [BENTO_SHEET_NAMES.logs, BENTO_HEADERS.logs]
  ];

  definitions.forEach(function (definition) {
    var sheet = getOrCreateSheet_(definition[0]);
    ensureHeaderRow_(sheet, definition[1]);
  });

  seedMasterSheetsIfEmpty_();

  rebuildOrdersPublic();
  rebuildSummaries();
}

function seedMasterSheetsIfEmpty_() {
  seedSheetIfEmpty_(BENTO_SHEET_NAMES.menuMaster, BENTO_HEADERS.menuMaster, BENTO_SAMPLE_MENUS);
  seedSheetIfEmpty_(
    BENTO_SHEET_NAMES.deliveryDates,
    BENTO_HEADERS.deliveryDates,
    BENTO_SAMPLE_DELIVERY_DATES
  );
  seedSheetIfEmpty_(BENTO_SHEET_NAMES.settings, BENTO_HEADERS.settings, BENTO_SAMPLE_SETTINGS);
}

function seedSheetIfEmpty_(sheetName, headers, rows) {
  var sheet = getOrCreateSheet_(sheetName);
  ensureHeaderRow_(sheet, headers);
  if (sheet.getLastRow() > 1) return;
  if (!rows || rows.length === 0) return;
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function readObjects_(sheetName, headers) {
  var sheet = getOrCreateSheet_(sheetName);
  ensureHeaderRow_(sheet, headers);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var rows = [];
  values.forEach(function (rowValues, index) {
    var hasValue = rowValues.some(function (value) {
      return value !== '' && value != null;
    });
    if (!hasValue) return;

    var object = { _rowNumber: index + 2 };
    headers.forEach(function (header, columnIndex) {
      object[header] = rowValues[columnIndex];
    });
    rows.push(object);
  });
  return rows;
}

function appendObjects_(sheetName, headers, objects) {
  if (!objects || objects.length === 0) return;
  var sheet = getOrCreateSheet_(sheetName);
  ensureHeaderRow_(sheet, headers);
  var values = objects.map(function (object) {
    return headers.map(function (header) {
      return object[header] == null ? '' : object[header];
    });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
}

function overwriteSheet_(sheetName, headers, rows) {
  var sheet = getOrCreateSheet_(sheetName);
  sheet.clearContents();
  ensureHeaderRow_(sheet, headers);
  if (!rows || rows.length === 0) return;
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function getSettingsMap_() {
  var rows = readObjects_(BENTO_SHEET_NAMES.settings, BENTO_HEADERS.settings);
  var settings = {};
  rows.forEach(function (row) {
    var key = sanitizeText(row['設定名']);
    if (key) settings[key] = row['値'];
  });
  return settings;
}

function getSettingValue_(key, defaultValue) {
  var settings = getSettingsMap_();
  return settings[key] == null || settings[key] === '' ? defaultValue : settings[key];
}

function getActiveMenusForApi_() {
  return getMenuRecords_(true).map(function (menu) {
    return {
      id: menu.id,
      name: menu.name,
      price: menu.price,
      description: menu.description,
      displayOrder: menu.displayOrder
    };
  });
}

function getMenuRecords_(activeOnly) {
  var rows = readObjects_(BENTO_SHEET_NAMES.menuMaster, BENTO_HEADERS.menuMaster);
  return rows
    .map(function (row) {
      return {
        id: sanitizeText(row['メニューID']),
        name: sanitizeText(row['メニュー名']),
        price: Number(row['単価']) || 0,
        description: sanitizeText(row['説明']),
        isOpen: toBoolean(row['受付中']),
        displayOrder: Number(row['表示順']) || 9999,
        note: sanitizeText(row['備考'])
      };
    })
    .filter(function (menu) {
      return menu.id && (!activeOnly || menu.isOpen);
    })
    .sort(function (a, b) {
      return a.displayOrder - b.displayOrder || a.id.localeCompare(b.id);
    });
}

function getActiveMenuMap_() {
  var map = {};
  getMenuRecords_(true).forEach(function (menu) {
    map[menu.id] = menu;
  });
  return map;
}

function getActiveDeliveryDatesForApi_() {
  return getDeliveryDateRecords_(true).map(function (record) {
    return {
      date: record.date,
      label: record.label,
      deadline: record.deadlineText,
      displayOrder: record.displayOrder
    };
  });
}

function getDeliveryDateRecords_(activeOnly) {
  var rows = readObjects_(BENTO_SHEET_NAMES.deliveryDates, BENTO_HEADERS.deliveryDates);
  return rows
    .map(function (row) {
      return {
        date: formatDate(row['受取日']),
        label: sanitizeText(row['表示名']),
        isOpen: toBoolean(row['受付中']),
        deadlineText: formatDateTime(row['締切日時']),
        deadlineDate: parseDateTime(row['締切日時']),
        displayOrder: Number(row['表示順']) || 9999,
        note: sanitizeText(row['備考'])
      };
    })
    .filter(function (record) {
      return record.date && (!activeOnly || record.isOpen);
    })
    .sort(function (a, b) {
      return a.displayOrder - b.displayOrder || a.date.localeCompare(b.date);
    });
}

function getDeliveryDateInfo_(deliveryDate, requireOpen) {
  var normalizedDate = formatDate(deliveryDate);
  var records = getDeliveryDateRecords_(false);
  var found = records.find(function (record) {
    return record.date === normalizedDate;
  });

  if (!found) {
    throw new Error('受取日がdelivery_datesに存在しません。');
  }

  if (requireOpen && !found.isOpen) {
    throw new Error('指定された受取日は受付中ではありません。');
  }

  if (!found.deadlineDate) {
    throw new Error('締切日時が不正です。');
  }

  return found;
}

function isAfterDeadline_(deliveryInfo) {
  return new Date().getTime() > deliveryInfo.deadlineDate.getTime();
}

function getAdminRows_() {
  return readObjects_(BENTO_SHEET_NAMES.ordersAdmin, BENTO_HEADERS.ordersAdmin);
}

function appendAdminRows_(rowObjects) {
  appendObjects_(BENTO_SHEET_NAMES.ordersAdmin, BENTO_HEADERS.ordersAdmin, rowObjects);
}

function findAdminRowsByOrderId_(orderId) {
  var target = sanitizeText(orderId);
  return getAdminRows_().filter(function (row) {
    return sanitizeText(row['注文ID']) === target;
  });
}

function getExistingOrderIdSet_() {
  var set = {};
  getAdminRows_().forEach(function (row) {
    var orderId = sanitizeText(row['注文ID']);
    if (orderId) set[orderId] = true;
  });
  return set;
}

function updateAdminRowsStatus_(rowNumbers, status, processType, note, memo) {
  if (!rowNumbers || rowNumbers.length === 0) return;
  var sheet = getOrCreateSheet_(BENTO_SHEET_NAMES.ordersAdmin);
  ensureHeaderRow_(sheet, BENTO_HEADERS.ordersAdmin);
  var updatedAt = nowString();
  var statusColumn = BENTO_HEADERS.ordersAdmin.indexOf('ステータス') + 1;
  var noteColumn = BENTO_HEADERS.ordersAdmin.indexOf('備考') + 1;
  var processColumn = BENTO_HEADERS.ordersAdmin.indexOf('処理種別') + 1;
  var updatedAtColumn = BENTO_HEADERS.ordersAdmin.indexOf('更新日時') + 1;
  var memoColumn = BENTO_HEADERS.ordersAdmin.indexOf('内部メモ') + 1;

  rowNumbers.forEach(function (rowNumber) {
    sheet.getRange(rowNumber, statusColumn).setValue(status);
    sheet.getRange(rowNumber, processColumn).setValue(processType);
    sheet.getRange(rowNumber, updatedAtColumn).setValue(updatedAt);
    if (note != null) sheet.getRange(rowNumber, noteColumn).setValue(note);
    if (memo != null) sheet.getRange(rowNumber, memoColumn).setValue(memo);
  });
}

function rebuildOrdersPublic() {
  var adminRows = getAdminRows_();
  var publicRows = adminRows.map(function (row) {
    return [
      sanitizeText(row['注文ID']),
      formatDateTime(row['受付日時']),
      formatDate(row['受取日']),
      sanitizeText(row['担当部署']),
      sanitizeText(row['注文担当者名']),
      sanitizeText(row['メニュー']),
      Number(row['個数']) || 0,
      statusLabel(sanitizeText(row['ステータス'])),
      sanitizeText(row['変更前注文ID']),
      formatDateTime(row['更新日時'])
    ];
  });

  overwriteSheet_(BENTO_SHEET_NAMES.ordersPublic, BENTO_HEADERS.ordersPublic, publicRows);
}

function getPublicOrdersForApi_() {
  var rows = readObjects_(BENTO_SHEET_NAMES.ordersPublic, BENTO_HEADERS.ordersPublic);
  return rows.map(function (row) {
    return {
      orderId: sanitizeText(row['注文ID']),
      acceptedAt: formatDateTime(row['受付日時']),
      deliveryDate: formatDate(row['受取日']),
      department: sanitizeText(row['担当部署']),
      applicantName: sanitizeText(row['注文担当者名']),
      menuName: sanitizeText(row['メニュー']),
      quantity: Number(row['個数']) || 0,
      status: sanitizeText(row['ステータス']),
      previousOrderId: sanitizeText(row['変更前注文ID']),
      updatedAt: formatDateTime(row['更新日時'])
    };
  });
}
