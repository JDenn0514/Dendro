import { test } from 'node:test';
import assert from 'node:assert/strict';

import { collectIds, appendOnlyErrors, readPublished } from '../lib/ids.ts';
import type { ContentSet } from '../lib/ids.ts';

// The keys are the real content's: flat unit keys, channel-qualified concepts,
// and a concept target on a manifest row.
function sample(): ContentSet {
  return {
    species: {
      QUGA: {
        scientific: 'Quercus gambelii',
        varieties: [{ key: 'QUGAG', name: 'Quercus gambelii var. gambelii' }],
      },
      ACGL: { scientific: 'Acer glabrum' },
    },
    concepts: [
      { key: 'plated', channel: 'bark' },
      { key: 'simple_lobed', channel: 'leaf' },
    ],
    units: [{ key: 'leaf_types' }, { key: 'simple_lobed_white_oaks_co' }],
    manifest: [
      { hash: 'aaa1', target: 'QUGA', channel: 'leaf' },
      { hash: 'bbb2', target: 'bark/plated', channel: 'bark' },
    ],
  };
}

function gitShowFrom(files: Record<string, string | null>): {
  gitShow: (path: string) => string | null;
  calls: string[];
} {
  const calls: string[] = [];
  const gitShow = (path: string): string | null => {
    calls.push(path);
    return path in files ? files[path] : null;
  };
  return { gitShow, calls };
}

test('collectIds returns every kind of id, sorted', () => {
  assert.deepEqual(collectIds(sample()), [
    'concept:bark/plated',
    'concept:leaf/simple_lobed',
    'image:aaa1|QUGA|leaf',
    'image:bbb2|bark/plated|bark',
    'species:ACGL',
    'species:QUGA',
    'unit:leaf_types',
    'unit:simple_lobed_white_oaks_co',
    'variety:QUGAG',
  ]);
});

test('a retired species and a retired manifest row still contribute their ids', () => {
  const content = sample();
  content.species.ACGL.retired = true;
  content.species.ACGL.retired_reason = 'left the pool';
  content.manifest[0].retired = true;
  const ids = collectIds(content);
  assert.equal(ids.includes('species:ACGL'), true);
  assert.equal(ids.includes('image:aaa1|QUGA|leaf'), true);
});

test('appendOnlyErrors fails when a published symbol is gone, and names the symbol', () => {
  const previous = sample();
  const next = sample();
  delete next.species.QUGA;
  const errors = appendOnlyErrors(previous, next);
  assert.deepEqual(errors, [
    'species:QUGA is in the published species.json and is gone from the new content',
    'variety:QUGAG is in the published species.json and is gone from the new content',
  ]);
});

test('appendOnlyErrors passes when the symbol is still there with retired: true', () => {
  const previous = sample();
  const next = sample();
  next.species.QUGA.retired = true;
  next.species.QUGA.retired_reason = 'left the pool';
  next.species.QUGA.retired_at = '2026-09-22';
  assert.deepEqual(appendOnlyErrors(previous, next), []);
});

test('appendOnlyErrors passes when previous is null', () => {
  assert.deepEqual(appendOnlyErrors(null, sample()), []);
});

test('appendOnlyErrors gives one message per missing variety, concept, unit, and image', () => {
  const previous = sample();
  const next = sample();
  next.species.QUGA.varieties = [];
  next.concepts = [{ key: 'plated', channel: 'bark' }];
  next.units = [{ key: 'leaf_types' }];
  next.manifest = [{ hash: 'aaa1', target: 'QUGA', channel: 'leaf' }];
  const errors = appendOnlyErrors(previous, next);
  assert.deepEqual(errors, [
    'concept:leaf/simple_lobed is in the published concepts.json and is gone from the new content',
    'image:bbb2|bark/plated|bark is in the published images/manifest.json and is gone from the new content',
    'unit:simple_lobed_white_oaks_co is in the published units.json and is gone from the new content',
    'variety:QUGAG is in the published species.json and is gone from the new content',
  ]);
  assert.equal(errors.length, 4);
});

test('one hash on two targets: dropping one row is an error that names that target', () => {
  const previous = sample();
  previous.manifest = [
    { hash: 'aaa1', target: 'QUGA', channel: 'leaf' },
    { hash: 'aaa1', target: 'QUGAG', channel: 'leaf' },
  ];
  const next = sample();
  next.manifest = [{ hash: 'aaa1', target: 'QUGA', channel: 'leaf' }];
  assert.deepEqual(appendOnlyErrors(previous, next), [
    'image:aaa1|QUGAG|leaf is in the published images/manifest.json and is gone from the new content',
  ]);
});

test('a concept key that moves to another channel is an error', () => {
  const previous = sample();
  const next = sample();
  next.concepts = [
    { key: 'plated', channel: 'twig' },
    { key: 'simple_lobed', channel: 'leaf' },
  ];
  assert.deepEqual(appendOnlyErrors(previous, next), [
    'concept:bark/plated is in the published concepts.json and is gone from the new content',
  ]);
});

test('adding a species, a unit, or an image is never an error', () => {
  const previous = sample();
  const next = sample();
  next.species.PIPO = { scientific: 'Pinus ponderosa' };
  next.units.push({ key: 'needle_types' });
  next.manifest.push({ hash: 'ccc3', target: 'PIPO', channel: 'leaf' });
  assert.deepEqual(appendOnlyErrors(previous, next), []);
});

test('readPublished returns null when gitShow returns null for content/species.json', () => {
  const { gitShow } = gitShowFrom({});
  assert.equal(readPublished(gitShow), null);
});

test('readPublished parses four files and calls gitShow with those four paths in order', () => {
  const { gitShow, calls } = gitShowFrom({
    'content/species.json': JSON.stringify({
      QUGA: { varieties: [{ key: 'QUGAG', name: 'var. gambelii' }] },
    }),
    'content/concepts.json': JSON.stringify([{ key: 'plated', channel: 'bark' }]),
    'content/units.json': JSON.stringify([{ key: 'bark_types' }]),
    'content/images/manifest.json': JSON.stringify([
      { hash: 'aaa1', target: 'QUGA', channel: 'leaf', retired: true },
    ]),
  });
  const content = readPublished(gitShow);
  assert.deepEqual(calls, [
    'content/species.json',
    'content/concepts.json',
    'content/units.json',
    'content/images/manifest.json',
  ]);
  assert.notEqual(content, null);
  assert.deepEqual(collectIds(content as ContentSet), [
    'concept:bark/plated',
    'image:aaa1|QUGA|leaf',
    'species:QUGA',
    'unit:bark_types',
    'variety:QUGAG',
  ]);
});

test('readPublished keeps the JSON parser message in its error', () => {
  const broken = 'not json at all';
  let parserMessage = '';
  try {
    JSON.parse(broken);
  } catch (error) {
    parserMessage = (error as Error).message;
  }
  assert.notEqual(parserMessage, '');

  const { gitShow } = gitShowFrom({
    'content/species.json': JSON.stringify({ QUGA: {} }),
    'content/concepts.json': broken,
    'content/units.json': JSON.stringify([]),
    'content/images/manifest.json': JSON.stringify([]),
  });
  assert.throws(
    () => readPublished(gitShow),
    { message: `content/concepts.json does not hold valid JSON: ${parserMessage}` },
  );
});

test('readPublished names the file and the field when a row lacks one', () => {
  const { gitShow } = gitShowFrom({
    'content/species.json': JSON.stringify({ QUGA: {} }),
    'content/concepts.json': JSON.stringify([{ key: 'plated' }]),
    'content/units.json': JSON.stringify([]),
    'content/images/manifest.json': JSON.stringify([]),
  });
  assert.throws(
    () => readPublished(gitShow),
    { message: 'content/concepts.json holds a row with no channel' },
  );
});
