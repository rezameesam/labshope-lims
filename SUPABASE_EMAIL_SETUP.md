# Supabase Edge Function Email Setup

## Problem

`nodemailer` is a Node.js library that cannot run in the browser. We need to send emails from the server-side using a Supabase Edge Function.

## Solution

I've created a Supabase Edge Function that handles email sending on the server. Here's how to set it up:

## Step 1: Deploy the Edge Function

The Edge Function is already created at:
```
supabase/functions/send-email/index.ts
```

### Deploy it using Supabase CLI:

```bash
# Install Supabase CLI if you haven't
npm install -g supabase

# Login to Supabase
supabase login

# Link your project (if not already linked)
supabase link --project-ref your-project-ref

# Deploy the function
supabase functions deploy send-email
```

### Or deploy via Supabase Dashboard:

1. Go to your Supabase project dashboard
2. Navigate to **Edge Functions**
3. Click **Create a new function**
4. Name it `send-email`
5. Copy the code from `supabase/functions/send-email/index.ts`
6. Click **Deploy**

## Step 2: Set Environment Variables

In your Supabase project dashboard:

1. Go to **Settings** → **Edge Functions** → **Secrets**
2. Add these secrets (from your `.env` file):

```
SMTP_HOST=smtp.yandex.com
SMTP_PORT=465
SMTP_USER=no-reply@irmclinic.com
SMTP_PASSWORD=your_yandex_password_here
SMTP_FROM=no-reply@irmclinic.com
SMTP_SECURE=true
```

**Important**: These are server-side secrets, not client-side environment variables!

## Step 3: Update Your Code

The `notificationService.ts` has already been updated to call the Edge Function instead of trying to use nodemailer in the browser.

## Step 4: Test It

1. Go to Admin Dashboard → **Notifications** tab
2. Enter your email address
3. Click "Send Test Email"
4. Check your inbox!

## How It Works

1. **Client-side** (`notificationService.ts`): Makes a POST request to the Edge Function
2. **Server-side** (Edge Function): Uses nodemailer to send email via Yandex SMTP
3. **Response**: Returns success/error back to the client

## Troubleshooting

### "Function not found" Error

**Problem**: Edge Function not deployed

**Solution**: 
- Deploy the function using Supabase CLI or Dashboard
- Make sure the function name is exactly `send-email`

### "SMTP credentials not configured" Error

**Problem**: Secrets not set in Supabase

**Solution**:
- Go to Supabase Dashboard → Settings → Edge Functions → Secrets
- Add all SMTP_* secrets

### "Failed to send email" Error

**Problem**: SMTP connection issue

**Solution**:
- Check Yandex password is correct
- Verify SMTP_HOST, SMTP_PORT, SMTP_SECURE are correct
- Check Supabase function logs for detailed error

### Check Function Logs

In Supabase Dashboard:
1. Go to **Edge Functions** → **send-email**
2. Click **Logs** tab
3. See detailed error messages

## Alternative: Quick Test Without Edge Function

If you want to test quickly without setting up Edge Functions, you can temporarily use a service like Resend which has a browser-compatible SDK. But for production with Yandex SMTP, the Edge Function is the correct approach.

## Next Steps

1. ✅ Deploy the Edge Function
2. ✅ Set the SMTP secrets in Supabase
3. ✅ Test email sending
4. ✅ Verify emails are received

Your email system will now work properly! 🚀

