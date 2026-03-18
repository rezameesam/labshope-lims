import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, ExternalLink, Globe2, RefreshCw, Search } from "lucide-react";
import { SkeletonCard } from "@/components/ui/skeleton-card";
import { SkeletonTable } from "@/components/ui/skeleton-table";
import PlatformRoute from "@/components/platform/PlatformRoute";
import { Button } from "@/components/ui/button";
import { DataPagination } from "@/components/ui/data-pagination";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAppDateTime } from "@/lib/date";
import {
  usePlatformCustomers,
  isFullyConnected,
  type CustomerRecord,
} from "@/hooks/queries/usePlatformCustomers";
import { toast } from "sonner";

const planOptions = ["all", "starter", "growth", "premium", "unassigned"] as const;
type PlanFilter = (typeof planOptions)[number];

const statusOptions = ["all", "connected", "pending_dns", "fallback_only"] as const;
type StatusFilter = (typeof statusOptions)[number];

const healthOptions = ["all", "fully_connected", "has_issues"] as const;
type HealthFilter = (typeof healthOptions)[number];

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
  const { data: customers = [], isLoading: loading, refetch, error } = usePlatformCustomers();
  const [searchTerm, setSearchTerm] = useState("");
  const [planFilter, setPlanFilter] = useState<PlanFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  if (error) {
    toast.error("Failed to load platform customers.");
  }

  const metrics = useMemo(() => {
    const connected = customers.filter((c) => c.customDomainConnected).length;
    const pendingDns = customers.filter((c) => c.customDomainPending).length;
    const selfServe = customers.filter((c) => c.setupMode === "self_serve").length;
    const fullyConnected = customers.filter((c) => isFullyConnected(c.health)).length;

    return { total: customers.length, connected, pendingDns, selfServe, fullyConnected };
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return customers.filter((customer) => {
      const matchesSearch =
        !normalizedSearch ||
        [customer.displayName, customer.slug, customer.primaryDomain, customer.fallbackDomain]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));

      if (!matchesSearch) return false;
      if (planFilter !== "all" && customer.selectedPlan !== planFilter) return false;
      if (statusFilter === "connected") return customer.customDomainConnected;
      if (statusFilter === "pending_dns") return customer.customDomainPending;
      if (statusFilter === "fallback_only") return !customer.customDomainConnected && !customer.customDomainPending;
      if (healthFilter === "fully_connected") return isFullyConnected(customer.health);
      if (healthFilter === "has_issues") return !isFullyConnected(customer.health);
      return true;
    });
  }, [customers, planFilter, searchTerm, statusFilter, healthFilter]);

  const pagedCustomers = useMemo(
    () => filteredCustomers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredCustomers, page],
  );

  if (loading) {
    return (
      <PlatformRoute>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
          <SkeletonTable rows={8} columns={6} />
        </div>
      </PlatformRoute>
    );
  }

  return (
    <PlatformRoute>
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
                  <Button variant="outline" onClick={() => void refetch()}>
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
                  <label htmlFor="customer-search" className="sr-only">Search customers</label>
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
    </PlatformRoute>
  );
};

export default PlatformCustomers;
