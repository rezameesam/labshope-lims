import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

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
}

interface PatientAuthContextType {
  patient: Patient | null;
  loading: boolean;
  isAuthenticated: boolean;
  requiresPasswordReset: boolean;
  login: (identifier: string, password: string, turnstileToken: string) => Promise<{ error: Error | null; passwordResetRequired?: boolean }>;
  setPassword: (currentPassword: string, newPassword: string) => Promise<{ error: Error | null }>;
  requestPasswordReset: (identifier: string, resetBaseUrl: string, turnstileToken: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const PatientAuthContext = createContext<PatientAuthContextType | undefined>(undefined);

export const PatientAuthProvider = ({ children }: { children: ReactNode }) => {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [requiresPasswordReset, setRequiresPasswordReset] = useState(false);

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
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true)
        .single();

      if (!isMounted) return;

      if (data && !error) {
        const patientData = data as Patient;
        setPatient(patientData);
        setRequiresPasswordReset(!!patientData.password_reset_required);
      } else {
        setPatient(null);
        setRequiresPasswordReset(false);
      }
    };

    const checkSession = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user?.id || null;
        await loadPatientForUser(userId);
      } catch (error) {
        console.error("Error checking patient session:", error);
        setPatient(null);
        setRequiresPasswordReset(false);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    checkSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      await loadPatientForUser(session?.user?.id || null);
    });

    return () => {
      isMounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

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
      if (!patient?.id) {
        return { error: new Error("No active patient session") };
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/patient-set-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patient_id: patient.id,
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        return { error: new Error(result.error || "Failed to update password") };
      }

      setRequiresPasswordReset(false);
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const requestPasswordReset = async (identifier: string, resetBaseUrl: string, turnstileToken: string): Promise<{ error: Error | null }> => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/patient-request-password-reset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identifier,
          reset_base_url: resetBaseUrl,
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
  };

  return (
    <PatientAuthContext.Provider
      value={{
        patient,
        loading,
        isAuthenticated: !!patient && !requiresPasswordReset,
        requiresPasswordReset,
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
