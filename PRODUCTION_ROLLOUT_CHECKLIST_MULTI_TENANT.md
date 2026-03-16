# Production Rollout Checklist: Multi-Tenant

Use this only after staging has passed with [STAGING_DEPLOYMENT_CHECKLIST_MULTI_TENANT.md](./STAGING_DEPLOYMENT_CHECKLIST_MULTI_TENANT.md), [STAGING_SMOKE_TEST_MULTI_TENANT.md](./STAGING_SMOKE_TEST_MULTI_TENANT.md), and [scripts/staging_sql_spot_checks.sql](./scripts/staging_sql_spot_checks.sql).

## Goal

Roll the tenant-aware version into production without breaking IRM, while preserving a clean path for onboarding additional diagnostic labs after cutover.

## Go / No-Go Rule

Do not start production rollout unless all of these are true:

1. staging smoke test passed for IRM and at least one second tenant
2. staging SQL spot checks are clean or every exception is understood
3. production secrets and org settings have been reviewed
4. rollback owner is identified
5. low-traffic deployment window is selected

## Pre-Deploy

1. Freeze non-essential schema or app changes until rollout completes.
2. Take a production database backup or snapshot.
3. Export current production edge-function config and secrets.
4. Confirm IRM production `organizations`, `organization_users`, `organization_settings`, and `organization_domains` rows are correct.
5. Confirm IRM production admin and patient login still work in current production before touching anything.

## Production Deploy Order

1. Apply pending migrations.
2. Deploy updated edge functions.
   Recommended command: `bash scripts/deploy_multitenant_functions.sh`
3. Deploy frontend/app bundle.
4. Recheck tenant settings and hostnames.
5. Confirm at least one production rollout owner is present in `platform_admins`.
6. Run production smoke checks for IRM first.
7. If a second live tenant exists, run a limited second-tenant smoke pass.

## Migrations To Confirm In Production

At minimum, production should include:

- `20260315113000_add_platform_admins_and_lead_policies.sql`
- `20260315050000_scope_whatsapp_webhook_events_by_organization.sql`
- `20260315060000_scope_lab_code_uniqueness_by_organization.sql`
- `20260315070000_scope_invoice_numbers_by_organization.sql`
- `20260315073000_scope_quotations_by_organization.sql`
- `20260315080000_scope_patient_employee_ids_by_organization.sql`
- `20260315083000_scope_patient_usernames_by_organization.sql`
- `20260315093000_create_platform_demo_requests.sql`
- `20260315103000_add_platform_demo_request_attribution.sql`
- `20260315120000_add_platform_demo_request_tracking.sql`
- `20260315123000_add_platform_demo_request_assignment.sql`
- `20260315133000_create_platform_onboarding_requests.sql`
- `20260315140000_add_platform_onboarding_request_tracking.sql`
- `20260315143000_add_platform_onboarding_request_provisioning.sql`

## Functions To Confirm In Production

- `create-first-admin`
- `create-employee`
- `employee-login`
- `create-razorpay-order`
- `razorpay-webhook`
- `send-email`
- `send-whatsapp`
- `submit-booking-request`
- `patient-login`
- `patient-request-password-reset`
- `patient-admin-reset-password`
- `employee-admin-reset-password`
- `send-otp`
- `verify-otp`
- `sync-api-keys`
- `log-visitor`
- `whatsapp-webhook`
- `provision-organization`
- `submit-demo-request`
- `submit-onboarding-request`
- `provision-onboarding-request`

You can deploy this set with:

```sh
bash scripts/deploy_multitenant_functions.sh --dry-run
bash scripts/deploy_multitenant_functions.sh
```

## Production Secrets Review

Confirm production has the right platform fallback secrets and they are current:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SECRET_KEY`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- mail provider secrets
- `PLATFORM_CONTACT_EMAIL` or `SALES_CONTACT_EMAIL`
- `PATIENT_AUTH_DOMAIN`
- patient reset origin/base URL
- `TURNSTILE_SECRET_KEY` if public form protection should be enforced outside local development

## IRM Tenant Review

Before cutover, explicitly verify IRM production has:

- correct `organizations.slug = 'irmclinic'`
- correct `organization_domains` row for the live hostname
- correct `organization_settings` for:
  - branding
  - email sender identity
  - payment settings
  - WhatsApp settings
  - report branding

## Production Smoke Pass

Start with IRM only.

Verify:

1. root product homepage loads
2. root `/book-demo` demo request submits
3. `platform_demo_requests` captures the root demo lead
4. a known platform admin can access `/platform/leads`
5. a platform admin can access `/platform/onboarding`
6. a submitted self-serve onboarding request can be reviewed and provisioned
7. homepage loads with correct IRM branding
8. tenant `/book-test` works
9. patient login works
10. patient results and billing work
11. admin login works
12. patients list loads
13. tests list loads
14. billing list loads
15. invoice detail opens
16. manual payment recording works
17. Razorpay order creation works
18. payment webhook updates the invoice
19. reminder creation works
20. inventory loads
21. visitor logs load

## Post-Deploy Monitoring

For the first hour after deploy, monitor:

1. edge-function failures
2. auth/login failures
3. payment webhook failures
4. patient password reset failures
5. OTP failures
6. booking-request failures
7. demo-request submission failures
8. onboarding-request submission or provisioning failures
9. any report of cross-tenant data leakage

## Production SQL Checks

Run [scripts/staging_sql_spot_checks.sql](./scripts/staging_sql_spot_checks.sql) against production immediately after deploy.

Focus on:

1. null `organization_id` rows in core tables
2. org-aware policies present
3. org-aware unique indexes present
4. IRM domain row present
5. IRM organization settings present
6. `platform_admins` contains the intended rollout owner

## Rollback Triggers

Rollback or pause immediately if any of these happen:

1. IRM public site resolves wrong branding or wrong hostname
2. IRM patient sees another tenant’s tests, invoices, or labs
3. IRM admin sees another tenant’s data
4. payment webhook stops updating invoices
5. patient login, OTP, or password reset fails broadly
6. intended platform admin cannot access `/platform/leads` or a normal tenant admin can
7. intended platform admin cannot access `/platform/onboarding` or provisioning fails for reviewed requests
8. migrations complete but production app cannot load the admin or patient portal

## Cutover Complete When

Production rollout is complete only when:

1. IRM production smoke pass is clean
2. production SQL checks are clean
3. no critical auth/payment/reporting regressions appear in the monitoring window
4. you are confident onboarding a second production tenant will not require code changes
