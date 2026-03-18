# Email Service Diagnosis

## The Error

```
Email service not configured. Please set RESEND_API_KEY or SMTP credentials.
```

This error comes from **line 135** of the Edge Function, which means:
- ❌ Mailjet API keys are **NOT set** or **NOT being read**
- ❌ Resend API key is **NOT set**
- ❌ SMTP credentials are **NOT set**

## The Code Flow

The Edge Function checks services in this order:
1. **Mailjet** (lines 29-88) - Checks for `MAILJET_API_KEY` and `MAILJET_SECRET_KEY`
2. **Resend** (lines 91-123) - Checks for `RESEND_API_KEY`
3. **Mailgun** (lines 147-183) - Checks for `MAILGUN_API_KEY` and `MAILGUN_DOMAIN`
4. **SendGrid** (lines 186-224) - Checks for `SENDGRID_API_KEY`
5. **SMTP Fallback** (lines 125-140) - Checks for `SMTP_USER` and `SMTP_PASSWORD`
6. **Error** (line 135) - Returns the error you're seeing

## The Fix

### Step 1: Verify Secrets Are Set

**Using Supabase CLI:**
```bash
supabase secrets list
```

You should see:
- `MAILJET_API_KEY`
- `MAILJET_SECRET_KEY`

**Using Dashboard:**
1. Go to Supabase Dashboard → **Settings** → **Edge Functions** → **Secrets**
2. Check if `MAILJET_API_KEY` and `MAILJET_SECRET_KEY` are listed

### Step 2: Set Secrets (If Missing)

**Option A: Using Script**
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
1. Go to **Settings** → **Edge Functions** → **Secrets**
2. Click **Add new secret**
3. Add each secret:
   - Name: `MAILJET_API_KEY`, Value: `cb79571d5659c6745f28f555dda16daa`
   - Name: `MAILJET_SECRET_KEY`, Value: `30b54ec068ada7245c6f20d5396acc9d`
   - Name: `MAILJET_FROM_EMAIL`, Value: `no-reply@irmclinic.com`
   - Name: `MAILJET_FROM_NAME`, Value: `IRM Clinic`

### Step 3: Verify Edge Function Code

Make sure the deployed Edge Function has the latest code that checks for Mailjet first.

1. Go to Supabase Dashboard → **Edge Functions** → **send-email**
2. Check the code - it should start with checking `MAILJET_API_KEY` (line 29)
3. If the code is different, redeploy:
   ```bash
   supabase functions deploy send-email
   ```

### Step 4: Test

**Option A: Using Test Script**
```bash
./test-email-service.sh
```

**Option B: Using Dashboard**
1. Go to **Edge Functions** → **send-email** → **Invoke function**
2. Use this payload:
```json
{
  "to": "your-email@example.com",
  "subject": "Test",
  "htmlContent": "<h1>Test</h1>"
}
```

**Option C: Using Admin Dashboard**
1. Go to Admin Dashboard → **Notifications** tab
2. Enter your email
3. Click **Send Test Email**

## Common Issues

### Issue 1: Secrets Not Set
**Symptom**: Error message about "Email service not configured"
**Solution**: Set Mailjet secrets (Step 2)

### Issue 2: Secrets Set But Not Working
**Symptom**: Still getting error after setting secrets
**Solution**: 
- Wait 1-2 minutes for secrets to propagate
- Redeploy the Edge Function: `supabase functions deploy send-email`
- Check Edge Function logs for errors

### Issue 3: Wrong API Keys
**Symptom**: "401 Unauthorized" or "Mailjet API error"
**Solution**: 
- Verify API keys in Mailjet dashboard
- Check Mailjet account is active
- Verify keys have send permissions

### Issue 4: Edge Function Not Deployed
**Symptom**: "Failed to fetch" or network error
**Solution**: Deploy the function:
```bash
supabase functions deploy send-email
```

## Quick Checklist

- [ ] Edge Function `send-email` is deployed and Active
- [ ] Secret `MAILJET_API_KEY` is set
- [ ] Secret `MAILJET_SECRET_KEY` is set
- [ ] Edge Function code checks Mailjet first (line 29)
- [ ] Test email works

## Still Not Working?

1. Check Edge Function logs:
   - Supabase Dashboard → **Edge Functions** → **send-email** → **Logs**
   - Look for error messages

2. Test with curl:
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

3. Check Mailjet account:
   - Log in to Mailjet dashboard
   - Verify API keys are correct
   - Check account status and limits

