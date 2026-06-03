const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function removeXattrsRecursive(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      removeXattrsRecursive(fullPath);
    } else {
      try {
        // ファイルを一時パスにコピーして置き換えることで拡張属性を除去
        const tmp = fullPath + '.tmp_nobuild';
        fs.copyFileSync(fullPath, tmp);
        fs.renameSync(tmp, fullPath);
      } catch (_) {}
    }
  }
}

exports.default = async function (context) {
  if (process.platform !== 'darwin') return;
  const appPath = context.appOutDir;
  console.log('afterPack: removing extended attributes in', appPath);
  try {
    // xattr での削除を試みる
    execSync(`xattr -cr "${appPath}"`, { stdio: 'ignore' });
  } catch (_) {}
  // copyFile で置き換えることで com.apple.provenance などの保護属性も除去
  removeXattrsRecursive(appPath);
  console.log('afterPack: done');
};
