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

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const verifyToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN");

    if (mode === "subscribe" && token && verifyToken && token === verifyToken) {
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
    const appSecret = Deno.env.get("WHATSAPP_APP_SECRET");
    const signatureHeader = req.headers.get("x-hub-signature-256");

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

    const payload = rawBody ? JSON.parse(rawBody) : {};
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseUrl && serviceRoleKey && rows.length > 0) {
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      const { error } = await supabase.from("whatsapp_webhook_events").insert(rows);
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
