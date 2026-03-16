-- Add patient password-based login support

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'patients'
  ) THEN
    ALTER TABLE public.patients
      ADD COLUMN IF NOT EXISTS username text UNIQUE,
      ADD COLUMN IF NOT EXISTS password_hash text,
      ADD COLUMN IF NOT EXISTS password_reset_required boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS last_password_change timestamp with time zone;

    CREATE OR REPLACE FUNCTION public.set_patient_password_defaults()
    RETURNS trigger AS $fn$
    BEGIN
      IF NEW.password_hash IS NULL THEN
        NEW.password_hash := extensions.crypt(NEW.patient_id, extensions.gen_salt('bf'));
      END IF;

      IF NEW.password_reset_required IS NULL THEN
        NEW.password_reset_required := true;
      END IF;

      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS set_patient_password_defaults ON public.patients;
    CREATE TRIGGER set_patient_password_defaults
    BEFORE INSERT ON public.patients
    FOR EACH ROW
    EXECUTE FUNCTION public.set_patient_password_defaults();

    UPDATE public.patients
    SET password_hash = extensions.crypt(patient_id, extensions.gen_salt('bf')),
        password_reset_required = true
    WHERE password_hash IS NULL;
  END IF;
END
$$;
