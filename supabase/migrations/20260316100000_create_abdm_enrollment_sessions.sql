-- ABDM enrollment sessions: stores txnId + T-token server-side across the multi-step
-- Aadhaar OTP enrollment wizard. Expires after 15 minutes.

CREATE TABLE IF NOT EXISTS public.abdm_enrollment_sessions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  patient_id           UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  txn_id               TEXT NOT NULL,
  t_token              TEXT,                  -- ABDM T-token from byAadhaar — server-side only
  abha_number          TEXT,
  abha_address         TEXT,
  suggested_addresses  JSONB DEFAULT '[]'::jsonb,
  full_name            TEXT,
  gender               TEXT,
  date_of_birth        TEXT,
  mobile               TEXT,
  status               TEXT NOT NULL DEFAULT 'otp_sent'
    CHECK (status IN ('otp_sent', 'otp_verified', 'suggestions_fetched', 'address_set', 'failed')),
  error_message        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  expires_at           TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc', now()) + interval '15 minutes')
);

CREATE INDEX idx_abdm_enrollment_sessions_org    ON public.abdm_enrollment_sessions(organization_id);
CREATE INDEX idx_abdm_enrollment_sessions_user   ON public.abdm_enrollment_sessions(user_id);
CREATE INDEX idx_abdm_enrollment_sessions_expires ON public.abdm_enrollment_sessions(expires_at);

ALTER TABLE public.abdm_enrollment_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organization staff can manage their enrollment sessions"
  ON public.abdm_enrollment_sessions
  FOR ALL
  USING (public.user_has_organization_access(auth.uid(), organization_id));
