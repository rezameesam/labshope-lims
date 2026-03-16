import { useOrganization } from "@/contexts/OrganizationContext";
import { getPublicHostname, getPublicSlugCandidate, isPlatformHostname } from "@/lib/publicTenant";

export const usePublicPageMode = () => {
  const { organization, primaryLab, loading: organizationLoading } = useOrganization();
  const hostname = getPublicHostname();
  const slugCandidate = getPublicSlugCandidate(hostname);
  const platformHost = isPlatformHostname(hostname);
  const tenantHostCandidate = !platformHost && !!slugCandidate;
  const hasResolvedTenant = Boolean(organization?.id || primaryLab?.organization_id);
  const invalidTenantHost = tenantHostCandidate && !organizationLoading && !hasResolvedTenant;

  return {
    loading: tenantHostCandidate ? organizationLoading : false,
    hostname,
    slugCandidate,
    platformHost,
    platformMode: platformHost,
    invalidTenantHost,
  };
};
