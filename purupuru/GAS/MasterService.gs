const MENUS_SHEET_NAME = 'menus';

const MENU_HEADERS = {
  menuName: 'メニュー',
  sizeName: '盛り方',
  price: '単価',
  visible: '表示',
  sortOrder: '並び順',
  groupSortOrder: 'グループ並び順'
};

/**
 * menusシートを読み取り、HTMLで扱いやすい形に整形して返す
 *
 * 返却イメージ:
 * [
 *   {
 *     menuName: '炙り焼豚弁当',
 *     groupSort: 1,
 *     options: [
 *       { size: '小盛', price: 918, sort: 1 },
 *       { size: '並盛', price: 1080, sort: 2 }
 *     ]
 *   }
 * ]
 */
function getMenuGroups_() {
  const sheet = getSheetByName_(MENUS_SHEET_NAME);
  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return [];
  }

  const headers = values[0].map(function (header) {
    return String(header || '').trim();
  });

  const indexes = getMenuHeaderIndexes_(headers);

  const groupMap = {};

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const menuName = sanitizeText_(row[indexes.menuName]);
    const sizeName = sanitizeText_(row[indexes.sizeName]);
    const price = toNumber_(row[indexes.price]);
    const visible = toBoolean_(row[indexes.visible]);
    const sortOrder = toNumber_(row[indexes.sortOrder]);
    const groupSortOrder = toNumber_(row[indexes.groupSortOrder]);

    if (!visible) continue;
    if (!menuName) continue;
    if (!sizeName) continue;

    if (!groupMap[menuName]) {
      groupMap[menuName] = {
        menuName: menuName,
        groupSort: groupSortOrder,
        options: []
      };
    }

    groupMap[menuName].groupSort = groupSortOrder;

    groupMap[menuName].options.push({
      size: sizeName,
      price: price,
      sort: sortOrder
    });
  }

  const groups = Object.keys(groupMap).map(function (menuName) {
    const group = groupMap[menuName];

    group.options.sort(function (a, b) {
      return a.sort - b.sort;
    });

    return group;
  });

  groups.sort(function (a, b) {
    return a.groupSort - b.groupSort;
  });

  return groups;
}

/**
 * menusシートのヘッダー位置を取得する
 */
function getMenuHeaderIndexes_(headers) {
  const indexes = {
    menuName: headers.indexOf(MENU_HEADERS.menuName),
    sizeName: headers.indexOf(MENU_HEADERS.sizeName),
    price: headers.indexOf(MENU_HEADERS.price),
    visible: headers.indexOf(MENU_HEADERS.visible),
    sortOrder: headers.indexOf(MENU_HEADERS.sortOrder),
    groupSortOrder: headers.indexOf(MENU_HEADERS.groupSortOrder)
  };

  const missingHeaders = [];

  Object.keys(indexes).forEach(function (key) {
    if (indexes[key] === -1) {
      missingHeaders.push(MENU_HEADERS[key]);
    }
  });

  if (missingHeaders.length > 0) {
    throw new Error(
      'menusシートに必要な列がありません: ' + missingHeaders.join(', ')
    );
  }

  return indexes;
}

/**
 * シート取得
 */
function getSheetByName_(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(sheetName + ' シートが見つかりません。');
  }

  return sheet;
}

/**
 * 文字列整形
 */
function sanitizeText_(value) {
  return String(value || '').trim();
}

/**
 * 数値変換
 */
function toNumber_(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const number = Number(value);

  if (isNaN(number)) {
    return 0;
  }

  return number;
}

/**
 * TRUE/FALSE変換
 */
function toBoolean_(value) {
  if (value === true) return true;
  if (value === false) return false;

  const text = String(value || '').trim().toUpperCase();

  return text === 'TRUE' || text === '1' || text === 'YES' || text === '表示';
}