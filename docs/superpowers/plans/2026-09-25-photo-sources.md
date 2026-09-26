# Photo sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three fetch sources (Bioimages, Trees and Shrubs Online, wildflower.org) and one browser harvest (Kew POWO) so that a content run needs fewer hand-added photo rows.

**Architecture:** Each fetch source is one module in `pipeline/lib/` that turns saved or fetched pages into `Candidate` rows. `photosFetch` in `pipeline/lib/commands.ts` asks the turn sources for one symbol's rows in `TURN_ORDER`, merges them round-robin with the existing `interleave`, and puts PLANTS rows after them. A new `licenseAllowedAt` in `pipeline/lib/licenses.ts` admits the allowlist plus one written permission keyed to one host. POWO is a skill plus a parser plus a script, and its rows go through `mkadds.cjs` into `photos add`.

**Tech Stack:** Node 24 with TypeScript through Node's built-in type stripping. No new dependency. Tests run with `node --test`.

Spec: `docs/superpowers/specs/2026-09-25-photo-sources-design.md`. The spec is the source of truth. Its decisions are final.

## Global Constraints

- Prose in docs, skills, comments, and commit messages follows ASD-STE100 Simplified Technical English: short sentences, active voice, one word one meaning, plain words.
- TypeScript-only names are camelCase. Fields that land in JSON are snake_case. Exports listed in this plan stay, even if nothing uses them.
- Do not change `collect`, `MAX_PER_SPECIES`, `candidateId`, `MONO_THRESHOLD`, or the live suite (`pipeline/tests_live/`, 7 tests). If a task seems to need that, stop and report.
- Write file content with the Write and Edit tools, not shell heredocs. Keep every Bash command under 5,000 bytes.
- Create files only inside the task's worktree or the scratchpad. The CLI commits with `git add -A`.
- Tests never touch the network. Fixtures are trimmed copies of saved pages.
- Node 24 or later. Erasable TypeScript syntax only: no enums, no parameter properties, no namespaces. A relative import inside `pipeline/` carries the `.ts` extension.
- `pipeline/lib/commands.ts` imports nothing that needs `node_modules`. The new modules import only Node built-ins and other `pipeline/lib/` files.
- The machine is Windows 11. Build file paths with `path.join` or `path.resolve`.
- Commit with `git add <exact paths>`, never `git add -A`. Commit with two `-m` flags, the second one the trailer:
  `git commit -m "feat: subject" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`
- The research folder, written in commands as `$RESEARCH`, is
  `C:/Users/jdennen/AppData/Local/Temp/claude/C--Users-jdennen-Dendro/8b1c3373-46a9-4856-9724-c9fe26e0a80f/scratchpad/research`. Commands in this plan write that path out in full.
- Test commands: one file runs with `node --test pipeline/tests/<file>.test.ts`; the pipeline suite with `npm run test:pipeline`; everything with `npm run test:all`. Before this work the counts are app 177, pipeline 348, live 7.

---

## Execution notes

- **Task 1** runs first, alone, on branch `sources` (worktree `C:\Users\jdennen\Dendro\.claude\worktrees\sources`).
- **Tasks 2, 3, 4, 5, and 6** run in parallel after Task 1. Each runs in its own worktree, branched from `sources` after Task 1:
  `git -C C:/Users/jdennen/Dendro/.claude/worktrees/sources worktree add C:/Users/jdennen/Dendro/.claude/worktrees/sources-t2 -b sources-t2 sources`
  (replace `t2` with `t3` to `t6`). A new worktree has no `node_modules`, so run `npm install` in it first. Each task touches only its own files, so the five merges into `sources` are clean.
- **Task 7** runs after Tasks 2 to 6 merge into `sources`.
- **Task 8** is verification. The orchestrator runs it.
- After each task, `npm run test:pipeline` passes before the last commit of that task.

## File structure

| File | Task | Change | Responsibility |
|---|---|---|---|
| `pipeline/lib/candidates.ts` | 1 | Modify | Three new source keys and display names. |
| `pipeline/lib/licenses.ts` | 1 | Modify | `licenseLabelFromUrl`, `LICENSE_PERMISSIONS`, `licenseAllowedAt`. |
| `pipeline/lib/html.ts` | 1 | Create | `decodeEntities`, `htmlText`, `openTags`: the HTML text helpers that Tasks 3, 4, and 6 share. |
| `pipeline/lib/http.ts` | 1 | Modify | Rate, in-flight, and cache entries for five hosts. |
| `pipeline/lib/commands.ts` | 1, 7 | Modify | `TURN_ORDER`, `FETCH_ORDER`, `turnRows`, the turn loop, the `by source:` line, the `photos add` licence check. |
| `docs/decisions/2026-09-25-wildflower-permission.md` | 1 | Create | The record of the wildflower.org permission. |
| `pipeline/lib/bioimages.ts` | 2 | Create | The Bioimages catalogue reader and rows. |
| `pipeline/lib/tso.ts` | 3 | Create | The TSO sitemap, page reader, and rows. |
| `pipeline/lib/wildflower.ts` | 4 | Create | The wildflower.org gallery and image page reader, and rows. |
| `pipeline/scripts/harvest.cjs` | 5 | Create | The gap-row harvester, moved from the scratchpad. |
| `pipeline/scripts/mkadds.cjs` | 5 | Create | Rows to `photos add` commands, moved from the scratchpad. |
| `pipeline/lib/powo.ts` | 6 | Create | The saved POWO gallery to add rows. |
| `pipeline/scripts/powo-rows.ts` | 6 | Create | The CLI wrapper around `powo.ts`. |
| `.claude/skills/powo-harvest/SKILL.md` | 6 | Create | The browser harvest procedure. |
| `.claude/skills/content-run/SKILL.md` | 1, 7 | Modify | Step 4 (turn order, last line) and Step 7 (new tools). |
| `.claude/skills/photo-check/SKILL.md` | 7 | Modify | The permission label and the new identity sources. |
| `pipeline/tests/*.test.ts` and `pipeline/tests/fixtures/<source>/` | all | Create or modify | One test file per module. Fixtures per source. |

## Choices made where the spec is silent

1. **A shared `pipeline/lib/html.ts`, made in Task 1.** TSO, wildflower.org, and POWO all read HTML. `stripHtml` in `commons.ts` decodes six references only, and the saved pages also use `&apos;`, `&ensp;`, `&thinsp;`, and `&copy;`. TSO and POWO put a caption with raw `<p>` or `&lt;br&gt;` inside a double-quoted attribute, so a plain `<[^>]*>` scan cuts the tag. One helper file, made before the parallel tasks, keeps Tasks 3, 4, and 6 free of shared edits.
2. **The per-source counts are a second line, printed last.** The existing line stays as it is. The new line lists every source in `FETCH_ORDER`, with 0 for a source that gave nothing.
3. **`TURN_ORDER` is an exported list of source keys, and `turnRows` maps a key to its rows function.** Task 7 adds three keys and three `case` lines. `FetchContext` gains `names` and `passes` in Task 1, so Task 7 changes no signature.
4. **`commons.ts:157` and `inat.ts:198` keep `licenseAllowed`.** They filter a source's own label before the row exists. Their origins are on commons.wikimedia.org and inaturalist.org, which no permission names, so `licenseAllowedAt` would give the same answer. `photos add` (`commands.ts:428`) changes, because it takes a row from any host. No build or validate step checks a licence again: `manifest.ts:59-60` and `app/logic/content.js:211-215` check only that the credit fields are not empty.
5. **The Bioimages catalogue is kept per `Http` object in a `WeakMap`.** One process has one `Http`, so the 12 MB file parses once per process, as the spec says. A test's fake `Http` never sees another test's catalogue.
6. **wildflower.org pages come through `getBytes`.** `getText` calls `Response.text()` (`http.ts:295`), which always decodes UTF-8. `getBytes` keeps the raw bytes, and the module decodes them as windows-1252. `getBytes` keeps a file with no expiry (`http.ts:318`), which fits the policy: store pages and do not ask for them again. `--refresh` still fetches again.
7. **`licenseLabelFromUrl` accepts http or https, an optional trailing slash, and a two-letter port** (`.../by/3.0/us/` gives `CC BY 3.0 US`). It gives null for a `legalcode` or `deed` suffix.
8. **The POWO author is the `<small>` text after its last ` | `.** The London plane caption for ID 14123 is `<a>Platanus × acerifolia</a> | Dr Henry Oakeley's RCP Medicinal Plants`. The research file `images-685854-1.json` gives the credit as the part after the bar. The credit itself is kept word for word.
9. **The row that `mkadds.cjs` reads carries `channel_hint`.** `harvest.cjs` rows gain `channel_hint` next to their `channel`. `mkadds.cjs` leaves out `--license-url`, `--source-species`, and `--channel-hint` when the value is null. The old script wrote the text `null`. It exits 1 when it finds a problem.
10. **The scratch runs of Task 8 are written with `newScope` and `writeRun`.** `run init` runs `git checkout -b content/<name> main` (`run.ts:232-234`), and `main` does not hold this branch's code. `species list` keeps only symbols of `--genera` (`species.ts:324`), so a one-species run through it fetches every profile of the genus.
11. **`photo-check` gets the four new sources in its list of eligible identity sources.** Without that line, a careful reviewer could doubt a TSO or wildflower.org row.

---

### Task 1: Groundwork

**Files:**
- Modify: `pipeline/lib/candidates.ts:9-22`
- Modify: `pipeline/lib/licenses.ts` (append after line 11)
- Create: `pipeline/lib/html.ts`
- Modify: `pipeline/lib/http.ts:21-37`
- Modify: `pipeline/lib/commands.ts:5-14` (imports), `:159` (after `MAX_INAT_PAGES`), `:293-415` (`photosFetch`), `:428` (`photosAdd`), `:730-741` (`FetchContext`), `:779` (before `plantsRows`)
- Create: `docs/decisions/2026-09-25-wildflower-permission.md`
- Modify: `.claude/skills/content-run/SKILL.md:68-72` (Step 4)
- Test: `pipeline/tests/licenses.test.ts`, `pipeline/tests/html.test.ts` (create), `pipeline/tests/candidates_core.test.ts`, `pipeline/tests/http.test.ts`, `pipeline/tests/cli_fetch.test.ts`

**Interfaces:**
- Consumes: `licenseAllowed(text: string): boolean` from `pipeline/lib/candidates.ts`; `interleave(groups: Candidate[][]): Candidate[]` from the same file.
- Produces:
  - `pipeline/lib/candidates.ts`: `SOURCE_KEYS = ['plants', 'inat', 'commons', 'bioimages', 'tso', 'wildflower', 'manual'] as const`; `SOURCE_NAMES.bioimages = 'Bioimages'`, `SOURCE_NAMES.tso = 'Trees and Shrubs Online'`, `SOURCE_NAMES.wildflower = 'Lady Bird Johnson Wildflower Center'`.
  - `pipeline/lib/licenses.ts`: `licenseLabelFromUrl(url: string | null): string | null`; `interface LicensePermission { label: string; hosts: string[]; granted: string; scope: string; record: string }`; `LICENSE_PERMISSIONS: LicensePermission[]`; `licenseAllowedAt(license: string, origin: string): boolean`.
  - `pipeline/lib/html.ts`: `decodeEntities(text: string): string`; `htmlText(html: string): string`; `interface HtmlTag { attrs: Record<string, string>; start: number; end: number }`; `openTags(html: string, name: string): HtmlTag[]`.
  - `pipeline/lib/commands.ts`: `TURN_ORDER: SourceKey[]` (value `['commons', 'inat']`); `FETCH_ORDER: SourceKey[]` (value `[...TURN_ORDER, 'plants']`); internal `turnRows(key: SourceKey, context: FetchContext): Promise<Candidate[]>`; `FetchContext` gains `names: string[]` and `passes: InatPass[]`.
  - The last stdout line of `photos fetch`: `by source: <key> <n>, ...` over `FETCH_ORDER`.

#### Part A: licences

- [ ] **Step 1: Write the failing licence tests**

Replace the whole of `pipeline/tests/licenses.test.ts` with:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { licenseAllowed } from '../lib/candidates.ts';
import {
  LICENSE_PERMISSIONS,
  licenseAllowedAt,
  licenseLabelFromUrl,
  normalizeLicenseUrl,
} from '../lib/licenses.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PERMISSION = 'used with permission, non-commercial';
const WILDFLOWER_ORIGIN = 'https://www.wildflower.org/gallery/result.php?id_image=66070';

test('normalizeLicenseUrl gives every license url one trailing slash', () => {
  // Commons sends the url without the slash. iNat's table carries it.
  assert.equal(
    normalizeLicenseUrl('https://creativecommons.org/licenses/by-sa/4.0'),
    'https://creativecommons.org/licenses/by-sa/4.0/',
  );
  assert.equal(
    normalizeLicenseUrl('https://creativecommons.org/licenses/by-sa/4.0/'),
    'https://creativecommons.org/licenses/by-sa/4.0/',
  );
  assert.equal(
    normalizeLicenseUrl('  https://creativecommons.org/publicdomain/zero/1.0  '),
    'https://creativecommons.org/publicdomain/zero/1.0/',
  );
  assert.equal(normalizeLicenseUrl(null), null);
  assert.equal(normalizeLicenseUrl(''), null);
  assert.equal(normalizeLicenseUrl('   '), null);
});

test('licenseLabelFromUrl names the Creative Commons licence of a url', () => {
  const cases: [string, string][] = [
    ['https://creativecommons.org/licenses/by-sa/4.0/', 'CC BY-SA 4.0'],
    ['https://creativecommons.org/licenses/by-nc/3.0/', 'CC BY-NC 3.0'],
    ['https://creativecommons.org/licenses/by/3.0/', 'CC BY 3.0'],
    ['http://creativecommons.org/licenses/by/3.0', 'CC BY 3.0'],
    ['https://creativecommons.org/licenses/by/3.0/us/', 'CC BY 3.0 US'],
    ['https://creativecommons.org/publicdomain/zero/1.0/', 'CC0 1.0'],
    ['https://creativecommons.org/publicdomain/mark/1.0/', 'Public Domain Mark 1.0'],
  ];
  for (const [url, label] of cases) assert.equal(licenseLabelFromUrl(url), label, url);
});

test('licenseLabelFromUrl gives null for any other url', () => {
  const others = [
    null,
    '',
    'https://www.gnu.org/licenses/fdl-1.3.html',
    'https://creativecommons.org/about/',
    'https://creativecommons.org/licenses/by/4.0/legalcode',
    'https://example.org/licenses/by/4.0/',
  ];
  for (const url of others) assert.equal(licenseLabelFromUrl(url), null, String(url));
});

test('a label from licenseLabelFromUrl still goes through licenseAllowed', () => {
  const label = (url: string): string => licenseLabelFromUrl(url) ?? '';
  assert.equal(licenseAllowed(label('https://creativecommons.org/licenses/by-sa/4.0/')), true);
  assert.equal(licenseAllowed(label('https://creativecommons.org/publicdomain/mark/1.0/')), true);
  assert.equal(licenseAllowed(label('https://creativecommons.org/licenses/by-nc/3.0/')), false);
  assert.equal(licenseAllowed(label('https://creativecommons.org/licenses/by-nd/4.0/')), false);
});

test('LICENSE_PERMISSIONS holds the one wildflower.org permission', () => {
  assert.deepEqual(LICENSE_PERMISSIONS, [
    {
      label: PERMISSION,
      hosts: ['www.wildflower.org'],
      granted: '2026-09-25',
      scope: 'non-commercial',
      record: 'docs/decisions/2026-09-25-wildflower-permission.md',
    },
  ]);
});

test('every permission record is a file in the repo', () => {
  for (const permission of LICENSE_PERMISSIONS) {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, permission.record)), permission.record);
  }
});

test('licenseAllowedAt admits what the allowlist admits, on any host', () => {
  assert.equal(
    licenseAllowedAt('CC BY-SA 4.0', 'https://www.treesandshrubsonline.org/articles/quercus/quercus-gambelii/'),
    true,
  );
  assert.equal(licenseAllowedAt('CC BY-NC 4.0', WILDFLOWER_ORIGIN), false);
});

test('licenseAllowedAt admits the permission label for www.wildflower.org only', () => {
  assert.equal(licenseAllowedAt(PERMISSION, WILDFLOWER_ORIGIN), true);
  assert.equal(licenseAllowedAt(PERMISSION, 'http://www.wildflower.org/gallery/result.php?id_image=3424'), true);
  const others = [
    'https://wildflower.org/gallery/result.php?id_image=66070',
    'https://commons.wikimedia.org/wiki/File:A.jpg',
    'https://www.wildflower.org.example.com/gallery/',
    'not a url',
  ];
  for (const origin of others) assert.equal(licenseAllowedAt(PERMISSION, origin), false, origin);
});

test('licenseAllowedAt needs the permission label word for word', () => {
  const near = [
    'Used with permission, non-commercial',
    'used with permission',
    'used with permission, non-commercial.',
    ' used with permission, non-commercial',
  ];
  for (const text of near) assert.equal(licenseAllowedAt(text, WILDFLOWER_ORIGIN), false, text);
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `node --test pipeline/tests/licenses.test.ts`
Expected: FAIL with `SyntaxError: The requested module '../lib/licenses.ts' does not provide an export named 'LICENSE_PERMISSIONS'`.

- [ ] **Step 3: Write the licence code**

Replace the whole of `pipeline/lib/licenses.ts` with:

```ts
import { licenseAllowed } from './candidates.ts';

/**
 * One spelling for a license url. iNat's table carries a trailing slash and Commons'
 * `LicenseUrl` field does not, so two sources would otherwise write two urls for one
 * license. A url that trims to nothing is absent.
 */
export function normalizeLicenseUrl(url: string | null): string | null {
  if (url === null) return null;
  const trimmed = url.trim();
  if (trimmed === '') return null;
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

const CC_LICENSE =
  /^https?:\/\/(?:www\.)?creativecommons\.org\/licenses\/(by|by-sa|by-nd|by-nc|by-nc-sa|by-nc-nd)\/(\d+(?:\.\d+)?)(?:\/([a-z]{2}))?\/?$/i;
const CC_ZERO = /^https?:\/\/(?:www\.)?creativecommons\.org\/publicdomain\/zero\/(\d+(?:\.\d+)?)\/?$/i;
const CC_MARK = /^https?:\/\/(?:www\.)?creativecommons\.org\/publicdomain\/mark\/(\d+(?:\.\d+)?)\/?$/i;

/**
 * The label of a Creative Commons url: the family and the version, and the country code of a
 * ported licence. Any other url gives null. The label does not admit a row by itself.
 * `licenseAllowed` still rejects an NC or ND label.
 */
export function licenseLabelFromUrl(url: string | null): string | null {
  if (url === null) return null;
  const text = url.trim();
  const license = CC_LICENSE.exec(text);
  if (license !== null) {
    const port = license[3] === undefined ? '' : ` ${license[3].toUpperCase()}`;
    return `CC ${license[1].toUpperCase()} ${license[2]}${port}`;
  }
  const zero = CC_ZERO.exec(text);
  if (zero !== null) return `CC0 ${zero[1]}`;
  const mark = CC_MARK.exec(text);
  if (mark !== null) return `Public Domain Mark ${mark[1]}`;
  return null;
}

export interface LicensePermission {
  /** The exact licence text of a row that rests on this permission. */
  label: string;
  /** The origin hosts that the permission covers. */
  hosts: string[];
  /** The date of the owner ruling, YYYY-MM-DD. */
  granted: string;
  scope: string;
  /** The repo file that records the permission. */
  record: string;
}

/**
 * Written permissions that take the place of a licence on the allowlist. Owner ruling
 * 2026-09-25: wildflower.org is the one exception. A search of the manifest for a label finds
 * every image that rests on that permission.
 */
export const LICENSE_PERMISSIONS: LicensePermission[] = [
  {
    label: 'used with permission, non-commercial',
    hosts: ['www.wildflower.org'],
    granted: '2026-09-25',
    scope: 'non-commercial',
    record: 'docs/decisions/2026-09-25-wildflower-permission.md',
  },
];

/**
 * True when the allowlist admits the licence, or when the licence is a permission label, word
 * for word, and the origin's host is one that the permission covers. An origin that is not a
 * url gets no permission.
 */
export function licenseAllowedAt(license: string, origin: string): boolean {
  if (licenseAllowed(license)) return true;
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  return LICENSE_PERMISSIONS.some(
    (permission) => permission.label === license && permission.hosts.includes(host),
  );
}
```

- [ ] **Step 4: Write the permission record**

Create `docs/decisions/2026-09-25-wildflower-permission.md`:

```markdown
# wildflower.org image permission

Date: 2026-09-25. Status: decided, in use.

## Decision

Dendro uses photos from the Native Plant Image Gallery of the Lady Bird Johnson Wildflower Center (`www.wildflower.org`). This is the one exception to the licence allowlist (public domain, US government work, CC0, CC BY, CC BY-SA). The owner has written permission from the Center for this project, for non-commercial use.

## The policy

The Image and Data Use Policy is at `https://www.wildflower.org/gallery/policy.php` (read 2026-09-25). It allows non-commercial use of gallery images without a request. It says: "Commercial use of any Image Gallery image is not permitted."

The policy also sets these rules:

- Each use credits the photographer and the Center.
- An automated tool sends 1 request per second at most.
- An automated tool stores the pages it gets and does not ask for them again.
- Bulk harvesting is not allowed.

## Scope

- Use: non-commercial only.
- Host: `www.wildflower.org` only.
- Licence text on each row: `used with permission, non-commercial`. `licenseAllowedAt` in `pipeline/lib/licenses.ts` accepts this text only when the row's origin host is `www.wildflower.org`. The entry is in `LICENSE_PERMISSIONS` in the same file.
- Credit line in the app: `<First Last>, Lady Bird Johnson Wildflower Center, used with permission, non-commercial.`
- The fetch reads 20 image pages per species at most (`WILDFLOWER_MAX_IMAGES`), at 1 request per second, and keeps each page in the cache.

## If Dendro becomes commercial

Search `content/images/manifest.json` for `used with permission, non-commercial`. Each row found rests on this permission. Retire those images, or get a commercial licence from the Center first.

## Owner record

- Date of the permission email: (the owner adds it)
- Sender of the permission email: (the owner adds the name and the address)
```

- [ ] **Step 5: Run the test and see it pass**

Run: `node --test pipeline/tests/licenses.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add pipeline/lib/licenses.ts pipeline/tests/licenses.test.ts docs/decisions/2026-09-25-wildflower-permission.md
git commit -m "feat: add licenseLabelFromUrl, LICENSE_PERMISSIONS, and licenseAllowedAt" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

#### Part B: the HTML helpers

- [ ] **Step 7: Write the failing HTML tests**

Create `pipeline/tests/html.test.ts`:

```ts
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
```

- [ ] **Step 8: Run the test and see it fail**

Run: `node --test pipeline/tests/html.test.ts`
Expected: FAIL with `Error [ERR_MODULE_NOT_FOUND]: Cannot find module` naming `pipeline/lib/html.ts`.

- [ ] **Step 9: Write the HTML helpers**

Create `pipeline/lib/html.ts`:

```ts
/**
 * Text helpers for the HTML pages that the photo sources read: Trees and Shrubs Online,
 * wildflower.org, and the saved Kew POWO gallery. Each page is plain server-rendered HTML,
 * so no DOM library is needed.
 */

// One entry for each named reference that the saved pages use. A name that is not in this
// table stays as it is.
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  ensp: '\u2002',
  emsp: '\u2003',
  thinsp: '\u2009',
  copy: '\u00a9',
  reg: '\u00ae',
  deg: '\u00b0',
  times: '\u00d7',
  ndash: '\u2013',
  mdash: '\u2014',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201c',
  rdquo: '\u201d',
  hellip: '\u2026',
};

const ENTITY = /&([a-zA-Z]+);|&#(\d+);|&#[xX]([0-9a-fA-F]+);/g;

/**
 * Decodes each character reference once. One pass never reads a replacement again, so
 * `&amp;lt;` gives the text `&lt;`, not `<`.
 */
export function decodeEntities(text: string): string {
  return text.replace(
    ENTITY,
    (match: string, name: string | undefined, dec: string | undefined, hex: string | undefined) => {
      if (name !== undefined) return NAMED_ENTITIES[name] ?? match;
      const code = dec !== undefined ? Number.parseInt(dec, 10) : Number.parseInt(hex ?? '', 16);
      try {
        return String.fromCodePoint(code);
      } catch {
        // A code point out of range stays as it was.
        return match;
      }
    },
  );
}

/**
 * The text of an HTML fragment. The tags go first, then each reference is decoded once, then
 * each run of white space becomes one space.
 */
export function htmlText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export interface HtmlTag {
  /** The attribute values as written, with no reference decoded. A bare attribute gives ''. */
  attrs: Record<string, string>;
  /** The index of `<` in the page. */
  start: number;
  /** The index after `>`. */
  end: number;
}

const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*"([^"]*)")?/g;

/**
 * Every opening tag of one element whose attribute values are all in double quotes. A quoted
 * value can hold `<` and `>`, which a plain `<[^>]*>` scan cuts. A tag with an unquoted or a
 * single-quoted value is not returned.
 */
export function openTags(html: string, name: string): HtmlTag[] {
  const pattern = new RegExp(
    `<${name}((?:\\s+[^\\s"'<>/=]+(?:\\s*=\\s*"[^"]*")?)*)\\s*/?>`,
    'gi',
  );
  const tags: HtmlTag[] = [];
  for (const match of html.matchAll(pattern)) {
    const attrs: Record<string, string> = {};
    for (const attr of match[1].matchAll(ATTRIBUTE)) attrs[attr[1].toLowerCase()] = attr[2] ?? '';
    const start = match.index ?? 0;
    tags.push({ attrs, start, end: start + match[0].length });
  }
  return tags;
}
```

- [ ] **Step 10: Run the test and see it pass**

Run: `node --test pipeline/tests/html.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 11: Commit**

```bash
git add pipeline/lib/html.ts pipeline/tests/html.test.ts
git commit -m "feat: add the HTML text helpers for the page parsers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

#### Part C: source keys and hosts

- [ ] **Step 12: Write the failing key and host tests**

In `pipeline/tests/candidates_core.test.ts`, add this test after the test `'SOURCE_NAMES holds one display name per source key, and manual has none'` (it ends at line 37):

```ts
test('SOURCE_KEYS holds the three new fetch sources with the manifest display names', () => {
  assert.deepEqual(
    [...SOURCE_KEYS],
    ['plants', 'inat', 'commons', 'bioimages', 'tso', 'wildflower', 'manual'],
  );
  assert.equal(SOURCE_NAMES.bioimages, 'Bioimages');
  assert.equal(SOURCE_NAMES.tso, 'Trees and Shrubs Online');
  assert.equal(SOURCE_NAMES.wildflower, 'Lady Bird Johnson Wildflower Center');
});
```

At the end of `pipeline/tests/http.test.ts`, add:

```ts
const NEW_HOSTS = [
  'raw.githubusercontent.com',
  'zenodo.org',
  'www.treesandshrubsonline.org',
  'www.wildflower.org',
  'd2seqvvyy3b8p2.cloudfront.net',
];

test('the photo source hosts carry the rates and the cache days of the spec', () => {
  assert.equal(RATE_PER_SECOND['raw.githubusercontent.com'], 1);
  assert.equal(RATE_PER_SECOND['zenodo.org'], 0.5);
  assert.equal(RATE_PER_SECOND['www.treesandshrubsonline.org'], 1);
  assert.equal(RATE_PER_SECOND['www.wildflower.org'], 1);
  assert.equal(RATE_PER_SECOND['d2seqvvyy3b8p2.cloudfront.net'], 0.2);
  for (const host of NEW_HOSTS) assert.equal(MAX_IN_FLIGHT[host], 1, host);
  assert.equal(CACHE_DAYS['raw.githubusercontent.com'], 30);
  assert.equal(CACHE_DAYS['www.treesandshrubsonline.org'], 30);
  assert.equal(CACHE_DAYS['www.wildflower.org'], 3650);
  // These two hosts serve image files only, so the default applies.
  assert.equal(CACHE_DAYS['zenodo.org'], undefined);
  assert.equal(CACHE_DAYS['d2seqvvyy3b8p2.cloudfront.net'], undefined);
});

test('a rate below 1 spaces requests by more than a second', async (t) => {
  const clock = makeClock();
  const fake = makeFetch(clock, [
    { body: new Uint8Array([1]) },
    { body: new Uint8Array([2]) },
    { body: new Uint8Array([3]) },
    { body: new Uint8Array([4]) },
  ]);
  const http = createHttp({
    cacheDir: tmpCacheDir(t), fetchImpl: fake.impl, now: clock.now, sleep: clock.sleep,
  });
  await http.getBytes('https://zenodo.org/records/1/files/a.jpg');
  await http.getBytes('https://zenodo.org/records/2/files/b.jpg');
  await http.getBytes('https://d2seqvvyy3b8p2.cloudfront.net/a.jpg');
  await http.getBytes('https://d2seqvvyy3b8p2.cloudfront.net/b.jpg');
  // 0.5 per second is a 2000 ms gap. 0.2 per second is a 5000 ms gap. The two hosts do not
  // share a gate.
  assert.deepEqual(fake.calls.map((c) => c.at), [0, 2000, 2000, 7000]);
  assert.deepEqual(clock.sleeps, [2000, 5000]);
});
```

- [ ] **Step 13: Run the tests and see them fail**

Run: `node --test pipeline/tests/candidates_core.test.ts pipeline/tests/http.test.ts`
Expected: FAIL. The key test fails on `deepEqual` (the actual list has 4 keys). The host test fails with `undefined !== 1` for `raw.githubusercontent.com`. The spacing test fails because `zenodo.org` falls back to 1 request per second (`[0, 1000, 1000, 2000]`).

- [ ] **Step 14: Add the keys and the hosts**

In `pipeline/lib/candidates.ts`, replace lines 9-22 with:

```ts
export const SOURCE_KEYS = [
  'plants',
  'inat',
  'commons',
  'bioimages',
  'tso',
  'wildflower',
  'manual',
] as const;
export type SourceKey = (typeof SOURCE_KEYS)[number];

/**
 * The credit line the app prints. `source_key` drives machinery: the cache directory
 * and the report count. A manual row has no default name, so `cli photos add`
 * requires --source. The three newer names match the rows already in the manifest.
 */
export const SOURCE_NAMES: Record<SourceKey, string> = {
  plants: 'USDA PLANTS Database',
  inat: 'iNaturalist',
  commons: 'Wikimedia Commons',
  bioimages: 'Bioimages',
  tso: 'Trees and Shrubs Online',
  wildflower: 'Lady Bird Johnson Wildflower Center',
  manual: '',
};
```

In `pipeline/lib/http.ts`, replace lines 21-37 (the three tables `RATE_PER_SECOND`, `MAX_IN_FLIGHT`, `CACHE_DAYS`) with:

```ts
/**
 * A rate below 1 works: the limiter waits `MS_PER_SECOND / rate` between two requests of one
 * group, so 0.5 is a 2000 ms gap and 0.2 is a 5000 ms gap.
 */
export const RATE_PER_SECOND: Record<string, number> = {
  'plantsservices.sc.egov.usda.gov': 1,
  'www.efloras.org': 1,
  'api.inaturalist.org': 1,
  'commons.wikimedia.org': 2,
  // The Bioimages catalogue.
  'raw.githubusercontent.com': 1,
  // Bioimages files. Zenodo allows a guest 60 requests a minute.
  'zenodo.org': 0.5,
  'www.treesandshrubsonline.org': 1,
  // The wildflower.org policy allows 1 request per second at most.
  'www.wildflower.org': 1,
  // Kew POWO image files, for `photos add`. Kew asks for low rates.
  'd2seqvvyy3b8p2.cloudfront.net': 0.2,
};

export const MAX_IN_FLIGHT: Record<string, number> = {
  'commons.wikimedia.org': 3,
  'raw.githubusercontent.com': 1,
  'zenodo.org': 1,
  'www.treesandshrubsonline.org': 1,
  'www.wildflower.org': 1,
  'd2seqvvyy3b8p2.cloudfront.net': 1,
};

export const CACHE_DAYS: Record<string, number> = {
  'plantsservices.sc.egov.usda.gov': 30,
  'www.efloras.org': 30,
  'api.inaturalist.org': 7,
  'commons.wikimedia.org': 7,
  // The 12 MB catalogue last changed on 2024-04-24.
  'raw.githubusercontent.com': 30,
  'www.treesandshrubsonline.org': 30,
  // The policy asks an app to store the pages and not ask for them again.
  'www.wildflower.org': 3650,
};
```

- [ ] **Step 15: Run the tests and see them pass**

Run: `node --test pipeline/tests/candidates_core.test.ts pipeline/tests/http.test.ts`
Expected: PASS.

- [ ] **Step 16: Commit**

```bash
git add pipeline/lib/candidates.ts pipeline/lib/http.ts pipeline/tests/candidates_core.test.ts pipeline/tests/http.test.ts
git commit -m "feat: add the bioimages, tso, and wildflower source keys and host limits" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

#### Part D: the `photos add` licence check

- [ ] **Step 17: Write the failing `photos add` tests**

In `pipeline/tests/cli_fetch.test.ts`, add these two tests after the test `'photos add refuses a license the allowlist rejects'` (it ends at line 1122):

```ts
test('photos add takes the permission label for a www.wildflower.org origin', async (t) => {
  const fileUrl = 'https://www.wildflower.org/image_archive/640x480/JLR/JLR_IMG8981.JPG';
  const { root, deps, out } = setup(t, new Map([[fileUrl, { bytes: jpeg(3) }]]));
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf' }, () => {});

  const code = await runCommand(
    [
      'photos',
      'add',
      'demo',
      '--target',
      'QUGA',
      '--origin',
      'https://www.wildflower.org/gallery/result.php?id_image=66070',
      '--file-url',
      fileUrl,
      '--source',
      'Lady Bird Johnson Wildflower Center',
      '--author',
      'James L. Reveal',
      '--license',
      'used with permission, non-commercial',
    ],
    deps,
  );

  assert.equal(code, 0);
  const rows = candidatesOf(root);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].license, 'used with permission, non-commercial');
  assert.deepEqual(out, [`manual candidate ${rows[0].id} added for QUGA`]);
});

test('photos add refuses the permission label for any other host', async (t) => {
  const { root, deps, err } = setup(t);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf' }, () => {});

  const code = await runCommand(
    [
      'photos',
      'add',
      'demo',
      '--target',
      'QUGA',
      '--origin',
      'https://example.org/page',
      '--file-url',
      'https://example.org/a.jpg',
      '--source',
      'a blog',
      '--author',
      'A Photographer',
      '--license',
      'used with permission, non-commercial',
    ],
    deps,
  );

  assert.equal(code, 1);
  assert.deepEqual(err, ['photos add license is not allowed: used with permission, non-commercial']);
  assert.deepEqual(candidatesOf(root), []);
});
```

- [ ] **Step 18: Run the tests and see them fail**

Run: `node --test --test-name-pattern "permission label" pipeline/tests/cli_fetch.test.ts`
Expected: FAIL. The first test gets exit code 1 and the message `photos add license is not allowed: used with permission, non-commercial`. The second test passes already.

- [ ] **Step 19: Use `licenseAllowedAt` in `photos add`**

In `pipeline/lib/commands.ts`, change the import block at lines 5-14 so that it no longer imports `licenseAllowed`:

```ts
import {
  MONO_THRESHOLD,
  candidateId,
  collect,
  interleave,
  makeCandidate,
  mergeFound,
  type Candidate,
  type SourceKey,
} from './candidates.ts';
```

After the line `import { appendJsonl, readJsonl } from './jsonl.ts';` (line 50), add:

```ts
import { licenseAllowedAt } from './licenses.ts';
```

In `photosAdd`, replace:

```ts
  if (!licenseAllowed(flags.license)) {
```

with:

```ts
  // The origin decides a permission label. The allowlist decides every other licence.
  if (!licenseAllowedAt(flags.license, flags.origin)) {
```

- [ ] **Step 20: Run the tests and see them pass**

Run: `node --test --test-name-pattern "photos add" pipeline/tests/cli_fetch.test.ts`
Expected: PASS, every `photos add` test.

- [ ] **Step 21: Commit**

```bash
git add pipeline/lib/commands.ts pipeline/tests/cli_fetch.test.ts
git commit -m "feat: check the photos add licence against the origin host" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

#### Part E: the turn order and the per-source line

- [ ] **Step 22: Change the fetch tests to the turn order and the new last line**

In `pipeline/tests/cli_fetch.test.ts`:

1. In the import from `'../lib/candidates.ts'` (lines 9-16), add `interleave` after `candidateId`.
2. In the import from `'../lib/commands.ts'` (lines 17-23), add `FETCH_ORDER` before `MAX_COMMONS_PAGES`, and `TURN_ORDER` after `NO_PROFILE`.
3. After the function `appendedLine` (it ends at line 431), add:

```ts
/** The line `photos fetch` prints last. The counts come from the rows, never from a literal. */
function sourceLineOf(rows: Candidate[]): string {
  const parts = FETCH_ORDER.map(
    (key) => `${key} ${rows.filter((row) => row.source_key === key).length}`,
  );
  return `by source: ${parts.join(', ')}`;
}
```

   The line numbers in items 4 and 5 are the numbers before item 3. Each old line below occurs once in the file.
4. Replace each of these five lines with the line after the arrow. In each test the variable `rows` already holds `fetchedOf(root)`:
   - line 652: `assert.deepEqual(out, [appendedLine(expected.length, 0)]);` → `assert.deepEqual(out, [appendedLine(expected.length, 0), sourceLineOf(rows)]);`
   - line 726: `assert.deepEqual(out, [appendedLine(room, 0)]);` → `assert.deepEqual(out, [appendedLine(room, 0), sourceLineOf(rows)]);`
   - line 780: `assert.deepEqual(out, [appendedLine(rows.length, failures)]);` → `assert.deepEqual(out, [appendedLine(rows.length, failures), sourceLineOf(rows)]);`
   - line 807: `assert.deepEqual(out, [appendedLine(expected.length - 1, 0, 1)]);` → `assert.deepEqual(out, [appendedLine(expected.length - 1, 0, 1), sourceLineOf(rows)]);`
   - line 838: `assert.deepEqual(out, [appendedLine(expected.length - 1, 1, 0)]);` → `assert.deepEqual(out, [appendedLine(expected.length - 1, 1, 0), sourceLineOf(rows)]);`

5. Replace the test `'photos fetch ranks Commons and iNaturalist ahead of PLANTS under the cap'` (lines 701-727) with these three tests:

```ts
test('the turn order is Commons, then iNaturalist, and PLANTS comes last', () => {
  assert.deepEqual(TURN_ORDER, ['commons', 'inat']);
  assert.deepEqual(FETCH_ORDER, ['commons', 'inat', 'plants']);
});

test('photos fetch takes Commons and iNaturalist in turns, then PLANTS', async (t) => {
  const { root, deps } = setup(t, photoRoutes());
  seedInatTerms(root);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf,bark' }, (scope) => {
    scope.species = ['QUGA'];
  });

  assert.equal(await runCommand(['photos', 'fetch', 'demo'], deps), 0);

  const turns = interleave([commonsRowsOf('QUGA'), inatRowsOf('QUGA')]);
  assert.deepEqual(
    fetchedOf(root).map((row) => row.origin),
    [...turns, ...plantsRowsOf('QUGA')].map((row) => row.origin),
    'one row from each turn source per round, and PLANTS after every turn row',
  );
});

test('photos fetch gives the cap to the turn sources ahead of PLANTS', async (t) => {
  const { root, deps, out, http } = setup(t, photoRoutes());
  seedInatTerms(root);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf,bark' }, (scope) => {
    scope.species = ['QUGA'];
  });
  // The seeded rows leave room for the turn rows only, so every PLANTS row meets the cap.
  const room = commonsRowsOf('QUGA').length + inatRowsOf('QUGA').length;
  assert.ok(plantsRowsOf('QUGA').length > 0, 'the fixture holds PLANTS rows for the cap to stop');
  assert.ok(room < MAX_PER_SPECIES, 'the fixture rows fit under the cap');
  for (let index = 0; index < MAX_PER_SPECIES - room; index += 1) {
    seedCandidate(root, 'QUGA', index);
  }

  assert.equal(await runCommand(['photos', 'fetch', 'demo'], deps), 0);

  const rows = fetchedOf(root);
  assert.equal(rows.length, room);
  assert.deepEqual(
    [...new Set(rows.map((row) => row.source_key))].sort(),
    ['commons', 'inat'],
    'no PLANTS row reaches the queue ahead of the turn sources',
  );
  assert.ok(http.urls.includes(imagesUrl(QUGA_ID)), 'the PLANTS listing was still fetched');
  assert.deepEqual(out, [appendedLine(room, 0), sourceLineOf(rows)]);
});
```

- [ ] **Step 23: Run the fetch tests and see them fail**

Run: `node --test pipeline/tests/cli_fetch.test.ts`
Expected: FAIL with `SyntaxError: The requested module '../lib/commands.ts' does not provide an export named 'FETCH_ORDER'`.

- [ ] **Step 24: Add the turn list, the turn loop, and the last line**

In `pipeline/lib/commands.ts`:

1. After `export const MAX_INAT_PAGES = 4;` (line 159), add:

```ts

/**
 * The sources that take turns, in the owner's quality order (ruling 2026-09-25). Each gives
 * one row per round, and a source that runs out drops out of the rounds. PLANTS rows come
 * after every turn row.
 */
export const TURN_ORDER: SourceKey[] = ['commons', 'inat'];

/** Every source that `photos fetch` reads, in fetch order. The last line names them in this order. */
export const FETCH_ORDER: SourceKey[] = [...TURN_ORDER, 'plants'];
```

2. Replace the whole function `photosFetch` (lines 293-415) with:

```ts
async function photosFetch(rest: string[], deps: CliDeps): Promise<number> {
  const name = positional(rest, 'photos fetch <name>');
  const scope = readRun(deps.root, name);
  const now = isoNow(deps);
  const dir = runDir(deps.root, name);
  const candidatesPath = path.join(dir, 'candidates.jsonl');

  let existing = readJsonl<Candidate>(candidatesPath);
  const verdicts = readJsonl<Verdict>(path.join(dir, 'verdicts.jsonl'));
  const counts = countByTargetChannel(verdicts, existing);
  const terms = loadInatTerms(path.join(deps.root, 'pipeline', 'data', 'inat_terms.json'));
  const passes = inatPasses(terms.flowering_value_id);
  const ids = readPlantsIds(plantsIdsPath(deps.root));

  // `synonymNames` needs the checklist, and the disk cache already holds it from
  // `species list`, so this costs no request on a run that listed its species.
  const checklist = await deps.http.getText(CHECKLIST_URL);
  if (!checklist.ok) {
    console.error(
      `the PLANTS checklist fetch failed: ${checklist.error ?? checklist.status}. Every identity check reads the accepted name only.`,
    );
  }
  const rows = checklist.ok ? parseChecklist(checklist.body) : [];

  const noProfile: string[] = [];
  // The appended rows per source, after the colour drop. The last line prints them.
  const bySource: Record<string, number> = {};
  let appended = 0;
  let monoDropped = 0;
  for (const target of targetsOf(scope)) {
    if (target.lookups.length === 0) {
      console.error(`${target.key}: no exemplars in run.json`);
    }
    // One list per exemplar. `interleave` merges them round-robin below, so the cap in
    // `collect` splits across the exemplars instead of filling on the first one.
    const perSymbol: Candidate[][] = [];
    for (const symbol of target.lookups) {
      const plant = await plantOf(deps, ids, symbol, now);
      if (plant === null) {
        console.error(`${symbol}: ${NO_PROFILE}`);
        noProfile.push(symbol);
        continue;
      }
      const names = [plant.scientific, ...synonymNames(rows, symbol)];
      const context: FetchContext = {
        deps,
        scope,
        target: target.key,
        symbol,
        scientific: plant.scientific,
        plantsId: plant.id,
        names,
        passes,
        now,
      };
      // Owner ruling 2026-09-25: the turn sources take turns, one row each per round, so a
      // source late in TURN_ORDER still gets rows before `collect` reaches the cap. PLANTS
      // images are mostly monochrome herbarium plates, so PLANTS takes the room left.
      const turns: Candidate[][] = [];
      for (const key of TURN_ORDER) turns.push(await turnRows(key, context));
      const fromSources = [...interleave(turns), ...(await plantsRows(context))];
      // D17: the script compares the source's own name with the accepted name and its
      // synonyms, so the photo-check agent reads a verdict instead of guessing.
      for (const row of fromSources) {
        row.identity_match = identityMatches(row.source_species, names);
      }
      perSymbol.push(fromSources);
    }
    // `collect` never reads a row's target, so one call takes one target's rows only.
    const collected = collect({
      existing,
      found: mergeFound(interleave(perSymbol)),
      target: target.key,
      approvedByChannel: counts[target.key] ?? {},
    });
    // The colour check runs after the download and before the append. A dropped row keeps
    // its cache file, so a rerun measures it again with no new download.
    const kept: Candidate[] = [];
    let mono = 0;
    for (const row of collected.added) {
      await download(deps, row);
      const bytes = localBytes(deps.root, row);
      // A failed download has no cached file. Its row is still appended, as before.
      if (bytes === null) {
        kept.push(row);
        continue;
      }
      let score: number;
      try {
        score = await deps.chroma(bytes);
      } catch (error) {
        // The bytes arrived but do not decode. That counts as a download failure.
        recordFailure(
          deps.http,
          row.file_url,
          200,
          `the image does not decode: ${errorMessage(error)}`,
          now,
        );
        continue;
      }
      if (score < MONO_THRESHOLD) {
        mono += 1;
        continue;
      }
      kept.push(row);
    }
    if (mono > 0) console.error(`${target.key}: ${mono} monochrome dropped`);
    // The append happens per target, so a run that stops on the third target keeps the
    // rows of the first two.
    if (kept.length > 0) appendJsonl(candidatesPath, kept);
    existing = existing.concat(kept);
    appended += kept.length;
    monoDropped += mono;
    for (const row of kept) bySource[row.source_key] = (bySource[row.source_key] ?? 0) + 1;
  }

  scope.dropped = withNoProfile(scope.dropped, noProfile);
  scope.fetch_failures = deps.http.failures.length;
  scope.mono_dropped = monoDropped;
  writeRun(deps.root, scope);
  gitCommitAll(deps.exec, `content(${name}): photo candidates`);
  printFailures(deps);
  console.log(
    `${appended} candidates appended to ${relative(deps.root, candidatesPath)}, ${scope.fetch_failures} download failures, ${scope.mono_dropped} monochrome dropped`,
  );
  console.log(sourceLine(bySource));
  return 0;
}
```

3. In the interface `FetchContext` (lines 730-741 before this step), add two fields after `plantsId: number;`:

```ts
  /** The scientific name and its PLANTS synonyms. A source that looks a species up by name reads them. */
  names: string[];
  passes: InatPass[];
```

4. Before the function `plantsRows` (`async function plantsRows(context: FetchContext)`), add:

```ts
/** One turn source's rows for one symbol, best first. */
async function turnRows(key: SourceKey, context: FetchContext): Promise<Candidate[]> {
  switch (key) {
    case 'commons':
      return commonsRows(context);
    case 'inat':
      return inatRows(context, context.passes);
    default:
      throw new Error(`${key} is not a turn source`);
  }
}

/** The last line of `photos fetch`: the appended rows per source, after the colour drop. */
function sourceLine(counts: Record<string, number>): string {
  return `by source: ${FETCH_ORDER.map((key) => `${key} ${counts[key] ?? 0}`).join(', ')}`;
}
```

- [ ] **Step 25: Run the fetch tests and see them pass**

Run: `node --test pipeline/tests/cli_fetch.test.ts`
Expected: PASS, every test.

- [ ] **Step 26: Update Step 4 of the content-run skill**

In `.claude/skills/content-run/SKILL.md`, replace lines 68-72:

```markdown
This appends rows to `pipeline/runs/<name>/candidates.jsonl` and downloads each image into
`pipeline/cache/`. It prints
`<n> candidates appended to pipeline/runs/<name>/candidates.jsonl, <m> download failures, <k> monochrome dropped`,
then one line per fetch failure, and it records the count in `run.json` as
`fetch_failures`.
```

with:

```markdown
This appends rows to `pipeline/runs/<name>/candidates.jsonl` and downloads each image into
`pipeline/cache/`. The sources take turns: each source gives one row per round, in this
order: Wikimedia Commons, iNaturalist. A source that runs out drops out of the rounds. USDA
PLANTS rows come after all the turn rows. A target keeps 60 rows at most.

It prints one line per fetch failure, then
`<n> candidates appended to pipeline/runs/<name>/candidates.jsonl, <m> download failures, <k> monochrome dropped`.
The last line gives the appended rows per source, in fetch order, for example
`by source: commons 17, inat 16, plants 0`. It records the failure count in `run.json` as
`fetch_failures`.
```

- [ ] **Step 27: Run the pipeline suite**

Run: `npm run test:pipeline`
Expected: PASS, 367 tests. That is 348 plus 19 new tests: licences 8, HTML 4, keys 1, hosts 2, `photos add` 2, and fetch 2 (the old order test became three tests).

- [ ] **Step 28: Commit**

```bash
git add pipeline/lib/commands.ts pipeline/tests/cli_fetch.test.ts .claude/skills/content-run/SKILL.md
git commit -m "feat: take turns between the fetch sources and print the count per source" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Bioimages fetch source

Runs in its own worktree (`sources-t2`), after Task 1. Touch no file outside this list.

**Files:**
- Create: `pipeline/lib/bioimages.ts`
- Create: `pipeline/tests/fixtures/bioimages/images_sample.csv`
- Test: `pipeline/tests/bioimages.test.ts`

**Interfaces:**
- Consumes: `channelHint(text: string): string | null`, `licenseAllowed(text: string): boolean`, `makeCandidate(fields): Candidate`, `type Candidate`, `SOURCE_NAMES` from `pipeline/lib/candidates.ts` (source key `'bioimages'`, display name `'Bioimages'`, from Task 1); `type Http`, `type TextResult`, `type BytesResult`, `type HttpFailure` from `pipeline/lib/http.ts`.
- Produces (all exported from `pipeline/lib/bioimages.ts`):
  - `BIOIMAGES_CATALOGUE_URL = 'https://raw.githubusercontent.com/baskaufs/Bioimages/master/images.csv'`
  - `BIOIMAGES_LICENSES: Record<string, { label: string; url: string }>`
  - `type BioimagesRow = Record<string, string>`
  - `parseBioimagesCatalogue(text: string): BioimagesRow[]`
  - `bioimagesName(title: string): string`
  - `normalizeBioimagesName(name: string): string`
  - `bioimagesAuthor(row: BioimagesRow): string`
  - `bioimagesCandidates(rows: BioimagesRow[], names: string[], target: string, now: string): Candidate[]`
  - `bioimagesRows(http: Http, names: string[], target: string, now: string): Promise<Candidate[]>` (Task 7 calls this with `context.names`)

Facts from the saved catalogue (`$RESEARCH/bioimages/images.csv`, 16,241 rows, 40 columns, `|` delimited, LF line ends, no quoting): `usageTermsIndex` is 1 (CC BY 4.0) on 12,417 rows, 4 (CC BY-NC-SA 4.0) on 3,816 rows, and 0 (CC0) on 8 rows. All 8 CC0 rows carry `suppress` 1. The 10 Quercus gambelii rows are all CC BY 4.0 and not suppressed.

- [ ] **Step 1: Make the fixture**

Run from the worktree root. It keeps the header and six rows, in catalogue order: one CC BY-NC-SA row (Tragia cordata), one suppressed CC0 row (Quercus falcata, `11652.jpg`), three Quercus gambelii rows (fruit, leaf, bark), and one suppressed row (Quercus bicolor, `suppress` 2).

```bash
node -e "const fs=require('fs');const src='C:/Users/jdennen/AppData/Local/Temp/claude/C--Users-jdennen-Dendro/8b1c3373-46a9-4856-9724-c9fe26e0a80f/scratchpad/research/bioimages/images.csv';const keep=new Set(['trco--fr040529-17e5384.jpg','11652.jpg','qugag-fr14133.jpg','qugag-lf14140.jpg','qugag-br14144.jpg','qubi--fr16299.jpg']);const lines=fs.readFileSync(src,'utf8').split('\n');const col=lines[0].split('|').indexOf('fileName');const out=[lines[0]].concat(lines.slice(1).filter((l)=>keep.has(l.split('|')[col])));fs.mkdirSync('pipeline/tests/fixtures/bioimages',{recursive:true});fs.writeFileSync('pipeline/tests/fixtures/bioimages/images_sample.csv',out.join('\n')+'\n');console.log(out.length-1,'rows',Buffer.byteLength(out.join('\n')),'bytes')"
```

Expected: `6 rows <n> bytes`, with `<n>` from 4500 to 6500.

- [ ] **Step 2: Write the failing test**

Create `pipeline/tests/bioimages.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  BIOIMAGES_CATALOGUE_URL,
  BIOIMAGES_LICENSES,
  bioimagesAuthor,
  bioimagesCandidates,
  bioimagesName,
  bioimagesRows,
  normalizeBioimagesName,
  parseBioimagesCatalogue,
  type BioimagesRow,
} from '../lib/bioimages.ts';
import { SOURCE_NAMES, licenseAllowed } from '../lib/candidates.ts';
import type { BytesResult, Http, HttpFailure, TextResult } from '../lib/http.ts';

const NOW = '2026-09-25T12:00:00Z';
const CATALOGUE = fs.readFileSync(
  new URL('./fixtures/bioimages/images_sample.csv', import.meta.url),
  'utf8',
);
const BASKAUF = 'http://bioimages.vanderbilt.edu/baskauf';

function catalogue(): BioimagesRow[] {
  return parseBioimagesCatalogue(CATALOGUE);
}

function rowNamed(fileName: string): BioimagesRow {
  const row = catalogue().find((one) => one.fileName === fileName);
  assert.ok(row !== undefined, `the fixture holds ${fileName}`);
  return row;
}

/** An Http that answers the catalogue url with `body`, or fails when `body` is null. */
function fakeHttp(body: string | null): Http & { urls: string[] } {
  const urls: string[] = [];
  const failures: HttpFailure[] = [];
  return {
    failures,
    urls,
    async getText(url: string): Promise<TextResult> {
      urls.push(url);
      if (body === null) {
        failures.push({ url, status: 500, message: 'status 500', at: NOW });
        return { ok: false, status: 500, body: '', fromCache: false, error: 'status 500' };
      }
      return { ok: true, status: 200, body, fromCache: false, error: null };
    },
    async postJson(): Promise<TextResult> {
      throw new Error('bioimages never posts');
    },
    async getBytes(): Promise<BytesResult> {
      throw new Error('bioimages reads no bytes');
    },
  };
}

test('BIOIMAGES_CATALOGUE_URL names the catalogue in the Bioimages repository', () => {
  assert.equal(
    BIOIMAGES_CATALOGUE_URL,
    'https://raw.githubusercontent.com/baskaufs/Bioimages/master/images.csv',
  );
});

test('parseBioimagesCatalogue reads each row by header name', () => {
  const rows = catalogue();
  assert.equal(rows.length, 6);
  const fruit = rowNamed('qugag-fr14133.jpg');
  assert.equal(Object.keys(fruit).length, 40);
  assert.equal(fruit.dcterms_title, 'Quercus gambelii (Fagaceae) - fruit - as borne on the plant');
  assert.equal(fruit.usageTermsIndex, '1');
  assert.equal(fruit.suppress, '');
  assert.equal(fruit.ac_attributionLinkURL, `${BASKAUF}/14133.htm`);
  assert.equal(
    fruit.ac_hasServiceAccessPoint,
    'https://zenodo.org/records/11021527/files/qugag-fr14133.jpg',
  );
});

test('bioimagesName takes the title text before the first " ("', () => {
  assert.equal(
    bioimagesName('Quercus gambelii (Fagaceae) - fruit - as borne on the plant'),
    'Quercus gambelii',
  );
  assert.equal(
    bioimagesName('Berlandiera x betonicifolia  (Asteraceae) - whole plant'),
    'Berlandiera x betonicifolia',
  );
  assert.equal(bioimagesName('Quercus alba'), 'Quercus alba');
});

test('normalizeBioimagesName writes one form for one name', () => {
  assert.equal(normalizeBioimagesName('Platanus ×hispanica'), 'platanus x hispanica');
  assert.equal(normalizeBioimagesName('Platanus × hispanica'), 'platanus x hispanica');
  assert.equal(normalizeBioimagesName('  Quercus   Gambelii '), 'quercus gambelii');
  assert.equal(normalizeBioimagesName('Jose\u0301'), 'jos\u00e9', 'NFC composes the accent');
});

test('bioimagesAuthor reads the credit before its url, then the rights owner', () => {
  assert.equal(
    bioimagesAuthor({ photoshop_Credit: 'Steven J. Baskauf http://bioimages.vanderbilt.edu/', xmpRights_Owner: 'Other' }),
    'Steven J. Baskauf',
  );
  assert.equal(bioimagesAuthor({ photoshop_Credit: '', xmpRights_Owner: 'Darel Hess' }), 'Darel Hess');
  assert.equal(bioimagesAuthor({ photoshop_Credit: ' ', xmpRights_Owner: ' ' }), '');
});

test('BIOIMAGES_LICENSES maps the five codes, and the NC codes fail the allowlist', () => {
  const labels = Object.fromEntries(
    Object.entries(BIOIMAGES_LICENSES).map(([code, license]) => [code, license.label]),
  );
  assert.deepEqual(labels, {
    '0': 'CC0 1.0',
    '1': 'CC BY 4.0',
    '2': 'CC BY-SA 4.0',
    '3': 'CC BY-NC 4.0',
    '4': 'CC BY-NC-SA 4.0',
  });
  assert.deepEqual(
    Object.keys(BIOIMAGES_LICENSES).filter((code) => licenseAllowed(BIOIMAGES_LICENSES[code].label)),
    ['0', '1', '2'],
  );
  assert.equal(BIOIMAGES_LICENSES['1'].url, 'https://creativecommons.org/licenses/by/4.0/');
});

test('bioimagesCandidates builds the three Quercus gambelii rows', () => {
  const rows = bioimagesCandidates(catalogue(), ['Quercus gambelii'], 'QUGA', NOW);
  assert.deepEqual(
    rows.map((row) => row.origin),
    [`${BASKAUF}/14133.htm`, `${BASKAUF}/14140.htm`, `${BASKAUF}/14144.htm`],
  );
  assert.deepEqual(rows.map((row) => row.channel_hint), ['fruit', 'leaf', 'bark']);
  const first = rows[0];
  assert.equal(first.target, 'QUGA');
  assert.equal(first.source_key, 'bioimages');
  assert.equal(first.source, SOURCE_NAMES.bioimages);
  assert.equal(first.author, 'Steven J. Baskauf');
  assert.equal(first.license, 'CC BY 4.0');
  assert.equal(first.license_url, 'https://creativecommons.org/licenses/by/4.0/');
  assert.equal(first.file_url, 'https://zenodo.org/records/11021527/files/qugag-fr14133.jpg');
  assert.equal(first.source_species, 'Quercus gambelii');
  assert.equal(first.fetched_at, NOW);
  assert.equal(first.identity_match, null);
  assert.deepEqual(first.tags_hint, []);
});

test('bioimagesCandidates compares names after it normalises both', () => {
  assert.equal(bioimagesCandidates(catalogue(), ['quercus  GAMBELII'], 'QUGA', NOW).length, 3);
  assert.deepEqual(
    bioimagesCandidates(catalogue(), ['Quercus gambelii Nutt.'], 'QUGA', NOW),
    [],
    'an author makes a different name',
  );
});

test('bioimagesCandidates drops the NC row and every suppressed row', () => {
  assert.equal(rowNamed('trco--fr040529-17e5384.jpg').usageTermsIndex, '4');
  assert.deepEqual(
    bioimagesCandidates(catalogue(), ['Tragia cordata'], 'TRCO', NOW),
    [],
    'CC BY-NC-SA 4.0 is not on the allowlist',
  );
  assert.equal(rowNamed('qubi--fr16299.jpg').suppress, '2');
  assert.deepEqual(bioimagesCandidates(catalogue(), ['Quercus bicolor'], 'QUBI', NOW), []);
  assert.equal(rowNamed('11652.jpg').suppress, '1');
  assert.deepEqual(
    bioimagesCandidates(catalogue(), ['Quercus falcata'], 'QUFA', NOW),
    [],
    'a suppressed CC0 row is skipped too',
  );
});

test('bioimagesCandidates keeps suppress 0 and skips a row with no file, author, or known code', () => {
  const base = rowNamed('qugag-fr14133.jpg');
  const count = (row: BioimagesRow): number =>
    bioimagesCandidates([row], ['Quercus gambelii'], 'QUGA', NOW).length;
  assert.equal(count({ ...base, suppress: '0' }), 1);
  assert.equal(count({ ...base, ac_hasServiceAccessPoint: '' }), 0);
  assert.equal(count({ ...base, photoshop_Credit: '', xmpRights_Owner: '' }), 0);
  assert.equal(count({ ...base, usageTermsIndex: '9' }), 0);
  assert.equal(count({ ...base, ac_attributionLinkURL: '' }), 0);
});

test('bioimagesRows reads the catalogue once for each Http', async () => {
  const http = fakeHttp(CATALOGUE);
  const quga = await bioimagesRows(http, ['Quercus gambelii'], 'QUGA', NOW);
  const other = await bioimagesRows(http, ['Tragia cordata'], 'TRCO', NOW);
  assert.equal(quga.length, 3);
  assert.equal(other.length, 0);
  assert.deepEqual(http.urls, [BIOIMAGES_CATALOGUE_URL], 'the second call reads no url');

  const second = fakeHttp(CATALOGUE);
  await bioimagesRows(second, ['Quercus gambelii'], 'QUGA', NOW);
  assert.deepEqual(second.urls, [BIOIMAGES_CATALOGUE_URL], 'a new Http reads the catalogue again');
});

test('bioimagesRows gives no rows when the catalogue fetch fails', async () => {
  const http = fakeHttp(null);
  assert.deepEqual(await bioimagesRows(http, ['Quercus gambelii'], 'QUGA', NOW), []);
  assert.equal(http.failures.length, 1);
});
```

- [ ] **Step 3: Run the test and see it fail**

Run: `node --test pipeline/tests/bioimages.test.ts`
Expected: FAIL with `Error [ERR_MODULE_NOT_FOUND]: Cannot find module` naming `pipeline/lib/bioimages.ts`.

- [ ] **Step 4: Write the module**

Create `pipeline/lib/bioimages.ts`:

```ts
import { channelHint, licenseAllowed, makeCandidate, type Candidate } from './candidates.ts';
import type { Http } from './http.ts';

/** The Bioimages catalogue: one row per image, `|` delimited, with a header row. */
export const BIOIMAGES_CATALOGUE_URL =
  'https://raw.githubusercontent.com/baskaufs/Bioimages/master/images.csv';

/**
 * `usageTermsIndex` to a licence, from `license.xml` in the Bioimages repository. Codes 3 and
 * 4 are NC licences, and `licenseAllowed` rejects them.
 */
export const BIOIMAGES_LICENSES: Record<string, { label: string; url: string }> = {
  '0': { label: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  '1': { label: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  '2': { label: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  '3': { label: 'CC BY-NC 4.0', url: 'https://creativecommons.org/licenses/by-nc/4.0/' },
  '4': { label: 'CC BY-NC-SA 4.0', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/' },
};

/** One catalogue row, keyed by the header names. */
export type BioimagesRow = Record<string, string>;

/** Reads the catalogue by header name. The file has no quoting, so a split on `|` is exact. */
export function parseBioimagesCatalogue(text: string): BioimagesRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line !== '');
  if (lines.length === 0) return [];
  const header = lines[0].split('|');
  return lines.slice(1).map((line) => {
    const cells = line.split('|');
    const row: BioimagesRow = {};
    header.forEach((name, index) => {
      row[name] = cells[index] ?? '';
    });
    return row;
  });
}

/**
 * The name in a title, as written. No column holds the name, so the name is the title text
 * before the first ` (`, as in `Quercus gambelii (Fagaceae) - fruit - as borne on the plant`.
 */
export function bioimagesName(title: string): string {
  const cut = title.indexOf(' (');
  return (cut === -1 ? title : title.slice(0, cut)).trim();
}

/** Unicode NFC, `×` as ` x `, one space between words, trimmed, lower case. */
export function normalizeBioimagesName(name: string): string {
  return name
    .normalize('NFC')
    .replace(/×/g, ' x ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The photographer: `photoshop_Credit` before ` http`, else `xmpRights_Owner`. */
export function bioimagesAuthor(row: BioimagesRow): string {
  const credit = row.photoshop_Credit ?? '';
  const cut = credit.indexOf(' http');
  const name = (cut === -1 ? credit : credit.slice(0, cut)).trim();
  if (name !== '') return name;
  return (row.xmpRights_Owner ?? '').trim();
}

/**
 * The rows of one target. `names` holds the scientific name and the PLANTS synonyms. A row
 * matches when its title name, normalised, equals one of them, normalised the same way.
 */
export function bioimagesCandidates(
  rows: BioimagesRow[],
  names: string[],
  target: string,
  now: string,
): Candidate[] {
  const wanted = new Set(names.map(normalizeBioimagesName));
  const out: Candidate[] = [];
  for (const row of rows) {
    const title = row.dcterms_title ?? '';
    const name = bioimagesName(title);
    if (!wanted.has(normalizeBioimagesName(name))) continue;
    // One bit of the suppress flag has no documented meaning, so every flagged row is skipped.
    const suppress = (row.suppress ?? '').trim();
    if (suppress !== '' && suppress !== '0') continue;
    const fileUrl = (row.ac_hasServiceAccessPoint ?? '').trim();
    if (fileUrl === '') continue;
    const license = BIOIMAGES_LICENSES[(row.usageTermsIndex ?? '').trim()];
    if (license === undefined || !licenseAllowed(license.label)) continue;
    const author = bioimagesAuthor(row);
    // The app prints the credit as it is, so a row with no author can never publish.
    if (author === '') continue;
    // Each image has its own page, so the origin needs no fragment.
    const origin = (row.ac_attributionLinkURL ?? '').trim();
    if (origin === '') continue;
    const cut = title.indexOf(' (');
    out.push(
      makeCandidate({
        target,
        source_key: 'bioimages',
        origin,
        file_url: fileUrl,
        author,
        license: license.label,
        license_url: license.url,
        source_species: name,
        channel_hint: channelHint(cut === -1 ? '' : title.slice(cut)),
        fetched_at: now,
      }),
    );
  }
  return out;
}

// One parse for each Http. One process has one Http, so the 12 MB catalogue parses once per
// process. A WeakMap keeps the fake Http of one test from seeing the catalogue of another.
const catalogues = new WeakMap<Http, Promise<BioimagesRow[] | null>>();

function catalogueOf(http: Http): Promise<BioimagesRow[] | null> {
  let found = catalogues.get(http);
  if (found === undefined) {
    found = http
      .getText(BIOIMAGES_CATALOGUE_URL)
      .then((result) => (result.ok ? parseBioimagesCatalogue(result.body) : null));
    catalogues.set(http, found);
  }
  return found;
}

/** The Bioimages rows of one symbol. A failed catalogue fetch gives no rows; the Http records it. */
export async function bioimagesRows(
  http: Http,
  names: string[],
  target: string,
  now: string,
): Promise<Candidate[]> {
  const rows = await catalogueOf(http);
  if (rows === null) return [];
  return bioimagesCandidates(rows, names, target, now);
}
```

- [ ] **Step 5: Run the test and see it pass**

Run: `node --test pipeline/tests/bioimages.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 6: Run the pipeline suite**

Run: `npm run test:pipeline`
Expected: PASS, 367 + 12 = 379 tests.

- [ ] **Step 7: Commit**

```bash
git add pipeline/lib/bioimages.ts pipeline/tests/bioimages.test.ts pipeline/tests/fixtures/bioimages/images_sample.csv
git commit -m "feat: add the Bioimages fetch source" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Trees and Shrubs Online fetch source

Runs in its own worktree (`sources-t3`), after Task 1. Touch no file outside this list.

**Files:**
- Create: `pipeline/lib/tso.ts`
- Create: `pipeline/tests/fixtures/tso/sitemap_sample.xml`, `pipeline/tests/fixtures/tso/quercus_gambelii.html`, `pipeline/tests/fixtures/tso/platanus_x_hispanica.html`
- Test: `pipeline/tests/tso.test.ts`

**Interfaces:**
- Consumes: `channelHint`, `makeCandidate`, `type Candidate`, `SOURCE_NAMES` from `pipeline/lib/candidates.ts` (source key `'tso'`, display name `'Trees and Shrubs Online'`, from Task 1); `htmlText(html: string): string` and `openTags(html: string, name: string): HtmlTag[]` from `pipeline/lib/html.ts` (Task 1); `type Http` and the result types from `pipeline/lib/http.ts`.
- Produces (all exported from `pipeline/lib/tso.ts`):
  - `TSO_BASE = 'https://www.treesandshrubsonline.org'`, `TSO_SITEMAP_URL = 'https://www.treesandshrubsonline.org/sitemap.xml'`, `TSO_LICENSE = 'CC BY-SA 4.0'`, `TSO_LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/'`
  - `interface TsoImage { href: string; caption: string }`
  - `interface TsoPage { species: string | null; images: TsoImage[]; sectionIds: string[] }`
  - `tsoPath(name: string): string | null`
  - `parseSitemapPaths(xml: string): Set<string>`
  - `parseTsoPage(html: string): TsoPage`
  - `ownImages(page: TsoPage): TsoImage[]`
  - `tsoCredit(text: string): string | null`
  - `tsoCandidates(page: TsoPage, pageUrl: string, target: string, now: string): Candidate[]`
  - `tsoRows(http: Http, names: string[], target: string, now: string): Promise<Candidate[]>` (Task 7 calls this with `context.names`)

Facts from the saved pages (`$RESEARCH/tso/`): the HTML is minified, and most attributes have no quotes (`<h3 id=11114>`, `<span class=authors>`). The gallery anchors are fully double-quoted: `<a class="uk-inline" href="/site/assets/files/7054/quercus-gambelii-6.jpg" data-caption="<p>…</p>" data-alt="…">`. The `data-caption` value holds raw `<p>` and `<i>` tags and references such as `&#039;` and `&quot;`. The lightbox group also repeats some images as `<a href="…" data-caption="…" hidden>` with no `uk-inline` class; those do not count. A credit can hold a period (`Image Paul W. Meyer.`), so the credit is the text after the last `Image `.

- [ ] **Step 1: Make the fixtures**

Run the three commands from the worktree root.

Sitemap: the XML head, the first three `<url>` entries, and the entries for the two articles and `/about/contact/`.

```bash
node -e "const fs=require('fs');const R='C:/Users/jdennen/AppData/Local/Temp/claude/C--Users-jdennen-Dendro/8b1c3373-46a9-4856-9724-c9fe26e0a80f/scratchpad/research/tso/';const t=fs.readFileSync(R+'sitemap.xml','utf8');const head=t.slice(0,t.indexOf('<url>'));const urls=t.match(/<url>[\s\S]*?<\/url>/g);const want=['/articles/quercus/quercus-gambelii/','/articles/platanus/platanus-x-hispanica/','/about/contact/'];const kept=urls.slice(0,3).concat(urls.filter((u)=>want.some((w)=>u.includes('treesandshrubsonline.org'+w+'</loc>'))));fs.mkdirSync('pipeline/tests/fixtures/tso',{recursive:true});fs.writeFileSync('pipeline/tests/fixtures/tso/sitemap_sample.xml',head+kept.join('\n')+'\n</urlset>\n');console.log(kept.length,'urls')"
```

Expected: `6 urls`.

Quercus gambelii article: the `<title>`, the `<h1>`, the whole gallery block (5 `uk-inline` anchors and the hidden repeats), and the one `<h3 id=11114>` section heading.

```bash
node -e "const fs=require('fs');const R='C:/Users/jdennen/AppData/Local/Temp/claude/C--Users-jdennen-Dendro/8b1c3373-46a9-4856-9724-c9fe26e0a80f/scratchpad/research/tso/';const t=fs.readFileSync(R+'quercus-gambelii.html','utf8');const title=t.match(/<title>.*?<\/title>/)[0];const h1=t.match(/<h1>.*?<\/h1>/)[0];const g=t.indexOf(\"<div class='uk-child-width-1-1 uk-child-width-1-2@s' uk-grid uk-lightbox>\");const hr=t.indexOf('<hr/><h3 id=11114>',g);const h3=t.slice(hr,t.indexOf('</h3>',hr)+5);const out='<!DOCTYPE html><html lang=en><meta charset=utf-8>'+title+'\n'+h1+'\n'+t.slice(g,hr)+'\n'+h3+'\n</html>\n';fs.writeFileSync('pipeline/tests/fixtures/tso/quercus_gambelii.html',out);console.log(Buffer.byteLength(out),'bytes')"
```

Expected: a byte count from 6000 to 6600.

London plane article: the `<h1>`, six `uk-inline` anchors (four in the species folder 6779, one in each of the cultivar folders 33571 and 32676), and the two cultivar `<h3>` headings. The six are: `-13` (credit John Grimshaw), `-15` (a "permission" caption), `-12` (credit Paul W. Meyer), `-6` (a `©` caption), `acerifolia` (no credit, cultivar folder), and `alphens-globe` (credit, cultivar folder).

```bash
node -e "const fs=require('fs');const R='C:/Users/jdennen/AppData/Local/Temp/claude/C--Users-jdennen-Dendro/8b1c3373-46a9-4856-9724-c9fe26e0a80f/scratchpad/research/tso/';const t=fs.readFileSync(R+'platanus-x-hispanica.html','utf8');const h1=t.match(/<h1>.*?<\/h1>/)[0];const want=['6779/platanus-x-hispanica-13.jpg','6779/platanus-x-hispanica-12.jpg','6779/platanus-x-hispanica-15.jpg','6779/platanus-x-hispanica-6.jpg','33571/platanus-x-hispanica-acerifolia.jpg','32676/platanus-x-hispanica-alphens-globe.jpg'];const tags=[...t.matchAll(/<a class=\"uk-inline\" href=\"([^\"]*)\" data-caption=\"[^\"]*\"[^>]*>/g)].filter((m)=>want.some((w)=>m[1].endsWith('/'+w)));const seen=new Set();const anchors=tags.filter((m)=>{if(seen.has(m[1]))return false;seen.add(m[1]);return true}).map((m)=>m[0]+'</a>');const h3s=['33571','32676'].map((id)=>t.match(new RegExp('<h3 id='+id+'>.*?</h3>'))[0]);const out='<!DOCTYPE html><html lang=en><meta charset=utf-8>\n'+h1+'\n'+anchors.join('\n')+'\n'+h3s.join('\n')+'\n</html>\n';fs.writeFileSync('pipeline/tests/fixtures/tso/platanus_x_hispanica.html',out);console.log(anchors.length,'anchors',Buffer.byteLength(out),'bytes')"
```

Expected: `6 anchors` and a byte count from 2000 to 3000.

- [ ] **Step 2: Write the failing test**

Create `pipeline/tests/tso.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { SOURCE_NAMES } from '../lib/candidates.ts';
import type { BytesResult, Http, HttpFailure, TextResult } from '../lib/http.ts';
import {
  TSO_LICENSE,
  TSO_LICENSE_URL,
  TSO_SITEMAP_URL,
  ownImages,
  parseSitemapPaths,
  parseTsoPage,
  tsoCandidates,
  tsoCredit,
  tsoPath,
  tsoRows,
} from '../lib/tso.ts';

const NOW = '2026-09-25T12:00:00Z';
const QUGA_URL = 'https://www.treesandshrubsonline.org/articles/quercus/quercus-gambelii/';
const PLHI_URL = 'https://www.treesandshrubsonline.org/articles/platanus/platanus-x-hispanica/';

function fixture(name: string): string {
  return fs.readFileSync(new URL(`./fixtures/tso/${name}`, import.meta.url), 'utf8');
}

const SITEMAP = fixture('sitemap_sample.xml');
const QUGA_PAGE = fixture('quercus_gambelii.html');
const PLHI_PAGE = fixture('platanus_x_hispanica.html');

function fileNames(images: { href: string }[]): string[] {
  return images.map((image) => image.href.split('/').pop() ?? '');
}

/** An Http over a url-to-body map. A url with no body fails with a 404. */
function fakeHttp(routes: Map<string, string>): Http & { urls: string[] } {
  const urls: string[] = [];
  const failures: HttpFailure[] = [];
  return {
    failures,
    urls,
    async getText(url: string): Promise<TextResult> {
      urls.push(url);
      const body = routes.get(url);
      if (body === undefined) {
        failures.push({ url, status: 404, message: 'status 404', at: NOW });
        return { ok: false, status: 404, body: '', fromCache: false, error: 'status 404' };
      }
      return { ok: true, status: 200, body, fromCache: false, error: null };
    },
    async postJson(): Promise<TextResult> {
      throw new Error('tso never posts');
    },
    async getBytes(): Promise<BytesResult> {
      throw new Error('tso reads pages as text');
    },
  };
}

test('tsoPath builds the article path of a name', () => {
  assert.equal(tsoPath('Quercus gambelii'), '/articles/quercus/quercus-gambelii/');
  assert.equal(tsoPath('Platanus ×hispanica'), '/articles/platanus/platanus-x-hispanica/');
  assert.equal(tsoPath('Platanus × hispanica'), '/articles/platanus/platanus-x-hispanica/');
  assert.equal(tsoPath('Quercus utahensis (A. DC.) Rydb.'), '/articles/quercus/quercus-utahensis/');
  assert.equal(tsoPath('Quercus'), null);
  assert.equal(tsoPath(''), null);
});

test('parseSitemapPaths lists the paths on the TSO host', () => {
  const paths = parseSitemapPaths(SITEMAP);
  assert.equal(paths.size, 6);
  assert.ok(paths.has('/articles/quercus/quercus-gambelii/'));
  assert.ok(paths.has('/articles/platanus/platanus-x-hispanica/'));
  assert.ok(!paths.has('/articles/quercus/quercus-alba/'));
});

test('parseTsoPage reads the heading, the gallery, and the section ids', () => {
  const page = parseTsoPage(QUGA_PAGE);
  assert.equal(page.species, 'Quercus gambelii', 'the author span is not part of the name');
  assert.deepEqual(fileNames(page.images), [
    'quercus-gambelii-6.jpg',
    'quercus-gambelii-4.jpg',
    'quercus-gambelii-5.jpg',
    'quercus-gambelii-3.jpg',
    'quercus-gambelii-2.jpg',
  ]);
  assert.deepEqual(page.sectionIds, ['11114']);
});

test('parseTsoPage keeps one image for each href', () => {
  const card =
    '<a class="uk-inline" href="/site/assets/files/1/a.jpg" data-caption="<p>A. Image X Y.</p>"></a>';
  assert.equal(parseTsoPage(card + card).images.length, 1);
});

test('ownImages drops the images in the folder of an h3 section', () => {
  const page = parseTsoPage(PLHI_PAGE);
  assert.equal(page.species, 'Platanus × hispanica');
  assert.equal(page.images.length, 6);
  assert.deepEqual(page.sectionIds, ['33571', '32676']);
  assert.deepEqual(fileNames(ownImages(page)), [
    'platanus-x-hispanica-13.jpg',
    'platanus-x-hispanica-15.jpg',
    'platanus-x-hispanica-12.jpg',
    'platanus-x-hispanica-6.jpg',
  ]);
});

test('tsoCredit reads the name after the last "Image " and refuses rights text', () => {
  assert.equal(tsoCredit('New Mexico, August 2017. Image Charles Snyers.'), 'Charles Snyers');
  assert.equal(tsoCredit('Xian, China on 9 September 2011. Image Paul W. Meyer.'), 'Paul W. Meyer');
  assert.equal(tsoCredit('Eeklo, Belgium. Image © Jan De Langhe - Arboretum Wespelaar.'), null);
  assert.equal(
    tsoCredit('Reproduced by kind permission of the British Library. Image The British Library.'),
    null,
  );
  assert.equal(tsoCredit('A view (c) 2019. Image A. Person.'), null);
  assert.equal(tsoCredit("Foliage and fruit of the 'Acerifolia' at Kew. June 2025."), null);
});

test('tsoCandidates builds one CC BY-SA row for each credited image of the species', () => {
  const rows = tsoCandidates(parseTsoPage(QUGA_PAGE), QUGA_URL, 'QUGA', NOW);
  assert.deepEqual(
    rows.map((row) => row.origin),
    [6, 4, 5, 3, 2].map((n) => `${QUGA_URL}#image=quercus-gambelii-${n}.jpg`),
  );
  assert.equal(
    rows[0].file_url,
    'https://www.treesandshrubsonline.org/site/assets/files/7054/quercus-gambelii-6.jpg',
  );
  for (const row of rows) {
    assert.equal(row.target, 'QUGA');
    assert.equal(row.source_key, 'tso');
    assert.equal(row.source, SOURCE_NAMES.tso);
    assert.equal(row.author, 'Charles Snyers');
    assert.equal(row.license, TSO_LICENSE);
    assert.equal(row.license_url, TSO_LICENSE_URL);
    assert.equal(row.source_species, 'Quercus gambelii');
    assert.equal(row.fetched_at, NOW);
  }
});

test('tsoCandidates drops the © caption, the permission caption, and the cultivar images', () => {
  const rows = tsoCandidates(parseTsoPage(PLHI_PAGE), PLHI_URL, 'PLHI', NOW);
  assert.deepEqual(
    rows.map((row) => [row.origin, row.author]),
    [
      [`${PLHI_URL}#image=platanus-x-hispanica-13.jpg`, 'John Grimshaw'],
      [`${PLHI_URL}#image=platanus-x-hispanica-12.jpg`, 'Paul W. Meyer'],
    ],
  );
  assert.equal(rows[0].source_species, 'Platanus × hispanica');
});

test('tsoRows fetches a page only when the sitemap lists its path', async () => {
  const http = fakeHttp(new Map([[TSO_SITEMAP_URL, SITEMAP], [QUGA_URL, QUGA_PAGE]]));
  const rows = await tsoRows(http, ['Quercus gambelii', 'Quercus alba'], 'QUGA', NOW);
  assert.equal(rows.length, 5);
  assert.deepEqual(http.urls, [TSO_SITEMAP_URL, QUGA_URL], 'Quercus alba costs no request');
  assert.deepEqual(http.failures, []);
});

test('tsoRows asks for one path once when two names give it', async () => {
  const http = fakeHttp(new Map([[TSO_SITEMAP_URL, SITEMAP], [QUGA_URL, QUGA_PAGE]]));
  const rows = await tsoRows(http, ['Quercus gambelii', 'Quercus gambelii Nutt.'], 'QUGA', NOW);
  assert.equal(rows.length, 5);
  assert.deepEqual(http.urls, [TSO_SITEMAP_URL, QUGA_URL]);
});

test('tsoRows gives no rows when the heading names another species', async () => {
  const http = fakeHttp(new Map([[TSO_SITEMAP_URL, SITEMAP], [QUGA_URL, PLHI_PAGE]]));
  assert.deepEqual(await tsoRows(http, ['Quercus gambelii'], 'QUGA', NOW), []);
});

test('tsoRows gives no rows when the sitemap fetch fails', async () => {
  const http = fakeHttp(new Map());
  assert.deepEqual(await tsoRows(http, ['Quercus gambelii'], 'QUGA', NOW), []);
  assert.deepEqual(http.urls, [TSO_SITEMAP_URL]);
});
```

- [ ] **Step 3: Run the test and see it fail**

Run: `node --test pipeline/tests/tso.test.ts`
Expected: FAIL with `Error [ERR_MODULE_NOT_FOUND]: Cannot find module` naming `pipeline/lib/tso.ts`.

- [ ] **Step 4: Write the module**

Create `pipeline/lib/tso.ts`:

```ts
import { channelHint, makeCandidate, type Candidate } from './candidates.ts';
import { htmlText, openTags } from './html.ts';
import type { Http } from './http.ts';

export const TSO_BASE = 'https://www.treesandshrubsonline.org';
export const TSO_SITEMAP_URL = `${TSO_BASE}/sitemap.xml`;

/**
 * The site licence (`/about/licence/`, read 2026-09-25). No caption states a licence of its
 * own, so every kept row carries this one.
 */
export const TSO_LICENSE = 'CC BY-SA 4.0';
export const TSO_LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';

export interface TsoImage {
  /** The file path, as the page writes it: `/site/assets/files/<pageId>/<file>`. */
  href: string;
  /** The raw `data-caption` value: an HTML fragment. */
  caption: string;
}

export interface TsoPage {
  /** The name in the `<h1>`, with no author. */
  species: string | null;
  images: TsoImage[];
  /** The `id` of each `<h3>`. Those sections hold cultivars and varieties. */
  sectionIds: string[];
}

/** The article path of a name: `/articles/<genus>/<genus>-<epithet>/`, lower case, `×` as `x`. */
export function tsoPath(name: string): string | null {
  const words = name
    .normalize('NFC')
    .replace(/×/g, ' x ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .split(' ');
  const genus = words[0] ?? '';
  let epithet = words[1] ?? '';
  if (epithet === 'x') epithet = words[2] === undefined ? '' : `x-${words[2]}`;
  if (!/^[a-z]+$/.test(genus) || !/^[a-z][a-z-]*$/.test(epithet)) return null;
  return `/articles/${genus}/${genus}-${epithet}/`;
}

/** The paths that the sitemap lists on the TSO host. */
export function parseSitemapPaths(xml: string): Set<string> {
  const paths = new Set<string>();
  for (const match of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    let url: URL;
    try {
      url = new URL(match[1]);
    } catch {
      continue;
    }
    if (url.hostname === 'www.treesandshrubsonline.org') paths.add(url.pathname);
  }
  return paths;
}

const AUTHORS = /<span\s+class=["']?authors["']?>[\s\S]*?<\/span>/gi;
const HEADING = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i;
const SECTION_ID = /<h3\s+id=["']?([^"'\s>]+)["']?/gi;

/** The heading, the gallery images (one for each href), and the section ids of one article. */
export function parseTsoPage(html: string): TsoPage {
  const heading = HEADING.exec(html);
  const name = heading === null ? '' : htmlText(heading[1].replace(AUTHORS, ' '));
  const images: TsoImage[] = [];
  const seen = new Set<string>();
  for (const tag of openTags(html, 'a')) {
    const classes = (tag.attrs.class ?? '').split(/\s+/);
    const href = tag.attrs.href;
    const caption = tag.attrs['data-caption'];
    // The lightbox repeats some images in hidden anchors with no `uk-inline` class.
    if (!classes.includes('uk-inline') || href === undefined || caption === undefined) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    images.push({ href, caption });
  }
  const sectionIds = [...html.matchAll(SECTION_ID)].map((match) => match[1]);
  return { species: name === '' ? null : name, images, sectionIds };
}

const FOLDER = /^\/site\/assets\/files\/(\d+)\//;

/**
 * The images of the species itself: the files in a `/site/assets/files/<pageId>/` folder
 * whose `<pageId>` is not the id of an `<h3>` on the page.
 */
export function ownImages(page: TsoPage): TsoImage[] {
  const sections = new Set(page.sectionIds);
  return page.images.filter((image) => {
    const folder = FOLDER.exec(image.href);
    return folder !== null && !sections.has(folder[1]);
  });
}

// A caption with its own rights text may differ from the site licence, so it is skipped.
const OWN_RIGHTS = /©|\(c\)|permission/i;
const CREDIT = 'Image ';

/**
 * The photographer of a caption that ends `Image <Name>.`, or null. A name can hold a period,
 * as in `Paul W. Meyer`, so the name is the text after the last `Image `.
 */
export function tsoCredit(text: string): string | null {
  if (OWN_RIGHTS.test(text)) return null;
  const at = text.lastIndexOf(CREDIT);
  if (at === -1 || (at > 0 && text[at - 1] !== ' ')) return null;
  const name = text.slice(at + CREDIT.length).replace(/\.\s*$/, '').trim();
  return name === '' ? null : name;
}

/** One row for each credited image of the species. The origin carries the file name as a fragment. */
export function tsoCandidates(
  page: TsoPage,
  pageUrl: string,
  target: string,
  now: string,
): Candidate[] {
  const rows: Candidate[] = [];
  for (const image of ownImages(page)) {
    const text = htmlText(image.caption);
    const author = tsoCredit(text);
    if (author === null) continue;
    const fileName = image.href.split('/').pop() ?? '';
    rows.push(
      makeCandidate({
        target,
        source_key: 'tso',
        // The candidate id is sha1(target|origin), and one article holds many images.
        origin: `${pageUrl}#image=${fileName}`,
        file_url: new URL(image.href, TSO_BASE).href,
        author,
        license: TSO_LICENSE,
        license_url: TSO_LICENSE_URL,
        source_species: page.species,
        channel_hint: channelHint(text),
        fetched_at: now,
      }),
    );
  }
  return rows;
}

/** The TSO rows of one symbol. `names` holds the scientific name and the PLANTS synonyms. */
export async function tsoRows(
  http: Http,
  names: string[],
  target: string,
  now: string,
): Promise<Candidate[]> {
  const sitemap = await http.getText(TSO_SITEMAP_URL);
  if (!sitemap.ok) return [];
  const listed = parseSitemapPaths(sitemap.body);
  const rows: Candidate[] = [];
  const tried = new Set<string>();
  for (const name of names) {
    const path = tsoPath(name);
    // A path that the sitemap does not list costs no request and records no failure.
    if (path === null || tried.has(path) || !listed.has(path)) continue;
    tried.add(path);
    const pageUrl = `${TSO_BASE}${path}`;
    const page = await http.getText(pageUrl);
    if (!page.ok) continue;
    const parsed = parseTsoPage(page.body);
    // The heading must name the species, or a moved article could give another plant's photos.
    if (parsed.species === null || tsoPath(parsed.species) !== path) continue;
    rows.push(...tsoCandidates(parsed, pageUrl, target, now));
  }
  return rows;
}
```

- [ ] **Step 5: Run the test and see it pass**

Run: `node --test pipeline/tests/tso.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 6: Run the pipeline suite**

Run: `npm run test:pipeline`
Expected: PASS, 367 + 12 = 379 tests (this worktree does not hold Task 2).

- [ ] **Step 7: Commit**

```bash
git add pipeline/lib/tso.ts pipeline/tests/tso.test.ts pipeline/tests/fixtures/tso/sitemap_sample.xml pipeline/tests/fixtures/tso/quercus_gambelii.html pipeline/tests/fixtures/tso/platanus_x_hispanica.html
git commit -m "feat: add the Trees and Shrubs Online fetch source" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: wildflower.org fetch source

Runs in its own worktree (`sources-t4`), after Task 1. Touch no file outside this list.

**Files:**
- Create: `pipeline/lib/wildflower.ts`
- Create: `pipeline/tests/fixtures/wildflower/quga_gallery.html`, `plhi_gallery.html`, `image_66070.html`, `image_3424.html`, `image_24045.html`, `image_121699.html` (all in `pipeline/tests/fixtures/wildflower/`)
- Test: `pipeline/tests/wildflower.test.ts`

**Interfaces:**
- Consumes: `channelHint`, `makeCandidate`, `type Candidate`, `SOURCE_NAMES` from `pipeline/lib/candidates.ts` (source key `'wildflower'`, display name `'Lady Bird Johnson Wildflower Center'`, from Task 1); `htmlText(html: string): string` from `pipeline/lib/html.ts` (Task 1); `licenseAllowedAt(license: string, origin: string): boolean` from `pipeline/lib/licenses.ts` (Task 1); `type Http` and the result types from `pipeline/lib/http.ts`.
- Produces (all exported from `pipeline/lib/wildflower.ts`):
  - `WILDFLOWER_BASE = 'https://www.wildflower.org'`, `WILDFLOWER_MAX_IMAGES = 20`, `WILDFLOWER_LICENSE = 'used with permission, non-commercial'`, `WILDFLOWER_UNRESTRICTED = 'Unrestricted'`
  - `wildflowerGalleryUrl(symbol: string): string`, `wildflowerImageUrl(id: string): string`
  - `decodeWindows1252(bytes: Uint8Array): string`
  - `interface WildflowerGallery { ids: string[]; empty: boolean }`, `parseWildflowerGallery(html: string): WildflowerGallery`
  - `interface WildflowerImage { species: string | null; photographer: string | null; restrictions: string | null; shot: string | null; fileUrl: string | null }`, `parseWildflowerImage(html: string): WildflowerImage`
  - `photographerName(text: string): string`
  - `wildflowerCandidate(image: WildflowerImage, origin: string, target: string, now: string): Candidate | null`
  - `wildflowerRows(http: Http, symbol: string, target: string, now: string): Promise<Candidate[]>` (Task 7 calls this with `context.symbol`)

**Why `getBytes` and not `getText`.** `getText` in `pipeline/lib/http.ts:295` calls `Response.text()`, which always decodes UTF-8. The pages say `charset=iso-8859-1`, so a byte above 0x7F, such as the `°` (0xB0) in a location note, would become U+FFFD. `getBytes` keeps the raw bytes, and this module decodes them as windows-1252, as browsers do for that label. `getBytes` caches a file with no expiry (`http.ts:318`), which fits the policy: store the pages and do not ask for them again. `--refresh` still fetches again. Do not change `http.ts`.

Facts from the saved pages (`$RESEARCH/wildflower/`): the gallery `species.php?id_plant=QUGA` lists 59 images as `result.php?id_image=<id>` links after `<div id="fullpage_content">`, in one page. `species.php?id_plant=PLHI` answers HTTP 200 with `Sorry, no image for this plant`. An image page has a search form that also says `Photographer:`, so the fields are read only after `<h4>Image Information</h4>`. Each field is `Label: <strong>value</strong>`, and the fields are split by `<br />`. All 11 saved image pages say `Restrictions: Unrestricted` and name a photographer, so no saved page has an image that the rule must drop. The tests change one field of a parsed copy for those cases.

- [ ] **Step 1: Make the fixtures**

Run from the worktree root. It reads and writes each file as `latin1`, so every byte stays as it was. The QUGA gallery keeps its header block and the 4 image tables that have a saved image page (ids 3424, 24045, 66070, 121699). The PLHI gallery keeps the block up to the "no image" line. Each image page keeps the text from `<h2 class="tax_sn">` to the end of the Image Information section.

```bash
node -e "const fs=require('fs');const R='C:/Users/jdennen/AppData/Local/Temp/claude/C--Users-jdennen-Dendro/8b1c3373-46a9-4856-9724-c9fe26e0a80f/scratchpad/research/wildflower/';const D='pipeline/tests/fixtures/wildflower/';fs.mkdirSync(D,{recursive:true});const wrap=(s)=>'<html><body>\n'+s+'\n</body></html>\n';const g=fs.readFileSync(R+'quga-gallery.html','latin1');const a=g.indexOf('<div id=\"fullpage_content\">');const b=g.indexOf('<table border=\"0\"',a);const tables=[...g.matchAll(/<table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" style=\"float:left;\">[\s\S]*?<\/table>/g)].map((m)=>m[0]).filter((x)=>/id_image=(3424|24045|66070|121699)\"/.test(x));fs.writeFileSync(D+'quga_gallery.html',wrap(g.slice(a,b)+tables.join('\n\n')+'\n</div>'),'latin1');const p=fs.readFileSync(R+'plhi-gallery.html','latin1');const pa=p.indexOf('<div id=\"fullpage_content\">');const end='Sorry, no image for this plant</p>';const pb=p.indexOf(end)+end.length;fs.writeFileSync(D+'plhi_gallery.html',wrap(p.slice(pa,pb)+'\n</div>'),'latin1');for(const id of ['66070','3424','24045','121699']){const t=fs.readFileSync(R+'image-'+id+'.html','latin1');const s=t.indexOf('<h2 class=\"tax_sn\">');const i=t.indexOf('<h4>Image Information</h4>');const e=t.indexOf('</div>',i)+6;fs.writeFileSync(D+'image_'+id+'.html',wrap(t.slice(s,e)),'latin1')}console.log(tables.length,'tables');for(const f of fs.readdirSync(D))console.log(f,fs.statSync(D+f).size)"
```

Expected: `4 tables`, then six file names, each from 400 to 4000 bytes.

- [ ] **Step 2: Write the failing test**

Create `pipeline/tests/wildflower.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { SOURCE_NAMES } from '../lib/candidates.ts';
import type { BytesResult, Http, HttpFailure, TextResult } from '../lib/http.ts';
import { licenseAllowedAt } from '../lib/licenses.ts';
import {
  WILDFLOWER_LICENSE,
  WILDFLOWER_MAX_IMAGES,
  decodeWindows1252,
  parseWildflowerGallery,
  parseWildflowerImage,
  photographerName,
  wildflowerCandidate,
  wildflowerGalleryUrl,
  wildflowerImageUrl,
  wildflowerRows,
} from '../lib/wildflower.ts';

const NOW = '2026-09-25T12:00:00Z';
const QUGA_IDS = ['3424', '24045', '66070', '121699'];

function bytes(name: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(new URL(`./fixtures/wildflower/${name}`, import.meta.url)));
}

function page(name: string): string {
  return decodeWindows1252(bytes(name));
}

/**
 * An Http over a url-to-bytes map. `fallback` answers any other image page url. Every other
 * url fails with a 404. A text request is a bug, because getText decodes UTF-8.
 */
function fakeHttp(
  routes: Map<string, Uint8Array>,
  fallback: Uint8Array | null = null,
): Http & { urls: string[] } {
  const urls: string[] = [];
  const failures: HttpFailure[] = [];
  return {
    failures,
    urls,
    async getText(): Promise<TextResult> {
      throw new Error('wildflower reads pages as bytes');
    },
    async postJson(): Promise<TextResult> {
      throw new Error('wildflower never posts');
    },
    async getBytes(url: string): Promise<BytesResult> {
      urls.push(url);
      const found = routes.get(url) ?? (url.includes('/gallery/result.php?') ? fallback : null);
      if (found === null || found === undefined) {
        failures.push({ url, status: 404, message: 'status 404', at: NOW });
        return { ok: false, status: 404, bytes: null, fromCache: false, error: 'status 404' };
      }
      return { ok: true, status: 200, bytes: found, fromCache: false, error: null };
    },
  };
}

test('the urls use the PLANTS symbol and the image id', () => {
  assert.equal(
    wildflowerGalleryUrl('QUGA'),
    'https://www.wildflower.org/gallery/species.php?id_plant=QUGA',
  );
  assert.equal(
    wildflowerImageUrl('66070'),
    'https://www.wildflower.org/gallery/result.php?id_image=66070',
  );
});

test('decodeWindows1252 reads the bytes that UTF-8 breaks', () => {
  const raw = bytes('image_66070.html');
  assert.ok(decodeWindows1252(raw).includes('38°52'));
  assert.ok(
    !new TextDecoder('utf-8').decode(raw).includes('38°52'),
    'UTF-8 turns the 0xB0 byte into U+FFFD',
  );
});

test('parseWildflowerGallery lists the image ids in list order', () => {
  assert.deepEqual(parseWildflowerGallery(page('quga_gallery.html')), {
    ids: QUGA_IDS,
    empty: false,
  });
});

test('parseWildflowerGallery marks the no-image page', () => {
  assert.deepEqual(parseWildflowerGallery(page('plhi_gallery.html')), { ids: [], empty: true });
});

test('parseWildflowerImage reads the Image Information fields', () => {
  assert.deepEqual(parseWildflowerImage(page('image_66070.html')), {
    species: 'Quercus gambelii',
    photographer: 'Reveal, James L.',
    restrictions: 'Unrestricted',
    shot: 'Close-up of stem bearing leaves and a mature glans (acorn).',
    fileUrl: 'https://www.wildflower.org/image_archive/640x480/JLR/JLR_IMG8981.JPG',
  });
});

test('photographerName turns "Last, First" into "First Last"', () => {
  assert.equal(photographerName('Reveal, James L.'), 'James L. Reveal');
  assert.equal(photographerName('Wasowski, Sally and Andy'), 'Sally and Andy Wasowski');
  assert.equal(photographerName('Wildflower Center Staff'), 'Wildflower Center Staff');
});

test('wildflowerCandidate builds a row whose credit names the photographer and the Center', () => {
  const origin = wildflowerImageUrl('66070');
  const row = wildflowerCandidate(parseWildflowerImage(page('image_66070.html')), origin, 'QUGA', NOW);
  assert.ok(row !== null);
  assert.equal(row.target, 'QUGA');
  assert.equal(row.source_key, 'wildflower');
  assert.equal(row.source, SOURCE_NAMES.wildflower);
  assert.equal(row.origin, origin);
  assert.equal(row.file_url, 'https://www.wildflower.org/image_archive/640x480/JLR/JLR_IMG8981.JPG');
  assert.equal(row.author, 'James L. Reveal');
  assert.equal(row.license, WILDFLOWER_LICENSE);
  assert.equal(row.license_url, null);
  assert.equal(row.source_species, 'Quercus gambelii');
  assert.equal(row.channel_hint, 'leaf');
  assert.equal(row.fetched_at, NOW);
  // The app prints `<author>, <source>, <license>.` under the photo.
  assert.equal(
    `${row.author}, ${row.source}, ${row.license}.`,
    'James L. Reveal, Lady Bird Johnson Wildflower Center, used with permission, non-commercial.',
  );
  assert.equal(licenseAllowedAt(row.license, row.origin), true);
});

test('wildflowerCandidate skips a restricted image, a missing field, and another host', () => {
  const image = parseWildflowerImage(page('image_66070.html'));
  const origin = wildflowerImageUrl('66070');
  // Every saved page is Unrestricted, so each case changes one field of a parsed copy.
  assert.equal(wildflowerCandidate({ ...image, restrictions: 'Restricted' }, origin, 'QUGA', NOW), null);
  assert.equal(wildflowerCandidate({ ...image, restrictions: null }, origin, 'QUGA', NOW), null);
  assert.equal(wildflowerCandidate({ ...image, photographer: null }, origin, 'QUGA', NOW), null);
  assert.equal(wildflowerCandidate({ ...image, photographer: '  ' }, origin, 'QUGA', NOW), null);
  assert.equal(wildflowerCandidate({ ...image, fileUrl: null }, origin, 'QUGA', NOW), null);
  assert.equal(
    wildflowerCandidate(image, 'https://example.org/gallery/result.php?id_image=66070', 'QUGA', NOW),
    null,
    'the permission covers www.wildflower.org only',
  );
});

test('wildflowerRows reads the gallery and each image page as bytes', async () => {
  const routes = new Map<string, Uint8Array>([
    [wildflowerGalleryUrl('QUGA'), bytes('quga_gallery.html')],
  ]);
  for (const id of QUGA_IDS) routes.set(wildflowerImageUrl(id), bytes(`image_${id}.html`));
  const http = fakeHttp(routes);

  const rows = await wildflowerRows(http, 'QUGA', 'QUGA', NOW);

  assert.deepEqual(rows.map((row) => row.author), [
    'Norman G. Flaigg',
    'Sally and Andy Wasowski',
    'James L. Reveal',
    'Gene Sturla',
  ]);
  assert.deepEqual(rows.map((row) => row.origin), QUGA_IDS.map(wildflowerImageUrl));
  assert.deepEqual(http.urls, [wildflowerGalleryUrl('QUGA'), ...QUGA_IDS.map(wildflowerImageUrl)]);
  assert.deepEqual(http.failures, []);
});

test('wildflowerRows asks for no image page when the plant has no image', async () => {
  const http = fakeHttp(new Map([[wildflowerGalleryUrl('PLHI'), bytes('plhi_gallery.html')]]));
  assert.deepEqual(await wildflowerRows(http, 'PLHI', 'PLHI', NOW), []);
  assert.deepEqual(http.urls, [wildflowerGalleryUrl('PLHI')]);
});

test('wildflowerRows reads WILDFLOWER_MAX_IMAGES image pages at most, in list order', async () => {
  assert.equal(WILDFLOWER_MAX_IMAGES, 20);
  const ids = Array.from({ length: WILDFLOWER_MAX_IMAGES + 5 }, (_, index) => String(900000 + index));
  const links = ids.map((id) => `<a href="../gallery/result.php?id_image=${id}"></a>`).join('\n');
  const gallery = new TextEncoder().encode(`<div id="fullpage_content">\n${links}\n</div>`);
  const http = fakeHttp(new Map([[wildflowerGalleryUrl('QUGA'), gallery]]), bytes('image_66070.html'));

  const rows = await wildflowerRows(http, 'QUGA', 'QUGA', NOW);

  assert.equal(rows.length, WILDFLOWER_MAX_IMAGES);
  assert.deepEqual(
    http.urls,
    [wildflowerGalleryUrl('QUGA'), ...ids.slice(0, WILDFLOWER_MAX_IMAGES).map(wildflowerImageUrl)],
  );
});

test('wildflowerRows gives no rows when the gallery fetch fails', async () => {
  const http = fakeHttp(new Map());
  assert.deepEqual(await wildflowerRows(http, 'QUGA', 'QUGA', NOW), []);
  assert.equal(http.failures.length, 1);
});
```

- [ ] **Step 3: Run the test and see it fail**

Run: `node --test pipeline/tests/wildflower.test.ts`
Expected: FAIL with `Error [ERR_MODULE_NOT_FOUND]: Cannot find module` naming `pipeline/lib/wildflower.ts`.

- [ ] **Step 4: Write the module**

Create `pipeline/lib/wildflower.ts`:

```ts
import { channelHint, makeCandidate, type Candidate } from './candidates.ts';
import { htmlText } from './html.ts';
import type { Http } from './http.ts';
import { licenseAllowedAt } from './licenses.ts';

export const WILDFLOWER_BASE = 'https://www.wildflower.org';

/**
 * The image pages read for one symbol, at most, in list order. Each image costs one page
 * request for its credit, and the policy forbids bulk harvesting. QUGA lists 59 images.
 */
export const WILDFLOWER_MAX_IMAGES = 20;

/**
 * The licence text of every row. `licenseAllowedAt` accepts it for www.wildflower.org only
 * (owner ruling 2026-09-25, docs/decisions/2026-09-25-wildflower-permission.md).
 */
export const WILDFLOWER_LICENSE = 'used with permission, non-commercial';

/** The one value of the `Restrictions:` field that this source keeps. */
export const WILDFLOWER_UNRESTRICTED = 'Unrestricted';

const NO_IMAGE = 'Sorry, no image for this plant';
const CONTENT = 'id="fullpage_content"';
const INFORMATION = '<h4>Image Information</h4>';

/** The gallery list of one PLANTS symbol. The site keys plants by PLANTS symbol. */
export function wildflowerGalleryUrl(symbol: string): string {
  return `${WILDFLOWER_BASE}/gallery/species.php?id_plant=${encodeURIComponent(symbol)}`;
}

/** The page of one image. Each image has its own page, so the origin needs no fragment. */
export function wildflowerImageUrl(id: string): string {
  return `${WILDFLOWER_BASE}/gallery/result.php?id_image=${encodeURIComponent(id)}`;
}

/**
 * The pages say iso-8859-1, and browsers read that label as windows-1252, so this does too.
 * `Http.getText` would read the bytes as UTF-8 and break each byte above 0x7F.
 */
export function decodeWindows1252(bytes: Uint8Array): string {
  return new TextDecoder('windows-1252').decode(bytes);
}

export interface WildflowerGallery {
  /** The image ids, in list order, each once. */
  ids: string[];
  /** True on the page that says the plant has no image. That page answers HTTP 200. */
  empty: boolean;
}

export function parseWildflowerGallery(html: string): WildflowerGallery {
  const start = html.indexOf(CONTENT);
  const body = start === -1 ? html : html.slice(start);
  const ids: string[] = [];
  for (const match of body.matchAll(/result\.php\?id_image=(\d+)/g)) {
    if (!ids.includes(match[1])) ids.push(match[1]);
  }
  return { ids, empty: body.includes(NO_IMAGE) };
}

export interface WildflowerImage {
  /** The species name in `<h2 class="tax_sn">`. */
  species: string | null;
  /** `Photographer:` as the page writes it, `Last, First`. */
  photographer: string | null;
  restrictions: string | null;
  shot: string | null;
  /** The 640x480 file, the largest public size. */
  fileUrl: string | null;
}

/**
 * The `Label: value` lines of the Image Information section. The search form above it also
 * says `Photographer:`, so the scan starts at the section heading.
 */
function imageFields(html: string): Record<string, string> {
  const start = html.indexOf(INFORMATION);
  if (start === -1) return {};
  const from = start + INFORMATION.length;
  const end = html.indexOf('</div>', from);
  const section = html.slice(from, end === -1 ? html.length : end);
  const fields: Record<string, string> = {};
  for (const part of section.split(/<br\s*\/?>/i)) {
    const line = /^([A-Za-z ]+):\s*(.*)$/.exec(htmlText(part));
    if (line !== null && fields[line[1]] === undefined) fields[line[1]] = line[2].trim();
  }
  return fields;
}

export function parseWildflowerImage(html: string): WildflowerImage {
  const heading = /<h2 class="tax_sn">([\s\S]*?)<\/h2>/i.exec(html);
  const species = heading === null ? '' : htmlText(heading[1]);
  const fields = imageFields(html);
  const image = /<img\s+src="(\/image_archive\/640x480\/[^"]+)"/i.exec(html);
  return {
    species: species === '' ? null : species,
    photographer: fields.Photographer ?? null,
    restrictions: fields.Restrictions ?? null,
    shot: fields.Shot ?? null,
    fileUrl: image === null ? null : new URL(image[1], WILDFLOWER_BASE).href,
  };
}

/** `Last, First` as `First Last`. It splits at the first `, `. A name with no comma stays. */
export function photographerName(text: string): string {
  const at = text.indexOf(', ');
  if (at === -1) return text.trim();
  return `${text.slice(at + 2).trim()} ${text.slice(0, at).trim()}`.trim();
}

/**
 * One row, or null. Only an `Unrestricted` image with a photographer and a file is kept. The
 * app prints `<First Last>, Lady Bird Johnson Wildflower Center, used with permission,
 * non-commercial.`, which names the photographer and the Center, as the policy asks.
 */
export function wildflowerCandidate(
  image: WildflowerImage,
  origin: string,
  target: string,
  now: string,
): Candidate | null {
  if (image.restrictions !== WILDFLOWER_UNRESTRICTED) return null;
  if (image.fileUrl === null) return null;
  const photographer = (image.photographer ?? '').trim();
  if (photographer === '') return null;
  // The permission covers one host. The same check as `photos add` keeps the rule in one place.
  if (!licenseAllowedAt(WILDFLOWER_LICENSE, origin)) return null;
  return makeCandidate({
    target,
    source_key: 'wildflower',
    origin,
    file_url: image.fileUrl,
    author: photographerName(photographer),
    license: WILDFLOWER_LICENSE,
    license_url: null,
    source_species: image.species,
    channel_hint: image.shot === null ? null : channelHint(image.shot),
    fetched_at: now,
  });
}

/** The wildflower.org rows of one PLANTS symbol. */
export async function wildflowerRows(
  http: Http,
  symbol: string,
  target: string,
  now: string,
): Promise<Candidate[]> {
  // getBytes, not getText: see decodeWindows1252. getBytes also keeps each page with no
  // expiry, and the policy asks an app not to ask for a page again.
  const list = await http.getBytes(wildflowerGalleryUrl(symbol));
  if (!list.ok || list.bytes === null) return [];
  const gallery = parseWildflowerGallery(decodeWindows1252(list.bytes));
  if (gallery.empty) return [];
  const rows: Candidate[] = [];
  for (const id of gallery.ids.slice(0, WILDFLOWER_MAX_IMAGES)) {
    const origin = wildflowerImageUrl(id);
    const page = await http.getBytes(origin);
    if (!page.ok || page.bytes === null) continue;
    const row = wildflowerCandidate(
      parseWildflowerImage(decodeWindows1252(page.bytes)),
      origin,
      target,
      now,
    );
    if (row !== null) rows.push(row);
  }
  return rows;
}
```

- [ ] **Step 5: Run the test and see it pass**

Run: `node --test pipeline/tests/wildflower.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 6: Run the pipeline suite**

Run: `npm run test:pipeline`
Expected: PASS, 367 + 12 = 379 tests (this worktree does not hold Tasks 2 and 3).

- [ ] **Step 7: Commit**

```bash
git add pipeline/lib/wildflower.ts pipeline/tests/wildflower.test.ts pipeline/tests/fixtures/wildflower/quga_gallery.html pipeline/tests/fixtures/wildflower/plhi_gallery.html pipeline/tests/fixtures/wildflower/image_66070.html pipeline/tests/fixtures/wildflower/image_3424.html pipeline/tests/fixtures/wildflower/image_24045.html pipeline/tests/fixtures/wildflower/image_121699.html
git commit -m "feat: add the wildflower.org fetch source" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Move the harvest scripts into the repo

Runs in its own worktree (`sources-t5`), after Task 1. Touch no file outside this list.

**Files:**
- Create: `pipeline/scripts/harvest.cjs` (a copy of the scratchpad file, then the edits below)
- Create: `pipeline/scripts/mkadds.cjs` (written in full below)
- Test: `pipeline/tests/scripts.test.ts`

Source files (read both in full before you start):
- `C:\Users\jdennen\AppData\Local\Temp\claude\C--Users-jdennen-Dendro\47d831d0-7437-43fb-a506-be8bf7e864e0\scratchpad\harvest.cjs` (556 lines)
- `C:\Users\jdennen\AppData\Local\Temp\claude\C--Users-jdennen-Dendro\47d831d0-7437-43fb-a506-be8bf7e864e0\scratchpad\mkadds.cjs` (55 lines)

**Interfaces:**
- Consumes: nothing from other tasks. Both scripts use Node built-ins only.
- Produces:
  - `pipeline/scripts/harvest.cjs`: `module.exports = { parseArgs, candidatesPath, cleanCredit, shellSafe, decodeEntities, readPsv, budgetFor }`, where `parseArgs(argv: string[]): { rows: string; run: string; outDir: string }` throws an `Error` whose message is the usage line, `candidatesPath(run: string): string`, `cleanCredit(s: unknown): string`, `shellSafe(s: unknown): string`. `main()` runs only when Node starts the file.
  - `pipeline/scripts/mkadds.cjs`: `module.exports = { parseArgs, clean, buildCommand, MAX_LINE_BYTES }`, where `parseArgs(argv: string[]): { run: string; input: string; output: string }` throws with the usage line, `buildCommand(row: AddRow, run: string): { line: string; problems: string[] }`, `MAX_LINE_BYTES = 1500`. `main()` runs only when Node starts the file.
  - **The add row** (the one input shape of `mkadds.cjs`; Task 6 writes it too):

    ```ts
    interface AddRow {
      target: string;                 // the run target: a PLANTS symbol or a concept key
      origin: string;                 // the page that holds the image
      file_url: string;               // the image file
      author: string;                 // the credit, as the app prints it
      license: string;                // the licence text, as the app prints it
      license_url: string | null;     // null leaves --license-url out
      source: string;                 // the display name of the source
      source_species: string | null;  // null leaves --source-species out
      channel_hint: string | null;    // null leaves --channel-hint out
    }
    ```

    A row may carry more fields (`harvest.cjs` rows also carry `local`, `caption`, `channel`, `symbol`, `sci`). `mkadds.cjs` reads only the nine above.

- [ ] **Step 1: Write the failing test**

Create `pipeline/tests/scripts.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HARVEST = path.join(REPO_ROOT, 'pipeline', 'scripts', 'harvest.cjs');
const MKADDS = path.join(REPO_ROOT, 'pipeline', 'scripts', 'mkadds.cjs');

interface AddRow {
  target: string;
  origin: string;
  file_url: string;
  author: string;
  license: string;
  license_url: string | null;
  source: string;
  source_species: string | null;
  channel_hint: string | null;
}

const harvest = require(HARVEST) as {
  cleanCredit: (s: unknown) => string;
  shellSafe: (s: unknown) => string;
  parseArgs: (argv: string[]) => { rows: string; run: string; outDir: string };
  candidatesPath: (run: string) => string;
};
const mkadds = require(MKADDS) as {
  buildCommand: (row: AddRow, run: string) => { line: string; problems: string[] };
  parseArgs: (argv: string[]) => { run: string; input: string; output: string };
  MAX_LINE_BYTES: number;
};

const POWO_ORIGIN =
  'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:685854-1/images#image=4abe7780b45861c2b02ab90e585c6fb2';

const POWO_ROW: AddRow = {
  target: 'PLHI',
  origin: POWO_ORIGIN,
  file_url: 'https://d2seqvvyy3b8p2.cloudfront.net/4abe7780b45861c2b02ab90e585c6fb2.jpg',
  author: "Dr Henry Oakeley's RCP Medicinal Plants",
  license: '© RBG Kew, CC BY 3.0',
  license_url: 'https://creativecommons.org/licenses/by/3.0/',
  source: 'Plants of the World Online (Kew)',
  source_species: 'Platanus × hispanica',
  channel_hint: null,
};

test('cleanCredit keeps letters in every script', () => {
  assert.equal(harvest.cleanCredit('Jiří Dvořák'), 'Jiří Dvořák');
  assert.equal(harvest.cleanCredit('José Ñúñez'), 'José Ñúñez');
  assert.equal(harvest.cleanCredit('Egon Krogsgaard©'), 'Egon Krogsgaard©');
});

test('cleanCredit composes the text to NFC', () => {
  assert.equal(harvest.cleanCredit('Jose\u0301'), 'Jos\u00e9');
});

test('cleanCredit strips control characters and collapses white space', () => {
  assert.equal(harvest.cleanCredit('  Steven\tJ.\n Baskauf \u0007 '), 'Steven J. Baskauf');
  assert.equal(harvest.cleanCredit('A\u0000B'), 'AB');
  assert.equal(harvest.cleanCredit(null), '');
});

test('shellSafe still strips the characters a double-quoted shell value cannot hold', () => {
  assert.equal(harvest.shellSafe('A "B" `C` $D !E \\F'), 'A B C D E F');
});

test('harvest.cjs needs --rows, --run, and --out-dir', () => {
  assert.deepEqual(harvest.parseArgs(['--rows', 'r.json', '--run', 'demo', '--out-dir', 'C:/tmp/h']), {
    rows: 'r.json',
    run: 'demo',
    outDir: 'C:/tmp/h',
  });
  assert.throws(
    () => harvest.parseArgs(['--rows', 'r.json', '--run', 'demo']),
    /usage: node pipeline\/scripts\/harvest\.cjs --rows <file> --run <name> --out-dir <dir>/,
  );
  assert.throws(() => harvest.parseArgs(['--rows', '--run', 'demo', '--out-dir', 'x']), /usage/);
});

test('harvest.cjs finds the candidates file from the repo root', () => {
  assert.equal(
    harvest.candidatesPath('demo'),
    path.join(REPO_ROOT, 'pipeline', 'runs', 'demo', 'candidates.jsonl'),
  );
});

test('harvest.cjs started with no flag prints the usage line and exits 1', () => {
  const result = spawnSync(process.execPath, [HARVEST], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /usage: node pipeline\/scripts\/harvest\.cjs/);
});

test('buildCommand writes one photos add line and leaves out a null flag', () => {
  const built = mkadds.buildCommand(POWO_ROW, 'plhi_scratch');
  assert.equal(
    built.line,
    'node pipeline/cli.ts photos add plhi_scratch --target PLHI'
      + ` --origin "${POWO_ORIGIN}"`
      + ' --file-url "https://d2seqvvyy3b8p2.cloudfront.net/4abe7780b45861c2b02ab90e585c6fb2.jpg"'
      + ` --author "Dr Henry Oakeley's RCP Medicinal Plants"`
      + ' --license "© RBG Kew, CC BY 3.0"'
      + ' --license-url "https://creativecommons.org/licenses/by/3.0/"'
      + ' --source "Plants of the World Online (Kew)"'
      + ' --source-species "Platanus × hispanica"',
  );
  assert.deepEqual(built.problems, [], 'a letter outside ASCII is not a problem');
});

test('buildCommand flags a control character and a long line', () => {
  assert.deepEqual(mkadds.buildCommand({ ...POWO_ROW, author: 'A\u0007B' }, 'r').problems, [
    `PLHI ${POWO_ORIGIN}: control character`,
  ]);
  const long = mkadds.buildCommand({ ...POWO_ROW, author: 'x'.repeat(mkadds.MAX_LINE_BYTES) }, 'r');
  assert.deepEqual(long.problems, [`PLHI ${POWO_ORIGIN}: line too long`]);
});

test('buildCommand adds the file name fragment to a Trees and Shrubs Online article', () => {
  const row: AddRow = {
    target: 'QUGA',
    origin: 'https://www.treesandshrubsonline.org/articles/quercus/quercus-gambelii/',
    file_url: 'https://www.treesandshrubsonline.org/site/assets/files/7054/quercus-gambelii-4.jpg',
    author: 'Charles Snyers',
    license: 'CC BY-SA 4.0',
    license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    source: 'Trees and Shrubs Online',
    source_species: 'Quercus gambelii',
    channel_hint: 'bark',
  };
  const { line } = mkadds.buildCommand(row, 'r');
  assert.ok(
    line.includes(
      '--origin "https://www.treesandshrubsonline.org/articles/quercus/quercus-gambelii/#image=quercus-gambelii-4.jpg"',
    ),
  );
  assert.ok(line.endsWith('--source-species "Quercus gambelii" --channel-hint bark'));
});

test('mkadds.cjs needs --run, --in, and --out', () => {
  assert.deepEqual(mkadds.parseArgs(['--run', 'r', '--in', 'a.json', '--out', 'b.sh']), {
    run: 'r',
    input: 'a.json',
    output: 'b.sh',
  });
  assert.throws(
    () => mkadds.parseArgs(['--run', 'r', '--in', 'a.json']),
    /usage: node pipeline\/scripts\/mkadds\.cjs --run <name> --in <rows\.json> --out <adds\.sh>/,
  );
});

test('mkadds.cjs started by Node writes the command file', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dendro-mkadds-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const input = path.join(dir, 'rows.json');
  const output = path.join(dir, 'adds.sh');
  fs.writeFileSync(input, JSON.stringify([POWO_ROW]), 'utf8');

  const result = spawnSync(
    process.execPath,
    [MKADDS, '--run', 'plhi_scratch', '--in', input, '--out', output],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /lines: 1/);
  assert.match(result.stdout, /problems: none/);
  assert.equal(
    fs.readFileSync(output, 'utf8'),
    `${mkadds.buildCommand(POWO_ROW, 'plhi_scratch').line}\n`,
  );
});
```

- [ ] **Step 2: Run the test and see it fail**

Run: `node --test pipeline/tests/scripts.test.ts`
Expected: FAIL with `Error: Cannot find module` naming `pipeline/scripts/harvest.cjs`.

- [ ] **Step 3: Copy `harvest.cjs` into the repo**

```bash
mkdir -p pipeline/scripts && cp "C:/Users/jdennen/AppData/Local/Temp/claude/C--Users-jdennen-Dendro/47d831d0-7437-43fb-a506-be8bf7e864e0/scratchpad/harvest.cjs" pipeline/scripts/harvest.cjs && wc -l pipeline/scripts/harvest.cjs
```

Expected: `556 pipeline/scripts/harvest.cjs`.

- [ ] **Step 4: Edit `harvest.cjs`**

Make these twelve edits with the Edit tool, in this order. Line numbers are those of the copied file before any edit.

**Edit 1.** Replace the header comment (lines 1-19) with:

```js
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
```

**Edit 2.** Delete the gap rows block (lines 25-44): the line `// ---------------------------------------------------------------- gap rows`, the blank line after it, the whole `const GAP_ROWS = [ ... ];` array, and the blank line after `];`.

**Edit 3.** Replace the settings block (lines 45-56), from `// -------------------------------------------------------------- settings` through the line `const CANDIDATES = \`C:/Users/jdennen/Dendro/pipeline/runs/${RUN}/candidates.jsonl\`;`, with:

```js
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
```

**Edit 4.** Replace the block from `const TRANSLIT = {` (line 171) through the closing `}` of `function toAscii(s, what)` (line 196) with:

```js
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
```

**Edit 5.** In `bioHarvest`, replace `      sci, channel: chan, view,` with `      sci, channel: chan, channel_hint: chan, view,`.

**Edit 6.** In `tsoHarvest`, replace the line `        channel: row.channel,` with these two lines:

```js
        channel: row.channel,
        channel_hint: row.channel,
```

**Edit 7.** Replace the start of `main()`:

```js
function main() {
  const argv = process.argv.slice(2);
  let rows = GAP_ROWS;
  const ri = argv.indexOf('--rows');
  if (ri !== -1 && argv[ri + 1]) {
    rows = JSON.parse(fs.readFileSync(argv[ri + 1], 'utf8'));
  }
```

with:

```js
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
```

**Edit 8.** Replace ``    c.author = toAscii(shellSafe(c.author), `author for ${key}`);`` with `    c.author = cleanCredit(shellSafe(c.author));`.

**Edit 9.** Replace `  fs.writeFileSync(path.join(HERE, 'harvest-rows.json'), JSON.stringify(kept, null, 1));` with `  fs.writeFileSync(path.join(OUT_DIR, 'harvest-rows.json'), JSON.stringify(kept, null, 1));`.

**Edit 10.** Replace these five lines at the end of the report:

```js
  L.push('## Author strings changed to ASCII');
  L.push('');
  L.push(translitLog.length ? translitLog.map((x) => `- ${x}`).join('\n') : '- none');
  L.push('');
  fs.writeFileSync(path.join(HERE, 'harvest-report.md'), L.join('\n'));
```

with:

```js
  fs.writeFileSync(path.join(OUT_DIR, 'harvest-report.md'), L.join('\n'));
```

**Edit 11.** In `SITE_NOTES`, the notes on two sites no longer hold after the owner rulings of 2026-09-25.
- Replace the paragraph that starts `**Lady Bird Johnson Wildflower Center** - not admitted.` (six lines, up to the blank line before `**Virginia Tech dendrology fact sheets**`) with:

  ```
  **Lady Bird Johnson Wildflower Center** - not harvested here.
  The site allows non-commercial use only. The owner has written permission for Dendro
  (docs/decisions/2026-09-25-wildflower-permission.md), and `photos fetch` reads the
  gallery as a fetch source. This harvester does not ask the site.
  ```

- Replace the paragraph that starts `**Kew POWO** - not reached.` (three lines, up to the closing backtick of `SITE_NOTES`) with:

  ```
  **Kew POWO** - not harvested here.
  Kew returns a Cloudflare challenge to scripts. An agent collects POWO photos in the
  built-in browser with the powo-harvest skill (.claude/skills/powo-harvest/SKILL.md).
  ```

  Inside the template literal, write each backtick in the new text as `` \` `` so the literal does not end early.

**Edit 12.** Replace the last line of the file, `main();`, with:

```js
module.exports = { parseArgs, candidatesPath, cleanCredit, shellSafe, decodeEntities, readPsv, budgetFor };

// The tests load this file with createRequire, so main() runs only when Node starts it.
if (require.main === module) main();
```

Then check that no old name is left:

```bash
grep -n "GAP_ROWS\|HERE\|toAscii\|translitLog\|TRANSLIT\|C:/Users" pipeline/scripts/harvest.cjs
```

Expected: no output.

- [ ] **Step 5: Write `mkadds.cjs`**

Create `pipeline/scripts/mkadds.cjs` with this content. It replaces the scratchpad version: every path is a flag, `SPECIES_OVERRIDE` is gone, and only control characters are flagged.

```js
// Write the `photos add` commands for the images kept after the viewing step.
//
// Usage: node pipeline/scripts/mkadds.cjs --run <name> --in <rows.json> --out <adds.sh>
//
// Each row in --in has this shape. harvest.cjs and pipeline/scripts/powo-rows.ts write it.
//   target          the run target: a PLANTS symbol or a concept key
//   origin          the page that holds the image
//   file_url        the image file
//   author          the credit, as the app prints it
//   license         the licence text, as the app prints it
//   license_url     the licence url, or null
//   source          the display name of the source
//   source_species  the species that the source page names, or null
//   channel_hint    a channel, or null
// This script reads no other field. A row carries its own source_species.
//
// Put --out outside the repo, for example in the session scratchpad. The CLI commits with
// `git add -A`, so a file inside the repo reaches a commit.
const fs = require('fs');
const path = require('path');

const USAGE = 'usage: node pipeline/scripts/mkadds.cjs --run <name> --in <rows.json> --out <adds.sh>';

// A longer command line may not survive the Windows command-line limit.
const MAX_LINE_BYTES = 1500;

/** Reads the three required flags. It throws an Error with the usage line when one is missing. */
function parseArgs(argv) {
  const value = (flag) => {
    const at = argv.indexOf(flag);
    const next = at === -1 ? undefined : argv[at + 1];
    return next === undefined || next.startsWith('--') ? null : next;
  };
  const run = value('--run');
  const input = value('--in');
  const output = value('--out');
  if (run === null || input === null || output === null) throw new Error(USAGE);
  return { run, input, output };
}

// Values go inside double quotes in a shell command, so these characters are not allowed through.
function clean(s) {
  return String(s).replace(/["`$!\\]/g, '').replace(/\s+/g, ' ').trim();
}

function present(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

/**
 * One `photos add` command for one row, and the problems of that command. An optional flag
 * whose value is null or empty is left out.
 */
function buildCommand(row, run) {
  let origin = row.origin;
  // The candidate id is sha1(target|origin). Two photos from one Trees and Shrubs Online
  // article share the article url, so the origin carries the image file name as a fragment
  // (run 1 follow-up, 2026-09-24).
  if (/treesandshrubsonline\.org/.test(origin) && !origin.includes('#')) {
    origin = `${origin}#image=${path.posix.basename(row.file_url)}`;
  }
  const parts = [
    `node pipeline/cli.ts photos add ${run}`,
    `--target ${row.target}`,
    `--origin "${clean(origin)}"`,
    `--file-url "${clean(row.file_url)}"`,
    `--author "${clean(row.author)}"`,
    `--license "${clean(row.license)}"`,
  ];
  if (present(row.license_url)) parts.push(`--license-url "${clean(row.license_url)}"`);
  parts.push(`--source "${clean(row.source)}"`);
  if (present(row.source_species)) parts.push(`--source-species "${clean(row.source_species)}"`);
  if (present(row.channel_hint)) parts.push(`--channel-hint ${clean(row.channel_hint)}`);
  const line = parts.join(' ');
  const label = `${row.target} ${origin}`;
  const problems = [];
  if (Buffer.byteLength(line) >= MAX_LINE_BYTES) problems.push(`${label}: line too long`);
  // A letter in any script is fine. A control character is not.
  if (/\p{Cc}/u.test(line)) problems.push(`${label}: control character`);
  return { line, problems };
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
    return;
  }
  const rows = JSON.parse(fs.readFileSync(args.input, 'utf8'));
  const lines = [];
  const problems = [];
  for (const row of rows) {
    const built = buildCommand(row, args.run);
    lines.push(built.line);
    problems.push(...built.problems);
  }
  fs.writeFileSync(args.output, lines.join('\n') + '\n');
  console.log('lines:', lines.length);
  console.log('max bytes:', lines.length === 0 ? 0 : Math.max(...lines.map((l) => Buffer.byteLength(l))));
  console.log('problems:', problems.length ? problems.join('; ') : 'none');
  if (problems.length > 0) process.exitCode = 1;
}

module.exports = { parseArgs, clean, buildCommand, MAX_LINE_BYTES };

// The tests load this file with createRequire, so main() runs only when Node starts it.
if (require.main === module) main();
```

- [ ] **Step 6: Run the test and see it pass**

Run: `node --test pipeline/tests/scripts.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 7: Check that `harvest.cjs` still parses as a whole**

Run: `node --check pipeline/scripts/harvest.cjs && node --check pipeline/scripts/mkadds.cjs && echo ok`
Expected: `ok`.

- [ ] **Step 8: Run the pipeline suite**

Run: `npm run test:pipeline`
Expected: PASS, 367 + 12 = 379 tests (this worktree does not hold Tasks 2 to 4).

- [ ] **Step 9: Commit**

```bash
git add pipeline/scripts/harvest.cjs pipeline/scripts/mkadds.cjs pipeline/tests/scripts.test.ts
git commit -m "feat: move harvest.cjs and mkadds.cjs into pipeline/scripts with flags for every path" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Kew POWO parser, script, and skill

Runs in its own worktree (`sources-t6`), after Task 1. Touch no file outside this list.

**Files:**
- Create: `pipeline/lib/powo.ts`
- Create: `pipeline/scripts/powo-rows.ts`
- Create: `.claude/skills/powo-harvest/SKILL.md`
- Create: `pipeline/tests/fixtures/powo/platanus_x_hispanica_images.html`
- Test: `pipeline/tests/powo.test.ts`

**Interfaces:**
- Consumes: `channelHint(text: string): string | null` and `licenseAllowed(text: string): boolean` from `pipeline/lib/candidates.ts`; `decodeEntities`, `htmlText`, `openTags` from `pipeline/lib/html.ts` (Task 1); `licenseLabelFromUrl(url: string | null): string | null` and `normalizeLicenseUrl(url: string | null): string | null` from `pipeline/lib/licenses.ts` (Task 1); `parseFlags(argv: string[]): Record<string, string>` from `pipeline/lib/run.ts`; `captureConsole(t)` from `pipeline/tests/helpers.ts`.
- Produces (exported from `pipeline/lib/powo.ts`):
  - `POWO_SOURCE = 'Plants of the World Online (Kew)'`
  - **The add row**, the one input shape of `pipeline/scripts/mkadds.cjs` (Task 5 reads it):

    ```ts
    export interface AddRow {
      target: string;                 // the run target: a PLANTS symbol or a concept key
      origin: string;                 // the page that holds the image
      file_url: string;               // the image file
      author: string;                 // the credit, as the app prints it
      license: string;                // the licence text, as the app prints it
      license_url: string | null;     // null leaves --license-url out
      source: string;                 // the display name of the source
      source_species: string | null;  // null leaves --source-species out
      channel_hint: string | null;    // null leaves --channel-hint out
    }
    ```

  - `type PowoSkip = 'herbarium' | 'no_license' | 'license_not_allowed' | 'no_credit' | 'no_file'`
  - `interface PowoAnchor { href: string; caption: string }` (the caption with its references decoded once, so it is an HTML fragment)
  - `interface PowoResult { rows: AddRow[]; skipped: Record<PowoSkip, number> }`
  - `powoAnchors(html: string): PowoAnchor[]`
  - `powoRow(anchor: PowoAnchor, pageUrl: string, target: string): AddRow | PowoSkip`
  - `parsePowoImages(html: string, pageUrl: string, target: string): PowoResult`
- Produces (exported from `pipeline/scripts/powo-rows.ts`): `powoRowsMain(argv: string[]): number`. Run as `node pipeline/scripts/powo-rows.ts --html <file> --page-url <url> --target <SYMBOL> --out <rows.json>`.

Facts from the saved gallery (`$RESEARCH/kew/all-images-section.html`, 15,815 bytes, captured 2026-09-25 in the built-in browser; `$RESEARCH/kew/images-685854-1.json` holds the expected verdict per image):
- Each image is `<a href="//d2seqvvyy3b8p2.cloudfront.net/<32 hex>.jpg" role="button" data-caption="…">` inside `section#all-images`. The `href` is the 1,600 px full-size file.
- The caption is entity-escaped: `<title>\n&lt;br&gt;ID:<n> <licence text>&lt;small&gt;<credit>&lt;/small&gt;`. After one decode it reads `<title>\n<br>ID:<n> <licence text><small><credit></small>`.
- The licence URL is plain text, not a link: `ID:14124 © RBG Kew https://creativecommons.org/licenses/by/3.0/`.
- A `<small>` can start with a name link: `<a …><em>Platanus</em> × <em>acerifolia</em></a> | Dr Henry Oakeley's RCP Medicinal Plants`. The credit is the text after the last ` | `.
- Of 23 images: 14 photos say `Not Kew Copyright. Only licensed for display purposes in POWO.` (no licence URL), 7 are herbarium sheets (a `K00…` barcode, no `ID:`), and 2 photos (ID 14124 and ID 14123) are CC BY 3.0.

- [ ] **Step 1: Copy the fixture**

The saved file is already a trimmed copy (the gallery section and the Sources list). Keep all 23 anchors, because the 2-of-23 check needs every one.

```bash
mkdir -p pipeline/tests/fixtures/powo && cp "C:/Users/jdennen/AppData/Local/Temp/claude/C--Users-jdennen-Dendro/8b1c3373-46a9-4856-9724-c9fe26e0a80f/scratchpad/research/kew/all-images-section.html" pipeline/tests/fixtures/powo/platanus_x_hispanica_images.html && wc -c pipeline/tests/fixtures/powo/platanus_x_hispanica_images.html
```

Expected: `15815 pipeline/tests/fixtures/powo/platanus_x_hispanica_images.html`.

- [ ] **Step 2: Write the failing test**

Create `pipeline/tests/powo.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  POWO_SOURCE,
  parsePowoImages,
  powoAnchors,
  powoRow,
  type PowoAnchor,
} from '../lib/powo.ts';
import { powoRowsMain } from '../scripts/powo-rows.ts';
import { captureConsole } from './helpers.ts';

const HTML = fs.readFileSync(
  new URL('./fixtures/powo/platanus_x_hispanica_images.html', import.meta.url),
  'utf8',
);
const PAGE = 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:685854-1/images';
const HASH = '0123456789abcdef0123456789abcdef';
const CDN = 'https://d2seqvvyy3b8p2.cloudfront.net';

function anchor(caption: string, href = `//d2seqvvyy3b8p2.cloudfront.net/${HASH}.jpg`): PowoAnchor {
  return { href, caption };
}

test('powoAnchors reads the 23 gallery anchors and decodes each caption once', () => {
  const anchors = powoAnchors(HTML);
  assert.equal(anchors.length, 23);
  assert.equal(anchors[15].href, '//d2seqvvyy3b8p2.cloudfront.net/4abe7780b45861c2b02ab90e585c6fb2.jpg');
  assert.ok(
    anchors[15].caption.includes(
      '<br>ID:14124 © RBG Kew https://creativecommons.org/licenses/by/3.0/<small>',
    ),
  );
});

test('powoAnchors reads only section#all-images when the page holds it', () => {
  const html =
    '<div class="taxon-header"><a href="//x/aaaa.jpg" data-caption="header copy"></a></div>'
    + '<section id="all-images" class="taxon-section">'
    + '<a href="//x/bbbb.jpg" data-caption="A &amp; B"></a></section>';
  assert.deepEqual(powoAnchors(html), [{ href: '//x/bbbb.jpg', caption: 'A & B' }]);
});

test('parsePowoImages keeps the two CC BY photos of the London plane page', () => {
  const result = parsePowoImages(HTML, PAGE, 'PLHI');
  assert.deepEqual(result.skipped, {
    herbarium: 7,
    no_license: 14,
    license_not_allowed: 0,
    no_credit: 0,
    no_file: 0,
  });
  assert.deepEqual(result.rows, [
    {
      target: 'PLHI',
      origin: `${PAGE}#image=4abe7780b45861c2b02ab90e585c6fb2`,
      file_url: `${CDN}/4abe7780b45861c2b02ab90e585c6fb2.jpg`,
      author: "Dr Henry Oakeley's RCP Medicinal Plants",
      license: '© RBG Kew, CC BY 3.0',
      license_url: 'https://creativecommons.org/licenses/by/3.0/',
      source: POWO_SOURCE,
      source_species: 'Platanus × hispanica',
      channel_hint: null,
    },
    {
      target: 'PLHI',
      origin: `${PAGE}#image=ca062eef7e1a0148010da8f6d90eb0bd`,
      file_url: `${CDN}/ca062eef7e1a0148010da8f6d90eb0bd.jpg`,
      author: "Dr Henry Oakeley's RCP Medicinal Plants",
      license: '© RBG Kew, CC BY 3.0',
      license_url: 'https://creativecommons.org/licenses/by/3.0/',
      source: POWO_SOURCE,
      source_species: 'Platanus × acerifolia',
      channel_hint: null,
    },
  ]);
  assert.equal(POWO_SOURCE, 'Plants of the World Online (Kew)');
});

test('powoRow skips a caption with no ID as a herbarium sheet', () => {
  const sheet = anchor(
    'A specimen from Kew\'s Herbarium - <a href="https://specimens.kew.org/herbarium/K001527212">K001527212</a><small>Herbarium, RBG Kew</small>',
  );
  assert.equal(powoRow(sheet, PAGE, 'PLHI'), 'herbarium');
});

test('powoRow skips a display-only licence and an NC licence', () => {
  const display = anchor(
    'Platanus x hispanica - Park\n<br>ID:1279696 Not Kew Copyright. Only licensed for display purposes in POWO.<small>Igor Sheremetyev ©</small>',
  );
  assert.equal(powoRow(display, PAGE, 'PLHI'), 'no_license');
  const nc = anchor(
    'Platanus × hispanica - Park\n<br>ID:1 © A Person https://creativecommons.org/licenses/by-nc/3.0/<small>A Person</small>',
  );
  assert.equal(powoRow(nc, PAGE, 'PLHI'), 'license_not_allowed');
});

test('powoRow skips a photo with no credit or with no file hash', () => {
  const caption = 'Platanus × hispanica - Park\n<br>ID:1 © RBG Kew https://creativecommons.org/licenses/by/3.0/';
  assert.equal(powoRow(anchor(caption), PAGE, 'PLHI'), 'no_credit');
  assert.equal(
    powoRow(anchor(`${caption}<small>A Person</small>`, '//d2seqvvyy3b8p2.cloudfront.net/photo.jpg'), PAGE, 'PLHI'),
    'no_file',
  );
});

test('powoRow writes the label alone when the caption names no holder', () => {
  const row = powoRow(
    anchor('Platanus × hispanica - Leaves\n<br>ID:7 https://creativecommons.org/licenses/by-sa/4.0/<small>A Person</small>'),
    PAGE,
    'PLHI',
  );
  assert.ok(typeof row !== 'string');
  assert.equal(row.license, 'CC BY-SA 4.0');
  assert.equal(row.license_url, 'https://creativecommons.org/licenses/by-sa/4.0/');
  assert.equal(row.author, 'A Person');
  assert.equal(row.channel_hint, 'leaf');
  assert.equal(row.origin, `${PAGE}#image=${HASH}`);
  assert.equal(row.file_url, `${CDN}/${HASH}.jpg`);
});

test('parsePowoImages gives no rows for a page with no gallery', () => {
  const result = parsePowoImages('<html><body>No images</body></html>', PAGE, 'PLHI');
  assert.deepEqual(result.rows, []);
  assert.deepEqual(Object.values(result.skipped), [0, 0, 0, 0, 0]);
});

test('powo-rows.ts writes the rows file that mkadds.cjs reads', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dendro-powo-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const html = path.join(dir, 'PLHI-685854-1.html');
  const out = path.join(dir, 'PLHI-rows.json');
  fs.writeFileSync(html, HTML, 'utf8');
  const logs = captureConsole(t);

  const code = powoRowsMain(['--html', html, '--page-url', PAGE, '--target', 'PLHI', '--out', out]);

  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')), parsePowoImages(HTML, PAGE, 'PLHI').rows);
  assert.deepEqual(logs.out, [
    `2 rows written to ${out}; skipped: herbarium 7, no_license 14, license_not_allowed 0, no_credit 0, no_file 0`,
  ]);
});

test('powo-rows.ts names a missing flag and exits 1', (t) => {
  const logs = captureConsole(t);
  assert.equal(powoRowsMain(['--html', 'page.html']), 1);
  assert.equal(logs.err[0], 'powo-rows needs --page-url');
});
```

- [ ] **Step 3: Run the test and see it fail**

Run: `node --test pipeline/tests/powo.test.ts`
Expected: FAIL with `Error [ERR_MODULE_NOT_FOUND]: Cannot find module` naming `pipeline/lib/powo.ts`.

- [ ] **Step 4: Write the parser**

Create `pipeline/lib/powo.ts`:

```ts
import { channelHint, licenseAllowed } from './candidates.ts';
import { decodeEntities, htmlText, openTags } from './html.ts';
import { licenseLabelFromUrl, normalizeLicenseUrl } from './licenses.ts';

/**
 * Kew POWO is not a fetch source. Kew returns a Cloudflare challenge to scripts, so an agent
 * saves the gallery in the built-in browser (.claude/skills/powo-harvest/SKILL.md). This
 * module reads the saved HTML.
 */
export const POWO_SOURCE = 'Plants of the World Online (Kew)';

/** One `photos add` row: the one input shape of pipeline/scripts/mkadds.cjs. */
export interface AddRow {
  target: string;
  origin: string;
  file_url: string;
  author: string;
  license: string;
  license_url: string | null;
  source: string;
  source_species: string | null;
  channel_hint: string | null;
}

/** The reason an image gives no row. */
export type PowoSkip = 'herbarium' | 'no_license' | 'license_not_allowed' | 'no_credit' | 'no_file';

export interface PowoAnchor {
  /** The full-size file, protocol-relative: `//d2seqvvyy3b8p2.cloudfront.net/<hash>.jpg`. */
  href: string;
  /** The caption with its references decoded once, so it is an HTML fragment. */
  caption: string;
}

export interface PowoResult {
  rows: AddRow[];
  skipped: Record<PowoSkip, number>;
}

const SECTION = /<section\b[^>]*\bid="all-images"/i;

/**
 * The gallery anchors, one for each full-size file. The header carousel outside
 * `section#all-images` repeats the same anchors, so only that section is read when the page
 * holds it.
 */
export function powoAnchors(html: string): PowoAnchor[] {
  const start = html.search(SECTION);
  let scope = html;
  if (start !== -1) {
    const end = html.indexOf('</section>', start);
    scope = html.slice(start, end === -1 ? html.length : end);
  }
  const anchors: PowoAnchor[] = [];
  const seen = new Set<string>();
  for (const tag of openTags(scope, 'a')) {
    const href = tag.attrs.href;
    const caption = tag.attrs['data-caption'];
    if (href === undefined || caption === undefined || seen.has(href)) continue;
    seen.add(href);
    anchors.push({ href, caption: decodeEntities(caption) });
  }
  return anchors;
}

const SMALL = /<small>([\s\S]*)<\/small>\s*$/i;
const PHOTO_ID = /^ID:(\d+)\s*([\s\S]*)$/;
const CC_LINK = /https?:\/\/(?:www\.)?creativecommons\.org\/\S+/i;
const FILE_HASH = /\/([0-9a-f]{32})\.jpg$/i;

/**
 * One add row, or the reason for no row. The caption reads
 * `<title><br>ID:<n> <licence text><small><credit></small>`.
 */
export function powoRow(anchor: PowoAnchor, pageUrl: string, target: string): AddRow | PowoSkip {
  const small = SMALL.exec(anchor.caption);
  const head = small === null ? anchor.caption : anchor.caption.slice(0, small.index);
  const [titlePart, ...restParts] = head.split(/<br\s*\/?>/i);
  // A photo carries `ID:<n>`. A herbarium sheet carries a K barcode and no ID (owner ruling
  // 2026-09-25: photographs only).
  const photo = PHOTO_ID.exec(htmlText(restParts.join(' ')));
  if (photo === null) return 'herbarium';
  const licenseText = photo[2];
  // "Not Kew Copyright. Only licensed for display purposes in POWO." carries no licence url.
  const link = CC_LINK.exec(licenseText);
  const label = link === null ? null : licenseLabelFromUrl(link[0]);
  if (link === null || label === null) return 'no_license';
  // The holder text before the url stays in front of the label: `© RBG Kew, CC BY 3.0`.
  const holder = licenseText.slice(0, link.index).trim().replace(/[,;.]$/, '').trim();
  const license = holder === '' ? label : `${holder}, ${label}`;
  if (!licenseAllowed(license)) return 'license_not_allowed';
  // A credit can start with a name link: `<a>Platanus × acerifolia</a> | <credit>`.
  const creditText = small === null ? '' : htmlText(small[1]);
  const bar = creditText.lastIndexOf(' | ');
  const author = (bar === -1 ? creditText : creditText.slice(bar + 3)).trim();
  if (author === '') return 'no_credit';
  // The site has no page for one image, so the origin carries the file hash as a fragment.
  const file = FILE_HASH.exec(anchor.href);
  if (file === null) return 'no_file';
  const title = htmlText(titlePart ?? '');
  const dash = title.indexOf(' - ');
  const species = (dash === -1 ? title : title.slice(0, dash)).trim();
  return {
    target,
    origin: `${pageUrl}#image=${file[1].toLowerCase()}`,
    file_url: anchor.href.startsWith('//') ? `https:${anchor.href}` : anchor.href,
    author,
    license,
    license_url: normalizeLicenseUrl(link[0]),
    source: POWO_SOURCE,
    source_species: species === '' ? null : species,
    channel_hint: channelHint(htmlText(anchor.caption)),
  };
}

/** The add rows of one saved gallery, and the count of images skipped for each reason. */
export function parsePowoImages(html: string, pageUrl: string, target: string): PowoResult {
  const skipped: Record<PowoSkip, number> = {
    herbarium: 0,
    no_license: 0,
    license_not_allowed: 0,
    no_credit: 0,
    no_file: 0,
  };
  const rows: AddRow[] = [];
  for (const anchor of powoAnchors(html)) {
    const result = powoRow(anchor, pageUrl, target);
    if (typeof result === 'string') skipped[result] += 1;
    else rows.push(result);
  }
  return { rows, skipped };
}
```

- [ ] **Step 5: Write the script**

Create `pipeline/scripts/powo-rows.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { parsePowoImages } from '../lib/powo.ts';
import { parseFlags } from '../lib/run.ts';

const USAGE =
  'usage: node pipeline/scripts/powo-rows.ts --html <file> --page-url <url> --target <SYMBOL> --out <rows.json>';
const REQUIRED = ['html', 'page-url', 'target', 'out'];

/**
 * Reads one saved POWO gallery and writes its add rows as a JSON array, the input of
 * pipeline/scripts/mkadds.cjs. Put --out outside the repo, because the CLI commits with
 * `git add -A`. Returns the exit code.
 */
export function powoRowsMain(argv: string[]): number {
  let flags: Record<string, string>;
  try {
    flags = parseFlags(argv);
  } catch (error) {
    console.error((error as Error).message);
    console.error(USAGE);
    return 1;
  }
  for (const key of REQUIRED) {
    const value = flags[key];
    if (value === undefined || value.trim() === '') {
      console.error(`powo-rows needs --${key}`);
      console.error(USAGE);
      return 1;
    }
  }
  const html = fs.readFileSync(flags.html, 'utf8');
  const result = parsePowoImages(html, flags['page-url'], flags.target);
  fs.mkdirSync(path.dirname(path.resolve(flags.out)), { recursive: true });
  fs.writeFileSync(flags.out, `${JSON.stringify(result.rows, null, 2)}\n`, 'utf8');
  const skipped = Object.entries(result.skipped)
    .map(([reason, count]) => `${reason} ${count}`)
    .join(', ');
  console.log(`${result.rows.length} rows written to ${flags.out}; skipped: ${skipped}`);
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = powoRowsMain(process.argv.slice(2));
}
```

- [ ] **Step 6: Run the test and see it pass**

Run: `node --test pipeline/tests/powo.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 7: Run the script once by hand**

`<session scratchpad>` is the scratchpad directory that your system prompt names. Write the path with forward slashes.

Run: `node pipeline/scripts/powo-rows.ts --html pipeline/tests/fixtures/powo/platanus_x_hispanica_images.html --page-url "https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:685854-1/images" --target PLHI --out "<session scratchpad>/powo-check/PLHI-rows.json"`
Expected: `2 rows written to <session scratchpad>/powo-check/PLHI-rows.json; skipped: herbarium 7, no_license 14, license_not_allowed 0, no_credit 0, no_file 0`. The output file is in the scratchpad, not in the repo.

- [ ] **Step 8: Write the skill**

Create `.claude/skills/powo-harvest/SKILL.md`:

````markdown
---
name: powo-harvest
description: Use only as the last resort for a Dendro content run, when a species and channel is still thin after the targeted search in content-run Step 7. Collects photo rows from Kew Plants of the World Online (POWO) in the built-in browser.
---

# POWO harvest

You collect the photographs of one species from Kew Plants of the World Online (POWO) and
turn them into `photos add` commands. POWO is not a fetch source. Kew returns a Cloudflare
challenge (HTTP 403) to Node, to WebFetch, and to headless browsers. The built-in browser
(the Browser pane) gets the page.

## The rules

These rules come from Kew's `robots.txt` and from the owner rulings of 2026-09-25. Obey
each one.

- POWO is the last resort. Start only for a species and channel that is still thin after
  the targeted search in `content-run` Step 7 (the harvester, then Commons, iNaturalist,
  and wildflower.org). If no pair is still thin, do not start. The best run never needs
  this skill. Before you start, write down which sites you searched for each pair and what
  each gave.
- Use the built-in browser only: the `mcp__Claude_Browser__*` tools. Do not ask for a Kew
  page with Node, curl, WebFetch, or a headless browser.
- Load each Kew page once. Wait 10 seconds at least between two Kew page loads. Kew's
  `robots.txt` sets `crawl-delay: 10`.
- Stop at a challenge. A challenge is a page whose title is `Just a moment...`, a page that
  asks you to show that you are human, or an HTTP 403. Stop, and tell the owner the URL.
  Do not load the page again, do not click the check, and do not try another way in.
- Never sign in. Never accept non-essential cookies. When a cookie banner shows, choose the
  option that refuses non-essential cookies. When the banner has no such option, leave it
  open. The gallery is in the page behind it.
- Keep photographs only. The parser skips herbarium sheets (owner ruling 2026-09-25).
- Put every file in the session scratchpad, never in the repo. The CLI commits with
  `git add -A`, so a file inside the repo reaches a commit.

## Inputs

- The run name, `<name>`. The run must exist: `pipeline/runs/<name>/run.json`.
- The target and the scientific name of each thin species. The gap list in
  `pipeline/runs/<name>/build.json` names them, or the owner does.

## Steps for one species

`<scratch>` is `<session scratchpad>/powo`. `<SYMBOL>` is the target, such as `PLHI`.

1. **Open the search page.** Use `mcp__Claude_Browser__navigate` with
   `https://powo.science.kew.org/results?q=<scientific name, URL-encoded>`. This is Kew page
   load 1. Check for a challenge.
2. **Find the IPNI id.** Read the result list with `mcp__Claude_Browser__get_page_text` or
   `mcp__Claude_Browser__find`. Pick the accepted name that matches the scientific name. Its
   link is `/taxon/urn:lsid:ipni.org:names:<IPNI id>`. When the list is still empty, wait 5
   seconds (`mcp__Claude_Browser__computer`, action `wait`) and read the same page again.
   That is not a new page load.
3. **Wait.** Use `mcp__Claude_Browser__computer`, action `wait`, duration 10.
4. **Open the images page.** Use `mcp__Claude_Browser__navigate` with
   `https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:<IPNI id>/images`. This is
   Kew page load 2. Check for a challenge.
5. **Read the gallery.** Run `mcp__Claude_Browser__javascript_tool` with
   `document.querySelector('section#all-images')?.outerHTML ?? null`. When the result is
   null, the species has no image gallery. Tell the owner, and stop for this species.
6. **Save it.** Write the HTML with the Write tool to `<scratch>/<SYMBOL>-<IPNI id>.html`.
   Make the first line
   `<!-- Source: <images page URL>, captured <YYYY-MM-DD> in the built-in browser. -->`.
7. **Make the rows.** Run from the repo root:

   ```bash
   node pipeline/scripts/powo-rows.ts --html <scratch>/<SYMBOL>-<IPNI id>.html --page-url "https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:<IPNI id>/images" --target <SYMBOL> --out <scratch>/<SYMBOL>-rows.json
   ```

   It prints `<n> rows written to <file>; skipped: herbarium <a>, no_license <b>, license_not_allowed <c>, no_credit <d>, no_file <e>`.
   0 rows is a valid result. Stop for this species when it is 0.
8. **Make the commands.** Run:

   ```bash
   node pipeline/scripts/mkadds.cjs --run <name> --in <scratch>/<SYMBOL>-rows.json --out <scratch>/<SYMBOL>-adds.sh
   ```

   It prints `lines`, `max bytes`, and `problems`. Go on only when it prints
   `problems: none`.
9. **Add the rows.** Read `<scratch>/<SYMBOL>-adds.sh`. Run each line as its own Bash
   command, from the repo root, one after the other. Each `photos add` is a new process, so
   the rate limit in `pipeline/lib/http.ts` does not span two lines. One line for each tool
   call keeps the Kew file host at a low rate. Each line prints
   `manual candidate <id> added for <SYMBOL>`. A line that prints `refused:` names a
   duplicate or a monochrome image. That row is not added, and that is correct.

Before the first Kew page load of the next species, wait 10 seconds.

## What a row holds

- `license`: the caption's holder and the label of its Creative Commons URL, such as
  `© RBG Kew, CC BY 3.0`. The allowlist must admit the label.
- `author`: the credit in the caption's `<small>`, word for word, after any name link.
- `origin`: the images page URL plus `#image=<32-hex hash of the file>`. The site has no
  page for one image.
- `file_url`: the 1,600 px file on `https://d2seqvvyy3b8p2.cloudfront.net/`.
- `source`: `Plants of the World Online (Kew)`. `source_species`: the name in the caption.

A photo whose caption says it is licensed for display in POWO only has no licence URL, so
the parser skips it.

## After the harvest

Run the `photo-check` skill, then build (steps 5 and 6 of the `content-run` skill).

## What this skill does not do

- It does not pass a challenge page, sign in, or accept non-essential cookies.
- It does not keep herbarium sheets.
- It does not commit. `photos add` does not commit either.
- It does not email Kew. The owner emails `BI@kew.org` to say that Dendro uses POWO images.
````

- [ ] **Step 9: Run the pipeline suite**

Run: `npm run test:pipeline`
Expected: PASS, 367 + 10 = 377 tests (this worktree does not hold Tasks 2 to 5).

- [ ] **Step 10: Commit**

```bash
git add pipeline/lib/powo.ts pipeline/scripts/powo-rows.ts pipeline/tests/powo.test.ts pipeline/tests/fixtures/powo/platanus_x_hispanica_images.html .claude/skills/powo-harvest/SKILL.md
git commit -m "feat: add the Kew POWO parser, the powo-rows script, and the powo-harvest skill" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Wire the three fetch sources into `photos fetch`

Runs after Tasks 2 to 6 merge into `sources`.

**Files:**
- Modify: `pipeline/lib/commands.ts` (the imports, `TURN_ORDER`, `turnRows`)
- Modify: `pipeline/tests/cli_fetch.test.ts`
- Modify: `.claude/skills/content-run/SKILL.md` (Step 4 and Step 7)
- Modify: `.claude/skills/photo-check/SKILL.md:65-68` (License) and `:82-84` (identity sources)

**Interfaces:**
- Consumes:
  - `bioimagesRows(http: Http, names: string[], target: string, now: string): Promise<Candidate[]>`, `BIOIMAGES_CATALOGUE_URL`, `parseBioimagesCatalogue`, `bioimagesCandidates` from `pipeline/lib/bioimages.ts` (Task 2)
  - `tsoRows(http: Http, names: string[], target: string, now: string): Promise<Candidate[]>`, `TSO_SITEMAP_URL`, `parseTsoPage`, `tsoCandidates` from `pipeline/lib/tso.ts` (Task 3)
  - `wildflowerRows(http: Http, symbol: string, target: string, now: string): Promise<Candidate[]>`, `wildflowerGalleryUrl`, `wildflowerImageUrl`, `decodeWindows1252`, `parseWildflowerImage`, `wildflowerCandidate` from `pipeline/lib/wildflower.ts` (Task 4)
  - `buildCommand(row: AddRow, run: string): { line: string; problems: string[] }` from `pipeline/scripts/mkadds.cjs` (Task 5)
  - `parsePowoImages(html: string, pageUrl: string, target: string): PowoResult` from `pipeline/lib/powo.ts` (Task 6)
  - `TURN_ORDER`, `FETCH_ORDER`, `turnRows`, `FetchContext.names`, `FetchContext.passes` from Task 1
- Produces: `TURN_ORDER = ['bioimages', 'wildflower', 'tso', 'commons', 'inat']`; `FETCH_ORDER = ['bioimages', 'wildflower', 'tso', 'commons', 'inat', 'plants']`.

The QUGA fixture rows per source: Bioimages 3, wildflower.org 4, TSO 5, Commons 5, iNaturalist 4, PLANTS 2. The total, 23, is under the cap of 60, so every fetch test still appends every expected row.

- [ ] **Step 1: Change the fetch tests to the five turn sources**

In `pipeline/tests/cli_fetch.test.ts`:

1. After `import fs from 'node:fs';` add `import { createRequire } from 'node:module';`.
2. After the import from `'../lib/candidates.ts'`, add:

```ts
import {
  BIOIMAGES_CATALOGUE_URL,
  bioimagesCandidates,
  parseBioimagesCatalogue,
} from '../lib/bioimages.ts';
```

3. After the import from `'../lib/plants.ts'`, add:

```ts
import { parsePowoImages } from '../lib/powo.ts';
```

4. After the import from `'../lib/storage.ts'`, add:

```ts
import { TSO_SITEMAP_URL, parseTsoPage, tsoCandidates } from '../lib/tso.ts';
```

5. After the import from `'../lib/verdicts.ts'`, add:

```ts
import {
  decodeWindows1252,
  parseWildflowerImage,
  wildflowerCandidate,
  wildflowerGalleryUrl,
  wildflowerImageUrl,
} from '../lib/wildflower.ts';
```

6. After the line `const NOT_AN_IMAGE = new Uint8Array([1, 2, 3, 4]);`, add:

```ts
const TSO_QUGA_URL = 'https://www.treesandshrubsonline.org/articles/quercus/quercus-gambelii/';
/** The QUGA image ids that the wildflower.org gallery fixture lists, in list order. */
const WILDFLOWER_QUGA_IDS = ['3424', '24045', '66070', '121699'];
const POWO_PAGE = 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:685854-1/images';
const mkadds = createRequire(import.meta.url)(
  path.join(REPO_ROOT, 'pipeline', 'scripts', 'mkadds.cjs'),
) as { buildCommand: (row: unknown, run: string) => { line: string; problems: string[] } };
```

7. After the function `fixture`, add:

```ts
function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
}
```

8. In `photoRoutes()`, before the line `for (const [index, url] of fileUrls('QUGA').entries()) routes.set(url, { bytes: jpeg(index) });`, add:

```ts
  routes.set(BIOIMAGES_CATALOGUE_URL, { body: fixture('bioimages/images_sample.csv') });

  // The wildflower.org pages are windows-1252 bytes, so the source reads them as bytes.
  routes.set(wildflowerGalleryUrl('QUGA'), { bytes: fixtureBytes('wildflower/quga_gallery.html') });
  for (const id of WILDFLOWER_QUGA_IDS) {
    routes.set(wildflowerImageUrl(id), { bytes: fixtureBytes(`wildflower/image_${id}.html`) });
  }

  routes.set(TSO_SITEMAP_URL, { body: fixture('tso/sitemap_sample.xml') });
  routes.set(TSO_QUGA_URL, { body: fixture('tso/quercus_gambelii.html') });

```

9. Before the function `expectedRows`, add:

```ts
/** The rows the Bioimages catalogue fixture gives for QUGA. */
function bioimagesRowsOf(target: string): Candidate[] {
  const rows = parseBioimagesCatalogue(fixture('bioimages/images_sample.csv'));
  return bioimagesCandidates(rows, [SCIENTIFIC], target, NOW);
}

/** The rows the four saved wildflower.org image pages give, in gallery order. */
function wildflowerRowsOf(target: string): Candidate[] {
  const rows: Candidate[] = [];
  for (const id of WILDFLOWER_QUGA_IDS) {
    const page = decodeWindows1252(fixtureBytes(`wildflower/image_${id}.html`));
    const row = wildflowerCandidate(parseWildflowerImage(page), wildflowerImageUrl(id), target, NOW);
    if (row !== null) rows.push(row);
  }
  return rows;
}

/** The rows the saved Trees and Shrubs Online article gives. */
function tsoRowsOf(target: string): Candidate[] {
  return tsoCandidates(parseTsoPage(fixture('tso/quercus_gambelii.html')), TSO_QUGA_URL, target, NOW);
}
```

10. Replace the body of `expectedRows` with:

```ts
  return [
    ...plantsRowsOf(target),
    ...commonsRowsOf(target),
    ...inatRowsOf(target),
    ...bioimagesRowsOf(target),
    ...wildflowerRowsOf(target),
    ...tsoRowsOf(target),
  ];
```

11. In the test `'photos fetch appends candidates with their bytes and commits'`, replace:

```ts
    'one row per candidate the three sources name, and no row for an excluded image',
  );
  assert.deepEqual([...new Set(rows.map((row) => row.source_key))].sort(), [
    'commons',
    'inat',
    'plants',
  ]);
  for (const key of ['commons', 'inat', 'plants'] as const) {
```

with:

```ts
    'one row per candidate the six sources name, and no row for an excluded image',
  );
  assert.deepEqual([...new Set(rows.map((row) => row.source_key))].sort(), [
    'bioimages',
    'commons',
    'inat',
    'plants',
    'tso',
    'wildflower',
  ]);
  for (const key of ['bioimages', 'commons', 'inat', 'plants', 'tso', 'wildflower'] as const) {
```

12. Replace the test `'the turn order is Commons, then iNaturalist, and PLANTS comes last'` with:

```ts
test('the turn order is Bioimages, wildflower.org, TSO, Commons, iNaturalist, then PLANTS', () => {
  assert.deepEqual(TURN_ORDER, ['bioimages', 'wildflower', 'tso', 'commons', 'inat']);
  assert.deepEqual(FETCH_ORDER, ['bioimages', 'wildflower', 'tso', 'commons', 'inat', 'plants']);
});
```

13. Replace the test `'photos fetch takes Commons and iNaturalist in turns, then PLANTS'` with:

```ts
test('photos fetch takes the five turn sources in turns, then PLANTS', async (t) => {
  const { root, deps } = setup(t, photoRoutes());
  seedInatTerms(root);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf,bark' }, (scope) => {
    scope.species = ['QUGA'];
  });

  assert.equal(await runCommand(['photos', 'fetch', 'demo'], deps), 0);

  const turns = interleave([
    bioimagesRowsOf('QUGA'),
    wildflowerRowsOf('QUGA'),
    tsoRowsOf('QUGA'),
    commonsRowsOf('QUGA'),
    inatRowsOf('QUGA'),
  ]);
  const rows = fetchedOf(root);
  assert.deepEqual(
    rows.map((row) => row.origin),
    [...turns, ...plantsRowsOf('QUGA')].map((row) => row.origin),
    'one row from each turn source per round, and PLANTS after every turn row',
  );
  assert.deepEqual(
    rows.slice(0, 5).map((row) => row.source_key),
    ['bioimages', 'wildflower', 'tso', 'commons', 'inat'],
    'the first round takes one row from each turn source, in the owner order',
  );
});
```

14. In the test `'photos fetch gives the cap to the turn sources ahead of PLANTS'`, replace:

```ts
  const room = commonsRowsOf('QUGA').length + inatRowsOf('QUGA').length;
```

with:

```ts
  const room = [
    bioimagesRowsOf('QUGA'),
    wildflowerRowsOf('QUGA'),
    tsoRowsOf('QUGA'),
    commonsRowsOf('QUGA'),
    inatRowsOf('QUGA'),
  ].reduce((sum, group) => sum + group.length, 0);
```

and replace:

```ts
    ['commons', 'inat'],
    'no PLANTS row reaches the queue ahead of the turn sources',
```

with:

```ts
    ['bioimages', 'commons', 'inat', 'tso', 'wildflower'],
    'no PLANTS row reaches the queue ahead of the turn sources',
```

15. In the test `'photos fetch prints a failed listing and still exits 0'`, replace:

```ts
    originsOf([...plantsRowsOf('QUGA'), ...inatRowsOf('QUGA')]),
    'the other two sources still fill the queue',
```

with:

```ts
    originsOf([
      ...plantsRowsOf('QUGA'),
      ...inatRowsOf('QUGA'),
      ...bioimagesRowsOf('QUGA'),
      ...wildflowerRowsOf('QUGA'),
      ...tsoRowsOf('QUGA'),
    ]),
    'the other five sources still fill the queue',
```

16. After the test `'photos add refuses the permission label for any other host'`, add:

```ts
test('the POWO rows go through mkadds.cjs and photos add with no refusal', async (t) => {
  const { rows } = parsePowoImages(fixture('powo/platanus_x_hispanica_images.html'), POWO_PAGE, 'PLHI');
  assert.equal(rows.length, 2);
  const routes = new Map<string, Route>();
  rows.forEach((row, index) => routes.set(row.file_url, { bytes: jpeg(index) }));
  const { root, deps, out } = setup(t, routes);
  seedRun(root, { bucket: 'simple_lobed', channels: 'leaf,bark,fruit' }, () => {});

  for (const row of rows) {
    const built = mkadds.buildCommand(row, 'demo');
    assert.deepEqual(built.problems, []);
    // The shell reads each double-quoted value as one word.
    const words = (built.line.match(/"[^"]*"|\S+/g) ?? []).map((word) =>
      word.replace(/^"(.*)"$/, '$1'),
    );
    assert.deepEqual(words.slice(0, 2), ['node', 'pipeline/cli.ts']);
    assert.equal(await runCommand(words.slice(2), deps), 0);
  }

  const added = candidatesOf(root);
  assert.equal(added.length, 2);
  assert.deepEqual(out, added.map((row) => `manual candidate ${row.id} added for PLHI`));
  for (const row of added) {
    assert.equal(row.source_key, 'manual');
    assert.equal(row.source, 'Plants of the World Online (Kew)');
    assert.equal(row.license, '© RBG Kew, CC BY 3.0');
    assert.equal(row.license_url, 'https://creativecommons.org/licenses/by/3.0/');
    assert.equal(row.channel_hint, null);
  }
});
```

- [ ] **Step 2: Run the fetch tests and see them fail**

Run: `node --test pipeline/tests/cli_fetch.test.ts`
Expected: FAIL. The turn order test fails on `deepEqual` (`TURN_ORDER` is still `['commons', 'inat']`). The first fetch test fails because no Bioimages, wildflower.org, or TSO row reaches the queue. The POWO test passes.

- [ ] **Step 3: Add the three sources to the turn list**

In `pipeline/lib/commands.ts`:

1. Before `import {` of `'./candidates.ts'`, add `import { bioimagesRows } from './bioimages.ts';`.
2. After the import from `'./storage.ts'`, add `import { tsoRows } from './tso.ts';`.
3. After the import block from `'./verdicts.ts'`, add `import { wildflowerRows } from './wildflower.ts';`.
4. Replace `export const TURN_ORDER: SourceKey[] = ['commons', 'inat'];` with:

```ts
export const TURN_ORDER: SourceKey[] = ['bioimages', 'wildflower', 'tso', 'commons', 'inat'];
```

5. In `turnRows`, before `    case 'commons':`, add:

```ts
    case 'bioimages':
      return bioimagesRows(context.deps.http, context.names, context.target, context.now);
    case 'wildflower':
      // The site keys plants by PLANTS symbol.
      return wildflowerRows(context.deps.http, context.symbol, context.target, context.now);
    case 'tso':
      return tsoRows(context.deps.http, context.names, context.target, context.now);
```

- [ ] **Step 4: Run the fetch tests and see them pass**

Run: `node --test pipeline/tests/cli_fetch.test.ts`
Expected: PASS, every test.

- [ ] **Step 5: Update the content-run skill**

In `.claude/skills/content-run/SKILL.md`, Step 4:

- Replace:

  ```markdown
  `pipeline/cache/`. The sources take turns: each source gives one row per round, in this
  order: Wikimedia Commons, iNaturalist. A source that runs out drops out of the rounds. USDA
  PLANTS rows come after all the turn rows. A target keeps 60 rows at most.
  ```

  with:

  ```markdown
  `pipeline/cache/`. The sources take turns: each source gives one row per round, in this
  order: Bioimages, the Lady Bird Johnson Wildflower Center (wildflower.org), Trees and
  Shrubs Online, Wikimedia Commons, iNaturalist. A source that runs out drops out of the
  rounds. USDA PLANTS rows come after all the turn rows. A target keeps 60 rows at most.
  ```

- Replace `` `by source: commons 17, inat 16, plants 0` `` with `` `by source: bioimages 10, wildflower 12, tso 5, commons 17, inat 16, plants 0` ``.

Then replace the whole of Step 7, from the line `- [ ] **Step 7: Hunt for the thin channels (agent)**` through the line `Then run steps 5 and 6 again.`, with:

````markdown
- [ ] **Step 7: Hunt for the thin channels (agent)**

Read the gap list in `build.json` under `gaps`. Each row names a species or a concept, a
channel, and the count of approved images.

`photos fetch` already reads six sources: Bioimages, the Lady Bird Johnson Wildflower
Center (wildflower.org), Trees and Shrubs Online, Wikimedia Commons, iNaturalist, and USDA
PLANTS. For each thin pair, do a targeted search: a search for that one species and
channel only. Use these tools, in this order, and stop when the pair has 4 approved images:

1. **The harvester.** `pipeline/scripts/harvest.cjs` looks for one channel of a species on
   Bioimages and Trees and Shrubs Online, past the rows that the fetch took. Write the gap
   rows to a JSON file in the session scratchpad, one object per row:
   `{ "symbol": "<target>", "sci": "<scientific name>", "channel": "<channel>", "approved": <count> }`.
   Then run:

   ```bash
   node pipeline/scripts/harvest.cjs --rows <scratchpad>/gap-rows.json --run <name> --out-dir <scratchpad>/harvest
   ```

   It writes `harvest-rows.json` and `harvest-report.md` into `--out-dir`. Look at each image
   at its `local` path. Copy the rows that you keep into
   `<scratchpad>/harvest/keep-rows.json`. Then run:

   ```bash
   node pipeline/scripts/mkadds.cjs --run <name> --in <scratchpad>/harvest/keep-rows.json --out <scratchpad>/harvest/adds.sh
   ```

   It prints `lines`, `max bytes`, and `problems`. Fix each problem before you go on. Then
   run the lines of `adds.sh` one at a time, from the repo root.
2. **The other sites.** Look for that channel on Wikimedia Commons, iNaturalist, and
   wildflower.org, in the built-in browser or with a script that calls the site over HTTP.
   Take only images whose licence is on the allowlist. Append each one as a manual
   candidate, as below.
3. **Kew POWO, last.** Run the `powo-harvest` skill only for a pair that is still thin after
   steps 1 and 2. Before you start it, write down which sites you searched for that pair and
   what each gave. The skill saves the Kew gallery in the built-in browser, makes the rows
   with `pipeline/scripts/powo-rows.ts`, makes the commands with
   `pipeline/scripts/mkadds.cjs`, and runs them.

Do not use WebFetch to make a photo row. WebFetch passes the page through a model, so a
credit or a licence can come back in other words, and `photos add` needs both word for
word. Read the credit and the licence off the page in the browser, or from the output of a
script.

Give the scripts paths in the scratchpad only, never in the repo. The CLI commits with
`git add -A`, so a file inside the repo reaches a commit.

A manual candidate:

```bash
node pipeline/cli.ts photos add <name> --target <t> --origin <url> --file-url <url> --author <a> --license <l> --source <s> [--license-url <u>] [--source-species <n>] [--channel-hint <c>] [--local <path>]
```

`--target`, `--origin`, `--file-url`, `--author`, `--license`, and `--source` are
required, and each must be non-empty. The command exits 1 and names the flag when one is
missing.

- `--author` and `--license` are the credit the app prints under the photo, word for word.
  Copy them off the source page. Do not write `unknown`.
- `--license` must be on the allowlist. The one exception is
  `used with permission, non-commercial`, which `photos add` accepts only when `--origin` is
  on `www.wildflower.org`.
- `--source` is the display name of the source, such as `US Forest Service`. It goes on the
  manifest row as it is.
- `--source-species` is the species the source page names. The identity check reads it.
- `--local <path>` names an image file you already downloaded. Without it the command
  downloads `--file-url`.
- `photos add` refuses a monochrome image, and a candidate id that the run already holds.
  When one page holds many images, add a fragment such as `#image=<file name>` to
  `--origin`.

Then run steps 5 and 6 again.
````

- [ ] **Step 6: Update the photo-check skill**

In `.claude/skills/photo-check/SKILL.md`, after the License paragraph (lines 65-68, it ends with ``ambiguous, or not redistributable, escalate with `--case license`.``), add:

```markdown

One written permission takes the place of the allowlist for one host (owner ruling
2026-09-25, `docs/decisions/2026-09-25-wildflower-permission.md`). A row whose `origin` is
on `www.wildflower.org` may carry the license `used with permission, non-commercial`. That
text is valid for wildflower.org rows, and for no other host. On a row from any other host,
escalate it with `--case license`.

A Kew POWO row carries the holder in front of the label, such as `© RBG Kew, CC BY 3.0`.
That is a CC BY license, and it is on the allowlist.
```

Then replace the paragraph at lines 82-84:

```markdown
Eligible identity sources are iNaturalist at research grade, USDA PLANTS, US Forest
Service and NRCS through a manual candidate, Wikimedia Commons with a species-level
category, and university dendrology collections that name the species.
```

with:

```markdown
Eligible identity sources are iNaturalist at research grade, USDA PLANTS, US Forest
Service and NRCS through a manual candidate, Wikimedia Commons with a species-level
category, and university dendrology collections that name the species. Bioimages, Trees
and Shrubs Online, the Lady Bird Johnson Wildflower Center (wildflower.org), and Kew Plants
of the World Online are eligible too, because each page names the species.
```

- [ ] **Step 7: Run every suite**

Run: `npm run test:all`
Expected: PASS. App 177. Pipeline 426: 348, plus Task 1's 19, plus 12 each from Tasks 2, 3, 4, and 5, plus 10 from Task 6, plus 1 from this task. Live 7.

- [ ] **Step 8: Commit**

```bash
git add pipeline/lib/commands.ts pipeline/tests/cli_fetch.test.ts .claude/skills/content-run/SKILL.md .claude/skills/photo-check/SKILL.md
git commit -m "feat: fetch from Bioimages, wildflower.org, and TSO in turns" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Verification (the orchestrator runs this)

This task changes no file on `sources`. It uses a throwaway worktree, because the CLI commits run files. Never push `sources-scratch`.

**How the scratch runs are made.** `run init` is not usable here. It runs `git checkout -b content/<name> main` (`pipeline/lib/run.ts:232-234`), and `main` does not hold this branch's code. `species list` keeps only the symbols of `--genera` (`pipeline/lib/species.ts:324`), so a one-species run through it would fetch the profile of every Quercus symbol. So each scratch run is written with `newScope` and `writeRun`, the two functions that `run init` calls, with `species` set to one symbol. That is what the fetch tests do (`seedRun`). `pipeline/data/plants_ids.json` holds QUGA (70265, `Quercus gambelii`) and PLHI (70562, `Platanus ×hispanica`), so the fetch needs no profile request.

`<scratch>` below is `<session scratchpad>/powo-plhi`, where the session scratchpad is the directory that the system prompt names.

- [ ] **Step 1: Run every suite on `sources`**

Run: `cd C:/Users/jdennen/Dendro/.claude/worktrees/sources && npm run test:all`
Expected: PASS. App 177, pipeline 426, live 7.

- [ ] **Step 2: Make the scratch worktree**

```bash
git -C C:/Users/jdennen/Dendro/.claude/worktrees/sources worktree add C:/Users/jdennen/Dendro/.claude/worktrees/sources-scratch -b sources-scratch sources
```

```bash
cd C:/Users/jdennen/Dendro/.claude/worktrees/sources-scratch && npm install
```

Expected: the worktree exists on branch `sources-scratch`, and `npm install` ends with no error.

- [ ] **Step 3: Write the QUGA run**

```bash
cd C:/Users/jdennen/Dendro/.claude/worktrees/sources-scratch && node --input-type=module -e "import { newScope, writeRun } from './pipeline/lib/run.ts'; const now = new Date().toISOString().slice(0, 19) + 'Z'; const scope = newScope('quga_scratch', { bucket: 'simple_lobed', channels: 'leaf,bark,fruit' }, now); scope.species = ['QUGA']; writeRun(process.cwd(), scope); console.log(scope.name, scope.species.join(','));"
```

Expected: `quga_scratch QUGA`, and the file `pipeline/runs/quga_scratch/run.json`.

- [ ] **Step 4: Run a real fetch on QUGA**

Run with a timeout of 600000 ms:

```bash
cd C:/Users/jdennen/Dendro/.claude/worktrees/sources-scratch && node pipeline/cli.ts photos fetch quga_scratch
```

Expected:
- Exit code 0.
- The line `<n> candidates appended to pipeline/runs/quga_scratch/candidates.jsonl, <m> download failures, <k> monochrome dropped`, with `<n>` at most 60.
- The last line `by source: bioimages <a>, wildflower <b>, tso <c>, commons <d>, inat <e>, plants <f>`, with `<a>`, `<b>`, and `<c>` each above 0.
- A rough guide from the saved pages: QUGA has 10 Bioimages rows, 5 TSO rows, and 59 wildflower.org images (the fetch reads 20). With 60 slots, the rounds give about bioimages 10, wildflower 15, tso 5, commons 15, inat 15, plants 0, less the monochrome drops.
- A commit `content(quga_scratch): photo candidates` on `sources-scratch`.

Write down each `fetch failed:` line. A failed wildflower.org or Zenodo file is a finding to report, not a reason to retry at once.

- [ ] **Step 5: Count the rows by source and check each licence**

```bash
cd C:/Users/jdennen/Dendro/.claude/worktrees/sources-scratch && node --input-type=module -e "import { readJsonl } from './pipeline/lib/jsonl.ts'; import { licenseAllowedAt } from './pipeline/lib/licenses.ts'; const name = process.argv[1]; const rows = readJsonl('pipeline/runs/' + name + '/candidates.jsonl'); const bySource = {}; let violations = 0; for (const row of rows) { bySource[row.source_key] = (bySource[row.source_key] ?? 0) + 1; if (licenseAllowedAt(row.license, row.origin) === false) { violations += 1; console.log('violation', row.id, row.license, row.origin); } } console.log(JSON.stringify(bySource)); console.log('rows', rows.length, 'violations', violations);" quga_scratch
```

Expected: a JSON object whose counts match the `by source:` line of Step 4 (a source with 0 rows is absent from the object), then `rows <n> violations 0`.

- [ ] **Step 6: Harvest the London plane page with the powo-harvest skill**

Follow `.claude/skills/powo-harvest/SKILL.md` for target `PLHI`, scientific name `Platanus × hispanica`. Search with `https://powo.science.kew.org/results?q=Platanus%20%C3%97%20hispanica`. The expected IPNI id is `685854-1`. Wait 10 seconds between the two Kew page loads. Save the gallery to `<scratch>/PLHI-685854-1.html`. Stop and report at a challenge page.

- [ ] **Step 7: Write the PLHI run**

```bash
cd C:/Users/jdennen/Dendro/.claude/worktrees/sources-scratch && node --input-type=module -e "import { newScope, writeRun } from './pipeline/lib/run.ts'; const now = new Date().toISOString().slice(0, 19) + 'Z'; const scope = newScope('plhi_scratch', { bucket: 'simple_lobed', channels: 'leaf,bark,fruit' }, now); scope.species = ['PLHI']; writeRun(process.cwd(), scope); console.log(scope.name, scope.species.join(','));"
```

Expected: `plhi_scratch PLHI`.

- [ ] **Step 8: Make the rows and the commands**

```bash
cd C:/Users/jdennen/Dendro/.claude/worktrees/sources-scratch && node pipeline/scripts/powo-rows.ts --html <scratch>/PLHI-685854-1.html --page-url "https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:685854-1/images" --target PLHI --out <scratch>/PLHI-rows.json
```

Expected: `2 rows written to <scratch>/PLHI-rows.json; skipped: herbarium 7, no_license 14, license_not_allowed 0, no_credit 0, no_file 0`. When Kew changed the gallery after 2026-09-25, the counts can differ. Report the new counts. The two CC BY photos, ID 14124 and ID 14123, must still be rows.

```bash
cd C:/Users/jdennen/Dendro/.claude/worktrees/sources-scratch && node pipeline/scripts/mkadds.cjs --run plhi_scratch --in <scratch>/PLHI-rows.json --out <scratch>/PLHI-adds.sh
```

Expected: `lines: 2`, a `max bytes:` line under 1500, and `problems: none`.

- [ ] **Step 9: Run the generated `photos add` commands**

Read `<scratch>/PLHI-adds.sh`. Run each of its two lines as its own Bash command, prefixed with `cd C:/Users/jdennen/Dendro/.claude/worktrees/sources-scratch && `.
Expected: each prints `manual candidate <id> added for PLHI` and exits 0.

- [ ] **Step 10: Check the PLHI rows**

Run the Step 5 command again with `plhi_scratch` in place of `quga_scratch`.
Expected: `{"manual":2}`, then `rows 2 violations 0`.

- [ ] **Step 11: Report**

Report to the owner: the three suite counts, the `by source:` line of Step 4, the violation counts of Steps 5 and 10, the POWO skip counts of Step 8, and each `fetch failed:` line. Leave the scratch worktree in place until the owner has seen the results. When the owner agrees, remove it:

```bash
git -C C:/Users/jdennen/Dendro/.claude/worktrees/sources worktree remove --force C:/Users/jdennen/Dendro/.claude/worktrees/sources-scratch
```

```bash
git -C C:/Users/jdennen/Dendro/.claude/worktrees/sources branch -D sources-scratch
```

---

## Spec coverage

| Spec section | Task |
|---|---|
| Source keys and names | 1 |
| Licences: `licenseLabelFromUrl`, `LICENSE_PERMISSIONS`, `licenseAllowedAt`, the call sites, the decision record | 1 |
| HTTP hosts, and a rate below 1 | 1 |
| Fetch order (turns, PLANTS after) | 1 (Commons and iNaturalist), 7 (all five) |
| Fetch report (`by source:`) | 1 |
| Bioimages | 2, wired in 7 |
| Trees and Shrubs Online | 3, wired in 7 |
| wildflower.org | 4, wired in 7 |
| Kew POWO: skill, parser, script | 6 |
| Scripts: flags for paths, `cleanCredit`, the control-character rule, exports | 5 |
| Skills: content-run Step 7, photo-check, powo-harvest | 7, 7, 6 |
| Tests: one file per source, fixtures with a dropped row, `photoRoutes()`, the order test, licences, scripts, live suite unchanged | 1 to 7 |
| Checks before the pull request | 8 |
| Owner actions (email Kew, the permission email record, the TSO question) | Left to the owner. The decision record (Task 1) holds the lines for the email. The powo-harvest skill names the Kew email. |
