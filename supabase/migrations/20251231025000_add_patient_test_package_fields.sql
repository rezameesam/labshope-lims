-- Track package assignments on patient tests
ALTER TABLE public.patient_tests
ADD COLUMN IF NOT EXISTS test_package_id UUID REFERENCES public.test_packages(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS test_package_name TEXT,
ADD COLUMN IF NOT EXISTS test_package_group_id UUID;
