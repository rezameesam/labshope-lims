#!/usr/bin/env bash
# Builds a throw-away local Supabase from supabase/migrations and runs the database tests:
#   1. every migration applies from an empty database
#   2. supabase/tests/*.test.sql (SQL tests, rolled back)
#   3. the offline-layer integration test against the real database (auth + RLS + register_visit)
#
# Needs Docker, the Supabase CLI, psql and Node. Works on a developer machine and in CI.
# Uses its own project and ports, so it never touches another local Supabase or any remote project.
#
#   scripts/test-db.sh            # run everything
#   API_PORT=55421 DB_PORT=55422 scripts/test-db.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_PORT="${API_PORT:-55421}"
DB_PORT="${DB_PORT:-55422}"
SHADOW_PORT="${SHADOW_PORT:-55420}"
WORK="$(mktemp -d)"
DB_URL="postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres"

cleanup() {
  supabase stop --workdir "$WORK" --no-backup >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

# These migrations only copy IRM / Lifeline data and raise an error on a database
# that does not already contain those organizations, so a fresh database skips them.
DATA_ONLY_MIGRATIONS=(
  20260320014000_import_irm_lab_catalog.sql
  20260325002000_clone_catalog_to_lifeline.sql
  20260325003000_clone_catalog_to_lifeline_force.sql
  20260325003002_fix_catalog_template_and_clone_lifeline.sql
)

mkdir -p "$WORK/supabase/migrations"
cp "$ROOT"/supabase/migrations/*.sql "$WORK/supabase/migrations/"
for f in "${DATA_ONLY_MIGRATIONS[@]}"; do rm -f "$WORK/supabase/migrations/$f"; done

cat > "$WORK/supabase/config.toml" <<EOF
project_id = "irm-lims-db-tests"

[api]
port = ${API_PORT}

[db]
port = ${DB_PORT}
shadow_port = ${SHADOW_PORT}
major_version = 15

[db.pooler]
enabled = false

[studio]
enabled = false

[inbucket]
enabled = false

[analytics]
enabled = false

[realtime]
enabled = false

[edge_runtime]
enabled = false
EOF

echo "==> Starting a throw-away Supabase (project irm-lims-db-tests)"
supabase start --workdir "$WORK" -x studio,imgproxy,vector,logflare,mailpit,postgres-meta,edge-runtime,realtime >/dev/null

echo "==> 1/3 Applying every migration to an empty database"
supabase db reset --workdir "$WORK" --local >/dev/null
echo "    ok: $(ls "$WORK"/supabase/migrations/*.sql | wc -l | tr -d ' ') migrations applied"

echo "==> 2/3 SQL tests"
shopt -s nullglob
for t in "$ROOT"/supabase/tests/*.test.sql; do
  echo "    $(basename "$t")"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$t" >/dev/null
done

echo "==> 3/3 Integration test (real auth, RLS and register_visit)"
eval "$(supabase status --workdir "$WORK" -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
ORG=99999999-9999-9999-9999-999999999999
LAB=99999999-0000-0000-0000-000000000001
EMAIL=it-admin@test.local
PASSWORD=it-password-123

USER_ID="$(curl -sf -X POST "$API_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"email_confirm\":true}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')"

psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
insert into organizations (id, slug, display_name) values ('$ORG', 'it-org', 'IT Org');
insert into labs (id, lab_code, name, organization_id) values ('$LAB', 'ITL', 'IT Lab', '$ORG');
insert into user_roles (user_id, role) values ('$USER_ID', 'admin') on conflict do nothing;
insert into organization_users (organization_id, user_id, role) values ('$ORG', '$USER_ID', 'owner');
insert into employees (email, employee_id, full_name, user_id, organization_id, lab_id, is_active) values ('$EMAIL', 'E-IT', 'IT Admin', '$USER_ID', '$ORG', '$LAB', true);
insert into booking_requests (id, full_name, phone, booking_type, status, organization_id, test_details) values ('99999999-0000-0000-0000-0000000000b1', 'Web Booker', '9877777777', 'home_collection', 'new', '$ORG', 'CBC');
insert into inventory_items (name, type, unit, current_stock, min_stock_level, unit_price, organization_id, is_active) values ('IT Reagent', 'supply', 'ml', 50, 10, 4, '$ORG', true);
-- the standard chart of accounts the finance triggers post to
insert into accounts (organization_id, code, name, type) values
  ('$ORG', '1001', 'Cash', 'asset'), ('$ORG', '1003', 'Accounts Receivable', 'asset'), ('$ORG', '4001', 'Test Revenue', 'revenue');
insert into test_categories (id, name, organization_id) values ('99999999-0000-0000-0000-0000000000c1', 'Blood', '$ORG');
insert into tests (name, price, category_id, organization_id, is_active, test_id) values
  ('CBC', 300, '99999999-0000-0000-0000-0000000000c1', '$ORG', true, 'CBC'),
  ('LFT', 450, '99999999-0000-0000-0000-0000000000c1', '$ORG', true, 'LFT');
SQL

cd "$ROOT"
LIMS_IT_URL="$API_URL" LIMS_IT_ANON_KEY="$ANON_KEY" LIMS_IT_EMAIL="$EMAIL" LIMS_IT_PASSWORD="$PASSWORD" \
  LIMS_IT_ORG="$ORG" LIMS_IT_LAB="$LAB" \
  npx vitest run src/lib/offline/__tests__/integration.local.test.ts

if command -v dotnet >/dev/null 2>&1; then
  echo "==> 3b/3 Native client integration test (same database)"
  LIMS_IT_URL="$API_URL" LIMS_IT_ANON_KEY="$ANON_KEY" LIMS_IT_EMAIL="$EMAIL" LIMS_IT_PASSWORD="$PASSWORD" \
    LIMS_IT_ORG="$ORG" LIMS_IT_LAB="$LAB" \
    dotnet test native/tests/LabShope.Core.Tests --filter "FullyQualifiedName~IntegrationLocalTests" --logger "console;verbosity=minimal"
fi

echo "==> Database tests passed"
