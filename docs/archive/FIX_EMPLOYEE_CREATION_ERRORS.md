# Fix Employee Creation Errors

## The Errors

1. **CORS Error**: "Response to preflight request doesn't pass access control check"
2. **401 Unauthorized**: Authentication failed
3. **Failed to fetch**: Network error

## The Problems

1. **CORS headers incomplete** - Missing `Access-Control-Allow-Methods`
2. **Edge Function not deployed** - `create-employee` function doesn't exist
3. **OPTIONS response** - Needs to return "ok" not null

## The Fix

### Step 1: Update the Code (Already Fixed)

I've updated `supabase/functions/create-employee/index.ts` to:
- ✅ Add `Access-Control-Allow-Methods` header
- ✅ Return "ok" for OPTIONS requests

### Step 2: Deploy the Function

**Using CLI:**
```bash
supabase functions deploy create-employee
```

**Using Dashboard:**
1. Go to: https://supabase.com/dashboard/project/pxsutovdzppoyyfrbeaw/functions
2. Click **Create a new function**
3. Name: `create-employee`
4. Copy ALL code from `supabase/functions/create-employee/index.ts`
5. Click **Deploy**

### Step 3: Verify Deployment

1. Check Edge Functions list - should see `create-employee` ✅
2. Status should be **Active**

### Step 4: Test

1. Try adding an employee again
2. Should work now! ✅

## Why This Happened

The CORS error occurs because:
- Browser sends OPTIONS request first (preflight)
- Edge Function must respond with proper CORS headers
- Missing `Access-Control-Allow-Methods` caused the failure

The 401 error occurs because:
- Function checks if user is admin
- If you just added the `user_roles` entry, make sure you're logged in as that admin user
- The function verifies the auth token and admin role

## Quick Command

```bash
# Deploy the fixed function
supabase functions deploy create-employee
```

After deployment, employee creation should work! 🎉

