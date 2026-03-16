#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "Multi-tenant release manifest"
echo "============================="
echo

echo "Late migrations"
printf ' - %s\n' \
  "20260315113000_add_platform_admins_and_lead_policies.sql" \
  "20260315050000_scope_whatsapp_webhook_events_by_organization.sql" \
  "20260315060000_scope_lab_code_uniqueness_by_organization.sql" \
  "20260315070000_scope_invoice_numbers_by_organization.sql" \
  "20260315073000_scope_quotations_by_organization.sql" \
  "20260315080000_scope_patient_employee_ids_by_organization.sql" \
  "20260315083000_scope_patient_usernames_by_organization.sql" \
  "20260315093000_create_platform_demo_requests.sql" \
  "20260315103000_add_platform_demo_request_attribution.sql" \
  "20260315120000_add_platform_demo_request_tracking.sql" \
  "20260315123000_add_platform_demo_request_assignment.sql" \
  "20260315133000_create_platform_onboarding_requests.sql" \
  "20260315140000_add_platform_onboarding_request_tracking.sql" \
  "20260315143000_add_platform_onboarding_request_provisioning.sql"
echo

echo "Deploy helper"
echo " - scripts/deploy_multitenant_functions.sh"
echo

echo "Rollout docs"
printf ' - %s\n' \
  "STAGING_DEPLOYMENT_CHECKLIST_MULTI_TENANT.md" \
  "STAGING_SMOKE_TEST_MULTI_TENANT.md" \
  "PRODUCTION_ROLLOUT_CHECKLIST_MULTI_TENANT.md" \
  "scripts/staging_sql_spot_checks.sql"
