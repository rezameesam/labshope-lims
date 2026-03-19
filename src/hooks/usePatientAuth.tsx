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
  organization_id?: string | null;
  password_reset_required?: boolean;
  last_password_change?: string | null;
  abha_number?: string | null;
  abha_address?: string | null;
  abdm_source?: string | null;
  abdm_last_verified_at?: string | null;
}

interface PatientAuthContextType {
  patient: Patient | null;
  loading: boolean;
  isAuthenticated: boolean;
  currentSessionId: string | null;
  login: (
    identifier: string,
    password: string,
    turnstileToken: string,
    organizationId?: string | null,
  ) => Promise<{ error: Error | null }>;
  setPassword: (currentPassword: string, newPassword: string) => Promise<{ error: Error | null }>;
  updateAddress: (address: string) => Promise<{ error: Error | null }>;
  requestPasswordReset: (
    identifier: string,
    turnstileToken: string,
    organizationId?: string | null,
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const PatientAuthContext = createContext<PatientAuthContextType | undefined>(undefined);

export const PatientAuthProvider = ({ children }: { children: ReactNode }) => {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let bootstrapRequestId = 0;

    const loadPatientForUser = async (userId: string | null, requestId: number) => {
      if (!userId) {
        if (isMounted && requestId === bootstrapRequestId) {
          setPatient(null);
        }
        return;
      }

      const { data, error } = await supabase
        .from("patients")
        .select("id, patient_id, full_name, phone, email, gender, blood_group, address, date_of_birth, is_active, organization_id, password_reset_required, last_password_change, abha_number, abha_address, abdm_source, abdm_last_verified_at")
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle();

      if (!isMounted || requestId !== bootstrapRequestId) return;

      if (data && !error) {
        const patientData = data as unknown as Patient;
        setPatient(patientData);
      } else {
        if (error && error.code !== "42501") {
          console.error("Failed to load patient record for session:", error);
        }
        setPatient(null);
      }
    };

    const loadPatientForUserWithTimeout = async (userId: string | null) => {
      const requestId = ++bootstrapRequestId;
      let timeoutId: number | null = null;

      try {
        await Promise.race([
          loadPatientForUser(userId, requestId),
          new Promise<void>((_, reject) =>
            {
              timeoutId = window.setTimeout(() => reject(new Error("Patient session bootstrap timed out")), 10000);
            },
          ),
        ]);
      } catch (error) {
        if (isMounted && requestId === bootstrapRequestId) {
          console.warn("Patient bootstrap fallback triggered:", error);
          setPatient(null);
        }
      } finally {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
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

  const login = async (
    identifier: string,
    password: string,
    turnstileToken: string,
    organizationId?: string | null,
  ): Promise<{ error: Error | null }> => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const response = await fetch(`${supabaseUrl}/functions/v1/patient-login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identifier,
          password,
          turnstile_token: turnstileToken,
          organization_id: organizationId || null,
          hostname: typeof window !== "undefined" ? window.location.hostname : null,
        }),
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

      return { error: null };
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
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const requestPasswordReset = async (
    identifier: string,
    turnstileToken: string,
    organizationId?: string | null,
  ): Promise<{ error: Error | null }> => {
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
          organization_id: organizationId || null,
          hostname: typeof window !== "undefined" ? window.location.hostname : null,
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

  const updateAddress = async (address: string): Promise<{ error: Error | null }> => {
    try {
      if (!session?.access_token || !patient?.id) {
        return { error: new Error("No active patient session") };
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/patient-update-address`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          address,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        return { error: new Error(result.error || "Failed to update address") };
      }

      setPatient((prev) =>
        prev
          ? {
              ...prev,
              address: typeof result.address === "string" ? result.address : address,
            }
          : prev,
      );

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setPatient(null);
    setSession(null);
    setCurrentSessionId(null);
  };

  return (
    <PatientAuthContext.Provider
      value={{
        patient,
        loading,
        isAuthenticated: !!patient,
        currentSessionId,
        login,
        setPassword,
        updateAddress,
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
