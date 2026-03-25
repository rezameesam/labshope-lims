import { SimpleBarChart } from "@/components/ui/simple-charts";

interface PlatformRevenueChartDatum {
  plan: string;
  revenue: number;
  count: number;
}

interface PlatformRevenueChartProps {
  data: PlatformRevenueChartDatum[];
}

export default function PlatformRevenueChart({ data }: PlatformRevenueChartProps) {
  return (
    <SimpleBarChart
      className="mt-5 h-52"
      data={data.map((item) => ({
        label: item.plan,
        value: item.revenue,
        title: `${item.plan}: ₹${item.revenue.toLocaleString("en-IN")} from ${item.count} org(s)`,
      }))}
      color="#6366f1"
      yTickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
    />
  );
}
