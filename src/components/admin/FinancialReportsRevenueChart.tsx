import { SimpleLegend, SimpleLineAreaChart } from "@/components/ui/simple-charts";

interface DailyRevenue {
  date: string;
  billed: number;
  paid: number;
  pending: number;
}

interface FinancialReportsRevenueChartProps {
  data: DailyRevenue[];
}

export default function FinancialReportsRevenueChart({ data }: FinancialReportsRevenueChartProps) {
  const series = [
    {
      key: "billed",
      color: "#10B981",
      fill: "rgba(16, 185, 129, 0.18)",
      titlePrefix: "Billed",
      data: data.map((item) => ({ label: item.date, value: item.billed })),
    },
    {
      key: "paid",
      color: "#3B82F6",
      fill: "rgba(59, 130, 246, 0.18)",
      titlePrefix: "Paid",
      data: data.map((item) => ({ label: item.date, value: item.paid })),
    },
  ];

  return (
    <>
      <SimpleLineAreaChart
        className="h-[300px] min-w-0"
        series={series}
        yTickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
      />
      <SimpleLegend
        className="mt-4"
        items={[
          { label: "Billed", color: "#10B981" },
          { label: "Paid", color: "#3B82F6" },
        ]}
      />
    </>
  );
}
