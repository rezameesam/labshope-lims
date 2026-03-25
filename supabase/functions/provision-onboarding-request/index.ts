import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeHostname } from "../_shared/public-organization.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type OnboardingStatus = "new" | "reviewing" | "approved" | "closed";

interface ProvisionOnboardingRequestBody {
  request_id?: string;
}

interface OnboardingRequestRow {
  id: string;
  status: OnboardingStatus;
  selected_plan: "starter" | "growth" | "premium";
  organization_name: string;
  primary_lab_name: string | null;
  owner_full_name: string;
  owner_email: string;
  owner_phone: string;
  custom_domain: string | null;
  preferred_subdomain: string | null;
  hostname: string | null;
  resolved_slug: string | null;
  resolved_domain: string | null;
  resolved_access_domain: string | null;
  provisioned_organization_id: string | null;
  provisioned_lab_id: string | null;
  provisioned_owner_user_id: string | null;
}

const DEFAULT_OWNER_PASSWORD_LENGTH = 14;
const PLATFORM_CONTACT_EMAIL =
  Deno.env.get("PLATFORM_CONTACT_EMAIL")?.trim() ||
  Deno.env.get("SALES_CONTACT_EMAIL")?.trim() ||
  Deno.env.get("DEFAULT_FROM_EMAIL")?.trim() ||
  "sales@example.com";

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const generatePassword = (length = DEFAULT_OWNER_PASSWORD_LENGTH) => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const randomBytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(randomBytes, (value) => alphabet[value % alphabet.length]).join("");
};

const isRealDomain = (value: string | null): boolean =>
  !!value && value !== "localhost" && value !== "127.0.0.1" && !value.endsWith(".localhost");

const deriveBaseDomain = (hostname: string | null) => {
  const configured =
    normalizeHostname(Deno.env.get("PUBLIC_BASE_DOMAIN")) ||
    normalizeHostname(Deno.env.get("VITE_PUBLIC_BASE_DOMAIN"));

  if (configured && isRealDomain(configured)) {
    return configured;
  }

  if (!hostname) {
    return null;
  }

  if (!isRealDomain(hostname)) {
    return "localhost";
  }

  // Derive base domain from the caller's hostname.
  // e.g. "labshope.com" → "labshope.com"
  //      "lims.labshope.com" → "labshope.com"
  const parts = hostname.split(".");
  return parts.slice(-2).join(".");
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

const notifyOwnerProvisioned = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  payload: {
    ownerEmail: string;
    ownerFullName: string;
    organizationName: string;
    temporaryPassword: string;
    launchUrl: string;
    staffLoginUrl: string;
    patientLoginUrl: string;
    bookingUrl: string;
  },
) => {
  const htmlContent = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
      <h2 style="margin:0 0 12px;">Your lab workspace is ready</h2>
      <p style="margin:0 0 16px;">${escapeHtml(payload.organizationName)} has been provisioned on the platform.</p>
      <table style="border-collapse:collapse;width:100%;max-width:720px;">
        <tr><td style="padding:8px 0;font-weight:600;">Owner email</td><td style="padding:8px 0;">${escapeHtml(payload.ownerEmail)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Temporary password</td><td style="padding:8px 0;">${escapeHtml(payload.temporaryPassword)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Workspace URL</td><td style="padding:8px 0;"><a href="${escapeHtml(payload.launchUrl)}">${escapeHtml(payload.launchUrl)}</a></td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Staff login</td><td style="padding:8px 0;"><a href="${escapeHtml(payload.staffLoginUrl)}">${escapeHtml(payload.staffLoginUrl)}</a></td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Patient login</td><td style="padding:8px 0;"><a href="${escapeHtml(payload.patientLoginUrl)}">${escapeHtml(payload.patientLoginUrl)}</a></td></tr>
        <tr><td style="padding:8px 0;font-weight:600;">Booking page</td><td style="padding:8px 0;"><a href="${escapeHtml(payload.bookingUrl)}">${escapeHtml(payload.bookingUrl)}</a></td></tr>
      </table>
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
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const authHeader = req.headers.get("Authorization");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: "Server configuration missing." }, 500);
    }

    if (!authHeader) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: authData, error: authError } = await supabaseClient.auth.getUser(token);
    const callingUser = authData.user;

    if (authError || !callingUser) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { data: platformAdminMembership, error: platformAdminError } = await supabaseAdmin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", callingUser.id)
      .maybeSingle();

    if (platformAdminError) {
      throw platformAdminError;
    }

    if (!platformAdminMembership?.user_id) {
      return jsonResponse({ error: "Platform admin access required." }, 403);
    }

    const body: ProvisionOnboardingRequestBody = await req.json().catch(() => ({}));
    const requestId = body.request_id?.trim();
    if (!requestId) {
      return jsonResponse({ error: "request_id is required." }, 400);
    }

    const { data: requestRow, error: requestError } = await supabaseAdmin
      .from("platform_onboarding_requests")
      .select(
        "id,status,selected_plan,organization_name,primary_lab_name,owner_full_name,owner_email,owner_phone,custom_domain,preferred_subdomain,hostname,resolved_slug,resolved_domain,resolved_access_domain,provisioned_organization_id,provisioned_lab_id,provisioned_owner_user_id",
      )
      .eq("id", requestId)
      .single();

    if (requestError || !requestRow) {
      return jsonResponse({ error: "Onboarding request not found." }, 404);
    }

    const requestData = requestRow as OnboardingRequestRow;
    if (requestData.status === "closed") {
      return jsonResponse({ error: "Closed onboarding requests cannot be provisioned." }, 400);
    }

    if (requestData.provisioned_organization_id) {
      return jsonResponse(
        {
          success: true,
          already_provisioned: true,
          request_id: requestData.id,
          organization_id: requestData.provisioned_organization_id,
          lab_id: requestData.provisioned_lab_id,
          owner_user_id: requestData.provisioned_owner_user_id,
          organization_slug: requestData.resolved_slug,
          primary_domain: requestData.resolved_domain,
          access_domain: requestData.resolved_access_domain || requestData.resolved_domain,
          ...buildLaunchUrls(
            requestData.resolved_access_domain || requestData.resolved_domain,
            requestData.resolved_slug || "lab",
          ),
        },
        200,
      );
    }

    const preferredSlug = slugify(requestData.preferred_subdomain || "");
    const baseSlug = preferredSlug || slugify(requestData.organization_name);
    if (!baseSlug) {
      return jsonResponse({ error: "Unable to derive organization slug from onboarding request." }, 400);
    }

    const baseDomain = deriveBaseDomain(normalizeHostname(requestData.hostname));
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

    const resolvedPrimaryDomain = requestData.custom_domain || resolvedAccessDomain;
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
        display_name: requestData.organization_name,
        slug: resolvedSlug,
        plan_code: requestData.selected_plan,
        primary_domain: resolvedPrimaryDomain,
        secondary_domain:
          requestData.custom_domain &&
          resolvedAccessDomain &&
          resolvedAccessDomain !== resolvedPrimaryDomain
            ? resolvedAccessDomain
            : null,
        owner_email: requestData.owner_email,
        owner_password: temporaryPassword,
        owner_full_name: requestData.owner_full_name,
        owner_phone: requestData.owner_phone,
        primary_lab_name: requestData.primary_lab_name || `${requestData.organization_name} Main Lab`,
        primary_lab_code: "LAB001",
      }),
    });

    const provisionPayload = await provisionResponse.json().catch(() => ({}));

    if (!provisionResponse.ok) {
      await supabaseAdmin
        .from("platform_onboarding_requests")
        .update({
          provisioning_error: String(provisionPayload?.error || "Provisioning failed."),
        })
        .eq("id", requestData.id);

      return jsonResponse(
        { error: String(provisionPayload?.error || "Failed to provision organization.") },
        provisionResponse.status >= 400 && provisionResponse.status < 600 ? provisionResponse.status : 500,
      );
    }

    const organizationId = String(provisionPayload.organization_id || "");
    const labId = String(provisionPayload.lab_id || "");
    const ownerUserId = String(provisionPayload.owner_user_id || "");

    await supabaseAdmin
      .from("platform_onboarding_requests")
      .update({
        status: "approved",
        resolved_slug: resolvedSlug,
        resolved_domain: resolvedPrimaryDomain,
        resolved_access_domain: resolvedAccessDomain || resolvedPrimaryDomain,
        provisioned_organization_id: organizationId || null,
        provisioned_lab_id: labId || null,
        provisioned_owner_user_id: ownerUserId || null,
        provisioned_by: callingUser.id,
        provisioned_at: new Date().toISOString(),
        provisioning_error: null,
      })
      .eq("id", requestData.id);

    const launchUrls = buildLaunchUrls(
      (provisionPayload.access_domain as string | null) ||
        (provisionPayload.secondary_domain as string | null) ||
        (provisionPayload.primary_domain as string | null) ||
        resolvedAccessDomain ||
        resolvedPrimaryDomain,
      (provisionPayload.organization_slug as string | null) || resolvedSlug,
    );

    let ownerNotificationStatus = "skipped";
    try {
      await notifyOwnerProvisioned(supabaseUrl, serviceRoleKey, {
        ownerEmail: requestData.owner_email,
        ownerFullName: requestData.owner_full_name,
        organizationName: requestData.organization_name,
        temporaryPassword,
        launchUrl: launchUrls.launch_url,
        staffLoginUrl: launchUrls.staff_login_url,
        patientLoginUrl: launchUrls.patient_login_url,
        bookingUrl: launchUrls.booking_url,
      });
      ownerNotificationStatus = "sent";
    } catch (notifyError) {
      console.error("Failed to notify provisioned owner:", notifyError);
      ownerNotificationStatus = "failed";
    }

    return jsonResponse({
      success: true,
      already_provisioned: false,
      request_id: requestData.id,
      organization_id: organizationId,
      lab_id: labId,
      owner_user_id: ownerUserId,
      organization_slug: String(provisionPayload.organization_slug || resolvedSlug),
      primary_domain: (provisionPayload.primary_domain as string | null) || resolvedPrimaryDomain,
      access_domain:
        (provisionPayload.access_domain as string | null) ||
        (provisionPayload.secondary_domain as string | null) ||
        resolvedAccessDomain ||
        resolvedPrimaryDomain,
      owner_email: requestData.owner_email,
      temporary_password: temporaryPassword,
      owner_notification_status: ownerNotificationStatus,
      ...launchUrls,
    });
  } catch (error) {
    console.error("Error in provision-onboarding-request:", error);
    const message = error instanceof Error ? error.message : "Failed to provision onboarding request";
    return jsonResponse({ error: message }, 500);
  }
});
