# Exact Fix for Buffer Error

## The Problem
Line 4-8 in the Edge Function uses `npm:buffer@6.0.3` which causes "Buffer is not defined" error.

## The Fix
Replace lines 3-8 with this:

```typescript
// Use Deno's built-in Node.js compatibility layer for Buffer
import { Buffer } from "node:buffer";
// @ts-ignore
globalThis.Buffer = Buffer;
```

## Complete Updated Code

Here's the full fixed code to replace the entire Edge Function:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Use Deno's built-in Node.js compatibility layer for Buffer
import { Buffer } from "node:buffer";
// @ts-ignore
globalThis.Buffer = Buffer;

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

## What Changed

**OLD (lines 3-8):**
```typescript
// Polyfill Buffer for nodemailer (required for Deno)
import { Buffer } from "npm:buffer@6.0.3";
// @ts-ignore
if (typeof globalThis.Buffer === "undefined") {
  // @ts-ignore
  globalThis.Buffer = Buffer;
}
```

**NEW (lines 3-6):**
```typescript
// Use Deno's built-in Node.js compatibility layer for Buffer
import { Buffer } from "node:buffer";
// @ts-ignore
globalThis.Buffer = Buffer;
```

## Prompt for Lovable

Copy this to Lovable:

```
The send-email Edge Function has a "Buffer is not defined" error. Please update it by replacing lines 3-8 with:

// Use Deno's built-in Node.js compatibility layer for Buffer
import { Buffer } from "node:buffer";
// @ts-ignore
globalThis.Buffer = Buffer;

Or replace the entire function with the code from EXACT_FIX_FOR_LOVABLE.md
```

