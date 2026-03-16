-- Running tokens are issued when staff display a QR code for Scan and Share.
-- ABDM gateway polls the HIP to get the current token and wait time.

CREATE TABLE IF NOT EXISTS public.abdm_running_tokens (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lab_id           UUID REFERENCES public.labs(id) ON DELETE SET NULL,
  facility_id      TEXT NOT NULL,
  hip_id           TEXT NOT NULL,
  token_value      TEXT NOT NULL,
  context          TEXT NOT NULL DEFAULT '1',
  wait_time_minutes INTEGER NOT NULL DEFAULT 5,
  status           TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'used', 'expired')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc', now()) + interval '10 minutes')
);

CREATE INDEX idx_abdm_running_tokens_org     ON public.abdm_running_tokens(organization_id, status);
CREATE INDEX idx_abdm_running_tokens_expires ON public.abdm_running_tokens(expires_at);

ALTER TABLE public.abdm_running_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organization staff can manage running tokens"
  ON public.abdm_running_tokens
  FOR ALL
  USING (public.user_has_organization_access(auth.uid(), organization_id));
