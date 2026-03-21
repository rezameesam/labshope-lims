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

    const invoiceId = (body.invoice_id || "").trim();
    const bulkIds = Array.isArray(body.invoice_ids) ? body.invoice_ids.filter(Boolean) : [];
    const isBulk = bulkIds.length > 0;
    const requestedAmount = Number(body.amount || 0);
    const firstName = (body.patient_name || "Patient").toString().slice(0, 60);
    const email = (body.patient_email || "patient@example.com").toString().slice(0, 120);
    const phone = (body.patient_phone || "9999999999").toString().replace(/\D/g, "").slice(-10) || "9999999999";

    if ((!invoiceId && !isBulk) || requestedAmount <= 0) {
      return new Response(JSON.stringify({ error: "invoice_id (or invoice_ids) and amount are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const query = supabaseAdmin
      .from("invoices")
      .select("id, invoice_number, final_amount, paid_amount, organization_id, patients!inner(user_id)");
    const { data: invoices } = isBulk ? await query.in("id", bulkIds) : await query.eq("id", invoiceId).limit(1);

    if (!invoices || invoices.length === 0) {
      return new Response(JSON.stringify({ error: "Invoice(s) not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ownerUserId = (invoices[0].patients as any)?.user_id;
    const isPatientOwner = ownerUserId === user.id;
    if (!isPatientOwner) {
      const { data: userRoles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", user.id);
      const hasStaffRole = userRoles?.some((r) => r.role === "admin" || r.role === "employee");
      if (!hasStaffRole) return new Response(JSON.stringify({ error: "Access denied" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const outstandingRows = invoices.map((inv: any) => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      outstanding: Math.max(0, Number(inv.final_amount) - Number(inv.paid_amount || 0)),
      organization_id: inv.organization_id,
    })).filter((r) => r.outstanding > 0);

    const totalOutstanding = outstandingRows.reduce((s, r) => s + r.outstanding, 0);
    const amount = Number(Math.min(requestedAmount, totalOutstanding).toFixed(2));
    const orgId = outstandingRows[0]?.organization_id || null;

    const settingsMap = await fetchScopedSettings(supabaseUrl, serviceRoleKey, ["payu_key", "payu_salt", "payu_base_url"], orgId);
    const payuKey = settingsMap.get("payu_key")?.trim() || Deno.env.get("PAYU_KEY") || "";
    const payuSalt = settingsMap.get("payu_salt")?.trim() || Deno.env.get("PAYU_SALT") || "";
    const payuBaseUrl = settingsMap.get("payu_base_url")?.trim() || Deno.env.get("PAYU_BASE_URL") || "https://test.payu.in";
    if (!payuKey || !payuSalt) return new Response(JSON.stringify({ error: "PayU is not configured for this organization" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const txnid = `${isBulk ? "PAYUB" : "PAYU"}_${Date.now()}`;
    const productinfo = isBulk ? `Bulk-${outstandingRows.length}-Invoices` : `Invoice-${outstandingRows[0].invoice_number}`;
    const udf1 = isBulk ? "bulk" : outstandingRows[0].id;
    const hashString = `${payuKey}|${txnid}|${amount.toFixed(2)}|${productinfo}|${firstName}|${email}|||||||||||${payuSalt}`;
    const hash = await sha512Hex(hashString);

    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "https://example.com";
    const surl = `${origin}/patient/billing?payu_txn=${encodeURIComponent(txnid)}`;

    return new Response(JSON.stringify({
      success: true,
      action_url: `${payuBaseUrl}/_payment`,
      method: "POST",
      fields: {
        key: payuKey,
        txnid,
        amount: amount.toFixed(2),
        productinfo,
        firstname: firstName,
        email,
        phone,
        surl,
        furl: surl,
        hash,
        udf1,
      },
      transaction_id: txnid,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("create-payu-order error", error);
    return new Response(JSON.stringify({ error: error.message || "Failed to create PayU order" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});