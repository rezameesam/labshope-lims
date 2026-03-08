import { useState, useMemo, useEffect, Fragment } from "react";
import { Download, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Calendar, Tag, Filter, Printer, Lock, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { generateMultiTestReportPDF } from "./TestReportPDF";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";

interface TestResult {
  id: string;
  test_id?: string | null;
  test_name: string;
  test_date: string;
  status: string;
  result: string | null;
  result_value: number | null;
  result_unit: string | null;
  result_items?: Array<{
    name: string;
    value: number | string | null;
    unit: string | null;
    normal_range_min: number | null;
    normal_range_max: number | null;
    normal_range_text: string | null;
  }> | null;
  registry_serial?: string | null;
  test_package_id?: string | null;
  test_package_name?: string | null;
  test_package_group_id?: string | null;
  is_abnormal: boolean;
  normal_range_text?: string | null;
  notes: string | null;
  category?: string;
  entered_by_name?: string;
  created_at?: string;
  lab_id?: string | null;
  collection_center_id?: string | null;
  labs?: {
    id: string;
    name: string;
    lab_code: string;
  } | null;
  collection_centers?: {
    id: string;
    name: string;
    code: string;
  } | null;
}

interface PatientInfo {
  full_name: string;
  patient_id: string;
  phone: string;
  gender?: string | null;
  date_of_birth?: string | null;
  blood_group?: string | null;
}

interface TestResultsTableProps {
  tests: TestResult[];
  patient: PatientInfo;
  patientDbId?: string;
  loading?: boolean;
  onPayNow?: () => void;
}

type CompletedResultRow =
  | { kind: "single"; test: TestResult }
  | { kind: "package"; groupId: string; tests: TestResult[] };

const TestResultsTable = ({ tests, patient, patientDbId, loading, onPayNow }: TestResultsTableProps) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false);
  const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<"date" | "category" | "status" | "package">("date");
  const [printOptions, setPrintOptions] = useState({ includeHeader: true, includeFooter: true });
  const [isPrintOptionsOpen, setIsPrintOptionsOpen] = useState(false);
  const isMobile = useIsMobile();
  
  // Date range filter state
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Payment status state
  const [hasOutstandingDues, setHasOutstandingDues] = useState(false);
  const [outstandingAmount, setOutstandingAmount] = useState(0);
  const [checkingPayment, setCheckingPayment] = useState(true);

  const completedTests = tests.filter(t => t.status === "completed");
  const pendingTests = tests.filter(t => t.status !== "completed");

  // Check for outstanding dues
  useEffect(() => {
    const checkPaymentStatus = async () => {
      if (!patientDbId) {
        setCheckingPayment(false);
        return;
      }

      try {
        const { data: invoices, error } = await supabase
          .from("invoices")
          .select("final_amount, paid_amount, payment_status")
          .eq("patient_id", patientDbId);

        if (error) throw error;

        // Calculate outstanding dues more carefully
        const totalBilled = invoices?.reduce((sum, inv) => {
          const finalAmount = Number(inv.final_amount) || 0;
          return sum + finalAmount;
        }, 0) || 0;
        
        const totalPaid = invoices?.reduce((sum, inv) => {
          const paidAmount = Number(inv.paid_amount) || 0;
          return sum + paidAmount;
        }, 0) || 0;
        
        const outstanding = totalBilled - totalPaid;

        // Debug logging
        console.log("Payment Status Check:", {
          invoicesCount: invoices?.length || 0,
          totalBilled,
          totalPaid,
          outstanding,
          invoices: invoices?.map(inv => ({
            final: inv.final_amount,
            paid: inv.paid_amount,
            status: inv.payment_status
          }))
        });

        setHasOutstandingDues(outstanding > 0);
        setOutstandingAmount(Math.max(0, outstanding)); // Ensure non-negative
      } catch (error) {
        console.error("Error checking payment status:", error);
      } finally {
        setCheckingPayment(false);
      }
    };

    checkPaymentStatus();
  }, [patientDbId]);

  // Filter tests by date range
  const dateFilteredTests = useMemo(() => {
    if (!startDate && !endDate) return completedTests;
    
    return completedTests.filter(test => {
      const testDate = parseISO(test.test_date);
      
      if (startDate && endDate) {
        return isWithinInterval(testDate, {
          start: startOfDay(parseISO(startDate)),
          end: endOfDay(parseISO(endDate))
        });
      } else if (startDate) {
        return testDate >= startOfDay(parseISO(startDate));
      } else if (endDate) {
        return testDate <= endOfDay(parseISO(endDate));
      }
      return true;
    });
  }, [completedTests, startDate, endDate]);

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

    return rows.map((row) => {
      if (row.kind === "single") return row;
      return {
        ...row,
        tests: packageMap.get(row.groupId) || row.tests,
      };
    });
  }, [dateFilteredTests]);

  // Group tests by different criteria
  const groupedTests = useMemo(() => {
    const grouped: Record<string, TestResult[]> = {};
    const labels = new Map<string, string>();
    
    dateFilteredTests.forEach(test => {
      let key = "";
      let label = "";
      switch (groupBy) {
        case "date":
          label = format(new Date(test.test_date), "MMMM yyyy");
          key = label;
          break;
        case "category":
          label = test.category || "Uncategorized";
          key = label;
          break;
        case "status":
          label = test.is_abnormal ? "Abnormal Results" : "Normal Results";
          key = label;
          break;
        case "package":
          if (test.test_package_group_id) {
            key = `pkg-${test.test_package_group_id}`;
            label = `${test.test_package_name || "Package"} • ${format(new Date(test.test_date), "dd MMM yyyy")}`;
          } else {
            key = `test-${test.id}`;
            label = test.test_name;
          }
          labels.set(key, label);
          break;
      }
      
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(test);
    });

    // Sort by date descending for date grouping
    if (groupBy === "date") {
      const sortedKeys = Object.keys(grouped).sort((a, b) => {
        // Sort by created_at if available (has timestamp), otherwise by test_date
        const testA = grouped[a][0];
        const testB = grouped[b][0];
        const dateA = testA.created_at ? new Date(testA.created_at) : new Date(testA.test_date);
        const dateB = testB.created_at ? new Date(testB.created_at) : new Date(testB.test_date);
        return dateB.getTime() - dateA.getTime();
      });
      const sortedGrouped: Record<string, TestResult[]> = {};
      sortedKeys.forEach(key => {
        sortedGrouped[key] = grouped[key];
      });
      return { grouped: sortedGrouped, labels };
    }

    return { grouped, labels };
  }, [dateFilteredTests, groupBy]);

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const toggleTestSelection = (testId: string) => {
    const newSelected = new Set(selectedTestIds);
    if (newSelected.has(testId)) {
      newSelected.delete(testId);
    } else {
      newSelected.add(testId);
    }
    setSelectedTestIds(newSelected);
  };

  const toggleAllInGroup = (groupTests: TestResult[]) => {
    const allSelected = groupTests.every(t => selectedTestIds.has(t.id));
    const newSelected = new Set(selectedTestIds);
    
    if (allSelected) {
      groupTests.forEach(t => newSelected.delete(t.id));
    } else {
      groupTests.forEach(t => newSelected.add(t.id));
    }
    
    setSelectedTestIds(newSelected);
  };

  const [expandedPackageGroups, setExpandedPackageGroups] = useState<Set<string>>(new Set());

  const selectAllTests = () => {
    const allIds = new Set(dateFilteredTests.map(t => t.id));
    setSelectedTestIds(allIds);
  };

  const clearSelection = () => {
    setSelectedTestIds(new Set());
  };

  const checkDuesBeforeDownload = (callback: () => Promise<void> | void) => {
    if (hasOutstandingDues) {
      toast.error(`Please clear outstanding dues of ₹${outstandingAmount.toLocaleString()} to download reports`);
      return;
    }
    void callback();
  };

  const handleDownloadAll = (options?: { includeHeader: boolean; includeFooter: boolean }) => {
    checkDuesBeforeDownload(async () => {
      if (dateFilteredTests.length === 0) {
        toast.error("No completed tests to download");
        return;
      }

      const uniqueNames = Array.from(
        new Set(dateFilteredTests.map((t) => t.entered_by_name).filter(Boolean) as string[])
      );
      const enteredByLabel =
        uniqueNames.length === 1
          ? uniqueNames[0]
          : uniqueNames.length > 1
            ? "Multiple Staff"
            : undefined;

      try {
        const success = await generateMultiTestReportPDF(
          {
            full_name: patient.full_name,
            patient_id: patient.patient_id,
            phone: patient.phone,
            gender: patient.gender || undefined,
            blood_group: patient.blood_group || undefined,
          },
          dateFilteredTests.map(t => ({
            id: t.id,
            test_id: t.test_id || null,
            category: t.category || null,
            test_name: t.test_name,
            test_date: t.test_date,
            status: t.status,
            result: t.result,
            result_value: t.result_value,
            result_unit: t.result_unit,
            result_items: t.result_items,
            registry_serial: t.registry_serial,
            is_abnormal: t.is_abnormal,
            normal_range_text: t.normal_range_text,
            notes: t.notes,
            entered_by_name: t.entered_by_name,
            lab_name: t.labs?.name,
            lab_code: t.labs?.lab_code,
            collection_center_name: t.collection_centers?.name,
            collection_center_code: t.collection_centers?.code,
          })),
          enteredByLabel,
          options
        );

        if (success) {
          toast.success("Report downloaded successfully");
        } else {
          toast.error("Failed to generate report");
        }
      } catch (error: any) {
        console.error("Error generating PDF:", error);
        toast.error("Failed to generate report: " + (error.message || "Unknown error"));
      }
    });
  };

  const handleDownloadSelected = (
    options?: { includeHeader: boolean; includeFooter: boolean },
    overrideTests?: TestResult[]
  ) => {
    checkDuesBeforeDownload(async () => {
      if (!overrideTests && selectedTestIds.size === 0) {
        toast.error("Please select at least one test to download");
        return;
      }

      const selectedTests = overrideTests || dateFilteredTests.filter((t) => selectedTestIds.has(t.id));

      const uniqueNames = Array.from(
        new Set(selectedTests.map((t) => t.entered_by_name).filter(Boolean) as string[])
      );
      const enteredByLabel =
        uniqueNames.length === 1
          ? uniqueNames[0]
          : uniqueNames.length > 1
            ? "Multiple Staff"
            : undefined;

      try {
        const success = await generateMultiTestReportPDF(
          {
            full_name: patient.full_name,
            patient_id: patient.patient_id,
            phone: patient.phone,
            gender: patient.gender || undefined,
            blood_group: patient.blood_group || undefined,
          },
          selectedTests.map(t => ({
            id: t.id,
            lab_id: t.lab_id,
            test_id: t.test_id || null,
            category: t.category || null,
            test_name: t.test_name,
            test_date: t.test_date,
            status: t.status,
            result: t.result,
            result_value: t.result_value,
            result_unit: t.result_unit,
            result_items: t.result_items,
            registry_serial: t.registry_serial,
            is_abnormal: t.is_abnormal,
            normal_range_text: t.normal_range_text,
            notes: t.notes,
            entered_by_name: t.entered_by_name,
            collection_center_id: t.collection_center_id,
            lab_name: t.labs?.name,
            lab_code: t.labs?.lab_code,
            collection_center_name: t.collection_centers?.name,
            collection_center_code: t.collection_centers?.code,
          })),
          enteredByLabel,
          options
        );

        if (success) {
          toast.success(`Downloaded ${selectedTests.length} test(s) as PDF`);
          setIsDownloadDialogOpen(false);
          setSelectedTestIds(new Set());
        } else {
          toast.error("Failed to generate report");
        }
      } catch (error: any) {
        console.error("Error generating PDF:", error);
        toast.error("Failed to generate report: " + (error.message || "Unknown error"));
      }
    });
  };

  const handlePrintWithOptions = () => {
    if (hasOutstandingDues) {
      toast.error(`Please clear outstanding dues of ₹${outstandingAmount.toLocaleString()} to download reports`);
      return;
    }
    setIsPrintOptionsOpen(true);
  };

  const executePrint = () => {
    if (selectedTestIds.size > 0) {
      handleDownloadSelected(printOptions);
    } else {
      handleDownloadAll(printOptions);
    }
    setIsPrintOptionsOpen(false);
  };

  const handleDownloadSingle = (test: TestResult) => {
    checkDuesBeforeDownload(async () => {
      try {
        const success = await generateMultiTestReportPDF(
          {
            full_name: patient.full_name,
            patient_id: patient.patient_id,
            phone: patient.phone,
            gender: patient.gender || undefined,
            blood_group: patient.blood_group || undefined,
          },
          [{
            id: test.id,
            lab_id: test.lab_id,
            test_id: test.test_id || null,
            category: test.category || null,
            test_name: test.test_name,
            test_date: test.test_date,
            status: test.status,
            result: test.result,
            result_value: test.result_value,
            result_unit: test.result_unit,
            result_items: test.result_items,
            registry_serial: test.registry_serial,
            is_abnormal: test.is_abnormal,
            normal_range_text: test.normal_range_text,
            notes: test.notes,
            entered_by_name: test.entered_by_name,
            collection_center_id: test.collection_center_id,
            lab_name: test.labs?.name,
            lab_code: test.labs?.lab_code,
            collection_center_name: test.collection_centers?.name,
            collection_center_code: test.collection_centers?.code,
          }],
          test.entered_by_name
        );

        if (success) {
          toast.success("Report downloaded successfully");
        } else {
          toast.error("Failed to generate report");
        }
      } catch (error: any) {
        console.error("Error generating PDF:", error);
        toast.error("Failed to generate report: " + (error.message || "Unknown error"));
      }
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Completed</Badge>;
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pending</Badge>;
      case "in_progress":
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">In Progress</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getResultSummary = (test: TestResult) => {
    if (test.result_items && test.result_items.length > 0) {
      return `Panel (${test.result_items.length})`;
    }

    if (test.result_value !== null) {
      return String(test.result_value);
    }

    return test.result || "-";
  };

  const getDetailedResultText = (test: TestResult) => {
    if (test.result_items && test.result_items.length > 0) {
      return `Panel (${test.result_items.length} items)`;
    }

    if (test.result_value !== null) {
      return `${test.result_value} ${test.result_unit || ""}`.trim();
    }

    return test.result || "N/A";
  };

  const getRangeText = (item: NonNullable<TestResult["result_items"]>[number]) => {
    return (
      item.normal_range_text ||
      (item.normal_range_min !== null && item.normal_range_max !== null
        ? `${item.normal_range_min} - ${item.normal_range_max}`
        : item.normal_range_min !== null
          ? `>= ${item.normal_range_min}`
          : item.normal_range_max !== null
            ? `<= ${item.normal_range_max}`
            : "-")
    );
  };

  const renderPanelResults = (test: TestResult, compact = false) => {
    if (!test.result_items || test.result_items.length === 0) {
      return null;
    }

    if (compact) {
      return (
        <div className="space-y-2">
          {test.result_items.map((item, index) => (
            <div key={`${test.id}-item-${index}`} className="rounded-xl border border-border/60 bg-background/80 p-3">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-foreground">{item.name || "-"}</span>
                <span className="text-sm font-medium">{item.value ?? "-"}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>Unit</span>
                <span className="text-right">{item.unit || "-"}</span>
                <span>Range</span>
                <span className="text-right">{getRangeText(item)}</span>
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="mt-2 grid gap-2">
        <div className="grid grid-cols-4 text-xs font-medium text-muted-foreground">
          <span>Item</span>
          <span>Value</span>
          <span>Unit</span>
          <span>Range</span>
        </div>
        {test.result_items.map((item, index) => (
          <div key={`${test.id}-item-${index}`} className="grid grid-cols-4 text-sm">
            <span className="font-medium">{item.name || "-"}</span>
            <span>{item.value ?? "-"}</span>
            <span className="text-muted-foreground">{item.unit || "-"}</span>
            <span className="text-muted-foreground">{getRangeText(item)}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderTestDetails = (test: TestResult, compact = false) => (
    <div className={compact ? "grid gap-4 text-sm" : "grid grid-cols-2 gap-4 text-sm md:grid-cols-4"}>
      <div>
        <span className="text-muted-foreground">Test Date:</span>
        <p className="font-medium">
          {format(new Date(test.test_date), "MMMM dd, yyyy")}
          {test.created_at && (
            <span className="ml-2 text-sm text-muted-foreground">
              {format(new Date(test.created_at), "HH:mm")}
            </span>
          )}
        </p>
      </div>
      <div>
        <span className="text-muted-foreground">Result:</span>
        <p className={`font-medium ${test.is_abnormal ? "text-red-600" : ""}`}>
          {getDetailedResultText(test)}
        </p>
      </div>
      <div>
        <span className="text-muted-foreground">Status:</span>
        <p className="font-medium">{test.is_abnormal ? "Abnormal" : "Normal"}</p>
      </div>
      {test.result_items && test.result_items.length > 0 && (
        <div className={compact ? "space-y-2" : "col-span-2 space-y-2 md:col-span-4"}>
          <span className="text-muted-foreground">Panel Results:</span>
          {renderPanelResults(test, compact)}
        </div>
      )}
      {test.notes && (
        <div className={compact ? "" : "col-span-2 md:col-span-4"}>
          <span className="text-muted-foreground">Notes:</span>
          <p className="font-medium">{test.notes}</p>
        </div>
      )}
    </div>
  );

  if (loading || checkingPayment) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
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
            <Lock className="h-5 w-5 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-900 dark:text-amber-100">Results Locked</p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Outstanding dues of ₹{outstandingAmount.toLocaleString()} detected. Please clear your dues to view or download reports.
              </p>
            </div>
          </div>
          {onPayNow && (
            <div className="flex gap-3">
              <Button onClick={onPayNow} className="gap-2">
                <Lock className="h-4 w-4" />
                Go to Billing & Pay
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Outstanding Dues Warning */}
      {hasOutstandingDues && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-amber-600" />
              <div className="flex-1">
                <p className="font-semibold text-amber-900 dark:text-amber-100">Outstanding Dues</p>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  You have outstanding dues of ₹{outstandingAmount.toLocaleString()}. Please clear your dues to download test reports.
                </p>
              </div>
              {onPayNow && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onPayNow}
                  className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                >
                  Pay Now
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completed Tests */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                Completed Test Results
              </CardTitle>
              <CardDescription>
                {dateFilteredTests.length} test{dateFilteredTests.length !== 1 ? "s" : ""} completed
                {(startDate || endDate) && " (filtered)"}
              </CardDescription>
            </div>
            {completedTests.length > 0 && (
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
                <Button 
                  variant="outline" 
                  onClick={() => setIsDownloadDialogOpen(true)} 
                  className="w-full gap-2 sm:w-auto"
                  disabled={hasOutstandingDues}
                >
                  <Filter className="h-4 w-4" />
                  Select Tests to Download
                </Button>
                <Button 
                  onClick={() => handleDownloadAll()} 
                  className="w-full gap-2 sm:w-auto"
                  disabled={hasOutstandingDues}
                >
                  <Download className="h-4 w-4" />
                  Download All
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Date Range Filter */}
          <div className="mb-4 grid gap-3 sm:flex sm:flex-wrap sm:items-end">
            <div className="space-y-1">
              <Label className="text-xs">From Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full sm:w-40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full sm:w-40"
              />
            </div>
            {(startDate || endDate) && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => { setStartDate(""); setEndDate(""); }}
                className="w-full sm:w-auto"
              >
                Clear Dates
              </Button>
            )}
          </div>

          {dateFilteredTests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {completedTests.length === 0 ? "No completed test results yet" : "No tests found for selected date range"}
            </div>
          ) : isMobile ? (
            <div className="space-y-3">
              {completedRows.map((row) => {
                if (row.kind === "package") {
                  const firstTest = row.tests[0];
                  const isExpanded = expandedPackageGroups.has(row.groupId);
                  const completedCount = row.tests.filter((t) => t.status === "completed").length;

                  if (!firstTest) return null;

                  return (
                    <Card key={`pkg-${row.groupId}`} className="border-border/70">
                      <CardContent className="space-y-4 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setExpandedPackageGroups((prev) => {
                                const next = new Set(prev);
                                if (next.has(row.groupId)) {
                                  next.delete(row.groupId);
                                } else {
                                  next.add(row.groupId);
                                }
                                return next;
                              });
                            }}
                            className="-ml-2 h-auto min-h-0 flex-1 justify-start px-2 py-1 text-left"
                          >
                            <div className="flex items-start gap-2">
                              {isExpanded ? (
                                <ChevronUp className="mt-0.5 h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="mt-0.5 h-4 w-4 text-muted-foreground" />
                              )}
                              <div>
                                <p className="font-semibold text-foreground">
                                  {firstTest.test_package_name || "Package"}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {row.tests.length} tests • {completedCount}/{row.tests.length} results
                                </p>
                              </div>
                            </div>
                          </Button>
                          <Badge variant="secondary" className="shrink-0">Package</Badge>
                        </div>

                        <div className="grid gap-2 text-sm text-muted-foreground">
                          <div className="flex items-center justify-between gap-3">
                            <span>Date</span>
                            <span className="text-right">
                              {format(new Date(firstTest.test_date), "dd MMM yyyy")}
                              {firstTest.created_at && (
                                <span className="ml-1 text-xs">
                                  {format(new Date(firstTest.created_at), "HH:mm")}
                                </span>
                              )}
                            </span>
                          </div>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            const selectedTests = row.tests;
                            const selectedIds = new Set(selectedTests.map((t) => t.id));
                            setSelectedTestIds(selectedIds);
                            handleDownloadSelected(
                              {
                                includeHeader: printOptions.includeHeader,
                                includeFooter: printOptions.includeFooter,
                              },
                              selectedTests,
                            );
                          }}
                          className="w-full gap-2"
                          disabled={hasOutstandingDues}
                        >
                          {hasOutstandingDues ? (
                            <Lock className="h-4 w-4" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                          Download Package PDF
                        </Button>

                        {isExpanded && (
                          <div className="space-y-3 border-t border-border/60 pt-3">
                            {row.tests.map((test) => (
                              <div key={test.id} className="rounded-2xl border border-border/60 bg-muted/20 p-3">
                                <Button
                                  variant="ghost"
                                  onClick={() => toggleRow(test.id)}
                                  className="-m-1 flex h-auto w-[calc(100%+0.5rem)] items-start justify-between gap-3 rounded-xl p-1 text-left"
                                >
                                  <div className="flex min-w-0 items-start gap-2">
                                    {expandedRows.has(test.id) ? (
                                      <ChevronUp className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                    ) : (
                                      <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                    )}
                                    <div className="min-w-0">
                                      <p className="font-medium text-foreground">{test.test_name}</p>
                                      <p className="text-sm text-muted-foreground">
                                        {format(new Date(test.test_date), "dd MMM yyyy")}
                                      </p>
                                    </div>
                                  </div>
                                  {test.is_abnormal ? (
                                    <Badge className="shrink-0 bg-red-100 text-red-800 hover:bg-red-100">Abnormal</Badge>
                                  ) : (
                                    <Badge className="shrink-0 bg-green-100 text-green-800 hover:bg-green-100">Normal</Badge>
                                  )}
                                </Button>

                                <div className="mt-3 grid gap-2 text-sm">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-muted-foreground">Result</span>
                                    <span className={`text-right font-medium ${test.is_abnormal ? "text-red-600" : ""}`}>
                                      {getResultSummary(test)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-muted-foreground">Unit</span>
                                    <span className="text-right text-muted-foreground">
                                      {test.result_items && test.result_items.length > 0 ? "-" : test.result_unit || "-"}
                                    </span>
                                  </div>
                                </div>

                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadSingle(test);
                                  }}
                                  className="mt-3 w-full gap-2"
                                  disabled={hasOutstandingDues}
                                >
                                  {hasOutstandingDues ? (
                                    <Lock className="h-4 w-4" />
                                  ) : (
                                    <Download className="h-4 w-4" />
                                  )}
                                  Download PDF
                                </Button>

                                {expandedRows.has(test.id) && (
                                  <div className="mt-3 border-t border-border/60 pt-3">
                                    {renderTestDetails(test, true)}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                }

                const test = row.test;

                return (
                  <Card key={test.id} className="border-border/70">
                    <CardContent className="space-y-4 p-4">
                      <Button
                        variant="ghost"
                        onClick={() => toggleRow(test.id)}
                        className="-m-1 flex h-auto w-[calc(100%+0.5rem)] items-start justify-between gap-3 rounded-xl p-1 text-left"
                      >
                        <div className="flex min-w-0 items-start gap-2">
                          {expandedRows.has(test.id) ? (
                            <ChevronUp className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground">{test.test_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(test.test_date), "dd MMM yyyy")}
                              {test.created_at && (
                                <span className="ml-1 text-xs">
                                  {format(new Date(test.created_at), "HH:mm")}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        {test.is_abnormal ? (
                          <Badge className="shrink-0 bg-red-100 text-red-800 hover:bg-red-100">Abnormal</Badge>
                        ) : (
                          <Badge className="shrink-0 bg-green-100 text-green-800 hover:bg-green-100">Normal</Badge>
                        )}
                      </Button>

                      <div className="grid gap-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Result</span>
                          <span className={`text-right font-medium ${test.is_abnormal ? "text-red-600" : ""}`}>
                            {getResultSummary(test)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Unit</span>
                          <span className="text-right text-muted-foreground">
                            {test.result_items && test.result_items.length > 0 ? "-" : test.result_unit || "-"}
                          </span>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadSingle(test);
                        }}
                        className="w-full gap-2"
                        disabled={hasOutstandingDues}
                      >
                        {hasOutstandingDues ? (
                          <Lock className="h-4 w-4" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        Download PDF
                      </Button>

                      {expandedRows.has(test.id) && (
                        <div className="border-t border-border/60 pt-3">
                          {renderTestDetails(test, true)}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Test Name</TableHead>
                  <TableHead className="font-semibold text-center">Result</TableHead>
                  <TableHead className="font-semibold text-center">Unit</TableHead>
                  <TableHead className="font-semibold text-center">Status</TableHead>
                  <TableHead className="font-semibold">Date</TableHead>
                  <TableHead className="font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedRows.map((row) => {
                    if (row.kind === "package") {
                      const testsInGroup = row.tests;
                      const firstTest = testsInGroup[0];
                      if (testsInGroup.length === 0 || !firstTest) return null;
                      const isExpanded = expandedPackageGroups.has(row.groupId);
                      const completedCount = testsInGroup.filter((t) => t.status === "completed").length;

                      return (
                        <Fragment key={`pkg-${row.groupId}`}>
                          <TableRow key={`pkg-${row.groupId}`} className="bg-muted/20">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setExpandedPackageGroups((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(row.groupId)) {
                                        next.delete(row.groupId);
                                      } else {
                                        next.add(row.groupId);
                                      }
                                      return next;
                                    });
                                  }}
                                  className="h-7 w-7 p-0"
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </Button>
                                <span>
                                  {firstTest.test_package_name || "Package"} ({testsInGroup.length} tests)
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center text-muted-foreground">
                              {completedCount}/{testsInGroup.length} results
                            </TableCell>
                            <TableCell className="text-center text-muted-foreground">-</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary">Package</Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              <div className="flex flex-col gap-0.5">
                                <span>{format(new Date(firstTest.test_date), "dd MMM yyyy")}</span>
                                {firstTest.created_at && (
                                  <span className="text-xs">
                                    {format(new Date(firstTest.created_at), "HH:mm")}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                const selectedTests = testsInGroup;
                                const selectedIds = new Set(selectedTests.map((t) => t.id));
                                setSelectedTestIds(selectedIds);
                                handleDownloadSelected({ includeHeader: printOptions.includeHeader, includeFooter: printOptions.includeFooter }, selectedTests);
                              }}
                              className="gap-1"
                              disabled={hasOutstandingDues}
                            >
                              {hasOutstandingDues ? (
                                <Lock className="h-3.5 w-3.5" />
                              ) : (
                                <Download className="h-3.5 w-3.5" />
                              )}
                              PDF
                            </Button>
                          </TableCell>
                          </TableRow>
                          {isExpanded &&
                            testsInGroup.map((test) => (
                              <Fragment key={test.id}>
                                <TableRow
                                  key={test.id}
                                  className="hover:bg-muted/30 cursor-pointer transition-colors"
                                  onClick={() => toggleRow(test.id)}
                                >
                                  <TableCell className="font-medium">
                                    <div className="flex items-center gap-2 pl-6">
                                      {expandedRows.has(test.id) ? (
                                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                      ) : (
                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                      )}
                                      {test.test_name}
                                      {test.is_abnormal && (
                                        <AlertTriangle className="h-4 w-4 text-red-500" />
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center">
                                <span className={test.is_abnormal ? "text-red-600 font-semibold" : ""}>
                                      {getResultSummary(test)}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-center text-muted-foreground">
                                    {test.result_items && test.result_items.length > 0 ? "-" : test.result_unit || "-"}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {test.is_abnormal ? (
                                      <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Abnormal</Badge>
                                    ) : (
                                      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Normal</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">
                                    <div className="flex flex-col gap-0.5">
                                      <span>{format(new Date(test.test_date), "dd MMM yyyy")}</span>
                                      {test.created_at && (
                                        <span className="text-xs">
                                          {format(new Date(test.created_at), "HH:mm")}
                                        </span>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDownloadSingle(test);
                                      }}
                                      className="gap-1"
                                      disabled={hasOutstandingDues}
                                    >
                                      {hasOutstandingDues ? (
                                        <Lock className="h-3.5 w-3.5" />
                                      ) : (
                                        <Download className="h-3.5 w-3.5" />
                                      )}
                                      PDF
                                    </Button>
                                  </TableCell>
                                </TableRow>
                                {expandedRows.has(test.id) && (
                                  <TableRow key={`${test.id}-details`}>
                                    <TableCell colSpan={6} className="bg-muted/20 p-4">
                                      {renderTestDetails(test)}
                                    </TableCell>
                                  </TableRow>
                                )}
                              </Fragment>
                            ))}
                        </Fragment>
                      );
                    }

                    const test = row.test;
                    return (
                      <Fragment key={test.id}>
                        <TableRow 
                          key={test.id} 
                          className="hover:bg-muted/30 cursor-pointer transition-colors"
                          onClick={() => toggleRow(test.id)}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {expandedRows.has(test.id) ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              )}
                              {test.test_name}
                              {test.is_abnormal && (
                                <AlertTriangle className="h-4 w-4 text-red-500" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={test.is_abnormal ? "text-red-600 font-semibold" : ""}>
                              {getResultSummary(test)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground">
                            {test.result_items && test.result_items.length > 0 ? "-" : test.result_unit || "-"}
                          </TableCell>
                          <TableCell className="text-center">
                            {test.is_abnormal ? (
                              <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Abnormal</Badge>
                            ) : (
                              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Normal</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            <div className="flex flex-col gap-0.5">
                              <span>{format(new Date(test.test_date), "dd MMM yyyy")}</span>
                              {test.created_at && (
                                <span className="text-xs">
                                  {format(new Date(test.created_at), "HH:mm")}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadSingle(test);
                              }}
                              className="gap-1"
                              disabled={hasOutstandingDues}
                            >
                              {hasOutstandingDues ? (
                                <Lock className="h-3.5 w-3.5" />
                              ) : (
                                <Download className="h-3.5 w-3.5" />
                              )}
                              PDF
                            </Button>
                          </TableCell>
                        </TableRow>
                        {expandedRows.has(test.id) && (
                          <TableRow key={`${test.id}-details`}>
                            <TableCell colSpan={6} className="bg-muted/20 p-4">
                              {renderTestDetails(test)}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pending Tests */}
      {pendingTests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-700">
              <AlertTriangle className="h-5 w-5" />
              Pending Tests
            </CardTitle>
            <CardDescription>
              {pendingTests.length} test{pendingTests.length !== 1 ? "s" : ""} awaiting results
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isMobile ? (
              <div className="space-y-3">
                {pendingTests.map((test) => (
                  <Card key={test.id} className="border-border/70">
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-foreground">{test.test_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(test.test_date), "dd MMM yyyy")}
                            {test.created_at && (
                              <span className="ml-1 text-xs">
                                {format(new Date(test.created_at), "HH:mm")}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="shrink-0">{getStatusBadge(test.status)}</div>
                      </div>
                      <div className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
                        {test.notes || "No notes added yet."}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Test Name</TableHead>
                    <TableHead className="font-semibold text-center">Status</TableHead>
                    <TableHead className="font-semibold">Date Ordered</TableHead>
                    <TableHead className="font-semibold">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingTests.map((test) => (
                    <TableRow key={test.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{test.test_name}</TableCell>
                      <TableCell className="text-center">{getStatusBadge(test.status)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        <div className="flex flex-col gap-0.5">
                          <span>{format(new Date(test.test_date), "dd MMM yyyy")}</span>
                          {test.created_at && (
                            <span className="text-xs">
                              {format(new Date(test.created_at), "HH:mm")}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {test.notes || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Download Selection Dialog */}
      <Dialog open={isDownloadDialogOpen} onOpenChange={setIsDownloadDialogOpen}>
        <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-2xl">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Select Tests to Download
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Date Range Filter in Dialog */}
            <div className="grid gap-3 border-b pb-4 sm:flex sm:flex-wrap sm:items-end">
              <div className="space-y-1">
                <Label className="text-xs">From Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full sm:w-40"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full sm:w-40"
                />
              </div>
              {(startDate || endDate) && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => { setStartDate(""); setEndDate(""); }}
                  className="w-full sm:w-auto"
                >
                  Clear
                </Button>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex flex-shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
                <TabsList className="grid w-full grid-cols-2 sm:w-80 sm:grid-cols-4">
                  <TabsTrigger value="date">By Date</TabsTrigger>
                  <TabsTrigger value="category">Category</TabsTrigger>
                  <TabsTrigger value="status">Status</TabsTrigger>
                  <TabsTrigger value="package">Package</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAllTests} className="flex-1 sm:flex-none">
                  Select All
                </Button>
                <Button variant="ghost" size="sm" onClick={clearSelection} className="flex-1 sm:flex-none">
                  Clear
                </Button>
              </div>
            </div>

            {/* Selection Status */}
            {selectedTestIds.size > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="secondary">{selectedTestIds.size} selected</Badge>
                <span className="text-muted-foreground">of {dateFilteredTests.length} tests</span>
              </div>
            )}

            {/* Tests List */}
            <ScrollArea className="flex-1 border rounded-lg">
              <div className="p-4 space-y-4">
                {Object.entries(groupedTests.grouped).map(([groupKey, groupTests]) => {
                  const groupLabel = groupedTests.labels.get(groupKey) || groupKey;
                  return (
                  <div key={groupKey} className="space-y-2">
                    <div className="flex items-center justify-between sticky top-0 bg-background py-1">
                      <h4 className="font-semibold text-sm flex items-center gap-2">
                        {groupBy === "date" && <Calendar className="h-4 w-4" />}
                        {groupBy === "category" && <Tag className="h-4 w-4" />}
                        {groupBy === "status" && (groupLabel === "Abnormal Results" ? 
                          <AlertTriangle className="h-4 w-4 text-red-500" /> : 
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                        {groupBy === "package" && <Package className="h-4 w-4" />}
                        {groupLabel}
                      </h4>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => toggleAllInGroup(groupTests)}
                        className="text-xs"
                      >
                        {groupTests.every(t => selectedTestIds.has(t.id)) ? "Deselect" : "Select All"}
                      </Button>
                    </div>
                    <div className="space-y-1">
                      {groupTests.map((test) => (
                        <label
                          key={test.id}
                          className="flex items-center gap-3 p-2 hover:bg-muted rounded-md cursor-pointer"
                        >
                          <Checkbox
                            checked={selectedTestIds.has(test.id)}
                            onCheckedChange={() => toggleTestSelection(test.id)}
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{test.test_name}</span>
                              {test.is_abnormal && (
                                <Badge variant="destructive" className="text-xs">Abnormal</Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(test.test_date), "dd MMM yyyy")}
                              {test.created_at && (
                                <span className="ml-1">
                                  {format(new Date(test.created_at), "HH:mm")}
                                </span>
                              )}
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                );
                })}
              </div>
            </ScrollArea>

          </div>

          <DialogFooter className="flex-shrink-0">
            <Button variant="outline" onClick={() => setIsDownloadDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => handleDownloadSelected(printOptions)}
              disabled={selectedTestIds.size === 0 || hasOutstandingDues}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Download {selectedTestIds.size > 0 ? `(${selectedTestIds.size})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <Switch
                id="print-header"
                checked={printOptions.includeHeader}
                onCheckedChange={(checked) => setPrintOptions(prev => ({ ...prev, includeHeader: checked }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="print-footer">Include Footer (Contact Info)</Label>
              <Switch
                id="print-footer"
                checked={printOptions.includeFooter}
                onCheckedChange={(checked) => setPrintOptions(prev => ({ ...prev, includeFooter: checked }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPrintOptionsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={executePrint} className="gap-2">
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
