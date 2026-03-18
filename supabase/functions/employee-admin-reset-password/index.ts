import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  fetchOrganizationBranding,
  fetchScopedSettings,
} from "../_shared/organization-settings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface EmployeeAdminResetRequest {
  employee_id: string;
  reset_base_url?: string;
  mode?: "email" | "temp" | "set";
  custom_password?: string;
}

type EmployeeRecord = {
  id: string;
  user_id: string | null;
  employee_id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  organization_id: string | null;
};

const getEmployeeUserMetadata = async (supabaseAdmin: any, userId: string) => {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error) {
    throw new Error(error.message || "Failed to load employee auth metadata.");
  }

  return data.user?.user_metadata || {};
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

    const { data: platformAdminData } = await supabaseAdmin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    const isPlatformAdmin = Boolean(platformAdminData?.user_id);

    const { data: roleData, error: roleError } = isPlatformAdmin
      ? { data: { role: "admin" }, error: null }
      : await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", userData.user.id)
          .eq("role", "admin")
          .single();

    if (roleError || !roleData) {
      return new Response(
        JSON.stringify({ error: "Only organization admins or platform admins can reset employee passwords." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { employee_id, reset_base_url, mode, custom_password }: EmployeeAdminResetRequest = await req.json();
    const resolvedMode = mode || "email";

    if (!employee_id) {
      return new Response(
        JSON.stringify({ error: "Employee ID is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: employee, error: employeeError } = await supabaseAdmin
      .from("employees")
      .select("id, user_id, employee_id, full_name, email, is_active, organization_id")
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
    if (!employeeRecord.organization_id) {
      return new Response(
        JSON.stringify({ error: "Employee is not linked to an organization." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: organizationAccess } = isPlatformAdmin
      ? { data: [{ organization_id: employeeRecord.organization_id }] }
      : await supabaseAdmin
          .from("organization_users")
          .select("organization_id")
          .eq("user_id", userData.user.id)
          .eq("organization_id", employeeRecord.organization_id)
          .eq("is_active", true)
          .limit(1);

    if (!organizationAccess || organizationAccess.length === 0) {
      return new Response(
        JSON.stringify({ error: "You do not have access to this employee." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (resolvedMode === "temp") {
      const tempPassword = generatePassword(12);
      const userId = await ensureEmployeeAuthUser(supabaseAdmin, employeeRecord, tempPassword);
      const existingMetadata = await getEmployeeUserMetadata(supabaseAdmin, userId);

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          ...existingMetadata,
          must_change_password: true,
          first_login_flow: "admin_reset_temp",
        },
      });
      if (updateError) {
        return new Response(
          JSON.stringify({ error: updateError.message || "Failed to set temporary password." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ success: true, temp_password: tempPassword }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (resolvedMode === "set") {
      const password = String(custom_password || "");
      if (password.length < 6) {
        return new Response(
          JSON.stringify({ error: "Custom password must be at least 6 characters." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const userId = await ensureEmployeeAuthUser(supabaseAdmin, employeeRecord, generatePassword(12));
      const existingMetadata = await getEmployeeUserMetadata(supabaseAdmin, userId);
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: {
          ...existingMetadata,
          must_change_password: false,
          first_login_flow: null,
        },
      });
      if (updateError) {
        return new Response(
          JSON.stringify({ error: updateError.message || "Failed to set custom password." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
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

    const ensuredUserId = await ensureEmployeeAuthUser(supabaseAdmin, employeeRecord, generatePassword(12));
    const existingMetadata = await getEmployeeUserMetadata(supabaseAdmin, ensuredUserId);

    {
      const { error: metadataError } = await supabaseAdmin.auth.admin.updateUserById(ensuredUserId, {
        user_metadata: {
          ...existingMetadata,
          must_change_password: true,
          first_login_flow: "admin_reset_email",
        },
      });

      if (metadataError) {
        return new Response(
          JSON.stringify({ error: metadataError.message || "Failed to prepare employee reset state." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

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

    const [settingsMap, organizationBranding] = await Promise.all([
      fetchScopedSettings(
        supabaseUrl,
        serviceRoleKey,
        ["employee_portal_name"],
        employeeRecord.organization_id,
      ),
      fetchOrganizationBranding(supabaseUrl, serviceRoleKey, employeeRecord.organization_id),
    ]);
    const businessName =
      organizationBranding?.displayName?.trim() ||
      settingsMap.get("employee_portal_name")?.trim() ||
      "Diagnostic Laboratory";
    const subject = `Reset your ${businessName} employee portal password`;
    const htmlContent = buildResetEmail(employeeRecord.full_name, actionLink, businessName);

    const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-service-key": serviceRoleKey,
      },
      body: JSON.stringify({
        to: employeeRecord.email,
        subject,
        htmlContent,
        organizationId: employeeRecord.organization_id,
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

function buildResetEmail(name: string, link: string, businessName: string): string {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2 style="color:#1F2937;">Reset your password</h2>
      <p>Hello ${name || "there"},</p>
      <p>An administrator requested a password reset for your ${escapeHtml(businessName)} employee portal account.</p>
      <p>
        <a href="${link}" style="display:inline-block;padding:10px 16px;background:#1F2937;color:#fff;text-decoration:none;border-radius:6px;">
          Reset Password
        </a>
      </p>
      <p>This link will expire automatically. If you did not request this reset, please contact an administrator.</p>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
