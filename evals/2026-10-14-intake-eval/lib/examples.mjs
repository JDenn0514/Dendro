// Examples of the failing gates for the owner's review sheet (plan Task 7). Pure.
// The examples are the photos where every set-up given agrees with the others and not with the owner,
// so a fix must come from the brief, the rule, or the key, not from the choice of model.
// keys: the photos, in key order. owner[key]: { keep, step, doubt? }. steps: one Map of judgeSteps results per set-up.
// Returns step: [{ key, owner, judged }] (all keep, one step that is not the owner's),
// kept: [{ key }] (the owner drops, every set-up keeps), dropped: [{ key, lines }] (the owner keeps, every set-up rejects).
export function gateExamples(keys, owner, steps) {
  const out = { step: [], kept: [], dropped: [] };
  for (const key of keys) {
    const o = owner[key], js = steps.map(m => m.get(key));
    if (!o || o.doubt || js.some(j => !j)) continue;
    if (o.keep && js.every(j => j.keep)) {
      if (js.every(j => j.step === js[0].step) && js[0].step !== o.step) out.step.push({ key, owner: o.step, judged: js[0].step });
    } else if (!o.keep && js.every(j => j.keep)) out.kept.push({ key });
    else if (o.keep && js.every(j => !j.keep)) out.dropped.push({ key, lines: js.map(j => j.line) });
  }
  return out;
}
