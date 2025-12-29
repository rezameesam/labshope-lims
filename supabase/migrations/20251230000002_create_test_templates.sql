-- Create test_templates table for customizable test result report templates
CREATE TABLE IF NOT EXISTS public.test_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  test_category TEXT,
  test_id UUID REFERENCES public.tests(id) ON DELETE SET NULL,
  header_template TEXT,
  footer_template TEXT,
  result_format TEXT NOT NULL DEFAULT 'table' CHECK (result_format IN ('table', 'list', 'custom')),
  include_normal_range BOOLEAN DEFAULT true,
  include_abnormal_flag BOOLEAN DEFAULT true,
  include_notes BOOLEAN DEFAULT true,
  custom_css TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.test_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies for test_templates
CREATE POLICY "Staff can view test templates"
ON public.test_templates FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
);

CREATE POLICY "Staff can manage test templates"
ON public.test_templates FOR ALL
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_test_templates_test_category ON public.test_templates(test_category);
CREATE INDEX IF NOT EXISTS idx_test_templates_test_id ON public.test_templates(test_id);
CREATE INDEX IF NOT EXISTS idx_test_templates_is_default ON public.test_templates(is_default);

-- Create trigger for updated_at
CREATE TRIGGER update_test_templates_updated_at
BEFORE UPDATE ON public.test_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

