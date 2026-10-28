import { useState, useEffect, lazy, Suspense } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LogOut,
  Menu,
  X,
  Home,
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
import { ThemeToggle } from "@/components/ui/theme-toggle";
import SyncStatusBadge from "@/components/offline/SyncStatusBadge";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
import { useOrganization } from "@/contexts/OrganizationContext";
import LabSelector from "@/components/admin/LabSelector";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import AdminErrorBoundary from "@/components/admin/AdminErrorBoundary";
import {
  formatAdminDashboardSidebarCount,
  getAdminDashboardNavGroups,
  getVisibleAdminDashboardTabs,
  VALID_ADMIN_DASHBOARD_TABS,
} from "@/components/admin/adminDashboardConfig";
import type { TabType } from "@/components/admin/adminDashboardConfig";
import { useAdminSidebarCounts } from "@/hooks/useAdminSidebarCounts";
import { useAdminPlanLimit } from "@/hooks/useAdminPlanLimit";

const ManageEmployees = lazy(() => import("@/components/admin/ManageEmployees"));
const ManagePatients = lazy(() => import("@/components/admin/ManagePatients"));
const ManageTests = lazy(() => import("@/components/admin/ManageTests"));
const ManageBilling = lazy(() => import("@/components/admin/ManageBilling"));
const LabSheets = lazy(() => import("@/components/sheet/LabSheets"));
const ManageInventory = lazy(() => import("@/components/admin/ManageInventory"));
const ManageTestCatalog = lazy(() => import("@/components/admin/ManageTestCatalog"));
const ManageTestPackages = lazy(() => import("@/components/admin/ManageTestPackages"));
const ManageDoctors = lazy(() => import("@/components/admin/ManageDoctors"));
const ManageTestTemplates = lazy(() => import("@/components/admin/ManageTestTemplates"));
const ManageReminders = lazy(() => import("@/components/admin/ManageReminders"));
const ManageLabs = lazy(() => import("@/components/admin/ManageLabs"));
const ManageCollectionCenters = lazy(() => import("@/components/admin/ManageCollectionCenters"));
const DashboardOverview = lazy(() => import("@/components/admin/DashboardOverview"));
const FinancialReports = lazy(() => import("@/components/admin/FinancialReports"));
const ManageRoles = lazy(() => import("@/components/admin/ManageRoles"));
const NotificationSettings = lazy(() => import("@/components/admin/NotificationSettings"));
const SystemSettings = lazy(() => import("@/components/admin/SystemSettings"));
const SubscriptionStatus = lazy(() => import("@/components/admin/SubscriptionStatus"));
const NoticeBoard = lazy(() => import("@/components/admin/NoticeBoard"));
const ActiveSessions = lazy(() => import("@/components/account/ActiveSessions"));
const ManageVisitorLogs = lazy(() => import("@/components/admin/ManageVisitorLogs"));
const ManageBookingRequests = lazy(() => import("@/components/admin/ManageBookingRequests"));
const AdminQuickSetup = lazy(() => import("@/components/admin/AdminQuickSetup"));
const ManageFinance = lazy(() => import("@/components/admin/ManageFinance"));
const ManageExternalLabs = lazy(() => import("@/components/admin/ManageExternalLabs"));

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
  const requestedTab = searchParams.get("tab");
  const isAdmin = hasRole("admin");
  const visibleTabs = getVisibleAdminDashboardTabs(isAdmin);
  const navGroups = getAdminDashboardNavGroups(visibleTabs);
  const activeTabLabel = visibleTabs.find((tab) => tab.id === activeTab)?.label;
  const {
    sidebarCounts,
    setSidebarCounts,
  } = useAdminSidebarCounts({
    enabled: Boolean(user && isStaff && !organizationLoading),
    organizationId: organization?.id,
    isCollector,
    userId: user?.id,
  });
  const {
    planLimitInfo,
    planLimitOpen,
    upgradingPlan,
    dismissPlanLimit,
    handlePlanLimitOpenChange,
    handleUpgradeNow,
  } = useAdminPlanLimit({
    organizationId: organization?.id,
    organizationLoading,
    organizationSlug: organization?.slug,
    userEmail: user?.email,
  });

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
    if (requestedTab && VALID_ADMIN_DASHBOARD_TABS.has(requestedTab as TabType) && requestedTab !== activeTab) {
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
              <h1 className="text-sm font-heading font-bold text-white">
                {branding.shortName}
              </h1>
              <p className="text-xs text-white/75">Admin Panel</p>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex-1 overflow-y-auto pr-1">
            <nav className="space-y-5">
              {navGroups.map((group) => (
                <div key={group.label}>
                  <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-widest text-white/35 select-none">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.tabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setDashboardTab(tab.id);
                          setSidebarOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors text-sm ${
                          activeTab === tab.id
                            ? "bg-white/15 text-white font-medium"
                            : "text-white/70 hover:text-white hover:bg-white/10"
                        }`}
                      >
                        <tab.icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1 text-left">{tab.label}</span>
                        {tab.id === "booking-requests" && sidebarCounts.bookingRequests > 0 && (
                          <Badge className="bg-amber-500 text-white hover:bg-amber-500 text-[10px] px-1.5 py-0">
                            {formatAdminDashboardSidebarCount(sidebarCounts.bookingRequests)}
                          </Badge>
                        )}
                        {tab.id === "notice-board" && sidebarCounts.noticeBoard > 0 && (
                          <Badge className="bg-rose-500 text-white hover:bg-rose-500 text-[10px] px-1.5 py-0">
                            {formatAdminDashboardSidebarCount(sidebarCounts.noticeBoard)}
                          </Badge>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </div>

          {/* User Info & Logout */}
          <div className="border-t border-primary-foreground/20 pt-4">
            <div className="px-4 py-2 mb-2">
              <p className="text-sm font-medium text-white truncate">
                {user?.email}
              </p>
              <p className="text-xs text-white/70 capitalize">
                {hasRole("admin") ? "Administrator" : "Employee"}
              </p>
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start text-white/80 hover:text-white hover:bg-white/10"
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
                {activeTabLabel}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <SyncStatusBadge />
              <ThemeToggle />
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
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-foreground" />
              </div>
            }
          >
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "overview" && <AdminErrorBoundary tabName="Overview"><DashboardOverview onNavigate={(tab) => setDashboardTab(tab as TabType)} /></AdminErrorBoundary>}
            {activeTab === "quick-setup" && hasRole("admin") && <AdminErrorBoundary tabName="Quick Setup"><AdminQuickSetup onNavigate={(tab) => setDashboardTab(tab as TabType)} /></AdminErrorBoundary>}
            {activeTab === "notice-board" && (
              <AdminErrorBoundary tabName="Notice Board">
                <NoticeBoard
                  onNavigate={(tab) => setDashboardTab(tab as TabType)}
                  onStatsChange={(count) =>
                    setSidebarCounts((current) => ({ ...current, noticeBoard: count }))
                  }
                />
              </AdminErrorBoundary>
            )}
            {activeTab === "booking-requests" && (
              <AdminErrorBoundary tabName="Booking Requests">
                <ManageBookingRequests
                  onCountChange={(count) =>
                    setSidebarCounts((current) => ({ ...current, bookingRequests: count }))
                  }
                />
              </AdminErrorBoundary>
            )}
            {activeTab === "employees" && hasRole("admin") && <AdminErrorBoundary tabName="Employees"><ManageEmployees /></AdminErrorBoundary>}
            {activeTab === "patients" && (
              <AdminErrorBoundary tabName="Patients">
                <ManagePatients
                  onOpenBilling={() => setDashboardTab("billing")}
                  onAssignTests={(patient) => {
                    setSelectedPatientForTests(patient);
                    setDashboardTab("tests");
                  }}
                />
              </AdminErrorBoundary>
            )}
            {activeTab === "tests" && <AdminErrorBoundary tabName="Patient Tests"><ManageTests preselectedPatient={selectedPatientForTests} /></AdminErrorBoundary>}
            {activeTab === "test-catalog" && <AdminErrorBoundary tabName="Test Catalog"><ManageTestCatalog /></AdminErrorBoundary>}
            {activeTab === "test-packages" && <AdminErrorBoundary tabName="Test Packages"><ManageTestPackages /></AdminErrorBoundary>}
            {activeTab === "test-templates" && <AdminErrorBoundary tabName="Templates"><ManageTestTemplates /></AdminErrorBoundary>}
            {activeTab === "sheets" && <AdminErrorBoundary tabName="Lab Sheets"><LabSheets /></AdminErrorBoundary>}
            {activeTab === "billing" && <AdminErrorBoundary tabName="Billing"><ManageBilling /></AdminErrorBoundary>}
            {activeTab === "finance" && <AdminErrorBoundary tabName="Finance"><ManageFinance /></AdminErrorBoundary>}
            {activeTab === "subscription" && <AdminErrorBoundary tabName="Subscription"><SubscriptionStatus /></AdminErrorBoundary>}
            {activeTab === "inventory" && <AdminErrorBoundary tabName="Inventory"><ManageInventory /></AdminErrorBoundary>}
            {activeTab === "doctors" && <AdminErrorBoundary tabName="Doctors"><ManageDoctors /></AdminErrorBoundary>}
            {activeTab === "reminders" && <AdminErrorBoundary tabName="Reminders"><ManageReminders /></AdminErrorBoundary>}
            {activeTab === "labs" && <AdminErrorBoundary tabName="Labs"><ManageLabs /></AdminErrorBoundary>}
            {activeTab === "collection-centers" && <AdminErrorBoundary tabName="Collection Centers"><ManageCollectionCenters /></AdminErrorBoundary>}
            {activeTab === "external-labs" && <AdminErrorBoundary tabName="External Labs"><ManageExternalLabs /></AdminErrorBoundary>}
            {activeTab === "reports" && <AdminErrorBoundary tabName="Reports"><FinancialReports /></AdminErrorBoundary>}
            {activeTab === "roles" && hasRole("admin") && <AdminErrorBoundary tabName="Roles & Permissions"><ManageRoles /></AdminErrorBoundary>}
            {activeTab === "security" && <AdminErrorBoundary tabName="Security"><ActiveSessions /></AdminErrorBoundary>}
            {activeTab === "visitor-logs" && hasRole("admin") && <AdminErrorBoundary tabName="Visitor Logs"><ManageVisitorLogs /></AdminErrorBoundary>}
            {activeTab === "notifications" && hasRole("admin") && <AdminErrorBoundary tabName="Notifications"><NotificationSettings /></AdminErrorBoundary>}
            {activeTab === "system-settings" && hasRole("admin") && <AdminErrorBoundary tabName="System Settings"><SystemSettings /></AdminErrorBoundary>}
          </motion.div>
          </Suspense>
        </div>
      </main>

      {/* Plan limit upgrade dialog */}
      {planLimitInfo && (
        <Dialog
          open={planLimitOpen}
          onOpenChange={handlePlanLimitOpenChange}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 mx-auto mb-3">
                <TrendingUp className="h-6 w-6 text-amber-600" />
              </div>
              <DialogTitle className="text-center text-xl">Time to upgrade your plan</DialogTitle>
              <DialogDescription className="text-center">
                You have{" "}
                <span className="font-semibold text-foreground">
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

            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-center">
              <p className="font-semibold text-blue-800 dark:text-blue-200 capitalize">
                Upgrade to {planLimitInfo.upgradeTo}
              </p>
              <p className="mt-1 text-blue-700 dark:text-blue-300">
                ₹{planLimitInfo.upgradePrice.toLocaleString("en-IN")}/year + GST
              </p>
              <p className="mt-1 text-xs text-blue-600 dark:text-blue-300/80">
                (difference from your current {planLimitInfo.currentPlan} plan)
              </p>
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="flex-1"
                disabled={upgradingPlan}
                onClick={dismissPlanLimit}
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
