import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { Activity, Book, CheckCircle2, Clock, Download, FileText, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatAppDateTimeWithMeridiem } from "@/lib/date";
import { formatPhoneForDisplay } from "@/lib/phone";

interface PatientWelcomeBannerProps {
  patientName: string;
  patientId: string;
  phone: string;
  lastPasswordChange: string | null | undefined;
  completedCount: number;
  pendingCount: number;
  outstandingAmount: number;
  checkingDues: boolean;
  onViewResults: () => void;
  onBookTest: () => void;
  onUpdateProfile: () => void;
  onDownloadReports: () => void;
}

const formatTimestamp = (value?: string | null) => {
  if (!value) return "Not available";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not available";
  return `${formatAppDateTimeWithMeridiem(parsed)} (${formatDistanceToNow(parsed, { addSuffix: true })})`;
};

export const PatientWelcomeBanner = ({
  patientName,
  patientId,
  phone,
  lastPasswordChange,
  completedCount,
  pendingCount,
  outstandingAmount,
  checkingDues,
  onViewResults,
  onBookTest,
  onUpdateProfile,
  onDownloadReports,
}: PatientWelcomeBannerProps) => {
  const initials = patientName
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
      <Card className="overflow-hidden rounded-[28px] border border-primary-foreground/10 bg-hero-gradient text-primary-foreground shadow-sm">
        <CardContent className="grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr] lg:p-8">
          <div>
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14 border border-white/10 bg-white/10">
                <AvatarFallback className="bg-white/90 text-lg font-semibold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="font-heading text-2xl font-semibold text-primary-foreground">{patientName}</h2>
                <p className="mt-1 text-sm text-primary-foreground/80">
                  Patient ID {patientId} • {formatPhoneForDisplay(phone)}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                <p className="text-xs uppercase tracking-wide text-primary-foreground/70">Reports ready</p>
                <p className="mt-2 text-2xl font-semibold text-primary-foreground">{completedCount}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                <p className="text-xs uppercase tracking-wide text-primary-foreground/70">In progress</p>
                <p className="mt-2 text-2xl font-semibold text-primary-foreground">{pendingCount}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                <p className="text-xs uppercase tracking-wide text-primary-foreground/70">Outstanding</p>
                <p className="mt-2 text-2xl font-semibold text-primary-foreground">
                  {checkingDues ? "Checking..." : `Rs. ${outstandingAmount.toFixed(2)}`}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-4 rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur-sm">
            <div>
              <p className="text-sm font-medium text-primary-foreground">Quick actions</p>
              <p className="mt-1 text-sm text-primary-foreground/75">
                Start with reports, then use billing or account settings only when needed.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <Button
                className="w-full justify-start gap-2 bg-white text-clinical-navy hover:bg-white/90"
                onClick={onViewResults}
              >
                <FileText className="h-4 w-4 shrink-0" />
                View Results
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-2 border-white/30 bg-transparent text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
                onClick={onDownloadReports}
              >
                <Download className="h-4 w-4 shrink-0" />
                Download Reports
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-2 border-white/30 bg-transparent text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
                onClick={onBookTest}
              >
                <Book className="h-4 w-4 shrink-0" />
                Book Test
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-2 border-white/30 bg-transparent text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
                onClick={onUpdateProfile}
              >
                <User className="h-4 w-4 shrink-0" />
                Update Profile
              </Button>
            </div>
            <div className="text-xs text-primary-foreground/70">
              Last password change: {formatTimestamp(lastPasswordChange)}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.section>
  );
};
