-- Introduce a top-level organization tenant layer without breaking the current IRM deployment.
-- This migration is intentionally backward-compatible:
-- 1) create organization tables
-- 2) seed IRM as the first organization
-- 3) backfill organization_id onto current data
-- 4) auto-populate organization_id for future writes from existing lab/center data
-- 5) keep current app behavior unchanged by leaving existing queries and RLS intact

-- ----------------------------
-- Core organization tables
-- ----------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  legal_name TEXT,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('trial', 'active', 'suspended', 'cancelled')),
  plan_code TEXT NOT NULL DEFAULT 'standard',
  primary_email TEXT,
  primary_phone TEXT,
  billing_email TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  currency_code TEXT NOT NULL DEFAULT 'INR',
  country_code TEXT NOT NULL DEFAULT 'IN',
  logo_url TEXT,
  favicon_url TEXT,
  theme JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  domain TEXT NOT NULL UNIQUE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL
    CHECK (role IN ('owner', 'org_admin', 'billing_admin', 'support', 'staff')),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

-- Mirrors the existing system_settings shape so the UI can be migrated incrementally later.
CREATE TABLE IF NOT EXISTS public.organization_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  setting_key TEXT NOT NULL,
  setting_value TEXT,
  setting_type TEXT NOT NULL DEFAULT 'text'
    CHECK (setting_type IN ('text', 'password', 'json', 'boolean')),
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('general', 'payment', 'email', 'sms', 'whatsapp', 'other')),
  label TEXT NOT NULL,
  description TEXT,
  is_encrypted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE (organization_id, setting_key)
);

CREATE INDEX IF NOT EXISTS idx_organization_domains_organization_id
  ON public.organization_domains(organization_id);

CREATE INDEX IF NOT EXISTS idx_organization_users_organization_id
  ON public.organization_users(organization_id);

CREATE INDEX IF NOT EXISTS idx_organization_users_user_id
  ON public.organization_users(user_id);

CREATE INDEX IF NOT EXISTS idx_organization_settings_organization_id
  ON public.organization_settings(organization_id);

CREATE INDEX IF NOT EXISTS idx_organization_settings_category
  ON public.organization_settings(organization_id, category);

-- ----------------------------
-- Add organization_id to existing tables
-- ----------------------------
ALTER TABLE public.labs
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.collection_centers
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.lab_users
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.lab_settings
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.patient_tests
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.test_packages
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.patient_reminders
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.booking_requests
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

CREATE INDEX IF NOT EXISTS idx_labs_organization_id
  ON public.labs(organization_id);

CREATE INDEX IF NOT EXISTS idx_collection_centers_organization_id
  ON public.collection_centers(organization_id);

CREATE INDEX IF NOT EXISTS idx_lab_users_organization_id
  ON public.lab_users(organization_id);

CREATE INDEX IF NOT EXISTS idx_lab_settings_organization_id
  ON public.lab_settings(organization_id);

CREATE INDEX IF NOT EXISTS idx_employees_organization_id
  ON public.employees(organization_id);

CREATE INDEX IF NOT EXISTS idx_patients_organization_id
  ON public.patients(organization_id);

CREATE INDEX IF NOT EXISTS idx_patient_tests_organization_id
  ON public.patient_tests(organization_id);

CREATE INDEX IF NOT EXISTS idx_invoices_organization_id
  ON public.invoices(organization_id);

CREATE INDEX IF NOT EXISTS idx_inventory_items_organization_id
  ON public.inventory_items(organization_id);

CREATE INDEX IF NOT EXISTS idx_doctors_organization_id
  ON public.doctors(organization_id);

CREATE INDEX IF NOT EXISTS idx_test_packages_organization_id
  ON public.test_packages(organization_id);

CREATE INDEX IF NOT EXISTS idx_patient_reminders_organization_id
  ON public.patient_reminders(organization_id);

CREATE INDEX IF NOT EXISTS idx_booking_requests_organization_id
  ON public.booking_requests(organization_id);

CREATE INDEX IF NOT EXISTS idx_patients_org_lab
  ON public.patients(organization_id, lab_id);

CREATE INDEX IF NOT EXISTS idx_patient_tests_org_lab
  ON public.patient_tests(organization_id, lab_id);

CREATE INDEX IF NOT EXISTS idx_invoices_org_lab
  ON public.invoices(organization_id, lab_id);

-- ----------------------------
-- Helper functions
-- ----------------------------
CREATE OR REPLACE FUNCTION public.get_default_organization_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.organizations
  ORDER BY created_at ASC, id ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_user_organization_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ou.organization_id
  FROM public.organization_users ou
  WHERE ou.user_id = _user_id
    AND ou.is_active = true
  ORDER BY ou.is_primary DESC, ou.created_at ASC, ou.id ASC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.user_has_organization_access(_user_id UUID, _organization_id UUID)
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
    );
$$;

CREATE OR REPLACE FUNCTION public.sync_organization_from_lab()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_org_id UUID;
BEGIN
  IF NEW.lab_id IS NOT NULL THEN
    SELECT l.organization_id
    INTO target_org_id
    FROM public.labs l
    WHERE l.id = NEW.lab_id;

    IF target_org_id IS NOT NULL THEN
      NEW.organization_id := target_org_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_organization_and_lab_from_center()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  center_lab_id UUID;
  center_org_id UUID;
  target_org_id UUID;
BEGIN
  IF NEW.collection_center_id IS NOT NULL THEN
    SELECT
      cc.lab_id,
      COALESCE(cc.organization_id, l.organization_id)
    INTO center_lab_id, center_org_id
    FROM public.collection_centers cc
    LEFT JOIN public.labs l ON l.id = cc.lab_id
    WHERE cc.id = NEW.collection_center_id;

    IF NEW.lab_id IS NULL THEN
      NEW.lab_id := center_lab_id;
    END IF;

    IF center_org_id IS NOT NULL THEN
      NEW.organization_id := center_org_id;
    END IF;
  END IF;

  IF NEW.lab_id IS NOT NULL THEN
    SELECT l.organization_id
    INTO target_org_id
    FROM public.labs l
    WHERE l.id = NEW.lab_id;

    IF target_org_id IS NOT NULL THEN
      NEW.organization_id := target_org_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_default_organization_on_lab()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_org_id UUID;
BEGIN
  IF NEW.organization_id IS NULL AND NEW.parent_lab_id IS NOT NULL THEN
    SELECT l.organization_id
    INTO parent_org_id
    FROM public.labs l
    WHERE l.id = NEW.parent_lab_id;

    IF parent_org_id IS NOT NULL THEN
      NEW.organization_id := parent_org_id;
    END IF;
  END IF;

  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.get_default_organization_id();
  END IF;

  RETURN NEW;
END;
$$;

-- ----------------------------
-- Seed IRM as first organization and backfill existing records
-- ----------------------------
DO $$
DECLARE
  irm_org_id UUID;
  primary_lab_phone TEXT;
  primary_lab_email TEXT;
  primary_lab_logo TEXT;
BEGIN
  SELECT l.phone, l.email, l.logo_url
  INTO primary_lab_phone, primary_lab_email, primary_lab_logo
  FROM public.labs l
  WHERE l.lab_code = 'LAB001'
  ORDER BY l.created_at ASC
  LIMIT 1;

  INSERT INTO public.organizations (
    slug,
    legal_name,
    display_name,
    status,
    plan_code,
    primary_email,
    primary_phone,
    billing_email,
    timezone,
    currency_code,
    country_code,
    logo_url
  )
  VALUES (
    'irmclinic',
    'IRM Clinical Laboratory',
    'IRM Clinical Laboratory',
    'active',
    'standard',
    primary_lab_email,
    primary_lab_phone,
    primary_lab_email,
    'Asia/Kolkata',
    'INR',
    'IN',
    primary_lab_logo
  )
  ON CONFLICT (slug) DO UPDATE
  SET
    legal_name = EXCLUDED.legal_name,
    display_name = EXCLUDED.display_name,
    primary_email = COALESCE(public.organizations.primary_email, EXCLUDED.primary_email),
    primary_phone = COALESCE(public.organizations.primary_phone, EXCLUDED.primary_phone),
    billing_email = COALESCE(public.organizations.billing_email, EXCLUDED.billing_email),
    logo_url = COALESCE(public.organizations.logo_url, EXCLUDED.logo_url)
  RETURNING id INTO irm_org_id;

  IF irm_org_id IS NULL THEN
    SELECT id
    INTO irm_org_id
    FROM public.organizations
    WHERE slug = 'irmclinic'
    LIMIT 1;
  END IF;

  UPDATE public.labs
  SET organization_id = irm_org_id
  WHERE organization_id IS NULL;

  UPDATE public.collection_centers cc
  SET organization_id = l.organization_id
  FROM public.labs l
  WHERE cc.lab_id = l.id
    AND cc.organization_id IS NULL;

  UPDATE public.lab_users lu
  SET organization_id = l.organization_id
  FROM public.labs l
  WHERE lu.lab_id = l.id
    AND lu.organization_id IS NULL;

  UPDATE public.lab_settings ls
  SET organization_id = l.organization_id
  FROM public.labs l
  WHERE ls.lab_id = l.id
    AND ls.organization_id IS NULL;

  UPDATE public.employees e
  SET organization_id = l.organization_id
  FROM public.labs l
  WHERE e.lab_id = l.id
    AND e.organization_id IS NULL;

  UPDATE public.employees
  SET organization_id = irm_org_id
  WHERE organization_id IS NULL;

  UPDATE public.patients p
  SET organization_id = l.organization_id
  FROM public.labs l
  WHERE p.lab_id = l.id
    AND p.organization_id IS NULL;

  UPDATE public.patients
  SET organization_id = irm_org_id
  WHERE organization_id IS NULL;

  UPDATE public.patient_tests pt
  SET organization_id = l.organization_id
  FROM public.labs l
  WHERE pt.lab_id = l.id
    AND pt.organization_id IS NULL;

  UPDATE public.patient_tests
  SET organization_id = irm_org_id
  WHERE organization_id IS NULL;

  UPDATE public.invoices i
  SET organization_id = l.organization_id
  FROM public.labs l
  WHERE i.lab_id = l.id
    AND i.organization_id IS NULL;

  UPDATE public.invoices
  SET organization_id = irm_org_id
  WHERE organization_id IS NULL;

  UPDATE public.inventory_items ii
  SET organization_id = l.organization_id
  FROM public.labs l
  WHERE ii.lab_id = l.id
    AND ii.organization_id IS NULL;

  UPDATE public.inventory_items
  SET organization_id = irm_org_id
  WHERE organization_id IS NULL;

  UPDATE public.doctors d
  SET organization_id = l.organization_id
  FROM public.labs l
  WHERE d.lab_id = l.id
    AND d.organization_id IS NULL;

  UPDATE public.doctors
  SET organization_id = irm_org_id
  WHERE organization_id IS NULL;

  UPDATE public.test_packages tp
  SET organization_id = l.organization_id
  FROM public.labs l
  WHERE tp.lab_id = l.id
    AND tp.organization_id IS NULL;

  UPDATE public.test_packages
  SET organization_id = irm_org_id
  WHERE organization_id IS NULL;

  UPDATE public.patient_reminders pr
  SET organization_id = l.organization_id
  FROM public.labs l
  WHERE pr.lab_id = l.id
    AND pr.organization_id IS NULL;

  UPDATE public.patient_reminders
  SET organization_id = irm_org_id
  WHERE organization_id IS NULL;

  UPDATE public.booking_requests br
  SET organization_id = l.organization_id
  FROM public.labs l
  WHERE br.lab_id = l.id
    AND br.organization_id IS NULL;

  UPDATE public.booking_requests
  SET organization_id = irm_org_id
  WHERE organization_id IS NULL;

  INSERT INTO public.organization_users (
    organization_id,
    user_id,
    role,
    is_primary,
    is_active
  )
  SELECT DISTINCT
    lu.organization_id,
    lu.user_id,
    CASE
      WHEN public.has_role(lu.user_id, 'admin'::public.app_role) OR lu.role = 'admin' THEN 'org_admin'
      ELSE 'staff'
    END,
    COALESCE(lu.is_primary, false),
    true
  FROM public.lab_users lu
  WHERE lu.organization_id IS NOT NULL
  ON CONFLICT (organization_id, user_id) DO UPDATE
  SET
    is_primary = public.organization_users.is_primary OR EXCLUDED.is_primary,
    is_active = true;

  INSERT INTO public.organization_settings (
    organization_id,
    setting_key,
    setting_value,
    setting_type,
    category,
    label,
    description,
    is_encrypted,
    created_at,
    updated_at,
    updated_by
  )
  SELECT
    irm_org_id,
    ss.setting_key,
    ss.setting_value,
    ss.setting_type,
    ss.category,
    ss.label,
    ss.description,
    ss.is_encrypted,
    ss.created_at,
    ss.updated_at,
    ss.updated_by
  FROM public.system_settings ss
  ON CONFLICT (organization_id, setting_key) DO NOTHING;
END
$$;

-- ----------------------------
-- Triggers to keep organization_id populated while old code still writes lab_id only
-- ----------------------------
DROP TRIGGER IF EXISTS trg00_labs_set_default_organization ON public.labs;
CREATE TRIGGER trg00_labs_set_default_organization
BEFORE INSERT OR UPDATE ON public.labs
FOR EACH ROW
EXECUTE FUNCTION public.set_default_organization_on_lab();

DROP TRIGGER IF EXISTS trg00_collection_centers_sync_organization ON public.collection_centers;
CREATE TRIGGER trg00_collection_centers_sync_organization
BEFORE INSERT OR UPDATE ON public.collection_centers
FOR EACH ROW
EXECUTE FUNCTION public.sync_organization_from_lab();

DROP TRIGGER IF EXISTS trg00_lab_users_sync_organization ON public.lab_users;
CREATE TRIGGER trg00_lab_users_sync_organization
BEFORE INSERT OR UPDATE ON public.lab_users
FOR EACH ROW
EXECUTE FUNCTION public.sync_organization_from_lab();

DROP TRIGGER IF EXISTS trg00_lab_settings_sync_organization ON public.lab_settings;
CREATE TRIGGER trg00_lab_settings_sync_organization
BEFORE INSERT OR UPDATE ON public.lab_settings
FOR EACH ROW
EXECUTE FUNCTION public.sync_organization_from_lab();

DROP TRIGGER IF EXISTS trg00_employees_sync_organization ON public.employees;
CREATE TRIGGER trg00_employees_sync_organization
BEFORE INSERT OR UPDATE ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.sync_organization_from_lab();

DROP TRIGGER IF EXISTS trg00_patients_sync_organization ON public.patients;
CREATE TRIGGER trg00_patients_sync_organization
BEFORE INSERT OR UPDATE ON public.patients
FOR EACH ROW
EXECUTE FUNCTION public.sync_organization_and_lab_from_center();

DROP TRIGGER IF EXISTS trg00_patient_tests_sync_organization ON public.patient_tests;
CREATE TRIGGER trg00_patient_tests_sync_organization
BEFORE INSERT OR UPDATE ON public.patient_tests
FOR EACH ROW
EXECUTE FUNCTION public.sync_organization_and_lab_from_center();

DROP TRIGGER IF EXISTS trg00_invoices_sync_organization ON public.invoices;
CREATE TRIGGER trg00_invoices_sync_organization
BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.sync_organization_and_lab_from_center();

DROP TRIGGER IF EXISTS trg00_inventory_items_sync_organization ON public.inventory_items;
CREATE TRIGGER trg00_inventory_items_sync_organization
BEFORE INSERT OR UPDATE ON public.inventory_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_organization_from_lab();

DROP TRIGGER IF EXISTS trg00_doctors_sync_organization ON public.doctors;
CREATE TRIGGER trg00_doctors_sync_organization
BEFORE INSERT OR UPDATE ON public.doctors
FOR EACH ROW
EXECUTE FUNCTION public.sync_organization_from_lab();

DROP TRIGGER IF EXISTS trg00_test_packages_sync_organization ON public.test_packages;
CREATE TRIGGER trg00_test_packages_sync_organization
BEFORE INSERT OR UPDATE ON public.test_packages
FOR EACH ROW
EXECUTE FUNCTION public.sync_organization_from_lab();

DROP TRIGGER IF EXISTS trg00_patient_reminders_sync_organization ON public.patient_reminders;
CREATE TRIGGER trg00_patient_reminders_sync_organization
BEFORE INSERT OR UPDATE ON public.patient_reminders
FOR EACH ROW
EXECUTE FUNCTION public.sync_organization_from_lab();

DROP TRIGGER IF EXISTS trg00_booking_requests_sync_organization ON public.booking_requests;
CREATE TRIGGER trg00_booking_requests_sync_organization
BEFORE INSERT OR UPDATE ON public.booking_requests
FOR EACH ROW
EXECUTE FUNCTION public.sync_organization_and_lab_from_center();

-- ----------------------------
-- Updated-at triggers for new tables
-- ----------------------------
DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
CREATE TRIGGER update_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_organization_settings_updated_at ON public.organization_settings;
CREATE TRIGGER update_organization_settings_updated_at
BEFORE UPDATE ON public.organization_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------
-- RLS for new tables only
-- ----------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their organizations" ON public.organizations;
CREATE POLICY "Members can view their organizations"
ON public.organizations
FOR SELECT
TO authenticated
USING (
  public.user_has_organization_access(auth.uid(), id)
);

DROP POLICY IF EXISTS "Admins can manage organizations" ON public.organizations;
CREATE POLICY "Admins can manage organizations"
ON public.organizations
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Members can view organization users" ON public.organization_users;
CREATE POLICY "Members can view organization users"
ON public.organization_users
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR auth.uid() = user_id
  OR public.user_has_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Admins can manage organization users" ON public.organization_users;
CREATE POLICY "Admins can manage organization users"
ON public.organization_users
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Members can view organization domains" ON public.organization_domains;
CREATE POLICY "Members can view organization domains"
ON public.organization_domains
FOR SELECT
TO authenticated
USING (
  public.user_has_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Admins can manage organization domains" ON public.organization_domains;
CREATE POLICY "Admins can manage organization domains"
ON public.organization_domains
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Organization admins can view organization settings" ON public.organization_settings;
CREATE POLICY "Organization admins can view organization settings"
ON public.organization_settings
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = organization_settings.organization_id
      AND ou.is_active = true
      AND ou.role IN ('owner', 'org_admin', 'billing_admin')
  )
);

DROP POLICY IF EXISTS "Organization admins can manage organization settings" ON public.organization_settings;
CREATE POLICY "Organization admins can manage organization settings"
ON public.organization_settings
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = organization_settings.organization_id
      AND ou.is_active = true
      AND ou.role IN ('owner', 'org_admin', 'billing_admin')
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.organization_users ou
    WHERE ou.user_id = auth.uid()
      AND ou.organization_id = organization_settings.organization_id
      AND ou.is_active = true
      AND ou.role IN ('owner', 'org_admin', 'billing_admin')
  )
);
