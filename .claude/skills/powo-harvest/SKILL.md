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
2. **Find the IPNI id.** The id is in the href of the result link, not in the visible text.
   Run `mcp__Claude_Browser__javascript_tool` with
   `[...document.querySelectorAll('a[href*="ipni.org:names:"]')].map((a) => [a.textContent.trim(), a.getAttribute('href')])`.
   The script reads the open page, so it loads nothing new. Each href holds
   `urn:lsid:ipni.org:names:<IPNI id>`. Pick the link of the accepted name that matches the
   scientific name, and take the IPNI id from its href. Use `mcp__Claude_Browser__get_page_text`
   only to confirm the result name. Do not click the result: that is one more Kew page load.
   When the list is still empty, wait 5 seconds (`mcp__Claude_Browser__computer`, action
   `wait`) and run the same script again. That is not a new page load.
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

The saved gallery file is the evidence for each POWO row. For each species, give the
reviewer who runs `photo-check` these two paths:

- The saved gallery: `<scratch>/<SYMBOL>-<IPNI id>.html`.
- The rows file: `<scratch>/<SYMBOL>-rows.json`. It shows the fields that the parser read
  from each caption.

Keep both files until each POWO row has a verdict.

The reviewer confirms the species and the licence of a POWO row from these files:

- **Species.** Find the file hash of the row in the saved gallery. The hash is the text after
  `#image=` in `origin`. Read the name at the start of the caption of that image. Judge that
  name as `photo-check` judges the name on a source page.
- **Licence.** In the same caption, read the licence text after `ID:<n>`. The row's
  `license` must show the same holder and the label of the same Creative Commons URL.

The reviewer never opens the `origin` URL of a POWO row, with WebFetch, the browser, or any
other tool. `photo-check` tells the reviewer to open the source page at `origin`. For a POWO
row, the saved gallery takes the place of that page. Each origin is a Kew page, and a new
load breaks the rules above. When a saved file is missing, do not load the Kew page again.
Tell the owner.

## What this skill does not do

- It does not pass a challenge page, sign in, or accept non-essential cookies.
- It does not keep herbarium sheets.
- It does not commit. `photos add` does not commit either.
- It does not email Kew. The owner emails `BI@kew.org` to say that Dendro uses POWO images.
