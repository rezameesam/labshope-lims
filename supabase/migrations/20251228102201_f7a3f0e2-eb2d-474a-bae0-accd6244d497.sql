-- Create inventory categories table
CREATE TABLE public.inventory_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'supply' CHECK (type IN ('supply', 'equipment')),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create inventory items table
CREATE TABLE public.inventory_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID REFERENCES public.inventory_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'supply' CHECK (type IN ('supply', 'equipment')),
  sku TEXT,
  unit TEXT DEFAULT 'pcs',
  current_stock NUMERIC DEFAULT 0,
  min_stock_level NUMERIC DEFAULT 0,
  unit_price NUMERIC DEFAULT 0,
  supplier TEXT,
  location TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create inventory purchases table (for tracking purchases from vendors)
CREATE TABLE public.inventory_purchases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL,
  unit_cost NUMERIC NOT NULL,
  total_cost NUMERIC NOT NULL,
  supplier TEXT,
  invoice_number TEXT,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  purchased_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create inventory usage table (for tracking consumption per test/patient)
CREATE TABLE public.inventory_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  patient_test_id UUID REFERENCES public.patient_tests(id) ON DELETE SET NULL,
  quantity NUMERIC NOT NULL,
  unit_cost NUMERIC,
  total_cost NUMERIC,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  recorded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create equipment maintenance table
CREATE TABLE public.equipment_maintenance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  maintenance_type TEXT NOT NULL,
  scheduled_date DATE,
  completed_date DATE,
  cost NUMERIC,
  vendor TEXT,
  notes TEXT,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  performed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_maintenance ENABLE ROW LEVEL SECURITY;

-- RLS policies for inventory_categories
CREATE POLICY "Anyone can view inventory categories"
ON public.inventory_categories FOR SELECT USING (true);

CREATE POLICY "Staff can manage inventory categories"
ON public.inventory_categories FOR ALL
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'employee'));

-- RLS policies for inventory_items
CREATE POLICY "Staff can view inventory items"
ON public.inventory_items FOR SELECT
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'employee'));

CREATE POLICY "Staff can manage inventory items"
ON public.inventory_items FOR ALL
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'employee'));

-- RLS policies for inventory_purchases
CREATE POLICY "Staff can view inventory purchases"
ON public.inventory_purchases FOR SELECT
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'employee'));

CREATE POLICY "Staff can manage inventory purchases"
ON public.inventory_purchases FOR ALL
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'employee'));

-- RLS policies for inventory_usage
CREATE POLICY "Staff can view inventory usage"
ON public.inventory_usage FOR SELECT
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'employee'));

CREATE POLICY "Staff can manage inventory usage"
ON public.inventory_usage FOR ALL
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'employee'));

-- RLS policies for equipment_maintenance
CREATE POLICY "Staff can view equipment maintenance"
ON public.equipment_maintenance FOR SELECT
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'employee'));

CREATE POLICY "Staff can manage equipment maintenance"
ON public.equipment_maintenance FOR ALL
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'employee'));

-- Add trigger for updated_at on inventory_items
CREATE TRIGGER update_inventory_items_updated_at
BEFORE UPDATE ON public.inventory_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();