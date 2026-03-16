-- Make patient login tolerant to phone numbers stored with/without country code.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'patients'
      AND column_name = 'password_reset_required'
  ) THEN
    EXECUTE $sql$
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
      ) AS $fn$
        WITH normalized_input AS (
          SELECT
            btrim(coalesce(p_identifier, '')) AS raw_identifier,
            regexp_replace(coalesce(p_identifier, ''), '\D', '', 'g') AS identifier_digits,
            btrim(coalesce(p_identifier, '')) ~ '^[+()0-9\s-]+$' AS is_phone_input
        )
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
        CROSS JOIN normalized_input i
        WHERE p.is_active = true
          AND (
            p.username = i.raw_identifier OR
            p.email = i.raw_identifier OR
            p.patient_id = i.raw_identifier OR
            (
              i.is_phone_input
              AND (
                p.phone = i.raw_identifier OR
                (
                  i.identifier_digits <> ''
                  AND regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = i.identifier_digits
                ) OR
                (
                  length(i.identifier_digits) >= 8
                  AND right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 10) = right(i.identifier_digits, 10)
                )
              )
            )
          )
          AND p.password_hash = extensions.crypt(p_password, p.password_hash)
        LIMIT 1;
      $fn$ LANGUAGE sql SECURITY DEFINER SET search_path = public;
    $sql$;
  END IF;
END
$$;
