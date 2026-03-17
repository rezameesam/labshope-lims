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

/**
 * Adds `domain` to the Cloudflare Turnstile widget's allowed-domain list.
 * Uses GET-then-PUT so existing domains are preserved.
 * Silently skips if TURNSTILE_SITE_KEY is not configured.
 */
async function registerDomainWithTurnstile(
  domain: string,
  apiToken: string,
  accountId: string,
): Promise<void> {
  const sitekey = Deno.env.get("TURNSTILE_SITE_KEY");
  if (!sitekey) {
    console.warn("TURNSTILE_SITE_KEY not set — skipping Turnstile domain registration");
    return;
  }

  const widgetUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/challenges/widgets/${sitekey}`;
  const cfHeaders = { "Authorization": `Bearer ${apiToken}`, "Content-Type": "application/json" };

  // Fetch current widget config so we can preserve existing domains and settings.
  const getRes = await fetch(widgetUrl, { headers: cfHeaders });
  if (!getRes.ok) {
    console.warn("Turnstile: could not fetch widget config:", await getRes.text());
    return;
  }

  const widget = (await getRes.json())?.result ?? {};
  const existingDomains: string[] = Array.isArray(widget.domains) ? widget.domains : [];

  if (existingDomains.includes(domain)) {
    return; // already allowed — nothing to do
  }

  // PUT the full widget config back with the new domain appended.
  const putRes = await fetch(widgetUrl, {
    method: "PUT",
    headers: cfHeaders,
    body: JSON.stringify({
      name: widget.name ?? "LIMS Widget",
      domains: [...existingDomains, domain],
      mode: widget.mode ?? "managed",
      bot_fight_mode: widget.bot_fight_mode ?? false,
      offlabel: widget.offlabel ?? false,
      region: widget.region ?? "world",
    }),
  });

  if (!putRes.ok) {
    console.warn("Turnstile: could not update widget domains:", await putRes.text());
  } else {
    console.log(`Turnstile: added ${domain} to widget ${sitekey}`);
  }
}

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

    // Also add the domain to the Turnstile widget's allowed-domain list so
    // security challenges work correctly on the tenant's custom hostname.
    await registerDomainWithTurnstile(normalizedDomain, apiToken, accountId);

    return jsonResponse({ registered: true, domain: normalizedDomain });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("register-pages-domain error:", error);
    return jsonResponse({ error: message }, 500);
  }
});
