import { useState, useMemo, useEffect } from "react";
import { Download, Eye, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Calendar, Tag, Filter, X, Printer, Lock, AlertCircle } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { generateMultiTestReportPDF } from "./TestReportPDF";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface TestResult {
  id: string;
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
  is_abnormal: boolean;
  normal_range_text?: string | null;
  notes: string | null;
  category?: string;
  entered_by_name?: string;
  created_at?: string;
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

const TestResultsTable = ({ tests, patient, patientDbId, loading, onPayNow }: TestResultsTableProps) => {
  const [selectedTest, setSelectedTest] = useState<TestResult | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false);
  const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<"date" | "category" | "status">("date");
  const [printOptions, setPrintOptions] = useState({ includeHeader: true, includeFooter: true });
  const [isPrintOptionsOpen, setIsPrintOptionsOpen] = useState(false);
  
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

  // Group tests by different criteria
  const groupedTests = useMemo(() => {
    const grouped: Record<string, TestResult[]> = {};
    
    dateFilteredTests.forEach(test => {
      let key = "";
      switch (groupBy) {
        case "date":
          key = format(new Date(test.test_date), "MMMM yyyy");
          break;
        case "category":
          key = test.category || "Uncategorized";
          break;
        case "status":
          key = test.is_abnormal ? "Abnormal Results" : "Normal Results";
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
      return sortedGrouped;
    }

    return grouped;
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

  const selectAllTests = () => {
    const allIds = new Set(dateFilteredTests.map(t => t.id));
    setSelectedTestIds(allIds);
  };

  const clearSelection = () => {
    setSelectedTestIds(new Set());
  };

  const checkDuesBeforeDownload = (callback: () => void) => {
    if (hasOutstandingDues) {
      toast.error(`Please clear outstanding dues of ₹${outstandingAmount.toLocaleString()} to download reports`);
      return;
    }
    callback();
  };

  const handleDownloadAll = (options?: { includeHeader: boolean; includeFooter: boolean }) => {
    checkDuesBeforeDownload(() => {
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
        const success = generateMultiTestReportPDF(
          {
            full_name: patient.full_name,
            patient_id: patient.patient_id,
            phone: patient.phone,
            gender: patient.gender || undefined,
            blood_group: patient.blood_group || undefined,
          },
          dateFilteredTests.map(t => ({
            id: t.id,
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

  const handleDownloadSelected = (options?: { includeHeader: boolean; includeFooter: boolean }) => {
    checkDuesBeforeDownload(() => {
      if (selectedTestIds.size === 0) {
        toast.error("Please select at least one test to download");
        return;
      }

      const selectedTests = dateFilteredTests.filter((t) => selectedTestIds.has(t.id));

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
        const success = generateMultiTestReportPDF(
          {
            full_name: patient.full_name,
            patient_id: patient.patient_id,
            phone: patient.phone,
            gender: patient.gender || undefined,
            blood_group: patient.blood_group || undefined,
          },
          selectedTests.map(t => ({
            id: t.id,
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
    checkDuesBeforeDownload(() => {
      try {
        const success = generateMultiTestReportPDF(
          {
            full_name: patient.full_name,
            patient_id: patient.patient_id,
            phone: patient.phone,
            gender: patient.gender || undefined,
            blood_group: patient.blood_group || undefined,
          },
          [{
            id: test.id,
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
            entered_by_name: test.entered_by_name,
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
              <div className="flex flex-wrap gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setIsDownloadDialogOpen(true)} 
                  className="gap-2"
                  disabled={hasOutstandingDues}
                >
                  <Filter className="h-4 w-4" />
                  Select Tests to Download
                </Button>
                <Button 
                  onClick={() => handleDownloadAll()} 
                  className="gap-2"
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
          <div className="mb-4 flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs">From Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-40"
              />
            </div>
            {(startDate || endDate) && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => { setStartDate(""); setEndDate(""); }}
              >
                Clear Dates
              </Button>
            )}
          </div>

          {dateFilteredTests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {completedTests.length === 0 ? "No completed test results yet" : "No tests found for selected date range"}
            </div>
          ) : (
            <Table>
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
                {dateFilteredTests.map((test) => (
                  <>
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
                          {test.result_items && test.result_items.length > 0
                            ? `Panel (${test.result_items.length})`
                            : test.result_value !== null
                              ? test.result_value
                              : test.result || "-"}
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
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Test Date:</span>
                              <p className="font-medium">
                                {format(new Date(test.test_date), "MMMM dd, yyyy")}
                                {test.created_at && (
                                  <span className="text-sm text-muted-foreground ml-2">
                                    {format(new Date(test.created_at), "HH:mm")}
                                  </span>
                                )}
                              </p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Result:</span>
                              <p className={`font-medium ${test.is_abnormal ? "text-red-600" : ""}`}>
                                {test.result_items && test.result_items.length > 0
                                  ? `Panel (${test.result_items.length} items)`
                                  : test.result_value !== null 
                                    ? `${test.result_value} ${test.result_unit || ""}` 
                                    : test.result || "N/A"}
                              </p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Status:</span>
                              <p className="font-medium">{test.is_abnormal ? "Abnormal" : "Normal"}</p>
                            </div>
                            {test.result_items && test.result_items.length > 0 && (
                              <div className="col-span-2 md:col-span-4">
                                <span className="text-muted-foreground">Panel Results:</span>
                                <div className="mt-2 grid gap-2">
                                  <div className="grid grid-cols-4 text-xs font-medium text-muted-foreground">
                                    <span>Item</span>
                                    <span>Value</span>
                                    <span>Unit</span>
                                    <span>Range</span>
                                  </div>
                                  {test.result_items.map((item, index) => {
                                    const rangeText =
                                      item.normal_range_text ||
                                      (item.normal_range_min !== null && item.normal_range_max !== null
                                        ? `${item.normal_range_min} - ${item.normal_range_max}`
                                        : item.normal_range_min !== null
                                          ? `≥ ${item.normal_range_min}`
                                          : item.normal_range_max !== null
                                            ? `≤ ${item.normal_range_max}`
                                            : "-");
                                    return (
                                      <div key={`${test.id}-item-${index}`} className="grid grid-cols-4 text-sm">
                                        <span className="font-medium">{item.name || "-"}</span>
                                        <span>{item.value ?? "-"}</span>
                                        <span className="text-muted-foreground">{item.unit || "-"}</span>
                                        <span className="text-muted-foreground">{rangeText}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            {test.notes && (
                              <div className="col-span-2 md:col-span-4">
                                <span className="text-muted-foreground">Notes:</span>
                                <p className="font-medium">{test.notes}</p>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
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
            <Table>
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
          </CardContent>
        </Card>
      )}

      {/* Download Selection Dialog */}
      <Dialog open={isDownloadDialogOpen} onOpenChange={setIsDownloadDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Select Tests to Download
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Date Range Filter in Dialog */}
            <div className="flex flex-wrap gap-4 items-end border-b pb-4">
              <div className="space-y-1">
                <Label className="text-xs">From Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-40"
                />
              </div>
              {(startDate || endDate) && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => { setStartDate(""); setEndDate(""); }}
                >
                  Clear
                </Button>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex items-center justify-between flex-shrink-0">
              <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
                <TabsList className="grid grid-cols-3 w-64">
                  <TabsTrigger value="date">By Date</TabsTrigger>
                  <TabsTrigger value="category">Category</TabsTrigger>
                  <TabsTrigger value="status">Status</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAllTests}>
                  Select All
                </Button>
                <Button variant="ghost" size="sm" onClick={clearSelection}>
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
                {Object.entries(groupedTests).map(([group, groupTests]) => (
                  <div key={group} className="space-y-2">
                    <div className="flex items-center justify-between sticky top-0 bg-background py-1">
                      <h4 className="font-semibold text-sm flex items-center gap-2">
                        {groupBy === "date" && <Calendar className="h-4 w-4" />}
                        {groupBy === "category" && <Tag className="h-4 w-4" />}
                        {groupBy === "status" && (group === "Abnormal Results" ? 
                          <AlertTriangle className="h-4 w-4 text-red-500" /> : 
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                        {group}
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
                ))}
              </div>
            </ScrollArea>

            {/* Print Options */}
            <div className="flex items-center justify-between border-t pt-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="header"
                    checked={printOptions.includeHeader}
                    onCheckedChange={(checked) => setPrintOptions(prev => ({ ...prev, includeHeader: checked }))}
                  />
                  <Label htmlFor="header" className="text-sm">Include Header</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="footer"
                    checked={printOptions.includeFooter}
                    onCheckedChange={(checked) => setPrintOptions(prev => ({ ...prev, includeFooter: checked }))}
                  />
                  <Label htmlFor="footer" className="text-sm">Include Footer</Label>
                </div>
              </div>
            </div>
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
