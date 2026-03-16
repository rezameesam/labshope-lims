ALTER TABLE public.test_templates
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_test_templates_organization_id
  ON public.test_templates(organization_id);

DO $$
DECLARE
  default_org_id UUID;
BEGIN
  SELECT o.id
  INTO default_org_id
  FROM public.organizations o
  WHERE o.slug = 'irmclinic'
  ORDER BY o.created_at
  LIMIT 1;

  IF default_org_id IS NULL THEN
    SELECT o.id
    INTO default_org_id
    FROM public.organizations o
    ORDER BY o.created_at
    LIMIT 1;
  END IF;

  IF default_org_id IS NOT NULL THEN
    UPDATE public.test_templates
    SET organization_id = default_org_id
    WHERE organization_id IS NULL;
  END IF;
END $$;

DROP POLICY IF EXISTS "Staff can view test templates" ON public.test_templates;
CREATE POLICY "Staff can view test templates"
ON public.test_templates
FOR SELECT
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND (
    organization_id IS NULL
    OR public.user_has_organization_access(auth.uid(), organization_id)
  )
);

DROP POLICY IF EXISTS "Staff can manage test templates" ON public.test_templates;
CREATE POLICY "Staff can manage test templates"
ON public.test_templates
FOR ALL
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND (
    organization_id IS NULL
    OR public.user_has_organization_access(auth.uid(), organization_id)
  )
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND (
    organization_id IS NULL
    OR public.user_has_organization_access(auth.uid(), organization_id)
  )
);
