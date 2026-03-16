ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_employee_id_key;

DROP INDEX IF EXISTS public.employees_employee_id_key;
DROP INDEX IF EXISTS public.idx_employees_org_employee_id;
DROP INDEX IF EXISTS public.idx_employees_employee_id_null_org;

CREATE UNIQUE INDEX idx_employees_org_employee_id
  ON public.employees (organization_id, employee_id)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX idx_employees_employee_id_null_org
  ON public.employees (employee_id)
  WHERE organization_id IS NULL;

ALTER TABLE public.patients
  DROP CONSTRAINT IF EXISTS patients_patient_id_key;

DROP INDEX IF EXISTS public.patients_patient_id_key;
DROP INDEX IF EXISTS public.idx_patients_org_patient_id;
DROP INDEX IF EXISTS public.idx_patients_patient_id_null_org;

CREATE UNIQUE INDEX idx_patients_org_patient_id
  ON public.patients (organization_id, patient_id)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX idx_patients_patient_id_null_org
  ON public.patients (patient_id)
  WHERE organization_id IS NULL;
