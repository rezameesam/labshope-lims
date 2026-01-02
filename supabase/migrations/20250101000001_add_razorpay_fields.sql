-- Add Razorpay fields to payments table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'payments'
  ) THEN
    ALTER TABLE public.payments
      ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT,
      ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT,
      ADD COLUMN IF NOT EXISTS razorpay_signature TEXT,
      ADD COLUMN IF NOT EXISTS payment_gateway TEXT DEFAULT 'razorpay' CHECK (payment_gateway IN ('razorpay', 'manual', 'cash', 'upi', 'card', 'bank_transfer'));

    -- Add index for faster lookups
    CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order_id ON public.payments(razorpay_order_id);
    CREATE INDEX IF NOT EXISTS idx_payments_razorpay_payment_id ON public.payments(razorpay_payment_id);

    -- Add comment for documentation
    COMMENT ON COLUMN public.payments.razorpay_order_id IS 'Razorpay order ID for online payments';
    COMMENT ON COLUMN public.payments.razorpay_payment_id IS 'Razorpay payment ID after successful payment';
    COMMENT ON COLUMN public.payments.razorpay_signature IS 'Razorpay signature for payment verification';
    COMMENT ON COLUMN public.payments.payment_gateway IS 'Payment gateway used (razorpay for online, manual for offline)';
  END IF;
END $$;
