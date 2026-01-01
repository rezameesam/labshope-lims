-- Create system_settings table for storing API keys and configuration
CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT,
  setting_type TEXT NOT NULL DEFAULT 'text' CHECK (setting_type IN ('text', 'password', 'json', 'boolean')),
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'payment', 'email', 'sms', 'other')),
  label TEXT NOT NULL,
  description TEXT,
  is_encrypted BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Only admins can manage settings
CREATE POLICY "Admins can view all settings"
ON public.system_settings
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage settings"
ON public.system_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON public.system_settings(setting_key);
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON public.system_settings(category);

-- Insert default Razorpay settings (empty values - to be filled via UI)
INSERT INTO public.system_settings (setting_key, setting_value, setting_type, category, label, description, is_encrypted)
VALUES 
  ('razorpay_key_id', '', 'password', 'payment', 'Razorpay Key ID', 'Your Razorpay API Key ID (starts with rzp_test_ or rzp_live_)', true),
  ('razorpay_key_secret', '', 'password', 'payment', 'Razorpay Key Secret', 'Your Razorpay API Key Secret (keep this secure)', true),
  ('razorpay_webhook_secret', '', 'password', 'payment', 'Razorpay Webhook Secret', 'Optional: Webhook secret for payment verification', true),
  ('razorpay_mode', 'test', 'text', 'payment', 'Razorpay Mode', 'Payment mode: test or live', false)
ON CONFLICT (setting_key) DO NOTHING;

-- Create trigger to update updated_at
CREATE TRIGGER update_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

