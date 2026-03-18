# Buffer Fix Version 2 - Comprehensive Polyfill

The issue is that Buffer needs to be available in multiple global scopes for nodemailer to work.

## Updated Code (Copy to the previous platform):

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Comprehensive Buffer polyfill for nodemailer
// @ts-ignore
import { Buffer } from "npm:buffer@6.0.3";
// @ts-ignore
globalThis.Buffer = Buffer;
// Also set on global for compatibility
// @ts-ignore
if (typeof global !== "undefined") {
  // @ts-ignore
  global.Buffer = Buffer;
}

// @deno-types="npm:@types/nodemailer@6.4.14"
import nodemailer from "npm:nodemailer@6.9.7";

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

## Key Changes

1. Removed the conditional check - always set Buffer
2. Set Buffer on both `globalThis` and `global` for maximum compatibility
3. Ensured Buffer is set before nodemailer import

