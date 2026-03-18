# Deploy All Edge Functions

You have 3 edge functions that need to be deployed to your new Supabase project.

## Functions to Deploy

1. ✅ `send-email` - Already deployed
2. ❌ `create-first-admin` - Needs deployment
3. ❌ `create-employee` - Needs deployment

## Deployment Steps

### Option 1: Using Supabase CLI (Recommended)

```bash
# Make sure you're linked
supabase link --project-ref pxsutovdzppoyyfrbeaw

# Deploy all functions
supabase functions deploy create-first-admin
supabase functions deploy create-employee
supabase functions deploy send-email  # Re-deploy to ensure it's up to date
```

### Option 2: Using Supabase Dashboard

For each function:

1. Go to Supabase Dashboard → Edge Functions
2. Click **Create a new function**
3. Name it (e.g., `create-first-admin`)
4. Copy the code from `supabase/functions/create-first-admin/index.ts`
5. Paste into the editor
6. Click **Deploy**

Repeat for:
- `create-employee` (code from `supabase/functions/create-employee/index.ts`)
- `send-email` (code from `supabase/functions/send-email/index.ts`)

## Verify Deployment

After deploying, check:
1. Supabase Dashboard → Edge Functions
2. You should see all 3 functions listed
3. Status should be "Active"

## Set Function Secrets (if needed)

Some functions may need secrets. Check each function's code for environment variables:

```bash
# For send-email (if not already set)
supabase secrets set \
  MAILJET_API_KEY=your-key \
  MAILJET_SECRET_KEY=your-secret \
  MAILJET_FROM_EMAIL=no-reply@irmclinic.com \
  MAILJET_FROM_NAME="IRM Clinic"
```

## Test Functions

After deployment, you can test them in the Dashboard:
1. Go to Edge Functions → Select function
2. Click **Invoke function**
3. Enter test payload
4. Check response

