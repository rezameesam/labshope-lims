import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Globe2,
  Loader2,
  Rocket,
  Search,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import PlatformRoute from "@/components/platform/PlatformRoute";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { formatAppDateTime } from "@/lib/date";

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

const DEFAULT_COUNTS: PlatformCounts = {
  organizations: 0,
  activeLeads: 0,
  onboardingRequests: 0,
  pendingDns: 0,
  provisionedTenants: 0,
  selfServeRequests: 0,
};

const onboardingFilterOptions = [
  { value: "all", label: "All" },
  { value: "approved", label: "Approved" },
  { value: "self_serve", label: "Self-Serve" },
  { value: "dns", label: "DNS" },
] as const;

type LeadChartPoint = { date: string; leads: number };
type PlanChartPoint = { plan: string; count: number };

const PlatformDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<PlatformCounts>(DEFAULT_COUNTS);
  const [recentLeads, setRecentLeads] = useState<PlatformLead[]>([]);
  const [recentOnboarding, setRecentOnboarding] = useState<PlatformOnboardingRequest[]>([]);
  const [recentTenants, setRecentTenants] = useState<TenantCard[]>([]);
  const [tenantSearch, setTenantSearch] = useState("");
  const [onboardingFilter, setOnboardingFilter] = useState<"all" | "approved" | "self_serve" | "dns">("all");
  const [leadsChartData, setLeadsChartData] = useState<LeadChartPoint[]>([]);
  const [planChartData, setPlanChartData] = useState<PlanChartPoint[]>([]);

  useEffect(() => {
    const loadDashboard = async () => {
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
      // Build leads-over-time chart: fill all 30 days even if count is 0
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

      // Build onboarding-by-plan chart
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
    };

    void loadDashboard();
  }, []);

  const metricCards = useMemo(
    () => [
      {
        title: "Organizations",
        value: counts.organizations,
        icon: Building2,
        toneClass: "bg-slate-100 text-slate-700",
        detail: "Provisioned customer tenants currently active on the platform.",
      },
      {
        title: "Lead Pipeline",
        value: counts.activeLeads,
        icon: Users,
        toneClass: "bg-emerald-50 text-emerald-700",
        detail: "Demo requests still open in the sales queue.",
      },
      {
        title: "Onboarding Flow",
        value: counts.onboardingRequests,
        icon: Rocket,
        toneClass: "bg-blue-50 text-blue-700",
        detail: "Customer setup requests still moving through provisioning.",
      },
      {
        title: "Pending DNS",
        value: counts.pendingDns,
        icon: Globe2,
        toneClass: "bg-amber-50 text-amber-700",
        detail: "Provisioned tenants whose custom domain is still not live.",
      },
    ],
    [counts],
  );

  const filteredTenants = useMemo(() => {
    const query = tenantSearch.trim().toLowerCase();
    if (!query) {
      return recentTenants;
    }

    return recentTenants.filter((tenant) =>
      [tenant.displayName, tenant.slug, tenant.primaryDomain, tenant.fallbackDomain]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [recentTenants, tenantSearch]);

  const filteredOnboarding = useMemo(() => {
    if (onboardingFilter === "approved") {
      return recentOnboarding.filter((request) => request.status === "approved");
    }

    if (onboardingFilter === "self_serve") {
      return recentOnboarding.filter((request) => request.setup_mode === "self_serve");
    }

    if (onboardingFilter === "dns") {
      return recentOnboarding.filter((request) => Boolean(request.custom_domain));
    }

    return recentOnboarding;
  }, [onboardingFilter, recentOnboarding]);

  const queueCards = [
    {
      title: "Sales Queue",
      value: counts.activeLeads,
      description: "Demo requests still in play.",
      helper: "Keep this lean. Every open lead should have a next action.",
      icon: Users,
      iconClass: "bg-emerald-50 text-emerald-700",
      actionLabel: "Open leads",
      href: "/platform/leads",
    },
    {
      title: "Launch Queue",
      value: counts.onboardingRequests,
      description: "Customer setup requests still moving.",
      helper: "Provision fast and escalate only the complex installs.",
      icon: Rocket,
      iconClass: "bg-blue-50 text-blue-700",
      actionLabel: "Open onboarding",
      href: "/platform/onboarding",
    },
    {
      title: "Domain Watch",
      value: counts.pendingDns,
      description: "Provisioned custom domains still pending.",
      helper: "Keep fallback domains active until DNS is confirmed live.",
      icon: Globe2,
      iconClass: "bg-amber-50 text-amber-700",
      actionLabel: "Review DNS",
      href: "/platform/onboarding",
    },
  ] as const;

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

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className={`inline-flex rounded-xl p-2 ${card.toneClass}`}>
                <Icon className="h-4 w-4" />
              </div>
              <p className="mt-3 font-heading text-3xl font-bold text-slate-950">{card.value}</p>
              <p className="mt-1 text-sm font-medium text-slate-700">{card.title}</p>
            </div>
          );
        })}
      </div>

      {/* Trend charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Trend</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">Leads — last 30 days</h3>
          <div className="mt-5 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={leadsChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  tickLine={false}
                  axisLine={false}
                  interval={6}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                  cursor={{ stroke: "#cbd5e1", strokeWidth: 1 }}
                />
                <Area
                  type="monotone"
                  dataKey="leads"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#leadsGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#10b981" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Breakdown</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">Onboarding by plan</h3>
          <div className="mt-5 h-52">
            {planChartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                No onboarding data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={planChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="plan"
                    tick={{ fontSize: 12, fill: "#64748b" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                    cursor={{ fill: "#f1f5f9" }}
                  />
                  <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={56} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Needs Attention
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-slate-950">Today’s priorities</h3>
                </div>
                <p className="max-w-xl text-sm leading-7 text-slate-600">
                  This is the shortest path to action. If something is here, it still blocks sales, launch, or domain go-live.
                </p>
              </div>

              {attentionItems.length === 0 ? (
                <div className="mt-5 flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                    <BadgeCheck className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-slate-950">Queue is clear</p>
                    <p className="mt-1 text-sm text-slate-600">
                      No open leads, pending provisioning, or unresolved domains right now.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-5 grid gap-4 lg:grid-cols-3">
                  {attentionItems.map((item) => (
                    <div key={item.title} className={`rounded-2xl border p-5 ${item.toneClass}`}>
                      <p className="text-lg font-semibold text-slate-950">{item.title}</p>
                      <p className="mt-2 text-sm leading-7 text-slate-700">{item.detail}</p>
                      <Button
                        variant="outline"
                        className="mt-4 border-slate-300 bg-white"
                        onClick={() => navigate(item.href)}
                      >
                        {item.actionLabel}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="grid gap-6 2xl:grid-cols-[1.15fr_0.85fr]">
              <Card className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
                <CardHeader className="border-b border-slate-200 pb-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <CardTitle className="text-2xl text-slate-950">Work Queues</CardTitle>
                      <CardDescription>
                        The active operational buckets for the software team.
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                        {counts.provisionedTenants} provisioned
                      </Badge>
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                        {counts.selfServeRequests} self-serve
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 p-6 lg:grid-cols-3">
                  {queueCards.map((card) => {
                    const Icon = card.icon;
                    return (
                      <div key={card.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className={`rounded-xl p-2.5 ${card.iconClass}`}>
                            <Icon className="h-4.5 w-4.5" />
                          </div>
                          <p className="font-heading text-4xl font-bold text-slate-950">{card.value}</p>
                        </div>
                        <p className="mt-4 text-lg font-semibold text-slate-950">{card.title}</p>
                        <p className="mt-2 text-sm text-slate-600">{card.description}</p>
                        <p className="mt-4 text-sm leading-7 text-slate-500">{card.helper}</p>
                        <Button
                          variant="outline"
                          className="mt-5 w-full justify-between border-slate-200 bg-white"
                          onClick={() => navigate(card.href)}
                        >
                          {card.actionLabel}
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
                <CardHeader className="border-b border-slate-200 pb-5">
                  <CardTitle className="text-2xl text-slate-950">Platform Status</CardTitle>
                  <CardDescription>Short operational readout for the software owner.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-6">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Posture</p>
                    <p className="mt-3 text-base font-semibold text-slate-950">
                      {counts.pendingDns > 0
                        ? "Provisioning is moving, but domain activation still blocks at least one tenant."
                        : "No current DNS blockers are visible in the live launch queue."}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Customer Motion</p>
                    <p className="mt-3 text-base font-semibold text-slate-950">
                      {counts.activeLeads > 0
                        ? `${counts.activeLeads} lead${counts.activeLeads === 1 ? "" : "s"} and ${counts.onboardingRequests} onboarding request${counts.onboardingRequests === 1 ? "" : "s"} are active.`
                        : "Sales is quiet right now; onboarding and launch quality are the main operational focus."}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-center gap-3">
                      <BadgeCheck className="h-4.5 w-4.5 text-slate-700" />
                      <p className="text-sm font-semibold text-slate-950">Next best action</p>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      {counts.pendingDns > 0
                        ? "Go to onboarding and close the DNS handoff for any provisioned tenant that still shows pending."
                        : "Review the newest onboarding requests and convert any ready customer into a live tenant quickly."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </section>

            <section className="grid gap-6 2xl:grid-cols-[1.15fr_0.85fr]">
              <Card className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
                <CardHeader className="border-b border-slate-200 pb-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <CardTitle className="text-2xl text-slate-950">Customers</CardTitle>
                      <CardDescription>Search the tenant base and inspect public-domain state.</CardDescription>
                    </div>
                    <Badge variant="outline" className="w-fit border-slate-200 bg-slate-50 text-slate-700">
                      {counts.organizations} organizations
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="relative mb-5 max-w-md">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={tenantSearch}
                      onChange={(event) => setTenantSearch(event.target.value)}
                      className="border-slate-200 bg-slate-50 pl-10"
                      placeholder="Search tenant, slug, or domain"
                    />
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead>Organization</TableHead>
                          <TableHead>Primary Domain</TableHead>
                          <TableHead>Fallback</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTenants.map((tenant) => (
                          <TableRow key={tenant.id}>
                            <TableCell>
                              <div>
                                <p className="font-semibold text-slate-950">{tenant.displayName}</p>
                                <p className="text-xs text-slate-500">{tenant.slug}</p>
                              </div>
                            </TableCell>
                            <TableCell className="max-w-[260px] truncate">{tenant.primaryDomain || "-"}</TableCell>
                            <TableCell className="max-w-[220px] truncate">{tenant.fallbackDomain || "-"}</TableCell>
                            <TableCell>
                              <Badge variant={tenant.connected ? "default" : "secondary"}>
                                {tenant.connected ? "connected" : "needs DNS"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-slate-500">{formatAppDateTime(tenant.createdAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
                  <CardHeader className="border-b border-slate-200 pb-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-2xl text-slate-950">Latest Leads</CardTitle>
                        <CardDescription>Most recent inbound product interest.</CardDescription>
                      </div>
                      <Button variant="ghost" className="text-slate-600" onClick={() => navigate("/platform/leads")}>
                        View all
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 p-6">
                    {recentLeads.length === 0 ? (
                      <p className="text-sm text-slate-500">No active leads right now.</p>
                    ) : (
                      recentLeads.map((lead) => (
                        <div key={lead.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-950">{lead.lab_name}</p>
                              <p className="text-sm text-slate-500">{lead.full_name}</p>
                            </div>
                            <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                              {lead.status}
                            </Badge>
                          </div>
                          <p className="mt-3 text-sm text-slate-500">
                            {lead.city || "City not provided"}
                            {lead.utm_source ? ` · ${lead.utm_source}` : ""}
                            {` · ${formatAppDateTime(lead.created_at)}`}
                          </p>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
                  <CardHeader className="border-b border-slate-200 pb-5">
                    <div className="flex flex-col gap-4">
                      <div>
                        <CardTitle className="text-2xl text-slate-950">Latest Onboarding</CardTitle>
                        <CardDescription>The newest customer setup requests in the queue.</CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {onboardingFilterOptions.map((option) => (
                          <Button
                            key={option.value}
                            size="sm"
                            variant={onboardingFilter === option.value ? "clinical" : "outline"}
                            onClick={() => setOnboardingFilter(option.value)}
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 p-6">
                    {filteredOnboarding.map((request) => (
                      <div key={request.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-slate-950">{request.organization_name}</p>
                              <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                                {request.selected_plan}
                              </Badge>
                              <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                                {request.setup_mode === "self_serve" ? "self-serve" : "assisted"}
                              </Badge>
                            </div>
                            <p className="mt-2 text-sm text-slate-500">{request.owner_email}</p>
                          </div>
                          <Badge variant={request.status === "approved" ? "default" : "secondary"}>
                            {request.status}
                          </Badge>
                        </div>
                        <p className="mt-3 text-sm text-slate-500">
                          {request.custom_domain || request.resolved_slug || "No domain preference"}
                          {` · ${formatAppDateTime(request.created_at)}`}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
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
