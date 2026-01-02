-- Add SMS/OTP settings and OTP storage table

-- Create otp_codes table for OTP verification if missing
CREATE TABLE IF NOT EXISTS public.otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  otp_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  verified boolean DEFAULT false,
  attempts integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on otp_codes (service role can manage)
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

-- Create indexes for OTP lookups
CREATE INDEX IF NOT EXISTS idx_otp_codes_phone ON public.otp_codes(phone);
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires_at ON public.otp_codes(expires_at);

-- Insert default system settings for SMS/OTP
INSERT INTO public.system_settings (setting_key, setting_value, setting_type, category, label, description, is_encrypted)
VALUES
  ('demo_mode_enabled', 'true', 'boolean', 'sms', 'Demo Mode Enabled', 'Enable demo login mode (OTP: 123456)', false),
  ('msg91_template_id', '', 'text', 'sms', 'MSG91 Template ID', 'MSG91 OTP template ID', false),
  ('msg91_sender_id', 'IRMLAB', 'text', 'sms', 'MSG91 Sender ID', 'MSG91 sender ID (6 characters)', false)
ON CONFLICT (setting_key) DO NOTHING;
