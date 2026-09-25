// Session size, new cards per day, text size, export, import, reset, and the
// missing diagnostics. The one screen that opens with no content.
import { isCount } from '../logic/store.js';
import { displayName } from '../logic/words.js';
import { TEXT_SIZE_STEPS, applyTextSize } from '../ui/textsize.js';
import { el } from '../ui/dom.js';
import { footNav, tick, trail } from '../ui/chrome.js';

const SESSION_SIZES = [8, 12, 20, 30];
const NEW_PER_DAY = [3, 6, 10, 15];

// The steps the group offers, with the stored value added when a hand edit or
// an import has left a value outside them.
function stepsWith(steps, current) {
  return steps.includes(current) ? steps : [...steps, current].sort((a, b) => a - b);
}

function countGroup(root, ctx, options) {
  const group = el('div', 'setgroup');
  group.append(tick());
  group.append(el('h2', 'sec-h', options.title));
  group.append(el('p', 'sub2', options.note));

  const fieldset = el('fieldset', 'choices');
  fieldset.append(el('legend', 'sr', options.title));
  const current = ctx.store.readSettings()[options.field];
  for (const value of stepsWith(options.steps, current)) {
    const label = el('label', 'choice');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = options.field;
    input.value = String(value);
    input.checked = value === current;
    input.addEventListener('change', () => {
      if (!isCount(value)) return;
      ctx.store.writeSettings({ [options.field]: value });
      if (!ctx.store.available) ctx.banner(ctx.storage_banner);
    });
    label.append(input, el('span', null, String(value)));
    fieldset.append(label);
  }
  group.append(fieldset);
  root.append(group);
}

function textSizeGroup(root, ctx) {
  const group = el('div', 'setgroup');
  group.append(tick());
  group.append(el('h2', 'sec-h', 'Text size'));
  group.append(el('p', 'sub2',
    'Every word in Dendro follows this. The photographs and the leaf marks '
    + 'keep their own size.'));

  const fieldset = el('fieldset', 'tsteps');
  fieldset.append(el('legend', 'sr', 'Text size'));
  const current = ctx.store.readSettings().text_size;
  for (const step of TEXT_SIZE_STEPS) {
    const label = el('label', 'tstep');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'text_size';
    input.value = step.name;
    input.checked = step.name === current;
    input.addEventListener('change', () => {
      applyTextSize(step.name);
      ctx.store.writeSettings({ text_size: step.name });
      if (!ctx.store.available) ctx.banner(ctx.storage_banner);
    });
    // The sample words are sized in px: each one must show what its own step
    // does, whatever step is in force right now. The size itself sits in the
    // sheet, in one class per step size.
    const sample = el('span', `tsample px${step.sample_px}`, 'Quercus rubra');
    label.append(input, sample, el('span', 'tname', step.name));
    fieldset.append(label);
  }
  group.append(fieldset);
  root.append(group);
}

function cardsGroup(root, ctx, state) {
  const { store, today } = ctx;
  const group = el('div', 'setgroup');
  group.append(tick());
  group.append(el('h2', 'sec-h', 'Your cards'));

  // The count is read on every print, so a reset does not leave a stale one.
  const exportRow = el('div', 'setbtn');
  const exportButton = el('button', 'sbn', 'Export');
  exportButton.type = 'button';
  const noteText = () => {
    const cardCount = Object.keys(store.readCards()).length;
    return `${cardCount} ${cardCount === 1 ? 'card' : 'cards'}, last export `
      + `${store.readSettings().last_export ?? 'never'}`;
  };
  const exportNote = el('span', 'sbd', noteText());
  exportRow.append(exportButton, exportNote);
  exportButton.addEventListener('click', () => {
    const blob = store.exportBlob(today);
    const file = new Blob([blob.json], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = blob.filename;
    // Firefox needs the anchor in the document, and the URL must outlive the click.
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    store.markExported(today);
    if (!store.available) ctx.banner(ctx.storage_banner);
    exportNote.textContent = noteText();
  });
  group.append(exportRow);

  const importRow = el('label', 'setbtn');
  importRow.append(el('span', 'sbn', 'Import'));
  const importNote = el('span', 'sbd', 'read a file you exported');
  importRow.append(importNote);
  const fileField = document.createElement('input');
  fileField.type = 'file';
  fileField.id = 'import_file';
  fileField.accept = 'application/json';
  fileField.className = 'sr';
  fileField.addEventListener('change', async () => {
    const chosen = fileField.files?.[0];
    if (!chosen) return;
    // A file the browser cannot read rejects here. Say so, or the note would
    // keep the line it printed before.
    let text;
    try {
      text = await chosen.text();
    } catch {
      importNote.textContent = 'the file could not be read';
      return;
    }
    const result = store.importBlob(text);
    importNote.textContent = result.ok
      ? 'imported, reload to see it'
      : `rejected: ${result.errors.join(' ')}`;
    if (result.ok && !store.available) ctx.banner(ctx.storage_banner);
    if (result.ok) exportNote.textContent = noteText();
  });
  importRow.append(fileField);
  group.append(importRow);

  const resetRow = el('div', 'setbtn warn');
  const resetButton = el('button', 'sbn', 'Reset');
  resetButton.type = 'button';
  const resetNote = el('span', 'sbd', state.reset_done
    ? 'progress reset'
    : 'clears every level and date');
  resetRow.append(resetButton, resetNote);
  const confirmRow = el('div', 'setbtn warn');
  const confirmButton = el('button', 'sbn', 'Yes, delete everything');
  confirmButton.type = 'button';
  confirmRow.append(confirmButton, el('span', 'sbd', 'this cannot be undone'));
  confirmRow.hidden = true;
  resetButton.addEventListener('click', () => { confirmRow.hidden = false; });
  confirmButton.addEventListener('click', () => {
    store.reset();
    // Reset clears the settings as well, so every radio on the screen now
    // shows a value the store no longer holds, and the page still carries the
    // old root size. Take the root size from the store and print the screen
    // again from what is left there.
    const settings = store.readSettings();
    applyTextSize(settings.text_size);
    root.textContent = '';
    render(root, ctx, { reset_done: true });
  });
  group.append(resetRow, confirmRow);
  root.append(group);
}

function diagnosticsGroup(root, ctx) {
  const { store, content } = ctx;
  const group = el('div', 'setgroup');
  group.append(tick());
  group.append(el('h2', 'sec-h', 'Pairs with no note'));
  const edges = store.readMissingEdges();
  if (edges.length === 0) {
    group.append(el('p', 'fact-line',
      'Every pair you have confused carries a note.'));
    root.append(group);
    return;
  }
  const list = el('div', 'splist');
  for (const edge of edges) {
    // Settings opens when the content failed to load, so fall back to the symbol.
    const a = displayName(content?.species[edge.a]) || edge.a;
    const b = displayName(content?.species[edge.b]) || edge.b;
    const row = el('div', 'spx');
    row.append(el('span', 'sn', `${a} against ${b}`));
    row.append(el('span', 'due',
      `${edge.channel}, ${edge.count} ${edge.count === 1 ? 'time' : 'times'}`));
    list.append(row);
  }
  group.append(list);
  root.append(group);
}

// `state` carries what the screen knows about itself and the store does not.
// A confirmed reset prints the screen again, and `reset_done` keeps the note
// beside Reset on the new print.
export function render(root, ctx, state = {}) {
  const { store } = ctx;

  root.append(trail([{ text: 'Home', href: '#/' }, { text: 'Settings' }]));

  const head = el('div', 'pagehead');
  head.append(el('h1', 'display', 'Settings'));
  head.append(el('p', 'where2', 'Everything here is kept on this phone.'));
  root.append(head);

  if (!store.available) {
    root.append(el('p', 'note',
      'This browser blocks local storage. Changes here are not saved.'));
  }

  countGroup(root, ctx, {
    field: 'session_size',
    title: 'Session size',
    note: 'How many cards one session asks for.',
    steps: SESSION_SIZES
  });
  countGroup(root, ctx, {
    field: 'new_per_day',
    title: 'New cards per day',
    note: 'A cap on cards you have not met yet.',
    steps: NEW_PER_DAY
  });
  textSizeGroup(root, ctx);
  cardsGroup(root, ctx, state);
  diagnosticsGroup(root, ctx);

  root.append(footNav(null));
}
