import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PatientLoginRequest {
  identifier: string;
  password: string;
  turnstile_token?: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { identifier, password, turnstile_token }: PatientLoginRequest = await req.json();
    const trimmedIdentifier = identifier?.trim();

    if (!trimmedIdentifier || !password) {
      return new Response(
        JSON.stringify({ error: "Identifier and password are required." }),
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
      .rpc("patient_login", {
        p_identifier: trimmedIdentifier,
        p_password: password,
      });

    if (error || !patients || patients.length === 0) {
      return new Response(
        JSON.stringify({ error: "Invalid credentials." }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const [patient] = patients;

    return new Response(
      JSON.stringify({
        success: true,
        patient,
        password_reset_required: patient.password_reset_required === true,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in patient-login:", error);
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
