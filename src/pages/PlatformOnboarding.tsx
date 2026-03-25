import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Download, ExternalLink, Loader2, RefreshCw, Rocket, Save, UserCheck } from "lucide-react";
import PlatformRoute from "@/components/platform/PlatformRoute";
import { formatAppDateTime } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { DataPagination } from "@/components/ui/data-pagination";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useAuditLog } from "@/hooks/useAuditLog";
import { toast } from "sonner";
import {
  usePlatformOnboarding,
  useUpdateOnboardingRequest,
  useProvisionOnboardingRequest,
  useToggleDomainVerification,
  PLATFORM_ONBOARDING_QUERY_KEY,
  type PlatformOnboardingRequest,
  type PlatformDomainRecord,
  type OnboardingRequestUpdates,
} from "@/hooks/queries/usePlatformOnboarding";

type ProvisioningResult = {
  organization_id: string;
  lab_id: string;
  owner_user_id: string;
  organization_slug: string | null;
  primary_domain: string | null;
  access_domain: string | null;
  owner_email: string;
  temporary_password: string;
  owner_notification_status: string;
  launch_url: string;
  staff_login_url: string;
  patient_login_url: string;
  booking_url: string;
};

const statusOptions: PlatformOnboardingRequest["status"][] = ["new", "reviewing", "approved", "closed"];
const quickFilterOptions = ["all", "new", "self_serve", "mine", "due", "approved"] as const;
type QuickFilter = (typeof quickFilterOptions)[number];

const onboardingStatusClass: Record<string, string> = {
  new: "border-blue-200 bg-blue-50 text-blue-700",
  reviewing: "border-amber-200 bg-amber-50 text-amber-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  closed: "border-border bg-muted text-muted-foreground",
};

const planClass: Record<string, string> = {
  starter: "border-border bg-muted/40 text-muted-foreground",
  growth: "border-indigo-200 bg-indigo-50 text-indigo-700",
  premium: "border-violet-200 bg-violet-50 text-violet-700",
};

const EMPTY_REQUESTS: PlatformOnboardingRequest[] = [];
const EMPTY_DOMAINS: Record<string, PlatformDomainRecord[]> = {};

const PlatformOnboarding = () => {
  const { user } = useAuth();
  const { logAction } = useAuditLog();
  const queryClient = useQueryClient();

  // Data via React Query
  const { data: onboardingData, isLoading: loading } = usePlatformOnboarding();
  const requests = useMemo(() => onboardingData?.requests ?? EMPTY_REQUESTS, [onboardingData?.requests]);
  const organizationDomains = useMemo(
    () => onboardingData?.organizationDomains ?? EMPTY_DOMAINS,
    [onboardingData?.organizationDomains],
  );

  // Mutations
  const updateMutation = useUpdateOnboardingRequest();
  const provisionMutation = useProvisionOnboardingRequest();
  const toggleDomainMutation = useToggleDomainVerification();

  // UI-only state
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [provisioningId, setProvisioningId] = useState<string | null>(null);
  const [provisioningResults, setProvisioningResults] = useState<Record<string, ProvisioningResult>>({});
  const [draftStatusNotes, setDraftStatusNotes] = useState<Record<string, string>>({});
  const [draftFollowUpAt, setDraftFollowUpAt] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [updatingDomainId, setUpdatingDomainId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const toDateTimeLocalValue = (value: string | null) => {
    if (!value) {
      return "";
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    const hours = String(parsed.getHours()).padStart(2, "0");
    const minutes = String(parsed.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const fromDateTimeLocalValue = (value: string) => {
    if (!value) {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  };

  const getBaseDomain = (): string => {
    const envDomain = (import.meta.env.VITE_PUBLIC_BASE_DOMAIN as string | undefined)?.trim();
    if (envDomain && envDomain !== "localhost" && !envDomain.endsWith(".localhost")) {
      return envDomain;
    }
    if (typeof window !== "undefined") {
      const hostname = window.location.hostname;
      if (hostname && hostname !== "localhost" && !hostname.endsWith(".localhost")) {
        const parts = hostname.split(".");
        return parts.length > 2 ? parts.slice(1).join(".") : hostname;
      }
    }
    return "labshope.com";
  };

  const getLaunchBaseUrl = (domain: string | null, slug: string | null) => {
    const host = domain || (slug ? `${slug}.${getBaseDomain()}` : null);
    if (!host) {
      return null;
    }

    const protocol = host.endsWith(".localhost") || host === "localhost" || host === "127.0.0.1" ? "http" : "https";
    return `${protocol}://${host}`;
  };

  const getDnsGuide = (customDomain: string | null, accessDomain: string | null) => {
    if (!customDomain || !accessDomain) {
      return null;
    }

    const labels = customDomain.split(".").filter(Boolean);
    const isApexDomain = labels.length <= 2;

    return {
      recordType: isApexDomain ? "ALIAS / ANAME" : "CNAME",
      hostLabel: isApexDomain ? "@" : labels[0],
      target: accessDomain,
      isApexDomain,
    };
  };

  // Initialize draft fields for newly loaded requests (preserves in-progress edits)
  useEffect(() => {
    if (!requests.length) return;
    setDraftStatusNotes((current) => {
      const next = { ...current };
      for (const r of requests) {
        if (!(r.id in next)) next[r.id] = r.status_notes ?? "";
      }
      return next;
    });
    setDraftFollowUpAt((current) => {
      const next = { ...current };
      for (const r of requests) {
        if (!(r.id in next)) next[r.id] = toDateTimeLocalValue(r.next_follow_up_at);
      }
      return next;
    });
  }, [requests]);

  const metrics = useMemo(() => {
    const newCount = requests.filter((request) => request.status === "new").length;
    const selfServeCount = requests.filter((request) => request.setup_mode === "self_serve").length;
    const importCount = requests.filter((request) => request.needs_data_import).length;
    const approvedCount = requests.filter((request) => request.status === "approved").length;
    const assignedToMeCount = requests.filter((request) => request.assigned_to === user?.id).length;
    const dueFollowUpsCount = requests.filter((request) => {
      if (!request.next_follow_up_at) {
        return false;
      }
      return new Date(request.next_follow_up_at).getTime() <= Date.now();
    }).length;
    const pendingDnsCount = requests.filter((request) => {
      if (!request.custom_domain || !request.provisioned_organization_id) {
        return false;
      }

      const domainRecord = organizationDomains[request.provisioned_organization_id]?.find(
        (domain) => domain.domain === request.custom_domain
      );

      return Boolean(domainRecord && !domainRecord.verified_at);
    }).length;

    return {
      total: requests.length,
      newCount,
      selfServeCount,
      importCount,
      approvedCount,
      assignedToMeCount,
      dueFollowUpsCount,
      pendingDnsCount,
    };
  }, [organizationDomains, requests, user?.id]);

  const filteredRequests = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return requests.filter((request) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          request.organization_name,
          request.primary_lab_name,
          request.owner_full_name,
          request.owner_email,
          request.city,
          request.preferred_subdomain,
          request.utm_source,
          request.utm_campaign,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));

      if (!matchesSearch) {
        return false;
      }

      if (quickFilter === "new") {
        return request.status === "new";
      }

      if (quickFilter === "self_serve") {
        return request.setup_mode === "self_serve";
      }

      if (quickFilter === "mine") {
        return request.assigned_to === user?.id;
      }

      if (quickFilter === "due") {
        return Boolean(
          request.next_follow_up_at && new Date(request.next_follow_up_at).getTime() <= Date.now(),
        );
      }

      if (quickFilter === "approved") {
        return request.status === "approved";
      }

      return true;
    });
  }, [quickFilter, requests, searchTerm, user?.id]);

  useEffect(() => { setPage(1); }, [searchTerm, quickFilter]);

  const pagedRequests = useMemo(
    () => filteredRequests.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredRequests, page],
  );

  const exportCsv = () => {
    if (!filteredRequests.length) {
      toast.error("No onboarding requests to export.");
      return;
    }

    const headers = [
      "created_at",
      "status",
      "selected_plan",
      "setup_mode",
      "assigned_to",
      "assigned_at",
      "next_follow_up_at",
      "reviewing_at",
      "approved_at",
      "closed_at",
      "status_notes",
      "organization_name",
      "primary_lab_name",
      "owner_full_name",
      "owner_email",
      "owner_phone",
      "city",
      "custom_domain",
      "branch_count",
      "preferred_subdomain",
      "go_live_target",
      "needs_data_import",
      "needs_white_label",
      "coupon_code",
      "hostname",
      "page_path",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "notes",
    ];

    const rows = filteredRequests.map((request) =>
      headers
        .map((header) => `"${String((request as any)[header] ?? "").replaceAll('"', '""')}"`)
        .join(","),
    );

    const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "platform-onboarding-requests.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const updateRequest = async (
    requestId: string,
    updates: OnboardingRequestUpdates,
    successMessage: string,
  ) => {
    setUpdatingId(requestId);
    try {
      const updated = await updateMutation.mutateAsync({ requestId, updates });
      if ("status_notes" in updates) {
        setDraftStatusNotes((c) => ({ ...c, [requestId]: updated.status_notes ?? "" }));
      }
      if ("next_follow_up_at" in updates) {
        setDraftFollowUpAt((c) => ({ ...c, [requestId]: toDateTimeLocalValue(updated.next_follow_up_at) }));
      }
      toast.success(successMessage);
    } catch {
      toast.error("Failed to update onboarding request.");
    } finally {
      setUpdatingId(null);
    }
  };

  const updateStatus = async (requestId: string, status: PlatformOnboardingRequest["status"]) => {
    await updateRequest(requestId, { status }, "Onboarding request updated.");
    void logAction("status_change", "onboarding_request", requestId, { status });
  };

  const assignToCurrentUser = async (requestId: string) => {
    if (!user?.id) {
      return;
    }

    await updateRequest(requestId, { assigned_to: user.id }, "Onboarding request assigned.");
  };

  const saveStatusNotes = async (requestId: string) => {
    await updateRequest(
      requestId,
      { status_notes: draftStatusNotes[requestId] || "" },
      "Internal notes saved.",
    );
  };

  const saveFollowUp = async (requestId: string) => {
    await updateRequest(
      requestId,
      { next_follow_up_at: fromDateTimeLocalValue(draftFollowUpAt[requestId] || "") },
      "Next follow-up updated.",
    );
  };

  const provisionRequest = async (requestId: string) => {
    setProvisioningId(requestId);
    try {
      const data = await provisionMutation.mutateAsync(requestId);
      const response = (data || {}) as Partial<ProvisioningResult> & { error?: string; already_provisioned?: boolean };

      if (response.error) {
        toast.error(response.error);
        return;
      }

      if (!response.already_provisioned && response.temporary_password) {
        setProvisioningResults((current) => ({
          ...current,
          [requestId]: {
            organization_id: response.organization_id || "",
            lab_id: response.lab_id || "",
            owner_user_id: response.owner_user_id || "",
            organization_slug: response.organization_slug || null,
            primary_domain: response.primary_domain || null,
            access_domain: response.access_domain || response.primary_domain || null,
            owner_email: response.owner_email || "",
            temporary_password: response.temporary_password,
            owner_notification_status: response.owner_notification_status || "skipped",
            launch_url: response.launch_url || "",
            staff_login_url: response.staff_login_url || "",
            patient_login_url: response.patient_login_url || "",
            booking_url: response.booking_url || "",
          },
        }));
      }

      toast.success(response.already_provisioned ? "Organization already provisioned." : "Organization provisioned.");
      if (!response.already_provisioned) {
        void logAction("provision", "onboarding_request", requestId, {
          organization_id: response.organization_id,
          owner_email: response.owner_email,
        });
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to provision organization.");
    } finally {
      setProvisioningId(null);
    }
  };

  const toggleDomainVerification = async (request: PlatformOnboardingRequest) => {
    if (!request.provisioned_organization_id || !request.custom_domain) {
      toast.error("This request does not have a provisioned custom domain yet.");
      return;
    }

    const domainRecord =
      organizationDomains[request.provisioned_organization_id]?.find((domain) => domain.domain === request.custom_domain) || null;

    if (!domainRecord?.id) {
      toast.error("The custom domain record was not found for this tenant.");
      return;
    }

    setUpdatingDomainId(request.id);
    try {
      const result = await toggleDomainMutation.mutateAsync({
        domainRecordId: domainRecord.id,
        organizationId: request.provisioned_organization_id,
        currentVerifiedAt: domainRecord.verified_at,
      });
      toast.success(result.nextVerifiedAt ? "Custom domain marked live." : "Custom domain moved back to pending.");
    } catch (error: any) {
      toast.error(error.message || "Failed to update custom domain status.");
    } finally {
      setUpdatingDomainId(null);
    }
  };

  return (
    <PlatformRoute>
      <div className="rounded-[28px] border border-border bg-card px-6 py-6 shadow-sm lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Pipeline
            </p>
            <h1 className="mt-2 font-heading text-4xl font-bold tracking-tight text-foreground">Onboarding Queue</h1>
            <p className="mt-2 text-muted-foreground">
              Review self-serve setup submissions and move them through the platform onboarding path.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => void queryClient.invalidateQueries({ queryKey: PLATFORM_ONBOARDING_QUERY_KEY })}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="clinical" onClick={exportCsv}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl border border-border bg-card px-5 py-4 shadow-sm">
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="mt-2 font-heading text-3xl font-bold text-foreground">{metrics.total}</p>
            </div>
            <div className="rounded-3xl border border-border bg-card px-5 py-4 shadow-sm">
              <p className="text-sm text-muted-foreground">New</p>
              <p className="mt-2 font-heading text-3xl font-bold text-foreground">{metrics.newCount}</p>
            </div>
            <div className="rounded-3xl border border-border bg-card px-5 py-4 shadow-sm">
              <p className="text-sm text-muted-foreground">Self-Serve</p>
              <p className="mt-2 font-heading text-3xl font-bold text-foreground">{metrics.selfServeCount}</p>
            </div>
            <div className="rounded-3xl border border-border bg-card px-5 py-4 shadow-sm">
              <p className="text-sm text-muted-foreground">Needs Import</p>
              <p className="mt-2 font-heading text-3xl font-bold text-foreground">{metrics.importCount}</p>
            </div>
            <div className="rounded-3xl border border-border bg-card px-5 py-4 shadow-sm">
              <p className="text-sm text-muted-foreground">Assigned To Me</p>
              <p className="mt-2 font-heading text-3xl font-bold text-foreground">{metrics.assignedToMeCount}</p>
            </div>
            <div className="rounded-3xl border border-border bg-card px-5 py-4 shadow-sm">
              <p className="text-sm text-muted-foreground">Follow-ups Due</p>
              <p className="mt-2 font-heading text-3xl font-bold text-foreground">{metrics.dueFollowUpsCount}</p>
            </div>
            <div className="rounded-3xl border border-border bg-card px-5 py-4 shadow-sm">
              <p className="text-sm text-muted-foreground">Pending DNS</p>
              <p className="mt-2 font-heading text-3xl font-bold text-foreground">{metrics.pendingDnsCount}</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label htmlFor="onboarding-search" className="sr-only">Search onboarding queue</label>
            <Input
              id="onboarding-search"
              name="onboarding_search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search organization, owner, email, city, or campaign"
              className="max-w-xl bg-background"
            />
            <div className="flex flex-wrap gap-2">
              {quickFilterOptions.map((filter) => (
                <Button
                  key={filter}
                  variant={quickFilter === filter ? "clinical" : "outline"}
                  size="sm"
                  onClick={() => setQuickFilter(filter)}
                >
                  {filter === "all"
                    ? "All"
                    : filter === "self_serve"
                      ? "Self-Serve"
                      : filter === "mine"
                        ? "Assigned To Me"
                        : filter === "due"
                          ? "Follow-ups Due"
                      : filter === "approved"
                        ? "Approved"
                        : "New"}
                </Button>
              ))}
            </div>
          </div>
      </div>

      <div>
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !filteredRequests.length ? (
          <div className="flex flex-col items-center gap-3 rounded-[20px] border border-border bg-card p-12 text-center shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Rocket className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="font-semibold text-foreground/80">No onboarding requests match the current filters</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Switch to "All" or clear the search to see every submitted onboarding request.
            </p>
          </div>
        ) : (
          <>
          <div className="space-y-5">
            {pagedRequests.map((request) => (
              <article key={request.id} className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
                {(() => {
                  const provisionedDomainRecord = request.provisioned_organization_id
                    ? organizationDomains[request.provisioned_organization_id]?.find(
                        (domain) => domain.domain === request.custom_domain
                      ) || null
                    : null;

                  return (
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="font-heading text-2xl font-semibold text-foreground">{request.organization_name}</h2>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${planClass[request.selected_plan] ?? "border-border bg-muted/40 text-muted-foreground"}`}>
                        {request.selected_plan}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                        {request.setup_mode === "self_serve" ? "Self-Serve" : "Assisted"}
                      </span>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${onboardingStatusClass[request.status] ?? "border-border bg-muted text-muted-foreground"}`}>
                        {request.status}
                      </span>
                      {request.provisioned_organization_id ? (
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                          Provisioned
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Submitted {formatAppDateTime(request.created_at)}
                      {request.updated_at ? ` · Updated ${formatAppDateTime(request.updated_at)}` : ""}
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl border border-border/70 bg-background px-4 py-4 text-sm">
                        <p className="text-muted-foreground">Owner</p>
                        <p className="mt-2 font-medium text-foreground">{request.owner_full_name}</p>
                        <p className="text-muted-foreground">{request.owner_email}</p>
                        <p className="text-muted-foreground">{request.owner_phone}</p>
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-background px-4 py-4 text-sm">
                        <p className="text-muted-foreground">Lab Setup</p>
                        <p className="mt-2 font-medium text-foreground">{request.primary_lab_name || "Primary lab not specified"}</p>
                        <p className="text-muted-foreground">{request.branch_count} branch(es)</p>
                        <p className="text-muted-foreground">{request.city || "City not provided"}</p>
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-background px-4 py-4 text-sm">
                        <p className="text-muted-foreground">Launch Preferences</p>
                        <p className="mt-2 font-medium text-foreground">
                          {request.custom_domain || "No primary custom domain requested"}
                        </p>
                        <p className="text-muted-foreground">
                          Fallback: {request.preferred_subdomain ? `${request.preferred_subdomain}` : "No fallback subdomain requested"}
                        </p>
                        <p className="text-muted-foreground">
                          Go-live: {request.go_live_target || "Not specified"}
                        </p>
                        <p className="text-muted-foreground">
                          Import: {request.needs_data_import ? "Yes" : "No"} · White-label: {request.needs_white_label ? "Yes" : "No"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-background px-4 py-4 text-sm">
                        <p className="text-muted-foreground">Attribution</p>
                        <p className="mt-2 font-medium text-foreground">{request.utm_source || "Direct"}</p>
                        <p className="text-muted-foreground">{request.utm_medium || "-"}</p>
                        <p className="text-muted-foreground">{request.utm_campaign || "-"}</p>
                      </div>
                    </div>
                    {request.coupon_code ? (
                      <div className="flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
                        <span className="font-semibold text-amber-800 dark:text-amber-300">Coupon:</span>
                        <span className="font-mono font-bold tracking-widest text-amber-900 dark:text-amber-200">{request.coupon_code}</span>
                      </div>
                    ) : null}
                    {request.notes ? (
                      <div className="rounded-2xl border border-border/70 bg-background px-4 py-4 text-sm leading-7 text-muted-foreground">
                        {request.notes}
                      </div>
                    ) : null}
                    {request.custom_domain ? (
                      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-medium text-foreground">DNS handoff</p>
                            {provisionedDomainRecord ? (
                              <Badge variant={provisionedDomainRecord.verified_at ? "default" : "outline"} className="mt-2">
                                {provisionedDomainRecord.verified_at ? "Connected" : "Pending DNS"}
                              </Badge>
                            ) : null}
                          </div>
                          {provisionedDomainRecord ? (
                            <Button
                              type="button"
                              size="sm"
                              variant={provisionedDomainRecord.verified_at ? "outline" : "clinical"}
                              disabled={updatingDomainId === request.id}
                              onClick={() => void toggleDomainVerification(request)}
                            >
                              {updatingDomainId === request.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                              {provisionedDomainRecord.verified_at ? "Mark pending" : "Mark domain live"}
                            </Button>
                          ) : null}
                        </div>
                        {(() => {
                          const dnsGuide = getDnsGuide(
                            request.custom_domain,
                            request.resolved_access_domain ||
                              (request.preferred_subdomain ? getLaunchBaseUrl(null, request.preferred_subdomain)?.replace(/^https?:\/\//, "") || null : null) ||
                              null,
                          );

                          if (!dnsGuide) {
                            return (
                              <p className="mt-2 text-muted-foreground">
                                Keep the fallback launch domain active until the customer's DNS is connected.
                              </p>
                            );
                          }

                          return (
                            <div className="mt-3 grid gap-2 text-muted-foreground sm:grid-cols-2">
                              <p>Record type: {dnsGuide.recordType}</p>
                              <p>Host / Name: {dnsGuide.hostLabel}</p>
                              <p className="sm:col-span-2 break-all">Target: {dnsGuide.target}</p>
                              {dnsGuide.isApexDomain ? (
                                <p className="sm:col-span-2 text-xs">
                                  Root domains may need provider-specific ALIAS or ANAME support instead of a plain CNAME.
                                </p>
                              ) : null}
                            </div>
                          );
                        })()}
                      </div>
                    ) : null}
                    {request.provisioning_error ? (
                      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-4 text-sm text-destructive">
                        Provisioning error: {request.provisioning_error}
                      </div>
                    ) : null}
                    {request.provisioned_organization_id ? (
                      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-4 text-sm">
                        <p className="font-medium text-foreground">Provisioned Workspace</p>
                        <div className="mt-3 grid gap-2 text-muted-foreground sm:grid-cols-2">
                          <p>Slug: {request.resolved_slug || "-"}</p>
                          <p>Primary domain: {request.resolved_domain || "-"}</p>
                          <p>Launch domain: {request.resolved_access_domain || request.resolved_domain || "-"}</p>
                          <p>Provisioned at: {request.provisioned_at ? formatAppDateTime(request.provisioned_at) : "-"}</p>
                          <p>Organization ID: {request.provisioned_organization_id}</p>
                        </div>
                        {getLaunchBaseUrl(request.resolved_access_domain || request.resolved_domain, request.resolved_slug) ? (
                          <div className="mt-3">
                            <Button asChild size="sm" variant="outline">
                              <a
                                href={getLaunchBaseUrl(request.resolved_access_domain || request.resolved_domain, request.resolved_slug) || "#"}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <ExternalLink className="mr-2 h-4 w-4" />
                                Open Tenant Site
                              </a>
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {provisioningResults[request.id] ? (
                      <div className="rounded-2xl border border-clinical-blue/30 bg-clinical-blue/5 px-4 py-4 text-sm">
                        <p className="font-medium text-foreground">Launch Details</p>
                        <div className="mt-3 grid gap-2 text-muted-foreground sm:grid-cols-2">
                          <p>Owner email: {provisioningResults[request.id].owner_email}</p>
                          <p>Temporary password: {provisioningResults[request.id].temporary_password}</p>
                          <p>Notification: {provisioningResults[request.id].owner_notification_status}</p>
                          <p>Slug: {provisioningResults[request.id].organization_slug || "-"}</p>
                          <p>Primary domain: {provisioningResults[request.id].primary_domain || "-"}</p>
                          <p>Launch domain: {provisioningResults[request.id].access_domain || provisioningResults[request.id].primary_domain || "-"}</p>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button asChild size="sm" variant="outline">
                            <a href={provisioningResults[request.id].launch_url} target="_blank" rel="noreferrer">
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Workspace
                            </a>
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <a href={provisioningResults[request.id].staff_login_url} target="_blank" rel="noreferrer">
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Staff Login
                            </a>
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <a href={provisioningResults[request.id].booking_url} target="_blank" rel="noreferrer">
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Booking
                            </a>
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    <div className="grid gap-3 xl:grid-cols-2">
                      <div className="rounded-2xl border border-border/70 bg-background px-4 py-4 text-sm">
                        <p className="text-muted-foreground">Internal Notes</p>
                        <Textarea
                          id={`status-notes-${request.id}`}
                          name={`statusNotes-${request.id}`}
                          value={draftStatusNotes[request.id] || ""}
                          onChange={(event) =>
                            setDraftStatusNotes((current) => ({
                              ...current,
                              [request.id]: event.target.value,
                            }))
                          }
                          rows={4}
                          className="mt-3"
                          placeholder="Add internal rollout notes, blockers, or follow-up context."
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          disabled={updatingId === request.id}
                          onClick={() => void saveStatusNotes(request.id)}
                        >
                          <Save className="mr-2 h-4 w-4" />
                          Save Notes
                        </Button>
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-background px-4 py-4 text-sm">
                        <p className="text-muted-foreground">Assignment And Follow-up</p>
                        <div className="mt-3 space-y-3">
                          <p className="text-foreground/80">
                            Assigned: {request.assigned_to === user?.id ? "You" : request.assigned_to ? "Another platform admin" : "Unassigned"}
                          </p>
                          <p className="text-muted-foreground">
                            Assigned at: {request.assigned_at ? formatAppDateTime(request.assigned_at) : "-"}
                          </p>
                          <Input
                            type="datetime-local"
                            value={draftFollowUpAt[request.id] || ""}
                            onChange={(event) =>
                              setDraftFollowUpAt((current) => ({
                                ...current,
                                [request.id]: event.target.value,
                              }))
                            }
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={updatingId === request.id}
                              onClick={() => void assignToCurrentUser(request.id)}
                            >
                              <UserCheck className="mr-2 h-4 w-4" />
                              Assign To Me
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={updatingId === request.id}
                              onClick={() => void saveFollowUp(request.id)}
                            >
                              <CalendarClock className="mr-2 h-4 w-4" />
                              Save Follow-up
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex min-w-[220px] flex-col gap-2">
                    <Button
                      variant="clinical"
                      size="sm"
                      disabled={updatingId === request.id || provisioningId === request.id || Boolean(request.provisioned_organization_id)}
                      onClick={() => void provisionRequest(request.id)}
                    >
                      {provisioningId === request.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
                      {request.provisioned_organization_id ? "Provisioned" : "Approve And Provision"}
                    </Button>
                    {statusOptions.map((status) => (
                      <Button
                        key={status}
                        variant={request.status === status ? "clinical" : "outline"}
                        size="sm"
                        disabled={updatingId === request.id}
                        onClick={() => void updateStatus(request.id, status)}
                      >
                        {updatingId === request.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Mark {status}
                      </Button>
                    ))}
                    <div className="rounded-2xl border border-border/70 bg-background px-4 py-4 text-xs leading-6 text-muted-foreground">
                      <p>Reviewing at: {request.reviewing_at ? formatAppDateTime(request.reviewing_at) : "-"}</p>
                      <p>Approved at: {request.approved_at ? formatAppDateTime(request.approved_at) : "-"}</p>
                      <p>Closed at: {request.closed_at ? formatAppDateTime(request.closed_at) : "-"}</p>
                    </div>
                  </div>
                </div>
                  );
                })()}
              </article>
            ))}
          </div>
          <DataPagination
            total={filteredRequests.length}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
          </>
        )}
      </div>
    </PlatformRoute>
  );
};

export default PlatformOnboarding;
