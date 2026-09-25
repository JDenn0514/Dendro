#!/usr/bin/env node
/*
 * Photo harvester for Dendro content runs.
 *
 * It reads a list of gap rows, asks Bioimages and Trees and Shrubs Online for the
 * species pages, keeps the images whose licence is on the allowlist and whose
 * caption suggests the gap row's channel, skips anything already in the run's
 * candidates file, downloads what is left, and writes two files into --out-dir:
 *
 *   harvest-rows.json    one object per kept image
 *   harvest-report.md    the licence decision per site and the yield per row
 *
 * Usage:
 *   node pipeline/scripts/harvest.cjs --rows <file> --run <name> --out-dir <dir>
 *
 * A gap row is { "symbol": <target>, "sci": <scientific name>, "channel": <channel>,
 * "approved": <count> }. A concept row has symbol = the concept key (for example
 * `bark/shaggy`), sci = one exemplar species, and channel = the key's prefix.
 *
 * Put --out-dir outside the repo, for example in the session scratchpad. The CLI
 * commits with `git add -A`, so a file inside the repo reaches a commit.
 *
 * Only Node built-ins. Network calls go through the system `curl`.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// -------------------------------------------------------------- settings

// The repo root is two folders up from pipeline/scripts/.
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// main() sets these from the flags. No default path points inside the repo.
let OUT_DIR = '';
let DL_DIR = '';
let CACHE = '';
let BIO_DIR = '';
let RUN = '';
let CANDIDATES = '';

const USAGE = 'usage: node pipeline/scripts/harvest.cjs --rows <file> --run <name> --out-dir <dir>';

/** Reads the three required flags. It throws an Error with the usage line when one is missing. */
function parseArgs(argv) {
  const value = (flag) => {
    const at = argv.indexOf(flag);
    const next = at === -1 ? undefined : argv[at + 1];
    return next === undefined || next.startsWith('--') ? null : next;
  };
  const rows = value('--rows');
  const run = value('--run');
  const outDir = value('--out-dir');
  if (rows === null || run === null || outDir === null) throw new Error(USAGE);
  return { rows, run, outDir };
}

/** The candidates file of a run, which the harvester reads for duplicates. */
function candidatesPath(run) {
  return path.join(REPO_ROOT, 'pipeline', 'runs', run, 'candidates.jsonl');
}

// This user agent gets a 200 from every admitted host. The full Chrome string
// gets a 403 from treesandshrubsonline.org.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0';

const HOST_GAP_MS = 400; // space between two calls to one host

// A row that has 0 or 1 approved photos wants 3 new ones; a row that has 2 or
// 3 wants 2. Download three times that, so the viewing step has a choice.
function budgetFor(row) {
  return row.approved <= 1 ? 9 : 6;
}

const CHANNEL_WORDS = {
  bark: /\b(bark|trunk|bole|boles|trunks)\b/i,
  fruit: /\b(fruit|fruits|fruiting|acorn|acorns|samara|samaras|seed|seeds|nut|nutlet|nutlets|cup|cups|ball|balls|fruit-ball|infructescence)\b/i,
  leaf: /\b(leaf|leaves|foliage)\b/i,
  flower: /\b(flower|flowers|catkin|catkins|inflorescence)\b/i,
  twig: /\b(twig|twigs|bud|buds|shoot|shoots)\b/i,
};

const ALLOWED_LICENCES = {
  'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
};

// --------------------------------------------------------------- helpers

const lastCall = new Map();

function pace(url) {
  let host;
  try {
    host = new URL(url).host;
  } catch (e) {
    return;
  }
  const prev = lastCall.get(host) || 0;
  const wait = HOST_GAP_MS - (Date.now() - prev);
  if (wait > 0) {
    // Node has no built-in sync sleep; a child process that exits after the
    // delay is the portable way to block here.
    try {
      execFileSync(process.execPath, ['-e', `setTimeout(function(){}, ${wait})`]);
    } catch (e) {
      /* ignore */
    }
  }
  lastCall.set(host, Date.now());
}

function curl(url, outFile, extraArgs) {
  pace(url);
  const args = [
    '-s', '-L', '--compressed', '--max-time', '90',
    '-A', UA,
    '-H', 'Accept-Language: en-US,en;q=0.9',
    '-w', '%{http_code}',
    '-o', outFile,
  ];
  if (extraArgs) args.push.apply(args, extraArgs);
  args.push(url);
  let code;
  try {
    code = execFileSync('curl', args, { encoding: 'utf8' }).trim();
  } catch (e) {
    return { ok: false, status: 'ERROR', note: e.message };
  }
  if (code === '429') {
    // Back off once, then try again.
    try {
      execFileSync(process.execPath, ['-e', 'setTimeout(function(){}, 20000)']);
    } catch (e) { /* ignore */ }
    try {
      code = execFileSync('curl', args, { encoding: 'utf8' }).trim();
    } catch (e) {
      return { ok: false, status: '429', note: 'rate limited' };
    }
  }
  return { ok: code.charAt(0) === '2', status: code };
}

function getText(url, cacheName) {
  fs.mkdirSync(CACHE, { recursive: true });
  const f = path.join(CACHE, cacheName);
  if (fs.existsSync(f) && fs.statSync(f).size > 0) return fs.readFileSync(f, 'utf8');
  const r = curl(url, f);
  if (!r.ok) {
    fetchLog.push(`${url} -> ${r.status}`);
    return null;
  }
  return fs.readFileSync(f, 'utf8');
}

const fetchLog = [];

function decodeEntities(s) {
  if (!s) return '';
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&copy;/g, '\u00a9')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A credit as the app prints it: Unicode NFC, each run of white space as one space,
 * control characters out, trimmed. Letters in every script stay, so `Jiří Dvořák`
 * stays as it is.
 */
function cleanCredit(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .replace(/\p{Cc}/gu, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

// Values go inside double quotes in a shell command, so these characters are
// not allowed through.
function shellSafe(s) {
  return String(s).replace(/["`$!\\]/g, '').replace(/\s+/g, ' ').trim();
}

function loadSeen() {
  const seen = new Set();
  if (!fs.existsSync(CANDIDATES)) return seen;
  const lines = fs.readFileSync(CANDIDATES, 'utf8').split(/\r?\n/);
  for (const l of lines) {
    if (!l.trim()) continue;
    let o;
    try { o = JSON.parse(l); } catch (e) { continue; }
    if (o.origin) seen.add(o.origin.trim());
    if (o.file_url) seen.add(o.file_url.trim());
  }
  return seen;
}

function readPsv(file) {
  const txt = fs.readFileSync(path.join(BIO_DIR, file), 'utf8');
  const lines = txt.split(/\r?\n/).filter((l) => l.length > 0);
  const head = lines[0].split('|');
  return lines.slice(1).map((l) => {
    const c = l.split('|');
    const o = {};
    head.forEach((h, i) => (o[h] = c[i]));
    return o;
  });
}

// -------------------------------------------------- site: Bioimages

const BIO_FILES = ['names.csv', 'determinations.csv', 'images.csv'];
const BIO_RAW = 'https://raw.githubusercontent.com/baskaufs/Bioimages/master/';

// usageTermsIndex, from http://bioimages.vanderbilt.edu licence table
const BIO_LIC = {
  '0': ['Public domain (CC0 1.0)', 'https://creativecommons.org/publicdomain/zero/1.0/', /publicdomain\/zero/],
  '1': ['CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/', /licenses\/by\/4\.0/],
  '2': ['CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/', /licenses\/by-sa\/4\.0/],
};

const BIO_VIEW = { '0102': 'bark', '0103': 'twig', '0104': 'leaf', '0105': 'flower', '0106': 'fruit' };

// A mature trunk beats a small branch, and a rated image beats an unrated one.
const BIO_VIEW_RANK = {
  '010201': 0, '010202': 1, '010200': 2, '010203': 5,
  '010602': 0, '010601': 1, '010600': 2, '010603': 3, '010604': 4, '010605': 4,
};

function bioSetup() {
  fs.mkdirSync(BIO_DIR, { recursive: true });
  for (const f of BIO_FILES) {
    const p = path.join(BIO_DIR, f);
    if (fs.existsSync(p) && fs.statSync(p).size > 1000) continue;
    const r = curl(BIO_RAW + f, p);
    if (!r.ok) return false;
  }
  return true;
}

function bioHarvest(rows, seen) {
  const yielded = {};
  if (!bioSetup()) return { rows: [], yielded, note: 'metadata download failed' };

  const wanted = new Set(rows.map((r) => r.sci));
  const nameById = new Map();
  for (const n of readPsv('names.csv')) {
    nameById.set(n.dcterms_identifier, `${n.dwc_genus} ${n.dwc_specificEpithet}`.trim());
  }
  const orgSci = new Map();
  for (const d of readPsv('determinations.csv')) {
    if (d.suppress && d.suppress.trim()) continue;
    const sci = nameById.get(d.tsnID);
    if (sci && wanted.has(sci)) orgSci.set(d.dsw_identified, sci);
  }

  const byKey = new Map();
  for (const im of readPsv('images.csv')) {
    if (im.suppress && im.suppress.trim()) continue;
    const sci = orgSci.get(im.foaf_depicts);
    if (!sci) continue;
    const view = (im.view || '').replace('#', '');
    const chan = BIO_VIEW[view.slice(0, 4)];
    if (!chan) continue;
    const lic = BIO_LIC[im.usageTermsIndex];
    if (!lic) continue; // NC images are out
    const code = (im.dcterms_identifier || '').split('/').slice(-2)[0];
    const key = `${sci}|${chan}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({
      sci, channel: chan, channel_hint: chan, view,
      origin: im.ac_attributionLinkURL,
      file_url: `http://bioimages.vanderbilt.edu/gq/${code}/g${im.fileName}`,
      author: im.xmpRights_Owner,
      license: lic[0], license_url: lic[1], licRe: lic[2],
      source: 'Bioimages',
      source_species: sci,
      caption: im.dcterms_title,
      rating: parseInt(im.xmp_Rating || '0', 10) || 0,
      px: (parseInt(im.exif_PixelXDimension || '0', 10) || 0) * (parseInt(im.exif_PixelYDimension || '0', 10) || 0),
    });
  }

  const out = [];
  for (const row of rows) {
    const key = `${row.sci}|${row.channel}`;
    const list = (byKey.get(key) || []).slice();
    list.sort((a, b) => {
      const va = BIO_VIEW_RANK[a.view] === undefined ? 9 : BIO_VIEW_RANK[a.view];
      const vb = BIO_VIEW_RANK[b.view] === undefined ? 9 : BIO_VIEW_RANK[b.view];
      if (va !== vb) return va - vb;
      if (b.rating !== a.rating) return b.rating - a.rating;
      return b.px - a.px;
    });
    const cap = budgetFor(row);
    let kept = 0;
    for (const c of list) {
      if (kept >= cap) break;
      if (!c.origin || !c.file_url) continue;
      if (seen.has(c.origin.trim()) || seen.has(c.file_url.trim())) continue;
      // Read the licence on the page that holds the image.
      const page = getText(c.origin, 'bio-' + c.origin.split('/').slice(-2).join('-'));
      if (!page) continue;
      if (!c.licRe.test(page)) continue;
      delete c.licRe;
      c.symbol = row.symbol;
      c.target = row.symbol;
      out.push(c);
      seen.add(c.origin.trim());
      seen.add(c.file_url.trim());
      kept++;
    }
    yielded[`${row.symbol}|${row.channel}`] = kept;
  }
  return { rows: out, yielded };
}

// ---------------------------------------- site: Trees and Shrubs Online

const TSO_BASE = 'https://www.treesandshrubsonline.org';

// The rules below are the same as the rules of the TSO fetch in pipeline/lib/tso.ts. This
// script uses only Node built-ins, so it keeps its own copy. Change both files together.

/** The article path of a name: `/articles/<genus>/<genus>-<epithet>/`, lower case, `×` as `x`. */
function tsoPath(name) {
  const words = String(name)
    .normalize('NFC')
    .replace(/×/g, ' x ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .split(' ');
  const genus = words[0] || '';
  let epithet = words[1] || '';
  if (epithet === 'x') epithet = words[2] === undefined ? '' : `x-${words[2]}`;
  if (!/^[a-z]+$/.test(genus) || !/^[a-z][a-z-]*$/.test(epithet)) return null;
  return `/articles/${genus}/${genus}-${epithet}/`;
}

// A caption with its own rights text may differ from the site licence, so it is skipped.
const TSO_OWN_RIGHTS = /©|\(c\)|permission|courtesy|rights reserved/i;
// The words in lower case that can be part of a name, as in `Jan van der Berg`.
const TSO_NAME_JOINERS = new Set([
  'and', '&', 'de', 'del', 'della', 'der', 'den', 'di', 'da', 'do', 'dos', 'du', 'la', 'le',
  'van', 'von', 'y',
]);

/**
 * The photographer of a caption that ends `Image <Name>.`, or null. The name is the text
 * after the last `Image `. When that text holds a digit or a word in lower case that is not
 * a name joiner, the caption goes on after the name, and the value is null.
 */
function tsoCredit(caption) {
  const text = String(caption);
  if (TSO_OWN_RIGHTS.test(text)) return null;
  const at = text.lastIndexOf('Image ');
  if (at === -1 || (at > 0 && text[at - 1] !== ' ')) return null;
  const name = text.slice(at + 'Image '.length).replace(/\.\s*$/, '').trim();
  if (name === '' || /\d/.test(name)) return null;
  const words = name.split(/\s+/);
  if (!words.every((w) => !/^\p{Ll}/u.test(w) || TSO_NAME_JOINERS.has(w))) return null;
  return name;
}

/**
 * The credited images of the species itself on one article: `{ href, cap, author }`, one for
 * each href. An image in a `/site/assets/files/<pageId>/` folder whose `<pageId>` is the `id`
 * of an `<h3>` on the page is skipped, because those sections hold cultivars and varieties.
 */
function tsoPageImages(body) {
  const sections = new Set();
  for (const m of body.matchAll(/<h3\s+id=["']?([^"'\s>]+)["']?/gi)) sections.add(m[1]);
  // Each figure is an anchor to the file with the caption in data-caption.
  const found = new Map();
  const re = /href=["']?(\/site\/assets\/files\/[^"'\s>]+?\.(?:jpg|jpeg|png))["']?[^>]*?data-caption="([^"]*)"/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    const href = m[1];
    if (found.has(href)) continue;
    found.set(href, decodeEntities(m[2]));
  }
  const images = [];
  for (const [href, cap] of found) {
    const folder = /^\/site\/assets\/files\/(\d+)\//.exec(href);
    if (folder === null || sections.has(folder[1])) continue;
    const author = tsoCredit(cap);
    if (author === null) continue;
    images.push({ href, cap, author });
  }
  return images;
}

function tsoHarvest(rows, seen, already) {
  const yielded = {};
  const out = [];
  const articles = new Map();

  for (const row of rows) {
    const rowKey = `${row.symbol}|${row.channel}`;
    const have = (already && already[rowKey]) || 0;
    const cap = Math.max(0, budgetFor(row) - have);
    if (cap === 0) { yielded[rowKey] = 0; continue; }
    const articlePath = tsoPath(row.sci);
    if (articlePath === null) { yielded[rowKey] = 0; continue; }
    const url = TSO_BASE + articlePath;
    let body = articles.get(url);
    if (body === undefined) {
      body = getText(url, `tso-${articlePath.split('/')[3]}.html`);
      articles.set(url, body);
    }
    if (!body) { yielded[rowKey] = 0; continue; }

    const images = tsoPageImages(body);
    if (images.length === 0) { yielded[rowKey] = 0; continue; }

    const want = CHANNEL_WORDS[row.channel];
    const other = Object.keys(CHANNEL_WORDS)
      .filter((k) => k !== row.channel)
      .map((k) => CHANNEL_WORDS[k]);

    const onChannel = [];
    const unlabelled = [];
    for (const rec of images) {
      if (want.test(rec.cap)) onChannel.push(rec);
      else if (!other.some((r) => r.test(rec.cap))) unlabelled.push(rec);
    }

    // The captions that name this channel come first. After them, and only
    // while the row is still short, come the captions that name no organ at
    // all. The viewing step prunes those.
    const pick = onChannel.concat(unlabelled);
    let kept = 0;
    for (const p of pick) {
      if (kept >= cap) break;
      const fileUrl = TSO_BASE + p.href;
      if (seen.has(url.trim()) && seen.has(fileUrl.trim())) continue;
      if (seen.has(fileUrl.trim())) continue;
      out.push({
        sci: row.sci,
        symbol: row.symbol,
        target: row.symbol,
        channel: row.channel,
        channel_hint: row.channel,
        origin: url,
        file_url: fileUrl,
        author: p.author,
        license: 'CC BY-SA 4.0',
        license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
        source: 'Trees and Shrubs Online',
        source_species: row.sci,
        caption: p.cap,
        labelled: onChannel.length > 0,
      });
      seen.add(fileUrl.trim());
      kept++;
    }
    yielded[rowKey] = kept;
  }
  return { rows: out, yielded };
}

// ------------------------------------------------------------- the run

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
    return;
  }
  OUT_DIR = path.resolve(args.outDir);
  DL_DIR = path.join(OUT_DIR, 'harvest');
  CACHE = path.join(OUT_DIR, 'cache');
  BIO_DIR = path.join(OUT_DIR, 'bio');
  RUN = args.run;
  CANDIDATES = candidatesPath(RUN);
  const rows = JSON.parse(fs.readFileSync(args.rows, 'utf8'));

  fs.mkdirSync(DL_DIR, { recursive: true });
  const seen = loadSeen();
  console.log('known origins and file urls:', seen.size);

  const bio = bioHarvest(rows, seen);
  console.log('bioimages candidates:', bio.rows.length);
  const tso = tsoHarvest(rows, seen, bio.yielded);
  console.log('trees and shrubs online candidates:', tso.rows.length);

  const all = bio.rows.concat(tso.rows);

  // Download, one file per candidate.
  const counter = {};
  const kept = [];
  for (const c of all) {
    // A concept key holds a slash; the file name cannot.
    const key = `${c.symbol}-${c.channel}`.replace(/\//g, '_');
    counter[key] = (counter[key] || 0) + 1;
    const ext = (c.file_url.match(/\.(jpe?g|png)(?:$|\?)/i) || [, 'jpg'])[1].toLowerCase();
    const local = path.join(DL_DIR, `${key}-${counter[key]}.${ext === 'jpeg' ? 'jpg' : ext}`);
    const r = curl(c.file_url, local);
    const size = fs.existsSync(local) ? fs.statSync(local).size : 0;
    if (!r.ok || size < 8000) {
      fetchLog.push(`download ${c.file_url} -> ${r.status} (${size} bytes)`);
      if (fs.existsSync(local)) fs.unlinkSync(local);
      counter[key]--;
      continue;
    }
    c.local = local;
    c.bytes = size;
    c.author = cleanCredit(shellSafe(c.author));
    c.caption = shellSafe(c.caption);
    kept.push(c);
    console.log('downloaded', path.basename(local), size, c.source);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'harvest-rows.json'), JSON.stringify(kept, null, 1));

  // ---- report
  const rowKeys = rows.map((r) => `${r.symbol}|${r.channel}`);
  const per = {};
  for (const k of rowKeys) per[k] = { Bioimages: 0, 'Trees and Shrubs Online': 0 };
  for (const c of kept) per[`${c.symbol}|${c.channel}`][c.source]++;

  const L = [];
  L.push(`# Harvest report, run \`${RUN}\``);
  L.push('');
  L.push('## Sites, licence read on the site');
  L.push('');
  L.push(SITE_NOTES.trim());
  L.push('');
  L.push('## Images per gap row, before the viewing step');
  L.push('');
  L.push('| target | channel | Bioimages | Trees and Shrubs Online | total |');
  L.push('| --- | --- | --- | --- | --- |');
  for (const r of rows) {
    const k = `${r.symbol}|${r.channel}`;
    const p = per[k];
    L.push(`| ${r.symbol} | ${r.channel} | ${p.Bioimages} | ${p['Trees and Shrubs Online']} | ${p.Bioimages + p['Trees and Shrubs Online']} |`);
  }
  L.push('');
  L.push('## Hosts blocked, rate limited, or otherwise silent');
  L.push('');
  L.push(fetchLog.length ? fetchLog.map((x) => `- ${x}`).join('\n') : '- none during this run');
  L.push('');
  fs.writeFileSync(path.join(OUT_DIR, 'harvest-report.md'), L.join('\n'));
  console.log('kept', kept.length, 'images');
}

const SITE_NOTES = `
**Bioimages** (Steve Baskauf, Vanderbilt) - admitted, per image.
The site's front page, http://bioimages.vanderbilt.edu/, says: "All images on the
Bioimages site are available under a license no more restrictive than Creative Commons
Attribution-Noncommercial-Share Alike (CC BY-NC-SA)." So the site licence alone is not
enough. Each image page states its own licence, for example
http://bioimages.vanderbilt.edu/kirchoff/bkk2902.htm: "Available under Creative Commons
Attribution 4.0 International License." This harvester keeps only the images whose own
page states CC0 1.0, CC BY 4.0, or CC BY-SA 4.0, and it fetches the page to confirm.

**Trees and Shrubs Online** - admitted.
https://www.treesandshrubsonline.org/about/licence/ says: "The content of this site is
licensed under a Creative Commons Attribution-ShareAlike 4.0 International Public
Licence." The harvester drops any caption that carries its own copyright notice, because
that notice overrides the site licence.

**CalPhotos** - not admitted.
https://calphotos.berkeley.edu/use.html says: "To use any of those photos, you will need
to request permission first from the person or organization that contributed the photo."
The same page says: "we do not permit crawlers or other programs". The image query is
also behind a Cloudflare Turnstile check, which this harvester does not answer.

**Purdue Arboretum explorer** - not admitted.
https://www.arboretum.purdue.edu/explorer/plants/17/ says: "Copyright (c) 2026 Purdue
University. All Rights Reserved." No redistribution licence.

**Oregon State landscape plants** - not admitted.
https://landscapeplants.oregonstate.edu/ links its terms to
https://oregonstate.edu/copyright, which is a DMCA notice page and states no
redistribution licence. The site footer says: "Copyright (c) 2026 Oregon State
University".

**Lady Bird Johnson Wildflower Center** - not harvested here.
The site allows non-commercial use only. The owner has written permission for Dendro
(docs/decisions/2026-09-25-wildflower-permission.md), and \`photos fetch\` reads the
gallery as a fetch source. This harvester does not ask the site.

**Virginia Tech dendrology fact sheets** - not admitted.
https://dendro.cnre.vt.edu/dendrology/syllabus/factsheet.cfm?ID=105 and
https://dendro.cnre.vt.edu/dendrology/ carry no licence statement of any kind for the
photographs.

**Kew POWO** - not harvested here.
Kew returns a Cloudflare challenge to scripts. An agent collects POWO photos in the
built-in browser with the powo-harvest skill (.claude/skills/powo-harvest/SKILL.md).
`;

module.exports = {
  parseArgs, candidatesPath, cleanCredit, shellSafe, decodeEntities, readPsv, budgetFor,
  tsoPath, tsoCredit, tsoPageImages,
};

// The tests load this file with createRequire, so main() runs only when Node starts it.
if (require.main === module) main();
