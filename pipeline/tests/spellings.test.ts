import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spellingSymbols, spellingVariants } from '../lib/spellings.ts';
import { identityMatches, infraEpithet } from '../lib/verdicts.ts';

const SAND_POST_OAK = ['Quercus margaretta', ...spellingVariants('QUMA13')];

test('spellingVariants gives the iNaturalist spelling of sand post oak', () => {
  assert.ok(spellingVariants('QUMA13').includes('Quercus margaretiae'));
});

test('spellingVariants gives [] for a symbol with no entry', () => {
  assert.deepEqual(spellingVariants('QUGA'), []);
  assert.deepEqual(spellingVariants('constructor'), []);
});

test('spellingVariants returns a copy that a caller cannot use to change the table', () => {
  spellingVariants('QUMA13').push('Quercus stellata');
  assert.ok(!spellingVariants('QUMA13').includes('Quercus stellata'));
});

test('the other spelling matches sand post oak, and its varieties', () => {
  assert.equal(identityMatches('Quercus margaretiae', SAND_POST_OAK), true);
  assert.equal(identityMatches('Quercus margaretiae Ashe ex Small', SAND_POST_OAK), true);
  assert.equal(identityMatches('Quercus margaretiae var. x', SAND_POST_OAK), true);
});

test('post oak does not match sand post oak, with or without the other spelling', () => {
  assert.equal(identityMatches('Quercus stellata', SAND_POST_OAK), false);
});

test('each entry is a plain binomial: no author, no rank, no infraspecific epithet', () => {
  for (const symbol of spellingSymbols()) {
    for (const name of spellingVariants(symbol)) {
      assert.match(name, /^[A-Z][a-z]+ [a-z][a-z-]*$/, `${symbol}: ${name}`);
      assert.equal(infraEpithet(name), null, `${symbol}: ${name}`);
    }
  }
});
