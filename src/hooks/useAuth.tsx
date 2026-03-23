import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { extractSessionIdFromAccessToken, getClientSessionMetadata } from "@/utils/sessionMetadata";
import { getPublicHostname, getPublicSlugCandidate, isDefinitelyPlatformHostname } from "@/lib/publicTenant";

type UserRole = "admin" | "employee" | "patient" | "collector";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  currentSessionId: string | null;
  loading: boolean;
  roles: UserRole[];
  staffPasswordResetRequired: boolean;
  signIn: (
    email: string,
    password: string,
    turnstileToken: string
  ) => Promise<{
    error: Error | null;
    roles?: UserRole[];
    isStaff?: boolean;
    isCollector?: boolean;
    requiresPasswordReset?: boolean;
    firstLoginFlow?: string | null;
    requiresTwoFactor?: boolean;
    challengeId?: string | null;
    maskedEmail?: string | null;
  }>;
  verifyTwoFactor: (
    email: string,
    password: string,
    challengeId: string,
    otp: string,
  ) => Promise<{
    error: Error | null;
    roles?: UserRole[];
    isStaff?: boolean;
    isCollector?: boolean;
    requiresPasswordReset?: boolean;
    firstLoginFlow?: string | null;
  }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: (scope?: "local" | "global" | "others") => Promise<{ error: Error | null }>;
  hasRole: (role: UserRole) => boolean;
  isStaff: boolean;
  isCollector: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [staffPasswordResetRequired, setStaffPasswordResetRequired] = useState(false);
  const roleRequestIdRef = useRef(0);
  const roleCacheRef = useRef<Map<string, { roles: UserRole[]; expiresAt: number }>>(new Map());
  const roleInFlightRef = useRef<Map<string, Promise<UserRole[]>>>(new Map());

  const fetchUserRoles = async (userId: string) => {
    const now = Date.now();
    const cached = roleCacheRef.current.get(userId);
    if (cached && cached.expiresAt > now) {
      return cached.roles;
    }

    const inFlight = roleInFlightRef.current.get(userId);
    if (inFlight) {
      return inFlight;
    }

    const request = (async () => {
      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);

        if (error) {
          console.error("Error fetching roles:", error);
          return [];
        }

        const nextRoles = (data?.map((r) => r.role as UserRole)) || [];
        roleCacheRef.current.set(userId, { roles: nextRoles, expiresAt: Date.now() + 60_000 });
        return nextRoles;
      } catch (error) {
        console.error("Error fetching roles:", error);
        return [];
      } finally {
        roleInFlightRef.current.delete(userId);
      }
    })();

    roleInFlightRef.current.set(userId, request);
    return request;
  };

  useEffect(() => {
    let isMounted = true;

    const syncRolesForSession = (nextSession: Session | null) => {
      const requestId = ++roleRequestIdRef.current;
      setStaffPasswordResetRequired(Boolean(nextSession?.user?.user_metadata?.must_change_password));

      if (!nextSession?.user) {
        // No user — clear roles and unblock loading immediately.
        setRoles([]);
        setLoading(false);
        return;
      }

      // User is present. Do NOT clear existing roles — keeping them avoids a
      // brief isStaff=false window (e.g. after TOKEN_REFRESHED on tab focus)
      // that would fire the "access denied" guard and redirect away from
      // protected pages like /admin or /platform/*.
      // loading stays true on the very first call (initial page load) and is
      // only cleared once the role fetch resolves, so guards never fire before
      // roles are known.
      window.setTimeout(() => {
        void fetchUserRoles(nextSession.user.id).then((nextRoles) => {
          if (!isMounted || roleRequestIdRef.current !== requestId) {
            return;
          }

          setRoles(nextRoles);
          setLoading(false);
        });
      }, 0);
    };

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        syncRolesForSession(nextSession);
        // NOTE: setLoading(false) is now handled inside syncRolesForSession
        // so that loading stays true until roles are fetched on first load.
      }
    );

    // THEN check for existing session
    void supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!isMounted) {
        return;
      }

      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      syncRolesForSession(initialSession);
      // NOTE: setLoading(false) is handled inside syncRolesForSession.
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const completeSessionFromLoginResult = async (result: any) => {
    const accessToken = result.session?.access_token;
    const refreshToken = result.session?.refresh_token;
    if (!accessToken || !refreshToken) {
      return { error: new Error("Authentication session was not returned.") };
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (sessionError) {
      return { error: sessionError as Error };
    }

    const nextSession = sessionData.session ?? null;
    setSession(nextSession);
    setUser(nextSession?.user ?? null);

    if (!nextSession?.user) {
      setRoles([]);
      setStaffPasswordResetRequired(false);
      return { error: null };
    }

    const nextRoles = Array.isArray(result.roles)
      ? (result.roles as UserRole[])
      : await fetchUserRoles(nextSession.user.id);

    setRoles(nextRoles);
    const requiresPasswordReset = Boolean(nextSession.user.user_metadata?.must_change_password);
    setStaffPasswordResetRequired(requiresPasswordReset);

    return {
      error: null,
      roles: nextRoles,
      isStaff: nextRoles.some((role) => role === "admin" || role === "employee" || role === "collector"),
      isCollector:
        nextRoles.includes("collector") &&
        !nextRoles.includes("admin") &&
        !nextRoles.includes("employee"),
      requiresPasswordReset,
      firstLoginFlow: typeof result.first_login_flow === "string" ? result.first_login_flow : null,
    };
  };

  const signIn = async (email: string, password: string, turnstileToken: string) => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/employee-login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          turnstile_token: turnstileToken,
          organization_slug: isDefinitelyPlatformHostname(getPublicHostname()) ? null : getPublicSlugCandidate(getPublicHostname()),
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        return { error: new Error(result.error || "Login failed") };
      }

      if (result.requires_two_factor) {
        return {
          error: null,
          requiresTwoFactor: true,
          challengeId: typeof result.challenge_id === "string" ? result.challenge_id : null,
          maskedEmail: typeof result.masked_email === "string" ? result.masked_email : null,
        };
      }

      return await completeSessionFromLoginResult(result);
    } catch (error) {
      return { error: error as Error };
    }
  };

  const verifyTwoFactor = async (email: string, password: string, challengeId: string, otp: string) => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/employee-login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          otp,
          challenge_id: challengeId,
          organization_slug: isDefinitelyPlatformHostname(getPublicHostname()) ? null : getPublicSlugCandidate(getPublicHostname()),
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        return { error: new Error(result.error || "Two-factor verification failed") };
      }

      return await completeSessionFromLoginResult(result);
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async (scope: "local" | "global" | "others" = "local") => {
    const { error } = await supabase.auth.signOut({ scope });

    if (!error && scope !== "others") {
      setUser(null);
      setSession(null);
      setRoles([]);
      setCurrentSessionId(null);
      setStaffPasswordResetRequired(false);
      roleCacheRef.current.clear();
      roleInFlightRef.current.clear();
    }

    return { error: (error as Error | null) ?? null };
  };

  const hasRole = (role: UserRole) => roles.includes(role);
  const isStaff = hasRole("admin") || hasRole("employee") || hasRole("collector");
  const isCollector = hasRole("collector") && !hasRole("admin") && !hasRole("employee");

  useEffect(() => {
    setCurrentSessionId(extractSessionIdFromAccessToken(session?.access_token || null));
  }, [session?.access_token]);

  useEffect(() => {
    if (!session?.access_token || !user?.id || !isStaff) {
      return;
    }

    // Skip session tracking for platform admin impersonation sessions
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("platform_access") === "1") {
      sessionStorage.setItem("platform_access", "1");
    }
    if (sessionStorage.getItem("platform_access") === "1") {
      return;
    }

    const sessionId = extractSessionIdFromAccessToken(session.access_token);
    if (!sessionId) {
      return;
    }

    const metadata = getClientSessionMetadata();
    let trackingDisabled = false;
    let isMounted = true;

    const trackSession = async () => {
      if (!isMounted || trackingDisabled) {
        return;
      }

      const { error } = await (supabase as any).rpc("upsert_employee_session", {
        _session_id: sessionId,
        _device_name: metadata.deviceName,
        _browser: metadata.browser,
        _os: metadata.os,
        _location: metadata.location,
        _user_agent: metadata.userAgent,
      });

      if (error) {
        if (error.code === "PGRST202") {
          trackingDisabled = true;
        }
        const message = String(error.message || "").toLowerCase();
        const sessionInvalid = message.includes("session inactive") || message.includes("session revoked");

        if (sessionInvalid) {
          trackingDisabled = true;
          await supabase.auth.signOut({ scope: "local" });
          setRoles([]);
          setCurrentSessionId(null);
          return;
        }

        console.warn("Unable to upsert employee session:", error.message || error);
      }
    };

    void trackSession();

    const intervalId = window.setInterval(() => {
      void trackSession();
    }, 15000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void trackSession();
      }
    };

    const handleWindowFocus = () => {
      void trackSession();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [session?.access_token, user?.id, isStaff]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        currentSessionId,
        loading,
        roles,
        staffPasswordResetRequired,
        signIn,
        verifyTwoFactor,
        signUp,
        signOut,
        hasRole,
        isStaff,
        isCollector,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
