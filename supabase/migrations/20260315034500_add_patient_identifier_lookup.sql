CREATE OR REPLACE FUNCTION public.find_patient_candidates(
  p_identifier text,
  p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  patient_id text,
  full_name text,
  email text,
  phone text,
  organization_id uuid,
  is_active boolean
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
    p.email,
    p.phone,
    p.organization_id,
    p.is_active
  FROM public.patients p
  CROSS JOIN normalized_input i
  WHERE p.is_active = true
    AND (p_organization_id IS NULL OR p.organization_id = p_organization_id)
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
  ORDER BY p.created_at DESC;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;
