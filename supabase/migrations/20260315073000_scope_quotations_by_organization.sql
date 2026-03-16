ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.quotation_items
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quotations_organization_id
  ON public.quotations(organization_id);

CREATE INDEX IF NOT EXISTS idx_quotation_items_organization_id
  ON public.quotation_items(organization_id);

WITH default_org AS (
  SELECT id
  FROM public.organizations
  WHERE slug = 'irmclinic'
  ORDER BY created_at
  LIMIT 1
)
UPDATE public.quotations q
SET organization_id = COALESCE(
  (
    SELECT ou.organization_id
    FROM public.organization_users ou
    WHERE ou.user_id = q.created_by
      AND ou.is_active = true
    ORDER BY ou.is_primary DESC, ou.created_at ASC
    LIMIT 1
  ),
  (SELECT id FROM default_org)
)
WHERE q.organization_id IS NULL;

UPDATE public.quotation_items qi
SET organization_id = q.organization_id
FROM public.quotations q
WHERE q.id = qi.quotation_id
  AND qi.organization_id IS NULL;

ALTER TABLE public.quotations
  DROP CONSTRAINT IF EXISTS quotations_quotation_number_key;

DROP INDEX IF EXISTS public.quotations_quotation_number_key;
DROP INDEX IF EXISTS public.idx_quotations_org_quotation_number;
DROP INDEX IF EXISTS public.idx_quotations_quotation_number_null_org;

CREATE UNIQUE INDEX idx_quotations_org_quotation_number
  ON public.quotations (organization_id, quotation_number)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX idx_quotations_quotation_number_null_org
  ON public.quotations (quotation_number)
  WHERE organization_id IS NULL;

CREATE OR REPLACE FUNCTION public.set_default_quotation_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fallback_organization_id uuid;
BEGIN
  IF NEW.organization_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.created_by IS NOT NULL THEN
    SELECT ou.organization_id
    INTO NEW.organization_id
    FROM public.organization_users ou
    WHERE ou.user_id = NEW.created_by
      AND ou.is_active = true
    ORDER BY ou.is_primary DESC, ou.created_at ASC
    LIMIT 1;
  END IF;

  IF NEW.organization_id IS NULL THEN
    SELECT id
    INTO fallback_organization_id
    FROM public.organizations
    WHERE slug = 'irmclinic'
    ORDER BY created_at
    LIMIT 1;

    NEW.organization_id := fallback_organization_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_quotation_item_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT q.organization_id
    INTO NEW.organization_id
    FROM public.quotations q
    WHERE q.id = NEW.quotation_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg00_quotations_set_default_organization ON public.quotations;
CREATE TRIGGER trg00_quotations_set_default_organization
BEFORE INSERT OR UPDATE ON public.quotations
FOR EACH ROW
EXECUTE FUNCTION public.set_default_quotation_organization();

DROP TRIGGER IF EXISTS trg00_quotation_items_sync_organization ON public.quotation_items;
CREATE TRIGGER trg00_quotation_items_sync_organization
BEFORE INSERT OR UPDATE ON public.quotation_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_quotation_item_organization();

DROP POLICY IF EXISTS "Staff can manage quotations" ON public.quotations;
DROP POLICY IF EXISTS "Staff can view quotations" ON public.quotations;

CREATE POLICY "Organization staff can view quotations"
ON public.quotations
FOR SELECT
TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role))
  AND public.user_has_organization_access(auth.uid(), organization_id)
);

CREATE POLICY "Organization staff can manage quotations"
ON public.quotations
FOR ALL
TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role))
  AND public.user_has_organization_access(auth.uid(), organization_id)
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role))
  AND public.user_has_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Staff can manage quotation items" ON public.quotation_items;
DROP POLICY IF EXISTS "Anyone can view quotation items" ON public.quotation_items;

CREATE POLICY "Organization staff can view quotation items"
ON public.quotation_items
FOR SELECT
TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role))
  AND public.user_has_organization_access(auth.uid(), organization_id)
);

CREATE POLICY "Organization staff can manage quotation items"
ON public.quotation_items
FOR ALL
TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role))
  AND public.user_has_organization_access(auth.uid(), organization_id)
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role))
  AND public.user_has_organization_access(auth.uid(), organization_id)
);
