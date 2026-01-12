import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface AdminResetRequest {
  patient_id: string;
  reset_base_url: string;
  mode?: "email" | "temp";
}

const PATIENT_AUTH_DOMAIN = "patients.irmclinic.local";

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { patient_id, reset_base_url, mode }: AdminResetRequest = await req.json();

    if (!patient_id) {
      return new Response(
        JSON.stringify({ error: "Patient ID is required." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("id, patient_id, full_name, email")
      .eq("id", patient_id)
      .eq("is_active", true)
      .single();

    if (patientError || !patient) {
      return new Response(
        JSON.stringify({ error: "Patient not found." }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (mode === "temp") {
      await supabase.rpc("patient_reset_password", {
        p_patient_id: patient.id,
        p_new_password: patient.patient_id,
      });

      await supabase
        .from("patients")
        .update({ password_reset_required: true })
        .eq("id", patient.id);

      await ensureAuthUserPassword(
        supabase,
        patient.id,
        patient.patient_id
      );

      return new Response(
        JSON.stringify({ success: true, temp_password: patient.patient_id }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!reset_base_url) {
      return new Response(
        JSON.stringify({ error: "Reset URL is required." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!patient.email) {
      return new Response(
        JSON.stringify({ error: "Patient has no email on file." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
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
    console.error("Error in patient-admin-reset-password:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});

async function ensureAuthUserPassword(
  supabase: ReturnType<typeof createClient>,
  patientId: string,
  password: string
): Promise<void> {
  const { data: patientRecord, error: patientError } = await supabase
    .from("patients")
    .select("id, user_id")
    .eq("id", patientId)
    .single();

  if (patientError || !patientRecord) {
    return;
  }

  const authEmail = buildPatientAuthEmail(patientRecord.id);
  if (!patientRecord.user_id) {
    const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirmed: true,
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
    await supabase.auth.admin.updateUserById(patientRecord.user_id, { password });
  }
}

function buildPatientAuthEmail(patientId: string): string {
  const normalizedId = patientId.toLowerCase().replace(/[^a-z0-9]/g, "-");
  return `patient-${normalizedId}@${PATIENT_AUTH_DOMAIN}`;
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
      <p>An administrator requested a password reset for your IRM Patient Portal account.</p>
      <p>
        <a href="${link}" style="display:inline-block;padding:10px 16px;background:#1F2937;color:#fff;text-decoration:none;border-radius:6px;">
          Reset Password
        </a>
      </p>
      <p>This link expires in 1 hour.</p>
    </div>
  `;
}
