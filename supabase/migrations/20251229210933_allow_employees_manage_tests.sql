-- Allow employees to manage tests (create, update, delete)
-- Drop the existing admin-only policy
DROP POLICY IF EXISTS "Admins can manage tests" ON public.tests;

-- Create new policy that allows both admins and employees to manage tests
CREATE POLICY "Staff can manage tests"
ON public.tests FOR ALL
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
);

-- Also allow employees to manage test categories
DROP POLICY IF EXISTS "Admins can manage test categories" ON public.test_categories;

CREATE POLICY "Staff can manage test categories"
ON public.test_categories FOR ALL
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
);

