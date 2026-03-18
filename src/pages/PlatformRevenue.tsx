import { useEffect, useMemo, useState } from "react";
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
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

const PLAN_PRICES: Record<string, number> = {
  starter: 2999,
  growth: 5999,
  premium: 9999,
};

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  premium: "Premium",
};

const planClass: Record<string, string> = {
  starter: "border-slate-200 bg-slate-50 text-slate-600",
  growth: "border-indigo-200 bg-indigo-50 text-indigo-700",
  premium: "border-violet-200 bg-violet-50 text-violet-700",
};

type OrgRevenueRow = {
  id: string;
  organizationName: string;
  plan: "starter" | "growth" | "premium";
  status: string;
  provisionedAt: string | null;
  mrr: number;
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

    setRows(
      (data || []).map((row: any) => ({
        id: row.id,
        organizationName: row.organization_name,
        plan: row.selected_plan || "starter",
        status: row.status,
        provisionedAt: row.provisioned_at,
        mrr: PLAN_PRICES[row.selected_plan] ?? 0,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const totalMRR = useMemo(
    () => rows.reduce((sum, r) => sum + r.mrr, 0),
    [rows],
  );
  const approvedCount = useMemo(
    () => rows.filter((r) => r.status === "approved").length,
    [rows],
  );

  const chartData = useMemo(() => {
    const byPlan: Record<string, { count: number; revenue: number }> = {};
    for (const r of rows) {
      if (!byPlan[r.plan]) byPlan[r.plan] = { count: 0, revenue: 0 };
      byPlan[r.plan].count++;
      byPlan[r.plan].revenue += r.mrr;
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
            <h2 className="text-xl font-semibold text-slate-900">Revenue</h2>
            <p className="text-sm text-slate-500">
              MRR estimates based on active tenants and plan pricing.
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
              <CardTitle className="text-sm font-medium text-slate-500">
                Estimated MRR
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-slate-900">
                ₹{totalMRR.toLocaleString("en-IN")}
              </p>
              <p className="mt-1 text-xs text-slate-400">Based on plan tier prices</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                Active Tenants
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-slate-900">{approvedCount}</p>
              <p className="mt-1 text-xs text-slate-400">Provisioned &amp; approved</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Est. ARR</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-slate-900">
                ₹{(totalMRR * 12).toLocaleString("en-IN")}
              </p>
              <p className="mt-1 text-xs text-slate-400">MRR × 12</p>
            </CardContent>
          </Card>
        </div>

        {/* Bar chart */}
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            By Plan
          </p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">Revenue by Plan Tier</h3>
          {loading ? (
            <div className="flex h-52 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="mt-5 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 4, right: 4, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
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
                    tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(value: number) => [
                      `₹${value.toLocaleString("en-IN")}`,
                      "Revenue",
                    ]}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Bar dataKey="revenue" fill="#6366f1" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h3 className="text-base font-semibold text-slate-900">
              Tenant Revenue Breakdown
            </h3>
          </div>
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">MRR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-slate-400"
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
                              : "border-slate-200 bg-slate-50 text-slate-600"
                          }
                        >
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ₹{row.mrr.toLocaleString("en-IN")}/mo
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
