# Automated SQL Import Guide

This guide explains how to use the automated import scripts to import your data from the previous platform to Supabase.

## 📋 Available Scripts

### 1. `run_sql_import.py` - SQL Validation & Preparation
Validates SQL files and provides execution instructions.

**Usage:**
```bash
python3 run_sql_import.py [sql_file]
```

**Example:**
```bash
# Validate the combined import file (default)
python3 run_sql_import.py

# Validate a specific SQL file
python3 run_sql_import.py sql_imports/patients_import.sql
```

**What it does:**
- ✅ Validates SQL file syntax
- ✅ Counts SQL statements
- ✅ Provides execution instructions
- ✅ Shows preview of statements

---

### 2. `import_data.sh` - Import Helper Script
Guides you through importing SQL using Supabase Dashboard (recommended) or psql.

**Usage:**
```bash
./import_data.sh [sql_file]
```

**Example:**
```bash
# Import combined file (default)
./import_data.sh

# Import specific file
./import_data.sh sql_imports/patients_import.sql
```

**What it does:**
- ✅ Provides step-by-step instructions
- ✅ Opens SQL file and Dashboard (macOS)
- ✅ Optionally uses psql if you have database password
- ✅ Guides you through the import process

---

## 🚀 Quick Start

### Option 1: Using Supabase Dashboard (Recommended - Easiest)

**Method A: Using the Helper Script**

1. **Run the import script**:
   ```bash
   ./import_data.sh
   ```

2. **Follow the instructions** - The script will:
   - Show you the Dashboard URL
   - Optionally open the SQL file and Dashboard (macOS)
   - Guide you through copy-paste process

**Method B: Manual Steps**

1. **Open Supabase Dashboard**:
   - Go to https://supabase.com/dashboard/project/pxsutovdzppoyyfrbeaw
   - Navigate to **SQL Editor**

2. **Open the SQL file**:
   - Open `sql_imports/COMBINED_IMPORT_ALL.sql` in a text editor
   - Copy all contents (Cmd/Ctrl + A, then Cmd/Ctrl + C)

3. **Execute in SQL Editor**:
   - Paste the SQL into the SQL Editor
   - Click **Run** (or press Cmd/Ctrl + Enter)
   - Wait for completion

4. **Verify**:
   - Check for any errors
   - Verify data in the Tables section

---

### Option 2: Using psql (Advanced)

If you have the database password and psql installed:

1. **Get database password**:
   - Go to Supabase Dashboard → Settings → Database
   - Copy the connection string or password

2. **Set environment variable**:
   ```bash
   export SUPABASE_DB_PASSWORD='your-password'
   ```

3. **Run the script**:
   ```bash
   ./import_data.sh
   ```
   - Choose "yes" when asked about psql

---

### Option 3: Using Python Script (Validation Only)

1. **Validate SQL file**:
   ```bash
   python3 run_sql_import.py
   ```

2. **Follow the instructions** provided by the script

---

## 📝 Import Order

If importing tables individually, follow this order:

1. **Base Tables** (no dependencies):
   - `labs`
   - `collection_centers`
   - `doctors`
   - `test_categories`
   - `tests`
   - `test_packages`
   - `test_package_tests`
   - `inventory_categories`
   - `inventory_items`
   - `custom_roles`
   - `role_permissions`

2. **User Data** (after creating auth users):
   - `employees` (use `create_employees_from_csv.py` first)
   - `user_roles`
   - `user_custom_roles`

3. **Patient Data**:
   - `patients`
   - `patient_tests`
   - `patient_test_audit`

4. **Billing Data**:
   - `invoices`
   - `invoice_items`
   - `payments`

5. **Other Data**:
   - `patient_reminders`
   - `doctor_referrals`
   - `inventory_purchases`
   - `inventory_usage`

---

## ⚠️ Important Notes

### Before Importing:

1. **Create Auth Users First**:
   - Employees need auth users before importing
   - See `CREATE_AUTH_USERS_INSTRUCTIONS.md`
   - Use `create_employees_from_csv.py` to generate employee SQL

2. **Check Dependencies**:
   - Some tables depend on others
   - Import in the correct order
   - Use `COMBINED_IMPORT_ALL.sql` for automatic ordering

3. **Handle Duplicates**:
   - SQL files include `ON CONFLICT` clauses
   - Duplicate data will be skipped or updated
   - Safe to re-run if needed

### After Importing:

1. **Verify Data**:
   - Check table row counts
   - Verify relationships
   - Test login with imported users

2. **Import Employees** (if not done):
   - Create auth users first
   - Run `create_employees_from_csv.py --generate-sql`
   - Execute `import_employees.sql`

3. **Import User Roles**:
   - Import `user_roles_import.sql`
   - Import `user_custom_roles_import.sql`

---

## 🔧 Troubleshooting

### Error: "Foreign key constraint violation"
**Solution**: Import tables in the correct order. Use `COMBINED_IMPORT_ALL.sql` which handles this automatically.

### Error: "user_id does not exist"
**Solution**: Create auth users first. See `CREATE_AUTH_USERS_INSTRUCTIONS.md`.

### Error: "Duplicate key"
**Solution**: Data already exists. The SQL includes `ON CONFLICT` clauses to handle this. You can skip that table or let it update.

### Error: "Column X does not exist"
**Solution**: Table structure might be different. Check migrations in `supabase/migrations/`.

### Supabase CLI not found
**Solution**: Install it:
```bash
brew install supabase/tap/supabase
# or
npm install -g supabase
```

### Not linked to project
**Solution**: Link your project:
```bash
supabase link --project-ref pxsutovdzppoyyfrbeaw
```

---

## 📊 Verification Checklist

After importing, verify:

- [ ] All base tables imported (labs, collection_centers, doctors, etc.)
- [ ] Test categories and tests imported
- [ ] Patients imported
- [ ] Patient tests imported
- [ ] Invoices imported (if applicable)
- [ ] Employees imported (after creating auth users)
- [ ] User roles assigned
- [ ] Can log in with admin account

---

## 🎯 Next Steps

1. ✅ Create first admin user (if not done)
2. ✅ Import all data using one of the methods above
3. ✅ Verify data integrity
4. ✅ Test the application
5. ✅ Configure email service (already done with Mailjet)

---

## 📚 Related Files

- `sql_imports/COMBINED_IMPORT_ALL.sql` - Combined import script
- `sql_imports/*_import.sql` - Individual table imports
- `create_employees_from_csv.py` - Employee import helper
- `STEP_BY_STEP_IMPORT.md` - Detailed step-by-step guide
- `CREATE_AUTH_USERS_INSTRUCTIONS.md` - Auth user creation guide

---

## 💡 Tips

1. **Use Combined Import**: `COMBINED_IMPORT_ALL.sql` handles all dependencies automatically
2. **Backup First**: Always backup your database before importing
3. **Test in Dev**: Test the import in a development environment first
4. **Monitor Progress**: Watch for errors during import
5. **Verify After**: Always verify data after import

---

Good luck with your import! 🚀

