import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  fetchOrganizationAbdmConfig,
  resolveOrganizationByAbdmHipId,
} from "../_shared/abdm-settings.ts";
import { resolveOrganizationIdentity } from "../_shared/organization-settings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function randomToken(length = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map((b) => chars[b % chars.length])
    .join("");
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
  const anonKey        = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin  = createClient(supabaseUrl, serviceRoleKey);

  const url = new URL(req.url);

  // ── Mode B: ABDM gateway running-token status callback ────────────────────
  // ABDM calls GET /abdm-running-token?hipId=<hip_id>  (no JWT, server-to-server)
  const hipIdParam = url.searchParams.get("hipId") || url.searchParams.get("hip_id");
  if (req.method === "GET" && hipIdParam) {
    try {
      const organizationId = await resolveOrganizationByAbdmHipId(supabaseUrl, serviceRoleKey, hipIdParam);
      if (!organizationId) return json({ error: "Unknown HIP ID." }, 404);

      const { data: token } = await supabaseAdmin
        .from("abdm_running_tokens")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .eq("hip_id", hipIdParam)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      await supabaseAdmin.from("abdm_scan_logs").insert({
        organization_id: organizationId,
        request_type: "running_token_callback",
        request_status: "success",
        request_payload: { hipId: hipIdParam },
        response_payload: { token_value: (token as any)?.token_value ?? null },
      });

      if (!token) {
        return json({ tokenNumber: null, expiry: 0 });
      }

      const expiresAt = new Date((token as any).expires_at).getTime();
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      return json({ tokenNumber: (token as any).token_value, expiry: remaining, averageWaitMinutes: (token as any).wait_time_minutes });
    } catch (error: any) {
      console.error("abdm-running-token callback error:", error);
      return json({ error: error.message }, 500);
    }
  }

  // ── Mode A: Staff generates a new token / QR payload ─────────────────────
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    const identity = await resolveOrganizationIdentity({
      supabaseUrl,
      supabaseAnonKey: anonKey,
      serviceRoleKey,
      authHeader,
      organizationId: body.organization_id ?? null,
    });

    if (!identity.userId) return json({ error: "Invalid authentication token" }, 401);
    if (!identity.organizationId) return json({ error: "Not linked to an organization" }, 403);

    const organizationId = identity.organizationId;
    const config = await fetchOrganizationAbdmConfig(supabaseUrl, serviceRoleKey, organizationId);

    if (!config.enabled) return json({ error: "ABDM is not enabled for this organization." }, 403);
    if (!config.hipId)   return json({ error: "ABDM HIP ID is not configured." }, 400);
    if (!config.facilityId) return json({ error: "ABDM Facility ID is not configured." }, 400);

    // Expire previous active tokens for this org
    await supabaseAdmin
      .from("abdm_running_tokens")
      .update({ status: "expired" })
      .eq("organization_id", organizationId)
      .eq("status", "active");

    const tokenValue  = randomToken(6);
    const waitMinutes = Number(body.wait_time_minutes) || 5;

    const { data: tokenRow, error: insertErr } = await supabaseAdmin
      .from("abdm_running_tokens")
      .insert({
        organization_id: organizationId,
        lab_id: body.lab_id ?? null,
        facility_id: config.facilityId,
        hip_id: config.hipId,
        token_value: tokenValue,
        context: "1",
        wait_time_minutes: waitMinutes,
        status: "active",
      })
      .select("id, expires_at")
      .single();

    if (insertErr || !tokenRow) throw insertErr || new Error("Failed to create running token");

    const qrPayload = JSON.stringify({
      hipId: config.hipId,
      facilityId: config.facilityId,
      context: "1",
      tokenNumber: tokenValue,
      expirySeconds: 600,
    });

    return json({
      token_id: (tokenRow as any).id,
      token_value: tokenValue,
      hip_id: config.hipId,
      facility_id: config.facilityId,
      context: "1",
      expires_at: (tokenRow as any).expires_at,
      wait_time_minutes: waitMinutes,
      qr_payload: qrPayload,
    });
  } catch (error: any) {
    console.error("abdm-running-token error:", error);
    return json({ error: error.message || "Running token generation failed" }, 500);
  }
});
