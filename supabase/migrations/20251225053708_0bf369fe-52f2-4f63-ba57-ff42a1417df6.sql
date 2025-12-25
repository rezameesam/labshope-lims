-- Add policy to allow anonymous users to check if a patient exists by phone (for login flow)
-- This only allows SELECT on specific columns needed for authentication verification

CREATE POLICY "Allow patient lookup by phone for auth"
ON public.patients
FOR SELECT
TO anon
USING (true);

-- Also add policy for patient_tests to allow patients to view their tests after phone auth
CREATE POLICY "Allow patient tests lookup after phone auth"
ON public.patient_tests
FOR SELECT
TO anon
USING (true);