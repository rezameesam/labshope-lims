import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendOtpRequest {
  phone: string;
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone }: SendOtpRequest = await req.json();

    // Validate phone number (10 digits)
    if (!phone || !/^\d{10}$/.test(phone)) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number. Must be 10 digits." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if patient exists with this phone
    const { data: patients, error: patientError } = await supabase
      .from("patients")
      .select("id")
      .eq("phone", phone)
      .eq("is_active", true);

    if (patientError || !patients || patients.length === 0) {
      return new Response(
        JSON.stringify({ error: "No patient account found with this phone number." }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get system settings for demo mode
    const { data: demoSetting } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "demo_mode_enabled")
      .single();

    const demoModeEnabled = demoSetting?.setting_value === "true";

    console.log(`Demo mode: ${demoModeEnabled}, Phone: ${phone}`);

    if (demoModeEnabled) {
      // Demo mode - no actual OTP sent, use 123456
      // Clean up any existing OTPs for this phone
      await supabase
        .from("otp_codes")
        .delete()
        .eq("phone", phone);

      // Store demo OTP (hash of 123456)
      const demoOtpHash = await hashOtp("123456");
      await supabase.from("otp_codes").insert({
        phone,
        otp_hash: demoOtpHash,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "OTP sent successfully",
          demo_mode: true 
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Production mode - send via MSG91
    const msg91AuthKey = Deno.env.get("MSG91_AUTH_KEY");
    
    const { data: templateSetting } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "msg91_template_id")
      .single();

    const { data: senderSetting } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "msg91_sender_id")
      .single();

    const templateId = templateSetting?.setting_value;
    const senderId = senderSetting?.setting_value || "IRMLAB";

    if (!msg91AuthKey || !templateId) {
      console.error("MSG91 not configured properly");
      return new Response(
        JSON.stringify({ error: "SMS service not configured. Please contact support." }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Rate limiting - check if OTP was sent recently
    const { data: recentOtp } = await supabase
      .from("otp_codes")
      .select("created_at")
      .eq("phone", phone)
      .gte("created_at", new Date(Date.now() - 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (recentOtp && recentOtp.length > 0) {
      return new Response(
        JSON.stringify({ error: "Please wait before requesting another OTP." }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await hashOtp(otp);

    // Clean up old OTPs for this phone
    await supabase
      .from("otp_codes")
      .delete()
      .eq("phone", phone);

    // Store OTP
    await supabase.from("otp_codes").insert({
      phone,
      otp_hash: otpHash,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
    });

    // Send OTP via MSG91
    const msg91Response = await fetch("https://control.msg91.com/api/v5/otp", {
      method: "POST",
      headers: {
        "authkey": msg91AuthKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        template_id: templateId,
        mobile: `91${phone}`,
        sender: senderId,
        otp: otp,
        otp_length: 6,
        otp_expiry: 5,
      }),
    });

    const msg91Result = await msg91Response.json();
    console.log("MSG91 response:", msg91Result);

    if (msg91Result.type !== "success") {
      console.error("MSG91 error:", msg91Result);
      return new Response(
        JSON.stringify({ error: "Failed to send OTP. Please try again." }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "OTP sent successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in send-otp:", error);
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
