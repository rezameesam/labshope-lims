-- Complimentary / free access flag for platform-granted access
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS is_complimentary BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS complimentary_until TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS complimentary_note TEXT DEFAULT NULL;
