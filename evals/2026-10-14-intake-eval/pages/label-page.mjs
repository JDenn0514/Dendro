// The blind label page of the held-out set (plan Task 8): a private artifact page, with the db and user
// capabilities. Pure: returns the page HTML from heldout/pools.json.
// The page knows each photo only by its blind name. It shows no key, no judge code, no candidate id, no file
// name or URL, no hint, and no fetch order: the photos of each species take an order fixed by seed.
// Each tap saves labels/<blind name> { part, keep, step, at }. The "Best photo" view saves
// best/<target>-<part> { id, at }. Only Editors and up read or write (the publish declares the rules).
// The repeat page (Task 10) is the same page with { best: false, collection: 'repeat' }: the same controls
// and legend, no best-photo view, and each tap saves repeat/<repeat name>.
import { pickOrder } from '../lib/seed.mjs';
import { SHEET_HEAD, esc } from './style.mjs';
import { STEP_LEGEND, PART_LEGEND } from './legend.mjs';

const PARTS = [['leaf', 'Leaf'], ['bark', 'Bark'], ['fruit', 'Fruit'], ['other', 'Other']];

function card(p) {
  const b = esc(p.id);
  const seg = (name, items) => `<div class="seg" role="group" aria-label="${name} of photo ${p.n}">${items.map(([v, l]) => `<button type="button" id="${b}-${name}-${v}" data-f="${name}" data-v="${v}">${l}</button>`).join('')}</div>`;
  return `<article class="card" id="c-${b}" data-id="${b}">
<img src="img/${b}.jpg" alt="Photo ${p.n}" loading="lazy" width="440" height="330">
<div class="body">
<h3>Photo ${p.n}</h3>
<p class="src">${esc(p.source)}. ${esc(p.author)}, ${esc(p.license)}</p>
<span class="lbl">Part</span>${seg('part', PARTS)}
<span class="lbl">Keep</span>${seg('keep', [['true', 'Keep'], ['false', 'Drop']])}
<div class="steps" hidden><span class="lbl">Difficulty step</span>${seg('step', [['1', 'Step 1'], ['2', 'Step 2'], ['3', 'Step 3']])}</div>
<p class="state" aria-live="polite"></p>
</div>
</article>`;
}

export function labelPage(pool, { seed, best = true, collection = 'labels' }) {
  const species = pool.cells.map(c => ({
    target: c.target, name: c.species,
    photos: pickOrder(c.photos, seed, c.target).map((p, i) => ({ id: p.blind, n: i + 1, source: p.source, author: p.credit.author, license: p.credit.license })),
  }));
  const total = species.reduce((s, x) => s + x.photos.length, 0);
  const legend = `<dl>${[...STEP_LEGEND, PART_LEGEND].map(([t, d]) => `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>`).join('')}</dl>`;
  // The best-photo view needs each photo's species and section number; nothing else about it.
  const data = JSON.stringify(species.map(s => ({ target: s.target, name: s.name, photos: s.photos.map(p => [p.id, p.n]) }))).replace(/</g, '\\u003c');
  const title = best ? 'Held-out labels' : 'Repeat labels';
  const what = best ? `${total} photos of 3 species, blind.` : `${total} photos of ${species.length} species, blind, to label again.`;
  return `<title>${title}</title>
${SHEET_HEAD}
${best ? `#label-view, #best-view { display: grid; gap: 28px; } #best-view section { gap: 8px; }
.view-switch { display: flex; gap: 6px; } .view-switch button { flex: 0 1 auto; }
` : `#label-view { display: grid; gap: 28px; }
`}.lbl { font-size: 0.72rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }
.seg { display: flex; flex-wrap: wrap; gap: 4px; } .seg button { padding: 5px 6px; }
.src { overflow-wrap: anywhere; }
${best ? `.best-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 160px), 1fr)); gap: 10px; }
@media (max-width: 640px) { .best-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; } }
.tile { padding: 0; border-radius: 6px; overflow: hidden; display: grid; text-align: left; border-width: 2px; }
.tile img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
.tile span { padding: 4px 6px; font-size: 0.78rem; }
.tile[aria-pressed="true"] span { color: var(--accent-fg); }
.cellhead { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; align-items: baseline; }
.cellhead h3 { font: 600 1rem var(--body); } .cellhead p { margin: 0; color: var(--muted); font-size: 0.85rem; }
.empty { color: var(--muted); margin: 0; }
` : ''}</style>
<div class="wrap">
<header class="intro"><h1>${title}</h1>
<p>${what} For each photo, set the part, then keep or drop it, and on a keep its difficulty step. Each tap saves. The photos are in a shuffled order, and the page shows no earlier answer of any kind.</p>
${best ? `<p>When every photo has a label, open "Best photo" and pick the best photo of each species and part.</p>
` : ''}<div class="legend">${legend}</div>
</header>
<div class="bar"><span id="bar">${total} photos. Connecting to the saved answers…</span>
${best ? `<div class="view-switch" role="group" aria-label="View"><button type="button" id="v-label" aria-pressed="true">Label</button><button type="button" id="v-best" aria-pressed="false">Best photo</button></div>
` : ''}<details class="legend"><summary>What the steps mean</summary>${legend}</details></div>
<div id="label-view">
${species.map(s => `<section id="s-${esc(s.target)}"><h2>${esc(s.name)} (${s.photos.length})</h2><div class="grid">${s.photos.map(card).join('\n')}</div></section>`).join('\n')}
</div>
${best ? `<div id="best-view" hidden></div>
` : ''}</div>
<script>
(async () => {
  ${best ? `const SPECIES = ${data}, ` : 'const '}TOTAL = ${total};
${best ? `  const PARTS = [['leaf', 'Leaf'], ['bark', 'Bark'], ['fruit', 'Fruit']];
  const bar = document.getElementById('bar'), bestView = document.getElementById('best-view'), labelView = document.getElementById('label-view');
` : `  const bar = document.getElementById('bar');
`}  const cards = [...document.querySelectorAll('.card')];
  const labels = new Map()${best ? ', best = new Map()' : ''};
  const done = d => !!d && !!d.part && typeof d.keep === 'boolean' && (!d.keep || [1, 2, 3].includes(d.step));
${best ? `  let view = 'label';
` : ''}
  function paintCards() {
    for (const c of cards) {
      const d = labels.get(c.dataset.id) ?? {};
      for (const b of c.querySelectorAll('button')) b.setAttribute('aria-pressed', String(String(d[b.dataset.f]) === b.dataset.v));
      c.querySelector('.steps').hidden = d.keep !== true;
      c.classList.toggle('done', done(d));
    }
  }
${best ? `  function paintBest() {
    const parts = [];
    for (const s of SPECIES) for (const [part, name] of PARTS) {
      const kept = s.photos.filter(([id]) => { const d = labels.get(id); return d && d.keep === true && d.part === part; });
      const cell = s.target + '-' + part, chosen = best.get(cell)?.id;
      parts.push('<section><div class="cellhead"><h3>' + s.name + ', ' + name.toLowerCase() + '</h3><p>' + (kept.length ? (chosen ? 'Best photo saved' : 'Tap the best photo') : '') + '</p></div>'
        + (kept.length ? '<div class="best-grid">' + kept.map(([id, n]) => '<button type="button" class="tile" data-cell="' + cell + '" data-id="' + id + '" aria-pressed="' + (chosen === id) + '"><img src="img/' + id + '.jpg" alt="Photo ' + n + '" loading="lazy"><span>Photo ' + n + '</span></button>').join('') + '</div>'
          : '<p class="empty">No kept photo of this part.</p>') + '</section>');
    }
    bestView.innerHTML = parts.join('');
  }
` : ''}  function paintBar() {
    const n = cards.filter(c => done(labels.get(c.dataset.id))).length;
${best ? `    const cells = new Set(); for (const [id, d] of labels) if (d.keep === true && d.part !== 'other') { const s = SPECIES.find(x => x.photos.some(p => p[0] === id)); if (s) cells.add(s.target + '-' + d.part); }
    const chosen = [...cells].filter(c => best.has(c)).length;
    bar.textContent = n + ' of ' + TOTAL + ' photos labelled. Best photo: ' + chosen + ' of ' + cells.size + ' cells. Each tap saves.';
` : `    bar.textContent = n + ' of ' + TOTAL + ' photos labelled. Each tap saves.';
`}  }
  const paint = () => { paintCards(); ${best ? `if (view === 'best') paintBest(); ` : ''}paintBar(); };

${best ? `  for (const [id, v] of [['v-label', 'label'], ['v-best', 'best']]) document.getElementById(id).addEventListener('click', () => {
    view = v;
    document.getElementById('v-label').setAttribute('aria-pressed', String(v === 'label'));
    document.getElementById('v-best').setAttribute('aria-pressed', String(v === 'best'));
    labelView.hidden = v !== 'label'; bestView.hidden = v !== 'best';
    if (v === 'best') paintBest();
    window.scrollTo(0, 0);
  });

` : ''}  let db = null;
  try { db = await window.claude?.use('db'); } catch (e) { db = null; }
  if (!db) {
    bar.textContent = TOTAL + ' photos. Answers cannot be saved in this view. Open the page in claude.ai while signed in.';
    for (const b of document.querySelectorAll('.card button')) b.disabled = true;
    return;
  }
  const fail = e => { bar.textContent = 'The saved answers could not load (' + (e.code || 'error') + '). Reload the page to try again.'; };
  db.collection('${collection}').onSnapshot(snap => { labels.clear(); for (const d of snap.docs) labels.set(d.id, d.data()); paint(); }, fail);
${best ? `  db.collection('best').onSnapshot(snap => { best.clear(); for (const d of snap.docs) best.set(d.id, d.data()); paint(); }, fail);
` : ''}
  const refused = e => (e.code === 'permission_denied' || e.code === 'not_granted' ? 'You can view this page, but only the owner can answer.' : 'Not saved (' + (e.code || 'error') + '). Try again.');
  for (const c of cards) for (const b of c.querySelectorAll('button')) b.addEventListener('click', async () => {
    const st = c.querySelector('.state'), cur = labels.get(c.dataset.id) ?? {};
    const body = { part: cur.part ?? null, keep: typeof cur.keep === 'boolean' ? cur.keep : null, step: cur.step ?? null };
    if (b.dataset.f === 'part') body.part = b.dataset.v;
    if (b.dataset.f === 'keep') { body.keep = b.dataset.v === 'true'; if (!body.keep) body.step = null; }
    if (b.dataset.f === 'step') body.step = Number(b.dataset.v);
    body.at = new Date().toISOString();
    st.textContent = 'Saving…';
    try { await db.doc('${collection}/' + c.dataset.id).set(body); st.textContent = done(body) ? 'Saved.' : 'Saved. ' + (!body.part ? 'Set the part.' : body.keep == null ? 'Keep or drop it.' : 'Set the difficulty step.'); }
    catch (e) { st.textContent = refused(e); }
  });
${best ? `  bestView.addEventListener('click', async e => {
    const t = e.target.closest('.tile'); if (!t) return;
    try { await db.doc('best/' + t.dataset.cell).set({ id: t.dataset.id, at: new Date().toISOString() }); }
    catch (err) { bar.textContent = refused(err); }
  });
` : ''}})();
</script>
`;
}
