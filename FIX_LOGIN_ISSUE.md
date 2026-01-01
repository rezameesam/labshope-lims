# Fix Login Issue

## The Problem

When you create a user manually in Supabase, they can sign in but can't access the admin panel because:
- The app checks the `user_roles` table to determine permissions
- Manually created users don't have entries in `user_roles`

## The Solution

Add entries to the `user_roles` table for each manually created user.

### Step 1: Get the User ID

1. Go to Supabase Dashboard → Authentication → Users
2. Find your user
3. Copy the **User ID** (UUID)

### Step 2: Add Role in SQL Editor

1. Go to Supabase Dashboard → SQL Editor
2. Run this SQL (replace `USER_ID_HERE` with the actual User ID):

```sql
-- For Admin User
INSERT INTO public.user_roles (user_id, role)
VALUES ('USER_ID_HERE', 'admin'::app_role)
ON CONFLICT (user_id, role) DO NOTHING;

-- For Employee User (if needed)
INSERT INTO public.user_roles (user_id, role)
VALUES ('USER_ID_HERE', 'employee'::app_role)
ON CONFLICT (user_id, role) DO NOTHING;
```

### Step 3: Also Create Employee Record (if needed)

If the user should be an employee:

```sql
-- Create employee record
INSERT INTO public.employees (
  user_id,
  employee_id,
  full_name,
  email,
  is_active
)
VALUES (
  'USER_ID_HERE',
  'EMP' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'),  -- Generates EMP1234
  'User Full Name',
  'user@example.com',
  true
)
ON CONFLICT (user_id) DO UPDATE SET
  is_active = true;
```

### Quick Fix for All Users

If you have multiple users, you can do them all at once:

```sql
-- Replace with your actual user IDs
INSERT INTO public.user_roles (user_id, role) VALUES
  ('user-id-1', 'admin'::app_role),
  ('user-id-2', 'employee'::app_role),
  ('user-id-3', 'employee'::app_role)
ON CONFLICT (user_id, role) DO NOTHING;
```

## After Adding Roles

1. Sign out of the app
2. Sign in again
3. You should now have access to the admin panel!

