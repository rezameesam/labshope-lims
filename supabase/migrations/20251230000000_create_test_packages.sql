-- Create test_packages table for bundled test packages
CREATE TABLE IF NOT EXISTS public.test_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_percentage NUMERIC(5,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create test_package_tests junction table
CREATE TABLE IF NOT EXISTS public.test_package_tests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id UUID NOT NULL REFERENCES public.test_packages(id) ON DELETE CASCADE,
  test_id UUID NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(package_id, test_id)
);

-- Enable RLS
ALTER TABLE public.test_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_package_tests ENABLE ROW LEVEL SECURITY;

-- RLS policies for test_packages
CREATE POLICY "Staff can view test packages"
ON public.test_packages FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
);

CREATE POLICY "Staff can manage test packages"
ON public.test_packages FOR ALL
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
);

-- RLS policies for test_package_tests
CREATE POLICY "Staff can view test package tests"
ON public.test_package_tests FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
);

CREATE POLICY "Staff can manage test package tests"
ON public.test_package_tests FOR ALL
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_test_package_tests_package_id ON public.test_package_tests(package_id);
CREATE INDEX IF NOT EXISTS idx_test_package_tests_test_id ON public.test_package_tests(test_id);

-- Create trigger for updated_at
CREATE TRIGGER update_test_packages_updated_at
BEFORE UPDATE ON public.test_packages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

