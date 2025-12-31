# Email Service Fix - Lovable Prompt

## Problem
Nodemailer doesn't work with Supabase Edge Functions (Deno runtime) due to Node.js dependencies.

## Solution
Replace nodemailer with REST API-based email services (Resend, Mailgun, or SendGrid) that work perfectly with Deno.

## Action Required

### Step 1: Update Supabase Edge Function

Go to your Supabase Dashboard → Edge Functions → `send-email` and replace the entire code with:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
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

    // Try Mailjet first (Best free tier - 6,000 emails/month)
    const mailjetApiKey = Deno.env.get("MAILJET_API_KEY");
    const mailjetSecretKey = Deno.env.get("MAILJET_SECRET_KEY");
    if (mailjetApiKey && mailjetSecretKey) {
      try {
        const mailjetFrom = Deno.env.get("MAILJET_FROM_EMAIL") || "noreply@irmclinic.com";
        const mailjetFromName = Deno.env.get("MAILJET_FROM_NAME") || "IRM Clinic";
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
                Email: mailjetFrom,
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

        if (mailjetResponse.ok && mailjetResult.Messages && mailjetResult.Messages[0]?.Status === "success") {
          return new Response(
            JSON.stringify({ 
              success: true, 
              messageId: mailjetResult.Messages[0].To[0]?.MessageID || "sent", 
              service: "mailjet" 
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } catch (mailjetError) {
        console.error("Mailjet error:", mailjetError);
      }
    }

    // Try Resend (Recommended - Free 3,000 emails/month)
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
            from: { email: "noreply@example.com" },
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

    // No service configured
    return new Response(
      JSON.stringify({
        success: false,
        error: "No email service configured. Please set up Mailjet (recommended), Resend, Mailgun, or SendGrid.",
        setup: "Add MAILJET_API_KEY + MAILJET_SECRET_KEY to Supabase Edge Function secrets. Sign up at https://mailjet.com (free 6,000 emails/month)",
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

### Step 2: Set Up Email Service

#### Option A: Mailjet (Best Free Tier - 6,000 emails/month)

1. **Sign up at [mailjet.com](https://mailjet.com)**
   - Free account, no credit card needed
   - 6,000 emails/month free (highest free tier!)

2. **Get API Keys**
   - Go to Account Settings → API Keys
   - You'll see:
     - API Key (public key)
     - Secret Key (private key)
   - Copy both keys

3. **Add to Supabase Secrets**
   - Go to Supabase Dashboard
   - Settings → Edge Functions → Secrets
   - Add:
     - `MAILJET_API_KEY` = your API key
     - `MAILJET_SECRET_KEY` = your secret key
     - `MAILJET_FROM_EMAIL` = `noreply@yourdomain.com` (optional)
     - `MAILJET_FROM_NAME` = `IRM Clinic` (optional)

#### Option B: Resend (Easiest Setup - 3,000 emails/month)

1. **Sign up at [resend.com](https://resend.com)**
   - Free account, no credit card needed
   - 3,000 emails/month free

2. **Get API Key**
   - Go to API Keys section
   - Create new API key
   - Copy the key (starts with `re_`)

3. **Add to Supabase Secrets**
   - Go to Supabase Dashboard
   - Settings → Edge Functions → Secrets
   - Add:
     - `RESEND_API_KEY` = `re_your_api_key_here`
     - `RESEND_FROM_EMAIL` = `onboarding@resend.dev` (for testing) or `noreply@yourdomain.com` (if you have a domain)

### Step 3: Test

1. Go to Admin Dashboard → **Notifications** tab
2. Enter your email address
3. Click "Send Test Email"
4. Check your inbox!

## Why This Works

- ✅ **No nodemailer**: Uses REST APIs that work with Deno
- ✅ **No Buffer issues**: Pure HTTP requests
- ✅ **Free**: Mailjet gives 6,000 emails/month free (best free tier!)
- ✅ **Simple**: Just API keys, no complex SMTP setup
- ✅ **Reliable**: Better deliverability than SMTP

## Alternative Services

If you prefer other services:
- **Mailgun**: Free 5,000/month - Add `MAILGUN_API_KEY` and `MAILGUN_DOMAIN`
- **SendGrid**: Free 100/day - Add `SENDGRID_API_KEY`

The function tries Resend first, then Mailgun, then SendGrid.

## Remove Old SMTP Config

You can now remove these from Supabase secrets (they're no longer needed):
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM`
- `SMTP_SECURE`

## Done!

After setting up Mailjet (or Resend) and updating the Edge Function, emails should work perfectly! 🎉

**Recommendation**: Use Mailjet for the highest free tier (6,000 emails/month), or Resend for the easiest setup (3,000 emails/month).

