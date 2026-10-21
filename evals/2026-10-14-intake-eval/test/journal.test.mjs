import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failedAgents } from '../lib/journal.mjs';

test('failedAgents lists each failed agent once, with the label of its started line', () => {
  const entries = [
    { type: 'launched' },
    { type: 'started', agentId: 'a1', label: 'P2:haiku:T', phase: 'P2' },
    { type: 'started', agentId: 'a2', label: 'P1:haiku:T:b1', phase: 'P1' },
    { type: 'result', agentId: 'a2', result: {} },
    { type: 'failed', agentId: 'a1' },
    { type: 'failed', agentId: 'a1' },
    { type: 'started', agentId: 'a3', label: 'P2:haiku:T', phase: 'P2' },
    { type: 'result', agentId: 'a3', result: {} },
    { type: 'failed', agentId: 'a9' },
  ];
  assert.deepEqual(failedAgents(entries), [{ agentId: 'a1', label: 'P2:haiku:T' }, { agentId: 'a9', label: null }]);
});

test('failedAgents returns an empty list when nothing failed', () => {
  assert.deepEqual(failedAgents([{ type: 'launched' }, { type: 'started', agentId: 'a', label: 'x' }]), []);
});
