import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";
import { fetchScopedSettings } from "../_shared/organization-settings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function getReceiptIdentifier(receipt: string): string | null {
  if (!receipt.startsWith("INV-")) {
    return null;
  }

  return receipt.replace("INV-", "").trim() || null;
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// Verify Razorpay webhook signature
async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const payloadData = encoder.encode(payload);

    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign("HMAC", key, payloadData);
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return expectedSignature === signature;
  } catch (error) {
    console.error("Error verifying signature:", error);
    return false;
  }
}

async function resolveWebhookOrganizationId(
  supabaseAdmin: ReturnType<typeof createClient>,
  webhookData: any,
): Promise<string | null> {
  const payment = webhookData?.payload?.payment?.entity || webhookData?.payload?.payment;
  const notes = payment?.notes || {};

  if (typeof notes.organization_id === "string" && notes.organization_id.trim()) {
    return notes.organization_id.trim();
  }

  const invoiceId = typeof notes.invoice_id === "string" ? notes.invoice_id.trim() : "";
  if (invoiceId) {
    const { data: invoice } = await supabaseAdmin
      .from("invoices")
      .select("organization_id")
      .eq("id", invoiceId)
      .maybeSingle();

    const organizationId =
      (invoice as { organization_id?: string | null } | null)?.organization_id ?? null;

    if (organizationId) {
      return organizationId;
    }
  }

  const bulkInvoicesRaw = notes.bulk_invoices;
  if (bulkInvoicesRaw) {
    try {
      const bulkInvoices = Array.isArray(bulkInvoicesRaw)
        ? bulkInvoicesRaw
        : JSON.parse(bulkInvoicesRaw);

      const invoiceIds = (bulkInvoices || [])
        .map((row: { invoice_id?: string }) => row.invoice_id)
        .filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0);

      if (invoiceIds.length > 0) {
        const { data: invoices } = await supabaseAdmin
          .from("invoices")
          .select("organization_id")
          .in("id", invoiceIds);

        const organizationIds = new Set(
          (invoices || [])
            .map((invoice: any) => invoice.organization_id || null)
            .filter((organizationId: string | null): organizationId is string => Boolean(organizationId)),
        );

        if (organizationIds.size === 1) {
          return Array.from(organizationIds)[0];
        }
      }
    } catch (error) {
      console.error("Failed to resolve organization from bulk invoice notes:", error);
    }
  }

  const receipt = typeof notes.receipt === "string" ? notes.receipt : payment?.receipt;
  const receiptIdentifier = typeof receipt === "string" ? getReceiptIdentifier(receipt) : null;
  if (receiptIdentifier) {
    if (isUuidLike(receiptIdentifier)) {
      const { data: invoice } = await supabaseAdmin
        .from("invoices")
        .select("organization_id")
        .eq("id", receiptIdentifier)
        .maybeSingle();

      return (invoice as { organization_id?: string | null } | null)?.organization_id ?? null;
    }

    const { data: invoice } = await supabaseAdmin
      .from("invoices")
      .select("organization_id")
      .eq("invoice_number", receiptIdentifier)
      .maybeSingle();

    return (invoice as { organization_id?: string | null } | null)?.organization_id ?? null;
  }

  return null;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get webhook signature from headers
    const razorpaySignature = req.headers.get("X-Razorpay-Signature");

    // SECURITY: Signature is REQUIRED
    if (!razorpaySignature) {
      console.error("Missing X-Razorpay-Signature header");
      return new Response(
        JSON.stringify({ error: "Missing signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Read request body
    const body = await req.text();
    const webhookData = JSON.parse(body);
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const resolvedOrganizationId = await resolveWebhookOrganizationId(supabaseAdmin, webhookData);

    const settingsMap = await fetchScopedSettings(
      supabaseUrl,
      serviceRoleKey,
      ["razorpay_webhook_secret"],
      resolvedOrganizationId,
    );
    const razorpayWebhookSecret =
      settingsMap.get("razorpay_webhook_secret")?.trim() ||
      Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ||
      "";

    // SECURITY: Webhook secret is REQUIRED to prevent payment fraud
    if (!razorpayWebhookSecret) {
      console.error("Razorpay webhook secret not configured - rejecting webhook");
      return new Response(
        JSON.stringify({ error: "Webhook not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify webhook signature - MANDATORY
    const isValid = await verifyWebhookSignature(body, razorpaySignature, razorpayWebhookSecret);
    if (!isValid) {
      console.error("Invalid webhook signature - possible fraud attempt");
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const event = webhookData.event;
    const payment = webhookData.payload?.payment?.entity || webhookData.payload?.payment;

    if (event !== "payment.captured" && event !== "payment.authorized") {
      // We only process successful payments
      return new Response(
        JSON.stringify({ received: true, event }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!payment) {
      return new Response(
        JSON.stringify({ error: "Payment data not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const razorpayOrderId = payment.order_id;
    const razorpayPaymentId = payment.id;
    const amount = payment.amount / 100; // Convert from paise to rupees
    const status = payment.status;

    if (status !== "captured" && status !== "authorized") {
      return new Response(
        JSON.stringify({ received: true, message: "Payment not captured yet" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get invoice from order notes
    const bulkInvoicesRaw = payment.notes?.bulk_invoices;
    if (bulkInvoicesRaw) {
      let bulkInvoices: Array<{ invoice_id: string; amount: number }> = [];

      try {
        bulkInvoices = Array.isArray(bulkInvoicesRaw)
          ? bulkInvoicesRaw
          : JSON.parse(bulkInvoicesRaw);
      } catch (parseError) {
        console.error("Invalid bulk invoices payload:", parseError);
        return new Response(
          JSON.stringify({ error: "Invalid bulk invoices payload" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!Array.isArray(bulkInvoices) || bulkInvoices.length === 0) {
        return new Response(
          JSON.stringify({ error: "No invoices provided for bulk payment" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const processedInvoiceIds: string[] = [];

      for (const bulkInvoice of bulkInvoices) {
        const invoiceId = bulkInvoice.invoice_id;
        const paymentAmount = Number(bulkInvoice.amount);

        if (!invoiceId || !paymentAmount || paymentAmount <= 0) {
          continue;
        }

        const { data: existingPayments } = await supabaseAdmin
          .from("payments")
          .select("id")
          .eq("invoice_id", invoiceId)
          .eq("razorpay_order_id", razorpayOrderId)
          .limit(1);

        if (existingPayments && existingPayments.length > 0) {
          continue;
        }

        const { data: invoice, error: invoiceError } = await supabaseAdmin
          .from("invoices")
          .select("id, final_amount, paid_amount, payment_status, organization_id")
          .eq("id", invoiceId)
          .single();

        if (invoiceError || !invoice) {
          console.error("Invoice not found for bulk payment:", invoiceId);
          continue;
        }

        const outstandingAmount = Number(invoice.final_amount) - Number(invoice.paid_amount || 0);
        const appliedAmount = Math.min(paymentAmount, outstandingAmount);

        if (appliedAmount <= 0) {
          continue;
        }

        const { error: paymentError } = await supabaseAdmin.from("payments").insert({
          invoice_id: invoiceId,
          organization_id: (invoice as { organization_id?: string | null }).organization_id || null,
          amount: appliedAmount,
          payment_method: "online",
          payment_gateway: "razorpay",
          razorpay_order_id: razorpayOrderId,
          razorpay_payment_id: razorpayPaymentId,
          razorpay_signature: payment.notes?.signature || null,
          payment_date: new Date().toISOString(),
          transaction_id: razorpayPaymentId,
        });

        if (paymentError) {
          console.error("Error creating bulk payment record:", paymentError);
          continue;
        }

        const newPaidAmount = Number(invoice.paid_amount || 0) + appliedAmount;
        const newStatus = newPaidAmount >= Number(invoice.final_amount) ? "paid" : "partial";

        const { error: updateError } = await supabaseAdmin
          .from("invoices")
          .update({
            paid_amount: newPaidAmount,
            payment_status: newStatus,
            payment_method: "online",
            paid_at: newStatus === "paid" ? new Date().toISOString() : null,
          })
          .eq("id", invoiceId);

        if (updateError) {
          console.error("Error updating invoice for bulk payment:", updateError);
          continue;
        }

        processedInvoiceIds.push(invoiceId);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Bulk payment processed successfully",
          invoice_ids: processedInvoiceIds,
          payment_id: razorpayPaymentId,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get invoice from order notes or find by order_id pattern
    let invoiceId = payment.notes?.invoice_id;

    if (!invoiceId) {
      // Try to extract from receipt. New receipts use invoice UUIDs; older ones used invoice numbers.
      const receipt = payment.notes?.receipt || payment.receipt;
      const receiptIdentifier = typeof receipt === "string" ? getReceiptIdentifier(receipt) : null;
      if (receiptIdentifier) {
        if (isUuidLike(receiptIdentifier)) {
          invoiceId = receiptIdentifier;
        } else {
          const { data: invoice } = await supabaseAdmin
            .from("invoices")
            .select("id")
            .eq("invoice_number", receiptIdentifier)
            .single();
          if (invoice) {
            invoiceId = invoice.id;
          }
        }
      }
    }

    if (!invoiceId) {
      console.error("Invoice ID not found in payment notes");
      return new Response(
        JSON.stringify({ error: "Invoice ID not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: existingPayments } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("invoice_id", invoiceId)
      .eq("razorpay_order_id", razorpayOrderId)
      .limit(1);

    if (existingPayments && existingPayments.length > 0) {
      return new Response(
        JSON.stringify({ received: true, message: "Payment already processed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get invoice details
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .select("id, final_amount, paid_amount, payment_status, organization_id")
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return new Response(
        JSON.stringify({ error: "Invoice not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create payment record
    const { error: paymentError } = await supabaseAdmin.from("payments").insert({
      invoice_id: invoiceId,
      organization_id: (invoice as { organization_id?: string | null }).organization_id || null,
      amount: amount,
      payment_method: "online",
      payment_gateway: "razorpay",
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: payment.notes?.signature || null,
      payment_date: new Date().toISOString(),
      transaction_id: razorpayPaymentId,
    });

    if (paymentError) {
      console.error("Error creating payment record:", paymentError);
      // Continue anyway to update invoice
    }

    // Update invoice
    const newPaidAmount = Number(invoice.paid_amount || 0) + amount;
    const newStatus = newPaidAmount >= Number(invoice.final_amount) ? "paid" : "partial";

    const { error: updateError } = await supabaseAdmin
      .from("invoices")
      .update({
        paid_amount: newPaidAmount,
        payment_status: newStatus,
        payment_method: "online",
        paid_at: newStatus === "paid" ? new Date().toISOString() : null,
      })
      .eq("id", invoiceId);

    if (updateError) {
      console.error("Error updating invoice:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update invoice" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Payment processed successfully",
        invoice_id: invoiceId,
        payment_id: razorpayPaymentId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error processing webhook:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to process webhook" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
