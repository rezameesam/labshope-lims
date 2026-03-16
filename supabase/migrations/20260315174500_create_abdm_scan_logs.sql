CREATE TABLE IF NOT EXISTS public.abdm_scan_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lab_id UUID REFERENCES public.labs(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('scan_share_lookup')),
  request_status TEXT NOT NULL CHECK (request_status IN ('success', 'failed')),
  abha_number TEXT,
  abha_address TEXT,
  mobile TEXT,
  error_code TEXT,
  error_message TEXT,
  request_payload JSONB,
  response_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_abdm_scan_logs_organization_id
  ON public.abdm_scan_logs(organization_id);

CREATE INDEX IF NOT EXISTS idx_abdm_scan_logs_user_id
  ON public.abdm_scan_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_abdm_scan_logs_created_at
  ON public.abdm_scan_logs(created_at DESC);

ALTER TABLE public.abdm_scan_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organization staff can view ABDM scan logs" ON public.abdm_scan_logs;
CREATE POLICY "Organization staff can view ABDM scan logs"
ON public.abdm_scan_logs
FOR SELECT
USING (
  organization_id IS NOT NULL
  AND public.user_has_organization_access(auth.uid(), organization_id)
);
