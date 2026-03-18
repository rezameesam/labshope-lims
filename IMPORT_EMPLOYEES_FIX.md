# Fix: Import Employees with Auth Users

## The Problem

Your `employees` CSV has `user_id` values that reference `auth.users(id)` from the previous platform. These don't exist in your new Supabase instance.

## Solution: Two-Step Process

### Step 1: Create Auth Users for Each Employee

For each employee in your CSV, create an auth user:

1. Go to Supabase Dashboard → **Authentication** → **Users** → **Add user**
2. For each employee:
   - **Email**: Use the email from employees CSV
   - **Password**: Set a temporary password (users will reset)
   - **Auto Confirm User**: ✅ Checked
   - Click **Create user**
   - **Copy the User ID** (you'll need it)

### Step 2: Update Employees CSV with New User IDs

1. Open `employees-export-2025-12-31_20-31-39.csv`
2. Replace the `user_id` column with the new User IDs from Step 1
3. Save the updated CSV

### Step 3: Import Employees

Now import the updated CSV via Supabase Dashboard → Table Editor

---

## Alternative: Import Without user_id, Then Link

### Step 1: Import Employees Without user_id

1. Open `employees-export-2025-12-31_20-31-39.csv`
2. Delete the `user_id` column (or leave it empty)
3. Import via Supabase Dashboard

### Step 2: Create Auth Users and Link

For each employee:

1. Create auth user (as above)
2. Update employee record via SQL:

```sql
-- Replace EMPLOYEE_EMAIL and NEW_USER_ID
UPDATE public.employees
SET user_id = 'NEW_USER_ID'
WHERE email = 'EMPLOYEE_EMAIL';
```

---

## Quick Script: Create Auth Users from CSV

I can create a script to:
1. Read employees CSV
2. Create auth users for each email
3. Generate SQL to update employees.user_id

Would you like me to create this?

---

## Your Employees (from CSV)

Based on your CSV, you have:
1. **admin@irmclinic.com** - Admin (user_id: e4907051-27b2-463f-bcf8-5411cb8b5924)
2. **windcirculation@gmail.com** - Syed Hamid (user_id: f4b537c2-f8ca-4c72-b4d1-b2486ddecc24)
3. **cg2@irmclinic.com** - Collector Guy 2 (user_id: ed2e5b68-7a99-4808-bbc2-60440b85e7e8)

### Action Plan:

1. Create auth users for these 3 emails in Supabase
2. Note the new User IDs
3. Update the CSV or use SQL to link them
4. Import employees
5. Import user_roles (which references these user_ids)

---

## What Error Are You Getting?

Please share the exact error message so I can provide a targeted fix!


