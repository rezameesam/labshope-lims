-- Drop the insecure public access policy that exposes all patient data
DROP POLICY IF EXISTS "Allow patient lookup by phone for auth" ON public.patients;

-- Verify remaining policies provide proper access:
-- 1. Staff (admin/employee) can view and manage all patients
-- 2. Patients can only view their own record via user_id
-- 3. Collectors need access to patients they created

-- Add policy for collectors to view patients they created
CREATE POLICY "Collectors can view patients they created"
ON public.patients
FOR SELECT
TO authenticated
USING (created_by = auth.uid());

-- Add policy for collectors to update patients they created
CREATE POLICY "Collectors can update patients they created"
ON public.patients
FOR UPDATE
TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());