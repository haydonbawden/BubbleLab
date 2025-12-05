import { contextBridge } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isPackaged: true, // Will be updated at runtime
});

// Declare the types for TypeScript
declare global {
  interface Window {
    electronAPI: {
      platform: NodeJS.Platform;
      isPackaged: boolean;
    };
  }
}
