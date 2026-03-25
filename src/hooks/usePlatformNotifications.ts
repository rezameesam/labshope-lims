import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PlatformNotification = {
  id: string;
  title: string;
  description: string;
  type: "lead" | "onboarding" | "dns" | "system" | "revenue";
  link: string | null;
  is_read: boolean;
  created_at: string;
  created_by: string | null;
};

// Module-level cache and fetch state to ensure stability across hook instances
let cachedNotifications: PlatformNotification[] = [];
let lastFetchAt = 0;
let inFlightFetch: Promise<PlatformNotification[]> | null = null;
const THROTTLE_MS = 2000;

export const usePlatformNotifications = () => {
  // Initialize state from cache to prevent unnecessary loading states
  const [notifications, setNotifications] = useState<PlatformNotification[]>(cachedNotifications);
  const [loading, setLoading] = useState(cachedNotifications.length === 0);

  const fetchNotifications = useCallback(async () => {
    // 1. If a fetch is already in progress, wait for it and share results
    if (inFlightFetch) {
      try {
        const data = await inFlightFetch;
        setNotifications(data);
        setLoading(false);
        return;
      } catch (err) {
        // If shared fetch fails, fall through to allow a retry
      }
    }

    // 2. Throttle: Use cache if it's fresh enough
    const now = Date.now();
    if (now - lastFetchAt < THROTTLE_MS && cachedNotifications.length > 0) {
      setNotifications(cachedNotifications);
      setLoading(false);
      return;
    }

    // 3. Initiate a new fetch
    inFlightFetch = (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("platform_notifications")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) throw error;
        
        const result = (data || []) as PlatformNotification[];
        cachedNotifications = result;
        lastFetchAt = Date.now(); // Updated only on success
        return result;
      } finally {
        inFlightFetch = null;
      }
    })();

    try {
      const data = await inFlightFetch;
      setNotifications(data);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      setLoading(false);
    }
  }, []); // Dependencies are now stable

  const markAsRead = useCallback(async (id: string) => {
    // Optimistically update cache and local state
    cachedNotifications = cachedNotifications.map((n) => 
      n.id === id ? { ...n, is_read: true } : n
    );
    setNotifications(cachedNotifications);

    await (supabase as any)
      .from("platform_notifications")
      .update({ is_read: true })
      .eq("id", id);
  }, []);

  const markAllAsRead = useCallback(async () => {
    // Optimistically update cache and local state
    cachedNotifications = cachedNotifications.map((n) => ({ ...n, is_read: true }));
    setNotifications(cachedNotifications);

    await (supabase as any)
      .from("platform_notifications")
      .update({ is_read: true })
      .eq("is_read", false);
  }, []);

  useEffect(() => {
    void fetchNotifications();

    const channel = supabase
      .channel("platform-notifications")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "platform_notifications" },
        () => {
          void fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchNotifications]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return { notifications, unreadCount, markAsRead, markAllAsRead, loading };
};
