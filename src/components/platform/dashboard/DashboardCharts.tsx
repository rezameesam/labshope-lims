import { SimpleBarChart, SimpleLineAreaChart } from "@/components/ui/simple-charts";

type LeadChartPoint = { date: string; leads: number };
type PlanChartPoint = { plan: string; count: number };

interface Props {
  leadsChartData: LeadChartPoint[];
  planChartData: PlanChartPoint[];
}

export const DashboardCharts = ({ leadsChartData, planChartData }: Props) => (
  <div className="grid gap-6 lg:grid-cols-2">
    <div className="rounded-[28px] border border-border bg-card p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Trend</p>
      <h3 className="mt-1 text-lg font-semibold text-foreground">Leads - last 30 days</h3>
      <SimpleLineAreaChart
        className="mt-5 h-52 min-w-0"
        series={[
          {
            key: "leads",
            color: "#10b981",
            fill: "rgba(16, 185, 129, 0.18)",
            titlePrefix: "Leads",
            data: leadsChartData.map((item) => ({ label: item.date, value: item.leads })),
          },
        ]}
        yTickFormatter={(value) => `${Math.round(value)}`}
      />
    </div>

    <div className="rounded-[28px] border border-border bg-card p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Breakdown</p>
      <h3 className="mt-1 text-lg font-semibold text-foreground">Onboarding by plan</h3>
      <div className="mt-5 h-52">
        {planChartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            No onboarding data yet
          </div>
        ) : (
          <SimpleBarChart
            className="h-full min-w-0"
            data={planChartData.map((item) => ({
              label: item.plan,
              value: item.count,
              title: `${item.plan}: ${item.count}`,
            }))}
            color="#6366f1"
            yTickFormatter={(value) => `${Math.round(value)}`}
          />
        )}
      </div>
    </div>
  </div>
);
