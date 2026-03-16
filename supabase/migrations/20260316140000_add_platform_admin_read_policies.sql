-- Platform admins need read access to all business tables so that
-- /platform/customers, /platform/customers/:id, and /platform/dashboard
-- can aggregate data across all tenants.
--
-- These are SELECT-only policies. Platform admins cannot mutate tenant data
-- through these policies — they can only read it for operational visibility.

-- Helper: check if the current user is a platform admin
-- (reuse the same pattern as other platform policies)

-- organizations
CREATE POLICY "Platform admins can view all organizations"
  ON public.organizations
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()));

-- organization_domains
CREATE POLICY "Platform admins can view all organization domains"
  ON public.organization_domains
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()));

-- organization_settings
CREATE POLICY "Platform admins can view all organization settings"
  ON public.organization_settings
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()));

-- labs
CREATE POLICY "Platform admins can view all labs"
  ON public.labs
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()));

-- employees
CREATE POLICY "Platform admins can view all employees"
  ON public.employees
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()));

-- patients (count only — no PHI surfaced in platform pages, just aggregate count)
CREATE POLICY "Platform admins can view all patients"
  ON public.patients
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()));

-- invoices (recent billing visibility per tenant)
CREATE POLICY "Platform admins can view all invoices"
  ON public.invoices
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()));

-- payments (aggregate totals per tenant)
CREATE POLICY "Platform admins can view all payments"
  ON public.payments
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()));
