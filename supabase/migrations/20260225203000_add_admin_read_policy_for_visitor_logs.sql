-- Allow admins to view visitor logs in the dashboard.
ALTER TABLE public.visitor_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view visitor logs" ON public.visitor_logs;
CREATE POLICY "Admins can view visitor logs"
ON public.visitor_logs
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT ON TABLE public.visitor_logs TO authenticated;
