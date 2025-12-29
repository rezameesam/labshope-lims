# Database Migration Prompt for Lovable

Copy and paste this entire prompt to Lovable's chat to run all database migrations:

---

**Please run the following SQL migrations in the Supabase database to add all the new features:**

```sql
-- ============================================
-- MIGRATION 1: Allow employees to manage tests and add test_id column
-- ============================================

-- Allow employees to manage tests (create, update, delete)
DROP POLICY IF EXISTS "Admins can manage tests" ON public.tests;

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

-- Add test_id field to tests table for human-readable test codes/IDs
ALTER TABLE public.tests
ADD COLUMN IF NOT EXISTS test_id TEXT UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tests_test_id ON public.tests(test_id);

-- ============================================
-- MIGRATION 2: Test Packages
-- ============================================

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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_test_package_tests_package_id ON public.test_package_tests(package_id);
CREATE INDEX IF NOT EXISTS idx_test_package_tests_test_id ON public.test_package_tests(test_id);

-- Create trigger for updated_at
CREATE TRIGGER update_test_packages_updated_at
BEFORE UPDATE ON public.test_packages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- MIGRATION 3: Doctors and Referrals
-- ============================================

-- Create doctors table for referral doctor management
CREATE TABLE IF NOT EXISTS public.doctors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  specialization TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  commission_percentage NUMERIC(5,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create doctor_referrals table to track patient referrals
CREATE TABLE IF NOT EXISTS public.doctor_referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  invoice_number TEXT,
  invoice_amount NUMERIC(10,2),
  commission_amount NUMERIC(10,2),
  commission_paid BOOLEAN DEFAULT false,
  referral_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_referrals ENABLE ROW LEVEL SECURITY;

-- RLS policies for doctors
CREATE POLICY "Staff can view doctors"
ON public.doctors FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
);

CREATE POLICY "Staff can manage doctors"
ON public.doctors FOR ALL
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
);

-- RLS policies for doctor_referrals
CREATE POLICY "Staff can view doctor referrals"
ON public.doctor_referrals FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
);

CREATE POLICY "Staff can manage doctor referrals"
ON public.doctor_referrals FOR ALL
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_doctor_referrals_doctor_id ON public.doctor_referrals(doctor_id);
CREATE INDEX IF NOT EXISTS idx_doctor_referrals_patient_id ON public.doctor_referrals(patient_id);
CREATE INDEX IF NOT EXISTS idx_doctor_referrals_invoice_id ON public.doctor_referrals(invoice_id);

-- Create triggers for updated_at
CREATE TRIGGER update_doctors_updated_at
BEFORE UPDATE ON public.doctors
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_doctor_referrals_updated_at
BEFORE UPDATE ON public.doctor_referrals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- MIGRATION 4: Test Templates
-- ============================================

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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_test_templates_test_category ON public.test_templates(test_category);
CREATE INDEX IF NOT EXISTS idx_test_templates_test_id ON public.test_templates(test_id);
CREATE INDEX IF NOT EXISTS idx_test_templates_is_default ON public.test_templates(is_default);

-- Create trigger for updated_at
CREATE TRIGGER update_test_templates_updated_at
BEFORE UPDATE ON public.test_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- MIGRATION 5: Patient Reminders
-- ============================================

-- Create patient_reminders table for managing patient reminders
CREATE TABLE IF NOT EXISTS public.patient_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL DEFAULT 'follow_up' CHECK (reminder_type IN ('follow_up', 'checkup', 'payment', 'test_result', 'custom')),
  title TEXT NOT NULL,
  message TEXT,
  reminder_date DATE NOT NULL,
  due_date DATE,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  notification_sent BOOLEAN DEFAULT false,
  notification_method TEXT DEFAULT 'both' CHECK (notification_method IN ('email', 'sms', 'both', 'none')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.patient_reminders ENABLE ROW LEVEL SECURITY;

-- RLS policies for patient_reminders
CREATE POLICY "Staff can view all reminders"
ON public.patient_reminders FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
);

CREATE POLICY "Patients can view their own reminders"
ON public.patient_reminders FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.patients p 
    WHERE p.id = patient_reminders.patient_id 
    AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Staff can manage reminders"
ON public.patient_reminders FOR ALL
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee')
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_patient_reminders_patient_id ON public.patient_reminders(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_reminders_reminder_date ON public.patient_reminders(reminder_date);
CREATE INDEX IF NOT EXISTS idx_patient_reminders_is_completed ON public.patient_reminders(is_completed);
CREATE INDEX IF NOT EXISTS idx_patient_reminders_reminder_type ON public.patient_reminders(reminder_type);

-- Create trigger for updated_at
CREATE TRIGGER update_patient_reminders_updated_at
BEFORE UPDATE ON public.patient_reminders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- MIGRATION 6: Multi-Lab Support
-- ============================================

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

-- Create triggers for updated_at
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
```

---

**Note:** This migration includes:
1. Test ID column and employee permissions for test management
2. Test Packages (bundled tests with discounts)
3. Doctors and Referrals management
4. Test Result Templates
5. Patient Reminders
6. Multi-Lab and Multi-Location Support

All migrations use `IF NOT EXISTS` and `IF EXISTS` clauses to be safe for re-running.

---

## Additional Migration: Collector Role

**Run this separately after the above migrations:**

```sql
-- Add collector role to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'collector';

-- Add collected_by field to patient_tests table to track who collected the sample
ALTER TABLE public.patient_tests
ADD COLUMN IF NOT EXISTS collected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS collected_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_patient_tests_collected_by ON public.patient_tests(collected_by);

-- Update RLS policies to allow collectors to view and manage patient tests
CREATE POLICY IF NOT EXISTS "Collectors can view patient tests"
ON public.patient_tests FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee') OR
  public.has_role(auth.uid(), 'collector')
);

CREATE POLICY IF NOT EXISTS "Collectors can create patient tests"
ON public.patient_tests FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee') OR
  public.has_role(auth.uid(), 'collector')
);

CREATE POLICY IF NOT EXISTS "Collectors can update their collections"
ON public.patient_tests FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee') OR
  (public.has_role(auth.uid(), 'collector') AND collected_by = auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee') OR
  (public.has_role(auth.uid(), 'collector') AND collected_by = auth.uid())
);

-- Collectors can view patients (to register new patients and view existing ones)
CREATE POLICY IF NOT EXISTS "Collectors can view patients"
ON public.patients FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee') OR
  public.has_role(auth.uid(), 'collector')
);

CREATE POLICY IF NOT EXISTS "Collectors can create patients"
ON public.patients FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee') OR
  public.has_role(auth.uid(), 'collector')
);

-- Collectors can view test catalog (to select tests)
CREATE POLICY IF NOT EXISTS "Collectors can view tests"
ON public.tests FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee') OR
  public.has_role(auth.uid(), 'collector')
);

CREATE POLICY IF NOT EXISTS "Collectors can view test categories"
ON public.test_categories FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee') OR
  public.has_role(auth.uid(), 'collector')
);

CREATE POLICY IF NOT EXISTS "Collectors can view their own employee record"
ON public.employees FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'employee') OR
  (public.has_role(auth.uid(), 'collector') AND user_id = auth.uid())
);
```

This adds:
- **Collector Role**: New role for sample collection staff
- **Sample Collection Tracking**: `collected_by` and `collected_at` fields in `patient_tests`
- **Collector Permissions**: RLS policies for collectors to register patients and create tests

---

## Additional Migration: Custom Roles & Permissions System

**Run this separately after the above migrations:**

```sql
-- Custom Roles and Permissions System
-- This allows creating custom roles with granular permissions

-- Create permissions enum (list of all available permissions)
CREATE TYPE public.permission_type AS ENUM (
  -- Patient Management
  'view_patients', 'create_patients', 'edit_patients', 'delete_patients',
  -- Test Management
  'view_tests', 'create_tests', 'edit_tests', 'delete_tests', 'enter_test_results', 'view_test_results',
  -- Billing & Finance
  'view_billing', 'create_invoices', 'edit_invoices', 'delete_invoices', 'process_payments', 'view_financial_reports',
  -- Inventory Management
  'view_inventory', 'manage_inventory', 'view_inventory_alerts',
  -- Employee Management
  'view_employees', 'create_employees', 'edit_employees', 'delete_employees', 'manage_roles',
  -- Test Catalog
  'view_test_catalog', 'manage_test_catalog',
  -- Test Packages
  'view_test_packages', 'manage_test_packages',
  -- Doctors
  'view_doctors', 'manage_doctors',
  -- Reminders
  'view_reminders', 'manage_reminders',
  -- Reports & Analytics
  'view_reports', 'export_reports',
  -- Labs & Collection Centers
  'view_labs', 'manage_labs', 'view_collection_centers', 'manage_collection_centers',
  -- System
  'manage_settings', 'view_audit_logs'
);

-- Create custom_roles table
CREATE TABLE IF NOT EXISTS public.custom_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  is_system_role BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create role_permissions junction table
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role_id UUID NOT NULL REFERENCES public.custom_roles(id) ON DELETE CASCADE,
  permission permission_type NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(role_id, permission)
);

-- Create user_custom_roles table (users can have multiple custom roles)
CREATE TABLE IF NOT EXISTS public.user_custom_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.custom_roles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, role_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON public.role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON public.role_permissions(permission);
CREATE INDEX IF NOT EXISTS idx_user_custom_roles_user_id ON public.user_custom_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_custom_roles_role_id ON public.user_custom_roles(role_id);

-- Enable RLS
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_custom_roles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for custom_roles
CREATE POLICY "Admins can view all custom roles"
ON public.custom_roles FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage custom roles"
ON public.custom_roles FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for role_permissions
CREATE POLICY "Admins can view role permissions"
ON public.role_permissions FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage role permissions"
ON public.role_permissions FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_custom_roles
CREATE POLICY "Admins can view user custom roles"
ON public.user_custom_roles FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage user custom roles"
ON public.user_custom_roles FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Function to check if user has a specific permission
CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission permission_type)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Admins have all permissions
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
    AND role = 'admin'
  )
  OR EXISTS (
    -- Check if user has a custom role with this permission
    SELECT 1 FROM public.user_custom_roles ucr
    INNER JOIN public.role_permissions rp ON rp.role_id = ucr.role_id
    WHERE ucr.user_id = _user_id
    AND rp.permission = _permission
    AND EXISTS (
      SELECT 1 FROM public.custom_roles cr
      WHERE cr.id = ucr.role_id
      AND cr.is_active = true
    )
  );
$$;

-- Function to get all permissions for a user
CREATE OR REPLACE FUNCTION public.get_user_permissions(_user_id UUID)
RETURNS TABLE(permission permission_type)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- If admin, return all permissions
  SELECT permission::permission_type
  FROM unnest(enum_range(NULL::permission_type)) AS permission
  WHERE EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
    AND role = 'admin'
  )
  UNION
  -- Otherwise, return permissions from custom roles
  SELECT DISTINCT rp.permission
  FROM public.user_custom_roles ucr
  INNER JOIN public.role_permissions rp ON rp.role_id = ucr.role_id
  INNER JOIN public.custom_roles cr ON cr.id = ucr.role_id
  WHERE ucr.user_id = _user_id
  AND cr.is_active = true;
$$;

-- Create trigger for updated_at
CREATE TRIGGER update_custom_roles_updated_at
BEFORE UPDATE ON public.custom_roles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

This adds:
- **Custom Roles System**: Create custom roles with specific names and descriptions
- **Granular Permissions**: 40+ permissions organized into 12 categories
- **Permission Management**: Assign specific permissions to each role
- **User Role Assignment**: Assign multiple custom roles to users
- **Permission Checking Functions**: `has_permission()` and `get_user_permissions()` functions
- **Admin-Only Access**: Only admins can manage roles and permissions

