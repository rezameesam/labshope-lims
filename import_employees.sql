-- Import employees with linked auth users
-- Run this AFTER creating auth users

INSERT INTO public.employees (
  user_id,
  employee_id,
  full_name,
  email,
  phone,
  designation,
  department,
  is_active,
  lab_id
) VALUES (
  'dbbf96f6-8855-42fb-83b7-9f011402df05',
  'ADM2415',
  'IRM Administrator',
  'admin@irmclinic.com',
  NULL,
  'Administrator',
  'Administration',
  true,
  NULL
) ON CONFLICT (employee_id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  designation = EXCLUDED.designation,
  department = EXCLUDED.department,
  is_active = EXCLUDED.is_active,
  lab_id = EXCLUDED.lab_id;

INSERT INTO public.employees (
  user_id,
  employee_id,
  full_name,
  email,
  phone,
  designation,
  department,
  is_active,
  lab_id
) VALUES (
  'b054cf36-9acc-4628-94e8-790888f035e4',
  'EMP8248',
  'Syed Hamid',
  'windcirculation@gmail.com',
  NULL,
  NULL,
  NULL,
  true,
  NULL
) ON CONFLICT (employee_id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  designation = EXCLUDED.designation,
  department = EXCLUDED.department,
  is_active = EXCLUDED.is_active,
  lab_id = EXCLUDED.lab_id;

INSERT INTO public.employees (
  user_id,
  employee_id,
  full_name,
  email,
  phone,
  designation,
  department,
  is_active,
  lab_id
) VALUES (
  'f93ae9cc-89f5-4e6d-a90d-90134460a0e2',
  'EMP3304',
  'Collector Guy 2',
  'cg2@irmclinic.com',
  NULL,
  NULL,
  NULL,
  true,
  NULL
) ON CONFLICT (employee_id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  designation = EXCLUDED.designation,
  department = EXCLUDED.department,
  is_active = EXCLUDED.is_active,
  lab_id = EXCLUDED.lab_id;

