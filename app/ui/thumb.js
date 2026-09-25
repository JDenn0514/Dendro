// The small print beside a unit, with its credit under it. Home and the
// lessons overview both print it, so it is built in one place.
import { unitThumb } from '../logic/lessons.js';
import { numberWord } from '../logic/words.js';
import { labelFor } from '../logic/question.js';
import { el } from './dom.js';
import { plate, credit } from './plate.js';

// `.wide` on both the column and the figure cuts the empty lower band off the
// scan, so the caption sits under the print. Returns null when the unit holds
// no photo.
export function unitThumbColumn(content, unitKey, imageBase) {
  const found = unitThumb(content, unitKey);
  if (!found) return null;
  const column = el('div', 'figcol wide');
  const { label } = labelFor(content, found.kind, found.channel, found.key);
  const figure = plate(found.photo, {
    image_base: imageBase,
    alt: `Pressed specimen, ${label}`,
    shape: 'pl-thumb',
    lift: true
  });
  figure.classList.add('wide');
  column.append(figure);
  // Every photo the app prints carries its credit, the small print included.
  const count = (content.unit_cards[unitKey] ?? []).length;
  const caption = credit(found.photo, `${label}, one of the ${numberWord(count)}.`);
  // `plate-cap` stays on: a plate that fails to load removes the caption next
  // to it by that class, and a credit for a picture that is not there must go
  // with it.
  caption.classList.add('thumbcap');
  column.append(caption);
  return column;
}
