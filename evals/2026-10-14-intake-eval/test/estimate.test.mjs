import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateJobs, perPhotoFromRun, OLD_PER_PHOTO } from '../estimate.mjs';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const job = (label, kind, model, effort, variant, n) => ({ label, kind, model, effort, variant, keys: Array.from({ length: n }, (_, i) => `k${i}`) });

test('with no tracer, a photo costs the old per-photo USD plus 30%', () => {
  assert.deepEqual(OLD_PER_PHOTO, { opus: 0.0177, sonnet: 0.0096, haiku: 0.00074 });
  const e = estimateJobs([job('a', 'judge', 'opus', 'high', 'V1', 10), job('b', 'judge', 'haiku', 'high', 'V1', 5)]);
  near(e.rows['judge opus high'].usd, 10 * 0.0177 * 1.3);
  near(e.total, 10 * 0.0177 * 1.3 + 5 * 0.00074 * 1.3);
  assert.equal(e.rows['judge opus high'].source, 'old + 30%');
  near(e.low, e.total / 2);
  near(e.high, e.total * 2);
});

test('perPhotoFromRun prices each set-up and variant from a run; the estimate takes the closest match', () => {
  const run = [job('j1', 'judge', 'sonnet', 'high', 'V2', 10), job('j2', 'judge', 'sonnet', 'high', 'V2', 10), job('c', 'check', 'sonnet', 'high', 'V1', 2)];
  const per = perPhotoFromRun(run, { j1: { usd: 0.2 }, j2: { usd: 0.4 }, c: { usd: 1 } });
  near(per['sonnet:high:V2'], 0.03);
  near(per['sonnet:high'], 0.03);
  assert.equal(per['sonnet:high:V1'], undefined, 'a check job does not price a judge photo');
  const e = estimateJobs([job('x', 'judge', 'sonnet', 'high', 'V2', 20), job('y', 'judge', 'sonnet', 'high', 'V1', 20), job('z', 'judge', 'sonnet', 'xhigh', 'V1', 20)], per);
  near(e.rows['judge sonnet high'].usd, 20 * 0.03 + 20 * 0.03);
  assert.equal(e.rows['judge sonnet xhigh'].source, 'old + 30%');
});
