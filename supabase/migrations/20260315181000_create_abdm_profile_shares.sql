CREATE TABLE IF NOT EXISTS public.abdm_profile_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lab_id UUID REFERENCES public.labs(id) ON DELETE SET NULL,
  matched_patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  request_id UUID,
  hip_id TEXT,
  abha_number TEXT,
  abha_address TEXT,
  patient_name TEXT,
  patient_gender TEXT,
  patient_date_of_birth TEXT,
  patient_year_of_birth TEXT,
  patient_phone TEXT,
  token_number TEXT,
  token_expiry_seconds INTEGER,
  context TEXT,
  request_status TEXT NOT NULL DEFAULT 'received'
    CHECK (request_status IN ('received', 'matched', 'unmatched', 'failed')),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_abdm_profile_shares_organization_id
  ON public.abdm_profile_shares(organization_id);

CREATE INDEX IF NOT EXISTS idx_abdm_profile_shares_matched_patient_id
  ON public.abdm_profile_shares(matched_patient_id);

CREATE INDEX IF NOT EXISTS idx_abdm_profile_shares_abha_number
  ON public.abdm_profile_shares(organization_id, abha_number);

CREATE INDEX IF NOT EXISTS idx_abdm_profile_shares_abha_address
  ON public.abdm_profile_shares(organization_id, abha_address);

ALTER TABLE public.abdm_profile_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organization staff can view ABDM profile shares" ON public.abdm_profile_shares;
CREATE POLICY "Organization staff can view ABDM profile shares"
ON public.abdm_profile_shares
FOR SELECT
USING (
  organization_id IS NOT NULL
  AND public.user_has_organization_access(auth.uid(), organization_id)
);
