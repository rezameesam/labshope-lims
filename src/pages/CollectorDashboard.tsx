import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  LogOut, 
  Menu, 
  X,
  UserPlus,
  FlaskConical,
  ClipboardList,
  Home
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
import ManagePatients from "@/components/admin/ManagePatients";
import ManageTests from "@/components/admin/ManageTests";
import DashboardOverview from "@/components/admin/DashboardOverview";

type TabType = "overview" | "patients" | "tests";

const CollectorDashboard = () => {
  const navigate = useNavigate();
  const { user, signOut, loading, hasRole, isCollector } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth/employee");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!loading && user && !isCollector && !hasRole("admin") && !hasRole("employee")) {
      toast.error("Access denied. Collector access only.");
      navigate("/");
    }
  }, [user, loading, isCollector, hasRole, navigate]);

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

  if (!user || (!isCollector && !hasRole("admin") && !hasRole("employee"))) {
    return null;
  }

  const tabs = [
    { id: "overview" as TabType, label: "Overview", icon: Home },
    { id: "patients" as TabType, label: "Patients", icon: UserPlus },
    { id: "tests" as TabType, label: "Test Collection", icon: FlaskConical },
  ];

  return (
    <div className="min-h-screen bg-subtle-gradient flex">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-border transition-transform duration-300 flex flex-col`}
      >
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={logo} alt="IRM Clinic" className="h-8 w-8" />
              <div>
                <h1 className="font-heading font-bold text-clinical-navy text-lg">
                  IRM Clinic
                </h1>
                <p className="text-xs text-muted-foreground">Sample Collection</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? "bg-clinical-navy text-white"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="font-medium">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
            onClick={handleSignOut}
          >
            <LogOut className="h-5 w-5" />
            <span>Sign Out</span>
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div>
              <h2 className="text-xl font-heading font-bold text-clinical-navy">
                {tabs.find((t) => t.id === activeTab)?.label || "Dashboard"}
              </h2>
              <p className="text-sm text-muted-foreground">
                Sample Collection Portal
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium">{user?.email}</p>
              <p className="text-xs text-muted-foreground">Sample Collector</p>
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
            {activeTab === "overview" && <DashboardOverview />}
            {activeTab === "patients" && <ManagePatients />}
            {activeTab === "tests" && <ManageTests />}
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default CollectorDashboard;

