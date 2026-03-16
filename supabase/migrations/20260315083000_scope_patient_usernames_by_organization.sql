ALTER TABLE public.patients
  DROP CONSTRAINT IF EXISTS patients_username_key;

DROP INDEX IF EXISTS public.patients_username_key;
DROP INDEX IF EXISTS public.idx_patients_org_username;
DROP INDEX IF EXISTS public.idx_patients_username_null_org;

CREATE UNIQUE INDEX idx_patients_org_username
  ON public.patients (organization_id, username)
  WHERE organization_id IS NOT NULL AND username IS NOT NULL;

CREATE UNIQUE INDEX idx_patients_username_null_org
  ON public.patients (username)
  WHERE organization_id IS NULL AND username IS NOT NULL;
