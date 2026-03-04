import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { 
  Phone, 
  ArrowRight, 
  Shield, 
  FileText, 
  Clock, 
  HeartPulse,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { usePatientAuth } from "@/hooks/usePatientAuth";
import logo from "@/assets/logo.png";
import { toast } from "sonner";
import Turnstile from "@/components/ui/turnstile";

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

      toast.success("Welcome to your Patient Portal!");
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

    if (!newPassword || newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
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
    const { error } = await requestPasswordReset(
      resetIdentifier.trim(),
      `${window.location.origin}/patient/reset-password`,
      resetCaptchaToken
    );
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

  const features = [
    { icon: FileText, title: "View Reports", desc: "Access all your test results" },
    { icon: Clock, title: "Track Progress", desc: "Monitor your health history" },
    { icon: HeartPulse, title: "Health Insights", desc: "Get personalized health tips" },
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
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-hero-gradient p-12 flex-col justify-between relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
        
        <Link to="/" className="flex items-center gap-3 relative z-10">
          <img src={logo} alt="IRM Clinical Laboratory" className="h-12 w-12" />
          <div>
            <h1 className="text-lg font-heading font-bold text-primary-foreground">
              IRM Clinical
            </h1>
            <p className="text-xs text-primary-foreground/70">Laboratory</p>
          </div>
        </Link>

        <div className="relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl font-heading font-bold text-primary-foreground mb-4">
              Patient Portal
            </h2>
            <p className="text-primary-foreground/80 text-lg max-w-md mb-8">
              Access your test reports, track your health records, and manage your 
              health journey all in one secure place.
            </p>
          </motion.div>

          <div className="space-y-4">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
                className="flex items-center gap-4 bg-white/10 backdrop-blur-sm rounded-xl p-4"
              >
                <div className="h-12 w-12 rounded-lg bg-white/20 flex items-center justify-center">
                  <feature.icon className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="font-medium text-primary-foreground">{feature.title}</h3>
                  <p className="text-sm text-primary-foreground/70">{feature.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <Shield className="h-5 w-5 text-primary-foreground/60" />
          <p className="text-primary-foreground/60 text-sm">
            Your data is encrypted and secure
          </p>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden mb-8 text-center">
            <Link to="/" className="inline-flex items-center gap-3">
              <img src={logo} alt="IRM Clinical Laboratory" className="h-14 w-14" />
              <div className="text-left">
                <h1 className="text-lg font-heading font-bold text-foreground">
                  IRM Clinical
                </h1>
                <p className="text-xs text-muted-foreground">Laboratory</p>
              </div>
            </Link>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="bg-card rounded-2xl p-8 shadow-xl border border-border"
            >
              {step === "login" ? (
                <>
                  <div className="mb-8">
                    <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-primary/10 mb-4">
                      <Phone className="h-7 w-7 text-primary" />
                    </div>
                    <h2 className="text-2xl font-heading font-bold text-foreground mb-2">
                      Patient Login
                    </h2>
                    <p className="text-muted-foreground">
                      Sign in using your Patient ID, phone, email, or username.
                    </p>
                  </div>

                  <form onSubmit={handleLogin} className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="identifier">Login ID</Label>
                      <Input
                        id="identifier"
                        placeholder="Patient ID, phone, email, or username"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        className="h-12 text-lg"
                        required
                        autoComplete="username"
                      />
                      <p className="text-xs text-muted-foreground">
                        First-time password is your Patient ID.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        className="h-12 text-lg"
                        required
                        autoComplete="current-password"
                      />
                    </div>

                  {turnstileSiteKey && !resetDialogOpen && (
                    <Turnstile
                      siteKey={turnstileSiteKey}
                      action="patient_login"
                      onVerify={setLoginCaptchaToken}
                      onExpire={() => setLoginCaptchaToken("")}
                    />
                  )}

                    <Button
                      type="submit"
                      variant="clinical"
                      size="lg"
                      className="w-full h-12"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        <>
                          Sign In
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </>
                      )}
                    </Button>

                    <div className="text-center">
                      <button
                        type="button"
                        className="text-sm text-primary hover:underline"
                        onClick={() => setResetDialogOpen(true)}
                      >
                        Forgot password?
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <div className="mb-8">
                    <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-primary/10 mb-4">
                      <Phone className="h-7 w-7 text-primary" />
                    </div>
                    <h2 className="text-2xl font-heading font-bold text-foreground mb-2">
                      Set New Password
                    </h2>
                    <p className="text-muted-foreground">
                      Update your password to complete first-time login.
                    </p>
                  </div>

                  <form onSubmit={handleResetPassword} className="space-y-6">
                    {!lastLoginPassword && (
                      <div className="space-y-2">
                        <Label htmlFor="currentPassword">Current Password</Label>
                        <Input
                          id="currentPassword"
                          type="password"
                          placeholder="Enter current password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="h-12 text-lg"
                          required
                          autoComplete="current-password"
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="newPassword">New Password</Label>
                      <Input
                        id="newPassword"
                        type="password"
                        placeholder="Create a new password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="h-12 text-lg"
                        required
                        autoComplete="new-password"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirm Password</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="Re-enter new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="h-12 text-lg"
                        required
                        autoComplete="new-password"
                      />
                    </div>

                    <Button
                      type="submit"
                      variant="clinical"
                      size="lg"
                      className="w-full h-12"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        <>
                          Update Password
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </>
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => setStep("login")}
                      disabled={isLoading}
                    >
                      Back to Login
                    </Button>
                  </form>
                </>
              )}

              <div className="mt-6 pt-6 border-t border-border text-center">
                <p className="text-sm text-muted-foreground">
                  Are you a staff member?{" "}
                  <Link to="/auth/staff" className="text-primary hover:underline font-medium">
                    Staff Login
                  </Link>
                </p>
              </div>
            </motion.div>
          </AnimatePresence>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link to="/" className="hover:text-primary transition-colors">
              ← Back to Home
            </Link>
          </p>

        </div>
      </div>

      {resetDialogOpen && (
        <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
          <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              We will email you a secure link to reset your password.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRequestReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resetIdentifier">Email, Phone, or Patient ID</Label>
              <Input
                id="resetIdentifier"
                value={resetIdentifier}
                onChange={(e) => setResetIdentifier(e.target.value)}
                placeholder="Enter your email, phone, or patient ID"
                autoComplete="username"
                required
              />
            </div>
            {turnstileSiteKey && (
              <Turnstile
                siteKey={turnstileSiteKey}
                action="patient_reset_request"
                onVerify={setResetCaptchaToken}
                onExpire={() => setResetCaptchaToken("")}
              />
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setResetDialogOpen(false)}
                disabled={resetLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={resetLoading}>
                {resetLoading ? "Sending..." : "Send Reset Link"}
              </Button>
            </DialogFooter>
          </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default PatientAuth;
