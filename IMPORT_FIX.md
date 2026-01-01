# SQL Import Fix

## The Problem

The error `syntax error at or near "sql_imports"` happens because:

1. **Wrong file copied**: You might have copied `00_IMPORT_ALL.sql` which uses `\i` commands (psql only)
2. **Transaction wrapper**: Supabase SQL Editor may not support `BEGIN;`/`COMMIT;` blocks

## ✅ Solution: Use the Fixed File

I've created a version **without the transaction wrapper**:

**File to use:** `sql_imports/COMBINED_IMPORT_ALL_NO_TRANSACTION.sql`

### Steps:

1. **Open the correct file**:
   ```bash
   open sql_imports/COMBINED_IMPORT_ALL_NO_TRANSACTION.sql
   ```
   Or manually: `sql_imports/COMBINED_IMPORT_ALL_NO_TRANSACTION.sql`

2. **Copy ALL contents**:
   - Select All: `Cmd+A`
   - Copy: `Cmd+C`

3. **Paste in Supabase Dashboard**:
   - Go to: https://supabase.com/dashboard/project/pxsutovdzppoyyfrbeaw/sql/new
   - Paste: `Cmd+V`
   - Click **Run**

## 🔍 How to Verify You Have the Right File

The correct file should:
- ✅ Start with comments (not `\i` commands)
- ✅ Have `INSERT INTO` statements
- ✅ NOT have `BEGIN;` at the start
- ✅ NOT have `COMMIT;` at the end

The wrong file (`00_IMPORT_ALL.sql`) will have:
- ❌ `\i sql_imports/labs_import.sql` commands
- ❌ These won't work in Supabase Dashboard

## 📝 Quick Check

Run this to see which file you should use:
```bash
head -5 sql_imports/COMBINED_IMPORT_ALL_NO_TRANSACTION.sql
```

You should see comments, not `\i` commands.

---

**Use:** `COMBINED_IMPORT_ALL_NO_TRANSACTION.sql` ✅

