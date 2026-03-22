import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { SkeletonCard } from "@/components/ui/skeleton-card";
import { SkeletonTable } from "@/components/ui/skeleton-table";
import { useNotificationTrigger } from "@/hooks/useNotificationTrigger";
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
import {
  usePlatformDashboard,
  PLATFORM_DASHBOARD_QUERY_KEY,
  type PlatformCounts,
} from "@/hooks/queries/usePlatformDashboard";

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
  const queryClient = useQueryClient();
  const { createNotification } = useNotificationTrigger();
  const [tenantSearch, setTenantSearch] = useState("");
  const [onboardingFilter, setOnboardingFilter] = useState<OnboardingFilter>("all");

  const { data, isLoading } = usePlatformDashboard();

  const counts = data?.counts ?? DEFAULT_COUNTS;
  const recentLeads = data?.recentLeads ?? [];
  const recentOnboarding = data?.recentOnboarding ?? [];
  const recentTenants = data?.recentTenants ?? [];
  const leadsChartData = data?.leadsChartData ?? [];
  const planChartData = data?.planChartData ?? [];

  useEffect(() => {
    const channel = supabase
      .channel("platform-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "platform_demo_requests" },
        (payload: { eventType: string; new: Record<string, unknown> }) => {
          void queryClient.invalidateQueries({ queryKey: PLATFORM_DASHBOARD_QUERY_KEY });
          if (payload.eventType === "INSERT") {
            const row = payload.new;
            void createNotification({
              title: "New demo request",
              description: `${String(row.full_name ?? "Someone")} from ${String(row.lab_name ?? "a lab")} submitted a demo request.`,
              type: "lead",
              link: "/platform/leads",
            });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "platform_onboarding_requests" },
        (payload: { eventType: string; new: Record<string, unknown> }) => {
          void queryClient.invalidateQueries({ queryKey: PLATFORM_DASHBOARD_QUERY_KEY });
          if (payload.eventType === "INSERT") {
            const row = payload.new;
            void createNotification({
              title: "New onboarding request",
              description: `${String(row.organization_name ?? "An organization")} submitted an onboarding request.`,
              type: "onboarding",
              link: "/platform/onboarding",
            });
          }
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "organizations" }, () => {
        void queryClient.invalidateQueries({ queryKey: PLATFORM_DASHBOARD_QUERY_KEY });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, createNotification]);

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
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [recentTenants, tenantSearch]);

  const filteredOnboarding = useMemo(() => {
    if (onboardingFilter === "approved") return recentOnboarding.filter((r) => r.status === "approved");
    if (onboardingFilter === "self_serve") return recentOnboarding.filter((r) => r.setup_mode === "self_serve");
    if (onboardingFilter === "dns") return recentOnboarding.filter((r) => Boolean(r.custom_domain));
    return recentOnboarding;
  }, [onboardingFilter, recentOnboarding]);

  if (isLoading) {
    return (
      <PlatformRoute>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
          <SkeletonTable rows={6} columns={5} />
        </div>
      </PlatformRoute>
    );
  }

  return (
    <PlatformRoute>
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Control</p>
          <h2 className="mt-1 font-heading text-3xl font-bold tracking-tight text-foreground">Overview</h2>
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

          <Card className="rounded-[28px] border border-border bg-card shadow-sm">
            <CardHeader className="border-b border-border pb-5">
              <CardTitle className="text-2xl text-foreground">Customer Ops</CardTitle>
              <CardDescription>Open the dedicated customer module for plans, domains, and tenant footprint.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="rounded-2xl border border-border bg-muted/40 p-5">
                <p className="text-sm leading-7 text-muted-foreground">
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
