import { LABELS } from './prompts.mjs';

const ITEM = {
  type: 'object',
  properties: { key: { type: 'string' }, label: { type: 'string', enum: LABELS }, note: { type: 'string' } },
  required: ['key', 'label', 'note'],
};
const KEYS = { type: 'array', items: { type: 'string' } };
const RANKED = {
  type: 'array',
  items: { type: 'object', properties: { key: { type: 'string' }, tag: { type: 'string', enum: ['good', 'hard'] } }, required: ['key', 'tag'] },
};

export const SCHEMAS = {
  P0: { type: 'object', properties: { model_self_report: { type: 'string' }, results: { type: 'array', items: ITEM } }, required: ['model_self_report', 'results'] },
  P1: { type: 'object', properties: { results: { type: 'array', items: ITEM } }, required: ['results'] },
  RANK: { type: 'object', properties: { ranked: RANKED, rejects: KEYS, unread: KEYS, note: { type: 'string' } }, required: ['ranked', 'rejects', 'unread'] },
};
