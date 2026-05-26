// ==============================
// masters.json 出力
// ==============================

function exportMastersJson() {
  const masters = {
    ok: true,
    menus: getMenuGroups_()
  };

  const jsonText = JSON.stringify(masters, null, 2);
  const fileName = 'masters.json';

  const existingFiles = DriveApp.getFilesByName(fileName);
  while (existingFiles.hasNext()) {
    const file = existingFiles.next();
    file.setTrashed(true);
  }

  const file = DriveApp.createFile(
    fileName,
    jsonText,
    MimeType.PLAIN_TEXT
  );

  Logger.log('masters.json を出力しました。');
  Logger.log(file.getUrl());
}
