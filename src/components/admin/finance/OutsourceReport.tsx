import { useState, useEffect, useCallback, useRef } from "react";
import { Printer, RefreshCw, Building } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOrganization } from "@/contexts/OrganizationContext";
import { getFinancialYear, todayIST, formatAppDate, formatReportDate, formatPrintTimestamp } from "@/lib/date";
import { fmt } from "./constants";
import FYPeriodSelector from "./FYPeriodSelector";

interface OutsourcedTest {
  id: string;
  test_name: string;
  outsource_cost: number;
  outsourced_at: string;
  patient_name: string;
  patient_id_display: string;
  external_lab_name: string;
  sell_price: number;
  margin: number;
}

interface LabSummary {
  name: string;
  count: number;
  totalCost: number;
  totalRevenue: number;
  totalMargin: number;
}

const OutsourceReport = () => {
  const { organization, branding } = useOrganization();
  const fy = getFinancialYear();
  const [dateFrom, setDateFrom] = useState(fy.start);
  const [dateTo, setDateTo] = useState(todayIST());
  const [tests, setTests] = useState<OutsourcedTest[]>([]);
  const [loading, setLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    if (!organization?.id) return;
    setLoading(true);

    const { data, error } = await (supabase as any)
      .from("patient_tests")
      .select(`
        id, test_name, outsource_cost, outsourced_at,
        patients (patient_id, full_name),
        external_labs:external_lab_id (name)
      `)
      .eq("organization_id", organization.id)
      .not("external_lab_id", "is", null)
      .gte("outsourced_at", dateFrom)
      .lte("outsourced_at", dateTo + "T23:59:59")
      .order("outsourced_at", { ascending: false });

    if (error) {
      toast.error("Failed to load outsource data");
      setTests([]);
      setLoading(false);
      return;
    }

    // Get sell prices from invoice_items
    const testIds = (data || []).map((t: any) => t.id);
    let priceMap: Record<string, number> = {};
    if (testIds.length > 0) {
      const { data: items } = await (supabase as any)
        .from("invoice_items")
        .select("patient_test_id, amount")
        .in("patient_test_id", testIds);
      for (const item of items || []) {
        if (item.patient_test_id) priceMap[item.patient_test_id] = Number(item.amount) || 0;
      }
    }

    const result: OutsourcedTest[] = (data || []).map((t: any) => {
      const cost = Number(t.outsource_cost) || 0;
      const sell = priceMap[t.id] || 0;
      return {
        id: t.id,
        test_name: t.test_name,
        outsource_cost: cost,
        outsourced_at: t.outsourced_at,
        patient_name: t.patients?.full_name || "",
        patient_id_display: t.patients?.patient_id || "",
        external_lab_name: t.external_labs?.name || "Unknown",
        sell_price: sell,
        margin: sell - cost,
      };
    });

    setTests(result);
    setLoading(false);
  }, [organization?.id, dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalCost = tests.reduce((s, t) => s + t.outsource_cost, 0);
  const totalRevenue = tests.reduce((s, t) => s + t.sell_price, 0);
  const totalMargin = totalRevenue - totalCost;

  // Group by external lab
  const labSummaries: LabSummary[] = [];
  const labMap = new Map<string, LabSummary>();
  for (const t of tests) {
    const existing = labMap.get(t.external_lab_name);
    if (existing) {
      existing.count++;
      existing.totalCost += t.outsource_cost;
      existing.totalRevenue += t.sell_price;
      existing.totalMargin += t.margin;
    } else {
      const entry = { name: t.external_lab_name, count: 1, totalCost: t.outsource_cost, totalRevenue: t.sell_price, totalMargin: t.margin };
      labMap.set(t.external_lab_name, entry);
      labSummaries.push(entry);
    }
  }

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const pw = window.open("", "_blank");
    if (!pw) { toast.error("Please allow popups to print"); return; }
    pw.document.write(`<!DOCTYPE html><html><head><title>Outsource Report</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; color: #111; }
        h1 { font-size: 20px; margin-bottom: 2px; } h2 { font-size: 14px; color: #555; margin-top: 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { padding: 6px 8px; font-size: 12px; } th { border-bottom: 2px solid #333; font-weight: 600; text-align: left; }
        td { border-bottom: 1px solid #eee; } .right { text-align: right; } .mono { font-family: monospace; }
        .total td { font-weight: 700; border-top: 2px solid #333; }
        .positive { color: #059669; } .negative { color: #dc2626; }
        @media print { body { padding: 0; } }
      </style></head><body>
        <h1>${branding?.displayName || "Organization"}</h1>
        <h2>Outsource Report — ${formatReportDate(dateFrom)} to ${formatReportDate(dateTo)}</h2>
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
              <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1" /> Print
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      {!loading && tests.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-xs text-muted-foreground">Tests Outsourced</p>
              <p className="text-xl font-bold mt-1">{tests.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-xs text-muted-foreground">Total Cost</p>
              <p className="text-xl font-bold font-mono mt-1 text-amber-700 dark:text-amber-400">{fmt(totalCost)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-xs text-muted-foreground">Revenue Billed</p>
              <p className="text-xl font-bold font-mono mt-1 text-emerald-700 dark:text-emerald-400">{fmt(totalRevenue)}</p>
            </CardContent>
          </Card>
          <Card className={`${totalMargin >= 0 ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800" : "bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800"}`}>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-xs text-muted-foreground">Margin</p>
              <p className={`text-xl font-bold font-mono mt-1 ${totalMargin >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>{fmt(totalMargin)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Per-lab summary */}
      {!loading && labSummaries.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Building className="h-4 w-4" /> By External Lab</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lab</TableHead>
                    <TableHead className="text-right">Tests</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {labSummaries.map((lab) => (
                    <TableRow key={lab.name}>
                      <TableCell className="font-medium">{lab.name}</TableCell>
                      <TableCell className="text-right">{lab.count}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(lab.totalCost)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(lab.totalRevenue)}</TableCell>
                      <TableCell className={`text-right font-mono text-sm font-medium ${lab.totalMargin >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                        {fmt(lab.totalMargin)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detail table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Outsourced Tests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center text-muted-foreground animate-pulse">Loading...</div>
          ) : tests.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No outsourced tests found in this period.</div>
          ) : (
            <div ref={printRef}>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Test</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>External Lab</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Sell Price</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tests.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium text-sm">{t.test_name}</TableCell>
                        <TableCell>
                          <p className="text-sm">{t.patient_name}</p>
                          <p className="text-xs text-muted-foreground">{t.patient_id_display}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs gap-1">
                            <Building className="h-3 w-3" />{t.external_lab_name}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{formatAppDate(t.outsourced_at)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(t.outsource_cost)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{t.sell_price > 0 ? fmt(t.sell_price) : "—"}</TableCell>
                        <TableCell className={`text-right font-mono text-sm font-medium ${t.margin >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                          {t.sell_price > 0 ? fmt(t.margin) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={4} className="text-right font-semibold">Totals</TableCell>
                      <TableCell className="text-right font-mono font-bold">{fmt(totalCost)}</TableCell>
                      <TableCell className="text-right font-mono font-bold">{fmt(totalRevenue)}</TableCell>
                      <TableCell className={`text-right font-mono font-bold ${totalMargin >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                        {fmt(totalMargin)}
                      </TableCell>
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

export default OutsourceReport;
