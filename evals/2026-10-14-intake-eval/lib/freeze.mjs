// The freeze (plan Task 7): one prompt variant, one rule, the call size, and the effort of each model,
// with the sha256 of the files that decide a judge's answer and its difficulty step.
import { createHash } from 'node:crypto';

export const sha256 = text => createHash('sha256').update(text).digest('hex');

// The files that the held-out run must not change: the rule, the judge brief, and the schema.
export const frozenFiles = variant => ['lib/step.mjs', `briefs/judge-${variant}.md`, 'lib/schemas.mjs'];

// files: { <path relative to EVAL>: text }. The efforts and the call size come from config.leading.
export function frozenRecord(config, { variant, rule }, files) {
  if (!config.variants.includes(variant)) throw new Error(`variant ${variant} is not in config.variants`);
  if (!config.rules.includes(rule)) throw new Error(`rule ${rule} is not in config.rules`);
  const sha = {};
  for (const f of frozenFiles(variant)) {
    if (files[f] == null) throw new Error(`no file ${f}`);
    sha[f] = sha256(files[f]);
  }
  return { variant, rule, batch: config.leading.batch, effort: { ...config.leading.effort }, sha256: sha };
}

// The files whose text no longer has the frozen hash (a missing file counts). [] when nothing changed.
export function checkFrozen(frozen, files) {
  return Object.entries(frozen.sha256).filter(([f, h]) => files[f] == null || sha256(files[f]) !== h).map(([f]) => f);
}
