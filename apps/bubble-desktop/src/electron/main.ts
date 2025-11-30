import { app, BrowserWindow, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, spawnSync, ChildProcess } from 'child_process';

// Backend server process
let backendProcess: ChildProcess | null = null;
const BACKEND_PORT = 3001;
const FRONTEND_PORT = 3000;

// Determine if we're running in development or production
const isDev = !app.isPackaged;

/**
 * Get the path to the frontend resources
 */
function getFrontendPath(): string {
  if (isDev) {
    // In development, point to the built frontend
    return path.join(__dirname, '..', '..', 'bubble-studio', 'dist');
  } else {
    // In production, use the packaged resources
    return path.join(process.resourcesPath, 'frontend');
  }
}

/**
 * Get the path to the backend resources
 */
function getBackendPath(): string {
  if (isDev) {
    return path.join(__dirname, '..', '..', 'bubblelab-api');
  } else {
    return path.join(process.resourcesPath, 'backend');
  }
}

/**
 * Start the backend server
 */
async function startBackend(): Promise<void> {
  const backendPath = getBackendPath();
  const entryPoint = path.join(backendPath, 'src', 'index.ts');

  // Check if bun is available
  const bunPath = findBunExecutable();

  if (!bunPath) {
    console.warn(
      'Bun runtime not found. Backend will not start automatically.'
    );
    console.warn(
      'Please install Bun (https://bun.sh) and run the backend separately.'
    );
    return;
  }

  // Set up environment variables for the backend
  const env = {
    ...process.env,
    PORT: String(BACKEND_PORT),
    BUBBLE_ENV: isDev ? 'dev' : 'prod',
    DATABASE_URL: `file:${path.join(app.getPath('userData'), 'bubblelab.db')}`,
  };

  console.log(`Starting backend with Bun at ${entryPoint}`);

  backendProcess = spawn(bunPath, ['run', entryPoint], {
    cwd: backendPath,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProcess.stdout?.on('data', (data) => {
    console.log(`[Backend] ${data.toString().trim()}`);
  });

  backendProcess.stderr?.on('data', (data) => {
    console.error(`[Backend Error] ${data.toString().trim()}`);
  });

  backendProcess.on('error', (err) => {
    console.error('Failed to start backend:', err);
  });

  backendProcess.on('exit', (code, signal) => {
    console.log(`Backend exited with code ${code}, signal ${signal}`);
    backendProcess = null;
  });

  // Wait for backend to be ready
  await waitForBackend();
}

/**
 * Find the Bun executable
 */
function findBunExecutable(): string | null {
  const bunPaths = [
    // Common installation paths
    process.env.BUN_INSTALL
      ? path.join(process.env.BUN_INSTALL, 'bin', 'bun')
      : null,
    path.join(
      process.env.HOME || process.env.USERPROFILE || '',
      '.bun',
      'bin',
      'bun'
    ),
    // Windows paths
    path.join(
      process.env.HOME || process.env.USERPROFILE || '',
      '.bun',
      'bin',
      'bun.exe'
    ),
    // System paths (will be resolved via PATH)
    'bun',
    'bun.exe',
  ].filter(Boolean) as string[];

  for (const bunPath of bunPaths) {
    try {
      // Check if it's an absolute path and exists
      if (path.isAbsolute(bunPath) && fs.existsSync(bunPath)) {
        return bunPath;
      }
      // For non-absolute paths, try to spawn to check if it's in PATH
      if (!path.isAbsolute(bunPath)) {
        const result = spawnSync(bunPath, ['--version'], {
          timeout: 5000,
          encoding: 'utf8',
        });
        if (result.status === 0) {
          return bunPath;
        }
      }
    } catch {
      // Continue to next path
    }
  }

  return null;
}

/**
 * Wait for the backend server to be ready
 */
async function waitForBackend(
  maxRetries = 30,
  retryDelay = 1000
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`http://localhost:${BACKEND_PORT}/`);
      if (response.ok) {
        console.log('Backend is ready!');
        return;
      }
    } catch {
      // Backend not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelay));
  }
  console.warn('Backend did not become ready within timeout');
}

/**
 * Stop the backend server
 */
function stopBackend(): void {
  if (backendProcess) {
    console.log('Stopping backend...');
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
}

/**
 * Create the main application window
 */
function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
    title: 'BubbleLab',
    show: false,
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDev) {
    // In development, try to connect to Vite dev server
    mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}`).catch(() => {
      // Fallback to built files if dev server is not running
      const frontendPath = getFrontendPath();
      mainWindow.loadFile(path.join(frontendPath, 'index.html'));
    });

    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built frontend
    const frontendPath = getFrontendPath();
    const indexPath = path.join(frontendPath, 'index.html');

    if (fs.existsSync(indexPath)) {
      mainWindow.loadFile(indexPath);
    } else {
      console.error('Frontend index.html not found at:', indexPath);
      mainWindow.loadURL('about:blank');
    }
  }

  return mainWindow;
}

// Register custom protocol for loading local files
app.whenReady().then(async () => {
  // Register protocol for loading local files securely
  protocol.registerFileProtocol('app', (request, callback) => {
    const url = request.url.replace('app://', '');
    const decodedUrl = decodeURIComponent(url);
    callback({ path: path.normalize(decodedUrl) });
  });

  // Start the backend server
  await startBackend();

  // Create the main window
  createWindow();

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up backend on quit
app.on('before-quit', () => {
  stopBackend();
});

app.on('quit', () => {
  stopBackend();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  stopBackend();
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
