#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

FUNCTIONS=(
  "create-first-admin"
  "create-employee"
  "employee-login"
  "create-razorpay-order"
  "razorpay-webhook"
  "send-email"
  "send-whatsapp"
  "submit-booking-request"
  "patient-login"
  "patient-request-password-reset"
  "patient-admin-reset-password"
  "employee-admin-reset-password"
  "send-otp"
  "verify-otp"
  "sync-api-keys"
  "log-visitor"
  "whatsapp-webhook"
  "provision-organization"
  "check-onboarding-subdomain"
  "submit-demo-request"
  "submit-onboarding-request"
  "provision-onboarding-request"
  "abdm-scan-share"
  "abdm-profile-share"
  "abdm-on-share"
  "abdm-enroll-abha"
  "abdm-link-care-context"
  "abdm-running-token"
  "confirm-razorpay-payment"
  "confirm-plan-upgrade"
  "create-plan-upgrade-order"
  "validate-coupon"
  "patient-reset-password"
  "patient-set-password"
  "patient-update-address"
)

echo "Multi-tenant function deploy set"
echo "--------------------------------"
printf '%s\n' "${FUNCTIONS[@]}"
echo

if [[ "$DRY_RUN" == true ]]; then
  echo "Dry run only. No functions deployed."
  exit 0
fi

for fn in "${FUNCTIONS[@]}"; do
  echo "Deploying $fn"
  supabase functions deploy "$fn"
done

echo
echo "Function deployment complete."
