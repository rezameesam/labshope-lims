import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import PlatformRoute from "@/components/platform/PlatformRoute";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { AttentionSection } from "@/components/platform/dashboard/AttentionSection";
import { DashboardCharts } from "@/components/platform/dashboard/DashboardCharts";
import { KpiStrip } from "@/components/platform/dashboard/KpiStrip";
import { LatestLeads } from "@/components/platform/dashboard/LatestLeads";
import { LatestOnboarding } from "@/components/platform/dashboard/LatestOnboarding";
import { PlatformStatus } from "@/components/platform/dashboard/PlatformStatus";
import { TenantsTable } from "@/components/platform/dashboard/TenantsTable";
import { WorkQueues } from "@/components/platform/dashboard/WorkQueues";

type PlatformCounts = {
  organizations: number;
  activeLeads: number;
  onboardingRequests: number;
  pendingDns: number;
  provisionedTenants: number;
  selfServeRequests: number;
};

type PlatformLead = {
  id: string;
  created_at: string;
  status: string;
  full_name: string;
  lab_name: string;
  city: string | null;
  utm_source: string | null;
};

type PlatformOnboardingRequest = {
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

type TenantCard = {
  id: string;
  slug: string;
  displayName: string;
  createdAt: string;
  primaryDomain: string | null;
  fallbackDomain: string | null;
  connected: boolean;
};

type LeadChartPoint = { date: string; leads: number };
type PlanChartPoint = { plan: string; count: number };
type OnboardingFilter = "all" | "approved" | "self_serve" | "dns";

const DEFAULT_COUNTS: PlatformCounts = {
  organizations: 0,
  activeLeads: 0,
  onboardingRequests: 0,
  pendingDns: 0,
  provisionedTenants: 0,
  selfServeRequests: 0,
};

const PlatformDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<PlatformCounts>(DEFAULT_COUNTS);
  const [recentLeads, setRecentLeads] = useState<PlatformLead[]>([]);
  const [recentOnboarding, setRecentOnboarding] = useState<PlatformOnboardingRequest[]>([]);
  const [recentTenants, setRecentTenants] = useState<TenantCard[]>([]);
  const [tenantSearch, setTenantSearch] = useState("");
  const [onboardingFilter, setOnboardingFilter] = useState<OnboardingFilter>("all");
  const [leadsChartData, setLeadsChartData] = useState<LeadChartPoint[]>([]);
  const [planChartData, setPlanChartData] = useState<PlanChartPoint[]>([]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);

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

    const onboardingRows = ((onboardingResult.data || []) as Array<{
      status: string;
      setup_mode: "self_serve" | "assisted";
      provisioned_organization_id: string | null;
      custom_domain: string | null;
    }>);
    const domains = ((domainsResult.data || []) as OrganizationDomain[]);
    const orgRows = ((recentOrganizationsResult.data || []) as OrganizationRow[]);

    const pendingDns = onboardingRows.filter((request) => {
      if (!request.custom_domain || !request.provisioned_organization_id) {
        return false;
      }
      const matchingDomain = domains.find(
        (domain) =>
          domain.organization_id === request.provisioned_organization_id &&
          domain.domain === request.custom_domain,
      );
      return Boolean(matchingDomain && !matchingDomain.verified_at);
    }).length;

    const tenantCards = orgRows.map((organization) => {
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
        connected: Boolean(primaryDomain?.verified_at || (primaryDomain && primaryDomain.domain.endsWith(".localhost"))),
      };
    });

    setCounts({
      organizations: organizationsResult.count || 0,
      activeLeads: leadsResult.count || 0,
      onboardingRequests: onboardingResult.count || 0,
      pendingDns,
      provisionedTenants: onboardingRows.filter((row) => Boolean(row.provisioned_organization_id)).length,
      selfServeRequests: onboardingRows.filter((row) => row.setup_mode === "self_serve").length,
    });

    const leadsRaw = (leadsChartResult.data || []) as Array<{ created_at: string }>;
    const leadsByDate: Record<string, number> = {};
    for (const row of leadsRaw) {
      const day = row.created_at.slice(0, 10);
      leadsByDate[day] = (leadsByDate[day] || 0) + 1;
    }
    const leadsChartPoints: LeadChartPoint[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      leadsChartPoints.push({ date: label, leads: leadsByDate[key] || 0 });
    }
    setLeadsChartData(leadsChartPoints);

    const planRaw = (planChartResult.data || []) as Array<{ selected_plan: string }>;
    const planCounts: Record<string, number> = {};
    for (const row of planRaw) {
      const plan = row.selected_plan || "unknown";
      planCounts[plan] = (planCounts[plan] || 0) + 1;
    }
    setPlanChartData(
      Object.entries(planCounts).map(([plan, count]) => ({ plan, count })).sort((a, b) => b.count - a.count),
    );

    setRecentLeads((recentLeadsResult.data || []) as PlatformLead[]);
    setRecentOnboarding((recentOnboardingResult.data || []) as PlatformOnboardingRequest[]);
    setRecentTenants(tenantCards);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadDashboard();

    const channel = supabase
      .channel("platform-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "platform_demo_requests" }, () => {
        void loadDashboard();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "platform_onboarding_requests" }, () => {
        void loadDashboard();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "organizations" }, () => {
        void loadDashboard();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadDashboard]);

  const attentionItems = useMemo(
    () =>
      [
        counts.activeLeads > 0
          ? {
              title: "Follow up with open leads",
              detail: `${counts.activeLeads} demo request${counts.activeLeads === 1 ? "" : "s"} still need active sales handling.`,
              actionLabel: "Go to leads",
              href: "/platform/leads",
              toneClass: "border-emerald-200 bg-emerald-50",
            }
          : null,
        counts.onboardingRequests > 0
          ? {
              title: "Push onboarding forward",
              detail: `${counts.onboardingRequests} customer setup request${counts.onboardingRequests === 1 ? "" : "s"} are still open in provisioning.`,
              actionLabel: "Go to onboarding",
              href: "/platform/onboarding",
              toneClass: "border-blue-200 bg-blue-50",
            }
          : null,
        counts.pendingDns > 0
          ? {
              title: "Resolve domain handoff",
              detail: `${counts.pendingDns} provisioned tenant${counts.pendingDns === 1 ? "" : "s"} still need DNS confirmation.`,
              actionLabel: "Review DNS queue",
              href: "/platform/onboarding",
              toneClass: "border-amber-200 bg-amber-50",
            }
          : null,
      ].filter(Boolean) as Array<{
        title: string;
        detail: string;
        actionLabel: string;
        href: string;
        toneClass: string;
      }>,
    [counts.activeLeads, counts.onboardingRequests, counts.pendingDns],
  );

  const filteredTenants = useMemo(() => {
    const query = tenantSearch.trim().toLowerCase();
    if (!query) return recentTenants;
    return recentTenants.filter((tenant) =>
      [tenant.displayName, tenant.slug, tenant.primaryDomain, tenant.fallbackDomain]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [recentTenants, tenantSearch]);

  const filteredOnboarding = useMemo(() => {
    if (onboardingFilter === "approved") return recentOnboarding.filter((r) => r.status === "approved");
    if (onboardingFilter === "self_serve") return recentOnboarding.filter((r) => r.setup_mode === "self_serve");
    if (onboardingFilter === "dns") return recentOnboarding.filter((r) => Boolean(r.custom_domain));
    return recentOnboarding;
  }, [onboardingFilter, recentOnboarding]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f7fb]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <PlatformRoute>
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Control</p>
          <h2 className="mt-1 font-heading text-3xl font-bold tracking-tight text-slate-950">Overview</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/platform/leads")}>
            Demo Leads
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          <Button variant="clinical" size="sm" onClick={() => navigate("/platform/onboarding")}>
            Onboarding Queue
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <KpiStrip counts={counts} />

      <DashboardCharts leadsChartData={leadsChartData} planChartData={planChartData} />

      <AttentionSection items={attentionItems} onNavigate={navigate} />

      <section className="grid gap-6 2xl:grid-cols-[1.15fr_0.85fr]">
        <WorkQueues counts={counts} onNavigate={navigate} />
        <PlatformStatus counts={counts} />
      </section>

      <section className="grid gap-6 2xl:grid-cols-[1.15fr_0.85fr]">
        <TenantsTable
          tenants={filteredTenants}
          search={tenantSearch}
          onSearchChange={setTenantSearch}
          organizationCount={counts.organizations}
        />

        <div className="space-y-6">
          <LatestLeads leads={recentLeads} onNavigate={navigate} />

          <LatestOnboarding
            requests={filteredOnboarding}
            filter={onboardingFilter}
            onFilterChange={setOnboardingFilter}
          />

          <Card className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <CardHeader className="border-b border-slate-200 pb-5">
              <CardTitle className="text-2xl text-slate-950">Customer Ops</CardTitle>
              <CardDescription>Open the dedicated customer module for plans, domains, and tenant footprint.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm leading-7 text-slate-600">
                  Use the customer module when you need an operator view across tenant plans, live domains, fallback domains, usage footprint, and recorded payments.
                </p>
                <Button className="mt-4" variant="outline" onClick={() => navigate("/platform/customers")}>
                  Open customer ops
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </PlatformRoute>
  );
};

export default PlatformDashboard;
