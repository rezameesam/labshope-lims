#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
FUNCTIONS_URL="http://127.0.0.1:54321/functions/v1"

resolve_internal_service_key() {
  local attempt=1
  local key=""

  while [[ $attempt -le 10 ]]; do
    key="$(supabase status 2>/dev/null | sed -n 's/^│ Secret      │ \\(.*\\) │$/\\1/p' | sed 's/[[:space:]]*$//')"
    if [[ -z "$key" ]]; then
      key="$(supabase status --output env 2>/dev/null | sed -n 's/^SECRET_KEY=\"\\(.*\\)\"$/\\1/p')"
    fi

    if [[ -n "$key" ]]; then
      printf '%s' "$key"
      return 0
    fi

    sleep 1
    attempt=$((attempt + 1))
  done

  return 1
}

echo "[1/10] Checking local Supabase status"
supabase status >/dev/null

echo "[2/10] Resetting local database"
supabase db reset >/dev/null

echo "[3/10] Seeding second tenant"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/scripts/seed_local_second_organization.sql" >/dev/null

echo "[4/10] Seeding inventory/billing/referral fixtures"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/scripts/seed_local_inventory_and_referrals.sql" >/dev/null

echo "[5/10] Seeding org-specific WhatsApp test settings"
ACME_ORG_ID="$(psql "$DB_URL" -At -c "select id from public.organizations where slug = 'acme-diagnostics' limit 1;")"
psql "$DB_URL" -v ON_ERROR_STOP=1 -c "insert into organization_settings (organization_id, setting_key, setting_value, setting_type, category, label, description, is_encrypted) values ('$ACME_ORG_ID','whatsapp_phone_number_id','acme-phone-id-001','text','whatsapp','WhatsApp Phone Number ID','Local webhook routing test value',false), ('$ACME_ORG_ID','whatsapp_verify_token','acme-verify-token','password','whatsapp','WhatsApp Verify Token','Local webhook verification token',true), ('$ACME_ORG_ID','whatsapp_app_secret','acme-app-secret','password','whatsapp','WhatsApp App Secret','Local webhook signature secret',true) on conflict (organization_id, setting_key) do update set setting_value = excluded.setting_value, setting_type = excluded.setting_type, category = excluded.category, label = excluded.label, description = excluded.description, is_encrypted = excluded.is_encrypted, updated_at = now();" >/dev/null

echo "[6/10] Creating local admin"
curl -s "$FUNCTIONS_URL/create-first-admin" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@irmclinic.local","password":"Admin@123","full_name":"IRM Admin"}' >/tmp/local_admin_create.json || true

echo "[7/10] Logging in local admin"
ADMIN_LOGIN_JSON="$(curl -s "$FUNCTIONS_URL/employee-login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@irmclinic.local","password":"Admin@123"}')"
ADMIN_TOKEN="$(printf '%s' "$ADMIN_LOGIN_JSON" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')"

if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "Failed to obtain admin token"
  echo "$ADMIN_LOGIN_JSON"
  exit 1
fi

echo "[8/10] Provisioning third organization through edge function"
INTERNAL_SERVICE_KEY="$(resolve_internal_service_key || true)"
PROVISION_STATUS="SKIPPED"
EXPECTED_ORG_COUNT_MIN=2
EXPECTED_LAB001_COUNT=1

if [[ -n "$INTERNAL_SERVICE_KEY" ]]; then
  PROVISION_STATUS="$(curl -s -o /tmp/local_provision_org.json -w '%{http_code}' "$FUNCTIONS_URL/provision-organization" \
    -H "Content-Type: application/json" \
    -H "x-internal-service-key: $INTERNAL_SERVICE_KEY" \
    -H "apikey: $INTERNAL_SERVICE_KEY" \
    -H "Authorization: Bearer $INTERNAL_SERVICE_KEY" \
    -d '{"display_name":"Zen Diagnostics","slug":"zen-diagnostics","primary_domain":"zen-diagnostics.localhost","owner_email":"owner@zen.local","owner_password":"Owner@123","owner_full_name":"Zen Owner","primary_lab_name":"Zen Main Lab","primary_lab_code":"LAB001"}')"

  if [[ "$PROVISION_STATUS" == "200" ]]; then
    EXPECTED_ORG_COUNT_MIN=3
    EXPECTED_LAB001_COUNT=2
  fi
else
  echo "Provisioning check skipped: local internal platform key could not be resolved after reset"
fi

echo "[9/10] Running smoke probes"
SYNC_STATUS="$(curl -s -o /tmp/local_sync_keys_probe.json -w '%{http_code}' "$FUNCTIONS_URL/sync-api-keys" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')"
REPEAT_FIRST_ADMIN_STATUS="$(curl -s -o /tmp/local_admin_create_repeat.json -w '%{http_code}' "$FUNCTIONS_URL/create-first-admin" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin-duplicate@irmclinic.local","password":"Admin@123","full_name":"Duplicate IRM Admin"}')"
EMAIL_ANON_STATUS="$(curl -s -o /tmp/local_send_email_anon.json -w '%{http_code}' "$FUNCTIONS_URL/send-email" \
  -H "Content-Type: application/json" \
  -d '{"to":"test@example.com","subject":"Probe","htmlContent":"<p>probe</p>"}')"
WHATSAPP_ANON_STATUS="$(curl -s -o /tmp/local_send_whatsapp_anon.json -w '%{http_code}' "$FUNCTIONS_URL/send-whatsapp" \
  -H "Content-Type: application/json" \
  -d '{"to":"919999999999","message":"probe"}')"
WHATSAPP_VERIFY_STATUS="$(curl -s -o /tmp/local_whatsapp_verify_get.txt -w '%{http_code}' "$FUNCTIONS_URL/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=acme-verify-token&hub.challenge=12345")"
WHATSAPP_WEBHOOK_BODY='{"entry":[{"changes":[{"field":"messages","value":{"metadata":{"phone_number_id":"acme-phone-id-001"},"messages":[{"id":"wamid.local.acme.001","from":"919876543210","type":"text"}],"contacts":[{"wa_id":"919876543210"}]}}]}]}'
WHATSAPP_WEBHOOK_SIG="$(printf '%s' "$WHATSAPP_WEBHOOK_BODY" | openssl dgst -sha256 -hmac 'acme-app-secret' -hex | sed 's/^.* //')"
WHATSAPP_WEBHOOK_STATUS="$(curl -s -o /tmp/local_whatsapp_webhook_post.json -w '%{http_code}' "$FUNCTIONS_URL/whatsapp-webhook" \
  -H 'Content-Type: application/json' \
  -H "x-hub-signature-256: sha256=$WHATSAPP_WEBHOOK_SIG" \
  -d "$WHATSAPP_WEBHOOK_BODY")"
SUBDOMAIN_AVAILABLE_STATUS="$(curl -s -o /tmp/local_subdomain_available.json -w '%{http_code}' "$FUNCTIONS_URL/check-onboarding-subdomain" \
  -H "Content-Type: application/json" \
  -d '{"preferred_subdomain":"fresh-lab-local","organization_name":"Fresh Lab Local","hostname":"localhost"}')"
SUBDOMAIN_TAKEN_STATUS="$(curl -s -o /tmp/local_subdomain_taken.json -w '%{http_code}' "$FUNCTIONS_URL/check-onboarding-subdomain" \
  -H "Content-Type: application/json" \
  -d '{"preferred_subdomain":"irmclinic","organization_name":"IRM Clinic","hostname":"localhost"}')"
DEMO_REQUEST_STATUS="$(curl -s -o /tmp/local_demo_request.json -w '%{http_code}' "$FUNCTIONS_URL/submit-demo-request" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:8080" \
  -d '{"full_name":"Sales Lead Local","lab_name":"Acme Sales Lab","email":"lead@acme.local","phone":"+919999999998","city":"Hyderabad","branch_count":3,"notes":"Need a multi-branch diagnostic lab walkthrough.","hostname":"localhost","page_path":"/book-test","utm_source":"google","utm_medium":"cpc","utm_campaign":"spring-launch"}')"
ONBOARDING_REQUEST_STATUS="$(curl -s -o /tmp/local_onboarding_request.json -w '%{http_code}' "$FUNCTIONS_URL/submit-onboarding-request" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:8080" \
  -d '{"selected_plan":"growth","setup_mode":"self_serve","organization_name":"Acme Self Serve Diagnostics","primary_lab_name":"Acme Main Lab","owner_full_name":"Acme Owner","owner_email":"start@acme.local","owner_phone":"+919999999997","city":"Hyderabad","branch_count":4,"preferred_subdomain":"acme-self-serve","go_live_target":"2026-04-15","needs_data_import":true,"needs_white_label":true,"notes":"Want to start quickly with a branded rollout.","hostname":"localhost","page_path":"/start","utm_source":"google","utm_medium":"cpc","utm_campaign":"spring-launch"}')"
AUTO_ONBOARDING_REQUEST_STATUS="$(curl -s -o /tmp/local_auto_onboarding_request.json -w '%{http_code}' "$FUNCTIONS_URL/submit-onboarding-request" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:8080" \
  -d '{"selected_plan":"starter","setup_mode":"self_serve","organization_name":"Quick Start Diagnostics","primary_lab_name":"Quick Start Main Lab","owner_full_name":"Quick Owner","owner_email":"quickstart@acme.local","owner_phone":"+919999999996","city":"Hyderabad","branch_count":1,"preferred_subdomain":"quick-start-lab","go_live_target":"2026-04-20","needs_data_import":false,"needs_white_label":false,"notes":"Simple first rollout.","hostname":"localhost","page_path":"/start","utm_source":"google","utm_medium":"cpc","utm_campaign":"spring-launch"}')"
CUSTOM_DOMAIN_ONBOARDING_STATUS="$(curl -s -o /tmp/local_custom_domain_onboarding_request.json -w '%{http_code}' "$FUNCTIONS_URL/submit-onboarding-request" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:8080" \
  -d '{"selected_plan":"starter","setup_mode":"self_serve","organization_name":"Prime Domain Diagnostics","primary_lab_name":"Prime Domain Main Lab","owner_full_name":"Prime Owner","owner_email":"primeowner@acme.local","owner_phone":"+919999999995","city":"Hyderabad","custom_domain":"lab.primedomain.example","branch_count":1,"preferred_subdomain":"prime-domain-launch","go_live_target":"2026-04-22","needs_data_import":false,"needs_white_label":false,"notes":"Use our own domain as the main public address.","hostname":"localhost","page_path":"/start","utm_source":"google","utm_medium":"cpc","utm_campaign":"spring-launch"}')"
psql "$DB_URL" -v ON_ERROR_STOP=1 -c "with target as (select id from public.platform_demo_requests where email = 'lead@acme.local' order by created_at desc limit 1), admin_user as (select pa.user_id from public.platform_admins pa join public.employees e on e.user_id = pa.user_id where e.email = 'admin@irmclinic.local' limit 1) update public.platform_demo_requests p set status = 'contacted', status_notes = 'Initial outreach completed from local smoke test.', assigned_to = (select user_id from admin_user), next_follow_up_at = now() + interval '1 day' from target where p.id = target.id;" >/dev/null
psql "$DB_URL" -v ON_ERROR_STOP=1 -c "with target as (select id from public.platform_onboarding_requests where owner_email = 'start@acme.local' order by created_at desc limit 1), admin_user as (select pa.user_id from public.platform_admins pa join public.employees e on e.user_id = pa.user_id where e.email = 'admin@irmclinic.local' limit 1) update public.platform_onboarding_requests p set status = 'reviewing', status_notes = 'Reviewed rollout needs and confirmed branch complexity.', assigned_to = (select user_id from admin_user), next_follow_up_at = now() + interval '2 days' from target where p.id = target.id;" >/dev/null
ONBOARDING_REQUEST_ID="$(psql "$DB_URL" -At -c "select id from public.platform_onboarding_requests where owner_email = 'start@acme.local' order by created_at desc limit 1;")"
ONBOARDING_PROVISION_STATUS="$(curl -s -o /tmp/local_onboarding_provision.json -w '%{http_code}' "$FUNCTIONS_URL/provision-onboarding-request" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"request_id\":\"$ONBOARDING_REQUEST_ID\"}")"

if [[ "$ONBOARDING_PROVISION_STATUS" == "200" ]]; then
  EXPECTED_ORG_COUNT_MIN=$((EXPECTED_ORG_COUNT_MIN + 1))
  EXPECTED_LAB001_COUNT=$((EXPECTED_LAB001_COUNT + 1))
fi

AUTO_ONBOARDING_RESPONSE_AUTO_PROVISIONED="$(sed -n 's/.*"auto_provisioned":\([^,}]*\).*/\1/p' /tmp/local_auto_onboarding_request.json | tr -d '[:space:]')"
AUTO_ONBOARDING_RESPONSE_LAUNCH_EMAIL="$(sed -n 's/.*"owner_launch_email_sent":\([^,}]*\).*/\1/p' /tmp/local_auto_onboarding_request.json | tr -d '[:space:]')"
AUTO_ONBOARDING_RESPONSE_SLUG="$(sed -n 's/.*"organization_slug":"\([^"]*\)".*/\1/p' /tmp/local_auto_onboarding_request.json)"
AUTO_ONBOARDING_RESPONSE_PASSWORD="$(sed -n 's/.*"owner_temporary_password":"\([^"]*\)".*/\1/p' /tmp/local_auto_onboarding_request.json)"
AUTO_ONBOARDING_RESPONSE_FLAGS="$([[ "$AUTO_ONBOARDING_RESPONSE_AUTO_PROVISIONED" == "true" ]] && printf '1' || printf '0')|$([[ "$AUTO_ONBOARDING_RESPONSE_LAUNCH_EMAIL" == "true" ]] && printf '1' || printf '0')|${AUTO_ONBOARDING_RESPONSE_SLUG}"
CUSTOM_DOMAIN_RESPONSE_AUTO_PROVISIONED="$(sed -n 's/.*"auto_provisioned":\([^,}]*\).*/\1/p' /tmp/local_custom_domain_onboarding_request.json | tr -d '[:space:]')"
CUSTOM_DOMAIN_RESPONSE_PRIMARY_DOMAIN="$(sed -n 's/.*"primary_domain":"\([^"]*\)".*/\1/p' /tmp/local_custom_domain_onboarding_request.json)"
CUSTOM_DOMAIN_RESPONSE_ACCESS_DOMAIN="$(sed -n 's/.*"access_domain":"\([^"]*\)".*/\1/p' /tmp/local_custom_domain_onboarding_request.json)"
CUSTOM_DOMAIN_RESPONSE_SLUG="$(sed -n 's/.*"organization_slug":"\([^"]*\)".*/\1/p' /tmp/local_custom_domain_onboarding_request.json)"
CUSTOM_DOMAIN_RESPONSE_PASSWORD="$(sed -n 's/.*"owner_temporary_password":"\([^"]*\)".*/\1/p' /tmp/local_custom_domain_onboarding_request.json)"
CUSTOM_DOMAIN_RESPONSE_FLAGS="$([[ "$CUSTOM_DOMAIN_RESPONSE_AUTO_PROVISIONED" == "true" ]] && printf '1' || printf '0')|${CUSTOM_DOMAIN_RESPONSE_PRIMARY_DOMAIN}|${CUSTOM_DOMAIN_RESPONSE_ACCESS_DOMAIN}|${CUSTOM_DOMAIN_RESPONSE_SLUG}"
AUTO_OWNER_LOGIN_JSON="$(curl -s "$FUNCTIONS_URL/employee-login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"quickstart@acme.local\",\"password\":\"$AUTO_ONBOARDING_RESPONSE_PASSWORD\"}")"
AUTO_OWNER_PASSWORD_RESET_REQUIRED="$(printf '%s' "$AUTO_OWNER_LOGIN_JSON" | sed -n 's/.*"password_reset_required":\([^,}]*\).*/\1/p' | tr -d '[:space:]')"
AUTO_OWNER_PASSWORD_RESET_FLAG="$([[ "$AUTO_OWNER_PASSWORD_RESET_REQUIRED" == "true" ]] && printf '1' || printf '0')"
CUSTOM_DOMAIN_OWNER_LOGIN_JSON="$(curl -s "$FUNCTIONS_URL/employee-login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"primeowner@acme.local\",\"password\":\"$CUSTOM_DOMAIN_RESPONSE_PASSWORD\"}")"
CUSTOM_DOMAIN_OWNER_PASSWORD_RESET_REQUIRED="$(printf '%s' "$CUSTOM_DOMAIN_OWNER_LOGIN_JSON" | sed -n 's/.*"password_reset_required":\([^,}]*\).*/\1/p' | tr -d '[:space:]')"
CUSTOM_DOMAIN_OWNER_PASSWORD_RESET_FLAG="$([[ "$CUSTOM_DOMAIN_OWNER_PASSWORD_RESET_REQUIRED" == "true" ]] && printf '1' || printf '0')"

if [[ "$AUTO_ONBOARDING_REQUEST_STATUS" == "200" ]]; then
  EXPECTED_ORG_COUNT_MIN=$((EXPECTED_ORG_COUNT_MIN + 1))
  EXPECTED_LAB001_COUNT=$((EXPECTED_LAB001_COUNT + 1))
fi

if [[ "$CUSTOM_DOMAIN_ONBOARDING_STATUS" == "200" ]]; then
  EXPECTED_ORG_COUNT_MIN=$((EXPECTED_ORG_COUNT_MIN + 1))
  EXPECTED_LAB001_COUNT=$((EXPECTED_LAB001_COUNT + 1))
fi

echo "[10/10] Running DB assertions"
PAYMENT_COLS="$(psql "$DB_URL" -At -c "select count(*) from information_schema.columns where table_schema='public' and table_name='payments' and column_name in ('payment_gateway','razorpay_order_id','razorpay_payment_id','razorpay_signature');")"
WHATSAPP_ORG_COL="$(psql "$DB_URL" -At -c "select count(*) from information_schema.columns where table_schema='public' and table_name='whatsapp_webhook_events' and column_name='organization_id';")"
ORG_COUNT="$(psql "$DB_URL" -At -c "select count(*) from public.organizations;")"
WHATSAPP_EVENT_ORG="$(psql "$DB_URL" -At -c "select organization_id from public.whatsapp_webhook_events where message_id='wamid.local.acme.001' order by received_at desc limit 1;")"
ZEN_LAB_COUNT="$(psql "$DB_URL" -At -c "select count(*) from public.labs where lab_code = 'LAB001';")"
DEMO_REQUEST_COUNT="$(psql "$DB_URL" -At -c "select count(*) from public.platform_demo_requests where email = 'lead@acme.local' and source = 'website' and status = 'contacted';")"
DEMO_REQUEST_ATTRIBUTION="$(psql "$DB_URL" -At -c "select coalesce(utm_source,'') || '|' || coalesce(utm_medium,'') || '|' || coalesce(utm_campaign,'') from public.platform_demo_requests where email = 'lead@acme.local' order by created_at desc limit 1;")"
DEMO_REQUEST_TRACKING="$(psql "$DB_URL" -At -c "select case when updated_at is not null then '1' else '0' end || '|' || case when contacted_at is not null then '1' else '0' end || '|' || case when assigned_at is not null then '1' else '0' end || '|' || case when next_follow_up_at is not null then '1' else '0' end || '|' || coalesce(status_notes,'') from public.platform_demo_requests where email = 'lead@acme.local' order by created_at desc limit 1;")"
PLATFORM_ADMIN_COUNT="$(psql "$DB_URL" -At -c "select count(*) from public.platform_admins pa join public.employees e on e.user_id = pa.user_id where e.email = 'admin@irmclinic.local';")"
ONBOARDING_REQUEST_COUNT="$(psql "$DB_URL" -At -c "select count(*) from public.platform_onboarding_requests where owner_email = 'start@acme.local' and selected_plan = 'growth' and setup_mode = 'self_serve';")"
ONBOARDING_REQUEST_FLAGS="$(psql "$DB_URL" -At -c "select case when needs_data_import then '1' else '0' end || '|' || case when needs_white_label then '1' else '0' end || '|' || coalesce(preferred_subdomain,'') from public.platform_onboarding_requests where owner_email = 'start@acme.local' order by created_at desc limit 1;")"
ONBOARDING_REQUEST_TRACKING="$(psql "$DB_URL" -At -c "select case when reviewing_at is not null then '1' else '0' end || '|' || case when assigned_at is not null then '1' else '0' end || '|' || case when next_follow_up_at is not null then '1' else '0' end || '|' || coalesce(status_notes,'') from public.platform_onboarding_requests where owner_email = 'start@acme.local' order by created_at desc limit 1;")"
ONBOARDING_REQUEST_PROVISIONING="$(psql "$DB_URL" -At -c "select case when provisioned_organization_id is not null then '1' else '0' end || '|' || case when provisioned_lab_id is not null then '1' else '0' end || '|' || case when provisioned_owner_user_id is not null then '1' else '0' end || '|' || case when provisioned_at is not null then '1' else '0' end || '|' || coalesce(resolved_slug,'') from public.platform_onboarding_requests where owner_email = 'start@acme.local' order by created_at desc limit 1;")"
AUTO_ONBOARDING_REQUEST_COUNT="$(psql "$DB_URL" -At -c "select count(*) from public.platform_onboarding_requests where owner_email = 'quickstart@acme.local' and selected_plan = 'starter' and setup_mode = 'self_serve';")"
AUTO_ONBOARDING_ROW_FLAGS="$(psql "$DB_URL" -At -c "select case when status = 'approved' then '1' else '0' end || '|' || case when provisioned_organization_id is not null then '1' else '0' end || '|' || case when provisioned_lab_id is not null then '1' else '0' end || '|' || case when provisioned_owner_user_id is not null then '1' else '0' end || '|' || coalesce(resolved_slug,'') from public.platform_onboarding_requests where owner_email = 'quickstart@acme.local' order by created_at desc limit 1;")"
AUTO_ONBOARDING_TEMPLATE_COUNT="$(psql "$DB_URL" -At -c "select count(*) from public.test_templates tt join public.organizations o on o.id = tt.organization_id where o.slug = 'quick-start-lab' and tt.name = 'Standard Report Template' and tt.is_default is true;")"
AUTO_ONBOARDING_REPORT_SETTINGS="$(psql "$DB_URL" -At -c "select count(*) from public.organization_settings os join public.organizations o on o.id = os.organization_id where o.slug = 'quick-start-lab' and os.setting_key in ('branding_tagline','report_tagline','report_footer_note','report_default_header_template','report_default_footer_template');")"
CUSTOM_DOMAIN_REQUEST_COUNT="$(psql "$DB_URL" -At -c "select count(*) from public.platform_onboarding_requests where owner_email = 'primeowner@acme.local' and selected_plan = 'starter' and setup_mode = 'self_serve';")"
CUSTOM_DOMAIN_ROW_FLAGS="$(psql "$DB_URL" -At -c "select coalesce(custom_domain,'') || '|' || coalesce(resolved_domain,'') || '|' || coalesce(resolved_access_domain,'') || '|' || case when status = 'approved' then '1' else '0' end from public.platform_onboarding_requests where owner_email = 'primeowner@acme.local' order by created_at desc limit 1;")"
CUSTOM_DOMAIN_ORG_DOMAIN_FLAGS="$(psql "$DB_URL" -At -c "with org as (select id from public.organizations where slug = 'prime-domain-launch' limit 1) select (select count(*) from public.organization_domains d join org on org.id = d.organization_id where d.domain = 'lab.primedomain.example')::text || '|' || (select count(*) from public.organization_domains d join org on org.id = d.organization_id where d.domain = 'prime-domain-launch.localhost')::text;")"
SUBDOMAIN_AVAILABLE_FLAG="$(sed -n 's/.*"available":\([^,}]*\).*/\1/p' /tmp/local_subdomain_available.json | tr -d '[:space:]')"
SUBDOMAIN_AVAILABLE_SLUG="$(sed -n 's/.*"candidate_slug":"\([^"]*\)".*/\1/p' /tmp/local_subdomain_available.json)"
SUBDOMAIN_TAKEN_FLAG="$(sed -n 's/.*"available":\([^,}]*\).*/\1/p' /tmp/local_subdomain_taken.json | tr -d '[:space:]')"
SUBDOMAIN_TAKEN_SUGGESTION="$(sed -n 's/.*"suggestion_slug":"\([^"]*\)".*/\1/p' /tmp/local_subdomain_taken.json)"

echo
echo "Smoke summary"
echo "-------------"
echo "provision-organization:       $PROVISION_STATUS"
echo "sync-api-keys(authenticated): $SYNC_STATUS"
echo "create-first-admin(repeat):   $REPEAT_FIRST_ADMIN_STATUS"
echo "send-email(anonymous):        $EMAIL_ANON_STATUS"
echo "send-whatsapp(anonymous):     $WHATSAPP_ANON_STATUS"
echo "whatsapp verify(GET):         $WHATSAPP_VERIFY_STATUS"
echo "whatsapp webhook(POST):       $WHATSAPP_WEBHOOK_STATUS"
echo "subdomain available check:    $SUBDOMAIN_AVAILABLE_STATUS|$SUBDOMAIN_AVAILABLE_FLAG|$SUBDOMAIN_AVAILABLE_SLUG"
echo "subdomain taken check:        $SUBDOMAIN_TAKEN_STATUS|$SUBDOMAIN_TAKEN_FLAG|$SUBDOMAIN_TAKEN_SUGGESTION"
echo "submit-demo-request:          $DEMO_REQUEST_STATUS"
echo "submit-onboarding-request:    $ONBOARDING_REQUEST_STATUS"
echo "submit-onboarding(auto):      $AUTO_ONBOARDING_REQUEST_STATUS"
echo "submit-onboarding(domain):    $CUSTOM_DOMAIN_ONBOARDING_STATUS"
echo "provision-onboarding-request: $ONBOARDING_PROVISION_STATUS"
echo "payments Razorpay columns:    $PAYMENT_COLS/4"
echo "whatsapp org column present:  $WHATSAPP_ORG_COL"
echo "whatsapp event org resolved:  $WHATSAPP_EVENT_ORG"
echo "platform demo requests:       $DEMO_REQUEST_COUNT"
echo "demo attribution:             $DEMO_REQUEST_ATTRIBUTION"
echo "demo tracking:                $DEMO_REQUEST_TRACKING"
echo "onboarding requests:          $ONBOARDING_REQUEST_COUNT"
echo "onboarding flags:             $ONBOARDING_REQUEST_FLAGS"
echo "onboarding tracking:          $ONBOARDING_REQUEST_TRACKING"
echo "onboarding provisioning:      $ONBOARDING_REQUEST_PROVISIONING"
echo "onboarding auto response:     $AUTO_ONBOARDING_RESPONSE_FLAGS"
echo "onboarding auto password:     ${#AUTO_ONBOARDING_RESPONSE_PASSWORD}"
echo "onboarding auto first-login:  $AUTO_OWNER_PASSWORD_RESET_FLAG"
echo "onboarding auto row:          $AUTO_ONBOARDING_ROW_FLAGS"
echo "onboarding auto template:     $AUTO_ONBOARDING_TEMPLATE_COUNT"
echo "onboarding auto settings:     $AUTO_ONBOARDING_REPORT_SETTINGS/5"
echo "onboarding custom response:   $CUSTOM_DOMAIN_RESPONSE_FLAGS"
echo "onboarding custom password:   ${#CUSTOM_DOMAIN_RESPONSE_PASSWORD}"
echo "onboarding custom first-login:$CUSTOM_DOMAIN_OWNER_PASSWORD_RESET_FLAG"
echo "onboarding custom row:        $CUSTOM_DOMAIN_ROW_FLAGS"
echo "onboarding custom domains:    $CUSTOM_DOMAIN_ORG_DOMAIN_FLAGS"
echo "platform admin rows:          $PLATFORM_ADMIN_COUNT"
echo "LAB001 across orgs:           $ZEN_LAB_COUNT/$EXPECTED_LAB001_COUNT"
echo "organizations seeded:         $ORG_COUNT"
echo

if [[ "$PROVISION_STATUS" != "SKIPPED" && "$PROVISION_STATUS" != "200" ]]; then
  echo "Expected internal provision-organization to return 200"
  cat /tmp/local_provision_org.json
  exit 1
fi

if [[ "$SYNC_STATUS" != "200" ]]; then
  echo "Expected sync-api-keys to return 200 for authenticated admin"
  exit 1
fi

if [[ "$REPEAT_FIRST_ADMIN_STATUS" != "400" ]]; then
  echo "Expected repeat create-first-admin to return 400 after bootstrap"
  exit 1
fi

if [[ "$EMAIL_ANON_STATUS" != "401" ]]; then
  echo "Expected anonymous send-email to return 401"
  exit 1
fi

if [[ "$WHATSAPP_ANON_STATUS" != "401" ]]; then
  echo "Expected anonymous send-whatsapp to return 401"
  exit 1
fi

if [[ "$WHATSAPP_VERIFY_STATUS" != "200" ]]; then
  echo "Expected org-scoped WhatsApp GET verify to return 200"
  exit 1
fi

if [[ "$WHATSAPP_WEBHOOK_STATUS" != "200" ]]; then
  echo "Expected org-scoped WhatsApp webhook POST to return 200"
  exit 1
fi

if [[ "$SUBDOMAIN_AVAILABLE_STATUS" != "200" || "$SUBDOMAIN_AVAILABLE_FLAG" != "true" || "$SUBDOMAIN_AVAILABLE_SLUG" != "fresh-lab-local" ]]; then
  echo "Expected fresh onboarding subdomain to be available"
  cat /tmp/local_subdomain_available.json
  exit 1
fi

if [[ "$SUBDOMAIN_TAKEN_STATUS" != "200" || "$SUBDOMAIN_TAKEN_FLAG" != "false" || -z "$SUBDOMAIN_TAKEN_SUGGESTION" ]]; then
  echo "Expected taken onboarding subdomain to return a fallback suggestion"
  cat /tmp/local_subdomain_taken.json
  exit 1
fi

if [[ "$DEMO_REQUEST_STATUS" != "200" ]]; then
  echo "Expected submit-demo-request to return 200"
  cat /tmp/local_demo_request.json
  exit 1
fi

if [[ "$ONBOARDING_REQUEST_STATUS" != "200" ]]; then
  echo "Expected submit-onboarding-request to return 200"
  cat /tmp/local_onboarding_request.json
  exit 1
fi

if [[ "$AUTO_ONBOARDING_REQUEST_STATUS" != "200" ]]; then
  echo "Expected auto-provision submit-onboarding-request to return 200"
  cat /tmp/local_auto_onboarding_request.json
  exit 1
fi

if [[ "$CUSTOM_DOMAIN_ONBOARDING_STATUS" != "200" ]]; then
  echo "Expected custom-domain submit-onboarding-request to return 200"
  cat /tmp/local_custom_domain_onboarding_request.json
  exit 1
fi

if [[ "$ONBOARDING_PROVISION_STATUS" != "200" ]]; then
  echo "Expected provision-onboarding-request to return 200"
  cat /tmp/local_onboarding_provision.json
  exit 1
fi

if [[ "$PAYMENT_COLS" != "4" ]]; then
  echo "Expected all Razorpay payment columns to exist"
  exit 1
fi

if [[ "$AUTO_ONBOARDING_TEMPLATE_COUNT" != "1" ]]; then
  echo "Expected auto-provisioned tenant to receive one default report template"
  exit 1
fi

if [[ "$AUTO_ONBOARDING_REPORT_SETTINGS" != "5" ]]; then
  echo "Expected auto-provisioned tenant to receive starter report settings"
  exit 1
fi

if [[ "$WHATSAPP_ORG_COL" != "1" ]]; then
  echo "Expected whatsapp_webhook_events.organization_id to exist"
  exit 1
fi

if [[ "$WHATSAPP_EVENT_ORG" != "$ACME_ORG_ID" ]]; then
  echo "Expected WhatsApp webhook event to resolve Acme organization"
  exit 1
fi

if [[ "$DEMO_REQUEST_COUNT" != "1" ]]; then
  echo "Expected one contacted platform demo request row for the smoke lead"
  exit 1
fi

if [[ "$DEMO_REQUEST_ATTRIBUTION" != "google|cpc|spring-launch" ]]; then
  echo "Expected demo request attribution fields to be stored"
  exit 1
fi

if [[ "$DEMO_REQUEST_TRACKING" != "1|1|1|1|Initial outreach completed from local smoke test." ]]; then
  echo "Expected demo request tracking and assignment fields to be updated after the local smoke follow-up"
  exit 1
fi

if [[ "$ONBOARDING_REQUEST_COUNT" != "1" ]]; then
  echo "Expected one onboarding request row for the self-serve smoke lead"
  exit 1
fi

if [[ "$AUTO_ONBOARDING_REQUEST_COUNT" != "1" ]]; then
  echo "Expected one onboarding request row for the auto-provision smoke lead"
  exit 1
fi

if [[ "$CUSTOM_DOMAIN_REQUEST_COUNT" != "1" ]]; then
  echo "Expected one onboarding request row for the custom-domain smoke lead"
  exit 1
fi

if [[ "$ONBOARDING_REQUEST_FLAGS" != "1|1|acme-self-serve" ]]; then
  echo "Expected onboarding request options to be stored"
  exit 1
fi

if [[ "$ONBOARDING_REQUEST_TRACKING" != "1|1|1|Reviewed rollout needs and confirmed branch complexity." ]]; then
  echo "Expected onboarding request tracking and assignment fields to be updated after the local smoke follow-up"
  exit 1
fi

if [[ "$ONBOARDING_REQUEST_PROVISIONING" != "1|1|1|1|acme-self-serve" ]]; then
  echo "Expected onboarding request provisioning fields to be populated after approval"
  exit 1
fi

if [[ "$AUTO_ONBOARDING_RESPONSE_FLAGS" != "1|0|quick-start-lab" && "$AUTO_ONBOARDING_RESPONSE_FLAGS" != "1|1|quick-start-lab" ]]; then
  echo "Expected the simple self-serve onboarding request to auto-provision immediately, regardless of local email-delivery status"
  exit 1
fi

if [[ ${#AUTO_ONBOARDING_RESPONSE_PASSWORD} -lt 10 ]]; then
  echo "Expected the simple auto-provision response to include a temporary owner password"
  cat /tmp/local_auto_onboarding_request.json
  exit 1
fi

if [[ "$CUSTOM_DOMAIN_RESPONSE_FLAGS" != "1|lab.primedomain.example|prime-domain-launch.localhost|prime-domain-launch" ]]; then
  echo "Expected custom-domain onboarding to return primary custom domain plus launch fallback domain"
  cat /tmp/local_custom_domain_onboarding_request.json
  exit 1
fi

if [[ ${#CUSTOM_DOMAIN_RESPONSE_PASSWORD} -lt 10 ]]; then
  echo "Expected the custom-domain auto-provision response to include a temporary owner password"
  cat /tmp/local_custom_domain_onboarding_request.json
  exit 1
fi

if [[ "$AUTO_OWNER_PASSWORD_RESET_FLAG" != "1" ]]; then
  echo "Expected the auto-provisioned owner login to require a password reset on first sign-in"
  echo "$AUTO_OWNER_LOGIN_JSON"
  exit 1
fi

if [[ "$CUSTOM_DOMAIN_OWNER_PASSWORD_RESET_FLAG" != "1" ]]; then
  echo "Expected the custom-domain owner login to require a password reset on first sign-in"
  echo "$CUSTOM_DOMAIN_OWNER_LOGIN_JSON"
  exit 1
fi

if [[ "$AUTO_ONBOARDING_ROW_FLAGS" != "1|1|1|1|quick-start-lab" ]]; then
  echo "Expected the auto-provisioned onboarding row to be approved and fully provisioned"
  exit 1
fi

if [[ "$CUSTOM_DOMAIN_ROW_FLAGS" != "lab.primedomain.example|lab.primedomain.example|prime-domain-launch.localhost|1" ]]; then
  echo "Expected custom-domain onboarding row to preserve primary and access domains"
  exit 1
fi

if [[ "$CUSTOM_DOMAIN_ORG_DOMAIN_FLAGS" != "1|1" ]]; then
  echo "Expected provisioned custom-domain tenant to have both primary and fallback organization domains"
  exit 1
fi

if [[ "$PLATFORM_ADMIN_COUNT" != "1" ]]; then
  echo "Expected the bootstrapped local admin to be present in platform_admins"
  exit 1
fi

if [[ "$ZEN_LAB_COUNT" != "$EXPECTED_LAB001_COUNT" ]]; then
  echo "Expected LAB001 count across the verified organizations to be $EXPECTED_LAB001_COUNT"
  exit 1
fi

if [[ "$ORG_COUNT" -lt "$EXPECTED_ORG_COUNT_MIN" ]]; then
  echo "Expected at least $EXPECTED_ORG_COUNT_MIN organizations after seeding/provisioning"
  exit 1
fi

echo "Local smoke test passed"
