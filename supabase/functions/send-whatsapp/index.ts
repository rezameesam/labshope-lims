import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SendWhatsAppRequest {
  to: string;
  message?: string;
  type?: "text" | "template";
  templateName?: string;
  languageCode?: string;
  templateParams?: string[];
  fallbackToText?: boolean;
}

const normalizePhoneNumber = (value: string, defaultCountryCode: string): string | null => {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return null;
  }

  const normalizedCountryCode = (defaultCountryCode || "").replace(/[^\d]/g, "");
  if (!normalizedCountryCode) {
    return null;
  }

  if (trimmed.startsWith("+")) {
    const digits = trimmed.replace(/[^\d]/g, "");
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  }

  if (trimmed.startsWith("00")) {
    const digits = trimmed.slice(2).replace(/[^\d]/g, "");
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  }

  const digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) {
    return null;
  }

  if (digits.length === 10) {
    return `${normalizedCountryCode}${digits}`;
  }

  // Common local format like 09876543210.
  if (digits.length === 11 && digits.startsWith("0")) {
    return `${normalizedCountryCode}${digits.slice(1)}`;
  }

  // Already includes country code (e.g. 919876543210).
  if (digits.startsWith(normalizedCountryCode) && digits.length >= normalizedCountryCode.length + 8) {
    return digits.length <= 15 ? digits : null;
  }

  return digits.length >= 8 && digits.length <= 15 ? digits : null;
};

const getJson = async (response: Response): Promise<any> => {
  const rawText = await response.text();
  if (!rawText) {
    return {};
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return { rawText };
  }
};

const getErrorMessage = (payload: any): string => {
  return payload?.error?.message || payload?.message || "WhatsApp API request failed";
};

const getMetaErrorDetails = (payload: any) => {
  const message = String(payload?.error?.message || payload?.message || "");
  const normalized = message.toLowerCase();
  const code = payload?.error?.code;
  const subcode = payload?.error?.error_subcode;

  const tokenExpired =
    code === 190 &&
    (subcode === 463 ||
      normalized.includes("session has expired") ||
      normalized.includes("error validating access token"));

  if (tokenExpired) {
    return {
      userMessage:
        "WhatsApp access token has expired. Update WHATSAPP_ACCESS_TOKEN in Supabase Edge Function secrets.",
      hint:
        "Generate a new token in Meta and rotate the secret, then retry. Consider using a long-lived System User token.",
      code,
      subcode,
    };
  }

  const recipientNotAllowed =
    normalized.includes("recipient phone number") &&
    (normalized.includes("not in list") || normalized.includes("not in allowed list"));

  if (recipientNotAllowed) {
    return {
      userMessage:
        "WhatsApp test-mode restriction: recipient number is not in your allowed list. Add this number in Meta App Dashboard > WhatsApp/API Setup > Recipient list, or move app/number to production.",
      hint:
        "If app is in Development mode, only allowlisted recipient numbers can receive messages from the test sender.",
      code,
      subcode,
    };
  }

  return {
    userMessage: getErrorMessage(payload),
    hint: null,
    code,
    subcode,
  };
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const {
      to,
      message,
      type,
      templateName,
      languageCode,
      templateParams,
      fallbackToText = true,
    }: SendWhatsAppRequest = await req.json();

    if (!to) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required field: to" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (type === "text" && !message) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required field: message for text send" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") || "v23.0";

    if (!accessToken || !phoneNumberId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is not configured",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = supabaseUrl && serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey)
      : null;

    let defaultCountryCode = "91";
    let resolvedLanguageCode = languageCode || "en_US";
    let resolvedTemplateName = templateName || "";

    if (supabase) {
      const { data: settings } = await supabase
        .from("system_settings")
        .select("setting_key, setting_value")
        .in("setting_key", [
          "whatsapp_default_country_code",
          "whatsapp_template_language_code",
          "whatsapp_utility_template_name",
        ]);

      const settingsMap = new Map(
        (settings || []).map((row: any) => [row.setting_key, row.setting_value]),
      );

      defaultCountryCode = settingsMap.get("whatsapp_default_country_code") || defaultCountryCode;
      resolvedLanguageCode =
        languageCode || settingsMap.get("whatsapp_template_language_code") || resolvedLanguageCode;
      resolvedTemplateName =
        templateName || settingsMap.get("whatsapp_utility_template_name") || resolvedTemplateName;
    }

    const normalizedPhone = normalizePhoneNumber(to, defaultCountryCode);
    if (!normalizedPhone) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid phone number format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const endpoint = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    const sendRequest = async (payload: Record<string, unknown>) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const responsePayload = await getJson(response);
      return { ok: response.ok, status: response.status, payload: responsePayload };
    };

    const sendAsTemplate = type === "template" || (type !== "text" && !!resolvedTemplateName);
    if (!sendAsTemplate && !message) {
      return new Response(
        JSON.stringify({ success: false, error: "Message is required when sending a text WhatsApp notification" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let requestPayload: Record<string, unknown>;

    if (sendAsTemplate) {
      if (!resolvedTemplateName) {
        return new Response(
          JSON.stringify({ success: false, error: "Template name is required for template send" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const rawParams = templateParams || (message ? [message] : []);
      const cleanedParams = rawParams
        .map((value) => String(value || "").trim())
        .filter((value) => value.length > 0);

      const components = cleanedParams.length > 0
        ? [
            {
              type: "body",
              parameters: cleanedParams.map((value) => ({ type: "text", text: value })),
            },
          ]
        : undefined;

      requestPayload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizedPhone,
        type: "template",
        template: {
          name: resolvedTemplateName,
          language: { code: resolvedLanguageCode },
          ...(components ? { components } : {}),
        },
      };
    } else {
      requestPayload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizedPhone,
        type: "text",
        text: {
          preview_url: false,
          body: message,
        },
      };
    }

    let sendResult = await sendRequest(requestPayload);
    let fallbackUsed = false;

    if (!sendResult.ok && sendAsTemplate && fallbackToText && message) {
      fallbackUsed = true;
      sendResult = await sendRequest({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizedPhone,
        type: "text",
        text: {
          preview_url: false,
          body: message,
        },
      });
    }

    if (supabase) {
      const firstMessage = sendResult.payload?.messages?.[0];
      await supabase.from("whatsapp_webhook_events").insert({
        event_type: "unknown",
        message_id: firstMessage?.id || null,
        wa_id: normalizedPhone,
        phone_number_id: phoneNumberId,
        status: sendResult.ok ? "accepted" : "failed",
        payload: {
          request: requestPayload,
          response: sendResult.payload,
          fallback_used: fallbackUsed,
          http_status: sendResult.status,
        },
      }).then(() => undefined).catch((error) => {
        console.error("Failed to persist WhatsApp send event:", error);
      });
    }

    if (!sendResult.ok) {
      const metaError = getMetaErrorDetails(sendResult.payload);
      return new Response(
        JSON.stringify({
          success: false,
          error: metaError.userMessage,
          hint: metaError.hint,
          errorCode: metaError.code || null,
          errorSubcode: metaError.subcode || null,
          details: sendResult.payload,
        }),
        {
          status: sendResult.status >= 400 ? sendResult.status : 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        provider: "meta_whatsapp_cloud",
        to: normalizedPhone,
        messageId: sendResult.payload?.messages?.[0]?.id || null,
        messageStatus: sendResult.payload?.messages?.[0]?.message_status || "accepted",
        fallbackUsed,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Error in send-whatsapp:", error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Failed to send WhatsApp message" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
