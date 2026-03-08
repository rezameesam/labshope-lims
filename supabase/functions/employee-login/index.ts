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
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, password, turnstile_token }: EmployeeLoginRequest = await req.json();
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

    if (!isStaff) {
      await authClient.auth.signOut();
      return jsonResponse({ error: "Your account does not have staff access." }, 403);
    }

    return jsonResponse({
      success: true,
      roles,
      is_staff: isStaff,
      is_collector: isCollector,
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
