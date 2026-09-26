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
