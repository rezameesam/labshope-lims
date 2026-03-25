import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Verify caller is authenticated
  const { data: { user }, error: authError } = await anonClient.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  // Verify caller is a platform admin
  const { data: platformAdmin } = await adminClient
    .from("platform_admins" as any)
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!platformAdmin) {
    return jsonResponse({ error: "Forbidden. Platform admin access required." }, 403);
  }

  try {
    const { organization_id, org_slug, fallback_redirect_to } = await req.json().catch(() => ({}));
    if (!organization_id) {
      return jsonResponse({ error: "organization_id is required." }, 400);
    }

    // Build redirect URL: prefer org's custom domain, then slug.basedomain, then fallback
    const { data: domainData } = await adminClient
      .from("organization_domains" as any)
      .select("domain, is_primary, verified_at")
      .eq("organization_id", organization_id)
      .order("is_primary", { ascending: false })
      .limit(1);

    const customDomain = (domainData as any[])?.[0]?.domain as string | undefined;

    let redirectTo: string;
    if (customDomain) {
      const isLocal = customDomain.endsWith(".localhost");
      const baseUrl = `${isLocal ? "http" : "https"}://${customDomain}`;
      redirectTo = `${baseUrl}/admin?platform_access=1`;
    } else if (org_slug) {
      // Build from slug + base domain env var
      const baseDomain = Deno.env.get("PUBLIC_BASE_DOMAIN") || "";
      if (baseDomain) {
        const isLocal = baseDomain.includes("localhost");
        const protocol = isLocal ? "http" : "https";
        const port = isLocal ? `:${baseDomain.split(":")[1] || "8080"}` : "";
        const host = isLocal ? `${org_slug}.localhost` : `${org_slug}.${baseDomain}`;
        redirectTo = `${protocol}://${host}${port}/admin?platform_access=1`;
      } else if (fallback_redirect_to) {
        redirectTo = fallback_redirect_to;
      } else {
        return jsonResponse({ error: "No domain configured for this organization." }, 404);
      }
    } else if (fallback_redirect_to) {
      redirectTo = fallback_redirect_to;
    } else {
      return jsonResponse({ error: "No domain configured for this organization." }, 404);
    }

    // Find the org owner's email
    const { data: memberData } = await adminClient
      .from("organization_users" as any)
      .select("user_id")
      .eq("organization_id", organization_id)
      .eq("is_active", true)
      .eq("is_primary", true)
      .limit(1);

    const orgUserId = (memberData as any[])?.[0]?.user_id as string | undefined;
    if (!orgUserId) {
      return jsonResponse({ error: "No active owner found for this organization." }, 404);
    }

    // Get the user's email
    const { data: { user: orgUser }, error: userError } = await adminClient.auth.admin.getUserById(orgUserId);
    if (userError || !orgUser?.email) {
      return jsonResponse({ error: "Could not retrieve org admin user." }, 500);
    }

    // Generate a magic link
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: orgUser.email,
      options: { redirectTo },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("Magic link generation failed:", linkError);
      return jsonResponse({ error: linkError?.message || "Failed to generate access link." }, 500);
    }

    return jsonResponse({ url: linkData.properties.action_link });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("platform-impersonate-org error:", error);
    return jsonResponse({ error: message }, 500);
  }
});
