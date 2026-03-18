# Data Migration Guide - the previous platform Cloud to Supabase

## Overview

You need to export data from the previous platform Cloud and import it to your new Supabase instance to:
- Have user accounts to log in
- Preserve all existing data (patients, tests, invoices, etc.)

---

## Step 1: Export Data from the previous platform Cloud

### Access the previous platform Cloud Database

1. Go to your **the previous platform project**
2. Navigate to **Cloud** → **Database**
3. You'll see all your tables

### Export Each Table

For each table that has data, follow these steps:

#### Tables to Export (Priority Order):

**Critical (Must Export First):**
1. **`employees`** - User accounts to log in
2. **`user_roles`** - Role assignments for employees
3. **`custom_roles`** - Custom roles (if any)
4. **`user_custom_roles`** - Custom role assignments (if any)

**Important Data:**
5. **`patients`** - All patient records
6. **`patient_tests`** - All test records
7. **`invoices`** - All billing records
8. **`invoice_items`** - Invoice line items
9. **`payments`** - Payment records (if exists)
10. **`labs`** - Lab records
11. **`collection_centers`** - Collection center records
12. **`doctors`** - Doctor records
13. **`test_catalog`** - Test catalog entries
14. **`test_packages`** - Test package definitions
15. **`test_templates`** - Test templates
16. **`patient_reminders`** - Reminder records
17. **`inventory`** - Inventory items (if exists)
18. **`role_permissions`** - Custom role permissions (if exists)

### How to Export from the previous platform

For each table:
1. Click on the table name
2. Look for an **Export** or **Download** button
3. Choose **CSV** format
4. Save the file with a descriptive name (e.g., `employees.csv`, `patients.csv`)
5. Repeat for all tables with data

**Note:** If the previous platform doesn't have a direct export option:
- You might need to use Supabase Dashboard on the old project
- Or use SQL queries to export data

---

## Step 2: Import Data to Supabase

### Access Supabase Table Editor

1. Go to **Supabase Dashboard**: https://supabase.com/dashboard/project/pxsutovdzppoyyfrbeaw
2. Click **Table Editor** in the left sidebar

### Import Order (Important!)

Import tables in this order to respect foreign key relationships:

#### Phase 1: Base Tables (No Dependencies)
1. **`labs`** (if you have lab data)
2. **`collection_centers`** (if you have collection center data)
3. **`doctors`** (if you have doctor data)
4. **`test_catalog`** (if you have test catalog data)
5. **`test_packages`** (if you have test packages)
6. **`test_templates`** (if you have templates)
7. **`custom_roles`** (if you have custom roles)

#### Phase 2: User Accounts (Critical for Login)
8. **`employees`** - This is critical! You need this to log in
9. **`user_roles`** - Role assignments
10. **`user_custom_roles`** - Custom role assignments (if any)
11. **`role_permissions`** - Custom role permissions (if any)

#### Phase 3: Patient Data
12. **`patients`** - Patient records

#### Phase 4: Test Data (Depends on Patients)
13. **`patient_tests`** - Test records (references patients)

#### Phase 5: Billing Data (Depends on Patients)
14. **`invoices`** - Invoice records (references patients)
15. **`invoice_items`** - Invoice line items (references invoices)
16. **`payments`** - Payment records (references invoices, if exists)

#### Phase 6: Other Data
17. **`patient_reminders`** - Reminder records (references patients)
18. **`inventory`** - Inventory items (if exists)

### How to Import Each CSV

For each CSV file:

1. In Supabase **Table Editor**, select the corresponding table
2. Click **Insert** → **Import data from CSV**
3. Click **Upload CSV** and select your file
4. **Map columns**:
   - Supabase will auto-detect column names
   - Verify each column maps correctly
   - Make sure data types match (dates, numbers, etc.)
5. Click **Import data**
6. Wait for confirmation message
7. Verify the data appears in the table

### Important Notes

- **UUIDs**: Make sure UUID columns are preserved (don't let Excel convert them)
- **Dates**: Verify date formats are correct
- **Foreign Keys**: Import referenced tables first (e.g., patients before patient_tests)
- **User Passwords**: Cannot be migrated (see Step 3 below)

---

## Step 3: Handle User Accounts (Critical!)

### The Problem

User passwords are hashed and cannot be exported/imported. You have two options:

### Option A: Create New Admin Account (Recommended for Testing)

1. Go to Supabase Dashboard → **SQL Editor**
2. Run this SQL to create a test admin:

```sql
-- First, create an auth user (you'll need to do this via Supabase Auth or your app)
-- Then assign admin role

-- Example: If you have an employee with email, you can create auth user and link it
-- Or use the create-first-admin Edge Function if available
```

**Or use the Edge Function:**
- Go to **Edge Functions** → **create-first-admin**
- Invoke it with: `{ "email": "admin@irmclinic.com", "password": "your-secure-password", "full_name": "Admin User" }`

### Option B: Reset All User Passwords

1. After importing employees, send password reset emails to all users
2. Or manually reset passwords in Supabase Dashboard → **Authentication** → **Users**

### Option C: Export User Data and Recreate

1. Export `employees` table
2. For each employee, you'll need to:
   - Create auth user in Supabase
   - Link employee record to auth user
   - Assign roles

---

## Step 4: Verify Import

### Check Data Counts

1. In Supabase **Table Editor**, check each table:
   - Verify row counts match exported data
   - Spot-check a few records to ensure data integrity

### Test Login

1. Try logging in with an admin account
2. If login fails, check:
   - Auth user exists in Supabase → **Authentication** → **Users**
   - Employee record is linked to auth user (`user_id` matches)
   - Roles are assigned in `user_roles` table

---

## Step 5: Create First Admin (If No Users)

If you don't have any user data to import, create your first admin:

### Using Edge Function (If Available)

1. Go to Supabase Dashboard → **Edge Functions** → **create-first-admin**
2. Click **Invoke**
3. Use this payload:

```json
{
  "email": "admin@irmclinic.com",
  "password": "YourSecurePassword123!",
  "full_name": "Admin User"
}
```

### Using SQL (Alternative)

1. Go to **SQL Editor**
2. Create auth user first (via Supabase Auth API or Dashboard)
3. Then assign admin role:

```sql
-- Insert into employees table
INSERT INTO public.employees (user_id, full_name, email, phone, is_active)
VALUES (
  'auth-user-uuid-here',  -- Get this from Authentication → Users
  'Admin User',
  'admin@irmclinic.com',
  NULL,
  true
);

-- Assign admin role
INSERT INTO public.user_roles (user_id, role)
VALUES (
  'auth-user-uuid-here',
  'admin'::app_role
);
```

---

## Quick Checklist

- [ ] Export `employees` table from the previous platform
- [ ] Export `user_roles` table from the previous platform
- [ ] Export all other tables with data
- [ ] Import base tables first (labs, doctors, etc.)
- [ ] Import `employees` table
- [ ] Import `user_roles` table
- [ ] Import `patients` table
- [ ] Import `patient_tests` table
- [ ] Import `invoices` and related billing tables
- [ ] Import other data tables
- [ ] Create/fix user accounts for login
- [ ] Test login to admin portal
- [ ] Verify data integrity

---

## Troubleshooting

### "Foreign key constraint violation"
- **Solution**: Import referenced tables first (e.g., patients before patient_tests)

### "Duplicate key" error
- **Solution**: Data already exists, skip or update existing records

### "Invalid UUID format"
- **Solution**: Make sure CSV preserves UUIDs as text, not converted to numbers

### "Cannot log in"
- **Solution**: 
  - Check auth user exists in Supabase → Authentication
  - Verify `employees.user_id` matches `auth.users.id`
  - Check `user_roles` table has admin role assigned

### "Column type mismatch"
- **Solution**: Check data types in CSV match Supabase column types

---

## After Migration

Once data is imported:
1. ✅ You can log in to the admin portal
2. ✅ All your data is preserved
3. ✅ Everything works with the new Supabase instance
4. ✅ Email sending is configured and ready

Good luck with the migration! 🚀


