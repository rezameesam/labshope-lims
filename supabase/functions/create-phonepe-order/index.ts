import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchScopedSettings } from "../_shared/organization-settings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CreateOrderRequest {
  invoice_id?: string;
  amount: number;
  patient_name?: string;
  patient_email?: string;
  patient_phone?: string;
}

const extractBearerToken = (authHeader: string | null): string | null => {
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
};

const sha256Hex = async (message: string) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const accessToken = extractBearerToken(req.headers.get("Authorization"));
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(accessToken);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { invoice_id, amount }: CreateOrderRequest = await req.json();

    if (!invoice_id || !amount || amount <= 0) {
      return new Response(JSON.stringify({ error: "invoice_id and amount are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: invoice } = await supabaseAdmin
      .from("invoices")
      .select("id, invoice_number, final_amount, paid_amount, patient_id, organization_id, patients!inner(user_id)")
      .eq("id", invoice_id)
      .single();

    if (!invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const invoicePatientUserId = (invoice.patients as any)?.user_id;
    const isPatientOwner = invoicePatientUserId === user.id;
    if (!isPatientOwner) {
      const { data: userRoles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", user.id);
      const hasStaffRole = userRoles?.some((r) => r.role === "admin" || r.role === "employee");
      if (!hasStaffRole) {
        return new Response(JSON.stringify({ error: "Access denied" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const outstandingAmount = Number(invoice.final_amount) - Number(invoice.paid_amount || 0);
    if (outstandingAmount <= 0) {
      return new Response(JSON.stringify({ error: "Invoice is already settled" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const payAmountPaise = Math.round(Math.min(amount, outstandingAmount) * 100);
    const organizationId = (invoice as any).organization_id || null;

    const settingsMap = await fetchScopedSettings(
      supabaseUrl,
      serviceRoleKey,
      ["phonepe_merchant_id", "phonepe_salt_key", "phonepe_salt_index", "phonepe_base_url"],
      organizationId,
    );

    const merchantId = settingsMap.get("phonepe_merchant_id")?.trim() || Deno.env.get("PHONEPE_MERCHANT_ID") || "";
    const saltKey = settingsMap.get("phonepe_salt_key")?.trim() || Deno.env.get("PHONEPE_SALT_KEY") || "";
    const saltIndex = settingsMap.get("phonepe_salt_index")?.trim() || Deno.env.get("PHONEPE_SALT_INDEX") || "1";
    const configuredBaseUrl = settingsMap.get("phonepe_base_url")?.trim() || Deno.env.get("PHONEPE_BASE_URL") || "https://api-preprod.phonepe.com/apis/pg-sandbox";

    if (!merchantId || !saltKey) {
      return new Response(JSON.stringify({ error: "PhonePe is not configured for this organization" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://example.com";
    const merchantTransactionId = `INV_${invoice_id.replace(/-/g, "").slice(0, 24)}_${Date.now()}`;
    const callbackUrl = `${supabaseUrl}/functions/v1/confirm-phonepe-payment`;
    const redirectUrl = `${origin}/patient/billing?phonepe_txn=${merchantTransactionId}&invoice_id=${invoice_id}`;

    const payload = {
      merchantId,
      merchantTransactionId,
      merchantUserId: user.id,
      amount: payAmountPaise,
      redirectUrl,
      redirectMode: "REDIRECT",
      callbackUrl,
      mobileNumber: "",
      paymentInstrument: { type: "PAY_PAGE" },
    };

    const base64Payload = btoa(JSON.stringify(payload));
    const apiPath = "/pg/v1/pay";
    const checksum = await sha256Hex(base64Payload + apiPath + saltKey);
    const xVerify = `${checksum}###${saltIndex}`;

    const response = await fetch(`${configuredBaseUrl}${apiPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-VERIFY": xVerify,
      },
      body: JSON.stringify({ request: base64Payload }),
    });

    const result = await response.json();
    if (!response.ok || result?.success === false) {
      return new Response(JSON.stringify({ error: result?.message || "Failed to create PhonePe order", details: result }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const checkoutUrl = result?.data?.instrumentResponse?.redirectInfo?.url;
    if (!checkoutUrl) {
      return new Response(JSON.stringify({ error: "PhonePe checkout URL missing", details: result }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      success: true,
      checkout_url: checkoutUrl,
      merchant_transaction_id: merchantTransactionId,
      amount: payAmountPaise,
      currency: "INR",
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("create-phonepe-order error", error);
    return new Response(JSON.stringify({ error: error.message || "Failed to create PhonePe order" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});