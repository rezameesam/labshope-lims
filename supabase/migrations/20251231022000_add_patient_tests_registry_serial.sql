-- Store manual registry serial reference for patient test reports
ALTER TABLE public.patient_tests
ADD COLUMN IF NOT EXISTS registry_serial TEXT;
