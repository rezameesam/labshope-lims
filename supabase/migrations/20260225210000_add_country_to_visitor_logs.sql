-- Add country metadata to visitor logs for admin reporting.
ALTER TABLE public.visitor_logs
  ADD COLUMN IF NOT EXISTS country_code TEXT,
  ADD COLUMN IF NOT EXISTS country_name TEXT;

CREATE INDEX IF NOT EXISTS idx_visitor_logs_country_code
  ON public.visitor_logs(country_code);
