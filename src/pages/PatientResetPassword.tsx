import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
import Turnstile from "@/components/ui/turnstile";
import PasswordRequirements from "@/components/patient/PasswordRequirements";
import { validatePatientPassword } from "@/lib/patientSecurity";
import { useOrganization } from "@/contexts/OrganizationContext";
import { usePublicPageMode } from "@/hooks/usePublicPageMode";
import PlatformResetPage from "@/components/platform/PlatformResetPage";
import InvalidTenantPage from "@/components/platform/InvalidTenantPage";

const PatientResetPassword = () => {
  const navigate = useNavigate();
  const { branding } = useOrganization();
  const { loading, platformMode, invalidTenantHost, hostname } = usePublicPageMode();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";

  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") || "";
  const passwordValidationMessage = useMemo(() => validatePatientPassword(newPassword), [newPassword]);

  if (loading) {
    return (
      <div className="min-h-screen bg-subtle-gradient flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (invalidTenantHost) {
    return <InvalidTenantPage hostname={hostname} />;
  }

  if (platformMode) {
    return (
      <PlatformResetPage
        eyebrow="Patient Password Reset"
        title="Patient password reset must be opened from the lab portal."
        description="Reset links are issued per laboratory organization. Open the reset email from your lab’s own portal domain to continue safely."
        loginLabel="Patient Portal Guidance"
        loginTo="/auth/patient"
      />
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      toast.error("Reset token is missing or invalid.");
      return;
    }

    if (passwordValidationMessage) {
      toast.error(passwordValidationMessage);
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (!captchaToken) {
      toast.error("Please complete the security check");
      return;
    }

    setIsLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/patient-reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          new_password: newPassword,
          turnstile_token: captchaToken,
          hostname: typeof window !== "undefined" ? window.location.hostname : null,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to reset password");
      }

      toast.success("Password reset successfully. Please sign in.");
      navigate("/auth/patient", { replace: true });
    } catch (error: any) {
      toast.error(error.message || "Failed to reset password");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-subtle-gradient flex items-center justify-center p-6">
      <div className="w-full max-w-6xl overflow-hidden rounded-[32px] border border-border bg-card shadow-xl lg:grid lg:grid-cols-[0.95fr_1.05fr]">
        <section className="hidden lg:flex bg-hero-gradient px-10 py-12 text-primary-foreground flex-col justify-between">
          <div>
            <div className="flex items-center gap-3">
              <img src={branding.logoUrl || logo} alt={branding.displayName} className="h-12 w-12" />
              <div>
                <p className="font-heading text-lg font-semibold">{branding.shortName}</p>
                <p className="text-xs text-primary-foreground/70">Patient Portal Security</p>
              </div>
            </div>

            <div className="mt-12 space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-2 text-sm text-primary-foreground">
                <ShieldCheck className="h-4 w-4" />
                Verified password reset flow
              </div>
              <h1 className="font-heading text-4xl font-bold tracking-tight">Create a new account password.</h1>
              <p className="max-w-xl text-base leading-7 text-primary-foreground/80">
                This secure reset link lets you create a fresh password for your patient account. It expires automatically.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-primary-foreground/15 bg-primary-foreground/10 p-5 text-sm text-primary-foreground/80">
            <p className="font-medium text-primary-foreground">Security notes</p>
            <p className="mt-2">Use a password you do not reuse anywhere else. Once updated, return to the patient portal and sign in normally.</p>
          </div>
        </section>

        <section className="flex items-center justify-center px-6 py-10 lg:px-10">
          <div className="w-full max-w-md">
            <div className="mb-6">
              <Link to="/auth/patient" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-primary">
                <ArrowLeft className="h-4 w-4" />
                Back to login
              </Link>
            </div>

            <div className="rounded-[28px] border border-border bg-card p-8 shadow-lg">
              <div className="mb-8">
                <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <LockKeyhole className="h-6 w-6" />
                </div>
                <h2 className="font-heading text-3xl font-semibold text-foreground">Reset password</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Create a new password with at least 6 characters.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
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

                {turnstileSiteKey && (
                  <Turnstile
                    siteKey={turnstileSiteKey}
                    action="patient_reset_password"
                    onVerify={setCaptchaToken}
                    onExpire={() => setCaptchaToken("")}
                  />
                )}

                <Button type="submit" className="h-12 w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Update Password"
                  )}
                </Button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default PatientResetPassword;
