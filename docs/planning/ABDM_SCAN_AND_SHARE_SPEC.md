# ABDM Scan And Share Spec

This document defines the first ABDM feature that should be built in this repo.

It is intentionally narrow:

- sandbox first
- tenant-aware
- diagnostic-lab intake focused
- no full consent exchange in phase 1

## Feature Goal

Let a diagnostic lab use ABDM `Scan and Share` during patient intake so staff can identify or prefill a patient faster.

For this product, the first release should support:

1. tenant enables ABDM sandbox settings
2. tenant opens patient intake
3. patient shares ABDM/ABHA identity
4. app resolves patient details
5. staff creates or matches the patient record

## What This Feature Should Do

### Staff Experience

At patient registration or walk-in booking:

- show `Scan with ABDM`
- allow manual fallback if ABDM is unavailable
- display resolved patient identity clearly before save
- allow staff to:
  - create a new patient
  - match to an existing patient
  - cancel and continue manually

### Product Behavior

- only enabled for organizations that turned on ABDM
- uses organization-scoped ABDM sandbox configuration
- stores ABDM-linked patient identifiers
- never blocks patient registration if ABDM fails

## What This Feature Should Not Do Yet

Do not include in phase 1:

- full consent management
- care-context linking callbacks
- report sharing into PHR
- scan-pay
- face auth
- production credentials

## Recommended UI Entry Points

Primary entry points:

- [ManagePatients.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManagePatients.tsx)
- [ManageTests.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageTests.tsx)

Possible future entry points:

- public booking flow
- patient self-identification during online booking

For the first release, build it only in the admin intake flow.

## Recommended Data Additions

### Patient Fields

Recommended new fields on `patients`:

- `abha_number`
- `abha_address`
- `abdm_link_status`
- `abdm_linked_at`
- `abdm_last_verified_at`
- `abdm_source`

Optional later:

- `abdm_transaction_id`
- `abdm_link_notes`

### Organization Settings

Recommended ABDM settings:

- `abdm_enabled`
- `abdm_environment`
- `abdm_scan_share_enabled`
- `abdm_facility_id`
- `abdm_hip_id`
- `abdm_cm_id`
- `abdm_client_id`
- `abdm_client_secret`
- `abdm_callback_url`
- `abdm_hpr_id`

Sensitive credentials should not live in normal plain settings rows unless the project already uses an encrypted settings pattern.

## Recommended Backend Shape

### New Edge Function

Recommended function:

- `supabase/functions/abdm-scan-share/index.ts`

Responsibilities:

- validate tenant context
- load organization ABDM configuration
- call ABDM sandbox endpoint(s)
- normalize patient identity response
- return tenant-safe payload to frontend

Current repo status:

- the scaffold now exists in the repo
- it currently returns normalized sandbox/mock identity data
- it is now aligned to the actual ABDM sandbox `profile-share` callback contract, not just a generic lookup

### Actual Sandbox Shape

The ABDM Postman bundle in `/Users/syed44/Downloads/ABDM_SANDBOX` shows that `Scan and Share` depends on:

1. gateway session token creation at `POST /api/hiecm/gateway/v3/sessions`
2. `profile-share` callback payloads to the HIP callback URL
3. `on-share` acknowledgement back into ABDM

So the correct implementation model is:

- tenant ABDM config
- optional gateway preflight
- `profile-share` payload normalization
- later `on-share` acknowledgement support

### Shared Helper

Recommended shared helper:

- `supabase/functions/_shared/abdm-settings.ts`

Responsibilities:

- resolve organization-level ABDM settings
- hide environment differences
- centralize sandbox/production selection later

### Optional Audit Table

Recommended but not mandatory for v1:

- `abdm_scan_logs`

Useful fields:

- `organization_id`
- `lab_id`
- `user_id`
- `patient_id`
- `request_type`
- `request_status`
- `abha_address`
- `abha_number`
- `error_code`
- `error_message`
- `created_at`

## Frontend Flow

### Suggested UX

1. user opens `Add Patient`
2. sees `Scan with ABDM`
3. modal opens with:
   - ABDM scan/share action
   - status indicator
   - manual fallback option
4. after success, show preview:
   - full name
   - gender
   - DOB / year of birth
   - phone if available
   - ABHA number / address
5. user chooses:
   - `Create patient`
   - `Match existing patient`
   - `Cancel`

### Important UX Rules

- do not auto-create a patient silently
- do not overwrite an existing patient silently
- always let staff confirm
- manual registration must remain available

## Matching Rules

Suggested initial matching priority:

1. exact `abha_number`
2. exact `abha_address`
3. fallback suggestion using name + phone + DOB/year

If a likely match exists:

- show suggested match
- let staff confirm manually

## Tenant / Security Rules

- ABDM must be organization-aware
- tenant A cannot use tenant B’s ABDM settings
- ABDM logs should be organization-scoped
- only authenticated staff should access the function
- platform admin should not automatically impersonate tenant ABDM calls unless intentionally supported later

## Rollout Phases

### Phase 1A

Config only:

- organization settings for ABDM sandbox
- admin UI for enabling/disabling
- no public patient use yet

### Phase 1B

Operational v1:

- scan/share intake in admin patient registration
- ABDM patient identity storage
- basic audit logging

### Phase 1C

Operational improvement:

- match existing patient
- intake from test-order / booking workflows
- better error messaging

## Suggested Files To Touch

Likely frontend:

- [src/components/admin/ManagePatients.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManagePatients.tsx)
- [src/components/admin/ManageTests.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/ManageTests.tsx)
- [src/components/admin/SystemSettings.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/components/admin/SystemSettings.tsx)
- [src/contexts/OrganizationContext.tsx](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/src/contexts/OrganizationContext.tsx)

Likely backend:

- `supabase/functions/abdm-scan-share/index.ts`
- `supabase/functions/_shared/abdm-settings.ts`

Likely migrations:

- patient ABDM identity columns
- organization ABDM setting keys
- optional ABDM log table

## What Success Looks Like

A lab admin can:

- enable ABDM sandbox
- open patient intake
- use ABDM scan/share
- confirm the resolved identity
- create or match a patient
- continue normal billing/testing flow

without affecting any other tenant.

## Recommended Next Step

The next implementation step should be:

1. add ABDM config keys for organizations
2. add patient ABDM identity fields
3. build the sandbox edge function
4. add the intake modal in `ManagePatients`

That is the cleanest first ABDM milestone for this repo.
