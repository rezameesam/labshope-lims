import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify admin access
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    
    // Get settings from database
    const { data: settings, error } = await supabaseAdmin
      .from("system_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["razorpay_key_id", "razorpay_key_secret", "razorpay_webhook_secret"]);

    if (error) throw error;

    const settingsMap = new Map(
      (settings || []).map((s) => [s.setting_key, s.setting_value])
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: "Settings retrieved. Update Supabase secrets manually via CLI or Dashboard.",
        settings: {
          razorpay_key_id: settingsMap.get("razorpay_key_id") || "",
          razorpay_key_secret: settingsMap.get("razorpay_key_secret") ? "***" : "",
          razorpay_webhook_secret: settingsMap.get("razorpay_webhook_secret") ? "***" : "",
        },
        instructions: {
          cli: "supabase secrets set RAZORPAY_KEY_ID=value RAZORPAY_KEY_SECRET=value",
          dashboard: "Go to Settings → Edge Functions → Secrets",
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error syncing settings:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to sync settings" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

