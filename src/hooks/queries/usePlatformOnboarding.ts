import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PlatformOnboardingRequest = {
  id: string;
  created_at: string;
  updated_at: string | null;
  status: "new" | "reviewing" | "approved" | "closed";
  status_notes: string | null;
  assigned_to: string | null;
  assigned_at: string | null;
  next_follow_up_at: string | null;
  reviewing_at: string | null;
  approved_at: string | null;
  closed_at: string | null;
  resolved_slug: string | null;
  resolved_domain: string | null;
  resolved_access_domain: string | null;
  provisioned_organization_id: string | null;
  provisioned_lab_id: string | null;
  provisioned_owner_user_id: string | null;
  provisioned_by: string | null;
  provisioned_at: string | null;
  provisioning_error: string | null;
  selected_plan: "starter" | "growth" | "premium";
  setup_mode: "self_serve" | "assisted";
  organization_name: string;
  primary_lab_name: string | null;
  owner_full_name: string;
  owner_email: string;
  owner_phone: string;
  city: string | null;
  custom_domain: string | null;
  branch_count: number;
  preferred_subdomain: string | null;
  go_live_target: string | null;
  needs_data_import: boolean;
  needs_white_label: boolean;
  notes: string | null;
  coupon_code: string | null;
  hostname: string | null;
  page_path: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
};

export type PlatformDomainRecord = {
  id: string;
  organization_id: string;
  domain: string;
  is_primary: boolean;
  verified_at: string | null;
};

export type OnboardingData = {
  requests: PlatformOnboardingRequest[];
  organizationDomains: Record<string, PlatformDomainRecord[]>;
};

export type OnboardingRequestUpdates = Partial<
  Pick<PlatformOnboardingRequest, "status" | "status_notes" | "assigned_to" | "next_follow_up_at">
>;

export const PLATFORM_ONBOARDING_QUERY_KEY = ["platform-onboarding"] as const;

async function fetchOnboardingData(): Promise<OnboardingData> {
  const { data, error } = await (supabase as any)
    .from("platform_onboarding_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  const requests = (data || []) as PlatformOnboardingRequest[];

  const provisionedOrganizationIds = Array.from(
    new Set(
      requests
        .map((r) => r.provisioned_organization_id)
        .filter((v): v is string => Boolean(v)),
    ),
  );

  let organizationDomains: Record<string, PlatformDomainRecord[]> = {};

  if (provisionedOrganizationIds.length > 0) {
    const { data: domainsData, error: domainsError } = await (supabase as any)
      .from("organization_domains")
      .select("id, organization_id, domain, is_primary, verified_at")
      .in("organization_id", provisionedOrganizationIds);

    if (!domainsError) {
      organizationDomains = ((domainsData || []) as PlatformDomainRecord[]).reduce<
        Record<string, PlatformDomainRecord[]>
      >((acc, domain) => {
        acc[domain.organization_id] = [...(acc[domain.organization_id] || []), domain];
        return acc;
      }, {});
    }
  }

  return { requests, organizationDomains };
}

export function usePlatformOnboarding() {
  return useQuery({
    queryKey: PLATFORM_ONBOARDING_QUERY_KEY,
    queryFn: fetchOnboardingData,
    staleTime: 30 * 1000,
  });
}

export function useUpdateOnboardingRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      requestId,
      updates,
    }: {
      requestId: string;
      updates: OnboardingRequestUpdates;
    }) => {
      const { data, error } = await (supabase as any)
        .from("platform_onboarding_requests")
        .update(updates)
        .eq("id", requestId)
        .select("*")
        .single();
      if (error) throw error;
      return data as PlatformOnboardingRequest;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PLATFORM_ONBOARDING_QUERY_KEY });
    },
  });
}

export function useProvisionOnboardingRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const { data, error } = await supabase.functions.invoke("provision-onboarding-request", {
        body: { request_id: requestId },
      });
      if (error) throw error;
      return (data || {}) as Record<string, unknown>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PLATFORM_ONBOARDING_QUERY_KEY });
    },
  });
}

export function useToggleDomainVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      domainRecordId,
      organizationId,
      currentVerifiedAt,
    }: {
      domainRecordId: string;
      organizationId: string;
      currentVerifiedAt: string | null;
    }) => {
      const nextVerifiedAt = currentVerifiedAt ? null : new Date().toISOString();
      const { error } = await (supabase as any)
        .from("organization_domains")
        .update({ verified_at: nextVerifiedAt })
        .eq("id", domainRecordId)
        .eq("organization_id", organizationId);
      if (error) throw error;
      return { nextVerifiedAt, domainRecordId, organizationId };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PLATFORM_ONBOARDING_QUERY_KEY });
    },
  });
}
