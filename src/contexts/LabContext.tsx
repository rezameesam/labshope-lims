import { createContext, useCallback, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";

interface Lab {
  id: string;
  organization_id?: string | null;
  lab_code: string;
  name: string;
  type: string;
  parent_lab_id: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean | null;
  logo_url: string | null;
  settings: unknown;
  created_at: string;
  updated_at: string;
}

interface LabUser {
  id: string;
  lab_id: string;
  user_id: string;
  role: string;
  is_primary: boolean | null;
  created_at: string;
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
  const { isPlatformAdmin, loading: platformAdminLoading } = usePlatformAdmin();
  const [currentLab, setCurrentLabState] = useState<Lab | null>(null);
  const [availableLabs, setAvailableLabs] = useState<Lab[]>([]);
  const [labUsers, setLabUsers] = useState<LabUser[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUserLabs = useCallback(async () => {
    if (platformAdminLoading) {
      return;
    }

    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Always load labs the user personally belongs to via lab_users.
      // Platform pages (/platform/*) query Supabase directly and never rely on
      // LabContext, so there is no need to load every org's lab here. Loading
      // all labs here incorrectly sets currentLab to an arbitrary org's lab for
      // users who are both a platform admin and a regular org admin.
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
        .map((lu: any) => lu.lab)
        .filter((lab: any): lab is Lab => lab !== null && lab.is_active);

      setAvailableLabs(labs);
      setLabUsers(userLabs || []);

      // Set primary lab or first lab as current — only update if the ID changed
      const primaryLabUser = userLabs?.find((lu) => lu.is_primary);
      const primaryLab = primaryLabUser?.lab || labs[0];

      if (primaryLab) {
        const savedLabId = localStorage.getItem("currentLabId");
        const savedLab = savedLabId ? labs.find((l) => l.id === savedLabId) : null;
        const labToSet = savedLab || primaryLab;

        setCurrentLabState((prev) => {
          if (prev?.id === labToSet.id) return prev;
          localStorage.setItem("currentLabId", labToSet.id);
          return labToSet;
        });
      }
    } catch (error) {
      console.error("Error fetching user labs:", error);
    } finally {
      setLoading(false);
    }
    // NOTE: currentLab intentionally excluded from deps — including it causes an
    // infinite loop because fetchUserLabs sets currentLab, which would recreate
    // the callback, which would re-run the effect.
  }, [platformAdminLoading, user]);

  useEffect(() => {
    void fetchUserLabs();
  }, [fetchUserLabs]);

  const setCurrentLab = (lab: Lab | null) => {
    setCurrentLabState(lab);
    if (lab) {
      localStorage.setItem("currentLabId", lab.id);
    } else {
      localStorage.removeItem("currentLabId");
    }
  };

  const hasLabAccess = (labId: string): boolean => {
    if (isPlatformAdmin) return true;
    return labUsers.some((lu) => lu.lab_id === labId);
  };

  const isLabAdmin = (labId?: string): boolean => {
    if (isPlatformAdmin) return true;
    if (hasRole("admin")) {
      const targetLabId = labId || currentLab?.id;
      if (!targetLabId) return false;
      return availableLabs.some((lab) => lab.id === targetLabId);
    }
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
