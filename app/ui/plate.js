// A plate shows one photograph plain: the whole image, at its own aspect
// ratio, on the paper. The sheet gives each place a width and a frame height
// or a height limit.
// Nothing crops, blends, masks, or tints the photo.
import { el } from './dom.js';
import { imageUrl } from '../logic/content.js';
import { licenseUrl, creditMark } from '../logic/licenses.js';
import { sourceHref } from '../logic/sources.js';

// A plate that cannot load leaves no broken image and no caption for a
// picture that is not there. The screens that want something else, and the
// session screen wants its own photo bookkeeping, pass `onError`.
function dropPlate(figure) {
  const caption = figure.nextElementSibling;
  if (caption && caption.classList.contains('plate-cap')) caption.remove();
  const note = el('p', 'fact-line', 'This plate did not load.');
  figure.replaceWith(note);
}

// `options`: `image_base`, `alt`, `shape` (a `pl-*` class, or left out for
// a plate that fills its column), `bleed` (run to both edges of the phone),
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

// A link that opens in a new tab, for the three links a credit carries.
function outLink(text, href) {
  const anchor = el('a', null, text);
  anchor.href = href;
  anchor.target = '_blank';
  anchor.rel = 'noopener';
  return anchor;
}

// The credit line. The author links to the photo's origin page, so the credit
// reaches the source. The source name links to its entry on the Sources
// screen, which gives the full name. It opens in a new tab, as the other two
// links do, so a session in progress stays open. The license name links to its
// deed when the app knows one, and prints as text when it does not.
// `creditMark` sets the separator, so the text is the text of `creditParts`.
export function credit(photo, lead = '') {
  const mark = creditMark(photo);
  const line = el('p', 'cap plate-cap');
  if (lead) line.append(document.createTextNode(`${lead} `));
  if (photo.origin) line.append(outLink(photo.author, photo.origin));
  else line.append(document.createTextNode(photo.author));
  line.append(document.createTextNode(`${mark} `));
  const entry = sourceHref(photo.source);
  if (entry) line.append(outLink(photo.source, entry));
  else line.append(document.createTextNode(photo.source));
  line.append(document.createTextNode(`${mark} `));
  const deed = licenseUrl(photo.license);
  if (deed) line.append(outLink(photo.license, deed));
  else line.append(document.createTextNode(photo.license));
  line.append(document.createTextNode('.'));
  return line;
}
