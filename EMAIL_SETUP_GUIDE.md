# Email Notification Setup Guide

## Quick Start

Get email notifications working in 5 minutes!

## Step 1: Sign Up for Resend

1. Go to [resend.com](https://resend.com)
2. Click "Sign Up" (free account)
3. Verify your email address

## Step 2: Get Your API Key

1. After logging in, go to **API Keys** in the sidebar
2. Click **"Create API Key"**
3. Give it a name (e.g., "Clinic Notifications")
4. Copy the API key (starts with `re_`)
   - ⚠️ **Important**: Copy it now - you won't be able to see it again!

## Step 3: Set Up Your "From" Email

You have two options:

### Option A: Use Resend's Test Domain (Quick Start)
- Resend provides a test email: `onboarding@resend.dev`
- You can use this for testing immediately
- **Limitation**: Emails will be marked as "via resend.dev"

### Option B: Use Your Own Domain (Recommended for Production)
1. Go to **Domains** in Resend dashboard
2. Click **"Add Domain"**
3. Enter your domain (e.g., `yourclinic.com`)
4. Add the DNS records Resend provides to your domain
5. Wait for verification (usually a few minutes)
6. Once verified, use any email from that domain (e.g., `noreply@yourclinic.com`)

## Step 4: Install the Package

In your project directory, run:

```bash
npm install resend
```

## Step 5: Add Environment Variables

Create or edit your `.env` file in the project root:

```env
VITE_RESEND_API_KEY=re_your_api_key_here
VITE_RESEND_FROM_EMAIL=onboarding@resend.dev
```

**For production with your own domain:**
```env
VITE_RESEND_API_KEY=re_your_api_key_here
VITE_RESEND_FROM_EMAIL=noreply@yourclinic.com
```

## Step 6: Restart Your Development Server

After adding environment variables:

1. Stop your dev server (Ctrl+C)
2. Start it again: `npm run dev`

Environment variables are loaded when the server starts.

## Step 7: Test It!

1. Go to your Admin Dashboard
2. Navigate to **Settings** → **Notifications** (or wherever you added NotificationSettings)
3. Enter your email address in the test field
4. Click **"Send Test Email"**
5. Check your inbox!

## What Works Now

Once configured, these features work automatically:

✅ **Test Result Notifications**
- When you mark a test as "completed" in ManageTests
- Patient automatically receives an email with their results

✅ **Reminder Notifications**
- Click "Send Now" button in ManageReminders
- Sends email to patient

✅ **Promotional Messages**
- Use SendPromotion component
- Send bulk emails to selected patients

✅ **Payment Reminders**
- Can be triggered programmatically
- Sends email reminders for outstanding invoices

## Resend Pricing

### Free Tier
- **3,000 emails/month** - Perfect for getting started!
- No credit card required
- Full API access

### Paid Plans
- **$20/month**: 50,000 emails
- **$80/month**: 200,000 emails
- Pay-as-you-go after that

**For a clinic with 1,000 patients:**
- If each patient gets 3 notifications/month = 3,000 emails
- **You can stay on the free tier!** 🎉

## Troubleshooting

### "Email service not configured" Error

**Problem**: API key not found

**Solution**:
1. Check `.env` file exists in project root
2. Verify variable name is exactly: `VITE_RESEND_API_KEY`
3. Make sure API key starts with `re_`
4. Restart your dev server after adding variables

### "Failed to send email" Error

**Problem**: API key invalid or domain not verified

**Solution**:
1. Check Resend dashboard → API Keys (make sure key is active)
2. If using custom domain, verify it's verified in Resend
3. Check Resend dashboard → Logs for detailed error messages

### Email Goes to Spam

**Problem**: Using test domain or domain not properly configured

**Solution**:
1. Use your own verified domain (Option B above)
2. Set up SPF and DKIM records (Resend provides these)
3. Warm up your domain by sending gradually increasing volumes

### Environment Variables Not Loading

**Problem**: Variables not accessible in browser

**Solution**:
1. Make sure variables start with `VITE_` (required for Vite)
2. Restart dev server after changing `.env`
3. Check browser console for errors
4. Variables are only available in client-side code

## Security Best Practices

1. **Never commit `.env` to git**
   - `.env` should be in `.gitignore`
   - Use `.env.example` for documentation

2. **Rotate API keys periodically**
   - Generate new key in Resend
   - Update `.env` file
   - Delete old key

3. **Use different keys for dev/prod**
   - `.env.development` for local
   - `.env.production` for production
   - Never use production key in development

## Next Steps

Once email is working:

1. ✅ Test with a real patient email
2. ✅ Mark a test as completed and verify notification
3. ✅ Send a reminder manually
4. ✅ Try promotional messaging

## Future: Adding SMS (Optional)

SMS can be added later by:
1. Setting up Twilio account
2. Adding Twilio environment variables
3. Installing `twilio` package
4. The code already supports it - just needs configuration!

## Support

- **Resend Docs**: [resend.com/docs](https://resend.com/docs)
- **Resend Support**: support@resend.com
- **Check Resend Dashboard**: Logs show all sent emails and errors

---

**That's it!** Your email notification system is ready to use. 🚀

