// node collect.mjs --name <plan> --run <run ID> [--run <resumed run ID> ...] [--fail-on-unread]
// node collect.mjs --name <plan> --record <run record file> [...]
// Reads the job list, the run records, and the agent transcripts. --run finds the record of a run ID in the
// session folders under $HOME/.claude/projects/. Run it in the session of the workflow: the records go away with the container.
// Writes runs/<name>/results.json, tokens.json, times.json, tool-errors.json, problems.txt.
// A job that had a failed attempt (a "failed" line in the run's journal.jsonl) gets `failed_attempts` in tokens.json.
// times.json: the wall-clock start and end of each job, from its transcript timestamps (the time metric).
// The total line on the console includes the failed attempts.
// Exits 1 on a model problem, or on any unread photo with --fail-on-unread.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EVAL } from './lib/paths.mjs';
import { readJson, readJsonl, writeJson } from './lib/data.mjs';
import { MODEL_IDS, messagesFrom, sumMessages } from './lib/tokens.mjs';
import { keyProblems, decodeResult } from './lib/coverage.mjs';
import { failedAgents, timeSpan, findRecord } from './lib/journal.mjs';

const args = process.argv.slice(2);
const name = args[args.indexOf('--name') + 1];
const projects = path.join(os.homedir(), '.claude', 'projects');
const recordFiles = [
  ...args.flatMap((a, i) => (a === '--record' ? [args[i + 1]] : [])),
  ...args.flatMap((a, i) => (a === '--run' ? [findRecord(projects, args[i + 1])] : [])),
];
if (!recordFiles.length) throw new Error('usage: node collect.mjs --name <plan name> --run <run ID> [--run ...]');
const jobs = readJson(path.join(EVAL, 'wf', `${name}.jobs.json`));

const records = recordFiles.map(f => {
  const rec = readJson(f);
  return {
    rec,
    tdir: path.join(path.dirname(path.dirname(f)), 'subagents', 'workflows', rec.runId),
    progress: Object.values(rec.workflowProgress ?? {}).filter(e => e && e.type === 'workflow_agent'),
    results: new Map((Array.isArray(rec.result) ? rec.result : []).map(r => [r.label, r.result])),
    // The journal lists the agents that failed. The run record does not, but they cost real tokens.
    failed: (() => {
      const j = path.join(path.dirname(path.dirname(f)), 'subagents', 'workflows', rec.runId, 'journal.jsonl');
      return fs.existsSync(j) ? failedAgents(readJsonl(j)) : [];
    })(),
  };
});

// Tool errors in a transcript, such as a refused Read of a file outside the session's folder.
const toolErrors = entries => entries.flatMap(e => (e.type === 'user' && Array.isArray(e.message?.content) ? e.message.content : []))
  .filter(c => c?.type === 'tool_result' && c.is_error)
  .map(c => (typeof c.content === 'string' ? c.content : JSON.stringify(c.content)).slice(0, 200));
const PERMISSION = /permission|denied|not allowed|outside|blocked|refused/i;
const unreadIn = r => (r?.results ?? []).filter(x => (x?.reject ?? []).includes('unread')).length + (r?.unread ?? []).length;

const out = [], tokens = {}, times = {}, problems = [], checks = [];
let modelProblems = 0, unread = 0;
const failedTotal = { count: 0, tokens: 0, usd: 0 };
const errors = [];
for (const j of jobs) {
  const want = MODEL_IDS[j.model];
  let result = null;
  for (const r of records) if (r.results.get(j.label) != null) result = r.results.get(j.label);
  // The agent answers with photo codes. results.json holds the keys.
  result = decodeResult(j, result);
  const seen = new Set(), msgs = [], states = [], lines = [];
  let recordTokens = 0;
  for (const r of records) {
    for (const e of r.progress.filter(x => x.label === j.label)) {
      states.push(e.state);
      if (e.model && e.model !== want) { problems.push(`${j.label}: run record model ${e.model}, want ${want}`); modelProblems++; }
      if (seen.has(e.agentId)) continue;
      seen.add(e.agentId);
      recordTokens += e.tokens ?? 0;
      const f = path.join(r.tdir, `agent-${e.agentId}.jsonl`);
      if (fs.existsSync(f)) {
        const entries = readJsonl(f);
        msgs.push(...messagesFrom(entries));
        lines.push(...entries);
        for (const text of toolErrors(entries)) errors.push({ label: j.label, text });
      } else problems.push(`${j.label}: no transcript ${f}`);
    }
  }
  const sum = sumMessages(msgs);
  sum.record_tokens = recordTokens;
  // Failed attempts of this job: priced from their transcripts, kept apart from the result's own tokens.
  const failedIds = new Set();
  const failedMsgs = [];
  for (const r of records) {
    for (const fa of r.failed.filter(x => x.label === j.label && !seen.has(x.agentId) && !failedIds.has(x.agentId))) {
      failedIds.add(fa.agentId);
      const f = path.join(r.tdir, `agent-${fa.agentId}.jsonl`);
      if (fs.existsSync(f)) failedMsgs.push(...messagesFrom(readJsonl(f)));
      else problems.push(`${j.label}: no transcript for failed agent ${fa.agentId}`);
    }
  }
  if (failedIds.size) {
    const fs_ = sumMessages(failedMsgs);
    sum.failed_attempts = { agents: [...failedIds], count: failedIds.size, tokens: fs_.tokens, usd: fs_.usd, models: fs_.models };
    failedTotal.count += failedIds.size; failedTotal.tokens += fs_.tokens; failedTotal.usd += fs_.usd;
  }
  tokens[j.label] = sum;
  times[j.label] = timeSpan(lines);
  if (j.kind === 'check') checks.push(`${j.label}: model option "${j.model_opt}" ran ${sum.models.join('+') || 'nothing'}, self report ${JSON.stringify(result?.model_self_report ?? null)}`);
  if (sum.models.some(m => m !== want)) { problems.push(`${j.label}: transcript model ${sum.models.join('+')}, want ${want}`); modelProblems++; }
  if (!seen.size) problems.push(`${j.label}: not in any run record`);
  if (result == null) problems.push(`${j.label}: no result`);
  problems.push(...keyProblems(j, result));
  if (sum.unpriced) problems.push(`${j.label}: ${sum.unpriced} messages with no price`);
  unread += unreadIn(result);
  out.push({ label: j.label, kind: j.kind, set: j.set, model: j.model, model_opt: j.model_opt, effort: j.effort, variant: j.variant ?? null, cell: j.cell ?? null, groups: j.groups ?? null, keys: j.keys, agentIds: [...seen], states, result });
}

const dir = path.join(EVAL, 'runs', name);
writeJson(path.join(dir, 'results.json'), { runIds: records.map(r => r.rec.runId), jobs: out });
writeJson(path.join(dir, 'tokens.json'), tokens);
writeJson(path.join(dir, 'times.json'), times);
writeJson(path.join(dir, 'tool-errors.json'), errors);
fs.writeFileSync(path.join(dir, 'problems.txt'), problems.join('\n') + '\n');
const total = Object.values(tokens).reduce((s, t) => ({ tokens: s.tokens + t.tokens, usd: s.usd + t.usd }), { tokens: failedTotal.tokens, usd: failedTotal.usd });
console.log(`jobs ${jobs.length} | with result ${out.filter(o => o.result != null).length} | tokens ${total.tokens} | usd ${total.usd.toFixed(4)} | problems ${problems.length}`);
console.log(`failed attempts: ${failedTotal.count} | usd ${failedTotal.usd.toFixed(4)} | tokens ${failedTotal.tokens}`);
for (const c of checks) console.log(`check: ${c}`);
const refused = errors.filter(e => PERMISSION.test(e.text));
console.log(`unread photos: ${unread} | tool errors: ${errors.length} | permission refusals: ${refused.length}`);
if (refused.length) console.log(`first refusal (${refused[0].label}): ${refused[0].text}`);
if (problems.length) console.log(problems.slice(0, 20).join('\n'));
const failOnUnread = args.includes('--fail-on-unread') && unread > 0;
process.exit(modelProblems || failOnUnread ? 1 : 0);
