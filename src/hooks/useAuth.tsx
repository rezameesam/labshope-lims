import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { extractSessionIdFromAccessToken, getClientSessionMetadata } from "@/utils/sessionMetadata";

type UserRole = "admin" | "employee" | "patient" | "collector";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  currentSessionId: string | null;
  loading: boolean;
  roles: UserRole[];
  signIn: (
    email: string,
    password: string,
    turnstileToken: string
  ) => Promise<{
    error: Error | null;
    roles?: UserRole[];
    isStaff?: boolean;
    isCollector?: boolean;
  }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
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

  const fetchUserRoles = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (error) {
        console.error("Error fetching roles:", error);
        return [];
      }

      return (data?.map((r) => r.role as UserRole)) || [];
    } catch (error) {
      console.error("Error fetching roles:", error);
      return [];
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer role fetching with setTimeout
        if (session?.user) {
          setTimeout(() => {
            fetchUserRoles(session.user.id).then(setRoles);
          }, 0);
        } else {
          setRoles([]);
        }
        
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchUserRoles(session.user.id).then(setRoles);
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

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
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        return { error: new Error(result.error || "Login failed") };
      }

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
        return { error: null };
      }

      const nextRoles = Array.isArray(result.roles)
        ? (result.roles as UserRole[])
        : await fetchUserRoles(nextSession.user.id);

      setRoles(nextRoles);

      return {
        error: null,
        roles: nextRoles,
        isStaff: nextRoles.some((role) => role === "admin" || role === "employee" || role === "collector"),
        isCollector:
          nextRoles.includes("collector") &&
          !nextRoles.includes("admin") &&
          !nextRoles.includes("employee"),
      };
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

  const signOut = async () => {
    await supabase.auth.signOut();
    setRoles([]);
    setCurrentSessionId(null);
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
        signIn,
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
