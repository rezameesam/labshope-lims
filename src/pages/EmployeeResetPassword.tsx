import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";
import logo from "@/assets/logo.png";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { usePublicPageMode } from "@/hooks/usePublicPageMode";
import PlatformResetPage from "@/components/platform/PlatformResetPage";
import InvalidTenantPage from "@/components/platform/InvalidTenantPage";

const EmployeeResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { branding } = useOrganization();
  const { loading, platformMode, invalidTenantHost, hostname } = usePublicPageMode();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecoverySessionReady, setIsRecoverySessionReady] = useState(false);
  const isFirstLogin = searchParams.get("first_login") === "1";
  const nextPath = searchParams.get("next") || "/admin";

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (data.session) {
        setIsRecoverySessionReady(true);
      }
    };

    void checkSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || (!!session && event === "SIGNED_IN")) {
        setIsRecoverySessionReady(true);
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

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
        eyebrow="Staff Password Reset"
        title="Staff password reset must use the organization’s own workspace domain."
        description="Staff reset links are tied to a specific tenant. Open the link from your lab’s staff portal domain so role and organization checks remain valid."
        loginLabel="Staff Access Guidance"
        loginTo="/auth/staff"
      />
    );
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!isRecoverySessionReady) {
      toast.error("Reset link is invalid or expired. Please request a new one.");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const existingMetadata = sessionData.session?.user?.user_metadata || {};
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        data: {
          ...existingMetadata,
          must_change_password: false,
          first_login_flow: null,
        },
      });
      if (error) {
        throw error;
      }

      await supabase.auth.signOut();
      toast.success("Password updated successfully. Please sign in.");
      navigate(`/auth/staff?next=${encodeURIComponent(nextPath)}`, { replace: true });
    } catch (error: any) {
      toast.error(error?.message || "Failed to update password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-subtle-gradient flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-card rounded-2xl p-8 shadow-xl border border-border">
        <div className="flex items-center gap-3 mb-6">
          <img src={branding.logoUrl || logo} alt={branding.displayName} className="h-12 w-12" />
          <div>
            <h1 className="text-lg font-heading font-bold text-foreground">{branding.shortName}</h1>
            <p className="text-xs text-muted-foreground">{branding.secondaryLabel}</p>
          </div>
        </div>

        <div className="mb-6">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-primary/10 mb-4">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-2xl font-heading font-bold text-foreground mb-2">Staff Password Reset</h2>
          <p className="text-muted-foreground">
            {isFirstLogin
              ? "Create a new password before using the workspace."
              : "Create a new password for your staff account."}
          </p>
        </div>

        {isFirstLogin ? (
          <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-4 text-sm text-muted-foreground">
            Your account was created with a temporary launch password. Set a permanent password now before continuing.
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new_password">New Password</Label>
            <Input
              id="new_password"
              name="new_password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm_password">Confirm Password</Label>
            <Input
              id="confirm_password"
              name="confirm_password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
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
          <Link to="/auth/staff" className="text-primary hover:underline">
            Back to staff login
          </Link>
        </p>
      </div>
    </div>
  );
};

export default EmployeeResetPassword;
