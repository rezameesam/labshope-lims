ALTER TABLE public.abdm_profile_shares
  ADD COLUMN IF NOT EXISTS on_share_delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (on_share_delivery_status IN ('pending', 'sent', 'failed', 'skipped')),
  ADD COLUMN IF NOT EXISTS on_share_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS on_share_error TEXT,
  ADD COLUMN IF NOT EXISTS on_share_response JSONB;
