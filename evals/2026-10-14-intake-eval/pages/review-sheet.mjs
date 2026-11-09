// The review sheet: a private artifact page that shows photos side by side with captions, and saves one
// answer per photo to the artifact's db (plan, Global constraints). Pure: returns the page HTML.
// sheet: { title, intro: [paragraphs], legend?: [[term, text]], collection, choices: [{ value, label }], groups: [{ id, heading, text, items }] }.
// item: { id, img, key, chips: [text], table: { cols, rows: [[label, ...cells]] }, lines: [text], notes: [[who, text]], source }.
import { SHEET_HEAD, esc } from './style.mjs';


function card(it, choices) {
  const t = it.table;
  return `<article class="card" id="c-${esc(it.id)}" data-id="${esc(it.id)}">
<img src="${esc(it.img)}" alt="Key photo ${esc(it.key)}" loading="lazy" width="440" height="330">
<div class="body">
<h3>${esc(it.key)}</h3>
<p class="chips">${it.chips.map(c => `<span class="chip">${esc(c)}</span>`).join('')}</p>
${t ? `<div class="tbl"><table><thead><tr><th></th>${t.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r => `<tr><th>${esc(r[0])}</th>${r.slice(1).map(x => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
${it.lines.map(l => `<p class="line">${esc(l)}</p>`).join('')}
${it.notes.length ? `<details><summary>Judge notes</summary>${it.notes.map(([w, n]) => `<p><b>${esc(w)}:</b> ${esc(n)}</p>`).join('')}</details>` : ''}
<p class="src">Source name: <i>${esc(it.source)}</i></p>
<div class="choices" role="group" aria-label="Your answer for ${esc(it.key)}">${choices.map(c => `<button type="button" id="b-${esc(it.id)}-${esc(c.value)}" data-v="${esc(c.value)}">${esc(c.label)}</button>`).join('')}</div>
<label class="why" for="n-${esc(it.id)}">Why (optional)</label>
<textarea id="n-${esc(it.id)}" rows="2"></textarea>
<p class="state" aria-live="polite"></p>
</div>
</article>`;
}

export function reviewSheet(sheet) {
  const total = sheet.groups.reduce((s, g) => s + g.items.length, 0);
  const legend = sheet.legend ? `<dl>${sheet.legend.map(([t, d]) => `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>`).join('')}</dl>` : '';
  return `<title>${esc(sheet.title)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
${SHEET_HEAD}</style>
<div class="wrap">
<header class="intro"><h1>${esc(sheet.title)}</h1>${sheet.intro.map(p => `<p>${esc(p)}</p>`).join('')}${sheet.legend ? `<div class="legend">${legend}</div>` : ''}</header>
<div class="bar"><span id="bar">${total} photos. Connecting to the saved answers…</span>${sheet.legend ? `<details class="legend"><summary>What the steps mean</summary>${legend}</details>` : ''}</div>
${sheet.groups.map(g => `<section id="${esc(g.id)}"><h2>${esc(g.heading)} (${g.items.length})</h2><p>${esc(g.text)}</p><div class="grid">${g.items.map(it => card(it, sheet.choices)).join('\n')}</div></section>`).join('\n')}
</div>
<script>
(async () => {
  const COLLECTION = ${JSON.stringify(sheet.collection)}, TOTAL = ${total};
  const bar = document.getElementById('bar');
  const cards = [...document.querySelectorAll('.card')];
  const saved = new Map();
  const paint = () => {
    for (const c of cards) {
      const d = saved.get(c.dataset.id);
      for (const b of c.querySelectorAll('button')) b.setAttribute('aria-pressed', String(d?.verdict === b.dataset.v));
      c.classList.toggle('done', !!d?.verdict);
      const t = c.querySelector('textarea');
      if (document.activeElement !== t && d?.note != null) t.value = d.note;
    }
    const n = cards.filter(c => saved.get(c.dataset.id)?.verdict).length;
    bar.textContent = n + ' of ' + TOTAL + ' photos answered. Each tap saves.';
  };
  let db = null;
  try { db = await window.claude?.use('db'); } catch (e) { db = null; }
  if (!db) {
    bar.textContent = TOTAL + ' photos. Answers cannot be saved in this view. Open the page in claude.ai while signed in.';
    for (const b of document.querySelectorAll('button, textarea')) b.disabled = true;
    return;
  }
  db.collection(COLLECTION).onSnapshot(snap => {
    saved.clear();
    for (const d of snap.docs) saved.set(d.id, d.data());
    paint();
  }, e => { bar.textContent = 'The saved answers could not load (' + (e.code || 'error') + '). Reload the page to try again.'; });
  const save = async (c, patch) => {
    const st = c.querySelector('.state');
    const body = { ...(saved.get(c.dataset.id) ?? {}), ...patch, at: new Date().toISOString() };
    st.textContent = 'Saving…';
    try { await db.doc(COLLECTION + '/' + c.dataset.id).set(body); st.textContent = 'Saved.'; }
    catch (e) { st.textContent = e.code === 'permission_denied' || e.code === 'not_granted' ? 'You can view this sheet, but only the owner can answer.' : 'Not saved (' + (e.code || 'error') + '). Try again.'; }
  };
  for (const c of cards) {
    for (const b of c.querySelectorAll('button')) b.addEventListener('click', () => save(c, { verdict: b.dataset.v }));
    const t = c.querySelector('textarea');
    t.addEventListener('change', () => save(c, { note: t.value.trim() }));
  }
})();
</script>
`;
}
