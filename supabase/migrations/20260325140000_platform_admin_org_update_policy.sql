-- Platform admins need UPDATE access on organizations to manage
-- status, trial_ends_at, plan_expires_at, payment_notes, is_complimentary etc.
-- from PlatformCustomerDetail. Currently these writes succeed only because
-- the seeded platform admin also holds app_role='admin' — this explicit policy
-- makes the permission intentional and independent of that coincidence.

DROP POLICY IF EXISTS "Platform admins can update organizations" ON public.organizations;
CREATE POLICY "Platform admins can update organizations"
  ON public.organizations
  FOR UPDATE
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
