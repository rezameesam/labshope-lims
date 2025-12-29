-- Multi-Lab and Multi-Location Support Migration
-- This migration adds support for multiple labs, branches, and collection centers

-- Create labs table
CREATE TABLE IF NOT EXISTS public.labs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lab_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'main' CHECK (type IN ('main', 'branch', 'collection_center')),
  parent_lab_id UUID REFERENCES public.labs(id) ON DELETE SET NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create collection_centers table
CREATE TABLE IF NOT EXISTS public.collection_centers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lab_id UUID NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(lab_id, code)
);

-- Create lab_users table for user-lab associations
CREATE TABLE IF NOT EXISTS public.lab_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lab_id UUID NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'employee')),
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, lab_id)
);

-- Create lab_settings table for lab-specific configurations
CREATE TABLE IF NOT EXISTS public.lab_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lab_id UUID NOT NULL UNIQUE REFERENCES public.labs(id) ON DELETE CASCADE,
  test_catalog_shared BOOLEAN DEFAULT true,
  inventory_shared BOOLEAN DEFAULT false,
  patient_shared BOOLEAN DEFAULT true,
  doctor_shared BOOLEAN DEFAULT false,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add lab_id to existing tables (nullable initially for backward compatibility)
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES public.labs(id) ON DELETE SET NULL;
ALTER TABLE public.patient_tests ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES public.labs(id) ON DELETE SET NULL;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES public.labs(id) ON DELETE SET NULL;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES public.labs(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES public.labs(id) ON DELETE SET NULL;
ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES public.labs(id) ON DELETE SET NULL;
ALTER TABLE public.test_packages ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES public.labs(id) ON DELETE SET NULL;
ALTER TABLE public.patient_reminders ADD COLUMN IF NOT EXISTS lab_id UUID REFERENCES public.labs(id) ON DELETE SET NULL;

-- Add collection_center_id to relevant tables
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS collection_center_id UUID REFERENCES public.collection_centers(id) ON DELETE SET NULL;
ALTER TABLE public.patient_tests ADD COLUMN IF NOT EXISTS collection_center_id UUID REFERENCES public.collection_centers(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_patients_lab_id ON public.patients(lab_id);
CREATE INDEX IF NOT EXISTS idx_patient_tests_lab_id ON public.patient_tests(lab_id);
CREATE INDEX IF NOT EXISTS idx_invoices_lab_id ON public.invoices(lab_id);
CREATE INDEX IF NOT EXISTS idx_employees_lab_id ON public.employees(lab_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_lab_id ON public.inventory_items(lab_id);
CREATE INDEX IF NOT EXISTS idx_doctors_lab_id ON public.doctors(lab_id);
CREATE INDEX IF NOT EXISTS idx_test_packages_lab_id ON public.test_packages(lab_id);
CREATE INDEX IF NOT EXISTS idx_patient_reminders_lab_id ON public.patient_reminders(lab_id);
CREATE INDEX IF NOT EXISTS idx_patients_collection_center_id ON public.patients(collection_center_id);
CREATE INDEX IF NOT EXISTS idx_patient_tests_collection_center_id ON public.patient_tests(collection_center_id);
CREATE INDEX IF NOT EXISTS idx_lab_users_user_id ON public.lab_users(user_id);
CREATE INDEX IF NOT EXISTS idx_lab_users_lab_id ON public.lab_users(lab_id);
CREATE INDEX IF NOT EXISTS idx_collection_centers_lab_id ON public.collection_centers(lab_id);

-- Enable RLS
ALTER TABLE public.labs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for labs
CREATE POLICY "Anyone can view active labs"
ON public.labs FOR SELECT
USING (is_active = true);

CREATE POLICY "Staff can manage labs"
ON public.labs FOR ALL
USING (
  public.has_role(auth.uid(), 'admin') OR
  EXISTS (
    SELECT 1 FROM public.lab_users lu
    WHERE lu.user_id = auth.uid()
    AND lu.lab_id = labs.id
    AND lu.role IN ('admin', 'manager')
  )
);

-- RLS Policies for collection_centers
CREATE POLICY "Staff can view collection centers"
ON public.collection_centers FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR
  EXISTS (
    SELECT 1 FROM public.lab_users lu
    WHERE lu.user_id = auth.uid()
    AND lu.lab_id = collection_centers.lab_id
  )
);

CREATE POLICY "Staff can manage collection centers"
ON public.collection_centers FOR ALL
USING (
  public.has_role(auth.uid(), 'admin') OR
  EXISTS (
    SELECT 1 FROM public.lab_users lu
    WHERE lu.user_id = auth.uid()
    AND lu.lab_id = collection_centers.lab_id
    AND lu.role IN ('admin', 'manager')
  )
);

-- RLS Policies for lab_users
CREATE POLICY "Users can view their own lab associations"
ON public.lab_users FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all lab users"
ON public.lab_users FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage lab users"
ON public.lab_users FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for lab_settings
CREATE POLICY "Staff can view lab settings"
ON public.lab_settings FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR
  EXISTS (
    SELECT 1 FROM public.lab_users lu
    WHERE lu.user_id = auth.uid()
    AND lu.lab_id = lab_settings.lab_id
  )
);

CREATE POLICY "Admins and managers can manage lab settings"
ON public.lab_settings FOR ALL
USING (
  public.has_role(auth.uid(), 'admin') OR
  EXISTS (
    SELECT 1 FROM public.lab_users lu
    WHERE lu.user_id = auth.uid()
    AND lu.lab_id = lab_settings.lab_id
    AND lu.role IN ('admin', 'manager')
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_labs_updated_at
BEFORE UPDATE ON public.labs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_collection_centers_updated_at
BEFORE UPDATE ON public.collection_centers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_lab_settings_updated_at
BEFORE UPDATE ON public.lab_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create default lab for existing data
INSERT INTO public.labs (lab_code, name, type, is_active)
VALUES ('LAB001', 'Main Laboratory', 'main', true)
ON CONFLICT (lab_code) DO NOTHING;

-- Function to get user's current lab (for RLS policies)
CREATE OR REPLACE FUNCTION public.get_user_lab_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lab_id FROM public.lab_users
  WHERE user_id = _user_id
  AND is_primary = true
  LIMIT 1;
$$;

-- Function to check if user has access to lab
CREATE OR REPLACE FUNCTION public.user_has_lab_access(_user_id UUID, _lab_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lab_users
    WHERE user_id = _user_id
    AND lab_id = _lab_id
  ) OR public.has_role(_user_id, 'admin');
$$;

