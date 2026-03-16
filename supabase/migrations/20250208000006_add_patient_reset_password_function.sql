-- Helper to reset password without current password (via reset token)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'patients'
  ) THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.patient_reset_password(
        p_patient_id uuid,
        p_new_password text
      ) RETURNS void AS $fn$
      BEGIN
        UPDATE public.patients
        SET
          password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
          password_reset_required = false,
          last_password_change = now()
        WHERE id = p_patient_id
          AND is_active = true;
      END;
      $fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
    $sql$;
  END IF;
END
$$;
