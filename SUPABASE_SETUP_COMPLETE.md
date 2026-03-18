# Complete Supabase Setup Guide

## Your Supabase Project Details

**Project ID:** `pxsutovdzppoyyfrbeaw`  
**Project URL:** `https://pxsutovdzppoyyfrbeaw.supabase.co`  
**Publishable Key:** `sb_publishable_FBGkelHPPulufbpPPDbSRA_OqyUCSul`  
**Secret Key:** `sb_secret_kJgY8LDkG9rsxc8wlfmyIQ_LMvra2p0`

---

## Step 1: Update Environment Variables in the previous platform

1. Go to your **the previous platform project** → **Code**
2. Open the `.env` file
3. Update these values:

```env
VITE_SUPABASE_PROJECT_ID="pxsutovdzppoyyfrbeaw"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_FBGkelHPPulufbpPPDbSRA_OqyUCSul"
VITE_SUPABASE_URL="https://pxsutovdzppoyyfrbeaw.supabase.co"
```

4. **Save** the file

---

## Step 2: Update Supabase Config (if exists)

1. In your the previous platform project, go to **Code**
2. Locate `supabase/config.toml` file (if it exists)
3. Update:

```toml
project_id = "pxsutovdzppoyyfrbeaw"
```

4. **Save** the file

---

## Step 3: Add Edge Function to Supabase

### 3.1 Create the Edge Function

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project (`pxsutovdzppoyyfrbeaw`)
3. Click **Edge Functions** in the left sidebar
4. Click **Create a new function**
5. Name it: `send-email`
6. Click **Create function**

### 3.2 Add the Code

1. In the code editor, **delete all existing code**
2. Copy the **ENTIRE** code from `supabase/functions/send-email/index.ts` (see below)
3. Paste it into the Supabase editor
4. Click **Deploy**

**Complete Code to Copy:**

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { to, subject, htmlContent, textContent } = await req.json();

    if (!to || !subject || !htmlContent) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: to, subject, htmlContent",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Try Mailjet first (if API key is configured) - Free 6,000 emails/month
    const mailjetApiKey = Deno.env.get("MAILJET_API_KEY");
    const mailjetSecretKey = Deno.env.get("MAILJET_SECRET_KEY");
    if (mailjetApiKey && mailjetSecretKey) {
      try {
        const mailjetFromEmail = Deno.env.get("MAILJET_FROM_EMAIL") || "no-reply@irmclinic.com";
        const mailjetFromName = Deno.env.get("MAILJET_FROM_NAME") || "IRM Clinic";
        
        // Create Basic Auth header (API Key:Secret Key)
        const auth = btoa(`${mailjetApiKey}:${mailjetSecretKey}`);
        
        const mailjetResponse = await fetch("https://api.mailjet.com/v3.1/send", {
          method: "POST",
          headers: {
            "Authorization": `Basic ${auth}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            Messages: [{
              From: {
                Email: mailjetFromEmail,
                Name: mailjetFromName,
              },
              To: [{
                Email: to,
              }],
              Subject: subject,
              HTMLPart: htmlContent,
              TextPart: textContent || htmlContent.replace(/<[^>]*>/g, ""),
            }],
          }),
        });

        const mailjetResult = await mailjetResponse.json();

        // Check if the response is successful
        if (mailjetResponse.ok && mailjetResult.Messages && mailjetResult.Messages[0]?.Status === "success") {
          const messageId = mailjetResult.Messages[0].To?.[0]?.MessageID || 
                           mailjetResult.Messages[0].To?.[0]?.MessageUUID ||
                           "sent";
          return new Response(
            JSON.stringify({ 
              success: true, 
              messageId: messageId, 
              service: "mailjet" 
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        } else {
          // Log error details for debugging
          console.error("Mailjet API error:", {
            status: mailjetResponse.status,
            statusText: mailjetResponse.statusText,
            result: mailjetResult,
          });
        }
      } catch (mailjetError) {
        console.error("Mailjet request error:", mailjetError);
        // Fall through to next service
      }
    }

    // Try Resend (if API key is configured)
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (resendApiKey) {
      try {
        const resendFrom = Deno.env.get("RESEND_FROM_EMAIL") || "onboarding@resend.dev";
        
        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: resendFrom,
            to: to,
            subject: subject,
            html: htmlContent,
            text: textContent || htmlContent.replace(/<[^>]*>/g, ""),
          }),
        });

        const resendResult = await resendResponse.json();

        if (resendResponse.ok && resendResult.id) {
          return new Response(
            JSON.stringify({ success: true, messageId: resendResult.id, service: "resend" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } catch (resendError) {
        console.error("Resend error:", resendError);
        // Fall through to next service
      }
    }

    // Try Mailgun if configured
    const mailgunApiKey = Deno.env.get("MAILGUN_API_KEY");
    const mailgunDomain = Deno.env.get("MAILGUN_DOMAIN");
    
    if (mailgunApiKey && mailgunDomain) {
      try {
        const mailgunUrl = `https://api.mailgun.net/v3/${mailgunDomain}/messages`;
        const auth = btoa(`api:${mailgunApiKey}`);
        
        const formData = new FormData();
        formData.append("from", `noreply@${mailgunDomain}`);
        formData.append("to", to);
        formData.append("subject", subject);
        formData.append("html", htmlContent);
        if (textContent) {
          formData.append("text", textContent);
        }

        const mailgunResponse = await fetch(mailgunUrl, {
          method: "POST",
          headers: {
            "Authorization": `Basic ${auth}`,
          },
          body: formData,
        });

        const mailgunResult = await mailgunResponse.json();

        if (mailgunResponse.ok && mailgunResult.id) {
          return new Response(
            JSON.stringify({ success: true, messageId: mailgunResult.id, service: "mailgun" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } catch (mailgunError) {
        console.error("Mailgun error:", mailgunError);
      }
    }

    // Try SendGrid if configured
    const sendgridApiKey = Deno.env.get("SENDGRID_API_KEY");
    if (sendgridApiKey) {
      try {
        const sendgridResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${sendgridApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            personalizations: [{
              to: [{ email: to }],
            }],
            from: { email: "no-reply@irmclinic.com" },
            subject: subject,
            content: [
              {
                type: "text/html",
                value: htmlContent,
              },
              ...(textContent ? [{
                type: "text/plain",
                value: textContent,
              }] : []),
            ],
          }),
        });

        if (sendgridResponse.ok) {
          const sendgridHeaders = sendgridResponse.headers.get("x-message-id");
          return new Response(
            JSON.stringify({ success: true, messageId: sendgridHeaders || "sent", service: "sendgrid" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } catch (sendgridError) {
        console.error("SendGrid error:", sendgridError);
      }
    }

    // If all else fails, return error with setup instructions
    return new Response(
      JSON.stringify({
        success: false,
        error: "No email service configured. Please set up one of:",
        options: {
          mailjet: "Free 6,000 emails/month - https://mailjet.com (Best free tier)",
          resend: "Free 3,000 emails/month - https://resend.com (Easiest setup)",
          mailgun: "Free 5,000 emails/month - https://mailgun.com",
          sendgrid: "Free 100 emails/day - https://sendgrid.com",
        },
        setup: "Add MAILJET_API_KEY + MAILJET_SECRET_KEY (or RESEND_API_KEY, MAILGUN_API_KEY, or SENDGRID_API_KEY) to Supabase Edge Function secrets",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Error sending email:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || "Failed to send email",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
```

---

## Step 4: Add Mailjet Secrets to Supabase

1. In Supabase Dashboard, go to **Edge Functions** → **Manage Secrets**
2. Click **Add new secret** for each of these:

```
Name: MAILJET_API_KEY
Value: cb79571d5659c6745f28f555dda16daa

Name: MAILJET_SECRET_KEY
Value: 30b54ec068ada7245c6f20d5396acc9d

Name: MAILJET_FROM_EMAIL
Value: no-reply@irmclinic.com

Name: MAILJET_FROM_NAME
Value: IRM Clinic
```

3. Click **Save** for each secret

---

## Step 5: Verify Email Sender in Mailjet

1. Go to [Mailjet Dashboard](https://app.mailjet.com)
2. Navigate to **Account Settings** → **Sender & Domains**
3. Make sure `no-reply@irmclinic.com` is verified
4. If not verified, add it and verify (Mailjet will send a verification email)

---

## Step 6: Test Email Sending

1. Go to your app (the previous platform preview or deployed version)
2. Navigate to **Admin Dashboard** → **Notifications** tab
3. Enter your email address
4. Click **"Send Test Email"**
5. Check your inbox!

---

## Step 7: Run Database Migrations (if needed)

If you have migration files in `supabase/migrations/`:

1. In Supabase Dashboard, go to **SQL Editor**
2. For each migration file (in chronological order):
   - Copy the SQL content
   - Paste into SQL Editor
   - Click **Run**
   - Wait for success message

---

## Troubleshooting

### "Buffer not defined" error
- ✅ **Fixed!** The new code doesn't use nodemailer/Buffer
- Make sure you copied the NEW code (not the old one)

### "No email service configured" error
- Check that Mailjet secrets are added in Supabase Edge Functions → Manage Secrets
- Verify secret names are exactly: `MAILJET_API_KEY` and `MAILJET_SECRET_KEY`

### Email not sending
- Check Supabase Edge Function logs for errors
- Verify `no-reply@irmclinic.com` is verified in Mailjet
- Check browser console for error messages

### Edge Function not found
- Make sure the function is named exactly: `send-email`
- Verify it's deployed (should show "Active" status)

---

## Summary Checklist

- [ ] Updated `.env` file in the previous platform with new Supabase credentials
- [ ] Updated `supabase/config.toml` (if exists)
- [ ] Created `send-email` Edge Function in Supabase
- [ ] Copied new code (no nodemailer) to Edge Function
- [ ] Added Mailjet secrets to Supabase Edge Functions
- [ ] Verified email sender in Mailjet
- [ ] Tested email sending
- [ ] Ran database migrations (if any)

---

## You're All Set! 🎉

After completing these steps:
- ✅ Emails will send via Mailjet API
- ✅ No more "Buffer not defined" errors
- ✅ 6,000 free emails/month
- ✅ Professional email delivery

