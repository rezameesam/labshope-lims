# Deploying LabShope LIMS from git to Cloudflare

Written after comparing the live site with this repository (October 2026).

## What is live today, and where it comes from
- https://labshope.com, https://lims.labshope.com and **every** `<anything>.labshope.com` are served by one Cloudflare Worker
  (`tight-river-11a4`, uploaded by hand from the dashboard in spring 2026, no git source). Wildcard DNS plus a wildcard route
  carry the lab subdomains: the app reads the host name and treats `<slug>.labshope.com` as the lab `<slug>`
  (`src/lib/publicTenant.ts`; `lims.labshope.com` is the platform host).
- The live files match this repository's **`demo` branch at commit `a97609c` (6 April 2026)**, which is now the `production`
  branch: it contains the double-entry finance module (a chunk present on the live site) and not the next commit, the quick
  register form (absent from the live site). Evidence, not proof: the production build settings could not be reproduced, so the
  main bundle's file name differs (see "Check that a build equals what is live"). `main` is 178 commits behind and is **not**
  what is deployed.
- A copy of the live public files is kept, with checksums, in the private repo `LabShope/labshope-lims-live-snapshot`.

## Recommended path: Cloudflare Workers Builds (no token in GitHub)
1. Cloudflare dashboard > Workers & Pages > Create > **Import a repository** > install the Cloudflare GitHub app on the organisation
   that owns this repo and give it access to this repo only.
2. Production branch: `production`. Build command: `npm ci && npm run build`. Deploy command: `npx wrangler deploy`.
3. Build variables (Settings > Variables and secrets > *Build* variables). Names only here, take the values from the production
   settings you already use (they are public values that end up in the browser bundle, never put a service-role key or any
   other secret in a `VITE_` variable):
   `VITE_PUBLIC_BASE_DOMAIN`, `VITE_PLATFORM_HOSTNAME`, `VITE_PAGES_CNAME_TARGET`, `VITE_PUBLIC_LOGO_URL`, `VITE_PLATFORM_LABEL`,
   `VITE_PLATFORM_PRODUCT_NAME`, `VITE_PLATFORM_COMPANY_NAME`, `VITE_PLATFORM_CONTACT_EMAIL`, `VITE_PLATFORM_TAGLINE`,
   `VITE_RAZORPAY_KEY_ID`, `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `VITE_TURNSTILE_SITE_KEY`
   (the list is `.env.example`; check it against the current one). A wrong or missing value builds a site that looks fine and
   points at the wrong place, so compare with the check below.
4. The first deploy creates the Worker **`labshope-lims-app`** on a `workers.dev` address. It does **not** touch the live site.

## Check that a build equals what is live
Compare the asset file names of the new build with the live site (names are content hashes). With the right commit AND the right
build variables, `assets/index-*.js` has the same name as the live one (`index-BEbkcSqJ.js` at the time of writing) and almost
all other names match. If not, a variable differs.
```bash
curl -s https://labshope.com/ | grep -o '/assets/index-[A-Za-z0-9_-]*\.js'
# and in a local build:  ls dist/assets | grep '^index-.*\.js$'
```

## Switching the real traffic (quiet window, with a rollback)
Do NOT add `routes` to `wrangler.jsonc`. In the dashboard:
1. Test the `workers.dev` address completely: sign in as staff, open a lab's patient list, create and print a report, upload a file.
   On a `workers.dev` host the app behaves as the platform; lab subdomains can only be tested after step 2.
2. Workers & Pages > `labshope-lims-app` > Settings > Domains & Routes: add the **route** `*.labshope.com/*` (zone labshope.com) and the
   custom domain `lims.labshope.com`. A custom domain takes an exact host name; wildcard hosts need a route plus the existing
   wildcard DNS record (leave DNS alone). Remove the same route from `tight-river-11a4` at the same moment.
3. Rollback: put the route back on `tight-river-11a4` (its deployment is kept in its Deployments list) and remove it from the new Worker.
4. Mail DNS (MX, SPF, DKIM for Mailjet and Cloudflare Email Routing) is separate from the Worker and must not be touched.

## Things that depend on the host name (check before and after any domain change)
- Supabase Auth (project `ceyfwoczyhnwipacwhcn`): site URL and redirect URLs must include every host that signs in.
- Cloudflare Turnstile widget: the allowed host names must include every host that shows the widget.
- Razorpay and the Content-Security-Policy in `index.html` (hosts listed there).
- `index.html` canonical, `og:` and `twitter:` tags point to `https://labshope.com`; when the company home page takes the apex, point them
  to `https://lims.labshope.com`.
- Other products on `radarx.labshope.com` (and any other fixed subdomain): the wildcard sends every unknown name to this app, where the
  host name is read as a lab slug. An exact **custom domain** on another Worker should win over the wildcard route; **test it**, and if
  this app still answers, add a route for that exact host with no Worker (or exclude it) in the dashboard.
