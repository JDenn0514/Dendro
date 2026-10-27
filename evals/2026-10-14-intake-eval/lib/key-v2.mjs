// Key v2 (owner ruling 2026-10-27, Task 7): the owner's labels of 2026-10-11, with the owner's later calls on top.
// - The gate examples sheet: where the owner said "Judges are right", the judges' call (the most common
//   difficulty step of the 3, or a drop when all 3 reject). "My call stands" and "Could be either" keep the old label.
// - The blind relabel: the new label.
// Returns { owner: { [key]: { keep, step } }, source: { [key]: 'key' | 'examples' | 'relabel' } }. Pure.
export function keyV2(owner, examples, relabel) {
  const out = {}, source = {};
  for (const [k, o] of Object.entries(owner)) { out[k] = { keep: o.keep, step: o.keep ? o.step : null }; source[k] = 'key'; }
  const onExamples = new Set(examples.photos.map(r => r.key));
  for (const r of examples.photos) {
    if (!(r.key in owner)) throw new Error(`${r.key}: not in the key`);
    if (r.verdict !== 'judges') continue;
    const steps = r.judges.filter(j => j !== 'reject').map(j => +j.replace('step ', ''));
    const most = steps.length ? steps.reduce((a, s) => (steps.filter(x => x === s).length > steps.filter(x => x === a).length ? s : a)) : null;
    out[r.key] = most == null ? { keep: false, step: null } : { keep: true, step: most };
    source[r.key] = 'examples';
  }
  for (const r of relabel.photos) {
    if (!(r.key in owner)) throw new Error(`${r.key}: not in the key`);
    if (onExamples.has(r.key) || source[r.key] === 'relabel') throw new Error(`${r.key}: on both sheets`);
    out[r.key] = { keep: r.label.keep, step: r.label.keep ? r.label.step : null };
    source[r.key] = 'relabel';
  }
  return { owner: out, source };
}
