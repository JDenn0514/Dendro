# Virginia Tech Dendrology photo permission

Date: 2026-09-26. Status: decided, in use.

## Decision

Dendro uses photos from the Virginia Tech Dendrology fact sheets (`dendro.cnre.vt.edu`). This is the second exception to the licence allowlist (public domain, US government work, CC0, CC BY, CC BY-SA). The first is wildflower.org (`docs/decisions/2026-09-25-wildflower-permission.md`). The site gives permission for non-commercial use in a statement on every page. Dendro does not send a request.

## The statement

The statement is under the "Photo Use" button at the bottom of every page of `https://dendro.cnre.vt.edu/dendrology/`. One such page is `https://dendro.cnre.vt.edu/dendrology/leafkey1.cfm?state=MD&zone=&habit=tree&leaftype=broadleaf&Phyllotaxy=alternate`. The owner read it in a browser on 2026-09-26:

> You are welcome to use the photos as long as it is always for nonprofit uses. Please give us credit when possible! Virginia Tech Department of Forest Resources and Environmental Conservation. Links to our pages are welcome, web addresses are generally stable. Copyright is retained by the photographers. For further information, contact Eric Wiseman

The footer of each fact sheet reads: "All material © 2025 Virginia Tech Dept. of Forest Resources and Environmental Conservation; Photos and text by: John Seiler, Edward Jensen, Alex Niemiera, and John Peterson".

The permission covers the photos only. It does not cover the fact-sheet text.

## Scope

- Use: non-commercial only.
- Host: `dendro.cnre.vt.edu` only.
- Licence text on each row: `used with permission, non-commercial`. `licenseAllowedAt` in `pipeline/lib/licenses.ts` accepts this text only when the row's origin host is `www.wildflower.org` or `dendro.cnre.vt.edu`. Each host has its own entry in `LICENSE_PERMISSIONS` in the same file.
- `--source`: `VT Dendrology`, a short name for the photo credit (owner ruling 2026-09-26). The Sources screen of the app (`#/sources`) gives the full name, `Virginia Tech Dendrology, Department of Forest Resources and Environmental Conservation, Virginia Tech`, so the credit names the Department, as the statement asks. The table of full names is `app/logic/sources.js`. The credit links the short name to its entry on that screen.
- `--author`: the photographer list from the fact-sheet footer, word for word: `John Seiler, Edward Jensen, Alex Niemiera, and John Peterson`. The one exception is an image page that names one photographer. Then `--author` is that name.
- Origin: the fact-sheet url plus `#image=<file name>`, for example `https://dendro.cnre.vt.edu/dendrology/syllabus/factsheet.cfm?ID=240#image=fruit1.jpg`. The credit links to that page.
- Credit line in the app: `John Seiler, Edward Jensen, Alex Niemiera, and John Peterson; VT Dendrology; used with permission, non-commercial.` The author holds commas, so the app puts semicolons between the three parts. Only `VT Dendrology` credits take semicolons. Every other credit keeps commas (owner ruling 2026-09-26).
- Only the leaf, bark, and fruit photos are used. Flower, twig, form, fall, and wood photos and the range maps are not used.
- Photo size: the fact-sheet photos are about 250 x 330 px. The page links no larger file. The owner accepted this size on 2026-09-26, and no size rule applies.

## Rate rules

- An automated tool sends 1 request per second at most (`RATE_PER_SECOND` in `pipeline/lib/http.ts`).
- An automated tool stores the pages and the images it gets, and does not ask for them again (`CACHE_DAYS`).
- The row maker is `pipeline/scripts/vt-rows.ts`. It reads the saved fact sheet in `pipeline/sources/raw/<SYMBOL>.vt.html` first, and fetches a page only when the saved copy is missing.

## If Dendro becomes commercial

Search `content/images/manifest.json` for `used with permission, non-commercial` with the source `VT Dendrology`. Each row found rests on this permission. Retire those images, or get a commercial licence from the photographers first. The statement names Eric Wiseman as the contact.
