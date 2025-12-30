# Simple Prompt for Lovable

Copy and paste this to Lovable:

---

**I need to set up email sending using Yandex SMTP. Please create a Supabase Edge Function to handle this.**

## Task 1: Create Edge Function

Create a Supabase Edge Function named `send-email` with this code:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import nodemailer from "https://esm.sh/nodemailer@6.9.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { to, subject, htmlContent, textContent } = await req.json();

    if (!to || !subject || !htmlContent) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const smtpHost = Deno.env.get("SMTP_HOST") || "smtp.yandex.com";
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "465");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    const smtpFrom = Deno.env.get("SMTP_FROM") || smtpUser;
    const smtpSecure = Deno.env.get("SMTP_SECURE") !== "false";

    if (!smtpUser || !smtpPassword) {
      return new Response(
        JSON.stringify({ error: "SMTP credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: { user: smtpUser, pass: smtpPassword },
    });

    const info = await transporter.sendMail({
      from: smtpFrom,
      to: to,
      subject: subject,
      html: htmlContent,
      text: textContent || htmlContent.replace(/<[^>]*>/g, ""),
    });

    return new Response(
      JSON.stringify({ success: true, messageId: info.messageId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Failed to send email" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

## Task 2: Set Edge Function Secrets

Set these secrets for the `send-email` Edge Function:

- `SMTP_HOST` = `smtp.yandex.com`
- `SMTP_PORT` = `465`
- `SMTP_USER` = `no-reply@irmclinic.com`
- `SMTP_PASSWORD` = `[I will provide the password separately]`
- `SMTP_FROM` = `no-reply@irmclinic.com`
- `SMTP_SECURE` = `true`

**Note:** The frontend code in `src/services/notificationService.ts` already calls this function at `${VITE_SUPABASE_URL}/functions/v1/send-email`

---

## After Lovable Sets It Up

Once Lovable creates the function, you'll need to provide the Yandex password. You can either:

1. **Tell Lovable the password directly** in a follow-up message
2. **Or set it yourself** if Lovable gives you access to the Supabase dashboard

The password should be set as the `SMTP_PASSWORD` secret for the Edge Function.

