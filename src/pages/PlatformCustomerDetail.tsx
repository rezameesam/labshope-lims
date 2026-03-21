import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  ClipboardCopy,
  CreditCard,
  ExternalLink,
  Globe,
  Globe2,
  Loader2,
  LogIn,
  Mail,
  MessageCircle,
  Palette,
  RefreshCw,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import PlatformRoute from "@/components/platform/PlatformRoute";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { formatAppDateTime } from "@/lib/date";
import { toast } from "sonner";

type OrganizationRow = {
  id: string;
  slug: string;
  display_name: string;
  status: string;
  created_at: string;
  logo_url?: string | null;
};

type DomainRow = {
  id: string;
  organization_id: string;
  domain: string;
  is_primary: boolean;
  verified_at: string | null;
};

type OnboardingRow = {
  id: string;
  created_at: string;
  status: string;
  selected_plan: "starter" | "growth" | "premium";
  setup_mode: "self_serve" | "assisted";
  owner_full_name: string;
  owner_email: string;
  custom_domain: string | null;
  preferred_subdomain: string | null;
  provisioned_organization_id: string | null;
  resolved_access_domain: string | null;
};

type LabRow = {
  id: string;
  lab_code: string;
  name: string;
  type: string;
  city: string | null;
  phone: string | null;
  created_at: string;
};

type EmployeeRow = {
  id: string;
  employee_id: string;
  full_name: string;
  designation: string | null;
  email: string | null;
  created_at: string;
  is_active: boolean;
  lab_id: string | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  final_amount: number;
  payment_status: string;
  created_at: string;
};

type AggregateRow = {
  organization_id: string | null;
};

type PaymentRow = {
  organization_id: string | null;
  amount: number | null;
};

type SettingRow = {
  setting_key: string;
  setting_value: string | null;
};

type IntegrationHealth = {
  email: boolean;
  whatsapp: boolean;
  payment: boolean;
  domain: boolean;
  abdm: boolean;
  branding: boolean;
};

type PlanTier = "starter" | "growth" | "premium";

const PLAN_COLORS: Record<PlanTier, string> = {
  starter: "bg-slate-100 text-slate-700 border-slate-300",
  growth: "bg-blue-100 text-blue-700 border-blue-300",
  premium: "bg-amber-100 text-amber-700 border-amber-300",
};

const PLAN_FEATURES: Record<PlanTier, string> = {
  starter: "1 lab · Up to 10 active staff · Up to 25,000 patients",
  growth: "Up to 10 labs · Up to 100 active staff · Up to 300,000 patients",
  premium: "Above Growth limits · Priority onboarding · Data import and premium rollout",
};

const PlatformCustomerDetail = () => {
  const navigate = useNavigate();
  const { orgId = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [organization, setOrganization] = useState<OrganizationRow | null>(null);
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingRow | null>(null);
  const [labs, setLabs] = useState<LabRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<InvoiceRow[]>([]);
  const [patientsCount, setPatientsCount] = useState(0);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [integrationHealth, setIntegrationHealth] = useState<IntegrationHealth | null>(null);
  const [editingPlan, setEditingPlan] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<PlanTier>("starter");
  const [savingPlan, setSavingPlan] = useState(false);
  const [resolvedPlan, setResolvedPlan] = useState<PlanTier>("starter");
  const [accessingOrg, setAccessingOrg] = useState(false);

  const loadDetails = useCallback(async () => {
    if (!orgId) {
      return;
    }

    setLoading(true);

    const [
      organizationResult,
      domainsResult,
      onboardingResult,
      labsResult,
      patientsResult,
      invoicesResult,
      paymentsResult,
      settingsResult,
    ] = await Promise.all([
      (supabase as any)
        .from("organizations")
        .select("id, slug, display_name, status, created_at, logo_url")
        .eq("id", orgId)
        .maybeSingle(),
      (supabase as any)
        .from("organization_domains")
        .select("id, organization_id, domain, is_primary, verified_at")
        .eq("organization_id", orgId)
        .order("is_primary", { ascending: false }),
      (supabase as any)
        .from("platform_onboarding_requests")
        .select("id, created_at, status, selected_plan, setup_mode, owner_full_name, owner_email, custom_domain, preferred_subdomain, provisioned_organization_id, resolved_access_domain")
        .eq("provisioned_organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      (supabase as any)
        .from("labs")
        .select("id, lab_code, name, type, city, phone, created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: true }),
      (supabase as any).from("patients").select("organization_id").eq("organization_id", orgId),
      (supabase as any)
        .from("invoices")
        .select("id, invoice_number, final_amount, payment_status, created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(8),
      (supabase as any).from("payments").select("organization_id, amount").eq("organization_id", orgId),
      (supabase as any)
        .from("organization_settings")
        .select("setting_key, setting_value")
        .eq("organization_id", orgId),
    ]);

    if (
      organizationResult.error ||
      domainsResult.error ||
      onboardingResult.error ||
      labsResult.error ||
      patientsResult.error ||
      invoicesResult.error ||
      paymentsResult.error ||
      settingsResult.error
    ) {
      console.error("Error loading platform customer detail:", {
        organizationError: organizationResult.error,
        domainsError: domainsResult.error,
        onboardingError: onboardingResult.error,
        labsError: labsResult.error,
        patientsError: patientsResult.error,
        invoicesError: invoicesResult.error,
        paymentsError: paymentsResult.error,
        settingsError: settingsResult.error,
      });
      toast.error("Failed to load customer detail.");
      setLoading(false);
      return;
    }

    const nextLabs = (labsResult.data || []) as LabRow[];
    const labIds = nextLabs.map((lab) => lab.id);

    let nextEmployees: EmployeeRow[] = [];
    if (labIds.length > 0) {
      const { data: employeesData, error: employeesError } = await (supabase as any)
        .from("employees")
        .select("id, employee_id, full_name, designation, email, created_at, is_active, lab_id")
        .in("lab_id", labIds)
        .order("created_at", { ascending: false })
        .limit(8);

      if (employeesError) {
        console.error("Error loading employees for platform customer detail:", employeesError);
        toast.error("Failed to load tenant staff.");
        setLoading(false);
        return;
      }

      nextEmployees = (employeesData || []) as EmployeeRow[];
    }

    const nextOrg = (organizationResult.data || null) as OrganizationRow | null;
    const nextDomains = (domainsResult.data || []) as DomainRow[];
    const nextOnboarding = (onboardingResult.data || null) as OnboardingRow | null;

    // Build integration health from settings
    const rawSettings = (settingsResult.data || []) as SettingRow[];
    const settingsMap = new Map(rawSettings.map((s) => [s.setting_key, s.setting_value]));

    const health: IntegrationHealth = {
      email: !!(
        settingsMap.get("resend_api_key") ||
        settingsMap.get("sendgrid_api_key") ||
        settingsMap.get("mailjet_api_key") ||
        settingsMap.get("mailgun_api_key")
      ),
      whatsapp: !!(settingsMap.get("whatsapp_phone_number_id")),
      payment: !!(settingsMap.get("razorpay_key_id") || settingsMap.get("phonepe_merchant_id")),
      domain: !!(nextDomains.some((d) => d.verified_at && d.is_primary)),
      abdm: !!(
        settingsMap.get("abdm_enabled") === "true" &&
        settingsMap.get("abdm_hip_id")?.trim() &&
        settingsMap.get("abdm_facility_id")?.trim() &&
        settingsMap.get("abdm_client_id")?.trim() &&
        settingsMap.get("abdm_client_secret")?.trim()
      ),
      branding: !!(nextOrg?.logo_url),
    };

    setOrganization(nextOrg);
    setDomains(nextDomains);
    setOnboarding(nextOnboarding);
    setLabs(nextLabs);
    setEmployees(nextEmployees);
    setRecentInvoices((invoicesResult.data || []) as InvoiceRow[]);
    setPatientsCount(((patientsResult.data || []) as AggregateRow[]).length);
    setPaymentsTotal(
      ((paymentsResult.data || []) as PaymentRow[]).reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0,
      ),
    );
    setIntegrationHealth(health);

    // Resolve plan: organization_settings.plan_tier is authoritative; fallback to onboarding
    const planFromSettings = settingsMap.get("plan_tier") as PlanTier | undefined;
    const validPlans: PlanTier[] = ["starter", "growth", "premium"];
    const nextResolvedPlan: PlanTier =
      planFromSettings && validPlans.includes(planFromSettings)
        ? planFromSettings
        : validPlans.includes(nextOnboarding?.selected_plan as PlanTier)
          ? (nextOnboarding!.selected_plan as PlanTier)
          : "starter";
    setResolvedPlan(nextResolvedPlan);
    setPendingPlan(nextResolvedPlan);

    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    if (!orgId) {
      return;
    }

    void loadDetails();
  }, [orgId, loadDetails]);

  const primaryDomain = useMemo(
    () => domains.find((domain) => domain.is_primary) || null,
    [domains],
  );

  const fallbackDomain = useMemo(
    () =>
      domains.find((domain) => !domain.is_primary) ||
      domains.find((domain) => domain.domain.endsWith(".localhost")) ||
      null,
    [domains],
  );

  const labNameById = useMemo(
    () =>
      labs.reduce<Record<string, string>>((accumulator, lab) => {
        accumulator[lab.id] = lab.name;
        return accumulator;
      }, {}),
    [labs],
  );

  const liveStatus = primaryDomain
    ? primaryDomain.domain.endsWith(".localhost")
      ? "Fallback only"
      : primaryDomain.verified_at
        ? "Custom domain connected"
        : "Pending DNS"
    : "No domain configured";

  const handleSavePlan = async () => {
    if (!orgId) return;
    setSavingPlan(true);
    try {
      const { error: settingsError } = await (supabase as any)
        .from("organization_settings")
        .upsert(
          {
            organization_id: orgId,
            setting_key: "plan_tier",
            setting_value: pendingPlan,
            setting_type: "text",
            category: "general",
            label: "Plan Tier",
            description: "Current subscription plan",
            is_encrypted: false,
          },
          { onConflict: "organization_id,setting_key" },
        );
      if (settingsError) throw settingsError;

      if (onboarding?.id) {
        await (supabase as any)
          .from("platform_onboarding_requests")
          .update({ selected_plan: pendingPlan })
          .eq("id", onboarding.id);
      }

      toast.success(`Plan updated to ${pendingPlan}`);
      setEditingPlan(false);
      void loadDetails();
    } catch (err) {
      console.error("Failed to save plan:", err);
      toast.error("Failed to update plan.");
    } finally {
      setSavingPlan(false);
    }
  };

  const handleCopyOrgId = () => {
    void navigator.clipboard.writeText(orgId).then(() => {
      toast.success("Org ID copied to clipboard");
    });
  };

  const handleAccessOrg = async () => {
    if (!organization?.id) return;
    setAccessingOrg(true);
    try {
      const { data, error } = await supabase.functions.invoke("platform-impersonate-org", {
        body: { organization_id: organization.id },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("No access URL returned.");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to generate access link.");
    } finally {
      setAccessingOrg(false);
    }
  };

  const currentPlan: PlanTier = resolvedPlan;

  return (
    <PlatformRoute>
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !organization ? (
        <Card className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Customer not found</CardTitle>
            <CardDescription>The requested organization could not be loaded.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate("/platform/customers")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to customer ops
            </Button>
          </CardContent>
        </Card>
      ) : (
      <div className="space-y-6">
          <Card className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-5">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                    <Building2 className="h-3.5 w-3.5" />
                    Customer Detail
                  </div>
                  <CardTitle className="mt-4 text-3xl text-slate-950">{organization.display_name}</CardTitle>
                  <CardDescription className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                    Tenant profile for software-owner review: plan, domains, onboarding source, operating footprint, and recent billing.
                  </CardDescription>

                  {/* Quick Actions Bar */}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {primaryDomain && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const isLocal =
                            primaryDomain.domain.endsWith(".localhost") ||
                            primaryDomain.domain === "localhost";
                          window.open(
                            `${isLocal ? "http" : "https"}://${primaryDomain.domain}`,
                            "_blank",
                            "noopener,noreferrer",
                          );
                        }}
                      >
                        <Globe className="mr-1.5 h-3.5 w-3.5" />
                        Open Site
                        <ExternalLink className="ml-1.5 h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const slug = organization.slug;
                        const staffUrl = primaryDomain
                          ? `${primaryDomain.domain.endsWith(".localhost") ? "http" : "https"}://${primaryDomain.domain}/auth`
                          : `/auth?org=${slug}`;
                        window.open(staffUrl, "_blank", "noopener,noreferrer");
                      }}
                    >
                      <LogIn className="mr-1.5 h-3.5 w-3.5" />
                      Staff Login
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const base = primaryDomain
                          ? `${primaryDomain.domain.endsWith(".localhost") ? "http" : "https"}://${primaryDomain.domain}`
                          : "";
                        if (base) {
                          window.open(`${base}/admin?tab=settings`, "_blank", "noopener,noreferrer");
                        } else {
                          toast.info("No domain configured for this tenant yet.");
                        }
                      }}
                    >
                      <Settings className="mr-1.5 h-3.5 w-3.5" />
                      Open Settings
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleCopyOrgId}>
                      <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" />
                      Copy Org ID
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleAccessOrg()}
                      disabled={accessingOrg}
                    >
                      {accessingOrg ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <LogIn className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Access as Admin
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={() => navigate("/platform/customers")}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to customers
                  </Button>
                  <Button variant="outline" onClick={() => void loadDetails()}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Slug</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{organization.slug}</p>
                <p className="mt-2 text-sm text-slate-600">Created {formatAppDateTime(organization.created_at)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Plan</p>
                <p className="mt-2 text-lg font-semibold capitalize text-slate-950">
                  {onboarding?.selected_plan || "Unassigned"}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {onboarding?.setup_mode ? onboarding.setup_mode.replace("_", "-") : "No onboarding record"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Domain status</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{liveStatus}</p>
                <p className="mt-2 text-sm text-slate-600">{primaryDomain?.domain || "No primary domain"}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Payments</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">
                  {new Intl.NumberFormat("en-IN", {
                    style: "currency",
                    currency: "INR",
                    maximumFractionDigits: 0,
                  }).format(paymentsTotal)}
                </p>
                <p className="mt-2 text-sm text-slate-600">Recorded across all tenant invoices</p>
              </div>
            </CardContent>
          </Card>

          {/* Integration Health Card */}
          <Card className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <CardHeader className="border-b border-slate-200 pb-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-2xl text-slate-950">Integration Health</CardTitle>
                  <CardDescription>Live signal for each configured integration. Click an item to open the relevant settings.</CardDescription>
                </div>
                {integrationHealth && (
                  <div className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    Object.values(integrationHealth).every(Boolean)
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                      : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                  }`}>
                    {Object.values(integrationHealth).filter(Boolean).length}/{Object.values(integrationHealth).length} connected
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {([
                  { key: "email", label: "Email", icon: Mail, ok: integrationHealth?.email, hint: "Set up Resend, SendGrid, or SMTP in System Settings → Email." },
                  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, ok: integrationHealth?.whatsapp, hint: "Add WhatsApp Phone Number ID and API key in System Settings → WhatsApp." },
                  { key: "payment", label: "Razorpay", icon: CreditCard, ok: integrationHealth?.payment, hint: "Add Razorpay Key ID and webhook secret in System Settings → Payments." },
                  { key: "domain", label: "Custom Domain", icon: Globe, ok: integrationHealth?.domain, hint: "Set and verify the primary custom domain in Quick Setup → Domain." },
                  { key: "abdm", label: "ABDM", icon: ShieldCheck, ok: integrationHealth?.abdm, hint: "Enable ABDM and enter Facility ID and HIP ID in System Settings → ABDM." },
                  { key: "branding", label: "Branding", icon: Palette, ok: integrationHealth?.branding, hint: "Upload a logo and set brand colors in System Settings → Branding." },
                ] as const).map(({ key, label, icon: Icon, ok, hint }) => {
                  const tenantBase = primaryDomain
                    ? `${primaryDomain.domain.endsWith(".localhost") ? "http" : "https"}://${primaryDomain.domain}`
                    : null;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        if (tenantBase) {
                          window.open(`${tenantBase}/admin?tab=settings`, "_blank", "noopener,noreferrer");
                        } else {
                          toast.info("No domain configured yet — add a domain first.");
                        }
                      }}
                      className={`flex items-start gap-3 rounded-xl border p-4 text-left transition hover:shadow-sm ${
                        ok
                          ? "border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50"
                          : "border-red-200 bg-red-50/40 hover:bg-red-50"
                      }`}
                    >
                      <div className={`mt-0.5 shrink-0 rounded-full p-1.5 ${ok ? "bg-emerald-100" : "bg-red-100"}`}>
                        <Icon className={`h-3.5 w-3.5 ${ok ? "text-emerald-600" : "text-red-500"}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold leading-none text-slate-950">{label}</p>
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                            {ok ? "OK" : "Fix"}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                          {ok ? "Connected and active." : hint}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Plan & Billing Card */}
          <Card className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <CardHeader className="border-b border-slate-200 pb-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-2xl text-slate-950">Plan & Billing</CardTitle>
                  <CardDescription>Current subscription tier and onboarding owner details.</CardDescription>
                </div>
                {!editingPlan && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPendingPlan(currentPlan);
                      setEditingPlan(true);
                    }}
                  >
                    Change Plan
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-5 p-6">
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold capitalize ${PLAN_COLORS[currentPlan]}`}
                    >
                      {currentPlan}
                    </span>
                    {onboarding?.setup_mode && (
                      <Badge variant="outline" className="capitalize">
                        {onboarding.setup_mode.replace("_", "-")}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">{PLAN_FEATURES[currentPlan]}</p>
                  {onboarding && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-sm font-medium text-slate-950">{onboarding.owner_full_name}</p>
                      <p className="text-xs text-slate-500">{onboarding.owner_email}</p>
                    </div>
                  )}
                  {!onboarding && (
                    <p className="text-sm text-slate-500">No onboarding request linked to this tenant.</p>
                  )}
                </div>
              </div>

              {editingPlan && (
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <Select
                    value={pendingPlan}
                    onValueChange={(v) => setPendingPlan(v as PlanTier)}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Select plan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="starter">Starter</SelectItem>
                      <SelectItem value="growth">Growth</SelectItem>
                      <SelectItem value="premium">Premium</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={() => void handleSavePlan()} disabled={savingPlan}>
                    {savingPlan ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingPlan(false)}
                    disabled={savingPlan}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 2xl:grid-cols-[0.95fr_1.05fr]">
            <Card className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
              <CardHeader className="border-b border-slate-200 pb-5">
                <CardTitle className="text-2xl text-slate-950">Identity & launch</CardTitle>
                <CardDescription>How this tenant entered the platform and what domain state it is in.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Onboarding source</p>
                  <p className="mt-2 text-base font-semibold text-slate-950">
                    {onboarding ? `${onboarding.setup_mode.replace("_", "-")} · ${onboarding.selected_plan}` : "No onboarding record"}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    {onboarding
                      ? `${onboarding.owner_full_name} · ${onboarding.owner_email}`
                      : "This tenant was not tied to a captured onboarding request."}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-start gap-3">
                    <Globe2 className="mt-0.5 h-4 w-4 text-slate-500" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950">Primary domain</p>
                      <p className="truncate text-sm text-slate-600">{primaryDomain?.domain || "-"}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        {primaryDomain?.verified_at ? `Verified ${formatAppDateTime(primaryDomain.verified_at)}` : "Not verified yet"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-start gap-3">
                    <Globe2 className="mt-0.5 h-4 w-4 text-slate-500" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950">Fallback access</p>
                      <p className="truncate text-sm text-slate-600">{fallbackDomain?.domain || onboarding?.resolved_access_domain || "-"}</p>
                      <p className="mt-2 text-xs text-slate-500">Keep this active until custom DNS is confirmed live.</p>
                    </div>
                  </div>
                </div>

                {domains.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead>Domain</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {domains.map((domain) => (
                          <TableRow key={domain.id}>
                            <TableCell className="max-w-[260px] truncate">{domain.domain}</TableCell>
                            <TableCell>{domain.is_primary ? "Primary" : "Fallback"}</TableCell>
                            <TableCell>
                              <Badge variant={domain.verified_at || domain.domain.endsWith(".localhost") ? "default" : "secondary"}>
                                {domain.verified_at || domain.domain.endsWith(".localhost") ? "live" : "pending"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
              <CardHeader className="border-b border-slate-200 pb-5">
                <CardTitle className="text-2xl text-slate-950">Operating footprint</CardTitle>
                <CardDescription>Current tenant size across locations, users, patients, and recent billing.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Labs</p>
                  <p className="mt-2 text-3xl font-bold text-slate-950">{labs.length}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Staff</p>
                  <p className="mt-2 text-3xl font-bold text-slate-950">{employees.length}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Patients</p>
                  <p className="mt-2 text-3xl font-bold text-slate-950">{patientsCount}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Recent invoices</p>
                  <p className="mt-2 text-3xl font-bold text-slate-950">{recentInvoices.length}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 2xl:grid-cols-[0.9fr_1.1fr]">
            <Card className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
              <CardHeader className="border-b border-slate-200 pb-5">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-slate-500" />
                  <div>
                    <CardTitle className="text-2xl text-slate-950">Labs & staff</CardTitle>
                    <CardDescription>Main operating entities inside this tenant.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                <div className="space-y-3">
                  {labs.length === 0 ? (
                    <p className="text-sm text-slate-500">No labs found for this tenant.</p>
                  ) : (
                    labs.map((lab) => (
                      <div key={lab.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-950">{lab.name}</p>
                            <p className="text-xs text-slate-500">{lab.lab_code} · {lab.type}</p>
                          </div>
                          <p className="text-xs text-slate-500">{formatAppDateTime(lab.created_at)}</p>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                          {[lab.city, lab.phone].filter(Boolean).join(" · ") || "No city or phone yet"}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead>Staff</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employees.map((employee) => (
                        <TableRow key={employee.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-slate-950">{employee.full_name}</p>
                              <p className="text-xs text-slate-500">{employee.employee_id}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p>{employee.designation || "Staff"}</p>
                              <p className="text-xs text-slate-500">
                                {employee.lab_id ? labNameById[employee.lab_id] || "Assigned lab" : "No lab assigned"}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={employee.is_active ? "default" : "secondary"}>
                              {employee.is_active ? "active" : "inactive"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
              <CardHeader className="border-b border-slate-200 pb-5">
                <CardTitle className="text-2xl text-slate-950">Recent invoices</CardTitle>
                <CardDescription>Latest billing activity visible from the software-owner layer.</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentInvoices.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-sm text-slate-500">
                            No invoices found for this tenant yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        recentInvoices.map((invoice) => (
                          <TableRow key={invoice.id}>
                            <TableCell className="font-medium text-slate-950">{invoice.invoice_number}</TableCell>
                            <TableCell>
                              {new Intl.NumberFormat("en-IN", {
                                style: "currency",
                                currency: "INR",
                                maximumFractionDigits: 0,
                              }).format(Number(invoice.final_amount || 0))}
                            </TableCell>
                            <TableCell>
                              <Badge variant={invoice.payment_status === "paid" ? "default" : "secondary"}>
                                {invoice.payment_status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-slate-500">{formatAppDateTime(invoice.created_at)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </PlatformRoute>
  );
};

export default PlatformCustomerDetail;
