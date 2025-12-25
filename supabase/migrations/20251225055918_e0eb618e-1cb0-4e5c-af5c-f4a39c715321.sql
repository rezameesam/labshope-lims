-- Add normal range and unit columns to tests table
ALTER TABLE public.tests
ADD COLUMN IF NOT EXISTS unit text,
ADD COLUMN IF NOT EXISTS normal_range_min numeric,
ADD COLUMN IF NOT EXISTS normal_range_max numeric,
ADD COLUMN IF NOT EXISTS normal_range_text text,
ADD COLUMN IF NOT EXISTS sample_type text DEFAULT 'Blood';

-- Add test_id reference and numeric result to patient_tests for structured results
ALTER TABLE public.patient_tests
ADD COLUMN IF NOT EXISTS result_value numeric,
ADD COLUMN IF NOT EXISTS result_unit text,
ADD COLUMN IF NOT EXISTS is_abnormal boolean DEFAULT false;