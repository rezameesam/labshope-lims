export const getPublicHostname = () => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.location.hostname?.trim().toLowerCase() || null;
};

export const getPublicSlugCandidate = (hostname: string | null) => {
  if (!hostname) {
    return null;
  }

  if (hostname.endsWith(".localhost")) {
    const candidate = hostname.slice(0, -".localhost".length);
    // Allow a dev override: VITE_DEV_ORG_SLUG lets you use a short hostname
    // like irm.localhost while mapping to the real org slug (e.g. irmclinic).
    const devSlugOverride = import.meta.env.VITE_DEV_ORG_SLUG?.trim();
    return devSlugOverride || candidate || null;
  }

  const configuredBaseDomain = import.meta.env.VITE_PUBLIC_BASE_DOMAIN?.trim().toLowerCase();
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

  const configuredBaseDomain = import.meta.env.VITE_PUBLIC_BASE_DOMAIN?.trim().toLowerCase();
  if (configuredBaseDomain && hostname === configuredBaseDomain) {
    return true;
  }

  const platformHostname = import.meta.env.VITE_PLATFORM_HOSTNAME?.trim().toLowerCase();
  if (platformHostname && hostname === platformHostname) {
    return true;
  }

  return getPublicSlugCandidate(hostname) === null;
};

// Returns true only for hostnames that are definitively the platform —
// excludes tenant subdomains AND unknown custom domains so they get a DB lookup.
export const isDefinitelyPlatformHostname = (hostname: string | null) => {
  if (!hostname) return true;
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  // Any *.localhost subdomain is a dev environment — treat as platform host
  // so the app falls back to the logged-in user's org instead of showing
  // "Tenant Not Found" when the slug doesn't match a DB entry.
  if (hostname.endsWith(".localhost")) return true;

  const configuredBaseDomain = import.meta.env.VITE_PUBLIC_BASE_DOMAIN?.trim().toLowerCase();
  if (configuredBaseDomain && hostname === configuredBaseDomain) return true;

  const platformHostname = import.meta.env.VITE_PLATFORM_HOSTNAME?.trim().toLowerCase();
  if (platformHostname && hostname === platformHostname) return true;

  return false;
};
