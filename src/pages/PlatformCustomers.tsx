import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, ExternalLink, Globe2, Loader2, RefreshCw, Search, Users } from "lucide-react";
import PlatformAdminLayout from "@/components/platform/PlatformAdminLayout";
import { Button } from "@/components/ui/button";
import { DataPagination } from "@/components/ui/data-pagination";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { formatAppDateTime } from "@/lib/date";
import { toast } from "sonner";

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

type AggregateRow = {
  organization_id: string | null;
};

type PaymentAggregateRow = {
  organization_id: string | null;
  amount: number | null;
};

type OrgHealth = {
  email: boolean;
  whatsapp: boolean;
  payment: boolean;
  domain: boolean;
  abdm: boolean;
};

type CustomerRecord = {
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
    payment: !!(s.get("razorpay_key_id")),
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

const planOptions = ["all", "starter", "growth", "premium", "unassigned"] as const;
type PlanFilter = (typeof planOptions)[number];

const statusOptions = ["all", "connected", "pending_dns", "fallback_only"] as const;
type StatusFilter = (typeof statusOptions)[number];

const healthOptions = ["all", "fully_connected", "has_issues"] as const;
type HealthFilter = (typeof healthOptions)[number];

function isFullyConnected(health: OrgHealth): boolean {
  return health.email && health.whatsapp && health.payment && health.domain && health.abdm;
}

function getPlanBadgeClass(plan: CustomerRecord["selectedPlan"]): string {
  switch (plan) {
    case "starter":
      return "border-slate-300 bg-white text-slate-700";
    case "growth":
      return "border-blue-300 bg-blue-50 text-blue-700";
    case "premium":
      return "border-amber-300 bg-amber-50 text-amber-700";
    case "unassigned":
      return "border-red-300 bg-red-50 text-red-600";
    default:
      return "border-slate-200 bg-white text-slate-700";
  }
}

const PlatformCustomers = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, isStaff } = useAuth();
  const { loading: platformAdminLoading, isPlatformAdmin } = usePlatformAdmin();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [planFilter, setPlanFilter] = useState<PlanFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/platform/login", { replace: true });
    }
  }, [authLoading, navigate, user]);

  useEffect(() => {
    if (!authLoading && user && !isStaff) {
      navigate("/", { replace: true });
    }
  }, [authLoading, isStaff, navigate, user]);

  const loadCustomers = async () => {
    setLoading(true);

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
      console.error("Error loading platform customers:", {
        organizationsError: organizationsResult.error,
        domainsError: domainsResult.error,
        onboardingError: onboardingResult.error,
        labsError: labsResult.error,
        patientsError: patientsResult.error,
        invoicesError: invoicesResult.error,
        paymentsError: paymentsResult.error,
      });
      toast.error("Failed to load platform customers.");
      setLoading(false);
      return;
    }

    const organizations = (organizationsResult.data || []) as OrganizationRow[];
    const domains = (domainsResult.data || []) as OrganizationDomain[];
    const onboarding = (onboardingResult.data || []) as OnboardingRow[];
    const labs = (labsResult.data || []) as AggregateRow[];
    const patients = (patientsResult.data || []) as AggregateRow[];
    const invoices = (invoicesResult.data || []) as AggregateRow[];
    const payments = (paymentsResult.data || []) as PaymentAggregateRow[];

    // Fetch organization_settings for all orgs in one query
    const orgIds = organizations.map((o) => o.id);
    let allSettings: OrganizationSettingRow[] = [];
    if (orgIds.length > 0) {
      const { data: settingsData } = await (supabase as any)
        .from("organization_settings")
        .select("organization_id, setting_key, setting_value")
        .in("organization_id", orgIds);
      allSettings = (settingsData || []) as OrganizationSettingRow[];
    }

    // Build settingsMap: Map<orgId, Map<key, value>>
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
      rows.reduce<Record<string, number>>((accumulator, row) => {
        if (!row.organization_id) {
          return accumulator;
        }
        accumulator[row.organization_id] = (accumulator[row.organization_id] || 0) + 1;
        return accumulator;
      }, {});

    const paymentsByOrganization = payments.reduce<Record<string, number>>((accumulator, row) => {
      if (!row.organization_id) {
        return accumulator;
      }
      accumulator[row.organization_id] = (accumulator[row.organization_id] || 0) + Number(row.amount || 0);
      return accumulator;
    }, {});

    const latestOnboardingByOrganization = onboarding.reduce<Record<string, OnboardingRow>>((accumulator, row) => {
      if (!row.provisioned_organization_id || accumulator[row.provisioned_organization_id]) {
        return accumulator;
      }
      accumulator[row.provisioned_organization_id] = row;
      return accumulator;
    }, {});

    const labsCount = countByOrganization(labs);
    const patientsCount = countByOrganization(patients);
    const invoicesCount = countByOrganization(invoices);

    const nextCustomers = organizations.map((organization) => {
      const organizationDomains = domains.filter((domain) => domain.organization_id === organization.id);
      const primaryDomain = organizationDomains.find((domain) => domain.is_primary) || null;
      const fallbackDomain =
        organizationDomains.find((domain) => !domain.is_primary) ||
        organizationDomains.find((domain) => domain.domain.endsWith(".localhost")) ||
        null;
      const onboardingRequest = latestOnboardingByOrganization[organization.id] || null;
      const hasCustomPrimaryDomain = Boolean(primaryDomain && !primaryDomain.domain.endsWith(".localhost"));

      // Resolve plan: prefer organization_settings plan_tier, fallback to onboarding request
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

    setCustomers(nextCustomers);
    setLoading(false);
  };

  useEffect(() => {
    if (authLoading || platformAdminLoading || !user || !isStaff || !isPlatformAdmin) {
      return;
    }

    void loadCustomers();
  }, [authLoading, isPlatformAdmin, isStaff, platformAdminLoading, user]);

  const metrics = useMemo(() => {
    const connected = customers.filter((customer) => customer.customDomainConnected).length;
    const pendingDns = customers.filter((customer) => customer.customDomainPending).length;
    const selfServe = customers.filter((customer) => customer.setupMode === "self_serve").length;
    const fullyConnected = customers.filter((customer) => isFullyConnected(customer.health)).length;

    return {
      total: customers.length,
      connected,
      pendingDns,
      selfServe,
      fullyConnected,
    };
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return customers.filter((customer) => {
      const matchesSearch =
        !normalizedSearch ||
        [customer.displayName, customer.slug, customer.primaryDomain, customer.fallbackDomain]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));

      if (!matchesSearch) {
        return false;
      }

      if (planFilter !== "all" && customer.selectedPlan !== planFilter) {
        return false;
      }

      if (statusFilter === "connected") {
        return customer.customDomainConnected;
      }

      if (statusFilter === "pending_dns") {
        return customer.customDomainPending;
      }

      if (statusFilter === "fallback_only") {
        return !customer.customDomainConnected && !customer.customDomainPending;
      }

      if (healthFilter === "fully_connected") {
        return isFullyConnected(customer.health);
      }

      if (healthFilter === "has_issues") {
        return !isFullyConnected(customer.health);
      }

      return true;
    });
  }, [customers, planFilter, searchTerm, statusFilter, healthFilter]);

  useEffect(() => { setPage(1); }, [searchTerm, planFilter, statusFilter, healthFilter]);

  const pagedCustomers = useMemo(
    () => filteredCustomers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredCustomers, page],
  );

  if (authLoading || platformAdminLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !isStaff || !isPlatformAdmin) {
    return null;
  }

  return (
    <PlatformAdminLayout>
      <TooltipProvider>
        <div className="space-y-6">
          <Card className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-5">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                    <Building2 className="h-3.5 w-3.5" />
                    Customer Ops
                  </div>
                  <CardTitle className="mt-4 text-3xl text-slate-950">Platform customers</CardTitle>
                  <CardDescription className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                    One customer operations view for tenants, plans, domains, and launch posture.
                  </CardDescription>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={() => void loadCustomers()}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Organizations</p>
                <p className="mt-2 text-3xl font-bold text-slate-950">{metrics.total}</p>
                <p className="mt-2 text-sm text-slate-600">Provisioned customer tenants on the platform.</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Connected Domains</p>
                <p className="mt-2 text-3xl font-bold text-slate-950">{metrics.connected}</p>
                <p className="mt-2 text-sm text-slate-600">Tenants already live on a verified custom domain.</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Pending DNS</p>
                <p className="mt-2 text-3xl font-bold text-slate-950">{metrics.pendingDns}</p>
                <p className="mt-2 text-sm text-slate-600">Provisioned tenants still waiting on domain cutover.</p>
              </div>
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Self-Serve</p>
                <p className="mt-2 text-3xl font-bold text-slate-950">{metrics.selfServe}</p>
                <p className="mt-2 text-sm text-slate-600">Tenants launched through the self-serve path.</p>
              </div>
              <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">Fully Connected</p>
                <p className="mt-2 text-3xl font-bold text-slate-950">{metrics.fullyConnected}</p>
                <p className="mt-2 text-sm text-slate-600">Orgs with all 5 integrations configured.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <CardHeader className="border-b border-slate-200 pb-5">
              <CardTitle className="text-2xl text-slate-950">Customer directory</CardTitle>
              <CardDescription>
                Search by tenant name, slug, or domain, then inspect plan, domain status, and operating footprint.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 p-6">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_180px_180px]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="customer-search"
                    name="customer-search"
                    autoComplete="off"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="border-slate-200 bg-slate-50 pl-10"
                    placeholder="Search customer, slug, or domain"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {planOptions.map((option) => (
                    <Button
                      key={option}
                      size="sm"
                      variant={planFilter === option ? "clinical" : "outline"}
                      onClick={() => setPlanFilter(option)}
                    >
                      {option === "all" ? "All plans" : option}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {statusOptions.map((option) => (
                    <Button
                      key={option}
                      size="sm"
                      variant={statusFilter === option ? "clinical" : "outline"}
                      onClick={() => setStatusFilter(option)}
                    >
                      {option === "all"
                        ? "All status"
                        : option === "pending_dns"
                          ? "Pending DNS"
                          : option === "fallback_only"
                            ? "Fallback only"
                            : "Connected"}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {healthOptions.map((option) => (
                    <Button
                      key={option}
                      size="sm"
                      variant={healthFilter === option ? "clinical" : "outline"}
                      onClick={() => setHealthFilter(option)}
                    >
                      {option === "all"
                        ? "All health"
                        : option === "fully_connected"
                          ? "Fully connected"
                          : "Has issues"}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Integrations</TableHead>
                      <TableHead>Domains</TableHead>
                      <TableHead>Footprint</TableHead>
                      <TableHead>Billing</TableHead>
                      <TableHead>Launch</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedCustomers.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell className="align-top">
                          <div>
                            <button
                              type="button"
                              onClick={() => navigate(`/platform/customers/${customer.id}`)}
                              className="font-semibold text-slate-950 transition hover:text-primary"
                            >
                              {customer.displayName}
                            </button>
                            <p className="text-xs text-slate-500">{customer.slug}</p>
                            <p className="mt-2 text-xs text-slate-500">{formatAppDateTime(customer.createdAt)}</p>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="space-y-2">
                            <Badge
                              variant="outline"
                              className={getPlanBadgeClass(customer.selectedPlan)}
                            >
                              {customer.selectedPlan === "unassigned" ? "Unassigned" : customer.selectedPlan}
                            </Badge>
                            <p className="text-xs text-slate-500">
                              {customer.setupMode === "unknown" ? "No onboarding source" : customer.setupMode.replace("_", "-")}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {(
                              [
                                { key: "email", label: "Email", connected: customer.health.email },
                                { key: "whatsapp", label: "WA", connected: customer.health.whatsapp },
                                { key: "payment", label: "Pay", connected: customer.health.payment },
                                { key: "domain", label: "Domain", connected: customer.health.domain },
                                { key: "abdm", label: "ABDM", connected: customer.health.abdm },
                              ] as const
                            ).map((item) => (
                              <Tooltip key={item.key}>
                                <TooltipTrigger asChild>
                                  <span
                                    className={`inline-flex cursor-default items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                                      item.connected
                                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                        : "bg-slate-100 text-slate-400 ring-1 ring-slate-200"
                                    }`}
                                  >
                                    <span className={`h-1.5 w-1.5 rounded-full ${item.connected ? "bg-emerald-500" : "bg-slate-300"}`} />
                                    {item.label}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {item.label}: {item.connected ? "Connected" : "Not configured"}
                                </TooltipContent>
                              </Tooltip>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="space-y-2">
                            <div className="flex items-start gap-2">
                              <Globe2 className="mt-0.5 h-4 w-4 text-slate-400" />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-slate-950">{customer.primaryDomain || "-"}</p>
                                <p className="truncate text-xs text-slate-500">{customer.fallbackDomain || "No fallback"}</p>
                              </div>
                            </div>
                            <Badge variant={customer.customDomainConnected ? "default" : "secondary"}>
                              {customer.customDomainConnected
                                ? "connected"
                                : customer.customDomainPending
                                  ? "pending DNS"
                                  : "fallback only"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="space-y-1 text-sm text-slate-600">
                            <p>{customer.labsCount} labs</p>
                            <p>{customer.patientsCount} patients</p>
                            <p>{customer.invoicesCount} invoices</p>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <p className="font-semibold text-slate-950">
                            {new Intl.NumberFormat("en-IN", {
                              style: "currency",
                              currency: "INR",
                              maximumFractionDigits: 0,
                            }).format(customer.paymentsTotal)}
                          </p>
                          <p className="text-xs text-slate-500">Recorded payments</p>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="space-y-2">
                            <Badge variant={customer.onboardingStatus === "approved" ? "default" : "outline"}>
                              {customer.onboardingStatus || customer.status}
                            </Badge>
                            <p className="text-xs text-slate-500">
                              {customer.customDomainPending
                                ? "Waiting on domain cutover"
                                : customer.customDomainConnected
                                  ? "Custom domain live"
                                  : "Running on fallback domain"}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-col gap-2">
                            {customer.primaryDomain && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="justify-between"
                                onClick={() => {
                                  const isLocal = customer.primaryDomain!.endsWith(".localhost") || customer.primaryDomain === "localhost";
                                  window.open(`${isLocal ? "http" : "https"}://${customer.primaryDomain}`, "_blank", "noopener,noreferrer");
                                }}
                              >
                                Open site
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {customer.onboardingRequestId && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => navigate(`/platform/customers/${customer.id}`)}
                              >
                                View detail
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <DataPagination
                total={filteredCustomers.length}
                page={page}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            </CardContent>
          </Card>
        </div>
      </TooltipProvider>
    </PlatformAdminLayout>
  );
};

export default PlatformCustomers;
