import { contextBridge, ipcRenderer } from 'electron';

// Allowlist of IPC channels
const ALLOWED_CHANNELS = [
  'backend-status',
  'backend-error',
  'window-control',
  'app-info',
];

contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel: string, data?: any) => {
    if (ALLOWED_CHANNELS.includes(channel)) {
      ipcRenderer.send(channel, data);
    } else {
      console.error(`IPC send blocked: channel "${channel}" not in allowlist`);
    }
  },
  on: (channel: string, callback: (...args: any[]) => void) => {
    if (ALLOWED_CHANNELS.includes(channel)) {
      const subscription = (_: any, ...args: any[]) => callback(...args);
      ipcRenderer.on(channel, subscription);
      
      // Return cleanup function to avoid listener leaks
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    } else {
      console.error(`IPC on blocked: channel "${channel}" not in allowlist`);
      return () => {}; // Return no-op cleanup
    }
  },
});
