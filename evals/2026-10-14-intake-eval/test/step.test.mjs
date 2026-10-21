import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY_FEATURES, OTHER_FEATURES, stepOf, codeOrder, cellSteps } from '../lib/step.mjs';

// The answers a judge returns for a plain, clear photo of the part. Each test changes only the fields it names.
function ans(part, { photo_features = {}, ...extra } = {}) {
  const features = {};
  for (const f of [...KEY_FEATURES[part], ...OTHER_FEATURES[part]]) features[f] = 'clear';
  return {
    part, photo_features: { ...features, ...photo_features },
    whole: true, alone: true, too_close: part === 'bark' ? false : null, side: part === 'leaf' ? 'upper' : null,
    causes: [], scale: 'none', season: 'summer', growth_stage: 'mature', usual_look: true,
    not_for: [], reject: [], escalate: 'none', note: '',
    ...extra,
  };
}
const result = r => ({ keep: r.keep, step: r.step });

// The key's real cases. Each test names the key photo id and the owner's call.

test('bark that fills the frame, with a hand: b4b650d34aff ACRU bark, kept at 1', () => {
  assert.deepEqual(result(stepOf(ans('bark', { scale: 'hand' }))), { keep: true, step: 1 });
});

test('bark too close is not difficulty step 1: f3e29056f94c PLOC bark, kept at 2', () => {
  assert.deepEqual(stepOf(ans('bark', { scale: 'hand', too_close: true })), { keep: true, step: 2, line: null });
});

test('one whole green leaf: 7be548d8bdda ACRU leaf, kept at 1', () => {
  assert.deepEqual(stepOf(ans('leaf')), { keep: true, step: 1, line: null });
});

test('autumn colour does not change the difficulty step: 97346a0d43b8 ACRU leaf, kept at 1', () => {
  const a = ans('leaf', { growth_stage: 'autumn', usual_look: false, season: 'autumn' });
  assert.deepEqual(result(stepOf(a)), { keep: true, step: 1 });
});

test('several leaves, all clear: c956e38f4a44 QUAL leaf, kept at 2', () => {
  assert.deepEqual(result(stepOf(ans('leaf', { alone: false }))), { keep: true, step: 2 });
});

test('damage makes it difficulty step 3: 6bcb29a61da9 QUAL leaf, kept at 3', () => {
  assert.deepEqual(result(stepOf(ans('leaf', { causes: ['damaged'] }))), { keep: true, step: 3 });
});

test('a young leaf is difficulty step 3: 37066e9c9542 QURU leaf, kept at 3', () => {
  assert.deepEqual(result(stepOf(ans('leaf', { causes: ['young'] }))), { keep: true, step: 3 });
});

test('young and searched is a reject: 09092a8f8a50 QURU leaf, dropped', () => {
  const a = ans('leaf', { photo_features: { shape: 'search' }, causes: ['young'] });
  assert.deepEqual(stepOf(a), { keep: false, step: null, line: 'key_search_cause' });
});

test('young samaras: e19b3bcd48d2 ACRU fruit, dropped', () => {
  const a = ans('fruit', { photo_features: { kind: 'clear', shape: 'search' }, causes: ['young'] });
  assert.equal(stepOf(a).keep, false);
});

test('flash light: 812d2a774392 ACRU fruit, kept at 3', () => {
  assert.deepEqual(result(stepOf(ans('fruit', { causes: ['light'] }))), { keep: true, step: 3 });
});

test('a view up the trunk: c25d028896ef ACSA3 bark, dropped', () => {
  const a = ans('bark', { photo_features: { pattern: 'search' }, causes: ['angle'] });
  assert.equal(stepOf(a).keep, false);
});

test('the same photo under rule K3: c25d028896ef, kept at 3', () => {
  const a = ans('bark', { photo_features: { pattern: 'search' }, causes: ['angle'] });
  assert.deepEqual(stepOf(a, { rule: 'K3' }), { keep: true, step: 3, line: null });
});

test('a fruit crown at a distance: 1ccd34231791 LITU fruit, dropped', () => {
  assert.deepEqual(stepOf(ans('fruit', { photo_features: { kind: 'no' } })), { keep: false, step: null, line: 'key_no' });
});

test('a dead leaf: c4feb700d7c7 PLHI leaf, dropped', () => {
  assert.deepEqual(stepOf(ans('leaf', { reject: ['dead_leaf'] })), { keep: false, step: null, line: 'reject_list' });
});

test('one samara pair with a ruler: c6411076f1ba ACSA3 fruit, kept at 1', () => {
  assert.deepEqual(result(stepOf(ans('fruit', { scale: 'ruler' }))), { keep: true, step: 1 });
});

test('a full-size unripe fruit gets its difficulty step from clarity: 4f7ca07def95 PLHI fruit, kept at 2', () => {
  assert.deepEqual(result(stepOf(ans('fruit', { alone: false, growth_stage: 'unripe' }))), { keep: true, step: 2 });
});

test('a variant leaf form is not atypical: 7b414f8084d5 LITU leaf (6 lobes), kept at 1', () => {
  const a = ans('leaf', { usual_look: false, not_for: ['outline'] });
  assert.deepEqual(result(stepOf(a)), { keep: true, step: 1 });
});

test('the part other is a reject', () => {
  assert.deepEqual(stepOf({ ...ans('leaf'), part: 'other' }), { keep: false, step: null, line: 'part_other' });
});

test('the depth feature does not reject: a PLHI fruit', () => {
  const a = ans('fruit', { photo_features: { two_heads: 'no' } });
  assert.deepEqual(stepOf(a), { keep: true, step: 1, line: null });
});

test('too_close counts for bark only: a leaf', () => {
  assert.deepEqual(result(stepOf(ans('leaf', { too_close: true }))), { keep: true, step: 1 });
});

test('no answer is a reject', () => {
  assert.deepEqual(stepOf(null), { keep: false, step: null, line: 'no_answer' });
  assert.deepEqual(stepOf(undefined), { keep: false, step: null, line: 'no_answer' });
});

// The thin-cell rule, on the key's one cell where the owner dropped every photo: LITU bark, 6 photos in key order.

const LITU_BARK = () => [
  { key: 'eea9be1d848f', n: 1, answers: ans('bark', { photo_features: { texture: 'no' } }) },
  { key: 'e9eaa48d1274', n: 2, answers: ans('bark', { photo_features: { pattern: 'no' } }) },
  { key: 'a7e9e6af81cd', n: 3, answers: ans('bark', { photo_features: { texture: 'no', pattern: 'no' } }) },
  { key: '58137e0b947f', n: 4, answers: ans('bark', { photo_features: { pattern: 'search' }, causes: ['angle'] }) },
  { key: 'f4b8c38685c7', n: 5, answers: ans('bark', { reject: ['feature_unclear'] }) },
  { key: '212bc18d9a4f', n: 6, answers: ans('bark', { photo_features: { texture: 'search' }, causes: ['atypical'], usual_look: false }) },
];
const thin = out => out.filter(r => r.thin_cell).map(r => r.key);

test('thin cell: the first key_search_cause photo in code order comes back at difficulty step 3', () => {
  const out = cellSteps(LITU_BARK(), 'bark');
  assert.deepEqual(out.map(r => r.key), LITU_BARK().map(p => p.key));
  assert.deepEqual(thin(out), ['58137e0b947f']);
  const back = out.find(r => r.thin_cell);
  assert.equal(back.keep, true);
  assert.equal(back.step, 3);
  assert.deepEqual(out.filter(r => r.keep).map(r => r.key), ['58137e0b947f']);
  assert.equal(out.find(r => r.key === '212bc18d9a4f').line, 'key_search_cause');
});

test('thin cell: code order, not fetch order, picks the photo that comes back', () => {
  const photos = LITU_BARK();
  photos[3].answers.usual_look = false;
  photos[5].answers.usual_look = true;
  assert.deepEqual(thin(cellSteps(photos, 'bark')), ['212bc18d9a4f']);
});

test('thin cell: no photo comes back when one photo of the cell is kept', () => {
  const photos = LITU_BARK();
  photos[0].answers = ans('bark', { alone: false });
  const out = cellSteps(photos, 'bark');
  assert.deepEqual(thin(out), []);
  assert.deepEqual(out.filter(r => r.keep).map(r => [r.key, r.step]), [['eea9be1d848f', 2]]);
});

test('thin cell: no photo comes back when every reject is key_no or reject_list', () => {
  const photos = LITU_BARK();
  photos[3].answers = ans('bark', { photo_features: { pattern: 'no' }, causes: ['angle'] });
  photos[5].answers = ans('bark', { reject: ['feature_unclear'] });
  const out = cellSteps(photos, 'bark');
  assert.deepEqual(thin(out), []);
  assert.ok(out.every(r => !r.keep));
});

test('thin cell: under rule K3 the two key_search_cause photos are kept at 3 and none is a thin cell', () => {
  const out = cellSteps(LITU_BARK(), 'bark', { rule: 'K3' });
  assert.deepEqual(out.filter(r => r.keep).map(r => [r.key, r.step]), [['58137e0b947f', 3], ['212bc18d9a4f', 3]]);
  assert.ok(out.every(r => r.thin_cell === false));
});

// codeOrder.

const keys = photos => photos.map(p => p.key);

test('codeOrder: a usual-look photo ranks above a clearer photo that is not the usual look', () => {
  const photos = [
    { key: 'clear', n: 1, answers: ans('leaf', { usual_look: false }) },
    { key: 'usual', n: 2, answers: ans('leaf', { photo_features: { venation: 'search', size: 'no' }, alone: false }) },
  ];
  assert.deepEqual(keys(codeOrder(photos, 'leaf')), ['usual', 'clear']);
});

test('codeOrder: a fruit with a hand ranks above the same fruit with none', () => {
  const photos = [
    { key: 'none', n: 1, answers: ans('fruit') },
    { key: 'hand', n: 2, answers: ans('fruit', { scale: 'hand' }) },
  ];
  assert.deepEqual(keys(codeOrder(photos, 'fruit')), ['hand', 'none']);
});

test('codeOrder: a leaf with a hand does not rank above a leaf with none', () => {
  const photos = [
    { key: 'none', n: 1, answers: ans('leaf') },
    { key: 'hand', n: 2, answers: ans('leaf', { scale: 'hand' }) },
  ];
  assert.deepEqual(keys(codeOrder(photos, 'leaf')), ['none', 'hand']);
});

test('codeOrder: whole and alone rank above more clear photo features', () => {
  const photos = [
    { key: 'many', n: 1, answers: ans('leaf', { alone: false }) },
    { key: 'whole', n: 2, answers: ans('leaf', { photo_features: { venation: 'search', arrangement: 'no' } }) },
  ];
  assert.deepEqual(keys(codeOrder(photos, 'leaf')), ['whole', 'many']);
});

test('codeOrder: more clear photo features rank first, and fetch order breaks a tie', () => {
  const photos = [
    { key: 'b', n: 3, answers: ans('bark') },
    { key: 'fewer', n: 1, answers: ans('bark', { photo_features: { colour: 'search' } }) },
    { key: 'a', n: 2, answers: ans('bark') },
  ];
  assert.deepEqual(keys(codeOrder(photos, 'bark')), ['a', 'b', 'fewer']);
});

test('codeOrder does not change its input', () => {
  const photos = [{ key: 'b', n: 2, answers: ans('leaf') }, { key: 'a', n: 1, answers: ans('leaf') }];
  codeOrder(photos, 'leaf');
  assert.deepEqual(keys(photos), ['b', 'a']);
});
