import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCcw, Search } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { formatAppDateTimeWithSeconds } from "@/lib/date";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type VisitorLog = {
  id: string;
  event_type: string;
  path: string | null;
  referrer: string | null;
  ip: string | null;
  country_code: string | null;
  country_name: string | null;
  created_at: string;
};

type Filters = {
  search: string;
  eventType: string;
  dateFrom: string;
  dateTo: string;
};

const PAGE_SIZE = 25;

const EVENT_FILTERS = [
  { value: "all", label: "All Events" },
  { value: "page_view", label: "Page View" },
  { value: "consent_update", label: "Consent Update" },
];

const escapeCsv = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }
  const raw =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  if (raw.includes(",") || raw.includes("\n") || raw.includes('"')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
};

const ManageVisitorLogs = () => {
  const { organization, loading: organizationLoading } = useOrganization();
  const organizationId = organization?.id ?? null;
  const [logs, setLogs] = useState<VisitorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);

  const [filters, setFilters] = useState<Filters>({
    search: "",
    eventType: "all",
    dateFrom: "",
    dateTo: "",
  });
  const [appliedFilters, setAppliedFilters] = useState<Filters>({
    search: "",
    eventType: "all",
    dateFrom: "",
    dateTo: "",
  });

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalRows / PAGE_SIZE)),
    [totalRows]
  );
  const startRow = totalRows === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endRow = Math.min(page * PAGE_SIZE, totalRows);

  const applyQueryFilters = (query: any, activeFilters: Filters) => {
    const search = activeFilters.search.trim();
    if (search) {
      const sanitized = search.replace(/,/g, " ");
      query = query.or(
        `event_type.ilike.%${sanitized}%,path.ilike.%${sanitized}%,referrer.ilike.%${sanitized}%,ip.ilike.%${sanitized}%,country_code.ilike.%${sanitized}%,country_name.ilike.%${sanitized}%`
      );
    }

    if (activeFilters.eventType !== "all") {
      query = query.eq("event_type", activeFilters.eventType);
    }

    if (activeFilters.dateFrom) {
      query = query.gte("created_at", `${activeFilters.dateFrom}T00:00:00`);
    }

    if (activeFilters.dateTo) {
      query = query.lte("created_at", `${activeFilters.dateTo}T23:59:59`);
    }

    return query;
  };

  const fetchLogs = useCallback(async (targetPage: number) => {
    if (!organizationId) {
      setLogs([]);
      setTotalRows(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let query = supabase
        .from("visitor_logs" as any)
        .select("*", { count: "exact" })
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      query = applyQueryFilters(query, appliedFilters);

      const from = (targetPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error, count } = await query.range(from, to);

      if (error) {
        throw error;
      }

      setLogs((data || []) as VisitorLog[]);
      setTotalRows(count || 0);
    } catch (error: any) {
      console.error("Error fetching visitor logs:", error);
      toast.error(error.message || "Failed to fetch visitor logs");
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, organizationId]);

  const handleApplyFilters = () => {
    setPage(1);
    setAppliedFilters({ ...filters });
  };

  const handleResetFilters = () => {
    const resetFilters: Filters = {
      search: "",
      eventType: "all",
      dateFrom: "",
      dateTo: "",
    };
    setFilters(resetFilters);
    setAppliedFilters(resetFilters);
    setPage(1);
  };

  const handleExportCsv = async () => {
    if (!organizationId) {
      toast.error("Organization context is required to export visitor logs");
      return;
    }

    setExporting(true);
    try {
      let query = supabase
        .from("visitor_logs" as any)
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(10000);

      query = applyQueryFilters(query, appliedFilters);

      const { data, error } = await query;
      if (error) {
        throw error;
      }

      const headers = [
        "created_at",
        "event_type",
        "path",
        "referrer",
        "ip",
        "country_code",
        "country_name",
      ];

      const rows = (data || []).map((row: any) =>
        [
          row.created_at,
          row.event_type,
          row.path,
          row.referrer,
          row.ip,
          row.country_code,
          row.country_name,
        ]
          .map(escapeCsv)
          .join(",")
      );

      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `visitor_logs_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success("Visitor logs exported successfully");
    } catch (error: any) {
      console.error("Error exporting visitor logs:", error);
      toast.error(error.message || "Failed to export visitor logs");
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (organizationLoading) {
      return;
    }

    if (!organizationId) {
      setLogs([]);
      setTotalRows(0);
      setLoading(false);
      return;
    }

    void fetchLogs(page);
  }, [fetchLogs, organizationId, organizationLoading, page]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-heading font-bold text-clinical-navy">
          Visitor Logs
        </h2>
        <p className="text-muted-foreground">
          Review website visitor records collected by the site.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Search and filter visitor records. All collected fields are shown in full.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="visitor-search">Search</Label>
              <Input
                id="visitor-search"
                value={filters.search}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, search: event.target.value }))
                }
                placeholder="Path, IP, country, referrer..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="visitor-event-type">Event Type</Label>
              <Select
                value={filters.eventType}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, eventType: value }))
                }
              >
                <SelectTrigger id="visitor-event-type">
                  <SelectValue placeholder="Select event type" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_FILTERS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="visitor-date-from">From Date</Label>
              <DateInput
                id="visitor-date-from"
                value={filters.dateFrom}
                onChange={(value) =>
                  setFilters((prev) => ({ ...prev, dateFrom: value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="visitor-date-to">To Date</Label>
              <DateInput
                id="visitor-date-to"
                value={filters.dateTo}
                onChange={(value) =>
                  setFilters((prev) => ({ ...prev, dateTo: value }))
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleApplyFilters}>
              <Search className="h-4 w-4 mr-2" />
              Apply Filters
            </Button>
            <Button variant="outline" onClick={handleResetFilters}>
              Reset
            </Button>
            <Button variant="outline" onClick={() => void fetchLogs(page)}>
              <RefreshCcw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleExportCsv()}
              disabled={exporting}
            >
              <Download className="h-4 w-4 mr-2" />
              {exporting ? "Exporting..." : "Export CSV"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Records</CardTitle>
          <CardDescription>
            Showing {startRow}-{endRow} of {totalRows} rows.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[170px]">Created At</TableHead>
                  <TableHead className="min-w-[130px]">Event Type</TableHead>
                  <TableHead className="min-w-[220px]">Path</TableHead>
                  <TableHead className="min-w-[220px]">Referrer</TableHead>
                  <TableHead className="min-w-[150px]">IP</TableHead>
                  <TableHead className="min-w-[180px]">Country</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      Loading visitor records...
                    </TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      No visitor records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        {formatAppDateTimeWithSeconds(log.created_at)}
                      </TableCell>
                      <TableCell>{log.event_type || "-"}</TableCell>
                      <TableCell className="whitespace-pre-wrap break-words">
                        {log.path || "-"}
                      </TableCell>
                      <TableCell className="whitespace-pre-wrap break-words">
                        {log.referrer || "-"}
                      </TableCell>
                      <TableCell>{log.ip || "-"}</TableCell>
                      <TableCell className="whitespace-pre-wrap break-words">
                        {log.country_name || "-"}
                        {log.country_code ? ` (${log.country_code})` : ""}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1 || loading}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages || loading}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ManageVisitorLogs;
