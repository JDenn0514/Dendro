// Validates a content directory. Usage:
//   node scripts/validate_content.js content
//   node scripts/validate_content.js content_dev --local-images content_dev/images
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateContent } from '../app/logic/content.js';

const FILES = {
  species: 'species.json',
  concepts: 'concepts.json',
  confusion: 'confusion.json',
  units: 'units.json',
  manifest: 'images/manifest.json'
};

const USAGE = 'usage: node scripts/validate_content.js <content_dir> [--local-images <image_dir>]';

const args = process.argv.slice(2);
const arg = args[0];
if (!arg || arg.startsWith('--')) {
  console.error(USAGE);
  process.exit(1);
}
const flagAt = args.indexOf('--local-images');
if (flagAt !== -1 && !args[flagAt + 1]) {
  console.error(USAGE);
  process.exit(1);
}
const dir = resolve(arg);
const imageDir = flagAt === -1 ? null : resolve(args[flagAt + 1]);

const raw = {};
for (const [field, file] of Object.entries(FILES)) {
  const path = join(dir, file);
  try {
    raw[field] = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`cannot read ${path}: ${error.message}`);
    process.exit(1);
  }
}

const { errors, warnings } = validateContent(raw);

// The live images live in object storage, so the disk check runs only when the
// caller names a local image directory. A retired image is gone on purpose.
if (imageDir) {
  for (const record of raw.manifest) {
    if (record.retired) continue;
    if (existsSync(join(imageDir, 'img', `${record.hash}.jpg`))) continue;
    errors.push({
      file: 'images/manifest.json',
      message: `the image img/${record.hash}.jpg is not on disk`
    });
  }
}

for (const warning of warnings) console.log(`warning ${warning.file}: ${warning.message}`);
for (const error of errors) console.error(`error ${error.file}: ${error.message}`);

if (errors.length) {
  console.error(`${arg} has ${errors.length} error(s)`);
  process.exit(1);
}
console.log(`${arg} is valid, with ${warnings.length} warning(s)`);
