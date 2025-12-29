import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Lab {
  id: string;
  lab_code: string;
  name: string;
  type: "main" | "branch" | "collection_center";
  parent_lab_id: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
}

interface LabUser {
  id: string;
  lab_id: string;
  role: "admin" | "manager" | "employee";
  is_primary: boolean;
  lab?: Lab;
}

interface LabContextType {
  currentLab: Lab | null;
  availableLabs: Lab[];
  labUsers: LabUser[];
  loading: boolean;
  setCurrentLab: (lab: Lab | null) => void;
  refreshLabs: () => Promise<void>;
  hasLabAccess: (labId: string) => boolean;
  isLabAdmin: (labId?: string) => boolean;
}

const LabContext = createContext<LabContextType | undefined>(undefined);

export const LabProvider = ({ children }: { children: ReactNode }) => {
  const { user, hasRole } = useAuth();
  const [currentLab, setCurrentLabState] = useState<Lab | null>(null);
  const [availableLabs, setAvailableLabs] = useState<Lab[]>([]);
  const [labUsers, setLabUsers] = useState<LabUser[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUserLabs = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // If user is system admin, get all labs
      if (hasRole("admin")) {
        const { data: allLabs, error: labsError } = await supabase
          .from("labs")
          .select("*")
          .eq("is_active", true)
          .order("name");

        if (labsError) throw labsError;
        setAvailableLabs(allLabs || []);

        // Set primary lab or first lab as current
        const primaryLab = allLabs?.find((lab) => lab.lab_code === "LAB001") || allLabs?.[0];
        if (primaryLab && !currentLab) {
          setCurrentLabState(primaryLab);
          localStorage.setItem("currentLabId", primaryLab.id);
        }
      } else {
        // Get labs user has access to
        const { data: userLabs, error: userLabsError } = await supabase
          .from("lab_users")
          .select(`
            *,
            lab:labs(*)
          `)
          .eq("user_id", user.id)
          .order("is_primary", { ascending: false });

        if (userLabsError) throw userLabsError;

        const labs = (userLabs || [])
          .map((lu) => lu.lab)
          .filter((lab): lab is Lab => lab !== null && lab.is_active);

        setAvailableLabs(labs);
        setLabUsers(userLabs || []);

        // Set primary lab or first lab as current
        const primaryLabUser = userLabs?.find((lu) => lu.is_primary);
        const primaryLab = primaryLabUser?.lab || labs[0];
        
        if (primaryLab) {
          const savedLabId = localStorage.getItem("currentLabId");
          const savedLab = savedLabId ? labs.find((l) => l.id === savedLabId) : null;
          const labToSet = savedLab || primaryLab;
          
          setCurrentLabState(labToSet);
          localStorage.setItem("currentLabId", labToSet.id);
        }
      }
    } catch (error) {
      console.error("Error fetching user labs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserLabs();
  }, [user]);

  const setCurrentLab = (lab: Lab | null) => {
    setCurrentLabState(lab);
    if (lab) {
      localStorage.setItem("currentLabId", lab.id);
    } else {
      localStorage.removeItem("currentLabId");
    }
  };

  const hasLabAccess = (labId: string): boolean => {
    if (hasRole("admin")) return true;
    return labUsers.some((lu) => lu.lab_id === labId);
  };

  const isLabAdmin = (labId?: string): boolean => {
    if (hasRole("admin")) return true;
    const targetLabId = labId || currentLab?.id;
    if (!targetLabId) return false;
    return labUsers.some(
      (lu) => lu.lab_id === targetLabId && (lu.role === "admin" || lu.role === "manager")
    );
  };

  const refreshLabs = async () => {
    setLoading(true);
    await fetchUserLabs();
  };

  return (
    <LabContext.Provider
      value={{
        currentLab,
        availableLabs,
        labUsers,
        loading,
        setCurrentLab,
        refreshLabs,
        hasLabAccess,
        isLabAdmin,
      }}
    >
      {children}
    </LabContext.Provider>
  );
};

export const useLab = () => {
  const context = useContext(LabContext);
  if (context === undefined) {
    throw new Error("useLab must be used within a LabProvider");
  }
  return context;
};

