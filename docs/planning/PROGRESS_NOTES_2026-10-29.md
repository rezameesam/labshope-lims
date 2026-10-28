# Progress notes, 29 October 2026 (resume from here)

> **UPDATE, later the same day (read this first):** the owner said data does not matter and nothing is operational yet, so
> `irmclinic.com` should move to the latest app. Done since the notes below were written:
> - The 15 public `VITE_*` build variables were **copied onto the `irmclinic` Pages project** (Production and Preview). So a `main` push no longer breaks the site's database config.
> - A production rebuild of `cf00714` was started (deployment `c111d2f5`) but is **stuck in "queued"**: both Pages projects still record the old git owner
>   (`IRMClinic`, owner_id `109570620`, repo_id `1124547642`, repo `irmclinic`), and the repo now lives in `LabShope/labshope-lims` (same repo id).
>   The Cloudflare GitHub app **is installed on the LabShope org (all repos, since 2026-10-21)**; it is not installed on the IRMClinic org.
> - **Blocked, needs the owner:** updating each project's git source to `LabShope/labshope-lims` (API: `PATCH /accounts/<id>/pages/projects/<name>` with
>   `source.config.owner='LabShope'`, `owner_id=<LabShope org id>`, `repo_name='labshope-lims'`), or doing it in the dashboard. Until then no new
>   push or retry builds, for either Pages project (the `6671e4e` push was never built). When the connection is fixed, the queued `c111d2f5` should build and
>   become the new `irmclinic.com` production (this is intended; apply the `register_visit` migration first).
> - `irmclinic.com` still serves the old 21 March app (works). Rollback id if the new one misbehaves: `1f3f7df4-9616-4e70-a4d9-c2acd69bf40d`.
> - **Tried and failed:** `PATCH` of the Pages project `source` returns success but Cloudflare ignores it (the project still shows `IRMClinic/irmclinic`).
>   A Pages project cannot be re-pointed to a transferred repo through the API. Options: (A) create a NEW Pages project connected to
>   `LabShope/labshope-lims` (build `npm run build`, output `dist`, branch `main`, the 15 `VITE_*` values), then move the domains to it in the dashboard
>   (the dashboard fixes the DNS records itself; the Wrangler login has no DNS-write scope); or (B) delete and recreate the project with the same name
>   (no DNS change needed, but it destroys deployment history and the rollback target, with a short outage). A was recommended.
> - Wrangler OAuth tokens expire in about an hour; run `npx wrangler whoami` to refresh before using the API helper.
> - Creating a NEW Pages project (`labshope-lims-app`, connected to `LabShope/labshope-lims`, `main`, `npm run build` -> `dist`, the 15 `VITE_*` values) was also
>   blocked by the auto-mode guard; it needs the owner's explicit approval, or the owner can create it in the dashboard. Then move `irmclinic.com`
>   and `www.irmclinic.com` to it (dashboard fixes the DNS itself).
> - **Tests and CI now exist** (`.github/workflows/ci.yml`, green on `main`/`demo`): web (typecheck, lint, unit tests, build), desktop tests, and a database job that
>   rebuilds Supabase from the migrations and runs `supabase/tests/*.test.sql` plus the real-database integration test (`scripts/test-db.sh`, also `npm run test:db`).
>   `live-health.yml` runs `scripts/check-live.mjs` every morning (`npm run test:live`): page loads, build points at the right Supabase project, each lab resolves.
>   `scripts/live-checks.json` marks `irmclinic.com` / `www.irmclinic.com` as known issues (WARN); delete those `knownIssue` lines when they are fixed.
>   CI caught a real problem on its first run: the date tests only passed on an IST machine (fixed by pinning TZ in `src/test/globalSetup.ts`).
> - The three unpushed notes commits were rewritten to drop the Claude co-author trailer (owner preference); 87 older pushed commits still carry it (left alone on purpose).
> - Pushing `main` is currently safe: no Cloudflare build is connected to the repo, and `irmclinic` has its build variables. **When a Pages project is reconnected,
>   remember that every push to its production branch deploys.**
> - **DONE (29 Oct, evening):**
>   - Supabase CLI is logged in as the account that owns project `ceyfwoczyhnwipacwhcn` (named "LIMS", Mumbai); the personal account only sees two other projects.
>   - The `register_visit` migration (`20261029000000`) is **applied to production** (owner ran `supabase db push --linked --yes`; it was the only pending migration). Production types match the committed types.
>   - New Cloudflare Pages project **`labshope-lims-app`** (connected to `LabShope/labshope-lims`, production branch `main`, the 15 `VITE_*` values) built successfully; `https://labshope-lims-app.pages.dev` serves the latest app against the right database.
> - **Remaining:** move `irmclinic.com` and `www.irmclinic.com` from Pages project `irmclinic` to `labshope-lims-app` in the dashboard (the dashboard also fixes the DNS CNAMEs; the Wrangler login cannot edit DNS).
>   Then remove the `knownIssue` lines for those hosts in `scripts/live-checks.json`, add the `www.irmclinic.com` row to `organization_domains`, retire `lab.irmclinic.com` (redirect first), and later delete the old Pages projects `irmclinic` (stale queued deployment `c111d2f5`) and `labshope-lims`.
> - Item 2 below (data comparison) is no longer needed.


Written at the end of a long working session so the work can be picked up later. Nothing here contains a secret.

## The one-paragraph state

The LIMS now has a fast, offline-capable web app (and a desktop wrapper), all merged and live on `lims.labshope.com`.
The repo moved to `LabShope/labshope-lims`. Three tenants exist in Supabase `ceyfwoczyhnwipacwhcn`.
**`irmclinic.com` is currently serving the OLD single-lab IRM app (rolled back on purpose); getting IRM onto the latest app is the main unfinished job.**
The new registration form needs a database function that has **not been confirmed as applied**.

## DO NOT (until the plan below is done)

- **Do not push to `main`.** The Cloudflare Pages project `irmclinic` builds `main` with **no build variables**, so a push rebuilds `irmclinic.com` with no database address and breaks it for IRM. This already happened once (28 Oct 20:13 UTC) and was rolled back.
- **A push to `demo` redeploys production** for `lims.labshope.com`, `abdm.labshope.com`, `lab.irmclinic.com` and `www.shuhul.com` (Pages project `labshope-lims`, production branch `demo`). Fine when intended, not for casual commits.
- **Do not delete `lab.irmclinic.com`** until `irmclinic.com` serves the latest app. Today it is the only IRM address running the new app.
- Never run `supabase db push`; the owner applies migrations to the remote project by hand.

## Repositories

| What | Where |
| --- | --- |
| LIMS app | `LabShope/labshope-lims` (private; moved from `IRMClinic/irmclinic` on 2026-10-29; old URL redirects). Branches: `main`, `demo` (identical at `6671e4e` when last pushed), `production` (old, at `a97609c`), `chore/cloudflare-git-deploy` (open PR #36) |
| Company site | `LabShope/labshope-website` (labshope.com) |
| Radarx site | `LabShope/radarx-website` |
| Older combined site | `syedhamidali/labshope-web` (looks superseded; not moved) |
| IRM's own static site | `IRMClinic/irmclinic.github.io` (stays with IRM) |

## Supabase projects (both alive)

- **`ceyfwoczyhnwipacwhcn`**: the multi-tenant LabShope platform. This is what the latest app uses.
  Organizations: `irm` (`99809454-b99a-47a5-a07b-b71e636ef44b`), `demo` (`9cd58e18-46c2-4d21-9918-c164b0659e5f`, also holds `shuhul.com` domains), `lifeline` (`4281badb-c6cc-43ea-a6ca-b793deb946a5`).
  All three were auto-suspended by the daily trial-expiry job (`pg_cron`, `trial_ends_at` in the past).
  `irm` and `demo` were reactivated by the owner (`status='active'`, complimentary). **`lifeline` reactivation + rename to "Lifeline Clinical Laboratory": SQL was given, the owner has NOT confirmed running it.**
- **`pxsutovdzppoyyfrbeaw`**: the original IRM single-lab project. The old `irmclinic.com` build (commit `907a41d`) is hard-wired to it. Five old ops scripts also target it (`set-email-secrets.sh`, `import_sql.sh`, `run_sql_import.py`, `run_coordinate_update.sh`, `test-email-service.sh`).
  **Unknown: which project holds IRM's current, real patient data.** Must be answered before moving `irmclinic.com` to the latest app.

## Cloudflare (account `35ce61837cc5b900d87bbeb2332e83ad`, "Admin@irmclinic.com's Account")

`wrangler login` was done by the owner (OAuth). Scopes: Workers/Pages write, zone read, **no DNS write**. The auto-mode guard blocks production changes (rollback was allowed only after explicit owner approval; editing project variables was blocked).

| Pages project | Git | Production branch | Domains | Build variables |
| --- | --- | --- | --- | --- |
| `labshope-lims` | `IRMClinic/irmclinic` (old name) | `demo` | `lims.labshope.com`, `abdm.labshope.com`, `lab.irmclinic.com`, `www.shuhul.com`, `labshope-lims.pages.dev` | 15 `VITE_*` plain-text values (complete) |
| `irmclinic` | `IRMClinic/irmclinic` (old name) | `main` | `irmclinic.com`, `www.irmclinic.com`, `irmclinic.pages.dev` | **none** |
| `labshope-website` | yes | | `labshope.com`, `www.labshope.com` | |
| `radarx-website` | yes | | `radarx.labshope.com` | |

- `irmclinic` production was **rolled back** to deployment `1f3f7df4-9616-4e70-a4d9-c2acd69bf40d` (commit `907a41d`, 21 Mar 2026, old IRM app). The broken one was `3c44bc33` (commit `cf00714`). Rollback API: `POST /accounts/<id>/pages/projects/irmclinic/deployments/<id>/rollback`.
- Both Pages projects are still linked to the old GitHub repo path. The push of `6671e4e` (after the move) did **not** trigger a build, so the Cloudflare GitHub app must be re-pointed at the LabShope repo.
- Mail for `irmclinic.com` is Zoho (MX) plus Mailjet/Yandex in SPF. Never touch MX/TXT when changing DNS.
- Wildcard `*.labshope.com`: every active org answers at `<slug>.labshope.com` by design (tenant lookup falls back to the slug), so `irm.labshope.com` cannot be disabled without renaming the slug.

## What was built (all merged to `demo`/`main`, tested)

- `register_visit` database function: one atomic, idempotent call instead of about 7 requests. File: `supabase/migrations/20261029000000_register_visit_rpc.sql`. SQL test: `supabase/tests/register_visit.test.sql` (9 cases).
- Offline layer (`src/lib/offline/`): per-lab IndexedDB (catalog, patients, 90 days of invoices), outbox with retry and error classification, patient-edit queue, auth/workspace caches so the app opens with no network, even with an expired login. Verified in the real UI against a local database.
- Lab Sheets tab: Excel-style Visit register and editable Patients register (`src/components/sheet/`): sort, filter operators, copy/paste, fill-down, undo, CSV export.
- Desktop app (`desktop/`, Electron, macOS/Ubuntu/Windows) and release workflow `.github/workflows/desktop-release.yml`. Verified on macOS only.
- Fixed 8 runtime bugs, regenerated Supabase types, `npm run typecheck` is at 0 errors, `npm run check` runs typecheck + lint + tests.

## Open items, in the order to do them

1. **Apply the `register_visit` migration to `ceyfwoczyhnwipacwhcn`** (SQL editor). The live `labshope-lims` build already calls it; until applied, registering a visit there fails and lands in the sync badge as "needs attention". Not confirmed applied.
2. **Confirm where IRM's data is.** Compare `select count(*), max(created_at) from patients;` in `pxsuto...` with `select count(*), max(created_at) from patients where organization_id = '99809454-b99a-47a5-a07b-b71e636ef44b';` in `ceyfwocz...`.
3. **Give the `irmclinic` Pages project the 15 build variables** (copy from `labshope-lims`, Production and Preview). Dashboard: Workers & Pages > project > Settings > Variables and Secrets. Or allow the assistant to do it.
4. **Switch `irmclinic.com` to the latest app**: trigger a production build of `main` after step 3 (do not rely on a push), log in as IRM staff at `https://irmclinic.com/auth/staff`, keep the rollback id above ready.
5. **Domain rows for IRM** (SQL given, not confirmed run): make `irmclinic.com` primary, add `www.irmclinic.com`, remove `lab.irmclinic.com` (only after step 4).
6. **Retire `lab.irmclinic.com`**: first a redirect to `irmclinic.com`, later remove the Pages custom domain and the `lab` DNS record (DNS edit needs the dashboard or a token with DNS write). Also check Supabase function secrets `SITE_URL`, `PATIENT_PORTAL_URL`, `PATIENT_PORTAL_RESET_URL` and Auth redirect URLs for `lab.irmclinic.com`; Turnstile allowed hosts must include `irmclinic.com` and `www.irmclinic.com`.
7. **Re-point Cloudflare Git** (both Pages projects) to `LabShope/labshope-lims`.
8. **Desktop release**: set the repository Variables listed in `desktop/README.md` (public values; Supabase URL is `https://ceyfwoczyhnwipacwhcn.supabase.co`), run the workflow manually as a dry run (checks Windows/Linux), then publish. Auto-update needs a public place for releases (the repo is private).
9. **Smaller**: Careers Google Form link returns a sign-in wall; five old scripts point at `pxsuto...` (decide which project is canonical, then fix or delete them); Lifeline decision (reactivate vs extend trial); `register_visit`-style offline invoice-number leasing and offline result entry are not built; Sheets have no formulas/charts yet.

## Quick checks to resume with

Public tenant lookup (same call the site makes; read-only). Get the publishable key from the deployed bundle (`sb_publishable_...` in `index-*.js` on `lims.labshope.com`):

```bash
curl -s -X POST https://ceyfwoczyhnwipacwhcn.supabase.co/rest/v1/rpc/get_public_organization_context \
  -H "apikey: <publishable key>" -H "Content-Type: application/json" \
  -d '{"_domain":"irm.labshope.com","_slug":"irm"}'
```

Which build is each hostname serving: `curl -s https://<host>/ | grep -o '/assets/index-[^"]*\.js'`, and check whether it contains the database address (`grep -o 'https://[a-z0-9]*\.supabase\.co'` on that file). `irmclinic.com` should show `pxsutovdzppoyyfrbeaw` until the switch (step 4) and `ceyfwoczyhnwipacwhcn` after.

Local testing without touching production: see the memory note "reference_local_supabase_testing" (isolated Supabase on alternate ports, run the app with env overrides, drive the UI headlessly with Electron).

## Housekeeping

- Docker Desktop was started during the session and is still running.
- A temporary Cloudflare API helper was left at `/tmp/cfapi.py` (reads the Wrangler login; it may be cleared on reboot).
- Local `demo` may be one commit ahead of `origin/demo` (this notes file): it is intentionally unpushed.
