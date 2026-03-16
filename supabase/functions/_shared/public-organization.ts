import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const normalizeHostname = (value: unknown): string | null => {
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

export const resolveRequestHostname = (
  req: Request,
  explicitHostname?: string | null,
): string | null =>
  extractHostname(explicitHostname || null) ||
  normalizeHostname(explicitHostname) ||
  extractHostname(req.headers.get("origin")) ||
  extractHostname(req.headers.get("referer")) ||
  normalizeHostname(req.headers.get("host"));

export const resolvePublicOrganizationId = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  req: Request,
  explicitOrganizationId?: string | null,
  explicitHostname?: string | null,
): Promise<string | null> => {
  const hostname = resolveRequestHostname(req, explicitHostname);

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
