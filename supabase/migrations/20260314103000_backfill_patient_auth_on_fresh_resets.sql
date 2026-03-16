-- Fresh local resets replay migrations from scratch. The original patient auth
-- migrations were timestamped before the core patients table existed, so they
-- can no-op on a blank database. This migration reapplies the final patient
-- auth schema after the core tables are guaranteed to exist.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS username text UNIQUE,
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS password_reset_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_password_change timestamp with time zone;

CREATE OR REPLACE FUNCTION public.set_patient_password_defaults()
RETURNS trigger AS $$
BEGIN
  IF NEW.password_hash IS NULL THEN
    NEW.password_hash := extensions.crypt(NEW.patient_id, extensions.gen_salt('bf'));
  END IF;

  IF NEW.password_reset_required IS NULL THEN
    NEW.password_reset_required := true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_patient_password_defaults ON public.patients;
CREATE TRIGGER set_patient_password_defaults
BEFORE INSERT ON public.patients
FOR EACH ROW
EXECUTE FUNCTION public.set_patient_password_defaults();

UPDATE public.patients
SET password_hash = extensions.crypt(patient_id, extensions.gen_salt('bf')),
    password_reset_required = true
WHERE password_hash IS NULL;

CREATE TABLE IF NOT EXISTS public.patient_password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_password_resets_patient_id
  ON public.patient_password_resets(patient_id);

CREATE INDEX IF NOT EXISTS idx_patient_password_resets_token_hash
  ON public.patient_password_resets(token_hash);

CREATE INDEX IF NOT EXISTS idx_patient_password_resets_expires_at
  ON public.patient_password_resets(expires_at);

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
