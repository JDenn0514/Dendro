// The JSON schemas of the agents' answers (intake spec Part 1, "The fields").

// The 10 reject checks of the photo-check Quality section, in its order, then the spec's three more.
// `unread`: the judge could not open the file.
export const REJECT_CODES = ['feature_unclear', 'leaf_mass', 'bark_up_or_dark', 'blur', 'dead_leaf', 'name_label', 'buds_or_flowers', 'sucker_leaf', 'greyscale', 'fruit_part_missing', 'feature_not_found', 'hybrid', 'unread'];
export const CAUSES = ['young', 'damaged', 'atypical', 'angle', 'light'];
export const PARTS = ['leaf', 'bark', 'fruit', 'other'];
export const SCALES = ['hand', 'ruler', 'coin', 'person', 'other', 'none'];
export const SEASONS = ['spring', 'summer', 'autumn', 'winter', 'any'];
export const GROWTH_STAGES = { leaf: ['young', 'mature', 'autumn'], fruit: ['young', 'unripe', 'ripe', 'after_seed_fall'], bark: ['young', 'mature', 'old'] };
export const ESCALATE = ['mismatch', 'license', 'quality', 'none'];

const STRINGS = { type: 'array', items: { type: 'string' } };
const stages = [...new Set(Object.values(GROWTH_STAGES).flat())];

const ITEM = {
  type: 'object',
  properties: {
    key: { type: 'string' },
    description: { type: 'string' },
    part: { type: 'string', enum: PARTS },
    photo_features: { type: 'object', additionalProperties: { type: 'string', enum: ['clear', 'search', 'no'] } },
    whole: { type: 'boolean' },
    alone: { type: 'boolean' },
    too_close: { type: ['boolean', 'null'] },
    side: { type: ['string', 'null'], enum: ['upper', 'under', 'both', null] },
    causes: { type: 'array', items: { type: 'string', enum: CAUSES } },
    scale: { type: 'string', enum: SCALES },
    season: { type: 'string', enum: SEASONS },
    growth_stage: { type: ['string', 'null'], enum: [...stages, null] },
    usual_look: { type: 'boolean' },
    not_for: STRINGS,
    reject: { type: 'array', items: { type: 'string', enum: REJECT_CODES } },
    escalate: { type: 'string', enum: ESCALATE },
    note: { type: 'string' },
  },
};
ITEM.required = Object.keys(ITEM.properties);
const RESULTS = { type: 'array', items: ITEM };

export const SCHEMAS = {
  JUDGE: { type: 'object', properties: { results: RESULTS }, required: ['results'] },
  CHECK: { type: 'object', properties: { model_self_report: { type: 'string' }, results: RESULTS }, required: ['model_self_report', 'results'] },
  // orders: one list of keys per group that the prompt names ("1", "2", "3", or "all"), best first.
  RANK: { type: 'object', properties: { orders: { type: 'object', additionalProperties: STRINGS }, unread: STRINGS, note: { type: 'string' } }, required: ['orders', 'unread', 'note'] },
};
