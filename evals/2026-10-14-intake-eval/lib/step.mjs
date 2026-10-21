// Keep and the difficulty step from a judge's answers (intake spec Part 1). Pure, with no dependencies:
// phase 4 moves this file into app/logic/ unchanged.

export const KEY_FEATURES = { leaf: ['shape', 'margin'], bark: ['texture', 'pattern'], fruit: ['kind', 'shape'] };
export const OTHER_FEATURES = { leaf: ['venation', 'arrangement', 'size'], bark: ['colour'], fruit: ['hang', 'wing', 'cap'] };

const REJECT = line => ({ keep: false, step: null, line });

// rule 'P': the proposed rule. Rule 'K3': the same rule without the last reject line (key_search_cause).
// Season, scale, usual_look, growth_stage, side, not_for, and the depth feature never change the result.
export function stepOf(answers, { rule = 'P' } = {}) {
  if (!answers) return REJECT('no_answer');
  if ((answers.reject ?? []).length > 0) return REJECT('reject_list');
  if (answers.part === 'other') return REJECT('part_other');
  const keys = (KEY_FEATURES[answers.part] ?? []).map(f => answers.photo_features?.[f]);
  const hasCause = (answers.causes ?? []).length > 0;
  if (keys.includes('no')) return REJECT('key_no');
  if (rule === 'P' && keys.includes('search') && hasCause) return REJECT('key_search_cause');
  if (keys.includes('search') || hasCause) return { keep: true, step: 3, line: null };
  const plain = keys.every(v => v === 'clear') && answers.whole === true && answers.alone === true
    && !(answers.part === 'bark' && answers.too_close !== false);
  return { keep: true, step: plain ? 1 : 2, line: null };
}

// The order of method CR inside one cell. Each photo is { key, n, answers }; n is the fetch order.
export function codeOrder(photos, part) {
  const features = [...KEY_FEATURES[part], ...OTHER_FEATURES[part]];
  const rank = ({ answers: a, n }) => [
    a?.usual_look === true ? 0 : 1,
    part === 'fruit' && a?.scale && a.scale !== 'none' ? 0 : 1,
    a?.whole === true && a?.alone === true ? 0 : 1,
    -features.filter(f => a?.photo_features?.[f] === 'clear').length,
    n,
  ];
  const ranked = photos.map(p => ({ p, r: rank(p) }));
  ranked.sort((x, y) => {
    for (let i = 0; i < x.r.length; i++) if (x.r[i] !== y.r[i]) return x.r[i] - y.r[i];
    return 0;
  });
  return ranked.map(x => x.p);
}

// stepOf on each photo of one cell, then the thin-cell rule: when no photo is kept, the first photo in
// code order that only the last reject line rejected comes back at difficulty step 3, with thin_cell true.
// Under rule K3 that line does not exist, so the rule never fires. The output keeps the input order.
export function cellSteps(photos, part, opts = {}) {
  const out = photos.map(p => ({ key: p.key, ...stepOf(p.answers, opts), thin_cell: false }));
  if (out.some(r => r.keep)) return out;
  const lastLine = new Set(out.filter(r => r.line === 'key_search_cause').map(r => r.key));
  const first = codeOrder(photos.filter(p => lastLine.has(p.key)), part)[0];
  if (!first) return out;
  return out.map(r => (r.key === first.key ? { ...r, keep: true, step: 3, thin_cell: true } : r));
}
