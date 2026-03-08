import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { format, formatDistanceToNow } from "date-fns";
import {
  Activity,
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Droplet,
  FileText,
  FlaskConical,
  GitBranch,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePatientAuth } from "@/hooks/usePatientAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
import TestResultsTable from "@/components/patient/TestResultsTable";
import BillingPortal from "@/components/patient/BillingPortal";
import PatientHistoryTimeline from "@/components/patient/PatientHistoryTimeline";
import PatientActiveSessions from "@/components/patient/PatientActiveSessions";
import PasswordRequirements from "@/components/patient/PasswordRequirements";
import PageErrorBoundary from "@/components/PageErrorBoundary";
import { formatPhoneForDisplay } from "@/lib/phone";
import { validatePatientPassword } from "@/lib/patientSecurity";

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
  test_package_id: string | null;
  test_package_name: string | null;
  test_package_group_id: string | null;
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

const formatTimestamp = (value?: string | null) => {
  if (!value) {
    return "Not available";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Not available";
  }

  return `${format(parsed, "dd MMM yyyy, hh:mm a")} (${formatDistanceToNow(parsed, { addSuffix: true })})`;
};

const formatDate = (value?: string | null) => {
  if (!value) {
    return "Not provided";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Not provided";
  }

  return format(parsed, "dd MMM yyyy");
};

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

  const refreshDues = useCallback(async () => {
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

      const totalBilled = invoices?.reduce((sum, inv) => sum + (Number(inv.final_amount) || 0), 0) || 0;
      const totalPaid = invoices?.reduce((sum, inv) => sum + (Number(inv.paid_amount) || 0), 0) || 0;
      const outstanding = totalBilled - totalPaid;

      setHasOutstandingDues(outstanding > 0);
      setOutstandingAmount(Math.max(0, outstanding));
    } catch (error) {
      console.error("Error checking outstanding dues:", error);
    } finally {
      setCheckingDues(false);
    }
  }, [patient?.id]);

  useEffect(() => {
    const fetchTests = async () => {
      if (!patient?.id) return;

      try {
        let data;
        let error;

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

          if (
            error &&
            (error.code === "PGRST116" ||
              error.code === "PGRST201" ||
              error.code === "42P01" ||
              error.message?.includes("Could not find") ||
              error.message?.includes("relationship"))
          ) {
            const basicResult = await supabase
              .from("patient_tests")
              .select("*")
              .eq("patient_id", patient.id)
              .order("created_at", { ascending: false });
            data = basicResult.data;
            error = basicResult.error;
          }
        } catch {
          const basicResult = await supabase
            .from("patient_tests")
            .select("*")
            .eq("patient_id", patient.id)
            .order("created_at", { ascending: false });
          data = basicResult.data;
          error = basicResult.error;
        }

        if (error) throw error;

        const testsWithEmployees = await Promise.all(
          (data || []).map(async (test: any) => {
            const testWithEmployee = { ...test };
            if (test.result_entered_by) {
              const { data: empData, error: empError } = await supabase
                .from("employees")
                .select("full_name")
                .eq("user_id", test.result_entered_by)
                .maybeSingle();
              if (!empError && empData?.full_name) {
                testWithEmployee.entered_by_name = empData.full_name;
              }
            }
            return testWithEmployee;
          }),
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
      void fetchTests();
      void refreshDues();
    }
  }, [patient?.id, refreshDues]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword || !newPassword) {
      toast.error("Please enter your current and new password");
      return;
    }

    const passwordValidationMessage = validatePatientPassword(newPassword);
    if (passwordValidationMessage) {
      toast.error(passwordValidationMessage);
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

    toast.success("Password updated successfully. Other sessions have been signed out.");
    setPasswordDialogOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success("Logged out successfully");
    navigate("/auth/patient");
  };

  const pendingTests = useMemo(
    () => tests.filter((test) => test.status === "pending" || test.status === "processing"),
    [tests],
  );
  const completedTests = useMemo(() => tests.filter((test) => test.status === "completed"), [tests]);
  const abnormalTests = useMemo(() => tests.filter((test) => test.is_abnormal), [tests]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-subtle-gradient text-clinical-navy">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-subtle-gradient px-6">
        <Card className="w-full max-w-lg border border-border bg-card shadow-lg">
          <CardHeader>
            <CardTitle className="text-clinical-navy">Loading patient portal</CardTitle>
            <CardDescription>
              We could not finish loading your patient record yet. If this screen persists, return to login and try again.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button variant="outline" onClick={() => navigate("/auth/patient")}>
              Back to Login
            </Button>
            <Button onClick={() => window.location.reload()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-subtle-gradient">
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <img src={logo} alt="IRM Clinical" className="h-11 w-11 rounded-2xl border border-border bg-card p-1" />
            <div>
              <h1 className="font-heading text-lg font-semibold text-clinical-navy">Patient Portal</h1>
              <p className="text-xs text-muted-foreground">IRM Clinical Laboratory</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-border bg-muted/40 px-4 py-2 text-sm text-muted-foreground md:flex">
              <Phone className="h-4 w-4" />
              <span>{formatPhoneForDisplay(patient.phone)}</span>
            </div>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <Card className="overflow-hidden rounded-[28px] border border-primary-foreground/10 bg-hero-gradient text-primary-foreground shadow-sm">
            <CardContent className="grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr] lg:p-8">
              <div>
                <div className="flex items-center gap-4">
                  <Avatar className="h-14 w-14 border border-white/10 bg-white/10">
                    <AvatarFallback className="bg-white/90 text-lg font-semibold text-primary">
                      {patient.full_name?.split(" ").map((name) => name[0]).join("").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="font-heading text-2xl font-semibold text-primary-foreground">{patient.full_name}</h2>
                    <p className="mt-1 text-sm text-primary-foreground/80">
                      Patient ID {patient.patient_id} • {formatPhoneForDisplay(patient.phone)}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                    <p className="text-xs uppercase tracking-wide text-primary-foreground/70">Reports ready</p>
                    <p className="mt-2 text-2xl font-semibold text-primary-foreground">{completedTests.length}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                    <p className="text-xs uppercase tracking-wide text-primary-foreground/70">In progress</p>
                    <p className="mt-2 text-2xl font-semibold text-primary-foreground">{pendingTests.length}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                    <p className="text-xs uppercase tracking-wide text-primary-foreground/70">Outstanding</p>
                    <p className="mt-2 text-2xl font-semibold text-primary-foreground">
                      {checkingDues ? "Checking..." : `Rs. ${outstandingAmount.toFixed(2)}`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col justify-between gap-4 rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur-sm">
                <div>
                  <p className="text-sm font-medium text-primary-foreground">Quick actions</p>
                  <p className="mt-1 text-sm text-primary-foreground/75">
                    Start with reports, then use billing or account settings only when needed.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <Button className="w-full bg-white text-clinical-navy hover:bg-white/90" onClick={() => setActiveTab("results")}>
                    View Results
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full border-white/30 bg-transparent text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
                    onClick={() => setActiveTab("account")}
                  >
                    Account Settings
                  </Button>
                </div>
                <div className="text-xs text-primary-foreground/70">
                  Last password change: {formatTimestamp(patient.last_password_change)}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.section>

        <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Total Tests",
              value: tests.length,
              icon: FlaskConical,
              tone: "text-cyan-700 bg-cyan-50 border-cyan-200",
            },
            {
              label: "Completed Reports",
              value: completedTests.length,
              icon: CheckCircle2,
              tone: "text-emerald-700 bg-emerald-50 border-emerald-200",
            },
            {
              label: "Pending / Processing",
              value: pendingTests.length,
              icon: Clock,
              tone: "text-amber-700 bg-amber-50 border-amber-200",
            },
            {
              label: "Abnormal Results",
              value: abnormalTests.length,
              icon: Activity,
              tone: "text-rose-700 bg-rose-50 border-rose-200",
            },
          ].map((card, index) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 * index }}
            >
              <Card className="rounded-3xl border border-border bg-card shadow-sm">
                <CardContent className="flex items-center justify-between p-5">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                    <p className="mt-2 text-3xl font-semibold text-clinical-navy">{card.value}</p>
                  </div>
                  <div className={`rounded-2xl border p-3 ${card.tone}`}>
                    <card.icon className="h-6 w-6" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </section>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-2xl border border-border bg-muted/30 p-2.5 md:grid-cols-4">
            <TabsTrigger
              value="results"
              className="h-12 w-full flex-row items-center justify-center gap-2 rounded-xl border border-transparent px-4 text-center text-sm font-medium leading-none text-muted-foreground data-[state=active]:border-clinical-navy/15 data-[state=active]:bg-clinical-navy data-[state=active]:text-primary-foreground data-[state=active]:shadow-md md:h-14 md:text-base"
            >
              <FileText className="h-4 w-4 shrink-0" />
              <span className="leading-none">Results</span>
            </TabsTrigger>
            <TabsTrigger
              value="billing"
              className="h-12 w-full flex-row items-center justify-center gap-2 rounded-xl border border-transparent px-4 text-center text-sm font-medium leading-none text-muted-foreground data-[state=active]:border-clinical-navy/15 data-[state=active]:bg-clinical-navy data-[state=active]:text-primary-foreground data-[state=active]:shadow-md md:h-14 md:text-base"
            >
              <FlaskConical className="h-4 w-4 shrink-0" />
              <span className="leading-none">Billing</span>
            </TabsTrigger>
            <TabsTrigger
              value="timeline"
              className="h-12 w-full flex-row items-center justify-center gap-2 rounded-xl border border-transparent px-4 text-center text-sm font-medium leading-none text-muted-foreground data-[state=active]:border-clinical-navy/15 data-[state=active]:bg-clinical-navy data-[state=active]:text-primary-foreground data-[state=active]:shadow-md md:h-14 md:text-base"
            >
              <GitBranch className="h-4 w-4 shrink-0" />
              <span className="leading-none">Timeline</span>
            </TabsTrigger>
            <TabsTrigger
              value="account"
              className="h-12 w-full flex-row items-center justify-center gap-2 rounded-xl border border-transparent px-4 text-center text-sm font-medium leading-none text-muted-foreground data-[state=active]:border-clinical-navy/15 data-[state=active]:bg-clinical-navy data-[state=active]:text-primary-foreground data-[state=active]:shadow-md md:h-14 md:text-base"
            >
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span className="leading-none">Account</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="results">
            <PageErrorBoundary
              title="Results could not be loaded"
              description="The results view hit an unexpected error. You can retry or switch to another portal section."
            >
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
            </PageErrorBoundary>
          </TabsContent>

          <TabsContent value="timeline">
            <PageErrorBoundary
              title="Timeline could not be loaded"
              description="The timeline view hit an unexpected error. You can retry or use the other portal sections."
            >
              <PatientHistoryTimeline
                tests={tests}
                hasOutstandingDues={hasOutstandingDues}
                outstandingAmount={outstandingAmount}
                onPayNow={() => setActiveTab("billing")}
              />
            </PageErrorBoundary>
          </TabsContent>

          <TabsContent value="billing">
            <PageErrorBoundary
              title="Billing could not be loaded"
              description="The billing view hit an unexpected error. You can retry without leaving the portal."
            >
              <BillingPortal
                patientId={patient.id}
                patientName={patient.full_name}
                patientPhone={patient.phone}
                onPaymentStatusChange={() => {
                  setCheckingDues(true);
                  void refreshDues();
                }}
              />
            </PageErrorBoundary>
          </TabsContent>

          <TabsContent value="account">
            <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <Card className="rounded-3xl border border-border bg-card shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Personal information
                  </CardTitle>
                  <CardDescription>Your details currently stored in the patient record.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  {[
                    { icon: User, label: "Full Name", value: patient.full_name, tone: "text-foreground" },
                    { icon: Phone, label: "Phone Number", value: formatPhoneForDisplay(patient.phone), tone: "text-foreground" },
                    { icon: Mail, label: "Email", value: patient.email || "Not provided", tone: "text-foreground" },
                    { icon: Droplet, label: "Blood Group", value: patient.blood_group || "Not specified", tone: "text-primary" },
                    { icon: User, label: "Gender", value: patient.gender || "Not specified", tone: "text-foreground" },
                    { icon: CalendarClock, label: "Date of Birth", value: formatDate(patient.date_of_birth), tone: "text-foreground" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-border bg-muted/40 p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-white p-2 shadow-sm">
                          <item.icon className={`h-5 w-5 ${item.tone}`} />
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                          <p className="mt-1 font-medium text-foreground">{item.value}</p>
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="rounded-2xl border border-border bg-muted/40 p-4 md:col-span-2">
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl bg-white p-2 shadow-sm">
                        <MapPin className="h-5 w-5 text-foreground" />
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Address</p>
                        <p className="mt-1 font-medium text-foreground">{patient.address || "Not provided"}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card className="rounded-3xl border border-border bg-card shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5" />
                      Security
                    </CardTitle>
                    <CardDescription>Key account controls and session protection.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-foreground">
                      <p className="font-medium text-clinical-navy">Last password change</p>
                      <p className="mt-1">{formatTimestamp(patient.last_password_change)}</p>
                    </div>
                    <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4 text-sm text-primary">
                      <p className="font-medium">Password standard</p>
                      <p className="mt-2 leading-6">
                        Use any password you prefer, as long as it has at least 6 characters.
                      </p>
                    </div>
                    <div className="space-y-3 text-sm text-foreground">
                      <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4">
                        <AlertCircle className="mt-0.5 h-5 w-5 text-muted-foreground" />
                        <p>After a password change, your other signed-in sessions are revoked automatically.</p>
                      </div>
                      <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4">
                        <AlertCircle className="mt-0.5 h-5 w-5 text-muted-foreground" />
                        <p>Use the patient portal only for the patient or an authorized caregiver.</p>
                      </div>
                    </div>
                    <Button variant="outline" className="w-full gap-2" onClick={() => setPasswordDialogOpen(true)}>
                      <Lock className="h-4 w-4" />
                      Change Password
                    </Button>
                  </CardContent>
                </Card>

                <Card className="rounded-3xl border border-border bg-card shadow-sm">
                  <CardHeader>
                    <CardTitle>Support and updates</CardTitle>
                    <CardDescription>Contact the laboratory for record corrections or help with access.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-foreground">
                    <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4 text-primary">
                      <p className="font-medium">Need to update your personal details?</p>
                      <p className="mt-2 leading-6 text-primary/90">
                        Contact our clinic team to update address, phone number, email, or demographic information.
                      </p>
                    </div>
                    <p>Phone: +91 9622635767</p>
                    <p>Email: support@irmclinic.com</p>
                  </CardContent>
                </Card>

                <PatientActiveSessions />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Change Password
            </DialogTitle>
            <DialogDescription>
              Update your portal password. Saving this will sign out your other active sessions.
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

            <PasswordRequirements password={newPassword} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPasswordDialogOpen(false)} disabled={updatingPassword}>
                Cancel
              </Button>
              <Button type="submit" disabled={updatingPassword}>
                {updatingPassword ? "Updating..." : "Update Password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <footer className="mt-12 border-t border-border bg-card/70">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-6 text-sm text-muted-foreground sm:px-6 md:flex-row lg:px-8">
          <div className="flex items-center gap-2">
            <img src={logo} alt="IRM Clinical" className="h-8 w-8 rounded-xl border border-border bg-card p-1" />
            <span>© {new Date().getFullYear()} IRM Clinical Laboratory</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span>Need help? Call +91 9622635767</span>
            <span>Portal access is intended for patients and authorized caregivers only.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PatientDashboard;
