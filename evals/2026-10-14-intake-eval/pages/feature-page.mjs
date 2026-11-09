// The feature check page (plan Task 8): a private artifact page, with the db and user capabilities.
// Pure: returns the page HTML from the feature set rows with their credits.
// The page knows each photo only by its opaque id (f01 to f60). It shows no key, no judge code, no species,
// no URL, and no earlier answer of any kind. Each tap saves features/<id> { answers: { <feature>: true | false }, at }.
// Only Editors and up read or write (the publish declares the rules).
import { SHEET_HEAD, esc } from './style.mjs';
import { QUESTIONS } from '../lib/features.mjs';

const PARTS = [['leaf', 'Leaf'], ['bark', 'Bark'], ['fruit', 'Fruit']];

function card(it, n) {
  const b = esc(it.id);
  const row = f => {
    const q = QUESTIONS[`${it.part}:${f}`];
    if (!q) throw new Error(`${it.id}: no question for ${it.part}:${f}`);
    return `<div class="q" data-f="${esc(f)}"><p>${esc(q)}</p><div class="seg" role="group" aria-label="${esc(q)} Photo ${n}">`
      + `<button type="button" id="${b}-${esc(f)}-yes" data-v="true">Yes</button><button type="button" id="${b}-${esc(f)}-no" data-v="false">No</button></div></div>`;
  };
  return `<article class="card" id="c-${b}" data-id="${b}" data-n="${it.features.length}">
<img src="img/${b}.jpg" alt="Photo ${n}" loading="lazy" width="440" height="330">
<div class="body">
<h3>Photo ${n}</h3>
<p class="src">${esc(it.source)}. ${esc(it.author)}, ${esc(it.license)}</p>
${it.features.map(row).join('\n')}
<p class="state" aria-live="polite"></p>
</div>
</article>`;
}

// items: [{ id, part, features, source, author, license }]. Sections leaf, bark, fruit; photos in id order.
export function featurePage(items) {
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  let n = 0;
  const sections = PARTS.map(([part, name]) => {
    const mine = sorted.filter(it => it.part === part);
    return mine.length ? `<section id="s-${part}"><h2>${name} (${mine.length})</h2><div class="grid">${mine.map(it => card(it, ++n)).join('\n')}</div></section>` : '';
  }).join('\n');
  const total = items.length, questions = items.reduce((s, it) => s + it.features.length, 0);
  return `<title>Photo feature check</title>
<meta name="claude:viewport-fit-sides" content="cover">
${SHEET_HEAD}
.q { display: grid; gap: 4px; padding-top: 6px; border-top: 1px solid var(--line); }
.q p { margin: 0; font-size: 0.88rem; }
.seg { display: flex; gap: 4px; } .seg button { padding: 6px 6px; }
.src { overflow-wrap: anywhere; }
</style>
<div class="wrap">
<header class="intro"><h1>Photo feature check</h1>
<p>${total} key photos, ${questions} questions. For each photo, answer each question yes or no, as a learner who sees the photo for the first time.</p>
<p>Answer yes only when a learner sees it at a glance. When a learner must look closely or hunt for it, or the photo does not show it, answer no. Each tap saves.</p>
</header>
<div class="bar"><span id="bar">${total} photos. Connecting to the saved answers…</span></div>
${sections}
</div>
<script>
(async () => {
  const TOTAL = ${total};
  const bar = document.getElementById('bar');
  const cards = [...document.querySelectorAll('.card')];
  let saved = new Map();
  const done = c => { const a = saved.get(c.dataset.id)?.answers ?? {}; return [...c.querySelectorAll('.q')].every(q => typeof a[q.dataset.f] === 'boolean'); };
  function paint() {
    for (const c of cards) {
      const a = saved.get(c.dataset.id)?.answers ?? {};
      for (const q of c.querySelectorAll('.q')) for (const b of q.querySelectorAll('button')) b.setAttribute('aria-pressed', String(String(a[q.dataset.f]) === b.dataset.v));
      c.classList.toggle('done', done(c));
    }
    bar.textContent = cards.filter(done).length + ' of ' + TOTAL + ' photos answered. Each tap saves.';
  }

  let db = null;
  try { db = await window.claude?.use('db'); } catch (e) { db = null; }
  if (!db) {
    bar.textContent = TOTAL + ' photos. Answers cannot be saved in this view. Open the page in claude.ai while signed in.';
    for (const b of document.querySelectorAll('.card button')) b.disabled = true;
    return;
  }
  const timer = setTimeout(() => { bar.textContent = 'The saved answers are slow to load. Reload the page if this stays.'; }, 10000);
  db.collection('features').onSnapshot(snap => { clearTimeout(timer); saved = new Map(snap.docs.map(d => [d.id, d.data()])); paint(); },
    e => { clearTimeout(timer); bar.textContent = 'The saved answers could not load (' + (e.code || 'error') + '). Reload the page to try again.'; });

  const refused = e => (e.code === 'permission_denied' || e.code === 'not_granted' ? 'You can view this page, but only the owner can answer.' : 'Not saved (' + (e.code || 'error') + '). Try again.');
  for (const c of cards) for (const q of c.querySelectorAll('.q')) for (const b of q.querySelectorAll('button')) b.addEventListener('click', async () => {
    const st = c.querySelector('.state');
    const answers = { ...(saved.get(c.dataset.id)?.answers ?? {}), [q.dataset.f]: b.dataset.v === 'true' };
    st.textContent = 'Saving…';
    try {
      await db.doc('features/' + c.dataset.id).set({ answers, at: new Date().toISOString() });
      const left = [...c.querySelectorAll('.q')].filter(x => typeof answers[x.dataset.f] !== 'boolean').length;
      st.textContent = left ? 'Saved. ' + left + ' left on this photo.' : 'Saved. Photo done.';
    } catch (e) { st.textContent = refused(e); }
  });
})();
</script>
`;
}
