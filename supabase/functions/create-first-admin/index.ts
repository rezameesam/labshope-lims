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

    // Resolve default lab for first admin.
    let targetLabId: string | null = null;
    const { data: defaultLab, error: defaultLabError } = await supabaseAdmin
      .from("labs")
      .select("id")
      .eq("lab_code", "LAB001")
      .limit(1)
      .maybeSingle();

    if (!defaultLabError && defaultLab?.id) {
      targetLabId = defaultLab.id;
    } else if (!defaultLabError) {
      const { data: insertedLab, error: insertLabError } = await supabaseAdmin
        .from("labs")
        .insert({
          lab_code: "LAB001",
          name: "Main Laboratory",
          type: "main",
          is_active: true,
        })
        .select("id")
        .single();

      if (!insertLabError && insertedLab?.id) {
        targetLabId = insertedLab.id;
      } else {
        console.error("Failed creating LAB001 fallback:", insertLabError);
        const { data: retryLab } = await supabaseAdmin
          .from("labs")
          .select("id")
          .eq("lab_code", "LAB001")
          .limit(1)
          .maybeSingle();
        targetLabId = retryLab?.id || null;
      }
    }

    // Create employee record
    const { error: employeeError } = await supabaseAdmin.from("employees").insert({
      user_id: userId,
      employee_id: employeeId,
      full_name,
      email,
      designation: "Administrator",
      department: "Administration",
      ...(targetLabId ? { lab_id: targetLabId } : {}),
    });

    if (employeeError) {
      console.error("Error creating employee:", employeeError);
      // Clean up auth user if employee creation fails
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw employeeError;
    }

    // Assign admin role
    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      role: "admin",
    });

    if (roleError) {
      console.error("Error assigning role:", roleError);
      throw roleError;
    }

    // Best-effort lab membership setup for first admin.
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
      }
    }

    console.log(`First admin created successfully: ${email}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Admin account created successfully",
        employee_id: employeeId 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in create-first-admin:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to create admin account" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
