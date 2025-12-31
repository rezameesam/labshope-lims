-- Add created_by column to patients table to track who created each patient
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_patients_created_by ON public.patients(created_by);