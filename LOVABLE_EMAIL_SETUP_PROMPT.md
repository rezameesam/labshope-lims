# Lovable Prompt: Set Up Email Sending via Supabase Edge Function

## Context
We need to set up email notifications using Yandex SMTP. Since `nodemailer` cannot run in the browser, we need a Supabase Edge Function to handle email sending on the server side.

## Step 1: Create Supabase Edge Function

**Prompt for Lovable:**

```
Create a Supabase Edge Function named "send-email" with the following code:

[Copy the entire contents of supabase/functions/send-email/index.ts]
```

Or provide this code directly:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import nodemailer from "https://esm.sh/nodemailer@6.9.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
        JSON.stringify({ error: "Missing required fields: to, subject, htmlContent" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get SMTP configuration from environment variables
    const smtpHost = Deno.env.get("SMTP_HOST") || "smtp.yandex.com";
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "465");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    const smtpFrom = Deno.env.get("SMTP_FROM") || smtpUser;
    const smtpSecure = Deno.env.get("SMTP_SECURE") !== "false";

    if (!smtpUser || !smtpPassword) {
      return new Response(
        JSON.stringify({ error: "SMTP credentials not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
    });

    // Send email
    const info = await transporter.sendMail({
      from: smtpFrom,
      to: to,
      subject: subject,
      html: htmlContent,
      text: textContent || htmlContent.replace(/<[^>]*>/g, ""),
    });

    return new Response(
      JSON.stringify({
        success: true,
        messageId: info.messageId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error sending email:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Failed to send email",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
```

## Step 2: Set Edge Function Secrets

**Prompt for Lovable:**

```
Set the following secrets for the Supabase Edge Function "send-email":

SMTP_HOST=smtp.yandex.com
SMTP_PORT=465
SMTP_USER=no-reply@irmclinic.com
SMTP_PASSWORD=[YOUR_YANDEX_PASSWORD_HERE]
SMTP_FROM=no-reply@irmclinic.com
SMTP_SECURE=true
```

**Important:** Replace `[YOUR_YANDEX_PASSWORD_HERE]` with your actual Yandex email password.

## Step 3: Verify Setup

After the Edge Function is created and secrets are set, test it by:

1. Going to Admin Dashboard → Notifications tab
2. Enter your email address
3. Click "Send Test Email"
4. Check your inbox

## Alternative: Single Combined Prompt

You can give Lovable this single prompt:

```
I need to set up email sending for my clinic management system. Please:

1. Create a Supabase Edge Function named "send-email" that uses nodemailer to send emails via SMTP.

2. The function should:
   - Accept POST requests with JSON body containing: to, subject, htmlContent, textContent
   - Use SMTP configuration from environment variables
   - Return JSON response with success/error status
   - Handle CORS properly

3. Set the following secrets for the Edge Function:
   - SMTP_HOST=smtp.yandex.com
   - SMTP_PORT=465
   - SMTP_USER=no-reply@irmclinic.com
   - SMTP_PASSWORD=[ASK_USER_FOR_PASSWORD]
   - SMTP_FROM=no-reply@irmclinic.com
   - SMTP_SECURE=true

The Edge Function code should be:
[Include the TypeScript code from above]

The frontend code in src/services/notificationService.ts already calls this function at:
${VITE_SUPABASE_URL}/functions/v1/send-email
```

## Notes

- The Edge Function will run on Deno (Supabase's runtime)
- Secrets are stored securely in Supabase and not exposed to the client
- The function uses nodemailer which works in Deno environment
- Make sure to use the actual Yandex password when setting secrets

