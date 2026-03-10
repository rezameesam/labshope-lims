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
const BOOKING_ALERT_EMAIL = "irmclinic@gmail.com";

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

    const insertPayload = {
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
    };

    const { error } = await supabaseAdmin.from("booking_requests").insert(insertPayload);

    if (error) {
      console.error("Error inserting booking request:", error);
      return jsonResponse({ error: "Failed to submit booking request." }, 500);
    }

    const alertEmail = Deno.env.get("BOOKING_ALERT_EMAIL")?.trim() || BOOKING_ALERT_EMAIL;
    if (alertEmail) {
      const emailSubject = `New booking request: ${fullName}`;
      const emailHtml = buildBookingAlertEmail({
        fullName,
        phone,
        email: email || null,
        bookingType,
        address: address || null,
        preferredDate: preferredDate || null,
        labId: labId || null,
        collectionCenterId: collectionCenterId || null,
      });

      try {
        const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: alertEmail,
            subject: emailSubject,
            htmlContent: emailHtml,
            textContent: buildBookingAlertText({
              fullName,
              phone,
              email: email || null,
              bookingType,
              address: address || null,
              preferredDate: preferredDate || null,
              labId: labId || null,
              collectionCenterId: collectionCenterId || null,
            }),
          }),
        });

        if (!emailResponse.ok) {
          const errorPayload = await emailResponse.text();
          console.error("Booking alert email failed:", errorPayload);
        }
      } catch (emailError) {
        console.error("Booking alert email error:", emailError);
      }
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

type BookingAlertPayload = {
  fullName: string;
  phone: string;
  email: string | null;
  bookingType: "walk_in" | "home_collection";
  address: string | null;
  preferredDate: string | null;
  labId: string | null;
  collectionCenterId: string | null;
};

function buildBookingAlertEmail(payload: BookingAlertPayload): string {
  const adminUrl = Deno.env.get("SITE_URL")?.trim()
    ? `${Deno.env.get("SITE_URL")!.replace(/\/+$/, "")}/admin`
    : null;

  const rows = [
    ["Patient Name", payload.fullName],
    ["Phone", payload.phone],
    ["Email", payload.email || "Not provided"],
    ["Booking Type", payload.bookingType === "home_collection" ? "Home Collection" : "Walk-in Lab Visit"],
    ["Address", payload.address || "Not provided"],
    ["Preferred Date", payload.preferredDate || "Not provided"],
    ["Lab ID", payload.labId || "Not selected"],
    ["Collection Center ID", payload.collectionCenterId || "Not selected"],
  ]
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 12px;font-weight:600;border:1px solid #e2e8f0;background:#f8fafc;">${escapeHtml(label)}</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <div style="padding:20px 24px;background:#0f766e;color:#ffffff;">
          <h1 style="margin:0;font-size:22px;">New Booking Request</h1>
          <p style="margin:8px 0 0;font-size:14px;opacity:0.9;">A new lead was submitted from the website.</p>
        </div>
        <div style="padding:24px;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tbody>${rows}</tbody>
          </table>
          ${
            adminUrl
              ? `<p style="margin:20px 0 0;font-size:14px;">Review it in the admin dashboard: <a href="${escapeHtml(adminUrl)}">${escapeHtml(adminUrl)}</a></p>`
              : `<p style="margin:20px 0 0;font-size:14px;">Review it in the admin dashboard booking requests queue.</p>`
          }
        </div>
      </div>
    </div>
  `;
}

function buildBookingAlertText(payload: BookingAlertPayload): string {
  return [
    "New Booking Request",
    `Patient Name: ${payload.fullName}`,
    `Phone: ${payload.phone}`,
    `Email: ${payload.email || "Not provided"}`,
    `Booking Type: ${payload.bookingType === "home_collection" ? "Home Collection" : "Walk-in Lab Visit"}`,
    `Address: ${payload.address || "Not provided"}`,
    `Preferred Date: ${payload.preferredDate || "Not provided"}`,
    `Lab ID: ${payload.labId || "Not selected"}`,
    `Collection Center ID: ${payload.collectionCenterId || "Not selected"}`,
    "Review it in the admin dashboard booking requests queue.",
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
