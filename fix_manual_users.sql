-- Fix Login Issue for Manually Created Users
-- Run this in Supabase SQL Editor after creating users manually

-- Step 1: Replace 'USER_ID_HERE' with the actual User ID from Authentication → Users
-- Step 2: Choose the appropriate role (admin, employee, or collector)
-- Step 3: Run this SQL

-- Example: Add admin role to a user
INSERT INTO public.user_roles (user_id, role)
VALUES ('USER_ID_HERE', 'admin'::app_role)
ON CONFLICT (user_id, role) DO NOTHING;

-- If you have multiple users, add them all:
-- INSERT INTO public.user_roles (user_id, role) VALUES
--   ('user-id-1', 'admin'::app_role),
--   ('user-id-2', 'employee'::app_role),
--   ('user-id-3', 'collector'::app_role)
-- ON CONFLICT (user_id, role) DO NOTHING;

-- Also create employee record if needed (for admin/employee users):
-- INSERT INTO public.employees (
--   user_id,
--   employee_id,
--   full_name,
--   email,
--   is_active
-- )
-- VALUES (
--   'USER_ID_HERE',
--   'ADM' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'),
--   'User Full Name',
--   'user@example.com',
--   true
-- )
-- ON CONFLICT (user_id) DO UPDATE SET is_active = true;

