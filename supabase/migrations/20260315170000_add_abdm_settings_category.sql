-- Allow ABDM as a first-class settings category for platform and organization scopes.

ALTER TABLE public.system_settings
  DROP CONSTRAINT IF EXISTS system_settings_category_check;

ALTER TABLE public.system_settings
  ADD CONSTRAINT system_settings_category_check
  CHECK (category IN ('general', 'payment', 'email', 'sms', 'whatsapp', 'abdm', 'other'));

ALTER TABLE public.organization_settings
  DROP CONSTRAINT IF EXISTS organization_settings_category_check;

ALTER TABLE public.organization_settings
  ADD CONSTRAINT organization_settings_category_check
  CHECK (category IN ('general', 'payment', 'email', 'sms', 'whatsapp', 'abdm', 'other'));
