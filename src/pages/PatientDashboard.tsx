import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, FileText, FlaskConical, GitBranch, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePatientAuth } from "@/hooks/usePatientAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatAppDate } from "@/lib/date";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
import TestResultsTable from "@/components/patient/TestResultsTable";
import PageErrorBoundary from "@/components/PageErrorBoundary";
import { useOrganization } from "@/contexts/OrganizationContext";
import { validatePatientPassword } from "@/lib/patientSecurity";
import { PatientHeader } from "@/components/patient/dashboard/PatientHeader";
import { PatientWelcomeBanner } from "@/components/patient/dashboard/PatientWelcomeBanner";
import { PatientStatsCards } from "@/components/patient/dashboard/PatientStatsCards";
import { PatientQuickActions } from "@/components/patient/dashboard/PatientQuickActions";
import { PatientProfileTab } from "@/components/patient/dashboard/PatientProfileTab";
import { PatientSecurityTab } from "@/components/patient/dashboard/PatientSecurityTab";

const BillingPortal = lazy(() => import("@/components/patient/BillingPortal"));
const PatientHistoryTimeline = lazy(() => import("@/components/patient/PatientHistoryTimeline"));
const PatientBookTestRequest = lazy(() => import("@/components/patient/PatientBookTestRequest"));

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
  labs?: { id: string; name: string; lab_code: string } | null;
  collection_centers?: { id: string; name: string; code: string } | null;
}

const MAX_PATIENT_ADDRESS_LENGTH = 250;

const patientTabTriggerClassName =
  "h-14 w-full cursor-pointer flex-row items-center justify-center gap-2.5 rounded-2xl border border-border/70 bg-background/85 px-4 text-center text-sm font-semibold leading-none text-muted-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-background hover:text-foreground hover:shadow-md data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg md:h-16 md:text-base";

const tabFallback = (
  <Card className="border border-border bg-card shadow-sm">
    <CardContent className="py-10 text-center text-sm text-muted-foreground">
      Loading section...
    </CardContent>
  </Card>
);

const PatientDashboard = () => {
  const { branding } = useOrganization();
  const navigate = useNavigate();
  const { patient, loading, isAuthenticated, signOut, setPassword, updateAddress } = usePatientAuth();
  const [tests, setTests] = useState<PatientTest[]>([]);
  const [testsLoading, setTestsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("results");
  const [hasOutstandingDues, setHasOutstandingDues] = useState(false);
  const [outstandingAmount, setOutstandingAmount] = useState(0);
  const [checkingDues, setCheckingDues] = useState(true);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [addressInput, setAddressInput] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [updatingAddress, setUpdatingAddress] = useState(false);

  useEffect(() => {
    if (!loading && !isAuthenticated) navigate("/auth/patient", { replace: true });
  }, [loading, isAuthenticated, navigate]);

  useEffect(() => {
    setAddressInput(patient?.address || "");
  }, [patient?.address]);

  const refreshDues = useCallback(async () => {
    if (!patient?.id) { setCheckingDues(false); return; }
    try {
      let query = supabase
        .from("invoices")
        .select("final_amount, paid_amount, payment_status")
        .eq("patient_id", patient.id);
      if (patient.organization_id) query = query.eq("organization_id", patient.organization_id);
      const { data: invoices, error } = await query;
      if (error) throw error;
      const billed = invoices?.reduce((s, i) => s + (Number(i.final_amount) || 0), 0) || 0;
      const paid = invoices?.reduce((s, i) => s + (Number(i.paid_amount) || 0), 0) || 0;
      setHasOutstandingDues(billed - paid > 0);
      setOutstandingAmount(Math.max(0, billed - paid));
    } catch (err) {
      console.error("Error checking outstanding dues:", err);
    } finally {
      setCheckingDues(false);
    }
  }, [patient?.id, patient?.organization_id]);

  useEffect(() => {
    if (!patient?.id) return;

    const fetchTests = async () => {
      try {
        let data: any[] | null = null;
        let error: any = null;

        try {
          let q = supabase
            .from("patient_tests")
            .select("*, labs(id,name,lab_code), collection_centers(id,name,code)")
            .eq("patient_id", patient.id);
          if (patient.organization_id) q = q.eq("organization_id", patient.organization_id);
          const res = await q.order("created_at", { ascending: false });
          data = res.data; error = res.error;

          if (error && (error.code === "PGRST116" || error.code === "PGRST201" || error.code === "42P01" ||
            error.message?.includes("Could not find") || error.message?.includes("relationship"))) {
            let bq = supabase.from("patient_tests").select("*").eq("patient_id", patient.id);
            if (patient.organization_id) bq = bq.eq("organization_id", patient.organization_id);
            const br = await bq.order("created_at", { ascending: false });
            data = br.data; error = br.error;
          }
        } catch {
          let bq = supabase.from("patient_tests").select("*").eq("patient_id", patient.id);
          if (patient.organization_id) bq = bq.eq("organization_id", patient.organization_id);
          const br = await bq.order("created_at", { ascending: false });
          data = br.data; error = br.error;
        }

        if (error) throw error;

        const enteredByIds = Array.from(
          new Set(
            (data || [])
              .map((test: any) => test.result_entered_by)
              .filter(Boolean),
          ),
        );

        const employeeNameMap = new Map<string, string>();
        if (enteredByIds.length > 0) {
          const { data: employees, error: employeeError } = await supabase
            .from("employees")
            .select("user_id, full_name")
            .in("user_id", enteredByIds);

          if (employeeError) throw employeeError;

          (employees || []).forEach((employee) => {
            if (employee.user_id) {
              employeeNameMap.set(employee.user_id, employee.full_name);
            }
          });
        }

        const withEmployees = (data || []).map((test: any) =>
          test.result_entered_by && employeeNameMap.has(test.result_entered_by)
            ? { ...test, entered_by_name: employeeNameMap.get(test.result_entered_by) }
            : test,
        );
        setTests(withEmployees);
      } catch (err) {
        console.error("Error fetching tests:", err);
        toast.error("Failed to load test results");
      } finally {
        setTestsLoading(false);
      }
    };

    void fetchTests();
    void refreshDues();
  }, [patient?.id, patient?.organization_id, refreshDues]);

  const pendingTests = useMemo(() => tests.filter((t) => t.status === "pending" || t.status === "processing"), [tests]);
  const completedTests = useMemo(() => tests.filter((t) => t.status === "completed"), [tests]);
  const abnormalTests = useMemo(() => tests.filter((t) => t.is_abnormal), [tests]);
  const mostRecentReportUrl = useMemo(() => completedTests.find((t) => t.report_url)?.report_url ?? null, [completedTests]);
  const lastVisitDate = useMemo(() => {
    if (!tests.length) return null;
    return formatAppDate(new Date(tests[0].created_at));
  }, [tests]);

  const handleSignOut = async () => {
    await signOut();
    toast.success("Logged out successfully");
    navigate("/auth/patient");
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) { toast.error("Please enter your current and new password"); return; }
    const msg = validatePatientPassword(newPassword);
    if (msg) { toast.error(msg); return; }
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match"); return; }
    setUpdatingPassword(true);
    const { error } = await setPassword(currentPassword, newPassword);
    setUpdatingPassword(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated successfully. Other sessions have been signed out.");
    setPasswordDialogOpen(false);
    setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
  };

  const handleAddressUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = addressInput.trim();
    if (!trimmed) { toast.error("Please enter your address"); return; }
    if (trimmed.length > MAX_PATIENT_ADDRESS_LENGTH) {
      toast.error(`Address must be ${MAX_PATIENT_ADDRESS_LENGTH} characters or fewer`); return;
    }
    setUpdatingAddress(true);
    const { error } = await updateAddress(trimmed);
    setUpdatingAddress(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Address updated successfully");
    setAddressDialogOpen(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-subtle-gradient text-foreground">
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
            <CardTitle className="text-foreground">Loading patient portal</CardTitle>
            <CardDescription>
              We could not finish loading your patient record yet. If this screen persists, return to login and try again.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button variant="outline" onClick={() => navigate("/auth/patient")}>Back to Login</Button>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-subtle-gradient">
      <PatientHeader
        branding={branding}
        patient={patient}
        lastVisitDate={lastVisitDate}
        onSignOut={handleSignOut}
      />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <PatientWelcomeBanner
          patientName={patient.full_name}
          patientId={patient.patient_id}
          phone={patient.phone}
          lastPasswordChange={patient.last_password_change}
          completedCount={completedTests.length}
          pendingCount={pendingTests.length}
          outstandingAmount={outstandingAmount}
          checkingDues={checkingDues}
          onViewResults={() => setActiveTab("results")}
          onBookTest={() => setActiveTab("book")}
          onUpdateProfile={() => setActiveTab("account")}
          onDownloadReports={() => mostRecentReportUrl ? window.open(mostRecentReportUrl, "_blank") : setActiveTab("results")}
        />

        <PatientStatsCards
          totalTests={tests.length}
          completedTests={completedTests.length}
          pendingTests={pendingTests.length}
          abnormalTests={abnormalTests.length}
        />

        <PatientQuickActions
          onBookTest={() => setActiveTab("book")}
          onViewResults={() => setActiveTab("results")}
          onBilling={() => setActiveTab("billing")}
          mostRecentReportUrl={mostRecentReportUrl}
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="overflow-x-auto">
            <TabsList className="grid h-auto min-w-max w-full grid-cols-5 gap-2 rounded-[24px] border border-border bg-muted/40 p-3 shadow-sm md:min-w-0">
              <TabsTrigger value="results" className={patientTabTriggerClassName}>
                <FileText className="h-4 w-4 shrink-0" />
                <span className="leading-none">Results</span>
              </TabsTrigger>
              <TabsTrigger value="billing" className={patientTabTriggerClassName}>
                <FlaskConical className="h-4 w-4 shrink-0" />
                <span className="leading-none">Billing</span>
              </TabsTrigger>
              <TabsTrigger value="book" className={patientTabTriggerClassName}>
                <ClipboardList className="h-4 w-4 shrink-0" />
                <span className="leading-none">Book Test</span>
              </TabsTrigger>
              <TabsTrigger value="timeline" className={patientTabTriggerClassName}>
                <GitBranch className="h-4 w-4 shrink-0" />
                <span className="leading-none">Timeline</span>
              </TabsTrigger>
              <TabsTrigger value="account" className={patientTabTriggerClassName}>
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span className="leading-none">Account</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="results">
            <PageErrorBoundary title="Results could not be loaded" description="The results view hit an unexpected error. You can retry or switch to another portal section.">
              <TestResultsTable
                tests={tests as any}
                patient={{ full_name: patient.full_name, patient_id: patient.patient_id, phone: patient.phone, gender: patient.gender, date_of_birth: patient.date_of_birth, blood_group: patient.blood_group }}
                loading={testsLoading}
                onPayNow={() => setActiveTab("billing")}
                hasOutstandingDues={hasOutstandingDues}
                outstandingAmount={outstandingAmount}
                checkingPayment={checkingDues}
              />
            </PageErrorBoundary>
          </TabsContent>

          <TabsContent value="billing">
            <PageErrorBoundary title="Billing could not be loaded" description="The billing view hit an unexpected error. You can retry without leaving the portal.">
              <Suspense fallback={tabFallback}>
                <BillingPortal
                  patientId={patient.id}
                  organizationId={patient.organization_id}
                  patientName={patient.full_name}
                  patientPhone={patient.phone}
                  onPaymentStatusChange={() => { setCheckingDues(true); void refreshDues(); }}
                />
              </Suspense>
            </PageErrorBoundary>
          </TabsContent>

          <TabsContent value="book">
            <PageErrorBoundary title="Booking form could not be loaded" description="The booking request form hit an unexpected error. You can retry without leaving the portal.">
              <Suspense fallback={tabFallback}>
                <PatientBookTestRequest
                  patient={{ id: patient.id, full_name: patient.full_name, phone: patient.phone, email: patient.email, address: patient.address, organization_id: patient.organization_id }}
                />
              </Suspense>
            </PageErrorBoundary>
          </TabsContent>

          <TabsContent value="timeline">
            <PageErrorBoundary title="Timeline could not be loaded" description="The timeline view hit an unexpected error. You can retry or use the other portal sections.">
              <Suspense fallback={tabFallback}>
                <PatientHistoryTimeline
                  tests={tests}
                  hasOutstandingDues={hasOutstandingDues}
                  outstandingAmount={outstandingAmount}
                  onPayNow={() => setActiveTab("billing")}
                />
              </Suspense>
            </PageErrorBoundary>
          </TabsContent>

          <TabsContent value="account">
            <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <PatientProfileTab
                patient={patient}
                addressInput={addressInput}
                setAddressInput={setAddressInput}
                addressDialogOpen={addressDialogOpen}
                setAddressDialogOpen={setAddressDialogOpen}
                onAddressUpdate={handleAddressUpdate}
                updatingAddress={updatingAddress}
              />
              <PatientSecurityTab
                patient={patient}
                branding={branding}
                passwordDialogOpen={passwordDialogOpen}
                setPasswordDialogOpen={setPasswordDialogOpen}
                currentPassword={currentPassword}
                setCurrentPassword={setCurrentPassword}
                newPassword={newPassword}
                setNewPassword={setNewPassword}
                confirmPassword={confirmPassword}
                setConfirmPassword={setConfirmPassword}
                updatingPassword={updatingPassword}
                onChangePassword={handleChangePassword}
              />
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <footer className="mt-12 border-t border-border bg-card/70">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-6 text-sm text-muted-foreground sm:px-6 md:flex-row lg:px-8">
          <div className="flex items-center gap-2">
            <img src={branding.logoUrl || logo} alt={branding.displayName} className="h-8 w-8 rounded-xl border border-border bg-card p-1" />
            <span>{`© ${new Date().getFullYear()} ${branding.displayName}`}</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span>{`Need help? Call ${branding.primaryPhone}`}</span>
            <span>Portal access is intended for patients and authorized caregivers only.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PatientDashboard;
