-- Create system_settings table for storing app configuration
CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_value text,
  setting_type text NOT NULL DEFAULT 'text',
  category text NOT NULL DEFAULT 'general',
  description text,
  is_encrypted boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can manage system settings
CREATE POLICY "Admins can manage system settings"
ON public.system_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Create otp_codes table for OTP verification
CREATE TABLE IF NOT EXISTS public.otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  otp_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  verified boolean DEFAULT false,
  attempts integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on otp_codes
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

-- Allow edge functions to manage OTP codes (service role bypasses RLS)
-- No policies needed as edge functions use service role key

-- Create index for phone lookups
CREATE INDEX IF NOT EXISTS idx_otp_codes_phone ON public.otp_codes(phone);
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires_at ON public.otp_codes(expires_at);

-- Insert default system settings for SMS/OTP
INSERT INTO public.system_settings (setting_key, setting_value, setting_type, category, label, description, is_encrypted) VALUES
('demo_mode_enabled', 'true', 'boolean', 'sms', 'Demo Mode Enabled', 'Enable demo login mode (OTP: 123456)', false),
('msg91_template_id', '', 'text', 'sms', 'MSG91 Template ID', 'MSG91 OTP Template ID', false),
('msg91_sender_id', 'IRMLAB', 'text', 'sms', 'MSG91 Sender ID', 'MSG91 Sender ID (6 characters)', false)
ON CONFLICT (setting_key) DO NOTHING;

-- Trigger to update updated_at
DROP TRIGGER IF EXISTS update_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER update_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
