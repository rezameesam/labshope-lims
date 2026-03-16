-- Harden remaining inventory and doctor referral tables with organization-level ownership.
-- This keeps compatibility with the current staff model by allowing access through either:
-- 1) organization_users membership, or
-- 2) lab_users membership in any lab within the organization.

ALTER TABLE public.inventory_categories
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.inventory_purchases
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.inventory_usage
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.equipment_maintenance
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.doctor_referrals
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

CREATE INDEX IF NOT EXISTS idx_inventory_categories_organization_id
  ON public.inventory_categories(organization_id);

CREATE INDEX IF NOT EXISTS idx_inventory_purchases_organization_id
  ON public.inventory_purchases(organization_id);

CREATE INDEX IF NOT EXISTS idx_inventory_usage_organization_id
  ON public.inventory_usage(organization_id);

CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_organization_id
  ON public.equipment_maintenance(organization_id);

CREATE INDEX IF NOT EXISTS idx_doctor_referrals_organization_id
  ON public.doctor_referrals(organization_id);

CREATE OR REPLACE FUNCTION public.user_has_operational_organization_access(_user_id UUID, _organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.organization_users ou
      WHERE ou.user_id = _user_id
        AND ou.organization_id = _organization_id
        AND ou.is_active = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.lab_users lu
      JOIN public.labs l ON l.id = lu.lab_id
      WHERE lu.user_id = _user_id
        AND l.organization_id = _organization_id
    );
$$;

CREATE OR REPLACE FUNCTION public.sync_organization_from_inventory_item()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  item_org_id UUID;
  patient_test_org_id UUID;
BEGIN
  IF NEW.item_id IS NOT NULL THEN
    SELECT ii.organization_id
    INTO item_org_id
    FROM public.inventory_items ii
    WHERE ii.id = NEW.item_id;

    IF item_org_id IS NOT NULL THEN
      NEW.organization_id := item_org_id;
    END IF;
  END IF;

  IF NEW.organization_id IS NULL AND TG_TABLE_NAME = 'inventory_usage' AND NEW.patient_test_id IS NOT NULL THEN
    SELECT pt.organization_id
    INTO patient_test_org_id
    FROM public.patient_tests pt
    WHERE pt.id = NEW.patient_test_id;

    IF patient_test_org_id IS NOT NULL THEN
      NEW.organization_id := patient_test_org_id;
    END IF;
  END IF;

  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.get_default_organization_id();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_organization_from_doctor_referral()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  doctor_org_id UUID;
  patient_org_id UUID;
  invoice_org_id UUID;
BEGIN
  IF NEW.doctor_id IS NOT NULL THEN
    SELECT d.organization_id
    INTO doctor_org_id
    FROM public.doctors d
    WHERE d.id = NEW.doctor_id;

    IF doctor_org_id IS NOT NULL THEN
      NEW.organization_id := doctor_org_id;
    END IF;
  END IF;

  IF NEW.organization_id IS NULL AND NEW.patient_id IS NOT NULL THEN
    SELECT p.organization_id
    INTO patient_org_id
    FROM public.patients p
    WHERE p.id = NEW.patient_id;

    IF patient_org_id IS NOT NULL THEN
      NEW.organization_id := patient_org_id;
    END IF;
  END IF;

  IF NEW.organization_id IS NULL AND NEW.invoice_id IS NOT NULL THEN
    SELECT i.organization_id
    INTO invoice_org_id
    FROM public.invoices i
    WHERE i.id = NEW.invoice_id;

    IF invoice_org_id IS NOT NULL THEN
      NEW.organization_id := invoice_org_id;
    END IF;
  END IF;

  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.get_default_organization_id();
  END IF;

  RETURN NEW;
END;
$$;

UPDATE public.inventory_categories
SET organization_id = public.get_default_organization_id()
WHERE organization_id IS NULL;

UPDATE public.inventory_purchases ip
SET organization_id = ii.organization_id
FROM public.inventory_items ii
WHERE ip.item_id = ii.id
  AND ip.organization_id IS NULL;

UPDATE public.inventory_purchases
SET organization_id = public.get_default_organization_id()
WHERE organization_id IS NULL;

UPDATE public.inventory_usage iu
SET organization_id = ii.organization_id
FROM public.inventory_items ii
WHERE iu.item_id = ii.id
  AND iu.organization_id IS NULL;

UPDATE public.inventory_usage iu
SET organization_id = pt.organization_id
FROM public.patient_tests pt
WHERE iu.patient_test_id = pt.id
  AND iu.organization_id IS NULL;

UPDATE public.inventory_usage
SET organization_id = public.get_default_organization_id()
WHERE organization_id IS NULL;

UPDATE public.equipment_maintenance em
SET organization_id = ii.organization_id
FROM public.inventory_items ii
WHERE em.item_id = ii.id
  AND em.organization_id IS NULL;

UPDATE public.equipment_maintenance
SET organization_id = public.get_default_organization_id()
WHERE organization_id IS NULL;

UPDATE public.doctor_referrals dr
SET organization_id = d.organization_id
FROM public.doctors d
WHERE dr.doctor_id = d.id
  AND dr.organization_id IS NULL;

UPDATE public.doctor_referrals dr
SET organization_id = p.organization_id
FROM public.patients p
WHERE dr.patient_id = p.id
  AND dr.organization_id IS NULL;

UPDATE public.doctor_referrals dr
SET organization_id = i.organization_id
FROM public.invoices i
WHERE dr.invoice_id = i.id
  AND dr.organization_id IS NULL;

UPDATE public.doctor_referrals
SET organization_id = public.get_default_organization_id()
WHERE organization_id IS NULL;

DROP TRIGGER IF EXISTS trg00_inventory_purchases_sync_organization ON public.inventory_purchases;
CREATE TRIGGER trg00_inventory_purchases_sync_organization
BEFORE INSERT OR UPDATE ON public.inventory_purchases
FOR EACH ROW
EXECUTE FUNCTION public.sync_organization_from_inventory_item();

DROP TRIGGER IF EXISTS trg00_inventory_usage_sync_organization ON public.inventory_usage;
CREATE TRIGGER trg00_inventory_usage_sync_organization
BEFORE INSERT OR UPDATE ON public.inventory_usage
FOR EACH ROW
EXECUTE FUNCTION public.sync_organization_from_inventory_item();

DROP TRIGGER IF EXISTS trg00_equipment_maintenance_sync_organization ON public.equipment_maintenance;
CREATE TRIGGER trg00_equipment_maintenance_sync_organization
BEFORE INSERT OR UPDATE ON public.equipment_maintenance
FOR EACH ROW
EXECUTE FUNCTION public.sync_organization_from_inventory_item();

DROP TRIGGER IF EXISTS trg00_doctor_referrals_sync_organization ON public.doctor_referrals;
CREATE TRIGGER trg00_doctor_referrals_sync_organization
BEFORE INSERT OR UPDATE ON public.doctor_referrals
FOR EACH ROW
EXECUTE FUNCTION public.sync_organization_from_doctor_referral();

DROP POLICY IF EXISTS "Staff can view doctors" ON public.doctors;
CREATE POLICY "Staff can view doctors"
ON public.doctors
FOR SELECT
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Staff can manage doctors" ON public.doctors;
CREATE POLICY "Staff can manage doctors"
ON public.doctors
FOR ALL
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Staff can view doctor referrals" ON public.doctor_referrals;
CREATE POLICY "Staff can view doctor referrals"
ON public.doctor_referrals
FOR SELECT
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Staff can manage doctor referrals" ON public.doctor_referrals;
CREATE POLICY "Staff can manage doctor referrals"
ON public.doctor_referrals
FOR ALL
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Anyone can view inventory categories" ON public.inventory_categories;
CREATE POLICY "Staff can view inventory categories by organization"
ON public.inventory_categories
FOR SELECT
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Staff can manage inventory categories" ON public.inventory_categories;
CREATE POLICY "Staff can manage inventory categories"
ON public.inventory_categories
FOR ALL
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Staff can view inventory items" ON public.inventory_items;
CREATE POLICY "Staff can view inventory items"
ON public.inventory_items
FOR SELECT
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Staff can manage inventory items" ON public.inventory_items;
CREATE POLICY "Staff can manage inventory items"
ON public.inventory_items
FOR ALL
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Staff can view inventory purchases" ON public.inventory_purchases;
CREATE POLICY "Staff can view inventory purchases"
ON public.inventory_purchases
FOR SELECT
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Staff can manage inventory purchases" ON public.inventory_purchases;
CREATE POLICY "Staff can manage inventory purchases"
ON public.inventory_purchases
FOR ALL
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Staff can view inventory usage" ON public.inventory_usage;
CREATE POLICY "Staff can view inventory usage"
ON public.inventory_usage
FOR SELECT
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Staff can manage inventory usage" ON public.inventory_usage;
CREATE POLICY "Staff can manage inventory usage"
ON public.inventory_usage
FOR ALL
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Staff can view equipment maintenance" ON public.equipment_maintenance;
CREATE POLICY "Staff can view equipment maintenance"
ON public.equipment_maintenance
FOR SELECT
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Staff can manage equipment maintenance" ON public.equipment_maintenance;
CREATE POLICY "Staff can manage equipment maintenance"
ON public.equipment_maintenance
FOR ALL
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
);
