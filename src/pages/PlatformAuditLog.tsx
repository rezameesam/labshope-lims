import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import PlatformRoute from "@/components/platform/PlatformRoute";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataPagination } from "@/components/ui/data-pagination";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
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
import { formatAppDateTime } from "@/lib/date";
import { toast } from "sonner";

interface AuditLogEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown> | null;
  user_id: string | null;
  created_at: string;
}

export default function PlatformAuditLog() {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [filterEntityType, setFilterEntityType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const loadEntries = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("platform_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) {
        if (error.code === "42P01") {
          // Table doesn't exist yet — show empty state
          setEntries([]);
        } else {
          toast.error("Failed to load audit log.");
        }
      } else {
        setEntries(data || []);
      }
    } catch {
      setEntries([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadEntries();
  }, []);

  const uniqueActions = Array.from(new Set(entries.map((e) => e.action))).sort();
  const uniqueEntityTypes = Array.from(
    new Set(entries.map((e) => e.entity_type)),
  ).sort();

  const filtered = entries.filter((e) => {
    if (filterAction !== "all" && e.action !== filterAction) return false;
    if (filterEntityType !== "all" && e.entity_type !== filterEntityType)
      return false;
    if (
      search &&
      !e.entity_id.includes(search) &&
      !e.action.includes(search) &&
      !e.entity_type.includes(search)
    )
      return false;
    if (dateFrom && e.created_at < dateFrom) return false;
    if (dateTo && e.created_at > dateTo + "T23:59:59") return false;
    return true;
  });

  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <PlatformRoute>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Audit Log</h2>
            <p className="text-sm text-muted-foreground">
              Platform-level action trail for ops and compliance.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadEntries()}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Input
            placeholder="Search action, entity…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={filterAction} onValueChange={setFilterAction}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {uniqueActions.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterEntityType} onValueChange={setFilterEntityType}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Entity type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All entities</SelectItem>
              {uniqueEntityTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label htmlFor="audit-date-from" className="sr-only">From date</label>
          <DatePicker value={dateFrom} onChange={setDateFrom} className="w-[200px]" />
          <label htmlFor="audit-date-to" className="sr-only">To date</label>
          <DatePicker value={dateTo} onChange={setDateTo} className="w-[200px]" />
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-[28px] border border-border bg-card shadow-sm">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity Type</TableHead>
                    <TableHead>Entity ID</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-8 text-center text-muted-foreground"
                      >
                        No audit log entries found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginated.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatAppDateTime(entry.created_at)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{entry.action}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {entry.entity_type}
                        </TableCell>
                        <TableCell className="max-w-[140px] truncate font-mono text-xs text-muted-foreground">
                          {entry.entity_id}
                        </TableCell>
                        <TableCell className="max-w-[120px] truncate font-mono text-xs text-muted-foreground">
                          {entry.user_id ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                          {entry.details ? JSON.stringify(entry.details) : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <div className="border-t border-slate-100 px-4 py-3">
                <DataPagination
                  total={filtered.length}
                  page={page}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={() => {}}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </PlatformRoute>
  );
}
