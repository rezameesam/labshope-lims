import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchScopedSettings } from "../_shared/organization-settings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    const body = await req.json();
    const invoiceId = (body.invoice_id || "").trim();
    const merchantTransactionId = (body.merchant_transaction_id || "").trim();

    if (!invoiceId || !merchantTransactionId) {
      return new Response(JSON.stringify({ error: "invoice_id and merchant_transaction_id are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: invoice } = await supabaseAdmin
      .from("invoices")
      .select("id, final_amount, paid_amount, organization_id, patients!inner(user_id)")
      .eq("id", invoiceId)
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

    const orgId = (invoice as any).organization_id || null;
    const settingsMap = await fetchScopedSettings(
      supabaseUrl,
      serviceRoleKey,
      ["phonepe_merchant_id", "phonepe_salt_key", "phonepe_salt_index", "phonepe_base_url"],
      orgId,
    );

    const merchantId = settingsMap.get("phonepe_merchant_id")?.trim() || Deno.env.get("PHONEPE_MERCHANT_ID") || "";
    const saltKey = settingsMap.get("phonepe_salt_key")?.trim() || Deno.env.get("PHONEPE_SALT_KEY") || "";
    const saltIndex = settingsMap.get("phonepe_salt_index")?.trim() || Deno.env.get("PHONEPE_SALT_INDEX") || "1";
    const configuredBaseUrl = settingsMap.get("phonepe_base_url")?.trim() || Deno.env.get("PHONEPE_BASE_URL") || "https://api-preprod.phonepe.com/apis/pg-sandbox";

    if (!merchantId || !saltKey) {
      return new Response(JSON.stringify({ error: "PhonePe is not configured for this organization" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const statusPath = `/pg/v1/status/${merchantId}/${merchantTransactionId}`;
    const digest = await sha256Hex(statusPath + saltKey);
    const xVerify = `${digest}###${saltIndex}`;

    const response = await fetch(`${configuredBaseUrl}${statusPath}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-VERIFY": xVerify,
        "X-MERCHANT-ID": merchantId,
      },
    });

    const statusData = await response.json();
    if (!response.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch PhonePe payment status", details: statusData }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const state = statusData?.data?.state || statusData?.state;
    if (state !== "COMPLETED") {
      return new Response(JSON.stringify({ success: false, state, message: "Payment is not completed yet" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const existing = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("invoice_id", invoiceId)
      .eq("transaction_id", merchantTransactionId)
      .maybeSingle();

    if (existing.data?.id) {
      return new Response(JSON.stringify({ success: true, already_processed: true, state }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const amountPaid = Number(statusData?.data?.amount || 0) / 100;
    const finalAmount = Number((invoice as any).final_amount || 0);
    const paidAmount = Number((invoice as any).paid_amount || 0);
    const applied = Math.min(amountPaid, Math.max(0, finalAmount - paidAmount));

    if (applied <= 0) {
      return new Response(JSON.stringify({ success: true, state, message: "No payable amount remaining" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await supabaseAdmin.from("payments").insert({
      invoice_id: invoiceId,
      organization_id: orgId,
      amount: applied,
      payment_method: "online",
      payment_gateway: "phonepe",
      transaction_id: merchantTransactionId,
      payment_date: new Date().toISOString(),
      notes: `phonepe_transaction_id:${merchantTransactionId}`,
    });

    const newPaid = paidAmount + applied;
    const newStatus = newPaid >= finalAmount ? "paid" : "partial";

    await supabaseAdmin
      .from("invoices")
      .update({
        paid_amount: newPaid,
        payment_status: newStatus,
        payment_method: "online",
        paid_at: newStatus === "paid" ? new Date().toISOString() : null,
      })
      .eq("id", invoiceId);

    return new Response(JSON.stringify({ success: true, state, merchant_transaction_id: merchantTransactionId }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("confirm-phonepe-payment error", error);
    return new Response(JSON.stringify({ error: error.message || "Failed to confirm PhonePe payment" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});