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
  invoice_ids?: string[];
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
    const { invoice_id, invoice_ids, amount }: CreateOrderRequest = await req.json();

    const bulkIds = Array.isArray(invoice_ids) ? invoice_ids.filter(Boolean) : [];
    const isBulk = bulkIds.length > 0;
    if ((!invoice_id && !isBulk) || !amount || amount <= 0) {
      return new Response(JSON.stringify({ error: "invoice_id (or invoice_ids) and amount are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const query = supabaseAdmin
      .from("invoices")
      .select("id, invoice_number, final_amount, paid_amount, patient_id, organization_id, patients!inner(user_id)");

    const { data: invoices } = isBulk
      ? await query.in("id", bulkIds)
      : await query.eq("id", invoice_id).limit(1);

    if (!invoices || invoices.length === 0) {
      return new Response(JSON.stringify({ error: "Invoice(s) not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ownerUserId = (invoices[0].patients as any)?.user_id;
    const isPatientOwner = ownerUserId === user.id;
    if (!isPatientOwner) {
      const { data: userRoles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", user.id);
      const hasStaffRole = userRoles?.some((r) => r.role === "admin" || r.role === "employee");
      if (!hasStaffRole) {
        return new Response(JSON.stringify({ error: "Access denied" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const orgIds = new Set(invoices.map((i: any) => i.organization_id).filter(Boolean));
    if (orgIds.size > 1) {
      return new Response(JSON.stringify({ error: "Invoices must belong to same organization" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const organizationId = Array.from(orgIds)[0] || null;

    const invoicePayments = invoices
      .map((inv: any) => ({
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        amount: Math.max(0, Number(inv.final_amount) - Number(inv.paid_amount || 0)),
      }))
      .filter((x) => x.amount > 0);

    if (invoicePayments.length === 0) {
      return new Response(JSON.stringify({ error: "No outstanding invoices to pay" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const totalOutstanding = invoicePayments.reduce((sum, x) => sum + x.amount, 0);
    const payAmountPaise = Math.round(Math.min(amount, totalOutstanding) * 100);

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
    const merchantTransactionId = `${isBulk ? "BULK" : "INV"}_${Date.now()}`;
    const redirectUrl = `${origin}/patient/billing?phonepe_txn=${merchantTransactionId}`;

    const payload = {
      merchantId,
      merchantTransactionId,
      merchantUserId: user.id,
      amount: payAmountPaise,
      redirectUrl,
      redirectMode: "REDIRECT",
      callbackUrl: `${supabaseUrl}/functions/v1/confirm-phonepe-payment`,
      mobileNumber: "",
      paymentInstrument: { type: "PAY_PAGE" },
    };

    const base64Payload = btoa(JSON.stringify(payload));
    const apiPath = "/pg/v1/pay";
    const checksum = await sha256Hex(base64Payload + apiPath + saltKey);
    const xVerify = `${checksum}###${saltIndex}`;

    const response = await fetch(`${configuredBaseUrl}${apiPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-VERIFY": xVerify },
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