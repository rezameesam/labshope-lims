# ABDM Readiness Checklist

This document is the execution checklist for ABDM readiness in this repo.

It is separate from:

- [ABDM Integration Plan](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/docs/planning/ABDM_INTEGRATION_PLAN.md)
- [ABDM Scan And Share Spec](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/docs/planning/ABDM_SCAN_AND_SHARE_SPEC.md)

Use this file when preparing for:

- sandbox onboarding
- sandbox exit
- functional testing
- WASA / Safe-to-Host preparation
- HTC review
- production cutover

## Status Legend

- `Done`: completed and evidence is available
- `In Progress`: started but not complete
- `Blocked`: cannot proceed yet
- `Not Started`: no work done yet

## 1. Sandbox Entry

### ABDM Sandbox Registration

- `Not Started` Register the integrating entity on ABDM Sandbox.
- `Not Started` Use a designation-based email address for the sandbox account.
- `Not Started` Record the sandbox login email in the internal credentials register.
- `Not Started` Record who owns the sandbox account and password reset process.
- `Not Started` Record the "intent to integrate" and milestone scope submitted to ABDM.

### Internal Ownership

- `Not Started` Assign a single ABDM owner for NHA communication.
- `Not Started` Assign an engineering owner for ABDM code and infra.
- `Not Started` Assign a compliance owner for testing artifacts and certificates.
- `Not Started` Track all ABDM support emails and notifications centrally.

## 2. Product Scope And Milestones

### Milestone Scope

- `In Progress` Confirm which ABDM milestone(s) this product is targeting first.
- `In Progress` Confirm milestone 1 implementation uses V3 APIs only.
- `In Progress` Confirm which flows are actually in scope for certification:
  - Scan and Share
  - ABHA enrollment / login
  - care-context linking
  - later consent / sharing flows

### Repo Planning

- `Done` Product-level ABDM implementation order documented in [ABDM Integration Plan](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/docs/planning/ABDM_INTEGRATION_PLAN.md).
- `Done` Scan and Share feature scope documented in [ABDM Scan And Share Spec](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/docs/planning/ABDM_SCAN_AND_SHARE_SPEC.md).
- `Done` Milestone-to-endpoint matrix documented in [ABDM Milestone Test Matrix](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/docs/deployment/ABDM_MILESTONE_TEST_MATRIX.md).

## 3. Technical Readiness

### Tenant Configuration

- `Done` Organization-level ABDM settings exist in the product.
- `Done` Lab-level ABDM facility mapping exists in the product.
- `In Progress` Confirm production credentials are stored only in secure server-side secrets.
- `In Progress` Confirm tenant isolation for ABDM settings and logs.
- `Done` Domain strategy documented in [ABDM Domain Access Strategy](/Users/syed44/Git_Stuff/Git_Projects/irmclinic/docs/deployment/ABDM_DOMAIN_ACCESS_STRATEGY.md).

### Security Controls

- `Done` ABDM edge functions use authenticated staff context where appropriate.
- `Done` Sensitive ABDM JSON responses use `no-store` style headers.
- `Done` Raw internal ABDM error details are no longer broadly returned to clients.
- `Done` ABDM log payloads were reduced to avoid storing unnecessary token-bearing payloads.
- `Done` ABDM browser access now supports explicit platform origins, localhost development origins, verified custom domains from `organization_domains`, and active/trial platform subdomains.
- `Not Started` Review rate limiting, brute-force protection, and abuse detection for ABDM-related login / OTP / callback endpoints.
- `Not Started` Review retention and deletion policy for ABDM-related logs and patient-linked identifiers.
- `Not Started` Confirm production TLS, certificate management, and edge deployment headers outside repo code.

### Operations

- `Not Started` Define incident handling for ABDM downtime, callback failures, and expired credentials.
- `Not Started` Define rollback plan if production ABDM credentials fail after cutover.
- `Not Started` Define monitoring and alerting for ABDM edge function failures and callback errors.
- `Not Started` Define evidence collection for functional testing, WASA, and HTC review.

## 4. Functional Testing Readiness

### Pre-FT Preparation

- `Not Started` Select the exact milestone flows to present to the functional testing agency.
- `Not Started` Prepare a demo tenant with stable sandbox configuration.
- `Not Started` Prepare demo lab records with valid facility/HFR mapping.
- `Not Started` Prepare test patients and test scripts for each ABDM flow in scope.
- `Not Started` Prepare a list of all ABDM callback URLs and endpoints used by the product.
- `Not Started` Prepare evidence that milestone 1 is implemented on V3 APIs only.

### FT Agency Engagement

- `Not Started` Choose one NHA-empaneled functional testing agency.
- `Not Started` Book the testing slot.
- `Not Started` Share environment access, test credentials, and milestone scope with the agency.
- `Not Started` Track the expected 7 working day window from onboarding/testing initiation.
- `Not Started` Collect FT report(s) in the required NHA-approved format.

### Internal Validation Before FT

- `Not Started` Run a dry run of every ABDM test case before sending to the FT agency.
- `Not Started` Verify failure handling for invalid identifiers, expired sessions, and callback retries.
- `Not Started` Verify manual fallback flows so front-desk operations continue if ABDM fails.
- `Not Started` Verify tenant isolation across multiple organizations and labs.

## 5. WASA / Safe-to-Host Readiness

### Security Assessment Preparation

- `Not Started` Decide whether assessment will be through STQC or a CERT-IN empaneled agency.
- `Not Started` Freeze the build/version that will be assessed.
- `Not Started` Prepare architecture diagrams for web app, edge functions, data stores, and callback flows.
- `Not Started` Prepare data-flow diagrams covering patient identifiers, ABHA/ABDM data, secrets, and callback traffic.
- `Not Started` Prepare infrastructure inventory for the assessed environment.
- `Not Started` Prepare deployment topology including DNS, TLS termination, CDN/WAF if any, and Supabase usage.
- `Not Started` Prepare user roles, privileged access flows, and admin access model.

### Security Evidence Package

- `Not Started` Document password, session, MFA, and account lockout behavior.
- `Not Started` Document secret management approach.
- `Not Started` Document encryption in transit and at rest.
- `Not Started` Document audit logging scope and log access controls.
- `Not Started` Document vulnerability management and patching process.
- `Not Started` Document backup, recovery, and incident response approach.
- `Not Started` Document tenant isolation and organization access control approach.
- `Not Started` Document custom domain verification and ABDM-origin approval approach.

### Remediation

- `Not Started` Fix all critical and high findings from the security assessment.
- `Not Started` Re-test medium findings that affect ABDM go-live confidence.
- `Not Started` Collect the final `Safe-to-Host` certificate.

## 6. HTC Submission Readiness

### Required Artifacts

- `Not Started` Functional testing report(s).
- `Not Started` Safe-to-Host certificate.
- `Not Started` Exit form submission on ABDM Sandbox.
- `Not Started` Undertaking form signed and sent as required.
- `Not Started` GSTIN certificate.
- `Not Started` Any additional milestone evidence requested by NHA.

### Demo Readiness

- `Not Started` Prepare HTC demo script aligned to the approved milestone.
- `Not Started` Prepare stable credentials and test data for the demo.
- `Not Started` Prepare operator steps for lab staff actions during demo.
- `Not Started` Prepare fallback explanation for flows intentionally out of scope.

## 7. Production Cutover Readiness

### Credentials And Environment

- `Not Started` Confirm production client ID and secret were received via the registered email.
- `Not Started` Store production credentials only in secure server-side secrets.
- `Not Started` Switch production base URLs and callback URLs cleanly.
- `Not Started` Verify production bridge ID / client ID mapping is correct.
- `Not Started` Verify production HFR / facility linkage steps are complete for each partnering HIP.

### Facility Readiness

- `Not Started` Confirm the partnering HIP is registered on HFR.
- `Not Started` Confirm the facility has updated the production bridge ID in HFR.
- `Not Started` Confirm lab staff are trained on ABDM-assisted intake and troubleshooting.
- `Not Started` Confirm a support escalation path exists for live facility issues.

### Production Validation

- `Not Started` Test the digital transaction flow in production with ABDM's designated test facility before broad rollout.
- `Not Started` Verify callbacks, acknowledgements, and token/session flows in production.
- `Not Started` Verify logging, alerting, and error handling in production environment.
- `Not Started` Verify approved custom domains can call ABDM browser-facing endpoints without manual hotfixes.

## 8. Repo-Specific Open Gaps

These are not generic ABDM tasks. They are the current known gaps in this codebase/process.

- `Done` Replace the temporary ABDM exact-origin allowlist model with a production-safe verified-domain strategy for onboarding labs on custom domains.
- `In Progress` Add deployment documentation for `ABDM_ALLOWED_ORIGINS` and the final production domain-approval mechanism.
- `Done` Add a milestone-to-test-case evidence matrix for FT and HTC walkthroughs.
- `Not Started` Add monitoring runbooks for ABDM edge function failures.
- `Not Started` Review whether any remaining ABDM logs still contain more patient-linked data than strictly necessary for operations or certification evidence.

## 9. Recommended Immediate Next Steps

1. Finish the multi-tenant custom-domain strategy for ABDM CORS and verified frontend access.
2. Produce the FT evidence matrix for milestone 1 and identify the exact demo flow.
3. Prepare the WASA security evidence pack before engaging the assessing agency.
4. Decide which environment and build version will be used for certification.
5. Track all ABDM artifacts in one folder or ticket set, not only in chat or email.
