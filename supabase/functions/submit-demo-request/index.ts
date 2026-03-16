import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyTurnstile } from "../_shared/patient-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_NAME_LENGTH = 120;
const MAX_LAB_NAME_LENGTH = 160;
const MAX_EMAIL_LENGTH = 200;
const MAX_PHONE_LENGTH = 30;
const MAX_CITY_LENGTH = 120;
const MAX_NOTES_LENGTH = 1200;
const PLATFORM_CONTACT_EMAIL =
  Deno.env.get("PLATFORM_CONTACT_EMAIL")?.trim() ||
  Deno.env.get("SALES_CONTACT_EMAIL")?.trim() ||
  Deno.env.get("DEFAULT_FROM_EMAIL")?.trim() ||
  "sales@example.com";

interface SubmitDemoRequestBody {
  full_name?: string;
  lab_name?: string;
  email?: string;
  phone?: string;
  city?: string | null;
  branch_count?: number | null;
  notes?: string | null;
  hostname?: string | null;
  page_path?: string | null;
  referer?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  turnstile_token?: string;
}

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const normalizeText = (value: string | null | undefined) => value?.trim() || "";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

async function notifySalesLead(
  supabaseUrl: string,
  serviceRoleKey: string,
  payload: {
    fullName: string;
    labName: string;
    email: string;
    phone: string;
    city: string;
    branchCount: number | null;
    notes: string;
    hostname: string;
    pagePath: string;
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
  },
) {
  const htmlContent = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
      <h2 style="margin:0 0 12px;">New Demo Request</h2>
      <p style="margin:0 0 16px;">A new lead was submitted from the product website.</p>
      <table style="border-collapse:collapse;width:100%;max-width:640px;">
        <tr><td style="padding:8px 0;font-weight:600;">Full name</td><td style="padding:8px 0;">${escapeHtml(payload.fullName)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Lab name</td><td style="padding:8px 0;">${escapeHtml(payload.labName)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Email</td><td style="padding:8px 0;">${escapeHtml(payload.email)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Phone</td><td style="padding:8px 0;">${escapeHtml(payload.phone)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">City</td><td style="padding:8px 0;">${escapeHtml(payload.city || "-")}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Branches</td><td style="padding:8px 0;">${payload.branchCount ?? "-"}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Hostname</td><td style="padding:8px 0;">${escapeHtml(payload.hostname || "-")}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Page</td><td style="padding:8px 0;">${escapeHtml(payload.pagePath || "-")}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">UTM source</td><td style="padding:8px 0;">${escapeHtml(payload.utmSource || "-")}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">UTM medium</td><td style="padding:8px 0;">${escapeHtml(payload.utmMedium || "-")}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">UTM campaign</td><td style="padding:8px 0;">${escapeHtml(payload.utmCampaign || "-")}</td></tr>
      </table>
      <div style="margin-top:16px;">
        <p style="margin:0 0 8px;font-weight:600;">Notes</p>
        <div style="padding:12px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;">${escapeHtml(payload.notes || "No notes provided.")}</div>
      </div>
    </div>
  `;

  const textContent = [
    "New Demo Request",
    `Full name: ${payload.fullName}`,
    `Lab name: ${payload.labName}`,
    `Email: ${payload.email}`,
    `Phone: ${payload.phone}`,
    `City: ${payload.city || "-"}`,
    `Branches: ${payload.branchCount ?? "-"}`,
    `Hostname: ${payload.hostname || "-"}`,
    `Page: ${payload.pagePath || "-"}`,
    `UTM source: ${payload.utmSource || "-"}`,
    `UTM medium: ${payload.utmMedium || "-"}`,
    `UTM campaign: ${payload.utmCampaign || "-"}`,
    `Notes: ${payload.notes || "No notes provided."}`,
  ].join("\n");

  const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-service-key": serviceRoleKey,
    },
    body: JSON.stringify({
      to: PLATFORM_CONTACT_EMAIL,
      subject: `New demo request from ${payload.labName}`,
      htmlContent,
      textContent,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`send-email returned ${response.status}: ${errorBody}`);
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const body: SubmitDemoRequestBody = await req.clone().json().catch(() => ({}));
    const turnstileError = await verifyTurnstile(body.turnstile_token || "", req);
    if (turnstileError) {
      return jsonResponse({ error: turnstileError }, 400);
    }

    const fullName = normalizeText(body.full_name);
    const labName = normalizeText(body.lab_name);
    const email = normalizeText(body.email).toLowerCase();
    const phone = normalizeText(body.phone);
    const city = normalizeText(body.city);
    const notes = normalizeText(body.notes);
    const hostname = normalizeText(body.hostname);
    const pagePath = normalizeText(body.page_path);
    const referer = normalizeText(body.referer);
    const utmSource = normalizeText(body.utm_source);
    const utmMedium = normalizeText(body.utm_medium);
    const utmCampaign = normalizeText(body.utm_campaign);
    const utmTerm = normalizeText(body.utm_term);
    const utmContent = normalizeText(body.utm_content);
    const gclid = normalizeText(body.gclid);
    const fbclid = normalizeText(body.fbclid);
    const branchCount = typeof body.branch_count === "number" && Number.isFinite(body.branch_count)
      ? Math.max(1, Math.min(999, Math.round(body.branch_count)))
      : null;

    if (!fullName || !labName || !email || !phone) {
      return jsonResponse({ error: "Full name, lab name, work email, and phone are required." }, 400);
    }

    if (fullName.length > MAX_NAME_LENGTH) {
      return jsonResponse({ error: `Full name must be ${MAX_NAME_LENGTH} characters or fewer.` }, 400);
    }

    if (labName.length > MAX_LAB_NAME_LENGTH) {
      return jsonResponse({ error: `Lab name must be ${MAX_LAB_NAME_LENGTH} characters or fewer.` }, 400);
    }

    if (email.length > MAX_EMAIL_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: "Enter a valid work email address." }, 400);
    }

    if (phone.length > MAX_PHONE_LENGTH) {
      return jsonResponse({ error: `Phone must be ${MAX_PHONE_LENGTH} characters or fewer.` }, 400);
    }

    if (city.length > MAX_CITY_LENGTH) {
      return jsonResponse({ error: `City must be ${MAX_CITY_LENGTH} characters or fewer.` }, 400);
    }

    if (notes.length > MAX_NOTES_LENGTH) {
      return jsonResponse({ error: `Notes must be ${MAX_NOTES_LENGTH} characters or fewer.` }, 400);
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

    const { error } = await supabaseAdmin.from("platform_demo_requests").insert({
      full_name: fullName,
      lab_name: labName,
      email,
      phone,
      city: city || null,
      branch_count: branchCount,
      notes: notes || null,
      hostname: hostname || null,
      page_path: pagePath || null,
      referer: referer || null,
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      utm_term: utmTerm || null,
      utm_content: utmContent || null,
      gclid: gclid || null,
      fbclid: fbclid || null,
      source: "website",
      status: "new",
    });

    if (error) {
      console.error("Failed to store demo request:", error);
      return jsonResponse({ error: "Failed to submit demo request." }, 500);
    }

    let notificationSent = false;
    try {
      await notifySalesLead(supabaseUrl, serviceRoleKey, {
        fullName,
        labName,
        email,
        phone,
        city,
        branchCount,
        notes,
        hostname,
        pagePath,
        utmSource,
        utmMedium,
        utmCampaign,
      });
      notificationSent = true;
    } catch (notificationError) {
      console.warn("Demo request stored but sales notification failed:", notificationError);
    }

    return jsonResponse({ success: true, notification_sent: notificationSent });
  } catch (error) {
    console.error("submit-demo-request error:", error);
    return jsonResponse({ error: "Unexpected server error." }, 500);
  }
});
