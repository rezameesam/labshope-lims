import { formatDistanceToNow } from "date-fns";
import { AlertCircle, HeartPulse, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAppDate, formatAppDateTimeWithMeridiem } from "@/lib/date";
import PatientActiveSessions from "@/components/patient/PatientActiveSessions";
import PasswordRequirements from "@/components/patient/PasswordRequirements";

const formatTimestamp = (value?: string | null) => {
  if (!value) return "Not available";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not available";
  return `${formatAppDateTimeWithMeridiem(parsed)} (${formatDistanceToNow(parsed, { addSuffix: true })})`;
};

interface PatientSecurityTabProps {
  patient: {
    last_password_change?: string | null;
    abha_number?: string | null;
    abha_address?: string | null;
    abdm_last_verified_at?: string | null;
    abdm_source?: string | null;
  };
  branding: { primaryPhone: string; email: string };
  passwordDialogOpen: boolean;
  setPasswordDialogOpen: (v: boolean) => void;
  currentPassword: string;
  setCurrentPassword: (v: string) => void;
  newPassword: string;
  setNewPassword: (v: string) => void;
  confirmPassword: string;
  setConfirmPassword: (v: string) => void;
  updatingPassword: boolean;
  onChangePassword: (e: React.FormEvent) => void;
}

export const PatientSecurityTab = ({
  patient,
  branding,
  passwordDialogOpen,
  setPasswordDialogOpen,
  currentPassword,
  setCurrentPassword,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  updatingPassword,
  onChangePassword,
}: PatientSecurityTabProps) => {
  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Security
          </CardTitle>
          <CardDescription>Key account controls and session protection.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-foreground">
            <p className="font-medium text-foreground">Last password change</p>
            <p className="mt-1">{formatTimestamp(patient.last_password_change)}</p>
          </div>
          <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4 text-sm text-primary">
            <p className="font-medium">Password standard</p>
            <p className="mt-2 leading-6">Use any password you prefer, as long as it has at least 6 characters.</p>
          </div>
          <div className="space-y-3 text-sm text-foreground">
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <p>After a password change, your other signed-in sessions are revoked automatically.</p>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <p>Use the patient portal only for the patient or an authorized caregiver.</p>
            </div>
          </div>
          <Button variant="outline" className="w-full gap-2" onClick={() => setPasswordDialogOpen(true)}>
            <Lock className="h-4 w-4" />
            Change Password
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle>Support and updates</CardTitle>
          <CardDescription>Contact the laboratory for record corrections or help with access.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-foreground">
          <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4 text-primary">
            <p className="font-medium">Need to update your personal details?</p>
            <p className="mt-2 leading-6 text-primary/90">
              You can update your address here. Contact our clinic team for phone number, email, or demographic changes.
            </p>
          </div>
          <p>{`Phone: ${branding.primaryPhone}`}</p>
          <p>{`Email: ${branding.email}`}</p>
        </CardContent>
      </Card>

      {(patient.abha_number || patient.abha_address) && (
        <Card className="rounded-3xl border border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HeartPulse className="h-5 w-5 text-emerald-600" />
              ABHA / Health ID
            </CardTitle>
            <CardDescription>Your Ayushman Bharat Health Account details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {patient.abha_number && (
              <div className="rounded-2xl border border-border bg-muted/40 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">ABHA Number</p>
                <p className="mt-1 font-mono font-medium text-foreground">{patient.abha_number}</p>
              </div>
            )}
            {patient.abha_address && (
              <div className="rounded-2xl border border-border bg-muted/40 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">ABHA Address</p>
                <p className="mt-1 font-mono font-medium text-foreground">{patient.abha_address}</p>
              </div>
            )}
            {patient.abdm_last_verified_at && (
              <div className="rounded-2xl border border-emerald-200 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 p-4">
                <p className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Last verified</p>
                <p className="mt-1 font-medium text-emerald-800 dark:text-emerald-300">
                  {formatAppDate(patient.abdm_last_verified_at)}
                  {patient.abdm_source && (
                    <span className="ml-2 text-xs capitalize text-emerald-600 dark:text-emerald-400">
                      via {patient.abdm_source.replace(/_/g, " ")}
                    </span>
                  )}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <PatientActiveSessions />

      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Change Password
            </DialogTitle>
            <DialogDescription>
              Update your portal password. Saving this will sign out your other active sessions.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                name="current_password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                name="new_password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                name="confirm_password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <PasswordRequirements password={newPassword} />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPasswordDialogOpen(false)}
                disabled={updatingPassword}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updatingPassword}>
                {updatingPassword ? "Updating..." : "Update Password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
