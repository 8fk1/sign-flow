const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const fs = require('fs');
const path = require('path');

// ユーザーデータ内の印影フォルダを初期化する
function initStampFolder() {
  const userStampDir = path.join(app.getPath('userData'), 'stamp');
  if (!fs.existsSync(userStampDir)) {
    fs.mkdirSync(userStampDir, { recursive: true });
    // デフォルトのスタンプ画像をコピー
    const defaultStampSrc = path.join(__dirname, 'static/img/stamp');
    if (fs.existsSync(defaultStampSrc)) {
      const files = fs.readdirSync(defaultStampSrc);
      files.forEach(file => {
        const srcPath = path.join(defaultStampSrc, file);
        if (!fs.statSync(srcPath).isFile()) return;
        fs.copyFileSync(srcPath, path.join(userStampDir, file));
      });
    }
  }
  return userStampDir;
}

// autoUpdater のログを electron-log に向ける
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = true;      // 更新があれば自動ダウンロード
autoUpdater.autoInstallOnAppQuit = false; // 終了時に自動インストールはしない（ユーザーに委ねる）

function setupAutoUpdater(mainWindow) {
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: '8fk1',
    repo: 'sign-flow',
  });

  autoUpdater.on('checking-for-update', () => {
    log.info('アップデートを確認中...');
    mainWindow.webContents.send('update-checking');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('アップデートあり:', info.version);
    mainWindow.webContents.send('update-available', info);
  });

  autoUpdater.on('update-not-available', () => {
    log.info('アップデートなし（最新版）');
    mainWindow.webContents.send('update-not-available');
  });

  autoUpdater.on('download-progress', (progressObj) => {
    mainWindow.webContents.send('update-download-progress', progressObj);
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('ダウンロード完了:', info.version);
    mainWindow.webContents.send('update-downloaded', info);
  });

  autoUpdater.on('error', (err) => {
    log.error('アップデートエラー:', err.message);
    mainWindow.webContents.send('update-error', err.message);
  });

  // 起動5秒後に自動チェック（UI安定後）
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => {
      log.warn('アップデート確認に失敗（サーバ未到達の可能性）:', err.message);
    });
  }, 5000);
}

// GPUのサンドボックスを無効化
app.commandLine.appendSwitch('disable-gpu-sandbox')

// F12キーでDevToolsを開く（デバッグ用）
ipcMain.on('open-devtools', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.webContents.openDevTools({ mode: 'detach' });
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog({
    title: '保存先フォルダを選択',
    properties: ['openDirectory'],
  });
  return result;
});

// ユーザーデータの印影フォルダパスを返す
ipcMain.handle('get-stamp-folder', async () => {
  return path.join(app.getPath('userData'), 'stamp');
});

ipcMain.handle('show-image-dialog', async (event) => {
  const result = await dialog.showOpenDialog({
    title: '印影画像を選択',
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif'] }
    ],
    properties: ['openFile'],
  });
  return result;
});

// アプリのバージョンを返す
ipcMain.handle('get-app-version', () => app.getVersion());

// アップデートを今すぐインストール（再起動）
ipcMain.on('install-update', () => {
  log.info('install-update を受信 → quitAndInstall を呼び出し');
  autoUpdater.quitAndInstall(true, true);
});

// GitHub Releases ページをブラウザで開く（macOS コード署名なし時のフォールバック）
ipcMain.on('open-releases-page', () => {
  shell.openExternal('https://github.com/8fk1/sign-flow/releases/latest');
});

// 手動でアップデートを確認する
ipcMain.on('check-for-update-manual', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  autoUpdater.checkForUpdates().catch(err => {
    win.webContents.send('update-error', err.message);
  });
});

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 650,
    title: 'SignFlow',
    icon: path.join(__dirname, 'static/img/icon/icon.png'),
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#1e1e23',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    setupAutoUpdater(mainWindow);
  });
};

app.once('ready', () => {
  initStampFolder();

  ipcMain.handle('open-dialog', async (_e, _arg) => {
    return dialog
      .showOpenDialog({
        properties: ['openFile'],
      })
      .then((result) => {
        if (result.canceled) return '';
        return result.filePaths[0];
      });
  });

  createWindow();
});

app.once('window-all-closed', () => app.quit());
