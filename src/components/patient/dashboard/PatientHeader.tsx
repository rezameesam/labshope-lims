import { Droplet, LogOut, Mail, Phone } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPhoneForDisplay } from "@/lib/phone";
import logo from "@/assets/logo.png";

interface PatientHeaderProps {
  branding: { logoUrl?: string; displayName: string };
  patient: {
    full_name: string;
    phone: string;
    email?: string | null;
    blood_group?: string | null;
    abha_number?: string | null;
  };
  lastVisitDate?: string | null;
  onSignOut: () => void;
}

export const PatientHeader = ({ branding, patient, lastVisitDate, onSignOut }: PatientHeaderProps) => {
  const initials = patient.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        {/* Logo + lab */}
        <div className="flex items-center gap-3">
          <img
            src={branding.logoUrl || logo}
            alt={branding.displayName}
            className="h-10 w-10 rounded-2xl border border-border bg-card p-1"
          />
          <div>
            <h1 className="font-heading text-base font-semibold leading-tight text-clinical-navy">Patient Portal</h1>
            <p className="text-xs text-muted-foreground">{branding.displayName}</p>
          </div>
        </div>

        {/* Patient info — desktop */}
        <div className="hidden items-center gap-3 lg:flex">
          <Avatar className="h-9 w-9 border border-border bg-muted">
            <AvatarFallback className="text-sm font-semibold text-clinical-navy">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-semibold leading-tight text-clinical-navy">{patient.full_name}</p>
            <div className="mt-0.5 flex items-center gap-3">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Phone className="h-3 w-3" />
                {formatPhoneForDisplay(patient.phone)}
              </span>
              {patient.email && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  {patient.email}
                </span>
              )}
            </div>
          </div>
          {patient.blood_group && (
            <Badge variant="outline" className="gap-1 border-rose-200 bg-rose-50 text-rose-700">
              <Droplet className="h-3 w-3" />
              {patient.blood_group}
            </Badge>
          )}
          {patient.abha_number && (
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 font-mono text-xs text-emerald-700">
              ABHA
            </Badge>
          )}
          {lastVisitDate && (
            <span className="text-xs text-muted-foreground">Last visit: {lastVisitDate}</span>
          )}
        </div>

        {/* Right: mobile phone + tablet avatar + logout */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground lg:hidden">
            <Phone className="h-3 w-3" />
            <span>{formatPhoneForDisplay(patient.phone)}</span>
          </div>
          <Button variant="outline" size="sm" onClick={onSignOut} className="gap-2">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </div>
    </header>
  );
};
