import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyTurnstile } from "../_shared/patient-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type UserRole = "admin" | "employee" | "patient" | "collector";

interface EmployeeLoginRequest {
  email: string;
  password: string;
  turnstile_token?: string;
  organization_slug?: string | null;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, password, turnstile_token, organization_slug }: EmployeeLoginRequest = await req.json();
    const trimmedEmail = email?.trim().toLowerCase();

    if (!trimmedEmail || !password) {
      return jsonResponse({ error: "Email and password are required." }, 400);
    }

    const turnstileError = await verifyTurnstile(turnstile_token || "", req);
    if (turnstileError) {
      return jsonResponse({ error: turnstileError }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: "Server configuration missing." }, 500);
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (authError || !authData.session || !authData.user) {
      return jsonResponse({ error: "Invalid email or password." }, 401);
    }

    const { data: roleRows, error: rolesError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id);

    if (rolesError) {
      console.error("Error fetching staff roles:", rolesError);
      await authClient.auth.signOut();
      return jsonResponse({ error: "Unable to verify staff access." }, 500);
    }

    const roles = (roleRows?.map((row) => row.role as UserRole) || []);
    const isStaff = roles.some((role) => role === "admin" || role === "employee" || role === "collector");
    const isCollector =
      roles.includes("collector") &&
      !roles.includes("admin") &&
      !roles.includes("employee");

    // Check if this user is a platform admin — they can access any tenant org.
    const { data: platformAdminRecord } = await adminClient
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", authData.user.id)
      .maybeSingle();
    const isPlatformAdmin = Boolean(platformAdminRecord?.user_id);

    if (!isStaff && !isPlatformAdmin) {
      await authClient.auth.signOut();
      return jsonResponse({ error: "Your account does not have staff access." }, 403);
    }

    let resolvedOrganizationId: string | null = null;

    if (isPlatformAdmin) {
      // Platform admins bypass employee record and membership checks.
      // Resolve the org they're logging into from the slug (tenant subdomain login)
      // or fall back to their own employee record org if logging in at platform hostname.
      if (organization_slug) {
        const { data: requestedOrg, error: orgLookupError } = await adminClient
          .from("organizations")
          .select("id")
          .eq("slug", organization_slug)
          .maybeSingle();

        if (orgLookupError) {
          console.error("Error looking up organization by slug:", orgLookupError);
          await authClient.auth.signOut();
          return jsonResponse({ error: "Unable to verify organization." }, 500);
        }

        if (!requestedOrg) {
          await authClient.auth.signOut();
          return jsonResponse({ error: "Organization not found." }, 403);
        }

        resolvedOrganizationId = requestedOrg.id;
      } else {
        // No slug — try to get org from their own employee record.
        const { data: empRecord } = await adminClient
          .from("employees")
          .select("organization_id")
          .eq("user_id", authData.user.id)
          .maybeSingle();
        resolvedOrganizationId = (empRecord as { organization_id?: string | null } | null)?.organization_id ?? null;
      }
    } else {
      // Normal staff flow — verify employee record and org membership.
      const { data: employeeRecord, error: employeeError } = await adminClient
        .from("employees")
        .select("id, is_active, organization_id")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      if (employeeError || !employeeRecord || employeeRecord.is_active !== true) {
        await authClient.auth.signOut();
        return jsonResponse({ error: "Your staff account is inactive or not linked to an employee record." }, 403);
      }

      resolvedOrganizationId =
        (employeeRecord as { organization_id?: string | null }).organization_id || null;

      if (!resolvedOrganizationId) {
        await authClient.auth.signOut();
        return jsonResponse({ error: "Your staff account is not linked to an active organization." }, 403);
      }

      // Verify the employee belongs to the org on whose subdomain they're logging in.
      if (organization_slug) {
        const { data: requestedOrg, error: orgLookupError } = await adminClient
          .from("organizations")
          .select("id")
          .eq("slug", organization_slug)
          .maybeSingle();

        if (orgLookupError) {
          console.error("Error looking up organization by slug:", orgLookupError);
          await authClient.auth.signOut();
          return jsonResponse({ error: "Unable to verify organization." }, 500);
        }

        if (!requestedOrg) {
          await authClient.auth.signOut();
          return jsonResponse({ error: "Organization not found." }, 403);
        }

        if (requestedOrg.id !== resolvedOrganizationId) {
          await authClient.auth.signOut();
          return jsonResponse({ error: "Your account does not belong to this organization." }, 403);
        }
      }

      const { data: organizationMemberships, error: organizationMembershipError } = await adminClient
        .from("organization_users")
        .select("organization_id")
        .eq("user_id", authData.user.id)
        .eq("organization_id", resolvedOrganizationId)
        .eq("is_active", true)
        .limit(1);

      if (organizationMembershipError) {
        console.error("Error verifying organization membership:", organizationMembershipError);
        await authClient.auth.signOut();
        return jsonResponse({ error: "Unable to verify staff organization access." }, 500);
      }

      if (!organizationMemberships || organizationMemberships.length === 0) {
        await authClient.auth.signOut();
        return jsonResponse({ error: "Your staff account is not linked to an active organization." }, 403);
      }
    }

    return jsonResponse({
      success: true,
      roles,
      is_staff: isStaff || isPlatformAdmin,
      is_collector: isCollector,
      is_platform_admin: isPlatformAdmin,
      organization_id: resolvedOrganizationId,
      password_reset_required: authData.user.user_metadata?.must_change_password === true,
      first_login_flow: typeof authData.user.user_metadata?.first_login_flow === "string"
        ? authData.user.user_metadata.first_login_flow
        : null,
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
      },
      user: {
        id: authData.user.id,
        email: authData.user.email,
      },
    });
  } catch (error: any) {
    console.error("Error in employee-login:", error);
    return jsonResponse({ error: error.message || "Internal server error" }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}
