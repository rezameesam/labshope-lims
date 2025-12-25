import { useState } from "react";
import { Download, Eye, ChevronDown, ChevronUp, AlertTriangle, CheckCircle } from "lucide-react";
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
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
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

  const completedTests = tests.filter(t => t.status === "completed");
  const pendingTests = tests.filter(t => t.status !== "completed");

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const handleDownloadAll = () => {
    if (completedTests.length === 0) {
      toast.error("No completed tests to download");
      return;
    }

    const success = generateMultiTestReportPDF(
      {
        full_name: patient.full_name,
        patient_id: patient.patient_id,
        phone: patient.phone,
        gender: patient.gender || undefined,
        blood_group: patient.blood_group || undefined,
      },
      completedTests
    );

    if (success) {
      toast.success("Report downloaded successfully");
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
      [test]
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
          <div className="flex items-center justify-between">
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
              <Button onClick={handleDownloadAll} className="gap-2">
                <Download className="h-4 w-4" />
                Download All as PDF
              </Button>
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
    </div>
  );
};

export default TestResultsTable;
