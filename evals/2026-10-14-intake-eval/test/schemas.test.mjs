import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMAS, REJECT_CODES, CAUSES, ESCALATE } from '../lib/schemas.mjs';

const item = SCHEMAS.JUDGE.properties.results.items;
const P = item.properties;

test('the judge item has every Part 1 field, and all are required', () => {
  const fields = ['key', 'description', 'part', 'photo_features', 'whole', 'alone', 'too_close', 'side', 'causes', 'scale', 'season', 'growth_stage', 'usual_look', 'not_for', 'reject', 'escalate', 'note'];
  assert.deepEqual(Object.keys(P), fields);
  assert.deepEqual(item.required, fields);
  assert.deepEqual(SCHEMAS.JUDGE.required, ['results']);
});

test('the field values follow the spec', () => {
  assert.deepEqual(P.part.enum, ['leaf', 'bark', 'fruit', 'other']);
  assert.deepEqual(P.photo_features.additionalProperties.enum, ['clear', 'search', 'no']);
  assert.deepEqual(P.too_close.type, ['boolean', 'null']);
  assert.deepEqual(P.side.enum, ['upper', 'under', 'both', null]);
  assert.deepEqual(CAUSES, ['young', 'damaged', 'atypical', 'angle', 'light']);
  assert.deepEqual(P.causes.items.enum, CAUSES);
  assert.deepEqual(P.scale.enum, ['hand', 'ruler', 'coin', 'person', 'other', 'none']);
  assert.deepEqual(P.season.enum, ['spring', 'summer', 'autumn', 'winter', 'any']);
  assert.deepEqual(P.growth_stage.enum, ['young', 'mature', 'autumn', 'unripe', 'ripe', 'after_seed_fall', 'old', null]);
  assert.deepEqual(ESCALATE, ['mismatch', 'license', 'quality', 'none']);
  assert.deepEqual(P.escalate.enum, ESCALATE);
});

test('the reject codes are the 10 photo-check checks plus feature_not_found, hybrid, and unread', () => {
  assert.deepEqual(REJECT_CODES, ['feature_unclear', 'leaf_mass', 'bark_up_or_dark', 'blur', 'dead_leaf', 'name_label', 'buds_or_flowers', 'sucker_leaf', 'greyscale', 'fruit_part_missing', 'feature_not_found', 'hybrid', 'unread']);
  assert.deepEqual(P.reject.items.enum, REJECT_CODES);
});

test('the model check adds model_self_report; the ranking schema has orders, unread, and note', () => {
  assert.deepEqual(SCHEMAS.CHECK.required, ['model_self_report', 'results']);
  assert.deepEqual(SCHEMAS.CHECK.properties.results, SCHEMAS.JUDGE.properties.results);
  const R = SCHEMAS.RANK;
  assert.deepEqual(R.required, ['orders', 'unread', 'note']);
  assert.deepEqual(R.properties.orders.additionalProperties, { type: 'array', items: { type: 'string' } });
});
