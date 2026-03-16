import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const toHex = (input: ArrayBuffer): string => {
  return Array.from(new Uint8Array(input))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

const verifySignature = async (rawBody: string, appSecret: string, signatureHeader: string): Promise<boolean> => {
  if (!signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const expected = signatureHeader.slice(7);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const actual = toHex(digest);
  return actual === expected;
};

const extractPhoneNumberIds = (payload: any): string[] => {
  const ids = new Set<string>();
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const phoneNumberId = change?.value?.metadata?.phone_number_id;
      if (typeof phoneNumberId === "string" && phoneNumberId.trim()) {
        ids.add(phoneNumberId.trim());
      }
    }
  }
  return Array.from(ids);
};

const normalizeDigits = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const digits = value.replace(/[^\d]/g, "");
  return digits || null;
};

const resolveOrganizationIdFromPhoneNumberId = async (
  supabase: ReturnType<typeof createClient>,
  phoneNumberId: string | null,
): Promise<string | null> => {
  if (!phoneNumberId) {
    return null;
  }

  const { data: rows } = await supabase
    .from("organization_settings")
    .select("organization_id")
    .eq("setting_key", "whatsapp_phone_number_id")
    .eq("setting_value", phoneNumberId)
    .limit(2);

  const organizationIds = Array.from(
    new Set(
      (rows || [])
        .map((row: any) => row.organization_id || null)
        .filter((organizationId: string | null): organizationId is string => Boolean(organizationId)),
    ),
  );

  return organizationIds.length === 1 ? organizationIds[0] : null;
};

const resolveEventOrganizationId = async (
  supabase: ReturnType<typeof createClient>,
  messageId: string | null,
  waId: string | null,
  phoneNumberId: string | null,
): Promise<string | null> => {
  if (messageId) {
    const { data: priorEvent } = await supabase
      .from("whatsapp_webhook_events")
      .select("organization_id")
      .eq("message_id", messageId)
      .not("organization_id", "is", null)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const priorOrganizationId =
      (priorEvent as { organization_id?: string | null } | null)?.organization_id ?? null;

    if (priorOrganizationId) {
      return priorOrganizationId;
    }
  }

  const organizationFromPhoneNumberId = await resolveOrganizationIdFromPhoneNumberId(
    supabase,
    phoneNumberId,
  );
  if (organizationFromPhoneNumberId) {
    return organizationFromPhoneNumberId;
  }

  const normalizedWaId = normalizeDigits(waId);
  if (!normalizedWaId) {
    return null;
  }

  const { data: matches } = await supabase
    .from("patients")
    .select("organization_id, phone")
    .eq("is_active", true);

  const matchingOrganizations = new Set(
    (matches || [])
      .filter((patient: any) => {
        const patientDigits = normalizeDigits(patient.phone);
        return patientDigits === normalizedWaId || patientDigits?.endsWith(normalizedWaId) || normalizedWaId.endsWith(patientDigits || "");
      })
      .map((patient: any) => patient.organization_id || null)
      .filter((organizationId: string | null): organizationId is string => Boolean(organizationId)),
  );

  return matchingOrganizations.size === 1 ? Array.from(matchingOrganizations)[0] : null;
};

const resolveVerifyToken = async (
  supabaseUrl: string | null,
  serviceRoleKey: string | null,
  providedToken: string | null,
): Promise<boolean> => {
  if (!providedToken) {
    return false;
  }

  const envToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
  if (envToken && providedToken === envToken) {
    return true;
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return false;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: row } = await supabase
    .from("organization_settings")
    .select("organization_id")
    .eq("setting_key", "whatsapp_verify_token")
    .eq("setting_value", providedToken)
    .limit(1)
    .maybeSingle();

  return Boolean((row as { organization_id?: string | null } | null)?.organization_id);
};

const resolveAppSecret = async (
  supabase: ReturnType<typeof createClient>,
  phoneNumberIds: string[],
): Promise<string> => {
  for (const phoneNumberId of phoneNumberIds) {
    const organizationId = await resolveOrganizationIdFromPhoneNumberId(supabase, phoneNumberId);
    if (!organizationId) {
      continue;
    }

    const { data: row } = await supabase
      .from("organization_settings")
      .select("setting_value")
      .eq("organization_id", organizationId)
      .eq("setting_key", "whatsapp_app_secret")
      .limit(1)
      .maybeSingle();

    const scopedSecret = (row as { setting_value?: string | null } | null)?.setting_value?.trim() || "";
    if (scopedSecret) {
      return scopedSecret;
    }
  }

  return Deno.env.get("WHATSAPP_APP_SECRET") || "";
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || null;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || null;
    const verifyTokenMatched = await resolveVerifyToken(supabaseUrl, serviceRoleKey, token);

    if (mode === "subscribe" && verifyTokenMatched) {
      return new Response(challenge || "", {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    return new Response("Verification failed", {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get("x-hub-signature-256");
    const payload = rawBody ? JSON.parse(rawBody) : {};
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = supabaseUrl && serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey)
      : null;
    const appSecret = supabase
      ? await resolveAppSecret(supabase, extractPhoneNumberIds(payload))
      : (Deno.env.get("WHATSAPP_APP_SECRET") || "");

    if (appSecret) {
      if (!signatureHeader) {
        return new Response(
          JSON.stringify({ success: false, error: "Missing signature header" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const valid = await verifySignature(rawBody, appSecret, signatureHeader);
      if (!valid) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid signature" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const rows: Array<Record<string, unknown>> = [];

    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value || {};
        const metadata = value?.metadata || {};
        const phoneNumberId = metadata?.phone_number_id || null;

        const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
        for (const status of statuses) {
          rows.push({
            event_type: "status",
            message_id: status?.id || null,
            wa_id: status?.recipient_id || null,
            phone_number_id: phoneNumberId,
            status: status?.status || null,
            payload: status,
          });
        }

        const messages = Array.isArray(value?.messages) ? value.messages : [];
        for (const message of messages) {
          rows.push({
            event_type: "incoming_message",
            message_id: message?.id || null,
            wa_id: message?.from || null,
            phone_number_id: phoneNumberId,
            status: message?.type || "received",
            payload: {
              message,
              contacts: value?.contacts || [],
            },
          });
        }

        if (statuses.length === 0 && messages.length === 0) {
          rows.push({
            event_type: "unknown",
            message_id: null,
            wa_id: null,
            phone_number_id: phoneNumberId,
            status: change?.field || "unknown",
            payload: change,
          });
        }
      }
    }

    if (supabase && rows.length > 0) {
      const rowsWithOrganization = await Promise.all(
        rows.map(async (row) => ({
          ...row,
          organization_id: await resolveEventOrganizationId(
            supabase,
            typeof row.message_id === "string" ? row.message_id : null,
            typeof row.wa_id === "string" ? row.wa_id : null,
            typeof row.phone_number_id === "string" ? row.phone_number_id : null,
          ),
        })),
      );
      const { error } = await supabase.from("whatsapp_webhook_events").insert(rowsWithOrganization);
      if (error) {
        console.error("Failed to insert WhatsApp webhook events:", error);
      }
    }

    return new Response(
      JSON.stringify({ success: true, events_logged: rows.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Error processing WhatsApp webhook:", error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Failed to process webhook" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
