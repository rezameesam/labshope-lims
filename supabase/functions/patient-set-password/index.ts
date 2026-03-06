import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAuthenticatedUserFromRequest, getPatientPasswordError } from "../_shared/patient-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PatientSetPasswordRequest {
  current_password: string;
  new_password: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { current_password, new_password }: PatientSetPasswordRequest = await req.json();

    if (!current_password || !new_password) {
      return jsonResponse({ error: "Current password and new password are required." }, 400);
    }

    if (current_password === new_password) {
      return jsonResponse({ error: "New password must be different from your current password." }, 400);
    }

    const passwordError = getPatientPasswordError(new_password);
    if (passwordError) {
      return jsonResponse({ error: passwordError }, 400);
    }

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

    const { data: patient, error: patientError } = await supabaseAdmin
      .from("patients")
      .select("id, user_id")
      .eq("user_id", authenticated.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (patientError || !patient) {
      return jsonResponse({ error: "Patient session is not linked to an active account." }, 404);
    }

    const { data: passwordUpdated, error: passwordUpdateError } = await supabaseAdmin.rpc("patient_set_password", {
      p_patient_id: patient.id,
      p_current_password: current_password,
      p_new_password: new_password,
    });

    if (passwordUpdateError) {
      throw passwordUpdateError;
    }

    if (!passwordUpdated) {
      return jsonResponse({ error: "Current password is incorrect." }, 401);
    }

    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(authenticated.user.id, {
      password: new_password,
      email_confirm: true,
    });

    if (authUpdateError) {
      return jsonResponse({ error: authUpdateError.message || "Unable to update account password." }, 500);
    }

    await supabaseAdmin
      .from("patient_password_resets")
      .delete()
      .eq("patient_id", patient.id)
      .is("used_at", null);

    return jsonResponse({ success: true }, 200);
  } catch (error: any) {
    console.error("Error in patient-set-password:", error);
    return jsonResponse({ error: error.message || "Internal server error" }, 500);
  }
});

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
