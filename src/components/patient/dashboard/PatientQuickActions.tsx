import { BarChart2, BookOpen, CreditCard, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface PatientQuickActionsProps {
  onBookTest: () => void;
  onViewResults: () => void;
  onBilling: () => void;
  mostRecentReportUrl: string | null;
}

const actions = (
  onBookTest: () => void,
  onViewResults: () => void,
  onBilling: () => void,
  onDownload: () => void,
) => [
  {
    key: "book",
    icon: BookOpen,
    label: "Book a Test",
    description: "Request a new lab test",
    accent: "border-blue-200 dark:border-blue-500/40 hover:border-blue-400 hover:bg-blue-50/60 dark:hover:bg-blue-500/10",
    iconWrapper: "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/40 text-blue-600 dark:text-blue-400",
    onClick: onBookTest,
  },
  {
    key: "results",
    icon: BarChart2,
    label: "My Results",
    description: "View all test reports",
    accent: "border-emerald-200 dark:border-emerald-500/40 hover:border-emerald-400 hover:bg-emerald-50/60 dark:hover:bg-emerald-500/10",
    iconWrapper: "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
    onClick: onViewResults,
  },
  {
    key: "billing",
    icon: CreditCard,
    label: "Billing",
    description: "Invoices & payments",
    accent: "border-violet-200 dark:border-violet-500/40 hover:border-violet-400 hover:bg-violet-50/60 dark:hover:bg-violet-500/10",
    iconWrapper: "bg-violet-50 dark:bg-violet-500/10 border-violet-200 dark:border-violet-500/40 text-violet-600 dark:text-violet-400",
    onClick: onBilling,
  },
  {
    key: "download",
    icon: Download,
    label: "Download Report",
    description: "Latest report PDF",
    accent: "border-amber-200 dark:border-amber-500/40 hover:border-amber-400 hover:bg-amber-50/60 dark:hover:bg-amber-500/10",
    iconWrapper: "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/40 text-amber-600 dark:text-amber-400",
    onClick: onDownload,
  },
];

export const PatientQuickActions = ({
  onBookTest,
  onViewResults,
  onBilling,
  mostRecentReportUrl,
}: PatientQuickActionsProps) => {
  const handleDownload = () => {
    if (mostRecentReportUrl) {
      window.open(mostRecentReportUrl, "_blank");
    } else {
      onViewResults();
    }
  };

  const items = actions(onBookTest, onViewResults, onBilling, handleDownload);

  return (
    <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map(({ key, icon: Icon, label, description, accent, iconWrapper, onClick }) => (
        <Card
          key={key}
          onClick={onClick}
          className={`cursor-pointer rounded-3xl border bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${accent}`}
        >
          <CardContent className="flex flex-col items-start gap-3 p-4 sm:p-5">
            <div className={`rounded-2xl border p-2.5 ${iconWrapper}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
};
