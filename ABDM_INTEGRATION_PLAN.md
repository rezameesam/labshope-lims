# ABDM Integration Plan

This document maps the Ayushman Bharat Digital Mission (ABDM) sandbox material to the current multi-tenant lab SaaS and defines the recommended implementation order.

It is intentionally product-focused, not just API-focused.

## Goal

Add ABDM support in a way that helps diagnostic labs buy and use the product without turning the core app into an ABDM-only project.

For this product, ABDM should:

- reduce front-desk patient intake friction
- support ABDM-compatible patient identification
- support future lab-report sharing into the ABDM ecosystem
- remain tenant-aware so each lab organization can configure its own ABDM setup

ABDM should **not** block core commercialization of the product.

## What The Sandbox Folder Contains

Relevant files in `/Users/syed44/Downloads/ABDM_SANDBOX` include:

- [Milestone_1_Postman_Collection_18_08_2025_postman_collection_d202ddf09a.json](/Users/syed44/Downloads/ABDM_SANDBOX/Milestone_1/Milestone_1_Postman_Collection_18_08_2025_postman_collection_d202ddf09a.json)
- [Scan_and_Share_14_08_2025_postman_collection_0cfdcce1cf.json](/Users/syed44/Downloads/ABDM_SANDBOX/Milestone_1/Scan_and_Share_14_08_2025_postman_collection_0cfdcce1cf.json)
- [Milestone_2_16_02_2026_6e734af067.postman_collection](/Users/syed44/Downloads/ABDM_SANDBOX/Milestone_2_16_02_2026_6e734af067.postman_collection)
- [Milestone_3_16_02_2026_796709b791.postman_collection](/Users/syed44/Downloads/ABDM_SANDBOX/Milestone_3_16_02_2026_796709b791.postman_collection)
- [SBX_SCAN_PAY_V3_11_08_postman_collection_2c69903010.json](/Users/syed44/Downloads/ABDM_SANDBOX/SBX_SCAN_PAY_V3_11_08_postman_collection_2c69903010.json)
- [PHR_Sandbox_V3_postman_environment_fe8bf7b1b8.zip](/Users/syed44/Downloads/ABDM_SANDBOX/PHR_Sandbox_V3_postman_environment_fe8bf7b1b8.zip)
- [HIECM_Sandbox_V3_postman_environment_1_3c194750a4.zip](/Users/syed44/Downloads/ABDM_SANDBOX/HIECM_Sandbox_V3_postman_environment_1_3c194750a4.zip)
- [NHPR_Latest_prod_Api_postman_collection_22122025_2f4fc8aa9e.json](/Users/syed44/Downloads/ABDM_SANDBOX/NHPR_Latest_prod_Api_postman_collection_22122025_2f4fc8aa9e.json)
- [Master_Data_Sandbox_d0e2a6a992.xlsx](/Users/syed44/Downloads/ABDM_SANDBOX/Master_Data_Sandbox_d0e2a6a992.xlsx)

## What Is Relevant For A Diagnostic Lab

### High Priority

1. Scan and Share
- best first ABDM feature for a lab
- helps patient registration
- reduces manual demographic entry
- useful on day one

2. ABDM patient identification
- ABHA number / ABHA address capture
- mapping patient identity inside the lab system
- storing ABDM-linked patient identifiers

3. HIP care-context linking
- important if the lab eventually wants to register reports or test contexts against the patient
- useful for later record sharing and ABDM-consent flows

### Medium Priority

4. Consent / PHR / HIE-CM flows
- needed when the product starts sharing health information in an ABDM-compliant way
- more complex than intake
- valuable, but not the first thing to ship

5. Registry / master data alignment
- useful for validation, configuration, and ecosystem compliance
- not the first user-facing feature

### Lower Priority For Initial Rollout

6. Scan Pay
- interesting, but not core to lab operations sellability
- should come later than patient intake and report linkage

7. Face-auth flows
- only build if there is a strong operational need
- not a default first milestone for this product

## Recommended Product Approach

### Phase 1: ABDM Readiness

Do this before building public patient-facing ABDM flows.

Add tenant-aware ABDM configuration:

- environment: `sandbox` or `production`
- ABDM facility / HIP identifiers
- ABDM-enabled flag
- callback / webhook config
- credentials/secrets reference
- optional lab-level overrides if a customer has multiple registered facilities

Recommended ownership model:

- `organization_settings`
  - default ABDM config
- `labs`
  - facility-specific ABDM identifiers where needed

### Phase 2: Scan and Share / Patient Intake

This should be the first ABDM feature released in the app.

Target workflow:

1. patient arrives
2. lab front desk opens intake screen
3. patient shares ABDM QR / ABHA details
4. system fetches or resolves demographics
5. patient record is created or matched

This integrates best with:

- patient registration
- booking / test request intake
- walk-in billing

### Phase 3: Care Context Linking

After intake is stable, add ABDM-aware care-context support.

For a lab product, this likely means:

- link patient to lab diagnostic encounter or order
- create care-context references per patient/test/report
- store ABDM care-context identifiers in your app

This should connect to:

- `patients`
- `patient_tests`
- `invoices` only if required for downstream traceability
- report generation lifecycle

### Phase 4: Consent and Report Sharing

Only after care-context linking is stable.

Target outcome:

- lab can participate in ABDM-compatible record sharing
- report metadata and retrieval references can be exchanged correctly
- patient-approved access paths are supported

This is where HIE-CM / PHR flows become much more important.

### Phase 5: Scan Pay or Advanced Workflows

Optional after the core lab workflow is proven.

## Recommended Data Model

These are product-level recommendations, not applied migrations yet.

### Organization-Level

Recommended settings in `organization_settings`:

- `abdm_enabled`
- `abdm_environment`
- `abdm_cm_id`
- `abdm_hip_id`
- `abdm_hiu_id` if needed later
- `abdm_gateway_base_url`
- `abdm_scan_share_enabled`
- `abdm_care_context_enabled`
- `abdm_consent_enabled`

Secrets should not live in normal UI-readable settings rows if they are sensitive.
Use Supabase secrets or an encrypted settings pattern for:

- client secrets
- private keys
- signing credentials
- webhook verification secrets

### Lab-Level

Recommended fields per lab:

- ABDM facility identifier
- ABDM display name override if needed
- whether this branch is ABDM-enabled

### Patient-Level

Recommended ABDM-linked fields:

- `abha_number`
- `abha_address`
- `abdm_linked_at`
- `abdm_last_verified_at`
- optional consent/reference metadata later

### Encounter / Test / Report-Level

Recommended future fields:

- `abdm_care_context_reference`
- `abdm_link_status`
- `abdm_last_sync_at`
- `abdm_share_status`
- `abdm_transaction_id` where applicable

## Recommended First Feature In This Repo

Build `Scan and Share` first.

Why:

- easiest user value
- easiest sales story
- easiest front-desk adoption
- fits diagnostic lab operations directly
- does not force full ABDM data-sharing complexity immediately

Product UI candidate locations:

- admin patient registration
- booking / walk-in intake
- public booking intake for supported tenants

## Suggested Rollout Order In This Repo

1. Add ABDM config model
- organization-aware settings
- secret handling
- sandbox vs production mode

2. Add ABDM patient identity fields
- patient schema updates
- matching / dedupe logic

3. Build `Scan and Share` UI + edge-function integration
- organization-aware
- sandbox first

4. Add care-context persistence model
- test/report linked references

5. Add ABDM admin setup section
- inside tenant `Quick Setup` or `System Settings`

6. Add platform-admin visibility
- platform side should show whether a tenant has ABDM configured

## What Not To Do First

Do not start with:

- full consent exchange flows
- full PHR/HIE-CM report sharing
- scan-pay
- face auth
- production-only rollout

Those are second-wave or third-wave work.

## Sellability View

ABDM should be positioned as:

- a value-add for Indian diagnostic labs
- especially good for faster patient intake and future compliance readiness

It should not be positioned as:

- the only reason to buy the product
- a blocker for non-ABDM labs

Recommended commercial framing:

- base product = lab operations SaaS
- ABDM = premium integration capability or add-on phase

## What Needs To Be Done Next

Recommended immediate next steps:

1. decide the first ABDM feature scope as `Scan and Share only`
2. design the tenant-aware ABDM configuration model
3. identify where credentials should live securely
4. map ABDM patient fields to current patient schema
5. build a sandbox-only prototype before touching production

## Practical Recommendation

For this repo, the best first ABDM milestone is:

- tenant-configurable ABDM sandbox settings
- scan-and-share powered patient intake
- patient ABHA identity storage

That is the highest-value, lowest-complexity ABDM entry point for a diagnostic lab product.

Implementation spec:

- [ABDM_SCAN_AND_SHARE_SPEC.md](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/ABDM_SCAN_AND_SHARE_SPEC.md)
