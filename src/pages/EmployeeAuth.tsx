import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Mail, Lock, ArrowRight, Shield, Users, Eye, EyeOff } from "lucide-react";
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
import logo from "@/assets/logo.png";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import Turnstile from "@/components/ui/turnstile";
import { useOrganization } from "@/contexts/OrganizationContext";
import { getWebsiteHostname } from "@/lib/branding";
import { usePublicPageMode } from "@/hooks/usePublicPageMode";
import PlatformAccessPage from "@/components/platform/PlatformAccessPage";
import InvalidTenantPage from "@/components/platform/InvalidTenantPage";

const EmployeeAuth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const {
    signIn,
    verifyTwoFactor,
    user,
    loading: authLoading,
    isStaff,
    isCollector,
    staffPasswordResetRequired,
  } = useAuth();
  const { branding } = useOrganization();
  const { loading: publicModeLoading, platformMode, invalidTenantHost, hostname } = usePublicPageMode();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [forgotDialogOpen, setForgotDialogOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [twoFactorDialogOpen, setTwoFactorDialogOpen] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [pendingChallengeId, setPendingChallengeId] = useState<string | null>(null);
  const [pendingMaskedEmail, setPendingMaskedEmail] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState("");
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
  const staffEmailPlaceholder = `staff@${getWebsiteHostname(branding.website)}`;
  const requestedNext = searchParams.get("next");
  const platformAdminLoginMode =
    location.pathname === "/platform/login" || searchParams.get("platform") === "1";
  const getResetPath = (firstLoginFlow?: string | null, fallbackCollector = false) => {
    const nextPath =
      firstLoginFlow === "self_serve_owner"
        ? "/admin?tab=quick-setup&onboarding=1"
        : fallbackCollector
          ? "/collector"
          : "/admin";
    return `/staff/reset-password?first_login=1&next=${encodeURIComponent(nextPath)}`;
  };

  useEffect(() => {
    if (!authLoading && user && isStaff) {
      if (staffPasswordResetRequired) {
        navigate(getResetPath(String(user.user_metadata?.first_login_flow || "")), { replace: true });
        return;
      }

      // Redirect collectors to collector dashboard, others to admin dashboard
      navigate(
        requestedNext || (platformAdminLoginMode ? "/platform" : isCollector ? "/collector" : "/admin"),
        { replace: true }
      );
    }
  }, [user, authLoading, isStaff, isCollector, navigate, platformAdminLoginMode, staffPasswordResetRequired, requestedNext]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }

    if (!captchaToken) {
      toast.error("Please complete the security check");
      return;
    }

    setIsLoading(true);
    const result = await signIn(
      email.trim(),
      password,
      captchaToken,
    );
    const {
      error,
      isStaff: signedInStaff,
      isCollector: signedInCollector,
      requiresPasswordReset,
      firstLoginFlow,
      requiresTwoFactor,
      challengeId,
      maskedEmail,
    } = result;
    setIsLoading(false);

    if (error) {
      if (error.message.includes("Invalid login credentials")) {
        toast.error("Invalid email or password");
      } else {
        toast.error(error.message);
      }
      return;
    }

    if (requiresTwoFactor) {
      setPendingChallengeId(challengeId || null);
      setPendingMaskedEmail(maskedEmail || email.trim());
      setTwoFactorCode("");
      setTwoFactorDialogOpen(true);
      toast.info("Enter the verification code sent to your email.");
      return;
    }

    toast.success("Signed in successfully!");
    if (signedInStaff) {
      navigate(
        requiresPasswordReset
          ? getResetPath(firstLoginFlow, signedInCollector)
          : requestedNext || (platformAdminLoginMode ? "/platform" : signedInCollector ? "/collector" : "/admin")
      );
    } else {
      toast.error("Your account does not have staff access.");
    }
  };

  const handleVerifyTwoFactor = async () => {
    if (!pendingChallengeId) {
      toast.error("Two-factor challenge is missing. Please sign in again.");
      setTwoFactorDialogOpen(false);
      return;
    }

    if (!/^\d{6}$/.test(twoFactorCode.trim())) {
      toast.error("Enter the 6-digit code from your email.");
      return;
    }

    setTwoFactorLoading(true);
    const {
      error,
      isStaff: verifiedStaff,
      isCollector: verifiedCollector,
      requiresPasswordReset,
      firstLoginFlow,
    } = await verifyTwoFactor(email.trim(), password, pendingChallengeId, twoFactorCode.trim());
    setTwoFactorLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setTwoFactorDialogOpen(false);
    setPendingChallengeId(null);
    setPendingMaskedEmail(null);
    setTwoFactorCode("");

    toast.success("Signed in successfully!");
    if (verifiedStaff) {
      navigate(
        requiresPasswordReset
          ? getResetPath(firstLoginFlow, verifiedCollector)
          : requestedNext || (platformAdminLoginMode ? "/platform" : verifiedCollector ? "/collector" : "/admin")
      );
    } else {
      toast.error("Your account does not have staff access.");
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      toast.error("Please enter your email address");
      return;
    }

    setForgotLoading(true);
    try {
      const redirectTo = `${window.location.origin}/staff/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo,
      });

      if (error) {
        throw error;
      }

      toast.success("Password reset link sent. Please check your email.");
      setForgotDialogOpen(false);
    } catch (error: any) {
      toast.error(error?.message || "Failed to send reset link");
    } finally {
      setForgotLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-subtle-gradient">
        <div className="animate-pulse text-clinical-navy">Loading...</div>
      </div>
    );
  }

  if (publicModeLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-subtle-gradient">
        <div className="animate-pulse text-clinical-navy">Loading...</div>
      </div>
    );
  }

  if (invalidTenantHost) {
    return <InvalidTenantPage hostname={hostname} />;
  }

  if (platformMode && !platformAdminLoginMode) {
    return (
      <PlatformAccessPage
        eyebrow="Staff Access"
        title="Staff access is available from each lab’s own workspace domain."
        description="The root site is the product website. Laboratory admins, collectors, and staff should sign in through their organization’s branded domain so access, permissions, and data stay tenant-specific."
        primaryCtaLabel="Book Demo"
        primaryCtaTo="/book-test"
        secondaryCtaLabel="Patient Portal"
        secondaryCtaTo="/auth/patient"
        helperTitle="Looking for your staff workspace?"
        helperBody="Use the URL shared by your lab administrator. Staff login, role checks, password resets, and dashboard access are all resolved from the organization domain."
      />
    );
  }

  return (
    <div className="min-h-screen bg-subtle-gradient flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-clinical-navy p-12 flex-col justify-between">
        <Link to="/" className="flex items-center gap-3">
          <img src={branding.logoUrl || logo} alt={branding.displayName} className="h-12 w-12" />
          <div>
            <h1 className="text-lg font-heading font-bold text-primary-foreground">
              {branding.shortName}
            </h1>
            <p className="text-xs text-primary-foreground/70">{branding.secondaryLabel}</p>
          </div>
        </Link>

        <div>
          <h2 className="text-4xl font-heading font-bold text-primary-foreground mb-4">
            Staff Portal
          </h2>
          <p className="text-primary-foreground/80 text-lg max-w-md">
            Access the laboratory management system to manage patient records, 
            test results, and appointments.
          </p>
          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-3 text-primary-foreground/80">
              <Shield className="h-5 w-5" />
              <span>Secure Staff Access</span>
            </div>
            <div className="flex items-center gap-3 text-primary-foreground/80">
              <Users className="h-5 w-5" />
              <span>Lab Management System</span>
            </div>
          </div>
        </div>

        <p className="text-primary-foreground/60 text-sm">
          © {new Date().getFullYear()} {branding.displayName}
        </p>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden mb-8 text-center">
            <Link to="/" className="inline-flex items-center gap-3">
              <img src={branding.logoUrl || logo} alt={branding.displayName} className="h-14 w-14" />
              <div className="text-left">
                <h1 className="text-lg font-heading font-bold text-clinical-navy">
                  {branding.shortName}
                </h1>
                <p className="text-xs text-muted-foreground">{branding.secondaryLabel}</p>
              </div>
            </Link>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-card rounded-2xl p-8 shadow-xl border border-border"
          >
            <div className="mb-8">
              <h2 className="text-2xl font-heading font-bold text-foreground mb-2">
                Staff Login
              </h2>
              <p className="text-muted-foreground">
                {platformAdminLoginMode ? "Sign in to the platform admin portal" : "Sign in with your staff credentials"}
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6" autoComplete="on">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    name="password"
                    autoComplete="current-password"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end">
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => {
                    setForgotEmail(email);
                    setForgotDialogOpen(true);
                  }}
                >
                  Forgot password?
                </button>
              </div>

              {turnstileSiteKey && (
                <Turnstile
                  siteKey={turnstileSiteKey}
                  action="employee_login"
                  onVerify={setCaptchaToken}
                  onExpire={() => setCaptchaToken("")}
                />
              )}

              <Button
                type="submit"
                variant="default"
                size="lg"
                className="w-full bg-clinical-navy hover:bg-clinical-navy/90"
                disabled={isLoading}
              >
                {isLoading ? "Signing in..." : "Sign In"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-border text-center">
              <p className="text-sm text-muted-foreground">
                Are you a patient?{" "}
                <Link to="/auth/patient" className="text-primary hover:underline">
                  Patient Login
                </Link>
              </p>
            </div>
          </motion.div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link to="/" className="hover:text-primary transition-colors">
              ← Back to Home
            </Link>
          </p>
        </div>
      </div>

      <Dialog open={forgotDialogOpen} onOpenChange={setForgotDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Staff Password</DialogTitle>
            <DialogDescription>
              Enter your staff login email. We will send a password reset link.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="forgot-email">Email Address</Label>
            <Input
              id="forgot-email"
              name="forgot_email"
              type="email"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              placeholder={staffEmailPlaceholder}
              autoComplete="email"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setForgotDialogOpen(false)}
              disabled={forgotLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleForgotPassword} disabled={forgotLoading}>
              {forgotLoading ? "Sending..." : "Send Reset Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={twoFactorDialogOpen} onOpenChange={setTwoFactorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email verification required</DialogTitle>
            <DialogDescription>
              Enter the 6-digit code sent to {pendingMaskedEmail || "your email"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="staff-email-otp">Email OTP</Label>
            <Input
              id="staff-email-otp"
              inputMode="numeric"
              maxLength={6}
              value={twoFactorCode}
              onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="Enter 6-digit code"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTwoFactorDialogOpen(false)} disabled={twoFactorLoading}>
              Cancel
            </Button>
            <Button onClick={() => void handleVerifyTwoFactor()} disabled={twoFactorLoading}>
              {twoFactorLoading ? "Verifying..." : "Verify and Sign In"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmployeeAuth;
