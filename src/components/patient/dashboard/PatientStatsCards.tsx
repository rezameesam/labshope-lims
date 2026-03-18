import { motion } from "framer-motion";
import { Activity, CheckCircle2, Clock, FlaskConical } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface PatientStatsCardsProps {
  totalTests: number;
  completedTests: number;
  pendingTests: number;
  abnormalTests: number;
}

export const PatientStatsCards = ({
  totalTests,
  completedTests,
  pendingTests,
  abnormalTests,
}: PatientStatsCardsProps) => {
  const cards = [
    {
      label: "Total Tests",
      value: totalTests,
      icon: FlaskConical,
      tone: "text-cyan-700 bg-cyan-50 border-cyan-200",
    },
    {
      label: "Completed Reports",
      value: completedTests,
      icon: CheckCircle2,
      tone: "text-emerald-700 bg-emerald-50 border-emerald-200",
    },
    {
      label: "Pending / Processing",
      value: pendingTests,
      icon: Clock,
      tone: "text-amber-700 bg-amber-50 border-amber-200",
    },
    {
      label: "Abnormal Results",
      value: abnormalTests,
      icon: Activity,
      tone: "text-rose-700 bg-rose-50 border-rose-200",
    },
  ];

  return (
    <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card, index) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 * index }}
        >
          <Card className="rounded-3xl border border-border bg-card shadow-sm">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <p className="mt-2 text-3xl font-semibold text-clinical-navy">{card.value}</p>
              </div>
              <div className={`rounded-2xl border p-3 ${card.tone}`}>
                <card.icon className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </section>
  );
};
