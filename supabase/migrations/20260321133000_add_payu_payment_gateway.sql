-- Add PayU configuration settings and allow payu as a payment gateway value

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
  ('payu_key', '', 'password', 'payment', 'PayU Key', 'Merchant key from PayU dashboard', true),
  ('payu_salt', '', 'password', 'payment', 'PayU Salt', 'Merchant salt for hash verification', true),
  ('payu_base_url', 'https://test.payu.in', 'text', 'payment', 'PayU Base URL', 'Use test URL for sandbox and secure URL for production', false)
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
    CHECK (payment_gateway IN ('razorpay', 'phonepe', 'payu', 'manual', 'cash', 'upi', 'card', 'bank_transfer'));
END $$;