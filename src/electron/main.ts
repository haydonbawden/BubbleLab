import { app, BrowserWindow, dialog } from 'electron';
import * as path from 'path';
import { spawn, spawnSync, ChildProcess } from 'child_process';
import { existsSync } from 'fs';

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

const BACKEND_PORT = 3001;

function resolveBackendPath(): string {
  if (!app.isPackaged) {
    // Development: Use actual backend entrypoint with Bun runtime
    return path.resolve(__dirname, '..', '..', 'apps', 'bubblelab-api', 'src', 'index.ts');
  }
  // Production: Backend should be in resources
  return path.join(process.resourcesPath, 'backend', 'src', 'index.ts');
}

function resolveRendererURL(): string {
  if (!app.isPackaged) {
    const port = process.env.ELECTRON_DEV_PORT || '3000';
    return `http://localhost:${port}`;
  }
  // Production: Renderer should be in resources
  const indexPath = path.join(process.resourcesPath, 'renderer', 'index.html');
  return `file://${indexPath}`;
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
      if (path.isAbsolute(bunPath) && existsSync(bunPath)) {
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

async function startBackend(): Promise<void> {
  const backendPath = resolveBackendPath();
  
  if (!existsSync(backendPath)) {
    console.error('Backend entrypoint not found at:', backendPath);
    
    // Show user-facing dialog when backend is missing
    const result = await dialog.showMessageBox({
      type: 'error',
      title: 'Backend Not Found',
      message: 'Backend entrypoint is missing',
      detail: `Expected path: ${backendPath}\n\nPlease ensure the backend is built and available at the expected location. The application cannot function without the backend.`,
      buttons: ['Exit', 'Continue Anyway'],
      defaultId: 0,
      cancelId: 0,
    });
    
    if (result.response === 0) {
      app.quit();
      return;
    }
    
    console.warn('User chose to continue without backend');
    return;
  }

  // Check if bun is available
  const bunPath = findBunExecutable();

  if (!bunPath) {
    console.warn('Bun runtime not found. Backend will not start automatically.');
    
    await dialog.showMessageBox({
      type: 'warning',
      title: 'Bun Runtime Not Found',
      message: 'Bun runtime is required to run the backend',
      detail: 'Please install Bun from https://bun.sh and restart the application.',
      buttons: ['OK'],
    });
    
    return;
  }

  // Set up environment variables for the backend
  const env = {
    ...process.env,
    PORT: String(BACKEND_PORT),
    ELECTRON: 'true',
  };

  console.log(`Starting backend with Bun: ${bunPath} run ${backendPath}`);

  // Launch backend with Bun (not child_process.fork)
  backendProcess = spawn(bunPath, ['run', backendPath], {
    cwd: path.dirname(backendPath),
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
    console.error('Backend process error:', err);
  });

  backendProcess.on('exit', (code, signal) => {
    console.log(`Backend exited with code ${code}, signal ${signal}`);
    backendProcess = null;
  });

  // Wait for backend to be ready before proceeding
  await waitForBackend();
}

function stopBackend(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!backendProcess || backendProcess.killed) {
      resolve();
      return;
    }

    // Set a timeout to force kill if graceful shutdown fails
    const forceKillTimeout = setTimeout(() => {
      if (backendProcess && !backendProcess.killed) {
        console.warn('Force killing backend process after timeout');
        try {
          backendProcess.kill('SIGKILL');
        } catch (e) {
          console.error('Failed to force kill backend:', e);
        }
      }
      resolve();
    }, 5000); // 5 second timeout

    // Listen for process exit
    backendProcess.once('exit', () => {
      clearTimeout(forceKillTimeout);
      backendProcess = null;
      resolve();
    });

    // Attempt graceful shutdown
    try {
      backendProcess.kill('SIGTERM');
    } catch (e) {
      console.warn('Failed to send SIGTERM to backend:', e);
      clearTimeout(forceKillTimeout);
      resolve();
    }
  });
}

async function createWindow() {
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

app.on('ready', async () => {
  try {
    // Start backend and wait for it to be ready before creating window
    await startBackend();
  } catch (err) {
    console.error('Failed to start backend:', err);
  }
  
  // Create window after backend is ready (or failed to start)
  await createWindow();
});

app.on('before-quit', async () => {
  await stopBackend();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
