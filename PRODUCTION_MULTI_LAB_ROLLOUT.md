# Production Multi-Lab Rollout (Professional Standard)

This rollout hardens branch and collection-center isolation at DB level.

## What this rollout includes

1. SQL migration: `supabase/migrations/20260305110000_harden_multi_lab_production.sql`
2. Staff onboarding hardening:
   - `supabase/functions/create-employee/index.ts`
   - `supabase/functions/create-first-admin/index.ts`
3. Frontend request update:
   - `src/components/admin/ManageEmployees.tsx` sends `lab_id` (current lab context)

## Pre-deploy checklist

1. Confirm every active lab has unique `lab_code`.
2. Confirm `LAB001` exists or allow migration/function fallback to create it.
3. Backup DB before migration.
4. Announce maintenance window (recommended).

## Staging rollout (required)

1. Push code to staging branch.
2. Run DB migration on staging.
3. Deploy edge functions:
   - `supabase functions deploy create-employee`
   - `supabase functions deploy create-first-admin`
4. Test scenarios:
   - Admin in Lab A cannot read/write Lab B patient/test/invoice data unless mapped.
   - Collector can only access own-created patients and own-collected tests in allowed lab.
   - Patient can only view own records.
   - New employee creation assigns `employees.lab_id` and `lab_users` row.
   - Lab/center mismatch writes fail.

## Production rollout

1. Deploy frontend and edge function code.
2. Apply migration: `20260305110000_harden_multi_lab_production.sql`.
3. Deploy/refresh functions:
   - `create-employee`
   - `create-first-admin`
4. Smoke test with 3 users:
   - Admin (global)
   - Employee (single lab)
   - Collector (single lab)

## Post-deploy validation SQL

```sql
-- 1) Users with more than one primary lab (should return 0 rows)
SELECT user_id, COUNT(*)
FROM public.lab_users
WHERE is_primary = true
GROUP BY user_id
HAVING COUNT(*) > 1;

-- 2) Core rows missing lab_id (should trend to 0 for operational data)
SELECT 'employees' AS table_name, COUNT(*) FROM public.employees WHERE lab_id IS NULL
UNION ALL
SELECT 'patients', COUNT(*) FROM public.patients WHERE lab_id IS NULL
UNION ALL
SELECT 'patient_tests', COUNT(*) FROM public.patient_tests WHERE lab_id IS NULL
UNION ALL
SELECT 'invoices', COUNT(*) FROM public.invoices WHERE lab_id IS NULL;

-- 3) Invalid center-lab pairs (should return 0 rows)
SELECT 'patients' AS table_name, COUNT(*)
FROM public.patients p
WHERE p.collection_center_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM public.collection_centers cc
  WHERE cc.id = p.collection_center_id AND cc.lab_id = p.lab_id
)
UNION ALL
SELECT 'patient_tests', COUNT(*)
FROM public.patient_tests pt
WHERE pt.collection_center_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM public.collection_centers cc
  WHERE cc.id = pt.collection_center_id AND cc.lab_id = pt.lab_id
)
UNION ALL
SELECT 'invoices', COUNT(*)
FROM public.invoices i
WHERE i.collection_center_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM public.collection_centers cc
  WHERE cc.id = i.collection_center_id AND cc.lab_id = i.lab_id
);
```

## Rollback strategy

1. If app-level issues only: rollback frontend/edge function deploy first.
2. If DB policy issues: disable/replace newly added policies in emergency SQL script.
3. Restore from backup only if data corruption occurs (last resort).

## Notes

1. This migration intentionally enforces `lab_id` on new writes via triggers.
2. If any legacy flow still writes without `lab_id`, it will now fail fast (by design).
3. Add monitoring for `23514` and `42501` errors after go-live.
