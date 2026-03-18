# AI Handoff: Multi-Tenant Productization

This document is the working handoff for converting `irmclinic` from a single-brand diagnostic lab app into a sellable multi-tenant product for multiple diagnostic labs.

## Goal

Turn the app into a tenant-aware SaaS where:

- each customer diagnostic lab is an `organization`
- each organization can have one or more `labs` / branches
- branding, payment, email, WhatsApp, reports, and notification copy are organization-specific
- IRM remains the first tenant and must continue working during the transition

Practical product goal now:

- root host is the software company / product site
- tenant hosts are customer lab sites
- platform admins have a real software-owner workspace
- new labs can start through self-serve onboarding
- tenant admins can complete go-live setup without engineering involvement

## Current State

The repo now has a working first multi-tenant foundation.

Implemented:

- top-level `organizations`
- `organization_users`
- `organization_settings`
- `organization_domains`
- `organization_id` added to major business tables
- IRM backfilled as the first organization
- local Supabase reset works again
- organization-aware frontend branding
- organization-aware settings fallback model
- organization-aware notifications
- organization-aware report branding
- organization-scoped `test_templates`
- organization-scoped admin dashboard aggregates and sidebar counts
- organization-scoped patient management list / duplicate-phone checks
- organization-scoped billing list and patient picker
- organization-scoped patient portal invoice/test reads and financial reporting
- organization-scoped visitor logs and public visitor logging
- organization-scoped reminders, booking-request review flows, and doctor management
- inventory UI narrowed to organization-scoped items and item-linked history
- tenant migration added for inventory categories/history and doctor referrals
- tenant migration added for test catalog, test packages, and custom roles
- tenant migration added for remaining operational RLS hardening
- tenant migration added for billing child tables: `invoice_items`, `payments`, and `billing_audit`
- tenant migration added for org-scoped invoice numbering and duplicate-safe Razorpay receipt resolution
- tenant migration added for org-scoped `quotations` and `quotation_items`
- tenant migration added for org-scoped `patients.patient_id` and `employees.employee_id`
- tenant migration added for org-scoped `patients.username`
- notice board and employee list now scoped by organization
- test packages, test catalog, promotions, and custom-role admin flows now scope by organization
- local fixture data and trigger-path verification added for inventory/referrals
- employee/admin onboarding now writes organization membership explicitly
- lab management, collection-center management, and related analytics now scope by organization
- patient and employee password-reset edge functions now use organization-aware branding instead of hardcoded IRM copy
- admin patient/employee reset endpoints now require same-organization membership instead of only checking the global `admin` role
- OTP delivery now resolves organization-scoped settings from the matched patient record before falling back to platform defaults
- public patient auth now prefers explicit/hostname-resolved tenant context for login, OTP, and password-reset lookup flows
- normalized patient identifier lookup now powers public patient reset/OTP matching, including `+91...` style phone values stored in the DB
- `otp_codes` are now organization-scoped so duplicate patient phones across tenants cannot overwrite or verify each other’s OTP records
- root-domain patient/staff auth and reset pages now render platform guidance pages instead of tenant login/reset forms when no organization is resolved
- root `/features`, `/pricing`, and `/contact` now render dedicated product marketing pages, while tenant hosts are redirected back to tenant-facing routes instead of seeing platform sales pages
- root `/start` now provides a self-serve onboarding request flow where labs can choose a plan and submit organization/owner/setup requirements without going through demo-only CTAs
- the `/start` flow now recommends plans live from rollout inputs, previews the likely tenant URL, and distinguishes between queued onboarding and immediate launch-ready requests
- the shared platform header now includes a mobile sheet menu so product navigation remains usable on small screens
- the root homepage now uses the shared platform header too, and its hero/operating-model sections were tightened to explain the sellable `platform -> organization -> lab` model more clearly
- the root homepage now also includes a workflow-preview section with operational metric cards so the product site shows daily lab activity patterns instead of only abstract marketing copy
- product-site CTAs now push more aggressively toward `Get Started`, backed by `platform_onboarding_requests` and `submit-onboarding-request`
- platform admins now have a dedicated `/platform/onboarding` queue to review and update self-serve onboarding submissions inside the app
- onboarding requests now support internal notes, assignment, due follow-up, and direct tenant provisioning from `/platform/onboarding`
- platform admins can now provision a submitted onboarding request into a live organization through `provision-onboarding-request`, with the queue storing resolved slug/domain and provisioned org/lab/user IDs
- provisioning now returns launch URLs and a temporary owner password, and attempts a best-effort owner launch email after workspace creation
- `submit-onboarding-request` now sends an owner confirmation email for queued requests, and can auto-provision straightforward self-serve requests directly into a live tenant when rollout complexity is low
- when auto-provision succeeds, the `/start` success state now surfaces staff-login URL, booking URL, and the temporary owner password directly in the browser so self-serve setup does not depend entirely on email delivery
- auto-provisioned and temp-reset staff accounts now use auth metadata (`must_change_password`) so first login is forced through `/staff/reset-password?first_login=1` before dashboard access
- newly provisioned organizations now see an in-app go-live checklist on the admin overview, covering branding, contact details, catalog/templates, staff, payments, and notifications before launch
- tenant admins now also have a dedicated `Quick Setup` tab in the admin dashboard that consolidates launch-critical branding, lab contact, website, sender, WhatsApp, Razorpay key-ID, and domain-connection details into one save flow
- self-serve owners now preserve a post-reset destination, so after the forced first-login password change they are sent back to `/admin?tab=quick-setup&onboarding=1` instead of dropping into a generic dashboard view
- `Quick Setup` now also includes onboarding-mode launch previews for the public site and booking page, plus direct next-step links into test catalog, templates, employees, and billing so the owner can move through first-day setup without guessing
- `Quick Setup` now also has an optional one-click starter catalog pack that inserts common starter categories and tests (Hematology, Biochemistry, Endocrinology with CBC/FBS/HbA1c/LFT/Lipid/TSH shells) without overwriting existing tenant catalog rows
- `Quick Setup` now also includes a tenant-facing domain connection card that shows the current primary public domain, fallback launch domain, custom-domain status, and DNS instructions for customer-owned domains
- `Quick Setup` domain saves now manage `organization_domains` directly: keeping the fallback platform subdomain available, allowing a custom domain to become the primary public domain, and reverting primary status back to the fallback if the custom domain is cleared
- `Quick Setup` now also lets a tenant admin mark the saved custom domain as live or move it back to pending by updating `organization_domains.verified_at`, so domain status no longer has to be changed manually in SQL
- the platform onboarding queue now also loads provisioned `organization_domains` so platform admins can see `Pending DNS` vs `Connected` and toggle that same verified/live state from `/platform/onboarding`
- the tenant-side go-live checklist now treats domain setup as a first-class launch task using `organization_domains`, and it stays incomplete while a custom domain is only saved/pending DNS; it becomes complete only after the domain is actually marked live
- there is now a visible software-owner path on the root product site: `/platform/login` for the superadmin/staff login and `/platform` for the platform admin dashboard, instead of forcing platform admins to guess root-host staff auth routes
- the platform-admin side now has a usable module structure:
  - `/platform`
  - `/platform/leads`
  - `/platform/onboarding`
  - `/platform/customers`
  - `/platform/customers/:orgId`
- the platform dashboard has been simplified into clearer software-owner groupings:
  - `Needs Attention`
  - `Platform Snapshot`
  - `Work Queues`
  - `Customers`
- platform customer operations now have a dedicated page that shows tenant plan, setup mode, domains, DNS state, labs, patients, invoices, and recorded payment totals
- platform customer detail drilldown now exists per tenant and shows identity, onboarding source, domains, operating footprint, recent staff, and recent invoices
- the first tenant-detail version had a bad employee query (`employees.organization_id` / `employees.role`); this is now fixed to load staff through tenant lab IDs using `designation`
- root `/start` now performs a live public subdomain availability check through `check-onboarding-subdomain`, showing buyers whether their preferred slug is free before they submit and offering the next available fallback when it is taken
- root `/start` now also mirrors the backend auto-provision rule in the UI through an `Instant Setup Status` block, showing whether the current request qualifies for immediate workspace creation, what is blocking it if not, and adapting the primary CTA to `Create My Workspace` when it qualifies
- onboarding requests now support a primary `custom_domain` and a separate `resolved_access_domain`, so labs can use their own domain first and still receive a platform fallback launch domain for immediate access
- `provision-organization`, `submit-onboarding-request`, and `provision-onboarding-request` now create/store both domain roles correctly: customer domain as the primary public domain and platform subdomain as the fallback access domain when both are present
- root `/start` now explains domain setup as custom-domain-first, treats the subdomain as fallback launch access, and auto-submits the checked fallback slug when the first choice is taken
- onboarding notifications now include DNS handoff details when a custom domain is requested, so both platform admins and tenant owners receive the fallback domain and recommended DNS record guidance by email
- `provision-organization` now seeds starter tenant defaults on creation: a default `Standard Report Template`, `branding_tagline`, `report_tagline`, `report_footer_note`, and default report header/footer template settings so new labs do not start with an empty report setup
- ABDM Phase 1A is now started:
  - `organization_settings` / `system_settings` now support the `abdm` category
  - `System Settings` now includes an `ABDM` tab with tenant-aware settings for:
    - `abdm_enabled`
    - `abdm_environment`
    - `abdm_scan_share_enabled`
    - `abdm_facility_id`
    - `abdm_hip_id`
    - `abdm_cm_id`
    - `abdm_gateway_base_url`
  - this is configuration-only groundwork for the future ABDM Scan and Share patient-intake flow
- ABDM Phase 1B is now started too:
  - `patients` now carry ABDM identity fields through:
    - `20260315173000_add_patient_abdm_identity_fields.sql`
    - `abha_number`
    - `abha_address`
    - `abdm_link_status`
    - `abdm_linked_at`
    - `abdm_last_verified_at`
    - `abdm_source`
  - `ManagePatients` now supports those ABDM patient fields in create/edit/detail views
  - `ManagePatients` also now has a tenant-aware `Scan with ABDM` intake action that calls the new sandbox scaffold and prefills the patient form
  - ABDM backend scaffolding now exists:
    - `supabase/functions/_shared/abdm-settings.ts`
    - `supabase/functions/abdm-scan-share/index.ts`
    - `20260315174500_create_abdm_scan_logs.sql`
    - `supabase/functions/abdm-profile-share/index.ts`
    - `20260315180500_expand_abdm_scan_log_request_types.sql`
    - `20260315181000_create_abdm_profile_shares.sql`
  - the first ABDM edge function is intentionally `sandbox_mock` mode for now:
    - validates authenticated tenant staff context
    - validates org ABDM settings
    - returns normalized identity data
    - writes `abdm_scan_logs`
  - the ABDM scaffold is now aligned to the real sandbox `Scan and Share` collection shape:
    - ABDM session API
    - `profile-share` callback payload
    - future `on-share` acknowledgement path
  - inbound `profile-share` callback handling now exists:
    - resolves organization by `abdm_hip_id`
    - stores inbound payloads in `abdm_profile_shares`
    - attempts patient matching by `abha_number`, then `abha_address`, then phone within the tenant
    - returns an ABDM-shaped acknowledgement payload
  - `ManagePatients` now surfaces recent ABDM profile shares directly in the patient admin UI:
    - recent inbound share list
    - `Use For New Patient` prefill action
    - `View Matched Patient` action when a callback matched an existing patient
  - outbound `on-share` delivery scaffolding now exists:
    - `supabase/functions/abdm-on-share/index.ts`
    - `20260315183000_add_abdm_on_share_tracking.sql`
    - `abdm_profile_shares` now track:
      - `on_share_delivery_status`
      - `on_share_attempted_at`
      - `on_share_error`
      - `on_share_response`
    - `abdm-profile-share` now attempts a best-effort internal call to `abdm-on-share` after storing the inbound payload
  - additional ABDM org settings now exist:
    - `abdm_client_id`
    - `abdm_client_secret`
    - `abdm_callback_url`
    - `abdm_hpr_id`
  - ABDM is now simpler for self-serve labs:
    - organization settings remain the place for ABDM credentials, HIP ID, callback URL, and gateway/base settings
    - `Quick Setup` and `ManageLabs` now let each lab optionally enable ABDM for that branch and store its own `abdm_facility_id` inside `labs.settings`
    - `abdm-scan-share` now accepts `lab_id` and prefers the selected lab's facility / HFR ID over the org-level fallback during patient intake
  - `System Settings` is now more self-serve for lab owners:
    - payment, email, WhatsApp, SMS/OTP, and ABDM tabs now include simpler guidance instead of assuming developer context
    - direct provider setup links now exist inside the settings form
    - WhatsApp settings now expose the extra code-used fields labs actually need to manage themselves:
      - `whatsapp_enabled`
      - `whatsapp_default_country_code`
      - `whatsapp_template_language_code`
      - `whatsapp_otp_template_name`
      - `whatsapp_utility_template_name`
      - `whatsapp_report_template_name`
  - `abdm-scan-share` now supports a `preflight_only` mode:
    - when `preflight_only: true` is sent, the function skips the ABDM-enabled and facility-ID checks and only validates that the saved client credentials can obtain a session token from the configured gateway
    - this allows credential validation before ABDM is fully configured for a branch
    - audit log entry is written with `request_type: "session_preflight"`
  - `System Settings` ABDM tab now includes a "Test session token" button:
    - only shown for organization-scoped admins
    - calls `abdm-scan-share` with `preflight_only: true`
    - shows a success badge with token type or a destructive badge with the error message
    - labs can use this to confirm their sandbox client credentials work before enabling patient intake
  - `Quick Setup` launch integrations card now includes `whatsapp_enabled` toggle:
    - new field reads and saves the `whatsapp_enabled` organization setting alongside the existing phone number ID
    - labs can now enable/disable WhatsApp delivery without leaving Quick Setup
    - saves alongside other launch settings in a single `handleSave` call
  - current ABDM limitation:
    - `abdm-scan-share` still returns mock identity (sandbox_profile_share_preview mode) for full scan/share lookups; only the preflight/session-token path calls the real ABDM sandbox API
    - the next step to make the scan-share flow real is to have `abdm-scan-share` generate a real ABDM QR/token that the patient can scan with their ABHA app, then receive the real callback via `abdm-profile-share`
- a provisioning regression caused by using an invalid `organization_settings.category = 'reports'` value was fixed; the seeded report settings now use the existing allowed `general` category and self-serve provisioning is healthy again
- the root `/book-demo` page is now the primary product demo-request route backed by `platform_demo_requests` and `submit-demo-request`
- root `/book-test` still works as backward-compatible access to that same product demo flow when no tenant is resolved
- `submit-demo-request` now also attempts a best-effort sales email alert to `PLATFORM_CONTACT_EMAIL` / `SALES_CONTACT_EMAIL` without blocking lead storage if email delivery is not configured
- root-site product branding is now centralized in [platformBranding.ts](./src/lib/platformBranding.ts) using `VITE_PLATFORM_*` env vars instead of scattered hardcoded product strings
- root-site Book Demo links now preserve UTM/click attribution, and demo leads store `utm_*`, `gclid`, and `fbclid` in `platform_demo_requests`
- `platform_admins`, `is_platform_admin`, `usePlatformAdmin`, and `/platform/leads` now provide a separate platform-admin surface for reviewing and updating root-site demo leads
- `20260315113000_add_platform_admins_and_lead_policies.sql` was corrected to backfill the earliest admin via `auth.users.created_at` because `user_roles` has no `created_at` column
- platform demo leads now support operational follow-up fields in `platform_demo_requests`: `updated_at`, `contacted_at`, `qualified_at`, `closed_at`, and `status_notes`
- platform demo leads now also support assignment and scheduling fields: `assigned_to`, `assigned_at`, and `next_follow_up_at`
- a sanitized frontend env template now exists in [.env.example](./.env.example) for Supabase, public tenant resolution, root-site branding, and Turnstile setup
- `create-employee` now enforces caller organization membership, rejects cross-tenant target labs, constrains `LAB001` fallback to the caller’s organization, and blocks reusing an email already linked to another organization
- `employee-login` now requires an active employee record plus active organization or lab membership instead of trusting auth + `user_roles` alone
- runtime verification exposed and then fixed a `create-employee` leak where a rejected cross-tenant request could still create an auth user before the authorization failure

Verified locally:

- `supabase db reset` succeeds
- `npm run build` succeeds
- `npm run build` still succeeds after the ABDM Phase 1B patient-intake and edge-function scaffold work
- `npm run build` still succeeds after ABDM preflight-only mode, System Settings credential test button, and Quick Setup `whatsapp_enabled` toggle additions
- `supabase db reset` also succeeds with the ABDM migrations:
  - `20260315170000_add_abdm_settings_category.sql`
  - `20260315173000_add_patient_abdm_identity_fields.sql`
  - `20260315174500_create_abdm_scan_logs.sql`
  - `20260315180500_expand_abdm_scan_log_request_types.sql`
  - `20260315181000_create_abdm_profile_shares.sql`
  - `20260315183000_add_abdm_on_share_tracking.sql`
- local schema checks confirm:
  - `patients.abha_number`
  - `patients.abha_address`
  - `patients.abdm_link_status`
  - `patients.abdm_linked_at`
  - `patients.abdm_last_verified_at`
  - `patients.abdm_source`
  - `public.abdm_scan_logs`
  - `public.abdm_profile_shares`
- `npm run lint` now reports only 11 warnings, all from repo-wide `react-refresh/only-export-components`
- local DB now includes `platform_demo_requests`
- local DB now includes `platform_admins`
- `bash scripts/run_local_multitenant_smoke.sh` now also verifies `submit-demo-request` and `platform_demo_requests`
- the root-site route map now cleanly separates product marketing routes (`/`, `/features`, `/pricing`, `/contact`, `/book-demo`) from tenant routes
- local smoke now passes with `submit-demo-request = 200` and one `platform_demo_requests` row created for the smoke lead
- local smoke now passes with `submit-onboarding-request = 200` and `provision-onboarding-request = 200`
- local smoke now also passes with `submit-onboarding(auto) = 200`, proving the immediate self-serve auto-provision branch for a simple starter request
- local smoke now also verifies that the auto-provision response includes a temporary owner password for immediate first login
- local smoke now also verifies that the auto-provisioned owner can sign in and is marked `password_reset_required` on first login
- local smoke now also verifies stored attribution: `google|cpc|spring-launch`
- local smoke now also verifies the bootstrapped first admin is present in `platform_admins`
- local smoke now also verifies product lead follow-up tracking by updating the smoke lead to `contacted` and asserting `updated_at`, `contacted_at`, and `status_notes`
- local smoke now also verifies lead assignment and next follow-up scheduling by asserting `assigned_at` and `next_follow_up_at`
- local smoke now also verifies onboarding assignment/tracking by asserting `reviewing_at`, `assigned_at`, `next_follow_up_at`, and internal notes on `platform_onboarding_requests`
- local smoke now also verifies onboarding provisioning by asserting `provisioned_organization_id`, `provisioned_lab_id`, `provisioned_owner_user_id`, `provisioned_at`, and `resolved_slug`
- local smoke now also verifies starter tenant seeding by asserting the auto-provisioned tenant has one default `Standard Report Template` and all five starter report/branding settings
- local smoke now also verifies public subdomain checks by asserting a fresh slug returns `available=true` and a taken slug returns `available=false` with a fallback suggestion
- local smoke now also verifies custom-domain-first onboarding by asserting:
  - `primary_domain` returns the requested custom domain
  - `access_domain` returns the platform fallback subdomain
  - the onboarding row stores both `resolved_domain` and `resolved_access_domain`
  - the provisioned org gets both organization-domain rows
- local smoke still passes after the latest domain UX additions in `Quick Setup`, the tenant checklist, and the onboarding email path
- local smoke now also verifies both onboarding branches:
  - complex request -> queue + platform-admin provisioning
  - simple request -> direct auto-provision with stored resolved slug/domain
- fresh `supabase db reset` now also verifies `20260315120000_add_platform_demo_request_tracking.sql` applies cleanly
- fresh `supabase db reset` now also verifies `20260315123000_add_platform_demo_request_assignment.sql` applies cleanly
- local DB contains `irmclinic`
- local DB tenant isolation was tested with a second local-only org: `acme-diagnostics`
- `test_templates` are isolated by `organization_id`
- `test_categories`, `tests`, and `custom_roles` now have `organization_id`
- old global uniqueness on category names, custom role names, and test IDs is removed in favor of org-scoped uniqueness
- org-aware RLS is now verified for `test_categories`, `tests`, `test_packages`, `test_package_tests`, `custom_roles`, `role_permissions`, and `user_custom_roles`
- org-aware RLS is now verified for `booking_requests`, `patient_reminders`, `employees`, `labs`, and `collection_centers`
- org-aware RLS is now verified for `visitor_logs`
- org-aware RLS is now verified for `invoice_items`, `payments`, and `billing_audit`
- org-aware RLS is now verified for `quotations` and `quotation_items`
- latest admin hardening pass builds cleanly with `npm run build`
- latest hook-dependency cleanup pass removed the remaining tenant-specific `react-hooks/exhaustive-deps` warnings in the touched multi-tenant files
- local runtime verification now confirms duplicate patient phones across tenants are rejected by `send-otp` without tenant context and succeed when tenant hostname context is supplied
- local runtime verification now confirms ambiguous duplicate patient identifiers on `patient-request-password-reset` are ignored safely without creating reset rows
- local runtime verification now confirms tenant-scoped OTP rows carry `organization_id`, and `verify-otp` succeeds when tenant context is supplied via request origin or explicit organization ID
- local runtime verification now confirms:
  - `employee-login` succeeds for the local IRM admin and returns the resolved IRM `organization_id`
  - `employee-login` succeeds for a valid IRM employee with active organization membership
  - `employee-login` rejects an inactive employee with `Your staff account is inactive or not linked to an employee record.`
  - `employee-login` rejects an active employee whose `organization_users` membership is removed with `Your staff account is not linked to an active organization.`
  - same-tenant `create-employee` succeeds for `LAB001`
  - cross-tenant `create-employee` against `ACME001` is rejected with `You do not have access to the selected lab`
  - the rejected cross-tenant `create-employee` case no longer leaves an auth user behind
- local runtime/schema verification now confirms:
  - `generate_invoice_number(organization_id)` returns the same next human invoice number independently for both `irmclinic` and `acme-diagnostics`
  - duplicate invoice numbers are now allowed across different organizations and still blocked within the same organization
  - Razorpay single-invoice receipts now carry `invoice_id` instead of `invoice_number`, so future duplicate human invoice numbers across tenants do not break webhook resolution
- local schema/runtime verification now confirms:
  - duplicate `patient_id` values can now exist across different organizations without violating constraints
  - org-scoped patient and employee ID indexes exist after a clean reset
- local schema/runtime verification now confirms:
  - duplicate patient portal usernames can now exist across different organizations without violating constraints

## Most Important Files

Read these first before making more changes:

- [MULTI_TENANT_PRODUCT_MODEL.md](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/MULTI_TENANT_PRODUCT_MODEL.md)
- [20260314090000_create_organization_multi_tenant_layer.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260314090000_create_organization_multi_tenant_layer.sql)
- [20260314103000_backfill_patient_auth_on_fresh_resets.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260314103000_backfill_patient_auth_on_fresh_resets.sql)
- [20260314183000_scope_test_templates_by_organization.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260314183000_scope_test_templates_by_organization.sql)
- [src/contexts/OrganizationContext.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/contexts/OrganizationContext.tsx)
- [src/components/admin/SystemSettings.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/SystemSettings.tsx)
- [src/components/admin/ManageVisitorLogs.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageVisitorLogs.tsx)
- [src/components/privacy/CookieConsent.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/privacy/CookieConsent.tsx)
- [src/services/notificationService.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/services/notificationService.ts)
- [src/components/patient/TestReportPDF.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/patient/TestReportPDF.tsx)
- [src/components/admin/ManageTestTemplates.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageTestTemplates.tsx)
- [src/components/admin/DashboardOverview.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/DashboardOverview.tsx)
- [src/pages/AdminDashboard.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/pages/AdminDashboard.tsx)
- [src/components/admin/ManagePatients.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManagePatients.tsx)
- [src/components/admin/ManageBilling.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageBilling.tsx)
- [src/components/admin/ManageReminders.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageReminders.tsx)
- [src/components/admin/ManageBookingRequests.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageBookingRequests.tsx)
- [src/components/admin/ManageDoctors.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageDoctors.tsx)
- [src/components/admin/ManageInventory.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageInventory.tsx)
- [src/components/admin/NoticeBoard.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/NoticeBoard.tsx)
- [src/components/admin/ManageEmployees.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageEmployees.tsx)
- [src/components/admin/ManageLabs.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageLabs.tsx)
- [src/components/admin/ManageCollectionCenters.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageCollectionCenters.tsx)
- [src/components/admin/LabAnalytics.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/LabAnalytics.tsx)
- [src/components/admin/CollectionCenterAnalytics.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/CollectionCenterAnalytics.tsx)
- [src/contexts/LabContext.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/contexts/LabContext.tsx)
- [20260314213000_scope_inventory_and_referrals_by_organization.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260314213000_scope_inventory_and_referrals_by_organization.sql)
- [20260314221500_fix_inventory_organization_triggers.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260314221500_fix_inventory_organization_triggers.sql)
- [20260314230000_scope_test_catalog_and_roles_by_organization.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260314230000_scope_test_catalog_and_roles_by_organization.sql)
- [20260314234500_harden_remaining_operational_rls_by_organization.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260314234500_harden_remaining_operational_rls_by_organization.sql)
- [20260315013000_scope_visitor_logs_by_organization.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315013000_scope_visitor_logs_by_organization.sql)
- [20260315023000_scope_billing_children_by_organization.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315023000_scope_billing_children_by_organization.sql)
- [20260315070000_scope_invoice_numbers_by_organization.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315070000_scope_invoice_numbers_by_organization.sql)
- [20260315073000_scope_quotations_by_organization.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315073000_scope_quotations_by_organization.sql)
- [20260315080000_scope_patient_employee_ids_by_organization.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315080000_scope_patient_employee_ids_by_organization.sql)
- [20260315083000_scope_patient_usernames_by_organization.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315083000_scope_patient_usernames_by_organization.sql)
- [src/lib/invoiceNumbers.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/lib/invoiceNumbers.ts)
- [STAGING_DEPLOYMENT_CHECKLIST_MULTI_TENANT.md](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/STAGING_DEPLOYMENT_CHECKLIST_MULTI_TENANT.md)
- [STAGING_SMOKE_TEST_MULTI_TENANT.md](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/STAGING_SMOKE_TEST_MULTI_TENANT.md)
- [PRODUCTION_ROLLOUT_CHECKLIST_MULTI_TENANT.md](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/PRODUCTION_ROLLOUT_CHECKLIST_MULTI_TENANT.md)
- [TENANT_ONBOARDING_CHECKLIST.md](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/TENANT_ONBOARDING_CHECKLIST.md)
- [GO_TO_MARKET_PRICING.md](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/GO_TO_MARKET_PRICING.md)
- [SALES_ONE_PAGE_OFFER.md](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/SALES_ONE_PAGE_OFFER.md)
- [LANDING_PAGE_COPY.md](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/LANDING_PAGE_COPY.md)
- [ABDM_INTEGRATION_PLAN.md](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/ABDM_INTEGRATION_PLAN.md)
- [ABDM_SCAN_AND_SHARE_SPEC.md](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/ABDM_SCAN_AND_SHARE_SPEC.md)
- [20260315170000_add_abdm_settings_category.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315170000_add_abdm_settings_category.sql)
- [src/lib/publicTenant.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/lib/publicTenant.ts)
- [src/hooks/usePublicPageMode.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/hooks/usePublicPageMode.ts)
- [src/components/platform/ProductLandingPage.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/platform/ProductLandingPage.tsx)
- [src/components/platform/PlatformSiteHeader.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/platform/PlatformSiteHeader.tsx)
- [src/components/platform/PlatformSiteFooter.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/platform/PlatformSiteFooter.tsx)
- [src/components/platform/PlatformLegalPage.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/platform/PlatformLegalPage.tsx)
- [src/components/platform/PlatformCareersPage.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/platform/PlatformCareersPage.tsx)
- [src/components/platform/PlatformBookDemoPage.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/platform/PlatformBookDemoPage.tsx)
- [src/components/platform/PlatformStartPage.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/platform/PlatformStartPage.tsx)
- [src/components/admin/AdminSetupChecklist.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/AdminSetupChecklist.tsx)
- [src/components/admin/AdminQuickSetup.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/AdminQuickSetup.tsx)
- [src/components/admin/DashboardOverview.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/DashboardOverview.tsx)
- [src/pages/BookDemo.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/pages/BookDemo.tsx)
- [src/pages/Start.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/pages/Start.tsx)
- [src/components/platform/PlatformAccessPage.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/platform/PlatformAccessPage.tsx)
- [src/components/platform/PlatformResetPage.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/platform/PlatformResetPage.tsx)
- [src/lib/platformBranding.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/lib/platformBranding.ts)
- [.env.example](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/.env.example)
- [20260315093000_create_platform_demo_requests.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315093000_create_platform_demo_requests.sql)
- [20260315113000_add_platform_admins_and_lead_policies.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315113000_add_platform_admins_and_lead_policies.sql)
- [20260315103000_add_platform_demo_request_attribution.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315103000_add_platform_demo_request_attribution.sql)
- [20260315120000_add_platform_demo_request_tracking.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315120000_add_platform_demo_request_tracking.sql)
- [20260315123000_add_platform_demo_request_assignment.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315123000_add_platform_demo_request_assignment.sql)
- [20260315133000_create_platform_onboarding_requests.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315133000_create_platform_onboarding_requests.sql)
- [20260315140000_add_platform_onboarding_request_tracking.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315140000_add_platform_onboarding_request_tracking.sql)
- [20260315143000_add_platform_onboarding_request_provisioning.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315143000_add_platform_onboarding_request_provisioning.sql)
- [20260315150000_add_custom_domain_to_platform_onboarding_requests.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315150000_add_custom_domain_to_platform_onboarding_requests.sql)
- [supabase/functions/submit-demo-request/index.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/submit-demo-request/index.ts)
- [supabase/functions/submit-onboarding-request/index.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/submit-onboarding-request/index.ts)
- [supabase/functions/provision-onboarding-request/index.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/provision-onboarding-request/index.ts)
- [src/lib/platformMarketing.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/lib/platformMarketing.ts)
- [src/hooks/usePlatformAdmin.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/hooks/usePlatformAdmin.ts)
- [src/pages/PlatformLeads.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/pages/PlatformLeads.tsx)
- [src/pages/PlatformOnboarding.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/pages/PlatformOnboarding.tsx)
- [src/pages/PlatformDashboard.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/pages/PlatformDashboard.tsx)
- [src/pages/PlatformCustomers.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/pages/PlatformCustomers.tsx)
- [src/pages/PlatformCustomerDetail.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/pages/PlatformCustomerDetail.tsx)
- [scripts/staging_sql_spot_checks.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/scripts/staging_sql_spot_checks.sql)
- [scripts/deploy_multitenant_functions.sh](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/scripts/deploy_multitenant_functions.sh)
- [scripts/print_multitenant_release_manifest.sh](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/scripts/print_multitenant_release_manifest.sh)
- [scripts/provision_organization_payload.example.json](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/scripts/provision_organization_payload.example.json)
- [scripts/tenant_post_provision_checks.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/scripts/tenant_post_provision_checks.sql)
- [scripts/run_local_multitenant_smoke.sh](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/scripts/run_local_multitenant_smoke.sh)
- [20260315070000_scope_invoice_numbers_by_organization.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315070000_scope_invoice_numbers_by_organization.sql)
- [20260315073000_scope_quotations_by_organization.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315073000_scope_quotations_by_organization.sql)
- [20260315080000_scope_patient_employee_ids_by_organization.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315080000_scope_patient_employee_ids_by_organization.sql)
- [20260315083000_scope_patient_usernames_by_organization.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315083000_scope_patient_usernames_by_organization.sql)
- [src/lib/invoiceNumbers.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/lib/invoiceNumbers.ts)
- [supabase/functions/create-razorpay-order/index.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/create-razorpay-order/index.ts)
- [supabase/functions/razorpay-webhook/index.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/razorpay-webhook/index.ts)
- [scripts/seed_local_inventory_and_referrals.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/scripts/seed_local_inventory_and_referrals.sql)
- [supabase/functions/log-visitor/index.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/log-visitor/index.ts)
- [supabase/functions/create-employee/index.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/create-employee/index.ts)
- [supabase/functions/employee-login/index.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/employee-login/index.ts)
- [supabase/functions/create-first-admin/index.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/create-first-admin/index.ts)
- [supabase/functions/patient-request-password-reset/index.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/patient-request-password-reset/index.ts)
- [supabase/functions/patient-admin-reset-password/index.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/patient-admin-reset-password/index.ts)
- [supabase/functions/employee-admin-reset-password/index.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/employee-admin-reset-password/index.ts)
- [supabase/functions/send-otp/index.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/send-otp/index.ts)
- [supabase/functions/patient-login/index.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/patient-login/index.ts)
- [supabase/functions/_shared/public-organization.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/_shared/public-organization.ts)
- [20260315033000_add_scoped_patient_login.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315033000_add_scoped_patient_login.sql)
- [20260315034500_add_patient_identifier_lookup.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315034500_add_patient_identifier_lookup.sql)
- [20260315040000_scope_otp_codes_by_organization.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315040000_scope_otp_codes_by_organization.sql)
- [supabase/functions/verify-otp/index.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/verify-otp/index.ts)
- [supabase/functions/create-employee/index.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/create-employee/index.ts)

## Migrations Added or Changed

### Core multi-tenant rollout

- [20260314090000_create_organization_multi_tenant_layer.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260314090000_create_organization_multi_tenant_layer.sql)

What it does:

- creates `organizations`
- creates `organization_users`
- creates `organization_settings`
- creates `organization_domains`
- adds `organization_id` to existing business tables
- seeds `irmclinic` as the first organization
- backfills `organization_id`
- adds sync triggers so current code keeps working

### Fresh local reset repair

These are required. Do not remove them unless the whole migration chain is redesigned.

- [20250208000002_add_patient_passwords.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20250208000002_add_patient_passwords.sql)
- [20250208000003_add_patient_password_functions.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20250208000003_add_patient_password_functions.sql)
- [20250208000004_fix_patient_password_functions.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20250208000004_fix_patient_password_functions.sql)
- [20250208000005_add_patient_password_resets.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20250208000005_add_patient_password_resets.sql)
- [20250208000006_add_patient_reset_password_function.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20250208000006_add_patient_reset_password_function.sql)
- [20260305121500_update_patient_login_phone_matching.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260305121500_update_patient_login_phone_matching.sql)
- [20260314103000_backfill_patient_auth_on_fresh_resets.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260314103000_backfill_patient_auth_on_fresh_resets.sql)

Reason:

- the older patient auth migrations referenced `patients` before the core schema migration created it
- these guards and catch-up migration are what make fresh local resets work

### Test template tenant scoping

- [20260314183000_scope_test_templates_by_organization.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260314183000_scope_test_templates_by_organization.sql)

What it does:

- adds `organization_id` to `test_templates`
- backfills existing templates to IRM org
- adds organization-aware RLS

### Inventory / referral tenant scoping

- [20260314213000_scope_inventory_and_referrals_by_organization.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260314213000_scope_inventory_and_referrals_by_organization.sql)

What it does:

- adds `organization_id` to:
  - `inventory_categories`
  - `inventory_purchases`
  - `inventory_usage`
  - `equipment_maintenance`
  - `doctor_referrals`
- backfills those rows from linked items/doctors/patients/invoices
- adds triggers to auto-populate `organization_id` for future writes
- hardens RLS for:
  - `doctors`
  - `doctor_referrals`
  - `inventory_categories`
  - `inventory_items`
  - `inventory_purchases`
  - `inventory_usage`
  - `equipment_maintenance`
- uses `lab_users`-linked organization access so future employees created through current flows still work

Important:

- this migration now applies successfully on a fresh local `supabase db reset`
- local schema verification confirmed the new `organization_id` columns and organization-aware policies exist on the target tables
- the original shared inventory trigger had a bug and was fixed by:
  - [20260314221500_fix_inventory_organization_triggers.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260314221500_fix_inventory_organization_triggers.sql)
- local fixture data now verifies behavior with real inventory/referral records too

### Test catalog / package / custom-role tenant scoping

- [20260314230000_scope_test_catalog_and_roles_by_organization.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260314230000_scope_test_catalog_and_roles_by_organization.sql)

What it does:

- adds `organization_id` to:
  - `test_categories`
  - `tests`
  - `custom_roles`
- backfills those rows to the default org on fresh resets and current IRM data
- replaces old global uniqueness with org-scoped uniqueness for:
  - test category names
  - custom role names
  - `tests.test_id`
- adds default/sync triggers so new test categories, tests, custom roles, and test packages get the right org automatically
- hardens RLS for:
  - `test_categories`
  - `tests`
  - `test_packages`
  - `test_package_tests`
  - `custom_roles`
  - `role_permissions`
  - `user_custom_roles`

Important:

- this migration applies successfully on a fresh local `supabase db reset`
- local policy verification confirmed the old broad collector read policies are gone from `tests` and `test_categories`
- local schema verification confirmed the old global constraints `test_categories_name_key`, `custom_roles_name_key`, and `tests_test_id_key` are gone

### Remaining operational RLS hardening

- [20260314234500_harden_remaining_operational_rls_by_organization.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260314234500_harden_remaining_operational_rls_by_organization.sql)

What it does:

- adds helper function:
  - `public.get_patient_organization_id(_user_id UUID)`
- replaces older broad policies with org-aware RLS for:
  - `booking_requests`
  - `patient_reminders`
  - `employees`
  - `labs`
  - `collection_centers`
- keeps public anonymous access only for the main lab basic info policy on `labs`
- allows authenticated patients to see only labs and collection centers from their own org

Important:

- this migration applies successfully on a fresh local `supabase db reset`
- local policy verification confirmed the old broad policies are gone from those five tables
- local verification confirmed `get_patient_organization_id` exists after reset

### Visitor-log tenant scoping

- [20260315013000_scope_visitor_logs_by_organization.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315013000_scope_visitor_logs_by_organization.sql)

What it does:

- adds `organization_id` to `visitor_logs`
- backfills existing rows to the IRM organization when present
- adds indexes for tenant-scoped log reads
- replaces the old global admin policy with an organization-aware policy using `user_has_organization_access`

Important:

- this migration applies successfully on a fresh local `supabase db reset`
- local schema verification confirmed `visitor_logs.organization_id` exists
- local policy verification confirmed only `Organization admins can view visitor logs` remains
- local tenant verification confirmed visitor-log rows can be separated by `irmclinic` vs `acme-diagnostics`

### Billing child-table tenant scoping

- [20260315023000_scope_billing_children_by_organization.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315023000_scope_billing_children_by_organization.sql)

What it does:

- adds `organization_id` to:
  - `invoice_items`
  - `payments`
  - `billing_audit`
- backfills those rows from linked invoices and payments
- adds sync triggers so invoice items, payments, and billing audit rows inherit organization ownership from their invoice
- replaces older lab-derived billing-child RLS with organization-aware policies using `user_has_organization_access`
- updates billing audit trigger functions so new invoice/payment audit rows write `organization_id` explicitly

Important:

- this migration applies successfully on a fresh local `supabase db reset`
- local schema verification confirmed the new `organization_id` columns exist on all three tables
- local policy verification confirmed only the new organization-aware policies remain on those tables
- local trigger-path inserts without `organization_id` auto-assigned the correct org on `invoice_items` and `payments`
- local verification also caught and fixed a regression where `payment_deleted` audit rows were trying to keep a foreign-keyed `payment_id` after delete; the migration now writes `payment_id = null` and preserves the deleted payment ID inside `old_values.payment_id`
- local null-organization checks for `invoice_items`, `payments`, and `billing_audit` are all `0`

## Frontend / App Layer Changes

### Organization context

[src/contexts/OrganizationContext.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/contexts/OrganizationContext.tsx)

Now provides:

- `organization`
- `primaryLab`
- `branding`
- `settings`
- `refreshOrganization`

Branding now supports:

- display name
- tagline
- description
- website
- established year
- report footer note
- report tagline

Settings currently loaded here include:

- branding settings
- report settings
- reminder prefill settings
- default report template text settings

### Settings UI

[src/components/admin/SystemSettings.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/SystemSettings.tsx)

Now uses:

- `organization_settings` first
- `system_settings` as fallback

Organization-level configurable settings currently include:

- Razorpay keys
- email sender identity
- WhatsApp behavior settings
- branding tagline/description/year/website
- report footer/tagline
- default report header/footer template text
- reminder titles/messages

### Notification layer

[src/services/notificationService.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/services/notificationService.ts)

Now supports:

- org-aware branding resolution
- org-aware email sender behavior through edge function payloads
- org-aware WhatsApp defaults
- org-aware notification subject/body overrides

Notification templates are rendered with:

- [src/lib/notificationTemplates.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/lib/notificationTemplates.ts)

Current token style:

- `{patient_name}`
- `{business_name}`
- `{portal_url}`
- `{amount}`
- `{invoice_number}`
- `{invoice_suffix}`
- `{test_name}`
- `{test_id}`
- `{test_list}`
- `{test_count}`
- `{patient_id_code}`

### Reports / PDF

[src/components/patient/TestReportPDF.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/patient/TestReportPDF.tsx)

Now supports:

- org-aware branding
- org-aware footer note/tagline
- org-aware template resolution
- template preference by `organization_id`

### Template management

[src/components/admin/ManageTestTemplates.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageTestTemplates.tsx)

Now:

- scopes template CRUD to current organization
- uses org-specific default header/footer text
- uses org branding in preview instead of hardcoded IRM strings

### Template selection in report printing

[src/components/admin/ManageTests.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageTests.tsx)

Now:

- scopes test categories, test catalog, and test package lookup by `organization_id`
- fetches template list with organization-aware query
- passes `organizationId` into report generation branding payload

Also updated:

- [src/components/admin/ManagePatients.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManagePatients.tsx)
- [src/components/patient/TestResultsTable.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/patient/TestResultsTable.tsx)

### Admin query hardening

The next tenant-safety pass already started in the admin UI.

[src/components/admin/DashboardOverview.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/DashboardOverview.tsx)

Now:

- scopes overview counts by `organization_id` when org context exists
- scopes recent tests by `organization_id`
- scopes invoice-derived revenue stats by `organization_id`
- scopes top-tests revenue by first resolving scoped invoice IDs, then reading `invoice_items`
- waits for `OrganizationContext` to settle before fetching

[src/pages/AdminDashboard.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/pages/AdminDashboard.tsx)

Now:

- scopes sidebar booking-request, reminder, invoice, and pending-test counts by `organization_id`
- waits for organization context before loading counts

[src/components/admin/ManagePatients.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManagePatients.tsx)

Now:

- scopes the patient list by `organization_id`
- scopes labs and collection centers by `organization_id`
- scopes billing summary by `organization_id`
- scopes duplicate-phone detection by `organization_id`
- explicitly writes `organization_id` on patient creation when available

[src/components/admin/ManageBilling.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageBilling.tsx)

Now:

- scopes invoice list by `organization_id`
- scopes billing patient search/picker by `organization_id`
- scopes patient test lookup by `organization_id`
- scopes invoice status lookup during invoice creation by `organization_id`
- explicitly writes `organization_id` on invoice creation when available
- scopes invoice items, payments, and billing audit reads by `organization_id`
- writes `organization_id` on invoice item and payment inserts
- constrains invoice-item updates by `organization_id`

[src/components/admin/ManageReminders.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageReminders.tsx)

Now:

- scopes reminder list by `organization_id`
- scopes patient lookup/dropdown by `organization_id`
- scopes patient detail hydration by `organization_id`
- explicitly writes `organization_id` on reminder creation when available

[src/components/admin/ManageBookingRequests.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageBookingRequests.tsx)

Now:

- scopes booking-request review list by `organization_id`
- scopes matching-patient and manual patient search by `organization_id`
- scopes duplicate checks when converting a request to a patient
- explicitly writes `organization_id` on patient creation from a booking request

[src/components/admin/ManageDoctors.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageDoctors.tsx)

Now:

- scopes doctors by `organization_id`
- scopes referral loading by the current organization’s doctor IDs
- scopes referral patient-name hydration by `organization_id`
- explicitly writes `organization_id` on doctor creation when available

[src/components/admin/ManageInventory.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageInventory.tsx)

Now:

- scopes inventory items by `organization_id`
- scopes purchases, usage, and maintenance history through the current org’s item IDs
- explicitly writes `organization_id` on inventory-item creation when available
- explicitly writes `organization_id` on category, purchase, usage, and maintenance creation when available

[src/components/admin/NoticeBoard.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/NoticeBoard.tsx)

Now:

- scopes notice-board pending tests, reminders, and invoices by `organization_id`
- waits for organization context before loading counts

[src/components/admin/ManageEmployees.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageEmployees.tsx)

Now:

- scopes employee list by `organization_id`
- scopes available custom roles by `organization_id`
- filters employee role assignment state to roles visible in the current organization
- keeps existing identity/detail fetches limited to the scoped employee set

[src/components/admin/ManageTests.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageTests.tsx)

Now:

- writes `organization_id` when creating `doctor_referrals`

[src/components/admin/ManageTestPackages.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageTestPackages.tsx)

Now:

- scopes package list by `organization_id`
- scopes package test selection by the current org’s test catalog
- writes `organization_id` on package creation
- constrains package update/delete writes to the current organization when org context exists

[src/components/admin/ManageTestCatalog.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageTestCatalog.tsx)

Now:

- scopes tests and categories by `organization_id`
- writes `organization_id` on new tests and categories
- constrains test update/delete and bulk test ID generation to the current organization when org context exists

[src/components/admin/ManageRoles.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageRoles.tsx)

Now:

- scopes custom role list by `organization_id`
- writes `organization_id` on new roles
- constrains role update/delete to the current organization when org context exists

[src/components/admin/SendPromotion.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/SendPromotion.tsx)

Now:

- scopes promotional patient targeting by `organization_id`

[src/components/admin/ManageBilling.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageBilling.tsx)

Now also:

- scopes test-catalog billing lookups by `organization_id`

[src/components/admin/ManageTestTemplates.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageTestTemplates.tsx)

Now also:

- scopes category and test dropdowns by `organization_id`

[src/components/patient/TestReportPDF.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/patient/TestReportPDF.tsx)

Now also:

- scopes test-to-category resolution by `organization_id` when report branding includes an org

[src/hooks/usePatientAuth.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/hooks/usePatientAuth.tsx)

Now:

- loads `organization_id` onto the patient auth state during patient bootstrap

[src/pages/PatientDashboard.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/pages/PatientDashboard.tsx)

Now:

- scopes patient outstanding-dues invoice reads by the authenticated patient’s `organization_id`
- scopes patient test history reads by the authenticated patient’s `organization_id`
- passes patient org context into results and billing subviews
- passes patient org context into the portal booking-request form

[src/components/patient/BillingPortal.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/patient/BillingPortal.tsx)

Now:

- scopes invoice list and invoice detail reads by `organization_id` when provided by the patient portal
- scopes invoice item and payment detail reads by `organization_id`

[src/components/patient/TestResultsTable.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/patient/TestResultsTable.tsx)

Now:

- scopes invoice-based dues checks by patient organization when available

[src/components/admin/FinancialReports.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/FinancialReports.tsx)

Now:

- scopes invoice reporting and revenue summaries by `organization_id`

[src/components/patient/PatientBookTestRequest.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/patient/PatientBookTestRequest.tsx)

Now:

- scopes lab and collection-center options by the authenticated patient’s `organization_id`

[src/components/admin/ManageTests.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageTests.tsx)

Now also:

- scopes doctor picker data by `organization_id`
- writes `organization_id` on auto-generated invoice items
- scopes invoice-item lookups used for all-tests-complete notifications by `organization_id`

[src/components/admin/DashboardOverview.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/DashboardOverview.tsx)

Now also:

- scopes top-test revenue aggregation reads on `invoice_items` by `organization_id`

[src/components/admin/ManageLabs.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageLabs.tsx)

Now:

- scopes lab list by `organization_id`
- writes `organization_id` when creating labs
- limits parent-lab selection to the current organization

[src/components/admin/ManageCollectionCenters.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageCollectionCenters.tsx)

Now:

- scopes collection-center list by `organization_id`
- writes `organization_id` when creating collection centers
- limits lab selection to labs in the current organization

[src/components/admin/LabAnalytics.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/LabAnalytics.tsx)

Now:

- scopes lab analytics queries by both `lab_id` and `organization_id`

[src/components/admin/CollectionCenterAnalytics.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/CollectionCenterAnalytics.tsx)

Now:

- scopes collection-center analytics queries by both `collection_center_id` and `organization_id`

[src/contexts/LabContext.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/contexts/LabContext.tsx)

Now:

- carries `organization_id` on lab records so admin surfaces can filter available labs by current organization

Current limitation:

- the migration and local fixture data are verified, but staging verification is still pending
- browser-level CRUD verification is still pending for inventory categories/items/purchases/usage/maintenance and doctor referral flows

[src/components/admin/ManageVisitorLogs.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageVisitorLogs.tsx)

Now:

- requires resolved organization context before loading logs
- scopes visitor-log list queries by `organization_id`
- scopes CSV export by `organization_id`

[src/components/privacy/CookieConsent.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/privacy/CookieConsent.tsx)

Now:

- logs public `page_view` and `consent_update` events with the resolved organization when available
- passes the current hostname so the logging edge function can resolve tenant context for anonymous visitors
- treats `/book-test`, `/careers`, and `/work-with-us` as public routes for visitor logging too

## Edge Functions Changed

Shared resolver:

- [supabase/functions/_shared/organization-settings.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/_shared/organization-settings.ts)

Updated functions:

- [supabase/functions/create-razorpay-order/index.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/create-razorpay-order/index.ts)
- [supabase/functions/send-email/index.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/send-email/index.ts)
- [supabase/functions/send-whatsapp/index.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/send-whatsapp/index.ts)
- [supabase/functions/create-employee/index.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/create-employee/index.ts)
- [supabase/functions/create-first-admin/index.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/create-first-admin/index.ts)
- [supabase/functions/submit-booking-request/index.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/submit-booking-request/index.ts)
- [supabase/functions/patient-login/index.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/patient-login/index.ts)
- [supabase/functions/_shared/patient-auth.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/_shared/patient-auth.ts)
- [supabase/functions/log-visitor/index.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/log-visitor/index.ts)

Behavior:

- prefer organization settings
- fall back to system settings or env vars where needed
- preserve IRM behavior during transition
- employee/admin onboarding now resolves the target lab’s organization and upserts `organization_users`
- onboarding also writes `organization_id` explicitly onto new employee rows instead of relying only on triggers
- booking requests now resolve and validate organization/lab/collection-center ownership before insert
- booking request alert emails now prefer the resolved organization’s primary email over the old IRM-only fallback
- patient auth email generation is now centralized in `_shared/patient-auth.ts`
- patient auth domain is now configurable via `PATIENT_AUTH_DOMAIN` while keeping the current IRM default as fallback
- email provider fallbacks in `send-email` now use neutral `DEFAULT_FROM_*` / `MAIL_DEFAULT_FROM_*` env-based defaults instead of IRM-specific sender addresses
- frontend fallback branding in notification and Razorpay client code is now tenant-neutral instead of IRM-specific
- visitor logging now resolves tenant context from `organization_id`, hostname, custom domains, or configured subdomain base-domain rules before inserting logs

Important:

- frontend build is verified
- `deno check` was not run because `deno` is not installed locally
- the updated onboarding edge functions were not runtime-tested locally in this pass
- the updated booking edge function was not runtime-tested locally in this pass
- the updated visitor logging edge function was not runtime-tested through `supabase functions serve` in this pass

## Local Verification Helpers

Local-only second tenant seed:

- [scripts/seed_local_second_organization.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/scripts/seed_local_second_organization.sql)

This is only for local verification. It should not be turned into a production migration.

Current local verification result:

- `irmclinic` has 1 default template
- `acme-diagnostics` has 1 default template

Local-only inventory/referral fixture:

- [scripts/seed_local_inventory_and_referrals.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/scripts/seed_local_inventory_and_referrals.sql)

What it creates:

- one local patient per org
- one patient test per org
- one invoice per org
- one inventory category per org
- one inventory item per org
- one inventory purchase per org
- one inventory usage row per org
- one equipment maintenance row per org
- one doctor per org
- one doctor referral per org

Local verification result after running it:

- `inventory_categories`: `irmclinic=1`, `acme-diagnostics=1`
- `inventory_items`: `irmclinic=1`, `acme-diagnostics=1`
- `inventory_purchases`: `irmclinic=1` seeded plus `1` trigger-test row, `acme-diagnostics=1`
- `inventory_usage`: `irmclinic=1`, `acme-diagnostics=1`
- `equipment_maintenance`: `irmclinic=1`, `acme-diagnostics=1`
- `doctor_referrals`: `irmclinic=1`, `acme-diagnostics=1`
- null `organization_id` rows across inventory/referral tables: `0`
- trigger-path insert without `organization_id` auto-assigned the IRM organization on `inventory_purchases`

## Latest Cleanup Pass

This latest pass removed the remaining user-facing IRM defaults from the live app shell and backend fallbacks.

Completed in this pass:

- [src/contexts/OrganizationContext.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/contexts/OrganizationContext.tsx)
  - neutralized the global fallback branding so new tenants do not inherit IRM identity by default
- [src/components/patient/TestReportPDF.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/patient/TestReportPDF.tsx)
  - neutralized report fallback name/address/email/website defaults
- [src/components/ContactSection.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/ContactSection.tsx)
  - stopped querying the first global main lab
  - now uses `OrganizationContext.primaryLab` and organization branding for address, phone, email, and map embed
- [src/components/admin/NotificationSettings.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/NotificationSettings.tsx)
  - replaced IRM-specific SMTP examples with organization-derived sender examples
- [src/pages/PrivacyPolicy.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/pages/PrivacyPolicy.tsx)
  - organization-aware title and contact email
- [src/pages/TermsOfService.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/pages/TermsOfService.tsx)
  - organization-aware title, copy, and contact email
- [src/pages/Careers.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/pages/Careers.tsx)
  - organization-aware page title, meta description, phone CTA, and body copy
- [src/pages/EmployeeAuth.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/pages/EmployeeAuth.tsx)
  - staff reset placeholder now derives from organization website domain
- [src/components/admin/ManageEmployees.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageEmployees.tsx)
  - employee email placeholder now derives from organization website domain
- [supabase/functions/send-email/index.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/send-email/index.ts)
  - default sender fallbacks now use neutral env-driven values instead of IRM-specific addresses
- [src/services/notificationService.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/services/notificationService.ts)
  - default notification brand is now neutral
- [src/services/razorpayService.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/services/razorpayService.ts)
  - fallback business name is now neutral
- [supabase/functions/submit-booking-request/index.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/submit-booking-request/index.ts)
  - booking alert fallback email is now env-driven / neutral instead of hardcoded IRM email
- [supabase/functions/_shared/patient-auth.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/_shared/patient-auth.ts)
  - patient auth email domain is configurable via `PATIENT_AUTH_DOMAIN`
- [20260315001000_add_public_organization_context_rpc.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315001000_add_public_organization_context_rpc.sql)
  - adds `public.get_public_organization_context(_domain, _slug)` for anon-safe public tenant resolution
- [src/contexts/OrganizationContext.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/contexts/OrganizationContext.tsx)
  - now resolves public tenant context through that RPC before falling back to the first public lab
  - supports exact custom-domain lookup through `organization_domains`
  - supports slug-based subdomain lookup when `VITE_PUBLIC_BASE_DOMAIN` is configured
- [src/pages/BookTest.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/pages/BookTest.tsx)
  - public booking metadata is now scoped by the resolved organization
  - booking requests now send `organization_id` explicitly so “no lab selected” does not default to the first tenant
- [src/components/admin/ManageTests.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageTests.tsx)
  - lab and collection-center metadata now require resolved organization context instead of falling back to global rows
- [src/components/admin/ManagePatients.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManagePatients.tsx)
  - patient list, lab list, collection-center list, and patient test history now require resolved organization context
- [src/components/patient/PatientBookTestRequest.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/patient/PatientBookTestRequest.tsx)
  - patient portal booking metadata now uses `patient.organization_id` first and falls back only to resolved organization context, never to global rows
- [src/components/admin/ManageLabs.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageLabs.tsx)
  - lab create, update, and delete flows now require organization context and assert `organization_id` on write queries
- [src/components/admin/ManageCollectionCenters.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageCollectionCenters.tsx)
  - collection-center create, update, and delete flows now require organization context and assert `organization_id` on write queries
- [src/components/admin/DashboardOverview.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/DashboardOverview.tsx)
  - overview metrics, charts, recent tests, and revenue panels now require organization context instead of falling back to shared aggregates
- [src/pages/AdminDashboard.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/pages/AdminDashboard.tsx)
  - sidebar counts now require organization context instead of silently counting shared rows
- [src/components/admin/NoticeBoard.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/NoticeBoard.tsx)
  - notice board queries now require organization context before loading tests, reminders, or invoices
- [src/components/admin/FinancialReports.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/FinancialReports.tsx)
  - financial report queries now require organization context before loading invoices
- [src/components/admin/LabAnalytics.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/LabAnalytics.tsx)
  - lab analytics now require organization context before loading patient test data
- [src/components/admin/CollectionCenterAnalytics.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/CollectionCenterAnalytics.tsx)
  - collection-center analytics now require organization context before loading patient test data
- [src/components/admin/ManageEmployees.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageEmployees.tsx)
  - employee list and custom-role metadata now require organization context before loading
  - employee update and deactivate flows now assert `organization_id` on write queries
- [src/components/admin/ManageTestPackages.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageTestPackages.tsx)
  - package and test metadata now require organization context before loading
  - package create/delete flows now require organization context
- [src/components/admin/ManageTestCatalog.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageTestCatalog.tsx)
  - test and category metadata now require organization context before loading
  - test/category create, update, delete, and test-id backfill flows now require organization context
- [src/components/admin/ManageRoles.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageRoles.tsx)
  - role metadata now requires organization context before loading
  - role create/update/delete flows now require organization context
- [src/components/admin/SendPromotion.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/SendPromotion.tsx)
  - patient targeting list now requires organization context before loading
- [src/components/admin/ManageBilling.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageBilling.tsx)
  - invoice list, billing patient picker, and test-price lookup now fail closed when organization context is missing
  - invoice create, payment update, invoice update, and invoice detail refresh now assert `organization_id`
- [src/components/admin/ManageBookingRequests.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageBookingRequests.tsx)
  - booking-request list and patient match/search flows now fail closed when organization context is missing
  - booking-request status updates and patient-link flows now assert `organization_id`
  - patient creation from booking requests now requires resolved organization context
- [src/components/admin/ManageDoctors.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageDoctors.tsx)
  - doctor list and referral loading now fail closed when organization context is missing
  - doctor save/delete and referral commission updates now assert `organization_id`
- [src/components/admin/ManageReminders.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageReminders.tsx)
  - reminder list and patient dropdown now fail closed when organization context is missing
  - reminder save/delete/complete flows now assert `organization_id`
- [src/components/admin/ManageInventory.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageInventory.tsx)
  - inventory item/category/history loading now fail closed when organization context is missing
  - item save/delete, purchase/usage stock updates, maintenance creation, and category creation now require organization context and assert `organization_id` where supported
- [src/components/admin/ManageTests.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageTests.tsx)
  - patient-test list, patient picker, catalog/categories/packages/doctors/templates metadata now fail closed when organization context is missing
  - patient test creation now writes `organization_id` explicitly on `patient_tests`, `invoices`, and doctor referrals
  - patient test result updates now assert `organization_id`
- [src/components/admin/ManageTestTemplates.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageTestTemplates.tsx)
  - template/category/test metadata now fail closed when organization context is missing
  - template save/delete now require organization context and assert `organization_id`
- [src/components/admin/ManageTestPackages.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageTestPackages.tsx)
  - package/test metadata now consistently fail closed when organization context is missing
  - package save/delete now use a resolved organization ID directly
  - package-test mapping now only hydrates rows for the current organization’s package IDs
- [src/components/admin/ManageTestCatalog.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageTestCatalog.tsx)
  - test/category metadata now consistently fail closed when organization context is missing
  - test ID backfill, test save/delete, and category creation now use a resolved organization ID directly
- [src/components/admin/ManageEmployees.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageEmployees.tsx)
  - employee list and custom-role metadata now use a resolved organization ID consistently
  - employee update/deactivate/toggle-status paths now assert `organization_id`
- [src/components/admin/ManageRoles.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageRoles.tsx)
  - role list, save, and delete flows now use a resolved organization ID consistently
- [src/components/admin/ManageLabs.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageLabs.tsx)
  - lab list, save, delete, and available-lab filtering now use a resolved organization ID consistently
- [src/components/admin/ManageCollectionCenters.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageCollectionCenters.tsx)
  - collection-center list, save, delete, and accessible-lab filtering now use a resolved organization ID consistently
- [src/components/admin/ManagePatients.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManagePatients.tsx)
  - patient billing summary now requires organization context
  - patient create/edit/status-toggle flows now require organization context and assert `organization_id`
  - patient welcome notification calls now pass the resolved organization ID explicitly
- [src/components/patient/BillingPortal.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/patient/BillingPortal.tsx)
  - patient invoice list/details now fail closed when no organization ID is provided
  - patient invoice reads now always assert `organization_id`
- [src/components/patient/TestResultsTable.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/patient/TestResultsTable.tsx)
  - outstanding-dues checks now require a resolved patient organization ID
  - patient report branding now consistently passes the resolved patient organization ID into PDF generation
- [src/components/patient/TestReportPDF.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/patient/TestReportPDF.tsx)
  - fallback lab lookup is now constrained by `organizationId` when available

Verification for this pass:

- `npm run build` passes
- `npm run lint` passes with warnings only
- `supabase db reset` passes with [20260315001000_add_public_organization_context_rpc.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260315001000_add_public_organization_context_rpc.sql) in the chain
- local Supabase stack is up via `supabase status`
- local frontend serves successfully via `npm run dev -- --host 127.0.0.1 --port 4173`
- local HTTP smoke checks returned `200 OK` for:
  - `/`
  - `/book-test`
  - `/auth/patient`
  - `/admin`
- local SQL verification confirmed:
  - `public.get_public_organization_context('localhost', 'irmclinic')` returns the IRM organization and primary lab on a fresh reset
  - `public.get_public_organization_context('localhost', 'acme-diagnostics')` returns the second local tenant and its primary lab after seeding
- local second-tenant fixture and operational fixture were applied:
  - [scripts/seed_local_second_organization.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/scripts/seed_local_second_organization.sql)
  - [scripts/seed_local_inventory_and_referrals.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/scripts/seed_local_inventory_and_referrals.sql)
- local tenant isolation checks now show:
  - organizations: `acme-diagnostics`, `irmclinic`
  - per-org template counts: `acme-diagnostics=1`, `irmclinic=1`
  - per-org doctor/referral counts: `acme-diagnostics=1/1`, `irmclinic=1/1`
  - per-org inventory counts: each org has `1` category, item, purchase, usage, and maintenance row in the local fixture
- local null-organization checks remain clean for the sampled tenant-scoped tables:
  - `patients`, `invoices`, `patient_tests`, `booking_requests`, `patient_reminders`, `doctors`, `doctor_referrals`, `test_templates`, `tests`, `test_categories`, `test_packages`, `custom_roles`, `inventory_categories`, `inventory_purchases`, `inventory_usage`, `equipment_maintenance`
- local visitor-log verification now shows:
  - `visitor_logs.organization_id` exists after reset
  - sample rows can be inserted separately for `irmclinic` and `acme-diagnostics`
  - direct local SQL count check returns `irmclinic=1`, `acme-diagnostics=1`
  - `visitor_logs` now has the organization-aware policy `Organization admins can view visitor logs`
  - runtime `log-visitor` verification succeeded locally via `curl` against `http://127.0.0.1:54321/functions/v1/log-visitor`
  - hostname-based tenant resolution wrote `/book-test` to `acme-diagnostics` for `acme-diagnostics.localhost`
  - explicit local-dev `organization_id` resolution wrote `/privacy` to `irmclinic` for `hostname=localhost`
- local booking-request runtime verification now shows:
  - valid Acme payload returned `200` and inserted a `booking_requests` row with the correct `organization_id`, `lab_id`, `source=website`, and `status=new`
  - mismatched `organization_id + lab_id` payload returned `400` with `Selected lab does not belong to the resolved organization.`
- local patient-portal runtime verification now shows:
  - `patient-login` returned `200` for seeded Acme patient `PATACMELOCAL001` using the default local password equal to `patient_id`
  - `patient-login` created and linked a local auth user for that patient
  - signing in through local Supabase Auth succeeded and returned a usable access token
  - with that patient token, REST reads returned only tenant-safe Acme data:
    - invoices: only `INV-ACME-LOCAL-001`
    - invoice items: only `ACME CBC`
    - patient tests: only `ACME CBC`
    - labs: only `ACME001`
    - payments: none
    - collection centers: none
  - querying the known IRM invoice `INV-IRM-LOCAL-001` with the Acme patient token returned `[]`
- local billing-child verification now shows:
  - `invoice_items.organization_id`, `payments.organization_id`, and `billing_audit.organization_id` exist after reset
  - policies present:
    - `Staff can manage invoice items by organization`
    - `Staff can manage payments by organization`
    - `Staff can view billing audit logs by organization`
    - `Staff can insert billing audit logs by organization`
  - trigger-path inserts without `organization_id` wrote the correct IRM org on both `invoice_items` and `payments`
  - runtime billing-audit verification succeeded for:
    - `payment_updated` on IRM
    - `invoice_updated` on Acme
    - `payment_recorded` on Acme
    - `payment_deleted` on Acme
  - `payment_deleted` audit rows now store the deleted payment UUID in `old_values.payment_id` while leaving `billing_audit.payment_id` null
  - exact local per-org counts after billing-child verification:
    - `acme-diagnostics`: `invoice_items=1`, `payments=0`, `billing_audit=3`
    - `irmclinic`: `invoice_items=1`, `payments=0`, `billing_audit=1`
  - null `organization_id` rows:
    - `invoice_items=0`
    - `payments=0`
    - `billing_audit=0`
- admin and patient booking flows above no longer make first-pass global lab/collection-center reads when organization context is missing
- dashboard, notice-board, financial, and analytics panels above no longer fall back to shared aggregates when organization context is missing
- employees, packages, catalog, roles, and promotion targeting above now require organization context instead of treating tenant scope as optional
- billing, booking-request conversion, and doctor/referral admin flows above now fail closed when organization context is missing and assert `organization_id` on their main write paths
- reminder and inventory admin flows above now fail closed when organization context is missing and assert `organization_id` on their main write paths
- test entry/result and test-template admin flows above now fail closed when organization context is missing and assert `organization_id` on their main write paths
- patient management, patient billing, and patient results flows above now fail closed more consistently and carry the resolved organization ID through their main reads/writes
- test package and test catalog admin flows above now use a resolved organization ID consistently instead of conditional organization checks
- employees, roles, labs, and collection-center admin flows above now use a resolved organization ID consistently instead of repeated direct `organization?.id` checks
- non-migration search now shows only one intentional IRM-specific live-code fallback:
  - `patients.irmclinic.local` in [supabase/functions/_shared/patient-auth.ts](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/functions/_shared/patient-auth.ts)
  - this is deliberate as a backward-compatible default until a tenant-aware patient auth domain strategy replaces it
- `deno check` still has not been run locally because `deno` is not installed
- current lint baseline is:
  - `11` warnings
  - all are repo-wide `react-refresh/only-export-components` warnings in shared UI/context/auth files
  - there are no remaining tenant-specific hook-dependency warnings from the multi-tenant hardening pass

Latest hook-dependency cleanup files:

- [src/components/admin/CollectionCenterAnalytics.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/CollectionCenterAnalytics.tsx)
- [src/components/admin/FinancialReports.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/FinancialReports.tsx)
- [src/components/admin/LabAnalytics.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/LabAnalytics.tsx)
- [src/components/admin/ManageVisitorLogs.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageVisitorLogs.tsx)
- [src/components/admin/NoticeBoard.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/NoticeBoard.tsx)
- [src/components/admin/SendPromotion.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/SendPromotion.tsx)
- [src/components/admin/SystemSettings.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/SystemSettings.tsx)
- [src/components/admin/ManageBookingRequests.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageBookingRequests.tsx)
- [src/contexts/LabContext.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/contexts/LabContext.tsx)
- [src/contexts/OrganizationContext.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/contexts/OrganizationContext.tsx)
- [src/pages/PatientDashboard.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/pages/PatientDashboard.tsx)
- [src/components/ui/turnstile.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/ui/turnstile.tsx)

## What Is Still Pending

Main remaining work:

1. Manual UI verification in browser for all tenant-aware flows
2. Staging deployment and staging migration verification
3. Multi-tenant runtime verification in staging with real tenant data
4. Add a true platform billing / subscriptions module for software-owner package and revenue tracking
5. Edge-function validation with `deno check` or Supabase function deploy validation

Highest-risk areas still worth checking next:

- browser verification of `/platform`
- browser verification of `/platform/leads`
- browser verification of `/platform/onboarding`
- browser verification of `/platform/customers`
- browser verification of `/platform/customers/:orgId`
- browser verification of `src/components/admin/ManageBilling.tsx`
- browser verification of `src/components/admin/ManageBilling.tsx` after billing-child org scoping
- browser verification of `src/components/admin/ManageBookingRequests.tsx`
- browser verification of `src/components/admin/ManageDoctors.tsx`
- browser verification of `src/components/admin/ManageReminders.tsx`
- browser verification of `src/components/admin/ManageInventory.tsx`
- browser verification of `src/components/admin/ManageTests.tsx`
- browser verification of `src/components/admin/ManageTestTemplates.tsx`
- browser verification of `src/components/admin/ManageTestPackages.tsx`
- browser verification of `src/components/admin/ManageTestCatalog.tsx`
- browser verification of `src/components/admin/ManageEmployees.tsx`
- browser verification of `src/components/admin/ManageRoles.tsx`
- browser verification of `src/components/admin/ManageLabs.tsx`
- browser verification of `src/components/admin/ManageCollectionCenters.tsx`
- browser verification of `src/components/admin/ManagePatients.tsx`
- browser verification of `src/components/admin/ManageVisitorLogs.tsx`
- browser verification of `src/components/patient/BillingPortal.tsx`
- browser verification of `src/components/patient/TestResultsTable.tsx`
- browser verification of `src/components/admin/ManageEmployees.tsx`
- browser verification of `src/components/admin/ManageTestPackages.tsx`
- browser verification of `src/components/admin/ManageTestCatalog.tsx`
- browser verification of `src/components/admin/ManageRoles.tsx`
- browser verification of `src/components/admin/SendPromotion.tsx`
- browser verification of patient portal dues/results/billing against a second tenant dataset
- browser verification of patient portal lab/collection-center booking options against a second tenant dataset
- staging/runtime verification of patient and employee password-reset emails after the organization-aware branding change
- staging/runtime verification that cross-tenant admins cannot reset patient or employee passwords outside their own organization
- staging/runtime verification of OTP delivery after organization-scoped settings lookup was added
- staging/runtime verification of patient login, OTP, and password reset on real tenant hostnames after the new public tenant-resolution path
- configure a non-local patient reset origin/base URL in staging so `patient-request-password-reset` can complete the full happy path during verification
- local runtime verification now confirms `send-otp` and `verify-otp` both accept an explicit full-URL `hostname` hint such as `https://acme-diagnostics.localhost:8080`, after fixing the public hostname resolver in [public-organization.ts](./supabase/functions/_shared/public-organization.ts)
- staging/runtime verification of `create-employee` after the new same-organization enforcement, especially:
  - admin creates employee in own org
  - admin cannot target another org’s lab
  - existing email from another org is rejected
- staging/runtime verification of `employee-login` after the new access checks, especially:
  - active employee with active organization membership can log in
  - inactive employee is rejected
  - user with `user_roles` but no active organization membership is rejected
- runtime verification of anonymous `log-visitor` edge-function inserts under real staging tenant hostnames
- staging verification of anonymous `submit-booking-request` inserts under real tenant hostnames and tenant-specific alert-email routing
- staging verification of patient-login and patient-portal reads under real tenant patient accounts
- browser verification of `src/components/admin/ManageTests.tsx` and `src/components/admin/ManagePatients.tsx` after the stricter org gating
- browser verification of dashboard, notice board, financial reports, lab analytics, and collection-center analytics after the stricter org gating
- browser verification of employees, test packages, test catalog, roles, and promotion targeting after the stricter org gating
- staging verification of public tenant resolution via:
  - exact domain records in `organization_domains`
  - subdomain slug routing with `VITE_PUBLIC_BASE_DOMAIN`
- any analytics/reporting query that aggregates without `organization_id`
- verify [20260314213000_scope_inventory_and_referrals_by_organization.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260314213000_scope_inventory_and_referrals_by_organization.sql) in staging with real inventory/referral records
- verify [20260314230000_scope_test_catalog_and_roles_by_organization.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260314230000_scope_test_catalog_and_roles_by_organization.sql) in staging with real test catalog and custom-role data
- verify [20260314234500_harden_remaining_operational_rls_by_organization.sql](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/supabase/migrations/20260314234500_harden_remaining_operational_rls_by_organization.sql) in staging with real staff and patient accounts
- add real `organization_domains` rows for staging tenants and verify public-site branding/booking on those hostnames
- replace or redesign the remaining intentional IRM-compatible patient auth fallback:
  - `supabase/functions/_shared/patient-auth.ts`
- broader staging verification for employee creation flow and inventory CRUD after the new RLS
- staging verification of payment recording, invoice editing, patient billing portal invoice details, and billing audit history after billing-child org scoping
- runtime verification of the updated employee/admin onboarding edge functions after deploy
- platform-side design/system consistency across all platform pages after the new customer modules

## Recommended Next Steps

Best next technical phase:

1. Verify browser CRUD for:
   - platform overview
   - platform leads
   - platform onboarding
   - platform customers
   - platform customer detail
   - billing
   - booking requests
   - doctor management / referral commission updates
   - reminders
   - inventory
   - test entry / result updates
   - test templates
   - test packages
   - test catalog
   - employees / custom roles
   - labs / collection centers
   - patients / patient billing summary
   - patient portal billing / test-result downloads
   - employees
   - test packages
   - test catalog
   - custom roles
   - promotional targeting
   - inventory/referrals
2. Verify patient portal fetches are tenant-safe
3. Add software-owner billing / subscriptions module if platform operations need to be fuller before rollout
4. Deploy updated edge functions to staging
5. Run full staging smoke test:
   - admin login
   - platform login
   - platform overview / customer ops
   - patient creation
   - welcome notification
   - test creation/result entry
   - report printing
   - billing/payment
   - reminders
   - template CRUD

## Local Commands

Start local Supabase:

```sh
supabase start
```

Reset local DB:

```sh
supabase db reset
```

Run frontend:

```sh
npm run dev
```

Build frontend:

```sh
npm run build
```

Seed second local org for isolation testing:

```sh
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f scripts/seed_local_second_organization.sql
```

Seed local inventory/referral fixture data:

```sh
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f scripts/seed_local_inventory_and_referrals.sql
```

## Important Notes

- Do not remove the patient-auth reset-fix migrations unless the whole migration history is rebuilt from scratch.
- The local-only second-org seed script is optional, but useful for repeatable tenant-isolation checks.
- The repo still has areas where tenant safety is not fully proven yet; do not assume everything is fully isolated just because branding/settings are now tenant-aware.

## Suggested Prompt For Next AI Agent

Use this repo handoff file first:

`Read AI_HANDOFF_MULTI_TENANT.md and continue the multi-tenant commercialization work in /Users/syed44/Git_Stuff/Git_Projects/irmclinic. Prioritize remaining organization-level DB/RLS hardening and tenant-safe query review. Local Supabase reset works, frontend build passes, and test_templates are already organization-scoped and locally verified with a second tenant.`
## Latest Update

- added a dedicated platform customer-ops page at `/platform/customers`
- added tenant detail drilldown at `/platform/customers/:orgId`
- fixed the broken tenant-detail employee query by loading staff via tenant lab IDs instead of non-existent `employees.organization_id`
- platform-admin state is now materially more complete:
  - overview
  - leads
  - onboarding
  - customer directory
  - customer detail
- Hardened [create-razorpay-order](./supabase/functions/create-razorpay-order/index.ts) so staff can no longer create payment orders for invoices outside organizations they actively belong to. Global `admin` or `employee` role alone is no longer enough.
- Updated [razorpay-webhook](./supabase/functions/razorpay-webhook/index.ts) to write `payments.organization_id` explicitly from the resolved invoice instead of relying only on billing triggers.
- Added [20260315044500_backfill_razorpay_payment_columns.sql](./supabase/migrations/20260315044500_backfill_razorpay_payment_columns.sql) because the original Razorpay-fields migration ran before `payments` existed on fresh resets. This catch-up migration guarantees `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`, and `payment_gateway` exist locally and in future resets.
- Updated [razorpay-webhook](./supabase/functions/razorpay-webhook/index.ts) again to resolve `razorpay_webhook_secret` per organization before signature verification, using `organization_id` from order notes first and falling back to invoice lookup or the legacy env secret.
- Hardened [sync-api-keys](./supabase/functions/sync-api-keys/index.ts): it now requires a real authenticated admin with active organization membership and returns only that organization's masked Razorpay settings instead of exposing global settings to any request with an `Authorization` header.
- Added [20260315050000_scope_whatsapp_webhook_events_by_organization.sql](./supabase/migrations/20260315050000_scope_whatsapp_webhook_events_by_organization.sql) and updated [send-whatsapp](./supabase/functions/send-whatsapp/index.ts) plus [whatsapp-webhook](./supabase/functions/whatsapp-webhook/index.ts) so WhatsApp event logs now carry `organization_id` where the system can resolve it. Outgoing send logs stamp the resolved organization directly; inbound webhook rows recover organization from prior message events or a unique patient phone match when possible. Admin read access is now organization-scoped.
- Hardened [send-email](./supabase/functions/send-email/index.ts) and [send-whatsapp](./supabase/functions/send-whatsapp/index.ts): they now require either a valid authenticated app user or a trusted internal edge-function caller via `x-internal-service-key`. Internal callers in [submit-booking-request](./supabase/functions/submit-booking-request/index.ts), [patient-request-password-reset](./supabase/functions/patient-request-password-reset/index.ts), [patient-admin-reset-password](./supabase/functions/patient-admin-reset-password/index.ts), and [employee-admin-reset-password](./supabase/functions/employee-admin-reset-password/index.ts) were updated accordingly. This closes the anonymous relay/spam path while preserving internal email flows.
- Local verification for the relay hardening:
  - `npm run build` passes
  - anonymous `send-email` probe now returns `401 {"error":"Unauthorized"}`
  - anonymous `send-whatsapp` probe now returns `401 {"success":false,"error":"Unauthorized"}`
- Added [STAGING_SMOKE_TEST_MULTI_TENANT.md](./STAGING_SMOKE_TEST_MULTI_TENANT.md) as the concrete staging/browser verification checklist.
- Added [scripts/run_local_multitenant_smoke.sh](./scripts/run_local_multitenant_smoke.sh) as a repeatable local smoke script that:
  - resets local Supabase
  - reseeds second-tenant and billing/inventory fixtures
  - creates a local admin
  - verifies authenticated `sync-api-keys`
  - verifies anonymous `send-email` and `send-whatsapp` are rejected
  - verifies Razorpay payment columns and WhatsApp org-scoping schema are present
  - verifies org-specific WhatsApp GET webhook verification and signed POST webhook verification
  - verifies inserted WhatsApp webhook events resolve to the expected tenant by `phone_number_id`
- Local verification for the last two backend hardening steps:
  - `npm run build` passes after the `sync-api-keys` and WhatsApp event-log changes
  - `sync-api-keys` now returns `200` only for an authenticated local admin and includes the resolved `organization_id`; anonymous requests return `401 Unauthorized`
  - `supabase db reset` passes with `20260315050000_scope_whatsapp_webhook_events_by_organization.sql` in the chain
  - local schema check confirms `whatsapp_webhook_events.organization_id` exists
  - local policy check confirms `Admins can view whatsapp webhook events by organization` exists
- WhatsApp credentials are now organization-capable on the backend:
  - [SystemSettings](./src/components/admin/SystemSettings.tsx) now exposes organization overrides for `whatsapp_access_token`, `whatsapp_phone_number_id`, `whatsapp_api_version`, `whatsapp_verify_token`, and `whatsapp_app_secret`
  - [send-whatsapp](./supabase/functions/send-whatsapp/index.ts) now prefers those organization settings before falling back to global env secrets
  - [send-otp](./supabase/functions/send-otp/index.ts) now uses organization-scoped WhatsApp credentials too, not just template/country settings
  - [whatsapp-webhook](./supabase/functions/whatsapp-webhook/index.ts) now supports organization-scoped GET verify tokens and POST app-secret verification keyed by `whatsapp_phone_number_id`
  - local runtime verification passed:
    - org-specific WhatsApp GET verification returned `200`
    - signed org-specific WhatsApp POST webhook returned `200`
    - inserted webhook event row resolved to the Acme organization via `phone_number_id`
- SMS fallback is now organization-capable too:
  - [SystemSettings](./src/components/admin/SystemSettings.tsx) now has an `SMS & OTP` tab with organization overrides for `demo_mode_enabled`, `msg91_auth_key`, `msg91_template_id`, and `msg91_sender_id`
  - [send-otp](./supabase/functions/send-otp/index.ts) now prefers `msg91_auth_key` from organization settings before falling back to the global `MSG91_AUTH_KEY` env secret
- Email provider configuration is now organization-capable too:
  - [SystemSettings](./src/components/admin/SystemSettings.tsx) now exposes organization overrides for `mailjet_api_key`, `mailjet_secret_key`, `resend_api_key`, `mailgun_api_key`, `mailgun_domain`, and `sendgrid_api_key`
  - [send-email](./supabase/functions/send-email/index.ts) now prefers those organization-specific provider credentials before falling back to platform Edge Function secrets, and does not silently mix tenant credentials with unrelated platform providers
  - [NotificationSettings](./src/components/admin/NotificationSettings.tsx) now reflects the tenant model: it shows resolved sender identity, whether each provider is configured for the current organization, and explains the organization-first / platform-fallback setup path
  - [SystemSettings](./src/components/admin/SystemSettings.tsx), [send-email](./supabase/functions/send-email/index.ts), and [send-whatsapp](./supabase/functions/send-whatsapp/index.ts) no longer describe provider setup as platform-only; the admin copy and runtime error messages now consistently point to organization overrides first and platform secrets second
  - removed the stale [send-email/debug.ts](./supabase/functions/send-email/debug.ts) helper so future deploys do not carry an env-secret status endpoint that no longer matches the tenant model
- OTP tenant resolution is now cleaner for browser-style public requests too:
  - [public-organization.ts](./supabase/functions/_shared/public-organization.ts) now accepts an explicit `hostname` hint as either a raw hostname or a full URL
  - local runtime verification with a deliberate duplicate phone across IRM and Acme now confirms:
    - `send-otp` without tenant context still rejects the ambiguous phone
    - `send-otp` with `hostname=https://acme-diagnostics.localhost:8080` succeeds
    - `verify-otp` with the same explicit hostname hint succeeds and resolves the Acme patient correctly
- First-admin bootstrap is stricter now:
  - [create-first-admin](./supabase/functions/create-first-admin/index.ts) no longer treats lab and organization membership setup as best-effort
  - if employee creation, role assignment, lab membership, or organization membership fails, the function now rolls the bootstrap user back instead of leaving a partially created admin account behind
  - the function now hard-fails if it cannot resolve an organization for the first admin
- Lab-code uniqueness is now compatible with real multi-tenant onboarding:
  - [20260315060000_scope_lab_code_uniqueness_by_organization.sql](./supabase/migrations/20260315060000_scope_lab_code_uniqueness_by_organization.sql) removes the old global `UNIQUE(lab_code)` rule on `labs`
  - labs now use `UNIQUE (organization_id, lab_code)` instead, so different tenants can each have a natural primary lab code such as `LAB001`
  - local seed fixtures were updated to use org-scoped lab upserts and org-scoped lab lookups
- A new internal provisioning path now exists:
  - [provision-organization](./supabase/functions/provision-organization/index.ts) creates a new organization, optional primary domain, primary lab, lab settings row, owner auth user, owner employee record, `user_roles` admin role, `organization_users` owner membership, and `lab_users` primary admin membership
  - [supabase/config.toml](./supabase/config.toml) now disables JWT verification for `provision-organization` so it can be called by trusted platform automation
  - the function accepts trusted platform credentials through `x-internal-service-key`, `apikey`, or `Authorization: Bearer ...`
  - local manual runtime verification succeeded for a new tenant:
    - request created `zen-diagnostics`
    - response returned `success: true`
    - the new tenant received its own `LAB001`
    - owner account and primary lab were created successfully
- Local verification for the latest email-provider cleanup:
  - `npm run build` passes after the organization-capable email provider changes
  - `bash scripts/run_local_multitenant_smoke.sh` still passes end to end after the `send-email` provider-resolution changes
  - a follow-up stale-copy scan no longer finds the old platform-only email/WhatsApp setup messaging in the main admin surfaces
  - staging smoke coverage now explicitly includes verifying tenant-specific email provider overrides versus platform fallback
- Local verification for the latest bootstrap hardening:
  - `bash scripts/run_local_multitenant_smoke.sh` still passes after hardening [create-first-admin](./supabase/functions/create-first-admin/index.ts)
  - the smoke script now verifies the first bootstrap succeeds and that a second unauthenticated `create-first-admin` call returns `400` after the first admin exists
- Local smoke script notes for provisioning:
  - [scripts/run_local_multitenant_smoke.sh](./scripts/run_local_multitenant_smoke.sh) now includes a provisioning probe for `provision-organization`
  - if the local Supabase CLI exposes the post-reset platform secret cleanly, the smoke script verifies provisioning and expects a third organization plus a second `LAB001`
  - if the local CLI cannot reliably expose that secret immediately after reset, the script skips the provisioning assertion instead of failing the whole baseline; manual provisioning was still verified successfully outside the script
- Local runtime verification passed for the payment guard:
  - IRM admin login succeeded through `employee-login`
  - `create-razorpay-order` against Acme invoice `INV-ACME-LOCAL-001` returned `403`
  - response body: `Access denied. You do not belong to this organization.`
- Clean-reset payment verification now also passed:
  - `supabase db reset` applied `20260315044500_backfill_razorpay_payment_columns.sql` successfully
  - local `payments` table now includes `payment_gateway`, `razorpay_order_id`, `razorpay_payment_id`, and `razorpay_signature`
  - after reseeding `scripts/seed_local_second_organization.sql` and `scripts/seed_local_inventory_and_referrals.sql`, a signed `payment.captured` webhook using IRM's org-specific `razorpay_webhook_secret` returned `200`
  - invoice `INV-IRM-LOCAL-001` moved from `partial` to `paid`
  - `payments` row was inserted with:
    - `organization_id = irmclinic`
    - `amount = 200.00`
    - `payment_gateway = razorpay`
    - `razorpay_order_id = order_test_org_secret_002`
    - `razorpay_payment_id = pay_test_org_secret_002`
- Invoice numbering is now tenant-safe too:
  - [20260315070000_scope_invoice_numbers_by_organization.sql](./supabase/migrations/20260315070000_scope_invoice_numbers_by_organization.sql) removes the old global `UNIQUE(invoice_number)` rule
  - invoices now use org-scoped uniqueness through:
    - a unique index on `(organization_id, invoice_number)` for tenant-owned rows
    - a fallback unique index on `invoice_number` only when `organization_id IS NULL`
  - [generate_invoice_number](./supabase/migrations/20260315070000_scope_invoice_numbers_by_organization.sql) now accepts `p_organization_id` and uses an advisory lock plus per-org sequence scan to produce deterministic `INVYY#####` values inside each organization
  - [src/lib/invoiceNumbers.ts](./src/lib/invoiceNumbers.ts) now drives invoice creation from the DB function instead of client-side random strings
  - [ManageBilling](./src/components/admin/ManageBilling.tsx) and [ManageTests](./src/components/admin/ManageTests.tsx) now request invoice numbers from the database using the current organization
  - [create-razorpay-order](./supabase/functions/create-razorpay-order/index.ts) now sends single-invoice receipts as `INV-{invoice_id}` and still keeps `invoice_number` in notes for display/debugging
  - [razorpay-webhook](./supabase/functions/razorpay-webhook/index.ts) now resolves new receipts by invoice UUID first and only falls back to the legacy invoice-number receipt format for backward compatibility
  - local verification after reseeding `acme-diagnostics` confirmed:
    - `generate_invoice_number(id)` returns `INV2600001` for both `irmclinic` and `acme-diagnostics`
    - transactional inserts allowed the same `INV2609999` to exist once in IRM and once in Acme
- Quotations are no longer a hidden single-tenant table:
  - [20260315073000_scope_quotations_by_organization.sql](./supabase/migrations/20260315073000_scope_quotations_by_organization.sql) adds `organization_id` to `quotations` and `quotation_items`
  - existing quotation rows now backfill `organization_id` from the creator’s active org membership, with IRM fallback for legacy data
  - quotation items now sync their `organization_id` from the parent quotation through a trigger
  - quotation numbers now use the same org-scoped uniqueness pattern as invoices
  - public or globally open quotation policies are gone; quotation reads and writes now require active organization access
  - local reset verification confirmed the new quotation policies exist:
    - `Organization staff can view quotations`
    - `Organization staff can manage quotations`
    - `Organization staff can view quotation items`
    - `Organization staff can manage quotation items`
- Patient and employee human-readable IDs are no longer globally shared:
  - [20260315080000_scope_patient_employee_ids_by_organization.sql](./supabase/migrations/20260315080000_scope_patient_employee_ids_by_organization.sql) removes the old global unique constraints on `patients.patient_id` and `employees.employee_id`
  - both tables now use:
    - a unique index on `(organization_id, patient_id)` / `(organization_id, employee_id)` for tenant-owned rows
    - a fallback unique index on the code alone only when `organization_id IS NULL`
  - local reset verification confirmed all four new indexes exist
  - transactional local verification confirmed the same `patient_id` can exist in both `irmclinic` and `acme-diagnostics` at the same time
  - there was no Acme employee fixture row to mirror against during this check, so the employee side is schema-verified but not yet data-verified
- Patient portal usernames are no longer globally shared either:
  - [20260315083000_scope_patient_usernames_by_organization.sql](./supabase/migrations/20260315083000_scope_patient_usernames_by_organization.sql) removes the old global unique constraint on `patients.username`
  - patient usernames now use:
    - a unique index on `(organization_id, username)` when both values are present
    - a fallback unique index on `username` only for legacy rows where `organization_id IS NULL`
  - `supabase db reset` passes with this migration in the chain
  - transactional local verification confirmed the same username `shared-local-user` can exist in both `irmclinic` and `acme-diagnostics` at the same time
- Staging rollout assets are now packaged in-repo:
  - [STAGING_DEPLOYMENT_CHECKLIST_MULTI_TENANT.md](./STAGING_DEPLOYMENT_CHECKLIST_MULTI_TENANT.md) defines deploy order, required secrets/settings, rollback triggers, and tenant setup prerequisites
  - [STAGING_SMOKE_TEST_MULTI_TENANT.md](./STAGING_SMOKE_TEST_MULTI_TENANT.md) is the browser/runtime smoke checklist
  - [scripts/staging_sql_spot_checks.sql](./scripts/staging_sql_spot_checks.sql) is the post-deploy SQL verification pack
- Production rollout assets are now packaged too:
  - [PRODUCTION_ROLLOUT_CHECKLIST_MULTI_TENANT.md](./PRODUCTION_ROLLOUT_CHECKLIST_MULTI_TENANT.md) defines the go/no-go rule, production deploy order, IRM-first smoke pass, rollback triggers, and post-cutover monitoring
- Deploy helpers now exist too:
  - [scripts/deploy_multitenant_functions.sh](./scripts/deploy_multitenant_functions.sh) deploys the full multi-tenant edge-function set used by staging/production rollout docs
  - [scripts/print_multitenant_release_manifest.sh](./scripts/print_multitenant_release_manifest.sh) prints the late migration set, rollout docs, and deploy helper path for release review
- Tenant onboarding assets now exist too:
  - [TENANT_ONBOARDING_CHECKLIST.md](./TENANT_ONBOARDING_CHECKLIST.md) defines the end-to-end onboarding flow for a new diagnostic lab customer
  - [scripts/provision_organization_payload.example.json](./scripts/provision_organization_payload.example.json) is the provisioning payload template for `provision-organization`
  - [scripts/tenant_post_provision_checks.sql](./scripts/tenant_post_provision_checks.sql) verifies that the new tenant’s core org, domain, admin, lab, and settings rows were created correctly
- Commercial packaging assets now exist too:
  - [GO_TO_MARKET_PRICING.md](./GO_TO_MARKET_PRICING.md) defines the recommended first product tiers, pricing logic, add-ons, and founder-led sales motion
  - [SALES_ONE_PAGE_OFFER.md](./SALES_ONE_PAGE_OFFER.md) is a short customer-facing offer summary for demos and early sales conversations
  - [LANDING_PAGE_COPY.md](./LANDING_PAGE_COPY.md) defines the root product homepage copy and the tenant-branded lab homepage copy
- Public platform vs tenant routing is now implemented for the main public routes:
  - [publicTenant.ts](./src/lib/publicTenant.ts) centralizes hostname/platform detection
  - [usePublicPageMode.ts](./src/hooks/usePublicPageMode.ts) exposes platform-host and platform-mode state to public pages
  - [OrganizationContext.tsx](./src/contexts/OrganizationContext.tsx) no longer falls back to the first active main lab when no tenant is resolved on the public host
  - root `/` now renders [ProductLandingPage](./src/components/platform/ProductLandingPage.tsx) on platform hosts and the existing lab homepage on tenant hosts
  - `/privacy` and `/terms` now render platform legal pages on platform hosts and tenant-branded legal pages on tenant hosts
  - `/careers` now renders a platform careers page on platform hosts and the tenant recruiting page on tenant hosts
  - `/book-test` now renders a platform demo-request page with real lead capture on platform hosts and the tenant booking-request form on tenant hosts
  - `/auth/patient` and `/auth/staff` now render platform access-guidance pages on platform hosts and tenant auth forms on tenant hosts
  - `/patient/reset-password` and `/staff/reset-password` now render platform reset-guidance pages on platform hosts and tenant reset flows on tenant hosts
  - unmatched routes now render a platform-branded 404 page on platform hosts instead of a bare generic fallback
  - [PlatformSiteHeader.tsx](./src/components/platform/PlatformSiteHeader.tsx) and [PlatformSiteFooter.tsx](./src/components/platform/PlatformSiteFooter.tsx) provide the shared platform-site shell
  - [PlatformAccessPage.tsx](./src/components/platform/PlatformAccessPage.tsx) and [PlatformResetPage.tsx](./src/components/platform/PlatformResetPage.tsx) provide the shared platform guidance shells for auth and reset routes
  - [submit-demo-request](./supabase/functions/submit-demo-request/index.ts) stores product leads in `platform_demo_requests`
  - `npm run build` passes after the full public split

---

## ABDM Integration (Milestone 1 + 2 + 3 frontend/backend)

### Edge Functions Added
- `abdm-enroll-abha` — 4-action multi-step ABHA enrollment via Aadhaar OTP: `send_otp`, `verify_otp`, `get_suggestions`, `set_address`. Uses `node:crypto` RSA-OAEP SHA-256 encryption. T-token stored server-side only, never returned to frontend. Gateway session token obtained before cert fetch (cert endpoint requires Bearer auth). `set_address` optionally updates `patients` table directly if `patient_id` is provided.
- `abdm-running-token` — Dual-mode: POST with JWT generates a 6-char QR token (staff intake), GET `?hipId=` returns current token for ABDM callback. Expires previous active tokens. Returns `qr_payload` JSON string for QR display.
- `abdm-link-care-context` — 4-step: gateway session token → link token → link care context → notify patient. Notify step non-fatal. Creates `abdm_care_context_links` row, updates progressively.

### Migrations Added
- `20260316100000_create_abdm_enrollment_sessions.sql` — stores txnId + T-token server-side during multi-step enrollment, 15-min expiry
- `20260316110000_create_abdm_running_tokens.sql` — tracks live QR tokens for Scan and Share intake
- `20260316120000_create_abdm_care_context_links.sql` — tracks each HIP-initiated care context link
- `20260316130000_expand_abdm_scan_log_request_types.sql` — expands `abdm_scan_logs.request_type` CHECK constraint

### UI Components Added
- `src/components/admin/AbhaEnrollmentDialog.tsx` — 4-step wizard (Aadhaar → OTP → address → done). Aadhaar masked as password. Uses `InputOTP`. On "Apply to Patient" calls `onEnrolled(result)`.
- `src/components/admin/AbdmQrCodeDisplay.tsx` — shows live QR code from `abdm-running-token`. Countdown timer, auto-refresh on expiry, token value badge, wait time display.
- `src/components/admin/AbdmCareContextButton.tsx` — disabled with tooltip if patient has no ABHA address, confirmation dialog before linking, shows "Linked to ABHA" checkmark after success.

### Patient Form — Full ABHA Integration
- `AbhaEnrollmentDialog` is now embedded directly inside `PatientForm` (both Add and Edit dialogs)
- "Enroll via Aadhaar" button appears inline next to ABHA fields when no ABHA is set
- When ABHA is already set, shows a green confirmation badge with number, address, status, and "Re-enroll / Change" link
- **Mismatch detection**: after enrollment, if ABHA name/gender/DOB differs from existing form data, a side-by-side dialog lets staff pick field-by-field which version to keep. ABHA number and address always applied.
- For edit form: `patientId` is passed so edge function's `set_address` also directly updates the DB record
- Removed the separate "Create ABHA" toolbar button — enrollment is now inline in the form

### ManageTests — Care Context Linking
- `AbdmCareContextButton` added to each completed test row
- `abha_address` added to the patients sub-select in the query
- Button only shown for `status === "completed"` tests

### SystemSettings — ABDM Settings Restructured
- Added `platform_only` flag to `SystemSetting` interface
- Bridge ID (Client ID), Client Secret, Callback URL, Gateway URL marked `platform_only: true` — hidden from org admin view, only visible to platform admin (no-org context)
- Org admins now see only: Enabled toggle, Scan Share Enabled, Environment, HFR Facility ID, HIP ID (Service ID), CM ID
- Updated descriptions throughout to explain the Bridge ID model (one Bridge ID per software provider, labs link via HFR login)
- ABDM section now shows a "How to connect" guide for org admins explaining the HFR linking steps
- Platform admin view shows "Platform Bridge ID credentials" header

### ABDM Architecture Confirmed (from Postman collection analysis)
- Client ID = Bridge ID — one per software provider, platform-level, NOT per org
- `clientId` + `clientSecret` → get gateway `accessToken` → used for ALL API calls
- Per-facility identity set via `X-HIP-ID` header on each request
- Each lab gets a `serviceId` / HIP ID after linking their HFR facility to the Bridge ID
- Labs link via HFR Health Facility Login — they never need the Client ID/Secret

### Bug Fixes
- `abdm-enroll-abha`: `fetchAbdmCert` now calls `requestAbdmSessionToken()` first — ABDM cert endpoint requires gateway Bearer auth
- `ManageBookingRequests`: `lab_id: selectedRequest.lab_id || currentLab?.id || null` — booking requests without a lab no longer hit the DB NOT NULL constraint
- `NoticeBoard`: infinite loop fixed via `useRef` stable callback pattern — `onStatsChange` removed from `useCallback` deps

### What's Pending
- Register on ABDM sandbox to obtain Bridge ID (Client ID + Client Secret) — blocks all enrollment/linking flows
- Platform admin settings page at `/platform/settings` — no UI to set `system_settings` (ABDM credentials, email/WhatsApp defaults)
- ABHA number format validation (14 digits, display as XX-XXXX-XXXX-XXXX)
- Care context linking at invoice level in Manage Billing (currently only per-test in Manage Tests)
- Staging deployment (checklist in `STAGING_DEPLOYMENT_CHECKLIST_MULTI_TENANT.md`)
