import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ResetRequest {
  identifier: string;
  reset_base_url: string;
  turnstile_token?: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { identifier, reset_base_url, turnstile_token }: ResetRequest = await req.json();
    const trimmedIdentifier = identifier?.trim();

    if (!trimmedIdentifier || !reset_base_url) {
      return new Response(
        JSON.stringify({ error: "Identifier and reset URL are required." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const turnstileError = await verifyTurnstile(turnstile_token || "", req);
    if (turnstileError) {
      return new Response(
        JSON.stringify({ error: turnstileError }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: patients, error } = await supabase
      .from("patients")
      .select("id, full_name, email")
      .eq("is_active", true)
      .or(
        `username.eq.${trimmedIdentifier},email.eq.${trimmedIdentifier},phone.eq.${trimmedIdentifier},patient_id.eq.${trimmedIdentifier}`
      )
      .limit(1);

    if (error || !patients || patients.length === 0) {
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const patient = patients[0];
    if (!patient.email) {
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const token = generateToken();
    const tokenHash = await hashToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await supabase
      .from("patient_password_resets")
      .delete()
      .eq("patient_id", patient.id)
      .is("used_at", null);

    const { error: insertError } = await supabase
      .from("patient_password_resets")
      .insert({
        patient_id: patient.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

    if (insertError) {
      throw insertError;
    }

    const resetLink = `${reset_base_url}?token=${token}`;
    const emailBody = buildResetEmail(patient.full_name, resetLink);

    await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: patient.email,
        subject: "Reset your IRM Patient Portal password",
        htmlContent: emailBody,
      }),
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in patient-request-password-reset:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});

async function verifyTurnstile(token: string, req: Request): Promise<string | null> {
  const origin = req.headers.get("origin") || req.headers.get("referer") || "";
  if (
    origin.includes("localhost") ||
    origin.includes("127.0.0.1") ||
    origin.includes("0.0.0.0") ||
    /https?:\/\/10\.\d+\.\d+\.\d+/.test(origin) ||
    /https?:\/\/192\.168\.\d+\.\d+/.test(origin) ||
    /https?:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+/.test(origin)
  ) {
    return null;
  }
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return null;
  if (!token) return "Security check failed. Please try again.";

  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", token);

  const forwardedFor = req.headers.get("x-forwarded-for") || "";
  if (forwardedFor) {
    formData.append("remoteip", forwardedFor.split(",")[0].trim());
  }

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    return "Security check unavailable. Please try again.";
  }

  const result = await response.json();
  if (!result.success) {
    return "Security check failed. Please try again.";
  }

  return null;
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function base64UrlEncode(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function buildResetEmail(name: string, link: string): string {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2 style="color:#1F2937;">Reset your password</h2>
      <p>Hello ${name || "there"},</p>
      <p>We received a request to reset your IRM Patient Portal password.</p>
      <p>
        <a href="${link}" style="display:inline-block;padding:10px 16px;background:#1F2937;color:#fff;text-decoration:none;border-radius:6px;">
          Reset Password
        </a>
      </p>
      <p>If you did not request this, you can ignore this email.</p>
      <p style="font-size:12px;color:#6B7280;">This link expires in 1 hour.</p>
    </div>
  `;
}
