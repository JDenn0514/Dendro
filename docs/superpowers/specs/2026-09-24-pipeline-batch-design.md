# Pipeline batch: source order, colour check, duplicate refusal

Date: 2026-09-24. Status: approved design, before the plan.

## 1. Purpose

Three fixes to the content pipeline, carried forward from the ledger of the
first two content runs (`.superpowers/sdd/2026-09-22-content-pipeline/progress.md`).
Each one cuts review work or enforces an owner ruling that today lives only in
the ledger or in a scratchpad script.

1. Rank PLANTS last in the fetch, so monochrome plates do not fill the
   candidate cap ahead of Commons and iNaturalist photos.
2. Measure colour at fetch time and drop monochrome candidates before a
   reviewer sees them. Add an audit command for existing runs and the
   published manifest.
3. Make `photos add` refuse a candidate id that already exists in the run.

Out of scope, and carried to the sources spec: new photo sources (Bioimages,
Trees and Shrubs Online, Kew POWO), the scratchpad harvest scripts
(`harvest.cjs`, `mkadds.cjs`), and the non-ASCII author credit rule.

## 2. Rulings this spec enforces

- Colour photographs only (owner, 2026-09-24). A black-and-white or monochrome
  image is a reject, not an escalation.
- A harvester must put an image fragment on a multi-image origin page, because
  the candidate id is `sha1(target|origin)` and two images from one origin
  collide (ledger, Step 15 follow-ups).
- Retiring a published image is the owner's action through `images retire`.
  No command in this spec retires anything.

## 3. Source order

### Today

`photosFetch` in `pipeline/lib/commands.ts` pushes rows in the order PLANTS,
Commons, iNaturalist (lines 334-336). `collect` in `pipeline/lib/candidates.ts`
takes rows in that order until `MAX_PER_SPECIES` (60). With one exemplar per
target, every PLANTS row lands first. PLANTS rows are herbarium plates and most
are monochrome.

### Change

Push the rows in the order Commons, iNaturalist, PLANTS. No other change to
`collect`, `mergeFound`, or the caps. PLANTS stays the taxonomy source and its
colour plates still enter when the cap has room.

## 4. Colour check

### 4.1 The measure

New module `pipeline/lib/chroma.ts` with one export:

```ts
export async function chromaOf(bytes: Uint8Array): Promise<number>
```

It uses `sharp` (already a root dev dependency, used by
`pipeline/lib/sharp_resizer.ts`):

1. Resize so the long side is 200 px, keep aspect.
2. Read raw RGB pixels.
3. For each pixel take `max(r, g, b) - min(r, g, b)`.
4. Return the mean over all pixels.

A colour photograph scores well above 12. A grey plate scores near 0. The
scratchpad script `mono-check.cjs` used this measure on the concept run: 21
approved images checked, 1 monochrome found at a threshold of 12, and the 5
lowest scores viewed by the controller confirmed the cut.

The threshold is a named constant in `pipeline/lib/candidates.ts` next to
`MAX_PER_SPECIES`:

```ts
export const MONO_THRESHOLD = 12;
```

If `sharp` cannot decode the bytes, `chromaOf` throws. Callers decide what a
throw means (see below).

### 4.2 In `photos fetch`

In `photosFetch`, after `download(deps, row)` and before the append:

1. Read the cached file at `row.local`.
2. Call `chromaOf`.
3. If the score is under `MONO_THRESHOLD`, do not append the row. Add 1 to a
   new run scope counter `mono_dropped`.
4. If `chromaOf` throws, treat the row the same as a download failure today:
   do not append, add 1 to `fetch_failures`.

The cache file stays on disk. The cache directory is git-ignored, and a rerun
measures the file again from the cache without a new download.

Logging: one line per target on stderr,
`<target>: <n> monochrome dropped`, printed only when `n > 0`. The final
summary line grows one clause:

```
<n> candidates appended to <path>, <m> download failures, <k> monochrome dropped
```

`run.json` gains the field `mono_dropped: number`, default 0, serialized and
validated the same way as `fetch_failures` in `pipeline/lib/run.ts`.

### 4.3 In `photos add`

`photosAdd` runs the same measure after its download (or on the `--local` file
when one is given). A monochrome image is refused:

```
refused: <id> for <target> is monochrome (chroma <score>, threshold 12). Colour photographs only (owner ruling 2026-09-24).
```

Nothing is written. Exit code 1. The duplicate check in section 5 runs before
the download, so a duplicate never reaches this step.

### 4.4 `photos audit`

New command, registered in the `COMMANDS` map in `pipeline/lib/commands.ts`:

```
cli photos audit <run> [--threshold <n>]
cli photos audit --manifest [--threshold <n>]
```

**Run mode.** Read `pipeline/runs/<run>/candidates.jsonl`. For each row with a
`local` path that exists, measure it. Rows with no `local` or a missing file
are counted as skipped. Print one line per row under the threshold:

```
<id> <target> <channel_hint or -> <score> <origin>
```

**Manifest mode.** Read `content/images/manifest.json`. Skip rows with
`retired: true`. For each row, fetch `img/<hash>.jpg` from the image CDN base
through the HTTP layer, which caches it. Measure and print one line per row
under the threshold:

```
<hash> <target> <channel> <score> <origin>
```

**Both modes** end with one summary line:

```
<total> measured, <skipped> skipped, <under> under threshold <t>
```

Exit code is 0 in every case, including when rows are under the threshold. The
command reports. Retiring is the owner's decision.

The CDN base is `deps.cdnBase` on `CliDeps`, set in `pipeline/cli.ts` from the
app's `CDN_BASE` constant. The image URL is `${deps.cdnBase}${objectKey(hash)}`,
the same form the report command uses.

## 5. Duplicate id refusal

In `photosAdd`, before any download:

1. Compute `candidateId(origin, target)`.
2. Read `candidates.jsonl` for the run. If a row with that id exists, print:

```
refused: candidate <id> already exists for <target>
  existing origin: <origin of the existing row>
  add a fragment to the origin URL (for example #img2) to distinguish a second image on the same page
```

3. Exit 1. Nothing written, nothing downloaded.

## 6. Tests

All tests run under `npm run test:all` (app, pipeline, live). Live tests do
not change.

**`pipeline/tests/chroma.test.ts`** (new). Build two JPEGs in memory with
`sharp`: a flat grey 64x64 image and a red 64x64 image. Assert the grey scores
under 12 and the red scores above 12. Assert that garbage bytes make
`chromaOf` throw.

**`pipeline/tests/cli_fetch.test.ts`** (existing, four new cases). The file's
`fakeHttp` helper serves fixture bytes; the new cases serve the two JPEGs
above.

1. Source order: with a cap small enough to bite, the appended rows hold
   Commons and iNaturalist rows and no PLANTS row.
2. Monochrome fetch row: a grey image is not appended, `mono_dropped` is 1,
   the per-target line and the summary clause print.
3. Monochrome manual add: `photos add` of a grey image exits 1, prints the
   refusal, and `candidates.jsonl` is unchanged.
4. Duplicate manual add: `photos add` with a target and origin already in
   `candidates.jsonl` exits 1, prints the existing origin, and downloads
   nothing (the fake HTTP sees no request).

**`pipeline/tests/cli_audit.test.ts`** (new).

1. Run mode over a fixture run directory holding one grey and one red cached
   file and one row with no `local`: one line printed, summary reads
   `2 measured, 1 skipped, 1 under threshold 12`.
2. Manifest mode over a three-row manifest: one grey, one red, one retired.
   The fake HTTP serves the two images. One line printed, summary reads
   `2 measured, 0 skipped, 1 under threshold 12`, and the retired hash was
   never requested.
3. `--threshold 0` prints no lines.

## 7. Documentation

- `.claude/skills/content-run/SKILL.md`: one line after the build step,
  "Run `cli photos audit <run>` to list any candidate under the colour
  threshold. The fetch already drops these, so the list is normally empty."
- `docs/superpowers/specs/2026-09-22-content-pipeline-design.md`: a short
  note under the fetch section that source order is Commons, iNaturalist,
  PLANTS, and that monochrome rows are dropped at fetch with the threshold
  named.

## 8. After the merge

Run `cli photos audit --manifest` on main over the 595 published rows and give
the owner the list of any row under the threshold. The owner decides which to
retire. Run 1's 390 photos were never checked against the colour ruling.
