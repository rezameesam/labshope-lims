ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS two_factor_email_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.employee_login_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_login_challenges_user_org
  ON public.employee_login_challenges(user_id, organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_employee_login_challenges_expires_at
  ON public.employee_login_challenges(expires_at);

ALTER TABLE public.employee_login_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all access to employee login challenges" ON public.employee_login_challenges;
CREATE POLICY "Deny all access to employee login challenges"
ON public.employee_login_challenges
AS RESTRICTIVE
FOR ALL
TO public
USING (false)
WITH CHECK (false);
