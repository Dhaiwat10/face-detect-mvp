"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Expose a safe, limited API to the renderer process (the HTML page).
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    indexFolder: () => electron_1.ipcRenderer.invoke('index-folder'),
    queryByImage: () => electron_1.ipcRenderer.invoke('query-by-image'),
    onUpdateGallery: (callback) => electron_1.ipcRenderer.on('update-gallery', (_event, value) => callback(value)),
    onUpdateResults: (callback) => electron_1.ipcRenderer.on('update-results', (_event, value) => callback(value)),
});
