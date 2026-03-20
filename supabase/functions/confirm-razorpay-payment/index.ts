import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";
import { fetchScopedSettings } from "../_shared/organization-settings.ts";

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

const extractBearerToken = (authHeader: string | null): string | null => {
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  return token || null;
};

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
    const buf = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`${orderId}|${paymentId}`),
    );
    const expected = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return expected === signature;
  } catch {
    return false;
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const accessToken = extractBearerToken(authHeader);
    if (!accessToken) return json({ error: "Authentication required" }, 401);

    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(accessToken);
    if (authError || !user) return json({ error: "Invalid authentication token" }, 401);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json();
    const razorpay_payment_id: string = body.razorpay_payment_id?.trim() || "";
    const razorpay_order_id: string   = body.razorpay_order_id?.trim() || "";
    const razorpay_signature: string  = body.razorpay_signature?.trim() || "";
    const invoice_id: string          = body.invoice_id?.trim() || "";
    const bulk_invoices: Array<{ invoice_id: string; invoice_number: string; amount: number }> =
      Array.isArray(body.bulk_invoices) ? body.bulk_invoices : [];
    const amount: number = Number(body.amount) || 0;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return json({ error: "razorpay_payment_id, razorpay_order_id, and razorpay_signature are required" }, 400);
    }

    const hasBulk = bulk_invoices.length > 0;
    if (!invoice_id && !hasBulk) {
      return json({ error: "invoice_id or bulk_invoices is required" }, 400);
    }

    // Resolve organization from the invoice(s)
    let organizationId: string | null = null;
    if (invoice_id) {
      const { data: inv } = await supabaseAdmin
        .from("invoices")
        .select("organization_id")
        .eq("id", invoice_id)
        .maybeSingle();
      organizationId = (inv as any)?.organization_id ?? null;
    } else {
      const invoiceIds = bulk_invoices.map((i) => i.invoice_id);
      const { data: invs } = await supabaseAdmin
        .from("invoices")
        .select("organization_id")
        .in("id", invoiceIds);
      const orgIds = new Set<string>(
        ((invs || []) as any[]).map((i) => i.organization_id).filter(Boolean),
      );
      if (orgIds.size === 1) organizationId = Array.from(orgIds)[0];
    }

    if (!organizationId) return json({ error: "Invoice not found or organization could not be determined" }, 404);

    // Get org Razorpay key_secret for signature verification
    const settingsMap = await fetchScopedSettings(
      supabaseUrl,
      serviceRoleKey,
      ["razorpay_key_secret"],
      organizationId,
    );
    const razorpayKeySecret =
      settingsMap.get("razorpay_key_secret")?.trim() ||
      Deno.env.get("RAZORPAY_KEY_SECRET") ||
      "";

    if (!razorpayKeySecret) {
      return json({ error: "Payment gateway is not configured for this organization" }, 500);
    }

    // Verify signature — server-side proof that the payment genuinely happened
    const isValid = await verifyRazorpaySignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      razorpayKeySecret,
    );

    if (!isValid) {
      console.error("Invalid Razorpay signature for invoice payment", { razorpay_order_id, razorpay_payment_id });
      return json({ error: "Payment verification failed" }, 400);
    }

    const now = new Date().toISOString();
    const processedIds: string[] = [];

    if (hasBulk) {
      // Process each invoice in the bulk payment
      for (const item of bulk_invoices) {
        const invoiceId = item.invoice_id;
        if (!invoiceId) continue;

        const { data: inv } = await supabaseAdmin
          .from("invoices")
          .select("id, final_amount, paid_amount, organization_id")
          .eq("id", invoiceId)
          .maybeSingle();
        if (!inv) continue;

        const ivFinal = Number((inv as any).final_amount);
        const ivPaid  = Number((inv as any).paid_amount || 0);
        const applied = Math.min(item.amount > 0 ? item.amount : ivFinal - ivPaid, ivFinal - ivPaid);
        if (applied <= 0) continue;

        await supabaseAdmin.from("payments").insert({
          invoice_id: invoiceId,
          organization_id: organizationId,
          amount: applied,
          payment_method: "online",
          payment_gateway: "razorpay",
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
          payment_date: now,
          transaction_id: razorpay_payment_id,
        });

        const newPaid = ivPaid + applied;
        const newStatus = newPaid >= ivFinal ? "paid" : "partial";
        await supabaseAdmin
          .from("invoices")
          .update({
            paid_amount: newPaid,
            payment_status: newStatus,
            payment_method: "online",
            paid_at: newStatus === "paid" ? now : null,
          })
          .eq("id", invoiceId);

        processedIds.push(invoiceId);
      }
    } else {
      // Single invoice
      const { data: inv } = await supabaseAdmin
        .from("invoices")
        .select("id, final_amount, paid_amount")
        .eq("id", invoice_id)
        .maybeSingle();

      if (!inv) return json({ error: "Invoice not found" }, 404);

      const ivFinal = Number((inv as any).final_amount);
      const ivPaid  = Number((inv as any).paid_amount || 0);
      const applied = amount > 0
        ? Math.min(amount, ivFinal - ivPaid)
        : ivFinal - ivPaid;

      if (applied > 0) {
        await supabaseAdmin.from("payments").insert({
          invoice_id,
          organization_id: organizationId,
          amount: applied,
          payment_method: "online",
          payment_gateway: "razorpay",
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
          payment_date: now,
          transaction_id: razorpay_payment_id,
        });

        const newPaid = ivPaid + applied;
        const newStatus = newPaid >= ivFinal ? "paid" : "partial";
        await supabaseAdmin
          .from("invoices")
          .update({
            paid_amount: newPaid,
            payment_status: newStatus,
            payment_method: "online",
            paid_at: newStatus === "paid" ? now : null,
          })
          .eq("id", invoice_id);
      }

      processedIds.push(invoice_id);
    }

    return json({ success: true, processed_invoice_ids: processedIds });

  } catch (e: any) {
    console.error("confirm-razorpay-payment error:", e);
    return json({ error: e.message || "Internal server error" }, 500);
  }
});
