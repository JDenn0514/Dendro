// The review sheet: a private artifact page that shows photos side by side with captions, and saves one
// answer per photo to the artifact's db (plan, Global constraints). Pure: returns the page HTML.
// sheet: { title, intro: [paragraphs], legend?: [[term, text]], collection, choices: [{ value, label }], groups: [{ id, heading, text, items }] }.
// item: { id, img, key, chips: [text], table: { cols, rows: [[label, ...cells]] }, lines: [text], notes: [[who, text]], source }.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,600&display=swap">
<style>
/* Layout: a field sheet. A sticky count bar, then one section per group with a grid of photo cards, 2 per row on a phone. */
:root {
  --bg: #f4f6f2; --card: #ffffff; --fg: #1c231f; --muted: #5a675f; --line: #d6ddd5;
  --accent: #2d6a4f; --accent-fg: #ffffff; --chip: #e6ece4;
  --display: "Source Serif 4", Georgia, serif; --body: "IBM Plex Sans", system-ui, sans-serif; --mono: "IBM Plex Mono", ui-monospace, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #141a17; --card: #1c2420; --fg: #e3e9e4; --muted: #9aa89f; --line: #2f3b35; --accent: #6fbf94; --accent-fg: #0d1511; --chip: #26312b; color-scheme: dark } }
:root[data-theme="dark"] { --bg: #141a17; --card: #1c2420; --fg: #e3e9e4; --muted: #9aa89f; --line: #2f3b35; --accent: #6fbf94; --accent-fg: #0d1511; --chip: #26312b; color-scheme: dark }
body { background: var(--bg); color: var(--fg); font: 15px/1.5 var(--body); }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--bg); }
.wrap { max-width: 1200px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 20px 48px; display: grid; gap: 28px; }
h1, h2 { font-family: var(--display); font-weight: 600; text-wrap: balance; margin: 0; }
h1 { font-size: 1.7rem; } h2 { font-size: 1.25rem; }
.intro { display: grid; gap: 10px; max-width: 68ch; } .intro p, section > p { margin: 0; }
.bar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: var(--bg); border-bottom: 1px solid var(--line); padding-block: 8px; font-variant-numeric: tabular-nums; color: var(--muted); display: grid; gap: 6px; }
.legend summary { color: var(--accent); font-weight: 500; }
.intro .legend dl { max-height: none; }
.legend dl { margin: 6px 0 0; display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; color: var(--fg); max-width: 72ch; max-height: 50vh; overflow-y: auto; }
.legend dt { font-weight: 600; } .legend dd { margin: 0; }
section { display: grid; gap: 12px; } section > p { max-width: 68ch; color: var(--muted); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: 14px; }
@media (max-width: 640px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } body { font-size: 13px; } }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 6px; overflow: hidden; display: flex; flex-direction: column; min-width: 0; }
.card.done { border-color: var(--accent); }
.card img { width: 100%; height: auto; aspect-ratio: 4 / 3; object-fit: contain; background: var(--chip); display: block; }
.body { padding: 10px; display: grid; gap: 6px; min-width: 0; }
h3 { margin: 0; font: 500 0.95rem var(--mono); overflow-wrap: anywhere; }
.chips { margin: 0; display: flex; flex-wrap: wrap; gap: 4px; }
.chip { background: var(--chip); border-radius: 3px; padding: 1px 6px; font-size: 0.8rem; }
.tbl { overflow-x: auto; } table { border-collapse: collapse; font: 0.75rem/1.35 var(--mono); width: 100%; }
th, td { text-align: left; padding: 2px 4px; border-bottom: 1px solid var(--line); vertical-align: top; } thead th { color: var(--muted); font-weight: 500; }
.line, .src { margin: 0; font-size: 0.85rem; } .src { color: var(--muted); }
details { font-size: 0.82rem; } details p { margin: 4px 0 0; } summary { cursor: pointer; color: var(--muted); }
.choices { display: flex; flex-wrap: wrap; gap: 6px; }
button { font: 500 0.82rem var(--body); padding: 6px 10px; border-radius: 4px; border: 1px solid var(--line); background: var(--card); color: var(--fg); cursor: pointer; flex: 1 1 auto; }
button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
button:focus-visible, textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button:disabled { cursor: default; opacity: 0.6; }
.why { font-size: 0.78rem; color: var(--muted); } textarea { font: inherit; width: 100%; box-sizing: border-box; border: 1px solid var(--line); border-radius: 4px; background: var(--bg); color: var(--fg); padding: 4px 6px; resize: vertical; }
.state { margin: 0; font-size: 0.78rem; color: var(--muted); min-height: 1.2em; }
</style>
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
