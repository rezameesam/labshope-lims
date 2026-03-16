# Tenant Onboarding Checklist

Use this when adding a new diagnostic lab customer after IRM.

## Goal

Provision a new organization cleanly, attach its hostname, create its first admin and primary lab, then finish tenant-specific setup without touching code.

## Inputs You Need

Before onboarding, collect:

- organization display name
- legal name
- slug
- primary custom domain if the lab already owns one
- fallback launch subdomain if the lab needs platform-hosted access before DNS is ready
- owner/admin full name
- owner/admin email
- owner/admin password
- primary lab name
- primary lab code
- primary email
- primary phone
- billing email
- timezone
- country code
- currency code

Optional but recommended:

- logo
- website
- branding tagline
- branding description
- report tagline
- report footer note
- payment keys
- WhatsApp credentials
- email sender identity

## Step 1: Provision Organization

Use:

- [supabase/functions/provision-organization/index.ts](./supabase/functions/provision-organization/index.ts)
- [scripts/provision_organization_payload.example.json](./scripts/provision_organization_payload.example.json)

Expected outcome:

1. organization created
2. optional primary domain created
3. primary lab created
4. owner auth user created
5. owner employee row created
6. owner org membership created
7. owner lab membership created
8. owner `admin` role created

## Step 2: Verify Core Records

Run:

- [scripts/tenant_post_provision_checks.sql](./scripts/tenant_post_provision_checks.sql)

Confirm:

1. `organizations` row exists
2. `organization_domains` row exists
3. `labs` row exists
4. `organization_users` row exists
5. `lab_users` row exists
6. `employees` row exists

## Step 3: Connect Domain

Use the tenant admin `Quick Setup` screen for this.

Confirm:

1. the fallback launch subdomain is visible and remains usable
2. the customer’s custom domain is recorded as the intended primary public domain
3. the customer understands they must update DNS at their registrar or DNS provider
4. recommended pattern is a `CNAME` from a custom subdomain like `app.customerlab.com` to the fallback launch domain
5. root/apex domains may need `ALIAS` or `ANAME` support instead of a plain `CNAME`
6. the team does not switch launch expectations to the custom domain until DNS is actually live

## Step 4: Configure Organization Settings

In admin settings, populate at least:

### Branding

- `organization_website`
- `branding_tagline`
- `branding_description`
- `branding_established_year`
- `report_tagline`
- `report_footer_note`

### Email

- `email_from_name`
- `email_from_email`
- `email_reply_to`

Optional provider overrides:

- `mailjet_api_key`
- `mailjet_secret_key`
- `resend_api_key`
- `mailgun_api_key`
- `mailgun_domain`
- `sendgrid_api_key`

### Payments

- `razorpay_key_id`
- `razorpay_key_secret`
- `razorpay_webhook_secret`

### WhatsApp

- `whatsapp_access_token`
- `whatsapp_phone_number_id`
- `whatsapp_api_version`
- `whatsapp_verify_token`
- `whatsapp_app_secret`

### SMS / OTP

- `demo_mode_enabled`
- `msg91_auth_key`
- `msg91_template_id`
- `msg91_sender_id`

## Step 5: Seed Operational Data

Create or import:

1. tests
2. test categories
3. packages
4. templates
5. doctors
6. employees
7. roles
8. reminder defaults if needed

## Step 6: Verify Public Hostname

Check the tenant hostname:

1. homepage
2. `/book-test`
3. `/privacy`
4. `/terms`
5. `/careers`

Confirm:

1. correct branding
2. correct lab/contact data
3. no IRM branding leaks

## Step 7: Verify Auth

Check:

1. owner/admin login
2. employee creation
3. employee login
4. patient login
5. OTP flow
6. password reset flow

## Step 8: Verify Billing and Reports

Create one patient, one test, and one invoice.

Confirm:

1. invoice creation works
2. payment recording works
3. patient billing view works
4. report download works
5. branding and footer are correct

## Step 9: Final Tenant Smoke Pass

Run the relevant parts of:

- [STAGING_SMOKE_TEST_MULTI_TENANT.md](./STAGING_SMOKE_TEST_MULTI_TENANT.md)

Focus on the new tenant plus IRM isolation.

## Done When

The tenant is ready only if:

1. owner login works
2. hostname resolves correctly
3. branding is correct
4. tests and billing work
5. notifications work
6. no cross-tenant leakage is observed
