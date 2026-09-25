import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  POWO_SOURCE,
  parsePowoImages,
  powoAnchors,
  powoRow,
  type PowoAnchor,
} from '../lib/powo.ts';
import { powoRowsMain } from '../scripts/powo-rows.ts';
import { captureConsole } from './helpers.ts';

const HTML = fs.readFileSync(
  new URL('./fixtures/powo/platanus_x_hispanica_images.html', import.meta.url),
  'utf8',
);
const PAGE = 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:685854-1/images';
const HASH = '0123456789abcdef0123456789abcdef';
const CDN = 'https://d2seqvvyy3b8p2.cloudfront.net';

function anchor(caption: string, href = `//d2seqvvyy3b8p2.cloudfront.net/${HASH}.jpg`): PowoAnchor {
  return { href, caption };
}

test('powoAnchors reads the 23 gallery anchors and decodes each caption once', () => {
  const anchors = powoAnchors(HTML);
  assert.equal(anchors.length, 23);
  assert.equal(anchors[15].href, '//d2seqvvyy3b8p2.cloudfront.net/4abe7780b45861c2b02ab90e585c6fb2.jpg');
  assert.ok(
    anchors[15].caption.includes(
      '<br>ID:14124 © RBG Kew https://creativecommons.org/licenses/by/3.0/<small>',
    ),
  );
});

test('powoAnchors reads only section#all-images when the page holds it', () => {
  const html =
    '<div class="taxon-header"><a href="//x/aaaa.jpg" data-caption="header copy"></a></div>'
    + '<section id="all-images" class="taxon-section">'
    + '<a href="//x/bbbb.jpg" data-caption="A &amp; B"></a></section>';
  assert.deepEqual(powoAnchors(html), [{ href: '//x/bbbb.jpg', caption: 'A & B' }]);
});

test('parsePowoImages keeps the two CC BY photos of the London plane page', () => {
  const result = parsePowoImages(HTML, PAGE, 'PLHI');
  assert.deepEqual(result.skipped, {
    herbarium: 7,
    no_license: 14,
    license_not_allowed: 0,
    no_credit: 0,
    no_file: 0,
  });
  assert.deepEqual(result.rows, [
    {
      target: 'PLHI',
      origin: `${PAGE}#image=4abe7780b45861c2b02ab90e585c6fb2`,
      file_url: `${CDN}/4abe7780b45861c2b02ab90e585c6fb2.jpg`,
      author: "Dr Henry Oakeley's RCP Medicinal Plants",
      license: '© RBG Kew, CC BY 3.0',
      license_url: 'https://creativecommons.org/licenses/by/3.0/',
      source: POWO_SOURCE,
      source_species: 'Platanus × hispanica',
      channel_hint: null,
    },
    {
      target: 'PLHI',
      origin: `${PAGE}#image=ca062eef7e1a0148010da8f6d90eb0bd`,
      file_url: `${CDN}/ca062eef7e1a0148010da8f6d90eb0bd.jpg`,
      author: "Dr Henry Oakeley's RCP Medicinal Plants",
      license: '© RBG Kew, CC BY 3.0',
      license_url: 'https://creativecommons.org/licenses/by/3.0/',
      source: POWO_SOURCE,
      source_species: 'Platanus × acerifolia',
      channel_hint: null,
    },
  ]);
  assert.equal(POWO_SOURCE, 'Plants of the World Online (Kew)');
});

test('powoRow skips a caption with no ID as a herbarium sheet', () => {
  const sheet = anchor(
    'A specimen from Kew\'s Herbarium - <a href="https://specimens.kew.org/herbarium/K001527212">K001527212</a><small>Herbarium, RBG Kew</small>',
  );
  assert.equal(powoRow(sheet, PAGE, 'PLHI'), 'herbarium');
});

test('powoRow skips a display-only licence and an NC licence', () => {
  const display = anchor(
    'Platanus x hispanica - Park\n<br>ID:1279696 Not Kew Copyright. Only licensed for display purposes in POWO.<small>Igor Sheremetyev ©</small>',
  );
  assert.equal(powoRow(display, PAGE, 'PLHI'), 'no_license');
  const nc = anchor(
    'Platanus × hispanica - Park\n<br>ID:1 © A Person https://creativecommons.org/licenses/by-nc/3.0/<small>A Person</small>',
  );
  assert.equal(powoRow(nc, PAGE, 'PLHI'), 'license_not_allowed');
});

test('powoRow skips a photo with no credit or with no file hash', () => {
  const caption = 'Platanus × hispanica - Park\n<br>ID:1 © RBG Kew https://creativecommons.org/licenses/by/3.0/';
  assert.equal(powoRow(anchor(caption), PAGE, 'PLHI'), 'no_credit');
  assert.equal(
    powoRow(anchor(`${caption}<small>A Person</small>`, '//d2seqvvyy3b8p2.cloudfront.net/photo.jpg'), PAGE, 'PLHI'),
    'no_file',
  );
});

test('powoRow writes the label alone when the caption names no holder', () => {
  const row = powoRow(
    anchor('Platanus × hispanica - Leaves\n<br>ID:7 https://creativecommons.org/licenses/by-sa/4.0/<small>A Person</small>'),
    PAGE,
    'PLHI',
  );
  assert.ok(typeof row !== 'string');
  assert.equal(row.license, 'CC BY-SA 4.0');
  assert.equal(row.license_url, 'https://creativecommons.org/licenses/by-sa/4.0/');
  assert.equal(row.author, 'A Person');
  assert.equal(row.channel_hint, 'leaf');
  assert.equal(row.origin, `${PAGE}#image=${HASH}`);
  assert.equal(row.file_url, `${CDN}/${HASH}.jpg`);
});

test('parsePowoImages gives no rows for a page with no gallery', () => {
  const result = parsePowoImages('<html><body>No images</body></html>', PAGE, 'PLHI');
  assert.deepEqual(result.rows, []);
  assert.deepEqual(Object.values(result.skipped), [0, 0, 0, 0, 0]);
});

test('powo-rows.ts writes the rows file that mkadds.cjs reads', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dendro-powo-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const html = path.join(dir, 'PLHI-685854-1.html');
  const out = path.join(dir, 'PLHI-rows.json');
  fs.writeFileSync(html, HTML, 'utf8');
  const logs = captureConsole(t);

  const code = powoRowsMain(['--html', html, '--page-url', PAGE, '--target', 'PLHI', '--out', out]);

  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')), parsePowoImages(HTML, PAGE, 'PLHI').rows);
  assert.deepEqual(logs.out, [
    `2 rows written to ${out}; skipped: herbarium 7, no_license 14, license_not_allowed 0, no_credit 0, no_file 0`,
  ]);
});

test('powo-rows.ts names a missing flag and exits 1', (t) => {
  const logs = captureConsole(t);
  assert.equal(powoRowsMain(['--html', 'page.html']), 1);
  assert.equal(logs.err[0], 'powo-rows needs --page-url');
});
