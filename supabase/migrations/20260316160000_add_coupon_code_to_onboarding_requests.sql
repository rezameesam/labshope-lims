-- Add coupon_code column to platform_onboarding_requests so discount codes
-- submitted via the /start page are stored alongside the request.
ALTER TABLE public.platform_onboarding_requests
  ADD COLUMN IF NOT EXISTS coupon_code TEXT;
