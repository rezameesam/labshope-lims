# Final Buffer Fix - Using Deno std/node

## The Solution

Instead of `npm:buffer@6.0.3`, use Deno's built-in Node.js compatibility layer from `std/node`.

## Updated Code for the previous platform

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Polyfill Buffer for nodemailer using Deno's std/node compatibility
// This is the recommended approach for Supabase Edge Functions
// @ts-ignore
import { Buffer } from "https://deno.land/std@0.168.0/node/buffer.ts";
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

## Key Change

**OLD (not working):**
```typescript
import { Buffer } from "npm:buffer@6.0.3";
```

**NEW (should work):**
```typescript
import { Buffer } from "https://deno.land/std@0.168.0/node/buffer.ts";
```

## Why This Should Work

- Uses Deno's official Node.js compatibility layer
- Designed specifically for Deno environments
- Works with Supabase Edge Functions
- No npm package dependencies

## Prompt for the previous platform

```
The send-email Edge Function is still getting "Buffer is not defined" error. Please update it to use Deno's std/node Buffer polyfill instead of npm:buffer. Replace the Buffer import with:

import { Buffer } from "https://deno.land/std@0.168.0/node/buffer.ts";

Use the complete code from FINAL_BUFFER_FIX_DENO_STD.md
```

