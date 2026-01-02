import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
import Turnstile from "@/components/ui/turnstile";

const PatientResetPassword = () => {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";

  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") || "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      toast.error("Reset token is missing or invalid.");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
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
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to reset password");
      }

      toast.success("Password reset successfully. Please login.");
      navigate("/auth/patient");
    } catch (error: any) {
      toast.error(error.message || "Failed to reset password");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-subtle-gradient flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-card rounded-2xl p-8 shadow-xl border border-border">
        <div className="flex items-center gap-3 mb-6">
          <img src={logo} alt="IRM Clinical Laboratory" className="h-12 w-12" />
          <div>
            <h1 className="text-lg font-heading font-bold text-foreground">IRM Clinical</h1>
            <p className="text-xs text-muted-foreground">Laboratory</p>
          </div>
        </div>

        <div className="mb-6">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-primary/10 mb-4">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-2xl font-heading font-bold text-foreground mb-2">Reset Password</h2>
          <p className="text-muted-foreground">Create a new password to access your portal.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          {turnstileSiteKey && (
            <Turnstile
              siteKey={turnstileSiteKey}
              action="patient_reset_password"
              onVerify={setCaptchaToken}
              onExpire={() => setCaptchaToken("")}
            />
          )}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              "Update Password"
            )}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/auth/patient" className="text-primary hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
};

export default PatientResetPassword;
