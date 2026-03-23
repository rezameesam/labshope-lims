import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const PLATFORM_ADMIN_CACHE_TTL = 60_000;
const platformAdminCache = new Map<string, { value: boolean; expiresAt: number }>();
const platformAdminInFlight = new Map<string, Promise<boolean>>();

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

      const cached = platformAdminCache.get(user.id);
      if (cached && cached.expiresAt > Date.now()) {
        if (isMounted) {
          setIsPlatformAdmin(cached.value);
          setLoading(false);
        }
        return;
      }

      const existing = platformAdminInFlight.get(user.id);
      const request =
        existing ||
        (async () => {
          const { data, error } = await (supabase as any)
            .from("platform_admins")
            .select("user_id")
            .eq("user_id", user.id)
            .maybeSingle();

          if (error) {
            console.error("Error checking platform admin membership:", error);
            return false;
          }

          const value = Boolean(data?.user_id);
          platformAdminCache.set(user.id, { value, expiresAt: Date.now() + PLATFORM_ADMIN_CACHE_TTL });
          return value;
        })();

      if (!existing) {
        platformAdminInFlight.set(user.id, request);
      }

      const value = await request.finally(() => {
        platformAdminInFlight.delete(user.id);
      });

      if (!isMounted) {
        return;
      }

      setIsPlatformAdmin(value);
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
