-- Add collector role to app_role enum
-- Note: Must be in separate transaction, so we commit this first
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'collector';

-- Add collected_by field to patient_tests table to track who collected the sample
ALTER TABLE public.patient_tests
ADD COLUMN IF NOT EXISTS collected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS collected_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_patient_tests_collected_by ON public.patient_tests(collected_by);

-- Note: We need to use the enum value in a way that doesn't trigger the "unsafe use" error
-- We'll use a function that checks the role dynamically instead of directly referencing the enum value
-- Update RLS policies to allow collectors to view and manage patient tests
-- Collectors can view patient tests (for their own collections)
-- Use a function to check for collector role to avoid enum transaction issue
DROP POLICY IF EXISTS "Collectors can view patient tests" ON public.patient_tests;
CREATE POLICY "Collectors can view patient tests"
ON public.patient_tests FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR 
  public.has_role(auth.uid(), 'employee'::app_role) OR
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role::text = 'collector'
  )
);

-- Collectors can create patient tests
DROP POLICY IF EXISTS "Collectors can create patient tests" ON public.patient_tests;
CREATE POLICY "Collectors can create patient tests"
ON public.patient_tests FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role) OR 
  public.has_role(auth.uid(), 'employee'::app_role) OR
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role::text = 'collector'
  )
);

-- Collectors can update patient tests (only if they collected it or are admin/employee)
DROP POLICY IF EXISTS "Collectors can update their collections" ON public.patient_tests;
CREATE POLICY "Collectors can update their collections"
ON public.patient_tests FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR 
  public.has_role(auth.uid(), 'employee'::app_role) OR
  (EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role::text = 'collector'
  ) AND collected_by = auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role) OR 
  public.has_role(auth.uid(), 'employee'::app_role) OR
  (EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role::text = 'collector'
  ) AND collected_by = auth.uid())
);

-- Collectors can view patients (to register new patients and view existing ones)
DROP POLICY IF EXISTS "Collectors can view patients" ON public.patients;
CREATE POLICY "Collectors can view patients"
ON public.patients FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR 
  public.has_role(auth.uid(), 'employee'::app_role) OR
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role::text = 'collector'
  )
);

-- Collectors can create patients (to register new patients)
DROP POLICY IF EXISTS "Collectors can create patients" ON public.patients;
CREATE POLICY "Collectors can create patients"
ON public.patients FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role) OR 
  public.has_role(auth.uid(), 'employee'::app_role) OR
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role::text = 'collector'
  )
);

-- Collectors can view test catalog (to select tests)
DROP POLICY IF EXISTS "Collectors can view tests" ON public.tests;
CREATE POLICY "Collectors can view tests"
ON public.tests FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR 
  public.has_role(auth.uid(), 'employee'::app_role) OR
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role::text = 'collector'
  )
);

-- Collectors can view test categories
DROP POLICY IF EXISTS "Collectors can view test categories" ON public.test_categories;
CREATE POLICY "Collectors can view test categories"
ON public.test_categories FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR 
  public.has_role(auth.uid(), 'employee'::app_role) OR
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role::text = 'collector'
  )
);

-- Collectors can view their own employee record (if they have one)
DROP POLICY IF EXISTS "Collectors can view their own employee record" ON public.employees;
CREATE POLICY "Collectors can view their own employee record"
ON public.employees FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR 
  public.has_role(auth.uid(), 'employee'::app_role) OR
  (EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role::text = 'collector'
  ) AND user_id = auth.uid())
);

