// Session size, new cards per day, export, import, reset, and the missing diagnostics.
import { isCount } from '../logic/store.js';

// The store enforces only the floor (1) on session_size and new_per_day. This
// is a UI hint on the number input's spinner, not an enforced ceiling: nothing
// stops a user from typing a larger value, and writeSettings stores it as-is.
// Both number fields (session_size and new_per_day) share this hint.
const NUMBER_FIELD_UNENFORCED_MAX_HINT = 100;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function render(root, ctx) {
  const { store, today, content } = ctx;
  const current = store.readSettings();

  root.append(el('h1', null, 'Settings'));

  if (!store.available) {
    root.append(el('p', 'notice',
      'This browser blocks local storage. Changes here are not saved.'));
  }

  // An empty field parses as 0, so the field is read back from the store after every change.
  function numberField(labelText, field) {
    const label = el('label', null, labelText);
    const input = document.createElement('input');
    input.type = 'number';
    input.id = field;
    input.min = '1';
    input.max = String(NUMBER_FIELD_UNENFORCED_MAX_HINT);
    input.value = String(current[field]);
    input.addEventListener('change', () => {
      const parsed = Number(input.value);
      if (isCount(parsed)) {
        const stored = store.writeSettings({ [field]: parsed });
        input.value = String(stored[field]);
        if (!store.available) ctx.banner(ctx.storage_banner);
      } else {
        input.value = String(store.readSettings()[field]);
      }
    });
    label.append(input);
    root.append(label);
  }

  numberField('Cards per session ', 'session_size');
  numberField('New cards per day ', 'new_per_day');

  root.append(el('h2', null, 'Export'));
  const exportLine = el('p', 'attribution',
    `Last export: ${current.last_export ?? 'never'}.`);
  const exportButton = el('button', 'primary', 'Export progress');
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
    exportLine.textContent = `Last export: ${store.readSettings().last_export ?? 'never'}.`;
  });
  root.append(exportButton);
  root.append(exportLine);

  root.append(el('h2', null, 'Import'));
  const importStatus = el('p', 'attribution', '');
  const fileField = document.createElement('input');
  fileField.type = 'file';
  fileField.id = 'import_file';
  fileField.accept = 'application/json';
  fileField.addEventListener('change', async () => {
    const chosen = fileField.files?.[0];
    if (!chosen) return;
    const result = store.importBlob(await chosen.text());
    if (result.ok) {
      importStatus.textContent = 'Import done. Reload the page to see the new progress.';
      if (!store.available) ctx.banner(ctx.storage_banner);
    } else {
      importStatus.textContent = `Import rejected: ${result.errors.join(' ')}`;
    }
  });
  root.append(fileField, importStatus);

  root.append(el('h2', null, 'Reset'));
  const resetStatus = el('p', 'attribution', '');
  const resetButton = el('button', null, 'Reset all progress');
  const confirmButton = el('button', 'primary', 'Yes, delete everything');
  confirmButton.hidden = true;
  resetButton.addEventListener('click', () => {
    confirmButton.hidden = false;
    resetStatus.textContent = 'This deletes every card state and the whole review log.';
  });
  confirmButton.addEventListener('click', () => {
    store.reset();
    confirmButton.hidden = true;
    resetStatus.textContent = 'Progress reset.';
  });
  root.append(resetButton, confirmButton, resetStatus);

  root.append(el('h2', null, 'Missing diagnostics'));
  const edges = store.readMissingEdges();
  if (edges.length === 0) {
    root.append(el('p', null, 'No missing confusion edges recorded.'));
  } else {
    const list = el('ul');
    for (const edge of edges) {
      // Settings opens when the content failed to load, so fall back to the symbol.
      const a = content?.species[edge.a]?.common[0] ?? edge.a;
      const b = content?.species[edge.b]?.common[0] ?? edge.b;
      list.append(el('li', null, `${a} against ${b} on ${edge.channel}, missed ${edge.count} time(s)`));
    }
    root.append(list);
  }
}
