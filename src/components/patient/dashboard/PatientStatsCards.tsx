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
      tone: "text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-500/10 border-cyan-200 dark:border-cyan-500/40",
    },
    {
      label: "Completed Reports",
      value: completedTests,
      icon: CheckCircle2,
      tone: "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/40",
    },
    {
      label: "Pending / Processing",
      value: pendingTests,
      icon: Clock,
      tone: "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/40",
    },
    {
      label: "Abnormal Results",
      value: abnormalTests,
      icon: Activity,
      tone: "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/40",
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
                <p className="mt-2 text-3xl font-semibold text-foreground">{card.value}</p>
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
