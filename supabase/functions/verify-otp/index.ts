import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolvePublicOrganizationId } from "../_shared/public-organization.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface VerifyOtpRequest {
  phone: string;
  otp: string;
  organization_id?: string | null;
  hostname?: string | null;
}

const PHONE_INPUT_PATTERN = /^[+()0-9\s-]{8,20}$/;

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phone, otp, organization_id, hostname }: VerifyOtpRequest = await req.json();

    // Validate inputs
    if (!phone || !PHONE_INPUT_PATTERN.test(phone)) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!otp || !/^\d{6}$/.test(otp)) {
      return new Response(
        JSON.stringify({ error: "Invalid OTP. Must be 6 digits." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resolvedOrganizationId = await resolvePublicOrganizationId(
      supabase,
      req,
      organization_id || null,
      hostname || null,
    );

    // Get the OTP record
    let otpQuery = supabase
      .from("otp_codes")
      .select("*")
      .eq("phone", phone)
      .eq("verified", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (resolvedOrganizationId) {
      otpQuery = otpQuery.eq("organization_id", resolvedOrganizationId);
    } else {
      otpQuery = otpQuery.is("organization_id", null);
    }

    const { data: otpRecord, error: otpError } = await otpQuery.single();

    if (otpError || !otpRecord) {
      console.log("No valid OTP found for phone:", phone);
      return new Response(
        JSON.stringify({ error: "OTP expired or not found. Please request a new one." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check attempts limit
    if (otpRecord.attempts >= 5) {
      return new Response(
        JSON.stringify({ error: "Too many attempts. Please request a new OTP." }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Hash the provided OTP and compare
    const otpHash = await hashOtp(otp);
    
    if (otpHash !== otpRecord.otp_hash) {
      // Increment attempts
      await supabase
        .from("otp_codes")
        .update({ attempts: otpRecord.attempts + 1 })
        .eq("id", otpRecord.id);

      return new Response(
        JSON.stringify({ error: "Invalid OTP. Please try again." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // OTP is valid - mark as verified
    await supabase
      .from("otp_codes")
      .update({ verified: true })
      .eq("id", otpRecord.id);

    // Fetch patient(s) for this phone
    const { data: patients, error: patientError } = await supabase.rpc("find_patient_candidates", {
      p_identifier: phone,
      p_organization_id: resolvedOrganizationId,
    });

    if (patientError || !patients || patients.length === 0) {
      return new Response(
        JSON.stringify({ error: "Patient not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Clean up old OTP records for this phone
    await supabase
      .from("otp_codes")
      .delete()
      .eq("phone", phone)
      .eq("organization_id", resolvedOrganizationId);

    // Return patients list (could be one or multiple)
    const needsSelection = patients.length > 1;

    return new Response(
      JSON.stringify({ 
        success: true, 
        needs_selection: needsSelection,
        patients: patients,
        patient: needsSelection ? null : patients[0]
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in verify-otp:", error);
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
