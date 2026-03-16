import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  fetchOrganizationAbdmConfig,
  requestAbdmSessionToken,
} from "../_shared/abdm-settings.ts";
import { resolveOrganizationIdentity } from "../_shared/organization-settings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const normalizeText = (v?: string | null) => v?.trim() || null;

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
  const anonKey        = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin  = createClient(supabaseUrl, serviceRoleKey);

  let linkId: string | null = null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const patientId            = normalizeText(body.patient_id);
    const careContextReference = normalizeText(body.care_context_reference);
    const careContextDisplay   = normalizeText(body.care_context_display);
    const hiType               = normalizeText(body.hi_type) || "DiagnosticReport";
    const patientTestId        = normalizeText(body.patient_test_id);
    const invoiceId            = normalizeText(body.invoice_id);

    if (!patientId)            return json({ error: "patient_id is required." }, 400);
    if (!careContextReference) return json({ error: "care_context_reference is required." }, 400);
    if (!careContextDisplay)   return json({ error: "care_context_display is required." }, 400);

    const identity = await resolveOrganizationIdentity({
      supabaseUrl,
      supabaseAnonKey: anonKey,
      serviceRoleKey,
      authHeader,
      organizationId: normalizeText(body.organization_id),
    });

    if (!identity.userId)         return json({ error: "Invalid authentication token" }, 401);
    if (!identity.organizationId) return json({ error: "Not linked to an organization" }, 403);

    const organizationId = identity.organizationId;
    const config = await fetchOrganizationAbdmConfig(supabaseUrl, serviceRoleKey, organizationId);

    if (!config.enabled) return json({ error: "ABDM is not enabled for this organization." }, 403);
    if (!config.hipId)   return json({ error: "ABDM HIP ID is not configured." }, 400);

    // Fetch patient to get ABHA address
    const { data: patient, error: patientErr } = await supabaseAdmin
      .from("patients")
      .select("abha_address, full_name, gender, date_of_birth")
      .eq("id", patientId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (patientErr || !patient) return json({ error: "Patient not found." }, 404);
    const abhaAddress = normalizeText((patient as any).abha_address);
    if (!abhaAddress) return json({ error: "Patient does not have an ABHA address. Enroll first." }, 400);

    // Create a link record in pending state
    const { data: linkRow, error: linkInsertErr } = await supabaseAdmin
      .from("abdm_care_context_links")
      .insert({
        organization_id: organizationId,
        patient_id: patientId,
        patient_test_id: patientTestId || null,
        invoice_id: invoiceId || null,
        abha_address: abhaAddress,
        care_context_reference: careContextReference,
        care_context_display: careContextDisplay,
        hi_type: hiType,
        link_status: "pending",
      })
      .select("id")
      .single();

    if (linkInsertErr || !linkRow) throw linkInsertErr || new Error("Failed to create care context link record");
    linkId = (linkRow as any).id;

    // Step 1: Get gateway session token
    const sessionResult = await requestAbdmSessionToken(config);
    if (!sessionResult.success || !sessionResult.accessToken) {
      throw new Error(sessionResult.error || "Failed to get ABDM session token");
    }
    const gatewayToken = sessionResult.accessToken;
    const gateway = config.gatewayBaseUrl!.replace(/\/$/, "");
    const cmId = config.cmId || "sbx";

    const stdHeaders = (requestId: string) => ({
      "Content-Type": "application/json",
      "Authorization": `Bearer ${gatewayToken}`,
      "REQUEST-ID": requestId,
      "TIMESTAMP": new Date().toISOString(),
      "X-CM-ID": cmId,
    });

    // Step 2: Generate link token
    await supabaseAdmin.from("abdm_care_context_links")
      .update({ link_attempted_at: new Date().toISOString() })
      .eq("id", linkId);

    const tokenReqId = crypto.randomUUID();
    const yearOfBirth = (patient as any).date_of_birth
      ? new Date((patient as any).date_of_birth).getFullYear().toString()
      : null;

    const tokenRes = await fetch(`${gateway}/api/hiecm/v3/token/generate-token`, {
      method: "POST",
      headers: stdHeaders(tokenReqId),
      body: JSON.stringify({
        abhaAddress,
        name: (patient as any).full_name || null,
        gender: (patient as any).gender || null,
        yearOfBirth,
      }),
    });

    const tokenBody = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok) {
      await supabaseAdmin.from("abdm_care_context_links").update({ link_status: "failed", error_message: tokenBody?.message || `Token gen failed (${tokenRes.status})`, updated_at: new Date().toISOString() }).eq("id", linkId);
      throw new Error(tokenBody?.message || `Link token generation failed (${tokenRes.status})`);
    }

    const linkToken: string = tokenBody.linkToken || tokenBody.token || "";
    if (!linkToken) throw new Error("ABDM did not return a link token");

    await supabaseAdmin.from("abdm_care_context_links").update({ link_token: linkToken }).eq("id", linkId);

    await supabaseAdmin.from("abdm_scan_logs").insert({
      organization_id: organizationId,
      user_id: identity.userId,
      patient_id: patientId,
      request_type: "care_context_token",
      request_status: "success",
      abha_address: abhaAddress,
    });

    // Step 3: Link care context
    const linkReqId = crypto.randomUUID();
    const linkRes = await fetch(`${gateway}/api/hiecm/hip/v3/link/carecontext`, {
      method: "POST",
      headers: stdHeaders(linkReqId),
      body: JSON.stringify({
        requestId: linkReqId,
        timestamp: new Date().toISOString(),
        link: {
          accessToken: linkToken,
          careContexts: [{
            patientReference: abhaAddress,
            careContextReference: careContextReference,
            display: careContextDisplay,
            hiType,
          }],
        },
      }),
    });

    const linkBody = await linkRes.json().catch(() => ({}));
    if (!linkRes.ok) {
      await supabaseAdmin.from("abdm_care_context_links").update({ link_status: "failed", error_message: linkBody?.message || `Link failed (${linkRes.status})`, abdm_request_id: linkReqId, abdm_response: linkBody, updated_at: new Date().toISOString() }).eq("id", linkId);
      throw new Error(linkBody?.message || `Care context linking failed (${linkRes.status})`);
    }

    await supabaseAdmin.from("abdm_care_context_links").update({ link_status: "linked", abdm_request_id: linkReqId, abdm_response: linkBody, updated_at: new Date().toISOString() }).eq("id", linkId);

    // Keep patient's ABDM status in sync
    await supabaseAdmin.from("patients")
      .update({ abdm_link_status: "linked", abdm_last_verified_at: new Date().toISOString() })
      .eq("id", patientId)
      .eq("organization_id", organizationId);

    await supabaseAdmin.from("abdm_scan_logs").insert({
      organization_id: organizationId,
      user_id: identity.userId,
      patient_id: patientId,
      request_type: "care_context_link",
      request_status: "success",
      abha_address: abhaAddress,
      request_payload: { careContextReference, hiType },
    });

    // Step 4: Notify patient (non-blocking — failure doesn't break the response)
    let notifyStatus = "linked";
    try {
      const notifyReqId = crypto.randomUUID();
      await supabaseAdmin.from("abdm_care_context_links").update({ notify_attempted_at: new Date().toISOString() }).eq("id", linkId);

      const notifyRes = await fetch(`${gateway}/api/hiecm/hip/v3/link/context/notify`, {
        method: "POST",
        headers: stdHeaders(notifyReqId),
        body: JSON.stringify({
          requestId: notifyReqId,
          timestamp: new Date().toISOString(),
          notification: {
            patient: { id: abhaAddress },
            careContext: { patientReference: abhaAddress, careContextReference },
            status: "GRANTED",
            hiTypes: [hiType],
            callBackUrl: config.callbackUrl || null,
          },
        }),
      });

      if (notifyRes.ok) {
        notifyStatus = "notified";
        await supabaseAdmin.from("abdm_care_context_links").update({ link_status: "notified", updated_at: new Date().toISOString() }).eq("id", linkId);
      }

      await supabaseAdmin.from("abdm_scan_logs").insert({
        organization_id: organizationId,
        user_id: identity.userId,
        patient_id: patientId,
        request_type: "care_context_notify",
        request_status: notifyRes.ok ? "success" : "failed",
        abha_address: abhaAddress,
      });
    } catch (_notifyErr) {
      // Notify failure is non-fatal
    }

    return json({
      success: true,
      link_id: linkId,
      link_status: notifyStatus,
      abha_address: abhaAddress,
      care_context_reference: careContextReference,
    });

  } catch (error: any) {
    console.error("abdm-link-care-context error:", error);
    if (linkId) {
      const supabaseAdmin2 = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await supabaseAdmin2.from("abdm_care_context_links").update({ link_status: "failed", error_message: error.message, updated_at: new Date().toISOString() }).eq("id", linkId);
    }
    return json({ error: error.message || "Care context linking failed" }, 500);
  }
});
