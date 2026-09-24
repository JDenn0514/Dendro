import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { candidateId, SOURCE_NAMES } from '../lib/candidates.ts';
import type { Http, TextResult, BytesResult, HttpFailure } from '../lib/http.ts';
import {
  PLANTS_API,
  PLANTS_FILES,
  PLANTS_PROFILE,
  CHECKLIST_URL,
  DISTRIBUTION_URL,
  PLANTS_LICENSE,
  PART_CODE_CHANNELS,
  stripItalics,
  splitScientific,
  parseProfile,
  isTree,
  isHybrid,
  parseSubordinateTaxa,
  parseDistribution,
  parseChecklist,
  acceptedSymbols,
  synonymNames,
  partCodeOf,
  parseImages,
  plantsCandidates,
  profileUrl,
  subordinateTaxaUrl,
  imagesUrl,
  fetchProfile,
  fetchSubordinateTaxa,
  fetchDistribution,
  fetchImages,
  fetchChecklist,
} from '../lib/plants.ts';

function fixture(name: string): string {
  return fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

function fixtureJson(name: string): unknown {
  return JSON.parse(fixture(name));
}

const QUGA_PROFILE = 'https://plants.usda.gov/plant-profile/QUGA';
const QUGA_ID = 70265;
const QUGA_SCIENTIFIC = 'Quercus gambelii';
const FETCHED_AT = '2026-09-22T15:04:00Z';
const OK = 200;
const NOT_FOUND = 404;
const SERVER_ERROR = 500;
const NO_STATUS = 0;
const FIRST_OFFSET = 0;
const PAGE_ONE_ROWS = 2;

interface Fake {
  http: Http;
  asked: string[];
}

/**
 * A fake HTTP client over a url-to-body map. A url the map does not hold answers
 * with `status` and records a failure row, which is what `http.ts` does for a url
 * it gives up on. The tests read `http.failures` to prove that the PLANTS helpers
 * add a row for a body that is not JSON and remove no row at all.
 */
function makeHttp(bodies: Record<string, string>, status: number = NOT_FOUND): Fake {
  const asked: string[] = [];
  const failures: HttpFailure[] = [];
  const answer = (url: string): TextResult => {
    asked.push(url);
    const body = bodies[url];
    if (body === undefined) {
      failures.push({ url, status, message: `status ${status}`, at: FETCHED_AT });
      return { ok: false, status, body: '', fromCache: false, error: `status ${status}` };
    }
    return { ok: true, status: OK, body, fromCache: false, error: null };
  };
  const http: Http = {
    failures,
    async getText(url: string): Promise<TextResult> {
      return answer(url);
    },
    async postJson(url: string): Promise<TextResult> {
      return answer(url);
    },
    async getBytes(): Promise<BytesResult> {
      return { ok: false, status: NO_STATUS, bytes: null, fromCache: false, error: 'not used' };
    },
  };
  return { http, asked };
}

test('the profile parser strips the tags and splits the author off', () => {
  assert.equal(
    stripItalics('<i>Quercus</i> <i>gambelii</i> Nutt.'),
    'Quercus gambelii Nutt.',
  );
  assert.deepEqual(splitScientific('Quercus gambelii Nutt.'), {
    scientific: QUGA_SCIENTIFIC,
    author: 'Nutt.',
  });
  assert.deepEqual(parseProfile(fixtureJson('plants_profile_quga.json')), {
    symbol: 'QUGA',
    plants_id: QUGA_ID,
    scientific: QUGA_SCIENTIFIC,
    author: 'Nutt.',
    common: 'Gambel oak',
    family: 'Fagaceae',
    genus: 'Quercus',
    rank: 'Species',
    growth_habits: ['Shrub', 'Tree'],
    native_status: 'native',
  });
});

test('a shrub-only habit is not a tree', () => {
  const sage = parseProfile(fixtureJson('plants_profile_purple_sage.json'));
  assert.deepEqual(sage.growth_habits, ['Shrub', 'Subshrub']);
  assert.equal(isTree(sage), false);
  assert.equal(isTree(parseProfile(fixtureJson('plants_profile_quga.json'))), true);
});

test('a profile with no family, no common name, and no name gives nulls, not empty strings', () => {
  const bare = parseProfile({ Id: QUGA_ID, Symbol: 'quga', Rank: 'Species' });
  assert.equal(bare.symbol, 'QUGA');
  assert.equal(bare.scientific, '');
  assert.equal(bare.common, null);
  assert.equal(bare.family, null);
  assert.equal(bare.genus, null);
  assert.equal(bare.native_status, null);
  assert.deepEqual(bare.growth_habits, []);
});

test('splitScientific takes the author out of the middle of an infraspecific name', () => {
  assert.deepEqual(splitScientific('Quercus gambelii Nutt. var. gambelii'), {
    scientific: 'Quercus gambelii var. gambelii',
    author: 'Nutt.',
  });
  assert.deepEqual(splitScientific('Quercus gambelii Nutt. var. bakeri (Kellogg) Cory'), {
    scientific: 'Quercus gambelii var. bakeri',
    author: 'Nutt. (Kellogg) Cory',
  });
  assert.deepEqual(splitScientific('Quercus gambelii var. gambelii Nutt.'), {
    scientific: 'Quercus gambelii var. gambelii',
    author: 'Nutt.',
  });
  assert.deepEqual(splitScientific('Quercus gambelii subsp. gambelii'), {
    scientific: 'Quercus gambelii subsp. gambelii',
    author: '',
  });
  assert.deepEqual(splitScientific(QUGA_SCIENTIFIC), {
    scientific: QUGA_SCIENTIFIC,
    author: '',
  });
  assert.deepEqual(splitScientific('Pinus ponderosa Douglas ex C. Lawson'), {
    scientific: 'Pinus ponderosa',
    author: 'Douglas ex C. Lawson',
  });
});

test('splitScientific keeps filius out of the species name but still reads a true forma', () => {
  assert.deepEqual(splitScientific('Magnolia campbellii Hook. f. & Thomson'), {
    scientific: 'Magnolia campbellii',
    author: 'Hook. f. & Thomson',
  });
  assert.deepEqual(splitScientific('Pinus jeffreyi Balf. f.'), {
    scientific: 'Pinus jeffreyi',
    author: 'Balf. f.',
  });
  assert.deepEqual(splitScientific('Quercus alba f. latiloba Sarg.'), {
    scientific: 'Quercus alba f. latiloba',
    author: 'Sarg.',
  });
});

// Task 19 read these rows out of the live plantlst.txt. Each one is a shape the
// file writes, with the author in the middle of the name.
test('splitScientific reads the rank of a real checklist row', () => {
  assert.deepEqual(splitScientific('Acer glabrum Torr. var. douglasii (Hook.) Dippel'), {
    scientific: 'Acer glabrum var. douglasii',
    author: 'Torr. (Hook.) Dippel',
  });
  assert.deepEqual(splitScientific('Acer tataricum L. ssp. ginnala (Maxim.) Wesmael'), {
    scientific: 'Acer tataricum ssp. ginnala',
    author: 'L. (Maxim.) Wesmael',
  });
  assert.deepEqual(
    splitScientific('Acer saccharum Marshall subsp. floridanum (Chapm.) Desmarais'),
    {
      scientific: 'Acer saccharum subsp. floridanum',
      author: 'Marshall (Chapm.) Desmarais',
    },
  );
  // `Michx. f.` is filius, and the `var.` after it carries the rank.
  assert.deepEqual(splitScientific('Acer nigrum Michx. f. var. floridanum (Chapm.) Fosberg'), {
    scientific: 'Acer nigrum var. floridanum',
    author: 'Michx. f. (Chapm.) Fosberg',
  });
  // A forma epithet follows an author here, so the word before the `f.` cannot
  // tell filius from forma, but the lowercase epithet after it can.
  assert.deepEqual(
    splitScientific('Abies grandis (Douglas ex D. Don) Lindl. f. johnsonii O.V. Matthews'),
    {
      scientific: 'Abies grandis f. johnsonii',
      author: '(Douglas ex D. Don) Lindl. O.V. Matthews',
    },
  );
  // `Hook. f. ex Hemsl.` is filius, although `ex` is a lowercase word.
  assert.deepEqual(splitScientific('Acleisanthes wrightii (A. Gray) Benth. & Hook. f. ex Hemsl.'), {
    scientific: 'Acleisanthes wrightii',
    author: '(A. Gray) Benth. & Hook. f. ex Hemsl.',
  });
  // The `f.` inside `(Wendl. f.)` is part of a word that ends in a bracket, so
  // it is never a marker.
  assert.deepEqual(
    splitScientific('Acacia decurrens (Wendl. f.) Willd. var. dealbata (Link) F. Muell.'),
    {
      scientific: 'Acacia decurrens var. dealbata',
      author: '(Wendl. f.) Willd. (Link) F. Muell.',
    },
  );
});

test('a multiplication sign or a lone x marks a hybrid', () => {
  assert.equal(isHybrid('Quercus ×undulata'), true);
  assert.equal(isHybrid('Quercus x undulata'), true);
  assert.equal(isHybrid('Quercus X undulata'), true);
  assert.equal(isHybrid(QUGA_SCIENTIFIC), false);
  assert.equal(isHybrid('Quercus texana'), false);
});

test('the distribution CSV yields unique, sorted US states and drops the other country', () => {
  // The live file writes a title line above the header, the country as
  // `United States`, and the state as its full name.
  assert.deepEqual(parseDistribution(fixture('plants_distribution_quga.csv')), [
    'AZ',
    'CO',
    'NM',
    'UT',
  ]);
  // The genus record carries Canadian provinces, which are not US states.
  assert.deepEqual(parseDistribution(fixture('plants_distribution_querc.csv')), ['CO']);
});

test('region L48 maps N to native and I to introduced, and no L48 row gives null', () => {
  const raw = fixtureJson('plants_profile_quga.json') as Record<string, unknown>;
  assert.equal(parseProfile(raw).native_status, 'native');
  const introduced = {
    ...raw,
    NativeStatuses: [{ Region: 'L48', NativeStatus: 'I' }],
  };
  assert.equal(parseProfile(introduced).native_status, 'introduced');
  const noL48 = {
    ...raw,
    NativeStatuses: [{ Region: 'PR', NativeStatus: 'N' }],
  };
  assert.equal(parseProfile(noL48).native_status, null);
  const waif = {
    ...raw,
    NativeStatuses: [{ Region: 'L48', NativeStatus: 'W' }],
  };
  assert.equal(parseProfile(waif).native_status, null);
});

test('parseSubordinateTaxa gives the key and the short rank label', () => {
  assert.deepEqual(parseSubordinateTaxa(fixtureJson('plants_subordinate_quga.json')), [
    { key: 'QUGAB2', name: 'var. bonina' },
    { key: 'QUGAG', name: 'var. gambelii' },
  ]);
  assert.deepEqual(
    parseSubordinateTaxa({
      TotalResults: 2,
      PlantResults: [
        {
          Symbol: 'QUGAS',
          ScientificName: '<i>Quercus</i> <i>gambelii</i> Nutt. subsp. <i>gambelii</i>',
        },
        { Symbol: 'QUGAX', ScientificName: '<i>Quercus</i> <i>gambelii</i> Nutt.' },
      ],
    }),
    [
      { key: 'QUGAS', name: 'subsp. gambelii' },
      { key: 'QUGAX', name: QUGA_SCIENTIFIC },
    ],
  );
});

test('the checklist parses, accepted symbols filter by genus, and synonyms resolve', () => {
  const rows = parseChecklist(fixture('plantlst_sample.txt'));
  assert.equal(rows.length, 8);
  assert.deepEqual(rows[0], {
    symbol: 'ACPL',
    synonym_symbol: '',
    scientific: 'Acer platanoides',
    common: 'Norway maple',
    family: 'Aceraceae',
  });
  assert.deepEqual(acceptedSymbols(rows, ['Quercus', 'Acer']), ['ACPL', 'QUGA', 'QUPA4']);
  // The live file writes the accepted symbol first and the synonym's own symbol
  // second, so a synonym row belongs to the symbol in its first column.
  assert.deepEqual(synonymNames(rows, 'QUGAG'), [
    'Quercus utahensis',
    'Quercus novomexicana',
  ]);
  assert.deepEqual(synonymNames(rows, 'QUGA'), []);
  assert.deepEqual(synonymNames(rows, 'ACPL'), ['Acer platanoides var. schwedleri']);
});

test('partCodeOf reads the code from a path and gives null when there is none', () => {
  assert.equal(partCodeOf('/ImageLibrary/original/quga_001_lvp.jpg'), 'lvp');
  assert.equal(partCodeOf('/ImageLibrary/original/qual_001_LHP.jpg'), 'lhp');
  assert.equal(partCodeOf('/ImageLibrary/original/quga_003_hbp.tif'), 'hbp');
  assert.equal(partCodeOf('/ImageLibrary/original/quga_001.jpg'), null);
  assert.equal(partCodeOf('/ImageLibrary/original/quga.jpg'), null);
  assert.equal(partCodeOf(''), null);
});

test('plantsCandidates drops the copyright row and fills the PLANTS fields', () => {
  const images = parseImages(fixtureJson('plants_images_quga.json'));
  assert.equal(images.length, 5);
  const rows = plantsCandidates(images, 'QUGA', 'QUGA', QUGA_SCIENTIFIC, FETCHED_AT);
  assert.equal(rows.length, 2);
  const firstPath = '/ImageLibrary/large/quga_005_lvp.jpg';
  const firstOrigin = `${QUGA_PROFILE}#image=${encodeURIComponent(firstPath)}`;
  assert.deepEqual(rows[0], {
    id: candidateId(firstOrigin, 'QUGA'),
    target: 'QUGA',
    source_key: 'plants',
    source: SOURCE_NAMES.plants,
    origin: firstOrigin,
    file_url: `${PLANTS_FILES}${firstPath}`,
    author: 'F. Lee Kirby',
    license: PLANTS_LICENSE,
    license_url: null,
    source_species: QUGA_SCIENTIFIC,
    // The file name carries the size and the orientation, not the part, so
    // every PLANTS row leaves the channel to the approval agent.
    channel_hint: null,
    tags_hint: [],
    local: null,
    file_hash: null,
    identity_match: null,
    fetched_at: FETCHED_AT,
    fetch_error: null,
  });
  assert.deepEqual(
    rows.map((row) => row.channel_hint),
    [null, null],
  );
  assert.equal(
    rows.some((row) => row.file_url.includes('quga_001')),
    false,
  );
  for (const row of rows) {
    assert.ok(row.origin.startsWith(`${QUGA_PROFILE}#image=`));
  }
  assert.deepEqual(
    rows.map((row) => row.origin.split('#image=')[1]),
    [encodeURIComponent(firstPath), encodeURIComponent('/ImageLibrary/large/quga_006_lhp.jpg')],
  );
  assert.equal(new Set(rows.map((row) => row.origin)).size, rows.length);
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);

  // D21: a concept run targets `<channel>/<key>`, and the origin still names the
  // species' own profile page, because that page carries the attribution.
  const concept = plantsCandidates(images, 'leaf/lobed', 'QUGA', QUGA_SCIENTIFIC, FETCHED_AT);
  assert.equal(concept.length, rows.length);
  for (const row of concept) {
    assert.equal(row.target, 'leaf/lobed');
    assert.ok(row.origin.startsWith(`${QUGA_PROFILE}#image=`));
  }
  assert.deepEqual(
    concept.map((row) => row.origin),
    rows.map((row) => row.origin),
    'one photo keeps one origin under every target',
  );
});

test('plantsCandidates drops an image that names no photographer', () => {
  const images = parseImages(fixtureJson('plants_images_quga.json'));
  const anonymous = images.filter((image) => image.photographer === '');
  assert.equal(anonymous.length, 1);
  assert.equal(anonymous[0].path, '/ImageLibrary/large/quga_007_lvp.jpg');
  assert.equal(anonymous[0].copyright, false);
  const rows = plantsCandidates(images, 'QUGA', 'QUGA', QUGA_SCIENTIFIC, FETCHED_AT);
  assert.equal(rows.length, 2);
  assert.equal(
    rows.some((row) => row.file_url.includes('quga_007')),
    false,
  );
  for (const row of rows) {
    assert.notEqual(row.author.trim(), '');
  }
});

test('the constants hold the PLANTS hosts, the license text, and the part code table', () => {
  assert.equal(PLANTS_API, 'https://plantsservices.sc.egov.usda.gov/api');
  assert.equal(PLANTS_FILES, 'https://plants.sc.egov.usda.gov');
  assert.equal(PLANTS_PROFILE, 'https://plants.usda.gov/plant-profile/');
  assert.equal(
    CHECKLIST_URL,
    'https://plants.sc.egov.usda.gov/DocumentLibrary/Txt/plantlst.txt',
  );
  assert.equal(PLANTS_LICENSE, 'public domain (US government work)');
  // Task 19 read the live file names: the three letters give the size, the
  // orientation, and photo or drawing. `quga_001_lvp` is bark and
  // `quga_004_lhp` is a leaf, so no code names a channel and the table is empty.
  assert.deepEqual(PART_CODE_CHANNELS, {});
  assert.equal(PART_CODE_CHANNELS.lvp, undefined);
  assert.equal(PART_CODE_CHANNELS.hbp, undefined);
});

test('the fetch helpers read the fake HTTP client and parse the body', async () => {
  const { http, asked } = makeHttp({
    [profileUrl('QUGA')]: fixture('plants_profile_quga.json'),
    [imagesUrl(QUGA_ID)]: fixture('plants_images_quga.json'),
    [DISTRIBUTION_URL]: fixture('plants_distribution_quga.csv'),
    [CHECKLIST_URL]: fixture('plantlst_sample.txt'),
  });

  const profile = await fetchProfile(http, 'QUGA', FETCHED_AT);
  assert.equal(profile?.plants_id, QUGA_ID);
  assert.deepEqual(await fetchDistribution(http, QUGA_ID, FETCHED_AT), ['AZ', 'CO', 'NM', 'UT']);
  assert.equal((await fetchImages(http, QUGA_ID, FETCHED_AT)).length, 5);
  assert.equal((await fetchChecklist(http, FETCHED_AT)).length, 8);
  assert.equal(await fetchProfile(http, 'NOPE', FETCHED_AT), null);
  assert.deepEqual(asked, [
    profileUrl('QUGA'),
    DISTRIBUTION_URL,
    imagesUrl(QUGA_ID),
    CHECKLIST_URL,
    profileUrl('NOPE'),
  ]);
  assert.deepEqual(
    http.failures.map((row) => row.url),
    [profileUrl('NOPE')],
  );
  assert.equal(
    subordinateTaxaUrl(QUGA_ID, FIRST_OFFSET),
    'https://plantsservices.sc.egov.usda.gov/api/PlantSubordinateTaxa/70265?offset=0',
  );
});

// The live response names the list `SubordinateTaxa` and writes `NumTotalResults`
// as null, so the empty page at the next offset is what ends the walk.
test('fetchSubordinateTaxa follows the offset until a page comes back empty', async () => {
  const { http, asked } = makeHttp({
    [subordinateTaxaUrl(QUGA_ID, FIRST_OFFSET)]: fixture('plants_subordinate_quga.json'),
    [subordinateTaxaUrl(QUGA_ID, PAGE_ONE_ROWS)]: fixture('plants_subordinate_quga_page2.json'),
  });
  assert.deepEqual(await fetchSubordinateTaxa(http, QUGA_ID, FETCHED_AT), [
    { key: 'QUGAB2', name: 'var. bonina' },
    { key: 'QUGAG', name: 'var. gambelii' },
  ]);
  assert.deepEqual(asked, [
    subordinateTaxaUrl(QUGA_ID, FIRST_OFFSET),
    subordinateTaxaUrl(QUGA_ID, PAGE_ONE_ROWS),
  ]);
  assert.deepEqual(http.failures, []);
});

test('a body that is not JSON gives null and records a failure', async () => {
  const { http } = makeHttp({ [profileUrl('QUGA')]: '<html>maintenance</html>' });
  assert.equal(await fetchProfile(http, 'QUGA', FETCHED_AT), null);
  assert.deepEqual(http.failures, [
    {
      url: profileUrl('QUGA'),
      status: OK,
      message: 'body is not JSON',
      at: FETCHED_AT,
    },
  ]);
});

test('a non-CSV distribution body gives an empty result and records a failure', async () => {
  const { http } = makeHttp({ [DISTRIBUTION_URL]: '<html>maintenance</html>' });
  assert.deepEqual(await fetchDistribution(http, QUGA_ID, FETCHED_AT), []);
  assert.deepEqual(http.failures, [
    {
      url: DISTRIBUTION_URL,
      status: OK,
      message: 'body is not the expected CSV',
      at: FETCHED_AT,
    },
  ]);
});

test('a non-CSV checklist body gives an empty result and records a failure', async () => {
  const { http } = makeHttp({ [CHECKLIST_URL]: '<html>maintenance</html>' });
  assert.deepEqual(await fetchChecklist(http, FETCHED_AT), []);
  assert.deepEqual(http.failures, [
    {
      url: CHECKLIST_URL,
      status: OK,
      message: 'body is not the expected CSV',
      at: FETCHED_AT,
    },
  ]);
});

test('a 500 gives an empty result and leaves the failure row in place', async () => {
  const { http } = makeHttp({}, SERVER_ERROR);
  assert.deepEqual(await fetchImages(http, QUGA_ID, FETCHED_AT), []);
  assert.deepEqual(await fetchSubordinateTaxa(http, QUGA_ID, FETCHED_AT), []);
  assert.deepEqual(await fetchDistribution(http, QUGA_ID, FETCHED_AT), []);
  assert.equal(await fetchProfile(http, 'QUGA', FETCHED_AT), null);
  assert.deepEqual(
    http.failures.map((row) => row.url),
    [
      imagesUrl(QUGA_ID),
      subordinateTaxaUrl(QUGA_ID, FIRST_OFFSET),
      DISTRIBUTION_URL,
      profileUrl('QUGA'),
    ],
  );
  for (const row of http.failures) {
    assert.equal(row.status, SERVER_ERROR);
  }
});
