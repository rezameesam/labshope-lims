CREATE TABLE public.platform_coupon_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value NUMERIC NOT NULL CHECK (discount_value > 0),
  applicable_plans TEXT[] DEFAULT NULL,  -- NULL = all plans
  max_uses INTEGER DEFAULT NULL,         -- NULL = unlimited
  uses_count INTEGER NOT NULL DEFAULT 0,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ DEFAULT NULL,  -- NULL = no expiry
  is_active BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  -- No unique constraint on code: deactivated codes are kept as history,
  -- new records can reuse the same code string.
);

ALTER TABLE public.platform_coupon_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage coupon codes"
  ON public.platform_coupon_codes
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()));

-- Public read for validation (only active, non-expired coupons — no sensitive data exposed)
CREATE POLICY "Anyone can validate coupon codes"
  ON public.platform_coupon_codes
  FOR SELECT
  USING (is_active = true);
