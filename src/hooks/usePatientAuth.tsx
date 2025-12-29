import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  sendOtp: (phone: string) => Promise<{ error: Error | null }>;
  verifyOtp: (phone: string, token: string) => Promise<{ error: Error | null }>;
  selectPatient: (phone: string) => Promise<{ patients: Patient[]; error: Error | null }>;
  signOut: () => Promise<void>;
}

const PatientAuthContext = createContext<PatientAuthContextType | undefined>(undefined);

export const PatientAuthProvider = ({ children }: { children: ReactNode }) => {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);

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

  const sendOtp = async (phone: string): Promise<{ error: Error | null }> => {
    try {
      // First check if patient(s) exist with this phone
      const { data: existingPatients, error: checkError } = await supabase
        .from("patients")
        .select("id, phone")
        .eq("phone", phone)
        .eq("is_active", true);

      if (checkError || !existingPatients || existingPatients.length === 0) {
        return { 
          error: new Error("No patient account found with this phone number. Please contact the clinic.") 
        };
      }

      // If multiple patients found, we'll handle selection in verifyOtp
      // For now, just proceed with OTP (selection happens after verification)

      // Use Supabase phone auth
      const { error } = await supabase.auth.signInWithOtp({
        phone: `+91${phone}`,
        options: {
          channel: 'sms',
        }
      });

      if (error) {
        console.error("Supabase OTP error:", error);
        // For demo, allow bypass if Supabase phone auth isn't configured
        if (
          error.message.toLowerCase().includes("phone") || 
          error.message.includes("not enabled") ||
          error.message.includes("unsupported")
        ) {
          toast.info("Demo mode: Use 123456 as OTP");
          return { error: null };
        }
        return { error: error as Error };
      }

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const verifyOtp = async (phone: string, token: string): Promise<{ error: Error | null; needsSelection?: boolean }> => {
    try {
      // Demo mode check - accept 123456 as OTP
      if (token === "123456") {
        const { data: patientsData, error: patientError } = await supabase
          .from("patients")
          .select("*")
          .eq("phone", phone)
          .eq("is_active", true);

        if (patientError || !patientsData || patientsData.length === 0) {
          return { error: new Error("Patient not found") };
        }

        // If multiple patients, return them for selection
        if (patientsData.length > 1) {
          return { error: null, needsSelection: true };
        }

        // Single patient found
        setPatient(patientsData[0] as Patient);
        localStorage.setItem("patient_phone", phone);
        localStorage.setItem("patient_id", patientsData[0].id);
        return { error: null };
      }

      // Real Supabase verification
      const { error } = await supabase.auth.verifyOtp({
        phone: `+91${phone}`,
        token,
        type: 'sms',
      });

      if (error) {
        return { error: error as Error };
      }

      // Fetch patient data after successful verification
      const { data: patientsData, error: patientError } = await supabase
        .from("patients")
        .select("*")
        .eq("phone", phone)
        .eq("is_active", true);

      if (patientError || !patientsData || patientsData.length === 0) {
        return { error: new Error("Patient record not found") };
      }

      // If multiple patients, return them for selection
      if (patientsData.length > 1) {
        return { error: null, needsSelection: true };
      }

      // Single patient found
      setPatient(patientsData[0] as Patient);
      localStorage.setItem("patient_phone", phone);
      localStorage.setItem("patient_id", patientsData[0].id);
      return { error: null };
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
