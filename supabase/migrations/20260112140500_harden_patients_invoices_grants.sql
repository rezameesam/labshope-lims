-- Remove public/anon grants for sensitive tables; rely on RLS for authenticated access.
REVOKE ALL ON TABLE public.patients FROM anon;
REVOKE ALL ON TABLE public.patients FROM public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.patients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.patients TO service_role;

REVOKE ALL ON TABLE public.invoices FROM anon;
REVOKE ALL ON TABLE public.invoices FROM public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invoices TO service_role;
