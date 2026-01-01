# Fix Email Service - Step by Step

## The Problem

The error "Email service not configured. Please set RESEND_API_KEY or SMTP credentials" means:
- **Mailjet secrets are NOT set** in Supabase Edge Function
- The code checks Mailjet first, but can't find the keys

## The Fix (3 Steps)

### Step 1: Set Mailjet Secrets

**Easiest Method - Using Script:**
```bash
./set-email-secrets.sh
```

**Or Using Supabase CLI:**
```bash
supabase secrets set \
  MAILJET_API_KEY=cb79571d5659c6745f28f555dda16daa \
  MAILJET_SECRET_KEY=30b54ec068ada7245c6f20d5396acc9d \
  MAILJET_FROM_EMAIL=no-reply@irmclinic.com \
  MAILJET_FROM_NAME="IRM Clinic"
```

**Or Using Dashboard:**
1. Go to: https://supabase.com/dashboard/project/pxsutovdzppoyyfrbeaw/settings/functions
2. Scroll to **Secrets** section
3. Click **Add new secret** for each:
   - `MAILJET_API_KEY` = `cb79571d5659c6745f28f555dda16daa`
   - `MAILJET_SECRET_KEY` = `30b54ec068ada7245c6f20d5396acc9d`
   - `MAILJET_FROM_EMAIL` = `no-reply@irmclinic.com`
   - `MAILJET_FROM_NAME` = `IRM Clinic`

### Step 2: Redeploy Edge Function (Important!)

After setting secrets, redeploy to ensure it picks them up:

```bash
supabase functions deploy send-email
```

**Or in Dashboard:**
1. Go to **Edge Functions** → **send-email**
2. Click **Deploy** (even if already deployed, this refreshes it)

### Step 3: Wait & Test

1. **Wait 30 seconds** for secrets to propagate
2. Test in Admin Dashboard → **Notifications** tab
3. Or test directly:
   - Go to **Edge Functions** → **send-email** → **Invoke function**
   - Use payload:
   ```json
   {
     "to": "your-email@example.com",
     "subject": "Test",
     "htmlContent": "<h1>Test Email</h1>"
   }
   ```

## Verify Secrets Are Set

**Using CLI:**
```bash
supabase secrets list
```

You should see:
- `MAILJET_API_KEY` ✅
- `MAILJET_SECRET_KEY` ✅

**Using Dashboard:**
- Settings → Edge Functions → Secrets
- Should list all 4 Mailjet secrets

## If Still Not Working

1. **Check Edge Function Logs:**
   - Edge Functions → send-email → Logs
   - Look for "Mailjet API error" or other errors

2. **Verify API Keys:**
   - Log in to Mailjet dashboard
   - Verify the API keys are correct
   - Check account is active

3. **Test with curl:**
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

## Quick Command Summary

```bash
# 1. Set secrets
./set-email-secrets.sh

# 2. Redeploy function
supabase functions deploy send-email

# 3. Verify secrets
supabase secrets list

# 4. Test
# Go to Admin Dashboard → Notifications → Send Test Email
```

---

**That's it!** After setting secrets and redeploying, emails should work. 🎉

