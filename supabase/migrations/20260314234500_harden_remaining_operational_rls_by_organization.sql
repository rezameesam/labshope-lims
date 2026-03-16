CREATE OR REPLACE FUNCTION public.get_patient_organization_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.organization_id
  FROM public.patients p
  WHERE p.user_id = _user_id
    AND p.is_active = true
  ORDER BY p.created_at ASC, p.id ASC
  LIMIT 1
$$;

DROP POLICY IF EXISTS "Staff can view booking requests" ON public.booking_requests;
CREATE POLICY "Staff can view booking requests by organization"
ON public.booking_requests
FOR SELECT
TO authenticated
USING (
  (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'employee'::public.app_role)
    OR public.has_role(auth.uid(), 'collector'::public.app_role)
  )
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Staff can manage booking requests" ON public.booking_requests;
CREATE POLICY "Staff can manage booking requests by organization"
ON public.booking_requests
FOR ALL
TO authenticated
USING (
  (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'employee'::public.app_role)
    OR public.has_role(auth.uid(), 'collector'::public.app_role)
  )
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
)
WITH CHECK (
  (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'employee'::public.app_role)
    OR public.has_role(auth.uid(), 'collector'::public.app_role)
  )
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Staff can view all reminders" ON public.patient_reminders;
CREATE POLICY "Staff can view reminders by organization"
ON public.patient_reminders
FOR SELECT
TO authenticated
USING (
  (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'employee'::public.app_role)
  )
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Staff can manage reminders" ON public.patient_reminders;
CREATE POLICY "Staff can manage reminders by organization"
ON public.patient_reminders
FOR ALL
TO authenticated
USING (
  (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'employee'::public.app_role)
  )
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
)
WITH CHECK (
  (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'employee'::public.app_role)
  )
  AND public.user_has_operational_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Staff can view employees" ON public.employees;
DROP POLICY IF EXISTS "Staff can view employees by lab" ON public.employees;
CREATE POLICY "Staff can view employees by organization"
ON public.employees
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR (
    (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'employee'::public.app_role)
    )
    AND public.user_has_operational_organization_access(auth.uid(), organization_id)
  )
);

DROP POLICY IF EXISTS "Admins can manage all employees" ON public.employees;
DROP POLICY IF EXISTS "Admins can manage employees" ON public.employees;
CREATE POLICY "Admins can manage employees by organization"
ON public.employees
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND public.user_has_organization_access(auth.uid(), organization_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND public.user_has_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Authenticated users can view active labs" ON public.labs;
CREATE POLICY "Authenticated users can view active labs by organization"
ON public.labs
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND (
    (
      (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'employee'::public.app_role)
        OR public.has_role(auth.uid(), 'collector'::public.app_role)
      )
      AND public.user_has_operational_organization_access(auth.uid(), organization_id)
    )
    OR public.get_patient_organization_id(auth.uid()) = organization_id
  )
);

DROP POLICY IF EXISTS "Staff can manage labs" ON public.labs;
CREATE POLICY "Admins can manage labs by organization"
ON public.labs
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND public.user_has_organization_access(auth.uid(), organization_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND public.user_has_organization_access(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Staff can view collection centers" ON public.collection_centers;
CREATE POLICY "Authenticated users can view collection centers by organization"
ON public.collection_centers
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND (
    (
      (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'employee'::public.app_role)
        OR public.has_role(auth.uid(), 'collector'::public.app_role)
      )
      AND public.user_has_operational_organization_access(auth.uid(), organization_id)
    )
    OR public.get_patient_organization_id(auth.uid()) = organization_id
  )
);

DROP POLICY IF EXISTS "Staff can manage collection centers" ON public.collection_centers;
CREATE POLICY "Admins can manage collection centers by organization"
ON public.collection_centers
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND public.user_has_organization_access(auth.uid(), organization_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND public.user_has_organization_access(auth.uid(), organization_id)
);
