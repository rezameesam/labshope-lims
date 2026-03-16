import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  fetchOrganizationAbdmConfig,
  requestAbdmSessionToken,
  resolveAbdmFacilityContext,
} from "../_shared/abdm-settings.ts";
import { resolveOrganizationIdentity } from "../_shared/organization-settings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface AbdmScanShareRequest {
  organization_id?: string | null;
  lab_id?: string | null;
  abha_number?: string | null;
  abha_address?: string | null;
  mobile?: string | null;
  perform_preflight?: boolean;
  preflight_only?: boolean;
}

interface NormalizedIdentity {
  full_name: string;
  gender: "Male" | "Female";
  date_of_birth: string;
  year_of_birth: string;
  phone: string;
  abha_number: string | null;
  abha_address: string | null;
  address: string;
  state: string;
  pincode: string;
  source: "scan_share";
}

interface AbdmSessionPreflightResult {
  attempted: boolean;
  success: boolean;
  status: number | null;
  token_type?: string | null;
  expires_in?: number | null;
  error?: string | null;
}

const normalizeText = (value?: string | null): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const normalizeAbhaNumber = (value?: string | null): string | null => {
  const digits = value?.replace(/[^\d]/g, "") || "";
  return digits.length >= 8 ? digits : null;
};

const normalizeMobile = (value?: string | null): string | null => {
  const digits = (value || "").replace(/[^\d+]/g, "");
  if (!digits) {
    return null;
  }

  if (digits.startsWith("+")) {
    return digits;
  }

  if (digits.length === 10) {
    return `+91${digits}`;
  }

  return digits;
};

const buildSandboxIdentity = (request: AbdmScanShareRequest): NormalizedIdentity => {
  const abhaNumber = normalizeAbhaNumber(request.abha_number);
  const abhaAddress = normalizeText(request.abha_address)?.toLowerCase() || null;
  const mobile = normalizeMobile(request.mobile);
  const seed = abhaNumber || abhaAddress || mobile || "0000";
  const numericSeed = seed.replace(/[^\d]/g, "") || "0000";
  const suffix = numericSeed.slice(-4).padStart(4, "0");
  const year = String(1985 + (Number(suffix.slice(-2)) % 15));
  const month = String((Number(suffix.slice(0, 2)) % 12) + 1).padStart(2, "0");
  const day = String((Number(suffix.slice(2, 4)) % 28) + 1).padStart(2, "0");
  const gender = Number(suffix.slice(-1)) % 2 === 0 ? "Female" : "Male";

  return {
    full_name: `ABDM Sandbox Patient ${suffix}`,
    gender,
    date_of_birth: `${year}-${month}-${day}`,
    year_of_birth: year,
    phone: mobile || `+9199000${suffix}`,
    abha_number: abhaNumber,
    abha_address: abhaAddress || `sandbox.${suffix}@abdm`,
    address: `ABDM Sandbox Address ${suffix}, Demo Nagar`,
    state: "Karnataka",
    pincode: `560${suffix.slice(-3)}`,
    source: "scan_share",
  };
};

const maskSecret = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  if (value.length <= 6) {
    return "*".repeat(value.length);
  }

  return `${value.slice(0, 3)}${"*".repeat(Math.max(value.length - 6, 2))}${value.slice(-3)}`;
};

const buildProfileSharePreview = (
  config: Awaited<ReturnType<typeof fetchOrganizationAbdmConfig>>,
  identity: NormalizedIdentity,
) => ({
  callback_url: config.callbackUrl
    ? `${config.callbackUrl.replace(/\/$/, "")}/api/v3/hip/patient/share`
    : null,
  request: {
    intent: "PROFILE_SHARE",
    metaData: {
      hipId: config.hipId,
      context: "1",
      hprId: config.hprId,
      latitude: "0.000",
      longitude: "0.000",
    },
    profile: {
      patient: {
        abhaNumber: identity.abha_number,
        abhaAddress: identity.abha_address,
        name: identity.full_name,
        gender: identity.gender === "Male" ? "M" : "F",
        dayOfBirth: identity.date_of_birth.slice(8, 10),
        monthOfBirth: identity.date_of_birth.slice(5, 7),
        yearOfBirth: identity.date_of_birth.slice(0, 4),
        mobile: identity.phone,
      },
    },
  },
});

const performSessionPreflight = async (
  config: Awaited<ReturnType<typeof fetchOrganizationAbdmConfig>>,
): Promise<AbdmSessionPreflightResult> => {
  const result = await requestAbdmSessionToken(config);
  return {
    attempted: Boolean(config.clientId && config.clientSecret && config.gatewayBaseUrl),
    success: result.success,
    status: result.status,
    token_type: result.tokenType ?? null,
    expires_in: result.expiresIn ?? null,
    error: result.error ?? null,
  };
};

const insertAuditLog = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  log: Record<string, unknown>,
) => {
  const { error } = await supabaseAdmin.from("abdm_scan_logs").insert(log);
  if (error) {
    console.error("Failed to insert ABDM scan log:", error);
  }
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  let organizationId: string | null = null;
  let userId: string | null = null;
  let labId: string | null = null;
  let requestPayload: AbdmScanShareRequest | null = null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    requestPayload = await req.json();
    const normalizedRequest: AbdmScanShareRequest = {
      organization_id: normalizeText(requestPayload.organization_id),
      lab_id: normalizeText(requestPayload.lab_id),
      abha_number: normalizeAbhaNumber(requestPayload.abha_number),
      abha_address: normalizeText(requestPayload.abha_address),
      mobile: normalizeMobile(requestPayload.mobile),
      perform_preflight: Boolean(requestPayload.perform_preflight),
      preflight_only: Boolean(requestPayload.preflight_only),
    };

    if (
      !normalizedRequest.preflight_only &&
      !normalizedRequest.abha_number &&
      !normalizedRequest.abha_address &&
      !normalizedRequest.mobile
    ) {
      return new Response(
        JSON.stringify({ error: "Provide ABHA number, ABHA address, or mobile." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const identity = await resolveOrganizationIdentity({
      supabaseUrl,
      supabaseAnonKey: anonKey,
      serviceRoleKey,
      authHeader,
      organizationId: normalizedRequest.organization_id,
    });

    organizationId = identity.organizationId;
    userId = identity.userId;

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: "Staff user is not linked to an active organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: primaryLab } = await supabaseAdmin
      .from("lab_users")
      .select("lab_id")
      .eq("user_id", userId)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle();

    labId = (primaryLab as { lab_id?: string | null } | null)?.lab_id ?? null;

    const config = await fetchOrganizationAbdmConfig(
      supabaseUrl,
      serviceRoleKey,
      organizationId,
    );

    if (normalizedRequest.preflight_only) {
      const preflight = await performSessionPreflight(config);

      await insertAuditLog(supabaseAdmin, {
        organization_id: organizationId,
        lab_id: labId,
        user_id: userId,
        request_type: "session_preflight",
        request_status: preflight.success ? "success" : "failed",
        error_code: preflight.success ? null : "preflight_failed",
        error_message: preflight.error ?? null,
        request_payload: { preflight_only: true },
      });

      return new Response(
        JSON.stringify({
          success: preflight.success,
          mode: "preflight_only",
          organization_id: organizationId,
          environment: config.environment,
          gateway_base_url: config.gatewayBaseUrl,
          configuration: {
            has_client_credentials: Boolean(config.clientId && config.clientSecret),
            client_id_preview: maskSecret(config.clientId),
            hip_id: config.hipId,
          },
          preflight,
        }),
        {
          status: preflight.success ? 200 : 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!config.enabled || !config.scanShareEnabled) {
      await insertAuditLog(supabaseAdmin, {
        organization_id: organizationId,
        lab_id: labId,
        user_id: userId,
        request_type: "scan_share_lookup",
        request_status: "failed",
        abha_number: normalizedRequest.abha_number,
        abha_address: normalizedRequest.abha_address,
        mobile: normalizedRequest.mobile,
        error_code: "abdm_disabled",
        error_message: "ABDM Scan and Share is disabled for this organization.",
        request_payload: normalizedRequest,
      });

      return new Response(
        JSON.stringify({ error: "ABDM Scan and Share is not enabled for this organization." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!config.facilityId) {
      await insertAuditLog(supabaseAdmin, {
        organization_id: organizationId,
        lab_id: labId,
        user_id: userId,
        request_type: "scan_share_lookup",
        request_status: "failed",
        abha_number: normalizedRequest.abha_number,
        abha_address: normalizedRequest.abha_address,
        mobile: normalizedRequest.mobile,
        error_code: "facility_missing",
        error_message: "ABDM facility ID is not configured.",
        request_payload: normalizedRequest,
      });

      return new Response(
        JSON.stringify({ error: "ABDM facility ID is not configured for this organization." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const normalizedIdentity = buildSandboxIdentity(normalizedRequest);
    const labFacilityContext = await resolveAbdmFacilityContext(
      supabaseUrl,
      serviceRoleKey,
      organizationId,
      normalizedRequest.lab_id,
    );
    const profileSharePreview = buildProfileSharePreview(config, normalizedIdentity);
    const preflight = normalizedRequest.perform_preflight
      ? await performSessionPreflight(config)
      : {
          attempted: false,
          success: false,
          status: null,
        };

    await insertAuditLog(supabaseAdmin, {
      organization_id: organizationId,
      lab_id: labId,
      user_id: userId,
      request_type: "scan_share_lookup",
      request_status: "success",
      abha_number: normalizedIdentity.abha_number,
      abha_address: normalizedIdentity.abha_address,
      mobile: normalizedIdentity.phone,
      request_payload: normalizedRequest,
      response_payload: normalizedIdentity,
    });

    return new Response(
      JSON.stringify({
        success: true,
        mode: "sandbox_profile_share_preview",
        organization_id: organizationId,
        environment: config.environment,
        facility_id: labFacilityContext.facilityId || config.facilityId,
        lab_id: labFacilityContext.labId,
        gateway_base_url: config.gatewayBaseUrl,
        configuration: {
          has_client_credentials: Boolean(config.clientId && config.clientSecret),
          client_id_preview: maskSecret(config.clientId),
          callback_url: config.callbackUrl,
          hip_id: config.hipId,
          hpr_id: config.hprId,
          cm_id: config.cmId,
          lab_abdm_enabled: labFacilityContext.labEnabled,
          lab_facility_id: labFacilityContext.facilityId,
        },
        preflight,
        identity: normalizedIdentity,
        profile_share_preview: profileSharePreview,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Error in abdm-scan-share:", error);

    if (organizationId) {
      await insertAuditLog(supabaseAdmin, {
        organization_id: organizationId,
        lab_id: labId,
        user_id: userId,
        request_type: "scan_share_lookup",
        request_status: "failed",
        abha_number: normalizeAbhaNumber(requestPayload?.abha_number),
        abha_address: normalizeText(requestPayload?.abha_address),
        mobile: normalizeMobile(requestPayload?.mobile),
        error_code: "unexpected_error",
        error_message: error.message || "Unexpected ABDM scan/share failure",
        request_payload: requestPayload,
      });
    }

    return new Response(
      JSON.stringify({ error: error.message || "Failed to resolve ABDM identity" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
