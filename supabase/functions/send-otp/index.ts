import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SendOtpRequest {
  phone: string;
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phone }: SendOtpRequest = await req.json();

    // Validate phone number (10 digits)
    if (!phone || !/^\d{10}$/.test(phone)) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number. Must be 10 digits." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if patient exists with this phone
    const { data: patients, error: patientError } = await supabase
      .from("patients")
      .select("id")
      .eq("phone", phone)
      .eq("is_active", true);

    if (patientError || !patients || patients.length === 0) {
      return new Response(
        JSON.stringify({ error: "No patient account found with this phone number." }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: settingsRows } = await supabase
      .from("system_settings")
      .select("setting_key, setting_value")
      .in("setting_key", [
        "demo_mode_enabled",
        "msg91_template_id",
        "msg91_sender_id",
        "whatsapp_enabled",
        "whatsapp_otp_template_name",
        "whatsapp_template_language_code",
        "whatsapp_default_country_code",
      ]);

    const settings = new Map<string, string>(
      (settingsRows || []).map((row: any) => [row.setting_key, row.setting_value || ""]),
    );

    const demoModeEnabled = settings.get("demo_mode_enabled") === "true";

    console.log(`Demo mode: ${demoModeEnabled}, Phone: ${phone}`);

    if (demoModeEnabled) {
      // Demo mode - no actual OTP sent, use 123456
      // Clean up any existing OTPs for this phone
      await supabase
        .from("otp_codes")
        .delete()
        .eq("phone", phone);

      // Store demo OTP (hash of 123456)
      const demoOtpHash = await hashOtp("123456");
      await supabase.from("otp_codes").insert({
        phone,
        otp_hash: demoOtpHash,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "OTP sent successfully",
          demo_mode: true 
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Rate limiting - check if OTP was sent recently
    const { data: recentOtp } = await supabase
      .from("otp_codes")
      .select("created_at")
      .eq("phone", phone)
      .gte("created_at", new Date(Date.now() - 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (recentOtp && recentOtp.length > 0) {
      return new Response(
        JSON.stringify({ error: "Please wait before requesting another OTP." }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await hashOtp(otp);

    // Clean up old OTPs for this phone
    await supabase
      .from("otp_codes")
      .delete()
      .eq("phone", phone);

    // Store OTP
    await supabase.from("otp_codes").insert({
      phone,
      otp_hash: otpHash,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
    });

    const whatsappEnabled = settings.get("whatsapp_enabled") === "true";
    const whatsappTemplate = settings.get("whatsapp_otp_template_name") || "";
    const whatsappLanguageCode = settings.get("whatsapp_template_language_code") || "en_US";
    const whatsappCountryCode = settings.get("whatsapp_default_country_code") || "91";

    let whatsappAttempted = false;
    if (whatsappEnabled && whatsappTemplate) {
      whatsappAttempted = true;
      const whatsappResult = await sendOtpViaWhatsApp({
        phone,
        otp,
        templateName: whatsappTemplate,
        languageCode: whatsappLanguageCode,
        countryCode: whatsappCountryCode,
      });

      if (whatsappResult.success) {
        return new Response(
          JSON.stringify({
            success: true,
            message: "OTP sent successfully on WhatsApp",
            channel: "whatsapp",
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      console.error("WhatsApp OTP delivery failed, falling back to SMS:", whatsappResult.error);
    }

    const msg91AuthKey = Deno.env.get("MSG91_AUTH_KEY");
    const msg91TemplateId = settings.get("msg91_template_id") || "";
    const msg91SenderId = settings.get("msg91_sender_id") || "IRMLAB";

    if (!msg91AuthKey || !msg91TemplateId) {
      return new Response(
        JSON.stringify({
          error: whatsappAttempted
            ? "WhatsApp OTP failed and SMS fallback is not configured."
            : "No OTP delivery channel is configured. Please configure WhatsApp or MSG91 SMS.",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const smsResult = await sendOtpViaMsg91({
      phone,
      otp,
      authKey: msg91AuthKey,
      templateId: msg91TemplateId,
      senderId: msg91SenderId,
    });

    if (!smsResult.success) {
      return new Response(
        JSON.stringify({ error: smsResult.error || "Failed to send OTP. Please try again." }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "OTP sent successfully", channel: "sms" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in send-otp:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});

// Simple hash function for OTP (using Web Crypto API)
async function hashOtp(otp: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(otp);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

interface WhatsAppOtpInput {
  phone: string;
  otp: string;
  templateName: string;
  languageCode: string;
  countryCode: string;
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

  if (digits.length === 11 && digits.startsWith("0")) {
    return `${normalizedCountryCode}${digits.slice(1)}`;
  }

  if (digits.startsWith(normalizedCountryCode) && digits.length >= normalizedCountryCode.length + 8) {
    return digits.length <= 15 ? digits : null;
  }

  return digits.length >= 8 && digits.length <= 15 ? digits : null;
};

async function sendOtpViaWhatsApp(input: WhatsAppOtpInput): Promise<{ success: boolean; error?: string }> {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") || "v23.0";

  if (!accessToken || !phoneNumberId) {
    return { success: false, error: "WhatsApp Cloud API secrets are missing" };
  }

  const normalizedPhone = normalizePhoneNumber(input.phone, input.countryCode);
  if (!normalizedPhone) {
    return { success: false, error: "Invalid phone number for WhatsApp OTP" };
  }
  const endpoint = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizedPhone,
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.languageCode },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: input.otp }],
          },
        ],
      },
    }),
  });

  const rawPayload = await response.text();
  let payload: any = {};
  try {
    payload = rawPayload ? JSON.parse(rawPayload) : {};
  } catch {
    payload = { rawPayload };
  }

  if (!response.ok) {
    return {
      success: false,
      error: payload?.error?.message || "WhatsApp API request failed",
    };
  }

  if (!payload?.messages?.[0]?.id) {
    return {
      success: false,
      error: "WhatsApp API did not return a message id",
    };
  }

  return { success: true };
}

interface Msg91OtpInput {
  phone: string;
  otp: string;
  authKey: string;
  templateId: string;
  senderId: string;
}

async function sendOtpViaMsg91(input: Msg91OtpInput): Promise<{ success: boolean; error?: string }> {
  const msg91Response = await fetch("https://control.msg91.com/api/v5/otp", {
    method: "POST",
    headers: {
      "authkey": input.authKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      template_id: input.templateId,
      mobile: `91${input.phone}`,
      sender: input.senderId,
      otp: input.otp,
      otp_length: 6,
      otp_expiry: 5,
    }),
  });

  const rawPayload = await msg91Response.text();
  let payload: any = {};
  try {
    payload = rawPayload ? JSON.parse(rawPayload) : {};
  } catch {
    payload = { rawPayload };
  }

  if (payload?.type !== "success") {
    console.error("MSG91 error:", payload);
    return {
      success: false,
      error: payload?.message || "MSG91 failed to send OTP",
    };
  }

  return { success: true };
}
