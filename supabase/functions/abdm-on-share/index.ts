import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchOrganizationAbdmConfig, requestAbdmSessionToken } from "../_shared/abdm-settings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-service-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface AbdmOnShareRequest {
  organization_id?: string | null;
  request_id?: string | null;
  abha_address?: string | null;
  context?: string | null;
  token_number?: string | null;
  expiry?: string | null;
}

const normalizeText = (value?: string | null): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const internalServiceKey = req.headers.get("x-internal-service-key");

    if (!serviceRoleKey || internalServiceKey !== serviceRoleKey) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const payload: AbdmOnShareRequest = await req.json();
    const organizationId = normalizeText(payload.organization_id);
    const requestId = normalizeText(payload.request_id);

    if (!organizationId || !requestId) {
      return jsonResponse({ error: "organization_id and request_id are required." }, 400);
    }

    const config = await fetchOrganizationAbdmConfig(supabaseUrl, serviceRoleKey, organizationId);
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    if (!config.enabled) {
      return jsonResponse({ success: false, delivery_status: "skipped", error: "ABDM is disabled for this organization." }, 200);
    }

    const session = await requestAbdmSessionToken(config);
    if (!session.success || !session.accessToken) {
      return jsonResponse({
        success: false,
        delivery_status: "failed",
        error: session.error || "Failed to obtain ABDM session token.",
      }, 502);
    }

    const onShareUrl = `${config.gatewayBaseUrl.replace(/\/$/, "")}/api/hiecm/patient-share/v3/on-share`;
    const acknowledgementBody = {
      acknowledgement: {
        status: "SUCCESS",
        abhaAddress: normalizeText(payload.abha_address),
        profile: {
          context: normalizeText(payload.context) || "1",
          tokenNumber: normalizeText(payload.token_number),
          expiry: normalizeText(payload.expiry),
        },
      },
      response: {
        requestId,
      },
    };

    const response = await fetch(onShareUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${session.tokenType || "Bearer"} ${session.accessToken}`,
      },
      body: JSON.stringify(acknowledgementBody),
    });

    const responseBody = await response.json().catch(() => null);

    if (!response.ok) {
      return jsonResponse({
        success: false,
        delivery_status: "failed",
        status: response.status,
        error:
          (responseBody &&
            ((responseBody.error_description as string | undefined) ||
              (responseBody.error as string | undefined) ||
              (responseBody.message as string | undefined))) ||
          `ABDM on-share returned ${response.status}`,
        response: responseBody,
      }, 502);
    }

    await supabaseAdmin.from("abdm_scan_logs").insert({
      organization_id: organizationId,
      request_type: "profile_share_callback",
      request_status: "success",
      request_payload: acknowledgementBody,
      response_payload: {
        on_share_status: response.status,
        body: responseBody,
      },
    });

    return jsonResponse({
      success: true,
      delivery_status: "sent",
      status: response.status,
      response: responseBody,
    });
  } catch (error: any) {
    console.error("Error in abdm-on-share:", error);
    return jsonResponse({ error: error.message || "Failed to deliver ABDM on-share acknowledgement" }, 500);
  }
});
