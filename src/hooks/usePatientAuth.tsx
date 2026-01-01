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
}

interface PatientAuthContextType {
  patient: Patient | null;
  loading: boolean;
  isAuthenticated: boolean;
  demoMode: boolean;
  sendOtp: (phone: string) => Promise<{ error: Error | null; demoMode?: boolean }>;
  verifyOtp: (phone: string, token: string) => Promise<{ error: Error | null; needsSelection?: boolean; patient?: Patient }>;
  selectPatient: (phone: string) => Promise<{ patients: Patient[]; error: Error | null }>;
  signOut: () => Promise<void>;
}

const PatientAuthContext = createContext<PatientAuthContextType | undefined>(undefined);

export const PatientAuthProvider = ({ children }: { children: ReactNode }) => {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(true);

  // Check for existing patient session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const storedPhone = localStorage.getItem("patient_phone");
        const storedPatientId = localStorage.getItem("patient_id");
        
        if (storedPhone && storedPatientId) {
          const { data, error } = await supabase
            .from("patients")
            .select("*")
            .eq("id", storedPatientId)
            .eq("phone", storedPhone)
            .eq("is_active", true)
            .single();

          if (data && !error) {
            setPatient(data as Patient);
          } else {
            localStorage.removeItem("patient_phone");
            localStorage.removeItem("patient_id");
          }
        }
      } catch (error) {
        console.error("Error checking patient session:", error);
        localStorage.removeItem("patient_phone");
        localStorage.removeItem("patient_id");
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  const sendOtp = async (phone: string): Promise<{ error: Error | null; demoMode?: boolean }> => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      
      const response = await fetch(`${supabaseUrl}/functions/v1/send-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone }),
      });

      const result = await response.json();

      if (!response.ok) {
        return { error: new Error(result.error || "Failed to send OTP") };
      }

      // Update demo mode state
      if (result.demo_mode !== undefined) {
        setDemoMode(result.demo_mode);
      }

      return { error: null, demoMode: result.demo_mode };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const verifyOtp = async (phone: string, token: string): Promise<{ error: Error | null; needsSelection?: boolean; patient?: Patient }> => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      
      const response = await fetch(`${supabaseUrl}/functions/v1/verify-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone, otp: token }),
      });

      const result = await response.json();

      if (!response.ok) {
        return { error: new Error(result.error || "Failed to verify OTP") };
      }

      // If multiple patients, return for selection
      if (result.needs_selection) {
        return { error: null, needsSelection: true };
      }

      // Single patient found - set it
      if (result.patient) {
        setPatient(result.patient as Patient);
        localStorage.setItem("patient_phone", phone);
        localStorage.setItem("patient_id", result.patient.id);
        return { error: null, patient: result.patient };
      }

      return { error: new Error("Unexpected response from server") };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const selectPatient = async (phone: string): Promise<{ patients: Patient[]; error: Error | null }> => {
    try {
      const { data: patientsData, error: patientError } = await supabase
        .from("patients")
        .select("*")
        .eq("phone", phone)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (patientError || !patientsData) {
        return { patients: [], error: new Error("Failed to fetch patients") };
      }

      return { patients: patientsData as Patient[], error: null };
    } catch (error) {
      return { patients: [], error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("patient_phone");
    localStorage.removeItem("patient_id");
    setPatient(null);
  };

  return (
    <PatientAuthContext.Provider
      value={{
        patient,
        loading,
        isAuthenticated: !!patient,
        demoMode,
        sendOtp,
        verifyOtp,
        selectPatient,
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
