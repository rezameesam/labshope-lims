-- Enable RLS on patient_password_resets.
-- This table is accessed exclusively by edge functions via the service role
-- key, which bypasses RLS. No public policies are needed — enabling RLS with
-- an explicit deny-all policy means the PostgREST API exposes nothing from this
-- table to anonymous or authenticated users, while also satisfying the linter.
ALTER TABLE public.patient_password_resets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all access to patient password resets" ON public.patient_password_resets;
CREATE POLICY "Deny all access to patient password resets"
ON public.patient_password_resets
AS RESTRICTIVE
FOR ALL
TO public
USING (false)
WITH CHECK (false);
