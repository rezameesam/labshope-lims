import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type OrganizationRow = {
  id: string;
  slug: string;
  display_name: string;
  status: string;
  created_at: string;
};

type OrganizationDomain = {
  id: string;
  organization_id: string;
  domain: string;
  is_primary: boolean;
  verified_at: string | null;
};

type OrganizationSettingRow = {
  organization_id: string;
  setting_key: string;
  setting_value: string | null;
};

type OnboardingRow = {
  id: string;
  organization_name: string;
  selected_plan: "starter" | "growth" | "premium";
  setup_mode: "self_serve" | "assisted";
  provisioned_organization_id: string | null;
  custom_domain: string | null;
  status: string;
  created_at: string;
};

type AggregateRow = { organization_id: string | null };
type PaymentAggregateRow = { organization_id: string | null; amount: number | null };

export type OrgHealth = {
  email: boolean;
  whatsapp: boolean;
  payment: boolean;
  domain: boolean;
  abdm: boolean;
};

export type CustomerRecord = {
  id: string;
  slug: string;
  displayName: string;
  status: string;
  createdAt: string;
  selectedPlan: "starter" | "growth" | "premium" | "unassigned";
  setupMode: "self_serve" | "assisted" | "unknown";
  onboardingStatus: string | null;
  primaryDomain: string | null;
  fallbackDomain: string | null;
  customDomainConnected: boolean;
  customDomainPending: boolean;
  labsCount: number;
  patientsCount: number;
  invoicesCount: number;
  paymentsTotal: number;
  onboardingRequestId: string | null;
  health: OrgHealth;
};

function getOrgHealth(
  orgId: string,
  settingsMap: Map<string, Map<string, string>>,
  domains: OrganizationDomain[],
): OrgHealth {
  const s = settingsMap.get(orgId) || new Map<string, string>();
  return {
    email: !!(
      s.get("resend_api_key") ||
      s.get("sendgrid_api_key") ||
      s.get("mailjet_api_key") ||
      s.get("mailgun_api_key")
    ),
    whatsapp: !!(s.get("whatsapp_phone_number_id")),
    payment: !!(s.get("razorpay_key_id") || s.get("phonepe_merchant_id") || s.get("payu_key")),
    domain: domains.some(
      (d) => d.organization_id === orgId && d.verified_at && d.is_primary,
    ),
    abdm: !!(
      s.get("abdm_enabled") === "true" &&
      s.get("abdm_hip_id")?.trim() &&
      s.get("abdm_facility_id")?.trim() &&
      s.get("abdm_client_id")?.trim() &&
      s.get("abdm_client_secret")?.trim()
    ),
  };
}

export function isFullyConnected(health: OrgHealth): boolean {
  return health.email && health.whatsapp && health.payment && health.domain && health.abdm;
}

async function fetchCustomers(): Promise<CustomerRecord[]> {
  const [
    organizationsResult,
    domainsResult,
    onboardingResult,
    labsResult,
    patientsResult,
    invoicesResult,
    paymentsResult,
  ] = await Promise.all([
    (supabase as any)
      .from("organizations")
      .select("id, slug, display_name, status, created_at")
      .order("created_at", { ascending: false }),
    (supabase as any)
      .from("organization_domains")
      .select("id, organization_id, domain, is_primary, verified_at"),
    (supabase as any)
      .from("platform_onboarding_requests")
      .select("id, organization_name, selected_plan, setup_mode, provisioned_organization_id, custom_domain, status, created_at")
      .not("provisioned_organization_id", "is", null)
      .order("created_at", { ascending: false }),
    (supabase as any).from("labs").select("organization_id"),
    (supabase as any).from("patients").select("organization_id"),
    (supabase as any).from("invoices").select("organization_id"),
    (supabase as any).from("payments").select("organization_id, amount"),
  ]);

  if (
    organizationsResult.error ||
    domainsResult.error ||
    onboardingResult.error ||
    labsResult.error ||
    patientsResult.error ||
    invoicesResult.error ||
    paymentsResult.error
  ) {
    throw new Error("Failed to load platform customers");
  }

  const organizations = (organizationsResult.data || []) as OrganizationRow[];
  const domains = (domainsResult.data || []) as OrganizationDomain[];
  const onboarding = (onboardingResult.data || []) as OnboardingRow[];
  const labs = (labsResult.data || []) as AggregateRow[];
  const patients = (patientsResult.data || []) as AggregateRow[];
  const invoices = (invoicesResult.data || []) as AggregateRow[];
  const payments = (paymentsResult.data || []) as PaymentAggregateRow[];

  const orgIds = organizations.map((o) => o.id);
  let allSettings: OrganizationSettingRow[] = [];
  if (orgIds.length > 0) {
    const { data: settingsData } = await (supabase as any)
      .from("organization_settings")
      .select("organization_id, setting_key, setting_value")
      .in("organization_id", orgIds);
    allSettings = (settingsData || []) as OrganizationSettingRow[];
  }

  const settingsMap = new Map<string, Map<string, string>>();
  for (const row of allSettings) {
    if (!row.organization_id) continue;
    if (!settingsMap.has(row.organization_id)) {
      settingsMap.set(row.organization_id, new Map<string, string>());
    }
    if (row.setting_value != null) {
      settingsMap.get(row.organization_id)!.set(row.setting_key, row.setting_value);
    }
  }

  const countByOrganization = (rows: AggregateRow[]) =>
    rows.reduce<Record<string, number>>((acc, row) => {
      if (!row.organization_id) return acc;
      acc[row.organization_id] = (acc[row.organization_id] || 0) + 1;
      return acc;
    }, {});

  const paymentsByOrganization = payments.reduce<Record<string, number>>((acc, row) => {
    if (!row.organization_id) return acc;
    acc[row.organization_id] = (acc[row.organization_id] || 0) + Number(row.amount || 0);
    return acc;
  }, {});

  const latestOnboardingByOrganization = onboarding.reduce<Record<string, OnboardingRow>>(
    (acc, row) => {
      if (!row.provisioned_organization_id || acc[row.provisioned_organization_id]) return acc;
      acc[row.provisioned_organization_id] = row;
      return acc;
    },
    {},
  );

  const labsCount = countByOrganization(labs);
  const patientsCount = countByOrganization(patients);
  const invoicesCount = countByOrganization(invoices);

  return organizations.map((organization) => {
    const orgDomains = domains.filter((d) => d.organization_id === organization.id);
    const primaryDomain = orgDomains.find((d) => d.is_primary) || null;
    const fallbackDomain =
      orgDomains.find((d) => !d.is_primary) ||
      orgDomains.find((d) => d.domain.endsWith(".localhost")) ||
      null;
    const onboardingRequest = latestOnboardingByOrganization[organization.id] || null;
    const hasCustomPrimaryDomain = Boolean(primaryDomain && !primaryDomain.domain.endsWith(".localhost"));

    const settingsForOrg = settingsMap.get(organization.id);
    const planTierFromSettings = settingsForOrg?.get("plan_tier") as CustomerRecord["selectedPlan"] | undefined;
    const resolvedPlan: CustomerRecord["selectedPlan"] =
      planTierFromSettings && ["starter", "growth", "premium"].includes(planTierFromSettings)
        ? planTierFromSettings
        : onboardingRequest?.selected_plan || "unassigned";

    const health = getOrgHealth(organization.id, settingsMap, domains);

    return {
      id: organization.id,
      slug: organization.slug,
      displayName: organization.display_name,
      status: organization.status,
      createdAt: organization.created_at,
      selectedPlan: resolvedPlan,
      setupMode: onboardingRequest?.setup_mode || "unknown",
      onboardingStatus: onboardingRequest?.status || null,
      primaryDomain: primaryDomain?.domain || null,
      fallbackDomain: fallbackDomain?.domain || null,
      customDomainConnected: Boolean(hasCustomPrimaryDomain && primaryDomain?.verified_at),
      customDomainPending: Boolean(hasCustomPrimaryDomain && !primaryDomain?.verified_at),
      labsCount: labsCount[organization.id] || 0,
      patientsCount: patientsCount[organization.id] || 0,
      invoicesCount: invoicesCount[organization.id] || 0,
      paymentsTotal: paymentsByOrganization[organization.id] || 0,
      onboardingRequestId: onboardingRequest?.id || null,
      health,
    } satisfies CustomerRecord;
  });
}

export const PLATFORM_CUSTOMERS_QUERY_KEY = ["platform-customers"] as const;

export function usePlatformCustomers() {
  return useQuery({
    queryKey: PLATFORM_CUSTOMERS_QUERY_KEY,
    queryFn: fetchCustomers,
    staleTime: 30 * 1000,
  });
}
