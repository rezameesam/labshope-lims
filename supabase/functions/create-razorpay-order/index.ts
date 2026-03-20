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
  amount: number; // Amount in rupees
  invoice_number?: string;
  patient_name?: string;
  patient_email?: string;
  patient_phone?: string;
}

const extractBearerToken = (authHeader: string | null): string | null => {
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  return token || null;
};

async function getUserOrganizationIds(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
): Promise<Set<string>> {
  const { data: memberships, error } = await supabaseAdmin
    .from("organization_users")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error) {
    console.error("Failed to load organization memberships:", error.message);
    return new Set();
  }

  return new Set(
    (memberships || [])
      .map((membership) => membership.organization_id)
      .filter((organizationId): organizationId is string => Boolean(organizationId)),
  );
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    const accessToken = extractBearerToken(authHeader);
    if (!accessToken) {
      console.error("Missing Authorization header");
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create a client with the user's token to verify their identity
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(accessToken);
    if (authError || !user) {
      console.error("Authentication failed:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Invalid authentication token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Authenticated user:", user.id);

    // Use service role for admin operations
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { invoice_id, invoice_ids, amount }: CreateOrderRequest = await req.json();
    const hasBulkInvoices = Array.isArray(invoice_ids) && invoice_ids.length > 0;

    if ((!invoice_id && !hasBulkInvoices) || !amount || amount <= 0) {
      return new Response(
        JSON.stringify({ error: "Invalid request. invoice_id (or invoice_ids) and amount are required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let orderAmount = Math.round(amount * 100);
    let orderData: Record<string, unknown> = {};
    let resolvedOrganizationId: string | null = null;

    if (hasBulkInvoices) {
      const { data: invoices, error: invoicesError } = await supabaseAdmin
        .from("invoices")
        .select("id, invoice_number, final_amount, paid_amount, payment_status, patient_id, organization_id, patients!inner(user_id)")
        .in("id", invoice_ids as string[]);

      if (invoicesError || !invoices || invoices.length === 0) {
        console.error("Invoices not found:", invoicesError?.message);
        return new Response(
          JSON.stringify({ error: "Invoices not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (invoices.length !== (invoice_ids as string[]).length) {
        return new Response(
          JSON.stringify({ error: "One or more invoices are invalid" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify user has access to these invoices (must be the patient or have admin/employee role)
      const patientIds = new Set(invoices.map((inv) => inv.patient_id));
      if (patientIds.size > 1) {
        return new Response(
          JSON.stringify({ error: "Invoices must belong to the same patient" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const organizationIds = new Set(
        invoices.map((inv) => (inv as { organization_id?: string | null }).organization_id || null)
      );
      if (organizationIds.size > 1) {
        return new Response(
          JSON.stringify({ error: "Invoices must belong to the same organization" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      resolvedOrganizationId = (invoices[0] as { organization_id?: string | null }).organization_id || null;

      // Check if user is the patient or has admin/employee role
      const invoicePatientUserId = (invoices[0].patients as any)?.user_id;
      const isPatientOwner = invoicePatientUserId === user.id;

      if (!isPatientOwner) {
        // Check if user is admin or employee
        const { data: userRoles } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        
        const hasStaffRole = userRoles?.some(r => r.role === "admin" || r.role === "employee");
        
        if (!hasStaffRole) {
          console.error("Access denied: User does not own these invoices and is not staff");
          return new Response(
            JSON.stringify({ error: "Access denied. You can only pay for your own invoices." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!resolvedOrganizationId) {
          return new Response(
            JSON.stringify({ error: "Invoices are missing organization ownership." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const accessibleOrganizationIds = await getUserOrganizationIds(supabaseAdmin, user.id);
        if (!accessibleOrganizationIds.has(resolvedOrganizationId)) {
          console.error("Access denied: Staff user is not linked to invoice organization");
          return new Response(
            JSON.stringify({ error: "Access denied. You do not belong to this organization." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const invoicePayments = invoices
        .map((inv) => ({
          invoice_id: inv.id,
          invoice_number: inv.invoice_number,
          amount: Number(inv.final_amount) - Number(inv.paid_amount || 0),
        }))
        .filter((inv) => inv.amount > 0);

      if (invoicePayments.length === 0) {
        return new Response(
          JSON.stringify({ error: "No outstanding invoices to pay" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const totalOutstanding = invoicePayments.reduce((sum, inv) => sum + inv.amount, 0);
      orderAmount = Math.round(totalOutstanding * 100);
      orderData = {
        amount: orderAmount,
        currency: "INR",
        receipt: `BULK-${Date.now()}`,
        notes: {
          bulk_invoices: JSON.stringify(invoicePayments),
          invoice_count: String(invoicePayments.length),
          patient_id: invoices[0].patient_id,
          user_id: user.id,
          organization_id: resolvedOrganizationId,
        },
      };
    } else {
      // Verify invoice exists and get details
      const { data: invoice, error: invoiceError } = await supabaseAdmin
        .from("invoices")
        .select("id, invoice_number, final_amount, paid_amount, payment_status, patient_id, organization_id, patients!inner(user_id)")
        .eq("id", invoice_id)
        .single();

      if (invoiceError || !invoice) {
        console.error("Invoice not found:", invoiceError?.message);
        return new Response(
          JSON.stringify({ error: "Invoice not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      resolvedOrganizationId = (invoice as { organization_id?: string | null }).organization_id || null;

      // Verify user has access to this invoice (must be the patient or have admin/employee role)
      const invoicePatientUserId = (invoice.patients as any)?.user_id;
      const isPatientOwner = invoicePatientUserId === user.id;

      if (!isPatientOwner) {
        // Check if user is admin or employee
        const { data: userRoles } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        
        const hasStaffRole = userRoles?.some(r => r.role === "admin" || r.role === "employee");
        
        if (!hasStaffRole) {
          console.error("Access denied: User does not own this invoice and is not staff");
          return new Response(
            JSON.stringify({ error: "Access denied. You can only pay for your own invoices." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!resolvedOrganizationId) {
          return new Response(
            JSON.stringify({ error: "Invoice is missing organization ownership." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const accessibleOrganizationIds = await getUserOrganizationIds(supabaseAdmin, user.id);
        if (!accessibleOrganizationIds.has(resolvedOrganizationId)) {
          console.error("Access denied: Staff user is not linked to invoice organization");
          return new Response(
            JSON.stringify({ error: "Access denied. You do not belong to this organization." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Calculate outstanding amount
      const outstandingAmount = Number(invoice.final_amount) - Number(invoice.paid_amount || 0);
      if (outstandingAmount <= 0) {
        return new Response(
          JSON.stringify({ error: "Invoice is already settled" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create Razorpay order
      orderAmount = Math.round(outstandingAmount * 100); // Convert to paise
      orderData = {
        amount: orderAmount,
        currency: "INR",
        receipt: `INV-${invoice_id}`,
        notes: {
          invoice_id: invoice_id,
          invoice_number: invoice.invoice_number,
          receipt: `INV-${invoice_id}`,
          patient_id: invoice.patient_id,
          user_id: user.id,
          organization_id: resolvedOrganizationId,
        },
      };
    }

    const settingsMap = await fetchScopedSettings(
      supabaseUrl,
      serviceRoleKey,
      ["razorpay_key_id", "razorpay_key_secret"],
      resolvedOrganizationId,
    );

    const razorpayKeyId =
      settingsMap.get("razorpay_key_id")?.trim() ||
      Deno.env.get("RAZORPAY_KEY_ID") ||
      "";
    const razorpayKeySecret =
      settingsMap.get("razorpay_key_secret")?.trim() ||
      Deno.env.get("RAZORPAY_KEY_SECRET") ||
      "";

    if (!razorpayKeyId || !razorpayKeySecret) {
      return new Response(
        JSON.stringify({ error: "Razorpay is not configured for this organization" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
    console.log("Created Razorpay order:", razorpayOrder.id, "for user:", user.id);

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
