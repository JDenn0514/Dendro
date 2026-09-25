import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decodeEntities, htmlText, openTags } from '../lib/html.ts';

test('decodeEntities decodes named and numeric references once', () => {
  assert.equal(decodeEntities('Gambel&#039;s Oak'), "Gambel's Oak");
  assert.equal(decodeEntities('&quot;Baobab Planes&quot;'), '"Baobab Planes"');
  assert.equal(decodeEntities('&copy; RBG Kew'), '© RBG Kew');
  assert.equal(decodeEntities('A&#x41;&#8217;'), 'AA’');
  assert.equal(decodeEntities('&amp;lt;'), '&lt;', 'a replacement is never read again');
  assert.equal(decodeEntities('&unknown; stays'), '&unknown; stays');
});

test('htmlText strips tags, decodes, and collapses white space', () => {
  assert.equal(
    htmlText('<p><i>Quercus gambelii</i>,\n  NM-15.&nbsp;Image Charles Snyers.</p>'),
    'Quercus gambelii , NM-15. Image Charles Snyers.',
  );
  assert.equal(htmlText('  <br/>  '), '');
});

test('openTags reads double-quoted attributes that hold < and >', () => {
  const html =
    '<a class="uk-inline" href="/f/1.jpg" data-caption="<p>A &amp; B</p>" hidden><img></a>'
    + '<a href=/x/>unquoted</a><abbr title="t">';
  const tags = openTags(html, 'a');
  assert.equal(tags.length, 1, 'the unquoted tag and the abbr tag are not returned');
  assert.deepEqual(tags[0].attrs, {
    class: 'uk-inline',
    href: '/f/1.jpg',
    'data-caption': '<p>A &amp; B</p>',
    hidden: '',
  });
  assert.equal(
    html.slice(tags[0].start, tags[0].end),
    '<a class="uk-inline" href="/f/1.jpg" data-caption="<p>A &amp; B</p>" hidden>',
  );
});

test('openTags reads a value that spans lines', () => {
  const tags = openTags('<a href="//x/a.jpg" data-caption="line one\n&lt;br&gt;line two">', 'a');
  assert.equal(tags.length, 1);
  assert.equal(tags[0].attrs['data-caption'], 'line one\n&lt;br&gt;line two');
});
