import fs from 'node:fs';
import path from 'node:path';

/** Reads a JSONL file. A missing file gives an empty array. Blank lines are skipped. */
export function readJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8');
  const rows: T[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    rows.push(JSON.parse(trimmed) as T);
  }
  return rows;
}

/** Appends rows. It creates the parent directory and the file when they are absent. */
export function appendJsonl(filePath: string, rows: unknown[]): void {
  if (rows.length === 0) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let text = '';
  // A file another tool wrote can lack the last newline. Add one so no two rows join.
  if (fs.existsSync(filePath)) {
    const current = fs.readFileSync(filePath, 'utf8');
    if (current !== '' && !current.endsWith('\n')) text += '\n';
  }
  text += serialize(rows);
  fs.appendFileSync(filePath, text, 'utf8');
}

/** Writes rows and replaces whatever the file held. */
export function writeJsonl(filePath: string, rows: unknown[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, serialize(rows), 'utf8');
}

function serialize(rows: unknown[]): string {
  return rows.map((row) => `${JSON.stringify(row)}\n`).join('');
}
