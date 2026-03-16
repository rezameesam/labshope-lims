# Multi-Tenant Product Model

## Goal

Turn the current IRM-specific deployment into a reusable SaaS product where:

- one `organization` = one customer company
- one organization can have many `labs`
- one lab can have many `collection_centers`
- payment, email, WhatsApp, branding, and report configuration belong to the organization

In this model, the current IRM Clinic setup becomes the first organization tenant.

## Current To Future Mapping

### Current

- app is branded for IRM Clinic
- `labs` represent locations/branches
- `system_settings` is global
- some operational tables already use `lab_id`

### Future

- `organizations` becomes the top-level owner
- `labs` move under an organization
- `system_settings` is split into platform settings and organization settings
- every customer-facing record is isolated by `organization_id`

## Recommended Hierarchy

```text
organization
  -> labs
    -> collection_centers
    -> employees
    -> patients
    -> patient_tests
    -> invoices
```

## Core Tables

### 1. organizations

Represents the customer that bought the product.

Suggested fields:

```sql
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  legal_name text,
  display_name text not null,
  status text not null default 'active' check (status in ('trial', 'active', 'suspended', 'cancelled')),
  plan_code text not null default 'standard',
  primary_email text,
  primary_phone text,
  billing_email text,
  timezone text not null default 'Asia/Kolkata',
  currency_code text not null default 'INR',
  country_code text not null default 'IN',
  logo_url text,
  favicon_url text,
  theme jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Notes:

- `slug` supports subdomains like `irmclinic.yourapp.com`
- `theme` stores colors/fonts if you want white-label branding
- `metadata` can store sales CRM or onboarding info

### 2. organization_domains

Maps custom domains to a customer.

```sql
create table public.organization_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  domain text not null unique,
  is_primary boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
```

Use cases:

- `app.irmclinic.com`
- `reports.customerlab.in`

### 3. organization_users

Represents org-level membership and org-wide roles.

```sql
create table public.organization_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'org_admin', 'billing_admin', 'support', 'staff')),
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
```

This sits above `lab_users`.

Recommended rule:

- `organization_users` answers "does this user belong to this customer?"
- `lab_users` answers "which branch/lab can this user access?"

### 4. organization_settings

Stores tenant-specific configuration and secrets.

```sql
create table public.organization_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category text not null,
  setting_key text not null,
  setting_value jsonb not null default '{}'::jsonb,
  is_secret boolean not null default false,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, category, setting_key)
);
```

Store organization-level values such as:

- Razorpay keys and mode
- sender email and SMTP/Resend config
- WhatsApp/SMS provider config
- public branding
- invoice numbering rules
- report footer/header
- tax/GST details

## Existing Tables To Upgrade

### labs

Add `organization_id`.

```sql
alter table public.labs
add column organization_id uuid references public.organizations(id);
```

Recommended future shape:

- `organization_id` required
- `lab_code` unique per organization, not globally unique

Recommended unique index:

```sql
create unique index idx_labs_org_code_unique
on public.labs (organization_id, lab_code);
```

### collection_centers

Add `organization_id` for easier RLS and joins even though center already belongs to a lab.

```sql
alter table public.collection_centers
add column organization_id uuid references public.organizations(id);
```

### lab_users

Keep this table, but add `organization_id` for fast access checks and consistency.

```sql
alter table public.lab_users
add column organization_id uuid references public.organizations(id);
```

## Operational Tables To Upgrade

For sellable multi-tenant SaaS, these tables should carry both:

- `organization_id` for hard tenant isolation
- `lab_id` for branch/location scoping

Tables:

- `employees`
- `patients`
- `patient_tests`
- `invoices`
- `inventory_items`
- `doctors`
- `test_packages`
- `patient_reminders`
- `booking_requests`
- `visitor_logs`
- `invoice_items` where useful for reporting

Example:

```sql
alter table public.patients
add column organization_id uuid references public.organizations(id);
```

## Settings Ownership

### Platform Settings

Keep a small global `system_settings` table only for things you control:

- support email
- global feature flags
- internal alerting keys
- platform-wide integrations not owned by customers

### Organization Settings

Move customer-owned config into `organization_settings`:

- payment gateway
- email provider/from address
- WhatsApp/SMS provider
- branding
- public contact info
- terms/privacy links if custom

### Lab Settings

Optional. Use only for local overrides:

- branch contact number
- branch address
- local report signatory
- local collection window timings

Do not put customer-wide payment/email credentials at the lab level unless a customer explicitly needs separate branch accounts.

## Access Model

### Platform Roles

Internal to you:

- `platform_owner`
- `platform_admin`
- `platform_support`

These should not live inside tenant business data unless necessary.

### Organization Roles

- `owner`
- `org_admin`
- `billing_admin`
- `support`

### Lab Roles

- `lab_admin`
- `manager`
- `employee`
- `collector`

## RLS Direction

Every business record should be readable only if:

1. user belongs to the same `organization_id`
2. user has the right role
3. if lab-scoped, user has access to that `lab_id` unless they are org-wide admin

Example rule shape:

```sql
organization_id = get_current_user_organization_id()
and (
  has_org_role(auth.uid(), organization_id, 'owner')
  or has_org_role(auth.uid(), organization_id, 'org_admin')
  or has_lab_access(auth.uid(), lab_id)
)
```

## Branding Model

The current IRM hardcoding should become organization-driven configuration.

Move these to organization settings:

- app name
- logo
- favicon
- primary/secondary colors
- phone number
- address
- SEO title/description
- invoice header/footer
- test report header/footer

Suggested setting keys:

- `branding.display_name`
- `branding.logo_url`
- `branding.primary_color`
- `contact.phone`
- `contact.email`
- `payments.razorpay`
- `notifications.email`
- `notifications.whatsapp`
- `reports.header_html`
- `reports.footer_html`

## Onboarding Flow

When a new customer buys the product:

1. create `organizations` row
2. create default `organization_settings`
3. create first admin in `auth.users`
4. create `organization_users` row
5. create default primary lab
6. optionally create first collection center
7. present setup wizard for:
   - branding
   - contact info
   - branches
   - payment
   - email
   - WhatsApp
   - staff invites
   - test catalog import

## Migration Plan For Current IRM Data

### Phase 1. Create organization layer

Create:

- `organizations`
- `organization_domains`
- `organization_users`
- `organization_settings`

Seed first record:

```text
slug: irmclinic
display_name: IRM Clinical Laboratory
status: active
plan_code: standard
```

### Phase 2. Backfill organization_id

Backfill `organization_id` into:

- `labs`
- `collection_centers`
- `lab_users`
- all operational tables

For the current system, every existing record belongs to the seeded IRM organization.

### Phase 3. Migrate settings

Copy relevant rows from `system_settings` into `organization_settings` for the IRM organization.

Examples:

- Razorpay settings
- email settings
- WhatsApp settings

Leave truly platform-wide settings in `system_settings`.

### Phase 4. Tighten constraints

After backfill:

- make `organization_id` `not null`
- add indexes on `organization_id`
- add composite indexes for common filters:
  - `(organization_id, lab_id)`
  - `(organization_id, created_at)`

### Phase 5. Update app resolution

App should resolve organization by:

1. custom domain
2. subdomain
3. fallback selected organization for internal platform admins

## Frontend Changes Needed

### New Contexts

- `OrganizationContext`
- keep `LabContext`, but load labs within the resolved organization

### Admin UX

Replace IRM-specific branding with organization settings in:

- public marketing pages
- navbar/footer
- report PDFs
- Razorpay checkout branding
- admin sidebar header

### Settings UX

Split current settings UI into:

- platform settings
- organization settings
- optional lab settings

## Practical Rule For This Repo

Use this ownership model:

- `organization` = customer company
- `lab` = branch or main lab of that company
- `collection_center` = pickup/sample collection point for one lab

So yes: current IRM Clinic becomes one `organization`, and its linked payment, email, and WhatsApp config should move under that organization.

## Recommended First Build Slice

If implementing incrementally, do this first:

1. create `organizations`
2. add `organization_id` to `labs`, `collection_centers`, `lab_users`
3. add `organization_id` to `patients`, `patient_tests`, `invoices`, `employees`
4. create `organization_settings`
5. migrate current IRM system settings into organization settings
6. create `OrganizationContext`
7. replace hardcoded IRM branding with settings-driven values

That gets the product onto the correct foundation before you polish onboarding and billing.
