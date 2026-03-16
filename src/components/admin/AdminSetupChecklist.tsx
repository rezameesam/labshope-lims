import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  FlaskConical,
  Globe2,
  Mail,
  Palette,
  Rocket,
  Sparkles,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/contexts/OrganizationContext";

type AdminSetupChecklistProps = {
  onNavigate?: (tabId: string) => void;
};

type ChecklistMetrics = {
  employees: number;
  tests: number;
  templates: number;
  settings: Record<string, string>;
  domains: Array<{
    domain: string;
    is_primary: boolean;
    verified_at: string | null;
  }>;
};

type ChecklistItem = {
  id: string;
  title: string;
  description: string;
  detail: string;
  complete: boolean;
  actionLabel: string;
  actionTab: string;
  icon: typeof Palette;
};

const DEFAULT_METRICS: ChecklistMetrics = {
  employees: 0,
  tests: 0,
  templates: 0,
  settings: {},
  domains: [],
};

const normalizeExternalUrl = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
};

const buildLaunchBaseUrl = (slug: string | null | undefined, websiteUrl: string | null) => {
  const normalizedWebsite = normalizeExternalUrl(websiteUrl);
  if (normalizedWebsite) {
    return normalizedWebsite.replace(/\/$/, "");
  }

  if (typeof window === "undefined") {
    return null;
  }

  const { origin, hostname } = window.location;
  if (
    hostname.endsWith(".localhost") ||
    (hostname !== "localhost" && hostname !== "127.0.0.1")
  ) {
    return origin;
  }

  if (!slug) {
    return null;
  }

  const configuredBaseDomain = import.meta.env.VITE_PUBLIC_BASE_DOMAIN?.trim().toLowerCase();
  const host = configuredBaseDomain && configuredBaseDomain !== "localhost"
    ? `${slug}.${configuredBaseDomain}`
    : `${slug}.localhost:8080`;
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
};

const AdminSetupChecklist = ({ onNavigate }: AdminSetupChecklistProps) => {
  const { hasRole, isCollector } = useAuth();
  const { organization, primaryLab, loading: organizationLoading } = useOrganization();
  const [metrics, setMetrics] = useState<ChecklistMetrics>(DEFAULT_METRICS);
  const [loading, setLoading] = useState(true);

  const isAdmin = hasRole("admin");

  const fetchChecklistMetrics = useCallback(async () => {
    if (!organization?.id || !isAdmin || isCollector) {
      setMetrics(DEFAULT_METRICS);
      setLoading(false);
      return;
    }

    setLoading(true);

    const settingKeys = [
      "branding_tagline",
      "branding_description",
      "organization_website",
      "razorpay_key_id",
      "email_from_name",
      "email_from_email",
      "whatsapp_access_token",
      "msg91_auth_key",
    ];

    try {
      const [employeesResponse, testsResponse, templatesResponse, settingsResponse, domainsResponse] = await Promise.all([
        supabase
          .from("employees")
          .select("id", { count: "exact", head: true })
          .eq("organization_id" as any, organization.id),
        supabase
          .from("tests")
          .select("id", { count: "exact", head: true })
          .eq("organization_id" as any, organization.id),
        supabase
          .from("test_templates")
          .select("id", { count: "exact", head: true })
          .eq("organization_id" as any, organization.id),
        supabase
          .from("organization_settings" as any)
          .select("setting_key, setting_value")
          .eq("organization_id", organization.id)
          .in("setting_key", settingKeys),
        supabase
          .from("organization_domains" as any)
          .select("domain, is_primary, verified_at")
          .eq("organization_id", organization.id),
      ]);

      const settingsMap = Object.fromEntries(
        (((settingsResponse.data as { setting_key: string; setting_value: string | null }[] | null) || []).map(
          (setting) => [setting.setting_key, setting.setting_value || ""]
        ))
      );

      setMetrics({
        employees: employeesResponse.count || 0,
        tests: testsResponse.count || 0,
        templates: templatesResponse.count || 0,
        settings: settingsMap,
        domains: ((domainsResponse.data as ChecklistMetrics["domains"] | null) || []),
      });
    } catch (error) {
      console.error("Error loading admin setup checklist:", error);
      setMetrics(DEFAULT_METRICS);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, isCollector, organization?.id]);

  useEffect(() => {
    if (organizationLoading) {
      return;
    }

    void fetchChecklistMetrics();
  }, [fetchChecklistMetrics, organizationLoading]);

  if (!isAdmin || isCollector || organizationLoading || !organization?.id) {
    return null;
  }

  const hasBranding =
    Boolean(organization.logo_url) ||
    Boolean(primaryLab?.logo_url) ||
    Boolean(metrics.settings.branding_tagline?.trim()) ||
    Boolean(metrics.settings.branding_description?.trim());
  const hasContactDetails =
    Boolean(primaryLab?.phone?.trim()) &&
    Boolean(primaryLab?.address?.trim()) &&
    Boolean(primaryLab?.city?.trim());
  const hasCatalogAndTemplate = metrics.tests > 0 && metrics.templates > 0;
  const hasExtraStaff = metrics.employees > 1;
  const hasPayments = Boolean(metrics.settings.razorpay_key_id?.trim());
  const hasNotifications =
    Boolean(metrics.settings.email_from_name?.trim()) ||
    Boolean(metrics.settings.email_from_email?.trim()) ||
    Boolean(metrics.settings.whatsapp_access_token?.trim()) ||
    Boolean(metrics.settings.msg91_auth_key?.trim());
  const primaryDomainRecord = metrics.domains.find((domain) => domain.is_primary) || null;
  const customDomainRecord = metrics.domains.find((domain) => domain.is_primary && domain.verified_at) ||
    metrics.domains.find((domain) => domain.is_primary && !domain.domain.includes(".localhost")) ||
    null;
  const fallbackDomainRecord = metrics.domains.find((domain) => !domain.is_primary) ||
    metrics.domains.find((domain) => domain.domain.includes(".localhost")) ||
    null;
  const hasFallbackLaunchDomain = Boolean(fallbackDomainRecord?.domain || primaryDomainRecord?.domain);
  const hasConnectedCustomDomain = Boolean(customDomainRecord?.verified_at);
  const hasDomainSetup = customDomainRecord?.domain
    ? hasConnectedCustomDomain
    : hasFallbackLaunchDomain;

  const checklistItems: ChecklistItem[] = [
    {
      id: "branding",
      title: "Brand the workspace",
      description: "Add your logo, tagline, and public business details so the tenant site stops looking generic.",
      detail: hasBranding
        ? "Logo or branded copy is already configured."
        : "Open settings and add at least a logo or tagline.",
      complete: hasBranding,
      actionLabel: "Open settings",
      actionTab: "quick-setup",
      icon: Palette,
    },
    {
      id: "contact",
      title: "Complete lab contact details",
      description: "Patients should see the right phone, address, and city before you send traffic to the public site.",
      detail: hasContactDetails
        ? "Primary lab contact details are ready for public use."
        : "Fill in the main lab phone, address, and city.",
      complete: hasContactDetails,
      actionLabel: "Open labs",
      actionTab: "quick-setup",
      icon: Globe2,
    },
    {
      id: "domain",
      title: "Connect the lab domain",
      description: "Decide whether the lab will stay on the fallback launch domain or move to a customer-owned domain with DNS updates.",
      detail: customDomainRecord?.verified_at
        ? `Custom domain ${customDomainRecord.domain} is connected.`
        : customDomainRecord?.domain
          ? `Custom domain ${customDomainRecord.domain} is saved. Keep ${fallbackDomainRecord?.domain || "the fallback launch domain"} active until DNS is ready.`
          : hasDomainSetup
            ? `Fallback launch domain ${fallbackDomainRecord?.domain || primaryDomainRecord?.domain || "is ready"} is available.`
            : "No tenant domain is visible yet. Open Quick Setup and confirm the launch domain.",
      complete: hasDomainSetup,
      actionLabel: "Open domain setup",
      actionTab: "quick-setup",
      icon: Globe2,
    },
    {
      id: "catalog",
      title: "Load tests and report format",
      description: "A new lab cannot operate self-serve until the test catalog and report template are ready.",
      detail:
        metrics.tests > 0 || metrics.templates > 0
          ? `${metrics.tests} tests and ${metrics.templates} templates configured.`
          : "No tests or report templates have been added yet.",
      complete: hasCatalogAndTemplate,
      actionLabel: metrics.tests === 0 ? "Open test catalog" : "Open templates",
      actionTab: metrics.tests === 0 ? "test-catalog" : "test-templates",
      icon: FlaskConical,
    },
    {
      id: "staff",
      title: "Invite your team",
      description: "Bring in reception, billing, and lab staff before daily operations start depending on one login.",
      detail:
        metrics.employees > 1
          ? `${metrics.employees} staff records are active in this organization.`
          : "Only the initial owner/admin is present right now.",
      complete: hasExtraStaff,
      actionLabel: "Open employees",
      actionTab: "employees",
      icon: Users,
    },
    {
      id: "payments",
      title: "Connect billing and payments",
      description: "Configure organization payment credentials so online collections and patient payment flows work.",
      detail: hasPayments
        ? "Payment credentials are configured for this organization."
        : "No organization-specific payment key is configured yet.",
      complete: hasPayments,
      actionLabel: "Open billing settings",
      actionTab: "quick-setup",
      icon: CreditCard,
    },
    {
      id: "notifications",
      title: "Turn on patient notifications",
      description: "Add sender or messaging credentials so OTP, reminders, and billing communications can go live.",
      detail: hasNotifications
        ? "At least one email, WhatsApp, or SMS delivery path is configured."
        : "Notifications are still using empty organization settings.",
      complete: hasNotifications,
      actionLabel: "Open notifications",
      actionTab: "quick-setup",
      icon: Mail,
    },
  ];

  const completedCount = checklistItems.filter((item) => item.complete).length;
  const progressValue = Math.round((completedCount / checklistItems.length) * 100);
  const launchBaseUrl = buildLaunchBaseUrl(organization.slug, metrics.settings.organization_website || null);
  const openUrl = (path: string) => {
    if (!launchBaseUrl || typeof window === "undefined") {
      return;
    }

    window.open(`${launchBaseUrl}${path}`, "_blank", "noopener,noreferrer");
  };

  return (
    <Card className="border-0 shadow-md overflow-hidden">
      <div className="bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_38%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(30,41,59,0.96))] text-primary-foreground">
        <CardHeader className="pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className="bg-white/12 text-primary-foreground hover:bg-white/12">
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  Go-live checklist
                </Badge>
                {completedCount === checklistItems.length && (
                  <Badge className="bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/20">
                    Launch-ready
                  </Badge>
                )}
              </div>
              <div>
                <CardTitle className="font-heading text-2xl text-primary-foreground">
                  Finish the setup and hand this workspace to the lab team
                </CardTitle>
                <CardDescription className="mt-2 max-w-2xl text-primary-foreground/75">
                  A provisioned organization is only the starting point. These steps turn it into a usable
                  production workspace for the lab owner, staff, and patients.
                </CardDescription>
              </div>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/8 px-4 py-3 text-sm backdrop-blur">
              <div className="text-primary-foreground/70">Setup progress</div>
              <div className="mt-1 flex items-end gap-2">
                <span className="text-3xl font-semibold text-primary-foreground">{completedCount}</span>
                <span className="pb-1 text-primary-foreground/70">/ {checklistItems.length} complete</span>
              </div>
              <p className="mt-2 text-primary-foreground/70">
                {completedCount === checklistItems.length
                  ? "This tenant is ready for live traffic."
                  : `${checklistItems.length - completedCount} steps still need attention.`}
              </p>
            </div>
          </div>
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-primary-foreground/60">
              <span>Workspace readiness</span>
              <span>{progressValue}%</span>
            </div>
            <Progress value={progressValue} className="h-2 bg-white/10 [&>div]:bg-emerald-400" />
          </div>
        </CardHeader>
      </div>

      <CardContent className="space-y-5 p-6">
        {loading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: checklistItems.length }).map((_, index) => (
              <div key={index} className="rounded-2xl border border-border bg-muted/40 p-4">
                <div className="h-5 w-24 animate-pulse rounded bg-muted" />
                <div className="mt-3 h-4 w-full animate-pulse rounded bg-muted" />
                <div className="mt-2 h-4 w-4/5 animate-pulse rounded bg-muted" />
                <div className="mt-4 h-9 w-28 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {checklistItems.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-4 transition-colors ${
                    item.complete
                      ? "border-emerald-200 bg-emerald-50/70"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                        item.complete ? "bg-emerald-100 text-emerald-700" : "bg-primary/10 text-primary"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    {item.complete ? (
                      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                        Done
                      </Badge>
                    ) : (
                      <Badge variant="outline">Action needed</Badge>
                    )}
                  </div>

                  <div className="mt-4 space-y-2">
                    <h3 className="font-heading text-lg font-semibold text-foreground">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                    <p className="text-sm font-medium text-foreground/80">{item.detail}</p>
                  </div>

                  <Button
                    variant={item.complete ? "ghost" : "outline"}
                    className="mt-4 w-full justify-between"
                    onClick={() => onNavigate?.(item.actionTab)}
                  >
                    <span>{item.complete ? "Review" : item.actionLabel}</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        <Separator />

        <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-muted/30 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-foreground">
              <Rocket className="h-5 w-5 text-primary" />
              <h3 className="font-heading text-lg font-semibold">
                {completedCount === checklistItems.length ? "Launch the tenant" : "Preview the live experience"}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {completedCount === checklistItems.length
                ? "Open the public site and booking flow in a separate tab before you hand the workspace to the customer."
                : "You can still open the tenant site now, but finishing the checklist above will make the rollout much cleaner."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => openUrl("/")}
              disabled={!launchBaseUrl}
            >
              Open public site
            </Button>
            <Button
              onClick={() => openUrl("/book-test")}
              disabled={!launchBaseUrl}
            >
              Open booking page
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminSetupChecklist;
