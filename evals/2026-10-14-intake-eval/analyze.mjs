// node analyze.mjs --set key [--runs <run>,<run>] [--repeat <run>]  ->  tables/<set>/table.json, table.md
// Replays methods S, F, R, FR, and CR from the stored answers of the runs and scores them. No tokens.
// --runs: the runs to read (default: every run in runs/ with jobs of the set). A job label in two runs is a problem.
// --repeat: second runs of the same set-ups (one or more, comma-separated), for the repeat agreement.
import path from 'node:path';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { ROOT, EVAL } from './lib/paths.mjs';
import { readJson, writeJson } from './lib/data.mjs';
import { buildViews } from './lib/views.mjs';
import { judgeSteps, replayS, replayF, replayR, replayFR, replayCR } from './lib/replay.mjs';
import { methodSetups, filterOf as filterFor } from './lib/setups.mjs';
import { agreement, usualLook, topPickScore, bestAfterK, speciesDoubt, repeatAgreement, batchScore, quotaFill, costPer, sourceYield, fitLine, minutesPer100, gates, shortlist } from './lib/score.mjs';

const { values: args } = parseArgs({ options: { set: { type: 'string', default: 'key' }, runs: { type: 'string' }, repeat: { type: 'string' } } });
const config = readJson(path.join(EVAL, 'config.json'));
const pools = readJson(path.join(EVAL, args.set, 'pools.json'));
const problems = [];

// The runs: merge jobs, tokens, and times.
function loadRuns(names) {
  const jobs = [], tokens = {}, times = {}, seen = new Map();
  for (const name of names) {
    const dir = path.join(EVAL, 'runs', name);
    const own = readJson(path.join(dir, 'results.json')).jobs.filter(j => j.set === args.set);
    for (const j of own) {
      if (seen.has(j.label)) problems.push(`${j.label}: in runs ${seen.get(j.label)} and ${name}`);
      else { seen.set(j.label, name); jobs.push(j); }
    }
    Object.assign(tokens, readJson(path.join(dir, 'tokens.json')));
    if (fs.existsSync(path.join(dir, 'times.json'))) Object.assign(times, readJson(path.join(dir, 'times.json')));
  }
  return { jobs, tokens, times };
}
const allRuns = fs.readdirSync(path.join(EVAL, 'runs')).filter(n => fs.existsSync(path.join(EVAL, 'runs', n, 'results.json'))).sort();
const runNames = args.runs ? args.runs.split(',') : allRuns.filter(n => !(args.repeat ?? '').split(',').includes(n) && readJson(path.join(EVAL, 'runs', n, 'results.json')).jobs.some(j => j.set === args.set));
const { jobs, tokens, times } = loadRuns(runNames);
const v = buildViews(jobs, tokens);
problems.push(...v.problems);

// The species pools in fetch order. On the key, the cells of a species interleave by the key number n.
const order = new Map(pools.cells.map((c, i) => [c.cell, i]));
const species = [];
for (const c of pools.cells) {
  let s = species.find(x => x.target === c.target);
  if (!s) species.push(s = { target: c.target, parts: [], photos: [] });
  s.parts.push(c.part);
  for (const p of c.photos) s.photos.push({ key: p.key, n: p.n, part: p.part ?? null, cell: c.cell, source: p.source, source_species: p.source_species });
}
for (const s of species) s.photos.sort((a, b) => a.n - b.n || order.get(a.cell) - order.get(b.cell));
const allPhotos = species.flatMap(s => s.photos);
const owner = Object.fromEntries(pools.cells.flatMap(c => c.photos.map(p => [p.key, p.owner])));
const best = Object.fromEntries(pools.cells.filter(c => c.best).map(c => [c.cell, c.best]));

// Usual look on the key: the owner kept the agent's value on every photo of the picks file.
const usual = {};
if (args.set === 'key') {
  const picks = new Map(readJson(path.join(ROOT, 'prototype/photo-review/photo-picks-2026-10-11.json')).photos.map(r => [r.key, r]));
  for (const c of pools.cells) for (const p of c.photos) usual[p.key] = picks.get(p.review_key)?.usual_look ?? null;
}

// Each species pool cut to the photos that every set-up named has an answer entry for.
const cut = names => species.map(s => ({ ...s, photos: s.photos.filter(p => names.every(n => p.key in v.answers[n])) })).filter(s => s.photos.length);
const keysOf = ps => ps.flatMap(s => s.photos.map(p => p.key));

// Keep and the difficulty step of a set-up on the cut pools; with a filter, Haiku's rejects drop out first.
function stepsOf(pools, setup, rule, filter) {
  const out = new Map();
  for (const s of pools) {
    let photos = s.photos;
    if (filter) {
      const f = judgeSteps(s.target, photos, v.answers[filter], rule);
      for (const p of photos) if (!f.get(p.key).keep) out.set(p.key, { ...f.get(p.key), line: `filter_${f.get(p.key).line}` });
      photos = photos.filter(p => f.get(p.key).keep);
    }
    for (const [key, r] of judgeSteps(s.target, photos, v.answers[setup], rule)) out.set(key, r);
  }
  return out;
}

const setups = Object.keys(v.answers).sort();
// Method rows: the calls-of-10 set-ups and the leading set-ups, whose answers the rankings come from.
const mainSetups = methodSetups(setups, config);
const modelOf = setup => setup.split(':')[0];
const filterOf = setup => filterFor(setup, config, s => !!v.answers[s]);
const pct = x => (x == null ? '-' : `${(x * 100).toFixed(1)}%`);
const f4 = x => (x == null ? '-' : x.toFixed(4));

// Minutes per 100 photos of each judge set-up, from the agents' times.
const spans = {};
for (const j of jobs.filter(j => j.kind === 'judge' && times[j.label])) {
  const setup = `${j.model}:${j.effort}:${j.variant}${j.batch && j.batch !== 10 ? `:n${j.batch}` : ''}`;
  (spans[setup] ??= []).push({ seconds: times[j.label].seconds, photos: j.keys.length });
}

// 1. Set-up rows: agreement belongs to the set-up, the rule, and the Haiku reject pass (plan choice 15).
const setupRows = [];
for (const setup of setups) for (const rule of config.rules) for (const filter of [null, filterOf(setup)].filter((x, i) => i === 0 || x)) {
  const ps = cut(filter ? [setup, filter] : [setup]);
  const keys = keysOf(ps), steps = stepsOf(ps, setup, rule, filter);
  const thin = keys.filter(k => steps.get(k).thin_cell);
  setupRows.push({
    id: `${setup}/${rule}${filter ? '/F' : ''}`, setup, rule, filter, photos: keys.length,
    no_answer: keys.filter(k => v.answers[setup][k] == null).length,
    part_errors: keys.filter(k => steps.get(k).line?.endsWith('part_error')).length,
    ...agreement(keys, owner, steps),
    usual_look: args.set === 'key' ? usualLook(keys, owner, steps, v.answers[setup], usual) : null,
    usd_per_photo: keys.length ? keys.reduce((s, k) => s + (v.judgeCost[setup][k]?.usd ?? 0), 0) / keys.length : null,
    minutes_per_100: minutesPer100(spans[setup] ?? []),
    thin_cell: thin,
    source_yield: sourceYield(allPhotos.filter(p => keys.includes(p.key)), steps, config.quotas[config.headline_quota]),
  });
}
const setupRow = (setup, rule, filter) => setupRows.find(r => r.setup === setup && r.rule === rule && r.filter === filter);

// 2. The ranking cost line of each model, from its real ranking jobs (plan choice 11).
const lines = {};
for (const m of Object.keys(config.model_opt)) {
  const points = Object.entries(v.rankCost).filter(([s]) => modelOf(s) === m).flatMap(([, cells]) => Object.values(cells));
  lines[m] = { points: points.length, line: fitLine(points) };
}

// 3. Method rows: every method, main set-up, rule, and quota.
const methodRows = [];
for (const setup of mainSetups) {
  const m = modelOf(setup), filter = filterOf(setup);
  const rankR = v.rank[`${m}:${config.rank_effort}`] ?? {};
  const fr = v.rank[`${m}:${config.rank_effort}:FR`] ?? {};
  const one = cut([setup]), two = filter ? cut([setup, filter]) : null;
  // A cell whose FR set (rule K3, as the ranker sees it) equals R's ranked set reuses R's ranking (plan choice 10).
  const rankFR = { ...fr };
  if (two) {
    const frSet = {}, k3 = stepsOf(two, setup, 'K3', filter);
    for (const k of keysOf(two)) if (k3.get(k).keep) (frSet[k3.get(k).cell] ??= []).push(k);
    for (const [cell, keys] of Object.entries(frSet)) {
      const r = rankR[cell], rKeys = r ? [...Object.values(r.orders).flat(), ...r.unread] : [];
      if (!rankFR[cell] && r && rKeys.length === keys.length && keys.every(k => rKeys.includes(k))) rankFR[cell] = r;
    }
  }
  const opts = { answers: v.answers[setup], cost: v.judgeCost[setup], rank: rankR, line: lines[m].line };
  const filt = filter && { answers: v.answers[filter], cost: v.judgeCost[filter] };
  const methods = [
    { name: 'S', pools: one, run: (p, o) => replayS(p, o) },
    ...config.ks.map(K => ({ name: `R${K}`, ranking: true, pools: one, run: (p, o) => replayR(p, { ...o, K }) })),
    ...config.ks.map(K => ({ name: `CR${K}`, ranking: true, pools: one, run: (p, o) => replayCR(p, { ...o, K }) })),
    // F and FR with Haiku as the main judge are S and R with Haiku (plan choice 10), so they have no rows.
    ...(filter ? [
      { name: 'F', pools: two, filter: true, run: (p, o) => replayF(p, { ...o, filter: filt }) },
      { name: 'FR', ranking: true, pools: two, filter: true, run: (p, o) => replayFR(p, { ...o, filter: filt, rank: rankFR }) },
    ] : []),
  ];
  for (const rule of config.rules) for (const [qName, quota] of Object.entries(config.quotas)) for (const meth of methods) {
    const results = meth.pools.map(p => meth.run(p, { ...opts, rule, quota }));
    const cells = Object.assign({}, ...results.map(r => r.cells));
    const a = setupRow(setup, rule, meth.filter ? filter : null);
    methodRows.push({
      id: `${meth.name}/${setup}/${rule}/${qName}`, method: meth.name, setup, rule, quota: qName, ranking: !!meth.ranking,
      keep: a.keep, drop_recall: a.drop_recall, exact: a.exact, within1: a.within1,
      ranked: results.reduce((s, r) => s + r.ranked, 0), unranked: results.reduce((s, r) => s + r.unranked, 0),
      fill: quotaFill(results), ...costPer(results), top_pick: topPickScore(cells, best), cells,
    });
  }
  // How often the top photo of "all" comes after photo K (spec, method R).
  for (const r of methodRows.filter(r => r.setup === setup && /^C?R\d+$/.test(r.method))) {
    const all = methodRows.find(x => x.id === r.id.replace(/^(C?R)\d+/, '$1all'));
    const K = +r.method.replace(/^C?R/, '');
    r.best_after_k = bestAfterK(all.cells, new Set(one.flatMap(p => p.photos.slice(0, K).map(x => x.key))));
  }
}
for (const r of methodRows) r.gates = gates(r);
// Before the freeze (Task 7) there is no frozen variant and rule, so the shortlist is provisional: one per
// prompt variant and rule, over the headline quota (plan choice 16).
const headline = methodRows.filter(r => r.quota === config.headline_quota);
const groups = [...new Set(headline.map(r => `${r.setup.split(':')[2]}/${r.rule}`))];
const shortBy = Object.fromEntries(groups.map(g => [g, shortlist(headline.filter(r => `${r.setup.split(':')[2]}/${r.rule}` === g)).map(r => r.id)]));
const short = Object.values(shortBy).flat();

// 4. The batch-size test (owner ruling 2026-10-23).
const batch = [];
for (const setup of setups.filter(s => /:n\d+$/.test(s))) {
  const ten = setup.replace(/:n\d+$/, '');
  if (!v.answers[ten]) { problems.push(`${setup}: no set-up ${ten} to compare with`); continue; }
  const ps = cut([setup, ten]), keys = keysOf(ps);
  for (const rule of config.rules) {
    const b = batchScore(keys, owner, { steps: stepsOf(ps, ten, rule, null), cost: v.judgeCost[ten] }, { steps: stepsOf(ps, setup, rule, null), cost: v.judgeCost[setup] });
    batch.push({ setup, rule, photos: keys.length, ...b });
  }
}

// 5. The repeat agreement, from a second run.
const repeat = [];
if (args.repeat) {
  const r2 = loadRuns(args.repeat.split(',')), v2 = buildViews(r2.jobs, r2.tokens);
  problems.push(...v2.problems.map(p => `repeat: ${p}`));
  for (const setup of Object.keys(v2.answers).filter(s => v.answers[s])) {
    const ps = species.map(s => ({ ...s, photos: s.photos.filter(p => p.key in v.answers[setup] && p.key in v2.answers[setup]) })).filter(s => s.photos.length);
    for (const rule of config.rules) {
      const second = new Map();
      for (const s of ps) for (const [k, x] of judgeSteps(s.target, s.photos, v2.answers[setup], rule)) second.set(k, x);
      repeat.push({ setup, rule, ...repeatAgreement(keysOf(ps), stepsOf(ps, setup, rule, null), second) });
    }
  }
}

const doubt = Object.fromEntries(setups.map(s => [s, speciesDoubt(allPhotos.filter(p => p.key in v.answers[s]), v.answers[s])]));

const outDir = path.join(EVAL, 'tables', args.set);
fs.mkdirSync(outDir, { recursive: true });
writeJson(path.join(outDir, 'table.json'), {
  set: args.set, runs: runNames, repeat_run: args.repeat ?? null, problems, checks: v.checks, no_answer: v.noAnswer, unread: v.unread,
  lines, setups: setupRows, methods: methodRows, shortlist: shortBy, batch, repeat, species_doubt: doubt,
});

const md = [
  `# Intake eval: the ${args.set} table`,
  '',
  `Runs: ${runNames.join(', ')}.${args.repeat ? ` Repeat run: ${args.repeat}.` : ''} Written by \`analyze.mjs\`. The full numbers, the kept photos of each method, and the source yield are in \`table.json\`.`,
  '',
  `Problems: ${problems.length ? '' : 'none.'}`,
  ...problems.map(p => `- ${p}`),
  '',
  '## Set-ups',
  '',
  'A set-up is one model, effort, and prompt variant (`:n20`: calls of 20). `/F`: Haiku\'s reject pass first. Agreement is against the owner, on the photos the set-up judged. Exact and within one are on the photos that both keep. A thin-cell photo counts as kept at difficulty step 3.',
  '',
  '| set-up | photos | no answer | part errors | keep | drop recall | exact difficulty step | within one | usual look | USD per photo | minutes per 100 | thin cell |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...setupRows.map(r => `| ${r.id} | ${r.photos} | ${r.no_answer} | ${r.part_errors} | ${pct(r.keep)} | ${pct(r.drop_recall)} | ${pct(r.exact)} | ${pct(r.within1)} | ${pct(r.usual_look)} | ${f4(r.usd_per_photo)} | ${r.minutes_per_100 == null ? '-' : r.minutes_per_100.toFixed(1)} | ${r.thin_cell.join(' ') || '-'} |`),
  '',
  '## Batch size',
  '',
  ...(batch.length ? [
    '| set-up | rule | photos | keep (10, 20) | exact difficulty step (10, 20) | within one (10, 20) | 10 and 20 agree on keep | on exact difficulty step | on within one | USD per photo (10, 20) |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...batch.map(b => `| ${b.setup} | ${b.rule} | ${b.photos} | ${pct(b.ten.keep)}, ${pct(b.twenty.keep)} | ${pct(b.ten.exact)}, ${pct(b.twenty.exact)} | ${pct(b.ten.within1)}, ${pct(b.twenty.within1)} | ${pct(b.between.keep)} | ${pct(b.between.exact)} | ${pct(b.between.within1)} | ${f4(b.usd_per_photo.ten)}, ${f4(b.usd_per_photo.twenty)} |`),
  ] : ['No set-up in calls of 20 yet.']),
  '',
  '## Repeat',
  '',
  ...(repeat.length ? ['| set-up | rule | photos | keep | exact difficulty step |', '|---|---|---|---|---|', ...repeat.map(r => `| ${r.setup} | ${r.rule} | ${r.n} | ${pct(r.keep)} | ${pct(r.exact)} |`)] : ['No repeat run.']),
  '',
  '## Ranking cost lines',
  '',
  ...Object.entries(lines).map(([m, l]) => `- ${m}: ${l.line ? `USD ${f4(l.line.usd.a)} + ${f4(l.line.usd.b)} × n, tokens ${Math.round(l.line.tokens.a)} + ${Math.round(l.line.tokens.b)} × n, from ${l.points} ranking jobs` : 'no ranking job yet, so R and FR have no cost'}.`),
  '',
  '## Methods',
  '',
  `Quotas ${config.headline_quota} (the headline) and Q221. \`${config.headline_quota}\` rows that pass the gates: ${headline.filter(r => r.gates).length}. The shortlist is provisional until Task 7 freezes a variant and a rule, so it is made per variant and rule: ${groups.map(g => `${g} ${shortBy[g].length}`).join(', ')} rows (ids in \`table.json\`). S and F keep photos in fetch order and run as cost baselines only. Keep and the difficulty step come from the set-up row. "No ranking": cells with 2 or more photos to rank and no ranking, which keep fetch order. Q442 is in \`table.json\`.`,
  '',
  '| method | set-up | rule | quota | gates | judged | ranked | no ranking | quota fill | top pick | top of all after K | USD | USD per photo | USD per kept photo | tokens per kept photo |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...methodRows.filter(r => r.quota === config.headline_quota || r.quota === 'Q221')
    .map(r => `| ${r.method} | ${r.setup} | ${r.rule} | ${r.quota} | ${r.gates ? 'pass' : 'fail'}${short.includes(r.id) ? ', shortlist' : ''} | ${r.fill.judged} | ${r.ranked} | ${r.unranked} | ${pct(r.fill.share)} | ${pct(r.top_pick)} | ${pct(r.best_after_k)} | ${f4(r.usd)} | ${f4(r.usd_per_photo)} | ${f4(r.usd_per_kept)} | ${r.tokens_per_kept == null ? '-' : Math.round(r.tokens_per_kept)} |`),
  '',
  '## Species doubt',
  '',
  ...Object.entries(doubt).flatMap(([s, d]) => d.map(x => `- ${s}: ${x.key}, ${x.kind}, source name ${x.source_species}`)),
  ...(Object.values(doubt).every(d => !d.length) ? ['None.'] : []),
  '',
];
fs.writeFileSync(path.join(outDir, 'table.md'), md.join('\n'));

console.log(`set ${args.set} | runs ${runNames.join(',')} | set-ups ${setups.length} | set-up rows ${setupRows.length} | method rows ${methodRows.length} | shortlist ${short.length}`);
for (const p of problems) console.log(`problem: ${p}`);
