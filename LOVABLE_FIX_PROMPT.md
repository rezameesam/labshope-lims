# Fix Buffer Error - Prompt for Lovable

## The Problem
The `send-email` Edge Function is returning error: `"Buffer is not defined"`

## The Solution
Update the Edge Function to use Deno's built-in Node.js compatibility layer instead of npm:buffer.

---

## Copy This to Lovable:

```
The send-email Edge Function is getting a "Buffer is not defined" error. Please update it with this fixed code:

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Use Deno's built-in Node.js compatibility layer for Buffer
import { Buffer } from "node:buffer";
// @ts-ignore
globalThis.Buffer = Buffer;

// @deno-types="npm:@types/nodemailer@6.4.14"
import nodemailer from "npm:nodemailer@6.9.7";

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
        JSON.stringify({ error: "Missing required fields: to, subject, htmlContent" }),
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
    console.error("Error sending email:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Failed to send email" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

**Key Change:** Replaced `import { Buffer } from "npm:buffer@6.0.3"` with `import { Buffer } from "node:buffer"` to use Deno's built-in Node.js compatibility.

---

## After Lovable Updates the Function

Make sure these secrets are set in Supabase:
- `SMTP_HOST` = `smtp.yandex.com`
- `SMTP_PORT` = `465`
- `SMTP_USER` = `no-reply@irmclinic.com`
- `SMTP_PASSWORD` = `[your_yandex_password]`
- `SMTP_FROM` = `no-reply@irmclinic.com`
- `SMTP_SECURE` = `true`

You can set these in:
- Supabase Dashboard → Settings → Edge Functions → Secrets
- Or ask Lovable to set them

