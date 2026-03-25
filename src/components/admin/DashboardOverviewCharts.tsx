import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SimpleBarChart, SimpleLegend, SimpleLineAreaChart } from "@/components/ui/simple-charts";
import { DollarSign, TrendingUp } from "lucide-react";

interface TestTrend {
  date: string;
  tests: number;
  revenue?: number;
}

interface RevenueTrend {
  date: string;
  revenue: number;
  paid: number;
  pending: number;
}

interface DashboardOverviewChartsProps {
  revenueTrends: RevenueTrend[];
  testTrends: TestTrend[];
}

export default function DashboardOverviewCharts({ revenueTrends, testTrends }: DashboardOverviewChartsProps) {
  const revenueSeries = [
    {
      key: "revenue",
      color: "#10B981",
      fill: "rgba(16, 185, 129, 0.18)",
      titlePrefix: "Billed",
      data: revenueTrends.map((item) => ({ label: item.date, value: item.revenue })),
    },
    {
      key: "paid",
      color: "#3B82F6",
      fill: "rgba(59, 130, 246, 0.18)",
      titlePrefix: "Paid",
      data: revenueTrends.map((item) => ({ label: item.date, value: item.paid })),
    },
  ];

  return (
    <>
      <Card className="lg:col-span-2 shadow-md border-0">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                Revenue Trends
              </CardTitle>
              <CardDescription>Revenue over the last 7 days</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <SimpleLineAreaChart
            className="h-[250px] min-w-0"
            series={revenueSeries}
            yTickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
          />
          <SimpleLegend
            className="mt-4"
            items={[
              { label: "Billed", color: "#10B981" },
              { label: "Paid", color: "#3B82F6" },
            ]}
          />
        </CardContent>
      </Card>

      <Card className="shadow-md border-0">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Test Activity
              </CardTitle>
              <CardDescription>Tests conducted over the last 7 days</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <SimpleBarChart
            className="h-[250px] min-w-0"
            data={testTrends.map((item) => ({ label: item.date, value: item.tests }))}
            color="hsl(var(--primary))"
          />
        </CardContent>
      </Card>
    </>
  );
}
