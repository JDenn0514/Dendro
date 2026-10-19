// node blind.mjs --round 1          builds round 1 (candidate against the blind opponent)
// node blind.mjs --round 2          builds round 2 (next-cheapest against the blind opponent)
// node blind.mjs --score <round>    scores a round from blind-r<round>.json
// blind-public.json holds only: target, species, two lists of photo numbers (n), and an opaque id per side.
// The row ids, and which side is which, stay in out/blind-key-r<round>.json.
import path from 'node:path';
import { EVAL, readJson, writeJson } from './lib/data.mjs';
import { mulberry32 } from './lib/seed.mjs';
import { blindOutcome } from './lib/score.mjs';

const args = process.argv.slice(2);
const scoring = args.includes('--score');
const round = Number(args[args.indexOf(scoring ? '--score' : '--round') + 1]);
if (!Number.isInteger(round) || round < 1) { console.error('usage: node blind.mjs --round <1|2> | --score <round>'); process.exit(1); }
const config = readJson(path.join(EVAL, 'config.json'));
const pools = readJson(path.join(EVAL, 'pools.json'));
const table = readJson(path.join(EVAL, 'out/table.json'));
const sl = readJson(path.join(EVAL, 'out/shortlist.json'));
const picksOf = (id, t) => {
  const row = table.rows.find(r => r.id === id);
  if (!row) throw new Error(`no row ${id} in out/table.json`);
  const per = row.per.find(p => p.target === t);
  if (!per) throw new Error(`row ${id} has no target ${t}`);
  return per.picks;
};
const decide = (winner, r) => {
  writeJson(path.join(EVAL, 'out/winner.json'), { winner, decided_in_round: r, qStar: sl.qStar, candidate: sl.candidate, best: sl.best, best_quality: sl.best_quality, next: sl.next, blind_needed: sl.blind_needed });
  console.log(`winner: ${winner} (round ${r})`);
};
const hex = rng => Math.floor(rng() * 0xffffffff).toString(16).padStart(8, '0');

if (!scoring) {
  // No blind check: the candidate keeps the opponent's sets, or there is no candidate.
  if (round === 1 && !sl.blind_needed) { decide(sl.candidate ?? sl.best, 0); process.exit(0); }
  const challenger = round === 1 ? sl.candidate : sl.next;
  if (!challenger) throw new Error(`round ${round}: no row to check`);
  const rng = mulberry32(config.seed + round);      // one draw per shown target, in pool order
  const idRng = mulberry32(config.seed + round + 7919); // opaque side ids, separate from the side draw
  const sides = {}, side_ids = {}, auto_same = [], targets = [];
  const nOf = key => Number(key.split('-').pop());
  for (const t of pools.targets) {
    const a = picksOf(challenger, t.target), b = picksOf(sl.best, t.target);
    if (a.length === b.length && a.every(k => b.includes(k))) { auto_same.push(t.target); continue; }
    const flip = rng() < 0.5;
    sides[t.target] = flip ? { L: challenger, R: sl.best } : { L: sl.best, R: challenger };
    side_ids[t.target] = { L: hex(idRng), R: hex(idRng) };
    const ns = id => picksOf(id, t.target).map(nOf).sort((x, y) => x - y);
    targets.push({ target: t.target, species: t.species, L: ns(sides[t.target].L), R: ns(sides[t.target].R), side: side_ids[t.target] });
  }
  writeJson(path.join(EVAL, 'blind-public.json'), { round, targets });
  writeJson(path.join(EVAL, `out/blind-key-r${round}.json`), { round, candidate: challenger, other: sl.best, sides, side_ids, auto_same });
  const sizes = targets.map(t => `${t.target} ${t.L.length}/${t.R.length}`).join(', ');
  console.log(`round ${round}: ${targets.length} targets to show, ${auto_same.length} same without a question`);
  console.log(`set sizes (left/right): ${sizes}`);
} else {
  const key = readJson(path.join(EVAL, `out/blind-key-r${round}.json`));
  const answers = readJson(path.join(EVAL, `blind-r${round}.json`)).answers ?? {};
  const missing = Object.keys(key.sides).filter(t => !answers[t]);
  if (missing.length) { console.error(`no answer for: ${missing.join(', ')}`); process.exit(1); }
  const o = blindOutcome(answers, key);
  writeJson(path.join(EVAL, `out/blind-result-r${round}.json`), { round, challenger: key.candidate, opponent: key.other, ...o });
  console.log(`round ${round}: ${key.candidate} ${o.cand}, ${key.other} ${o.other}, same ${o.same}`);
  if (o.candidateWins) decide(key.candidate, round);
  else if (round === 1 && sl.next) console.log('the candidate lost: run round 2 with --round 2');
  else decide(sl.best, round);
}
