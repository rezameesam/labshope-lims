ALTER FUNCTION public.enforce_plan_limits() SET search_path = public;
ALTER FUNCTION public.set_default_organization_on_test_category() SET search_path = public;
ALTER FUNCTION public.sync_organization_from_test_category() SET search_path = public;
ALTER FUNCTION public.sync_organization_from_inventory_usage() SET search_path = public;
ALTER FUNCTION public.set_default_organization_on_custom_role() SET search_path = public;
ALTER FUNCTION public.sync_organization_on_test_package() SET search_path = public;
ALTER FUNCTION public.sync_organization_from_lab() SET search_path = public;
ALTER FUNCTION public.sync_organization_and_lab_from_center() SET search_path = public;
ALTER FUNCTION public.set_default_organization_on_lab() SET search_path = public;
ALTER FUNCTION public.set_patient_password_defaults() SET search_path = public;
ALTER FUNCTION public.sync_organization_from_doctor_referral() SET search_path = public;
ALTER FUNCTION public.sync_organization_from_inventory_item() SET search_path = public;

ALTER TABLE public.employee_login_challenges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all access to employee login challenges" ON public.employee_login_challenges;
CREATE POLICY "Deny all access to employee login challenges"
ON public.employee_login_challenges
AS RESTRICTIVE
FOR ALL
TO public
USING (false)
WITH CHECK (false);

ALTER TABLE public.patient_password_resets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all access to patient password resets" ON public.patient_password_resets;
CREATE POLICY "Deny all access to patient password resets"
ON public.patient_password_resets
AS RESTRICTIVE
FOR ALL
TO public
USING (false)
WITH CHECK (false);
