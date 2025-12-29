-- Add collector role to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'collector';

-- Add collected_by field to patient_tests table to track who collected the sample
ALTER TABLE public.patient_tests
ADD COLUMN IF NOT EXISTS collected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS collected_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_patient_tests_collected_by ON public.patient_tests(collected_by);

-- Update RLS policies to allow collectors to view and manage patient tests
-- Collectors can view patient tests (for their own collections)
CREATE POLICY IF NOT EXISTS "Collectors can view patient tests"
ON public.patient_tests FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee') OR
  public.has_role(auth.uid(), 'collector')
);

-- Collectors can create patient tests
CREATE POLICY IF NOT EXISTS "Collectors can create patient tests"
ON public.patient_tests FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee') OR
  public.has_role(auth.uid(), 'collector')
);

-- Collectors can update patient tests (only if they collected it or are admin/employee)
CREATE POLICY IF NOT EXISTS "Collectors can update their collections"
ON public.patient_tests FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee') OR
  (public.has_role(auth.uid(), 'collector') AND collected_by = auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee') OR
  (public.has_role(auth.uid(), 'collector') AND collected_by = auth.uid())
);

-- Collectors can view patients (to register new patients and view existing ones)
CREATE POLICY IF NOT EXISTS "Collectors can view patients"
ON public.patients FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee') OR
  public.has_role(auth.uid(), 'collector')
);

-- Collectors can create patients (to register new patients)
CREATE POLICY IF NOT EXISTS "Collectors can create patients"
ON public.patients FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee') OR
  public.has_role(auth.uid(), 'collector')
);

-- Collectors can view test catalog (to select tests)
CREATE POLICY IF NOT EXISTS "Collectors can view tests"
ON public.tests FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee') OR
  public.has_role(auth.uid(), 'collector')
);

-- Collectors can view test categories
CREATE POLICY IF NOT EXISTS "Collectors can view test categories"
ON public.test_categories FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee') OR
  public.has_role(auth.uid(), 'collector')
);

-- Collectors can view their own employee record (if they have one)
CREATE POLICY IF NOT EXISTS "Collectors can view their own employee record"
ON public.employees FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee') OR
  (public.has_role(auth.uid(), 'collector') AND user_id = auth.uid())
);

