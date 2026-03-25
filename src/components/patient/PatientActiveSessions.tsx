import { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Loader2, LogOut, Monitor, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePatientAuth } from "@/hooks/usePatientAuth";
import { formatAppDateTimeWithMeridiem } from "@/lib/date";

type PatientSessionRow = {
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

const PatientActiveSessions = () => {
  const { currentSessionId, signOut } = usePatientAuth();
  const [sessions, setSessions] = useState<PatientSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionSessionId, setActionSessionId] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await (supabase as any).rpc("list_patient_sessions", {
        _current_session_id: currentSessionId,
      });

      if (error) {
        throw error;
      }

      setSessions((data || []) as PatientSessionRow[]);
    } catch (error: any) {
      console.error("Failed to load patient sessions:", error);
      toast.error(error?.message || "Failed to load active sessions");
    } finally {
      setLoading(false);
    }
  }, [currentSessionId]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const hasOtherSessions = useMemo(() => sessions.some((session) => !session.is_current), [sessions]);

  const handleSignOutSession = async (targetSessionId: string) => {
    const target = sessions.find((session) => session.session_id === targetSessionId);
    if (!target || target.is_current) {
      return;
    }

    if (!window.confirm("Sign out this session?")) {
      return;
    }

    try {
      setActionSessionId(targetSessionId);
      const { error } = await (supabase as any).rpc("revoke_patient_session", {
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

    if (!window.confirm("Sign out all other sessions?")) {
      return;
    }

    try {
      setBulkLoading(true);
      const { error: authError } = await supabase.auth.signOut({ scope: "others" });
      if (authError) {
        throw authError;
      }

      const { error } = await (supabase as any).rpc("revoke_other_patient_sessions", {
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
      setBulkLoading(false);
    }
  };

  const handleSignOutAll = async () => {
    if (!window.confirm("Sign out from all sessions, including this one? You will need to login again.")) {
      return;
    }

    try {
      setBulkLoading(true);
      const { error } = await (supabase as any).rpc("revoke_all_patient_sessions");
      if (error) {
        throw error;
      }

      await signOut();
      toast.success("Signed out from all sessions");
    } catch (error: any) {
      console.error("Failed to sign out all sessions:", error);
      toast.error(error?.message || "Failed to sign out all sessions");
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-heading font-semibold text-foreground">Active sessions</h3>
          <p className="text-sm text-muted-foreground">
            Review devices currently signed in to your patient account.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleSignOutOthers} disabled={!hasOtherSessions || bulkLoading || loading}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out Others
          </Button>
          <Button variant="destructive" onClick={handleSignOutAll} disabled={bulkLoading || loading}>
            <ShieldCheck className="mr-2 h-4 w-4" />
            Sign Out All
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Devices and browsers</CardTitle>
          <CardDescription>
            Current and recent activity is shown here with device, browser, OS, IP, and last seen time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading active sessions...
            </div>
          ) : sessions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No active sessions found.</p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.session_id}
                className="flex flex-col gap-4 rounded-xl border border-border bg-muted/30 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium text-foreground">
                      {session.device_name || `${session.os || "Unknown"} Device`}
                    </p>
                    {session.is_current && <Badge>This Device</Badge>}
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p>
                      Browser: {session.browser || "Unknown"} | OS: {session.os || "Unknown"}
                    </p>
                    <p>Location: {session.location || "Unknown"}</p>
                    <p>IP: {session.ip || "Unknown"}</p>
                    <p>Created: {formatTimestamp(session.created_at)}</p>
                    <p>Last Seen: {formatTimestamp(session.last_seen_at)}</p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={session.is_current || actionSessionId === session.session_id || bulkLoading}
                  onClick={() => handleSignOutSession(session.session_id)}
                >
                  {actionSessionId === session.session_id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing Out...
                    </>
                  ) : (
                    <>
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out Session
                    </>
                  )}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PatientActiveSessions;
