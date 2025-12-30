-- Custom Roles and Permissions System
-- This allows creating custom roles with granular permissions

-- Create permissions enum (list of all available permissions)
CREATE TYPE public.permission_type AS ENUM (
  -- Patient Management
  'view_patients',
  'create_patients',
  'edit_patients',
  'delete_patients',
  
  -- Test Management
  'view_tests',
  'create_tests',
  'edit_tests',
  'delete_tests',
  'enter_test_results',
  'view_test_results',
  
  -- Billing Management
  'view_billing',
  'create_invoices',
  'edit_invoices',
  'delete_invoices',
  'process_payments',
  'view_financial_reports',
  
  -- Inventory Management
  'view_inventory',
  'manage_inventory',
  'view_inventory_alerts',
  
  -- Employee Management
  'view_employees',
  'create_employees',
  'edit_employees',
  'delete_employees',
  'manage_roles',
  
  -- Test Catalog
  'view_test_catalog',
  'manage_test_catalog',
  
  -- Test Packages
  'view_test_packages',
  'manage_test_packages',
  
  -- Doctors
  'view_doctors',
  'manage_doctors',
  
  -- Reminders
  'view_reminders',
  'manage_reminders',
  
  -- Reports & Analytics
  'view_reports',
  'export_reports',
  
  -- Labs & Collection Centers
  'view_labs',
  'manage_labs',
  'view_collection_centers',
  'manage_collection_centers',
  
  -- Settings
  'manage_settings',
  'view_audit_logs'
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
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
    AND role = 'admin'
  )
  OR EXISTS (
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
  SELECT permission::permission_type
  FROM unnest(enum_range(NULL::permission_type)) AS permission
  WHERE EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
    AND role = 'admin'
  )
  UNION
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