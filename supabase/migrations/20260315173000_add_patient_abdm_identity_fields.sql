ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS abha_number text,
  ADD COLUMN IF NOT EXISTS abha_address text,
  ADD COLUMN IF NOT EXISTS abdm_link_status text,
  ADD COLUMN IF NOT EXISTS abdm_linked_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS abdm_last_verified_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS abdm_source text;

CREATE INDEX IF NOT EXISTS idx_patients_organization_abha_number
  ON public.patients (organization_id, abha_number)
  WHERE abha_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patients_organization_abha_address
  ON public.patients (organization_id, abha_address)
  WHERE abha_address IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_org_abha_number
  ON public.patients (organization_id, abha_number)
  WHERE abha_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_org_abha_address
  ON public.patients (organization_id, abha_address)
  WHERE abha_address IS NOT NULL;
