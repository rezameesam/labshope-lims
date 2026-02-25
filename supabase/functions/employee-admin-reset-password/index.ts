import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface EmployeeAdminResetRequest {
  employee_id: string;
  reset_base_url?: string;
  mode?: "email" | "temp";
}

type EmployeeRecord = {
  id: string;
  user_id: string | null;
  employee_id: string;
  full_name: string;
  email: string;
  is_active: boolean;
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration missing." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");

    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .single();

    if (roleError || !roleData) {
      return new Response(
        JSON.stringify({ error: "Only admins can reset employee passwords." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { employee_id, reset_base_url, mode }: EmployeeAdminResetRequest = await req.json();
    const resolvedMode = mode || "email";

    if (!employee_id) {
      return new Response(
        JSON.stringify({ error: "Employee ID is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: employee, error: employeeError } = await supabaseAdmin
      .from("employees")
      .select("id, user_id, employee_id, full_name, email, is_active")
      .eq("id", employee_id)
      .single();

    if (employeeError || !employee) {
      return new Response(
        JSON.stringify({ error: "Employee not found." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const employeeRecord = employee as EmployeeRecord;
    if (!employeeRecord.is_active) {
      return new Response(
        JSON.stringify({ error: "Cannot reset password for an inactive employee." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (resolvedMode === "temp") {
      const tempPassword = generatePassword(12);
      const userId = await ensureEmployeeAuthUser(supabaseAdmin, employeeRecord, tempPassword);

      if (userId && employeeRecord.user_id) {
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          password: tempPassword,
          email_confirm: true,
        });
      }

      return new Response(
        JSON.stringify({ success: true, temp_password: tempPassword }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!reset_base_url) {
      return new Response(
        JSON.stringify({ error: "Reset URL is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!employeeRecord.email) {
      return new Response(
        JSON.stringify({ error: "Employee has no email on file." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await ensureEmployeeAuthUser(supabaseAdmin, employeeRecord, generatePassword(12));

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: employeeRecord.email,
      options: {
        redirectTo: reset_base_url,
      },
    });

    if (linkError) {
      return new Response(
        JSON.stringify({ error: linkError.message || "Failed to generate reset link." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const actionLink = linkData?.properties?.action_link;
    if (!actionLink) {
      return new Response(
        JSON.stringify({ error: "Reset link was not generated." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const subject = "Reset your IRM Employee Portal password";
    const htmlContent = buildResetEmail(employeeRecord.full_name, actionLink);

    const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: employeeRecord.email,
        subject,
        htmlContent,
      }),
    });

    if (!emailResponse.ok) {
      const errorPayload = await emailResponse.text();
      console.error("Failed to send employee reset email:", errorPayload);
      return new Response(
        JSON.stringify({ error: "Failed to send reset email." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Error in employee-admin-reset-password:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Internal server error." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function ensureEmployeeAuthUser(
  supabaseAdmin: any,
  employee: EmployeeRecord,
  fallbackPassword: string,
): Promise<string> {
  if (employee.user_id) {
    return employee.user_id;
  }

  const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: employee.email,
    password: fallbackPassword,
    email_confirm: true,
  });

  if (createError || !createdUser?.user?.id) {
    throw new Error(createError?.message || "Failed to create auth user for employee.");
  }

  const userId = createdUser.user.id;
  const { error: updateError } = await supabaseAdmin
    .from("employees")
    .update({ user_id: userId })
    .eq("id", employee.id);

  if (updateError) {
    throw new Error(updateError.message || "Failed to link employee account.");
  }

  return userId;
}

function generatePassword(length: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$!";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((value) => chars[value % chars.length]).join("");
}

function buildResetEmail(name: string, link: string): string {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2 style="color:#1F2937;">Reset your password</h2>
      <p>Hello ${name || "there"},</p>
      <p>An administrator requested a password reset for your IRM Employee Portal account.</p>
      <p>
        <a href="${link}" style="display:inline-block;padding:10px 16px;background:#1F2937;color:#fff;text-decoration:none;border-radius:6px;">
          Reset Password
        </a>
      </p>
      <p>This link will expire automatically. If you did not request this reset, please contact an administrator.</p>
    </div>
  `;
}
