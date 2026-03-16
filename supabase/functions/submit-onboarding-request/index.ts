import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyTurnstile } from "../_shared/patient-auth.ts";
import { normalizeHostname } from "../_shared/public-organization.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PLATFORM_CONTACT_EMAIL =
  Deno.env.get("PLATFORM_CONTACT_EMAIL")?.trim() ||
  Deno.env.get("SALES_CONTACT_EMAIL")?.trim() ||
  Deno.env.get("DEFAULT_FROM_EMAIL")?.trim() ||
  "sales@example.com";

const MAX_TEXT = {
  organizationName: 160,
  primaryLabName: 160,
  ownerName: 120,
  ownerEmail: 200,
  ownerPhone: 30,
  city: 120,
  customDomain: 200,
  preferredSubdomain: 80,
  notes: 1600,
};

type SelectedPlan = "starter" | "growth" | "premium";
type SetupMode = "self_serve" | "assisted";
const DEFAULT_OWNER_PASSWORD_LENGTH = 14;

interface SubmitOnboardingRequestBody {
  selected_plan?: SelectedPlan;
  setup_mode?: SetupMode;
  organization_name?: string;
  primary_lab_name?: string | null;
  owner_full_name?: string;
  owner_email?: string;
  owner_phone?: string;
  city?: string | null;
  custom_domain?: string | null;
  branch_count?: number | null;
  preferred_subdomain?: string | null;
  go_live_target?: string | null;
  needs_data_import?: boolean;
  needs_white_label?: boolean;
  notes?: string | null;
  coupon_code?: string | null;
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

const isValidPlan = (value: string): value is SelectedPlan =>
  ["starter", "growth", "premium"].includes(value);

const isValidSetupMode = (value: string): value is SetupMode =>
  ["self_serve", "assisted"].includes(value);

const normalizeSubdomain = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");

const normalizeDomain = (value: string | null | undefined) => {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    return trimmed.replace(/^https?:\/\//, "").replace(/:\d+$/, "");
  }
};

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

const generatePassword = (length = DEFAULT_OWNER_PASSWORD_LENGTH) => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const randomBytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(randomBytes, (value) => alphabet[value % alphabet.length]).join("");
};

const deriveBaseDomain = (hostname: string | null) => {
  const configured =
    normalizeHostname(Deno.env.get("PUBLIC_BASE_DOMAIN")) ||
    normalizeHostname(Deno.env.get("VITE_PUBLIC_BASE_DOMAIN"));

  if (configured) {
    return configured;
  }

  if (!hostname) {
    return null;
  }

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "localhost";
  }

  return null;
};

const buildLaunchUrls = (domain: string | null, slug: string) => {
  const host = domain || `${slug}.localhost`;
  const protocol = host.endsWith(".localhost") || host === "localhost" || host === "127.0.0.1" ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  return {
    launch_url: baseUrl,
    staff_login_url: `${baseUrl}/auth/employee`,
    patient_login_url: `${baseUrl}/auth/patient`,
    booking_url: `${baseUrl}/book-test`,
  };
};

const getDnsGuide = (customDomain: string, fallbackDomain: string) => {
  if (!customDomain || !fallbackDomain) {
    return null;
  }

  const labels = customDomain.split(".").filter(Boolean);
  const isApexDomain = labels.length <= 2;

  return {
    recordType: isApexDomain ? "ALIAS / ANAME" : "CNAME",
    hostLabel: isApexDomain ? "@" : labels[0],
    target: fallbackDomain,
    isApexDomain,
  };
};

const deriveRequestedFallbackDomain = (
  hostname: string,
  preferredSubdomain: string,
  organizationName: string,
) => {
  const baseDomain = deriveBaseDomain(normalizeHostname(hostname || null));
  const slug = normalizeSubdomain(preferredSubdomain) || slugify(organizationName);

  return baseDomain && slug ? `${slug}.${baseDomain}` : "";
};

const shouldAutoProvision = (input: {
  selectedPlan: SelectedPlan;
  setupMode: SetupMode;
  branchCount: number;
  needsDataImport: boolean;
  needsWhiteLabel: boolean;
}) =>
  input.setupMode === "self_serve" &&
  input.selectedPlan !== "premium" &&
  input.branchCount <= 2 &&
  !input.needsDataImport &&
  !input.needsWhiteLabel;

async function notifyOnboardingLead(
  supabaseUrl: string,
  serviceRoleKey: string,
  payload: {
    selectedPlan: SelectedPlan;
    setupMode: SetupMode;
    organizationName: string;
    primaryLabName: string;
    ownerFullName: string;
    ownerEmail: string;
    ownerPhone: string;
    city: string;
    customDomain: string;
    branchCount: number;
    preferredSubdomain: string;
    fallbackDomain: string;
    goLiveTarget: string;
    needsDataImport: boolean;
    needsWhiteLabel: boolean;
    notes: string;
    hostname: string;
    pagePath: string;
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
  },
) {
  const dnsGuide = getDnsGuide(payload.customDomain, payload.fallbackDomain);
  const htmlContent = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
      <h2 style="margin:0 0 12px;">New Self-Serve Onboarding Request</h2>
      <p style="margin:0 0 16px;">A lab submitted a get-started request from the product website.</p>
      <table style="border-collapse:collapse;width:100%;max-width:720px;">
        <tr><td style="padding:8px 0;font-weight:600;">Plan</td><td style="padding:8px 0;">${escapeHtml(payload.selectedPlan)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Setup mode</td><td style="padding:8px 0;">${escapeHtml(payload.setupMode)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Organization</td><td style="padding:8px 0;">${escapeHtml(payload.organizationName)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Primary lab</td><td style="padding:8px 0;">${escapeHtml(payload.primaryLabName || "-")}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Owner</td><td style="padding:8px 0;">${escapeHtml(payload.ownerFullName)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Email</td><td style="padding:8px 0;">${escapeHtml(payload.ownerEmail)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Phone</td><td style="padding:8px 0;">${escapeHtml(payload.ownerPhone)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">City</td><td style="padding:8px 0;">${escapeHtml(payload.city || "-")}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Requested primary domain</td><td style="padding:8px 0;">${escapeHtml(payload.customDomain || "-")}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Branches</td><td style="padding:8px 0;">${payload.branchCount}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Preferred subdomain</td><td style="padding:8px 0;">${escapeHtml(payload.preferredSubdomain || "-")}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Fallback launch domain</td><td style="padding:8px 0;">${escapeHtml(payload.fallbackDomain || "-")}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Go-live target</td><td style="padding:8px 0;">${escapeHtml(payload.goLiveTarget || "-")}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Needs data import</td><td style="padding:8px 0;">${payload.needsDataImport ? "Yes" : "No"}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Needs white-label</td><td style="padding:8px 0;">${payload.needsWhiteLabel ? "Yes" : "No"}</td></tr>
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
      ${dnsGuide ? `<div style="margin-top:16px;padding:12px;border:1px solid #fcd34d;border-radius:12px;background:#fffbeb;">
        <p style="margin:0 0 8px;font-weight:600;">DNS handoff</p>
        <p style="margin:0 0 8px;">${escapeHtml(dnsGuide.recordType)} · ${escapeHtml(dnsGuide.hostLabel)} -> ${escapeHtml(dnsGuide.target)}</p>
        ${dnsGuide.isApexDomain ? `<p style="margin:0;">Root domains may need provider-specific ALIAS or ANAME support.</p>` : ""}
      </div>` : ""}
    </div>
  `;

  const textContent = [
    "New Self-Serve Onboarding Request",
    `Plan: ${payload.selectedPlan}`,
    `Setup mode: ${payload.setupMode}`,
    `Organization: ${payload.organizationName}`,
    `Primary lab: ${payload.primaryLabName || "-"}`,
    `Owner: ${payload.ownerFullName}`,
    `Email: ${payload.ownerEmail}`,
    `Phone: ${payload.ownerPhone}`,
    `City: ${payload.city || "-"}`,
    `Requested primary domain: ${payload.customDomain || "-"}`,
    `Branches: ${payload.branchCount}`,
    `Preferred subdomain: ${payload.preferredSubdomain || "-"}`,
    `Fallback launch domain: ${payload.fallbackDomain || "-"}`,
    `Go-live target: ${payload.goLiveTarget || "-"}`,
    `Needs data import: ${payload.needsDataImport ? "Yes" : "No"}`,
    `Needs white-label: ${payload.needsWhiteLabel ? "Yes" : "No"}`,
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
      subject: `New onboarding request from ${payload.organizationName}`,
      htmlContent,
      textContent,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`send-email returned ${response.status}: ${errorBody}`);
  }
}

async function notifyOwnerConfirmation(
  supabaseUrl: string,
  serviceRoleKey: string,
  payload: {
    selectedPlan: SelectedPlan;
    setupMode: SetupMode;
    organizationName: string;
    ownerFullName: string;
    ownerEmail: string;
    branchCount: number;
    customDomain: string;
    preferredSubdomain: string;
    fallbackDomain: string;
    goLiveTarget: string;
    needsDataImport: boolean;
    needsWhiteLabel: boolean;
  },
) {
  const dnsGuide = getDnsGuide(payload.customDomain, payload.fallbackDomain);
  const htmlContent = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
      <h2 style="margin:0 0 12px;">We received your setup request</h2>
      <p style="margin:0 0 16px;">Hi ${escapeHtml(payload.ownerFullName)}, thanks for starting setup for ${escapeHtml(payload.organizationName)}.</p>
      <p style="margin:0 0 16px;">Your request is now in the onboarding queue. A platform admin will review the details and either provision your workspace directly or contact you if anything needs clarification.</p>
      <p style="margin:0 0 16px;">${
        payload.customDomain
          ? `Requested primary domain: ${escapeHtml(payload.customDomain)}. We will keep a platform fallback URL available during launch.`
          : "No custom domain was supplied, so the initial launch will use a platform-managed subdomain."
      }</p>
      <table style="border-collapse:collapse;width:100%;max-width:720px;">
        <tr><td style="padding:8px 0;font-weight:600;">Plan</td><td style="padding:8px 0;">${escapeHtml(payload.selectedPlan)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Setup mode</td><td style="padding:8px 0;">${escapeHtml(payload.setupMode)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Branches</td><td style="padding:8px 0;">${payload.branchCount}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Preferred subdomain</td><td style="padding:8px 0;">${escapeHtml(payload.preferredSubdomain || "-")}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Fallback launch domain</td><td style="padding:8px 0;">${escapeHtml(payload.fallbackDomain || "-")}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Go-live target</td><td style="padding:8px 0;">${escapeHtml(payload.goLiveTarget || "-")}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Needs data import</td><td style="padding:8px 0;">${payload.needsDataImport ? "Yes" : "No"}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Needs white-label</td><td style="padding:8px 0;">${payload.needsWhiteLabel ? "Yes" : "No"}</td></tr>
      </table>
      ${dnsGuide ? `<div style="margin-top:16px;padding:12px;border:1px solid #fcd34d;border-radius:12px;background:#fffbeb;">
        <p style="margin:0 0 8px;font-weight:600;">Domain connection step</p>
        <p style="margin:0 0 8px;">Add: ${escapeHtml(dnsGuide.recordType)} · ${escapeHtml(dnsGuide.hostLabel)} -> ${escapeHtml(dnsGuide.target)}</p>
        ${dnsGuide.isApexDomain ? `<p style="margin:0;">Root domains may need provider-specific ALIAS or ANAME support.</p>` : ""}
      </div>` : ""}
      <p style="margin-top:16px;">Once your workspace is ready, we will send launch details and login access to this email address.</p>
      <p style="margin-top:16px;">For questions, reply to ${escapeHtml(PLATFORM_CONTACT_EMAIL)}.</p>
    </div>
  `;

  const textContent = [
    `Hi ${payload.ownerFullName},`,
    "",
    `We received your setup request for ${payload.organizationName}.`,
    payload.customDomain
      ? `Requested primary domain: ${payload.customDomain}`
      : "No custom domain supplied. Initial launch will use a platform-managed subdomain.",
    `Plan: ${payload.selectedPlan}`,
    `Setup mode: ${payload.setupMode}`,
    `Branches: ${payload.branchCount}`,
    `Preferred subdomain: ${payload.preferredSubdomain || "-"}`,
    `Fallback launch domain: ${payload.fallbackDomain || "-"}`,
    `Go-live target: ${payload.goLiveTarget || "-"}`,
    `Needs data import: ${payload.needsDataImport ? "Yes" : "No"}`,
    `Needs white-label: ${payload.needsWhiteLabel ? "Yes" : "No"}`,
    "",
    "A platform admin will review the request and send launch details once the workspace is ready.",
    `For questions, reply to ${PLATFORM_CONTACT_EMAIL}.`,
  ].join("\n");

  const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-service-key": serviceRoleKey,
    },
    body: JSON.stringify({
      to: payload.ownerEmail,
      subject: `We received your setup request for ${payload.organizationName}`,
      htmlContent,
      textContent,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`send-email returned ${response.status}: ${errorBody}`);
  }
}

async function notifyOwnerProvisioned(
  supabaseUrl: string,
  serviceRoleKey: string,
  payload: {
    ownerEmail: string;
    ownerFullName: string;
    organizationName: string;
    temporaryPassword: string;
    primaryDomain: string;
    accessDomain: string;
    launchUrl: string;
    staffLoginUrl: string;
    patientLoginUrl: string;
    bookingUrl: string;
  },
) {
  const dnsGuide = getDnsGuide(payload.primaryDomain, payload.accessDomain);
  const htmlContent = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
      <h2 style="margin:0 0 12px;">Your lab workspace is ready</h2>
      <p style="margin:0 0 16px;">${escapeHtml(payload.organizationName)} has been provisioned on the platform.</p>
      <table style="border-collapse:collapse;width:100%;max-width:720px;">
        <tr><td style="padding:8px 0;font-weight:600;">Owner email</td><td style="padding:8px 0;">${escapeHtml(payload.ownerEmail)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Temporary password</td><td style="padding:8px 0;">${escapeHtml(payload.temporaryPassword)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Primary public domain</td><td style="padding:8px 0;">${escapeHtml(payload.primaryDomain || "-")}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Fallback launch domain</td><td style="padding:8px 0;">${escapeHtml(payload.accessDomain || "-")}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Workspace URL</td><td style="padding:8px 0;"><a href="${escapeHtml(payload.launchUrl)}">${escapeHtml(payload.launchUrl)}</a></td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Staff login</td><td style="padding:8px 0;"><a href="${escapeHtml(payload.staffLoginUrl)}">${escapeHtml(payload.staffLoginUrl)}</a></td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Patient login</td><td style="padding:8px 0;"><a href="${escapeHtml(payload.patientLoginUrl)}">${escapeHtml(payload.patientLoginUrl)}</a></td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Booking page</td><td style="padding:8px 0;"><a href="${escapeHtml(payload.bookingUrl)}">${escapeHtml(payload.bookingUrl)}</a></td></tr>
      </table>
      ${dnsGuide ? `<div style="margin-top:16px;padding:12px;border:1px solid #fcd34d;border-radius:12px;background:#fffbeb;">
        <p style="margin:0 0 8px;font-weight:600;">Custom domain DNS step</p>
        <p style="margin:0 0 8px;">Keep using the fallback launch domain until DNS is ready.</p>
        <p style="margin:0 0 8px;">Add: ${escapeHtml(dnsGuide.recordType)} · ${escapeHtml(dnsGuide.hostLabel)} -> ${escapeHtml(dnsGuide.target)}</p>
        ${dnsGuide.isApexDomain ? `<p style="margin:0;">Root domains may need provider-specific ALIAS or ANAME support.</p>` : ""}
      </div>` : ""}
      <p style="margin-top:16px;">Use the temporary password for your first sign-in, then rotate it from the admin side after onboarding.</p>
      <p style="margin-top:16px;">If you need help, reply to ${escapeHtml(PLATFORM_CONTACT_EMAIL)}.</p>
    </div>
  `;

  const textContent = [
    `Hello ${payload.ownerFullName},`,
    "",
    `${payload.organizationName} is ready on the platform.`,
    `Owner email: ${payload.ownerEmail}`,
    `Temporary password: ${payload.temporaryPassword}`,
    `Primary public domain: ${payload.primaryDomain || "-"}`,
    `Fallback launch domain: ${payload.accessDomain || "-"}`,
    `Workspace URL: ${payload.launchUrl}`,
    `Staff login: ${payload.staffLoginUrl}`,
    `Patient login: ${payload.patientLoginUrl}`,
    `Booking page: ${payload.bookingUrl}`,
    "",
    `If you need help, reply to ${PLATFORM_CONTACT_EMAIL}.`,
  ].join("\n");

  const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-service-key": serviceRoleKey,
    },
    body: JSON.stringify({
      to: payload.ownerEmail,
      subject: `${payload.organizationName} is ready`,
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
    const body: SubmitOnboardingRequestBody = await req.clone().json().catch(() => ({}));
    const turnstileError = await verifyTurnstile(body.turnstile_token || "", req);
    if (turnstileError) {
      return jsonResponse({ error: turnstileError }, 400);
    }

    const selectedPlan = normalizeText(body.selected_plan);
    const setupMode = normalizeText(body.setup_mode);
    const organizationName = normalizeText(body.organization_name);
    const primaryLabName = normalizeText(body.primary_lab_name);
    const ownerFullName = normalizeText(body.owner_full_name);
    const ownerEmail = normalizeText(body.owner_email).toLowerCase();
    const ownerPhone = normalizeText(body.owner_phone);
    const city = normalizeText(body.city);
    const customDomain = normalizeDomain(normalizeText(body.custom_domain));
    const preferredSubdomain = normalizeSubdomain(normalizeText(body.preferred_subdomain));
    const goLiveTarget = normalizeText(body.go_live_target);
    const notes = normalizeText(body.notes);
    const couponCode = normalizeText(body.coupon_code)?.toUpperCase() || null;
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
    const needsDataImport = Boolean(body.needs_data_import);
    const needsWhiteLabel = Boolean(body.needs_white_label);
    const branchCount = typeof body.branch_count === "number" && Number.isFinite(body.branch_count)
      ? Math.max(1, Math.min(999, Math.round(body.branch_count)))
      : 1;

    if (!isValidPlan(selectedPlan)) {
      return jsonResponse({ error: "Select a valid plan." }, 400);
    }

    if (!isValidSetupMode(setupMode)) {
      return jsonResponse({ error: "Select a valid setup mode." }, 400);
    }

    if (!organizationName || !ownerFullName || !ownerEmail || !ownerPhone) {
      return jsonResponse({ error: "Organization name, owner name, work email, and phone are required." }, 400);
    }

    if (organizationName.length > MAX_TEXT.organizationName) {
      return jsonResponse({ error: `Organization name must be ${MAX_TEXT.organizationName} characters or fewer.` }, 400);
    }

    if (primaryLabName.length > MAX_TEXT.primaryLabName) {
      return jsonResponse({ error: `Primary lab name must be ${MAX_TEXT.primaryLabName} characters or fewer.` }, 400);
    }

    if (ownerFullName.length > MAX_TEXT.ownerName) {
      return jsonResponse({ error: `Owner name must be ${MAX_TEXT.ownerName} characters or fewer.` }, 400);
    }

    if (ownerEmail.length > MAX_TEXT.ownerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
      return jsonResponse({ error: "Enter a valid work email address." }, 400);
    }

    if (ownerPhone.length > MAX_TEXT.ownerPhone) {
      return jsonResponse({ error: `Phone must be ${MAX_TEXT.ownerPhone} characters or fewer.` }, 400);
    }

    if (city.length > MAX_TEXT.city) {
      return jsonResponse({ error: `City must be ${MAX_TEXT.city} characters or fewer.` }, 400);
    }

    if (customDomain.length > MAX_TEXT.customDomain) {
      return jsonResponse({ error: `Custom domain must be ${MAX_TEXT.customDomain} characters or fewer.` }, 400);
    }

    if (preferredSubdomain.length > MAX_TEXT.preferredSubdomain) {
      return jsonResponse({ error: `Preferred subdomain must be ${MAX_TEXT.preferredSubdomain} characters or fewer.` }, 400);
    }

    if (notes.length > MAX_TEXT.notes) {
      return jsonResponse({ error: `Notes must be ${MAX_TEXT.notes} characters or fewer.` }, 400);
    }

    let goLiveDate: string | null = null;
    if (goLiveTarget) {
      const parsed = new Date(goLiveTarget);
      if (Number.isNaN(parsed.getTime())) {
        return jsonResponse({ error: "Enter a valid go-live target date." }, 400);
      }
      goLiveDate = parsed.toISOString().slice(0, 10);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Server configuration missing." }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: insertedRequest, error } = await supabaseAdmin.from("platform_onboarding_requests").insert({
      selected_plan: selectedPlan,
      setup_mode: setupMode,
      organization_name: organizationName,
      primary_lab_name: primaryLabName || null,
      owner_full_name: ownerFullName,
      owner_email: ownerEmail,
      owner_phone: ownerPhone,
      city: city || null,
      custom_domain: customDomain || null,
      branch_count: branchCount,
      preferred_subdomain: preferredSubdomain || null,
      go_live_target: goLiveDate,
      needs_data_import: needsDataImport,
      needs_white_label: needsWhiteLabel,
      notes: notes || null,
      coupon_code: couponCode || null,
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
      status: "new",
    }).select("id").single();

    if (error || !insertedRequest?.id) {
      console.error("Failed to store onboarding request:", error);
      return jsonResponse({ error: "Failed to submit onboarding request." }, 500);
    }

    let internalNotificationSent = false;
    let ownerConfirmationSent = false;
    let autoProvisioned = false;
    let ownerLaunchEmailSent = false;
    let launchUrl = "";
    let staffLoginUrl = "";
    let patientLoginUrl = "";
    let bookingUrl = "";
    let organizationSlug = "";
    let primaryDomain = "";
    let accessDomain = "";
    let ownerTemporaryPassword = "";
    const requestedFallbackDomain = deriveRequestedFallbackDomain(hostname, preferredSubdomain, organizationName);
    try {
      await notifyOnboardingLead(supabaseUrl, serviceRoleKey, {
        selectedPlan,
        setupMode,
        organizationName,
        primaryLabName,
        ownerFullName,
        ownerEmail,
        ownerPhone,
        city,
        customDomain,
        branchCount,
        preferredSubdomain,
        fallbackDomain: requestedFallbackDomain,
        goLiveTarget: goLiveDate || "",
        needsDataImport,
        needsWhiteLabel,
        notes,
        hostname,
        pagePath,
        utmSource,
        utmMedium,
        utmCampaign,
      });
      internalNotificationSent = true;
    } catch (notifyError) {
      console.error("Failed to notify onboarding request:", notifyError);
    }

    if (
      shouldAutoProvision({
        selectedPlan,
        setupMode,
        branchCount,
        needsDataImport,
        needsWhiteLabel,
      })
    ) {
      try {
        const baseSlug = normalizeSubdomain(preferredSubdomain) || slugify(organizationName);
        const baseDomain = deriveBaseDomain(normalizeHostname(hostname || null));
        let resolvedSlug = baseSlug;
        let resolvedAccessDomain: string | null = null;

        for (let attempt = 1; attempt <= 25; attempt += 1) {
          const candidateSlug = attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;
          const candidateDomain = baseDomain ? `${candidateSlug}.${baseDomain}` : null;

          const { data: existingOrganization } = await supabaseAdmin
            .from("organizations")
            .select("id")
            .eq("slug", candidateSlug)
            .limit(1)
            .maybeSingle();

          if (existingOrganization?.id) {
            continue;
          }

          if (candidateDomain) {
            const { data: existingDomain } = await supabaseAdmin
              .from("organization_domains")
              .select("id")
              .eq("domain", candidateDomain)
              .limit(1)
              .maybeSingle();

            if (existingDomain?.id) {
              continue;
            }
          }

          resolvedSlug = candidateSlug;
          resolvedAccessDomain = candidateDomain;
          break;
        }

        const resolvedPrimaryDomain = customDomain || resolvedAccessDomain;
        const temporaryPassword = generatePassword();
        const provisionResponse = await fetch(`${supabaseUrl}/functions/v1/provision-organization`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-service-key": serviceRoleKey,
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            display_name: organizationName,
            slug: resolvedSlug,
            plan_code: selectedPlan,
            primary_domain: resolvedPrimaryDomain,
            secondary_domain:
              customDomain && resolvedAccessDomain && resolvedAccessDomain !== resolvedPrimaryDomain
                ? resolvedAccessDomain
                : null,
            owner_email: ownerEmail,
            owner_password: temporaryPassword,
            owner_full_name: ownerFullName,
            owner_phone: ownerPhone,
            primary_lab_name: primaryLabName || `${organizationName} Main Lab`,
            primary_lab_code: "LAB001",
          }),
        });

        const provisionPayload = await provisionResponse.json().catch(() => ({}));
        if (!provisionResponse.ok) {
          throw new Error(String(provisionPayload?.error || "Auto-provisioning failed."));
        }

        const launchUrls = buildLaunchUrls(
          (provisionPayload.access_domain as string | null) ||
            (provisionPayload.secondary_domain as string | null) ||
            (provisionPayload.primary_domain as string | null) ||
            resolvedAccessDomain ||
            resolvedPrimaryDomain,
          (provisionPayload.organization_slug as string | null) || resolvedSlug,
        );

        await supabaseAdmin
          .from("platform_onboarding_requests")
          .update({
            status: "approved",
            resolved_slug: resolvedSlug,
            resolved_domain: resolvedPrimaryDomain,
            resolved_access_domain: resolvedAccessDomain || resolvedPrimaryDomain,
            provisioned_organization_id: String(provisionPayload.organization_id || "") || null,
            provisioned_lab_id: String(provisionPayload.lab_id || "") || null,
            provisioned_owner_user_id: String(provisionPayload.owner_user_id || "") || null,
            provisioned_at: new Date().toISOString(),
            provisioning_error: null,
          })
          .eq("id", insertedRequest.id);

        autoProvisioned = true;
        launchUrl = launchUrls.launch_url;
        staffLoginUrl = launchUrls.staff_login_url;
        patientLoginUrl = launchUrls.patient_login_url;
        bookingUrl = launchUrls.booking_url;
        organizationSlug = String(provisionPayload.organization_slug || resolvedSlug);
        primaryDomain = String(provisionPayload.primary_domain || resolvedPrimaryDomain || "");
        accessDomain = String(
          provisionPayload.access_domain ||
            provisionPayload.secondary_domain ||
            resolvedAccessDomain ||
            resolvedPrimaryDomain ||
            "",
        );
        ownerTemporaryPassword = temporaryPassword;

        try {
          await notifyOwnerProvisioned(supabaseUrl, serviceRoleKey, {
            ownerEmail: ownerEmail,
            ownerFullName: ownerFullName,
            organizationName: organizationName,
            temporaryPassword,
            primaryDomain: String(provisionPayload.primary_domain || resolvedPrimaryDomain || ""),
            accessDomain: String(
              provisionPayload.access_domain ||
                provisionPayload.secondary_domain ||
                resolvedAccessDomain ||
                resolvedPrimaryDomain ||
                "",
            ),
            launchUrl: launchUrls.launch_url,
            staffLoginUrl: launchUrls.staff_login_url,
            patientLoginUrl: launchUrls.patient_login_url,
            bookingUrl: launchUrls.booking_url,
          });
          ownerLaunchEmailSent = true;
        } catch (notifyError) {
          console.error("Failed to send auto-provisioned launch email:", notifyError);
        }
      } catch (autoProvisionError) {
        console.error("Auto-provisioning skipped after failure:", autoProvisionError);
        await supabaseAdmin
          .from("platform_onboarding_requests")
          .update({
            provisioning_error:
              autoProvisionError instanceof Error
                ? autoProvisionError.message
                : "Auto-provisioning failed.",
          })
          .eq("id", insertedRequest.id);
      }
    }

    if (!autoProvisioned) {
      try {
        await notifyOwnerConfirmation(supabaseUrl, serviceRoleKey, {
          selectedPlan,
          setupMode,
          organizationName,
          ownerFullName,
          ownerEmail,
          branchCount,
          customDomain,
          preferredSubdomain,
          fallbackDomain: requestedFallbackDomain,
          goLiveTarget: goLiveDate || "",
          needsDataImport,
          needsWhiteLabel,
        });
        ownerConfirmationSent = true;
      } catch (notifyError) {
        console.error("Failed to send onboarding owner confirmation:", notifyError);
      }
    }

    return jsonResponse({
      success: true,
      internal_notification_sent: internalNotificationSent,
      owner_confirmation_sent: ownerConfirmationSent,
      auto_provisioned: autoProvisioned,
      owner_launch_email_sent: ownerLaunchEmailSent,
      launch_url: launchUrl || null,
      staff_login_url: staffLoginUrl || null,
      patient_login_url: patientLoginUrl || null,
      booking_url: bookingUrl || null,
      organization_slug: organizationSlug || null,
      primary_domain: primaryDomain || null,
      access_domain: accessDomain || null,
      owner_temporary_password: autoProvisioned ? ownerTemporaryPassword || null : null,
      message: autoProvisioned
        ? "Workspace created successfully. Check your email for launch details."
        : "Onboarding request submitted successfully.",
    });
  } catch (error) {
    console.error("submit-onboarding-request error:", error);
    return jsonResponse({ error: "Unexpected server error." }, 500);
  }
});
