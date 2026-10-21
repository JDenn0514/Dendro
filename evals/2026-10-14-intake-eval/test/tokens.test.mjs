import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messagesFrom, priceMessage, sumMessages, MODEL_IDS } from '../lib/tokens.mjs';

const line = (id, model, u) => ({ type: 'assistant', message: { id, model, usage: { input_tokens: 2, cache_creation_input_tokens: u.cw ?? 0, cache_read_input_tokens: u.cr ?? 0, output_tokens: u.out, cache_creation: { ephemeral_5m_input_tokens: u.cw ?? 0, ephemeral_1h_input_tokens: 0 } } } });

test('messagesFrom keeps one entry per message id, the one with the most output', () => {
  const entries = [
    { type: 'user', message: { content: 'x' } },
    line('m1', 'claude-haiku-5-5', { cw: 1000, out: 16 }),
    line('m1', 'claude-haiku-5-5', { cw: 1000, out: 332 }),
    line('m2', 'claude-haiku-5-5', { cr: 1000, out: 50 }),
    { type: 'assistant', message: { id: 'm3', model: '<synthetic>', usage: { input_tokens: 0, output_tokens: 0 } } },
  ];
  const msgs = messagesFrom(entries);
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].output, 332);
  assert.equal(msgs[0].cw5m, 1000);
  assert.equal(msgs[1].cread, 1000);
});

test('a message with no cache split puts all cache writes in the 5 minute bucket', () => {
  const [m] = messagesFrom([{ type: 'assistant', message: { id: 'a', model: 'claude-opus-5-5', usage: { input_tokens: 1, cache_creation_input_tokens: 700, cache_read_input_tokens: 0, output_tokens: 3 } } }]);
  assert.equal(m.cw5m, 700);
  assert.equal(m.cw1h, 0);
  assert.equal(m.split_known, false);
});

test('priceMessage uses the documented rates', () => {
  const m = { model: 'claude-opus-5-5', input: 1e6, output: 1e6, cw5m: 1e6, cw1h: 1e6, cread: 1e6 };
  assert.ok(Math.abs(priceMessage(m) - 37.2) < 1e-9);
  const s = { ...m, model: 'claude-sonnet-5-5' };
  assert.ok(Math.abs(priceMessage(s) - 18.7) < 1e-9);
  const h = { model: 'claude-haiku-5-5', input: 50000, output: 1e6, cw5m: 0, cw1h: 0, cread: 50000 };
  assert.ok(Math.abs(priceMessage(h) - (0.05 * 0.10 + 0.5 + 0.05 * 0.01)) < 1e-12);
  const big = { model: 'claude-haiku-5-5', input: 150000, output: 0, cw5m: 0, cw1h: 0, cread: 0 };
  assert.ok(Math.abs(priceMessage(big) - 0.15 * 0.5) < 1e-12);
  assert.equal(priceMessage({ ...m, model: 'claude-haiku-4-5' }), null);
});

test('sumMessages adds the five counts and the price, and lists the models', () => {
  const s = sumMessages([
    { model: 'claude-haiku-5-5', input: 10, cw5m: 20, cw1h: 0, cread: 30, output: 40 },
    { model: 'claude-haiku-5-5', input: 1, cw5m: 0, cw1h: 0, cread: 0, output: 2 },
  ]);
  assert.equal(s.tokens, 103);
  assert.deepEqual(s.models, ['claude-haiku-5-5']);
  assert.equal(s.messages, 2);
  assert.equal(s.unpriced, 0);
  assert.equal(MODEL_IDS.haiku, 'claude-haiku-5-5');
});
