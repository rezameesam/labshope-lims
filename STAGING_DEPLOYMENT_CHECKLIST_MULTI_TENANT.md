# Staging Deployment Checklist: Multi-Tenant

Use this before running [STAGING_SMOKE_TEST_MULTI_TENANT.md](./STAGING_SMOKE_TEST_MULTI_TENANT.md).

## Goal

Deploy the current multi-tenant code safely to staging so IRM still works as tenant 1 and at least one second tenant can be tested end to end.

## Deploy Order

1. Backup staging database.
2. Apply all pending migrations.
3. Deploy updated edge functions.
   Recommended command: `bash scripts/deploy_multitenant_functions.sh`
4. Verify required platform secrets exist.
5. Verify tenant-specific organization settings exist for IRM and the second tenant.
6. Verify `organization_domains` rows exist for staging hostnames.
7. Verify at least one rollout owner is present in `platform_admins`.
8. Run the staging smoke test.

## Migrations Included In This Batch

Make sure staging includes at least these late multi-tenant migrations:

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

## Edge Functions Included In This Batch

Deploy these functions:

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

## Required Platform Secrets

Confirm these exist in staging if you expect platform fallback to work:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SECRET_KEY`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- one or more email provider secrets used by your deployment
- `PLATFORM_CONTACT_EMAIL` or `SALES_CONTACT_EMAIL` if root-site demo requests should notify a real inbox
- `PATIENT_AUTH_DOMAIN`
- patient reset base URL or origin used by reset flows
- `TURNSTILE_SECRET_KEY` if you want production-grade protection on public demo requests and other public forms

## Required Tenant Settings

For each staging tenant, confirm:

- `organization_domains` has the right hostname
- branding/report settings exist if you want tenant-specific public branding
- payment settings exist if the tenant should use its own Razorpay keys
- WhatsApp settings exist if the tenant should use its own Meta app/number
- email sender identity exists if the tenant should use its own sender branding

Recommended IRM and second-tenant settings to verify:

- `organization_website`
- `email_from_name`
- `email_from_email`
- `email_reply_to`
- `razorpay_key_id`
- `razorpay_key_secret`
- `razorpay_webhook_secret`
- `whatsapp_access_token`
- `whatsapp_phone_number_id`
- `whatsapp_api_version`
- `whatsapp_verify_token`
- `whatsapp_app_secret`

## Second Tenant Setup

If staging does not already have a second tenant, create one before smoke testing.

Preferred path:

1. Use `provision-organization`
2. Create one lab
3. Create one employee
4. Create one patient
5. Create one invoice
6. Create one completed test

## Release Notes To Watch

This batch changes tenant ownership or uniqueness for:

- `labs.lab_code`
- `invoices.invoice_number`
- `quotations.quotation_number`
- `patients.patient_id`
- `employees.employee_id`
- `patients.username`

Expected result:

- the same human-readable codes may now exist in different organizations
- payment webhook lookup remains safe because new Razorpay receipts use `invoice_id`

## Rollback Trigger Conditions

Pause rollout if any of these happen:

- IRM public site resolves the wrong branding or wrong domain
- root-domain demo requests do not save successfully
- intended platform admin cannot access `/platform/leads` or ordinary tenant admins can access it
- self-serve onboarding requests do not save or cannot be provisioned from `/platform/onboarding`
- IRM admin sees second-tenant rows in patients, tests, billing, reminders, inventory, logs, or reports
- patient portal cross-tenant leakage is observed
- payment webhook cannot resolve invoices after deploy
- password reset or OTP flows fail on real tenant hostnames

## After Deploy

Run:

1. [STAGING_SMOKE_TEST_MULTI_TENANT.md](./STAGING_SMOKE_TEST_MULTI_TENANT.md)
2. [scripts/staging_sql_spot_checks.sql](./scripts/staging_sql_spot_checks.sql)

Do not move to production until both pass.
