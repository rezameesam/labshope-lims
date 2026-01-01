# Quick SQL Import Guide

## 🚀 Fastest Method (3 Steps)

### Step 1: Open SQL File
```bash
open sql_imports/COMBINED_IMPORT_ALL.sql
```
Or manually open: `sql_imports/COMBINED_IMPORT_ALL.sql`

### Step 2: Copy Everything
- Press `Cmd+A` (Mac) or `Ctrl+A` (Windows/Linux) to select all
- Press `Cmd+C` (Mac) or `Ctrl+C` (Windows/Linux) to copy

### Step 3: Paste in Supabase Dashboard
1. Go to: https://supabase.com/dashboard/project/pxsutovdzppoyyfrbeaw/sql/new
2. Click in the SQL Editor
3. Press `Cmd+V` (Mac) or `Ctrl+V` (Windows/Linux) to paste
4. Click the **"Run"** button
5. Wait for "Success" message

---

## 🎯 Using the Helper Script

Run this command:
```bash
./import_sql.sh
```

This will:
- ✅ Show you the exact steps
- ✅ Open the SQL file automatically
- ✅ Open the Supabase Dashboard automatically
- ✅ Display the file size and line count

---

## ⚠️ Important Notes

1. **Import takes time**: The combined file has ~1170 lines, so it may take 30-60 seconds
2. **Check for errors**: If you see errors, they're usually about:
   - Duplicate data (safe to ignore if using `ON CONFLICT`)
   - Foreign key constraints (shouldn't happen with combined file)
3. **Verify after import**: Check the Tables section in Supabase Dashboard to confirm data

---

## 🔧 Troubleshooting

### Error: "relation does not exist"
**Solution**: Make sure you've run all migrations first. Check `supabase/migrations/` folder.

### Error: "duplicate key value"
**Solution**: This is normal if data already exists. The SQL uses `ON CONFLICT` to handle duplicates safely.

### Error: "foreign key constraint"
**Solution**: Use the `COMBINED_IMPORT_ALL.sql` file which imports in the correct order.

---

## ✅ After Import

1. Verify data in Supabase Dashboard → Tables
2. Import employees (if not done): See `CREATE_AUTH_USERS_INSTRUCTIONS.md`
3. Import user roles: See `STEP_BY_STEP_IMPORT.md`
4. Test login with admin account

---

That's it! The import should work smoothly. 🎉

