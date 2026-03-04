# Quick Start - Create Your First Admin Account

## Option 1: Use Edge Function (Fastest - Recommended)

### Step 1: Deploy the Function (if not already deployed)

```bash
supabase functions deploy create-first-admin
```

### Step 2: Invoke the Function

1. Go to Supabase Dashboard: https://supabase.com/dashboard/project/pxsutovdzppoyyfrbeaw
2. Navigate to **Edge Functions** → **create-first-admin**
3. Click **Invoke function**
4. Use this payload:

```json
{
  "email": "admin@irmclinic.com",
  "password": "YourSecurePassword123!",
  "full_name": "Admin User"
}
```

5. Click **Invoke**
6. You should see: `{"success": true, "message": "Admin account created successfully"}`

### Step 3: Log In

1. Go to your app
2. Navigate to staff login page
3. Log in with:
   - **Email**: `admin@irmclinic.com`
   - **Password**: `YourSecurePassword123!`

---

## Option 2: Export/Import Data from Lovable

If you have existing employees in Lovable Cloud:

### Export from Lovable

1. Go to **Lovable project** → **Cloud** → **Database**
2. Export these tables as CSV:
   - `employees` (critical - needed to log in)
   - `user_roles` (critical - role assignments)
   - `custom_roles` (if you have custom roles)
   - `user_custom_roles` (if you have custom role assignments)
   - All other tables with data

### Import to Supabase

1. Go to Supabase Dashboard → **Table Editor**
2. Import in this order:
   - Base tables first (labs, doctors, etc.)
   - `employees` table
   - `user_roles` table
   - `patients` table
   - `patient_tests` table
   - Other tables

**Important**: After importing employees, you'll need to:
- Create auth users in Supabase for each employee
- Link `employees.user_id` to `auth.users.id`
- Users will need to reset passwords (passwords can't be migrated)

---

## Option 3: Manual SQL (If Edge Function Doesn't Work)

1. Go to Supabase Dashboard → **Authentication** → **Users** → **Add user**
2. Create user with email and password
3. Copy the User ID
4. Go to **SQL Editor** and run:

```sql
-- Insert employee record (replace USER_ID_HERE with actual ID)
INSERT INTO public.employees (
  user_id,
  employee_id,
  full_name,
  email,
  designation,
  department,
  is_active
)
VALUES (
  'USER_ID_HERE',
  'ADM0001',
  'Admin User',
  'admin@irmclinic.com',
  'Administrator',
  'Administration',
  true
);

-- Assign admin role (replace USER_ID_HERE with actual ID)
INSERT INTO public.user_roles (user_id, role)
VALUES (
  'USER_ID_HERE',
  'admin'::app_role
);
```

---

## Recommended: Use Option 1 (Edge Function)

It's the fastest and handles everything automatically:
- Creates auth user
- Creates employee record
- Assigns admin role
- All in one step!

After creating the admin, you can:
1. Log in to the admin portal
2. Create more employees
3. Import other data
4. Start using the system!


