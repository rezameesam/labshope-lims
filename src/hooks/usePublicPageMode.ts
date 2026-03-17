import { useOrganization } from "@/contexts/OrganizationContext";
import { getPublicHostname, getPublicSlugCandidate, isDefinitelyPlatformHostname } from "@/lib/publicTenant";

export const usePublicPageMode = () => {
  const { organization, primaryLab, loading: organizationLoading } = useOrganization();
  const hostname = getPublicHostname();
  const slugCandidate = getPublicSlugCandidate(hostname);
  const platformHost = isDefinitelyPlatformHostname(hostname);
  // Tenant host = any non-platform hostname (slug-based OR custom domain)
  const isTenantHost = !platformHost;
  const tenantHostCandidate = !platformHost && !!slugCandidate;
  const hasResolvedTenant = Boolean(organization?.id || primaryLab?.organization_id);
  const invalidTenantHost = isTenantHost && !organizationLoading && !hasResolvedTenant;

  return {
    loading: isTenantHost ? organizationLoading : false,
    hostname,
    slugCandidate,
    platformHost,
    platformMode: platformHost,
    invalidTenantHost,
  };
};
