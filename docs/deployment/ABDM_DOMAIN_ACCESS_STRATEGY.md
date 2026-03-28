# ABDM Domain Access Strategy

This document defines how ABDM browser-facing and callback-facing access should work for a multi-tenant deployment where labs may use their own custom domains.

It is based on:

- repo implementation constraints
- the ABDM sandbox Postman bundle in `/Users/syed44/Downloads/ABDM_SANDBOX`
- the explicit ABDM bridge callback / bridge URL update flow present in the sandbox collection

Related documents:

- [ABDM Readiness Checklist](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/docs/deployment/ABDM_READINESS_CHECKLIST.md)
- [ABDM Milestone Test Matrix](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/docs/deployment/ABDM_MILESTONE_TEST_MATRIX.md)

## 1. Why This Matters

The ABDM sandbox collection includes:

- `PATCH /api/hiecm/gateway/v3/bridge/url`
- callback invocation to `{{callback_url}}/api/v3/hip/patient/share`

That means ABDM is not only consuming your backend APIs. It is also relying on a public callback base URL that you register and maintain.

Separately, your own frontend calls some ABDM-related edge functions from the browser. Those browser-origin rules must not become a blanket wildcard just because labs onboard with custom domains.

So there are two different domain problems:

1. public ABDM callback URL used by the ABDM gateway
2. frontend/browser origins allowed to call ABDM-related edge functions

They should not be treated as the same control.

## 2. Recommended Production Model

### Callback URL

Use one controlled platform callback base URL for ABDM gateway traffic.

Recommended pattern:

- `https://abdm.labshope.com`
- or `https://api.labshope.com`

Do not use per-lab custom domains as the ABDM gateway callback target unless there is a strong operational requirement.

Why:

- easier certificate and DNS management
- easier WAF / monitoring / rate-limiting
- easier incident response
- easier to keep the registered bridge URL stable
- avoids re-registering callback endpoints whenever a lab domain changes

Recommended callback routing:

- ABDM gateway calls the central platform callback URL
- backend resolves organization by `hipId`, `facilityId`, or other stored mapping
- backend stores or forwards the event internally
- frontend later displays the result in the correct tenant context

This matches the current repo direction, where org resolution already happens server-side for ABDM flows.

### Browser Origins

Allow frontend access only from verified tenant origins.

Recommended model:

1. Platform domains are always trusted.
2. Tenant custom domains are trusted only after domain verification is complete.
3. Unverified domains must not be allowed to call ABDM browser-facing functions.

## 3. What Not To Do

Do not do any of these in production:

- `Access-Control-Allow-Origin: *` for ABDM browser-facing endpoints
- manual one-off editing of env vars for every new tenant forever
- trusting any `*.com` or wide public wildcard
- using unverified custom lab domains as ABDM callback URLs
- coupling ABDM gateway callback registration directly to tenant vanity domains

## 4. Recommended Trust Tiers

### Tier 1: Platform-Controlled Origins

These are safe to allow by default:

- `https://lims.labshope.com`
- `https://demo.labshope.com`
- `https://admin.labshope.com`
- `https://*.labshope.com` only if you control issuance and tenancy for that suffix

This tier can be represented by:

- environment-configured exact origins
- environment-configured platform suffix allowlist

### Tier 2: Verified Tenant Custom Domains

These should be allowed only after:

- domain ownership is proven
- DNS is pointed correctly
- TLS is active
- tenant record is active
- the domain is marked verified in your database

This tier should be resolved dynamically from the tenant/domain records, not only from a static env var.

### Tier 3: Local Development

Allow only local origins needed for development:

- `http://localhost:<port>`
- `http://127.0.0.1:<port>`
- `http://<tenant>.localhost:<port>`

This is already the current fallback model in code when `ABDM_ALLOWED_ORIGINS` is unset.

## 5. Final Recommended Architecture

### A. Keep ABDM Callback URL Centralized

Use one platform callback base URL in ABDM:

- example: `https://abdm.labshope.com/api/v3/hip/patient/share`

Benefits:

- no tenant-domain dependency for ABDM callback delivery
- simpler production rollout
- easier Safe-to-Host assessment scope

### B. Separate Browser CORS From ABDM Callback Registration

Frontend-origin approval should use:

- exact trusted platform origins from env
- verified tenant custom domains from database

ABDM callback routing should use:

- a central callback hostname
- server-side tenant resolution

These are different controls and should remain separate.

### C. Suggested Data Model For Verified Origins

One of these should exist in the product:

- dedicated `organization_domains` table
- or existing tenant/domain table with verification status

Minimum fields:

- `organization_id`
- `domain`
- `domain_type`
  - `platform_subdomain`
  - `custom_domain`
- `verification_status`
  - `pending`
  - `verified`
  - `failed`
  - `disabled`
- `tls_status`
- `is_primary`
- `abdm_browser_access_enabled`

Only domains that are both verified and enabled for ABDM browser access should be used in CORS approval.

## 6. Recommended CORS Resolution Logic

For ABDM browser-facing edge functions:

1. Read request `Origin`.
2. Normalize to exact origin.
3. Allow if it matches explicit env-configured platform origins.
4. Allow if it matches a verified platform-owned suffix you explicitly trust.
5. Allow if it matches a verified tenant custom domain from the database.
6. Otherwise reject by omitting `Access-Control-Allow-Origin`.

Important:

- do not trust `Origin` only because it exists
- do not trust custom domains before verification
- do not use the ABDM callback URL list as the same source of truth for browser-origin approval

## 7. Repo Current State

Current repo state:

- ABDM edge functions no longer use `Access-Control-Allow-Origin: *`
- exact platform origins can be allowed via `ABDM_ALLOWED_ORIGINS`
- localhost-style origins are allowed for local development
- verified tenant custom domains are now allowed dynamically from `organization_domains`
- active/trial platform subdomains can now be allowed dynamically from `organizations.slug` plus the configured base domain

Remaining limitation:

- the callback URL strategy is documented but still operational/process-driven; it is not enforced by code because ABDM callback registration happens outside this repo
- if you want stricter per-organization browser-origin rules later, the CORS helper can be extended to require both verified domain state and explicit ABDM enablement

## 8. Recommended Next Implementation

### Phase 1

Keep current `ABDM_ALLOWED_ORIGINS` support for:

- platform domains
- admin/demo environments
- local development

### Phase 2

Keep using database-backed verification for tenant custom domains:

- read verified custom domains per organization from `organization_domains`
- allow ABDM browser access only for verified domains
- keep unverified domains blocked

### Phase 3

If needed later, tighten the ABDM CORS helper further to support:

- explicit platform env allowlist
- trusted platform suffixes
- verified tenant custom domains
- optional per-organization ABDM enablement checks before allowing browser access

## 9. Evidence To Prepare For Review

For FT / WASA / HTC / production readiness, prepare:

- the registered ABDM callback base URL
- proof that callback hostname is platform-controlled
- proof that tenant custom domains are verified before browser access is allowed
- screenshots or records of tenant domain verification state
- explanation of why ABDM callback routing is centralized instead of per-lab

## 10. Decision

Recommended decision for this product:

1. Keep one platform-controlled ABDM callback base URL.
2. Do not register per-lab custom domains as ABDM callback URLs.
3. Allow ABDM browser-origin access only from:
   - explicit platform origins
   - localhost for development
   - verified tenant custom domains from `organization_domains`
   - active/trial platform subdomains resolved from the tenant slug
4. Treat centralized ABDM callback routing plus verified-domain browser access as the required multi-tenant production model.

## 11. Concrete Example For This Product

Recommended production pattern:

- platform LIMS app: `https://lims.labshope.com`
- optional platform admin/demo origins:
  - `https://admin.labshope.com`
  - `https://demo.labshope.com`
- ABDM callback base URL:
  - `https://abdm.labshope.com/api/v3/hip/patient/share`

Example tenant usage:

- Lab A staff use:
  - `https://alpha.labshope.com`
  - or `https://app.alphalabs.com`
- Lab B staff use:
  - `https://zenpath.labshope.com`
  - or `https://portal.zenpathlabs.com`
- IRM staff use:
  - `https://irmclinic.com`
  - or a fallback tenant launch domain such as `https://irm.labshope.com`

But ABDM callback for both still goes to:

- `https://abdm.labshope.com/api/v3/hip/patient/share`

That is the intended model:

- tenant-specific app access
- centralized ABDM callback handling
- server-side org resolution

Concrete IRM example:

- IRM adds `irmclinic.com` as its custom domain in `organization_domains`
- the domain is verified and marked live
- IRM staff use `https://irmclinic.com` for the LIMS
- ABDM browser-side calls are allowed from `https://irmclinic.com`
- ABDM gateway callbacks still go only to `https://abdm.labshope.com/api/v3/hip/patient/share`
- backend resolves the callback to IRM through HIP / facility / organization mapping, not from the public website domain
