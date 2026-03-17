-- Enable RLS on patient_password_resets.
-- This table is accessed exclusively by edge functions via the service role
-- key, which bypasses RLS. No public policies are needed — enabling RLS with
-- no permissive policies means the PostgREST API exposes nothing from this
-- table to anonymous or authenticated users, resolving the security warnings.
ALTER TABLE public.patient_password_resets ENABLE ROW LEVEL SECURITY;
