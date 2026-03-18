import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useAuditLog() {
  const { user } = useAuth();

  const logAction = useCallback(
    async (
      action: string,
      entity_type: string,
      entity_id: string,
      details: Record<string, unknown> = {},
    ) => {
      try {
        await (supabase as any).from("platform_audit_log").insert({
          action,
          entity_type,
          entity_id,
          details,
          user_id: user?.id ?? null,
          created_at: new Date().toISOString(),
        });
      } catch {
        // Audit log failures are non-fatal — do not surface to user
      }
    },
    [user?.id],
  );

  return { logAction };
}
