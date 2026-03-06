import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  FileText,
  HeartPulse,
  Loader2,
  LockKeyhole,
  Phone,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePatientAuth } from "@/hooks/usePatientAuth";
import logo from "@/assets/logo.png";
import { toast } from "sonner";
import Turnstile from "@/components/ui/turnstile";
import PasswordRequirements from "@/components/patient/PasswordRequirements";
import { validatePatientPassword } from "@/lib/patientSecurity";

const PatientAuth = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading, login, setPassword, requiresPasswordReset, requestPasswordReset } = usePatientAuth();
  const [step, setStep] = useState<"login" | "reset">("login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPasswordInput] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [lastLoginPassword, setLastLoginPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [loginCaptchaToken, setLoginCaptchaToken] = useState("");
  const [resetCaptchaToken, setResetCaptchaToken] = useState("");
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate("/patient/dashboard");
    }
  }, [loading, isAuthenticated, navigate]);

  useEffect(() => {
    if (requiresPasswordReset) {
      setStep("reset");
    }
  }, [requiresPasswordReset]);

  const passwordValidationMessage = useMemo(() => validatePatientPassword(newPassword), [newPassword]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      toast.error("Please enter your login details");
      return;
    }

    if (!loginCaptchaToken) {
      toast.error("Please complete the security check");
      return;
    }

    setIsLoading(true);
    try {
      const { error, passwordResetRequired } = await login(identifier.trim(), password, loginCaptchaToken);

      if (error) {
        toast.error(error.message);
        return;
      }

      if (passwordResetRequired) {
        setLastLoginPassword(password);
        setStep("reset");
        toast.success("Please set a new password to continue");
        return;
      }

      toast.success("Welcome back");
      navigate("/patient/dashboard");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    const current = lastLoginPassword || currentPassword;
    if (!current) {
      toast.error("Please enter your current password");
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

    setIsLoading(true);
    try {
      const { error } = await setPassword(current, newPassword);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Password updated successfully");
      navigate("/patient/dashboard");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!resetIdentifier.trim()) {
      toast.error("Please enter your email, phone, or patient ID");
      return;
    }

    if (!resetCaptchaToken) {
      toast.error("Please complete the security check");
      return;
    }

    setResetLoading(true);
    const { error } = await requestPasswordReset(resetIdentifier.trim(), resetCaptchaToken);
    setResetLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("If an account exists, a reset link has been sent.");
    setResetDialogOpen(false);
    setResetIdentifier("");
    setResetCaptchaToken("");
  };

  const highlights = [
    {
      icon: FileText,
      title: "Reports in one place",
      description: "Access your test history, PDFs, and billing records from one verified account.",
    },
    {
      icon: HeartPulse,
      title: "Health journey tracking",
      description: "Review current tests, past history, and payment status without calling the front desk.",
    },
    {
      icon: ShieldCheck,
      title: "Security controls",
      description: "Protected sign-in, password reset verification, and session management for your account.",
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-subtle-gradient flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-subtle-gradient flex">
      <section className="hidden lg:flex lg:w-[56%] bg-hero-gradient p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

        <div className="relative z-10 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3">
            <img src={logo} alt="IRM Clinical Laboratory" className="h-12 w-12" />
            <div>
              <h1 className="text-lg font-heading font-bold text-primary-foreground">IRM Clinical</h1>
              <p className="text-xs text-primary-foreground/70">Patient Portal</p>
            </div>
          </Link>
          <div className="rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-2 text-xs text-primary-foreground/90 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Verified portal access
          </div>
        </div>

        <div className="relative z-10 mt-12 space-y-8">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-2 text-sm text-primary-foreground">
              <Sparkles className="h-4 w-4" />
              Professional patient access, billing, and security controls
            </div>
            <h1 className="max-w-2xl font-heading text-4xl font-bold tracking-tight text-primary-foreground sm:text-5xl">
              A patient portal that feels clinical, clear, and trustworthy.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-primary-foreground/80 sm:text-lg">
              Review reports, monitor pending tests, manage billing, and control your account security from one standard patient portal.
            </p>
          </motion.div>

          <div className="grid gap-4 md:grid-cols-3">
            {highlights.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.1 + index * 0.08 }}
                className="rounded-2xl border border-primary-foreground/15 bg-primary-foreground/10 p-5 backdrop-blur"
              >
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-foreground/15">
                  <item.icon className="h-5 w-5 text-primary-foreground" />
                </div>
                <p className="font-medium text-primary-foreground">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-primary-foreground/75">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex flex-wrap gap-3 text-sm text-primary-foreground/80">
          <div className="rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-2">Secure reset verification</div>
          <div className="rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-2">Session visibility</div>
          <div className="rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-2">Standard password policy</div>
        </div>
      </section>

      <section className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-lg">
          <div className="lg:hidden mb-8 text-center">
            <Link to="/" className="inline-flex items-center gap-3">
              <img src={logo} alt="IRM Clinical Laboratory" className="h-14 w-14" />
              <div className="text-left">
                <h1 className="text-lg font-heading font-bold text-clinical-navy">IRM Clinical</h1>
                <p className="text-xs text-muted-foreground">Patient Portal</p>
              </div>
            </Link>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="rounded-[28px] border border-border bg-card p-7 shadow-xl sm:p-8"
            >
              {step === "login" ? (
                <>
                  <div className="mb-8">
                    <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Phone className="h-6 w-6" />
                    </div>
                    <h2 className="font-heading text-3xl font-semibold text-clinical-navy">Patient sign in</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Use your patient ID, phone number, email, or username to access the portal.
                    </p>
                  </div>

                  <form onSubmit={handleLogin} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="identifier">Login ID</Label>
                      <Input
                        id="identifier"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="Patient ID, phone, email, or username"
                        autoComplete="username"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        autoComplete="current-password"
                        required
                      />
                    </div>

                    {turnstileSiteKey && (
                      <Turnstile
                        siteKey={turnstileSiteKey}
                        action="patient_login"
                        onVerify={setLoginCaptchaToken}
                        onExpire={() => setLoginCaptchaToken("")}
                      />
                    )}

                    <Button type="submit" className="h-12 w-full" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        <>
                          Access Portal
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </form>

                  <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6 text-sm text-muted-foreground">
                    <button
                      type="button"
                      className="text-left text-primary transition hover:underline"
                      onClick={() => setResetDialogOpen(true)}
                    >
                      Forgot your password?
                    </button>
                    <p>
                      Need help accessing your account? Contact the laboratory front desk for identity verification.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-8">
                    <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <LockKeyhole className="h-6 w-6" />
                    </div>
                    <h2 className="font-heading text-3xl font-semibold text-clinical-navy">Set a stronger password</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      This account needs a new password before portal access continues.
                    </p>
                  </div>

                  <form onSubmit={handleResetPassword} className="space-y-5">
                    {!lastLoginPassword && (
                      <div className="space-y-2">
                        <Label htmlFor="currentPassword">Current Password</Label>
                        <Input
                          id="currentPassword"
                          type="password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          autoComplete="current-password"
                          required
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="newPassword">New Password</Label>
                      <Input
                        id="newPassword"
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
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                      />
                    </div>

                    <PasswordRequirements password={newPassword} />

                    <Button type="submit" className="h-12 w-full" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Updating password...
                        </>
                      ) : (
                        "Save and continue"
                      )}
                    </Button>
                  </form>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset patient password</DialogTitle>
            <DialogDescription>
              Enter your patient ID, phone number, or email. If a matching account exists, we will send a secure reset link.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRequestReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resetIdentifier">Patient account identifier</Label>
              <Input
                id="resetIdentifier"
                value={resetIdentifier}
                onChange={(e) => setResetIdentifier(e.target.value)}
                placeholder="Patient ID, phone, or email"
                required
              />
            </div>

            {turnstileSiteKey && (
              <Turnstile
                siteKey={turnstileSiteKey}
                action="patient_request_reset"
                onVerify={setResetCaptchaToken}
                onExpire={() => setResetCaptchaToken("")}
              />
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetDialogOpen(false)} disabled={resetLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={resetLoading}>
                {resetLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending link...
                  </>
                ) : (
                  "Send reset link"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PatientAuth;
