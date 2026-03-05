-- Production hardening for multi-lab / multi-center deployments.
-- Scope:
-- 1) Backfill lab ownership for existing records
-- 2) Enforce lab and center integrity for new writes
-- 3) Replace broad role-only RLS with lab-scoped RLS

-- Ensure invoices has collection_center_id for center-level joins/integrity.
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS collection_center_id UUID REFERENCES public.collection_centers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_collection_center_id ON public.invoices(collection_center_id);

-- Normalize lab_users primary flags so each user has at most one primary lab.
UPDATE public.lab_users
SET is_primary = false
WHERE is_primary IS NULL;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY is_primary DESC, created_at ASC, id ASC
    ) AS rn
  FROM public.lab_users
)
UPDATE public.lab_users lu
SET is_primary = (ranked.rn = 1)
FROM ranked
WHERE lu.id = ranked.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lab_users_one_primary_per_user
ON public.lab_users(user_id)
WHERE is_primary = true;

DO $$
DECLARE
  default_lab_id UUID;
BEGIN
  -- Pick existing main lab or create one.
  SELECT id
  INTO default_lab_id
  FROM public.labs
  WHERE lab_code = 'LAB001'
  ORDER BY created_at ASC
  LIMIT 1;

  IF default_lab_id IS NULL THEN
    INSERT INTO public.labs (lab_code, name, type, is_active)
    VALUES ('LAB001', 'Main Laboratory', 'main', true)
    RETURNING id INTO default_lab_id;
  END IF;

  -- Backfill employee lab_id (prefer mapped lab_users, fallback to default lab).
  UPDATE public.employees e
  SET lab_id = COALESCE(
    (
      SELECT lu.lab_id
      FROM public.lab_users lu
      WHERE lu.user_id = e.user_id
      ORDER BY lu.is_primary DESC, lu.created_at ASC
      LIMIT 1
    ),
    default_lab_id
  )
  WHERE e.lab_id IS NULL;

  -- Ensure every employee has a lab_users row for their lab.
  INSERT INTO public.lab_users (user_id, lab_id, role, is_primary)
  SELECT
    e.user_id,
    e.lab_id,
    CASE
      WHEN public.has_role(e.user_id, 'admin'::public.app_role) THEN 'admin'
      ELSE 'employee'
    END,
    true
  FROM public.employees e
  WHERE e.lab_id IS NOT NULL
  ON CONFLICT (user_id, lab_id) DO NOTHING;

  -- Re-normalize primaries after inserts.
  WITH ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id
        ORDER BY is_primary DESC, created_at ASC, id ASC
      ) AS rn
    FROM public.lab_users
  )
  UPDATE public.lab_users lu
  SET is_primary = (ranked.rn = 1)
  FROM ranked
  WHERE lu.id = ranked.id;

  -- Backfill patient lab from center -> creator employee -> default.
  UPDATE public.patients p
  SET lab_id = COALESCE(
    p.lab_id,
    (
      SELECT cc.lab_id
      FROM public.collection_centers cc
      WHERE cc.id = p.collection_center_id
      LIMIT 1
    ),
    (
      SELECT e.lab_id
      FROM public.employees e
      WHERE e.user_id = p.created_by
      LIMIT 1
    ),
    default_lab_id
  )
  WHERE p.lab_id IS NULL;

  -- Drop invalid patient center references that don't match patient lab.
  UPDATE public.patients p
  SET collection_center_id = NULL
  WHERE p.collection_center_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.collection_centers cc
      WHERE cc.id = p.collection_center_id
        AND cc.lab_id = p.lab_id
    );

  -- Backfill test lab from patient -> center -> default.
  UPDATE public.patient_tests pt
  SET lab_id = COALESCE(
    pt.lab_id,
    (
      SELECT p.lab_id
      FROM public.patients p
      WHERE p.id = pt.patient_id
      LIMIT 1
    ),
    (
      SELECT cc.lab_id
      FROM public.collection_centers cc
      WHERE cc.id = pt.collection_center_id
      LIMIT 1
    ),
    default_lab_id
  )
  WHERE pt.lab_id IS NULL;

  -- Drop invalid test center references that don't match test lab.
  UPDATE public.patient_tests pt
  SET collection_center_id = NULL
  WHERE pt.collection_center_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.collection_centers cc
      WHERE cc.id = pt.collection_center_id
        AND cc.lab_id = pt.lab_id
    );

  -- Backfill invoice lab/center from patient and linked test items.
  UPDATE public.invoices i
  SET
    lab_id = COALESCE(
      i.lab_id,
      p.lab_id,
      (
        SELECT pt.lab_id
        FROM public.invoice_items ii
        JOIN public.patient_tests pt ON pt.id = ii.patient_test_id
        WHERE ii.invoice_id = i.id
          AND pt.lab_id IS NOT NULL
        ORDER BY ii.created_at ASC
        LIMIT 1
      ),
      default_lab_id
    ),
    collection_center_id = COALESCE(
      i.collection_center_id,
      p.collection_center_id,
      (
        SELECT pt.collection_center_id
        FROM public.invoice_items ii
        JOIN public.patient_tests pt ON pt.id = ii.patient_test_id
        WHERE ii.invoice_id = i.id
          AND pt.collection_center_id IS NOT NULL
        ORDER BY ii.created_at ASC
        LIMIT 1
      )
    )
  FROM public.patients p
  WHERE p.id = i.patient_id;

  -- Drop invalid invoice center references that don't match invoice lab.
  UPDATE public.invoices i
  SET collection_center_id = NULL
  WHERE i.collection_center_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.collection_centers cc
      WHERE cc.id = i.collection_center_id
        AND cc.lab_id = i.lab_id
    );
END
$$;

-- Integrity triggers: lab_id required on operational tables.
CREATE OR REPLACE FUNCTION public.enforce_lab_id_required()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.lab_id IS NULL THEN
    RAISE EXCEPTION 'lab_id is required for % operations', TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- Integrity triggers: when center is provided, it must belong to the same lab.
CREATE OR REPLACE FUNCTION public.enforce_lab_center_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  center_lab_id UUID;
BEGIN
  IF NEW.collection_center_id IS NOT NULL THEN
    SELECT cc.lab_id
    INTO center_lab_id
    FROM public.collection_centers cc
    WHERE cc.id = NEW.collection_center_id;

    IF center_lab_id IS NULL THEN
      RAISE EXCEPTION 'Invalid collection_center_id %', NEW.collection_center_id
        USING ERRCODE = '23503';
    END IF;

    IF NEW.lab_id IS NULL THEN
      NEW.lab_id := center_lab_id;
    ELSIF NEW.lab_id <> center_lab_id THEN
      RAISE EXCEPTION 'collection_center_id % does not belong to lab_id %', NEW.collection_center_id, NEW.lab_id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.lab_id IS NULL THEN
    RAISE EXCEPTION 'lab_id is required for % operations', TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employees_require_lab_id ON public.employees;
CREATE TRIGGER trg_employees_require_lab_id
BEFORE INSERT OR UPDATE ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.enforce_lab_id_required();

DROP TRIGGER IF EXISTS trg_patients_lab_center_integrity ON public.patients;
CREATE TRIGGER trg_patients_lab_center_integrity
BEFORE INSERT OR UPDATE ON public.patients
FOR EACH ROW
EXECUTE FUNCTION public.enforce_lab_center_integrity();

DROP TRIGGER IF EXISTS trg_patient_tests_lab_center_integrity ON public.patient_tests;
CREATE TRIGGER trg_patient_tests_lab_center_integrity
BEFORE INSERT OR UPDATE ON public.patient_tests
FOR EACH ROW
EXECUTE FUNCTION public.enforce_lab_center_integrity();

DROP TRIGGER IF EXISTS trg_invoices_lab_center_integrity ON public.invoices;
CREATE TRIGGER trg_invoices_lab_center_integrity
BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.enforce_lab_center_integrity();

-- ----------------------------
-- RLS hardening: employees
-- ----------------------------
DROP POLICY IF EXISTS "Employees can view all employees" ON public.employees;
DROP POLICY IF EXISTS "Admins can manage employees" ON public.employees;
DROP POLICY IF EXISTS "Collectors can view their own employee record" ON public.employees;

CREATE POLICY "Staff can view employees by lab"
ON public.employees
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    (public.has_role(auth.uid(), 'employee'::public.app_role)
      OR public.has_role(auth.uid(), 'collector'::public.app_role))
    AND lab_id IS NOT NULL
    AND public.user_has_lab_access(auth.uid(), lab_id)
  )
);

CREATE POLICY "Admins can manage employees"
ON public.employees
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND lab_id IS NOT NULL
);

-- ----------------------------
-- RLS hardening: patients
-- ----------------------------
DROP POLICY IF EXISTS "Staff can view all patients" ON public.patients;
DROP POLICY IF EXISTS "Patients can view their own record" ON public.patients;
DROP POLICY IF EXISTS "Staff can manage patients" ON public.patients;
DROP POLICY IF EXISTS "Collectors can view patients" ON public.patients;
DROP POLICY IF EXISTS "Collectors can create patients" ON public.patients;
DROP POLICY IF EXISTS "Collectors can view their own patients" ON public.patients;
DROP POLICY IF EXISTS "Collectors can update their own patients" ON public.patients;
DROP POLICY IF EXISTS "Collectors can view patients they created" ON public.patients;
DROP POLICY IF EXISTS "Collectors can update patients they created" ON public.patients;

CREATE POLICY "Patients can view their own record"
ON public.patients
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Staff can view patients by lab"
ON public.patients
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'employee'::public.app_role)
    AND lab_id IS NOT NULL
    AND public.user_has_lab_access(auth.uid(), lab_id)
  )
  OR (
    public.has_role(auth.uid(), 'collector'::public.app_role)
    AND created_by = auth.uid()
    AND lab_id IS NOT NULL
    AND public.user_has_lab_access(auth.uid(), lab_id)
  )
);

CREATE POLICY "Staff can insert patients by lab"
ON public.patients
FOR INSERT
TO authenticated
WITH CHECK (
  (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND lab_id IS NOT NULL
  )
  OR (
    public.has_role(auth.uid(), 'employee'::public.app_role)
    AND lab_id IS NOT NULL
    AND public.user_has_lab_access(auth.uid(), lab_id)
  )
  OR (
    public.has_role(auth.uid(), 'collector'::public.app_role)
    AND created_by = auth.uid()
    AND lab_id IS NOT NULL
    AND public.user_has_lab_access(auth.uid(), lab_id)
  )
);

CREATE POLICY "Staff can update patients by lab"
ON public.patients
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'employee'::public.app_role)
    AND lab_id IS NOT NULL
    AND public.user_has_lab_access(auth.uid(), lab_id)
  )
  OR (
    public.has_role(auth.uid(), 'collector'::public.app_role)
    AND created_by = auth.uid()
    AND lab_id IS NOT NULL
    AND public.user_has_lab_access(auth.uid(), lab_id)
  )
)
WITH CHECK (
  (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND lab_id IS NOT NULL
  )
  OR (
    public.has_role(auth.uid(), 'employee'::public.app_role)
    AND lab_id IS NOT NULL
    AND public.user_has_lab_access(auth.uid(), lab_id)
  )
  OR (
    public.has_role(auth.uid(), 'collector'::public.app_role)
    AND created_by = auth.uid()
    AND lab_id IS NOT NULL
    AND public.user_has_lab_access(auth.uid(), lab_id)
  )
);

CREATE POLICY "Staff can delete patients by lab"
ON public.patients
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'employee'::public.app_role)
    AND lab_id IS NOT NULL
    AND public.user_has_lab_access(auth.uid(), lab_id)
  )
);

-- ----------------------------
-- RLS hardening: patient_tests
-- ----------------------------
DROP POLICY IF EXISTS "Staff can view all patient tests" ON public.patient_tests;
DROP POLICY IF EXISTS "Patients can view their own tests" ON public.patient_tests;
DROP POLICY IF EXISTS "Staff can manage patient tests" ON public.patient_tests;
DROP POLICY IF EXISTS "Collectors can view patient tests" ON public.patient_tests;
DROP POLICY IF EXISTS "Collectors can create patient tests" ON public.patient_tests;
DROP POLICY IF EXISTS "Collectors can update their collections" ON public.patient_tests;
DROP POLICY IF EXISTS "Collectors can view tests they collected" ON public.patient_tests;
DROP POLICY IF EXISTS "Collectors can view tests for patients they created" ON public.patient_tests;

CREATE POLICY "Patients can view their own tests"
ON public.patient_tests
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = patient_tests.patient_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Staff can view patient tests by lab"
ON public.patient_tests
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'employee'::public.app_role)
    AND lab_id IS NOT NULL
    AND public.user_has_lab_access(auth.uid(), lab_id)
  )
  OR (
    public.has_role(auth.uid(), 'collector'::public.app_role)
    AND lab_id IS NOT NULL
    AND public.user_has_lab_access(auth.uid(), lab_id)
    AND (
      collected_by = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.patients p
        WHERE p.id = patient_tests.patient_id
          AND p.created_by = auth.uid()
      )
    )
  )
);

CREATE POLICY "Staff can insert patient tests by lab"
ON public.patient_tests
FOR INSERT
TO authenticated
WITH CHECK (
  (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND lab_id IS NOT NULL
  )
  OR (
    public.has_role(auth.uid(), 'employee'::public.app_role)
    AND lab_id IS NOT NULL
    AND public.user_has_lab_access(auth.uid(), lab_id)
  )
  OR (
    public.has_role(auth.uid(), 'collector'::public.app_role)
    AND lab_id IS NOT NULL
    AND public.user_has_lab_access(auth.uid(), lab_id)
    AND collected_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = patient_tests.patient_id
        AND p.created_by = auth.uid()
    )
  )
);

CREATE POLICY "Staff can update patient tests by lab"
ON public.patient_tests
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'employee'::public.app_role)
    AND lab_id IS NOT NULL
    AND public.user_has_lab_access(auth.uid(), lab_id)
  )
  OR (
    public.has_role(auth.uid(), 'collector'::public.app_role)
    AND lab_id IS NOT NULL
    AND public.user_has_lab_access(auth.uid(), lab_id)
    AND collected_by = auth.uid()
  )
)
WITH CHECK (
  (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND lab_id IS NOT NULL
  )
  OR (
    public.has_role(auth.uid(), 'employee'::public.app_role)
    AND lab_id IS NOT NULL
    AND public.user_has_lab_access(auth.uid(), lab_id)
  )
  OR (
    public.has_role(auth.uid(), 'collector'::public.app_role)
    AND lab_id IS NOT NULL
    AND public.user_has_lab_access(auth.uid(), lab_id)
    AND collected_by = auth.uid()
  )
);

CREATE POLICY "Staff can delete patient tests by lab"
ON public.patient_tests
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'employee'::public.app_role)
    AND lab_id IS NOT NULL
    AND public.user_has_lab_access(auth.uid(), lab_id)
  )
);

-- ----------------------------
-- RLS hardening: invoices
-- ----------------------------
DROP POLICY IF EXISTS "Staff can manage invoices" ON public.invoices;
DROP POLICY IF EXISTS "Patients can view their own invoices" ON public.invoices;

CREATE POLICY "Patients can view their own invoices"
ON public.invoices
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = invoices.patient_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Staff can view invoices by lab"
ON public.invoices
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'employee'::public.app_role)
    AND lab_id IS NOT NULL
    AND public.user_has_lab_access(auth.uid(), lab_id)
  )
  OR (
    public.has_role(auth.uid(), 'collector'::public.app_role)
    AND created_by = auth.uid()
    AND lab_id IS NOT NULL
    AND public.user_has_lab_access(auth.uid(), lab_id)
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = invoices.patient_id
        AND p.created_by = auth.uid()
    )
  )
);

CREATE POLICY "Staff can insert invoices by lab"
ON public.invoices
FOR INSERT
TO authenticated
WITH CHECK (
  (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND lab_id IS NOT NULL
  )
  OR (
    public.has_role(auth.uid(), 'employee'::public.app_role)
    AND lab_id IS NOT NULL
    AND public.user_has_lab_access(auth.uid(), lab_id)
  )
  OR (
    public.has_role(auth.uid(), 'collector'::public.app_role)
    AND created_by = auth.uid()
    AND lab_id IS NOT NULL
    AND public.user_has_lab_access(auth.uid(), lab_id)
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = invoices.patient_id
        AND p.created_by = auth.uid()
    )
  )
);

CREATE POLICY "Staff can update invoices by lab"
ON public.invoices
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'employee'::public.app_role)
    AND lab_id IS NOT NULL
    AND public.user_has_lab_access(auth.uid(), lab_id)
  )
)
WITH CHECK (
  (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND lab_id IS NOT NULL
  )
  OR (
    public.has_role(auth.uid(), 'employee'::public.app_role)
    AND lab_id IS NOT NULL
    AND public.user_has_lab_access(auth.uid(), lab_id)
  )
);

CREATE POLICY "Staff can delete invoices by lab"
ON public.invoices
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'employee'::public.app_role)
    AND lab_id IS NOT NULL
    AND public.user_has_lab_access(auth.uid(), lab_id)
  )
);

-- ----------------------------
-- RLS hardening: invoice_items
-- ----------------------------
DROP POLICY IF EXISTS "Staff can manage invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Patients can view their own invoice items" ON public.invoice_items;

CREATE POLICY "Patients can view their own invoice items"
ON public.invoice_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.invoices i
    JOIN public.patients p ON p.id = i.patient_id
    WHERE i.id = invoice_items.invoice_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Staff can view invoice items by lab"
ON public.invoice_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR (
          public.has_role(auth.uid(), 'employee'::public.app_role)
          AND i.lab_id IS NOT NULL
          AND public.user_has_lab_access(auth.uid(), i.lab_id)
        )
        OR (
          public.has_role(auth.uid(), 'collector'::public.app_role)
          AND i.created_by = auth.uid()
          AND i.lab_id IS NOT NULL
          AND public.user_has_lab_access(auth.uid(), i.lab_id)
        )
      )
  )
);

CREATE POLICY "Staff can insert invoice items by lab"
ON public.invoice_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR (
          public.has_role(auth.uid(), 'employee'::public.app_role)
          AND i.lab_id IS NOT NULL
          AND public.user_has_lab_access(auth.uid(), i.lab_id)
        )
        OR (
          public.has_role(auth.uid(), 'collector'::public.app_role)
          AND i.created_by = auth.uid()
          AND i.lab_id IS NOT NULL
          AND public.user_has_lab_access(auth.uid(), i.lab_id)
        )
      )
  )
);

CREATE POLICY "Staff can update invoice items by lab"
ON public.invoice_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR (
          public.has_role(auth.uid(), 'employee'::public.app_role)
          AND i.lab_id IS NOT NULL
          AND public.user_has_lab_access(auth.uid(), i.lab_id)
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR (
          public.has_role(auth.uid(), 'employee'::public.app_role)
          AND i.lab_id IS NOT NULL
          AND public.user_has_lab_access(auth.uid(), i.lab_id)
        )
      )
  )
);

CREATE POLICY "Staff can delete invoice items by lab"
ON public.invoice_items
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR (
          public.has_role(auth.uid(), 'employee'::public.app_role)
          AND i.lab_id IS NOT NULL
          AND public.user_has_lab_access(auth.uid(), i.lab_id)
        )
      )
  )
);

-- ----------------------------
-- RLS hardening: payments
-- ----------------------------
DROP POLICY IF EXISTS "Staff can manage payments" ON public.payments;
DROP POLICY IF EXISTS "Patients can view their own payments" ON public.payments;

CREATE POLICY "Patients can view their own payments"
ON public.payments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.invoices i
    JOIN public.patients p ON p.id = i.patient_id
    WHERE i.id = payments.invoice_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Staff can view payments by lab"
ON public.payments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = payments.invoice_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR (
          public.has_role(auth.uid(), 'employee'::public.app_role)
          AND i.lab_id IS NOT NULL
          AND public.user_has_lab_access(auth.uid(), i.lab_id)
        )
      )
  )
);

CREATE POLICY "Staff can insert payments by lab"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = payments.invoice_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR (
          public.has_role(auth.uid(), 'employee'::public.app_role)
          AND i.lab_id IS NOT NULL
          AND public.user_has_lab_access(auth.uid(), i.lab_id)
        )
      )
  )
);

CREATE POLICY "Staff can update payments by lab"
ON public.payments
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = payments.invoice_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR (
          public.has_role(auth.uid(), 'employee'::public.app_role)
          AND i.lab_id IS NOT NULL
          AND public.user_has_lab_access(auth.uid(), i.lab_id)
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = payments.invoice_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR (
          public.has_role(auth.uid(), 'employee'::public.app_role)
          AND i.lab_id IS NOT NULL
          AND public.user_has_lab_access(auth.uid(), i.lab_id)
        )
      )
  )
);

CREATE POLICY "Staff can delete payments by lab"
ON public.payments
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = payments.invoice_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR (
          public.has_role(auth.uid(), 'employee'::public.app_role)
          AND i.lab_id IS NOT NULL
          AND public.user_has_lab_access(auth.uid(), i.lab_id)
        )
      )
  )
);
