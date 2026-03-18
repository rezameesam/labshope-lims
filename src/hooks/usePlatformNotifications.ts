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

export const usePlatformNotifications = () => {
  const [notifications, setNotifications] = useState<PlatformNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("platform_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setNotifications((data || []) as PlatformNotification[]);
    setLoading(false);
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    await (supabase as any)
      .from("platform_notifications")
      .update({ is_read: true })
      .eq("id", id);
  }, []);

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
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
