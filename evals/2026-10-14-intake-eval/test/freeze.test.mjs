import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frozenRecord, checkFrozen, sha256 } from '../lib/freeze.mjs';

const config = { variants: ['V1', 'V2'], rules: ['P', 'K3'], leading: { variant: 'V1', batch: 20, effort: { opus: 'high', sonnet: 'high', haiku: 'high' } } };
const files = { 'lib/step.mjs': 'step', 'briefs/judge-V1.md': 'brief', 'lib/schemas.mjs': 'schema' };

test('the record names the variant, the rule, the call size, each effort, and the 3 hashes', () => {
  const r = frozenRecord(config, { variant: 'V1', rule: 'P' }, files);
  assert.deepEqual(r, {
    variant: 'V1', rule: 'P', batch: 20, effort: { opus: 'high', sonnet: 'high', haiku: 'high' },
    sha256: { 'lib/step.mjs': sha256('step'), 'briefs/judge-V1.md': sha256('brief'), 'lib/schemas.mjs': sha256('schema') },
  });
});

test('the record refuses a variant or rule that config does not hold', () => {
  assert.throws(() => frozenRecord(config, { variant: 'V3', rule: 'P' }, files), /variant V3/);
  assert.throws(() => frozenRecord(config, { variant: 'V1', rule: 'Q' }, files), /rule Q/);
  assert.throws(() => frozenRecord(config, { variant: 'V1', rule: 'P' }, { 'lib/step.mjs': 'x' }), /briefs\/judge-V1.md/);
});

test('the check names each file whose hash differs', () => {
  const r = frozenRecord(config, { variant: 'V1', rule: 'P' }, files);
  assert.deepEqual(checkFrozen(r, files), []);
  assert.deepEqual(checkFrozen(r, { ...files, 'lib/step.mjs': 'changed' }), ['lib/step.mjs']);
  assert.deepEqual(checkFrozen(r, { 'lib/step.mjs': 'step' }), ['briefs/judge-V1.md', 'lib/schemas.mjs']);
});
