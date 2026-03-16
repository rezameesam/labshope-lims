import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const usePlatformAdmin = () => {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user?.id) {
      setIsPlatformAdmin(false);
      setLoading(false);
      return;
    }

    let isMounted = true;

    const fetchPlatformAdmin = async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error("Error checking platform admin membership:", error);
        setIsPlatformAdmin(false);
      } else {
        setIsPlatformAdmin(Boolean(data?.user_id));
      }
      setLoading(false);
    };

    void fetchPlatformAdmin();

    return () => {
      isMounted = false;
    };
  }, [authLoading, user?.id]);

  return {
    loading: authLoading || loading,
    isPlatformAdmin,
  };
};
