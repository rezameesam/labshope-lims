import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateAdminRequest {
  email: string;
  password: string;
  full_name: string;
}

const DEFAULT_ADMIN_ORG_ROLE = "owner";

const jsonResponse = (payload: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Create admin client with service role
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Check if any admin exists
    const { data: existingAdmins, error: checkError } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("role", "admin")
      .limit(1);

    if (checkError) {
      console.error("Error checking existing admins:", checkError);
      throw checkError;
    }

    if (existingAdmins && existingAdmins.length > 0) {
      return new Response(
        JSON.stringify({ error: "An admin account already exists. Use the admin dashboard to create more." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, password, full_name }: CreateAdminRequest = await req.json();

    if (!email || !password || !full_name) {
      return new Response(
        JSON.stringify({ error: "Email, password, and full name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      console.error("Error creating auth user:", authError);
      throw authError;
    }

    const userId = authData.user.id;
    const employeeId = `ADM${Math.floor(1000 + Math.random() * 9000)}`;
    let employeeCreated = false;

    const rollbackFirstAdmin = async () => {
      try {
        if (targetOrganizationId) {
          await supabaseAdmin
            .from("organization_users")
            .delete()
            .eq("organization_id", targetOrganizationId)
            .eq("user_id", userId);
        }

        if (targetLabId) {
          await supabaseAdmin
            .from("lab_users")
            .delete()
            .eq("lab_id", targetLabId)
            .eq("user_id", userId);
        }

        await supabaseAdmin
          .from("user_roles")
          .delete()
          .eq("user_id", userId);

        if (employeeCreated) {
          await supabaseAdmin
            .from("employees")
            .delete()
            .eq("user_id", userId);
        }
      } finally {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      }
    };

    // Resolve default lab for first admin.
    let targetLabId: string | null = null;
    let targetOrganizationId: string | null = null;
    const { data: defaultLab, error: defaultLabError } = await supabaseAdmin
      .from("labs")
      .select("id, organization_id")
      .eq("lab_code", "LAB001")
      .limit(1)
      .maybeSingle();

    if (!defaultLabError && defaultLab?.id) {
      targetLabId = defaultLab.id;
      targetOrganizationId = defaultLab.organization_id || null;
    } else if (!defaultLabError) {
      const { data: insertedLab, error: insertLabError } = await supabaseAdmin
        .from("labs")
        .insert({
          lab_code: "LAB001",
          name: "Main Laboratory",
          type: "main",
          is_active: true,
        })
        .select("id, organization_id")
        .single();

      if (!insertLabError && insertedLab?.id) {
        targetLabId = insertedLab.id;
        targetOrganizationId = insertedLab.organization_id || null;
      } else {
        console.error("Failed creating LAB001 fallback:", insertLabError);
        const { data: retryLab } = await supabaseAdmin
          .from("labs")
          .select("id, organization_id")
          .eq("lab_code", "LAB001")
          .limit(1)
          .maybeSingle();
        targetLabId = retryLab?.id || null;
        targetOrganizationId = retryLab?.organization_id || null;
      }
    }

    if (!targetOrganizationId) {
      await rollbackFirstAdmin();
      return jsonResponse(
        { error: "Unable to determine the organization for the first admin account." },
        500,
      );
    }

    // Create employee record
    const { error: employeeError } = await supabaseAdmin.from("employees").insert({
      user_id: userId,
      employee_id: employeeId,
      full_name,
      email,
      designation: "Administrator",
      department: "Administration",
      ...(targetOrganizationId ? { organization_id: targetOrganizationId } : {}),
      ...(targetLabId ? { lab_id: targetLabId } : {}),
    });

    if (employeeError) {
      console.error("Error creating employee:", employeeError);
      await rollbackFirstAdmin();
      throw employeeError;
    }
    employeeCreated = true;

    // Assign admin role
    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      role: "admin",
    });

    if (roleError) {
      console.error("Error assigning role:", roleError);
      await rollbackFirstAdmin();
      throw roleError;
    }

    if (targetLabId) {
      const { error: labUserError } = await supabaseAdmin
        .from("lab_users")
        .upsert(
          {
            user_id: userId,
            lab_id: targetLabId,
            role: "admin",
            is_primary: true,
          },
          { onConflict: "user_id,lab_id" }
        );

      if (labUserError) {
        console.error("Failed to attach first admin to lab:", labUserError);
        await rollbackFirstAdmin();
        throw labUserError;
      }
    }

    const { error: organizationUserError } = await supabaseAdmin
      .from("organization_users")
      .upsert(
        {
          organization_id: targetOrganizationId,
          user_id: userId,
          role: DEFAULT_ADMIN_ORG_ROLE,
          is_primary: true,
          is_active: true,
        },
        { onConflict: "organization_id,user_id" }
      );

    if (organizationUserError) {
      console.error("Failed to attach first admin to organization:", organizationUserError);
      await rollbackFirstAdmin();
      throw organizationUserError;
    }

    const { error: platformAdminError } = await supabaseAdmin
      .from("platform_admins")
      .upsert(
        {
          user_id: userId,
          created_by: userId,
          note: "Bootstrapped first platform admin",
        },
        { onConflict: "user_id" }
      );

    if (platformAdminError) {
      console.error("Failed to attach first admin to platform admin registry:", platformAdminError);
      await rollbackFirstAdmin();
      throw platformAdminError;
    }

    console.log(`First admin created successfully: ${email}`);

    return jsonResponse(
      { 
        success: true, 
        message: "Admin account created successfully",
        employee_id: employeeId 
      },
      200,
    );
  } catch (error: any) {
    console.error("Error in create-first-admin:", error);
    return jsonResponse({ error: error.message || "Failed to create admin account" }, 500);
  }
});
