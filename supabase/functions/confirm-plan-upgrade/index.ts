import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Razorpay payment signature: HMAC-SHA256(order_id + "|" + payment_id, key_secret)
async function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const buf = await crypto.subtle.sign("HMAC", key, encoder.encode(`${orderId}|${paymentId}`));
    const expected = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return expected === signature;
  } catch {
    return false;
  }
}

const VALID_PLANS = ["starter", "growth", "premium"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authentication required" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) return json({ error: "Invalid token" }, 401);

    const {
      organization_id,
      to_plan,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
    } = await req.json();

    if (
      !organization_id || !to_plan || !VALID_PLANS.includes(to_plan) ||
      !razorpay_payment_id || !razorpay_order_id || !razorpay_signature
    ) {
      return json({ error: "Missing required fields" }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify user is an admin of this org
    const { data: membership } = await supabaseAdmin
      .from("organization_users")
      .select("role")
      .eq("organization_id", organization_id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!membership) return json({ error: "Access denied" }, 403);

    // Get platform Razorpay key secret to verify signature
    const { data: sysSettings } = await supabaseAdmin
      .from("system_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["razorpay_key_secret"]);

    const settingsMap = new Map(
      ((sysSettings || []) as { setting_key: string; setting_value: string | null }[])
        .map((s) => [s.setting_key, s.setting_value ?? ""])
    );

    const razorpayKeySecret =
      settingsMap.get("razorpay_key_secret") || Deno.env.get("RAZORPAY_KEY_SECRET") || "";

    if (!razorpayKeySecret) {
      return json({ error: "Payment gateway is not configured" }, 500);
    }

    // Verify Razorpay signature — proves the payment genuinely happened
    const isValid = await verifyRazorpaySignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      razorpayKeySecret,
    );

    if (!isValid) {
      console.error("Invalid Razorpay signature for plan upgrade", { razorpay_order_id, razorpay_payment_id });
      return json({ error: "Payment verification failed" }, 400);
    }

    // Upgrade plan in organization_settings
    const { error: settingsError } = await supabaseAdmin
      .from("organization_settings")
      .upsert(
        {
          organization_id,
          setting_key: "plan_tier",
          setting_value: to_plan,
          setting_type: "text",
          category: "general",
          label: "Plan Tier",
          description: "Current subscription plan",
          is_encrypted: false,
        },
        { onConflict: "organization_id,setting_key" },
      );

    if (settingsError) {
      console.error("Failed to update plan_tier in organization_settings:", settingsError);
      return json({ error: "Failed to update plan" }, 500);
    }

    // Activate the organization and clear the trial deadline
    const { error: activateError } = await supabaseAdmin
      .from("organizations")
      .update({
        status: "active",
        trial_ends_at: null,
        plan_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", organization_id);

    if (activateError) {
      console.error("Failed to activate organization after payment:", activateError);
      return json({ error: "Failed to activate organization" }, 500);
    }

    // Also update the linked onboarding request if one exists (best-effort)
    const { error: onboardingError } = await supabaseAdmin
      .from("platform_onboarding_requests")
      .update({ selected_plan: to_plan })
      .eq("provisioned_organization_id", organization_id);
    if (onboardingError) {
      console.warn("Could not sync plan to onboarding request (non-fatal):", onboardingError.message);
    }

    console.log(`Plan upgraded to ${to_plan} for org ${organization_id} by user ${user.id}`);

    return json({ success: true, plan: to_plan });
  } catch (e: any) {
    console.error("confirm-plan-upgrade error:", e);
    return json({ error: e.message || "Internal error" }, 500);
  }
});
