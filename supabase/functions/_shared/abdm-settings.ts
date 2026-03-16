import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchScopedSettings } from "./organization-settings.ts";

export interface AbdmConfig {
  enabled: boolean;
  environment: string;
  scanShareEnabled: boolean;
  facilityId: string | null;
  hipId: string | null;
  cmId: string | null;
  gatewayBaseUrl: string | null;
  clientId: string | null;
  clientSecret: string | null;
  callbackUrl: string | null;
  hprId: string | null;
}

export interface AbdmFacilityContext {
  labId: string | null;
  facilityId: string | null;
  labEnabled: boolean | null;
}

const ABDM_SETTING_KEYS = [
  "abdm_enabled",
  "abdm_environment",
  "abdm_scan_share_enabled",
  "abdm_facility_id",
  "abdm_hip_id",
  "abdm_cm_id",
  "abdm_gateway_base_url",
  "abdm_client_id",
  "abdm_client_secret",
  "abdm_callback_url",
  "abdm_hpr_id",
];

const normalizeSetting = (value?: string | null): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export async function fetchOrganizationAbdmConfig(
  supabaseUrl: string,
  serviceRoleKey: string,
  organizationId: string,
): Promise<AbdmConfig> {
  const settings = await fetchScopedSettings(
    supabaseUrl,
    serviceRoleKey,
    ABDM_SETTING_KEYS,
    organizationId,
  );

  return {
    enabled: settings.get("abdm_enabled") === "true",
    environment: normalizeSetting(settings.get("abdm_environment")) || "sandbox",
    scanShareEnabled: settings.get("abdm_scan_share_enabled") === "true",
    facilityId: normalizeSetting(settings.get("abdm_facility_id")),
    hipId: normalizeSetting(settings.get("abdm_hip_id")),
    cmId: normalizeSetting(settings.get("abdm_cm_id")),
    gatewayBaseUrl:
      normalizeSetting(settings.get("abdm_gateway_base_url")) || "https://dev.abdm.gov.in",
    clientId: normalizeSetting(settings.get("abdm_client_id")),
    clientSecret: normalizeSetting(settings.get("abdm_client_secret")),
    callbackUrl: normalizeSetting(settings.get("abdm_callback_url")),
    hprId: normalizeSetting(settings.get("abdm_hpr_id")),
  };
}

export async function requestAbdmSessionToken(
  config: AbdmConfig,
): Promise<{
  success: boolean;
  status: number | null;
  accessToken?: string | null;
  tokenType?: string | null;
  expiresIn?: number | null;
  error?: string | null;
}> {
  if (!config.clientId || !config.clientSecret || !config.gatewayBaseUrl) {
    return {
      success: false,
      status: null,
      error: "Missing ABDM client credentials or gateway URL.",
    };
  }

  const sessionUrl = `${config.gatewayBaseUrl.replace(/\/$/, "")}/api/hiecm/gateway/v3/sessions`;

  try {
    const response = await fetch(sessionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        grantType: "client_credentials",
      }),
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error:
          (body &&
            ((body.error_description as string | undefined) ||
              (body.error as string | undefined) ||
              (body.message as string | undefined))) ||
          `ABDM session API returned ${response.status}`,
      };
    }

    return {
      success: true,
      status: response.status,
      accessToken:
        (body?.accessToken as string | undefined) ||
        (body?.access_token as string | undefined) ||
        null,
      tokenType:
        (body?.tokenType as string | undefined) ||
        (body?.token_type as string | undefined) ||
        "Bearer",
      expiresIn:
        (body?.expiresIn as number | undefined) ||
        (body?.expires_in as number | undefined) ||
        null,
    };
  } catch (error: any) {
    return {
      success: false,
      status: null,
      error: error.message || "ABDM session token request failed",
    };
  }
}

export async function resolveOrganizationByAbdmHipId(
  supabaseUrl: string,
  serviceRoleKey: string,
  hipId: string,
): Promise<string | null> {
  const normalizedHipId = hipId.trim().toLowerCase();
  if (!normalizedHipId) {
    return null;
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabaseAdmin
    .from("organization_settings" as any)
    .select("organization_id")
    .eq("setting_key", "abdm_hip_id")
    .ilike("setting_value", normalizedHipId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error resolving organization by ABDM HIP ID:", error);
    return null;
  }

  return (data as { organization_id?: string | null } | null)?.organization_id ?? null;
}

export async function resolveAbdmFacilityContext(
  supabaseUrl: string,
  serviceRoleKey: string,
  organizationId: string,
  labId?: string | null,
): Promise<AbdmFacilityContext> {
  if (!labId) {
    return {
      labId: null,
      facilityId: null,
      labEnabled: null,
    };
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabaseAdmin
    .from("labs")
    .select("id, settings")
    .eq("id", labId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    return {
      labId: null,
      facilityId: null,
      labEnabled: null,
    };
  }

  const settings =
    typeof (data as { settings?: unknown }).settings === "object" &&
    (data as { settings?: unknown }).settings !== null
      ? ((data as { settings?: Record<string, unknown> }).settings as Record<string, unknown>)
      : {};

  return {
    labId: (data as { id?: string | null }).id ?? null,
    facilityId:
      typeof settings.abdm_facility_id === "string" && settings.abdm_facility_id.trim()
        ? settings.abdm_facility_id.trim()
        : null,
    labEnabled:
      typeof settings.abdm_enabled === "boolean"
        ? settings.abdm_enabled
        : typeof settings.abdm_enabled === "string"
          ? settings.abdm_enabled === "true"
          : null,
  };
}
