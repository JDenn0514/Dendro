// The scores of the intake eval (intake spec Part 2, "Metrics") and the decision rule.
// steps: Map key -> { keep, step } from judgeSteps. owner: { [key]: { keep, step, part?, doubt? } }.
// A thin-cell photo comes back from judgeSteps kept at difficulty step 3, so it scores as one.

const EPS = 1e-9;
const share = (num, den) => (den ? num / den : null);
const mean = xs => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const keptBoth = (x, y) => x?.keep === true && y?.keep === true;

// Keep agreement, drop recall, and the difficulty step (exact and within one) on the photos that both keep.
// A photo that the owner dropped only for a species doubt (doubt: true) leaves the score.
// parts: { [key]: the judge's part }, for part agreement where the owner labels the part.
export function agreement(keys, owner, steps, parts = null) {
  let n = 0, keep = 0, drops = 0, recalled = 0, both = 0, exact = 0, within1 = 0, pn = 0, part = 0;
  for (const key of keys) {
    const o = owner[key], j = steps.get(key);
    if (!o) continue;
    if (parts && o.part != null) { pn++; if (parts[key] === o.part) part++; }
    if (o.doubt) continue;
    const jk = j?.keep === true;
    n++;
    if (jk === o.keep) keep++;
    if (!o.keep) { drops++; if (!jk) recalled++; }
    if (keptBoth(o, j)) {
      both++;
      if (j.step === o.step) exact++;
      if (Math.abs(j.step - o.step) <= 1) within1++;
    }
  }
  return { n, keep: share(keep, n), drops, drop_recall: share(recalled, drops), both, exact: share(exact, both), within1: share(within1, both), part: share(part, pn) };
}

// Usual look (key only, secondary): on the photos both keep, the share where the judge agrees with the owner.
export function usualLook(keys, owner, steps, answers, usual) {
  const ks = keys.filter(key => keptBoth(owner[key], steps.get(key)) && usual[key] != null);
  return share(ks.filter(key => (answers[key]?.usual_look === true) === usual[key]).length, ks.length);
}

// The method's top photo of a cell: its first kept photo at the lowest difficulty step it fills.
export const topPick = cell => [1, 2, 3].map(s => cell[s][0]).find(key => key != null) ?? null;

// best: { [cell]: the owner's best key }. Null when the owner picked no best photo.
export function topPickScore(cells, best) {
  const cs = Object.keys(best).filter(c => cells[c]);
  return share(cs.filter(c => topPick(cells[c]) === best[c]).length, cs.length);
}

// With a small K, R ranks only the first photos (spec, method R). allCells: the cells of R(all).
// firstK: the keys of the first K photos. The share of the cells with a top photo where it comes after photo K.
export function bestAfterK(allCells, firstK) {
  const tops = Object.values(allCells).map(topPick).filter(key => key != null);
  return share(tops.filter(key => !firstK.has(key)).length, tops.length);
}

export function speciesDoubt(photos, answers) {
  const out = [];
  for (const p of photos) {
    const a = answers[p.key];
    if (a?.escalate === 'mismatch') out.push({ key: p.key, kind: 'mismatch', source_species: p.source_species });
    if ((a?.reject ?? []).includes('hybrid')) out.push({ key: p.key, kind: 'hybrid', source_species: p.source_species });
  }
  return out;
}

// Two runs of the same judge (or two set-ups): keep, and the difficulty step on the photos kept both times.
export function repeatAgreement(keys, a, b) {
  const ks = keys.filter(key => a.has(key) && b.has(key));
  const both = ks.filter(key => keptBoth(a.get(key), b.get(key)));
  return {
    n: ks.length,
    keep: share(ks.filter(key => (a.get(key).keep === true) === (b.get(key).keep === true)).length, ks.length),
    both: both.length,
    exact: share(both.filter(key => a.get(key).step === b.get(key).step).length, both.length),
    within1: share(both.filter(key => Math.abs(a.get(key).step - b.get(key).step) <= 1).length, both.length),
  };
}

// The batch-size test (owner ruling 2026-10-23): calls of 10 against calls of 20 of the same model.
// ten, twenty: { steps, cost } of each set-up.
export function batchScore(keys, owner, ten, twenty) {
  const usd = c => mean(keys.filter(key => c[key]).map(key => c[key].usd));
  return {
    ten: agreement(keys, owner, ten.steps),
    twenty: agreement(keys, owner, twenty.steps),
    between: repeatAgreement(keys, ten.steps, twenty.steps),
    usd_per_photo: { ten: usd(ten.cost), twenty: usd(twenty.cost) },
  };
}

// results: the replay results of one method on every species pool.
export function quotaFill(results) {
  const slots = results.flatMap(r => Object.values(r.filled).flatMap(c => Object.values(c)));
  const filled = slots.filter(Boolean).length;
  return { slots: slots.length, filled, share: share(filled, slots.length), judged: results.reduce((s, r) => s + r.judged, 0) };
}

// The cost per photo judged (by any model of the method) and per kept photo. Null when a cost is unknown.
export function costPer(results) {
  const kept = results.reduce((s, r) => s + Object.values(r.cells).reduce((t, c) => t + c[1].length + c[2].length + c[3].length, 0), 0);
  const photos = results.reduce((s, r) => s + Math.max(r.judged, r.filtered), 0);
  if (results.some(r => r.cost == null)) return { kept, photos, tokens: null, usd: null, tokens_per_photo: null, usd_per_photo: null, tokens_per_kept: null, usd_per_kept: null };
  const tokens = results.reduce((s, r) => s + r.cost.tokens, 0), usd = results.reduce((s, r) => s + r.cost.usd, 0);
  return { kept, photos, tokens, usd, tokens_per_photo: share(tokens, photos), usd_per_photo: share(usd, photos), tokens_per_kept: share(tokens, kept), usd_per_kept: share(usd, kept) };
}

// Per source: the photos, the photos the judge keeps at each difficulty step, and the cells whose quota
// (counts only, not the usual-look rule) that source's kept photos fill alone.
export function sourceYield(photos, steps, quota) {
  const out = {}, per = {};
  for (const p of photos) {
    const s = (out[p.source] ??= { photos: 0, kept: { 1: 0, 2: 0, 3: 0 }, cells_filled: 0 });
    s.photos++;
    const j = steps.get(p.key);
    if (!j?.keep) continue;
    s.kept[j.step]++;
    const c = ((per[p.source] ??= {})[j.cell] ??= { 1: 0, 2: 0, 3: 0 });
    c[j.step]++;
  }
  for (const [source, cells] of Object.entries(per)) {
    out[source].cells_filled = Object.values(cells).filter(c => [1, 2, 3].every(s => c[s] >= quota[s])).length;
  }
  return out;
}

// The ranking cost line a + b × n by least squares (plan choice 11). points: [{ n, tokens, usd }].
// With one value of n, the line goes through 0. With no point, null.
export function fitLine(points) {
  if (!points.length) return null;
  const fit = f => {
    const mn = mean(points.map(p => p.n)), my = mean(points.map(p => p[f]));
    const sxx = points.reduce((s, p) => s + (p.n - mn) ** 2, 0);
    if (sxx < EPS) return { a: 0, b: mean(points.map(p => p[f] / p.n)) };
    const b = points.reduce((s, p) => s + (p.n - mn) * (p[f] - my), 0) / sxx;
    return { a: my - b * mn, b };
  };
  return { tokens: fit('tokens'), usd: fit('usd') };
}

// spans: [{ seconds, photos }], one per agent.
export function minutesPer100(spans) {
  const photos = spans.reduce((s, x) => s + x.photos, 0);
  return photos ? (spans.reduce((s, x) => s + x.seconds, 0) / photos) * 100 / 60 : null;
}

// The decision rule (intake spec Part 2). A row: { id, ranking, keep, drop_recall, exact, within1, usd_per_kept }.
export const GATES = { drop_recall: 0.8, keep: 0.85, exact: 0.8, within1: 0.97 };
export const MARGIN = 0.05;

export const gates = row => Object.entries(GATES).every(([f, min]) => row[f] != null && row[f] >= min - EPS);

// The ranking methods that pass the gates, within 5 points of the best exact difficulty step and of the best keep agreement.
export function shortlist(rows) {
  const ok = rows.filter(r => r.ranking && gates(r));
  if (!ok.length) return [];
  const bestExact = Math.max(...ok.map(r => r.exact)), bestKeep = Math.max(...ok.map(r => r.keep));
  return ok.filter(r => r.exact >= bestExact - MARGIN - EPS && r.keep >= bestKeep - MARGIN - EPS);
}

// ownerRepeat: the owner's repeat agreement { keep, exact } on the held-out set.
export const heldoutCheck = (row, ownerRepeat) =>
  row.keep != null && row.exact != null && row.keep >= ownerRepeat.keep - MARGIN - EPS && row.exact >= ownerRepeat.exact - MARGIN - EPS;

// The cheapest row (USD per kept photo on the held-out set) that passes the check. When the cheapest fails,
// the next-cheapest gets the same check. Returns { candidate, checked } with the ids checked in order.
export function candidate(rows, check = () => true) {
  const byCost = [...rows].filter(r => r.usd_per_kept != null).sort((a, b) => a.usd_per_kept - b.usd_per_kept || a.id.localeCompare(b.id));
  const checked = [];
  for (const r of byCost) {
    checked.push(r.id);
    if (check(r)) return { candidate: r.id, checked };
  }
  return { candidate: null, checked };
}
