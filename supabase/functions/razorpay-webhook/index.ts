import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const razorpayWebhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") || "";

    // Get webhook signature from headers
    const razorpaySignature = req.headers.get("X-Razorpay-Signature") || "";

    // Read request body
    const body = await req.text();

    // Verify webhook signature if secret is provided
    if (razorpayWebhookSecret && razorpaySignature) {
      const isValid = await verifyWebhookSignature(body, razorpaySignature, razorpayWebhookSecret);
      if (!isValid) {
        console.error("Invalid webhook signature");
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const webhookData = JSON.parse(body);
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
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Try to find payment by order_id first
    const { data: existingPayment } = await supabaseAdmin
      .from("payments")
      .select("id, invoice_id")
      .eq("razorpay_order_id", razorpayOrderId)
      .single();

    if (existingPayment) {
      // Payment already processed
      return new Response(
        JSON.stringify({ received: true, message: "Payment already processed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get invoice from order notes or find by order_id pattern
    let invoiceId = payment.notes?.invoice_id;

    if (!invoiceId) {
      // Try to extract from receipt (format: INV-{invoice_number})
      const receipt = payment.notes?.receipt || payment.receipt;
      if (receipt && receipt.startsWith("INV-")) {
        const invoiceNumber = receipt.replace("INV-", "");
        const { data: invoice } = await supabaseAdmin
          .from("invoices")
          .select("id")
          .eq("invoice_number", invoiceNumber)
          .single();
        if (invoice) {
          invoiceId = invoice.id;
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

    // Get invoice details
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .select("id, final_amount, paid_amount, payment_status")
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

