import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  LogOut, 
  FileText, 
  User, 
  Clock,
  CheckCircle2,
  AlertCircle,
  FlaskConical,
  Phone,
  Mail,
  MapPin,
  Droplet,
  Activity,
  Lock,
  GitBranch
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { usePatientAuth } from "@/hooks/usePatientAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
import TestResultsTable from "@/components/patient/TestResultsTable";
import BillingPortal from "@/components/patient/BillingPortal";
import PatientHistoryTimeline from "@/components/patient/PatientHistoryTimeline";

interface PatientTest {
  id: string;
  test_name: string;
  test_date: string;
  status: string;
  result: string | null;
  result_value: number | null;
  result_unit: string | null;
  result_items: Array<{
    name: string;
    value: number | string | null;
    unit: string | null;
    normal_range_min: number | null;
    normal_range_max: number | null;
    normal_range_text: string | null;
  }> | null;
  registry_serial: string | null;
  is_abnormal: boolean;
  normal_range_text: string | null;
  report_url: string | null;
  notes: string | null;
  created_at: string;
  result_entered_by: string | null;
  entered_by_name?: string;
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

const PatientDashboard = () => {
  const navigate = useNavigate();
  const { patient, loading, isAuthenticated, signOut, setPassword } = usePatientAuth();
  const [tests, setTests] = useState<PatientTest[]>([]);
  const [testsLoading, setTestsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("results");
  const [hasOutstandingDues, setHasOutstandingDues] = useState(false);
  const [outstandingAmount, setOutstandingAmount] = useState(0);
  const [checkingDues, setCheckingDues] = useState(true);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate("/auth/patient");
    }
  }, [loading, isAuthenticated, navigate]);

  useEffect(() => {
    const fetchTests = async () => {
      if (!patient?.id) return;

      try {
        // Try to fetch with lab/collection center joins, fallback to basic query if it fails
        let data, error;
        
        try {
          const result = await supabase
            .from("patient_tests")
            .select(`
              *,
              labs (
                id,
                name,
                lab_code
              ),
              collection_centers (
                id,
                name,
                code
              )
            `)
            .eq("patient_id", patient.id)
            .order("created_at", { ascending: false });
          
          data = result.data;
          error = result.error;
          
          // If join fails due to missing tables/columns, fallback to basic query
          if (error && (error.code === "PGRST116" || error.code === "42P01" || error.message?.includes("Could not find"))) {
            const basicResult = await supabase
              .from("patient_tests")
              .select("*")
              .eq("patient_id", patient.id)
              .order("created_at", { ascending: false });
            data = basicResult.data;
            error = basicResult.error;
          }
        } catch (err: any) {
          // If join fails, try basic query
          const basicResult = await supabase
            .from("patient_tests")
            .select("*")
            .eq("patient_id", patient.id)
            .order("created_at", { ascending: false });
          data = basicResult.data;
          error = basicResult.error;
        }

        if (error) throw error;
        
        // Fetch employee names for tests with result_entered_by
        const testsWithEmployees = await Promise.all(
          (data || []).map(async (test: any) => {
            let testWithEmployee = { ...test };
            if (test.result_entered_by) {
              const { data: empData } = await supabase
                .from("employees")
                .select("full_name")
                .eq("user_id", test.result_entered_by)
                .single();
              testWithEmployee.entered_by_name = empData?.full_name;
            }
            return testWithEmployee;
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

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword || !newPassword) {
      toast.error("Please enter your current and new password");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setUpdatingPassword(true);
    const { error } = await setPassword(currentPassword, newPassword);
    setUpdatingPassword(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Password updated successfully");
    setPasswordDialogOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  // Check for outstanding dues
  useEffect(() => {
    const checkOutstandingDues = async () => {
      if (!patient?.id) {
        setCheckingDues(false);
        return;
      }

      try {
        const { data: invoices, error } = await supabase
          .from("invoices")
          .select("final_amount, paid_amount, payment_status")
          .eq("patient_id", patient.id);

        if (error) throw error;

        // Calculate outstanding dues with proper null handling
        const totalBilled = invoices?.reduce((sum, inv) => {
          const finalAmount = Number(inv.final_amount) || 0;
          return sum + finalAmount;
        }, 0) || 0;
        
        const totalPaid = invoices?.reduce((sum, inv) => {
          const paidAmount = Number(inv.paid_amount) || 0;
          return sum + paidAmount;
        }, 0) || 0;
        
        const outstanding = totalBilled - totalPaid;

        setHasOutstandingDues(outstanding > 0);
        setOutstandingAmount(Math.max(0, outstanding));
      } catch (error) {
        console.error("Error checking outstanding dues:", error);
      } finally {
        setCheckingDues(false);
      }
    };

    checkOutstandingDues();
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
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="results" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Results
            </TabsTrigger>
            <TabsTrigger value="timeline" className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              Timeline
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
              onPayNow={() => setActiveTab("billing")}
            />
          </TabsContent>


          {/* Timeline Tab */}
          <TabsContent value="timeline">
            <PatientHistoryTimeline tests={tests} />
          </TabsContent>

          {/* Billing Tab */}
          <TabsContent value="billing">
            <BillingPortal 
              patientId={patient.id}
              patientName={patient.full_name}
              patientPhone={patient.phone}
              onPaymentStatusChange={() => {
                // Refresh outstanding amount when payment is made
                const refreshDues = async () => {
                  try {
                    const { data: invoices, error } = await supabase
                      .from("invoices")
                      .select("final_amount, paid_amount, payment_status")
                      .eq("patient_id", patient.id);

                    if (error) throw error;

                    const totalBilled = invoices?.reduce((sum, inv) => {
                      const finalAmount = Number(inv.final_amount) || 0;
                      return sum + finalAmount;
                    }, 0) || 0;
                    
                    const totalPaid = invoices?.reduce((sum, inv) => {
                      const paidAmount = Number(inv.paid_amount) || 0;
                      return sum + paidAmount;
                    }, 0) || 0;
                    
                    const outstanding = totalBilled - totalPaid;

                    setHasOutstandingDues(outstanding > 0);
                    setOutstandingAmount(Math.max(0, outstanding));
                  } catch (error) {
                    console.error("Error refreshing outstanding dues:", error);
                  }
                };
                refreshDues();
              }}
            />
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

                <div className="mt-6 flex justify-end">
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => setPasswordDialogOpen(true)}
                  >
                    <Lock className="h-4 w-4" />
                    Change Password
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Change Password
            </DialogTitle>
            <DialogDescription>
              Update your password to keep your account secure.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPasswordDialogOpen(false)}
                disabled={updatingPassword}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updatingPassword}>
                {updatingPassword ? "Updating..." : "Update Password"}
              </Button>
            </DialogFooter>
          </form>
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
