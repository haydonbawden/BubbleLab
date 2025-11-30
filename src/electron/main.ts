import { app, BrowserWindow } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as http from 'http';

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

const BACKEND_PORT = process.env.BACKEND_PORT || '3001';
const RENDERER_DEV_PORT = process.env.ELECTRON_DEV_PORT || '3000';
const BACKEND_HEALTH_CHECK_INTERVAL = 500; // ms
const BACKEND_HEALTH_CHECK_TIMEOUT = 30000; // ms

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
 * Check if the backend is healthy by making an HTTP request
 */
function checkBackendHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${BACKEND_PORT}/`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => {
      resolve(false);
    });
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Wait for the backend to be healthy
 */
function waitForBackend(): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkHealth = async () => {
      const isHealthy = await checkBackendHealth();
      if (isHealthy) {
        console.log('Backend is healthy and ready');
        resolve();
        return;
      }

      if (Date.now() - startTime > BACKEND_HEALTH_CHECK_TIMEOUT) {
        reject(new Error('Backend health check timeout'));
        return;
      }

      setTimeout(checkHealth, BACKEND_HEALTH_CHECK_INTERVAL);
    };

    checkHealth();
  });
}

/**
 * Start the backend server as a child process
 */
function startBackend(): void {
  const backendPath = getBackendPath();
  console.log(`Starting backend from: ${backendPath}`);

  try {
    // Use spawn instead of fork for better compatibility with different runtimes
    backendProcess = spawn('node', [backendPath], {
      env: {
        ...process.env,
        PORT: BACKEND_PORT,
        NODE_ENV: app.isPackaged ? 'production' : 'development',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
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
app.whenReady().then(async () => {
  startBackend();

  // Wait for the backend to be healthy before creating the window
  try {
    await waitForBackend();
    createWindow();
  } catch (error) {
    console.error('Failed to start backend:', error);
    // Create window anyway to show error state
    createWindow();
  }

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
