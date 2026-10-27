// node report.mjs  ->  report.md, tables/key-v2/setups.svg
// The report draft. Task 7 writes the key section; Task 11 adds the held-out set and the decision.
// Every number comes from tables/key/, tables/key-v2/, key/, and frozen.json, except CLEAN_USD below.
import path from 'node:path';
import fs from 'node:fs';
import { EVAL } from './lib/paths.mjs';
import { readJson } from './lib/data.mjs';

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
const lead = m => `${m}:${frozen.effort[m]}:${frozen.variant}:n${frozen.batch}`;
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
  t(24, 40, `On key v2, Haiku comes within ${Math.round((opus.exact - haiku.exact) * 100)} points of Opus at a tenth of the cost`, { fill: C.ink, size: 22, weight: 700 }),
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
const md = [
  '# Intake eval: report (draft)',
  '',
  `Task 7 wrote this draft, with the key section only. Task 11 adds the held-out set, the decision rule, and the costs. Written by \`report.mjs\`.`,
  '',
  '## The key',
  '',
  '### The result',
  '',
  `- No judge set-up passes the fixed gates on the key, on the old labels (${passing(v1.methods)} method rows) or on key v2 (${passing(v2.methods)}). The gates are drop recall 80%, keep agreement 85%, exact difficulty step 80%, and within one 97%.`,
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
  `- The ${relabel.photos.length} relabelled photos are the photos where a judge differed from the owner, so they are harder than a random sample. The owner's agreement with the owner on a random 40 comes in Task 10.`,
  '',
].join('\n');
fs.writeFileSync(path.join(EVAL, 'report.md'), md);
console.log(`report.md and tables/key-v2/setups.svg | ${pts.length} set-ups`);
