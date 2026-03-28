import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

const LOCAL_ORIGIN_PATTERNS = [
  /^http:\/\/localhost(?::\d+)?$/i,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/i,
  /^https?:\/\/[a-z0-9-]+\.localhost(?::\d+)?$/i,
];

const normalizeOrigin = (value: string) => {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const normalizeHostname = (value: string | null) => {
  if (!value) {
    return null;
  }

  return value.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
};

const getConfiguredOrigins = (envVarName: string) =>
  (Deno.env.get(envVarName) || "")
    .split(",")
    .map((item) => normalizeOrigin(item.trim()))
    .filter((item): item is string => Boolean(item));

const getConfiguredBaseDomain = () =>
  normalizeHostname(Deno.env.get("PUBLIC_BASE_DOMAIN")) ||
  normalizeHostname(Deno.env.get("VITE_PUBLIC_BASE_DOMAIN"));

const extractSlugFromHostname = (hostname: string | null, baseDomain: string | null) => {
  if (!hostname) {
    return null;
  }

  if (hostname.endsWith(".localhost")) {
    const slug = hostname.slice(0, -".localhost".length).trim();
    return slug || null;
  }

  if (baseDomain && hostname.endsWith(`.${baseDomain}`)) {
    const slug = hostname.slice(0, -(baseDomain.length + 1)).trim();
    return slug || null;
  }

  return null;
};

const buildCorsHeaders = (
  allowOrigin: string | null,
  allowHeaders: string,
  allowMethods: string,
) => {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": allowHeaders,
    "Access-Control-Allow-Methods": allowMethods,
    Vary: "Origin",
  };

  if (allowOrigin) {
    headers["Access-Control-Allow-Origin"] = allowOrigin;
  }

  return headers;
};

export const resolveCorsHeaders = (
  req: Request,
  options?: {
    allowHeaders?: string;
    allowMethods?: string;
    envVarName?: string;
  },
) => {
  const allowMethods = options?.allowMethods ?? "GET, POST, OPTIONS";
  const allowHeaders =
    options?.allowHeaders ?? "authorization, x-client-info, apikey, content-type";
  const envVarName = options?.envVarName ?? "ABDM_ALLOWED_ORIGINS";
  const configuredOrigins = getConfiguredOrigins(envVarName);
  const resolvedOrigin = normalizeOrigin(req.headers.get("origin") || "");
  const allowOrigin =
    resolvedOrigin &&
    (configuredOrigins.includes(resolvedOrigin) ||
      (configuredOrigins.length === 0 &&
        LOCAL_ORIGIN_PATTERNS.some((pattern) => pattern.test(resolvedOrigin))))
      ? resolvedOrigin
      : null;

  return buildCorsHeaders(allowOrigin, allowHeaders, allowMethods);
};

export const resolveAbdmCorsHeaders = async (
  req: Request,
  supabaseUrl: string,
  serviceRoleKey: string,
  options?: {
    allowHeaders?: string;
    allowMethods?: string;
    envVarName?: string;
  },
) => {
  const allowMethods = options?.allowMethods ?? "GET, POST, OPTIONS";
  const allowHeaders =
    options?.allowHeaders ?? "authorization, x-client-info, apikey, content-type";
  const envVarName = options?.envVarName ?? "ABDM_ALLOWED_ORIGINS";
  const configuredOrigins = getConfiguredOrigins(envVarName);
  const resolvedOrigin = normalizeOrigin(req.headers.get("origin") || "");

  if (!resolvedOrigin) {
    return buildCorsHeaders(null, allowHeaders, allowMethods);
  }

  if (configuredOrigins.includes(resolvedOrigin)) {
    return buildCorsHeaders(resolvedOrigin, allowHeaders, allowMethods);
  }

  if (
    configuredOrigins.length === 0 &&
    LOCAL_ORIGIN_PATTERNS.some((pattern) => pattern.test(resolvedOrigin))
  ) {
    return buildCorsHeaders(resolvedOrigin, allowHeaders, allowMethods);
  }

  const originUrl = new URL(resolvedOrigin);
  const hostname = normalizeHostname(originUrl.hostname);
  if (!hostname) {
    return buildCorsHeaders(null, allowHeaders, allowMethods);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const { data: exactDomainMatch, error: exactDomainError } = await supabaseAdmin
    .from("organization_domains")
    .select("verified_at")
    .eq("domain", hostname)
    .limit(1)
    .maybeSingle();

  if (!exactDomainError && exactDomainMatch?.verified_at) {
    return buildCorsHeaders(resolvedOrigin, allowHeaders, allowMethods);
  }

  const baseDomain = getConfiguredBaseDomain();
  const slugCandidate = extractSlugFromHostname(hostname, baseDomain);
  if (slugCandidate) {
    const { data: orgMatch, error: orgError } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("slug", slugCandidate)
      .in("status", ["trial", "active"])
      .limit(1)
      .maybeSingle();

    if (!orgError && orgMatch?.id) {
      return buildCorsHeaders(resolvedOrigin, allowHeaders, allowMethods);
    }
  }

  return buildCorsHeaders(null, allowHeaders, allowMethods);
};

export const secureJson = (
  body: unknown,
  status = 200,
  extraHeaders: HeadersInit = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...noStoreHeaders,
      ...extraHeaders,
    },
  });
