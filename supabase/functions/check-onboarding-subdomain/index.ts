import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeHostname } from "../_shared/public-organization.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

const normalizeSubdomain = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");

const deriveBaseDomain = (hostname: string | null) => {
  const configured =
    normalizeHostname(Deno.env.get("PUBLIC_BASE_DOMAIN")) ||
    normalizeHostname(Deno.env.get("VITE_PUBLIC_BASE_DOMAIN"));

  if (configured) {
    return configured;
  }

  if (!hostname) {
    return null;
  }

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "localhost";
  }

  return null;
};

const buildPreviewUrl = (domain: string | null, slug: string) => {
  const host = domain || `${slug}.localhost`;
  const protocol =
    host.endsWith(".localhost") || host === "localhost" || host === "127.0.0.1" ? "http" : "https";
  return `${protocol}://${host}`;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Server configuration missing." }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const preferredSubdomain = normalizeSubdomain(String(body?.preferred_subdomain || ""));
    const organizationName = String(body?.organization_name || "").trim();
    const hostname = normalizeHostname(String(body?.hostname || ""));

    const candidateSlug = preferredSubdomain || slugify(organizationName);
    if (!candidateSlug) {
      return jsonResponse({ error: "preferred_subdomain or organization_name is required." }, 400);
    }

    const baseDomain = deriveBaseDomain(hostname);
    const candidateDomain = baseDomain ? `${candidateSlug}.${baseDomain}` : null;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const [{ data: existingOrganization }, { data: existingDomain }] = await Promise.all([
      supabaseAdmin.from("organizations").select("id").eq("slug", candidateSlug).limit(1).maybeSingle(),
      candidateDomain
        ? supabaseAdmin
            .from("organization_domains")
            .select("id")
            .eq("domain", candidateDomain)
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const available = !existingOrganization?.id && !existingDomain?.id;
    if (available) {
      return jsonResponse({
        available: true,
        candidate_slug: candidateSlug,
        candidate_domain: candidateDomain,
        candidate_url: buildPreviewUrl(candidateDomain, candidateSlug),
        suggestion_slug: candidateSlug,
        suggestion_domain: candidateDomain,
        suggestion_url: buildPreviewUrl(candidateDomain, candidateSlug),
      });
    }

    let suggestionSlug = candidateSlug;
    let suggestionDomain = candidateDomain;

    for (let attempt = 2; attempt <= 25; attempt += 1) {
      const nextSlug = `${candidateSlug}-${attempt}`;
      const nextDomain = baseDomain ? `${nextSlug}.${baseDomain}` : null;

      const [{ data: conflictOrganization }, { data: conflictDomain }] = await Promise.all([
        supabaseAdmin.from("organizations").select("id").eq("slug", nextSlug).limit(1).maybeSingle(),
        nextDomain
          ? supabaseAdmin
              .from("organization_domains")
              .select("id")
              .eq("domain", nextDomain)
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      if (!conflictOrganization?.id && !conflictDomain?.id) {
        suggestionSlug = nextSlug;
        suggestionDomain = nextDomain;
        break;
      }
    }

    return jsonResponse({
      available: false,
      candidate_slug: candidateSlug,
      candidate_domain: candidateDomain,
      candidate_url: buildPreviewUrl(candidateDomain, candidateSlug),
      suggestion_slug: suggestionSlug,
      suggestion_domain: suggestionDomain,
      suggestion_url: buildPreviewUrl(suggestionDomain, suggestionSlug),
    });
  } catch (error) {
    console.error("Error in check-onboarding-subdomain:", error);
    const message = error instanceof Error ? error.message : "Failed to check subdomain availability";
    return jsonResponse({ error: message }, 500);
  }
});
