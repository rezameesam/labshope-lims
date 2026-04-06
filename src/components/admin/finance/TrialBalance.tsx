import { useState, useEffect, useCallback, useRef } from "react";
import { Printer, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOrganization } from "@/contexts/OrganizationContext";
import { getFinancialYear, todayIST, formatReportDate, formatPrintTimestamp } from "@/lib/date";
import { ACCOUNT_THEME, getTheme, fmt } from "./constants";
import FYPeriodSelector from "./FYPeriodSelector";

interface AccountBalance {
  id: string;
  code: string;
  name: string;
  type: string;
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

const TrialBalance = () => {
  const { organization, branding } = useOrganization();
  const fy = getFinancialYear();
  const [dateFrom, setDateFrom] = useState(fy.start);
  const [dateTo, setDateTo] = useState(todayIST());
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const fetchBalances = useCallback(async () => {
    if (!organization?.id) return;
    setLoading(true);

    const { data: accounts } = await (supabase as any)
      .from("accounts").select("id, code, name, type")
      .eq("organization_id", organization.id).eq("is_active", true).order("code");

    if (!accounts?.length) { setBalances([]); setLoading(false); return; }

    const { data: entries } = await (supabase as any)
      .from("journal_entries").select("id")
      .eq("organization_id", organization.id).eq("status", "posted")
      .gte("entry_date", dateFrom).lte("entry_date", dateTo);

    const entryIds = (entries || []).map((e: any) => e.id);
    if (entryIds.length === 0) {
      setBalances(accounts.map((a: any) => ({ ...a, totalDebit: 0, totalCredit: 0, balance: 0 })));
      setLoading(false);
      return;
    }

    const { data: lines } = await (supabase as any)
      .from("journal_entry_lines").select("account_id, debit, credit").in("journal_entry_id", entryIds);

    const debitMap: Record<string, number> = {};
    const creditMap: Record<string, number> = {};
    for (const line of lines || []) {
      const d = Number(line.debit) || 0;
      const c = Number(line.credit) || 0;
      debitMap[line.account_id] = (debitMap[line.account_id] || 0) + d;
      creditMap[line.account_id] = (creditMap[line.account_id] || 0) + c;
    }

    const result: AccountBalance[] = accounts.map((a: any) => {
      const td = debitMap[a.id] || 0;
      const tc = creditMap[a.id] || 0;
      return { ...a, totalDebit: td, totalCredit: tc, balance: td - tc };
    }).filter((a: AccountBalance) => a.totalDebit !== 0 || a.totalCredit !== 0);

    setBalances(result);
    setLoading(false);
  }, [organization?.id, dateFrom, dateTo]);

  useEffect(() => { fetchBalances(); }, [fetchBalances]);

  const grandDebit = balances.reduce((s, b) => s + b.totalDebit, 0);
  const grandCredit = balances.reduce((s, b) => s + b.totalCredit, 0);
  const isTallied = Math.abs(grandDebit - grandCredit) < 0.01;

  // Closing balances: debit-normal accounts show positive debit balance, credit-normal show positive credit
  const closingBalances = balances.map((b) => {
    const isDebitNormal = b.type === "asset" || b.type === "expense";
    const net = b.totalDebit - b.totalCredit;
    return {
      ...b,
      closingDebit: isDebitNormal && net > 0 ? net : (!isDebitNormal && net > 0 ? net : 0),
      closingCredit: !isDebitNormal && net < 0 ? -net : (isDebitNormal && net < 0 ? -net : 0),
    };
  });
  // Simpler: just show net balance in the correct column
  const closingRows = balances.map((b) => {
    const net = b.totalDebit - b.totalCredit;
    return { ...b, closingDebit: net > 0 ? net : 0, closingCredit: net < 0 ? -net : 0 };
  });
  const closingDebitTotal = closingRows.reduce((s, b) => s + b.closingDebit, 0);
  const closingCreditTotal = closingRows.reduce((s, b) => s + b.closingCredit, 0);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const pw = window.open("", "_blank");
    if (!pw) { toast.error("Please allow popups to print"); return; }
    pw.document.write(`<!DOCTYPE html><html><head><title>Trial Balance</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; color: #111; }
        h1 { font-size: 20px; margin-bottom: 2px; } h2 { font-size: 14px; color: #555; margin-top: 0; }
        table { width: 100%; border-collapse: collapse; } th, td { padding: 6px 8px; font-size: 12px; }
        th { border-bottom: 2px solid #333; font-weight: 600; text-align: left; }
        td { border-bottom: 1px solid #eee; } .right { text-align: right; } .mono { font-family: monospace; }
        .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 4px; }
        .total td { font-weight: 700; border-top: 2px solid #333; }
        .tally { margin-top: 12px; padding: 8px 12px; border-radius: 4px; font-size: 12px; }
        .ok { background: #dcfce7; border: 1px solid #86efac; } .bad { background: #fee2e2; border: 1px solid #fca5a5; }
        @media print { body { padding: 0; } }
      </style></head><body>
        <h1>${branding?.displayName || "Organization"}</h1>
        <h2>Trial Balance — ${formatReportDate(dateFrom)} to ${formatReportDate(dateTo)}</h2>
        ${content.innerHTML}
        <p style="margin-top:16px;font-size:10px;color:#999;">Generated ${formatPrintTimestamp()}</p>
      </body></html>`);
    pw.document.close(); pw.focus(); pw.print();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col gap-3">
            <FYPeriodSelector dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={setDateFrom} onDateToChange={setDateTo} />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={fetchBalances} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1" /> Print
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            Trial Balance
            <span className="font-normal text-muted-foreground text-sm">
              {formatReportDate(dateFrom)} — {formatReportDate(dateTo)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center text-muted-foreground animate-pulse">Calculating...</div>
          ) : balances.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No transactions found in this period.</div>
          ) : (
            <div ref={printRef}>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Code</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="w-10" />
                      <TableHead className="text-right w-28">Debit</TableHead>
                      <TableHead className="text-right w-28">Credit</TableHead>
                      <TableHead className="text-right w-28">Closing Dr</TableHead>
                      <TableHead className="text-right w-28">Closing Cr</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {closingRows.map((row) => {
                      const theme = getTheme(row.type);
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="font-mono text-xs text-muted-foreground">{row.code}</TableCell>
                          <TableCell className="text-sm">{row.name}</TableCell>
                          <TableCell><div className={`h-2 w-2 rounded-full ${theme.dot}`} /></TableCell>
                          <TableCell className="text-right font-mono text-sm">{row.totalDebit > 0 ? fmt(row.totalDebit) : ""}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{row.totalCredit > 0 ? fmt(row.totalCredit) : ""}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-medium text-blue-700 dark:text-blue-400">
                            {row.closingDebit > 0 ? fmt(row.closingDebit) : ""}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-medium text-rose-700 dark:text-rose-400">
                            {row.closingCredit > 0 ? fmt(row.closingCredit) : ""}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={3} className="text-right font-semibold">Totals</TableCell>
                      <TableCell className="text-right font-mono font-bold">{fmt(grandDebit)}</TableCell>
                      <TableCell className="text-right font-mono font-bold">{fmt(grandCredit)}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-blue-700 dark:text-blue-400">{fmt(closingDebitTotal)}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-rose-700 dark:text-rose-400">{fmt(closingCreditTotal)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>

              {/* Tally check */}
              <div className={`mx-4 mb-4 mt-2 rounded-lg p-3 text-sm border flex items-center justify-between ${isTallied
                  ? "bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
                  : "bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800"
                }`}
              >
                <div className="flex gap-6">
                  <span>Total Debits: <span className="font-mono font-semibold">{fmt(grandDebit)}</span></span>
                  <span>=</span>
                  <span>Total Credits: <span className="font-mono font-semibold">{fmt(grandCredit)}</span></span>
                </div>
                <span className={`text-xs font-medium ${isTallied
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-rose-700 dark:text-rose-300"
                  }`}
                >
                  {isTallied ? "Tallied" : `Off by ${fmt(Math.abs(grandDebit - grandCredit))}`}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TrialBalance;
