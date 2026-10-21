import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { failedAgents, timeSpan, findRecord } from '../lib/journal.mjs';

test('failedAgents lists each failed agent once, with the label of its started line', () => {
  const entries = [
    { type: 'launched' },
    { type: 'started', agentId: 'a1', label: 'rank:haiku:high:T-leaf', phase: 'rank' },
    { type: 'started', agentId: 'a2', label: 'judge:haiku:high:V1:b01', phase: 'judge' },
    { type: 'result', agentId: 'a2', result: {} },
    { type: 'failed', agentId: 'a1' },
    { type: 'failed', agentId: 'a1' },
    { type: 'started', agentId: 'a3', label: 'rank:haiku:high:T-leaf', phase: 'rank' },
    { type: 'result', agentId: 'a3', result: {} },
    { type: 'failed', agentId: 'a9' },
  ];
  assert.deepEqual(failedAgents(entries), [{ agentId: 'a1', label: 'rank:haiku:high:T-leaf' }, { agentId: 'a9', label: null }]);
});

test('failedAgents returns an empty list when nothing failed', () => {
  assert.deepEqual(failedAgents([{ type: 'launched' }, { type: 'started', agentId: 'a', label: 'x' }]), []);
});

test('timeSpan gives the first and the last timestamp of transcript lines, and the seconds between', () => {
  const entries = [{ type: 'user', timestamp: '2026-10-21T10:00:05.000Z' }, { type: 'x' }, { type: 'assistant', timestamp: '2026-10-21T10:00:00.000Z' }, { type: 'assistant', timestamp: '2026-10-21T10:01:30.500Z' }];
  assert.deepEqual(timeSpan(entries), { start: '2026-10-21T10:00:00.000Z', end: '2026-10-21T10:01:30.500Z', seconds: 90.5 });
  assert.deepEqual(timeSpan([{ type: 'x' }]), { start: null, end: null, seconds: null });
});

test('findRecord finds <runId>.json in a session folder, and not a file under subagents', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-'));
  const projects = path.join(home, '.claude', 'projects');
  const session = path.join(projects, '-repo', 'sess-1');
  fs.mkdirSync(path.join(session, 'workflows'), { recursive: true });
  fs.mkdirSync(path.join(session, 'subagents', 'workflows', 'wf_abc123'), { recursive: true });
  fs.writeFileSync(path.join(session, 'subagents', 'workflows', 'wf_abc123', 'wf_abc123.json'), '{}');
  fs.writeFileSync(path.join(session, 'workflows', 'wf_abc123.json'), '{}');
  assert.equal(findRecord(projects, 'wf_abc123'), path.join(session, 'workflows', 'wf_abc123.json'));
  assert.throws(() => findRecord(projects, 'wf_none'), /no run record wf_none\.json under/);
  fs.rmSync(home, { recursive: true, force: true });
});
