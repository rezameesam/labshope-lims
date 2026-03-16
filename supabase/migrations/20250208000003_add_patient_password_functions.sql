-- Password helpers for patient login and reset

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'patients'
  ) THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.patient_login(identifier text, password text)
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
      ) AS $fn$
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
            p.username = identifier OR
            p.email = identifier OR
            p.phone = identifier OR
            p.patient_id = identifier
          )
          AND p.password_hash = extensions.crypt(password, p.password_hash)
        LIMIT 1;
      $fn$ LANGUAGE sql SECURITY DEFINER SET search_path = public;
    $sql$;

    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.patient_set_password(
        patient_id uuid,
        current_password text,
        new_password text
      ) RETURNS boolean AS $fn$
      BEGIN
        UPDATE public.patients
        SET
          password_hash = extensions.crypt(new_password, extensions.gen_salt('bf')),
          password_reset_required = false,
          last_password_change = now()
        WHERE id = patient_id
          AND is_active = true
          AND password_hash = extensions.crypt(current_password, password_hash);

        RETURN FOUND;
      END;
      $fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
    $sql$;
  END IF;
END
$$;
