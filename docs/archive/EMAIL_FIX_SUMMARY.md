# Email Service Fix - Summary

## The Issue

Error: **"Email service not configured. Please set RESEND_API_KEY or SMTP credentials."**

This happens because **Mailjet secrets are not set** in the Supabase Edge Function.

## Quick Fix (2 Commands)

```bash
# 1. Set secrets
./set-email-secrets.sh

# 2. Wait 30 seconds, then test
# Go to Admin Dashboard → Notifications → Send Test Email
```

## Manual Fix (If Script Doesn't Work)

### Step 1: Set Secrets in Dashboard

1. Go to: https://supabase.com/dashboard/project/pxsutovdzppoyyfrbeaw/settings/functions
2. Scroll to **Secrets** section
3. Add these 4 secrets:

| Name | Value |
|------|-------|
| `MAILJET_API_KEY` | `cb79571d5659c6745f28f555dda16daa` |
| `MAILJET_SECRET_KEY` | `30b54ec068ada7245c6f20d5396acc9d` |
| `MAILJET_FROM_EMAIL` | `no-reply@irmclinic.com` |
| `MAILJET_FROM_NAME` | `IRM Clinic` |

### Step 2: Redeploy Function

1. Go to **Edge Functions** → **send-email**
2. Click **Deploy** (to refresh and pick up new secrets)

### Step 3: Test

Wait 30 seconds, then test in Admin Dashboard → Notifications

## Why This Happens

The Edge Function code checks for email services in this order:
1. ✅ Mailjet (needs `MAILJET_API_KEY` + `MAILJET_SECRET_KEY`)
2. Resend (needs `RESEND_API_KEY`)
3. Mailgun (needs `MAILGUN_API_KEY`)
4. SendGrid (needs `SENDGRID_API_KEY`)
5. SMTP (needs `SMTP_USER` + `SMTP_PASSWORD`)

If none are configured, it returns the error you're seeing.

## Verification

After setting secrets, verify:
```bash
supabase secrets list
```

Should show:
- ✅ MAILJET_API_KEY
- ✅ MAILJET_SECRET_KEY
- ✅ MAILJET_FROM_EMAIL
- ✅ MAILJET_FROM_NAME

## Still Not Working?

1. **Check Edge Function Logs:**
   - Edge Functions → send-email → Logs
   - Look for specific error messages

2. **Verify API Keys:**
   - Check Mailjet dashboard
   - Verify keys are correct
   - Check account status

3. **Redeploy Function:**
   ```bash
   supabase functions deploy send-email
   ```

---

**After setting secrets and redeploying, emails should work!** 🎉

