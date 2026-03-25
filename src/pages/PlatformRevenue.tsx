import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import PlatformRoute from "@/components/platform/PlatformRoute";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { PLAN_PRICES, resolvePlanTier, type PlanTier } from "@/lib/planLimits";

const PlatformRevenueChart = lazy(() => import("@/components/platform/PlatformRevenueChart"));

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  premium: "Premium",
};

const planClass: Record<string, string> = {
  starter: "border-border bg-muted/40 text-muted-foreground",
  growth: "border-indigo-200 bg-indigo-50 text-indigo-700",
  premium: "border-violet-200 bg-violet-50 text-violet-700",
};

type OrgRevenueRow = {
  id: string;
  organizationName: string;
  plan: PlanTier;
  status: string;
  provisionedAt: string | null;
  annualRevenue: number;
};

export default function PlatformRevenue() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<OrgRevenueRow[]>([]);

  const loadData = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("platform_onboarding_requests")
      .select(
        "id, organization_name, selected_plan, status, provisioned_at, provisioned_organization_id",
      )
      .not("provisioned_organization_id", "is", null)
      .order("provisioned_at", { ascending: false });

    if (error) {
      toast.error("Failed to load revenue data.");
      setLoading(false);
      return;
    }

    const rowsData = data || [];

    const orgIds = rowsData
      .map((row: any) => row.provisioned_organization_id)
      .filter(Boolean);

    let planTierByOrgId = new Map<string, PlanTier>();

    if (orgIds.length > 0) {
      const { data: settingsRows, error: settingsError } = await (supabase as any)
        .from("organization_settings")
        .select("organization_id, setting_value")
        .in("organization_id", orgIds)
        .eq("setting_key", "plan_tier");

      if (!settingsError && settingsRows) {
        for (const row of settingsRows as Array<{ organization_id: string; setting_value: string }>) {
          planTierByOrgId.set(row.organization_id, resolvePlanTier(row.setting_value));
        }
      }
    }

    setRows(
      rowsData.map((row: any) => {
        const resolvedPlan = planTierByOrgId.get(row.provisioned_organization_id) || resolvePlanTier(row.selected_plan);
        return {
          id: row.id,
          organizationName: row.organization_name,
          plan: resolvedPlan,
          status: row.status,
          provisionedAt: row.provisioned_at,
          annualRevenue: PLAN_PRICES[resolvedPlan] ?? 0,
        };
      }),
    );
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const totalARR = useMemo(
    () => rows.reduce((sum, r) => sum + r.annualRevenue, 0),
    [rows],
  );
  const totalMRR = useMemo(() => Math.round(totalARR / 12), [totalARR]);
  const approvedCount = useMemo(
    () => rows.filter((r) => r.status === "approved").length,
    [rows],
  );

  const chartData = useMemo(() => {
    const byPlan: Record<string, { count: number; revenue: number }> = {};
    for (const r of rows) {
      if (!byPlan[r.plan]) byPlan[r.plan] = { count: 0, revenue: 0 };
      byPlan[r.plan].count++;
      byPlan[r.plan].revenue += r.annualRevenue;
    }
    return Object.entries(byPlan).map(([plan, vals]) => ({
      plan: PLAN_LABELS[plan] || plan,
      revenue: vals.revenue,
      count: vals.count,
    }));
  }, [rows]);

  return (
    <PlatformRoute>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Revenue</h2>
            <p className="text-sm text-muted-foreground">
              Yearly subscription pricing model with derived MRR projections.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData()}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Estimated MRR
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-foreground">
                ₹{totalMRR.toLocaleString("en-IN")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Derived from yearly plans ÷ 12</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Tenants
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-foreground">{approvedCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">Provisioned &amp; approved</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Estimated ARR</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-foreground">
                ₹{totalARR.toLocaleString("en-IN")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Sum of yearly plan prices</p>
            </CardContent>
          </Card>
        </div>

        {/* Bar chart */}
        <div className="rounded-[28px] border border-border bg-card p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            By Plan
          </p>
          <h3 className="mt-1 text-lg font-semibold text-foreground">Revenue by Plan Tier</h3>
          {loading ? (
            <div className="flex h-52 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Suspense fallback={<div className="mt-5 h-52 animate-pulse rounded-lg bg-muted/40" />}>
              <PlatformRevenueChart data={chartData} />
            </Suspense>
          )}
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-[28px] border border-border bg-card shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h3 className="text-base font-semibold text-foreground">
              Tenant Revenue Breakdown
            </h3>
          </div>
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Plan Price (Yearly)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No provisioned tenants found.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">
                        {row.organizationName}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={planClass[row.plan] ?? ""}
                        >
                          {PLAN_LABELS[row.plan] || row.plan}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            row.status === "approved"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-border bg-muted/40 text-muted-foreground"
                          }
                        >
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ₹{row.annualRevenue.toLocaleString("en-IN")}/year
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </PlatformRoute>
  );
}
