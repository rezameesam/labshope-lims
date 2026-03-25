import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const PLAN_PRICES: Record<string, number> = { starter: 10000, growth: 20000, premium: 40000 };
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

    const { organization_id, to_plan, years: rawYears } = await req.json();
    const years = Math.min(3, Math.max(1, Math.round(Number(rawYears) || 1)));

    if (!organization_id || !to_plan || !VALID_PLANS.includes(to_plan)) {
      return json({ error: "organization_id and a valid to_plan are required" }, 400);
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

    // Get current plan from organization_settings
    const { data: planSetting } = await supabaseAdmin
      .from("organization_settings")
      .select("setting_value")
      .eq("organization_id", organization_id)
      .eq("setting_key", "plan_tier")
      .maybeSingle();

    const fromPlan: string = (planSetting as any)?.setting_value || "starter";
    const fromPrice = PLAN_PRICES[fromPlan] ?? 10000;
    const toPrice = PLAN_PRICES[to_plan] ?? 10000;
    // Same plan = renewal at full price × years; upgrade = price difference × years
    const isRenewal = fromPlan === to_plan;
    const upgradeAmount = isRenewal ? toPrice * years : (toPrice - fromPrice) * years;

    if (upgradeAmount <= 0) {
      return json({ error: "to_plan must be a higher-tier plan than the current plan" }, 400);
    }

    // Get platform Razorpay keys (from system_settings, then env)
    const { data: sysSettings } = await supabaseAdmin
      .from("system_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["razorpay_key_id", "razorpay_key_secret"]);

    const settingsMap = new Map(
      ((sysSettings || []) as { setting_key: string; setting_value: string | null }[])
        .map((s) => [s.setting_key, s.setting_value ?? ""])
    );

    const razorpayKeyId = settingsMap.get("razorpay_key_id") || Deno.env.get("RAZORPAY_KEY_ID") || "";
    const razorpayKeySecret = settingsMap.get("razorpay_key_secret") || Deno.env.get("RAZORPAY_KEY_SECRET") || "";

    if (!razorpayKeyId || !razorpayKeySecret) {
      return json({ error: "Payment gateway is not configured" }, 500);
    }

    const orderData = {
      amount: Math.round(upgradeAmount * 100), // paise
      currency: "INR",
      receipt: `PLAN-${organization_id.substring(0, 8)}-${Date.now()}`,
      notes: {
        upgrade_type: "plan_upgrade",
        organization_id,
        from_plan: fromPlan,
        to_plan,
        years,
        user_id: user.id,
      },
    };

    const razorpayResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(`${razorpayKeyId}:${razorpayKeySecret}`)}`,
      },
      body: JSON.stringify(orderData),
    });

    if (!razorpayResponse.ok) {
      const err = await razorpayResponse.json();
      console.error("Razorpay order creation failed:", err);
      return json({ error: err.error?.description || "Failed to create payment order" }, 500);
    }

    const order = await razorpayResponse.json();

    return json({
      order_id: order.id,
      amount: orderData.amount,
      currency: "INR",
      key_id: razorpayKeyId,
      from_plan: fromPlan,
      to_plan,
      upgrade_amount: upgradeAmount,
    });
  } catch (e: any) {
    console.error("create-plan-upgrade-order error:", e);
    return json({ error: e.message || "Internal error" }, 500);
  }
});
