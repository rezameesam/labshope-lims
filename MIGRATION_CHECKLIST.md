# Migration Checklist - Quick Reference

## ✅ Completed
- [x] Updated `.env` file with new Supabase credentials
- [x] Updated `supabase/config.toml` with new project ID

## ⏳ To Do

### Step 4: Run Migrations (20 files)
- [ ] Migration 1: `20251225045339_f2e888b7-1d52-40e3-b31e-ca53a9383eb7.sql`
- [ ] Migration 2: `20251225052143_8d82c08e-b096-426c-ba09-084d01569a06.sql`
- [ ] Migration 3: `20251225053708_0bf369fe-52f2-4f63-ba57-ff42a1417df6.sql`
- [ ] Migration 4: `20251225055342_c12902c3-4676-4520-988e-46ec6d25b47e.sql`
- [ ] Migration 5: `20251225055918_e0eb618e-1cb0-4e5c-af5c-f4a39c715321.sql`
- [ ] Migration 6: `20251225065734_a95027a7-2919-464f-8df7-7978e456edc4.sql`
- [ ] Migration 7: `20251226105942_8af81d52-1d1b-4303-a9af-533a77a5aac4.sql`
- [ ] Migration 8: `20251228102201_f7a3f0e2-eb2d-474a-bae0-accd6244d497.sql`
- [ ] Migration 9: `20251229071745_938c4efb-e508-4fe9-b5f5-13fbc7503169.sql`
- [ ] Migration 10: `20251229210933_allow_employees_manage_tests.sql`
- [ ] Migration 11: `20251230000000_create_test_packages.sql`
- [ ] Migration 12: `20251230000001_create_doctors.sql`
- [ ] Migration 13: `20251230000002_create_test_templates.sql`
- [ ] Migration 14: `20251230000003_create_patient_reminders.sql`
- [ ] Migration 15: `20251230000004_create_multi_lab_support.sql`
- [ ] Migration 16: `20251230083307_b17fc0db-4dd2-448b-a92d-65ff819acbf3.sql`
- [ ] Migration 17: `20251231000000_add_collector_role.sql`
- [ ] Migration 18: `20251231000001_create_custom_roles.sql`
- [ ] Migration 19: `20251231085415_8ec62819-fc29-4d14-9c69-a9128c8ce929.sql`
- [ ] Migration 20: `20250101000000_add_created_by_to_patients.sql` (Run LAST)

### Step 5: Data Migration
- [ ] Export patients table
- [ ] Export employees table
- [ ] Export patient_tests table
- [ ] Export invoices table
- [ ] Export other tables with data
- [ ] Import all CSV files to Supabase

### Step 6: Authentication
- [ ] Enable Email/Password auth
- [ ] Configure OAuth providers (if any)
- [ ] Update OAuth redirect URLs
- [ ] Test user login

### Step 7: Storage
- [ ] Export files from Lovable storage
- [ ] Create buckets in Supabase
- [ ] Upload files to Supabase storage

### Step 8: Edge Functions & Secrets
- [ ] Create `send-email` Edge Function
- [ ] Add `MAILJET_API_KEY` secret
- [ ] Add `MAILJET_SECRET_KEY` secret
- [ ] Add `MAILJET_FROM_EMAIL` secret
- [ ] Add `MAILJET_FROM_NAME` secret
- [ ] Deploy Edge Function

### Step 9: Verification
- [ ] App loads without errors
- [ ] Can create/read database records
- [ ] Authentication works
- [ ] Storage uploads/downloads work
- [ ] Email sending works
- [ ] All features tested

---

## Quick Links

**Supabase Dashboard:** https://supabase.com/dashboard/project/pxsutovdzppoyyfrbeaw

**SQL Editor:** https://supabase.com/dashboard/project/pxsutovdzppoyyfrbeaw/sql

**Edge Functions:** https://supabase.com/dashboard/project/pxsutovdzppoyyfrbeaw/functions

**Storage:** https://supabase.com/dashboard/project/pxsutovdzppoyyfrbeaw/storage/buckets

**Authentication:** https://supabase.com/dashboard/project/pxsutovdzppoyyfrbeaw/auth/providers

---

## Fast Track: Use CLI (Recommended)

If you have Supabase CLI installed:

```bash
# 1. Login
supabase login

# 2. Link project
supabase link --project-ref pxsutovdzppoyyfrbeaw

# 3. Push all migrations at once
supabase db push

# Done! All migrations applied.
```

This is much faster than running them one by one!


