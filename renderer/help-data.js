/**
 * Content for the visual help panel.
 *
 * Every item renders three things: the raw syntax, a live-rendered sample of
 * that exact syntax, and a short tip. `insert` is the snippet dropped into the
 * document — `$S` is replaced by the current selection, `$0` marks where the
 * caret lands afterwards.
 */
window.HELP_DATA = [
  {
    id: 'basics',
    label: 'Basics',
    items: [
      {
        name: 'Headings',
        syntax: '# Title\n## Section\n### Subsection',
        insert: '## $S$0',
        tip: 'Use one `#` per level, up to six. Always leave a space after the `#`, and only one `#` heading per document — it is the title.',
      },
      {
        name: 'Bold',
        syntax: 'This is **important** text.',
        insert: '**$S$0**',
        tip: 'Two asterisks on each side. `__double underscores__` work too, but asterisks are safer inside words.',
      },
      {
        name: 'Italic',
        syntax: 'This is *emphasised* text.',
        insert: '*$S$0*',
        tip: 'One asterisk each side. Use italic for emphasis and bold for importance — mixing them everywhere makes both invisible.',
      },
      {
        name: 'Bold + italic',
        syntax: 'This is ***really*** important.',
        insert: '***$S$0***',
        tip: 'Three asterisks. Reach for this rarely — it loses its punch fast.',
      },
      {
        name: 'Strikethrough',
        syntax: 'Ship on ~~Friday~~ Monday.',
        insert: '~~$S$0~~',
        tip: 'Two tildes each side. Great for showing a change of plan without deleting the history.',
      },
      {
        name: 'Paragraphs',
        syntax: 'First paragraph.\n\nSecond paragraph.',
        insert: '\n\n$0',
        tip: 'A **blank line** separates paragraphs. A single newline is ignored — this is the #1 thing that surprises people new to Markdown.',
      },
      {
        name: 'Line break',
        syntax: 'Roses are red  \nViolets are blue',
        insert: '  \n$0',
        tip: 'End a line with **two spaces** to break without starting a new paragraph. A trailing `\\` works in many editors too.',
      },
      {
        name: 'Escaping characters',
        syntax: 'Show a literal \\*asterisk\\* and \\_underscore\\_.',
        insert: '\\$0',
        tip: 'Put a backslash before any character you want Markdown to leave alone: ``\\ ` * _ { } [ ] ( ) # + - . !``',
      },
    ],
  },

  {
    id: 'lists',
    label: 'Lists',
    items: [
      {
        name: 'Bulleted list',
        syntax: '- First item\n- Second item\n- Third item',
        insert: '- $S$0',
        tip: 'Use `-`, `*` or `+` — but pick one and stay consistent. Leave a blank line before the list starts.',
      },
      {
        name: 'Numbered list',
        syntax: '1. First step\n2. Second step\n3. Third step',
        insert: '1. $S$0',
        tip: 'The numbers you type do not have to be right — `1.` on every line still renders 1, 2, 3. That makes reordering painless.',
      },
      {
        name: 'Nested list',
        syntax: '- Fruit\n  - Apple\n  - Pear\n- Vegetables\n  - Leek',
        insert: '- $S$0\n  - ',
        tip: 'Indent the child by **two spaces** (some parsers want four). Keep the indentation identical across siblings.',
      },
      {
        name: 'Task list',
        syntax: '- [x] Write the draft\n- [ ] Review it\n- [ ] Publish',
        insert: '- [ ] $S$0',
        tip: 'A GitHub-flavoured extension: `- [ ]` unchecked, `- [x]` checked. Perfect for a README roadmap or a personal to-do.',
      },
      {
        name: 'List with paragraphs',
        syntax: '1. First step\n\n   Extra detail for step one.\n\n2. Second step',
        insert: '1. $S$0\n\n   ',
        tip: 'Indent the continuation to line up with the text above it (3 spaces after `1. `), with a blank line in between.',
      },
    ],
  },

  {
    id: 'links',
    label: 'Links & Images',
    items: [
      {
        name: 'Link',
        syntax: 'Read the [documentation](https://example.com).',
        insert: '[$S$0](url)',
        tip: 'Square brackets for the text people see, round brackets for the URL. Write descriptive text — never "click here".',
      },
      {
        name: 'Link with tooltip',
        syntax: '[Docs](https://example.com "Full documentation")',
        insert: '[$S$0](url "title")',
        tip: 'A quoted string after the URL becomes the hover tooltip.',
      },
      {
        name: 'Automatic link',
        syntax: 'Visit <https://example.com> today.',
        insert: '<$S$0>',
        tip: 'Angle brackets turn a bare URL or email into a link without any label.',
      },
      {
        name: 'Reference link',
        syntax: 'See the [style guide][sg] and the [API][sg].\n\n[sg]: https://example.com/guide',
        insert: '[$S$0][ref]',
        tip: 'Define the URL once at the bottom and reuse the label. Keeps long URLs out of your sentences.',
      },
      {
        name: 'Image',
        syntax: '![A cat on a keyboard](https://placekitten.com/320/120)',
        insert: '![$S$0](path/to/image.png)',
        tip: 'Same as a link but with a leading `!`. The bracket text is the **alt text** — write it for people who cannot see the image.',
      },
      {
        name: 'Linked image',
        syntax: '[![Build passing](https://img.shields.io/badge/build-passing-brightgreen)](https://example.com)',
        insert: '[![$S$0](image-url)](link-url)',
        tip: 'Wrap an image in a link to make it clickable — this is how README badges are built.',
      },
    ],
  },

  {
    id: 'code',
    label: 'Code',
    items: [
      {
        name: 'Inline code',
        syntax: 'Run the `npm install` command first.',
        insert: '`$S$0`',
        tip: 'Single backticks. Use it for commands, filenames, and variable names — anything typed literally.',
      },
      {
        name: 'Code block',
        syntax: '```\nnpm install\nnpm start\n```',
        insert: '```\n$S$0\n```',
        tip: 'Three backticks on their own line, above and below. Everything inside is left exactly as written.',
      },
      {
        name: 'Highlighted code block',
        syntax: '```js\nconst greet = (name) => `Hi ${name}`;\n```',
        insert: '```js\n$S$0\n```',
        tip: 'Name the language right after the opening backticks (`js`, `python`, `bash`, `json`…) so renderers can colour it.',
      },
      {
        name: 'Code containing backticks',
        syntax: '````\nUse ```js to open a block.\n````',
        insert: '````\n$S$0\n````',
        tip: 'Use **more** backticks on the fence than appear inside. Four outside beats three inside.',
      },
    ],
  },

  {
    id: 'structure',
    label: 'Structure',
    items: [
      {
        name: 'Blockquote',
        syntax: '> Markdown is meant to be readable as-is.\n>\n> — John Gruber',
        insert: '> $S$0',
        tip: 'A `>` on every line. Use `>` on the blank line too to keep one quote from splitting into two.',
      },
      {
        name: 'Nested blockquote',
        syntax: '> Outer quote\n>\n> > Inner reply',
        insert: '> $S$0\n>\n> > ',
        tip: 'Add another `>` per level. Handy for quoting an email thread.',
      },
      {
        name: 'Horizontal rule',
        syntax: 'Above the line.\n\n---\n\nBelow the line.',
        insert: '\n---\n\n$0',
        tip: 'Three or more `-`, `*`, or `_` alone on a line. Keep a blank line above it, or the `---` turns the line before it into a heading.',
      },
      {
        name: 'Table',
        syntax: '| Name  | Role   |\n| ----- | ------ |\n| Ada   | Eng    |\n| Grace | Admiral|',
        insert: '| Column | Column |\n| ------ | ------ |\n| $S$0 |  |\n',
        tip: 'The second row of dashes is required — it separates the header. Your pipes do not need to line up, though it reads better if they do.',
      },
      {
        name: 'Table alignment',
        syntax: '| Left | Center | Right |\n| :--- | :----: | ----: |\n| a    | b      | c     |',
        insert: '| Left | Center | Right |\n| :--- | :----: | ----: |\n| $S$0 |  |  |\n',
        tip: 'Colons in the divider set the alignment: `:---` left, `:---:` centre, `---:` right.',
      },
    ],
  },

  {
    id: 'advanced',
    label: 'Advanced',
    items: [
      {
        name: 'Footnote',
        syntax: 'Markdown was created in 2004.[^1]\n\n[^1]: By John Gruber and Aaron Swartz.',
        insert: '$S$0[^1]\n\n[^1]: ',
        tip: 'Supported by many renderers (GitHub, Pandoc) but not all — check your destination before relying on it.',
      },
      {
        name: 'Inline HTML',
        syntax: 'Press <kbd>Cmd</kbd> + <kbd>S</kbd> to save.',
        insert: '<$S$0>',
        tip: 'Most renderers allow a safe subset of HTML for things Markdown lacks — `<kbd>`, `<sub>`, `<br>`, `<details>`.',
      },
      {
        name: 'Collapsible section',
        syntax: '<details>\n<summary>Show the details</summary>\n\nHidden until you click.\n\n</details>',
        insert: '<details>\n<summary>$S$0</summary>\n\n\n\n</details>',
        tip: 'Leave a blank line after `</summary>` or the Markdown inside will not be parsed.',
      },
      {
        name: 'Front matter',
        syntax: '---\ntitle: My Post\ndate: 2026-09-29\n---\n\nThe post begins here.',
        insert: '---\ntitle: $S$0\ndate: \n---\n\n',
        tip: 'A YAML block at the very top of the file. Static site generators read it as metadata; plain renderers show it as text.',
      },
      {
        name: 'Comment',
        syntax: '[//]: # (This note never renders.)\n\nVisible text.',
        insert: '[//]: # ($S$0)\n',
        tip: 'Markdown has no real comment syntax; this trick abuses an unused link reference. `<!-- html comments -->` also work in most renderers.',
      },
    ],
  },
];
