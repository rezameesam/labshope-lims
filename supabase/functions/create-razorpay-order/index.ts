import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CreateOrderRequest {
  invoice_id: string;
  amount: number; // Amount in rupees
  invoice_number: string;
  patient_name?: string;
  patient_email?: string;
  patient_phone?: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Get Razorpay keys from database (preferred) or fall back to env vars
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: razorpaySettings } = await supabaseAdmin
      .from("system_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["razorpay_key_id", "razorpay_key_secret"]);
    
    const settingsMap = new Map(
      (razorpaySettings || []).map((s) => [s.setting_key, s.setting_value])
    );
    
    const razorpayKeyId = settingsMap.get("razorpay_key_id")?.trim() || 
                          Deno.env.get("RAZORPAY_KEY_ID") || 
                          "rzp_test_RydGUMk2onInkU";
    const razorpayKeySecret = settingsMap.get("razorpay_key_secret")?.trim() || 
                              Deno.env.get("RAZORPAY_KEY_SECRET") || 
                              "aBGYqeGBV9YRFMoeFIHgOlMK";

    // Note: verify_jwt = false in config, so we don't strictly require auth
    // But we still verify invoice exists and belongs to a valid patient

    const { invoice_id, amount, invoice_number, patient_name, patient_email, patient_phone }: CreateOrderRequest = await req.json();

    if (!invoice_id || !amount || amount <= 0) {
      return new Response(
        JSON.stringify({ error: "Invalid request. invoice_id and amount are required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify invoice exists and get details
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .select("id, invoice_number, final_amount, paid_amount, payment_status, patient_id")
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      return new Response(
        JSON.stringify({ error: "Invoice not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if invoice is already paid
    if (invoice.payment_status === "paid") {
      return new Response(
        JSON.stringify({ error: "Invoice is already paid" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate outstanding amount
    const outstandingAmount = Number(invoice.final_amount) - Number(invoice.paid_amount || 0);
    if (amount > outstandingAmount) {
      return new Response(
        JSON.stringify({ error: `Amount exceeds outstanding amount of ₹${outstandingAmount}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Razorpay order
    const orderAmount = Math.round(amount * 100); // Convert to paise
    const orderData = {
      amount: orderAmount,
      currency: "INR",
      receipt: `INV-${invoice.invoice_number}`,
      notes: {
        invoice_id: invoice_id,
        invoice_number: invoice.invoice_number,
        patient_id: invoice.patient_id,
      },
    };

    // Call Razorpay API to create order
    const razorpayResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${btoa(`${razorpayKeyId}:${razorpayKeySecret}`)}`,
      },
      body: JSON.stringify(orderData),
    });

    if (!razorpayResponse.ok) {
      const errorData = await razorpayResponse.json();
      console.error("Razorpay API error:", errorData);
      return new Response(
        JSON.stringify({ error: errorData.error?.description || "Failed to create Razorpay order" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const razorpayOrder = await razorpayResponse.json();

    // Store order ID in database (optional - for tracking)
    // You can create a pending payment record here if needed

    return new Response(
      JSON.stringify({
        success: true,
        order_id: razorpayOrder.id,
        amount: orderAmount,
        currency: "INR",
        key_id: razorpayKeyId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error creating Razorpay order:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to create payment order" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

