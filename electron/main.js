const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs/promises');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_START_URL;

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#f7f2ea',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    const devUrl = process.env.ELECTRON_START_URL || 'http://localhost:3000';
    win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'build', 'index.html'));
  }
};

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

ipcMain.handle('file:save-json', async (event, payload) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  const defaultPath =
    payload?.defaultPath || `quad-to-do-export-${new Date().toISOString().slice(0, 10)}.json`;
  const result = await dialog.showSaveDialog(browserWindow ?? undefined, {
    defaultPath,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }
  await fs.writeFile(result.filePath, payload?.content ?? '', 'utf8');
  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle('file:open-json', async (event) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(browserWindow ?? undefined, {
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }
  const filePath = result.filePaths[0];
  const content = await fs.readFile(filePath, 'utf8');
  return { canceled: false, filePath, content };
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
