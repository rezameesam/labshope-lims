-- Ensure patient_tests has result_items for panel results.
ALTER TABLE public.patient_tests
ADD COLUMN IF NOT EXISTS result_items JSONB;
