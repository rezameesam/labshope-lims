import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ResetPasswordRequest {
  token: string;
  new_password: string;
  turnstile_token?: string;
}

const PATIENT_AUTH_DOMAIN = "patients.irmclinic.local";

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { token, new_password, turnstile_token }: ResetPasswordRequest = await req.json();

    if (!token || !new_password) {
      return new Response(
        JSON.stringify({ error: "Token and new password are required." }),
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

    if (new_password.length < 6) {
      return new Response(
        JSON.stringify({ error: "New password must be at least 6 characters." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const tokenHash = await hashToken(token);

    const { data: resetRows, error } = await supabase
      .from("patient_password_resets")
      .select("id, patient_id, expires_at")
      .eq("token_hash", tokenHash)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .limit(1);

    if (error || !resetRows || resetRows.length === 0) {
      return new Response(
        JSON.stringify({ error: "Reset link is invalid or expired." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const resetRow = resetRows[0];

    const { error: updatePwError } = await supabase.rpc("patient_reset_password", {
      p_patient_id: resetRow.patient_id,
      p_new_password: new_password,
    });

    if (updatePwError) {
      throw updatePwError;
    }

    const { data: patientRecord, error: patientError } = await supabase
      .from("patients")
      .select("id, user_id")
      .eq("id", resetRow.patient_id)
      .single();

    if (!patientError && patientRecord) {
      const authEmail = buildPatientAuthEmail(patientRecord.id);
      if (!patientRecord.user_id) {
        const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
          email: authEmail,
          password: new_password,
          email_confirm: true,
          user_metadata: {
            patient_record_id: patientRecord.id,
          },
        });

        if (!createError && createdUser?.user) {
          await supabase
            .from("patients")
            .update({ user_id: createdUser.user.id })
            .eq("id", patientRecord.id);
        }
      } else {
        await supabase.auth.admin.updateUserById(patientRecord.user_id, {
          password: new_password,
          email_confirm: true,
        });
      }
    }

    const { error: markError } = await supabase
      .from("patient_password_resets")
      .update({ used_at: new Date().toISOString() })
      .eq("id", resetRow.id);

    if (markError) {
      throw markError;
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in patient-reset-password:", error);
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

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function buildPatientAuthEmail(patientId: string): string {
  const normalizedId = patientId.toLowerCase().replace(/[^a-z0-9]/g, "-");
  return `patient-${normalizedId}@${PATIENT_AUTH_DOMAIN}`;
}
