# Email Service Setup Guide

## Problem
Nodemailer doesn't work well with Supabase Edge Functions (Deno runtime) due to Node.js dependencies like Buffer.

## Solution
We've replaced nodemailer with REST API-based email services that work perfectly with Deno.

## Recommended Options

### Option 1: Mailjet (Best Free Tier)
- ✅ **Free**: 6,000 emails/month (highest free tier!)
- ✅ **Simple**: Just API key + secret key
- ✅ **Works with Deno**: REST API, no dependencies
- ✅ **Great deliverability**
- ✅ **No credit card required**

### Option 2: Resend (Easiest Setup)
- ✅ **Free**: 3,000 emails/month
- ✅ **Simple**: Just an API key
- ✅ **Works with Deno**: REST API, no dependencies
- ✅ **Great deliverability**
- ✅ **No credit card required**

### Setup Steps for Mailjet:

1. **Sign up at [mailjet.com](https://mailjet.com)**
   - Free account, no credit card needed
   - 6,000 emails/month free

2. **Get your API Keys**
   - Go to Account Settings → API Keys
   - You'll see:
     - API Key (public key)
     - Secret Key (private key)
   - Copy both keys

3. **Add to Supabase Edge Function Secrets**
   - Go to your Supabase Dashboard
   - Navigate to **Settings** → **Edge Functions** → **Secrets**
   - Add these secrets:
     ```
     MAILJET_API_KEY=your_api_key_here
     MAILJET_SECRET_KEY=your_secret_key_here
     MAILJET_FROM_EMAIL=noreply@yourdomain.com
     MAILJET_FROM_NAME=IRM Clinic
     ```
   - **Note**: `MAILJET_FROM_EMAIL` and `MAILJET_FROM_NAME` are optional

### Setup Steps for Resend:

1. **Sign up at [resend.com](https://resend.com)**
   - Free account, no credit card needed

2. **Get your API Key**
   - Go to API Keys section
   - Click "Create API Key"
   - Copy the key (starts with `re_`)

3. **Add to Supabase Edge Function Secrets**
   - Go to your Supabase Dashboard
   - Navigate to **Settings** → **Edge Functions** → **Secrets**
   - Add these secrets:
     ```
     RESEND_API_KEY=re_your_api_key_here
     RESEND_FROM_EMAIL=noreply@yourdomain.com
     ```
   - **Note**: If you don't have a domain, you can use `onboarding@resend.dev` for testing

4. **Deploy/Update the Edge Function**
   - The function is already updated in `supabase/functions/send-email/index.ts`
   - If using Lovable, copy the updated code to the Edge Function in Supabase Dashboard
   - Or deploy via CLI: `supabase functions deploy send-email`

5. **Test It**
   - Go to Admin Dashboard → **Notifications** tab
   - Enter your email
   - Click "Send Test Email"

## Alternative Options

### Option 2: Mailgun (Free 5,000 emails/month)

1. Sign up at [mailgun.com](https://mailgun.com)
2. Get API key and domain
3. Add to Supabase secrets:
   ```
   MAILGUN_API_KEY=your_api_key
   MAILGUN_DOMAIN=yourdomain.com
   ```

### Option 3: SendGrid (Free 100 emails/day)

1. Sign up at [sendgrid.com](https://sendgrid.com)
2. Get API key
3. Add to Supabase secrets:
   ```
   SENDGRID_API_KEY=your_api_key
   ```

## Priority Order

The Edge Function tries services in this order:
1. **Mailjet** (if `MAILJET_API_KEY` and `MAILJET_SECRET_KEY` are set) - **Best free tier**
2. **Resend** (if `RESEND_API_KEY` is set) - **Easiest setup**
3. **Mailgun** (if `MAILGUN_API_KEY` is set)
4. **SendGrid** (if `SENDGRID_API_KEY` is set)

## Migration from Yandex SMTP

If you were using Yandex SMTP:
1. Sign up for Resend (free)
2. Add `RESEND_API_KEY` to Supabase secrets
3. Remove SMTP secrets (they're no longer needed)
4. Test the email function

## Troubleshooting

### "No email service configured"
- Make sure you've added the API key to Supabase Edge Function secrets (not client-side env vars)
- Check that the secret name matches exactly: `RESEND_API_KEY`

### "Failed to send email"
- Verify your API key is correct
- Check Resend dashboard for any errors
- Make sure `RESEND_FROM_EMAIL` is set (or use `onboarding@resend.dev` for testing)

### Testing
- Use the "Send Test Email" button in Admin Dashboard → Notifications
- Check browser console for detailed error messages
- Check Supabase Edge Function logs in the dashboard

## Cost Comparison

| Service | Free Tier | Best For |
|---------|-----------|----------|
| **Mailjet** | **6,000/month** | **Best free tier** - Highest limit |
| **Resend** | 3,000/month | **Easiest setup** - Simplest configuration |
| Mailgun | 5,000/month | Alternative option |
| SendGrid | 3,000/month (100/day) | Alternative option |

## Next Steps

1. ✅ Sign up for Resend
2. ✅ Add API key to Supabase secrets
3. ✅ Test email sending
4. ✅ Remove old SMTP configuration (optional)

The new implementation is much more reliable and doesn't have the Buffer/nodemailer issues!

