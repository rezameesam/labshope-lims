# Fix: Failed to Fetch When Adding Employee

## The Problem

When trying to add an employee, you get:
```
Failed to fetch
```

This means the `create-employee` Edge Function is **not deployed**.

## Quick Fix

### Option 1: Deploy Using CLI (Fastest)

```bash
supabase functions deploy create-employee
```

### Option 2: Deploy Using Dashboard

1. Go to: https://supabase.com/dashboard/project/pxsutovdzppoyyfrbeaw/functions
2. Click **Create a new function**
3. Name it: `create-employee`
4. Copy ALL code from: `supabase/functions/create-employee/index.ts`
5. Paste into the editor
6. Click **Deploy**

### Option 3: Deploy All Functions at Once

```bash
./deploy-all-functions.sh
```

This will deploy:
- ✅ `create-first-admin`
- ✅ `create-employee`
- ✅ `send-email` (re-deploy)

## Verify It's Deployed

1. Go to Supabase Dashboard → **Edge Functions**
2. You should see `create-employee` listed
3. Status should be **Active**

## After Deployment

1. Try adding an employee again
2. Should work now! ✅

## Quick Command

```bash
# Deploy just the create-employee function
supabase functions deploy create-employee
```

That's it! After deploying, adding employees should work. 🎉

