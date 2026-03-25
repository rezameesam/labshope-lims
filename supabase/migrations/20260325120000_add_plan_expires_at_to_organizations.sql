-- Add plan_expires_at to track when the paid subscription expires
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ DEFAULT NULL;

-- Back-fill active orgs: assume 1 year from created_at
UPDATE public.organizations
SET plan_expires_at = created_at + INTERVAL '1 year'
WHERE status = 'active'
  AND plan_expires_at IS NULL;
