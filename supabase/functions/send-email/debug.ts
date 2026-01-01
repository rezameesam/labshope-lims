// Debug version to check what secrets are available
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Check what secrets are available (without showing values)
  const secrets = {
    MAILJET_API_KEY: Deno.env.get("MAILJET_API_KEY") ? "✅ SET" : "❌ NOT SET",
    MAILJET_SECRET_KEY: Deno.env.get("MAILJET_SECRET_KEY") ? "✅ SET" : "❌ NOT SET",
    MAILJET_FROM_EMAIL: Deno.env.get("MAILJET_FROM_EMAIL") || "NOT SET",
    MAILJET_FROM_NAME: Deno.env.get("MAILJET_FROM_NAME") || "NOT SET",
    RESEND_API_KEY: Deno.env.get("RESEND_API_KEY") ? "✅ SET" : "❌ NOT SET",
    SMTP_USER: Deno.env.get("SMTP_USER") ? "✅ SET" : "❌ NOT SET",
    SMTP_PASSWORD: Deno.env.get("SMTP_PASSWORD") ? "✅ SET" : "❌ NOT SET",
  };

  return new Response(
    JSON.stringify({
      message: "Edge Function Secrets Status",
      secrets: secrets,
      note: "This shows which secrets are available to the Edge Function",
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});

