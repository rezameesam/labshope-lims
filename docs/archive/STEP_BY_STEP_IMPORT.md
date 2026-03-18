# Step-by-Step Data Import Guide

## ✅ What's Done

- ✅ Converted 23 CSV files to SQL import scripts
- ✅ Generated import scripts in correct dependency order
- ✅ Created employee import helper (needs auth users first)

## 📋 Import Steps

### Step 1: Create Auth Users for Employees (CRITICAL!)

You have 3 employees that need auth users:

1. **Go to Supabase Dashboard**: https://supabase.com/dashboard/project/pxsutovdzppoyyfrbeaw
2. **Navigate to**: Authentication → Users → Add user
3. **Create auth users for each employee**:

   **Employee 1:**
   - Email: `admin@irmclinic.com`
   - Password: Set a secure password
   - Auto Confirm User: ✅ Checked
   - Click **Create user**
   - **Copy the User ID** (you'll need it)

   **Employee 2:**
   - Email: `windcirculation@gmail.com`
   - Password: Set a secure password
   - Auto Confirm User: ✅ Checked
   - Click **Create user**
   - **Copy the User ID**

   **Employee 3:**
   - Email: `cg2@irmclinic.com`
   - Password: Set a secure password
   - Auto Confirm User: ✅ Checked
   - Click **Create user**
   - **Copy the User ID**

4. **Update `user_id_mapping.json`** with the User IDs:
   ```json
   {
     "admin@irmclinic.com": "PASTE_USER_ID_HERE",
     "windcirculation@gmail.com": "PASTE_USER_ID_HERE",
     "cg2@irmclinic.com": "PASTE_USER_ID_HERE"
   }
   ```

5. **Generate employees SQL**:
   ```bash
   python3 create_employees_from_csv.py ~/Downloads/the previous platform_Data_Exported/employees-export-2025-12-31_20-31-39.csv --generate-sql
   ```

   This creates `import_employees.sql`

---

### Step 2: Import All Data (Easy Method - Recommended)

**Option A: Import Everything at Once**

1. Open `sql_imports/COMBINED_IMPORT_ALL.sql`
2. Copy **all contents**
3. Go to **Supabase Dashboard → SQL Editor**
4. Paste the entire script
5. Click **Run**
6. Wait for completion (may take a minute)

This imports all 23 tables in the correct order!

**Option B: Import Tables Individually**

If you prefer to import one at a time:

1. Open each file from `sql_imports/` in order:
   - `labs_import.sql`
   - `collection_centers_import.sql`
   - `doctors_import.sql`
   - `test_categories_import.sql`
   - `tests_import.sql`
   - `test_packages_import.sql`
   - `test_package_tests_import.sql`
   - `inventory_categories_import.sql`
   - `inventory_items_import.sql`
   - `custom_roles_import.sql`
   - `role_permissions_import.sql`
2. For each file:
   - Copy all contents
   - Paste into SQL Editor
   - Click **Run**
   - Verify success message

---

### Step 3: Import Employees (After Auth Users Created)

1. Open `import_employees.sql` (generated in Step 1)
2. Copy all contents
3. Paste into SQL Editor
4. Click **Run**
5. Verify employees are imported

---

### Step 4: Import User Roles

1. `sql_imports/user_roles_import.sql`
2. `sql_imports/user_custom_roles_import.sql`

**⚠️ Important**: These reference `user_id` from employees. Make sure employees are imported first!

---

### Step 5: Import Patient Data

1. `sql_imports/patients_import.sql`

---

### Step 6: Import Test Data

1. `sql_imports/patient_tests_import.sql`
2. `sql_imports/patient_test_audit_import.sql`

---

### Step 7: Import Billing Data

1. `sql_imports/invoices_import.sql`
2. `sql_imports/invoice_items_import.sql`
3. `sql_imports/payments_import.sql`

---

### Step 8: Import Other Data

1. `sql_imports/patient_reminders_import.sql`
2. `sql_imports/doctor_referrals_import.sql`
3. `sql_imports/inventory_purchases_import.sql`
4. `sql_imports/inventory_usage_import.sql`

---

## 🚀 Quick Import (All at Once)

If you prefer to import everything at once (after creating auth users):

1. **Create auth users** (Step 1 above)
2. **Generate employees SQL** (Step 1 above)
3. **Open `sql_imports/COMBINED_IMPORT_ALL.sql`**
4. **Add employees import** at the right place (after custom_roles, before user_roles)
   - Open `import_employees.sql` (generated in Step 1)
   - Copy its contents
   - Paste it in `COMBINED_IMPORT_ALL.sql` after `role_permissions` section, before `user_roles` section
5. **Copy the entire combined script**
6. **Paste into Supabase SQL Editor**
7. **Click Run**

---

## ⚠️ Common Errors & Fixes

### Error: "Foreign key constraint violation"
**Fix**: Import tables in the order listed above

### Error: "user_id does not exist"
**Fix**: Make sure you created auth users and updated `user_id_mapping.json`

### Error: "Duplicate key"
**Fix**: Data already exists. You can:
- Skip that table
- Or use `ON CONFLICT DO UPDATE` (already in employees SQL)

### Error: "Column X does not exist"
**Fix**: The table structure might be different. Check the SQL file and adjust column names.

---

## ✅ Verification Checklist

After importing, verify:

- [ ] Employees imported (3 employees)
- [ ] User roles assigned
- [ ] Patients imported
- [ ] Patient tests imported
- [ ] Invoices imported
- [ ] Can log in with `admin@irmclinic.com`

---

## 📁 Files Generated

- `sql_imports/` - All SQL import scripts
- `import_employees.sql` - Employees import (after auth users)
- `user_id_mapping.json` - Template for auth user IDs
- `CREATE_AUTH_USERS_INSTRUCTIONS.md` - Step-by-step auth user creation

---

## 🎯 Next Steps After Import

1. ✅ Test login with `admin@irmclinic.com`
2. ✅ Verify all data is present
3. ✅ Test email sending (already configured with Mailjet)
4. ✅ Start using the system!

---

## Need Help?

If you encounter errors:
1. Check the error message
2. Verify the import order
3. Make sure auth users are created
4. Check foreign key relationships

Good luck! 🚀

