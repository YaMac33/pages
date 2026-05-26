// ==============================
// 公開用シートのJSON取得
// ==============================

function handlePublicOrdersGet_(e) {
  try {
    const publicSs = getPublicSpreadsheet_();
    const publicSheet = publicSs.getSheetByName(PUBLIC_SHEET_NAME);

    if (!publicSheet) {
      throw new Error('公開用シートが見つかりません: ' + PUBLIC_SHEET_NAME);
    }

    const values = publicSheet.getDataRange().getValues();
    const headers = values.length > 0
      ? values[0].map(function(header) {
        return String(header || '').trim();
      })
      : [];

    const indexes = getPublicOrderColumnIndexes_(headers);
    const orders = [];

    values.slice(1).forEach(function(row) {
      const hasValue = row.some(function(cell) {
        return cell !== '' && cell !== null;
      });

      if (!hasValue) {
        return;
      }

      const unitPrice = toFiniteNumber_(row[indexes.unitPrice], 0);
      const quantity = toFiniteNumber_(row[indexes.quantity], 0);

      orders.push({
        timestamp: formatDateTime_(row[indexes.timestamp]),
        department: String(row[indexes.department] || '').trim(),
        menu: String(row[indexes.menu] || '').trim(),
        size: String(row[indexes.size] || '').trim(),
        price: unitPrice,
        unitPrice: unitPrice,
        quantity: quantity,
        subtotal: unitPrice * quantity
      });
    });

    return createJsonResponse_({
      ok: true,
      data: {
        orders: orders,
        updatedAt: formatDateTime_(new Date())
      }
    });

  } catch (error) {
    return createJsonResponse_({
      ok: false,
      message: error.message
    });
  }
}

function getPublicOrderColumnIndexes_(headers) {
  const requiredHeaders = [
    'タイムスタンプ',
    '部署',
    'メニュー',
    'サイズ',
    '単価',
    '数量'
  ];

  const indexes = {};

  requiredHeaders.forEach(function(header) {
    const index = headers.indexOf(header);

    if (index === -1) {
      throw new Error('公開用シートに列が見つかりません: ' + header);
    }

    if (header === 'タイムスタンプ') indexes.timestamp = index;
    if (header === '部署') indexes.department = index;
    if (header === 'メニュー') indexes.menu = index;
    if (header === 'サイズ') indexes.size = index;
    if (header === '単価') indexes.unitPrice = index;
    if (header === '数量') indexes.quantity = index;
  });

  return indexes;
}
