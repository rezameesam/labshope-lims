-- Helper to reset password without current password (via reset token)

CREATE OR REPLACE FUNCTION public.patient_reset_password(
  p_patient_id uuid,
  p_new_password text
) RETURNS void AS $$
BEGIN
  UPDATE public.patients
  SET
    password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
    password_reset_required = false,
    last_password_change = now()
  WHERE id = p_patient_id
    AND is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
