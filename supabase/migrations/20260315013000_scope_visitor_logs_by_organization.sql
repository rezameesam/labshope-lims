ALTER TABLE public.visitor_logs
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_visitor_logs_organization_id
  ON public.visitor_logs(organization_id);

CREATE INDEX IF NOT EXISTS idx_visitor_logs_organization_created_at
  ON public.visitor_logs(organization_id, created_at DESC);

DO $$
DECLARE
  default_org_id UUID;
BEGIN
  SELECT id
  INTO default_org_id
  FROM public.organizations
  WHERE lower(slug) = 'irmclinic'
  ORDER BY created_at ASC
  LIMIT 1;

  IF default_org_id IS NOT NULL THEN
    UPDATE public.visitor_logs
    SET organization_id = default_org_id
    WHERE organization_id IS NULL;
  END IF;
END $$;

DROP POLICY IF EXISTS "Admins can view visitor logs" ON public.visitor_logs;

CREATE POLICY "Organization admins can view visitor logs"
ON public.visitor_logs
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND organization_id IS NOT NULL
  AND public.user_has_organization_access(auth.uid(), organization_id)
);
