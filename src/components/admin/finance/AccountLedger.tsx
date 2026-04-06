import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Printer, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOrganization } from "@/contexts/OrganizationContext";
import { formatAppDate, todayIST, getFinancialYear, formatReportDate, formatPrintTimestamp } from "@/lib/date";
import { getTheme, fmt } from "./constants";

interface LedgerLine {
  id: string;
  debit: number;
  credit: number;
  description: string | null;
  journal_entry: {
    id: string;
    entry_number: string;
    entry_date: string;
    description: string;
    reference: string | null;
  };
}

interface Props {
  account: { id: string; code: string; name: string; type: string };
  onBack: () => void;
}

const AccountLedger = ({ account, onBack }: Props) => {
  const { organization, branding } = useOrganization();
  const theme = getTheme(account.type);
  const Icon = theme.icon;

  const [lines, setLines] = useState<LedgerLine[]>([]);
  const [loading, setLoading] = useState(true);
  const fy = getFinancialYear();
  const [dateFrom, setDateFrom] = useState(fy.start);
  const [dateTo, setDateTo] = useState(todayIST());
  const printRef = useRef<HTMLDivElement>(null);

  const fetchLedger = useCallback(async () => {
    if (!organization?.id) return;
    setLoading(true);

    // Get entry IDs in date range
    const { data: entries } = await (supabase as any)
      .from("journal_entries")
      .select("id")
      .eq("organization_id", organization.id)
      .eq("status", "posted")
      .gte("entry_date", dateFrom)
      .lte("entry_date", dateTo);

    const entryIds = (entries || []).map((e: any) => e.id);

    if (entryIds.length === 0) {
      setLines([]);
      setLoading(false);
      return;
    }

    const { data, error } = await (supabase as any)
      .from("journal_entry_lines")
      .select("id, debit, credit, description, journal_entry:journal_entries(id, entry_number, entry_date, description, reference)")
      .eq("account_id", account.id)
      .in("journal_entry_id", entryIds)
      .order("journal_entry_id");

    if (error) {
      toast.error("Failed to load ledger");
      setLines([]);
    } else {
      // Sort by date
      const sorted = (data || []).sort((a: LedgerLine, b: LedgerLine) =>
        a.journal_entry.entry_date.localeCompare(b.journal_entry.entry_date)
      );
      setLines(sorted);
    }
    setLoading(false);
  }, [organization?.id, account.id, dateFrom, dateTo]);

  useEffect(() => { fetchLedger(); }, [fetchLedger]);

  // Running balance calculation
  const isDebitNormal = account.type === "asset" || account.type === "expense";
  let runningBalance = 0;
  const linesWithBalance = lines.map((line) => {
    const d = Number(line.debit) || 0;
    const c = Number(line.credit) || 0;
    runningBalance += isDebitNormal ? (d - c) : (c - d);
    return { ...line, balance: runningBalance };
  });

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast.error("Please allow popups to print"); return; }
    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>Ledger — ${account.code} ${account.name}</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; color: #111; }
        .header { border-left: 4px solid ${theme.printColor}; padding-left: 12px; margin-bottom: 16px; }
        h1 { font-size: 18px; margin: 0; }
        h2 { font-size: 13px; color: #666; margin: 2px 0 0; font-weight: normal; }
        .type-badge { display: inline-block; background: ${theme.printColor}20; color: ${theme.printColor}; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th { padding: 8px; text-align: left; font-size: 12px; font-weight: 600; border-bottom: 2px solid #333; }
        td { padding: 6px 8px; font-size: 12px; border-bottom: 1px solid #eee; }
        .right { text-align: right; }
        .mono { font-family: monospace; }
        .total-row td { font-weight: 700; border-top: 2px solid #333; border-bottom: none; }
        .balance { color: ${theme.printColor}; font-weight: 600; }
        @media print { body { padding: 0; } }
      </style>
      </head><body>
        <div class="header">
          <h1>${account.code} — ${account.name}</h1>
          <h2>${branding?.displayName || "Organization"} &middot; ${formatReportDate(dateFrom)} to ${formatReportDate(dateTo)}</h2>
          <span class="type-badge">${theme.label}</span>
        </div>
        ${content.innerHTML}
        <p style="margin-top:16px;font-size:10px;color:#999;">Generated on ${formatPrintTimestamp()}</p>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className={`h-8 w-1 rounded-full ${theme.accent}`} />
          <div>
            <div className="flex items-center gap-2">
              <Icon className={`h-4 w-4 ${theme.text}`} />
              <h2 className="text-lg font-semibold">{account.code} — {account.name}</h2>
            </div>
            <Badge className={`${theme.badge} text-[10px] mt-0.5`}>{theme.label} Account</Badge>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-1" /> Print Ledger
        </Button>
      </div>

      {/* Date filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label className="text-xs">From</Label>
              <DatePicker value={dateFrom} onChange={setDateFrom} className="w-[220px]" />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <DatePicker value={dateTo} onChange={setDateTo} className="w-[220px]" />
            </div>
            <Button variant="outline" size="sm" onClick={fetchLedger} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            {!loading && (
              <div className="ml-auto flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">{lines.length} entries</span>
                <span className={`font-semibold font-mono ${theme.text}`}>
                  Balance: {fmt(runningBalance)}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Ledger table */}
      <Card className={`overflow-hidden border-t-2 ${theme.border}`} style={{ borderTopColor: "var(--accent)" }}>
        <div className={`h-1 ${theme.accent}`} />
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center text-muted-foreground animate-pulse">Loading ledger...</div>
          ) : lines.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No transactions found for this account in the selected period.</div>
          ) : (
            <div ref={printRef}>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className={theme.sectionBg}>
                      <TableHead className="w-28">Date</TableHead>
                      <TableHead className="w-28">Entry #</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right w-28">Debit</TableHead>
                      <TableHead className="text-right w-28">Credit</TableHead>
                      <TableHead className={`text-right w-32 ${theme.text} font-semibold`}>Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linesWithBalance.map((line) => (
                      <TableRow key={line.id} className="hover:bg-muted/30">
                        <TableCell className="text-sm whitespace-nowrap">
                          {formatAppDate(line.journal_entry.entry_date)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{line.journal_entry.entry_number}</TableCell>
                        <TableCell>
                          <p className="text-sm">{line.journal_entry.description}</p>
                          {line.description && (
                            <p className="text-xs text-muted-foreground">{line.description}</p>
                          )}
                          {line.journal_entry.reference && (
                            <p className="text-[10px] text-muted-foreground/70">Ref: {line.journal_entry.reference}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {Number(line.debit) > 0 ? fmt(Number(line.debit)) : ""}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {Number(line.credit) > 0 ? fmt(Number(line.credit)) : ""}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm font-medium ${theme.text}`}>
                          {fmt(line.balance)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className={`${theme.sectionBg} font-semibold`}>
                      <TableCell colSpan={3} className="text-right">Totals</TableCell>
                      <TableCell className="text-right font-mono">{fmt(totalDebit)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(totalCredit)}</TableCell>
                      <TableCell className={`text-right font-mono font-bold ${theme.text}`}>{fmt(runningBalance)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AccountLedger;
