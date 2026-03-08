DROP POLICY IF EXISTS "Users can insert own employee private details" ON public.employee_private_details;
DROP POLICY IF EXISTS "Users can update own employee private details" ON public.employee_private_details;

CREATE OR REPLACE FUNCTION public.enforce_employee_self_phone_only_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF auth.uid() <> OLD.user_id THEN
    RAISE EXCEPTION 'You can only update your own employee record';
  END IF;

  IF ROW(
    NEW.user_id,
    NEW.employee_id,
    NEW.full_name,
    NEW.email,
    NEW.designation,
    NEW.department,
    NEW.is_active,
    NEW.created_at,
    NEW.lab_id
  ) IS DISTINCT FROM ROW(
    OLD.user_id,
    OLD.employee_id,
    OLD.full_name,
    OLD.email,
    OLD.designation,
    OLD.department,
    OLD.is_active,
    OLD.created_at,
    OLD.lab_id
  ) THEN
    RAISE EXCEPTION 'Employees can only update their phone number';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_employee_self_phone_only_update ON public.employees;
CREATE TRIGGER trg_enforce_employee_self_phone_only_update
BEFORE UPDATE ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.enforce_employee_self_phone_only_update();

DROP POLICY IF EXISTS "Users can update own employee phone" ON public.employees;
CREATE POLICY "Users can update own employee phone"
ON public.employees
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
