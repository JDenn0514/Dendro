import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leadingSetup, methodSetups, filterOf } from '../lib/setups.mjs';

const config = { leading: { variant: 'V1', batch: 20, effort: { opus: 'high', sonnet: 'high', haiku: 'high' } } };
const setups = [
  'haiku:high:V1', 'haiku:high:V1:n20', 'haiku:medium:V1:n20', 'haiku:high:V2',
  'opus:high:V1', 'opus:high:V1:n20', 'opus:xhigh:V1',
  'sonnet:high:V1:n20', 'sonnet:medium:V1:n20',
];

test('the leading set-up of a model comes from config.leading', () => {
  assert.equal(leadingSetup(config, 'haiku'), 'haiku:high:V1:n20');
  assert.equal(leadingSetup({ leading: { ...config.leading, batch: 10, effort: { sonnet: 'medium' } } }, 'sonnet'), 'sonnet:medium:V1');
});

test('the method set-ups are the calls-of-10 set-ups and the leading calls-of-20 set-ups', () => {
  assert.deepEqual(methodSetups(setups, config), [
    'haiku:high:V1', 'haiku:high:V1:n20', 'haiku:high:V2',
    'opus:high:V1', 'opus:high:V1:n20', 'opus:xhigh:V1',
    'sonnet:high:V1:n20',
  ]);
});

test("the reject pass is Haiku's leading set-up, for every set-up of another model", () => {
  const has = s => setups.includes(s);
  assert.equal(filterOf('opus:high:V1:n20', config, has), 'haiku:high:V1:n20');
  assert.equal(filterOf('opus:xhigh:V1', config, has), 'haiku:high:V1:n20');
  assert.equal(filterOf('sonnet:high:V1:n20', config, has), 'haiku:high:V1:n20');
  assert.equal(filterOf('haiku:high:V1:n20', config, has), null);
  assert.equal(filterOf('haiku:medium:V1:n20', config, has), null);
  assert.equal(filterOf('opus:high:V1', config, () => false), null);
});
