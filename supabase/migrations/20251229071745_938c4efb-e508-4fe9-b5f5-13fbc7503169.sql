-- Create quotations table
CREATE TABLE public.quotations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_number TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_email TEXT,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC DEFAULT 0,
  final_amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  valid_until DATE,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create quotation items table
CREATE TABLE public.quotation_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  test_name TEXT NOT NULL,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for quotations
CREATE POLICY "Staff can manage quotations"
  ON public.quotations
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Anyone can view quotations by number"
  ON public.quotations
  FOR SELECT
  USING (true);

-- RLS Policies for quotation items
CREATE POLICY "Staff can manage quotation items"
  ON public.quotation_items
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Anyone can view quotation items"
  ON public.quotation_items
  FOR SELECT
  USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_quotations_updated_at
  BEFORE UPDATE ON public.quotations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();