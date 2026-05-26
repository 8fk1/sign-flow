const { app, BrowserWindow, ipcMain, dialog, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');

// GPUのサンドボックスを無効化
app.commandLine.appendSwitch('disable-gpu-sandbox')

ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog({
    title: '保存先フォルダを選択',
    properties: ['openDirectory'], // フォルダのみ選択
  });
  return result;
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

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1250,
    height: 900,
    title: 'Stamp',
    // frame: false,
    show: false, // 起動プロセスが完了するまで WebView を表示しない
    autoHideMenuBar: true,
    backgroundColor: '#1e1e23', // ウィンドウの背景色をあらかじめレンダラープロセスと合わせておく
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // preloadスクリプト
      nodeIntegration: true, // これを設定して、rendererプロセスでNode.js機能を使う
      contextIsolation: false, // 必要に応じて有効にする
    },
  });
  // nativeTheme.themeSource = 'dark';
  // mainWindow.webContents.openDevTools({mode: 'detach'});
  // mainWindow.webContents.openDevTools({mode: 'right'});

  mainWindow.loadFile('index.html');
  // レンダリングの準備が完了するのを待ってから WebView を表示する
  mainWindow.once('ready-to-show', () => mainWindow.show());
};

app.once('ready', () => {

  ipcMain.handle('open-dialog', async (_e, _arg) => {
    return dialog
      .showOpenDialog(mainWindow, {
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
