import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ConsentPayload = {
  version?: string;
  analytics?: boolean;
  personalization?: boolean;
  ads?: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

const normalizeCountryCode = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  if (!COUNTRY_CODE_PATTERN.test(normalized)) {
    return null;
  }
  if (normalized === "XX" || normalized === "ZZ") {
    return null;
  }
  return normalized;
};

const parseCountryFromAcceptLanguage = (acceptLanguage: string | null): string | null => {
  if (!acceptLanguage) {
    return null;
  }

  const locales = acceptLanguage.split(",").map((item) => item.split(";")[0].trim());
  for (const locale of locales) {
    if (!locale) {
      continue;
    }
    const parts = locale.replace(/_/g, "-").split("-");
    for (let index = 1; index < parts.length; index += 1) {
      const candidate = normalizeCountryCode(parts[index]);
      if (candidate) {
        return candidate;
      }
    }
  }
  return null;
};

const resolveCountryName = (countryCode: string | null, countryNameFromBody: unknown): string | null => {
  if (typeof countryNameFromBody === "string" && countryNameFromBody.trim()) {
    return countryNameFromBody.trim();
  }

  if (!countryCode) {
    return null;
  }

  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
    return displayNames.of(countryCode) || countryCode;
  } catch {
    return countryCode;
  }
};

const normalizeHostname = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/:\d+$/, "");
};

const extractHostname = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  try {
    return normalizeHostname(new URL(value).hostname);
  } catch {
    return null;
  }
};

const getSlugCandidate = (hostname: string | null): string | null => {
  if (!hostname) {
    return null;
  }

  if (hostname.endsWith(".localhost")) {
    const slug = hostname.slice(0, -".localhost".length).trim();
    return slug || null;
  }

  const configuredBaseDomain =
    normalizeHostname(Deno.env.get("PUBLIC_BASE_DOMAIN")) ||
    normalizeHostname(Deno.env.get("VITE_PUBLIC_BASE_DOMAIN"));

  if (configuredBaseDomain && hostname.endsWith(`.${configuredBaseDomain}`)) {
    const slug = hostname.slice(0, -(configuredBaseDomain.length + 1)).trim();
    return slug || null;
  }

  return null;
};

const resolveOrganizationId = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  explicitOrganizationId: string | null,
  hostname: string | null,
): Promise<string | null> => {
  if (hostname) {
    const { data: domainMatch, error: domainError } = await supabaseAdmin
      .from("organization_domains")
      .select("organization_id")
      .eq("domain", hostname)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!domainError && domainMatch?.organization_id) {
      return domainMatch.organization_id as string;
    }

    const slugCandidate = getSlugCandidate(hostname);
    if (slugCandidate) {
      const { data: organizationMatch, error: organizationError } = await supabaseAdmin
        .from("organizations")
        .select("id")
        .eq("slug", slugCandidate)
        .in("status", ["trial", "active"])
        .limit(1)
        .maybeSingle();

      if (!organizationError && organizationMatch?.id) {
        return organizationMatch.id as string;
      }
    }
  }

  if (explicitOrganizationId && UUID_PATTERN.test(explicitOrganizationId)) {
    const { data: organizationMatch, error: organizationError } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("id", explicitOrganizationId)
      .in("status", ["trial", "active"])
      .limit(1)
      .maybeSingle();

    if (!organizationError && organizationMatch?.id) {
      return organizationMatch.id as string;
    }
  }

  return null;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const eventType = typeof body.event_type === "string" ? body.event_type : "page_view";
    const path = typeof body.path === "string" ? body.path : null;
    const referrer = typeof body.referrer === "string" ? body.referrer : null;
    const consent = typeof body.consent === "object" ? (body.consent as ConsentPayload) : null;
    const explicitOrganizationId =
      typeof body.organization_id === "string" ? body.organization_id.trim() : null;
    const hostname =
      normalizeHostname(body.hostname) ||
      extractHostname(req.headers.get("origin")) ||
      extractHostname(referrer);

    const forwardedFor = req.headers.get("x-forwarded-for") || "";
    const ip = forwardedFor.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
    const userAgent = req.headers.get("user-agent") || null;
    const countryHeader =
      req.headers.get("cf-ipcountry") ||
      req.headers.get("x-vercel-ip-country") ||
      req.headers.get("x-country") ||
      req.headers.get("x-geo-country") ||
      req.headers.get("cloudfront-viewer-country");
    const acceptLanguage = req.headers.get("accept-language");

    const countryCode =
      normalizeCountryCode(body.country_code) ||
      normalizeCountryCode(countryHeader) ||
      parseCountryFromAcceptLanguage(acceptLanguage);
    const countryName = resolveCountryName(countryCode, body.country_name);
    const organizationId = await resolveOrganizationId(
      supabaseAdmin,
      explicitOrganizationId,
      hostname,
    );

    const insertPayload = {
      organization_id: organizationId,
      event_type: eventType,
      path,
      referrer,
      consent,
      ip,
      user_agent: userAgent,
      country_code: countryCode,
      country_name: countryName,
    };
    let { error } = await supabaseAdmin.from("visitor_logs").insert(insertPayload);
    if (error && (String(error.message || "").includes("country_code") || String(error.message || "").includes("country_name"))) {
      const fallbackPayload = {
        organization_id: organizationId,
        event_type: eventType,
        path,
        referrer,
        consent,
        ip,
        user_agent: userAgent,
      };
      const fallbackResult = await supabaseAdmin.from("visitor_logs").insert(fallbackPayload);
      error = fallbackResult.error;
    }

    if (error) {
      console.error("Failed to log visitor:", error);
      return new Response(
        JSON.stringify({ error: "Failed to log visitor" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
