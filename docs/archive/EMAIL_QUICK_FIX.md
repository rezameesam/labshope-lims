# Email Service Quick Fix

## The Problem

Email service is not working because **secrets are not set** in the Supabase Edge Function.

## Quick Fix (2 Steps)

### Step 1: Set Secrets

**Option A: Using Script (Easiest)**
```bash
./set-email-secrets.sh
```

**Option B: Using CLI**
```bash
supabase secrets set \
  MAILJET_API_KEY=cb79571d5659c6745f28f555dda16daa \
  MAILJET_SECRET_KEY=30b54ec068ada7245c6f20d5396acc9d \
  MAILJET_FROM_EMAIL=no-reply@irmclinic.com \
  MAILJET_FROM_NAME="IRM Clinic"
```

**Option C: Using Dashboard**
1. Go to Supabase Dashboard → **Settings** → **Edge Functions** → **Secrets**
2. Add these 4 secrets:
   - `MAILJET_API_KEY` = `cb79571d5659c6745f28f555dda16daa`
   - `MAILJET_SECRET_KEY` = `30b54ec068ada7245c6f20d5396acc9d`
   - `MAILJET_FROM_EMAIL` = `no-reply@irmclinic.com`
   - `MAILJET_FROM_NAME` = `IRM Clinic`

### Step 2: Test

1. Go to Admin Dashboard → **Notifications** tab
2. Enter your email
3. Click **Send Test Email**
4. Check your inbox!

## Verify It's Working

After setting secrets, test the Edge Function:
1. Supabase Dashboard → **Edge Functions** → **send-email**
2. Click **Invoke function**
3. Use this payload:
```json
{
  "to": "your-email@example.com",
  "subject": "Test",
  "htmlContent": "<h1>Test Email</h1>"
}
```
4. Should return `{"success": true, "service": "mailjet"}`

## Common Errors

- **"No email service configured"** → Secrets not set (do Step 1)
- **"401 Unauthorized"** → Wrong API keys (check Mailjet account)
- **"Failed to fetch"** → Edge Function not deployed or wrong URL

---

**That's it!** After setting secrets, emails should work immediately. 🎉

