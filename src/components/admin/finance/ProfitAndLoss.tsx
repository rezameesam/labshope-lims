import { useState, useEffect, useCallback, useRef } from "react";
import { Printer, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOrganization } from "@/contexts/OrganizationContext";
import { todayIST, getFinancialYear, formatReportDate, formatPrintTimestamp } from "@/lib/date";
import { ACCOUNT_THEME, getTheme, fmt } from "./constants";
import FYPeriodSelector from "./FYPeriodSelector";

interface AccountBalance {
  id: string;
  code: string;
  name: string;
  type: string;
  balance: number;
}

const ProfitAndLoss = () => {
  const { organization, branding } = useOrganization();
  const fy = getFinancialYear();
  const [dateFrom, setDateFrom] = useState(fy.start);
  const [dateTo, setDateTo] = useState(todayIST());
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const revTheme = getTheme("revenue");
  const expTheme = getTheme("expense");

  const fetchBalances = useCallback(async () => {
    if (!organization?.id) return;
    setLoading(true);

    const { data: accounts } = await (supabase as any)
      .from("accounts").select("id, code, name, type")
      .eq("organization_id", organization.id).eq("is_active", true)
      .in("type", ["revenue", "expense"]).order("code");

    if (!accounts?.length) { setBalances([]); setLoading(false); return; }

    const { data: entries } = await (supabase as any)
      .from("journal_entries").select("id")
      .eq("organization_id", organization.id).eq("status", "posted")
      .gte("entry_date", dateFrom).lte("entry_date", dateTo);

    const entryIds = (entries || []).map((e: any) => e.id);
    if (entryIds.length === 0) { setBalances(accounts.map((a: any) => ({ ...a, balance: 0 }))); setLoading(false); return; }

    const accountIds = accounts.map((a: any) => a.id);
    const { data: lines } = await (supabase as any)
      .from("journal_entry_lines").select("account_id, debit, credit")
      .in("journal_entry_id", entryIds).in("account_id", accountIds);

    const balanceMap: Record<string, number> = {};
    for (const line of lines || []) {
      balanceMap[line.account_id] = (balanceMap[line.account_id] || 0) + (Number(line.debit) || 0) - (Number(line.credit) || 0);
    }

    const result: AccountBalance[] = accounts.map((a: any) => {
      const raw = balanceMap[a.id] || 0;
      return { ...a, balance: a.type === "expense" ? raw : -raw };
    });
    setBalances(result);
    setLoading(false);
  }, [organization?.id, dateFrom, dateTo]);

  useEffect(() => { fetchBalances(); }, [fetchBalances]);

  const revenues = balances.filter((b) => b.type === "revenue" && b.balance !== 0);
  const expenses = balances.filter((b) => b.type === "expense" && b.balance !== 0);
  const totalRevenue = revenues.reduce((s, b) => s + b.balance, 0);
  const totalExpenses = expenses.reduce((s, b) => s + b.balance, 0);
  const netIncome = totalRevenue - totalExpenses;
  const margin = totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0;

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const pw = window.open("", "_blank");
    if (!pw) { toast.error("Please allow popups to print"); return; }
    pw.document.write(`<!DOCTYPE html><html><head><title>Profit & Loss</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: system-ui, sans-serif; max-width: 960px; margin: 0 auto; padding: 20px; color: #111; }
        h1 { font-size: 20px; margin-bottom: 2px; } h2 { font-size: 14px; color: #555; margin-top: 0; }
        .columns { display: flex; gap: 24px; }
        .col { flex: 1; }
        .section-title { font-weight: 700; font-size: 13px; padding: 6px 0; margin-top: 4px; border-bottom: 2px solid; }
        .section-revenue { color: ${ACCOUNT_THEME.revenue.printColor}; border-color: ${ACCOUNT_THEME.revenue.printColor}; }
        .section-expense { color: ${ACCOUNT_THEME.expense.printColor}; border-color: ${ACCOUNT_THEME.expense.printColor}; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 4px 6px; font-size: 12px; border-bottom: 1px solid #eee; }
        .code { font-family: monospace; color: #888; font-size: 11px; }
        .amount { text-align: right; font-family: monospace; }
        .total { font-weight: 700; border-top: 2px solid; padding-top: 8px; display: flex; justify-content: space-between; margin-top: 12px; }
        .total-revenue { border-color: ${ACCOUNT_THEME.revenue.printColor}; color: ${ACCOUNT_THEME.revenue.printColor}; }
        .total-expense { border-color: ${ACCOUNT_THEME.expense.printColor}; color: ${ACCOUNT_THEME.expense.printColor}; }
        .net-bar { margin-top: 16px; padding: 12px; border-radius: 6px; text-align: center; font-size: 14px; }
        .net-profit { background: #dcfce7; border: 1px solid #86efac; }
        .net-loss { background: #fee2e2; border: 1px solid #fca5a5; }
        .net-bar strong { font-family: monospace; font-size: 18px; }
        @media print { body { padding: 0; } }
      </style></head><body>
        <h1>${branding?.displayName || "Organization"}</h1>
        <h2>Profit & Loss &mdash; ${formatReportDate(dateFrom)} to ${formatReportDate(dateTo)}</h2>
        ${content.innerHTML}
        <p style="margin-top:16px;font-size:10px;color:#999;">Generated ${formatPrintTimestamp()}</p>
      </body></html>`);
    pw.document.close(); pw.focus(); pw.print();
  };

  const renderRows = (items: AccountBalance[]) => (
    <Table>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="py-1.5 pl-4 font-mono text-xs text-muted-foreground w-14">{item.code}</TableCell>
            <TableCell className="py-1.5 text-sm">{item.name}</TableCell>
            <TableCell className="py-1.5 text-right font-mono text-sm w-28">{fmt(item.balance)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col gap-3">
            <FYPeriodSelector
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
            />
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

      {/* Report */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            Profit & Loss Statement
            <span className="font-normal text-muted-foreground text-sm">
              {formatReportDate(dateFrom)} — {formatReportDate(dateTo)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center text-muted-foreground animate-pulse">Calculating...</div>
          ) : (
            <div ref={printRef}>
              {/* Two-column: Revenue LEFT | Expenses RIGHT */}
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
                {/* LEFT — Revenue */}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`h-5 w-1 rounded-full ${revTheme.accent}`} />
                    <revTheme.icon className={`h-4 w-4 ${revTheme.text}`} />
                    <h3 className={`text-sm font-bold ${revTheme.text}`}>Revenue</h3>
                  </div>

                  {revenues.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No revenue in this period</p>
                  ) : renderRows(revenues)}

                  <div className={`mt-3 pt-3 border-t-2 ${revTheme.border} flex justify-between items-center`}>
                    <span className={`text-sm font-bold ${revTheme.text}`}>Total Revenue</span>
                    <span className={`font-mono font-bold text-base ${revTheme.text}`}>{fmt(totalRevenue)}</span>
                  </div>
                </div>

                {/* RIGHT — Expenses */}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`h-5 w-1 rounded-full ${expTheme.accent}`} />
                    <expTheme.icon className={`h-4 w-4 ${expTheme.text}`} />
                    <h3 className={`text-sm font-bold ${expTheme.text}`}>Expenses</h3>
                  </div>

                  {expenses.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No expenses in this period</p>
                  ) : renderRows(expenses)}

                  <div className={`mt-3 pt-3 border-t-2 ${expTheme.border} flex justify-between items-center`}>
                    <span className={`text-sm font-bold ${expTheme.text}`}>Total Expenses</span>
                    <span className={`font-mono font-bold text-base ${expTheme.text}`}>{fmt(totalExpenses)}</span>
                  </div>
                </div>
              </div>

              {/* Net Income bar */}
              <div className={`mx-4 mb-4 mt-2 rounded-lg p-3 text-sm border flex items-center justify-between ${netIncome >= 0
                  ? "bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
                  : "bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800"
                }`}
              >
                <div className="flex gap-6">
                  <span><span className={`font-medium ${revTheme.text}`}>Revenue:</span> <span className="font-mono font-semibold">{fmt(totalRevenue)}</span></span>
                  <span>−</span>
                  <span><span className={`font-medium ${expTheme.text}`}>Expenses:</span> <span className="font-mono font-semibold">{fmt(totalExpenses)}</span></span>
                </div>
                <div className="text-right">
                  <span className={`font-mono font-bold text-base ${netIncome >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                    {netIncome >= 0 ? "Profit" : "Loss"}: {fmt(Math.abs(netIncome))}
                  </span>
                  {totalRevenue > 0 && (
                    <span className="text-xs text-muted-foreground ml-2">({margin.toFixed(1)}%)</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfitAndLoss;
