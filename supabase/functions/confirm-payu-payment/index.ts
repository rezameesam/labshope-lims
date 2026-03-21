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

const sha512Hex = async (message: string) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-512", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const accessToken = extractBearerToken(req.headers.get("Authorization"));
    if (!accessToken) return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(accessToken);
    if (authError || !user) return new Response(JSON.stringify({ error: "Invalid authentication token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();

    const txnid = (body.transaction_id || "").trim();
    const invoiceId = (body.invoice_id || "").trim();
    const bulkInvoices = Array.isArray(body.bulk_invoices) ? body.bulk_invoices : [];
    const invoiceIds = bulkInvoices.length > 0 ? bulkInvoices.map((i: any) => i.invoice_id).filter(Boolean) : (invoiceId ? [invoiceId] : []);

    if (!txnid || invoiceIds.length === 0) {
      return new Response(JSON.stringify({ error: "transaction_id and invoice_id (or bulk_invoices) are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: invoices } = await supabaseAdmin
      .from("invoices")
      .select("id, final_amount, paid_amount, organization_id, patients!inner(user_id)")
      .in("id", invoiceIds);

    if (!invoices || invoices.length === 0) return new Response(JSON.stringify({ error: "Invoice(s) not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const ownerUserId = (invoices[0].patients as any)?.user_id;
    const isPatientOwner = ownerUserId === user.id;
    if (!isPatientOwner) {
      const { data: userRoles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", user.id);
      const hasStaffRole = userRoles?.some((r) => r.role === "admin" || r.role === "employee");
      if (!hasStaffRole) return new Response(JSON.stringify({ error: "Access denied" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const orgId = (invoices[0] as any).organization_id || null;
    const settingsMap = await fetchScopedSettings(supabaseUrl, serviceRoleKey, ["payu_key", "payu_salt", "payu_base_url"], orgId);
    const payuKey = settingsMap.get("payu_key")?.trim() || Deno.env.get("PAYU_KEY") || "";
    const payuSalt = settingsMap.get("payu_salt")?.trim() || Deno.env.get("PAYU_SALT") || "";
    const payuBaseUrl = settingsMap.get("payu_base_url")?.trim() || Deno.env.get("PAYU_BASE_URL") || "https://test.payu.in";

    const command = "verify_payment";
    const verifyHash = await sha512Hex(`${payuKey}|${command}|${txnid}|${payuSalt}`);

    const verifyResp = await fetch(`${payuBaseUrl}/merchant/postservice?form=2`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ key: payuKey, command, var1: txnid, hash: verifyHash }).toString(),
    });

    const verifyData = await verifyResp.json();
    const txnDetails = verifyData?.transaction_details?.[txnid];
    const status = String(txnDetails?.status || "").toLowerCase();
    if (status !== "success") {
      return new Response(JSON.stringify({ success: false, status: txnDetails?.status || "pending" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let remaining = Number(txnDetails?.amt || 0);
    const processed: string[] = [];

    for (const inv of invoices as any[]) {
      if (remaining <= 0) break;
      const existing = await supabaseAdmin.from("payments").select("id").eq("invoice_id", inv.id).eq("transaction_id", txnid).maybeSingle();
      if (existing.data?.id) continue;

      const outstanding = Math.max(0, Number(inv.final_amount) - Number(inv.paid_amount || 0));
      const applied = Math.min(outstanding, remaining);
      if (applied <= 0) continue;

      await supabaseAdmin.from("payments").insert({
        invoice_id: inv.id,
        organization_id: orgId,
        amount: applied,
        payment_method: "online",
        payment_gateway: "payu",
        transaction_id: txnid,
        payment_date: new Date().toISOString(),
        notes: `payu_transaction_id:${txnid}`,
      });

      const newPaid = Number(inv.paid_amount || 0) + applied;
      const newStatus = newPaid >= Number(inv.final_amount || 0) ? "paid" : "partial";
      await supabaseAdmin.from("invoices").update({
        paid_amount: newPaid,
        payment_status: newStatus,
        payment_method: "online",
        paid_at: newStatus === "paid" ? new Date().toISOString() : null,
      }).eq("id", inv.id);

      remaining -= applied;
      processed.push(inv.id);
    }

    return new Response(JSON.stringify({ success: true, status: "success", transaction_id: txnid, processed_invoice_ids: processed }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("confirm-payu-payment error", error);
    return new Response(JSON.stringify({ error: error.message || "Failed to confirm PayU payment" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});