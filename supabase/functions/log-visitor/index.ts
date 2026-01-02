import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ConsentPayload = {
  version?: string;
  analytics?: boolean;
  personalization?: boolean;
  ads?: boolean;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const eventType = typeof body.event_type === "string" ? body.event_type : "page_view";
    const path = typeof body.path === "string" ? body.path : null;
    const referrer = typeof body.referrer === "string" ? body.referrer : null;
    const consent = typeof body.consent === "object" ? (body.consent as ConsentPayload) : null;

    const forwardedFor = req.headers.get("x-forwarded-for") || "";
    const ip = forwardedFor.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
    const userAgent = req.headers.get("user-agent") || null;

    const { error } = await supabaseAdmin.from("visitor_logs").insert({
      event_type: eventType,
      path,
      referrer,
      consent,
      ip,
      user_agent: userAgent,
    });

    if (error) {
      console.error("Failed to log visitor:", error);
      return new Response(
        JSON.stringify({ error: "Failed to log visitor" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
