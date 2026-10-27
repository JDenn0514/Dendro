import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agreement, usualLook, topPick, topPickScore, bestAfterK, speciesDoubt, repeatAgreement, batchScore, quotaFill, costPer, sourceYield, fitLine, minutesPer100 } from '../lib/score.mjs';

const close = (x, y) => assert.ok(Math.abs(x - y) < 1e-9, `${x} is not ${y}`);
const J = (keep, step = null, extra = {}) => ({ keep, step: keep ? step : null, ...extra });

// Ten photos with known numbers. Photo j is dropped by the owner for a species doubt only, so it leaves the score.
const owner = {
  a: J(true, 1), b: J(true, 1), c: J(true, 1), d: J(true, 2), e: J(true, 1), f: J(true, 2),
  g: J(false), h: J(false), i: J(false), j: J(false, null, { doubt: true }),
};
const judge = new Map(Object.entries({
  a: J(true, 1), b: J(true, 1), c: J(true, 1), d: J(true, 3), e: J(true, 3, { thin_cell: true }), f: J(false),
  g: J(false), h: J(false), i: J(true, 2), j: J(true, 1),
}));
const keys = Object.keys(owner);

test('agreement: keep, drop recall, and the difficulty step on the photos that both keep', () => {
  const r = agreement(keys, owner, judge);
  assert.equal(r.n, 9);
  close(r.keep, 7 / 9);
  close(r.drop_recall, 2 / 3);
  assert.equal(r.both, 5);
  close(r.exact, 3 / 5);
  close(r.within1, 4 / 5);
  assert.equal(r.part, null);
});

test('a thin-cell photo counts as kept at difficulty step 3', () => {
  const r = agreement(['e'], { e: J(true, 3) }, new Map([['e', J(true, 3, { thin_cell: true })]]));
  assert.deepEqual([r.keep, r.exact], [1, 1]);
});

test('agreement: the scores are null when nothing is there to score', () => {
  const r = agreement(['a'], { a: J(true, 1) }, new Map([['a', J(false)]]));
  assert.equal(r.drop_recall, null);
  assert.equal(r.exact, null);
  assert.equal(r.within1, null);
});

test('part agreement, where the owner labels the part', () => {
  const o = { a: { ...J(true, 1), part: 'leaf' }, b: { ...J(false), part: 'other' }, c: { ...J(true, 1), part: 'bark' } };
  const r = agreement(['a', 'b', 'c'], o, new Map([['a', J(true, 1)], ['b', J(false)], ['c', J(false)]]), { a: 'leaf', b: 'other', c: 'fruit' });
  close(r.part, 2 / 3);
});

test('usual look: the share of photos both keep where the judge agrees with the owner', () => {
  const answers = { a: { usual_look: true }, b: { usual_look: false }, c: { usual_look: true }, g: { usual_look: true } };
  const usual = { a: true, b: true, c: true, g: true };
  close(usualLook(['a', 'b', 'c', 'g'], owner, judge, answers, usual), 2 / 3);
});

test('top pick: the first kept photo at the lowest difficulty step the method fills', () => {
  assert.equal(topPick({ 1: [], 2: ['x', 'y'], 3: ['z'] }), 'x');
  assert.equal(topPick({ 1: [], 2: [], 3: [] }), null);
  const cells = { A: { 1: ['p'], 2: [], 3: [] }, B: { 1: [], 2: ['q'], 3: [] }, C: { 1: [], 2: [], 3: [] } };
  close(topPickScore(cells, { A: 'p', B: 'r', C: 's' }), 1 / 3);
  assert.equal(topPickScore(cells, {}), null);
});

test('species doubt lists mismatch escalations and hybrid rejects with the source name', () => {
  const photos = [{ key: 'a', source_species: 'Quercus alba' }, { key: 'b', source_species: 'Quercus ×bebbiana' }, { key: 'c', source_species: 'Acer rubrum' }];
  const answers = { a: { escalate: 'mismatch', reject: [] }, b: { escalate: 'none', reject: ['hybrid'] }, c: { escalate: 'quality', reject: ['blur'] } };
  assert.deepEqual(speciesDoubt(photos, answers), [
    { key: 'a', kind: 'mismatch', source_species: 'Quercus alba' },
    { key: 'b', kind: 'hybrid', source_species: 'Quercus ×bebbiana' },
  ]);
});

test('repeat agreement: keep, and the difficulty step on the photos kept both times', () => {
  const second = new Map(Object.entries({ a: J(true, 1), b: J(true, 2), c: J(false), d: J(true, 3) }));
  const r = repeatAgreement(['a', 'b', 'c', 'd'], judge, second);
  close(r.keep, 3 / 4);
  close(r.exact, 2 / 3);
  close(r.within1, 1);
  assert.equal(r.n, 4);
});

test('batch size: calls of 20 against calls of 10, each against the owner, with each other, and USD per photo', () => {
  const twenty = new Map(Object.entries({ a: J(true, 1), b: J(true, 2), c: J(true, 1), d: J(true, 2), e: J(true, 1), f: J(true, 2), g: J(false), h: J(false), i: J(false), j: J(false) }));
  const cost = n => Object.fromEntries(keys.map(k => [k, { tokens: 10, usd: n }]));
  const r = batchScore(keys, owner, { steps: judge, cost: cost(0.02) }, { steps: twenty, cost: cost(0.01) });
  close(r.ten.keep, 7 / 9);
  close(r.twenty.keep, 1);
  close(r.twenty.exact, 5 / 6);
  close(r.twenty.within1, 1);
  close(r.between.keep, 7 / 10);
  close(r.between.exact, 2 / 5);
  close(r.between.within1, 4 / 5);
  close(r.usd_per_photo.ten, 0.02);
  close(r.usd_per_photo.twenty, 0.01);
});

test('quota fill: the share of cells and difficulty steps filled, and the photos judged to fill them', () => {
  const rs = [
    { filled: { A: { 1: true, 2: true, 3: false } }, judged: 20 },
    { filled: { B: { 1: true, 2: false, 3: false }, C: { 1: true, 2: true, 3: true } }, judged: 30 },
  ];
  assert.deepEqual(quotaFill(rs), { slots: 9, filled: 6, share: 6 / 9, judged: 50 });
});

test('cost per photo judged and per kept photo; null when a cost is unknown', () => {
  const rs = [
    { cells: { A: { 1: ['a'], 2: ['b'], 3: [] } }, judged: 10, filtered: 0, cost: { tokens: 1000, usd: 0.1 } },
    { cells: { B: { 1: ['c', 'd'], 2: [], 3: [] } }, judged: 10, filtered: 20, cost: { tokens: 3000, usd: 0.3 } },
  ];
  const r = costPer(rs);
  assert.equal(r.kept, 4);
  close(r.usd, 0.4);
  assert.equal(r.photos, 30);
  close(r.usd_per_photo, 0.4 / 30);
  close(r.usd_per_kept, 0.1);
  assert.equal(r.tokens_per_kept, 1000);
  assert.equal(costPer([...rs, { cells: {}, judged: 1, filtered: 0, cost: null }]).usd_per_kept, null);
});

test('source yield: per source, the kept photos at each difficulty step and the cells it fills alone', () => {
  const photos = [
    { key: 'a', source: 'iNaturalist' }, { key: 'b', source: 'iNaturalist' }, { key: 'c', source: 'iNaturalist' },
    { key: 'd', source: 'Bioimages' }, { key: 'e', source: 'Bioimages' },
  ];
  const steps = new Map(Object.entries({
    a: { cell: 'A', keep: true, step: 1 }, b: { cell: 'A', keep: true, step: 2 }, c: { cell: 'A', keep: true, step: 3 },
    d: { cell: 'A', keep: true, step: 1 }, e: { cell: 'B', keep: false, step: null },
  }));
  const quota = { 1: 1, 2: 1, 3: 1, usual_look_min: 0 };
  assert.deepEqual(sourceYield(photos, steps, quota), {
    iNaturalist: { photos: 3, kept: { 1: 1, 2: 1, 3: 1 }, cells_filled: 1 },
    Bioimages: { photos: 2, kept: { 1: 1, 2: 0, 3: 0 }, cells_filled: 0 },
  });
});

test('fitLine fits a + b × n by least squares; one n gives a line through 0; no point gives null', () => {
  const l = fitLine([{ n: 2, tokens: 120, usd: 0.3 }, { n: 4, tokens: 140, usd: 0.5 }, { n: 6, tokens: 160, usd: 0.7 }]);
  close(l.tokens.a, 100); close(l.tokens.b, 10);
  close(l.usd.a, 0.1); close(l.usd.b, 0.1);
  const one = fitLine([{ n: 5, tokens: 50, usd: 0.5 }]);
  close(one.usd.a, 0); close(one.usd.b, 0.1);
  assert.equal(fitLine([]), null);
});

test('minutes per 100 photos from the agents\' times', () => {
  close(minutesPer100([{ seconds: 60, photos: 10 }, { seconds: 120, photos: 10 }]), 15);
  assert.equal(minutesPer100([]), null);
});

test('best after K: the share of cells whose top photo under "all" is not in the first K photos', () => {
  const all = { A: { 1: ['p'], 2: [], 3: [] }, B: { 1: [], 2: ['q'], 3: [] }, C: { 1: [], 2: [], 3: [] } };
  close(bestAfterK(all, new Set(['p'])), 1 / 2);
  assert.equal(bestAfterK({ C: all.C }, new Set()), null);
});
