'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, shell, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');

// The smoke test gets its own settings so it neither depends on nor
// overwrites the user's (a saved Preview view hides the editor it types into).
if (process.env.MRKDWN_SMOKE) {
  app.setPath('userData', path.join(os.tmpdir(), `mrkdwn-smoke-${process.pid}`));
}

const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');
const DEFAULT_SETTINGS = {
  bounds: { width: 1100, height: 760 },
  theme: 'system', // 'system' | 'light' | 'dark'
  view: 'split', // 'edit' | 'split' | 'preview'
  helpOpen: true,
};

let settings = { ...DEFAULT_SETTINGS };
let win = null;
/** File queued before the window is ready (macOS `open-file`, or argv). */
let pendingOpenPath = null;
/** Set while we are deliberately closing after the renderer approved it. */
let forceClose = false;
/**
 * True once a quit is in flight. Holding the window open to ask about unsaved
 * work cancels Electron's quit sequence, so we finish the quit ourselves.
 */
let quitRequested = false;

function loadSettings() {
  try {
    settings = { ...DEFAULT_SETTINGS, ...JSON.parse(fsSync.readFileSync(SETTINGS_FILE(), 'utf8')) };
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
}

/**
 * Written synchronously: `before-quit` does not await async listeners, so an
 * awaited write would never land before the process exits.
 */
function saveSettings() {
  try {
    fsSync.mkdirSync(app.getPath('userData'), { recursive: true });
    fsSync.writeFileSync(SETTINGS_FILE(), JSON.stringify(settings, null, 2), 'utf8');
  } catch {
    // Settings are a convenience; never let a write failure break quitting.
  }
}

function createWindow() {
  const { width, height, x, y } = settings.bounds;

  win = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 520,
    minHeight: 420,
    title: 'mrkdwn',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16171a' : '#ffffff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.once('ready-to-show', () => win.show());

  // Surface renderer errors in the terminal while developing.
  if (!app.isPackaged) {
    win.webContents.on('console-message', (_e, level, message, line, source) => {
      if (level >= 2) console.error(`[renderer] ${message} (${source}:${line})`);
    });
  }

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('settings:init', settings);
    if (pendingOpenPath) {
      openPathInWindow(pendingOpenPath);
      pendingOpenPath = null;
    }
    if (process.env.MRKDWN_SMOKE) {
      require('./test/smoke.js').run(win, process.env.MRKDWN_SMOKE).then((failures) => {
        forceClose = true;
        process.exitCode = failures ? 1 : 0;
        app.quit();
      });
    }
  });

  // Open external links in the real browser rather than inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  const persistBounds = () => {
    if (!win || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
    settings.bounds = win.getNormalBounds();
  };
  win.on('resize', persistBounds);
  win.on('move', persistBounds);

  // Give the renderer a chance to prompt about unsaved work.
  win.on('close', (event) => {
    if (forceClose) return;
    event.preventDefault();
    win.webContents.send('app:request-close');
  });

  win.on('closed', () => {
    win = null;
  });
}

async function openPathInWindow(filePath) {
  if (!win) {
    pendingOpenPath = filePath;
    return;
  }
  try {
    const content = await fs.readFile(filePath, 'utf8');
    win.webContents.send('file:opened', { path: filePath, content });
  } catch (err) {
    dialog.showErrorBox('Could not open file', `${filePath}\n\n${err.message}`);
  }
}

/** Ask the renderer to run a command (menu items and the renderer share one code path). */
function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        }]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => send('menu:new') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => send('menu:open') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('menu:save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('menu:save-as') },
        { type: 'separator' },
        { label: 'Export HTML…', accelerator: 'CmdOrCtrl+E', click: () => send('menu:export-html') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Format',
          submenu: [
            { label: 'Bold', accelerator: 'CmdOrCtrl+B', click: () => send('menu:format', 'bold') },
            { label: 'Italic', accelerator: 'CmdOrCtrl+I', click: () => send('menu:format', 'italic') },
            { label: 'Strikethrough', accelerator: 'CmdOrCtrl+Shift+X', click: () => send('menu:format', 'strike') },
            { label: 'Inline Code', accelerator: 'CmdOrCtrl+Shift+C', click: () => send('menu:format', 'code') },
            { label: 'Link', accelerator: 'CmdOrCtrl+K', click: () => send('menu:format', 'link') },
            { type: 'separator' },
            { label: 'Heading 1', accelerator: 'CmdOrCtrl+Alt+1', click: () => send('menu:format', 'h1') },
            { label: 'Heading 2', accelerator: 'CmdOrCtrl+Alt+2', click: () => send('menu:format', 'h2') },
            { label: 'Heading 3', accelerator: 'CmdOrCtrl+Alt+3', click: () => send('menu:format', 'h3') },
            { type: 'separator' },
            { label: 'Bulleted List', accelerator: 'CmdOrCtrl+Shift+8', click: () => send('menu:format', 'ul') },
            { label: 'Numbered List', accelerator: 'CmdOrCtrl+Shift+7', click: () => send('menu:format', 'ol') },
            { label: 'Task List', accelerator: 'CmdOrCtrl+Shift+9', click: () => send('menu:format', 'task') },
            { label: 'Quote', accelerator: "CmdOrCtrl+Shift+'", click: () => send('menu:format', 'quote') },
          ],
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Editor Only', accelerator: 'CmdOrCtrl+1', click: () => send('menu:view', 'edit') },
        { label: 'Split', accelerator: 'CmdOrCtrl+2', click: () => send('menu:view', 'split') },
        { label: 'Preview Only', accelerator: 'CmdOrCtrl+3', click: () => send('menu:view', 'preview') },
        { type: 'separator' },
        { label: 'Toggle Help Panel', accelerator: 'CmdOrCtrl+/', click: () => send('menu:toggle-help') },
        { label: 'Toggle Theme', accelerator: 'CmdOrCtrl+Shift+D', click: () => send('menu:toggle-theme') },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      role: 'window',
      submenu: isMac
        ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
        : [{ role: 'minimize' }, { role: 'close' }],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

ipcMain.handle('dialog:open', async () => {
  const result = await dialog.showOpenDialog(win, {
    title: 'Open Markdown File',
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return null;

  const filePath = result.filePaths[0];
  const content = await fs.readFile(filePath, 'utf8');
  return { path: filePath, content };
});

ipcMain.handle('dialog:save-as', async (_event, { defaultName, content, kind }) => {
  const isHtml = kind === 'html';
  const result = await dialog.showSaveDialog(win, {
    title: isHtml ? 'Export HTML' : 'Save Markdown File',
    defaultPath: defaultName,
    filters: isHtml
      ? [{ name: 'HTML', extensions: ['html'] }]
      : [{ name: 'Markdown', extensions: ['md'] }, { name: 'All Files', extensions: ['*'] }],
  });
  if (result.canceled || !result.filePath) return null;

  await fs.writeFile(result.filePath, content, 'utf8');
  return { path: result.filePath };
});

ipcMain.handle('file:write', async (_event, { path: filePath, content }) => {
  await fs.writeFile(filePath, content, 'utf8');
  return { path: filePath };
});

ipcMain.handle('dialog:confirm-discard', async (_event, { name }) => {
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    message: `Do you want to save the changes you made to ${name}?`,
    detail: "Your changes will be lost if you don't save them.",
  });
  return ['save', 'discard', 'cancel'][response];
});

ipcMain.on('app:close-approved', () => {
  forceClose = true;
  if (win && !win.isDestroyed()) win.close();
  if (quitRequested) app.quit();
});

// The user backed out of the prompt, so the pending quit is off.
ipcMain.on('app:close-cancelled', () => {
  quitRequested = false;
});

ipcMain.on('settings:update', (_event, partial) => {
  settings = { ...settings, ...partial };
});

ipcMain.on('window:set-title', (_event, title) => {
  if (win && !win.isDestroyed()) win.setTitle(title);
});

ipcMain.on('window:set-edited', (_event, edited) => {
  if (win && !win.isDestroyed() && process.platform === 'darwin') {
    win.setDocumentEdited(Boolean(edited));
  }
});

ipcMain.on('shell:open-external', (_event, url) => {
  if (/^https?:/.test(url)) shell.openExternal(url);
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

// macOS: double-clicking a .md file in Finder.
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (app.isReady()) openPathInWindow(filePath);
  else pendingOpenPath = filePath;
});

app.whenReady().then(async () => {
  loadSettings();

  // Windows/Linux: a file path passed on the command line.
  const argPath = process.argv.slice(app.isPackaged ? 1 : 2).find((a) => /\.(md|markdown|mdown|mkd|txt)$/i.test(a));
  if (argPath) pendingOpenPath = path.resolve(argPath);

  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  quitRequested = true;
  saveSettings();
});
