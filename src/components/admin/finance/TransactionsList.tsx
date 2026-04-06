import { useState, useEffect, useCallback } from "react";
import {
  Search, Eye, ChevronLeft, ChevronRight, Printer,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOrganization } from "@/contexts/OrganizationContext";
import { formatAppDate, formatReportDate, formatPrintTimestamp } from "@/lib/date";
import { getTheme, fmt } from "./constants";

interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  reference: string | null;
  status: string;
  created_at: string;
}

interface EntryLine {
  id: string;
  account_id: string;
  description: string | null;
  debit: number;
  credit: number;
  account?: { code: string; name: string; type: string };
}

const PAGE_SIZE = 20;

const TransactionsList = () => {
  const { organization, branding } = useOrganization();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [detailEntry, setDetailEntry] = useState<JournalEntry | null>(null);
  const [detailLines, setDetailLines] = useState<EntryLine[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchEntries = useCallback(async () => {
    if (!organization?.id) return;
    setLoading(true);

    let query = (supabase as any)
      .from("journal_entries")
      .select("*", { count: "exact" })
      .eq("organization_id", organization.id)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (search.trim()) {
      query = query.or(`entry_number.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%,reference.ilike.%${search.trim()}%`);
    }
    if (dateFrom) query = query.gte("entry_date", dateFrom);
    if (dateTo) query = query.lte("entry_date", dateTo);

    const { data, count, error } = await query;
    if (error) toast.error("Failed to load transactions");
    else { setEntries(data || []); setTotal(count || 0); }
    setLoading(false);
  }, [organization?.id, page, search, dateFrom, dateTo]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const openDetail = async (entry: JournalEntry) => {
    setDetailEntry(entry);
    setDetailLoading(true);
    const { data, error } = await (supabase as any)
      .from("journal_entry_lines")
      .select("*, account:accounts(code, name, type)")
      .eq("journal_entry_id", entry.id);
    if (error) toast.error("Failed to load entry details");
    else setDetailLines(data || []);
    setDetailLoading(false);
  };

  const handlePrintEntry = () => {
    if (!detailEntry || detailLines.length === 0) return;
    const pw = window.open("", "_blank");
    if (!pw) { toast.error("Please allow popups to print"); return; }

    const totalD = detailLines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const totalC = detailLines.reduce((s, l) => s + (Number(l.credit) || 0), 0);

    const rows = detailLines.map((l) => {
      const th = l.account ? getTheme(l.account.type) : null;
      return `<tr>
        <td>${th ? `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${th.printColor};margin-right:6px"></span>` : ""}
          <span class="mono" style="font-size:11px;color:#888">${l.account?.code || ""}</span>
          ${l.account?.name || ""}
          ${l.description ? `<br><span style="font-size:10px;color:#999">${l.description}</span>` : ""}
        </td>
        <td class="right mono">${Number(l.debit) > 0 ? fmt(Number(l.debit)) : ""}</td>
        <td class="right mono">${Number(l.credit) > 0 ? fmt(Number(l.credit)) : ""}</td>
      </tr>`;
    }).join("");

    pw.document.write(`<!DOCTYPE html><html><head><title>Journal Entry ${detailEntry.entry_number}</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; color: #111; }
        h1 { font-size: 18px; margin-bottom: 2px; } h2 { font-size: 13px; color: #555; margin-top: 0; }
        .meta { font-size: 12px; color: #666; margin-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; } th, td { padding: 6px 8px; font-size: 12px; }
        th { border-bottom: 2px solid #333; font-weight: 600; text-align: left; }
        td { border-bottom: 1px solid #eee; } .right { text-align: right; } .mono { font-family: monospace; }
        .total td { font-weight: 700; border-top: 2px solid #333; }
        @media print { body { padding: 0; } }
      </style></head><body>
        <h1>${branding?.displayName || "Organization"}</h1>
        <h2>Journal Entry ${detailEntry.entry_number}</h2>
        <div class="meta">
          <strong>Date:</strong> ${formatReportDate(detailEntry.entry_date)} &nbsp;|&nbsp;
          <strong>Description:</strong> ${detailEntry.description}
          ${detailEntry.reference ? ` &nbsp;|&nbsp; <strong>Ref:</strong> ${detailEntry.reference}` : ""}
        </div>
        <table><thead><tr><th>Account</th><th class="right">Debit</th><th class="right">Credit</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr class="total"><td>Total</td><td class="right mono">${fmt(totalD)}</td><td class="right mono">${fmt(totalC)}</td></tr></tfoot>
        </table>
        <p style="margin-top:16px;font-size:10px;color:#999;">Printed ${formatPrintTimestamp()}</p>
      </body></html>`);
    pw.document.close(); pw.focus(); pw.print();
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const totalDebit = detailLines.reduce((s, l) => s + Number(l.debit), 0);
  const totalCredit = detailLines.reduce((s, l) => s + Number(l.credit), 0);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by entry #, description, reference..."
                value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <DatePicker value={dateFrom} onChange={(v) => { setDateFrom(v); setPage(0); }} className="w-[200px]" />
              <DatePicker value={dateTo} onChange={(v) => { setDateTo(v); setPage(0); }} className="w-[200px]" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground animate-pulse">Loading transactions...</div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No journal entries found.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Entry #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="hidden md:table-cell">Reference</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-16" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => (
                      <TableRow key={entry.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(entry)}>
                        <TableCell className="font-mono text-sm">{entry.entry_number}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatAppDate(entry.entry_date)}</TableCell>
                        <TableCell className="max-w-[300px] truncate">{entry.description}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">{entry.reference || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={entry.status === "posted" ? "default" : "secondary"}>{entry.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openDetail(entry); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                  </p>
                  <div className="flex gap-1">
                    <Button variant="outline" size="icon" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail Sheet with color-coded lines */}
      <Sheet open={!!detailEntry} onOpenChange={(open) => { if (!open) setDetailEntry(null); }}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Journal Entry {detailEntry?.entry_number}</SheetTitle>
            <SheetDescription>
              {detailEntry && formatAppDate(detailEntry.entry_date)} &middot; {detailEntry?.description}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            {detailEntry?.reference && (
              <p className="text-sm"><span className="font-medium">Reference:</span> {detailEntry.reference}</p>
            )}

            {detailLoading ? (
              <div className="py-8 text-center text-muted-foreground animate-pulse">Loading...</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailLines.map((line) => {
                        const th = line.account ? getTheme(line.account.type) : null;
                        return (
                          <TableRow key={line.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {th && <div className={`h-2 w-2 rounded-full shrink-0 ${th.dot}`} />}
                                <div>
                                  <span className="font-mono text-xs text-muted-foreground mr-1">{line.account?.code}</span>
                                  <span className="text-sm">{line.account?.name}</span>
                                  {th && <Badge className={`${th.badge} text-[9px] ml-1.5 px-1 py-0`}>{th.label}</Badge>}
                                </div>
                              </div>
                              {line.description && <p className="text-xs text-muted-foreground mt-0.5 ml-4">{line.description}</p>}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {Number(line.debit) > 0 ? fmt(Number(line.debit)) : ""}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {Number(line.credit) > 0 ? fmt(Number(line.credit)) : ""}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-semibold">Total</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{fmt(totalDebit)}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{fmt(totalCredit)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
                <Button variant="outline" size="sm" onClick={handlePrintEntry} className="w-full">
                  <Printer className="h-4 w-4 mr-1" /> Print Entry
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default TransactionsList;
