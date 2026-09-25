# Hosting and accounts

Date: 2026-09-25. Status: decided, not started.

## Decision

When Dendro adds user accounts, move the site from GitHub Pages to Cloudflare. Put the account backend in the same Cloudflare account that already holds the R2 bucket `dendro-images` and the domain `learndendro.com`.

Until then, the site stays on GitHub Pages.

## Why photos are in R2, not a database

- The photos are fixed files. The app never queries them, so a database gives no feature the app uses.
- R2 charges nothing for egress. One session loads about 20 MB of photos. The Supabase free tier has a small bandwidth limit, and it pauses a project after about a week with no traffic.
- The photo metadata stays in git, in `content/images/manifest.json`, so each approval shows up as a diff in a pull request.
- The upload code uses the standard S3 client, so a move to another S3-compatible host is a config change.
- Source: `docs/superpowers/specs/2026-09-22-content-pipeline-design.md`, lines 131-133 and 710-717.

## Why move off GitHub Pages at that point

GitHub Pages serves static files only. Accounts need code that runs on a server. Other limits of Pages:

- No custom HTTP headers (`Cache-Control`, Content Security Policy) and no server-side redirects.
- No preview URL for each pull request.
- GitHub's terms say Pages is not for running an online business.

Bandwidth is not a reason. The photos come from R2.

## Plan for accounts

- Host the site on Cloudflare **Workers with static assets**, not Cloudflare Pages. Cloudflare now points new projects to Workers.
- A Worker handles the account requests. D1, Cloudflare's SQLite database, stores progress.
- The site and the API share one domain. Sign-in cookies stay simple, and the app needs no CORS setup.
- Do not write the sign-in code by hand. Use a library or a service, for example Better Auth on D1, or Clerk.
- On the first sign-in, upload the progress that the browser already holds in localStorage, so no user loses progress.

## Cost

Dendro is expected to fit the Cloudflare free plan. The figures below come from Cloudflare's pricing pages, read on 2026-09-25.

| Service | Free plan | Paid plan |
|---|---|---|
| Static asset requests | Free and unlimited | Free and unlimited |
| Workers requests | 100,000 a day | 10 million a month included, then $0.30 a million |
| Workers CPU time | 10 ms for each request | 30 million ms a month included, then $0.02 a million ms |
| D1 rows read | 5 million a day | 25 billion a month included, then $0.001 a million |
| D1 rows written | 100,000 a day | 50 million a month included, then $1.00 a million |
| D1 storage | 5 GB total | 5 GB included, then $0.75 a GB-month |
| R2 storage | 10 GB-month a month | $0.015 a GB-month |
| R2 Class A operations (writes) | 1 million a month | $4.50 a million |
| R2 Class B operations (reads) | 10 million a month | $0.36 a million |
| R2 egress | Free | Free |

- The Workers Paid plan costs a minimum of $5 a month. It includes the paid figures for Workers and D1.
- The photos take about 150 MB, which is 1.5% of the free R2 storage.
- Static asset requests do not count toward the Workers request limit. Only the account requests do.
- The R2 free tier covers Standard storage only, not Infrequent Access storage.
- Static assets have file limits for each deploy: 20,000 files on the free plan, 100,000 on the paid plan, and 25 MiB for each file. Dendro is far under these limits, because the photos are in R2.
- `run_worker_first` sends requests through the Worker before the static assets. Those requests count toward the Workers request limit, and they are not free static asset requests. Send only the account API paths through the Worker. Do not send every page through it to check the sign-in.

Sources:

- Workers and D1: https://developers.cloudflare.com/workers/platform/pricing/
- Static asset limits and billing: https://developers.cloudflare.com/workers/platform/limits/#static-assets and https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- R2: https://developers.cloudflare.com/r2/pricing/

## Options

- The move can happen before accounts. The site is static files, so the move is small. An early move gives preview URLs and custom headers, and it keeps the host change apart from the accounts work.
- Rejected: keep GitHub Pages and add Supabase for sign-in and progress. It works from a static site, but it adds a second provider and the free-tier pause.
