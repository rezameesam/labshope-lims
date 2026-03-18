# Create First Admin Account

If you don't have user data to import, or need to create a new admin account, use one of these methods:

## Method 1: Using Edge Function (Easiest)

1. Go to Supabase Dashboard → **Edge Functions** → **create-first-admin**
2. Click **Invoke function**
3. Use this payload:

```json
{
  "email": "admin@irmclinic.com",
  "password": "YourSecurePassword123!",
  "full_name": "Admin User"
}
```

4. Click **Invoke**
5. You should get a success message
6. Try logging in with those credentials

## Method 2: Using SQL Editor

### Step 1: Create Auth User

1. Go to Supabase Dashboard → **Authentication** → **Users**
2. Click **Add user** → **Create new user**
3. Enter:
   - **Email**: `admin@irmclinic.com`
   - **Password**: `YourSecurePassword123!`
   - **Auto Confirm User**: ✅ (checked)
4. Click **Create user**
5. **Copy the User ID** (you'll need it)

### Step 2: Create Employee Record

1. Go to **SQL Editor**
2. Run this SQL (replace `USER_ID_HERE` with the ID from step 1):

```sql
-- Insert employee record
INSERT INTO public.employees (
  user_id,
  full_name,
  email,
  phone,
  is_active,
  created_at
)
VALUES (
  'USER_ID_HERE',  -- Replace with actual user ID
  'Admin User',
  'admin@irmclinic.com',
  NULL,
  true,
  now()
);
```

### Step 3: Assign Admin Role

```sql
-- Assign admin role
INSERT INTO public.user_roles (user_id, role)
VALUES (
  'USER_ID_HERE',  -- Replace with actual user ID
  'admin'::app_role
);
```

## Method 3: Using the App (If You Can Access It)

1. If you can access the employee auth page
2. Try to sign up/create account
3. Then assign admin role via SQL or dashboard

---

## Verify Admin Account

After creating the admin:

1. Go to your app
2. Navigate to staff login page
3. Log in with:
   - Email: `admin@irmclinic.com`
   - Password: `YourSecurePassword123!`
4. You should have full admin access

---

## If You Have Existing Employees Data

If you exported `employees` table from the previous platform:

1. Import the CSV to Supabase
2. For each employee, you need to:
   - Create corresponding auth user in Supabase
   - Link `employees.user_id` to `auth.users.id`
   - Assign roles in `user_roles` table

**Note**: Passwords cannot be migrated, so users will need to reset passwords.


