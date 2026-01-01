-- Add created_by column to patients table to track who created each patient record
-- This allows collectors to only see patients they created

ALTER TABLE public.patients
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_patients_created_by ON public.patients(created_by);

-- Update RLS policy for collectors to only see patients they created
-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Collectors can view patients" ON public.patients;

-- Create new policy that restricts collectors to their own patients
CREATE POLICY "Collectors can view their own patients"
ON public.patients FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee') OR
  (public.has_role(auth.uid(), 'collector') AND created_by = auth.uid())
);

-- Collectors can create patients (created_by will be set automatically)
DROP POLICY IF EXISTS "Collectors can create patients" ON public.patients;
CREATE POLICY "Collectors can create patients"
ON public.patients FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee') OR
  public.has_role(auth.uid(), 'collector')
);

-- Collectors can update their own patients
DROP POLICY IF EXISTS "Collectors can update their own patients" ON public.patients;
CREATE POLICY "Collectors can update their own patients"
ON public.patients FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee') OR
  (public.has_role(auth.uid(), 'collector') AND created_by = auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee') OR
  (public.has_role(auth.uid(), 'collector') AND created_by = auth.uid())
);

