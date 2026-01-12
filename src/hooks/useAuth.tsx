import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type UserRole = "admin" | "employee" | "patient" | "collector";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: UserRole[];
  signIn: (
    email: string,
    password: string
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

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      return { error: error as Error };
    }

    if (!error) {
      const { data: sessionData } = await supabase.auth.getSession();
      const nextSession = sessionData.session ?? null;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (nextSession?.user) {
        const nextRoles = await fetchUserRoles(nextSession.user.id);
        setRoles(nextRoles);
        const nextIsStaff = nextRoles.some((role) =>
          role === "admin" || role === "employee" || role === "collector"
        );
        const nextIsCollector =
          nextRoles.includes("collector") &&
          !nextRoles.includes("admin") &&
          !nextRoles.includes("employee");
        return {
          error: null,
          roles: nextRoles,
          isStaff: nextIsStaff,
          isCollector: nextIsCollector,
        };
      } else {
        setRoles([]);
      }
    }
    return { error: null };
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
  };

  const hasRole = (role: UserRole) => roles.includes(role);
  const isStaff = hasRole("admin") || hasRole("employee") || hasRole("collector");
  const isCollector = hasRole("collector") && !hasRole("admin") && !hasRole("employee");

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
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
