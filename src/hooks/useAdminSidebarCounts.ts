import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AdminSidebarCounts = {
  bookingRequests: number;
  noticeBoard: number;
};

type UseAdminSidebarCountsOptions = {
  enabled: boolean;
  organizationId?: string;
  isCollector: boolean;
  userId?: string;
};

const EMPTY_COUNTS: AdminSidebarCounts = {
  bookingRequests: 0,
  noticeBoard: 0,
};

type ReminderRow = {
  reminder_date: string;
  due_date?: string | null;
};

const countRelevantReminders = (reminders: ReminderRow[]) => {
  const today = new Date();

  return reminders.filter((reminder) => {
    const reminderDate = new Date(reminder.reminder_date);
    const dueDate = reminder.due_date ? new Date(reminder.due_date) : null;
    const isOverdue = reminderDate < today;
    const isUpcoming =
      reminderDate.toDateString() === today.toDateString() || (dueDate ? dueDate < today : false);

    return isOverdue || isUpcoming;
  }).length;
};

export const useAdminSidebarCounts = ({
  enabled,
  organizationId,
  isCollector,
  userId,
}: UseAdminSidebarCountsOptions) => {
  const [sidebarCounts, setSidebarCounts] = useState<AdminSidebarCounts>(EMPTY_COUNTS);

  const fetchSidebarCounts = useCallback(async () => {
    if (!organizationId) {
      setSidebarCounts(EMPTY_COUNTS);
      return;
    }

    try {
      let testsQuery = (supabase as any)
        .from("patient_tests")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "in_progress"])
        .eq("organization_id", organizationId);

      if (isCollector && userId) {
        testsQuery = testsQuery.eq("collected_by", userId);
      }

      const bookingRequestsQuery = (supabase as any)
        .from("booking_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "new")
        .eq("organization_id", organizationId);

      const remindersQuery = (supabase as any)
        .from("patient_reminders")
        .select("id, reminder_date, due_date, is_completed")
        .eq("is_completed", false)
        .eq("organization_id", organizationId)
        .limit(100);

      const invoicesQuery = (supabase as any)
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .neq("payment_status", "paid")
        .eq("organization_id", organizationId);

      const [bookingRequestsResult, pendingTestsResult, remindersResult, invoicesResult] =
        await Promise.all([
          bookingRequestsQuery,
          testsQuery,
          remindersQuery,
          invoicesQuery,
        ]);

      setSidebarCounts({
        bookingRequests: bookingRequestsResult.count || 0,
        noticeBoard:
          (pendingTestsResult.count || 0) +
          countRelevantReminders((remindersResult.data || []) as ReminderRow[]) +
          (invoicesResult.count || 0),
      });
    } catch (error) {
      console.error("Error fetching admin sidebar counts:", error);
    }
  }, [isCollector, organizationId, userId]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!organizationId) {
      setSidebarCounts(EMPTY_COUNTS);
      return;
    }

    void fetchSidebarCounts();

    const intervalId = window.setInterval(() => {
      void fetchSidebarCounts();
    }, 60000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, fetchSidebarCounts, organizationId]);

  return {
    sidebarCounts,
    setSidebarCounts,
  };
};
