-- Fix ambiguous parameter names in patient password helpers

DROP FUNCTION IF EXISTS public.patient_login(text, text);
DROP FUNCTION IF EXISTS public.patient_set_password(uuid, text, text);

CREATE OR REPLACE FUNCTION public.patient_login(p_identifier text, p_password text)
RETURNS TABLE (
  id uuid,
  patient_id text,
  full_name text,
  phone text,
  email text,
  gender text,
  blood_group text,
  address text,
  date_of_birth date,
  is_active boolean,
  password_reset_required boolean
) AS $$
  SELECT
    p.id,
    p.patient_id,
    p.full_name,
    p.phone,
    p.email,
    p.gender,
    p.blood_group,
    p.address,
    p.date_of_birth,
    p.is_active,
    p.password_reset_required
  FROM public.patients p
  WHERE p.is_active = true
    AND (
      p.username = p_identifier OR
      p.email = p_identifier OR
      p.phone = p_identifier OR
      p.patient_id = p_identifier
    )
    AND p.password_hash = extensions.crypt(p_password, p.password_hash)
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.patient_set_password(
  p_patient_id uuid,
  p_current_password text,
  p_new_password text
) RETURNS boolean AS $$
BEGIN
  UPDATE public.patients
  SET
    password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
    password_reset_required = false,
    last_password_change = now()
  WHERE id = p_patient_id
    AND is_active = true
    AND password_hash = extensions.crypt(p_current_password, password_hash);

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
