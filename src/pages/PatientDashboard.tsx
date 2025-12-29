import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  LogOut, 
  FileText, 
  Calendar, 
  User, 
  Download, 
  Clock,
  CheckCircle2,
  AlertCircle,
  FlaskConical,
  Phone,
  Mail,
  MapPin,
  Droplet,
  Activity,
  Printer
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { usePatientAuth } from "@/hooks/usePatientAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
import { format } from "date-fns";
import TestResultsTable from "@/components/patient/TestResultsTable";
import { generateMultiTestReportPDF } from "@/components/patient/TestReportPDF";
import BillingPortal from "@/components/patient/BillingPortal";

interface PatientTest {
  id: string;
  test_name: string;
  test_date: string;
  status: string;
  result: string | null;
  result_value: number | null;
  result_unit: string | null;
  is_abnormal: boolean;
  normal_range_text: string | null;
  report_url: string | null;
  notes: string | null;
  created_at: string;
  result_entered_by: string | null;
  entered_by_name?: string;
}

const PatientDashboard = () => {
  const navigate = useNavigate();
  const { patient, loading, isAuthenticated, signOut } = usePatientAuth();
  const [tests, setTests] = useState<PatientTest[]>([]);
  const [testsLoading, setTestsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("results");
  const [historySelectedIds, setHistorySelectedIds] = useState<Set<string>>(new Set());
  const [historyPrintDialogOpen, setHistoryPrintDialogOpen] = useState(false);
  const [historyPrintOptions, setHistoryPrintOptions] = useState({ includeHeader: true, includeFooter: true });

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate("/auth/patient");
    }
  }, [loading, isAuthenticated, navigate]);

  useEffect(() => {
    const fetchTests = async () => {
      if (!patient?.id) return;

      try {
        const { data, error } = await supabase
          .from("patient_tests")
          .select("*")
          .eq("patient_id", patient.id)
          .order("test_date", { ascending: false });

        if (error) throw error;
        
        // Fetch employee names for tests with result_entered_by
        const testsWithEmployees = await Promise.all(
          (data || []).map(async (test) => {
            if (test.result_entered_by) {
              const { data: empData } = await supabase
                .from("employees")
                .select("full_name")
                .eq("user_id", test.result_entered_by)
                .single();
              return { ...test, entered_by_name: empData?.full_name };
            }
            return test;
          })
        );
        
        setTests(testsWithEmployees);
      } catch (error) {
        console.error("Error fetching tests:", error);
        toast.error("Failed to load test results");
      } finally {
        setTestsLoading(false);
      }
    };

    if (patient?.id) {
      fetchTests();
    }
  }, [patient?.id]);

  const handleSignOut = async () => {
    await signOut();
    toast.success("Logged out successfully");
    navigate("/auth/patient");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "processing":
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100"><Activity className="h-3 w-3 mr-1" />Processing</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const pendingTests = tests.filter(t => t.status === "pending" || t.status === "processing");
  const completedTests = tests.filter(t => t.status === "completed");

  const toggleHistorySelection = (testId: string) => {
    const newSelected = new Set(historySelectedIds);
    if (newSelected.has(testId)) {
      newSelected.delete(testId);
    } else {
      newSelected.add(testId);
    }
    setHistorySelectedIds(newSelected);
  };

  const selectAllHistoryTests = () => {
    const allCompletedIds = new Set(completedTests.map(t => t.id));
    setHistorySelectedIds(allCompletedIds);
  };

  const clearHistorySelection = () => {
    setHistorySelectedIds(new Set());
  };

  const handleHistoryPrint = () => {
    const testsToprint = historySelectedIds.size > 0 
      ? tests.filter(t => historySelectedIds.has(t.id))
      : completedTests;

    if (testsToprint.length === 0) {
      toast.error("No completed tests to print");
      return;
    }

    const uniqueNames = Array.from(
      new Set(testsToprint.map((t) => t.entered_by_name).filter(Boolean) as string[])
    );
    const enteredByLabel =
      uniqueNames.length === 1
        ? uniqueNames[0]
        : uniqueNames.length > 1
          ? "Multiple Staff"
          : undefined;

    const success = generateMultiTestReportPDF(
      {
        full_name: patient!.full_name,
        patient_id: patient!.patient_id,
        phone: patient!.phone,
        gender: patient!.gender || undefined,
        blood_group: patient!.blood_group || undefined,
      },
      testsToprint.map(t => ({
        id: t.id,
        test_name: t.test_name,
        test_date: t.test_date,
        status: t.status,
        result: t.result,
        result_value: t.result_value,
        result_unit: t.result_unit,
        is_abnormal: t.is_abnormal,
        normal_range_text: t.normal_range_text || undefined,
        entered_by_name: t.entered_by_name,
      })),
      enteredByLabel,
      historyPrintOptions
    );

    if (success) {
      toast.success(`Report downloaded successfully`);
      setHistoryPrintDialogOpen(false);
      setHistorySelectedIds(new Set());
    } else {
      toast.error("Failed to generate report");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          <p className="text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (!patient) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="IRM Clinical" className="h-10 w-10" />
            <div>
              <h1 className="font-heading font-bold text-lg text-foreground">Patient Portal</h1>
              <p className="text-xs text-muted-foreground">IRM Clinical Laboratory</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="h-4 w-4" />
              <span>+91 {patient.phone}</span>
            </div>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Welcome Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-4 mb-2">
            <Avatar className="h-14 w-14 bg-primary/10">
              <AvatarFallback className="bg-primary text-primary-foreground text-lg font-semibold">
                {patient.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-2xl font-heading font-bold text-foreground">
                Welcome, {patient.full_name}
              </h2>
              <p className="text-muted-foreground">Patient ID: {patient.patient_id}</p>
            </div>
          </div>
        </motion.div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="border-l-4 border-l-primary">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Tests</p>
                    <p className="text-2xl font-bold text-foreground">{tests.length}</p>
                  </div>
                  <FlaskConical className="h-8 w-8 text-primary/50" />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Completed</p>
                    <p className="text-2xl font-bold text-foreground">{completedTests.length}</p>
                  </div>
                  <CheckCircle2 className="h-8 w-8 text-green-500/50" />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="border-l-4 border-l-yellow-500">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Pending</p>
                    <p className="text-2xl font-bold text-foreground">{pendingTests.length}</p>
                  </div>
                  <Clock className="h-8 w-8 text-yellow-500/50" />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="border-l-4 border-l-red-500">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Blood Group</p>
                    <p className="text-2xl font-bold text-foreground">{patient.blood_group || "N/A"}</p>
                  </div>
                  <Droplet className="h-8 w-8 text-red-500/50" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-lg grid-cols-4">
            <TabsTrigger value="results" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Results
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              History
            </TabsTrigger>
            <TabsTrigger value="billing" className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4" />
              Billing
            </TabsTrigger>
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Profile
            </TabsTrigger>
          </TabsList>

          {/* Results Tab */}
          <TabsContent value="results">
            <TestResultsTable 
              tests={tests}
              patient={{
                full_name: patient.full_name,
                patient_id: patient.patient_id,
                phone: patient.phone,
                gender: patient.gender,
                blood_group: patient.blood_group,
              }}
              patientDbId={patient.id}
              loading={testsLoading}
            />
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-5 w-5" />
                      Test History
                    </CardTitle>
                    <CardDescription>Complete history of all your tests</CardDescription>
                  </div>
                  {completedTests.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {historySelectedIds.size > 0 && (
                        <Badge variant="secondary">
                          {historySelectedIds.size} selected
                        </Badge>
                      )}
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={historySelectedIds.size === completedTests.length ? clearHistorySelection : selectAllHistoryTests}
                      >
                        {historySelectedIds.size === completedTests.length ? "Deselect All" : "Select All"}
                      </Button>
                      <Button 
                        size="sm"
                        onClick={() => setHistoryPrintDialogOpen(true)}
                        className="gap-2"
                      >
                        <Printer className="h-4 w-4" />
                        Print {historySelectedIds.size > 0 ? `(${historySelectedIds.size})` : "All"}
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {testsLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : tests.length === 0 ? (
                  <div className="text-center py-12">
                    <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">No Test History</h3>
                    <p className="text-muted-foreground">Your test history will be shown here.</p>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                    <div className="space-y-6">
                      {tests.map((test, index) => (
                        <motion.div
                          key={test.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="relative pl-10"
                        >
                          <div className="absolute left-2 top-1 h-5 w-5 rounded-full bg-background border-2 border-primary flex items-center justify-center">
                            {test.status === "completed" ? (
                              <CheckCircle2 className="h-3 w-3 text-green-500" />
                            ) : (
                              <Clock className="h-3 w-3 text-yellow-500" />
                            )}
                          </div>
                          <div className="bg-muted/30 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                {test.status === "completed" && (
                                  <Checkbox
                                    checked={historySelectedIds.has(test.id)}
                                    onCheckedChange={() => toggleHistorySelection(test.id)}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                )}
                                <h4 className="font-medium text-foreground">{test.test_name}</h4>
                              </div>
                              {getStatusBadge(test.status)}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(test.test_date), "MMMM dd, yyyy")}
                            </p>
                            {test.result && (
                              <p className="mt-2 text-sm text-foreground">
                                Result: <span className="font-medium">{test.result}</span>
                              </p>
                            )}
                            {test.notes && (
                              <p className="mt-1 text-sm text-muted-foreground italic">
                                Note: {test.notes}
                              </p>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Billing Tab */}
          <TabsContent value="billing">
            <BillingPortal patientId={patient.id} />
          </TabsContent>

          {/* Profile Tab */}
          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  My Profile
                </CardTitle>
                <CardDescription>Your personal information on file</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
                      <User className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-xs text-muted-foreground">Full Name</p>
                        <p className="font-medium text-foreground">{patient.full_name}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
                      <Phone className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-xs text-muted-foreground">Phone Number</p>
                        <p className="font-medium text-foreground">+91 {patient.phone}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
                      <Mail className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-xs text-muted-foreground">Email</p>
                        <p className="font-medium text-foreground">{patient.email || "Not provided"}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
                      <Droplet className="h-5 w-5 text-red-500" />
                      <div>
                        <p className="text-xs text-muted-foreground">Blood Group</p>
                        <p className="font-medium text-foreground">{patient.blood_group || "Not specified"}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
                      <User className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-xs text-muted-foreground">Gender</p>
                        <p className="font-medium text-foreground">{patient.gender || "Not specified"}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
                      <MapPin className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-xs text-muted-foreground">Address</p>
                        <p className="font-medium text-foreground">{patient.address || "Not provided"}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-blue-900 dark:text-blue-100">Need to update your information?</h4>
                      <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                        Please contact our clinic to update your personal details. We ensure your records are always accurate.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* History Print Options Dialog */}
      <Dialog open={historyPrintDialogOpen} onOpenChange={setHistoryPrintDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5" />
              Print Options
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <p className="text-sm text-muted-foreground">
              Configure options for pre-printed A4 paper. Disable header/footer to leave space for pre-printed letterhead.
            </p>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="history-include-header" className="flex flex-col gap-1">
                  <span>Include Header</span>
                  <span className="font-normal text-xs text-muted-foreground">
                    Print lab name and contact info
                  </span>
                </Label>
                <Switch
                  id="history-include-header"
                  checked={historyPrintOptions.includeHeader}
                  onCheckedChange={(checked) => 
                    setHistoryPrintOptions(prev => ({ ...prev, includeHeader: checked }))
                  }
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="history-include-footer" className="flex flex-col gap-1">
                  <span>Include Footer</span>
                  <span className="font-normal text-xs text-muted-foreground">
                    Print generation info and disclaimer
                  </span>
                </Label>
                <Switch
                  id="history-include-footer"
                  checked={historyPrintOptions.includeFooter}
                  onCheckedChange={(checked) => 
                    setHistoryPrintOptions(prev => ({ ...prev, includeFooter: checked }))
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryPrintDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleHistoryPrint} className="gap-2">
              <Printer className="h-4 w-4" />
              Print {historySelectedIds.size > 0 ? `(${historySelectedIds.size})` : "All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="mt-12 border-t border-border bg-muted/30">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src={logo} alt="IRM Clinical" className="h-8 w-8" />
              <span className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} IRM Clinical Laboratory
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Need help? Call us at +91 9622635767</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PatientDashboard;
