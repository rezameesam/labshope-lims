import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarClock, Download, Loader2, RefreshCw, Save, UserCheck, Users, Zap } from "lucide-react";
import { SkeletonTable } from "@/components/ui/skeleton-table";
import PlatformRoute from "@/components/platform/PlatformRoute";
import { formatAppDateTime } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { DataPagination } from "@/components/ui/data-pagination";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type PlatformLead = {
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

type ConvertDialogData = {
  organization_name: string;
  owner_full_name: string;
  owner_email: string;
  owner_phone: string;
  city: string;
  branch_count: number;
  selected_plan: "starter" | "growth" | "premium";
};

const statusOptions = ["new", "contacted", "qualified", "closed"] as const;
const quickFilterOptions = ["all", "new", "mine", "due"] as const;
type QuickFilter = (typeof quickFilterOptions)[number];

const leadStatusClass: Record<string, string> = {
  new: "border-blue-200 bg-blue-50 text-blue-700",
  contacted: "border-amber-200 bg-amber-50 text-amber-700",
  qualified: "border-emerald-200 bg-emerald-50 text-emerald-700",
  closed: "border-slate-200 bg-slate-100 text-slate-500",
};

const PAGE_SIZE = 20;

const PlatformLeads = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<PlatformLead[]>([]);
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);
  const [draftStatusNotes, setDraftStatusNotes] = useState<Record<string, string>>({});
  const [draftFollowUpAt, setDraftFollowUpAt] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [page, setPage] = useState(1);

  // Convert to onboarding dialog state
  const [convertLead, setConvertLead] = useState<PlatformLead | null>(null);
  const [convertData, setConvertData] = useState<ConvertDialogData>({
    organization_name: "",
    owner_full_name: "",
    owner_email: "",
    owner_phone: "",
    city: "",
    branch_count: 1,
    selected_plan: "starter",
  });
  const [converting, setConverting] = useState(false);

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

  const loadLeads = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("platform_demo_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Error loading platform demo requests:", error);
      toast.error("Failed to load demo requests.");
    } else {
      const nextLeads = (data || []) as PlatformLead[];
      setLeads(nextLeads);
      setDraftStatusNotes(
        nextLeads.reduce<Record<string, string>>((accumulator, lead) => {
          accumulator[lead.id] = lead.status_notes || "";
          return accumulator;
        }, {}),
      );
      setDraftFollowUpAt(
        nextLeads.reduce<Record<string, string>>((accumulator, lead) => {
          accumulator[lead.id] = toDateTimeLocalValue(lead.next_follow_up_at);
          return accumulator;
        }, {}),
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadLeads();
  }, []);

  const metrics = useMemo(() => {
    const newCount = leads.filter((lead) => lead.status === "new").length;
    const attributedCount = leads.filter(
      (lead) => lead.utm_source || lead.utm_medium || lead.utm_campaign,
    ).length;
    const assignedToMeCount = leads.filter((lead) => lead.assigned_to === user?.id).length;
    const dueFollowUpsCount = leads.filter((lead) => {
      if (!lead.next_follow_up_at) {
        return false;
      }
      return new Date(lead.next_follow_up_at).getTime() <= Date.now();
    }).length;

    return {
      total: leads.length,
      newCount,
      attributedCount,
      assignedToMeCount,
      dueFollowUpsCount,
    };
  }, [leads, user?.id]);

  const filteredLeads = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return leads.filter((lead) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          lead.full_name,
          lead.lab_name,
          lead.email,
          lead.phone,
          lead.city,
          lead.utm_source,
          lead.utm_campaign,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));

      if (!matchesSearch) {
        return false;
      }

      if (quickFilter === "new") {
        return lead.status === "new";
      }

      if (quickFilter === "mine") {
        return lead.assigned_to === user?.id;
      }

      if (quickFilter === "due") {
        return Boolean(
          lead.next_follow_up_at && new Date(lead.next_follow_up_at).getTime() <= Date.now(),
        );
      }

      return true;
    });
  }, [leads, quickFilter, searchTerm, user?.id]);

  useEffect(() => { setPage(1); }, [searchTerm, quickFilter]);

  const pagedLeads = useMemo(
    () => filteredLeads.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredLeads, page],
  );

  const exportCsv = () => {
    if (!filteredLeads.length) {
      toast.error("No leads to export.");
      return;
    }

    const headers = [
      "created_at",
      "status",
      "full_name",
      "lab_name",
      "email",
      "phone",
      "city",
      "branch_count",
      "hostname",
      "page_path",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "updated_at",
      "contacted_at",
      "qualified_at",
      "closed_at",
      "assigned_to",
      "assigned_at",
      "next_follow_up_at",
      "status_notes",
      "notes",
    ];

    const rows = filteredLeads.map((lead) =>
      headers
        .map((header) => {
          const rawValue = String((lead as any)[header] ?? "");
          return `"${rawValue.replaceAll('"', '""')}"`;
        })
        .join(","),
    );

    const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "platform-demo-requests.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const updateLead = async (
    leadId: string,
    updates: Partial<Pick<PlatformLead, "status" | "status_notes" | "assigned_to" | "next_follow_up_at">>,
    successMessage: string,
  ) => {
    setUpdatingLeadId(leadId);
    const { data, error } = await (supabase as any)
      .from("platform_demo_requests")
      .update(updates)
      .eq("id", leadId)
      .select("*")
      .single();
    const nextLead = data || null;

    if (error) {
      console.error("Error updating platform lead:", error);
      toast.error("Failed to update lead.");
    } else {
      setLeads((current) =>
        current.map((lead) => (lead.id === leadId ? { ...lead, ...(nextLead || updates) } : lead)),
      );
      if (nextLead?.status_notes !== undefined) {
        setDraftStatusNotes((current) => ({
          ...current,
          [leadId]: nextLead.status_notes || "",
        }));
      }
      if (nextLead?.next_follow_up_at !== undefined) {
        setDraftFollowUpAt((current) => ({
          ...current,
          [leadId]: toDateTimeLocalValue(nextLead.next_follow_up_at),
        }));
      }
      toast.success(successMessage);
    }
    setUpdatingLeadId(null);
  };

  const updateStatus = async (leadId: string, nextStatus: string) => {
    await updateLead(leadId, { status: nextStatus }, "Lead status updated.");
  };

  const saveStatusNotes = async (leadId: string) => {
    await updateLead(
      leadId,
      { status_notes: draftStatusNotes[leadId] || "" },
      "Follow-up notes saved.",
    );
  };

  const assignToCurrentUser = async (leadId: string) => {
    if (!user?.id) {
      return;
    }

    await updateLead(leadId, { assigned_to: user.id }, "Lead assigned.");
  };

  const saveFollowUp = async (leadId: string) => {
    await updateLead(
      leadId,
      { next_follow_up_at: fromDateTimeLocalValue(draftFollowUpAt[leadId] || "") },
      "Next follow-up updated.",
    );
  };

  const openConvertDialog = (lead: PlatformLead) => {
    setConvertLead(lead);
    setConvertData({
      organization_name: lead.lab_name,
      owner_full_name: lead.full_name,
      owner_email: lead.email,
      owner_phone: lead.phone,
      city: lead.city || "",
      branch_count: lead.branch_count || 1,
      selected_plan: "starter",
    });
  };

  const handleConvertToOnboarding = async () => {
    if (!convertLead) return;
    setConverting(true);
    const { error } = await (supabase as any)
      .from("platform_onboarding_requests")
      .insert({
        organization_name: convertData.organization_name,
        owner_full_name: convertData.owner_full_name,
        owner_email: convertData.owner_email,
        owner_phone: convertData.owner_phone,
        city: convertData.city,
        branch_count: convertData.branch_count,
        selected_plan: convertData.selected_plan,
        setup_mode: "assisted",
        status: "reviewing",
        utm_source: convertLead.utm_source,
        utm_medium: convertLead.utm_medium,
        utm_campaign: convertLead.utm_campaign,
      });

    if (error) {
      console.error("Error creating onboarding request:", error);
      toast.error("Failed to create onboarding request.");
    } else {
      toast.success("Onboarding request created.");
      setConvertLead(null);
    }
    setConverting(false);
  };

  const isFollowUpOverdue = (next_follow_up_at: string | null): boolean => {
    if (!next_follow_up_at) return false;
    return new Date(next_follow_up_at).getTime() <= Date.now();
  };

  return (
    <PlatformRoute>
      <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-6 shadow-sm lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Pipeline
            </p>
            <h1 className="mt-2 font-heading text-4xl font-bold tracking-tight text-slate-950">
              Demo Leads
            </h1>
            <p className="mt-3 text-slate-600">
              Review root-site product leads, update status, and export for follow-up.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => void loadLeads()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="clinical" onClick={exportCsv}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">Total leads</p>
            <p className="mt-3 font-heading text-4xl font-bold">{metrics.total}</p>
          </div>
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">New leads</p>
            <p className="mt-3 font-heading text-4xl font-bold">{metrics.newCount}</p>
          </div>
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">Attributed leads</p>
            <p className="mt-3 font-heading text-4xl font-bold">{metrics.attributedCount}</p>
          </div>
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">Assigned to me</p>
            <p className="mt-3 font-heading text-4xl font-bold">{metrics.assignedToMeCount}</p>
          </div>
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">Follow-ups due</p>
            <p className="mt-3 font-heading text-4xl font-bold">{metrics.dueFollowUpsCount}</p>
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col gap-4 sm:flex-row">
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by lead, lab, email, phone, city, or campaign"
                className="sm:max-w-md"
              />
              <div className="flex flex-wrap gap-2">
                {quickFilterOptions.map((option) => (
                  <Button
                    key={option}
                    variant={quickFilter === option ? "clinical" : "outline"}
                    size="sm"
                    onClick={() => setQuickFilter(option)}
                  >
                    {option === "all"
                      ? "All"
                      : option === "new"
                        ? "New"
                        : option === "mine"
                          ? "Assigned To Me"
                          : "Follow-ups Due"}
                  </Button>
                ))}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Showing {filteredLeads.length} of {leads.length} leads
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-border bg-card shadow-sm">
          {loading ? (
            <SkeletonTable rows={5} columns={4} className="rounded-none border-0 shadow-none" />
          ) : filteredLeads.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <Users className="h-5 w-5 text-slate-400" />
              </div>
              <p className="font-semibold text-slate-700">No leads match the current filters</p>
              <p className="max-w-sm text-sm text-slate-500">
                Try broadening the search or switching to "All" to see every submitted demo request.
              </p>
            </div>
          ) : (
            <>
            <div className="divide-y divide-border">
              {pagedLeads.map((lead) => (
                <div key={lead.id} className="grid gap-6 px-6 py-6 lg:grid-cols-[1.2fr_0.8fr]">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="font-heading text-2xl font-semibold text-foreground">
                        {lead.full_name}
                      </h2>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${leadStatusClass[lead.status] ?? "border-slate-200 bg-slate-100 text-slate-600"}`}>
                        {lead.status}
                      </span>
                      {lead.status === "qualified" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          onClick={() => openConvertDialog(lead)}
                        >
                          <Zap className="mr-1.5 h-3.5 w-3.5" />
                          Convert to Onboarding
                        </Button>
                      )}
                    </div>
                    <p className="mt-2 text-base font-medium text-clinical-navy">{lead.lab_name}</p>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {lead.email} · {lead.phone}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Submitted {formatAppDateTime(lead.created_at)}
                      {lead.updated_at ? ` · Updated ${formatAppDateTime(lead.updated_at)}` : ""}
                      {lead.city ? ` · ${lead.city}` : ""}
                      {lead.branch_count ? ` · ${lead.branch_count} branches` : ""}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {lead.assigned_to === user?.id
                        ? "Assigned to you"
                        : lead.assigned_to
                          ? "Assigned to another platform admin"
                          : "Unassigned"}
                      {lead.assigned_at ? ` · Assigned ${formatAppDateTime(lead.assigned_at)}` : ""}
                      {lead.next_follow_up_at ? (
                        isFollowUpOverdue(lead.next_follow_up_at) ? (
                          <span className="ml-1 inline-flex items-center gap-1 font-medium text-red-600">
                            <AlertCircle className="h-3.5 w-3.5" />
                            Overdue: {formatAppDateTime(lead.next_follow_up_at)}
                          </span>
                        ) : (
                          ` · Next follow-up ${formatAppDateTime(lead.next_follow_up_at)}`
                        )
                      ) : ""}
                    </p>

                    {lead.notes && (
                      <div className="mt-4 rounded-2xl border border-border bg-muted/40 p-4 text-sm leading-7 text-foreground/80">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Submitted Notes
                        </p>
                        {lead.notes}
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-2xl border border-border bg-muted/30 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Attribution</p>
                      <div className="mt-3 space-y-2 text-sm text-foreground/80">
                        <p>Source: {lead.utm_source || "-"}</p>
                        <p>Medium: {lead.utm_medium || "-"}</p>
                        <p>Campaign: {lead.utm_campaign || "-"}</p>
                        <p>Hostname: {lead.hostname || "-"}</p>
                        <p>Page: {lead.page_path || "-"}</p>
                        <p>Contacted: {lead.contacted_at ? formatAppDateTime(lead.contacted_at) : "-"}</p>
                        <p>Qualified: {lead.qualified_at ? formatAppDateTime(lead.qualified_at) : "-"}</p>
                        <p>Closed: {lead.closed_at ? formatAppDateTime(lead.closed_at) : "-"}</p>
                        <p>Assigned: {lead.assigned_at ? formatAppDateTime(lead.assigned_at) : "-"}</p>
                        <p>
                          Next follow-up:{" "}
                          {lead.next_follow_up_at ? (
                            isFollowUpOverdue(lead.next_follow_up_at) ? (
                              <span className="inline-flex items-center gap-1 font-medium text-red-600">
                                <AlertCircle className="h-3 w-3" />
                                {formatAppDateTime(lead.next_follow_up_at)}
                              </span>
                            ) : (
                              formatAppDateTime(lead.next_follow_up_at)
                            )
                          ) : (
                            "-"
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-muted/30 p-4">
                      <div className="flex flex-wrap gap-3">
                        <Button
                          variant="outline"
                          onClick={() => void assignToCurrentUser(lead.id)}
                          disabled={updatingLeadId === lead.id || lead.assigned_to === user?.id}
                        >
                          <UserCheck className="mr-2 h-4 w-4" />
                          {lead.assigned_to === user?.id ? "Assigned to you" : "Assign to me"}
                        </Button>
                      </div>

                      <label className="mt-4 block text-sm font-medium text-foreground">
                        Next follow-up
                        <Input
                          className="mt-2 bg-background"
                          type="datetime-local"
                          value={draftFollowUpAt[lead.id] || ""}
                          onChange={(event) =>
                            setDraftFollowUpAt((current) => ({
                              ...current,
                              [lead.id]: event.target.value,
                            }))
                          }
                          disabled={updatingLeadId === lead.id}
                        />
                      </label>

                      <div className="mt-3 flex justify-end">
                        <Button
                          variant="outline"
                          onClick={() => void saveFollowUp(lead.id)}
                          disabled={updatingLeadId === lead.id}
                        >
                          <CalendarClock className="mr-2 h-4 w-4" />
                          Save Follow-up
                        </Button>
                      </div>
                    </div>

                    <label className="block text-sm font-medium text-foreground">
                      Update status
                      <select
                        className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={lead.status}
                        onChange={(event) => void updateStatus(lead.id, event.target.value)}
                        disabled={updatingLeadId === lead.id}
                      >
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="rounded-2xl border border-border bg-muted/30 p-4">
                      <label className="block text-sm font-medium text-foreground">
                        Internal follow-up notes
                      </label>
                      <Textarea
                        className="mt-2 min-h-[120px] bg-background"
                        placeholder="Add internal follow-up context, next steps, or call notes."
                        value={draftStatusNotes[lead.id] || ""}
                        onChange={(event) =>
                          setDraftStatusNotes((current) => ({
                            ...current,
                            [lead.id]: event.target.value,
                          }))
                        }
                        disabled={updatingLeadId === lead.id}
                      />
                      <div className="mt-3 flex justify-end">
                        <Button
                          variant="outline"
                          onClick={() => void saveStatusNotes(lead.id)}
                          disabled={updatingLeadId === lead.id}
                        >
                          <Save className="mr-2 h-4 w-4" />
                          Save Notes
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <DataPagination
              total={filteredLeads.length}
              page={page}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
          )}
        </div>
      </div>

      {/* Convert to Onboarding Dialog */}
      <Dialog open={Boolean(convertLead)} onOpenChange={(open) => { if (!open) setConvertLead(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Convert to Onboarding</DialogTitle>
            <DialogDescription>
              Create an assisted onboarding request for this qualified lead. Review and confirm the details below.
            </DialogDescription>
          </DialogHeader>

          {convertLead && (
            <div className="space-y-4 py-2">
              <div>
                <label className="block text-sm font-medium text-foreground">
                  Organization name
                  <Input
                    className="mt-1.5"
                    value={convertData.organization_name}
                    onChange={(e) => setConvertData((d) => ({ ...d, organization_name: e.target.value }))}
                  />
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground">
                  Owner email
                  <Input
                    className="mt-1.5"
                    type="email"
                    value={convertData.owner_email}
                    onChange={(e) => setConvertData((d) => ({ ...d, owner_email: e.target.value }))}
                  />
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground">
                  City
                  <Input
                    className="mt-1.5"
                    value={convertData.city}
                    onChange={(e) => setConvertData((d) => ({ ...d, city: e.target.value }))}
                  />
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground">
                  Plan
                </label>
                <Select
                  value={convertData.selected_plan}
                  onValueChange={(value) =>
                    setConvertData((d) => ({ ...d, selected_plan: value as "starter" | "growth" | "premium" }))
                  }
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="growth">Growth</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(convertLead.utm_source || convertLead.utm_medium || convertLead.utm_campaign) && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                  <span className="font-semibold uppercase tracking-wide">Attribution</span>
                  <span className="ml-2">
                    {[convertLead.utm_source, convertLead.utm_medium, convertLead.utm_campaign]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertLead(null)} disabled={converting}>
              Cancel
            </Button>
            <Button
              variant="clinical"
              onClick={() => void handleConvertToOnboarding()}
              disabled={converting || !convertData.organization_name || !convertData.owner_email}
            >
              {converting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Onboarding Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PlatformRoute>
  );
};

export default PlatformLeads;
