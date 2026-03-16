import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveOrganizationByAbdmHipId } from "../_shared/abdm-settings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ProfileSharePayload {
  intent?: string;
  metaData?: {
    hipId?: string;
    context?: string;
  };
  profile?: {
    patient?: {
      abhaNumber?: string | number;
      abhaAddress?: string;
      name?: string;
      gender?: string;
      dayOfBirth?: string;
      monthOfBirth?: string;
      yearOfBirth?: string;
      mobile?: string;
    };
    careContext?: {
      tokenNumber?: string;
      expiry?: string | number;
    };
  };
  response?: {
    requestId?: string;
  };
}

const normalizeText = (value?: string | null): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const normalizeAbhaNumber = (value?: string | number | null): string | null => {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  return digits ? digits : null;
};

const normalizePhoneVariants = (value?: string | null): string[] => {
  const trimmed = normalizeText(value);
  if (!trimmed) {
    return [];
  }

  const digitsOnly = trimmed.replace(/[^\d]/g, "");
  const variants = new Set<string>([trimmed]);
  if (digitsOnly) {
    variants.add(digitsOnly);
  }
  if (digitsOnly.length === 10) {
    variants.add(`+91${digitsOnly}`);
  }
  if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
    variants.add(`+${digitsOnly}`);
    variants.add(digitsOnly.slice(2));
  }

  return Array.from(variants);
};

const buildDateOfBirth = (
  dayOfBirth?: string | null,
  monthOfBirth?: string | null,
  yearOfBirth?: string | null,
): string | null => {
  const year = normalizeText(yearOfBirth);
  const month = normalizeText(monthOfBirth);
  const day = normalizeText(dayOfBirth);
  if (!year) {
    return null;
  }

  const hasMask = [year, month, day].some((part) => part?.includes("*"));
  if (hasMask || !month || !day) {
    return null;
  }

  return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  let organizationId: string | null = null;
  let labId: string | null = null;

  try {
    const payload: ProfileSharePayload = await req.json();
    if (payload.intent !== "PROFILE_SHARE") {
      return jsonResponse({ error: "Unsupported ABDM intent." }, 400);
    }

    const hipId = normalizeText(payload.metaData?.hipId);
    if (!hipId) {
      return jsonResponse({ error: "ABDM HIP ID is required in profile-share metadata." }, 400);
    }

    organizationId = await resolveOrganizationByAbdmHipId(supabaseUrl, serviceRoleKey, hipId);
    if (!organizationId) {
      return jsonResponse({ error: "No organization is configured for this ABDM HIP ID." }, 404);
    }

    const { data: primaryLab } = await supabaseAdmin
      .from("labs")
      .select("id")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    labId = (primaryLab as { id?: string | null } | null)?.id ?? null;

    const patientPayload = payload.profile?.patient || {};
    const abhaNumber = normalizeAbhaNumber(patientPayload.abhaNumber);
    const abhaAddress = normalizeText(patientPayload.abhaAddress)?.toLowerCase() || null;
    const patientPhone = normalizeText(patientPayload.mobile);
    const phoneVariants = normalizePhoneVariants(patientPhone);
    const patientYearOfBirth = normalizeText(patientPayload.yearOfBirth);
    const patientDateOfBirth = buildDateOfBirth(
      patientPayload.dayOfBirth,
      patientPayload.monthOfBirth,
      patientPayload.yearOfBirth,
    );

    let matchedPatientId: string | null = null;

    if (abhaNumber) {
      const { data: patientByAbha } = await supabaseAdmin
        .from("patients")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("abha_number", abhaNumber)
        .limit(1)
        .maybeSingle();

      matchedPatientId = (patientByAbha as { id?: string | null } | null)?.id ?? null;
    }

    if (!matchedPatientId && abhaAddress) {
      const { data: patientByAddress } = await supabaseAdmin
        .from("patients")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("abha_address", abhaAddress)
        .limit(1)
        .maybeSingle();

      matchedPatientId = (patientByAddress as { id?: string | null } | null)?.id ?? null;
    }

    if (!matchedPatientId && phoneVariants.length > 0) {
      const { data: patientByPhone } = await supabaseAdmin
        .from("patients")
        .select("id")
        .eq("organization_id", organizationId)
        .in("phone", phoneVariants)
        .limit(1)
        .maybeSingle();

      matchedPatientId = (patientByPhone as { id?: string | null } | null)?.id ?? null;
    }

    const requestStatus = matchedPatientId ? "matched" : "unmatched";

    const { data: insertedProfileShare, error: insertError } = await supabaseAdmin
      .from("abdm_profile_shares")
      .insert({
      organization_id: organizationId,
      lab_id: labId,
      matched_patient_id: matchedPatientId,
      request_id: normalizeText(payload.response?.requestId),
      hip_id: hipId,
      abha_number: abhaNumber,
      abha_address: abhaAddress,
      patient_name: normalizeText(patientPayload.name),
      patient_gender: normalizeText(patientPayload.gender),
      patient_date_of_birth: patientDateOfBirth,
      patient_year_of_birth: patientYearOfBirth,
      patient_phone: patientPhone,
      token_number: normalizeText(payload.profile?.careContext?.tokenNumber),
      token_expiry_seconds: Number(payload.profile?.careContext?.expiry || 0) || null,
      context: normalizeText(payload.metaData?.context),
      request_status: requestStatus,
      payload,
      })
      .select("id")
      .single();

    if (insertError) {
      throw insertError;
    }

    await supabaseAdmin.from("abdm_scan_logs").insert({
      organization_id: organizationId,
      lab_id: labId,
      patient_id: matchedPatientId,
      request_type: "profile_share_callback",
      request_status: "success",
      abha_number: abhaNumber,
      abha_address: abhaAddress,
      mobile: patientPhone,
      request_payload: payload,
      response_payload: {
        matched_patient_id: matchedPatientId,
        request_status: requestStatus,
      },
    });

    const normalizedRequestId = normalizeText(payload.response?.requestId);
    const normalizedAbhaAddress = abhaAddress;
    const normalizedContext = normalizeText(payload.metaData?.context) || "1";
    const normalizedTokenNumber = normalizeText(payload.profile?.careContext?.tokenNumber);
    const normalizedExpiry = normalizeText(String(payload.profile?.careContext?.expiry ?? ""));

    let onShareDeliveryStatus: "pending" | "sent" | "failed" | "skipped" = "pending";
    let onShareError: string | null = null;
    let onShareResponse: unknown = null;

    if (normalizedRequestId) {
      try {
        const onShareResponseRaw = await fetch(`${supabaseUrl}/functions/v1/abdm-on-share`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-service-key": serviceRoleKey,
          },
          body: JSON.stringify({
            organization_id: organizationId,
            request_id: normalizedRequestId,
            abha_address: normalizedAbhaAddress,
            context: normalizedContext,
            token_number: normalizedTokenNumber,
            expiry: normalizedExpiry,
          }),
        });

        onShareResponse = await onShareResponseRaw.json().catch(() => null);
        onShareDeliveryStatus =
          ((onShareResponse as { delivery_status?: "pending" | "sent" | "failed" | "skipped" } | null)?.delivery_status) ||
          (onShareResponseRaw.ok ? "sent" : "failed");
        onShareError =
          (onShareResponse as { error?: string } | null)?.error || null;
      } catch (onShareErrorValue: any) {
        onShareDeliveryStatus = "failed";
        onShareError = onShareErrorValue.message || "Failed to invoke ABDM on-share delivery";
      }
    } else {
      onShareDeliveryStatus = "skipped";
      onShareError = "Missing requestId for ABDM on-share delivery";
    }

    await supabaseAdmin
      .from("abdm_profile_shares")
      .update({
        on_share_delivery_status: onShareDeliveryStatus,
        on_share_attempted_at: new Date().toISOString(),
        on_share_error: onShareError,
        on_share_response: onShareResponse,
      })
      .eq("id", (insertedProfileShare as { id: string }).id);

    return jsonResponse({
      acknowledgement: {
        status: "SUCCESS",
        abhaAddress: abhaAddress,
        profile: {
          context: normalizeText(payload.metaData?.context) || "1",
          tokenNumber: normalizeText(payload.profile?.careContext?.tokenNumber),
          expiry: normalizeText(String(payload.profile?.careContext?.expiry ?? "")),
        },
      },
      response: {
        requestId: normalizeText(payload.response?.requestId),
      },
      matched_patient_id: matchedPatientId,
      request_status: requestStatus,
      organization_id: organizationId,
      on_share_delivery_status: onShareDeliveryStatus,
    });
  } catch (error: any) {
    console.error("Error in abdm-profile-share:", error);

    if (organizationId) {
      await supabaseAdmin.from("abdm_scan_logs").insert({
        organization_id: organizationId,
        lab_id: labId,
        request_type: "profile_share_callback",
        request_status: "failed",
        error_code: "callback_failure",
        error_message: error.message || "Unexpected profile-share callback failure",
      });
    }

    return jsonResponse({ error: error.message || "Failed to process ABDM profile-share callback" }, 500);
  }
});
