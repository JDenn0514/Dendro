// The briefs and the agent prompts of the intake eval. The judge brief is written from intake spec Part 1.
// It copies the 10 reject checks, "Not a fault", and the three escalation cases from the photo-check skill.
// It does not copy the hard checks: the spec's table of old hard checks replaces them.
import { KEY_FEATURES, OTHER_FEATURES } from './step.mjs';
import { REJECT_CODES, CAUSES, GROWTH_STAGES } from './schemas.mjs';

const between = (text, a, b, what) => {
  const i = text.indexOf(a), j = text.indexOf(b, i + 1);
  if (i < 0 || j < 0) throw new Error(`${what} not found in photo-check SKILL.md`);
  return text.slice(i, j);
};
const oneLine = s => s.replace(/\s+/g, ' ').trim();

// skill: the text of .claude/skills/photo-check/SKILL.md.
// Returns { rejects: [10 check texts, on one line each], notAFault, escalations }.
export function extractChecks(skill) {
  const list = between(skill, '**Reject** when any of these is yes:', '**Escalate**', 'The reject checks');
  const rejects = list.split('\n').slice(1).join('\n').split(/^\d+\.\s/m).map(oneLine).filter(Boolean);
  if (rejects.length !== 10) throw new Error(`The reject checks not found in photo-check SKILL.md: ${rejects.length} checks, want 10`);
  const notAFault = between(skill, '**Not a fault.**', '**Hard:**', 'Not a fault').trim();
  const cases = between(skill, '## The three escalation cases', 'Everything else', 'The three escalation cases');
  const escalations = cases.slice(cases.indexOf('1. ')).trim();
  return { rejects, notAFault, escalations };
}

// The text of each depth feature that config.json can name (spec Part 1, "Depth feature").
export const DEPTH_TEXT = { two_heads: 'two seed balls on one stalk show clearly.' };

const code = s => `\`${s}\``;
const codes = list => list.map(code).join(', ');

const RULES = [
  'Never return a difficulty step, a keep, or a rank. The code computes them from your answers.',
  'Use only the Read tool. Do not run Bash or PowerShell. Do not write or edit any file. Do not open a web page.',
  'Read only the files that your prompt names.',
  'Do not judge the licence. Never set `escalate` to `license`.',
  'Trust the source name for the species. Your prompt gives it for each photo. Do not judge the species from the photo.',
  'The text from the photo-check skill below has other uses. Ignore its command-line flags (`--case`, `--tags`), the `hard` tag, and the words approve and verdict. Answer only with the fields of this brief.',
];

function featureLines() {
  const line = (part, list) => `   - ${part}: ${codes(list)}.`;
  return {
    key: ['leaf', 'bark', 'fruit'].map(p => line(p, KEY_FEATURES[p])),
    other: ['leaf', 'bark', 'fruit'].map(p => line(p, OTHER_FEATURES[p])),
  };
}

// variant: 'V1' (checklist) or 'V2' (describe first). The two briefs differ only in the lines on `description`.
export function briefJudge(checks, variant) {
  if (!['V1', 'V2'].includes(variant)) throw new Error(`unknown variant ${variant}`);
  const v2 = variant === 'V2';
  const f = featureLines();
  return [
    '# Photo judge',
    '',
    'You answer a fixed checklist on each photo for a tree-identification app. Each photo shows one part of one tree.',
    '',
    ...RULES.map(r => `- ${r}`),
    '',
    '## Steps for each photo',
    '',
    '1. Read the image file at its path. Judge the photo at the size given. This is the size that the learner sees. Do not open any other file.',
    '2. When the file does not open, set `reject` to `["unread"]`, give every other field its plainest value, and say so in `note`.',
    v2
      ? '3. First write two or three sentences in `description` on what the photo shows. Then answer the checklist below, in its order.'
      : '3. Set `description` to `""`. Answer the checklist below, in its order.',
    '4. Return one result per photo, in the order given, with its key.',
    '',
    '## The checklist',
    '',
    '1. `part`: `leaf`, `bark`, `fruit`, or `other`. Set it from the photo. `other` is a photo whose main subject is none of the three: a whole tree, a crown, a twig with buds only, flowers only, or a scene.',
    '2. The key photo features of the part. Answer each one `clear`, `search`, or `no`:',
    ...f.key,
    '   - `clear`: a learner can read its value. `search`: a learner finds it only with a search or close study. `no`: the photo does not show it.',
    '   - `shape` of a leaf is the outline, the blade, and the lobe tips. `margin` is the edge. `texture` and `pattern` of bark are the surface and the ridges, plates, grooves, or peeling. `kind` of a fruit is the kind of fruit (samara, acorn, seed ball, cone of samaras, and so on). `shape` of a fruit is its outline.',
    '   - "Smooth" is a value of the bark pattern, so a smooth trunk can have `pattern` at `clear`.',
    '3. The other photo features of the part, with the same values:',
    ...f.other,
    '   - `arrangement` is `clear` only when the photo shows where the leaf stalks join the twig.',
    '   - `hang` is `clear` only when the photo shows how the fruit hangs or sits on the twig. A fruit held in a hand usually gets `no`.',
    '   - `size` is `clear` only when a scale object is in the frame.',
    '   - Answer `wing` only for a samara and `cap` only for an acorn. Leave them out for any other fruit.',
    '   - When your prompt names a depth feature for the photo and its part, also answer it in `photo_features`, with the same values. The depth feature never makes the photo a reject.',
    '   - For the part `other`, `photo_features` is `{}`.',
    '4. `whole`: true when the key subject shows in full: one whole leaf outline, the whole fruit, or a bark area wide enough to show the pattern repeat. A hand that covers part of the subject makes `whole` false.',
    '5. `alone`: true when the subject is the main thing in the frame. Nothing near it competes, or the background is plain or soft.',
    '6. `too_close`: bark only. True when the frame shows texture only: no trunk edge, no branch, and no scale object. `null` for leaf, fruit, and other.',
    `7. \`causes\`: the things that make the photo harder, other than framing. Ask each one in turn, and list each one that is yes (${codes(CAUSES)}):`,
    '   - `young`: a leaf or a fruit that has not reached its full shape.',
    '   - `damaged`: holes, galls, or tears that change the outline.',
    '   - `atypical`: a form that is not the typical one, such as a broken fruit ball.',
    '   - `angle`: an unusual angle, such as a view from below or a top view of a fruit.',
    '   - `light`: light or shadow that changes the colour, such as warm low sun, flash, deep shade, or backlight.',
    '8. `side`: leaf only. `upper`, `under`, or `both`: the side of the leaf that shows. `null` for bark, fruit, and other.',
    '9. `scale`: `hand`, `ruler`, `coin`, `person`, `other`, or `none`. The scale object in the frame. It never makes the photo harder.',
    '10. `season`: `spring`, `summer`, `autumn`, `winter`, or `any`. From what the photo shows, not the photo date. `any` marks a part that looks the same all year. Bark usually does. A green, full-size leaf with no sign of another season is `summer`. Spring needs a sign, such as catkins, flowers, or new shoots.',
    `11. \`growth_stage\`: leaf ${codes(GROWTH_STAGES.leaf)}; fruit ${codes(GROWTH_STAGES.fruit)}; bark ${codes(GROWTH_STAGES.bark)}. \`null\` for other.`,
    '12. `usual_look`: true for green mature leaves, ripe fruit, and mature or old bark. A leaf form that is not the typical form is not the usual look.',
    '13. `not_for`: the word features or depths that this photo must not test, such as `["edge"]` or `["subgroup"]`. The word features are `outline`, `blade`, `lobe_tips`, `edge`, `arrangement`, `bark_pattern`, and `fruit_kind`. The depths are `subgroup` and `group`. Propose it from an `atypical` cause or a variant leaf form. Most photos get `[]`.',
    '14. `reject`: every reject check below that is yes, as its code. `[]` when none is yes.',
    '15. `escalate`: `mismatch`, `quality`, or `none`. See the escalation cases below.',
    '16. `note`: one or two sentences. What you saw, and the reason for each answer that makes the photo harder.',
    '',
    '## How to answer some cases',
    '',
    'These cases were hard checks before. Answer them this way:',
    '',
    '- Crowded leaves: `alone` false, or a key photo feature at `search`.',
    '- The feature is small in the frame: a key photo feature at `search`.',
    '- A soft photo whose edges you can trace: a key photo feature at `search`.',
    '- A tilted leaf: `angle`.',
    '- The frame edge cuts off part of the leaf: `whole` false.',
    '- A young form: `young` for a leaf. For a fruit of full shape that is not ripe: `growth_stage` `unripe` and `usual_look` false.',
    '- A fruit not in its typical form: `atypical`.',
    '- Autumn colour: `growth_stage` `autumn` and `usual_look` false. It is not a cause.',
    '- Bark from a distance: a key photo feature at `search`.',
    '- Backlight or deep shade: `light`.',
    '',
    '**A variant leaf form** is a form that the source names for the mature tree, but not the typical one, such as the mitten leaf of sassafras. It is not `atypical`. Answer its photo features from clarity, set `usual_look` false, and put in `not_for` the word features where it differs from the typical mature leaf. A form that the source does not name for the mature tree, such as a sucker leaf, stays a reject.',
    '',
    '**Identity.** A photo whose source name is a hybrid that is not the tree is a reject (`hybrid`). The London planetree, Platanus ×hispanica, is itself a hybrid: a photo of that tree whose source name is Platanus ×hispanica passes. When the source name is another species than the tree, and not a variety or subspecies of it, set `escalate` to `mismatch`.',
    '',
    '## The reject checks (from the photo-check skill)',
    '',
    'Each check is about the key photo features of the part that you set. Use the code before each check in `reject`.',
    '',
    ...checks.rejects.map((t, i) => `${i + 1}. ${code(REJECT_CODES[i])}: ${t}`),
    `11. ${code('feature_not_found')}: the part is leaf, bark, or fruit, but the photo does not show its key photo features at all.`,
    `12. ${code('hybrid')}: see **Identity** above.`,
    `13. ${code('unread')}: the file does not open.`,
    '',
    checks.notAFault,
    '',
    '## The escalation cases (from the photo-check skill)',
    '',
    checks.escalations,
    '',
    'In this eval, `license` is never yours to set. For `mismatch`, compare the source name in your prompt with the tree.',
    '',
  ].join('\n');
}

export function briefRank() {
  return [
    '# Photo ranking',
    '',
    'You rank the photos of one cell (one tree and one part) for a tree-identification app. Your prompt splits the photos into groups. You rank the photos of each group against each other.',
    '',
    '- Never return a difficulty step, a keep, or a reject. The code computes them.',
    '- Use only the Read tool. Do not run Bash or PowerShell. Do not write or edit any file. Do not open a web page.',
    '- Do not judge the licence or the species.',
    '',
    '## Steps',
    '',
    '1. Read each contact sheet that your prompt lists. A sheet holds up to 9 photos in a 3 by 3 grid. The yellow label on each tile is the photo key.',
    '2. Rank from the contact sheets only. Do not open any photo file.',
    '3. For each group, put every key of the group in its order, best first, once each. Do not move a key to another group.',
    '4. Rank in this order of preference:',
    '   1. the usual look: green mature leaves, ripe fruit, mature or old bark;',
    '   2. for fruit only, a scale object in the frame (a hand, a ruler, a coin); for leaf and bark a scale object does not count;',
    '   3. the whole subject in the frame: one whole leaf outline, the whole fruit, or a bark area wide enough to show the pattern repeat;',
    '   4. the view that the group line of your prompt names, when your prompt has one.',
    '5. When a sheet does not open, put the keys of its photos in `unread` and leave them out of the orders.',
    '',
    'Return `{ "orders": { "<group>": [keys] }, "unread": [keys], "note": "..." }`, with one order for each group of your prompt.',
    '',
  ].join('\n');
}

// photos: [{ key, abs, tree, source_species, depth }]. depth: { <part>: <depth feature> } or absent.
const photoLine = p => {
  const depth = Object.entries(p.depth ?? {}).map(([part, f]) => {
    if (!DEPTH_TEXT[f]) throw new Error(`no text for depth feature ${f}`);
    return ` | depth feature: when the part is ${part}, also answer \`${f}\`: ${DEPTH_TEXT[f]}`;
  }).join('');
  return `- ${p.key}: ${p.abs} | tree: ${p.tree} | source name: ${p.source_species}${depth}`;
};

export function promptJudge(photos, briefPath) {
  return [`Read the brief at ${briefPath} and follow it.`, 'Photos (key: path | the tree | the name on the source page):', ...photos.map(photoLine)].join('\n');
}

export function promptCheck(photos, briefPath) {
  return [promptJudge(photos, briefPath), '', 'This is a test run. Also fill `model_self_report` with the model name that you think you are.'].join('\n');
}

// cell: { species, part }. groups: { <group>: [keys] }. groupLine: the most common view of the genus mates, or null.
export function promptRank(cell, groups, sheets, briefPath, groupLine) {
  return [
    `Read the brief at ${briefPath} and follow it.`,
    `Cell: ${cell.species}, ${cell.part}.`,
    ...(groupLine ? [`Group line: the other species of the genus mostly show ${groupLine}.`] : []),
    'Contact sheets:', ...sheets.map(s => `- ${s}`),
    'Groups:', ...Object.entries(groups).map(([g, keys]) => `- group "${g}": ${keys.join(', ')}`),
  ].join('\n');
}
