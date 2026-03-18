# Complete Migration Guide - the previous platform to Supabase

## Your Supabase Project
- **Project ID:** `pxsutovdzppoyyfrbeaw`
- **URL:** `https://pxsutovdzppoyyfrbeaw.supabase.co`
- **Dashboard:** https://supabase.com/dashboard/project/pxsutovdzppoyyfrbeaw

---

## Step 4: Run Database Migrations

You have **20 migration files** that need to be run in chronological order.

### Migration Files (in order):

1. `20251225045339_f2e888b7-1d52-40e3-b31e-ca53a9383eb7.sql`
2. `20251225052143_8d82c08e-b096-426c-ba09-084d01569a06.sql`
3. `20251225053708_0bf369fe-52f2-4f63-ba57-ff42a1417df6.sql`
4. `20251225055342_c12902c3-4676-4520-988e-46ec6d25b47e.sql`
5. `20251225055918_e0eb618e-1cb0-4e5c-af5c-f4a39c715321.sql`
6. `20251225065734_a95027a7-2919-464f-8df7-7978e456edc4.sql`
7. `20251226105942_8af81d52-1d1b-4303-a9af-533a77a5aac4.sql`
8. `20251228102201_f7a3f0e2-eb2d-474a-bae0-accd6244d497.sql`
9. `20251229071745_938c4efb-e508-4fe9-b5f5-13fbc7503169.sql`
10. `20251229210933_allow_employees_manage_tests.sql`
11. `20251230000000_create_test_packages.sql`
12. `20251230000001_create_doctors.sql`
13. `20251230000002_create_test_templates.sql`
14. `20251230000003_create_patient_reminders.sql`
15. `20251230000004_create_multi_lab_support.sql`
16. `20251230083307_b17fc0db-4dd2-448b-a92d-65ff819acbf3.sql`
17. `20251231000000_add_collector_role.sql`
18. `20251231000001_create_custom_roles.sql`
19. `20251231085415_8ec62819-fc29-4d14-9c69-a9128c8ce929.sql`
20. `20250101000000_add_created_by_to_patients.sql` (Note: This timestamp is 2025-01-01, but should run after the others)

### How to Run Migrations:

**Option A: Using Supabase Dashboard (Recommended)**

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/pxsutovdzppoyyfrbeaw
2. Click **SQL Editor** in the left sidebar
3. For each migration file (in the order above):
   - Open the file from `supabase/migrations/` folder
   - Copy the entire SQL content
   - Paste into the SQL Editor
   - Click **Run** (or press Cmd/Ctrl + Enter)
   - Wait for "Success" message
   - Move to the next file

**Option B: Using Supabase CLI (Faster)**

```bash
# 1. Install Supabase CLI (if not installed)
npm install -g @supabase/cli
# or
brew install supabase/tap/supabase

# 2. Login to Supabase
supabase login

# 3. Link to your project
supabase link --project-ref pxsutovdzppoyyfrbeaw

# 4. Push all migrations at once
supabase db push

# 5. Verify schema
supabase db diff
```

**Important Notes:**
- Run migrations in the exact order listed above
- If a migration fails, check the error message
- Some migrations depend on previous ones
- Wait for each migration to complete before running the next

---

## Step 5: Export and Import Data

### Export from the previous platform Cloud:

1. Go to your **the previous platform project** → **Cloud** → **Database**
2. For each table with data:
   - Click on the table name
   - Click **Export CSV** (or similar export option)
   - Save the CSV file with a descriptive name (e.g., `patients.csv`, `employees.csv`)

**Tables to Export (if they have data):**
- `patients`
- `employees`
- `patient_tests`
- `invoices`
- `invoice_items`
- `labs`
- `collection_centers`
- `doctors`
- `test_catalog`
- `test_packages`
- `test_templates`
- `patient_reminders`
- `custom_roles`
- `user_custom_roles`
- Any other tables with data

### Import to Supabase:

1. Go to Supabase Dashboard → **Table Editor**
2. For each CSV file:
   - Select the corresponding table
   - Click **Insert** → **Import data from CSV**
   - Upload your CSV file
   - Map columns correctly (Supabase will auto-detect)
   - Click **Import data**
   - Wait for confirmation

**Important Notes:**
- Make sure column names match exactly
- Check for any foreign key constraints
- Import in order: base tables first, then tables that reference them
- If you have user accounts, see Step 6 for special handling

---

## Step 6: Reconfigure Authentication

### Check Current Auth Setup:

1. In your **the previous platform project**, check what auth providers are enabled:
   - Go to **Cloud** → **Authentication** → **Providers**
   - Note which providers are enabled (Email, Google, GitHub, etc.)

### Configure in Supabase:

1. Go to Supabase Dashboard → **Authentication** → **Providers**
2. Enable and configure each provider:

**Email/Password:**
- Should be enabled by default
- Configure email templates if needed

**OAuth Providers (Google, GitHub, etc.):**
- Click on the provider (e.g., "Google")
- Enable it
- Add your **Client ID** and **Client Secret**
- Update **Redirect URLs** in your OAuth app settings:
  - Old: `https://[old-the previous platform-project].supabase.co/auth/v1/callback`
  - New: `https://pxsutovdzppoyyfrbeaw.supabase.co/auth/v1/callback`

**Important:**
- User passwords cannot be migrated (they're hashed)
- Users will need to reset passwords or use OAuth
- Consider sending a password reset email to all users after migration

---

## Step 7: Migrate Storage Files

### Export from the previous platform:

1. Go to **the previous platform project** → **Cloud** → **Storage**
2. For each storage bucket:
   - Click on the bucket
   - Download all files (or use bulk download if available)
   - Save to a local folder

### Import to Supabase:

1. Go to Supabase Dashboard → **Storage**
2. Create buckets (if they don't exist):
   - Click **New bucket**
   - Name it (e.g., `avatars`, `documents`, etc.)
   - Set public/private as needed
3. Upload files:
   - Click on the bucket
   - Click **Upload file** or drag and drop
   - Upload all files from your local folder

**Note:** If you have many files, you might want to use the Supabase Storage API or CLI.

---

## Step 8: Set Up Edge Function Secrets

### Add Mailjet Secrets:

1. Go to Supabase Dashboard → **Edge Functions** → **Manage Secrets**
2. Click **Add new secret** for each:

```
Name: MAILJET_API_KEY
Value: cb79571d5659c6745f28f555dda16daa

Name: MAILJET_SECRET_KEY
Value: 30b54ec068ada7245c6f20d5396acc9d

Name: MAILJET_FROM_EMAIL
Value: no-reply@irmclinic.com

Name: MAILJET_FROM_NAME
Value: IRM Clinic
```

### Deploy Edge Functions:

1. Go to **Edge Functions** → **Create a new function**
2. Create `send-email` function:
   - Copy code from `supabase/functions/send-email/index.ts`
   - Paste into the editor
   - Click **Deploy**

3. Check other functions:
   - `create-first-admin` (if exists)
   - `create-employee` (if exists)

---

## Step 9: Verify Everything Works

### Checklist:

- [ ] **App loads without errors**
  - Open your app URL
  - Check browser console for errors
  - Verify Supabase connection

- [ ] **Database operations work**
  - Create a test record
  - Read records
  - Update a record
  - Delete a record

- [ ] **Authentication works**
  - Sign up a new user
  - Sign in with existing credentials
  - Test password reset (if needed)
  - Test OAuth (if configured)

- [ ] **Storage works**
  - Upload a file
  - Download a file
  - Check file URLs

- [ ] **Email sending works**
  - Go to Admin Dashboard → Notifications
  - Send a test email
  - Check inbox

- [ ] **All features work**
  - Patient management
  - Test management
  - Billing
  - Reports
  - All admin features

### Test Scenarios:

1. **Create a new patient** → Verify it appears in the database
2. **Create a test** → Verify it's linked to the patient
3. **Generate an invoice** → Verify billing works
4. **Send a reminder** → Verify email is sent
5. **Upload a file** → Verify storage works
6. **Sign in as admin** → Verify permissions work

---

## Troubleshooting

### Migration Errors:

- **"relation already exists"**: Table already created, skip that migration
- **"column already exists"**: Column already added, check if migration was partially run
- **"foreign key constraint"**: Run migrations in order, check dependencies

### Data Import Errors:

- **"duplicate key"**: Data already exists, skip or update
- **"foreign key violation"**: Import referenced tables first
- **"invalid format"**: Check CSV format, column names, data types

### Authentication Issues:

- **"Invalid credentials"**: Users need to reset passwords
- **"OAuth callback error"**: Update redirect URLs in OAuth provider settings
- **"Email not verified"**: Check email verification settings

### Storage Issues:

- **"Bucket not found"**: Create buckets first
- **"Permission denied"**: Check bucket policies
- **"File not found"**: Verify file paths and bucket names

---

## Quick Reference

**Supabase Dashboard:** https://supabase.com/dashboard/project/pxsutovdzppoyyfrbeaw

**Project URL:** `https://pxsutovdzppoyyfrbeaw.supabase.co`

**Migration Files Location:** `supabase/migrations/` (20 files)

**Edge Function Code:** `supabase/functions/send-email/index.ts`

---

## Next Steps After Migration

1. ✅ Update `.env` file in the previous platform (already done)
2. ✅ Update `supabase/config.toml` (already done)
3. ⏳ Run migrations (Step 4)
4. ⏳ Export/import data (Step 5)
5. ⏳ Configure authentication (Step 6)
6. ⏳ Migrate storage (Step 7)
7. ⏳ Set up Edge Function secrets (Step 8)
8. ⏳ Verify everything (Step 9)

---

## Need Help?

If you encounter issues:
1. Check Supabase logs: Dashboard → Logs
2. Check browser console for errors
3. Verify all environment variables are set
4. Check Edge Function logs for email issues

Good luck with your migration! 🚀


