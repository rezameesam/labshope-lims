import { useState, useEffect, useCallback, useRef } from "react";
import { Printer, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOrganization } from "@/contexts/OrganizationContext";
import { todayIST, getFinancialYear, getRecentFinancialYears, formatReportDate, formatPrintTimestamp } from "@/lib/date";
import { Calendar as CalendarIcon } from "lucide-react";
import { ACCOUNT_THEME, getTheme, fmt, type AccountType } from "./constants";

interface AccountBalance {
  id: string;
  code: string;
  name: string;
  type: string;
  balance: number;
}

const BalanceSheet = () => {
  const { organization, branding } = useOrganization();
  const [asOfDate, setAsOfDate] = useState(todayIST());
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
      .eq("organization_id", organization.id).eq("status", "posted").lte("entry_date", asOfDate);

    const entryIds = (entries || []).map((e: any) => e.id);
    if (entryIds.length === 0) { setBalances(accounts.map((a: any) => ({ ...a, balance: 0 }))); setLoading(false); return; }

    const { data: lines } = await (supabase as any)
      .from("journal_entry_lines").select("account_id, debit, credit").in("journal_entry_id", entryIds);

    const balanceMap: Record<string, number> = {};
    for (const line of lines || []) {
      balanceMap[line.account_id] = (balanceMap[line.account_id] || 0) + (Number(line.debit) || 0) - (Number(line.credit) || 0);
    }

    const result: AccountBalance[] = accounts.map((a: any) => {
      const raw = balanceMap[a.id] || 0;
      const isDebitNormal = a.type === "asset" || a.type === "expense";
      return { ...a, balance: isDebitNormal ? raw : -raw };
    });

    setBalances(result);
    setLoading(false);
  }, [organization?.id, asOfDate]);

  useEffect(() => { fetchBalances(); }, [fetchBalances]);

  const assets = balances.filter((b) => b.type === "asset" && b.balance !== 0);
  const liabilities = balances.filter((b) => b.type === "liability" && b.balance !== 0);
  const equity = balances.filter((b) => b.type === "equity" && b.balance !== 0);

  const revenueTotal = balances.filter((b) => b.type === "revenue").reduce((s, b) => s + b.balance, 0);
  const expenseTotal = balances.filter((b) => b.type === "expense").reduce((s, b) => s + b.balance, 0);
  const netIncome = revenueTotal - expenseTotal;

  const totalAssets = assets.reduce((s, b) => s + b.balance, 0);
  const totalLiabilities = liabilities.reduce((s, b) => s + b.balance, 0);
  const totalEquity = equity.reduce((s, b) => s + b.balance, 0) + netIncome;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
  const isBalanced = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01;

  const assetTheme = getTheme("asset");
  const liabTheme = getTheme("liability");
  const eqTheme = getTheme("equity");

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const pw = window.open("", "_blank");
    if (!pw) { toast.error("Please allow popups to print"); return; }
    pw.document.write(`<!DOCTYPE html><html><head><title>Balance Sheet</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: system-ui, sans-serif; max-width: 960px; margin: 0 auto; padding: 20px; color: #111; }
        h1 { font-size: 20px; margin-bottom: 2px; } h2 { font-size: 14px; color: #555; margin-top: 0; }
        .columns { display: flex; gap: 24px; }
        .col { flex: 1; }
        .section-title { font-weight: 700; font-size: 13px; padding: 6px 0; margin-top: 8px; border-bottom: 2px solid; }
        .section-asset { color: ${ACCOUNT_THEME.asset.printColor}; border-color: ${ACCOUNT_THEME.asset.printColor}; }
        .section-liability { color: ${ACCOUNT_THEME.liability.printColor}; border-color: ${ACCOUNT_THEME.liability.printColor}; }
        .section-equity { color: ${ACCOUNT_THEME.equity.printColor}; border-color: ${ACCOUNT_THEME.equity.printColor}; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 4px 6px; font-size: 12px; border-bottom: 1px solid #eee; }
        .code { font-family: monospace; color: #888; font-size: 11px; width: 40px; }
        .amount { text-align: right; font-family: monospace; width: 90px; }
        .total td { font-weight: 700; border-top: 2px solid #333; border-bottom: none; padding-top: 8px; }
        .grand-total { margin-top: 16px; padding: 10px; border-radius: 4px; font-size: 13px; }
        .balanced { background: #dcfce7; border: 1px solid #86efac; }
        .unbalanced { background: #fee2e2; border: 1px solid #fca5a5; }
        @media print { body { padding: 0; } }
      </style></head><body>
        <h1>${branding?.displayName || "Organization"}</h1>
        <h2>Balance Sheet as of ${formatReportDate(asOfDate)}</h2>
        ${content.innerHTML}
        <p style="margin-top:16px;font-size:10px;color:#999;">Generated ${formatPrintTimestamp()}</p>
      </body></html>`);
    pw.document.close(); pw.focus(); pw.print();
  };

  /** Render a section's account rows */
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
        <CardContent className="pt-4 pb-4 space-y-3">
          {/* FY quick-select */}
          <div className="flex flex-wrap gap-1.5">
            {getRecentFinancialYears(3).map((fy) => (
              <Button
                key={fy.label}
                variant={asOfDate === fy.end ? "default" : "outline"}
                size="sm"
                className="text-xs h-7 px-2.5"
                onClick={() => setAsOfDate(fy.end)}
              >
                FY {fy.label} End
              </Button>
            ))}
            <Button
              variant={asOfDate === todayIST() ? "default" : "outline"}
              size="sm"
              className="text-xs h-7 px-2.5"
              onClick={() => setAsOfDate(todayIST())}
            >
              Today
            </Button>
          </div>
          {/* Date picker + actions */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label className="text-xs">As of Date</Label>
              <DatePicker value={asOfDate} onChange={setAsOfDate} className="w-[220px]" />
            </div>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={fetchBalances} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1" /> Print
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <CalendarIcon className="h-3 w-3" />
            Current Financial Year: <span className="font-medium">FY {getFinancialYear().label}</span>
          </p>
        </CardContent>
      </Card>

      {/* Report */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            Balance Sheet
            <span className="font-normal text-muted-foreground text-sm">
              as of {formatReportDate(asOfDate)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center text-muted-foreground animate-pulse">Calculating balances...</div>
          ) : (
            <div ref={printRef}>
              {/* Two-column layout: Assets LEFT | Liabilities + Equity RIGHT */}
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
                {/* LEFT — Assets */}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`h-5 w-1 rounded-full ${assetTheme.accent}`} />
                    <assetTheme.icon className={`h-4 w-4 ${assetTheme.text}`} />
                    <h3 className={`text-sm font-bold ${assetTheme.text}`}>Assets</h3>
                  </div>

                  {assets.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No asset balances</p>
                  ) : renderRows(assets)}

                  {/* Total Assets */}
                  <div className={`mt-3 pt-3 border-t-2 ${assetTheme.border} flex justify-between items-center`}>
                    <span className={`text-sm font-bold ${assetTheme.text}`}>Total Assets</span>
                    <span className={`font-mono font-bold text-base ${assetTheme.text}`}>{fmt(totalAssets)}</span>
                  </div>
                </div>

                {/* RIGHT — Liabilities + Equity */}
                <div className="p-4">
                  {/* Liabilities */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`h-5 w-1 rounded-full ${liabTheme.accent}`} />
                    <liabTheme.icon className={`h-4 w-4 ${liabTheme.text}`} />
                    <h3 className={`text-sm font-bold ${liabTheme.text}`}>Liabilities</h3>
                  </div>

                  {liabilities.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No liability balances</p>
                  ) : renderRows(liabilities)}

                  <div className={`mt-3 pt-3 border-t-2 ${liabTheme.border} flex justify-between items-center`}>
                    <span className={`text-sm font-bold ${liabTheme.text}`}>Total Liabilities</span>
                    <span className={`font-mono font-bold ${liabTheme.text}`}>{fmt(totalLiabilities)}</span>
                  </div>

                  {/* Equity */}
                  <div className="flex items-center gap-2 mb-3 mt-6">
                    <div className={`h-5 w-1 rounded-full ${eqTheme.accent}`} />
                    <eqTheme.icon className={`h-4 w-4 ${eqTheme.text}`} />
                    <h3 className={`text-sm font-bold ${eqTheme.text}`}>Equity</h3>
                  </div>

                  {equity.length === 0 && netIncome === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No equity balances</p>
                  ) : (
                    <Table>
                      <TableBody>
                        {equity.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="py-1.5 pl-4 font-mono text-xs text-muted-foreground w-14">{item.code}</TableCell>
                            <TableCell className="py-1.5 text-sm">{item.name}</TableCell>
                            <TableCell className="py-1.5 text-right font-mono text-sm w-28">{fmt(item.balance)}</TableCell>
                          </TableRow>
                        ))}
                        {netIncome !== 0 && (
                          <TableRow>
                            <TableCell className="py-1.5 pl-4 font-mono text-xs text-muted-foreground w-14 italic">--</TableCell>
                            <TableCell className="py-1.5 text-sm italic text-emerald-700 dark:text-emerald-400">Net Income (Current Period)</TableCell>
                            <TableCell className={`py-1.5 text-right font-mono text-sm w-28 italic ${netIncome >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                              {fmt(netIncome)}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  )}

                  <div className={`mt-3 pt-3 border-t-2 ${eqTheme.border} flex justify-between items-center`}>
                    <span className={`text-sm font-bold ${eqTheme.text}`}>Total Equity</span>
                    <span className={`font-mono font-bold ${eqTheme.text}`}>{fmt(totalEquity)}</span>
                  </div>

                  {/* Total L + E */}
                  <div className="mt-4 pt-3 border-t-2 border-foreground/30 flex justify-between items-center">
                    <span className="text-sm font-bold">Liabilities + Equity</span>
                    <span className="font-mono font-bold text-base">{fmt(totalLiabilitiesAndEquity)}</span>
                  </div>
                </div>
              </div>

              {/* Balance check bar */}
              <div className={`mx-4 mb-4 mt-2 rounded-lg p-3 text-sm border flex items-center justify-between ${isBalanced
                  ? "bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
                  : "bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800"
                }`}
              >
                <div className="flex gap-6">
                  <span><span className={`font-medium ${assetTheme.text}`}>Assets:</span> <span className="font-mono font-semibold">{fmt(totalAssets)}</span></span>
                  <span>=</span>
                  <span><span className="font-medium">L + E:</span> <span className="font-mono font-semibold">{fmt(totalLiabilitiesAndEquity)}</span></span>
                </div>
                <span className={`text-xs font-medium ${isBalanced
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-rose-700 dark:text-rose-300"
                  }`}
                >
                  {isBalanced ? "Balanced" : `Off by ${fmt(Math.abs(totalAssets - totalLiabilitiesAndEquity))}`}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BalanceSheet;
