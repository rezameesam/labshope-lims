import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { extractSessionIdFromAccessToken, getClientSessionMetadata } from "@/utils/sessionMetadata";

interface Patient {
  id: string;
  patient_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  gender: string | null;
  blood_group: string | null;
  address: string | null;
  date_of_birth: string | null;
  is_active: boolean;
  password_reset_required?: boolean;
  last_password_change?: string | null;
}

interface PatientAuthContextType {
  patient: Patient | null;
  loading: boolean;
  isAuthenticated: boolean;
  requiresPasswordReset: boolean;
  currentSessionId: string | null;
  login: (identifier: string, password: string, turnstileToken: string) => Promise<{ error: Error | null; passwordResetRequired?: boolean }>;
  setPassword: (currentPassword: string, newPassword: string) => Promise<{ error: Error | null }>;
  requestPasswordReset: (identifier: string, turnstileToken: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const PatientAuthContext = createContext<PatientAuthContextType | undefined>(undefined);

export const PatientAuthProvider = ({ children }: { children: ReactNode }) => {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [requiresPasswordReset, setRequiresPasswordReset] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadPatientForUser = async (userId: string | null) => {
      if (!userId) {
        if (isMounted) {
          setPatient(null);
          setRequiresPasswordReset(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("patients")
        .select("id, patient_id, full_name, phone, email, gender, blood_group, address, date_of_birth, is_active, password_reset_required, last_password_change")
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle();

      if (!isMounted) return;

      if (data && !error) {
        const patientData = data as unknown as Patient;
        setPatient(patientData);
        setRequiresPasswordReset(!!patientData.password_reset_required);
      } else {
        if (error) {
          console.error("Failed to load patient record for session:", error);
        }
        setPatient(null);
        setRequiresPasswordReset(false);
      }
    };

    const loadPatientForUserWithTimeout = async (userId: string | null) => {
      try {
        await Promise.race([
          loadPatientForUser(userId),
          new Promise<void>((_, reject) =>
            window.setTimeout(() => reject(new Error("Patient session bootstrap timed out")), 5000),
          ),
        ]);
      } catch (error) {
        console.warn("Patient bootstrap fallback triggered:", error);
        if (isMounted) {
          setPatient(null);
          setRequiresPasswordReset(false);
        }
      }
    };

    const syncPatientState = (nextSession: Session | null) => {
      if (!isMounted) {
        return;
      }

      setSession(nextSession);
      setCurrentSessionId(extractSessionIdFromAccessToken(nextSession?.access_token || null));

      if (!nextSession?.user?.id) {
        setPatient(null);
        setRequiresPasswordReset(false);
        setLoading(false);
        return;
      }

      window.setTimeout(() => {
        void loadPatientForUserWithTimeout(nextSession.user.id).finally(() => {
          if (isMounted) {
            setLoading(false);
          }
        });
      }, 0);
    };

    const initialize = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        syncPatientState(sessionData.session ?? null);
      } catch (error) {
        console.error("Error checking patient session:", error);
        if (isMounted) {
          setPatient(null);
          setRequiresPasswordReset(false);
          setSession(null);
          setCurrentSessionId(null);
          setLoading(false);
        }
      }
    };

    void initialize();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      syncPatientState(nextSession ?? null);
    });

    return () => {
      isMounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.access_token || !patient?.id || !currentSessionId) {
      return;
    }

    const metadata = getClientSessionMetadata();
    let trackingDisabled = false;
    let isMounted = true;

    const trackSession = async () => {
      if (!isMounted || trackingDisabled) {
        return;
      }

      const { error } = await (supabase as any).rpc("upsert_patient_session", {
        _session_id: currentSessionId,
        _device_name: metadata.deviceName,
        _browser: metadata.browser,
        _os: metadata.os,
        _location: metadata.location,
        _user_agent: metadata.userAgent,
      });

      if (error) {
        if (error.code === "PGRST202") {
          trackingDisabled = true;
          return;
        }

        const message = String(error.message || "").toLowerCase();
        const sessionInvalid = message.includes("session inactive") || message.includes("session revoked");

        if (sessionInvalid) {
          trackingDisabled = true;
          await supabase.auth.signOut({ scope: "local" });
          setPatient(null);
          setRequiresPasswordReset(false);
          setSession(null);
          setCurrentSessionId(null);
          return;
        }

        console.warn("Unable to upsert patient session:", error.message || error);
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
  }, [currentSessionId, patient?.id, session?.access_token]);

  const login = async (identifier: string, password: string, turnstileToken: string): Promise<{ error: Error | null; passwordResetRequired?: boolean }> => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const response = await fetch(`${supabaseUrl}/functions/v1/patient-login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ identifier, password, turnstile_token: turnstileToken }),
      });

      const result = await response.json();

      if (!response.ok) {
        return { error: new Error(result.error || "Login failed") };
      }

      if (!result.auth_email) {
        return { error: new Error("Authentication not available for this patient.") };
      }

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: result.auth_email,
        password,
      });

      if (authError) {
        return { error: authError };
      }

      return { error: null, passwordResetRequired: !!result.password_reset_required };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const setPassword = async (currentPassword: string, newPassword: string): Promise<{ error: Error | null }> => {
    try {
      if (!session?.access_token || !patient?.id) {
        return { error: new Error("No active patient session") };
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/patient-set-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        return { error: new Error(result.error || "Failed to update password") };
      }

      if (currentSessionId) {
        await supabase.auth.signOut({ scope: "others" });
        await (supabase as any).rpc("revoke_other_patient_sessions", {
          _current_session_id: currentSessionId,
        });
      }

      setPatient((prev) =>
        prev
          ? {
              ...prev,
              password_reset_required: false,
              last_password_change: new Date().toISOString(),
            }
          : prev,
      );
      setRequiresPasswordReset(false);
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const requestPasswordReset = async (identifier: string, turnstileToken: string): Promise<{ error: Error | null }> => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/patient-request-password-reset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identifier,
          turnstile_token: turnstileToken,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        return { error: new Error(result.error || "Failed to request password reset") };
      }

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setPatient(null);
    setRequiresPasswordReset(false);
    setSession(null);
    setCurrentSessionId(null);
  };

  return (
    <PatientAuthContext.Provider
      value={{
        patient,
        loading,
        isAuthenticated: !!patient && !requiresPasswordReset,
        requiresPasswordReset,
        currentSessionId,
        login,
        setPassword,
        requestPasswordReset,
        signOut,
      }}
    >
      {children}
    </PatientAuthContext.Provider>
  );
};

export const usePatientAuth = () => {
  const context = useContext(PatientAuthContext);
  if (context === undefined) {
    throw new Error("usePatientAuth must be used within a PatientAuthProvider");
  }
  return context;
};
