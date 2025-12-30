# Email & SMS Notification Setup Guide

## Overview

The clinic management system now supports automated email and SMS notifications for:
- **Test Results**: Automatic notifications when test results are ready
- **Reminders**: Scheduled reminders for follow-ups, checkups, payments, etc.
- **Promotions**: Bulk promotional messages to patients
- **Payment Reminders**: Automated reminders for outstanding invoices

## Current Status

✅ **Infrastructure Ready**: Notification service and UI components are implemented
⚠️ **Services Not Configured**: Email/SMS services need to be set up with API keys

## Setup Instructions

### 1. Email Setup (Resend - Recommended)

#### Why Resend?
- Simple API
- Good free tier (3,000 emails/month)
- Easy domain verification
- Great developer experience

#### Steps:
1. **Sign up** at [resend.com](https://resend.com)
2. **Get API Key**:
   - Go to API Keys section
   - Create a new API key
   - Copy the key (starts with `re_`)
3. **Verify Domain** (for production):
   - Add your domain in Resend dashboard
   - Add DNS records as instructed
   - Use verified email as "from" address
4. **Add to Environment Variables**:
   ```env
   VITE_RESEND_API_KEY=re_your_api_key_here
   VITE_RESEND_FROM_EMAIL=noreply@yourclinic.com
   ```

### 2. SMS Setup (Twilio)

#### Why Twilio?
- Industry standard
- Reliable delivery
- Good pricing for India
- Supports WhatsApp Business API (future)

#### Steps:
1. **Sign up** at [twilio.com](https://twilio.com)
2. **Get Credentials**:
   - Account SID (starts with `AC`)
   - Auth Token
   - Phone Number (purchase from Twilio)
3. **Add to Environment Variables**:
   ```env
   VITE_TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   VITE_TWILIO_AUTH_TOKEN=your_auth_token_here
   VITE_TWILIO_PHONE_NUMBER=+1234567890
   ```

### 3. Install Required Packages

```bash
npm install resend twilio
```

### 4. Test Configuration

1. Go to **Admin Dashboard** → **Settings** → **Notifications** (or add this tab)
2. Use the test buttons to verify:
   - Email service is working
   - SMS service is working

## Features

### 1. Automatic Test Result Notifications

When a test result is marked as "completed" in ManageTests:
- System automatically sends notification to patient
- Uses email if available, otherwise SMS
- Can send both if configured

**No action needed** - works automatically once configured.

### 2. Reminder Notifications

Reminders can be sent manually or scheduled:
- **Manual**: Click "Send Now" button in ManageReminders
- **Scheduled**: Set up a cron job or scheduled function (see below)

### 3. Promotional Messages

New component: **SendPromotion**
- Select multiple patients
- Compose message
- Choose email, SMS, or both
- Send bulk promotional messages

### 4. Payment Reminders

Can be triggered manually or automatically:
```typescript
import { sendPaymentReminder } from "@/services/notificationService";
await sendPaymentReminder(patientId, amount, invoiceNumber);
```

## Scheduled Reminders (Optional)

To automatically send reminders on their due date, set up a scheduled function:

### Option 1: Supabase Edge Function (Recommended)

Create `supabase/functions/send-reminders/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Get reminders due today that haven't been sent
  const today = new Date().toISOString().split("T")[0];
  const { data: reminders } = await supabase
    .from("patient_reminders")
    .select("*")
    .eq("reminder_date", today)
    .eq("notification_sent", false)
    .eq("is_completed", false);

  if (!reminders || reminders.length === 0) {
    return new Response(JSON.stringify({ message: "No reminders to send" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Send each reminder
  for (const reminder of reminders) {
    try {
      const { sendReminderNotification } = await import("@/services/notificationService");
      await sendReminderNotification(reminder.id);
    } catch (error) {
      console.error(`Failed to send reminder ${reminder.id}:`, error);
    }
  }

  return new Response(JSON.stringify({ sent: reminders.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

Schedule with Supabase Cron or external service (cron-job.org, etc.)

### Option 2: External Cron Service

Use services like:
- [cron-job.org](https://cron-job.org)
- [EasyCron](https://www.easycron.com)
- [Zapier](https://zapier.com)

Set up to call your API endpoint daily.

## Cost Estimates

### Resend (Email)
- **Free Tier**: 3,000 emails/month
- **Paid**: $20/month for 50,000 emails
- **Per Email**: $0.0004 after free tier

### Twilio (SMS)
- **India**: ~₹0.50-1.00 per SMS
- **US**: ~$0.0075 per SMS
- **Volume discounts** available

### Estimated Monthly Cost (1000 patients, 5 notifications/month)
- **Email**: Free (within 3,000 limit)
- **SMS**: ~₹2,500-5,000/month (if all via SMS)
- **Mixed**: ~₹1,000-2,500/month (email + SMS)

## Troubleshooting

### Email Not Sending
1. Check Resend API key is correct
2. Verify "from" email is verified in Resend
3. Check Resend dashboard for delivery status
4. Check spam folder

### SMS Not Sending
1. Verify Twilio credentials
2. Check phone number format (should start with +)
3. Check Twilio console for errors
4. Verify account has credits

### Notifications Not Triggering
1. Check browser console for errors
2. Verify environment variables are set
3. Check service configuration in NotificationSettings component

## Security Notes

- **Never commit** API keys to git
- Use environment variables only
- Rotate keys periodically
- Monitor usage for unusual activity
- Set up rate limiting if needed

## Future Enhancements

- [ ] WhatsApp Business API integration
- [ ] Email templates with branding
- [ ] SMS templates
- [ ] Delivery tracking
- [ ] Notification preferences per patient
- [ ] Unsubscribe functionality
- [ ] Analytics dashboard

## Support

For issues:
1. Check service provider dashboards (Resend/Twilio)
2. Review error logs in browser console
3. Test with NotificationSettings component
4. Verify environment variables are loaded correctly

