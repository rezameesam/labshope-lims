import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPatientPasswordChecks } from "@/lib/patientSecurity";

interface PasswordRequirementsProps {
  password: string;
  className?: string;
}

const PasswordRequirements = ({ password, className }: PasswordRequirementsProps) => {
  const checks = getPatientPasswordChecks(password);

  return (
    <div className={cn("rounded-xl border border-border bg-muted/40 p-4", className)}>
      <p className="text-sm font-medium text-foreground">Password requirements</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {checks.map((check) => (
          <div
            key={check.key}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
              check.passed ? "bg-primary/10 text-primary" : "bg-background text-muted-foreground"
            )}
          >
            {check.passed ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <Circle className="h-4 w-4 shrink-0" />
            )}
            <span>{check.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PasswordRequirements;
