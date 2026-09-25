// Text size: five steps. Every font size in the sheet is in rem, so moving
// the root size moves the whole app. The standard step sets no root size at
// all, so it follows whatever size the reader asked the browser for.

export const TEXT_SIZE_STEPS = [
  { name: 'smaller', root: '80%', sample_px: 14 },
  { name: 'small', root: '90%', sample_px: 15 },
  { name: 'standard', root: '', sample_px: 17 },
  { name: 'large', root: '115%', sample_px: 20 },
  { name: 'largest', root: '130%', sample_px: 22 }
];

export const TEXT_SIZE_DEFAULT = 'standard';

export function isTextSize(name) {
  return TEXT_SIZE_STEPS.some((step) => step.name === name);
}

export function stepFor(name) {
  return TEXT_SIZE_STEPS.find((step) => step.name === name)
    ?? TEXT_SIZE_STEPS.find((step) => step.name === TEXT_SIZE_DEFAULT);
}

export function applyTextSize(name) {
  const step = stepFor(name);
  document.documentElement.style.fontSize = step.root;
  return step.name;
}
