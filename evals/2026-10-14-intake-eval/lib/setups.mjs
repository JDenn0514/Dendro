// The judge set-ups that analyze.mjs replays methods on, and the Haiku reject pass. Pure, no import.
// A set-up is <model>:<effort>:<variant>[:n<call size>]; no suffix is calls of 10.

const batchOf = s => +(/:n(\d+)$/.exec(s)?.[1] ?? 10);

// The leading set-up of a model (owner rulings 2026-10-27): config.leading holds the variant, call size, and effort.
export function leadingSetup(config, model) {
  const { variant, batch, effort } = config.leading;
  return `${model}:${effort[model]}:${variant}${batch && batch !== 10 ? `:n${batch}` : ''}`;
}

// Method rows cover every calls-of-10 set-up and the leading set-up of each model, because the rankings come
// from the leading set-ups. Other calls-of-20 set-ups have set-up rows only.
export function methodSetups(setups, config) {
  return setups.filter(s => batchOf(s) === 10 || s === leadingSetup(config, s.split(':')[0]));
}

// The reject pass of methods F and FR is Haiku's leading set-up, as in the FR ranking jobs (plan choice 10).
// has(setup): the set-up has answers. Haiku as the main judge has no reject pass.
export function filterOf(setup, config, has) {
  const f = leadingSetup(config, 'haiku');
  return setup.split(':')[0] !== 'haiku' && has(f) ? f : null;
}
