// node report.mjs  ->  report.md, tables/key-v2/setups.svg, tables/heldout/setups.svg
// The report. Task 7 wrote the key section; Task 11 added the held-out set, the decision rule, and the costs.
// Every number comes from tables/, key/, heldout/, runs/, and frozen.json, except the constants from NOTES.md
// and the plan (CLEAN_USD, FIRST_ATTEMPTS_USD, PLAN_TOTAL, and the estimates in PHASES).
import path from 'node:path';
import fs from 'node:fs';
import { EVAL } from './lib/paths.mjs';
import { readJson } from './lib/data.mjs';
import { leadingSetup } from './lib/setups.mjs';
import { heldoutCheck, GATES, MARGIN } from './lib/score.mjs';
import { CELL_PARTS } from './lib/heldout.mjs';

const v1 = readJson(path.join(EVAL, 'tables', 'key', 'table.json'));
const v2 = readJson(path.join(EVAL, 'tables', 'key-v2', 'table.json'));
const frozen = readJson(path.join(EVAL, 'frozen.json'));
const examples = readJson(path.join(EVAL, 'key', 'gate-examples.json'));
const relabel = readJson(path.join(EVAL, 'key', 'relabel.json'));
const config = readJson(path.join(EVAL, 'config.json'));

// The table's USD of the medium and xhigh set-ups includes the first attempts of the jobs that ran again
// (NOTES.md, Task 5, "The clean numbers"). These are the USD per photo from one attempt of each job.
const CLEAN_USD = {
  'opus:medium:V1': 0.0224, 'opus:xhigh:V1': 0.0302, 'sonnet:medium:V1': 0.0131,
  'sonnet:xhigh:V1': 0.0231, 'haiku:medium:V1': 0.0012, 'haiku:xhigh:V1': 0.0024,
};

const MODELS = ['opus', 'sonnet', 'haiku'];
const name = m => m[0].toUpperCase() + m.slice(1);
const lead = m => leadingSetup({ leading: { variant: frozen.variant, batch: frozen.batch, effort: frozen.effort } }, m);
const SETUPS = MODELS.flatMap(m => [...config.efforts.map(e => `${m}:${e}:V1`), lead(m)]);
const rule = frozen.rule, Q = config.headline_quota;
const row = (t, s) => t.setups.find(r => r.id === `${s}/${rule}`);
const pts = SETUPS.map(s => {
  const [m, effort, , n] = s.split(':');
  const a = row(v1, s), b = row(v2, s), cr = v2.methods.find(r => r.id === `CRall/${s}/${rule}/${Q}`);
  const usdPhoto = CLEAN_USD[s] ?? b.usd_per_photo;
  const rep = v2.repeat.find(r => r.setup === s && r.rule === rule);
  return {
    s, m, effort, n20: !!n, frozen: s === lead(m), label: `${name(m)} ${effort}${n ? ', calls of 20' : ''}`,
    old: a.exact, exact: b.exact, keep: b.keep, drop: b.drop_recall, within1: b.within1,
    usdPhoto, usdKept: usdPhoto * cr.fill.judged / cr.kept, repeat: rep?.exact ?? null,
  };
});
const pct = x => (x == null ? '-' : `${(x * 100).toFixed(1)}%`);
const usd = x => `USD ${x.toFixed(4)}`;

// ---- The chart: exact difficulty step on key v2 against USD per kept photo (log scale). ----
const W = 900, H = 560, M = { l: 64, r: 150, t: 128, b: 70 };
const X0 = Math.log10(0.0015), X1 = Math.log10(0.1), Y0 = 0.35, Y1 = 0.9;
const x = v => M.l + (Math.log10(v) - X0) / (X1 - X0) * (W - M.l - M.r);
const y = v => H - M.b - (v - Y0) / (Y1 - Y0) * (H - M.t - M.b);
const C = { ground: '#FAFAF5', ink: '#1F1F1F', sub: '#5C5C5C', axis: '#7A7A7A', grid: '#E6E6DF', ctx: '#A3A39A', faint: '#CFCFC6', accent: '#0072B2' };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const t = (px, py, s, o = {}) => `<text x="${px.toFixed(1)}" y="${py.toFixed(1)}" fill="${o.fill ?? C.axis}" font-size="${o.size ?? 13}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.weight ? ` font-weight="${o.weight}"` : ''}>${esc(s)}</text>`;
// Label offsets, set by eye on the rendered file so no two labels touch.
const NUDGE = { 'opus:high:V1:n20': [-10, -8, 'end'], 'sonnet:high:V1:n20': [0, -12, 'middle'], 'opus:high:V1': [9, -6], 'opus:medium:V1': [8, 12], 'sonnet:xhigh:V1': [8, 12], 'sonnet:medium:V1': [-8, 16, 'end'], 'haiku:xhigh:V1': [8, 4], 'haiku:high:V1': [8, -6], 'haiku:medium:V1': [8, 12] };
const haiku = pts.find(p => p.s === lead('haiku')), opus = pts.find(p => p.s === lead('opus'));
const parts = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'Roboto Condensed', 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif" style="font-variant-numeric: tabular-nums">`,
  `<rect width="${W}" height="${H}" fill="${C.ground}"/>`,
  t(24, 40, `On key v2, Haiku comes within ${Math.round((opus.exact - haiku.exact) * 100)} points of Opus at 1/${(opus.usdKept / haiku.usdKept).toFixed(0)} of the cost`, { fill: C.ink, size: 22, weight: 700 }),
  t(24, 66, 'Each dot is one judge set-up, V1, rule P. Height: the share of photos that both keep where the judge gives the', { fill: C.sub, size: 14 }),
  t(24, 84, "owner's exact difficulty step. Across: USD per kept photo at quota Q332, judging every key photo (log scale).", { fill: C.sub, size: 14 }),
  t(24, 102, 'Blue: the 3 frozen set-ups (high, calls of 20). The pale dot below each is the same set-up on the old key.', { fill: C.sub, size: 14 }),
];
for (const v of [0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) parts.push(`<line x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}" stroke="${C.grid}"/>`, t(M.l - 8, y(v) + 4, `${v * 100}%`, { anchor: 'end' }));
for (const v of [0.002, 0.005, 0.01, 0.02, 0.05, 0.1]) parts.push(`<line x1="${x(v)}" x2="${x(v)}" y1="${M.t}" y2="${H - M.b}" stroke="${C.grid}"/>`, t(x(v), H - M.b + 20, `$${v}`, { anchor: 'middle' }));
parts.push(t((M.l + W - M.r) / 2, H - M.b + 44, 'USD per kept photo', { anchor: 'middle', size: 12 }));
parts.push(`<line x1="${M.l}" x2="${W - M.r}" y1="${y(0.8)}" y2="${y(0.8)}" stroke="${C.sub}" stroke-dasharray="4 4"/>`, t(M.l + 6, y(0.8) - 6, 'Gate, 80%', { fill: C.sub, size: 12 }));
for (const p of [...pts].sort((a, b) => a.frozen - b.frozen)) {
  const col = p.frozen ? C.accent : C.ctx, px = x(p.usdKept);
  parts.push(`<line x1="${px}" x2="${px}" y1="${y(p.old)}" y2="${y(p.exact)}" stroke="${p.frozen ? C.accent : C.faint}" stroke-width="1" opacity="${p.frozen ? 0.5 : 1}"/>`);
  parts.push(`<circle cx="${px}" cy="${y(p.old)}" r="3" fill="${C.faint}"/>`);
  parts.push(`<circle cx="${px}" cy="${y(p.exact)}" r="${p.frozen ? 6 : 4.5}" fill="${col}"/>`);
  const [dx, dy, anchor] = NUDGE[p.s] ?? [9, 4];
  parts.push(t(px + dx, y(p.exact) + dy, `${p.label} ${pct(p.exact)}`, { fill: p.frozen ? C.accent : C.sub, size: p.frozen ? 13 : 12, weight: p.frozen ? 700 : null, anchor }));
}
// The annotation: the gap the title names, between the frozen Haiku and Opus dots.
const ax = (x(haiku.usdKept) + x(opus.usdKept)) / 2, ay = y(0.86);
parts.push(`<path d="M ${ax - 70} ${ay + 6} Q ${x(haiku.usdKept) + 10} ${ay + 14} ${x(haiku.usdKept) + 4} ${y(haiku.exact) - 10}" fill="none" stroke="${C.sub}" stroke-width="1"/>`);
parts.push(t(ax - 76, ay, `${(opus.usdKept / haiku.usdKept).toFixed(0)} times cheaper per kept photo, ${Math.round((opus.exact - haiku.exact) * 100)} points lower`, { fill: C.ink, size: 13, anchor: 'start' }));
parts.push(t(24, H - 14, 'Source: Dendro intake eval, tables/key-v2 and tables/key, 211 key photos. Chart: report.mjs', { fill: C.axis, size: 11 }));
parts.push('</svg>');
fs.writeFileSync(path.join(EVAL, 'tables', 'key-v2', 'setups.svg'), parts.join('\n') + '\n');

// ---- The key section of report.md. ----
const ex = examples.count, sameAsBefore = relabel.photos.filter(r => r.label.keep === r.before.keep && (!r.label.keep || r.label.step === r.before.step)).length;
const selfKeep = relabel.photos.filter(r => r.label.keep === r.before.keep).length;
const bothKept = relabel.photos.filter(r => r.label.keep && r.before.keep), selfExact = bothKept.filter(r => r.label.step === r.before.step).length;
const thin = v2.setups.filter(r => r.thin_cell.length).length, doubts = Object.values(v2.species_doubt).flat().length;
const passing = rows => rows.filter(r => r.gates).length;
// ---- The held-out set (Task 11). Every number comes from tables/heldout/, tables/key-v2/, heldout/, key/, and runs/. ----
const ho = readJson(path.join(EVAL, 'tables', 'heldout', 'table.json'));
const pools0 = readJson(path.join(EVAL, 'heldout', 'pools.json'));
const featureCheck = readJson(path.join(EVAL, 'key', 'feature-check.json'));
const dec = ho.decision, rep = ho.owner_repeat;
const hoRow = id => ho.setups.find(r => r.id === id);
const hoMethod = id => ho.methods.find(r => r.id === id);
const shortId = id => { const [meth, s] = id.split('/'); return `${name(modelOf(s))} ${meth}`; };
const modelOf = s => s.split(':')[0];
const pts1 = x => `${(x * 100).toFixed(1)}`;
const HO_SETUPS = MODELS.flatMap(m => [`${lead(m)}/${rule}`, ...(hoRow(`${lead(m)}/${rule}/F`) ? [`${lead(m)}/${rule}/F`] : [])]);
const hoLabel = id => `${name(modelOf(id))}${id.endsWith('/F') ? ', Haiku reject pass first' : ''}`;
const cand = dec.candidate && hoMethod(dec.candidate);
const passSet = new Set(HO_SETUPS.filter(id => heldoutCheck(hoRow(id), rep)));
// A set-up row is on the shortlist when one of its ranking methods is: FR for the /F rows, R or CR for the others.
const onShortlist = id => dec.shortlist.some(x => x.split('/')[1] === lead(modelOf(id)) && (id.endsWith('/F') ? x.startsWith('FR/') : !x.startsWith('FR/')));
const pctN = x => `${+(x * 100).toFixed(1)}%`;
const gatesText = `drop recall ${pctN(GATES.drop_recall)}, keep agreement ${pctN(GATES.keep)}, exact difficulty step ${pctN(GATES.exact)}, and within one ${pctN(GATES.within1)}`;
const quotaText = q => { const c = config.quotas[q]; return `${c[1]}, ${c[2]}, and ${c[3]} photos at difficulty steps 1, 2, and 3, with ${c.usual_look_min} or more of the usual look at step 1`; };
const HOW = { CR: 'the code order picks the photos', R: 'a ranking agent picks the photos', FR: 'Haiku drops its rejects first, and a ranking agent picks the photos', S: 'the photos are kept in fetch order', F: 'Haiku drops its rejects first, and the photos are kept in fetch order' };
const keyV2Row = id => v2.setups.find(r => r.id === id);
const shortModels = MODELS.filter(m => dec.shortlist.some(id => id.includes(`/${lead(m)}/`)));
const outModels = MODELS.filter(m => !shortModels.includes(m));
const exactLine = dec.best.exact - MARGIN, keepLine = dec.best.keep - MARGIN;
const all = (m, q = Q) => hoMethod(`CRall/${lead(m)}/${rule}/${q}`);
const sameSetup = dec.candidate ? ho.methods.filter(r => r.setup === cand.setup && r.quota === Q && dec.shortlist.includes(r.id)) : [];

// The held-out chart: keep and exact difficulty step per set-up, with the bar of heldoutCheck.
{
  const W2 = 900, H2 = 470, L = 250, PW = 250, GAP = 90, T = 150, RH = 46;
  const X0h = 0.4, X1h = 1.0;
  const xp = (panel, v) => L + panel * (PW + GAP) + (v - X0h) / (X1h - X0h) * PW;
  const rows = [...HO_SETUPS].sort((a, b) => hoRow(b).exact - hoRow(a).exact);
  const yr = i => T + 24 + i * RH;
  const accent = id => dec.candidate && id === `${cand.setup}/${rule}`;
  const s = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W2} ${H2}" width="${W2}" height="${H2}" font-family="'Roboto Condensed', 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif" style="font-variant-numeric: tabular-nums">`,
    `<rect width="${W2}" height="${H2}" fill="${C.ground}"/>`,
    t(24, 40, dec.candidate ? `Of the shortlist, only ${name(modelOf(cand.setup))} clears the owner's bar on the held-out set` : 'No shortlisted set-up clears the owner\'s bar on the held-out set', { fill: C.ink, size: 22, weight: 700 }),
    t(24, 66, `Each dot is one frozen judge set-up on the ${ho.setups[0].photos} held-out photos (V1, rule ${rule}). Left: the share of photos where keep or drop`, { fill: C.sub, size: 14 }),
    t(24, 84, "agrees with the owner. Right: the owner's exact difficulty step, on the photos that both keep. The dashed line is the bar", { fill: C.sub, size: 14 }),
    t(24, 102, `of heldoutCheck: ${+(MARGIN * 100).toFixed(1)} points below the owner's own repeat agreement (the thin line), from ${rep.n} photos labelled twice.`, { fill: C.sub, size: 14 }),
  ];
  for (const [panel, f, label] of [[0, 'keep', 'Keep agreement'], [1, 'exact', 'Exact difficulty step']]) {
    s.push(t(xp(panel, X0h), T - 8, label, { fill: C.ink, size: 14, weight: 700 }));
    for (const v of [0.4, 0.6, 0.8, 1.0]) s.push(`<line x1="${xp(panel, v)}" x2="${xp(panel, v)}" y1="${T}" y2="${yr(rows.length - 1) + 22}" stroke="${C.grid}"/>`, t(xp(panel, v), yr(rows.length - 1) + 40, `${v * 100}%`, { anchor: 'middle' }));
    s.push(`<line x1="${xp(panel, rep[f])}" x2="${xp(panel, rep[f])}" y1="${T}" y2="${yr(rows.length - 1) + 22}" stroke="${C.sub}" stroke-width="1"/>`);
    s.push(`<line x1="${xp(panel, dec.bar[f])}" x2="${xp(panel, dec.bar[f])}" y1="${T}" y2="${yr(rows.length - 1) + 22}" stroke="${C.sub}" stroke-dasharray="4 4"/>`);
    s.push(t(xp(panel, rep[f]) + 4, T + 10, `owner ${pct(rep[f])}`, { fill: C.sub, size: 11 }));
    rows.forEach((id, i) => {
      const r = hoRow(id), col = accent(id) ? C.accent : C.ctx;
      s.push(`<line x1="${xp(panel, dec.bar[f])}" x2="${xp(panel, r[f])}" y1="${yr(i)}" y2="${yr(i)}" stroke="${accent(id) ? C.accent : C.faint}" stroke-width="2"/>`);
      s.push(`<circle cx="${xp(panel, r[f])}" cy="${yr(i)}" r="${accent(id) ? 6 : 5}" fill="${col}"/>`);
      const gap = dec.bar[f] - r[f], short = gap > 1e-9 ? `${gap < 0.001 ? `${((gap) * 100).toFixed(2)}` : pts1(gap)} points short, ${pct(r[f])}` : pct(r[f]);
      s.push(t(xp(panel, r[f]) + (r[f] >= dec.bar[f] ? 10 : -10), yr(i) + 4, short, { fill: accent(id) ? C.accent : C.sub, size: 12, weight: accent(id) ? 700 : null, anchor: r[f] >= dec.bar[f] ? null : 'end' }));
    });
  }
  rows.forEach((id, i) => {
    const onShort = onShortlist(id);
    s.push(t(24, yr(i) + 4, hoLabel(id), { fill: accent(id) ? C.accent : C.ink, size: 13, weight: accent(id) ? 700 : null }));
    s.push(t(24, yr(i) + 18, onShort ? 'on the shortlist' : 'not on the shortlist (key v2)', { fill: C.axis, size: 11 }));
  });
  s.push(t(24, H2 - 14, `Source: Dendro intake eval, tables/heldout and heldout/repeat.json, ${ho.setups[0].photos} held-out photos. Chart: report.mjs`, { fill: C.axis, size: 11 }));
  s.push('</svg>');
  fs.mkdirSync(path.join(EVAL, 'tables', 'heldout'), { recursive: true });
  fs.writeFileSync(path.join(EVAL, 'tables', 'heldout', 'setups.svg'), s.join('\n') + '\n');
}

// The costs per phase: tokens and USD from runs/*/tokens.json. A job whose agents an earlier run already
// counted (key-rank-high reuses 27 jobs of key-rank) counts once.
// ESTIMATES: the USD the owner said yes to, or the plan's estimate, from NOTES.md and the plan's rulings.
const PHASES = [
  { task: 'Task 3', work: 'The tracer', runs: ['tracer'], est: { usd: 0.81, lo: 0.40, hi: 1.62, agents: 10, src: 'first estimate, NOTES.md Task 2' } },
  { task: 'Task 3', work: 'The effort tracer', runs: ['tracer-effort'], est: null },
  { task: 'Task 5', work: 'Key judge runs: V1 and V2, calls of 20, effort', runs: ['key-judge', 'key-batch20', 'key-effort'], est: { usd: 56, lo: 41, hi: 87, agents: 297, src: "the owner's yes of 2026-10-23" } },
  { task: 'Task 6', work: 'Key repeat and rankings', runs: ['key-n20', 'key-repeat', 'key-rank', 'key-repeat-high', 'key-rank-high'], est: { usd: 36, lo: 27, hi: 54, agents: 171, src: "the owner's yes of 2026-10-23" } },
  { task: 'Task 9', work: 'Held-out judge and rankings', runs: ['heldout-judge', 'heldout-rank'], est: { usd: 11.8, lo: null, hi: 17.7, agents: 81, src: "the owner's yes of 2026-11-04 (cap 17.7)" } },
];
const seenAgents = new Set();
for (const ph of PHASES) {
  Object.assign(ph, { agents: 0, usd: 0, tokens: 0, output: 0 });
  for (const run of ph.runs) {
    const res = readJson(path.join(EVAL, 'runs', run, 'results.json')), tk = readJson(path.join(EVAL, 'runs', run, 'tokens.json'));
    for (const j of res.jobs) {
      const fresh = (j.agentIds ?? []).filter(a => !seenAgents.has(a));
      if (j.agentIds?.length && !fresh.length) continue;
      fresh.forEach(a => seenAgents.add(a));
      ph.agents += fresh.length;
      const x = tk[j.label];
      if (x) { ph.usd += x.usd; ph.tokens += x.tokens; ph.output += x.output; }
    }
  }
}
const sum = f => PHASES.reduce((s, p) => s + p[f], 0);
const mtok = x => `${(x / 1e6).toFixed(1)}M`;
const usd2 = x => `USD ${x.toFixed(2)}`;

// How often the top photo of "all" comes after photo K.
const afterK = MODELS.flatMap(m => config.ks.filter(K => K !== 'all').flatMap(K => ['R', 'CR'].map(meth => ({ m, K, meth, r: hoMethod(`${meth}${K}/${lead(m)}/${rule}/${Q}`) }))));
const cellsOfAll = Object.keys(hoMethod(`Rall/${lead('opus')}/${rule}/${Q}`).cells).length;

// The owner's photo calls on the held-out set.
const labels = readJson(path.join(EVAL, 'heldout', 'labels.json')), bestPhotos = readJson(path.join(EVAL, 'heldout', 'best.json'));
const nLabels = Object.keys(labels).length, nKept = Object.values(labels).filter(l => l.keep).length;
const partCount = p => Object.values(labels).filter(l => l.part === p).length;
const hoThin = ho.setups.filter(r => r.thin_cell.length).length, hoDoubts = Object.values(ho.species_doubt).flat().length;
const fc = featureCheck.compare.setups;
const methodLine = r => `| ${r.method} | ${name(modelOf(r.setup))} | ${r.fill.judged} | ${r.ranked} | ${pct(r.fill.share)} | ${r.picks.n} | ${pct(r.picks.kept)} | ${pct(r.picks.step)} | ${pct(r.top_pick)} | ${pct(r.best_after_k)} | ${r.usd == null ? '-' : usd2(r.usd)} | ${r.usd_per_photo == null ? '-' : usd(r.usd_per_photo)} | ${r.usd_per_kept == null ? '-' : usd(r.usd_per_kept)} | ${r.tokens_per_kept == null ? '-' : Math.round(r.tokens_per_kept).toLocaleString('en-US')} |`;
const METHOD_ORDER = ['S', 'F', ...config.ks.map(K => `R${K}`), 'FR', ...config.ks.map(K => `CR${K}`)];
const methodRowsOf = q => MODELS.flatMap(m => METHOD_ORDER.map(meth => hoMethod(`${meth}/${lead(m)}/${rule}/${q}`)).filter(Boolean));
const sourceRows = Object.entries(hoRow(`${lead('opus')}/${rule}`).source_yield).sort((a, b) => b[1].photos - a[1].photos);
const ownerYield = Object.fromEntries(sourceRows.map(([s]) => [s, { photos: 0, kept: 0 }]));
for (const c of pools0.cells) for (const p of c.photos) { const o = ownerYield[p.source] ?? (ownerYield[p.source] = { photos: 0, kept: 0 }); o.photos++; if (labels[p.key].keep) o.kept++; }

// From NOTES.md (Task 5, part 2) and the plan ("Summary of agents and cost"): not in any table.
// The owner's ruling of 2026-11-13 on the method (docs/decisions/2026-11-13-intake-method.md).
const RULING = { method: 'FR', model: 'sonnet', date: '2026-11-13' };
const ruled = hoMethod(`${RULING.method}/${lead(RULING.model)}/${rule}/${Q}`);
const FIRST_ATTEMPTS_USD = 3.07, PLAN_TOTAL = { usd: 119, lo: 89, hi: 179, agents: 595 };
const cellPts = 1 / Object.keys(bestPhotos).length;
const dropV2 = MODELS.map(m => keyV2Row(`${lead(m)}/${rule}`).exact - hoRow(`${lead(m)}/${rule}`).exact);
const repeatKey = MODELS.map(m => v2.repeat.find(r => r.setup === lead(m) && r.rule === rule).exact);
const after20 = afterK.filter(a => a.K === config.ks[0]).map(a => a.r.best_after_k);
const sizes = pools0.cells.map(c => c.photos.length);
const genera = [...new Set(pools0.cells.map(c => c.species.split(' ')[0]))];

const md = [
  '# Intake eval: report',
  '',
  `The report of the intake eval, phases 1 to 3 (plan \`docs/superpowers/plans/2026-10-21-intake-eval.md\`). Written by \`report.mjs\` from the tables. The owner rules on the method; the decision record goes in \`docs/decisions/\`.`,
  '',
  '## The result',
  '',
  `- **Owner ruling ${RULING.date}: ${name(RULING.model)} ${RULING.method}** (\`docs/decisions/2026-11-13-intake-method.md\`). Haiku drops its rejects, ${name(RULING.model)} at \`${frozen.effort[RULING.model]}\` judges the rest, and a ${name(RULING.model)} agent ranks each cell. Of the ${ruled.picks.n} photos it picks for the ${Q} quota on the held-out set, the owner kept ${pct(ruled.picks.kept)}, and ${pct(ruled.picks.step)} are at the owner's difficulty step, at ${usd(ruled.usd_per_kept)} per kept photo. It fills ${pct(ruled.fill.share)} of the quota slots. The owner prefers too few photos to bad ones. This overrules the result of the decision rule below: ${name(RULING.model)} missed the shortlist on key v2, but passes \`heldoutCheck\` on the held-out set.`,
  `- **The decision rule gives ${dec.candidate ? `${shortId(dec.candidate)}` : 'no candidate'}**${dec.candidate ? `: ${name(modelOf(cand.setup))} at \`${frozen.effort[modelOf(cand.setup)]}\` judges ${/\d+$/.test(cand.method) ? `the first ${cand.method.match(/\d+$/)[0]}` : 'all the'} photos of each species pool, and ${HOW[cand.method.replace(/(\d+|all)$/, '')]}. On the held-out set it costs ${usd(cand.usd_per_kept)} per kept photo, with keep ${pct(cand.keep)} and exact difficulty step ${pct(cand.exact)}, against a bar of ${pct(dec.bar.keep)} and ${pct(dec.bar.exact)}` : ''}.`,
  ...(dec.candidate ? [`- **But it fills only ${pct(cand.fill.share)} of the quota slots** (${cand.fill.filled} of ${cand.fill.slots}), because it judges ${cand.fill.judged} of the ${ho.setups[0].photos} photos. The same set-up over all photos (${shortId(all('opus').id)}) fills ${pct(all('opus').fill.share)} at ${usd(all('opus').usd_per_kept)} per kept photo. The rule ranks by USD per kept photo, and a small K keeps fewer photos for less. The owner rules on this.`] : []),
  `- **Haiku fails the check** on the exact difficulty step: ${pct(hoRow(`${lead('haiku')}/${rule}`).exact)} against the bar of ${pct(dec.bar.exact)}, ${pts1(dec.bar.exact - hoRow(`${lead('haiku')}/${rule}`).exact)} points short. Its keep agreement passes (${pct(hoRow(`${lead('haiku')}/${rule}`).keep)}). Haiku costs ${usd(all('haiku').usd_per_kept)} per kept photo over all photos, ${(all('opus').usd_per_kept / all('haiku').usd_per_kept).toFixed(0)} times less than Opus.`,
  ...outModels.map(m => `- **${name(m)} is not on the shortlist**: on key v2 its exact difficulty step is ${pct(keyV2Row(`${lead(m)}/${rule}`).exact)}, below the line of ${pct(exactLine)} (${+(MARGIN * 100).toFixed(1)} points under the best, ${pct(dec.best.exact)}). On the held-out set it ${passSet.has(`${lead(m)}/${rule}`) ? 'passes' : 'fails'} the check (keep ${pct(hoRow(`${lead(m)}/${rule}`).keep)}, exact ${pct(hoRow(`${lead(m)}/${rule}`).exact)}) at ${usd(all(m).usd_per_kept)} per kept photo over all photos.`),
  `- **The owner's own bar is soft.** The owner agrees with the owner on keep for ${pct(rep.keep)} of ${rep.n} photos and on the exact difficulty step for ${pct(rep.exact)} of the ${rep.both} photos kept both times. One photo moves exact by ${pts1(1 / rep.both)} points, so the bar has an error of several points.`,
  `- **No set-up passes the fixed gates**, on the key or on key v2 (owner ruling 2026-10-27, item 4, below).`,
  '',
  '## The key',
  '',
  '### The result',
  '',
  `- No judge set-up passes the fixed gates on the key, on the old labels (${passing(v1.methods)} method rows) or on key v2 (${passing(v2.methods)}). The gates are ${gatesText}.`,
  `- The owner's own labels move. On the ${relabel.photos.length} key photos that the owner relabelled blind, the old and the new label agree on keep for ${pct(selfKeep / relabel.photos.length)} of the photos and on the exact difficulty step for ${pct(selfExact / bothKept.length)} of the ${bothKept.length} photos kept both times. On those photos the judges agree with the owner about as well as the owner agrees with the owner (NOTES.md, Task 7).`,
  `- Owner ruling 2026-10-27 (plan, "Rulings of 2026-10-27", item 4): freeze without a pass of the fixed gates. Task 11 judges the held-out run against the owner's own repeat agreement (\`heldoutCheck\`). No third prompt variant.`,
  `- **The freeze** (\`frozen.json\`): variant ${frozen.variant}, rule ${frozen.rule}, calls of ${frozen.batch}, ${MODELS.map(m => `${name(m)} \`${frozen.effort[m]}\``).join(', ')}. The sha256 of ${Object.keys(frozen.sha256).map(f => `\`${f}\``).join(', ')} are in the file, and \`freeze.mjs --check\` tests them before the held-out run.`,
  '',
  '### Key v2',
  '',
  `Key v2 is the owner's labels of 2026-10-11 with two later sets of calls on top (\`lib/key-v2.mjs\`). It is the key table of this report. The old key is next to it.`,
  '',
  `1. The examples sheet: the ${examples.photos.length} photos where the 3 frozen set-ups agree with each other and not with the owner. The owner saw the judges' answers and chose "Judges are right" for ${ex.judges}, "My call stands" for ${ex.mine}, and "Could be either" for ${ex.either}. Key v2 takes the judges' call for the first group.`,
  `2. The blind relabel: the other ${relabel.photos.length} photos where any frozen set-up differs from the owner. The page showed no earlier label and no judge answer, and a legend of the difficulty steps. ${sameAsBefore} of ${relabel.photos.length} labels are the same as before.`,
  '',
  `Key v2 is not blind on the first group: on that sheet the owner saw the judges' answers. So key v2 can lean toward the judges on up to ${ex.judges} photos. On the blind group, the judges agree with the new labels about as well as with the old ones (NOTES.md, Task 7).`,
  '',
  '### The set-ups',
  '',
  `V1, rule ${rule}. Agreement is against key v2; "old key" is the exact difficulty step against the labels of 2026-10-11. Repeat: two runs of the same set-up agree on the exact difficulty step. USD per kept photo: method CR over all photos, quota ${Q}. The USD of the \`medium\` and \`xhigh\` set-ups is from one attempt of each job.`,
  '',
  '| set-up | exact, old key | exact, key v2 | keep | drop recall | within one | repeat, exact | USD per photo | USD per kept photo |',
  '|---|---|---|---|---|---|---|---|---|',
  ...pts.map(p => `| ${p.frozen ? `**${p.label} (frozen)**` : p.label} | ${pct(p.old)} | ${pct(p.exact)} | ${pct(p.keep)} | ${pct(p.drop)} | ${pct(p.within1)} | ${pct(p.repeat)} | ${usd(p.usdPhoto)} | ${usd(p.usdKept)} |`),
  '',
  '![Exact difficulty step on key v2 against USD per kept photo, for each judge set-up](tables/key-v2/setups.svg)',
  '',
  'What the chart shows:',
  '',
  `- Key v2 lifts every set-up by ${Math.round(Math.min(...pts.map(p => p.exact - p.old)) * 100)} to ${Math.round(Math.max(...pts.map(p => p.exact - p.old)) * 100)} points. Most of the gap on the old key was in the labels.`,
  ...MODELS.map(m => {
    const mine = pts.filter(p => p.m === m), f = mine.find(p => p.frozen), best = mine.every(p => p.exact <= f.exact), cheap = mine.filter(p => p.usdKept < f.usdKept);
    return `- ${name(m)}: calls of 20 ${best ? 'give the best exact difficulty step' : 'do not give the best exact difficulty step'}${cheap.length ? `, but ${cheap.map(p => `${p.effort} at calls of 10 (${usd(p.usdKept)})`).join(' and ')} cost${cheap.length === 1 ? 's' : ''} less per kept photo` : ', at the lowest USD per kept photo'}.`;
  }),
  `- More effort does not buy accuracy: \`xhigh\` is ${MODELS.every(m => pts.find(p => p.s === `${m}:xhigh:V1`).exact < pts.find(p => p.s === `${m}:high:V1`).exact) ? 'below' : 'not always above'} \`high\` at calls of 10 for all 3 models, and costs more.`,
  `- Haiku, frozen, is ${Math.round((opus.exact - haiku.exact) * 100)} points below Opus, frozen, at ${(opus.usdKept / haiku.usdKept).toFixed(0)} times less per kept photo. The decision rule (within 5 points, the cheapest wins) runs on the held-out set in Task 11, not here.`,
  '',
  '### Photo calls for the owner',
  '',
  `- Thin-cell photos: ${thin ? `${thin} set-up rows have one` : 'none. No set-up row has a thin-cell photo'}.`,
  `- Species doubts: ${doubts ? `${doubts}` : 'none. No answer has a `mismatch` escalation or a `hybrid` reject'}. So the review sheet of these photos had no photo.`,
  `- The owner's answers: \`key/gate-examples.json\` and \`key/relabel.json\`.`,
  '',
  '### Limits',
  '',
  '- The key is small (211 photos, 21 cells), and the rule and the variant were chosen on it. The held-out set is the test.',
  `- The ${relabel.photos.length} relabelled photos are the photos where a judge differed from the owner, so they are harder than a random sample. On a random ${rep.n} held-out photos, Task 10 measured it: see the held-out set.`,
  '',
  '## The held-out set',
  '',
  `${ho.setups[0].photos} photos of ${pools0.cells.length} species, in fetch order: ${pools0.cells.map(c => `${c.target} ${c.photos.length}`).join(', ')}. The owner labelled every photo blind (part, keep, difficulty step) and picked the best photo of each of the ${Object.keys(bestPhotos).length} cells. The frozen set-ups judged them in calls of 20 (Task 9). Each photo goes in the cell of the judge's part, and a photo that the owner or the judge puts in the part \`other\` is a reject for keep. The tables: \`tables/heldout/\`.`,
  '',
  `The Haiku reject pass of F and FR drops Haiku's rejects under rule K3, because the FR ranking jobs ran on that set (plan choice 8). Before Task 11 the replay used its own rule there. The key tables use K3 for the reject pass too, so the /F, F, and FR rows of \`tables/key/\` and \`tables/key-v2/\` changed in Task 11, and no other row.`,
  '',
  '### The set-ups',
  '',
  `Agreement is against the owner's blind labels. Part: the judge's part against the owner's on every photo. "Kept, other part": photos that both keep, in different parts.`,
  '',
  '| set-up | keep | drop recall | exact difficulty step | within one | part | kept, other part | USD per photo | minutes per 100 photos | check |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...HO_SETUPS.map(id => { const r = hoRow(id); return `| ${hoLabel(id)} | ${pct(r.keep)} | ${pct(r.drop_recall)} | ${pct(r.exact)} | ${pct(r.within1)} | ${pct(r.part)} | ${r.kept_other_part} | ${usd(r.usd_per_photo)} | ${r.minutes_per_100.toFixed(1)} | ${passSet.has(id) ? 'pass' : 'fail'} |`; }),
  `| The owner, repeat (${rep.n} photos) | ${pct(rep.keep)} | - | ${pct(rep.exact)} | ${pct(rep.within1)} | ${pct(rep.part)} | - | - | - | - |`,
  '',
  '![Keep agreement and exact difficulty step of each frozen set-up on the held-out set, against the bar of heldoutCheck](tables/heldout/setups.svg)',
  '',
  'What the chart shows:',
  '',
  `- All ${HO_SETUPS.length} set-up rows pass the keep bar (${pct(dec.bar.keep)}): keep runs from ${pct(Math.min(...HO_SETUPS.map(id => hoRow(id).keep)))} to ${pct(Math.max(...HO_SETUPS.map(id => hoRow(id).keep)))}.`,
  `- The exact difficulty step decides the check. Haiku is ${pts1(dec.bar.exact - hoRow(`${lead('haiku')}/${rule}`).exact)} points under the bar, about ${((dec.bar.exact - hoRow(`${lead('haiku')}/${rule}`).exact) * hoRow(`${lead('haiku')}/${rule}`).both).toFixed(1)} of its ${hoRow(`${lead('haiku')}/${rule}`).both} photos kept by both.`,
  `- Every frozen set-up is ${Math.round(Math.min(...dropV2) * 100)} to ${Math.round(Math.max(...dropV2) * 100)} points lower on exact difficulty step than on key v2 (Opus ${pct(keyV2Row(`${lead('opus')}/${rule}`).exact)} on key v2, ${pct(hoRow(`${lead('opus')}/${rule}`).exact)} here). Key v2 holds the owner's later calls, some made with the judges' answers on the page; the held-out labels are blind.`,
  '',
  '### The methods',
  '',
  `Quota ${Q} (${quotaText(Q)}) on every cell: ${ho.methods.find(r => r.quota === Q).fill.slots} slots, ${ho.methods.find(r => r.quota === Q).fill.slots / 3} cells × 3 difficulty steps. Keep and the difficulty step belong to the set-up (plan choice 15), so the methods differ in cost, quota fill, and top pick. R and CR at K judge the first K photos of each species pool. "Top of all after K": the share of cells where the top photo of R or CR over all photos comes after photo K. The ranking cost is the line a + b × n from the held-out ranking jobs (plan choice 11). F and FR have no Haiku row (plan choice 10).`,
  '',
  '| method | judge | judged | ranked | quota fill | photos picked | picks the owner kept | picks at the owner\'s step | top pick | top of all after K | USD | USD per photo | USD per kept photo | tokens per kept photo |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...methodRowsOf(Q).map(methodLine),
  '',
  `Quota Q221 (${quotaText('Q221')}), the same columns: the quota fill and the USD per kept photo change; the agreement does not.`,
  '',
  '| method | judge | judged | ranked | quota fill | photos picked | picks the owner kept | picks at the owner\'s step | top pick | top of all after K | USD | USD per photo | USD per kept photo | tokens per kept photo |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...methodRowsOf('Q221').map(methodLine),
  '',
  `- Over all photos, no method fills more than ${pct(Math.max(...methodRowsOf(Q).map(r => r.fill.share)))} of the ${Q} slots: the pools do not hold 3 photos at every difficulty step of every cell. The owner kept ${nKept} of ${nLabels} photos.`,
  `- Top pick (the method's first photo at its lowest difficulty step is the owner's best photo), over ${Object.keys(bestPhotos).length} cells: best ${pct(Math.max(...methodRowsOf(Q).map(r => r.top_pick)))} (${methodRowsOf(Q).filter(r => r.top_pick === Math.max(...methodRowsOf(Q).map(x => x.top_pick))).map(r => `${name(modelOf(r.setup))} ${r.method}`).join(', ')}). One cell is ${pts1(cellPts)} points.`,
  '',
  `- Photos picked: the photos the method puts in the quota. "Picks the owner kept": the share of them that the owner kept in the same part. "Picks at the owner's step": the share that the owner kept in that part at the same difficulty step (owner request 2026-11-13).`,
  '',
  '### How often the best photo of "all" comes after photo K',
  '',
  `Of the ${cellsOfAll} cells, the share where the top photo of the method over all photos is not in the first K photos of its species pool:`,
  '',
  `| judge | ${config.ks.filter(K => K !== 'all').flatMap(K => [`R${K}`, `CR${K}`]).join(' | ')} |`,
  `|---|${config.ks.filter(K => K !== 'all').flatMap(() => ['---', '---']).join('|')}|`,
  ...MODELS.map(m => `| ${name(m)} | ${config.ks.filter(K => K !== 'all').flatMap(K => ['R', 'CR'].map(meth => pct(afterK.find(a => a.m === m && a.K === K && a.meth === meth).r.best_after_k))).join(' | ')} |`),
  '',
  `So at K = ${config.ks[0]} the method misses the photo it would pick over the whole pool in ${pct(Math.min(...after20))} to ${pct(Math.max(...after20))} of the cells. The species pools hold ${sizes.join(', ')} photos, so K = ${config.ks[0]} sees ${pct(config.ks[0] / Math.max(...sizes))} to ${pct(config.ks[0] / Math.min(...sizes))} of each pool.`,
  '',
  '### Source yield',
  '',
  `Per source, the photos and the kept photos (Opus, frozen, by difficulty step 1, 2, 3), with the owner's keeps next to them. "Cells filled": the cells whose ${Q} quota that source's kept photos fill alone.`,
  '',
  '| source | photos | Opus kept (1, 2, 3) | cells filled | owner kept |',
  '|---|---|---|---|---|',
  ...sourceRows.map(([s, y]) => `| ${s} | ${y.photos} | ${y.kept[1]}, ${y.kept[2]}, ${y.kept[3]} | ${y.cells_filled} | ${ownerYield[s].kept} of ${ownerYield[s].photos} |`),
  '',
  '## The decision rule, step by step',
  '',
  `1. **The fixed gates on the key** (${gatesText}): no row passes, on the old key (${passing(v1.methods)} method rows) or on key v2 (${passing(v2.methods)}). Owner ruling 2026-10-27, item 4: the shortlist leaves out the gates, and the held-out check uses the owner's repeat agreement.`,
  `2. **The shortlist, from key v2**: the ranking methods (R at each K, FR, CR at each K) of the 3 frozen set-ups, rule ${rule}, quota ${Q}, within ${+(MARGIN * 100).toFixed(1)} points of the best exact difficulty step (${pct(dec.best.exact)}, so ${pct(exactLine)} or more) and of the best keep (${pct(dec.best.keep)}, so ${pct(keepLine)} or more). ${dec.shortlist.length} rows: ${shortModels.map(m => `${name(m)} ${dec.shortlist.filter(id => id.includes(`/${lead(m)}/`)).map(id => id.split('/')[0]).join(', ')}`).join('; ')}.`,
  '',
  '   | set-up on key v2 | exact difficulty step | keep | on the shortlist |',
  '   |---|---|---|---|',
  ...HO_SETUPS.map(id => { const r = keyV2Row(id); return `   | ${hoLabel(id)} | ${pct(r.exact)} | ${pct(r.keep)} | ${onShortlist(id) ? 'yes' : 'no'} |`; }),
  '',
  `3. **The candidate**: the shortlisted row with the lowest USD per kept photo on the held-out set. 4. **The check** (\`heldoutCheck\`): keep ${pct(dec.bar.keep)} or more and exact difficulty step ${pct(dec.bar.exact)} or more, each 5 points under the owner's repeat agreement (${pct(rep.keep)}, ${pct(rep.exact)}). When a row fails, the next-cheapest gets the check:`,
  '',
  '   | checked, cheapest first | USD per kept photo | keep | exact difficulty step | check |',
  '   |---|---|---|---|---|',
  ...dec.checked.map(c => `   | ${shortId(c.id)} | ${usd(c.usd_per_kept)} | ${pct(c.keep)} | ${pct(c.exact)} | ${c.pass ? 'pass' : 'fail'} |`),
  '',
  `   Result: **${dec.candidate ? shortId(dec.candidate) : 'no candidate'}**.${sameSetup.length ? ` The other shortlisted rows of ${name(modelOf(cand.setup))}, at a higher USD per kept photo: ${sameSetup.filter(r => r.id !== dec.candidate).sort((a, b) => a.usd_per_kept - b.usd_per_kept).map(r => `${r.method} ${usd(r.usd_per_kept)}, fill ${pct(r.fill.share)}, ${heldoutCheck(r, rep) ? 'pass' : `fail (exact ${pct(r.exact)}, ${((dec.bar.exact - r.exact) * 100).toFixed(2)} points under the bar${r.method === 'FR' ? ', with the Haiku reject pass' : ''})`}`).join('; ')}.` : ''}`,
  `5. **The ruling** (${RULING.date}): **${name(RULING.model)} ${RULING.method}**, not the rule's ${dec.candidate ? shortId(dec.candidate) : 'result'}. The owner leans to accuracy and prefers too few photos to bad ones, so the owner judged the methods by the photos each one picks for the quota (the columns "picks the owner kept" and "picks at the owner's step" in the methods table), not by USD per kept photo alone.`,
  '',
  '## The costs per phase',
  '',
  `Tokens include cache reads and writes. USD is price-weighted (plan, "Global constraints"). A job whose agents an earlier run already counted counts once. The estimates are the USD the owner said yes to (NOTES.md and the plan's rulings).`,
  '',
  '| task | work | agents | tokens | output tokens | USD | estimate | agents in the estimate |',
  '|---|---|---|---|---|---|---|---|',
  ...PHASES.map(p => `| ${p.task} | ${p.work} | ${p.agents} | ${mtok(p.tokens)} | ${mtok(p.output)} | ${usd2(p.usd)} | ${p.est ? `${usd2(p.est.usd)}${p.est.lo != null ? ` (${p.est.lo.toFixed(2)} to ${p.est.hi.toFixed(2)})` : ''}, ${p.est.src}` : 'none: the owner asked for it'} | ${p.est ? `up to ${p.est.agents}` : '-'} |`),
  `| | All | ${sum('agents')} | ${mtok(sum('tokens'))} | ${mtok(sum('output'))} | ${usd2(sum('usd'))} | ${usd2(PHASES.filter(p => p.est).reduce((s, p) => s + p.est.usd, 0))}, the sum of the estimates | |`,
  '',
  `- No other task ran a judge or ranking agent, so no other task spent tokens on the eval. Code-review agents are not in this table.`,
  `- The plan's total was USD ${PLAN_TOTAL.usd} (${PLAN_TOTAL.lo} to ${PLAN_TOTAL.hi}) for up to ${PLAN_TOTAL.agents} agents. The eval spent ${usd2(sum('usd'))} on ${sum('agents')} agents. Most of each agent's cost is its fixed context, so calls of 20 cost less per photo than calls of 10 for Opus and Sonnet.`,
  `- Task 5 includes ${usd2(FIRST_ATTEMPTS_USD)} of first attempts that do not count, from the judges that went off task (NOTES.md, Task 5, part 2).`,
  '',
  "## The owner's photo calls",
  '',
  `- **Held-out labels** (\`heldout/labels.json\`, \`heldout/best.json\`): ${nLabels} of ${nLabels} labelled blind. Parts: ${[...CELL_PARTS, 'other'].map(p => `${p} ${partCount(p)}`).join(', ')}. Kept ${nKept}. A best photo for each of the ${Object.keys(bestPhotos).length} cells.`,
  `- **Repeat labels** (\`heldout/repeat.json\`): ${rep.n} photos a week later. Part ${pct(rep.part)}, keep ${pct(rep.keep)}, exact difficulty step ${pct(rep.exact)}, within one ${pct(rep.within1)}.`,
  `- **Thin-cell photos and species doubts on the held-out set**: ${hoThin ? `${hoThin} set-up rows have a thin-cell photo` : 'no thin-cell photo'}; ${hoDoubts ? `${hoDoubts} species doubts` : 'no `mismatch` escalation and no `hybrid` reject'}. So no review sheet was needed.`,
  `- **The feature check** (\`key/feature-check.json\`): ${featureCheck.photos.length} key photos, ${fc[lead('opus')].all.n} yes-or-no questions on the photo features. The frozen set-ups agree with the owner on ${MODELS.map(m => `${name(m)} ${pct(fc[lead(m)].all.agree / fc[lead(m)].all.n)}`).join(', ')}.`,
  `- **On the key**: the examples sheet (\`key/gate-examples.json\`) and the blind relabel (\`key/relabel.json\`), above.`,
  '',
  '## Limits',
  '',
  `- The held-out set is ${pools0.cells.length} species of ${genera.length} genera (${genera.join(' and ')}) and ${ho.setups[0].photos} photos. Top pick and quota fill rest on ${Object.keys(bestPhotos).length} cells, so one cell is ${pts1(cellPts)} points.`,
  `- The owner's repeat agreement is from ${rep.n} photos, ${rep.both} of them kept both times. The bar of the check moves ${pts1(1 / rep.both)} points per photo on exact difficulty step and ${pts1(1 / rep.n)} on keep.`,
  `- The key is small (${v2.setups.find(r => r.id === `${lead('opus')}/${rule}`).photos} photos) and anchored, and the variant, the rule, and the efforts were chosen on it. Key v2 is not blind on ${examples.count.judges} photos.`,
  `- Each set-up ran once on the held-out set. On the key, two runs of the same set-up agreed on the exact difficulty step for ${MODELS.map((m, i) => `${pct(repeatKey[i])} (${name(m)})`).join(', ')} of the photos kept both times, so a held-out score can move by several points from run to run.`,
  '- The ranking cost of R and FR at K = 20 and 30 is from the cost line, not from a ranking job of that size. R and FR over all photos also use the line.',
  '- USD per kept photo favours a small K: it judges fewer photos and keeps fewer. The rule does not weigh quota fill.',
  '',
].join('\n');
fs.writeFileSync(path.join(EVAL, 'report.md'), md);
console.log(`report.md, tables/key-v2/setups.svg, tables/heldout/setups.svg | ${pts.length} key set-ups | candidate ${dec.candidate}`);
