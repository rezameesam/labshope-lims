import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildPatientAuthEmail,
  getPatientPasswordError,
  verifyTurnstile,
} from "../_shared/patient-auth.ts";

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

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { token, new_password, turnstile_token }: ResetPasswordRequest = await req.json();

    if (!token || !new_password) {
      return jsonResponse({ error: "Token and new password are required." }, 400);
    }

    const turnstileError = await verifyTurnstile(turnstile_token || "", req);
    if (turnstileError) {
      return jsonResponse({ error: turnstileError }, 400);
    }

    const passwordError = getPatientPasswordError(new_password);
    if (passwordError) {
      return jsonResponse({ error: passwordError }, 400);
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
      return jsonResponse({ error: "Reset link is invalid or expired." }, 400);
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

    await supabase
      .from("patient_password_resets")
      .update({ used_at: new Date().toISOString() })
      .eq("patient_id", resetRow.patient_id)
      .is("used_at", null);

    return jsonResponse({ success: true }, 200);
  } catch (error: any) {
    console.error("Error in patient-reset-password:", error);
    return jsonResponse({ error: error.message || "Internal server error" }, 500);
  }
});

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function jsonResponse(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
