import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type NotificationType = "lead" | "onboarding" | "dns" | "system" | "revenue";

type CreateNotificationInput = {
  title: string;
  description: string;
  type: NotificationType;
  link?: string;
};

export const useNotificationTrigger = () => {
  const { user } = useAuth();

  const createNotification = useCallback(
    async (input: CreateNotificationInput) => {
      try {
        await (supabase as any).from("platform_notifications").insert({
          title: input.title,
          description: input.description,
          type: input.type,
          link: input.link ?? null,
          is_read: false,
          created_at: new Date().toISOString(),
          created_by: user?.id ?? null,
        });
      } catch {
        // Non-fatal — notification failures must not disrupt the UI
      }
    },
    [user?.id]
  );

  return { createNotification };
};
