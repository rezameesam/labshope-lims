import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyTurnstile } from "../_shared/patient-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_ADDRESS_LENGTH = 250;
const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 200;

interface SubmitBookingRequestBody {
  full_name: string;
  phone: string;
  email?: string | null;
  booking_type?: "walk_in" | "home_collection";
  address?: string | null;
  preferred_date?: string | null;
  lab_id?: string | null;
  collection_center_id?: string | null;
  turnstile_token?: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const turnstileBody = await req.clone().json().catch(() => null);
    const turnstileError = await verifyTurnstile(turnstileBody?.turnstile_token || "", req);
    if (turnstileError) {
      return jsonResponse({ error: turnstileError }, 400);
    }

    const body: SubmitBookingRequestBody = turnstileBody || {};

    const fullName = (body.full_name || "").trim();
    const phone = (body.phone || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const bookingType = body.booking_type === "home_collection" ? "home_collection" : "walk_in";
    const address = (body.address || "").trim();
    const preferredDate = (body.preferred_date || "").trim();
    const labId = (body.lab_id || "").trim();
    const collectionCenterId = (body.collection_center_id || "").trim();

    if (!fullName || !phone) {
      return jsonResponse({ error: "Full name and phone number are required." }, 400);
    }

    if (fullName.length > MAX_NAME_LENGTH) {
      return jsonResponse({ error: `Full name must be ${MAX_NAME_LENGTH} characters or fewer.` }, 400);
    }

    if (!/^\+\d{8,15}$/.test(phone)) {
      return jsonResponse({ error: "Phone number must be normalized before submission." }, 400);
    }

    if (email && email.length > MAX_EMAIL_LENGTH) {
      return jsonResponse({ error: `Email must be ${MAX_EMAIL_LENGTH} characters or fewer.` }, 400);
    }

    if (address.length > MAX_ADDRESS_LENGTH) {
      return jsonResponse({ error: `Address must be ${MAX_ADDRESS_LENGTH} characters or fewer.` }, 400);
    }

    if (bookingType === "home_collection" && !address) {
      return jsonResponse({ error: "Address is required for home collection." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Server configuration missing." }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { error } = await supabaseAdmin.from("booking_requests").insert({
      full_name: fullName,
      phone,
      email: email || null,
      booking_type: bookingType,
      address: address || null,
      preferred_date: preferredDate || null,
      lab_id: labId || null,
      collection_center_id: collectionCenterId || null,
      source: "website",
      status: "new",
    });

    if (error) {
      console.error("Error inserting booking request:", error);
      return jsonResponse({ error: "Failed to submit booking request." }, 500);
    }

    return jsonResponse({ success: true }, 200);
  } catch (error: any) {
    console.error("Error in submit-booking-request:", error);
    return jsonResponse({ error: error.message || "Internal server error." }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}
