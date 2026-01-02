-- Visitor logs for security and consent auditing
CREATE TABLE IF NOT EXISTS public.visitor_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL DEFAULT 'page_view',
  path text,
  referrer text,
  consent jsonb,
  ip text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.visitor_logs ENABLE ROW LEVEL SECURITY;

-- Only service role should write/read visitor logs
-- No policies required since edge functions use service role

CREATE INDEX IF NOT EXISTS idx_visitor_logs_event_type ON public.visitor_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_created_at ON public.visitor_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_path ON public.visitor_logs(path);
