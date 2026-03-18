import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PlatformCounts = {
  organizations: number;
  activeLeads: number;
  onboardingRequests: number;
  pendingDns: number;
  provisionedTenants: number;
  selfServeRequests: number;
};

export type PlatformLead = {
  id: string;
  created_at: string;
  status: string;
  full_name: string;
  lab_name: string;
  city: string | null;
  utm_source: string | null;
};

export type PlatformOnboardingRequest = {
  id: string;
  created_at: string;
  status: string;
  selected_plan: "starter" | "growth" | "premium";
  setup_mode: "self_serve" | "assisted";
  organization_name: string;
  owner_email: string;
  custom_domain: string | null;
  resolved_slug: string | null;
  provisioned_organization_id: string | null;
};

type OrganizationRow = {
  id: string;
  slug: string;
  display_name: string;
  status: string;
  created_at: string;
};

type OrganizationDomain = {
  organization_id: string;
  domain: string;
  is_primary: boolean;
  verified_at: string | null;
};

export type TenantCard = {
  id: string;
  slug: string;
  displayName: string;
  createdAt: string;
  primaryDomain: string | null;
  fallbackDomain: string | null;
  connected: boolean;
};

export type LeadChartPoint = { date: string; leads: number };
export type PlanChartPoint = { plan: string; count: number };

export type DashboardData = {
  counts: PlatformCounts;
  recentLeads: PlatformLead[];
  recentOnboarding: PlatformOnboardingRequest[];
  recentTenants: TenantCard[];
  leadsChartData: LeadChartPoint[];
  planChartData: PlanChartPoint[];
};

async function fetchDashboardData(): Promise<DashboardData> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    organizationsResult,
    leadsResult,
    recentLeadsResult,
    onboardingResult,
    recentOnboardingResult,
    domainsResult,
    recentOrganizationsResult,
    leadsChartResult,
    planChartResult,
  ] = await Promise.all([
    (supabase as any).from("organizations").select("id", { count: "exact", head: true }),
    (supabase as any)
      .from("platform_demo_requests")
      .select("id, status", { count: "exact" })
      .neq("status", "closed"),
    (supabase as any)
      .from("platform_demo_requests")
      .select("id, created_at, status, full_name, lab_name, city, utm_source")
      .order("created_at", { ascending: false })
      .limit(5),
    (supabase as any)
      .from("platform_onboarding_requests")
      .select("id, status, setup_mode, provisioned_organization_id, custom_domain", { count: "exact" })
      .neq("status", "closed"),
    (supabase as any)
      .from("platform_onboarding_requests")
      .select("id, created_at, status, selected_plan, setup_mode, organization_name, owner_email, custom_domain, resolved_slug, provisioned_organization_id")
      .order("created_at", { ascending: false })
      .limit(6),
    (supabase as any)
      .from("organization_domains")
      .select("organization_id, domain, is_primary, verified_at"),
    (supabase as any)
      .from("organizations")
      .select("id, slug, display_name, status, created_at")
      .order("created_at", { ascending: false })
      .limit(6),
    (supabase as any)
      .from("platform_demo_requests")
      .select("created_at")
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: true }),
    (supabase as any)
      .from("platform_onboarding_requests")
      .select("selected_plan"),
  ]);

  const onboardingRows = (onboardingResult.data || []) as Array<{
    status: string;
    setup_mode: "self_serve" | "assisted";
    provisioned_organization_id: string | null;
    custom_domain: string | null;
  }>;
  const domains = (domainsResult.data || []) as OrganizationDomain[];
  const orgRows = (recentOrganizationsResult.data || []) as OrganizationRow[];

  const pendingDns = onboardingRows.filter((request) => {
    if (!request.custom_domain || !request.provisioned_organization_id) return false;
    const matchingDomain = domains.find(
      (domain) =>
        domain.organization_id === request.provisioned_organization_id &&
        domain.domain === request.custom_domain,
    );
    return Boolean(matchingDomain && !matchingDomain.verified_at);
  }).length;

  const recentTenants: TenantCard[] = orgRows.map((organization) => {
    const orgDomains = domains.filter((domain) => domain.organization_id === organization.id);
    const primaryDomain = orgDomains.find((domain) => domain.is_primary) || null;
    const fallbackDomain =
      orgDomains.find((domain) => !domain.is_primary) ||
      orgDomains.find((domain) => domain.domain.endsWith(".localhost")) ||
      null;

    return {
      id: organization.id,
      slug: organization.slug,
      displayName: organization.display_name,
      createdAt: organization.created_at,
      primaryDomain: primaryDomain?.domain || null,
      fallbackDomain: fallbackDomain?.domain || null,
      connected: Boolean(
        primaryDomain?.verified_at || (primaryDomain && primaryDomain.domain.endsWith(".localhost")),
      ),
    };
  });

  const leadsRaw = (leadsChartResult.data || []) as Array<{ created_at: string }>;
  const leadsByDate: Record<string, number> = {};
  for (const row of leadsRaw) {
    const day = row.created_at.slice(0, 10);
    leadsByDate[day] = (leadsByDate[day] || 0) + 1;
  }
  const leadsChartData: LeadChartPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    leadsChartData.push({ date: label, leads: leadsByDate[key] || 0 });
  }

  const planRaw = (planChartResult.data || []) as Array<{ selected_plan: string }>;
  const planCounts: Record<string, number> = {};
  for (const row of planRaw) {
    const plan = row.selected_plan || "unknown";
    planCounts[plan] = (planCounts[plan] || 0) + 1;
  }
  const planChartData: PlanChartPoint[] = Object.entries(planCounts)
    .map(([plan, count]) => ({ plan, count }))
    .sort((a, b) => b.count - a.count);

  return {
    counts: {
      organizations: organizationsResult.count || 0,
      activeLeads: leadsResult.count || 0,
      onboardingRequests: onboardingResult.count || 0,
      pendingDns,
      provisionedTenants: onboardingRows.filter((row) => Boolean(row.provisioned_organization_id)).length,
      selfServeRequests: onboardingRows.filter((row) => row.setup_mode === "self_serve").length,
    },
    recentLeads: (recentLeadsResult.data || []) as PlatformLead[],
    recentOnboarding: (recentOnboardingResult.data || []) as PlatformOnboardingRequest[],
    recentTenants,
    leadsChartData,
    planChartData,
  };
}

export const PLATFORM_DASHBOARD_QUERY_KEY = ["platform-dashboard"] as const;

export function usePlatformDashboard() {
  return useQuery({
    queryKey: PLATFORM_DASHBOARD_QUERY_KEY,
    queryFn: fetchDashboardData,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}
