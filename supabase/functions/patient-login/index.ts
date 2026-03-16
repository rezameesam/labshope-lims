import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildPatientAuthEmail,
  verifyTurnstile,
} from "../_shared/patient-auth.ts";
import { resolvePublicOrganizationId } from "../_shared/public-organization.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PatientLoginRequest {
  identifier: string;
  password: string;
  turnstile_token?: string;
  organization_id?: string | null;
  hostname?: string | null;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { identifier, password, turnstile_token, organization_id, hostname }: PatientLoginRequest = await req.json();
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
    const resolvedOrganizationId = await resolvePublicOrganizationId(
      supabase,
      req,
      organization_id || null,
      hostname || null,
    );

    if (!resolvedOrganizationId) {
      return new Response(
        JSON.stringify({ error: "Organization not found." }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const { data: patients, error } = await supabase
      .rpc("patient_login_scoped", {
        p_identifier: trimmedIdentifier,
        p_password: password,
        p_organization_id: resolvedOrganizationId,
      });

    if (error || !patients || patients.length === 0) {
      return new Response(
        JSON.stringify({ error: "Invalid credentials." }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const [patient] = patients;
    const authEmail = buildPatientAuthEmail(patient.id);

    const { data: patientRecord, error: patientRecordError } = await supabase
      .from("patients")
      .select("id, user_id")
      .eq("id", patient.id)
      .single();

    if (patientRecordError || !patientRecord) {
      return new Response(
        JSON.stringify({ error: "Patient record not found." }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const existingUserId = patientRecord.user_id || null;
    let authUserId = existingUserId;
    let resolvedAuthEmail = authEmail;

    if (authUserId) {
      const { data: authUserData, error: authUserError } = await supabase.auth.admin.getUserById(authUserId);
      if (authUserError || !authUserData?.user) {
        authUserId = null;
      } else if (authUserData.user.email) {
        resolvedAuthEmail = authUserData.user.email;
      }
    }

    if (!authUserId) {
      const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
        user_metadata: {
          patient_id: patient.patient_id,
          patient_record_id: patient.id,
        },
      });

      if (createError || !createdUser?.user) {
        return new Response(
          JSON.stringify({ error: "Unable to create patient auth account." }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      authUserId = createdUser.user.id;
      resolvedAuthEmail = createdUser.user.email || authEmail;

      await supabase
        .from("patients")
        .update({ user_id: authUserId })
        .eq("id", patient.id);
    } else {
      await supabase.auth.admin.updateUserById(authUserId, {
        password,
        email_confirm: true,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        password_reset_required: patient.password_reset_required === true,
        auth_email: resolvedAuthEmail,
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
