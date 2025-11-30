import { app, BrowserWindow } from 'electron';
import { fork, ChildProcess } from 'child_process';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

const BACKEND_PORT = process.env.BACKEND_PORT || '3001';
const RENDERER_DEV_PORT = process.env.ELECTRON_DEV_PORT || '3000';

/**
 * Get the path to the backend server entry point
 */
function getBackendPath(): string {
  if (app.isPackaged) {
    // In packaged mode, backend is in resources/app/dist/backend
    return path.join(
      process.resourcesPath,
      'app',
      'dist',
      'backend',
      'server.js'
    );
  } else {
    // In dev mode, backend is compiled to dist/backend
    return path.join(__dirname, '..', 'backend', 'server.js');
  }
}

/**
 * Start the backend server as a child process
 */
function startBackend(): void {
  const backendPath = getBackendPath();
  console.log(`Starting backend from: ${backendPath}`);

  try {
    backendProcess = fork(backendPath, [], {
      env: {
        ...process.env,
        PORT: BACKEND_PORT,
        NODE_ENV: app.isPackaged ? 'production' : 'development',
      },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    backendProcess.stdout?.on('data', (data: Buffer) => {
      console.log(`[Backend] ${data.toString().trim()}`);
    });

    backendProcess.stderr?.on('data', (data: Buffer) => {
      console.error(`[Backend Error] ${data.toString().trim()}`);
    });

    backendProcess.on('error', (err: Error) => {
      console.error('Failed to start backend process:', err);
    });

    backendProcess.on('exit', (code: number | null) => {
      console.log(`Backend process exited with code ${code}`);
      backendProcess = null;
    });

    console.log(`Backend started with PID: ${backendProcess.pid}`);
  } catch (error) {
    console.error('Error starting backend:', error);
  }
}

/**
 * Stop the backend process gracefully
 */
function stopBackend(): void {
  if (backendProcess) {
    console.log('Stopping backend process...');
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
}

/**
 * Get the URL to load in the renderer
 */
function getRendererURL(): string {
  if (app.isPackaged) {
    // In packaged mode, load the built renderer from resources
    return `file://${path.join(process.resourcesPath, 'app', 'dist', 'renderer', 'index.html')}`;
  } else {
    // In dev mode, load from Vite dev server
    return `http://localhost:${RENDERER_DEV_PORT}`;
  }
}

/**
 * Create the main application window
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'BubbleLab',
    icon: app.isPackaged
      ? path.join(
          process.resourcesPath,
          'app',
          'dist',
          'renderer',
          'favicon.ico'
        )
      : path.join(
          __dirname,
          '..',
          '..',
          'apps',
          'bubble-studio',
          'public',
          'favicon.ico'
        ),
  });

  const rendererURL = getRendererURL();
  console.log(`Loading renderer from: ${rendererURL}`);

  mainWindow.loadURL(rendererURL);

  // Open DevTools in development
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle events
app.whenReady().then(() => {
  startBackend();

  // Wait a bit for the backend to start before creating the window
  setTimeout(() => {
    createWindow();
  }, 2000);

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // On macOS, keep the app running until explicitly quit
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackend();
});

app.on('quit', () => {
  stopBackend();
});
