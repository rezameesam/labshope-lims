ALTER TABLE public.otp_codes
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_otp_codes_organization_id
  ON public.otp_codes(organization_id);

CREATE INDEX IF NOT EXISTS idx_otp_codes_phone_org
  ON public.otp_codes(phone, organization_id);

UPDATE public.otp_codes oc
SET organization_id = p.organization_id
FROM public.patients p
WHERE oc.organization_id IS NULL
  AND p.is_active = true
  AND (
    p.phone = oc.phone
    OR regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = regexp_replace(coalesce(oc.phone, ''), '\D', '', 'g')
  );
