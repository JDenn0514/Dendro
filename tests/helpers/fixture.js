import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../../', import.meta.url);

function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, ROOT), 'utf8'));
}

export const FIXTURE_DIR = fileURLToPath(new URL('content_dev/', ROOT));

export function loadFixture() {
  return {
    species: readJson('content_dev/species.json'),
    concepts: readJson('content_dev/concepts.json'),
    confusion: readJson('content_dev/confusion.json'),
    units: readJson('content_dev/units.json'),
    manifest: readJson('content_dev/images/manifest.json')
  };
}
