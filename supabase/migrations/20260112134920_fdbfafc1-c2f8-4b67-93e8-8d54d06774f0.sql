-- =====================================================
-- FIX CRITICAL SECURITY VULNERABILITIES
-- =====================================================

-- 1. Remove insecure public access policy on patient_tests
DROP POLICY IF EXISTS "Allow patient tests lookup after phone auth" ON public.patient_tests;

-- 2. Remove insecure public access policy on quotations  
DROP POLICY IF EXISTS "Anyone can view quotations by number" ON public.quotations;

-- 3. Add secure policy for quotations - only authenticated staff
CREATE POLICY "Staff can view quotations"
ON public.quotations
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'employee'::app_role)
);

-- 4. Fix labs table - remove public access, require authentication
DROP POLICY IF EXISTS "Anyone can view active labs" ON public.labs;

CREATE POLICY "Authenticated users can view active labs"
ON public.labs
FOR SELECT
TO authenticated
USING (is_active = true);

-- Allow public access to main lab contact info only (for landing page)
CREATE POLICY "Public can view main lab basic info"
ON public.labs
FOR SELECT
TO anon
USING (type = 'main' AND is_active = true);

-- 5. Secure otp_codes table - only service role should access this
-- First check if RLS is enabled, if not enable it
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies on otp_codes
DROP POLICY IF EXISTS "Allow OTP operations" ON public.otp_codes;
DROP POLICY IF EXISTS "Anyone can read OTP codes" ON public.otp_codes;

-- Create restrictive policy - only service role (edge functions) can access
-- No authenticated user policies needed as edge functions use service role key
CREATE POLICY "Service role only"
ON public.otp_codes
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

-- 6. Add policy for collectors to view patient tests they collected
CREATE POLICY "Collectors can view tests they collected"
ON public.patient_tests
FOR SELECT
TO authenticated
USING (collected_by = auth.uid());

-- 7. Add policy for collectors to view tests of patients they created
CREATE POLICY "Collectors can view tests for patients they created"
ON public.patient_tests
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM patients p 
    WHERE p.id = patient_tests.patient_id 
    AND p.created_by = auth.uid()
  )
);

-- 8. Add explicit read policy for system_settings (admins only)
CREATE POLICY "Admins can view system settings"
ON public.system_settings
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));