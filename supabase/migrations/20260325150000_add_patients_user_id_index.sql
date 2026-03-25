-- usePatientAuth does .eq("user_id", userId) on every patient portal login.
-- Without this index, Postgres scans the entire patients table.
-- This was causing the 15s bootstrap timeout in production.
CREATE INDEX IF NOT EXISTS idx_patients_user_id
  ON public.patients(user_id)
  WHERE user_id IS NOT NULL;
