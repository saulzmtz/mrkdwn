# mrkdwn

A minimal desktop Markdown editor with a visual help panel built in, so you
learn the syntax while you write rather than by tabbing out to a cheat sheet.

```bash
npm install
npm start
```

## Web version

The same editor runs in the browser at **https://saulzmtz.github.io/mrkdwn/**.
Every push to `main` redeploys it (`.github/workflows/pages.yml` publishes the
`renderer/` folder as-is; there is no build step).

`renderer/web-api.js` stands in for `preload.js` when there is no Electron, so
`renderer.js` is shared unchanged. Differences from the desktop app:

- **Chrome / Edge** — Open and Save work on real files; Save writes back to the file you opened.
- **Safari / Firefox** — Open uses a file picker; Save and Export download a copy.
- New / Open / Save / Export are buttons in the title bar, because browsers keep
  some shortcuts for themselves (<kbd>⌘</kbd><kbd>N</kbd>, and <kbd>⌘</kbd><kbd>1</kbd>–<kbd>3</kbd> switch tabs).
- Theme, view and help-panel state are remembered in the browser's local storage.
- Closing a tab with unsaved changes asks first.

To try it locally: `python3 -m http.server -d renderer` and open http://localhost:8000.

## The help panel

Press <kbd>⌘</kbd><kbd>/</kbd>. It is the reason this app exists.

Every entry shows the same three things:

- **You write** — the raw Markdown
- **You get** — that exact snippet, rendered live by the same parser as the preview
- **A tip** — the thing people usually get wrong (blank lines between paragraphs,
  the required dashes row in a table, why `1.` on every line still counts up)

Each entry has an **Insert** button that drops the syntax at your cursor, wrapping
whatever you had selected. 33 entries across six categories, with a search box
that matches from the start of a word, so `tab` finds *Table* without also
offering *Vege**table**s*.

## Editor

- Live split preview with synced scrolling, and a draggable divider
- Lists, task lists and quotes continue themselves on <kbd>Enter</kbd>; pressing
  <kbd>Enter</kbd> on an empty item ends the list
- <kbd>Tab</kbd> / <kbd>⇧</kbd><kbd>Tab</kbd> indent and outdent
- Formatting commands toggle: select `**bold**`, press <kbd>⌘</kbd><kbd>B</kbd>, and the asterisks come off
- <kbd>⌘</kbd><kbd>Z</kbd> works normally — every edit goes through the native undo stack
- Word, character and line counts with a reading-time estimate
- Light and dark themes, following the system by default
- Window size, theme, view mode and panel state persist between launches

## Shortcuts

| | |
| --- | --- |
| Help panel | <kbd>⌘</kbd><kbd>/</kbd> |
| Editor / Split / Preview | <kbd>⌘</kbd><kbd>1</kbd> · <kbd>⌘</kbd><kbd>2</kbd> · <kbd>⌘</kbd><kbd>3</kbd> |
| Bold · Italic · Strikethrough | <kbd>⌘</kbd><kbd>B</kbd> · <kbd>⌘</kbd><kbd>I</kbd> · <kbd>⌘</kbd><kbd>⇧</kbd><kbd>X</kbd> |
| Inline code · Link | <kbd>⌘</kbd><kbd>⇧</kbd><kbd>C</kbd> · <kbd>⌘</kbd><kbd>K</kbd> |
| Headings 1–3 | <kbd>⌘</kbd><kbd>⌥</kbd><kbd>1</kbd>–<kbd>3</kbd> |
| Bullet · Numbered · Task list | <kbd>⌘</kbd><kbd>⇧</kbd><kbd>8</kbd> · <kbd>⌘</kbd><kbd>⇧</kbd><kbd>7</kbd> · <kbd>⌘</kbd><kbd>⇧</kbd><kbd>9</kbd> |
| New · Open · Save · Save As | <kbd>⌘</kbd><kbd>N</kbd> · <kbd>⌘</kbd><kbd>O</kbd> · <kbd>⌘</kbd><kbd>S</kbd> · <kbd>⌘</kbd><kbd>⇧</kbd><kbd>S</kbd> |
| Export HTML | <kbd>⌘</kbd><kbd>E</kbd> |
| Toggle theme | <kbd>⌘</kbd><kbd>⇧</kbd><kbd>D</kbd> |

Export writes a self-contained HTML file with the styles inlined — no assets, no
dependencies, opens anywhere.

## Layout

```
main.js              Electron main process: window, menu, file dialogs, settings
preload.js           The only bridge to the OS — a small, explicit API surface
renderer/
  index.html         Markup
  styles.css         All styling; colours are CSS custom properties, themed once
  renderer.js        Editor, preview, formatting engine, help panel
  help-data.js       The help content — edit this to add your own entries
  web-api.js         Browser stand-in for preload.js (the GitHub Pages build)
  vendor/            markdown-it, copied from node_modules by `npm run vendor`
test/smoke.js        Boots the real app and asserts against the live DOM
```

### Adding a help entry

Add an object to the relevant category in `renderer/help-data.js`:

```js
{
  name: 'Highlight',
  syntax: 'This is ==highlighted==.',
  insert: '==$S$0==',
  tip: 'Not in CommonMark — check your renderer supports it.',
}
```

`$S` is replaced by the current selection and `$0` marks where the caret lands.
The rendered sample and the search index come from these fields automatically.

## Tests

```bash
npm test
```

Boots the app for real and runs 37 assertions against the live DOM — the
formatting commands, list continuation, help search and insertion, and a genuine
save-and-reopen round trip through the filesystem. It also writes a screenshot to
`/tmp/mrkdwn-smoke.png`, and exits non-zero on failure.

## Notes

- The renderer runs with `contextIsolation` on and no Node access; everything it
  needs from the OS goes through the narrow API in `preload.js`.
- The preview allows inline HTML, matching GitHub and VS Code, so `<kbd>` and
  `<details>` behave as expected. A Content-Security-Policy on the renderer
  blocks scripts and remote code, so a document cannot execute anything. Remote
  **images** over HTTPS are allowed, which means a document can fetch one when
  previewed — the usual trade-off for showing linked images at all.

## Packaging

`npm start` runs it as a normal desktop app. To get a double-clickable `.app`
without adding a dependency:

```bash
npx @electron/packager . mrkdwn --overwrite --out dist
```

## Possible next steps

- Syntax highlighting in the editor itself (needs CodeMirror and a build step —
  deliberately left out to keep this dependency-light)
- Clickable task checkboxes that write back to the source
- A recent-files list
