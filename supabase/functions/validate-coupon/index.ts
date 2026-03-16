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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { code, plan } = await req.json();
    if (!code) return json({ valid: false, message: "No code provided." });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Multiple records can share the same code (old ones kept as history).
    // Pick the most recently created active record.
    const { data: rows, error } = await supabase
      .from("platform_coupon_codes")
      .select("id, code, discount_type, discount_value, applicable_plans, max_uses, uses_count, valid_from, valid_until, is_active")
      .eq("code", code.trim().toUpperCase())
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) return json({ valid: false, message: "Unable to validate coupon." });
    const data = rows?.[0];
    if (!data) return json({ valid: false, message: "Invalid or inactive coupon code." });

    const now = new Date();
    if (data.valid_from && new Date(data.valid_from) > now) return json({ valid: false, message: "This coupon is not yet valid." });
    if (data.valid_until && new Date(data.valid_until) < now) return json({ valid: false, message: "This coupon has expired." });
    if (data.max_uses !== null && data.uses_count >= data.max_uses) return json({ valid: false, message: "This coupon has reached its usage limit." });

    if (plan && data.applicable_plans && !data.applicable_plans.includes(plan)) {
      return json({ valid: false, message: `This coupon is not valid for the ${plan} plan.` });
    }

    const suffix = data.discount_type === "percent"
      ? `${data.discount_value}% off`
      : `₹${data.discount_value} off`;

    return json({
      valid: true,
      discount_type: data.discount_type,
      discount_value: data.discount_value,
      applicable_plans: data.applicable_plans,
      message: `Coupon applied — ${suffix}`,
    });
  } catch (e: any) {
    return json({ valid: false, message: "Unable to validate coupon." }, 500);
  }
});
