-- Allow each organization to use its own lab-code namespace.
-- The original labs table enforced a global UNIQUE(lab_code), which blocks
-- sellable multi-tenant provisioning when multiple tenants want a natural
-- primary-lab code like LAB001.

ALTER TABLE public.labs
  DROP CONSTRAINT IF EXISTS labs_lab_code_key;

DROP INDEX IF EXISTS public.labs_lab_code_key;
DROP INDEX IF EXISTS public.idx_labs_org_lab_code;

ALTER TABLE public.labs
  ADD CONSTRAINT labs_organization_id_lab_code_key
  UNIQUE (organization_id, lab_code);

CREATE UNIQUE INDEX IF NOT EXISTS idx_labs_lab_code_null_org
  ON public.labs (lab_code)
  WHERE organization_id IS NULL;
