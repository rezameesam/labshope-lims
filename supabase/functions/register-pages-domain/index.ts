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

  // Authenticate — must be a logged-in admin user
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  try {
    const { domain } = await req.json().catch(() => ({}));

    if (!domain || typeof domain !== "string") {
      return jsonResponse({ error: "domain is required." }, 400);
    }

    const normalizedDomain = domain.trim().toLowerCase().replace(/\.$/, "");

    const apiToken = Deno.env.get("CLOUDFLARE_API_TOKEN");
    const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
    const projectName = Deno.env.get("CLOUDFLARE_PAGES_PROJECT");

    if (!apiToken || !accountId || !projectName) {
      return jsonResponse({ error: "Cloudflare configuration is not set up on this server." }, 500);
    }

    const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/domains`;

    const cfRes = await fetch(cfUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: normalizedDomain }),
    });

    const cfData = await cfRes.json();

    // 409 = domain already registered — treat as success
    if (!cfRes.ok && cfRes.status !== 409) {
      const errorMsg = cfData?.errors?.[0]?.message || "Cloudflare API error.";
      console.error("Cloudflare Pages domain registration failed:", cfData);
      return jsonResponse({ error: errorMsg }, 502);
    }

    return jsonResponse({ registered: true, domain: normalizedDomain });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("register-pages-domain error:", error);
    return jsonResponse({ error: message }, 500);
  }
});
