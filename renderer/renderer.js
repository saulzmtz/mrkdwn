'use strict';

/* ==========================================================================
   mrkdwn — renderer
   ========================================================================== */

const $ = (id) => document.getElementById(id);

const editor = $('editor');
const preview = $('preview');
const workspace = $('workspace');
const panes = $('panes');
const splitter = $('splitter');
const helpPanel = $('help-panel');
const helpBody = $('help-body');
const helpTabs = $('help-tabs');
const helpSearch = $('help-search');
const docName = $('doc-name');
const dirtyDot = $('dirty-dot');
const statusPath = $('status-path');
const toastEl = $('toast');

const WELCOME = `# Welcome to mrkdwn

A small, quiet place to **write** and *preview* Markdown.

## Getting started

- Type in the left pane, watch the right pane update
- Press <kbd>⌘</kbd><kbd>/</kbd> to open the **help panel** — every rule with a
  live example and an *Insert* button
- Press <kbd>⌘</kbd><kbd>1</kbd> / <kbd>⌘</kbd><kbd>2</kbd> / <kbd>⌘</kbd><kbd>3</kbd> to switch between editor, split and preview

## Things you can do

| Action        | Shortcut |
| ------------- | -------- |
| Bold          | ⌘B       |
| Italic        | ⌘I       |
| Link          | ⌘K       |
| Save          | ⌘S       |
| Export HTML   | ⌘E       |

> The editor continues lists and quotes for you. Start a line with a dash
> and a space, press Enter, and the next bullet is already there.

- [x] Open the app
- [ ] Open the help panel
- [ ] Write something good

Delete all of this with ⌘A and start fresh.
`;

// --------------------------------------------------------------------------
// Markdown rendering
// --------------------------------------------------------------------------

/**
 * `html: true` mirrors GitHub and VS Code, so `<kbd>`, `<details>` and friends
 * work as people expect. It is safe here because the renderer's CSP
 * (`default-src 'none'; script-src 'self'`) blocks any script a document
 * might carry, and remote subresources cannot load.
 */
const md = window.markdownit({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
}).use(taskListPlugin);

/** Renders `- [ ]` / `- [x]` list items as real (read-only) checkboxes. */
function taskListPlugin(mdInstance) {
  mdInstance.core.ruler.after('inline', 'task-lists', (state) => {
    const { tokens } = state;

    for (let i = 2; i < tokens.length; i++) {
      const inline = tokens[i];
      if (inline.type !== 'inline') continue;
      if (tokens[i - 1].type !== 'paragraph_open') continue;

      const itemOpen = tokens[i - 2];
      if (itemOpen.type !== 'list_item_open') continue;

      const match = /^\[([ xX])\]\s+/.exec(inline.content);
      if (!match) continue;

      const checked = match[1] !== ' ';
      inline.content = inline.content.slice(match[0].length);

      const children = inline.children || [];
      if (children.length && children[0].type === 'text') {
        children[0].content = children[0].content.replace(/^\[([ xX])\]\s+/, '');
      }

      const box = new state.Token('html_inline', '', 0);
      box.content = `<input type="checkbox" disabled${checked ? ' checked' : ''} />`;
      children.unshift(box);

      itemOpen.attrJoin('class', 'task-item');
    }
    return true;
  });
}

// --------------------------------------------------------------------------
// Document state
// --------------------------------------------------------------------------

const docState = {
  path: null,
  saved: WELCOME,
  view: 'split',
  theme: 'system',
  helpOpen: true,
};

const isDirty = () => editor.value !== docState.saved;

function baseName(p) {
  return p ? p.split(/[\\/]/).pop() : 'Untitled.md';
}

let lastChrome = '';

/** Keeps the titlebar and status bar in step; only talks to the main process
 *  when something actually changed, since this runs on every render. */
function refreshChrome() {
  const name = baseName(docState.path);
  const dirty = isDirty();
  const signature = `${docState.path}|${dirty}`;
  if (signature === lastChrome) return;
  lastChrome = signature;

  docName.textContent = name;
  dirtyDot.hidden = !dirty;
  statusPath.textContent = docState.path || 'No file — unsaved';
  statusPath.title = docState.path || '';

  document.title = `${dirty ? '• ' : ''}${name} — mrkdwn`;
  window.api.setTitle(`${name}${dirty ? ' — Edited' : ''}`);
  window.api.setEdited(dirty);
}

// --------------------------------------------------------------------------
// Render + stats
// --------------------------------------------------------------------------

let renderTimer = null;

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 60);
}

function render() {
  preview.innerHTML = md.render(editor.value);
  updateStats();
  refreshChrome();
}

function updateStats() {
  const text = editor.value;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  $('stat-words').textContent = `${words.toLocaleString()} ${words === 1 ? 'word' : 'words'}`;
  $('stat-chars').textContent = `${text.length.toLocaleString()} characters`;

  const lines = text.split('\n').length;
  $('stat-lines').textContent = `${lines.toLocaleString()} ${lines === 1 ? 'line' : 'lines'}`;

  $('stat-read').textContent = `${Math.max(1, Math.round(words / 220))} min read`;
}

editor.addEventListener('input', scheduleRender);

// --------------------------------------------------------------------------
// Text editing helpers
// --------------------------------------------------------------------------

/**
 * Replaces a range through `execCommand` so the textarea's native undo stack
 * (⌘Z) keeps working — there is no standards-track replacement for this yet.
 */
function replaceRange(start, end, text, selStart, selEnd) {
  editor.focus();
  editor.setSelectionRange(start, end);

  let ok = false;
  try {
    ok = document.execCommand('insertText', false, text);
  } catch {
    ok = false;
  }

  if (!ok) {
    const v = editor.value;
    editor.value = v.slice(0, start) + text + v.slice(end);
  }

  const caret = selStart === undefined ? start + text.length : selStart;
  editor.setSelectionRange(caret, selEnd === undefined ? caret : selEnd);
  scheduleRender();
}

/** Expands [start, end) to cover whole lines. */
function lineRange(start, end) {
  const v = editor.value;
  const from = v.lastIndexOf('\n', start - 1) + 1;
  let to = v.indexOf('\n', end);
  if (to === -1) to = v.length;
  return { from, to };
}

function wrapSelection(before, after, placeholder) {
  const { selectionStart: s, selectionEnd: e, value: v } = editor;
  const selected = v.slice(s, e);

  // Already wrapped? Toggle it off.
  if (selected.startsWith(before) && selected.endsWith(after) && selected.length >= before.length + after.length) {
    const inner = selected.slice(before.length, selected.length - after.length);
    replaceRange(s, e, inner, s, s + inner.length);
    return;
  }
  if (v.slice(s - before.length, s) === before && v.slice(e, e + after.length) === after) {
    replaceRange(s - before.length, e + after.length, selected, s - before.length, s - before.length + selected.length);
    return;
  }

  const body = selected || placeholder;
  const text = before + body + after;
  replaceRange(s, e, text, s + before.length, s + before.length + body.length);
}

/**
 * Applies a line prefix to every selected line, toggling it off when every
 * line already has it. `numbered` renumbers instead of repeating a marker.
 */
function prefixLines(prefix, { numbered = false, exclusive = null } = {}) {
  const { from, to } = lineRange(editor.selectionStart, editor.selectionEnd);
  const lines = editor.value.slice(from, to).split('\n');

  const has = (line) => (numbered ? /^\d+\.\s/.test(line) : line.startsWith(prefix));
  const allHave = lines.every((l) => l.trim() === '' || has(l));

  const out = lines.map((line, i) => {
    if (allHave) {
      return numbered ? line.replace(/^\d+\.\s/, '') : line.slice(has(line) ? prefix.length : 0);
    }
    // Drop a competing marker first (e.g. turning a bullet into a heading).
    const bare = exclusive ? line.replace(exclusive, '') : line;
    return (numbered ? `${i + 1}. ` : prefix) + bare;
  });

  const text = out.join('\n');
  replaceRange(from, to, text, from, from + text.length);
}

/** Inserts a snippet, substituting `$S` (selection) and `$0` (caret). */
function insertSnippet(template) {
  const { selectionStart: s, selectionEnd: e, value: v } = editor;
  const selected = v.slice(s, e);

  let text = template.split('$S').join(selected);
  const caretAt = text.indexOf('$0');
  text = text.split('$0').join('');

  // A multi-line snippet should not be jammed onto the end of a used line.
  let start = s;
  let lead = '';
  if (text.includes('\n')) {
    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
    if (v.slice(lineStart, s).trim() !== '') lead = '\n';
  }

  const full = lead + text;
  const caret = caretAt >= 0 ? start + lead.length + caretAt : start + full.length;
  replaceRange(start, e, full, caret);
}

const FORMATS = {
  bold: () => wrapSelection('**', '**', 'bold text'),
  italic: () => wrapSelection('*', '*', 'italic text'),
  strike: () => wrapSelection('~~', '~~', 'struck through'),
  code: () => wrapSelection('`', '`', 'code'),
  link: () => {
    const { selectionStart: s, selectionEnd: e, value: v } = editor;
    const sel = v.slice(s, e);
    // A selected URL becomes the target; anything else becomes the label.
    if (/^https?:\/\/\S+$/.test(sel)) {
      const text = `[](${sel})`;
      replaceRange(s, e, text, s + 1);
    } else {
      const label = sel || 'link text';
      const text = `[${label}](url)`;
      replaceRange(s, e, text, s + label.length + 3, s + label.length + 6);
    }
  },
  image: () => insertSnippet('![$S$0](path/to/image.png)'),
  h1: () => prefixLines('# ', { exclusive: /^#{1,6}\s+/ }),
  h2: () => prefixLines('## ', { exclusive: /^#{1,6}\s+/ }),
  h3: () => prefixLines('### ', { exclusive: /^#{1,6}\s+/ }),
  ul: () => prefixLines('- ', { exclusive: /^(\d+\.\s|- \[[ xX]\]\s|- )/ }),
  ol: () => prefixLines('', { numbered: true, exclusive: /^(- \[[ xX]\]\s|- )/ }),
  task: () => prefixLines('- [ ] ', { exclusive: /^(\d+\.\s|- )/ }),
  quote: () => prefixLines('> '),
  codeblock: () => insertSnippet('```\n$S$0\n```\n'),
  table: () => insertSnippet('| Column | Column |\n| ------ | ------ |\n| $0 |  |\n'),
  hr: () => insertSnippet('\n---\n\n$0'),
};

function applyFormat(name) {
  const fn = FORMATS[name];
  if (fn) fn();
}

document.querySelectorAll('[data-format]').forEach((btn) => {
  btn.addEventListener('click', () => applyFormat(btn.dataset.format));
});

// --------------------------------------------------------------------------
// Smart editing: list continuation, indentation
// --------------------------------------------------------------------------

editor.addEventListener('keydown', (event) => {
  // --- Enter: carry the current list / quote marker onto the next line
  if (event.key === 'Enter' && !event.shiftKey && editor.selectionStart === editor.selectionEnd) {
    const pos = editor.selectionStart;
    const v = editor.value;
    const lineStart = v.lastIndexOf('\n', pos - 1) + 1;
    const line = v.slice(lineStart, pos);

    const match = /^(\s*)(- \[[ xX]\] |[-*+] |(\d+)\. |> )/.exec(line);
    if (match) {
      const [whole, indent, token, num] = match;
      const rest = line.slice(whole.length);

      // Enter on an empty item ends the list instead of adding another.
      if (rest.trim() === '') {
        event.preventDefault();
        replaceRange(lineStart, pos, indent);
        return;
      }

      event.preventDefault();
      let next;
      if (num !== undefined) next = `${indent}${Number(num) + 1}. `;
      else if (token.startsWith('- [')) next = `${indent}- [ ] `;
      else next = indent + token;

      replaceRange(pos, pos, '\n' + next);
      return;
    }
  }

  // --- Tab / Shift+Tab: indent by two spaces, never leave the editor
  if (event.key === 'Tab') {
    event.preventDefault();
    const { selectionStart: s, selectionEnd: e } = editor;
    const multiline = editor.value.slice(s, e).includes('\n');

    if (!multiline && !event.shiftKey) {
      replaceRange(s, e, '  ');
      return;
    }

    const { from, to } = lineRange(s, e);
    const lines = editor.value.slice(from, to).split('\n');
    const out = lines.map((l) =>
      event.shiftKey ? l.replace(/^ {1,2}/, '') : (l.trim() === '' ? l : '  ' + l)
    );
    const text = out.join('\n');
    replaceRange(from, to, text, from, from + text.length);
    return;
  }

  // --- Escape closes the help panel
  if (event.key === 'Escape' && docState.helpOpen) {
    setHelpOpen(false);
  }
});

// --------------------------------------------------------------------------
// View mode, theme, help panel
// --------------------------------------------------------------------------

function setView(view) {
  docState.view = view;
  workspace.dataset.view = view;
  document.querySelectorAll('#view-toggle button').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  window.api.updateSettings({ view });
  if (view !== 'preview') editor.focus();
}

document.querySelectorAll('#view-toggle button').forEach((btn) => {
  btn.addEventListener('click', () => setView(btn.dataset.view));
});

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme() {
  const resolved = docState.theme === 'system' ? (darkQuery.matches ? 'dark' : 'light') : docState.theme;
  document.documentElement.dataset.theme = resolved;
  $('theme-btn').classList.toggle('active', docState.theme !== 'system');
  $('theme-btn').title = `Theme: ${docState.theme} (⌘⇧D)`;
}

darkQuery.addEventListener('change', () => {
  if (docState.theme === 'system') applyTheme();
});

function cycleTheme() {
  const order = ['system', 'light', 'dark'];
  docState.theme = order[(order.indexOf(docState.theme) + 1) % order.length];
  applyTheme();
  window.api.updateSettings({ theme: docState.theme });
  toast(`Theme: ${docState.theme}`);
}

$('theme-btn').addEventListener('click', cycleTheme);

function setHelpOpen(open) {
  docState.helpOpen = open;
  helpPanel.classList.toggle('open', open);
  $('help-btn').classList.toggle('active', open);
  window.api.updateSettings({ helpOpen: open });
  if (open) setTimeout(() => helpSearch.focus(), 180);
  else editor.focus();
}

$('help-btn').addEventListener('click', () => setHelpOpen(!docState.helpOpen));
$('help-close').addEventListener('click', () => setHelpOpen(false));

// --------------------------------------------------------------------------
// Splitter
// --------------------------------------------------------------------------

splitter.addEventListener('mousedown', (event) => {
  event.preventDefault();
  splitter.classList.add('dragging');
  document.body.style.cursor = 'col-resize';

  const rect = panes.getBoundingClientRect();

  const onMove = (e) => {
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    panes.style.setProperty('--split', `${Math.min(80, Math.max(20, pct))}%`);
  };

  const onUp = () => {
    splitter.classList.remove('dragging');
    document.body.style.cursor = '';
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
});

// --------------------------------------------------------------------------
// Scroll sync (split view only)
// --------------------------------------------------------------------------

let syncing = null;

function syncScroll(source, target) {
  if (docState.view !== 'split' || syncing === target) return;
  syncing = source;

  const srcMax = source.scrollHeight - source.clientHeight;
  const tgtMax = target.scrollHeight - target.clientHeight;
  if (srcMax > 0 && tgtMax > 0) {
    target.scrollTop = (source.scrollTop / srcMax) * tgtMax;
  }

  requestAnimationFrame(() => { syncing = null; });
}

const previewPane = $('preview-pane');

// The textarea scrolls internally, so it is the scroll source, not its pane.
editor.addEventListener('scroll', () => syncScroll(editor, previewPane));
previewPane.addEventListener('scroll', () => syncScroll(previewPane, editor));

// --------------------------------------------------------------------------
// Preview links
// --------------------------------------------------------------------------

preview.addEventListener('click', (event) => {
  const anchor = event.target.closest('a[href]');
  if (!anchor) return;
  event.preventDefault();
  window.api.openExternal(anchor.href);
});

// --------------------------------------------------------------------------
// Help panel content
// --------------------------------------------------------------------------

let activeCategory = 'all';

function buildTabs() {
  const categories = [{ id: 'all', label: 'All' }, ...window.HELP_DATA.map((c) => ({ id: c.id, label: c.label }))];

  helpTabs.innerHTML = '';
  categories.forEach((cat) => {
    const btn = document.createElement('button');
    btn.textContent = cat.label;
    btn.dataset.cat = cat.id;
    btn.classList.toggle('active', cat.id === activeCategory);
    btn.addEventListener('click', () => {
      activeCategory = cat.id;
      helpTabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.cat === cat.id));
      renderHelp();
    });
    helpTabs.appendChild(btn);
  });
}

/**
 * Matches at the start of a word rather than anywhere in the string, so typing
 * "tab" finds "Table" without also dragging in "Vegetables". Punctuation
 * queries like `**` still work because they follow a non-word character.
 */
function buildMatcher(query) {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}`, 'i');
}

function renderHelp() {
  const query = helpSearch.value.trim();
  const matcher = query ? buildMatcher(query) : null;
  helpBody.innerHTML = '';

  let shown = 0;

  window.HELP_DATA.forEach((category) => {
    if (activeCategory !== 'all' && activeCategory !== category.id) return;

    const matches = category.items.filter((item) => {
      if (!matcher) return true;
      return matcher.test(item.name) || matcher.test(item.syntax) || matcher.test(item.tip);
    });
    if (!matches.length) return;

    const heading = document.createElement('div');
    heading.className = 'help-group-title';
    heading.textContent = category.label;
    helpBody.appendChild(heading);

    matches.forEach((item) => {
      helpBody.appendChild(buildCard(item, Boolean(query)));
      shown += 1;
    });
  });

  if (!shown) {
    const empty = document.createElement('div');
    empty.className = 'help-empty';
    empty.textContent = query ? `Nothing matches “${helpSearch.value.trim()}”.` : 'Nothing here yet.';
    helpBody.appendChild(empty);
  }
}

function buildCard(item, expanded) {
  const card = document.createElement('div');
  card.className = 'card' + (expanded ? ' open' : '');

  // --- header
  const head = document.createElement('div');
  head.className = 'card-head';

  const name = document.createElement('span');
  name.className = 'card-name';
  name.textContent = item.name;

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const insert = document.createElement('button');
  insert.className = 'insert-btn';
  insert.textContent = 'Insert';
  insert.title = 'Insert this syntax at the cursor';
  insert.addEventListener('click', (event) => {
    event.stopPropagation();
    insertSnippet(item.insert);
    toast(`Inserted: ${item.name}`);
  });

  const chevron = document.createElement('span');
  chevron.className = 'chevron';
  chevron.textContent = '▶';

  actions.append(insert, chevron);
  head.append(name, actions);
  head.addEventListener('click', () => card.classList.toggle('open'));

  // --- body
  const body = document.createElement('div');
  body.className = 'card-body';

  const syntaxLabel = document.createElement('div');
  syntaxLabel.className = 'label';
  syntaxLabel.textContent = 'You write';

  const syntax = document.createElement('pre');
  syntax.className = 'syntax';
  syntax.textContent = item.syntax;

  const renderedLabel = document.createElement('div');
  renderedLabel.className = 'label';
  renderedLabel.textContent = 'You get';

  const rendered = document.createElement('div');
  rendered.className = 'rendered markdown-body';
  rendered.innerHTML = md.render(item.syntax);

  // The tip is a flex row (icon + text). The text goes in its own span so that
  // inline elements inside it stay in the text flow instead of each becoming
  // a separate flex item.
  const tip = document.createElement('div');
  tip.className = 'tip';
  const tipText = document.createElement('span');
  tipText.innerHTML = md.renderInline(item.tip);
  tip.appendChild(tipText);

  body.append(syntaxLabel, syntax, renderedLabel, rendered, tip);
  card.append(head, body);
  return card;
}

helpSearch.addEventListener('input', renderHelp);
helpSearch.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (helpSearch.value) {
      helpSearch.value = '';
      renderHelp();
    } else {
      setHelpOpen(false);
    }
  }
});

// Links inside the help panel open externally too.
helpBody.addEventListener('click', (event) => {
  const anchor = event.target.closest('a[href]');
  if (!anchor) return;
  event.preventDefault();
  window.api.openExternal(anchor.href);
});

// --------------------------------------------------------------------------
// Toast
// --------------------------------------------------------------------------

let toastTimer = null;

function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  requestAnimationFrame(() => toastEl.classList.add('show'));

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => { toastEl.hidden = true; }, 200);
  }, 1600);
}

// --------------------------------------------------------------------------
// File operations
// --------------------------------------------------------------------------

function loadDocument(path, content) {
  editor.value = content;
  docState.path = path;
  docState.saved = content;
  editor.setSelectionRange(0, 0);
  editor.scrollTop = 0;
  previewPane.scrollTop = 0;
  render();
}

/** Returns true when it is safe to throw away the current document. */
async function confirmDiscard() {
  if (!isDirty()) return true;

  const choice = await window.api.confirmDiscard(baseName(docState.path));
  if (choice === 'cancel') return false;
  if (choice === 'discard') return true;
  return save();
}

async function newFile() {
  if (!(await confirmDiscard())) return;
  loadDocument(null, '');
  editor.focus();
}

async function openFile() {
  if (!(await confirmDiscard())) return;
  try {
    const result = await window.api.openDialog();
    if (result) loadDocument(result.path, result.content);
  } catch (err) {
    toast(`Could not open file: ${err.message}`);
  }
}

async function save() {
  if (!docState.path) return saveAs();
  try {
    await window.api.write(docState.path, editor.value);
    docState.saved = editor.value;
    refreshChrome();
    toast(`Saved ${baseName(docState.path)}`);
    return true;
  } catch (err) {
    toast(`Could not save: ${err.message}`);
    return false;
  }
}

async function saveAs() {
  try {
    const suggested = docState.path || deriveFileName();
    const result = await window.api.saveAs(suggested, editor.value, 'md');
    if (!result) return false;

    docState.path = result.path;
    docState.saved = editor.value;
    refreshChrome();
    toast(`Saved ${baseName(result.path)}`);
    return true;
  } catch (err) {
    toast(`Could not save: ${err.message}`);
    return false;
  }
}

/** Names a new file after its first heading, falling back to Untitled.md. */
function deriveFileName() {
  const heading = /^#{1,6}\s+(.+)$/m.exec(editor.value);
  if (!heading) return 'Untitled.md';
  const slug = heading[1]
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return `${slug || 'untitled'}.md`;
}

async function exportHtml() {
  const title = baseName(docState.path).replace(/\.(md|markdown|mdown|mkd|txt)$/i, '');
  const dark = document.documentElement.dataset.theme === 'dark';
  const html = standaloneHtml(title, md.render(editor.value), dark);

  try {
    const result = await window.api.saveAs(`${title}.html`, html, 'html');
    if (result) toast(`Exported ${baseName(result.path)}`);
  } catch (err) {
    toast(`Could not export: ${err.message}`);
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function standaloneHtml(title, body, dark) {
  const bg = dark ? '#16171a' : '#ffffff';
  const fg = dark ? '#e8e9ec' : '#1a1c1f';
  const border = dark ? '#2a2c31' : '#e4e5e8';
  const codeBg = dark ? '#24262b' : '#f4f4f6';
  const muted = dark ? '#9aa0aa' : '#6b7280';
  const accent = dark ? '#5b8cff' : '#3b6ef5';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: ${dark ? 'dark' : 'light'}; }
  body {
    max-width: 52rem;
    margin: 0 auto;
    padding: 3rem 1.5rem 6rem;
    background: ${bg};
    color: ${fg};
    font: 16px/1.7 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  h1, h2, h3, h4, h5, h6 { line-height: 1.3; margin: 1.7em 0 .6em; font-weight: 650; letter-spacing: -.01em; }
  h1 { font-size: 2em; padding-bottom: .3em; border-bottom: 1px solid ${border}; }
  h2 { font-size: 1.5em; padding-bottom: .25em; border-bottom: 1px solid ${border}; }
  h5, h6 { color: ${muted}; }
  a { color: ${accent}; text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: .88em; background: ${codeBg}; padding: .16em .4em; border-radius: 4px; }
  pre { background: ${codeBg}; border: 1px solid ${border}; border-radius: 8px; padding: 1em; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 0 0 1em; padding: .1em 0 .1em 1em; border-left: 3px solid ${border}; color: ${muted}; }
  table { border-collapse: collapse; display: block; overflow-x: auto; }
  th, td { border: 1px solid ${border}; padding: .4em .75em; text-align: left; }
  th { background: ${codeBg}; }
  hr { border: 0; border-top: 1px solid ${border}; margin: 2em 0; }
  img { max-width: 100%; border-radius: 6px; }
  li.task-item { list-style: none; margin-left: -1.35em; }
  li.task-item input { margin-right: .5em; accent-color: ${accent}; }
  kbd { font-family: ui-monospace, Menlo, monospace; font-size: .85em; background: ${codeBg}; border: 1px solid ${border}; border-bottom-width: 2px; border-radius: 4px; padding: .1em .4em; }
</style>
</head>
<body>
${body}</body>
</html>
`;
}

// --------------------------------------------------------------------------
// Wiring to the main process
// --------------------------------------------------------------------------

window.api.on('settings:init', (settings) => {
  docState.theme = settings.theme || 'system';
  docState.helpOpen = settings.helpOpen !== false;

  applyTheme();
  setView(settings.view || 'split');
  setHelpOpen(docState.helpOpen);
});

window.api.on('file:opened', async ({ path, content }) => {
  if (!(await confirmDiscard())) return;
  loadDocument(path, content);
});

window.api.on('menu:new', newFile);
window.api.on('menu:open', openFile);
window.api.on('menu:save', save);
window.api.on('menu:save-as', saveAs);
window.api.on('menu:export-html', exportHtml);
window.api.on('menu:format', applyFormat);
window.api.on('menu:view', setView);
window.api.on('menu:toggle-help', () => setHelpOpen(!docState.helpOpen));
window.api.on('menu:toggle-theme', cycleTheme);

window.api.on('app:request-close', async () => {
  if (await confirmDiscard()) window.api.approveClose();
  else window.api.cancelClose();
});

// --------------------------------------------------------------------------
// Boot
// --------------------------------------------------------------------------

editor.value = WELCOME;
docState.saved = WELCOME;

buildTabs();
renderHelp();
render();

// Setting `value` leaves the caret at the end, which would scroll the view
// (and the synced preview) to the bottom the moment the editor takes focus.
editor.setSelectionRange(0, 0);
editor.scrollTop = 0;
editor.focus();

// Open the first card so the "You write / You get" idea is visible at a glance.
helpBody.querySelector('.card')?.classList.add('open');
