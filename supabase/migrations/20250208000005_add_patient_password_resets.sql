-- Password reset tokens for patient portal

CREATE TABLE IF NOT EXISTS public.patient_password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_password_resets_patient_id ON public.patient_password_resets(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_password_resets_token_hash ON public.patient_password_resets(token_hash);
CREATE INDEX IF NOT EXISTS idx_patient_password_resets_expires_at ON public.patient_password_resets(expires_at);
