# Fix: Secrets Not Being Read by Edge Function

## The Problem

Even though secrets are set (you can see them with `supabase secrets list`), the Edge Function is still returning:
```
Email service not configured. Please set RESEND_API_KEY or SMTP credentials.
```

This means `Deno.env.get("MAILJET_API_KEY")` is returning `undefined`.

## Possible Causes

1. **Secrets need time to propagate** (can take 1-3 minutes)
2. **Edge Function needs to be restarted** after setting secrets
3. **Deployed code is different** from local code
4. **Secrets are set but not accessible** to the function

## Solutions (Try in Order)

### Solution 1: Wait and Redeploy

```bash
# Wait 2-3 minutes, then redeploy
supabase functions deploy send-email
```

### Solution 2: Verify Deployed Code Matches Local

1. Go to Supabase Dashboard → **Edge Functions** → **send-email**
2. Check the code - it should start with checking `MAILJET_API_KEY` (around line 29)
3. If the code is different, copy the code from `supabase/functions/send-email/index.ts` and paste it
4. Click **Deploy**

### Solution 3: Add Debug Function (Temporary)

I've created a debug function to check what secrets are available:

1. Deploy the debug function:
   ```bash
   supabase functions deploy debug --no-verify-jwt
   ```
   (Or create it manually in Dashboard with the code from `supabase/functions/send-email/debug.ts`)

2. Test it:
   - Go to Edge Functions → **debug** → **Invoke function**
   - Should show which secrets are available

3. This will tell us if secrets are actually accessible

### Solution 4: Check Edge Function Logs

1. Go to **Edge Functions** → **send-email** → **Logs**
2. Look for:
   - "Mailjet API error" - means keys are being read but API call failed
   - No Mailjet logs - means keys are not being read
   - Check for any error messages

### Solution 5: Manual Secret Verification

1. Go to **Settings** → **Edge Functions** → **Secrets**
2. Verify secrets are listed:
   - `MAILJET_API_KEY` ✅
   - `MAILJET_SECRET_KEY` ✅
3. If missing, add them manually in Dashboard
4. After adding, wait 2 minutes
5. Redeploy: `supabase functions deploy send-email`

### Solution 6: Try Alternative - Set RESEND_API_KEY

If Mailjet continues to have issues, you can use Resend instead:

1. Sign up at https://resend.com (free 3,000 emails/month)
2. Get API key from Resend dashboard
3. Set secret:
   ```bash
   supabase secrets set RESEND_API_KEY=re_your_api_key_here
   ```
4. Redeploy function
5. Test

## Quick Test

After trying solutions above, test with:

```bash
curl -X POST "https://pxsutovdzppoyyfrbeaw.supabase.co/functions/v1/send-email" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sb_publishable_FBGkelHPPulufbpPPDbSRA_OqyUCSul" \
  -d '{
    "to": "your-email@example.com",
    "subject": "Test",
    "htmlContent": "<h1>Test</h1>"
  }'
```

Check the response - if it still says "Email service not configured", the secrets are not being read.

## Most Likely Fix

**Try this first:**

1. **Wait 2-3 minutes** (secrets need time to propagate)
2. **Redeploy the function:**
   ```bash
   supabase functions deploy send-email
   ```
3. **Test again**

If that doesn't work, check the Edge Function code in Dashboard to make sure it matches the local file.

