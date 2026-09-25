// A plate never ends on a straight line.
//
// .plate.print   A bright studio scan. It multiplies into the paper, so the
//                white ground becomes paper and the specimen has no edge.
// .plate.field   A photograph that carries its own ground. Multiply would
//                turn that ground into a grey rectangle, so a field plate
//                does not blend: it dissolves on four sides through a mask.
//
// Which one a photo gets is measured, not guessed. `plateTreatment` reads a
// `ground` field on the manifest row first, so the pipeline can decide later
// with no other change. With no field it reads the cache, and the cache is
// filled by `measure`, which samples the four corners of the photo.
//
// The sample runs on a second `Image` that sets `crossOrigin`, never on the
// one the page shows. A `crossOrigin` attribute on the displayed image would
// make a CDN with no CORS header fail the image load itself, and the photo
// would not appear at all. The probe is served from the browser cache when
// the CORS check passes, so it costs no second download. A probe that errors,
// and a read that still throws, both leave the photo a field plate.
//
// A photo with no `ground` field and no cache entry cannot be placed until
// its image has loaded, so the figure carries `measuring` and the sheet keeps
// the image invisible until the class is right. Otherwise every bright scan
// paints once as a field plate and snaps to a print a frame later.
import { el } from './dom.js';
import { imageUrl } from '../logic/content.js';

// A mean corner luminance at or above this reads as a bright studio ground.
export const PRINT_THRESHOLD = 0.86;

const SAMPLE = 24;
const CORNER = 4;
const treatments = new Map();

// Set the first time a cross-origin probe is refused. A CDN sends the CORS
// header for every image or for none, so one refusal settles the whole
// origin and no later plate pays for a probe that cannot succeed.
let corsBlocked = false;

export function plateTreatment(photo) {
  if (photo.ground === 'bright') return 'print';
  if (photo.ground === 'own') return 'field';
  return treatments.get(photo.hash) ?? 'field';
}

// Is the treatment already known, or must this image be measured first? A
// manifest flag settles it with no image at all; a hash the cache holds was
// settled by an earlier figure.
function settled(photo) {
  return photo.ground === 'bright' || photo.ground === 'own'
    || treatments.has(photo.hash);
}

function sameOrigin(src) {
  try {
    return new URL(src, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

function cornerLuminance(image) {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  const paper = canvas.getContext('2d', { willReadFrequently: true });
  paper.drawImage(image, 0, 0, SAMPLE, SAMPLE);
  const corners = [[0, 0], [SAMPLE - CORNER, 0], [0, SAMPLE - CORNER],
    [SAMPLE - CORNER, SAMPLE - CORNER]];
  let total = 0;
  let count = 0;
  for (const [x, y] of corners) {
    const { data } = paper.getImageData(x, y, CORNER, CORNER);
    for (let i = 0; i < data.length; i += 4) {
      total += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      count += 1;
    }
  }
  return count === 0 ? 0 : total / count;
}

// The corner sample, on its own `crossOrigin` image. `done` always runs, on
// the good path and on both failure paths, so a figure never stays hidden.
function probe(src, done) {
  const cross = !sameOrigin(src);
  if (cross && corsBlocked) { done('field'); return; }
  const sample = new Image();
  sample.crossOrigin = 'anonymous';
  sample.addEventListener('load', () => {
    try {
      done(cornerLuminance(sample) >= PRINT_THRESHOLD ? 'print' : 'field');
    } catch {
      if (cross) corsBlocked = true;
      done('field');
    }
  });
  sample.addEventListener('error', () => {
    if (cross) corsBlocked = true;
    done('field');
  });
  sample.src = src;
}

function dress(figure, photo) {
  figure.classList.remove('print', 'field', 'measuring');
  figure.classList.add(treatments.get(photo.hash) ?? 'field');
}

// Runs on the displayed image's own load event. The corner sample runs once
// per hash; the class swap runs every time, because a second figure on the
// same photo reaches this point with the cache already warm and still needs
// its class.
function measure(figure, image, photo) {
  if (treatments.has(photo.hash)) { dress(figure, photo); return; }
  probe(image.src, (treatment) => {
    if (!treatments.has(photo.hash)) treatments.set(photo.hash, treatment);
    dress(figure, photo);
  });
}

// A plate that cannot load leaves no broken image and no caption for a
// picture that is not there. The screens that want something else, and the
// session screen wants its own photo bookkeeping, pass `onError`.
function dropPlate(figure) {
  const caption = figure.nextElementSibling;
  if (caption && caption.classList.contains('plate-cap')) caption.remove();
  const note = el('p', 'fact-line', 'This plate did not load.');
  figure.replaceWith(note);
}

export function plate(photo, options) {
  const treatment = plateTreatment(photo);
  const classes = ['plate', treatment, options.shape];
  if (options.bleed) classes.push('bleed');
  if (options.lift) classes.push('lift');
  if (options.soft) classes.push('soft');
  if (options.mono) classes.push('mono');
  // An unsettled photo draws nothing until the corner sample has run.
  const pending = !settled(photo);
  if (pending) classes.push('measuring');
  const figure = el('figure', classes.filter(Boolean).join(' '));
  const image = document.createElement('img');
  image.src = imageUrl(photo, options.image_base);
  image.alt = options.alt ?? '';
  image.decoding = 'async';
  if (pending) image.addEventListener('load', () => measure(figure, image, photo));
  image.addEventListener('error', () => {
    // An image that never lands must not leave an invisible plate behind.
    figure.classList.remove('measuring');
    if (options.onError) options.onError(figure, photo);
    else dropPlate(figure);
  });
  figure.append(image);
  return figure;
}

// The credit line. The author links to the photo's origin page, so the credit
// reaches the source.
export function credit(photo, lead = '') {
  const line = el('p', 'cap plate-cap');
  if (lead) line.append(document.createTextNode(`${lead} `));
  if (photo.origin) {
    const anchor = el('a', null, photo.author);
    anchor.href = photo.origin;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    line.append(anchor);
  } else {
    line.append(document.createTextNode(photo.author));
  }
  line.append(document.createTextNode(`, ${photo.source}, ${photo.license}.`));
  return line;
}
