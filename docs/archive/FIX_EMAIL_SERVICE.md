# Fix Email Service

## Quick Diagnosis

The email service requires:
1. ✅ Edge Function deployed (`send-email`)
2. ❌ **Secrets configured** (MAILJET_API_KEY, MAILJET_SECRET_KEY)
3. ✅ Function code correct

## Step 1: Check if Secrets are Set

1. Go to Supabase Dashboard → **Settings** → **Edge Functions** → **Secrets**
2. Check if these secrets exist:
   - `MAILJET_API_KEY`
   - `MAILJET_SECRET_KEY`
   - `MAILJET_FROM_EMAIL` (optional, defaults to no-reply@irmclinic.com)
   - `MAILJET_FROM_NAME` (optional, defaults to IRM Clinic)

## Step 2: Set Mailjet Secrets

If secrets are missing, add them:

### Option A: Using Supabase CLI

```bash
supabase secrets set \
  MAILJET_API_KEY=cb79571d5659c6745f28f555dda16daa \
  MAILJET_SECRET_KEY=30b54ec068ada7245c6f20d5396acc9d \
  MAILJET_FROM_EMAIL=no-reply@irmclinic.com \
  MAILJET_FROM_NAME="IRM Clinic"
```

### Option B: Using Supabase Dashboard

1. Go to **Settings** → **Edge Functions** → **Secrets**
2. Click **Add new secret** for each:
   - **Name**: `MAILJET_API_KEY`
   - **Value**: `cb79571d5659c6745f28f555dda16daa`
   - Click **Save**

   - **Name**: `MAILJET_SECRET_KEY`
   - **Value**: `30b54ec068ada7245c6f20d5396acc9d`
   - Click **Save**

   - **Name**: `MAILJET_FROM_EMAIL`
   - **Value**: `no-reply@irmclinic.com`
   - Click **Save**

   - **Name**: `MAILJET_FROM_NAME`
   - **Value**: `IRM Clinic`
   - Click **Save**

## Step 3: Verify Edge Function is Deployed

1. Go to Supabase Dashboard → **Edge Functions**
2. Check if `send-email` is listed and **Active**
3. If not, deploy it (see `DEPLOY_ALL_EDGE_FUNCTIONS.md`)

## Step 4: Test the Email Service

### Option A: Using Admin Dashboard

1. Go to Admin Dashboard → **Notifications** tab
2. Enter your email address
3. Click **Send Test Email**
4. Check for errors in the console (F12 → Console)

### Option B: Test Edge Function Directly

1. Go to Supabase Dashboard → **Edge Functions** → **send-email**
2. Click **Invoke function**
3. Use this test payload:

```json
{
  "to": "your-email@example.com",
  "subject": "Test Email",
  "htmlContent": "<h1>Test</h1><p>This is a test email.</p>"
}
```

4. Click **Invoke**
5. Check the response for errors

## Step 5: Check Function Logs

1. Go to Supabase Dashboard → **Edge Functions** → **send-email**
2. Click **Logs** tab
3. Look for error messages
4. Common errors:
   - "No email service configured" → Secrets not set
   - "Mailjet API error" → Check API keys
   - "Failed to send email" → Check Mailjet account status

## Troubleshooting

### Error: "No email service configured"
**Solution**: Set the Mailjet secrets (Step 2)

### Error: "Mailjet API error" or "401 Unauthorized"
**Solution**: 
- Verify API keys are correct
- Check Mailjet account is active
- Verify API keys have send permissions

### Error: "Failed to fetch" or Network Error
**Solution**:
- Check Supabase URL is correct in `.env`
- Verify Edge Function is deployed
- Check browser console for CORS errors

### Email Not Received
**Solution**:
- Check spam folder
- Verify recipient email is correct
- Check Mailjet dashboard for delivery status
- Verify Mailjet account hasn't hit rate limits

## Verify Secrets are Set

Run this in Supabase SQL Editor to check (won't show values, just if they exist):

```sql
-- This won't work directly, but you can check in Dashboard
-- Settings → Edge Functions → Secrets
```

Or use CLI:
```bash
supabase secrets list
```

## Quick Fix Script

Run this to set all secrets at once:

```bash
./set-email-secrets.sh
```

Or manually:
```bash
supabase secrets set \
  MAILJET_API_KEY=cb79571d5659c6745f28f555dda16daa \
  MAILJET_SECRET_KEY=30b54ec068ada7245c6f20d5396acc9d \
  MAILJET_FROM_EMAIL=no-reply@irmclinic.com \
  MAILJET_FROM_NAME="IRM Clinic"
```

