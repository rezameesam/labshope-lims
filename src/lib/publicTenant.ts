export const getPublicHostname = () => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.location.hostname?.trim().toLowerCase() || null;
};

export const getConfiguredBaseDomain = () =>
  import.meta.env.VITE_PUBLIC_BASE_DOMAIN?.trim().toLowerCase() || null;

export const getConfiguredPlatformHostname = () =>
  import.meta.env.VITE_PLATFORM_HOSTNAME?.trim().toLowerCase() || null;

/**
 * The host that serves the product marketing site (home, features, pricing, contact, demo request).
 * Defaults to the base domain; set VITE_MARKETING_HOSTNAME when the base domain is used for
 * something else (labshope.com is the company site, so the product site lives on healthcare.labshope.com).
 */
export const getConfiguredMarketingHostname = () =>
  import.meta.env.VITE_MARKETING_HOSTNAME?.trim().toLowerCase() || getConfiguredBaseDomain();

const matchesHostnameOrWwwAlias = (hostname: string | null, configuredHostname: string | null) => {
  if (!hostname || !configuredHostname) {
    return false;
  }

  return hostname === configuredHostname || hostname === `www.${configuredHostname}`;
};

export const getPublicSlugCandidate = (hostname: string | null) => {
  if (!hostname) {
    return null;
  }

  if (hostname.endsWith(".localhost")) {
    const candidate = hostname.slice(0, -".localhost".length);
    return candidate || null;
  }

  const configuredBaseDomain = getConfiguredBaseDomain();
  if (configuredBaseDomain && hostname.endsWith(`.${configuredBaseDomain}`)) {
    const candidate = hostname.slice(0, -(configuredBaseDomain.length + 1));
    return candidate || null;
  }

  return null;
};

export const isPlatformHostname = (hostname: string | null) => {
  if (!hostname) {
    return true;
  }

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return true;
  }

  const configuredBaseDomain = getConfiguredBaseDomain();
  if (matchesHostnameOrWwwAlias(hostname, configuredBaseDomain)) {
    return true;
  }

  const platformHostname = getConfiguredPlatformHostname();
  if (matchesHostnameOrWwwAlias(hostname, platformHostname)) {
    return true;
  }

  if (matchesHostnameOrWwwAlias(hostname, getConfiguredMarketingHostname())) {
    return true;
  }

  return getPublicSlugCandidate(hostname) === null;
};

// Returns true only for hostnames that are definitively the platform —
// excludes tenant subdomains AND unknown custom domains so they get a DB lookup.
export const isDefinitelyPlatformHostname = (hostname: string | null) => {
  if (!hostname) return true;
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;

  const configuredBaseDomain = getConfiguredBaseDomain();
  if (matchesHostnameOrWwwAlias(hostname, configuredBaseDomain)) return true;

  const platformHostname = getConfiguredPlatformHostname();
  if (matchesHostnameOrWwwAlias(hostname, platformHostname)) return true;

  if (matchesHostnameOrWwwAlias(hostname, getConfiguredMarketingHostname())) return true;

  return false;
};

export const isMarketingHostname = (hostname: string | null) =>
  matchesHostnameOrWwwAlias(hostname, getConfiguredMarketingHostname());

export const isOperationsHostname = (hostname: string | null) => {
  const platformHostname = getConfiguredPlatformHostname();
  return matchesHostnameOrWwwAlias(hostname, platformHostname);
};

const buildAbsoluteUrl = (hostname: string | null, path = "/") => {
  if (!hostname) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const protocol =
    typeof window !== "undefined" && (window.location.protocol === "http:" || window.location.protocol === "https:")
      ? window.location.protocol
      : "https:";

  let portPart = "";
  if (typeof window !== "undefined") {
    const currentPort = window.location.port || "";
    const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost");
    if (isLocalHost && currentPort) {
      portPart = `:${currentPort}`;
    }
  }

  return `${protocol}//${hostname}${portPart}${normalizedPath}`;
};

export const buildMarketingUrl = (path = "/") => buildAbsoluteUrl(getConfiguredMarketingHostname(), path);

export const buildOperationsUrl = (path = "/") => buildAbsoluteUrl(getConfiguredPlatformHostname(), path);
