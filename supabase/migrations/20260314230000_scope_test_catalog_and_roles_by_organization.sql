ALTER TABLE public.test_categories
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.tests
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.custom_roles
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

ALTER TABLE public.test_categories
  DROP CONSTRAINT IF EXISTS test_categories_name_key;

ALTER TABLE public.custom_roles
  DROP CONSTRAINT IF EXISTS custom_roles_name_key;

ALTER TABLE public.tests
  DROP CONSTRAINT IF EXISTS tests_test_id_key;

CREATE INDEX IF NOT EXISTS idx_test_categories_organization_id
  ON public.test_categories(organization_id);

CREATE INDEX IF NOT EXISTS idx_tests_organization_id
  ON public.tests(organization_id);

CREATE INDEX IF NOT EXISTS idx_custom_roles_organization_id
  ON public.custom_roles(organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_test_categories_org_name_unique
  ON public.test_categories(organization_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_roles_org_name_unique
  ON public.custom_roles(organization_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tests_org_test_id_unique
  ON public.tests(organization_id, test_id)
  WHERE test_id IS NOT NULL;

UPDATE public.test_categories
SET organization_id = public.get_default_organization_id()
WHERE organization_id IS NULL;

UPDATE public.tests t
SET organization_id = COALESCE(tc.organization_id, public.get_default_organization_id())
FROM public.test_categories tc
WHERE t.organization_id IS NULL
  AND t.category_id = tc.id;

UPDATE public.tests
SET organization_id = public.get_default_organization_id()
WHERE organization_id IS NULL;

UPDATE public.custom_roles
SET organization_id = public.get_default_organization_id()
WHERE organization_id IS NULL;

CREATE OR REPLACE FUNCTION public.set_default_organization_on_test_category()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.get_default_organization_id();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_organization_from_test_category()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  category_org_id UUID;
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    SELECT tc.organization_id
    INTO category_org_id
    FROM public.test_categories tc
    WHERE tc.id = NEW.category_id;

    IF category_org_id IS NOT NULL THEN
      NEW.organization_id := category_org_id;
    END IF;
  END IF;

  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.get_default_organization_id();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_default_organization_on_custom_role()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.get_default_organization_id();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_organization_on_test_package()
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

  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.get_default_organization_id();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg00_test_categories_set_default_organization ON public.test_categories;
CREATE TRIGGER trg00_test_categories_set_default_organization
BEFORE INSERT OR UPDATE ON public.test_categories
FOR EACH ROW
EXECUTE FUNCTION public.set_default_organization_on_test_category();

DROP TRIGGER IF EXISTS trg00_tests_sync_organization ON public.tests;
CREATE TRIGGER trg00_tests_sync_organization
BEFORE INSERT OR UPDATE ON public.tests
FOR EACH ROW
EXECUTE FUNCTION public.sync_organization_from_test_category();

DROP TRIGGER IF EXISTS trg00_custom_roles_set_default_organization ON public.custom_roles;
CREATE TRIGGER trg00_custom_roles_set_default_organization
BEFORE INSERT OR UPDATE ON public.custom_roles
FOR EACH ROW
EXECUTE FUNCTION public.set_default_organization_on_custom_role();

DROP TRIGGER IF EXISTS trg00_test_packages_sync_organization ON public.test_packages;
CREATE TRIGGER trg00_test_packages_sync_organization
BEFORE INSERT OR UPDATE ON public.test_packages
FOR EACH ROW
EXECUTE FUNCTION public.sync_organization_on_test_package();

DROP POLICY IF EXISTS "Anyone can view test categories" ON public.test_categories;
DROP POLICY IF EXISTS "Collectors can view test categories" ON public.test_categories;
DROP POLICY IF EXISTS "Staff can manage test categories" ON public.test_categories;
CREATE POLICY "Users can view test categories by organization"
ON public.test_categories
FOR SELECT
USING (
  (
    (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'employee'::public.app_role)
      OR public.has_role(auth.uid(), 'collector'::public.app_role)
    )
    AND public.user_has_operational_organization_access(auth.uid(), organization_id)
  )
  OR EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.user_id = auth.uid()
      AND p.organization_id = test_categories.organization_id
  )
);

CREATE POLICY "Staff can manage test categories by organization"
ON public.test_categories
FOR ALL
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Anyone can view tests" ON public.tests;
DROP POLICY IF EXISTS "Collectors can view tests" ON public.tests;
DROP POLICY IF EXISTS "Staff can manage tests" ON public.tests;
CREATE POLICY "Users can view tests by organization"
ON public.tests
FOR SELECT
USING (
  (
    (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'employee'::public.app_role)
      OR public.has_role(auth.uid(), 'collector'::public.app_role)
    )
    AND public.user_has_operational_organization_access(auth.uid(), organization_id)
  )
  OR EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.user_id = auth.uid()
      AND p.organization_id = tests.organization_id
  )
);

CREATE POLICY "Staff can manage tests by organization"
ON public.tests
FOR ALL
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Staff can view test packages" ON public.test_packages;
CREATE POLICY "Staff can view test packages by organization"
ON public.test_packages
FOR SELECT
USING (
  (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'employee'::public.app_role)
    OR public.has_role(auth.uid(), 'collector'::public.app_role)
  )
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Staff can manage test packages" ON public.test_packages;
CREATE POLICY "Staff can manage test packages by organization"
ON public.test_packages
FOR ALL
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Staff can view test package tests" ON public.test_package_tests;
CREATE POLICY "Staff can view test package tests by organization"
ON public.test_package_tests
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.test_packages tp
    WHERE tp.id = test_package_tests.package_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'employee'::public.app_role)
        OR public.has_role(auth.uid(), 'collector'::public.app_role)
      )
      AND public.user_has_operational_organization_access(auth.uid(), tp.organization_id)
  )
);

DROP POLICY IF EXISTS "Staff can manage test package tests" ON public.test_package_tests;
CREATE POLICY "Staff can manage test package tests by organization"
ON public.test_package_tests
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.test_packages tp
    WHERE tp.id = test_package_tests.package_id
      AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
      AND public.user_has_operational_organization_access(auth.uid(), tp.organization_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.test_packages tp
    WHERE tp.id = test_package_tests.package_id
      AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'employee'::public.app_role))
      AND public.user_has_operational_organization_access(auth.uid(), tp.organization_id)
  )
);

DROP POLICY IF EXISTS "Admins can view all custom roles" ON public.custom_roles;
CREATE POLICY "Admins can view custom roles by organization"
ON public.custom_roles
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND public.user_has_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Admins can manage custom roles" ON public.custom_roles;
CREATE POLICY "Admins can manage custom roles by organization"
ON public.custom_roles
FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND public.user_has_organization_access(auth.uid(), organization_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND public.user_has_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Admins can view role permissions" ON public.role_permissions;
CREATE POLICY "Admins can view role permissions by organization"
ON public.role_permissions
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND EXISTS (
    SELECT 1
    FROM public.custom_roles cr
    WHERE cr.id = role_permissions.role_id
      AND public.user_has_organization_access(auth.uid(), cr.organization_id)
  )
);

DROP POLICY IF EXISTS "Admins can manage role permissions" ON public.role_permissions;
CREATE POLICY "Admins can manage role permissions by organization"
ON public.role_permissions
FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND EXISTS (
    SELECT 1
    FROM public.custom_roles cr
    WHERE cr.id = role_permissions.role_id
      AND public.user_has_organization_access(auth.uid(), cr.organization_id)
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND EXISTS (
    SELECT 1
    FROM public.custom_roles cr
    WHERE cr.id = role_permissions.role_id
      AND public.user_has_organization_access(auth.uid(), cr.organization_id)
  )
);

DROP POLICY IF EXISTS "Admins can view user custom roles" ON public.user_custom_roles;
CREATE POLICY "Admins can view user custom roles by organization"
ON public.user_custom_roles
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND EXISTS (
    SELECT 1
    FROM public.custom_roles cr
    WHERE cr.id = user_custom_roles.role_id
      AND public.user_has_organization_access(auth.uid(), cr.organization_id)
  )
);

DROP POLICY IF EXISTS "Admins can manage user custom roles" ON public.user_custom_roles;
CREATE POLICY "Admins can manage user custom roles by organization"
ON public.user_custom_roles
FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND EXISTS (
    SELECT 1
    FROM public.custom_roles cr
    WHERE cr.id = user_custom_roles.role_id
      AND public.user_has_organization_access(auth.uid(), cr.organization_id)
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND EXISTS (
    SELECT 1
    FROM public.custom_roles cr
    WHERE cr.id = user_custom_roles.role_id
      AND public.user_has_organization_access(auth.uid(), cr.organization_id)
      AND (
        EXISTS (
          SELECT 1
          FROM public.organization_users ou
          WHERE ou.user_id = user_custom_roles.user_id
            AND ou.organization_id = cr.organization_id
            AND ou.is_active = true
        )
        OR EXISTS (
          SELECT 1
          FROM public.employees e
          WHERE e.user_id = user_custom_roles.user_id
            AND e.organization_id = cr.organization_id
        )
      )
  )
);
