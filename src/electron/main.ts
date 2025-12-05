import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { fork, ChildProcess } from 'child_process';
import { existsSync } from 'fs';

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

function resolveBackendPath(): string {
  if (!app.isPackaged) {
    return path.resolve(__dirname, '..', '..', 'dist', 'backend', 'server.js');
  }
  return path.join(process.resourcesPath, 'dist', 'backend', 'server.js');
}

function resolveRendererURL(): string {
  if (!app.isPackaged) {
    const port = process.env.ELECTRON_DEV_PORT || '3000';
    return `http://localhost:${port}`;
  }
  const indexPath = path.join(process.resourcesPath, 'dist', 'renderer', 'index.html');
  return `file://${indexPath}`;
}

function startBackend() {
  const backendPath = resolveBackendPath();
  if (!existsSync(backendPath)) {
    console.error('Backend entrypoint not found at:', backendPath);
    return;
  }

  backendProcess = fork(backendPath, [], {
    cwd: path.dirname(backendPath),
    env: {
      ...process.env,
      ELECTRON: 'true',
    },
    stdio: 'inherit',
  });

  backendProcess.on('error', (err) => {
    console.error('Backend process error:', err);
  });

  backendProcess.on('exit', (code, signal) => {
    console.log('Backend process exited', { code, signal });
    backendProcess = null;
  });
}

function stopBackend() {
  if (backendProcess && !backendProcess.killed) {
    try {
      backendProcess.kill();
    } catch (e) {
      console.warn('Failed to stop backend process', e);
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const url = resolveRendererURL();
  mainWindow.loadURL(url);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  try {
    startBackend();
  } catch (err) {
    console.error('Failed to start backend:', err);
  }
  createWindow();
});

app.on('before-quit', () => {
  stopBackend();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
