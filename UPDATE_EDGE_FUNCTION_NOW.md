# Update Supabase Edge Function - URGENT

## Problem
You're still getting "Buffer not defined" error because the old nodemailer code is still deployed.

## Solution
Copy the NEW code from `supabase/functions/send-email/index.ts` to your Supabase Edge Function.

## Step-by-Step Instructions

### Step 1: Open Supabase Dashboard
1. Go to [supabase.com](https://supabase.com)
2. Log in to your account
3. Select your project

### Step 2: Navigate to Edge Functions
1. Click on **Edge Functions** in the left sidebar
2. Find the `send-email` function
3. Click on it to open the editor

### Step 3: Replace ALL the Code
1. **Delete ALL existing code** in the editor
2. Copy the ENTIRE code from `supabase/functions/send-email/index.ts` (see below)
3. Paste it into the Supabase Edge Function editor
4. Click **Deploy** or **Save**

### Step 4: Add Mailjet Secrets
1. Go to **Settings** → **Edge Functions** → **Secrets**
2. Add these secrets (click "Add new secret" for each):

```
MAILJET_API_KEY = cb79571d5659c6745f28f555dda16daa
MAILJET_SECRET_KEY = 30b54ec068ada7245c6f20d5396acc9d
MAILJET_FROM_EMAIL = no-reply@irmclinic.com
MAILJET_FROM_NAME = IRM Clinic
```

### Step 5: Test
1. Go to Admin Dashboard → **Notifications** tab
2. Enter your email
3. Click "Send Test Email"
4. The "Buffer not defined" error should be gone!

## Complete Code to Copy

Copy this ENTIRE code block and paste it into your Supabase Edge Function:

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

## Key Differences from Old Code

✅ **NO nodemailer** - Uses REST APIs instead  
✅ **NO Buffer** - Pure HTTP requests, no Node.js dependencies  
✅ **Mailjet support** - Uses Mailjet API directly  
✅ **Works with Deno** - All code is Deno-compatible  

## After Updating

1. The "Buffer not defined" error will disappear
2. Emails will send via Mailjet API
3. No more nodemailer compatibility issues

## Verify It Worked

After deploying, check:
- No more "Buffer not defined" errors
- Test email sends successfully
- Check Supabase Edge Function logs for "mailjet" service confirmation

