import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAuthenticatedUserFromRequest } from "../_shared/patient-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_ADDRESS_LENGTH = 250;

interface PatientUpdateAddressRequest {
  address: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { address }: PatientUpdateAddressRequest = await req.json();
    const trimmedAddress = (address || "").trim();

    if (!trimmedAddress) {
      return jsonResponse({ error: "Address is required." }, 400);
    }

    if (trimmedAddress.length > MAX_ADDRESS_LENGTH) {
      return jsonResponse({ error: `Address must be ${MAX_ADDRESS_LENGTH} characters or fewer.` }, 400);
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
      .select("id")
      .eq("user_id", authenticated.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (patientError || !patient) {
      return jsonResponse({ error: "Patient session is not linked to an active account." }, 404);
    }

    const { error: updateError } = await supabaseAdmin
      .from("patients")
      .update({ address: trimmedAddress })
      .eq("id", patient.id);

    if (updateError) {
      throw updateError;
    }

    return jsonResponse({ success: true, address: trimmedAddress }, 200);
  } catch (error: any) {
    console.error("Error in patient-update-address:", error);
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
