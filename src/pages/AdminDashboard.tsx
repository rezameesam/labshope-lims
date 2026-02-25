import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  Laptop
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
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

type TabType = "overview" | "notice-board" | "employees" | "patients" | "tests" | "test-catalog" | "test-packages" | "test-templates" | "billing" | "inventory" | "reports" | "doctors" | "reminders" | "labs" | "collection-centers" | "roles" | "security" | "notifications" | "system-settings";

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
  const { user, signOut, loading, isStaff, hasRole, isCollector } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedPatientForTests, setSelectedPatientForTests] = useState<PatientSummary | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth/employee");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!loading && user && !isStaff) {
      toast.error("Access denied. Staff only.");
      navigate("/");
    }
    // Redirect collectors to collector dashboard
    if (!loading && user && isCollector) {
      navigate("/collector");
    }
  }, [user, loading, isStaff, isCollector, navigate]);

  useEffect(() => {
    if (activeTab !== "tests" && selectedPatientForTests) {
      setSelectedPatientForTests(null);
    }
  }, [activeTab, selectedPatientForTests]);

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out successfully");
    navigate("/auth/employee");
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
    { id: "notice-board" as TabType, label: "Notice Board", icon: Bell },
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
    { id: "notifications" as TabType, label: "Notifications", icon: Bell, adminOnly: true },
    { id: "system-settings" as TabType, label: "System Settings", icon: Settings, adminOnly: true },
  ];

  const visibleTabs = tabs.filter(tab => !tab.adminOnly || hasRole("admin"));

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
            <img src={logo} alt="IRM Clinical Laboratory" className="h-10 w-10" />
            <div>
              <h1 className="text-sm font-heading font-bold text-primary-foreground">
                IRM Clinical
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
                    setActiveTab(tab.id);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeTab === tab.id
                      ? "bg-primary-foreground/10 text-primary-foreground"
                      : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/5"
                  }`}
                >
                  <tab.icon className="h-5 w-5" />
                  <span>{tab.label}</span>
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
            {activeTab === "overview" && <DashboardOverview onNavigate={(tab) => setActiveTab(tab as TabType)} />}
            {activeTab === "notice-board" && <NoticeBoard onNavigate={(tab) => setActiveTab(tab as TabType)} />}
            {activeTab === "employees" && hasRole("admin") && <ManageEmployees />}
            {activeTab === "patients" && (
              <ManagePatients
                onAssignTests={(patient) => {
                  setSelectedPatientForTests(patient);
                  setActiveTab("tests");
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
            {activeTab === "notifications" && hasRole("admin") && <NotificationSettings />}
            {activeTab === "system-settings" && hasRole("admin") && <SystemSettings />}
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
