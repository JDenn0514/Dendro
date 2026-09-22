// Writes a 1x1 placeholder JPEG to images/img/<hash>.jpg for every live manifest row.
// Usage: node scripts/make_placeholder_jpegs.js [content_dir]
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const MIN_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof' +
  'Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB' +
  'AAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

const contentDir = resolve(process.argv[2] ?? 'content_dev');
const manifestPath = join(contentDir, 'images', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const bytes = Buffer.from(MIN_JPEG_BASE64, 'base64');

let written = 0;
for (const record of manifest) {
  if (record.retired) continue;
  const target = join(contentDir, 'images', 'img', `${record.hash}.jpg`);
  if (existsSync(target)) continue;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  written += 1;
}
console.log(`wrote ${written} placeholder images under ${contentDir}`);
