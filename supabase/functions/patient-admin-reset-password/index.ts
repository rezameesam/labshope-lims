import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildPatientAuthEmail,
  getAuthenticatedUserFromRequest,
  resolvePatientResetUrl,
} from "../_shared/patient-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface AdminResetRequest {
  patient_id: string;
  mode?: "email" | "temp";
}

type PatientRecord = {
  id: string;
  patient_id: string;
  full_name: string;
  email: string | null;
  is_active: boolean;
  user_id: string | null;
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authenticated = await getAuthenticatedUserFromRequest(req).catch((error) => {
      if (error instanceof Response) {
        return error;
      }
      throw error;
    });

    if (authenticated instanceof Response) {
      return withCors(authenticated);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Server configuration missing." }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", authenticated.user.id)
      .eq("role", "admin")
      .single();

    if (roleError || !roleData) {
      return jsonResponse({ error: "Only admins can reset patient passwords." }, 403);
    }

    const { patient_id, mode }: AdminResetRequest = await req.json();
    const resolvedMode = mode || "email";

    if (!patient_id) {
      return jsonResponse({ error: "Patient ID is required." }, 400);
    }

    const { data: patient, error: patientError } = await supabaseAdmin
      .from("patients")
      .select("id, patient_id, full_name, email, is_active, user_id")
      .eq("id", patient_id)
      .single();

    if (patientError || !patient) {
      return jsonResponse({ error: "Patient not found." }, 404);
    }

    const patientRecord = patient as PatientRecord;
    if (!patientRecord.is_active) {
      return jsonResponse({ error: "Cannot reset password for an inactive patient." }, 400);
    }

    if (resolvedMode === "temp") {
      const tempPassword = generatePassword(12);

      await supabaseAdmin.rpc("patient_reset_password", {
        p_patient_id: patientRecord.id,
        p_new_password: tempPassword,
      });

      await supabaseAdmin
        .from("patients")
        .update({ password_reset_required: true })
        .eq("id", patientRecord.id);

      await ensurePatientAuthUserPassword(supabaseAdmin, patientRecord, tempPassword);

      return jsonResponse({ success: true, temp_password: tempPassword }, 200);
    }

    if (!patientRecord.email) {
      return jsonResponse({ error: "Patient has no email on file." }, 400);
    }

    const token = generateToken();
    const tokenHash = await hashToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await supabaseAdmin
      .from("patient_password_resets")
      .delete()
      .eq("patient_id", patientRecord.id)
      .is("used_at", null);

    const { error: insertError } = await supabaseAdmin
      .from("patient_password_resets")
      .insert({
        patient_id: patientRecord.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

    if (insertError) {
      throw insertError;
    }

    const resetLink = `${resolvePatientResetUrl(req)}?token=${token}`;
    const emailBody = buildResetEmail(patientRecord.full_name, resetLink);

    const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: patientRecord.email,
        subject: "Reset your IRM Patient Portal password",
        htmlContent: emailBody,
      }),
    });

    if (!emailResponse.ok) {
      return jsonResponse({ error: "Failed to send reset email." }, 500);
    }

    return jsonResponse({ success: true }, 200);
  } catch (error: any) {
    console.error("Error in patient-admin-reset-password:", error);
    return jsonResponse({ error: error.message || "Internal server error" }, 500);
  }
});

async function ensurePatientAuthUserPassword(
  supabaseAdmin: any,
  patient: PatientRecord,
  password: string,
): Promise<void> {
  if (patient.user_id) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(patient.user_id, {
      password,
      email_confirm: true,
    });

    if (error) {
      throw new Error(error.message || "Unable to update patient auth account.");
    }

    return;
  }

  const authEmail = buildPatientAuthEmail(patient.id);
  const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: {
      patient_record_id: patient.id,
    },
  });

  if (createError || !createdUser?.user?.id) {
    throw new Error(createError?.message || "Unable to create patient auth account.");
  }

  const { error: updateError } = await supabaseAdmin
    .from("patients")
    .update({ user_id: createdUser.user.id })
    .eq("id", patient.id);

  if (updateError) {
    throw new Error(updateError.message || "Unable to link patient auth account.");
  }
}

function generatePassword(length: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
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
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
      <h2 style="color:#0f172a;">Reset your password</h2>
      <p>Hello ${name || "there"},</p>
      <p>An administrator requested a password reset for your IRM Patient Portal account.</p>
      <p>
        <a href="${link}" style="display:inline-block;padding:12px 18px;background:#0f172a;color:#fff;text-decoration:none;border-radius:8px;">
          Reset Password
        </a>
      </p>
      <p style="font-size:12px;color:#64748b;">This link expires in 1 hour.</p>
    </div>
  `;
}

function jsonResponse(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
