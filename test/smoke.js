'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

/**
 * Dev-only smoke + behaviour suite. Boots the real app, asserts the renderer
 * came up, exercises the formatting engine and help panel against the live
 * DOM, saves a screenshot, then quits.
 *
 *   MRKDWN_SMOKE=/tmp/shot.png npm start
 */
async function run(win, out) {
  let failures = 0;
  await new Promise((r) => setTimeout(r, 900));

  try {
    const report = await win.webContents.executeJavaScript(`(() => ({
      markdownit: typeof window.markdownit,
      helpData: Array.isArray(window.HELP_DATA) ? window.HELP_DATA.length : null,
      previewHtml: document.getElementById('preview').innerHTML.length,
      previewH1: document.querySelector('#preview h1')?.textContent ?? null,
      previewTable: !!document.querySelector('#preview table'),
      previewCheckboxes: document.querySelectorAll('#preview li.task-item input').length,
      helpCards: document.querySelectorAll('#help-body .card').length,
      helpTabs: document.querySelectorAll('#help-tabs button').length,
      helpOpen: document.getElementById('help-panel').classList.contains('open'),
      helpWidth: document.getElementById('help-panel').offsetWidth,
      theme: document.documentElement.dataset.theme ?? null,
      view: document.getElementById('workspace').dataset.view,
      words: document.getElementById('stat-words').textContent,
      editorScrolls: document.getElementById('editor').scrollHeight > document.getElementById('editor').clientHeight,
      errors: window.__errs ?? [],
    }))()`);
    console.log('SMOKE ' + JSON.stringify(report, null, 2));

    // Captured before the behaviour pass, which leaves the editor mid-test.
    const image = await win.webContents.capturePage();
    await fs.writeFile(out, image.toPNG());
    console.log('SMOKE screenshot -> ' + out);

    const behaviour = await win.webContents.executeJavaScript(`(() => {
      const ed = document.getElementById('editor');
      const results = [];
      const set = (v, a, b) => { ed.value = v; ed.focus(); ed.setSelectionRange(a, b ?? a); };
      const check = (name, got, want) => results.push({ name, ok: got === want, got, want });

      set('hello world', 6, 11); applyFormat('bold');
      check('bold selection', ed.value, 'hello **world**');

      set('hello **world**', 6, 15); applyFormat('bold');
      check('bold toggles off', ed.value, 'hello world');

      set('one\\ntwo', 0, 7); applyFormat('ul');
      check('bullets each line', ed.value, '- one\\n- two');

      set('one\\ntwo\\nthree', 0, 13); applyFormat('ol');
      check('numbered list', ed.value, '1. one\\n2. two\\n3. three');

      set('- one\\n- two', 0, 11); applyFormat('task');
      check('bullets to tasks', ed.value, '- [ ] one\\n- [ ] two');

      set('title', 0, 5); applyFormat('h2');
      check('heading', ed.value, '## title');
      applyFormat('h2');
      check('heading toggles off', ed.value, 'title');

      set('### deep', 0, 8); applyFormat('h1');
      check('heading replaces level', ed.value, '# deep');

      set('https://example.com', 0, 19); applyFormat('link');
      check('url becomes target', ed.value, '[](https://example.com)');
      check('caret inside label', ed.selectionStart, 1);

      set('Docs', 0, 4); applyFormat('link');
      check('text becomes label', ed.value, '[Docs](url)');
      check('url placeholder selected', ed.value.slice(ed.selectionStart, ed.selectionEnd), 'url');

      set('word', 0, 4); insertSnippet('~~$S$0~~');
      check('snippet wraps selection', ed.value, '~~word~~');

      set('text', 4, 4); insertSnippet('| a |\\n| - |\\n');
      check('block snippet breaks line', ed.value, 'text\\n| a |\\n| - |\\n');

      // Enter continues a list, and clears the marker on an empty item.
      const enter = () => ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      set('- one', 5, 5); enter();
      check('enter continues bullet', ed.value, '- one\\n- ');
      enter();
      check('enter on empty ends list', ed.value, '- one\\n');

      set('3. third', 8, 8); enter();
      check('enter increments number', ed.value, '3. third\\n4. ');

      set('  - [x] done', 12, 12); enter();
      check('enter continues task at indent', ed.value, '  - [x] done\\n  - [ ] ');

      set('> quote', 7, 7); enter();
      check('enter continues quote', ed.value, '> quote\\n> ');

      set('plain', 5, 5);
      const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      ed.dispatchEvent(tab);
      check('tab indents', ed.value, 'plain  ');

      set('# My Great Post\\n\\nbody', 0, 0);
      check('filename from heading', deriveFileName(), 'my-great-post.md');
      set('no heading here', 0, 0);
      check('filename fallback', deriveFileName(), 'Untitled.md');

      // Help panel: search narrows, Insert drops the snippet in.
      const search = document.getElementById('help-search');
      search.value = 'table'; search.dispatchEvent(new Event('input'));
      check('search narrows to name matches', document.querySelectorAll('#help-body .card').length, 2);
      search.value = 'tab'; search.dispatchEvent(new Event('input'));
      check('partial query still matches word start', document.querySelectorAll('#help-body .card').length, 2);
      search.value = '**'; search.dispatchEvent(new Event('input'));
      check('punctuation query works', document.querySelectorAll('#help-body .card').length > 0, true);
      search.value = 'zzzz'; search.dispatchEvent(new Event('input'));
      check('search can miss', document.querySelectorAll('#help-body .help-empty').length, 1);
      search.value = ''; search.dispatchEvent(new Event('input'));
      check('search resets', document.querySelectorAll('#help-body .card').length, 33);

      set('', 0, 0);
      document.querySelector('#help-body .card .insert-btn').click();
      check('insert button writes to editor', ed.value.startsWith('## '), true);

      // Tip text must stay in one flex item, not split per inline element.
      document.querySelector('#help-body .card .card-head').click();
      const tip = document.querySelector('#help-body .card.open .tip');
      check('tip is a single flex child', tip ? tip.children.length : -1, 1);

      return results;
    })()`);

    // Real disk round-trip through the same IPC the UI uses.
    const tmp = path.join(os.tmpdir(), 'mrkdwn-roundtrip.md');
    const body = '# Round trip\n\n- [x] saved to disk\n';

    const io = await win.webContents.executeJavaScript(`(async () => {
      const p = ${JSON.stringify(tmp)};
      const ed = document.getElementById('editor');
      ed.value = ${JSON.stringify(body)};
      await window.api.write(p, ed.value);
      docState.path = p;
      docState.saved = ed.value;
      const clean = isDirty();
      ed.value += 'edited';
      const dirty = isDirty();
      loadDocument(p, ${JSON.stringify(body)});
      return {
        cleanAfterSave: clean,
        dirtyAfterEdit: dirty,
        cleanAfterLoad: isDirty(),
        caretReset: ed.selectionStart,
        nameShown: document.getElementById('doc-name').textContent,
        exportHasDoctype: standaloneHtml('t', '<p>x</p>', false).startsWith('<!doctype html>'),
        exportEscapesTitle: standaloneHtml('a<b>', '', false).includes('a&lt;b&gt;'),
      };
    })()`);

    const onDisk = await fs.readFile(tmp, 'utf8');
    behaviour.push(
      { name: 'file written to disk verbatim', ok: onDisk === body, got: onDisk, want: body },
      { name: 'clean right after save', ok: io.cleanAfterSave === false, got: io.cleanAfterSave, want: false },
      { name: 'dirty after an edit', ok: io.dirtyAfterEdit === true, got: io.dirtyAfterEdit, want: true },
      { name: 'clean after opening a file', ok: io.cleanAfterLoad === false, got: io.cleanAfterLoad, want: false },
      { name: 'caret resets on open', ok: io.caretReset === 0, got: io.caretReset, want: 0 },
      { name: 'filename shown in titlebar', ok: io.nameShown === 'mrkdwn-roundtrip.md', got: io.nameShown, want: 'mrkdwn-roundtrip.md' },
      { name: 'export is a full html doc', ok: io.exportHasDoctype === true, got: io.exportHasDoctype, want: true },
      { name: 'export escapes the title', ok: io.exportEscapesTitle === true, got: io.exportEscapesTitle, want: true },
    );
    await fs.unlink(tmp).catch(() => {});

    const failed = behaviour.filter((r) => !r.ok);
    failures = failed.length;
    console.log(`SMOKE behaviour: ${behaviour.length - failed.length}/${behaviour.length} passed`);
    if (failed.length) console.log('FAILURES ' + JSON.stringify(failed, null, 2));
  } catch (err) {
    console.error('SMOKE failed: ' + err.message);
    failures = 1;
  }

  return failures;
}

module.exports = { run };
