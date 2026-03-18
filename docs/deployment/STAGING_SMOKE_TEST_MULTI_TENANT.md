# Staging Smoke Test: Multi-Tenant Commercialization

Use this after deploying the latest frontend, migrations, and edge functions to staging.

Deployment order is documented in [STAGING_DEPLOYMENT_CHECKLIST_MULTI_TENANT.md](./STAGING_DEPLOYMENT_CHECKLIST_MULTI_TENANT.md).

## Pre-flight

1. Apply all pending SQL migrations.
2. Deploy updated edge functions:
   - `create-first-admin`
   - `create-employee`
   - `create-razorpay-order`
   - `razorpay-webhook`
   - `send-email`
   - `send-whatsapp`
   - `submit-booking-request`
   - `patient-login`
   - `patient-request-password-reset`
   - `send-otp`
   - `verify-otp`
   - `sync-api-keys`
   - `log-visitor`
   - `whatsapp-webhook`
   - `submit-demo-request`
   - `submit-onboarding-request`
   - `provision-onboarding-request`
3. Confirm staging `organization_domains` rows exist for at least:
   - IRM tenant
   - one second tenant
4. Confirm staging secrets are present:
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `RAZORPAY_WEBHOOK_SECRET` or org-specific `razorpay_webhook_secret`
   - `WHATSAPP_ACCESS_TOKEN`
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_VERIFY_TOKEN`
   - `WHATSAPP_APP_SECRET`
   - mail provider secrets
5. Confirm patient reset URL/base origin is configured for staging.
6. If any tenant uses its own Meta WhatsApp app/number, populate organization settings for:
   - `whatsapp_access_token`
   - `whatsapp_phone_number_id`
   - `whatsapp_api_version`
   - `whatsapp_verify_token`
   - `whatsapp_app_secret`

## Tenant Setup

Prepare two staging tenants:

1. `irmclinic`
2. one second tenant, for example `acme-diagnostics`

Each tenant should have:

1. one admin
2. one employee
3. one patient
4. one lab
5. one invoice
6. one test/result

## Public Site

For the platform/root hostname:

1. Open `/`
2. Open `/book-demo`
3. Submit a demo request
4. Open an unknown route like `/missing-page`

Verify:

1. the product landing page appears instead of tenant branding
2. the demo request submits successfully
3. a `platform_demo_requests` row is created
4. UTM/click attribution is stored when the demo form is opened with query params
5. `/book-test` still resolves to the same product demo flow for backward compatibility
6. the platform 404 page renders instead of the tenant shell

## Platform Leads

With a known platform-admin staff account:

1. open `/platform/leads`
2. confirm the latest demo request is visible
3. update one lead status
4. export CSV

With an ordinary tenant admin who is not in `platform_admins`:

1. open `/platform/leads`

Verify:

1. intended platform admins can access and manage root-site demo leads
2. non-platform tenant admins are blocked
3. status changes persist on `platform_demo_requests`
4. CSV export includes hostname and attribution fields
5. `updated_at` and the relevant status timestamp (`contacted_at`, `qualified_at`, or `closed_at`) are populated after status changes
6. internal follow-up notes save successfully in `status_notes`
7. assigning a lead to a platform admin persists `assigned_to` and `assigned_at`
8. saving a next follow-up time persists `next_follow_up_at`

## Platform Onboarding

With a known platform-admin staff account:

1. open `/platform/onboarding`
2. confirm the latest self-serve onboarding request is visible
3. save internal notes
4. assign the request
5. save a next follow-up time
6. click the approve/provision action

With an ordinary tenant admin who is not in `platform_admins`:

1. open `/platform/onboarding`

Verify:

1. intended platform admins can access and manage onboarding requests
2. non-platform tenant admins are blocked
3. `reviewing_at`, `assigned_at`, and `next_follow_up_at` persist
4. provisioning creates a live organization, primary lab, and owner user
5. the queue stores `custom_domain`, `resolved_slug`, `resolved_domain`, `resolved_access_domain`, and provisioned IDs
6. for custom-domain requests, the primary public domain remains the customer domain and the launch URLs use the fallback access domain until DNS is ready
7. the launch URLs work for the newly provisioned tenant
8. the owner can sign in with the temporary password once, but is redirected to `/staff/reset-password?first_login=1` before using the dashboard
9. after changing the password, the owner is sent back to `/admin?tab=quick-setup&onboarding=1`
10. after Quick Setup is saved, the owner can navigate through the rest of the admin tabs normally
11. the tenant admin checklist shows domain setup as a visible go-live task until the custom domain is actually connected
12. onboarding and launch emails include the fallback launch domain and DNS handoff guidance for custom-domain requests
13. in `Quick Setup`, marking the custom domain live changes the badge/state from `Pending DNS` to `Connected`
14. the domain checklist item only becomes complete after the custom domain is actually marked live, not merely saved
15. in `/platform/onboarding`, the request shows the same `Pending DNS` vs `Connected` state and platform admins can update it there too

For each tenant hostname:

1. Open `/`
2. Open `/book-test`
3. Open `/privacy`
4. Open `/terms`
5. Open `/careers`

Verify:

1. tenant branding is correct
2. no IRM branding leaks into the second tenant
3. public lab and collection-center options are tenant-scoped

## Booking Requests

For each tenant:

1. submit a website booking request
2. submit a patient-portal booking request

Verify:

1. request row has the correct `organization_id`
2. booking alert email routes to the tenant’s branding/contact setup
3. a mismatched `organization_id + lab_id` request is rejected

## Patient Auth

For each tenant:

1. patient login by patient ID
2. OTP request
3. OTP verify
4. password-reset request

Verify:

1. duplicate phones across tenants are ambiguous without hostname/org context
2. duplicate phones work when hostname/org context is supplied
3. reset email branding matches tenant
4. patient cannot see other-tenant invoices/tests

## Patient Portal

For each tenant:

1. open billing
2. open results
3. download a report
4. submit portal booking request

Verify:

1. only same-tenant invoices are visible
2. only same-tenant tests are visible
3. report branding matches tenant
4. no cross-tenant invoice/test leakage

## Staff Auth

For each tenant:

1. admin login
2. employee login

Verify:

1. inactive employee login fails
2. employee with removed org membership fails
3. active employee with valid org membership succeeds
4. temp-password users are forced through the first-login password-rotation flow before reaching the dashboard

## Admin Flows

For each tenant admin, verify:

1. dashboard overview
2. patients CRUD
3. tests CRUD
4. billing
5. reminders
6. inventory
7. doctors/referrals
8. employees
9. roles
10. labs
11. collection centers
12. visitor logs

Verify:

1. no cross-tenant data appears
2. create/update/delete paths still work
3. pages fail closed if tenant context is missing

## Billing and Payments

For each tenant:

1. open invoice detail
2. record manual payment
3. create Razorpay order
4. complete online payment
5. inspect billing audit history

Verify:

1. non-owner staff cannot create Razorpay orders for another tenant’s invoice
2. webhook uses the correct tenant secret
3. `payments.organization_id` is populated
4. invoice status updates correctly
5. patient billing view reflects the payment

## Notifications

Verify:

1. anonymous `send-email` is rejected
2. anonymous `send-whatsapp` is rejected
3. internal reset/booking email flows still work
4. tenant sender identity and branding are correct
5. tenant-specific email provider credentials override platform fallback when configured
6. fallback still works for tenants without their own provider credentials

## Visitor and WhatsApp Logs

Verify:

1. visitor logs are tenant-scoped
2. WhatsApp event logs are tenant-scoped where org resolution is possible
3. admin from tenant A cannot read tenant B logs
4. tenant-specific WhatsApp verify token works for GET webhook verification
5. tenant-specific WhatsApp app secret verifies signed POST webhooks correctly

## SQL Spot Checks

Run these after the smoke test:

```sql
select 'patients' as table_name, count(*) from public.patients where organization_id is null
union all
select 'patient_tests', count(*) from public.patient_tests where organization_id is null
union all
select 'invoices', count(*) from public.invoices where organization_id is null
union all
select 'invoice_items', count(*) from public.invoice_items where organization_id is null
union all
select 'payments', count(*) from public.payments where organization_id is null
union all
select 'visitor_logs', count(*) from public.visitor_logs where organization_id is null;
```

```sql
select policyname
from pg_policies
where schemaname = 'public'
and tablename in (
  'payments',
  'invoice_items',
  'billing_audit',
  'visitor_logs',
  'whatsapp_webhook_events',
  'booking_requests',
  'patient_reminders',
  'labs',
  'collection_centers'
)
order by tablename, policyname;
```

## Exit Criteria

You are ready for production only if:

1. both tenants pass all public, patient, staff, admin, and payment checks
2. no cross-tenant leakage is observed
3. online payment and webhook flow succeed for the correct tenant
4. password reset and OTP flows work on real tenant hostnames
5. null-organization spot checks are clean for core operational tables
6. [scripts/staging_sql_spot_checks.sql](./scripts/staging_sql_spot_checks.sql) is clean or any non-zero rows are fully explained
7. `/platform/leads` is accessible only to platform admins and lead status changes persist
