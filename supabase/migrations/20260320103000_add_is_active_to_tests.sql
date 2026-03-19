ALTER TABLE public.tests
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

UPDATE public.tests
SET is_active = true
WHERE is_active IS NULL;

CREATE INDEX IF NOT EXISTS idx_tests_is_active ON public.tests(is_active);
