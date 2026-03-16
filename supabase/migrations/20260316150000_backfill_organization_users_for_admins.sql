-- Backfill organization_users for any admin/employee who was in lab_users
-- at the time the multi-tenant migration ran but ended up without an
-- organization_users row (e.g. if lab_users.organization_id was still NULL
-- when the original backfill ran, or if create-first-admin was called before
-- the organization_users insert was added to that function).
--
-- Step 1: Ensure lab_users.organization_id is populated from labs.
UPDATE public.lab_users lu
SET organization_id = l.organization_id
FROM public.labs l
WHERE lu.lab_id = l.id
  AND lu.organization_id IS NULL
  AND l.organization_id IS NOT NULL;

-- Step 2: Re-run the idempotent organization_users backfill from lab_users.
--   - Users with user_roles.role = 'admin' become 'org_admin'.
--   - Everyone else becomes 'staff'.
INSERT INTO public.organization_users (
  organization_id,
  user_id,
  role,
  is_primary,
  is_active
)
SELECT DISTINCT
  lu.organization_id,
  lu.user_id,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = lu.user_id AND ur.role = 'admin'
    ) OR lu.role = 'admin' THEN 'org_admin'
    ELSE 'staff'
  END,
  COALESCE(lu.is_primary, false),
  true
FROM public.lab_users lu
WHERE lu.organization_id IS NOT NULL
ON CONFLICT (organization_id, user_id) DO UPDATE
SET
  is_primary = public.organization_users.is_primary OR EXCLUDED.is_primary,
  is_active  = true;
