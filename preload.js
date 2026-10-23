'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * The renderer runs with contextIsolation on and no Node access; everything it
 * needs from the OS goes through this small, explicit surface.
 */
contextBridge.exposeInMainWorld('api', {
  // --- File system (always mediated by a main-process dialog or a known path)
  openDialog: () => ipcRenderer.invoke('dialog:open'),
  saveAs: (defaultName, content, kind) =>
    ipcRenderer.invoke('dialog:save-as', { defaultName, content, kind }),
  write: (path, content) => ipcRenderer.invoke('file:write', { path, content }),
  confirmDiscard: (name) => ipcRenderer.invoke('dialog:confirm-discard', { name }),

  // --- Window chrome
  setTitle: (title) => ipcRenderer.send('window:set-title', title),
  setEdited: (edited) => ipcRenderer.send('window:set-edited', edited),
  approveClose: () => ipcRenderer.send('app:close-approved'),
  cancelClose: () => ipcRenderer.send('app:close-cancelled'),
  openExternal: (url) => ipcRenderer.send('shell:open-external', url),

  // --- Settings
  updateSettings: (partial) => ipcRenderer.send('settings:update', partial),

  // --- Events from the main process
  on: (channel, handler) => {
    const allowed = new Set([
      'settings:init',
      'file:opened',
      'app:request-close',
      'menu:new',
      'menu:open',
      'menu:save',
      'menu:save-as',
      'menu:export-html',
      'menu:format',
      'menu:view',
      'menu:toggle-help',
      'menu:toggle-theme',
    ]);
    if (!allowed.has(channel)) return () => {};

    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },

  platform: process.platform,
});
