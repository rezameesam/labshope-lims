import { useState, useMemo } from "react";
import { Download, Eye, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Calendar, Tag, Filter, X } from "lucide-react";
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
import { format } from "date-fns";
import { generateMultiTestReportPDF } from "./TestReportPDF";
import { toast } from "sonner";

interface TestResult {
  id: string;
  test_name: string;
  test_date: string;
  status: string;
  result: string | null;
  result_value: number | null;
  result_unit: string | null;
  is_abnormal: boolean;
  notes: string | null;
  category?: string;
  entered_by_name?: string;
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
  loading?: boolean;
}

const TestResultsTable = ({ tests, patient, loading }: TestResultsTableProps) => {
  const [selectedTest, setSelectedTest] = useState<TestResult | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false);
  const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<"date" | "category" | "status">("date");

  const completedTests = tests.filter(t => t.status === "completed");
  const pendingTests = tests.filter(t => t.status !== "completed");

  // Group tests by different criteria
  const groupedTests = useMemo(() => {
    const grouped: Record<string, TestResult[]> = {};
    
    completedTests.forEach(test => {
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
        const dateA = new Date(grouped[a][0].test_date);
        const dateB = new Date(grouped[b][0].test_date);
        return dateB.getTime() - dateA.getTime();
      });
      const sortedGrouped: Record<string, TestResult[]> = {};
      sortedKeys.forEach(key => {
        sortedGrouped[key] = grouped[key];
      });
      return sortedGrouped;
    }

    return grouped;
  }, [completedTests, groupBy]);

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
    const allIds = new Set(completedTests.map(t => t.id));
    setSelectedTestIds(allIds);
  };

  const clearSelection = () => {
    setSelectedTestIds(new Set());
  };

  const handleDownloadAll = () => {
    if (completedTests.length === 0) {
      toast.error("No completed tests to download");
      return;
    }

    const uniqueNames = Array.from(
      new Set(completedTests.map((t) => t.entered_by_name).filter(Boolean) as string[])
    );
    const enteredByLabel =
      uniqueNames.length === 1
        ? uniqueNames[0]
        : uniqueNames.length > 1
          ? "Multiple Staff"
          : undefined;

    const success = generateMultiTestReportPDF(
      {
        full_name: patient.full_name,
        patient_id: patient.patient_id,
        phone: patient.phone,
        gender: patient.gender || undefined,
        blood_group: patient.blood_group || undefined,
      },
      completedTests,
      enteredByLabel
    );

    if (success) {
      toast.success("Report downloaded successfully");
    } else {
      toast.error("Failed to generate report");
    }
  };

  const handleDownloadSelected = () => {
    if (selectedTestIds.size === 0) {
      toast.error("Please select at least one test to download");
      return;
    }

    const selectedTests = completedTests.filter((t) => selectedTestIds.has(t.id));

    const uniqueNames = Array.from(
      new Set(selectedTests.map((t) => t.entered_by_name).filter(Boolean) as string[])
    );
    const enteredByLabel =
      uniqueNames.length === 1
        ? uniqueNames[0]
        : uniqueNames.length > 1
          ? "Multiple Staff"
          : undefined;

    const success = generateMultiTestReportPDF(
      {
        full_name: patient.full_name,
        patient_id: patient.patient_id,
        phone: patient.phone,
        gender: patient.gender || undefined,
        blood_group: patient.blood_group || undefined,
      },
      selectedTests,
      enteredByLabel
    );

    if (success) {
      toast.success(`Downloaded ${selectedTests.length} test(s) as PDF`);
      setIsDownloadDialogOpen(false);
      setSelectedTestIds(new Set());
    } else {
      toast.error("Failed to generate report");
    }
  };

  const handleDownloadSingle = (test: TestResult) => {
    const success = generateMultiTestReportPDF(
      {
        full_name: patient.full_name,
        patient_id: patient.patient_id,
        phone: patient.phone,
        gender: patient.gender || undefined,
        blood_group: patient.blood_group || undefined,
      },
      [test],
      test.entered_by_name
    );

    if (success) {
      toast.success("Report downloaded successfully");
    }
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

  if (loading) {
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
                {completedTests.length} test{completedTests.length !== 1 ? "s" : ""} completed
              </CardDescription>
            </div>
            {completedTests.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setIsDownloadDialogOpen(true)} 
                  className="gap-2"
                >
                  <Filter className="h-4 w-4" />
                  Select Tests to Download
                </Button>
                <Button onClick={handleDownloadAll} className="gap-2">
                  <Download className="h-4 w-4" />
                  Download All
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {completedTests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No completed test results yet
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
                {completedTests.map((test) => (
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
                          {test.result_value !== null ? test.result_value : test.result || "-"}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">
                        {test.result_unit || "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        {test.is_abnormal ? (
                          <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Abnormal</Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Normal</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(test.test_date), "dd MMM yyyy")}
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
                        >
                          <Download className="h-3.5 w-3.5" />
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
                              <p className="font-medium">{format(new Date(test.test_date), "MMMM dd, yyyy")}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Result:</span>
                              <p className={`font-medium ${test.is_abnormal ? "text-red-600" : ""}`}>
                                {test.result_value !== null 
                                  ? `${test.result_value} ${test.result_unit || ""}` 
                                  : test.result || "N/A"}
                              </p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Status:</span>
                              <p className="font-medium">{test.is_abnormal ? "Abnormal" : "Normal"}</p>
                            </div>
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
                      {format(new Date(test.test_date), "dd MMM yyyy")}
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
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Select Tests to Download
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Grouping Options */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Group by:</span>
              <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as typeof groupBy)}>
                <TabsList className="bg-muted">
                  <TabsTrigger value="date" className="gap-1 text-xs sm:text-sm">
                    <Calendar className="h-3.5 w-3.5" />
                    Date
                  </TabsTrigger>
                  <TabsTrigger value="category" className="gap-1 text-xs sm:text-sm">
                    <Tag className="h-3.5 w-3.5" />
                    Category
                  </TabsTrigger>
                  <TabsTrigger value="status" className="gap-1 text-xs sm:text-sm">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Status
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAllTests}>
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={clearSelection}>
                  Clear
                </Button>
              </div>
              <Badge variant="secondary" className="text-sm">
                {selectedTestIds.size} selected
              </Badge>
            </div>

            {/* Selected Tests Preview */}
            {selectedTestIds.size > 0 && (
              <div className="flex flex-wrap gap-1.5 p-3 bg-muted/50 rounded-lg">
                {completedTests
                  .filter(t => selectedTestIds.has(t.id))
                  .map(test => (
                    <Badge 
                      key={test.id} 
                      variant="secondary" 
                      className="gap-1 cursor-pointer hover:bg-destructive/20"
                      onClick={() => toggleTestSelection(test.id)}
                    >
                      {test.test_name}
                      <X className="h-3 w-3" />
                    </Badge>
                  ))
                }
              </div>
            )}

            {/* Grouped Tests List */}
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-4">
                {Object.entries(groupedTests).map(([groupName, groupTests]) => (
                  <div key={groupName} className="space-y-2">
                    <div className="flex items-center justify-between sticky top-0 bg-background py-1">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`group-${groupName}`}
                          checked={groupTests.every(t => selectedTestIds.has(t.id))}
                          onCheckedChange={() => toggleAllInGroup(groupTests)}
                        />
                        <label 
                          htmlFor={`group-${groupName}`}
                          className="text-sm font-semibold cursor-pointer"
                        >
                          {groupName}
                        </label>
                        <Badge variant="outline" className="text-xs">
                          {groupTests.length}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="pl-6 space-y-1">
                      {groupTests.map(test => (
                        <div 
                          key={test.id}
                          className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors"
                        >
                          <Checkbox
                            id={test.id}
                            checked={selectedTestIds.has(test.id)}
                            onCheckedChange={() => toggleTestSelection(test.id)}
                          />
                          <label 
                            htmlFor={test.id}
                            className="flex-1 cursor-pointer flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{test.test_name}</span>
                              {test.is_abnormal && (
                                <Badge className="bg-red-100 text-red-800 text-xs">Abnormal</Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(test.test_date), "dd MMM yyyy")}
                            </span>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsDownloadDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleDownloadSelected} 
              disabled={selectedTestIds.size === 0}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Download {selectedTestIds.size > 0 ? `(${selectedTestIds.size})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TestResultsTable;
