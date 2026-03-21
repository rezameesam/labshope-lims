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
    const merchantTransactionId = (body.merchant_transaction_id || "").trim();
    const invoiceId = (body.invoice_id || "").trim();
    const bulkInvoices = Array.isArray(body.bulk_invoices) ? body.bulk_invoices : [];

    const invoiceIds = bulkInvoices.length > 0
      ? bulkInvoices.map((i: any) => i.invoice_id).filter(Boolean)
      : (invoiceId ? [invoiceId] : []);

    if (!merchantTransactionId || invoiceIds.length === 0) {
      return new Response(JSON.stringify({ error: "merchant_transaction_id and invoice_id (or bulk_invoices) are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: invoices } = await supabaseAdmin
      .from("invoices")
      .select("id, final_amount, paid_amount, organization_id, patients!inner(user_id)")
      .in("id", invoiceIds);

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

    const orgId = (invoices[0] as any).organization_id || null;
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

    const statusPath = `/pg/v1/status/${merchantId}/${merchantTransactionId}`;
    const digest = await sha256Hex(statusPath + saltKey);
    const xVerify = `${digest}###${saltIndex}`;

    const response = await fetch(`${configuredBaseUrl}${statusPath}`, {
      method: "GET",
      headers: { "Content-Type": "application/json", "X-VERIFY": xVerify, "X-MERCHANT-ID": merchantId },
    });
    const statusData = await response.json();

    const state = statusData?.data?.state || statusData?.state;
    if (state !== "COMPLETED") {
      return new Response(JSON.stringify({ success: false, state, message: "Payment is not completed yet" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const amountPaid = Number(statusData?.data?.amount || 0) / 100;
    const outstandingRows = invoices.map((inv: any) => ({
      invoice_id: inv.id,
      outstanding: Math.max(0, Number(inv.final_amount) - Number(inv.paid_amount || 0)),
      paid_amount: Number(inv.paid_amount || 0),
      final_amount: Number(inv.final_amount || 0),
    })).filter((r) => r.outstanding > 0);

    let remaining = amountPaid;
    const processed: string[] = [];

    for (const row of outstandingRows) {
      if (remaining <= 0) break;
      const existing = await supabaseAdmin.from("payments").select("id").eq("invoice_id", row.invoice_id).eq("transaction_id", merchantTransactionId).maybeSingle();
      if (existing.data?.id) continue;

      const applied = Math.min(row.outstanding, remaining);
      if (applied <= 0) continue;

      await supabaseAdmin.from("payments").insert({
        invoice_id: row.invoice_id,
        organization_id: orgId,
        amount: applied,
        payment_method: "online",
        payment_gateway: "phonepe",
        transaction_id: merchantTransactionId,
        payment_date: new Date().toISOString(),
        notes: `phonepe_transaction_id:${merchantTransactionId}`,
      });

      const newPaid = row.paid_amount + applied;
      const newStatus = newPaid >= row.final_amount ? "paid" : "partial";
      await supabaseAdmin.from("invoices").update({
        paid_amount: newPaid,
        payment_status: newStatus,
        payment_method: "online",
        paid_at: newStatus === "paid" ? new Date().toISOString() : null,
      }).eq("id", row.invoice_id);

      remaining -= applied;
      processed.push(row.invoice_id);
    }

    return new Response(JSON.stringify({ success: true, state, merchant_transaction_id: merchantTransactionId, processed_invoice_ids: processed }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("confirm-phonepe-payment error", error);
    return new Response(JSON.stringify({ error: error.message || "Failed to confirm PhonePe payment" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});