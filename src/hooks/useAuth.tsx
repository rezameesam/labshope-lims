import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { extractSessionIdFromAccessToken, getClientSessionMetadata } from "@/utils/sessionMetadata";
import { visibleInterval } from "@/lib/visibleInterval";
import { getPublicHostname, getPublicSlugCandidate, isDefinitelyPlatformHostname } from "@/lib/publicTenant";
import { TIMED_OUT, clearCachedRoles, raceTimeout, readCachedRoles, readStoredSession, writeCachedRoles } from "@/lib/offline/authCache";

// Capture hash at module load before Supabase processes and clears it.
const initialHashHasMagicLink =
  typeof window !== "undefined" && window.location.hash.includes("type=magiclink");

type UserRole = "admin" | "employee" | "patient" | "collector";

/** How long to wait for Supabase to confirm the session before opening with the stored login. */
const OFFLINE_SESSION_WAIT_MS = 4000;
/** How long to wait for the roles lookup when this user's roles are already remembered. */
const ROLE_FETCH_TIMEOUT_MS = 4000;

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
  const offlineSessionRef = useRef(false);
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
        const remembered = readCachedRoles<UserRole>(userId);
        const query = supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);
        // Supabase queues every call behind a stuck token refresh when offline, so if we
        // already know this user's roles, don't make the app wait for the server.
        const response = remembered ? await raceTimeout(query, ROLE_FETCH_TIMEOUT_MS) : await query;
        if (response === TIMED_OUT) {
          return remembered ?? [];
        }
        const { data, error } = response;

        if (error) {
          console.error("Error fetching roles:", error);
          // Server unreachable: keep the access this user had when last online.
          return readCachedRoles<UserRole>(userId) ?? [];
        }

        const nextRoles = (data?.map((r) => r.role as UserRole)) || [];
        roleCacheRef.current.set(userId, { roles: nextRoles, expiresAt: Date.now() + 60_000 });
        writeCachedRoles(userId, nextRoles);
        return nextRoles;
      } catch (error) {
        console.error("Error fetching roles:", error);
        return readCachedRoles<UserRole>(userId) ?? [];
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
      (event, nextSession) => {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        syncRolesForSession(nextSession);
        // NOTE: setLoading(false) is now handled inside syncRolesForSession
        // so that loading stays true until roles are fetched on first load.

        // Handle platform "Access as Admin" magic link redirect.
        // When Supabase can't honour the redirectTo URL (e.g. not whitelisted),
        // it falls back to the site root with ?type=magiclink in the hash.
        // Detect that case and forward the org admin to their dashboard.
        if (event === "SIGNED_IN" && initialHashHasMagicLink) {
          const meta = nextSession?.user?.user_metadata ?? {};
          const orgRole = meta.role as string | undefined;
          const orgId = meta.organization_id as string | undefined;
          if (orgId && (orgRole === "owner" || orgRole === "admin")) {
            window.setTimeout(() => {
              window.location.replace("/admin");
            }, 50);
          }
        }
      }
    );

    // THEN check for existing session
    const storageKey = (supabase.auth as unknown as { storageKey?: string }).storageKey;
    const applyInitialSession = (nextSession: Session | null) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      syncRolesForSession(nextSession);
      // NOTE: setLoading(false) is handled inside syncRolesForSession.
    };

    // With an expired access token and no network, Supabase retries the refresh in
    // the background for ~30s before answering, which would leave the app stuck on
    // its loading screen. If the answer is slow and a login is stored, open the app
    // with that login now; the real answer upgrades or replaces it when it arrives.
    let settled = false;
    const slowStartTimer = window.setTimeout(() => {
      if (!isMounted || settled) return;
      const stored = readStoredSession(storageKey);
      if (!stored) return;
      settled = true;
      offlineSessionRef.current = true;
      applyInitialSession(stored);
    }, OFFLINE_SESSION_WAIT_MS);

    void supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      window.clearTimeout(slowStartTimer);
      if (!isMounted) {
        return;
      }

      if (settled) {
        // We already opened with the stored login. Take the real session if there is one;
        // if Supabase dropped the login (revoked/invalid) while the stored copy is gone, sign out.
        if (initialSession) {
          offlineSessionRef.current = false;
          applyInitialSession(initialSession);
        } else if (!readStoredSession(storageKey)) {
          offlineSessionRef.current = false;
          applyInitialSession(null);
        }
        return;
      }
      settled = true;

      // An expired access token that cannot be refreshed makes Supabase report no
      // session while the login is still stored: stay signed in locally and reconcile
      // when the network returns.
      const stored = initialSession ? null : readStoredSession(storageKey);
      offlineSessionRef.current = !initialSession && Boolean(stored);
      applyInitialSession(initialSession ?? stored);
    });

    // Back online after starting offline: refresh the real session now.
    const reconcileOfflineSession = () => {
      if (!offlineSessionRef.current) return;
      void supabase.auth.getSession().then(({ data: { session: fresh } }) => {
        if (!isMounted || !fresh) return;
        offlineSessionRef.current = false;
        setSession(fresh);
        setUser(fresh.user);
        syncRolesForSession(fresh);
      });
    };
    window.addEventListener("online", reconcileOfflineSession);

    return () => {
      isMounted = false;
      window.clearTimeout(slowStartTimer);
      window.removeEventListener("online", reconcileOfflineSession);
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
    const signingOutUserId = user?.id;
    const { error } = await supabase.auth.signOut({ scope });

    if (!error && scope !== "others") {
      if (signingOutUserId) clearCachedRoles(signingOutUserId);
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
    const lastTrackedAt = { current: 0 };
    const MIN_INTERVAL = 120000; // 2 minute throttle for manual triggers

    const trackSession = async (force = false) => {
      if (!isMounted || trackingDisabled) {
        return;
      }

      const now = Date.now();
      if (!force && now - lastTrackedAt.current < MIN_INTERVAL) {
        return;
      }

      lastTrackedAt.current = now;

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

    // Initial track on mount/session change
    void trackSession(true);

    const stopInterval = visibleInterval(() => void trackSession(), 180000); // Every 3 minutes, only while the page is visible

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
      stopInterval();
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

export const useOptionalAuth = () => useContext(AuthContext);
