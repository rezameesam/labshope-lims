INSERT INTO public.system_settings (setting_key, setting_value, setting_type, category, label, description)
VALUES (
  'catalog_template_organization_id',
  '7ead7691-43b0-4438-bec9-9bde8e904e41',
  'text',
  'general',
  'Catalog Template Organization',
  'Organization whose test catalog is cloned into every newly provisioned organization.'
)
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;
