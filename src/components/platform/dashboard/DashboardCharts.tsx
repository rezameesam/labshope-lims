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

type LeadChartPoint = { date: string; leads: number };
type PlanChartPoint = { plan: string; count: number };

interface Props {
  leadsChartData: LeadChartPoint[];
  planChartData: PlanChartPoint[];
}

export const DashboardCharts = ({ leadsChartData, planChartData }: Props) => (
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
);
