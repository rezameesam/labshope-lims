-- Add normal_range_text column to patient_tests for custom normal range entry
ALTER TABLE public.patient_tests 
ADD COLUMN normal_range_text TEXT;