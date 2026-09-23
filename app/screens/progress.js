// Unit tiles and the grid. Every number comes from logic/progress.js.
import { progressGrid } from '../logic/progress.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function render(root, ctx) {
  const { content, store } = ctx;
  const grid = progressGrid(content, store.readCards());

  root.append(el('h1', null, 'Progress'));

  const tiles = el('div', 'channel-row');
  for (const unit of grid.units) {
    const tile = el('div', 'card');
    tile.append(el('h2', null, unit.name));
    tile.append(el('p', null, unit.number.label));
    tiles.append(tile);
  }
  root.append(tiles);

  for (const unit of grid.units) {
    if (unit.rows.length === 0) continue;
    root.append(el('h2', null, `${unit.name} (${unit.number.label})`));
    const table = el('table', 'grid');
    // A screen reader needs the column header tied to each cell. The grid is
    // read one column at a time, so scope="col" carries the whole meaning.
    const thead = el('thead');
    const head = el('tr');
    const corner = el('th', null, 'Species');
    corner.scope = 'col';
    head.append(corner);
    for (const channel of grid.channels) {
      const cell = el('th', null, channel);
      cell.scope = 'col';
      head.append(cell);
    }
    thead.append(head);
    table.append(thead);
    const body = el('tbody');
    for (const row of unit.rows) {
      const line = el('tr');
      const nameCell = el('td');
      const link = el('a', null, row.common);
      link.href = `#/species/${row.symbol}`;
      nameCell.append(link);
      line.append(nameCell);
      for (const cell of row.cells) {
        const box = el('td', cell.has_card ? `cell lv-${cell.level}` : 'cell cell-empty',
          cell.has_card ? String(cell.level) : '');
        line.append(box);
      }
      body.append(line);
    }
    table.append(body);
    root.append(table);
  }
}
