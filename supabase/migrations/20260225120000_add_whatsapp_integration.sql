-- WhatsApp integration settings, reminder channel support, and webhook event storage

-- Existing deployments may still enforce category check without 'whatsapp'.
ALTER TABLE public.system_settings
  DROP CONSTRAINT IF EXISTS system_settings_category_check;

ALTER TABLE public.system_settings
  ADD CONSTRAINT system_settings_category_check
  CHECK (category IN ('general', 'payment', 'email', 'sms', 'whatsapp', 'other'));

-- Allow WhatsApp-related reminder channels while preserving existing values.
ALTER TABLE public.patient_reminders
  DROP CONSTRAINT IF EXISTS patient_reminders_notification_method_check;

ALTER TABLE public.patient_reminders
  ADD CONSTRAINT patient_reminders_notification_method_check
  CHECK (
    notification_method IN (
      'email',
      'sms',
      'whatsapp',
      'both',
      'email_whatsapp',
      'none'
    )
  );

-- Store inbound/status webhook events for troubleshooting and delivery tracking.
CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN ('incoming_message', 'status', 'unknown')),
  message_id TEXT,
  wa_id TEXT,
  phone_number_id TEXT,
  status TEXT,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_events_received_at
  ON public.whatsapp_webhook_events(received_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_events_message_id
  ON public.whatsapp_webhook_events(message_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_events_wa_id
  ON public.whatsapp_webhook_events(wa_id);

ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view whatsapp webhook events" ON public.whatsapp_webhook_events;
CREATE POLICY "Admins can view whatsapp webhook events"
ON public.whatsapp_webhook_events
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Default settings used by Edge Functions.
INSERT INTO public.system_settings (
  setting_key,
  setting_value,
  setting_type,
  category,
  label,
  description,
  is_encrypted
)
VALUES
  (
    'whatsapp_enabled',
    'false',
    'boolean',
    'whatsapp',
    'WhatsApp Enabled',
    'Enable WhatsApp Cloud API delivery for OTPs and notifications',
    false
  ),
  (
    'whatsapp_default_country_code',
    '91',
    'text',
    'whatsapp',
    'Default Country Code',
    'Used to normalize local numbers into E.164 digits for WhatsApp',
    false
  ),
  (
    'whatsapp_template_language_code',
    'en_US',
    'text',
    'whatsapp',
    'Template Language Code',
    'Default WhatsApp template language code',
    false
  ),
  (
    'whatsapp_otp_template_name',
    '',
    'text',
    'whatsapp',
    'OTP Template Name',
    'WhatsApp template name for OTP delivery',
    false
  ),
  (
    'whatsapp_utility_template_name',
    '',
    'text',
    'whatsapp',
    'Utility Template Name',
    'WhatsApp template name used for operational notifications',
    false
  ),
  (
    'whatsapp_report_template_name',
    '',
    'text',
    'whatsapp',
    'Report Template Name',
    'WhatsApp template name used for test report notifications',
    false
  )
ON CONFLICT (setting_key) DO NOTHING;
