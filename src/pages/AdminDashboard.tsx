import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Users,
  UserPlus,
  Stethoscope,
  LogOut,
  Menu,
  X,
  Home,
  ClipboardList,
  Settings,
  Receipt,
  Package,
  FlaskConical,
  BarChart3,
  UserCog,
  FileText,
  Bell,
  Building2,
  MapPin,
  Shield,
  Laptop,
  Globe,
  PhoneCall,
  Sparkles,
  TrendingUp,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { initiateRazorpayPayment } from "@/services/razorpayService";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
import { useOrganization } from "@/contexts/OrganizationContext";
import ManageEmployees from "@/components/admin/ManageEmployees";
import ManagePatients from "@/components/admin/ManagePatients";
import ManageTests from "@/components/admin/ManageTests";
import ManageBilling from "@/components/admin/ManageBilling";
import ManageInventory from "@/components/admin/ManageInventory";
import ManageTestCatalog from "@/components/admin/ManageTestCatalog";
import ManageTestPackages from "@/components/admin/ManageTestPackages";
import ManageDoctors from "@/components/admin/ManageDoctors";
import ManageTestTemplates from "@/components/admin/ManageTestTemplates";
import ManageReminders from "@/components/admin/ManageReminders";
import ManageLabs from "@/components/admin/ManageLabs";
import ManageCollectionCenters from "@/components/admin/ManageCollectionCenters";
import LabSelector from "@/components/admin/LabSelector";
import DashboardOverview from "@/components/admin/DashboardOverview";
import FinancialReports from "@/components/admin/FinancialReports";
import ManageRoles from "@/components/admin/ManageRoles";
import NotificationSettings from "@/components/admin/NotificationSettings";
import SystemSettings from "@/components/admin/SystemSettings";
import NoticeBoard from "@/components/admin/NoticeBoard";
import ActiveSessions from "@/components/account/ActiveSessions";
import ManageVisitorLogs from "@/components/admin/ManageVisitorLogs";
import ManageBookingRequests from "@/components/admin/ManageBookingRequests";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import AdminQuickSetup from "@/components/admin/AdminQuickSetup";

type TabType = "overview" | "quick-setup" | "notice-board" | "booking-requests" | "employees" | "patients" | "tests" | "test-catalog" | "test-packages" | "test-templates" | "billing" | "inventory" | "reports" | "doctors" | "reminders" | "labs" | "collection-centers" | "roles" | "security" | "visitor-logs" | "notifications" | "system-settings";

type PatientSummary = {
  id: string;
  patient_id: string;
  full_name: string;
  phone: string;
  lab_id?: string | null;
  collection_center_id?: string | null;
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, signOut, loading, isStaff, hasRole, isCollector, staffPasswordResetRequired } = useAuth();
  const { isPlatformAdmin } = usePlatformAdmin();
  const { branding, organization, loading: organizationLoading } = useOrganization();
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedPatientForTests, setSelectedPatientForTests] = useState<PatientSummary | null>(null);
  const [sidebarCounts, setSidebarCounts] = useState({
    bookingRequests: 0,
    noticeBoard: 0,
  });

  type PlanLimitInfo = {
    currentPlan: string;
    exceededMetric: string;
    currentValue: number;
    limit: number;
    upgradeTo: string;
    upgradePrice: number;
  };
  const [planLimitOpen, setPlanLimitOpen] = useState(false);
  const [planLimitInfo, setPlanLimitInfo] = useState<PlanLimitInfo | null>(null);
  const [upgradingPlan, setUpgradingPlan] = useState(false);

  const requestedTab = searchParams.get("tab");
  const setDashboardTab = (tab: TabType) => {
    setActiveTab(tab);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", tab);
    setSearchParams(nextParams, { replace: true });
  };

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth/staff", { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    const validTabs = new Set<TabType>([
      "overview",
      "quick-setup",
      "notice-board",
      "booking-requests",
      "employees",
      "patients",
      "tests",
      "test-catalog",
      "test-packages",
      "test-templates",
      "billing",
      "inventory",
      "reports",
      "doctors",
      "reminders",
      "labs",
      "collection-centers",
      "roles",
      "security",
      "visitor-logs",
      "notifications",
      "system-settings",
    ]);

    if (requestedTab && validTabs.has(requestedTab as TabType) && requestedTab !== activeTab) {
      setActiveTab(requestedTab as TabType);
    }
  }, [activeTab, requestedTab]);

  useEffect(() => {
    if (!loading && user && staffPasswordResetRequired) {
      const nextTarget =
        String(user.user_metadata?.first_login_flow || "") === "self_serve_owner"
          ? "/admin?tab=quick-setup&onboarding=1"
          : `/admin?tab=${activeTab}`;
      navigate(`/staff/reset-password?first_login=1&next=${encodeURIComponent(nextTarget)}`, { replace: true });
      return;
    }

    if (!loading && user && !isStaff) {
      toast.error("Access denied. Staff only.");
      navigate("/", { replace: true });
    }
    // Redirect collectors to collector dashboard
    if (!loading && user && isCollector) {
      navigate("/collector", { replace: true });
    }
  }, [user, loading, isStaff, isCollector, navigate, staffPasswordResetRequired, activeTab]);

  useEffect(() => {
    if (activeTab !== "tests" && selectedPatientForTests) {
      setSelectedPatientForTests(null);
    }
  }, [activeTab, selectedPatientForTests]);

  useEffect(() => {
    if (!user || !isStaff || organizationLoading) {
      return;
    }

    if (!organization?.id) {
      setSidebarCounts({
        bookingRequests: 0,
        noticeBoard: 0,
      });
      return;
    }

    const fetchSidebarCounts = async () => {
      try {
        let testsQuery = supabase
          .from("patient_tests")
          .select("id", { count: "exact", head: true })
          .in("status", ["pending", "in_progress"]);

        if (isCollector) {
          testsQuery = testsQuery.eq("collected_by", user.id);
        }

        if (organization?.id) {
          testsQuery = testsQuery.eq("organization_id" as any, organization.id);
        }

        let bookingRequestsQuery = supabase
          .from("booking_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "new");

        let remindersQuery = supabase
          .from("patient_reminders")
          .select("id, reminder_date, due_date, is_completed")
          .eq("is_completed", false)
          .limit(100);

        let invoicesQuery = supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .neq("payment_status", "paid");

        bookingRequestsQuery = bookingRequestsQuery.eq("organization_id" as any, organization.id);
        remindersQuery = remindersQuery.eq("organization_id" as any, organization.id);
        invoicesQuery = invoicesQuery.eq("organization_id" as any, organization.id);

        const [
          bookingRequestsResult,
          pendingTestsResult,
          remindersResult,
          invoicesResult,
        ] = await Promise.all([
          bookingRequestsQuery,
          testsQuery,
          remindersQuery,
          invoicesQuery,
        ]);

        const today = new Date();
        const reminderCount = (remindersResult.data || []).filter((reminder) => {
          const reminderDate = new Date(reminder.reminder_date);
          const dueDate = reminder.due_date ? new Date(reminder.due_date) : null;
          const isOverdue = reminderDate < today;
          const isUpcoming = reminderDate.toDateString() === today.toDateString() || (dueDate ? dueDate < today : false);
          return isOverdue || isUpcoming;
        }).length;

        setSidebarCounts({
          bookingRequests: bookingRequestsResult.count || 0,
          noticeBoard: (pendingTestsResult.count || 0) + reminderCount + (invoicesResult.count || 0),
        });
      } catch (error) {
        console.error("Error fetching admin sidebar counts:", error);
      }
    };

    void fetchSidebarCounts();
    const intervalId = window.setInterval(() => {
      void fetchSidebarCounts();
    }, 60000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [user, isStaff, isCollector, organization?.id, organizationLoading]);

  useEffect(() => {
    if (!organization?.id || organizationLoading) return;
    // Only show once per session per org
    const dismissKey = `plan_limit_dismissed_${organization.id}`;
    if (sessionStorage.getItem(dismissKey)) return;

    const PLAN_PRICES: Record<string, number> = { starter: 10000, growth: 20000, premium: 40000 };
    const PLAN_PATIENT_LIMITS: Record<string, number> = { starter: 25000, growth: 100000, premium: Infinity };
    const NEXT_PLAN: Record<string, string> = { starter: "growth", growth: "premium" };

    const checkPlanLimits = async () => {
      const [settingsResult, patientsResult] = await Promise.all([
        (supabase as any)
          .from("organization_settings")
          .select("setting_value")
          .eq("organization_id", organization.id)
          .eq("setting_key", "plan_tier")
          .maybeSingle(),
        (supabase as any)
          .from("patients")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organization.id),
      ]);

      const currentPlan: string = settingsResult.data?.setting_value || "starter";
      const patientCount: number = patientsResult.count ?? 0;
      const patientLimit = PLAN_PATIENT_LIMITS[currentPlan] ?? 25000;

      if (patientCount > patientLimit && NEXT_PLAN[currentPlan]) {
        const upgradeTo = NEXT_PLAN[currentPlan];
        setPlanLimitInfo({
          currentPlan,
          exceededMetric: "active patients",
          currentValue: patientCount,
          limit: patientLimit,
          upgradeTo,
          upgradePrice: (PLAN_PRICES[upgradeTo] ?? 0) - (PLAN_PRICES[currentPlan] ?? 0),
        });
        setPlanLimitOpen(true);
      }
    };

    void checkPlanLimits();
  }, [organization?.id, organizationLoading]);

  const handleUpgradeNow = useCallback(async () => {
    if (!planLimitInfo || !organization?.id) return;
    setUpgradingPlan(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-plan-upgrade-order`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            organization_id: organization.id,
            to_plan: planLimitInfo.upgradeTo,
          }),
        },
      );
      const orderData = await resp.json();
      if (!resp.ok) throw new Error(orderData.error || "Failed to create order");

      await initiateRazorpayPayment(
        orderData.key_id,
        orderData.order_id,
        orderData.upgrade_amount,
        `PLAN-UPGRADE-${planLimitInfo.upgradeTo.toUpperCase()}`,
        organization.slug,
        user?.email ?? "",
        user?.email ?? "",
        "",
        async (razorpayResponse) => {
          // Verify payment server-side and activate upgrade
          try {
            const confirmResp = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/confirm-plan-upgrade`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({
                  organization_id: organization.id,
                  to_plan: planLimitInfo.upgradeTo,
                  razorpay_payment_id: razorpayResponse.razorpay_payment_id,
                  razorpay_order_id: razorpayResponse.razorpay_order_id,
                  razorpay_signature: razorpayResponse.razorpay_signature,
                }),
              },
            );
            const confirmData = await confirmResp.json();
            if (!confirmResp.ok) throw new Error(confirmData.error || "Plan activation failed");

            toast.success(`Plan upgraded to ${planLimitInfo.upgradeTo}! Thank you.`);
            setPlanLimitOpen(false);
            sessionStorage.removeItem(`plan_limit_dismissed_${organization.id}`);
          } catch (confirmErr: any) {
            toast.error(confirmErr.message || "Plan activation failed. Contact support with your payment ID.");
          } finally {
            setUpgradingPlan(false);
          }
        },
        (errMsg) => {
          if (errMsg !== "Payment cancelled by user") toast.error(errMsg);
          setUpgradingPlan(false);
        },
      );
    } catch (e: any) {
      toast.error(e.message || "Upgrade failed. Please try again.");
    } finally {
      setUpgradingPlan(false);
    }
  }, [planLimitInfo, organization, user]);

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out successfully");
    navigate("/auth/staff");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-subtle-gradient">
        <div className="animate-pulse text-clinical-navy">Loading...</div>
      </div>
    );
  }

  if (!user || !isStaff) {
    return null;
  }

  const tabs = [
    { id: "overview" as TabType, label: "Overview", icon: Home },
    { id: "quick-setup" as TabType, label: "Quick Setup", icon: Sparkles, adminOnly: true },
    { id: "notice-board" as TabType, label: "Notice Board", icon: Bell },
    { id: "booking-requests" as TabType, label: "Booking Requests", icon: PhoneCall },
    { id: "patients" as TabType, label: "Patients", icon: UserPlus },
    { id: "tests" as TabType, label: "Patient Tests", icon: ClipboardList },
    { id: "billing" as TabType, label: "Billing", icon: Receipt },
    { id: "reminders" as TabType, label: "Reminders", icon: Bell },
    { id: "test-packages" as TabType, label: "Test Packages", icon: Package },
    { id: "inventory" as TabType, label: "Inventory", icon: Package },
    { id: "reports" as TabType, label: "Reports", icon: BarChart3 },
    { id: "test-catalog" as TabType, label: "Test Catalog", icon: FlaskConical },
    { id: "doctors" as TabType, label: "Doctors", icon: UserCog },
    { id: "employees" as TabType, label: "Employees", icon: Users, adminOnly: true },
    { id: "labs" as TabType, label: "Labs", icon: Building2, adminOnly: true },
    { id: "collection-centers" as TabType, label: "Collection Centers", icon: MapPin },
    { id: "test-templates" as TabType, label: "Templates", icon: FileText },
    { id: "roles" as TabType, label: "Roles & Permissions", icon: Shield, adminOnly: true },
    { id: "security" as TabType, label: "Security", icon: Laptop },
    { id: "visitor-logs" as TabType, label: "Visitor Logs", icon: Globe, adminOnly: true },
    { id: "notifications" as TabType, label: "Notifications", icon: Bell, adminOnly: true },
    { id: "system-settings" as TabType, label: "System Settings", icon: Settings, adminOnly: true },
  ];

  const visibleTabs = tabs.filter(tab => !tab.adminOnly || hasRole("admin"));
  const formatSidebarCount = (count: number) => (count > 99 ? "99+" : String(count));

  return (
    <div className="min-h-screen bg-subtle-gradient flex">
      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky lg:top-0 lg:h-screen lg:self-start inset-y-0 left-0 z-50 w-64 bg-clinical-navy transform transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex flex-col h-full p-4">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8 p-2">
            <img src={branding.logoUrl || logo} alt={branding.displayName} className="h-10 w-10" />
            <div>
              <h1 className="text-sm font-heading font-bold text-primary-foreground">
                {branding.shortName}
              </h1>
              <p className="text-xs text-primary-foreground/70">Admin Panel</p>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex-1 overflow-y-auto pr-1">
            <nav className="space-y-2">
              {visibleTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setDashboardTab(tab.id);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeTab === tab.id
                      ? "bg-primary-foreground/10 text-primary-foreground"
                      : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/5"
                  }`}
                >
                  <tab.icon className="h-5 w-5" />
                  <span className="flex-1 text-left">{tab.label}</span>
                  {tab.id === "booking-requests" && sidebarCounts.bookingRequests > 0 && (
                    <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                      {formatSidebarCount(sidebarCounts.bookingRequests)}
                    </Badge>
                  )}
                  {tab.id === "notice-board" && sidebarCounts.noticeBoard > 0 && (
                    <Badge className="bg-rose-500 text-white hover:bg-rose-500">
                      {formatSidebarCount(sidebarCounts.noticeBoard)}
                    </Badge>
                  )}
                </button>
              ))}
            </nav>
          </div>

          {/* User Info & Logout */}
          <div className="border-t border-primary-foreground/20 pt-4">
            <div className="px-4 py-2 mb-2">
              <p className="text-sm font-medium text-primary-foreground truncate">
                {user?.email}
              </p>
              <p className="text-xs text-primary-foreground/60 capitalize">
                {hasRole("admin") ? "Administrator" : "Employee"}
              </p>
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/5"
              onClick={handleSignOut}
            >
              <LogOut className="h-5 w-5 mr-3" />
              Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 min-h-screen">
        {/* Header */}
        <header className="bg-card border-b border-border p-4 sticky top-0 z-30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                className="lg:hidden p-2 hover:bg-muted rounded-lg"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
              <h1 className="text-xl font-heading font-bold text-foreground">
                {visibleTabs.find((t) => t.id === activeTab)?.label}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <LabSelector />
              {isPlatformAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/platform/leads")}
                >
                  Demo Leads
                </Button>
              )}
              {isPlatformAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/platform/onboarding")}
                >
                  Onboarding Queue
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/")}
              >
                <Home className="h-4 w-4 mr-2" />
                Home
              </Button>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-6">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "overview" && <DashboardOverview onNavigate={(tab) => setDashboardTab(tab as TabType)} />}
            {activeTab === "quick-setup" && hasRole("admin") && <AdminQuickSetup />}
            {activeTab === "notice-board" && (
              <NoticeBoard
                onNavigate={(tab) => setDashboardTab(tab as TabType)}
                onStatsChange={(count) =>
                  setSidebarCounts((current) => ({ ...current, noticeBoard: count }))
                }
              />
            )}
            {activeTab === "booking-requests" && (
              <ManageBookingRequests
                onCountChange={(count) =>
                  setSidebarCounts((current) => ({ ...current, bookingRequests: count }))
                }
              />
            )}
            {activeTab === "employees" && hasRole("admin") && <ManageEmployees />}
            {activeTab === "patients" && (
              <ManagePatients
                onAssignTests={(patient) => {
                  setSelectedPatientForTests(patient);
                  setDashboardTab("tests");
                }}
              />
            )}
            {activeTab === "tests" && <ManageTests preselectedPatient={selectedPatientForTests} />}
            {activeTab === "test-catalog" && <ManageTestCatalog />}
            {activeTab === "test-packages" && <ManageTestPackages />}
            {activeTab === "test-templates" && <ManageTestTemplates />}
            {activeTab === "billing" && <ManageBilling />}
            {activeTab === "inventory" && <ManageInventory />}
            {activeTab === "doctors" && <ManageDoctors />}
            {activeTab === "reminders" && <ManageReminders />}
            {activeTab === "labs" && <ManageLabs />}
            {activeTab === "collection-centers" && <ManageCollectionCenters />}
            {activeTab === "reports" && <FinancialReports />}
            {activeTab === "roles" && hasRole("admin") && <ManageRoles />}
            {activeTab === "security" && <ActiveSessions />}
            {activeTab === "visitor-logs" && hasRole("admin") && <ManageVisitorLogs />}
            {activeTab === "notifications" && hasRole("admin") && <NotificationSettings />}
            {activeTab === "system-settings" && hasRole("admin") && <SystemSettings />}
          </motion.div>
        </div>
      </main>

      {/* Plan limit upgrade dialog */}
      {planLimitInfo && (
        <Dialog
          open={planLimitOpen}
          onOpenChange={(open) => {
            if (!open && organization?.id) {
              sessionStorage.setItem(`plan_limit_dismissed_${organization.id}`, "1");
            }
            setPlanLimitOpen(open);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 mx-auto mb-3">
                <TrendingUp className="h-6 w-6 text-amber-600" />
              </div>
              <DialogTitle className="text-center text-xl">Time to upgrade your plan</DialogTitle>
              <DialogDescription className="text-center">
                You have{" "}
                <span className="font-semibold text-slate-900">
                  {planLimitInfo.currentValue.toLocaleString("en-IN")}
                </span>{" "}
                {planLimitInfo.exceededMetric}, which exceeds the{" "}
                <span className="font-semibold capitalize">{planLimitInfo.currentPlan}</span> plan limit of{" "}
                <span className="font-semibold">
                  {planLimitInfo.limit.toLocaleString("en-IN")}
                </span>
                .
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-center">
              <p className="font-semibold text-blue-900 capitalize">
                Upgrade to {planLimitInfo.upgradeTo}
              </p>
              <p className="mt-1 text-blue-700">
                ₹{planLimitInfo.upgradePrice.toLocaleString("en-IN")}/year + GST
              </p>
              <p className="mt-1 text-xs text-blue-500">
                (difference from your current {planLimitInfo.currentPlan} plan)
              </p>
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="flex-1"
                disabled={upgradingPlan}
                onClick={() => {
                  if (organization?.id) sessionStorage.setItem(`plan_limit_dismissed_${organization.id}`, "1");
                  setPlanLimitOpen(false);
                }}
              >
                Remind me later
              </Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700 gap-2"
                disabled={upgradingPlan}
                onClick={() => void handleUpgradeNow()}
              >
                {upgradingPlan && <Loader2 className="h-4 w-4 animate-spin" />}
                {upgradingPlan
                  ? "Processing…"
                  : `Upgrade to ${planLimitInfo?.upgradeTo} — ₹${planLimitInfo?.upgradePrice.toLocaleString("en-IN")}/yr`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default AdminDashboard;
