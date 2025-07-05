import { contextBridge, ipcRenderer } from 'electron';

// Expose a safe, limited API to the renderer process (the HTML page).
contextBridge.exposeInMainWorld('electronAPI', {
  indexFolder: () => ipcRenderer.invoke('index-folder'),
  queryByImage: () => ipcRenderer.invoke('query-by-image'),
  onUpdateGallery: (callback: (html: string) => void) => ipcRenderer.on('update-gallery', (_event, value) => callback(value)),
  onUpdateResults: (callback: (html: string) => void) => ipcRenderer.on('update-results', (_event, value) => callback(value)),
}); 