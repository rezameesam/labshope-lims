import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PlatformLead = {
  id: string;
  created_at: string;
  updated_at: string | null;
  full_name: string;
  lab_name: string;
  email: string;
  phone: string;
  city: string | null;
  branch_count: number | null;
  notes: string | null;
  status_notes: string | null;
  status: string;
  contacted_at: string | null;
  qualified_at: string | null;
  closed_at: string | null;
  assigned_to: string | null;
  assigned_at: string | null;
  next_follow_up_at: string | null;
  hostname: string | null;
  page_path: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
};

export type LeadUpdates = Partial<
  Pick<PlatformLead, "status" | "status_notes" | "assigned_to" | "next_follow_up_at">
>;

export const PLATFORM_LEADS_QUERY_KEY = ["platform-leads"] as const;

async function fetchLeads(): Promise<PlatformLead[]> {
  const { data, error } = await (supabase as any)
    .from("platform_demo_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data || []) as PlatformLead[];
}

export function usePlatformLeads() {
  return useQuery({
    queryKey: PLATFORM_LEADS_QUERY_KEY,
    queryFn: fetchLeads,
    staleTime: 30 * 1000,
  });
}

export function useUpdatePlatformLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, updates }: { leadId: string; updates: LeadUpdates }) => {
      const { data, error } = await (supabase as any)
        .from("platform_demo_requests")
        .update(updates)
        .eq("id", leadId)
        .select("*")
        .single();
      if (error) throw error;
      return data as PlatformLead;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PLATFORM_LEADS_QUERY_KEY });
    },
  });
}

export function useConvertLeadToOnboarding() {
  return useMutation({
    mutationFn: async (params: {
      organization_name: string;
      owner_full_name: string;
      owner_email: string;
      owner_phone: string;
      city: string;
      branch_count: number;
      selected_plan: "starter" | "growth" | "premium";
      utm_source: string | null;
      utm_medium: string | null;
      utm_campaign: string | null;
    }) => {
      const { error } = await (supabase as any)
        .from("platform_onboarding_requests")
        .insert({
          ...params,
          setup_mode: "assisted",
          status: "reviewing",
        });
      if (error) throw error;
    },
  });
}
