// A plate shows one photograph plain: the whole image, at its own aspect
// ratio, on the paper. The sheet gives each place a width and a frame height
// or a height limit.
// Nothing crops, blends, masks, or tints the photo.
import { el } from './dom.js';
import { imageUrl } from '../logic/content.js';

// A plate that cannot load leaves no broken image and no caption for a
// picture that is not there. The screens that want something else, and the
// session screen wants its own photo bookkeeping, pass `onError`.
function dropPlate(figure) {
  const caption = figure.nextElementSibling;
  if (caption && caption.classList.contains('plate-cap')) caption.remove();
  const note = el('p', 'fact-line', 'This plate did not load.');
  figure.replaceWith(note);
}

// `options`: `image_base`, `alt`, `shape` (a `pl-*` class, or null for a
// plate that fills its column), `bleed` (run to both edges of the phone),
// and `onError`.
export function plate(photo, options) {
  const classes = ['plate', options.shape];
  if (options.bleed) classes.push('bleed');
  const figure = el('figure', classes.filter(Boolean).join(' '));
  const image = document.createElement('img');
  image.src = imageUrl(photo, options.image_base);
  image.alt = options.alt ?? '';
  image.decoding = 'async';
  image.addEventListener('error', () => {
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
