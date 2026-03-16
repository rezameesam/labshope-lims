import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchScopedSettings } from "../_shared/organization-settings.ts";

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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: authData, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !authData.user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: roleRows, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id);

    if (roleError) {
      throw roleError;
    }

    const isAdmin = (roleRows || []).some((row) => row.role === "admin");
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: memberships, error: membershipError } = await supabaseAdmin
      .from("organization_users")
      .select("organization_id, is_primary")
      .eq("user_id", authData.user.id)
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .limit(1);

    if (membershipError) {
      throw membershipError;
    }

    const organizationId =
      (memberships || [])[0]?.organization_id || null;

    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: "Admin is not linked to an active organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const settingsMap = await fetchScopedSettings(
      supabaseUrl,
      serviceRoleKey,
      ["razorpay_key_id", "razorpay_key_secret", "razorpay_webhook_secret"],
      organizationId,
    );

    return new Response(
      JSON.stringify({
        success: true,
        organization_id: organizationId,
        message: "Organization payment settings retrieved. Update deployed Edge Function secrets manually via CLI or Dashboard when needed.",
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
