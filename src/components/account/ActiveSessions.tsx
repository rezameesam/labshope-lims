import { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Monitor, LogOut, ShieldCheck, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatAppDateTimeWithMeridiem } from "@/lib/date";

type EmployeeSessionRow = {
  session_id: string;
  device_name: string | null;
  browser: string | null;
  os: string | null;
  location: string | null;
  ip: string | null;
  created_at: string;
  last_seen_at: string;
  is_current: boolean;
};

const formatTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return "Unknown";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }

  return `${formatAppDateTimeWithMeridiem(parsed)} (${formatDistanceToNow(parsed, { addSuffix: true })})`;
};

const ActiveSessions = () => {
  const { currentSessionId, signOut, user } = useAuth();
  const [sessions, setSessions] = useState<EmployeeSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionSessionId, setActionSessionId] = useState<string | null>(null);
  const [isBulkActionLoading, setIsBulkActionLoading] = useState(false);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [staffEmail, setStaffEmail] = useState<string>("");
  const [twoFactorEmailEnabled, setTwoFactorEmailEnabled] = useState(false);
  const [twoFactorLoading, setTwoFactorLoading] = useState(true);
  const [twoFactorSaving, setTwoFactorSaving] = useState(false);
  const [twoFactorSupported, setTwoFactorSupported] = useState(true);

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await (supabase as any).rpc("list_employee_sessions", {
        _current_session_id: currentSessionId,
      });

      if (error) {
        throw error;
      }

      setSessions((data || []) as EmployeeSessionRow[]);
    } catch (error: any) {
      console.error("Failed to load active sessions:", error);
      toast.error(error?.message || "Failed to load active sessions");
    } finally {
      setLoading(false);
    }
  }, [currentSessionId]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const loadTwoFactorSettings = useCallback(async () => {
    if (!user?.id) {
      setEmployeeId(null);
      setStaffEmail("");
      setTwoFactorEmailEnabled(false);
      setTwoFactorLoading(false);
      return;
    }

    try {
      setTwoFactorLoading(true);
      const { data, error } = await (supabase as any)
        .from("employees")
        .select("id, email, two_factor_email_enabled")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        if (error.code === "PGRST204" || String(error.message || "").includes("two_factor_email_enabled")) {
          setTwoFactorSupported(false);
          return;
        }
        throw error;
      }

      setEmployeeId(data?.id || null);
      setStaffEmail(data?.email || "");
      setTwoFactorEmailEnabled(data?.two_factor_email_enabled === true);
      setTwoFactorSupported(true);
    } catch (error: any) {
      console.error("Failed to load 2FA settings:", error);
      toast.error(error?.message || "Failed to load two-factor settings");
    } finally {
      setTwoFactorLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadTwoFactorSettings();
  }, [loadTwoFactorSettings]);

  const handleToggleTwoFactor = async (checked: boolean) => {
    if (!employeeId || !user?.id) {
      toast.error("Your staff account could not be resolved.");
      return;
    }

    try {
      setTwoFactorSaving(true);
      const { error } = await (supabase as any)
        .from("employees")
        .update({ two_factor_email_enabled: checked })
        .eq("id", employeeId)
        .eq("user_id", user.id);

      if (error) {
        if (error.code === "PGRST204" || String(error.message || "").includes("two_factor_email_enabled")) {
          setTwoFactorSupported(false);
          toast.error("Database migration required before email 2FA can be enabled.");
          return;
        }
        throw error;
      }

      setTwoFactorEmailEnabled(checked);
      toast.success(`Email two-factor authentication ${checked ? "enabled" : "disabled"}.`);
    } catch (error: any) {
      console.error("Failed to update 2FA settings:", error);
      toast.error(error?.message || "Failed to update two-factor settings");
    } finally {
      setTwoFactorSaving(false);
    }
  };

  const hasOtherSessions = useMemo(
    () => sessions.some((session) => !session.is_current),
    [sessions]
  );

  const handleSignOutSession = async (targetSessionId: string) => {
    const target = sessions.find((session) => session.session_id === targetSessionId);
    if (!target || target.is_current) {
      return;
    }

    const confirmed = window.confirm("Sign out this session?");
    if (!confirmed) {
      return;
    }

    try {
      setActionSessionId(targetSessionId);
      const { error } = await (supabase as any).rpc("revoke_employee_session", {
        _session_id: targetSessionId,
      });

      if (error) {
        throw error;
      }

      toast.success("Session signed out");
      await loadSessions();
    } catch (error: any) {
      console.error("Failed to sign out session:", error);
      toast.error(error?.message || "Failed to sign out session");
    } finally {
      setActionSessionId(null);
    }
  };

  const handleSignOutOthers = async () => {
    if (!currentSessionId) {
      toast.error("Current session could not be identified");
      return;
    }

    const confirmed = window.confirm("Sign out all other sessions?");
    if (!confirmed) {
      return;
    }

    try {
      setIsBulkActionLoading(true);
      const { error: revokeOthersError } = await supabase.auth.signOut({ scope: "others" });
      if (revokeOthersError) {
        throw revokeOthersError;
      }

      const { error } = await (supabase as any).rpc("revoke_other_employee_sessions", {
        _current_session_id: currentSessionId,
      });

      if (error) {
        throw error;
      }

      toast.success("Signed out all other sessions");
      await loadSessions();
    } catch (error: any) {
      console.error("Failed to sign out other sessions:", error);
      toast.error(error?.message || "Failed to sign out other sessions");
    } finally {
      setIsBulkActionLoading(false);
    }
  };

  const handleSignOutAll = async () => {
    const confirmed = window.confirm(
      "Sign out from all sessions, including this one? You will need to login again."
    );
    if (!confirmed) {
      return;
    }

    try {
      setIsBulkActionLoading(true);
      const { error } = await (supabase as any).rpc("revoke_all_employee_sessions");

      if (error) {
        throw error;
      }

      await signOut();
      toast.success("Signed out from all sessions");
    } catch (error: any) {
      console.error("Failed to sign out all sessions:", error);
      toast.error(error?.message || "Failed to sign out all sessions");
    } finally {
      setIsBulkActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-heading font-bold text-clinical-navy">Active Sessions</h2>
          <p className="text-muted-foreground">
            Review and revoke currently active devices and browsers.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleSignOutOthers}
            disabled={!hasOtherSessions || isBulkActionLoading || loading}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out Other Sessions
          </Button>
          <Button
            variant="destructive"
            onClick={handleSignOutAll}
            disabled={isBulkActionLoading || loading}
          >
            <ShieldCheck className="h-4 w-4 mr-2" />
            Sign Out All
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Email Two-Factor Authentication</CardTitle>
          <CardDescription>
            When enabled, you must enter a one-time code sent to your staff email after your password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!twoFactorSupported ? (
            <p className="text-sm text-amber-700">
              Email 2FA is not available yet because the required database migration has not been applied.
            </p>
          ) : twoFactorLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading security settings...
            </div>
          ) : !staffEmail ? (
            <p className="text-sm text-muted-foreground">
              Add a staff email address to your employee record before enabling email OTP.
            </p>
          ) : (
            <div className="flex items-start gap-3">
              <Checkbox
                id="staff-email-2fa"
                checked={twoFactorEmailEnabled}
                disabled={twoFactorSaving}
                onCheckedChange={(checked) => void handleToggleTwoFactor(checked === true)}
              />
              <div className="space-y-1">
                <Label htmlFor="staff-email-2fa" className="cursor-pointer">
                  Require email OTP for future sign-ins
                </Label>
                <p className="text-sm text-muted-foreground">
                  Verification emails will be sent to <span className="font-medium">{staffEmail}</span>.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session List</CardTitle>
          <CardDescription>
            Device name, browser, OS, IP, creation time, and last activity are shown here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading active sessions...
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No active sessions found.
            </p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.session_id}
                className="border rounded-lg p-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium">
                      {session.device_name || `${session.os || "Unknown"} Device`}
                    </p>
                    {session.is_current && <Badge>This Session</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>
                      Browser: {session.browser || "Unknown"} | OS: {session.os || "Unknown"}
                    </p>
                    <p>Location: {session.location || "Unknown"}</p>
                    <p>IP: {session.ip || "Unknown"}</p>
                    <p>Created: {formatTimestamp(session.created_at)}</p>
                    <p>Last Seen: {formatTimestamp(session.last_seen_at)}</p>
                  </div>
                </div>

                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={session.is_current || actionSessionId === session.session_id || isBulkActionLoading}
                    onClick={() => handleSignOutSession(session.session_id)}
                  >
                    {actionSessionId === session.session_id ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Signing Out...
                      </>
                    ) : (
                      <>
                        <LogOut className="h-4 w-4 mr-2" />
                        Sign Out Session
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ActiveSessions;
