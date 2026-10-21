export const LABELS = ['good', 'hard', 'reject', 'escalate', 'unread'];

export function extractQuality(skill) {
  const a = skill.indexOf('**Quality.**');
  const b = skill.indexOf('**Duplicates.**');
  if (a < 0 || b < 0 || b < a) throw new Error('Quality section not found in photo-check SKILL.md');
  return skill.slice(a, b).trim();
}

const RULES = [
  'Use only the Read tool. Do not run Bash or PowerShell. Do not write or edit any file.',
  'Read only the files that this brief and your prompt name.',
  'The run covers the leaf channel only. A photo whose main subject is not a leaf is a reject. This holds for bark, a trunk, fruit, acorns, buds, flowers, and a whole tree.',
  'The quality checks below come from a skill that has other uses. Ignore the command-line flags in them (`--case`, `--tags`) and the references to Identity and the source page. Answer only with the label or the tag that this brief asks for.',
  'Do not judge the licence or the species. Trust the source for the species.',
];

export function briefP1(quality) {
  return [
    '# Leaf photo judge, one photo at a time (P1)',
    '',
    'You judge leaf photos for a tree-identification app. Each photo gets one label.',
    '',
    ...RULES.map(r => `- ${r}`),
    '',
    '## Steps for each photo',
    '',
    '1. Read the image file at its path. Judge the photo at the size given. This is the size that the learner sees. Do not open any other file.',
    '2. Answer the reject checks below, in order. When one is yes, the label is `reject`. A photo whose feature you can make out only with a bigger view is `hard` at most, or a `reject`.',
    '3. When no reject check is yes and the image is sepia, toned, tinted, or heavily filtered, the label is `escalate`.',
    '4. Otherwise answer the hard checks. When one is yes, the label is `hard`. A photo that the checks call "one clear leaf:" is `hard`.',
    '5. When every check is no, the label is `good`.',
    '6. When the file does not open, the label is `unread`.',
    '',
    'Return one result per photo, in the order given, with its key, its label, and a note of one short sentence.',
    '',
    '## Quality checks (from the photo-check skill)',
    '',
    quality,
    '',
  ].join('\n');
}

export function briefRank(quality, pass) {
  const scope = pass === 'P3' ? 'the first 12 photos of one tree' : 'all the photos of one tree';
  return [
    `# Leaf photo judge, ranking (${pass})`,
    '',
    `You rank ${scope} for a tree-identification app. The app shows the best 6.`,
    '',
    ...RULES.map(r => `- ${r}`),
    '',
    '## Steps',
    '',
    '1. Read each contact sheet. A sheet holds up to 9 photos in a 3 by 3 grid. The yellow label on each tile is the photo key.',
    '2. Rank from the contact sheets only. Do not open any photo file. Read only the sheets that your prompt lists.',
    '3. Put each photo that fails a reject check below in `rejects`. A sepia, toned, tinted, or heavily filtered photo also goes in `rejects`.',
    '4. Put every other photo in `ranked`, best first. Rank the photos against each other.',
    '5. Give each ranked photo the tag `good` or `hard` under the same checks as a one-photo judge: the tag is `hard` when a hard check below is yes (a photo that the checks call "one clear leaf:" is `hard`), and `good` when every check is no.',
    '6. The best leaf photo shows one petiole laid flat or hanging flat: one whole leaf, sharp and large in the frame. A good photo ranks above a hard photo. Among hard photos, the clearer leaf ranks higher.',
    '7. When a sheet does not open, put the keys of its photos in `unread`.',
    '',
    'Every key in your prompt goes in exactly one of `ranked`, `rejects`, or `unread`. Each `ranked` item is `{ "key": ..., "tag": "good" }` or `{ "key": ..., "tag": "hard" }`.',
    '',
    '## Quality checks (from the photo-check skill)',
    '',
    quality,
    '',
  ].join('\n');
}

const head = t => `Tree: ${t.target}${t.species ? ` (${t.species})` : ''}.`;

export function promptP1(t, photos, briefPath) {
  return [`Read the brief at ${briefPath} and follow it.`, head(t), 'Photos (key: path):', ...photos.map(p => `- ${p.key}: ${p.abs}`)].join('\n');
}

export function promptP0(t, photos, briefPath) {
  return [promptP1(t, photos, briefPath), '', 'This is a test run. Also fill `model_self_report` with the model name that you think you are.'].join('\n');
}

export function promptRank(t, photos, sheets, briefPath) {
  return [
    `Read the brief at ${briefPath} and follow it.`, head(t),
    'Contact sheets:', ...sheets.map(s => `- ${s}`),
    'Photo keys:', ...photos.map(p => `- ${p.key}`),
  ].join('\n');
}
