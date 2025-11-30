import { contextBridge, ipcRenderer } from 'electron';

/**
 * BubbleLab preload script
 *
 * This script runs before the renderer process loads and provides
 * a secure bridge between the main process and the renderer.
 * It uses Electron's contextBridge to expose a constrained API.
 */

// Define the API to expose to the renderer
const electronAPI = {
  // App information
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),

  // Platform information
  platform: process.platform,
  isPackaged: process.env.NODE_ENV === 'production',

  // IPC communication (if needed in the future)
  send: (channel: string, data: unknown): void => {
    // Whitelist of allowed channels for security
    const validChannels = ['app-ready', 'request-backend-status'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },

  receive: (channel: string, callback: (...args: unknown[]) => void): void => {
    // Whitelist of allowed channels for security
    const validChannels = ['backend-status', 'app-update'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },

  // Remove listener
  removeListener: (
    channel: string,
    callback: (...args: unknown[]) => void
  ): void => {
    const validChannels = ['backend-status', 'app-update'];
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, callback);
    }
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type declaration for TypeScript
declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}
