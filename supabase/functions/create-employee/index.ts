import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CreateEmployeeRequest {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  designation?: string;
  department?: string;
  role: "admin" | "employee" | "collector";
  lab_id?: string | null;
}

const mapOrganizationRole = (role: CreateEmployeeRequest["role"]) =>
  role === "admin" ? "org_admin" : "staff";

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // Verify the calling user is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("No authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    
    // Create client with anon key and verify the token
    const supabaseClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callingUser }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !callingUser) {
      console.error("User verification failed:", userError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Verified user:", callingUser.email);

    // Create admin client to check role
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check if calling user is admin
    const { data: roleData, error: roleCheckError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callingUser.id)
      .eq("role", "admin")
      .single();

    if (roleCheckError || !roleData) {
      return new Response(
        JSON.stringify({ error: "Only admins can create employees" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: callerOrganizations, error: callerOrganizationsError } = await supabaseAdmin
      .from("organization_users")
      .select("organization_id, is_primary")
      .eq("user_id", callingUser.id)
      .eq("is_active", true)
      .order("is_primary", { ascending: false });

    if (callerOrganizationsError) {
      return new Response(
        JSON.stringify({ error: "Unable to determine admin organization access" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerOrganizationIds = new Set(
      (callerOrganizations || [])
        .map((row: { organization_id?: string | null }) => row.organization_id || null)
        .filter((value): value is string => !!value)
    );

    if (callerOrganizationIds.size === 0) {
      return new Response(
        JSON.stringify({ error: "Admin is not linked to an active organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerPrimaryOrganizationId =
      (callerOrganizations || [])[0]?.organization_id || null;

    const { email, password, full_name, phone, designation, department, role, lab_id }: CreateEmployeeRequest = await req.json();

    if (!email || !password || !full_name || !role) {
      return new Response(
        JSON.stringify({ error: "Email, password, full name, and role are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve target lab:
    // 1) explicit lab_id from request
    // 2) caller's primary lab
    // 3) LAB001 fallback
    let targetLabId = lab_id || null;

    let targetOrganizationId: string | null = null;

    if (targetLabId) {
      const { data: lab, error: labError } = await supabaseAdmin
        .from("labs")
        .select("id, organization_id")
        .eq("id", targetLabId)
        .eq("is_active", true)
        .single();

      if (labError || !lab) {
        return new Response(
          JSON.stringify({ error: "Invalid lab selected" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      targetOrganizationId = lab.organization_id || null;

      if (!targetOrganizationId || !callerOrganizationIds.has(targetOrganizationId)) {
        return new Response(
          JSON.stringify({ error: "You do not have access to the selected lab" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      const { data: callerPrimaryLab } = await supabaseAdmin
        .from("lab_users")
        .select("lab_id, lab:labs(organization_id)")
        .eq("user_id", callingUser.id)
        .order("is_primary", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (callerPrimaryLab?.lab_id) {
        targetLabId = callerPrimaryLab.lab_id;
        targetOrganizationId = (callerPrimaryLab.lab as { organization_id?: string | null } | null)?.organization_id || null;
      } else {
        const { data: defaultLab } = await supabaseAdmin
          .from("labs")
          .select("id, organization_id")
          .eq("lab_code", "LAB001")
          .eq("organization_id", callerPrimaryOrganizationId)
          .limit(1)
          .maybeSingle();

        if (defaultLab?.id) {
          targetLabId = defaultLab.id;
          targetOrganizationId = defaultLab.organization_id || null;
        } else {
          const { data: insertedLab, error: insertLabError } = await supabaseAdmin
            .from("labs")
            .insert({
              lab_code: "LAB001",
              name: "Main Laboratory",
              type: "main",
              is_active: true,
              organization_id: callerPrimaryOrganizationId,
            })
            .select("id, organization_id")
            .single();

          if (insertLabError) {
            console.error("Failed creating LAB001 fallback:", insertLabError);
            const { data: retryLab } = await supabaseAdmin
              .from("labs")
              .select("id, organization_id")
              .eq("lab_code", "LAB001")
              .eq("organization_id", callerPrimaryOrganizationId)
              .limit(1)
              .maybeSingle();
            targetLabId = retryLab?.id || null;
            targetOrganizationId = retryLab?.organization_id || null;
          } else {
            targetLabId = insertedLab?.id || null;
            targetOrganizationId = insertedLab?.organization_id || null;
          }
        }
      }
    }

    if (!targetLabId) {
      return new Response(
        JSON.stringify({ error: "No active lab available. Create a lab first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!targetOrganizationId || !callerOrganizationIds.has(targetOrganizationId)) {
      return new Response(
        JSON.stringify({ error: "Resolved organization is not accessible to this admin" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user already exists only after target tenant access is fully resolved.
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);
    
    let userId: string;
    let createdNewAuthUser = false;
    
    if (existingUser) {
      // Check if this user already has an employee record
      const { data: existingEmployee } = await supabaseAdmin
        .from("employees")
        .select("id")
        .eq("user_id", existingUser.id)
        .single();
      
      if (existingEmployee) {
        return new Response(
          JSON.stringify({ error: "An employee record already exists for this email" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      userId = existingUser.id;
      console.log(`Using existing user: ${email}`);
    } else {
      // Create new auth user
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (authError) {
        console.error("Error creating auth user:", authError);
        return new Response(
          JSON.stringify({ error: authError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      userId = authData.user.id;
      createdNewAuthUser = true;
      console.log(`Created new user: ${email}`);
    }

    if (existingUser) {
      const { data: existingMemberships, error: existingMembershipsError } = await supabaseAdmin
        .from("organization_users")
        .select("organization_id")
        .eq("user_id", existingUser.id)
        .eq("is_active", true);

      if (existingMembershipsError) {
        if (createdNewAuthUser) {
          await supabaseAdmin.auth.admin.deleteUser(userId);
        }
        return new Response(
          JSON.stringify({ error: "Unable to verify existing user organization access" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const conflictingMembership = (existingMemberships || []).some(
        (membership: { organization_id?: string | null }) =>
          !!membership.organization_id && membership.organization_id !== targetOrganizationId
      );

      if (conflictingMembership) {
        if (createdNewAuthUser) {
          await supabaseAdmin.auth.admin.deleteUser(userId);
        }
        return new Response(
          JSON.stringify({ error: "This email is already linked to another organization" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const employeeId = `EMP${Math.floor(1000 + Math.random() * 9000)}`;

    // Create employee record
    const { data: employeeRecord, error: employeeError } = await supabaseAdmin
      .from("employees")
      .insert({
        user_id: userId,
        employee_id: employeeId,
        full_name,
        email,
        phone: phone || null,
        designation: designation || null,
        department: department || null,
        lab_id: targetLabId,
        organization_id: targetOrganizationId,
      })
      .select("id, user_id, employee_id")
      .single();

    if (employeeError) {
      console.error("Error creating employee:", employeeError);
      if (createdNewAuthUser) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      }
      return new Response(
        JSON.stringify({ error: employeeError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Assign role
    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      role: role,
    });

    if (roleError) {
      console.error("Error assigning role:", roleError);
      if (createdNewAuthUser) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      }
      return new Response(
        JSON.stringify({ error: roleError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Keep a single primary lab per user.
    const { error: unsetPrimaryError } = await supabaseAdmin
      .from("lab_users")
      .update({ is_primary: false })
      .eq("user_id", userId);

    if (unsetPrimaryError) {
      console.error("Error clearing previous primary labs:", unsetPrimaryError);
      if (createdNewAuthUser) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      }
      return new Response(
        JSON.stringify({ error: unsetPrimaryError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map app role to lab_users role set.
    const labUserRole = role === "admin" ? "admin" : "employee";
    const { error: labUserError } = await supabaseAdmin
      .from("lab_users")
      .upsert(
        {
          user_id: userId,
          lab_id: targetLabId,
          role: labUserRole,
          is_primary: true,
        },
        { onConflict: "user_id,lab_id" }
      );

    if (labUserError) {
      console.error("Error assigning lab membership:", labUserError);
      if (createdNewAuthUser) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      }
      return new Response(
        JSON.stringify({ error: labUserError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (targetOrganizationId) {
      const { error: organizationUserError } = await supabaseAdmin
        .from("organization_users")
        .upsert(
          {
            organization_id: targetOrganizationId,
            user_id: userId,
            role: mapOrganizationRole(role),
            is_primary: true,
            is_active: true,
          },
          { onConflict: "organization_id,user_id" }
        );

      if (organizationUserError) {
        console.error("Error assigning organization membership:", organizationUserError);
        if (createdNewAuthUser) {
          await supabaseAdmin.auth.admin.deleteUser(userId);
        }
        return new Response(
          JSON.stringify({ error: organizationUserError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`Employee created successfully: ${email}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Employee created successfully",
        employee_id: employeeId,
        employee_row_id: employeeRecord?.id,
        user_id: employeeRecord?.user_id || userId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in create-employee:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to create employee" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
