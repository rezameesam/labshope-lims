# LabShope LIMS

## How can I edit this code?

**Use your preferred IDE**

Clone this repo and push changes. The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

If you need a starting point for environment variables, copy:

```sh
cp .env.example .env.local
```

## Tests

| Command | What it checks |
| --- | --- |
| `npm run check` | typecheck + lint + unit tests (this is what CI runs for the web app) |
| `npm run test:db` | rebuilds a throw-away Supabase from the migrations, then runs the SQL tests and the real-database integration test (needs Docker, the Supabase CLI and psql) |
| `npm run test:live` | looks at the deployed sites from the outside: page loads, the build points at the right Supabase project, each lab resolves |
| `cd desktop && npm test` | the desktop app's tests |

**Deploy gate:** Cloudflare Pages deploys production from the `release` branch, and CI moves `release` forward only after the
web, desktop and database jobs all pass on `main`. A broken commit on `main` never reaches the lab sites. (GitHub branch protection
needs a paid plan for private repositories, so the gate sits in front of deployment instead.) To deploy by hand in an emergency,
fast-forward `release` yourself: `git push origin <commit>:release`.

GitHub Actions runs the first, second and fourth on every push and pull request (`.github/workflows/ci.yml`) and the live check every morning
(`.github/workflows/live-health.yml`). A red job names the part that broke.

## Local Supabase

Start the local stack and rebuild the database from migrations:

```sh
supabase start
supabase db reset
```

Seed a second local organization for tenant-isolation testing:

```sh
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f scripts/seed_local_second_organization.sql
```

Run the repeatable local multi-tenant smoke test:

```sh
bash scripts/run_local_multitenant_smoke.sh
```

The root/public site now behaves separately from tenant sites:

- root or platform host `/` shows the product landing page
- root `/features` shows the dedicated product features page
- root `/pricing` shows the dedicated product pricing page
- root `/contact` shows the product contact/sales page
- root `/start` shows the self-serve setup/onboarding request page with custom-domain-first onboarding and fallback launch subdomain handling
- root `/book-demo` is the primary product demo-request page
- root `/book-test` still works as backward-compatible access to the product demo flow
- platform admins can sign in at `/platform/login`
- platform admins can use `/platform` as the software-owner overview
- platform admins can review root-site leads at `/platform/leads`
- platform admins can review self-serve onboarding submissions at `/platform/onboarding`
- platform admins can approve and provision self-serve onboarding requests into live tenant workspaces from `/platform/onboarding`
- platform admins can inspect customer tenants at `/platform/customers`
- platform admins can open a tenant drilldown at `/platform/customers/:orgId`
- tenant hosts keep the lab-branded homepage, booking flow, auth, and portal routes

ABDM groundwork is now started too:

- `System Settings` includes an `ABDM` tab for tenant-aware sandbox configuration
- the settings layer now supports an `abdm` category through migration:
  - `supabase/migrations/20260315170000_add_abdm_settings_category.sql`
- patient ABDM identity groundwork is now in the schema and admin intake:
  - `supabase/migrations/20260315173000_add_patient_abdm_identity_fields.sql`
  - `ManagePatients` now supports `abha_number`, `abha_address`, `abdm_link_status`, and linked timestamps
- the first sandbox-safe backend scaffold now exists:
  - `supabase/functions/_shared/abdm-settings.ts`
  - `supabase/functions/abdm-scan-share/index.ts`
  - `supabase/migrations/20260315174500_create_abdm_scan_logs.sql`
- the ABDM sandbox scaffolding is now aligned to the actual `Scan and Share` `profile-share` callback shape from the ABDM Postman collection
- additional ABDM tenant settings now exist for real sandbox readiness:
  - `abdm_client_id`
  - `abdm_client_secret`
  - `abdm_callback_url`
  - `abdm_hpr_id`
- inbound ABDM callback handling now exists too:
  - `supabase/functions/abdm-profile-share/index.ts`
  - `supabase/migrations/20260315180500_expand_abdm_scan_log_request_types.sql`
  - `supabase/migrations/20260315181000_create_abdm_profile_shares.sql`
- the callback path resolves tenants by `abdm_hip_id`, stores inbound payloads, and attempts patient matching within the tenant
- outbound ABDM acknowledgement scaffolding now exists too:
  - `supabase/functions/abdm-on-share/index.ts`
  - `supabase/migrations/20260315183000_add_abdm_on_share_tracking.sql`
- `abdm_profile_shares` now track `on_share` delivery state, attempted time, error, and response payload
- `ManagePatients` now includes a tenant-aware `Scan with ABDM` prefill flow for admin intake
- `ManagePatients` also now surfaces recent inbound ABDM profile shares and lets staff prefill a new patient or open a matched one
- `Quick Setup` now keeps ABDM simpler for labs:
  - organization settings keep the ABDM credentials, HIP, and gateway configuration
  - each lab can optionally enable ABDM for that branch and save its own facility / HFR ID
  - patient intake prefers the selected lab's facility ID and only falls back to the organization-level value when needed
- `System Settings` is now more lab-self-serve friendly too:
  - Razorpay, WhatsApp Cloud API, SMS/OTP, email-provider, and ABDM fields are exposed as plain organization settings instead of relying on hardcoded defaults
  - provider tabs now include direct setup links and simpler guidance for where labs should get each value
  - WhatsApp settings now also expose operational fields used by the code such as enable/disable, template names, language code, and default country code
- planning docs:
  - `ABDM_INTEGRATION_PLAN.md`
  - `ABDM_SCAN_AND_SHARE_SPEC.md`

Useful root-site branding env vars:

- `VITE_PLATFORM_PRODUCT_NAME`
- `VITE_PLATFORM_COMPANY_NAME`
- `VITE_PLATFORM_LABEL`
- `VITE_PLATFORM_TAGLINE`
- `VITE_PLATFORM_CONTACT_EMAIL`

For staging rollout, use:

```sh
# Deployment order and required secrets/settings
open STAGING_DEPLOYMENT_CHECKLIST_MULTI_TENANT.md

# Show the release manifest
bash scripts/print_multitenant_release_manifest.sh

# Deploy the multi-tenant edge-function set
bash scripts/deploy_multitenant_functions.sh --dry-run
bash scripts/deploy_multitenant_functions.sh

# Browser and runtime smoke checklist
open STAGING_SMOKE_TEST_MULTI_TENANT.md

# SQL spot checks to run against staging after deploy
cat scripts/staging_sql_spot_checks.sql
```

For production rollout after staging passes, use:

```sh
open PRODUCTION_ROLLOUT_CHECKLIST_MULTI_TENANT.md
```

For onboarding a new tenant after IRM, use:

```sh
open TENANT_ONBOARDING_CHECKLIST.md
cat scripts/provision_organization_payload.example.json
cat scripts/tenant_post_provision_checks.sql
```

For commercial packaging and launch prep, use:

```sh
open GO_TO_MARKET_PRICING.md
open SALES_ONE_PAGE_OFFER.md
open LANDING_PAGE_COPY.md
open ABDM_INTEGRATION_PLAN.md
open ABDM_SCAN_AND_SHARE_SPEC.md
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Build the project with `npm run build` and deploy the `dist/` folder to your hosting provider of choice.
