# Data Import Guide - Fixing Common Errors

## Common Import Errors & Solutions

### Error 1: "Delimiter not recognized" or "Column mismatch"
**Problem**: CSV files use semicolon (`;`) delimiter, not comma  
**Solution**: Use SQL import instead (see below)

### Error 2: "Foreign key constraint violation"
**Problem**: Importing tables in wrong order  
**Solution**: Import in dependency order (see Import Order below)

### Error 3: "Invalid UUID format"
**Problem**: Excel/Google Sheets converted UUIDs to numbers  
**Solution**: Ensure UUIDs are preserved as text in CSV

### Error 4: "user_id does not exist in auth.users"
**Problem**: Employees have `user_id` but auth users don't exist  
**Solution**: Create auth users first, or import employees without user_id initially

---

## Import Order (Critical!)

Import tables in this exact order to avoid foreign key errors:

### Phase 1: Base Tables (No Dependencies)
1. ✅ `labs` - Lab records
2. ✅ `collection_centers` - Collection centers
3. ✅ `doctors` - Doctor records
4. ✅ `test_categories` - Test categories
5. ✅ `tests` - Test catalog
6. ✅ `test_packages` - Test packages
7. ✅ `test_package_tests` - Package-test relationships
8. ✅ `test_templates` - Test templates
9. ✅ `inventory_categories` - Inventory categories
10. ✅ `inventory_items` - Inventory items
11. ✅ `custom_roles` - Custom roles
12. ✅ `role_permissions` - Role permissions

### Phase 2: User Accounts (Critical!)
13. ⚠️ **`employees`** - Employee records (but see Auth Users section below)
14. ✅ `user_roles` - Role assignments
15. ✅ `user_custom_roles` - Custom role assignments

### Phase 3: Patient Data
16. ✅ `profiles` - Patient profiles (if separate from patients)
17. ✅ `patients` - Patient records

### Phase 4: Test Data (Depends on Patients)
18. ✅ `patient_tests` - Test records
19. ✅ `patient_test_audit` - Test audit logs

### Phase 5: Billing Data
20. ✅ `quotations` - Quotation records
21. ✅ `quotation_items` - Quotation items
22. ✅ `invoices` - Invoice records
23. ✅ `invoice_items` - Invoice line items
24. ✅ `payments` - Payment records

### Phase 6: Other Data
25. ✅ `patient_reminders` - Reminder records
26. ✅ `doctor_referrals` - Doctor referrals
27. ✅ `inventory_purchases` - Inventory purchases
28. ✅ `inventory_usage` - Inventory usage
29. ✅ `equipment_maintenance` - Equipment maintenance
30. ✅ `lab_settings` - Lab settings
31. ✅ `lab_users` - Lab users

---

## Method 1: CSV Import via Supabase Dashboard (If Delimiter Works)

### Step 1: Convert Semicolon to Comma (If Needed)

If Supabase doesn't recognize semicolon delimiter:

```bash
# Convert semicolon to comma for a file
sed 's/;/,/g' ~/Downloads/Lovable_Data_Exported/employees-export-2025-12-31_20-31-39.csv > employees.csv
```

Or use this script to convert all files:

```bash
cd ~/Downloads/Lovable_Data_Exported
for file in *.csv; do
  sed 's/;/,/g' "$file" > "../irmclinic_data/${file%-export-*}.csv"
done
```

### Step 2: Import via Dashboard

1. Go to Supabase Dashboard → **Table Editor**
2. Select the table
3. Click **Insert** → **Import data from CSV**
4. Upload the CSV file
5. Map columns correctly
6. Click **Import**

---

## Method 2: SQL Import (Recommended - Handles All Issues)

### Step 1: Convert CSV to SQL INSERT Statements

I'll create a script to do this, or you can use this approach:

1. Use a tool like `csvkit` or Python to convert CSV to SQL
2. Or manually import via SQL Editor

### Step 2: Import via SQL Editor

1. Go to Supabase Dashboard → **SQL Editor**
2. Paste the SQL INSERT statements
3. Click **Run**

---

## Critical: Auth Users Issue

### The Problem

Your `employees` table has `user_id` values that reference `auth.users(id)`. These auth users don't exist in your new Supabase instance.

### Solution Options

#### Option A: Import Employees Without user_id (Recommended)

1. Import employees CSV but **skip the `user_id` column**
2. After import, create auth users for each employee
3. Update `employees.user_id` to match `auth.users.id`

#### Option B: Create Auth Users First

1. For each employee in the CSV:
   - Create auth user in Supabase Dashboard → Authentication → Users
   - Note the User ID
   - Update the CSV with the new User ID
2. Then import employees

#### Option C: Use SQL to Handle This

See the SQL import script below.

---

## Quick Fix: Import Script

I'll create a Python script to:
1. Read semicolon-delimited CSVs
2. Convert to SQL INSERT statements
3. Handle UUIDs correctly
4. Skip `user_id` for employees (handle separately)

---

## Step-by-Step Import Process

### 1. Import Base Tables First

Start with tables that have no dependencies:

```bash
# In Supabase Dashboard → Table Editor
# Import these in order:
1. labs
2. collection_centers
3. doctors
4. test_categories
5. tests
6. test_packages
7. test_templates
8. custom_roles
9. role_permissions
```

### 2. Handle Employees (Special Case)

**Option 1: Import without user_id**
- Import employees CSV but exclude `user_id` column
- Create auth users manually or via Edge Function
- Update `employees.user_id` via SQL

**Option 2: Create auth users first**
- For each employee email, create auth user
- Update CSV with new user IDs
- Import employees

### 3. Import User Roles

After employees are imported and linked to auth users:
- Import `user_roles` CSV
- Import `user_custom_roles` CSV

### 4. Import Patient Data

```bash
# Import in order:
1. profiles (if separate)
2. patients
```

### 5. Import Test Data

```bash
1. patient_tests
2. patient_test_audit
```

### 6. Import Billing Data

```bash
1. quotations
2. quotation_items
3. invoices
4. invoice_items
5. payments
```

### 7. Import Other Data

Import remaining tables in any order.

---

## What Errors Are You Seeing?

Please share the specific error messages you're getting, and I can provide targeted fixes!

Common errors:
- "Column X does not exist" → Column name mismatch
- "Foreign key constraint" → Import order issue
- "Invalid UUID" → UUID format issue
- "user_id does not exist" → Auth user missing


