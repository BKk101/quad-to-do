const { app, BrowserWindow } = require('electron');
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
    },
  });

  if (isDev) {
    const devUrl = process.env.ELECTRON_START_URL || 'http://localhost:3000';
    win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // When packaged via react-cra preset, this file ends up in build/electron.js
    // so the HTML is in the same directory as this file.
    win.loadFile(path.join(__dirname, 'index.html'));
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
