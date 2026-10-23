'use strict';

/* ==========================================================================
   mrkdwn — browser stand-in for preload.js

   In Electron the preload script has already defined `window.api` and this
   file does nothing. In a plain browser (the GitHub Pages build) it provides
   the same surface using web APIs, so renderer.js runs unchanged.
   ========================================================================== */

(() => {
  if (window.api) return;

  document.documentElement.classList.add('web');

  const SETTINGS_KEY = 'mrkdwn:settings';
  const DEFAULT_SETTINGS = { theme: 'system', view: 'split', helpOpen: true };

  const CHANNELS = new Set([
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

  // --------------------------------------------------------------------------
  // Event bus (stands in for ipcRenderer)
  // --------------------------------------------------------------------------

  const listeners = new Map();

  function emit(channel, payload) {
    (listeners.get(channel) || []).forEach((handler) => handler(payload));
  }

  // --------------------------------------------------------------------------
  // Settings — localStorage can be unavailable (private mode, blocked storage),
  // and settings are a convenience, so every access is allowed to fail.
  // --------------------------------------------------------------------------

  function loadSettings() {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  let settings = loadSettings();

  function updateSettings(partial) {
    settings = { ...settings, ...partial };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Ignore: the app works the same without persistence.
    }
  }

  // --------------------------------------------------------------------------
  // Files
  //
  // Chrome and Edge have the File System Access API, so Save writes back to
  // the file that was opened. Elsewhere, Open uses a file input and Save
  // downloads a copy.
  // --------------------------------------------------------------------------

  const canPick = typeof window.showOpenFilePicker === 'function';
  /** File handles by name, so `write(path)` can find the file it came from. */
  const handles = new Map();

  const MD_TYPES = [{
    description: 'Markdown',
    accept: { 'text/markdown': ['.md', '.markdown', '.mdown', '.mkd'], 'text/plain': ['.txt'] },
  }];
  const HTML_TYPES = [{ description: 'HTML', accept: { 'text/html': ['.html'] } }];

  const isAbort = (err) => err && err.name === 'AbortError';

  async function openDialog() {
    if (canPick) {
      try {
        const [handle] = await window.showOpenFilePicker({ types: MD_TYPES, multiple: false });
        const file = await handle.getFile();
        handles.set(file.name, handle);
        return { path: file.name, content: await file.text() };
      } catch (err) {
        if (isAbort(err)) return null;
        throw err;
      }
    }

    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.md,.markdown,.mdown,.mkd,.txt,text/markdown,text/plain';
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return resolve(null);
        file.text().then((content) => resolve({ path: file.name, content }), reject);
      });
      input.addEventListener('cancel', () => resolve(null));
      input.click();
    });
  }

  function download(name, content, kind) {
    const type = kind === 'html' ? 'text/html' : 'text/markdown';
    const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function writeHandle(handle, content) {
    const stream = await handle.createWritable();
    await stream.write(content);
    await stream.close();
  }

  async function saveAs(defaultName, content, kind) {
    if (canPick && typeof window.showSaveFilePicker === 'function') {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: defaultName,
          types: kind === 'html' ? HTML_TYPES : MD_TYPES,
        });
        await writeHandle(handle, content);
        if (kind !== 'html') handles.set(handle.name, handle);
        return { path: handle.name };
      } catch (err) {
        if (isAbort(err)) return null;
        throw err;
      }
    }

    download(defaultName, content, kind);
    return { path: defaultName };
  }

  async function write(path, content) {
    const handle = handles.get(path);
    if (handle) await writeHandle(handle, content);
    else download(path, content, 'md');
    return { path };
  }

  // A browser has no three-button dialog, so "Save" is not offered here; the
  // beforeunload prompt below still guards against closing the tab.
  async function confirmDiscard(name) {
    return window.confirm(`Discard unsaved changes to ${name}?`) ? 'discard' : 'cancel';
  }

  let edited = false;

  window.addEventListener('beforeunload', (event) => {
    if (!edited) return;
    event.preventDefault();
    event.returnValue = '';
  });

  // --------------------------------------------------------------------------
  // Keyboard shortcuts — the same accelerators as the menu in main.js.
  // Matched on `event.code` because Option changes `event.key` on macOS.
  // Some (⌘N, ⌘1–3) are reserved by browsers; the titlebar buttons cover those.
  // --------------------------------------------------------------------------

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  const SHORTCUTS = [
    // [code, shift, alt, channel, payload]
    ['KeyN', false, false, 'menu:new'],
    ['KeyO', false, false, 'menu:open'],
    ['KeyS', false, false, 'menu:save'],
    ['KeyS', true, false, 'menu:save-as'],
    ['KeyE', false, false, 'menu:export-html'],
    ['KeyB', false, false, 'menu:format', 'bold'],
    ['KeyI', false, false, 'menu:format', 'italic'],
    ['KeyX', true, false, 'menu:format', 'strike'],
    ['KeyC', true, false, 'menu:format', 'code'],
    ['KeyK', false, false, 'menu:format', 'link'],
    ['Digit1', false, true, 'menu:format', 'h1'],
    ['Digit2', false, true, 'menu:format', 'h2'],
    ['Digit3', false, true, 'menu:format', 'h3'],
    ['Digit8', true, false, 'menu:format', 'ul'],
    ['Digit7', true, false, 'menu:format', 'ol'],
    ['Digit9', true, false, 'menu:format', 'task'],
    ['Quote', true, false, 'menu:format', 'quote'],
    ['Digit1', false, false, 'menu:view', 'edit'],
    ['Digit2', false, false, 'menu:view', 'split'],
    ['Digit3', false, false, 'menu:view', 'preview'],
    ['Slash', false, false, 'menu:toggle-help'],
    ['KeyD', true, false, 'menu:toggle-theme'],
  ];

  window.addEventListener('keydown', (event) => {
    const mod = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
    if (!mod) return;

    const hit = SHORTCUTS.find(([code, shift, alt]) =>
      code === event.code && shift === event.shiftKey && alt === event.altKey);
    if (!hit) return;

    event.preventDefault();
    emit(hit[3], hit[4]);
  }, true);

  // --------------------------------------------------------------------------
  // The API
  // --------------------------------------------------------------------------

  window.api = {
    openDialog,
    saveAs,
    write,
    confirmDiscard,

    setTitle: () => {},
    setEdited: (value) => { edited = Boolean(value); },
    approveClose: () => {},
    cancelClose: () => {},
    openExternal: (url) => {
      if (/^https?:/.test(url)) window.open(url, '_blank', 'noopener');
    },

    updateSettings,

    on: (channel, handler) => {
      if (!CHANNELS.has(channel)) return () => {};
      if (!listeners.has(channel)) listeners.set(channel, new Set());
      listeners.get(channel).add(handler);
      return () => listeners.get(channel).delete(handler);
    },

    platform: 'web',
  };

  // renderer.js registers its listeners synchronously, so by the time the
  // document has loaded it is ready for the settings Electron would send.
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-menu]').forEach((btn) => {
      btn.addEventListener('click', () => emit(btn.dataset.menu));
    });
    emit('settings:init', settings);
  });
})();
