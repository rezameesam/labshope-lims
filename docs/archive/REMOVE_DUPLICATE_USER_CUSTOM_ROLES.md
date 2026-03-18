# Fix: Remove Duplicate user_custom_roles INSERT

## The Problem

There are **two** `INSERT INTO public.user_custom_roles` statements:
- Line 508: Inside a comment block `/* ... */` (this is fine)
- Line 517: **Active** (this causes the foreign key error)

## The Fix

**Remove lines 513-518** from `sql_imports/COMBINED_IMPORT_ALL_NO_TRANSACTION.sql`:

These lines should be deleted:
```
-- Import script for user_custom_roles
-- Generated from user_custom_roles-export-2025-12-31_20-36-00.csv
-- Rows: 1

INSERT INTO public.user_custom_roles (id, user_id, role_id, created_at) VALUES
('850cbe02-359f-4a31-818a-b4ca268105e6', 'ed2e5b68-7a99-4808-bbc2-60440b85e7e8', '9cc0b08f-0c48-4769-8b3c-a1ff673a8f28', '2025-12-30 20:58:55.599867+00') ON CONFLICT (id) DO NOTHING;
```

## Quick Fix

1. Open `sql_imports/COMBINED_IMPORT_ALL_NO_TRANSACTION.sql`
2. Go to line 513
3. Delete lines 513-518 (the duplicate section)
4. Save the file
5. Try importing again

The file should go directly from:
```
*/
```

to:
```
-- ========================================
-- Importing patients
```

