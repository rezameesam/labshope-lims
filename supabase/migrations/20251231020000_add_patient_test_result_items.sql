-- Add structured result items for panel tests (e.g., CBC)
ALTER TABLE public.patient_tests
ADD COLUMN IF NOT EXISTS result_items JSONB;
