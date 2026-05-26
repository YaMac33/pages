function doPost(e) {
  return handleOrderPost_(e);
}

function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const action = String(params.action || 'menus').trim();

    if (action === 'menus') {
      return createApiResponse_({
        ok: true,
        menus: getMenuGroups_()
      }, params);
    }

    if (action === 'orders') {
      return handlePublicOrdersGet_(e);
    }

    return createApiResponse_({
      ok: false,
      message: '不明なactionです。',
      action: action
    }, params);

  } catch (error) {
    return createApiResponse_({
      ok: false,
      message: error.message || 'エラーが発生しました。',
      stack: error.stack || ''
    }, e && e.parameter ? e.parameter : {});
  }
}

/**
 * JSON / JSONP レスポンスを返す
 *
 * 通常JSON:
 *   ?action=menus
 *
 * JSONP:
 *   ?action=menus&callback=BentoDebug
 */
function createApiResponse_(data, params) {
  const callback = params && params.callback
    ? String(params.callback).trim()
    : '';

  const json = JSON.stringify(data);

  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
