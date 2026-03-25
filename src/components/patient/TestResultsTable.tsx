import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { parseISO, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { Download, CheckCircle, Filter, Printer, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { generateMultiTestReportPDF } from "./TestReportPDF";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatAppDate } from "@/lib/date";
import { useOrganization } from "@/contexts/OrganizationContext";
import { type TestResult, type PatientInfo, type CompletedResultRow } from "./results/types";
import { ResultsFilter } from "./results/ResultsFilter";
import { ResultsCard } from "./results/ResultsCard";
import { ResultsTable } from "./results/ResultsTable";
import { DownloadDialog } from "./results/DownloadDialog";
import { PendingTests } from "./results/PendingTests";

interface TestResultsTableProps {
  tests: TestResult[];
  patient: PatientInfo;
  patientDbId?: string;
  patientOrganizationId?: string | null;
  loading?: boolean;
  onPayNow?: () => void;
}

const TestResultsTable = ({ tests, patient, patientDbId, patientOrganizationId, loading, onPayNow }: TestResultsTableProps) => {
  const { organization, branding } = useOrganization();
  const resolvedOrganizationId = patientOrganizationId || organization?.id || null;
  const isMobile = useIsMobile();

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandedPackageGroups, setExpandedPackageGroups] = useState<Set<string>>(new Set());
  const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false);
  const [isPrintOptionsOpen, setIsPrintOptionsOpen] = useState(false);
  const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<"date" | "category" | "status" | "package">("date");
  const [printOptions, setPrintOptions] = useState({ includeHeader: true, includeFooter: true });
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [hasOutstandingDues, setHasOutstandingDues] = useState(false);
  const [outstandingAmount, setOutstandingAmount] = useState(0);
  const [checkingPayment, setCheckingPayment] = useState(true);

  const completedTests = tests.filter(t => t.status === "completed");
  const pendingTests = tests.filter(t => t.status !== "completed");

  useEffect(() => {
    const checkPaymentStatus = async () => {
      if (!patientDbId || !resolvedOrganizationId) {
        setCheckingPayment(false);
        setHasOutstandingDues(false);
        setOutstandingAmount(0);
        return;
      }
      try {
        const { data: invoices, error } = await supabase
          .from("invoices")
          .select("final_amount, paid_amount, payment_status")
          .eq("patient_id", patientDbId)
          .eq("organization_id" as any, resolvedOrganizationId);
        if (error) throw error;
        const totalBilled = invoices?.reduce((sum, inv) => sum + (Number(inv.final_amount) || 0), 0) || 0;
        const totalPaid = invoices?.reduce((sum, inv) => sum + (Number(inv.paid_amount) || 0), 0) || 0;
        const outstanding = totalBilled - totalPaid;
        setHasOutstandingDues(outstanding > 0);
        setOutstandingAmount(Math.max(0, outstanding));
      } catch (error) {
        console.error("Error checking payment status:", error);
      } finally {
        setCheckingPayment(false);
      }
    };
    checkPaymentStatus();
  }, [resolvedOrganizationId, patientDbId]);

  const dateFilteredTests = useMemo(() => {
    let filtered = completedTests;
    if (startDate || endDate) {
      filtered = filtered.filter(test => {
        if (!test.test_date) return false;
        const testDate = parseISO(test.test_date);
        if (isNaN(testDate.getTime())) return false;
        if (startDate && endDate) {
          return isWithinInterval(testDate, { start: startOfDay(parseISO(startDate)), end: endOfDay(parseISO(endDate)) });
        }
        if (startDate) return testDate >= startOfDay(parseISO(startDate));
        if (endDate) return testDate <= endOfDay(parseISO(endDate));
        return true;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(t => t.test_name.toLowerCase().includes(q));
    }
    return filtered;
  }, [completedTests, startDate, endDate, searchQuery]);

  const completedRows = useMemo<CompletedResultRow[]>(() => {
    const packageMap = new Map<string, TestResult[]>();
    const rows: CompletedResultRow[] = [];
    const seenGroups = new Set<string>();
    dateFilteredTests.forEach((test) => {
      const groupId = test.test_package_group_id;
      if (groupId) {
        const existing = packageMap.get(groupId) || [];
        packageMap.set(groupId, [...existing, test]);
        if (!seenGroups.has(groupId)) {
          seenGroups.add(groupId);
          rows.push({ kind: "package", groupId, tests: packageMap.get(groupId) || [] });
        }
        return;
      }
      rows.push({ kind: "single", test });
    });
    return rows.map((row) => row.kind === "single" ? row : { ...row, tests: packageMap.get(row.groupId) || row.tests });
  }, [dateFilteredTests]);

  const groupedTests = useMemo(() => {
    const grouped: Record<string, TestResult[]> = {};
    const labels = new Map<string, string>();
    dateFilteredTests.forEach(test => {
      let key = "";
      switch (groupBy) {
        case "date": key = format(new Date(test.test_date), "MMMM yyyy"); break;
        case "category": key = test.category || "Uncategorized"; break;
        case "status": key = test.is_abnormal ? "Abnormal Results" : "Normal Results"; break;
        case "package":
          if (test.test_package_group_id) {
            key = `pkg-${test.test_package_group_id}`;
            labels.set(key, `${test.test_package_name || "Package"} • ${formatAppDate(test.test_date)}`);
          } else {
            key = `test-${test.id}`;
            labels.set(key, test.test_name);
          }
          break;
      }
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(test);
    });
    if (groupBy === "date") {
      const sortedKeys = Object.keys(grouped).sort((a, b) => {
        const dateA = grouped[a][0].created_at ? new Date(grouped[a][0].created_at!) : new Date(grouped[a][0].test_date);
        const dateB = grouped[b][0].created_at ? new Date(grouped[b][0].created_at!) : new Date(grouped[b][0].test_date);
        return dateB.getTime() - dateA.getTime();
      });
      const sortedGrouped: Record<string, TestResult[]> = {};
      sortedKeys.forEach(key => { sortedGrouped[key] = grouped[key]; });
      return { grouped: sortedGrouped, labels };
    }
    return { grouped, labels };
  }, [dateFilteredTests, groupBy]);

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };
  const togglePackageGroup = (groupId: string) => {
    setExpandedPackageGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };
  const toggleTestSelection = (testId: string) => {
    setSelectedTestIds((prev) => {
      const next = new Set(prev);
      if (next.has(testId)) {
        next.delete(testId);
      } else {
        next.add(testId);
      }
      return next;
    });
  };
  const toggleAllInGroup = (groupTests: TestResult[]) => {
    const allSelected = groupTests.every(t => selectedTestIds.has(t.id));
    setSelectedTestIds(prev => {
      const next = new Set(prev);
      groupTests.forEach((t) => {
        if (allSelected) {
          next.delete(t.id);
        } else {
          next.add(t.id);
        }
      });
      return next;
    });
  };
  const selectAllTests = () => setSelectedTestIds(new Set(dateFilteredTests.map(t => t.id)));
  const clearSelection = () => setSelectedTestIds(new Set());

  const checkDues = (callback: () => Promise<void> | void) => {
    if (hasOutstandingDues) {
      toast.error(`Please clear outstanding dues of ₹${outstandingAmount.toLocaleString()} to download reports`);
      return;
    }
    void callback();
  };

  const toTestPdfInput = (test: TestResult) => ({
    id: test.id, lab_id: test.lab_id, test_id: test.test_id || null, category: test.category || null,
    test_name: test.test_name, test_date: test.test_date, created_at: test.created_at, status: test.status,
    result: test.result, result_value: test.result_value, result_unit: test.result_unit,
    result_items: test.result_items, registry_serial: test.registry_serial, is_abnormal: test.is_abnormal,
    normal_range_text: test.normal_range_text, notes: test.notes, entered_by_name: test.entered_by_name,
    collection_center_id: test.collection_center_id,
    lab_name: test.labs?.name, lab_code: test.labs?.lab_code,
    collection_center_name: test.collection_centers?.name, collection_center_code: test.collection_centers?.code,
  });

  const getBrandingConfig = () => ({
    organizationId: resolvedOrganizationId || undefined, name: branding.displayName, tagline: branding.tagline,
    address: branding.addressLines.join(", "), phone: branding.phoneNumbers.join(" | "),
    email: branding.email, website: branding.website, logoUrl: branding.logoUrl,
    reportTagline: branding.reportTagline, reportFooterNote: branding.reportFooterNote,
  });

  const getPatientInfo = () => ({
    full_name: patient.full_name, patient_id: patient.patient_id, phone: patient.phone,
    gender: patient.gender || undefined, date_of_birth: patient.date_of_birth || undefined,
    blood_group: patient.blood_group || undefined,
  });

  const getEnteredByLabel = (testList: TestResult[]) => {
    const names = Array.from(new Set(testList.map(t => t.entered_by_name).filter(Boolean) as string[]));
    return names.length === 1 ? names[0] : names.length > 1 ? "Multiple Staff" : undefined;
  };

  const callPDF = async (testList: TestResult[], options?: { includeHeader: boolean; includeFooter: boolean }, enteredByLabel?: string) =>
    generateMultiTestReportPDF(getPatientInfo(), testList.map(toTestPdfInput), enteredByLabel, options, undefined, getBrandingConfig());

  const handleDownloadAll = (options?: { includeHeader: boolean; includeFooter: boolean }) => {
    checkDues(async () => {
      if (dateFilteredTests.length === 0) { toast.error("No completed tests to download"); return; }
      try {
        const ok = await callPDF(dateFilteredTests, options, getEnteredByLabel(dateFilteredTests));
        if (ok) {
          toast.success("Report downloaded successfully");
        } else {
          toast.error("Failed to generate report");
        }
      } catch (e: any) { toast.error("Failed to generate report: " + (e.message || "Unknown error")); }
    });
  };

  const handleDownloadSelected = (options?: { includeHeader: boolean; includeFooter: boolean }, overrideTests?: TestResult[]) => {
    checkDues(async () => {
      if (!overrideTests && selectedTestIds.size === 0) { toast.error("Please select at least one test to download"); return; }
      const testList = overrideTests || dateFilteredTests.filter(t => selectedTestIds.has(t.id));
      try {
        const ok = await callPDF(testList, options, getEnteredByLabel(testList));
        if (ok) { toast.success(`Downloaded ${testList.length} test(s) as PDF`); setIsDownloadDialogOpen(false); setSelectedTestIds(new Set()); }
        else toast.error("Failed to generate report");
      } catch (e: any) { toast.error("Failed to generate report: " + (e.message || "Unknown error")); }
    });
  };

  const handleDownloadSingle = (test: TestResult) => {
    checkDues(async () => {
      try {
        const ok = await callPDF([test], undefined, test.entered_by_name);
        if (ok) {
          toast.success("Report downloaded successfully");
        } else {
          toast.error("Failed to generate report");
        }
      } catch (e: any) { toast.error("Failed to generate report: " + (e.message || "Unknown error")); }
    });
  };

  if (loading || checkingPayment) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            <span className="text-muted-foreground">Loading test results...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (hasOutstandingDues) {
    return (
      <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
        <CardContent className="py-10 space-y-4">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="font-semibold text-amber-900 dark:text-amber-100">Results Locked</p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Outstanding dues of ₹{outstandingAmount.toLocaleString()} detected. Please clear your dues to view or download reports.
              </p>
            </div>
          </div>
          {onPayNow && (
            <Button onClick={onPayNow} className="gap-2">
              <Lock className="h-4 w-4" />
              Go to Billing & Pay
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                Completed Test Results
              </CardTitle>
              <CardDescription>
                {dateFilteredTests.length} test{dateFilteredTests.length !== 1 ? "s" : ""} completed
                {(startDate || endDate || searchQuery) && " (filtered)"}
              </CardDescription>
            </div>
            {completedTests.length > 0 && (
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
                <Button variant="outline" onClick={() => setIsDownloadDialogOpen(true)} className="w-full gap-2 sm:w-auto" disabled={hasOutstandingDues}>
                  <Filter className="h-4 w-4" />
                  Select Tests to Download
                </Button>
                <Button onClick={() => handleDownloadAll()} className="w-full gap-2 sm:w-auto" disabled={hasOutstandingDues}>
                  <Download className="h-4 w-4" />
                  Download All
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ResultsFilter
            startDate={startDate}
            endDate={endDate}
            searchQuery={searchQuery}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onSearchQueryChange={setSearchQuery}
            onClearDates={() => { setStartDate(""); setEndDate(""); }}
          />
          {dateFilteredTests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {completedTests.length === 0 ? "No completed test results yet" : "No tests found for the selected filters"}
            </div>
          ) : isMobile ? (
            <div className="space-y-3">
              {completedRows.map((row) => (
                <ResultsCard
                  key={row.kind === "package" ? `pkg-${row.groupId}` : row.test.id}
                  row={row}
                  expandedRows={expandedRows}
                  expandedPackageGroups={expandedPackageGroups}
                  onToggleRow={toggleRow}
                  onTogglePackageGroup={togglePackageGroup}
                  onDownloadSingle={handleDownloadSingle}
                  onDownloadPackage={(tests) => handleDownloadSelected(printOptions, tests)}
                  hasOutstandingDues={hasOutstandingDues}
                />
              ))}
            </div>
          ) : (
            <ResultsTable
              completedRows={completedRows}
              expandedRows={expandedRows}
              expandedPackageGroups={expandedPackageGroups}
              onToggleRow={toggleRow}
              onTogglePackageGroup={togglePackageGroup}
              onDownloadSingle={handleDownloadSingle}
              onDownloadPackage={(tests) => handleDownloadSelected(printOptions, tests)}
              hasOutstandingDues={hasOutstandingDues}
            />
          )}
        </CardContent>
      </Card>

      <PendingTests tests={pendingTests} isMobile={isMobile} />

      <DownloadDialog
        open={isDownloadDialogOpen}
        onOpenChange={setIsDownloadDialogOpen}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        groupedTests={groupedTests}
        selectedTestIds={selectedTestIds}
        dateFilteredTests={dateFilteredTests}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onClearDates={() => { setStartDate(""); setEndDate(""); }}
        onToggleTest={toggleTestSelection}
        onToggleAllInGroup={toggleAllInGroup}
        onSelectAll={selectAllTests}
        onClearSelection={clearSelection}
        onDownload={() => handleDownloadSelected(printOptions)}
        hasOutstandingDues={hasOutstandingDues}
      />

      {/* Print Options Dialog */}
      <Dialog open={isPrintOptionsOpen} onOpenChange={setIsPrintOptionsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5" />
              Print Options
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="print-header">Include Header (Lab Logo & Info)</Label>
              <Switch id="print-header" checked={printOptions.includeHeader} onCheckedChange={(checked) => setPrintOptions(prev => ({ ...prev, includeHeader: checked }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="print-footer">Include Footer (Contact Info)</Label>
              <Switch id="print-footer" checked={printOptions.includeFooter} onCheckedChange={(checked) => setPrintOptions(prev => ({ ...prev, includeFooter: checked }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPrintOptionsOpen(false)}>Cancel</Button>
            <Button onClick={() => { if (selectedTestIds.size > 0) handleDownloadSelected(printOptions); else handleDownloadAll(printOptions); setIsPrintOptionsOpen(false); }} className="gap-2">
              <Printer className="h-4 w-4" />
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TestResultsTable;
