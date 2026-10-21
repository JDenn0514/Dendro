import path from 'node:path';
import { fileURLToPath } from 'node:url';

// EVAL is this eval's folder. ROOT is the repo root, two levels up from EVAL.
export const EVAL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = path.join(EVAL, '..', '..');
