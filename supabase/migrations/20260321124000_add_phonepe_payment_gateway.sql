-- Add PhonePe configuration settings and allow phonepe as a payment gateway value

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
  ('payment_provider', 'razorpay', 'text', 'payment', 'Default Payment Provider', 'Set to razorpay or phonepe for patient billing checkout', false),
  ('phonepe_merchant_id', '', 'password', 'payment', 'PhonePe Merchant ID', 'Merchant ID from PhonePe PG dashboard', true),
  ('phonepe_salt_key', '', 'password', 'payment', 'PhonePe Salt Key', 'Salt key used for X-VERIFY checksum signing', true),
  ('phonepe_salt_index', '1', 'text', 'payment', 'PhonePe Salt Index', 'Salt index associated with the active PhonePe salt key', false),
  ('phonepe_base_url', 'https://api-preprod.phonepe.com/apis/pg-sandbox', 'text', 'payment', 'PhonePe Base URL', 'Use preprod URL for test and production URL for live', false)
ON CONFLICT (setting_key) DO NOTHING;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname
  INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'payments'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%payment_gateway%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.payments DROP CONSTRAINT %I', constraint_name);
  END IF;

  ALTER TABLE public.payments
    ADD CONSTRAINT payments_payment_gateway_check
    CHECK (payment_gateway IN ('razorpay', 'phonepe', 'manual', 'cash', 'upi', 'card', 'bank_transfer'));
END $$;