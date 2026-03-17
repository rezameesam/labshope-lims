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
    return candidate || null;
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

  const configuredBaseDomain = import.meta.env.VITE_PUBLIC_BASE_DOMAIN?.trim().toLowerCase();
  if (configuredBaseDomain && hostname === configuredBaseDomain) return true;

  const platformHostname = import.meta.env.VITE_PLATFORM_HOSTNAME?.trim().toLowerCase();
  if (platformHostname && hostname === platformHostname) return true;

  return false;
};
