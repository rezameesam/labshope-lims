# Fix for "Buffer is not defined" Error

## Problem
The Edge Function is returning a 500 error: `"Buffer is not defined"`. This happens because `nodemailer` requires Node.js globals that don't exist in Deno.

## Solution
Update the `send-email` Edge Function with this fixed code:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Polyfill Buffer for nodemailer (required for Deno)
import { Buffer } from "npm:buffer@6.0.3";
// @ts-ignore
if (typeof globalThis.Buffer === "undefined") {
  // @ts-ignore
  globalThis.Buffer = Buffer;
}

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

## What Changed
1. Added Buffer polyfill from `npm:buffer@6.0.3`
2. Changed nodemailer import from `esm.sh` to `npm:` specifier (better Deno support)
3. Added type definitions for nodemailer

## Prompt for Lovable

**Copy this to Lovable:**

```
The send-email Edge Function is getting a "Buffer is not defined" error. Please update it with this fixed code that includes a Buffer polyfill:

[Paste the entire code above]
```

