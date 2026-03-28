# ABDM Milestone Test Matrix

This document maps ABDM milestone scenarios to the actual screens, edge functions, and evidence points in this repo.

It is meant for:

- internal dry runs before FT
- functional testing agency handoff
- HTC demo preparation
- gap tracking between "implemented in repo" and "certification-ready"

Related documents:

- [ABDM Readiness Checklist](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/docs/deployment/ABDM_READINESS_CHECKLIST.md)
- [ABDM Integration Plan](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/docs/planning/ABDM_INTEGRATION_PLAN.md)
- [ABDM Scan And Share Spec](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/docs/planning/ABDM_SCAN_AND_SHARE_SPEC.md)

## Status Legend

- `Ready for internal testing`
- `Partially implemented`
- `Blocked for certification`
- `Out of scope for current milestone`

## Milestone 1 Candidate Matrix

### M1-01: Organization enables ABDM sandbox configuration

- Status: `Ready for internal testing`
- Operator flow:
  - Organization admin opens system settings
  - Enables ABDM and saves gateway / HIP / facility configuration
- Primary UI:
  - `src/components/admin/SystemSettings.tsx`
  - `src/components/admin/AdminQuickSetup.tsx`
  - `src/components/admin/ManageLabs.tsx`
- Backend / data:
  - `organization_settings`
  - `labs.settings`
  - `supabase/functions/_shared/abdm-settings.ts`
- Evidence to capture:
  - screenshots of ABDM settings populated
  - sample org with lab-level facility mapping
  - proof that credentials are not exposed in normal UI reads
- Notes:
  - platform-vs-tenant credential ownership should be explained during FT/HTC
  - custom-domain approval model is still pending final production design

### M1-02: Staff resolves ABDM identity from patient intake

- Status: `Partially implemented`
- Operator flow:
  - Staff opens patient registration
  - Clicks `Scan with ABDM`
  - Enters ABHA number, ABHA address, or mobile
  - Receives resolved preview
  - Applies identity into patient form
- Primary UI:
  - `src/components/admin/ManagePatients.tsx`
  - `src/components/admin/patients/PatientFormDialog.tsx`
- Backend / data:
  - `supabase/functions/abdm-scan-share/index.ts`
  - `supabase/functions/_shared/abdm-settings.ts`
  - `patients.abha_number`
  - `patients.abha_address`
  - `patients.abdm_link_status`
  - `patients.abdm_linked_at`
  - `patients.abdm_last_verified_at`
  - `patients.abdm_source`
- Evidence to capture:
  - screen recording of intake flow
  - API request/response samples
  - patient record after save
  - ABDM audit row proving org-scoped logging
- Blocking note:
  - current `abdm-scan-share` full lookup flow still returns sandbox preview/mock identity rather than a fully live ABDM identity resolution flow
  - this is acceptable for internal workflow demonstration but should not be represented as final milestone completion unless validated against actual ABDM sandbox expectations

### M1-03: ABDM session credential preflight

- Status: `Ready for internal testing`
- Operator flow:
  - Admin uses the ABDM credential/session test action
  - System verifies client credentials can obtain gateway session token
- Primary UI:
  - `src/components/admin/SystemSettings.tsx`
- Backend / data:
  - `supabase/functions/abdm-scan-share/index.ts` with `preflight_only`
  - `supabase/functions/_shared/abdm-settings.ts`
  - `abdm_scan_logs`
- Evidence to capture:
  - preflight success response
  - failure response for invalid credentials
  - screenshot of admin test action
- Notes:
  - useful as setup evidence but not a substitute for end-to-end milestone proof

### M1-04: ABDM profile-share callback ingestion

- Status: `Ready for internal testing`
- Operator flow:
  - ABDM callback sends `PROFILE_SHARE`
  - System resolves org by HIP ID
  - System stores callback payload
  - System attempts `on-share` acknowledgement
- Primary backend:
  - `supabase/functions/abdm-profile-share/index.ts`
  - `supabase/functions/abdm-on-share/index.ts`
  - `supabase/functions/_shared/abdm-settings.ts`
- Data:
  - `abdm_profile_shares`
  - `abdm_scan_logs`
- Evidence to capture:
  - callback request sample
  - stored `abdm_profile_shares` row
  - acknowledgement response sample
  - org resolution proof via `abdm_hip_id`
- Notes:
  - this path is stronger than the intake preview path because it is aligned to the callback model
  - logs were reduced to avoid storing unnecessary token-bearing payloads

### M1-05: Staff links incoming ABHA profile to an existing patient

- Status: `Ready for internal testing`
- Operator flow:
  - Staff reviews recent ABDM profile share
  - Matches it to an existing patient
  - System writes ABHA identity onto patient record
- Primary UI:
  - `src/components/admin/ManagePatients.tsx`
  - `src/components/admin/patients/PatientDetailView.tsx`
- Backend / data:
  - `patients`
  - `abdm_profile_shares`
- Evidence to capture:
  - matched-patient flow recording
  - before/after patient record screenshot
  - profile share record showing matched patient ID

### M1-06: Generate running token / QR for scan-and-share intake

- Status: `Ready for internal testing`
- Operator flow:
  - Staff opens ABDM QR display
  - System generates running token and QR payload
  - QR refreshes on expiry
- Primary UI:
  - `src/components/admin/AbdmQrCodeDisplay.tsx`
  - `src/components/admin/ManagePatients.tsx`
- Backend / data:
  - `supabase/functions/abdm-running-token/index.ts`
  - `abdm_running_tokens`
- Evidence to capture:
  - QR generation recording
  - token expiry / refresh behavior
  - callback `GET ?hipId=` response sample
- Notes:
  - public callback logging was hardened to avoid logging token values
  - production domain/CORS design still needs finalization for custom lab domains

## Milestone 2 Candidate Matrix

### M2-01: ABHA enrollment via Aadhaar OTP

- Status: `Ready for internal testing`
- Operator flow:
  - Staff opens patient form
  - Clicks `Link / Verify ABHA` or inline enrollment action
  - Sends Aadhaar OTP
  - Verifies OTP
  - Retrieves address suggestions
  - Sets preferred ABHA address
- Primary UI:
  - `src/components/admin/ManagePatients.tsx`
  - `src/components/admin/patients/PatientFormDialog.tsx`
- Backend / data:
  - `supabase/functions/abdm-enroll-abha/index.ts`
  - `abdm_enrollment_sessions`
  - `patients`
- Evidence to capture:
  - full multi-step recording
  - server-side session row lifecycle
  - patient record after ABHA link
  - proof that T-token remains server-side
- Notes:
  - encryption and token storage model should be called out during security review

### M2-02: Existing ABHA verification by mobile OTP

- Status: `Ready for internal testing`
- Primary backend:
  - `supabase/functions/abdm-enroll-abha/index.ts`
- Evidence to capture:
  - OTP request
  - OTP verify
  - patient record updated with verified ABHA fields

### M2-03: Existing ABHA verification by face auth

- Status: `Ready for internal testing`
- Primary backend:
  - `supabase/functions/abdm-enroll-abha/index.ts`
- Evidence to capture:
  - init request
  - face verify result
  - patient record updated
- Certification note:
  - include only if the chosen milestone/test scope actually requires this path

### M2-04: Existing ABHA verification by demographics

- Status: `Ready for internal testing`
- Primary backend:
  - `supabase/functions/abdm-enroll-abha/index.ts`
- Evidence to capture:
  - request payload pattern
  - successful verification response
  - patient update result
- Certification note:
  - include only if this is within milestone scope and ABDM test scripts

## Milestone 3 Candidate Matrix

### M3-01: Link diagnostic report / care context to patient ABHA

- Status: `Ready for internal testing`
- Operator flow:
  - Staff opens report/test context
  - Clicks `Link to ABHA`
  - Confirms linking
  - System generates token, links care context, and notifies patient
- Primary UI:
  - `src/components/admin/AbdmCareContextButton.tsx`
  - `src/components/admin/ManageTests.tsx`
- Backend / data:
  - `supabase/functions/abdm-link-care-context/index.ts`
  - `abdm_care_context_links`
  - `patients.abdm_link_status`
  - `abdm_scan_logs`
- Evidence to capture:
  - screen recording
  - care-context link row lifecycle
  - patient ABDM status update
  - notify success/failure behavior
- Notes:
  - notify step is intentionally non-fatal
  - this should be demonstrated clearly so testers understand expected behavior

## Cross-Cutting Negative Tests

These should be executed for every milestone in scope before FT.

### NEG-01: Unauthorized access blocked

- Expected result:
  - ABDM staff actions reject missing/invalid auth
- Relevant functions:
  - `abdm-scan-share`
  - `abdm-enroll-abha`
  - `abdm-link-care-context`
  - `abdm-running-token` POST mode

### NEG-02: Wrong organization isolation

- Expected result:
  - tenant A cannot use tenant B settings, logs, patients, or lab mappings
- Relevant areas:
  - org resolution in ABDM functions
  - patient selection/update paths
  - lab facility context resolution

### NEG-03: ABDM disabled or incomplete configuration

- Expected result:
  - UI shows failure cleanly
  - manual workflow remains possible
- Relevant areas:
  - `ManagePatients`
  - `SystemSettings`
  - `abdm-scan-share`
  - `abdm-running-token`
  - `abdm-link-care-context`

### NEG-04: Expired session / invalid OTP / invalid token

- Expected result:
  - operation fails safely
  - no secret leakage in client errors
  - audit row exists where expected
- Relevant areas:
  - `abdm-enroll-abha`
  - `abdm-running-token`
  - `abdm-link-care-context`

### NEG-05: ABDM callback retry / duplicate processing

- Expected result:
  - duplicate or repeated callback behavior is understood and documented
- Relevant areas:
  - `abdm-profile-share`
  - `abdm-on-share`

## Evidence Pack Structure

Recommended folder structure outside the repo or in a secure internal workspace:

1. `01-sandbox-registration`
2. `02-settings-and-config`
3. `03-m1-intake-and-profile-share`
4. `04-m2-abha-enrollment`
5. `05-m3-care-context-linking`
6. `06-negative-tests`
7. `07-ft-reports`
8. `08-wasa-safe-to-host`
9. `09-htc-demo-material`

## Current Certification Risks

- The intake-side `abdm-scan-share` flow is still partly scaffolded and should not be overstated as full live ABDM identity retrieval unless validated against the current sandbox test script.
- ABDM CORS/browser access is improved, but the final production-safe verified custom-domain model for onboarded labs is still pending.
- Functional testing artifacts, WASA evidence, and HTC demo materials are not yet assembled in the repo.
- Production-readiness claims should not be made until production credentials, HFR linkage, and end-to-end production validation are complete.
