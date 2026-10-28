import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  ClipboardList,
  FileText,
  FlaskConical,
  Globe,
  Home,
  Laptop,
  MapPin,
  Package,
  PhoneCall,
  Receipt,
  Settings,
  Shield,
  Sparkles,
  Table2,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";

export type TabType =
  | "overview"
  | "quick-setup"
  | "notice-board"
  | "booking-requests"
  | "employees"
  | "patients"
  | "sheets"
  | "tests"
  | "test-catalog"
  | "test-packages"
  | "test-templates"
  | "billing"
  | "finance"
  | "inventory"
  | "reports"
  | "doctors"
  | "reminders"
  | "labs"
  | "collection-centers"
  | "external-labs"
  | "roles"
  | "security"
  | "visitor-logs"
  | "notifications"
  | "system-settings"
  | "subscription";

export type AdminDashboardTab = {
  id: TabType;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

type AdminDashboardNavGroupDefinition = {
  label: string;
  tabIds: TabType[];
};

export const ADMIN_DASHBOARD_TABS: AdminDashboardTab[] = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "notice-board", label: "Notice Board", icon: Bell },
  { id: "booking-requests", label: "Booking Requests", icon: PhoneCall },
  { id: "patients", label: "Patients", icon: UserPlus },
  { id: "sheets", label: "Lab Sheets", icon: Table2 },
  { id: "tests", label: "Patient Tests", icon: ClipboardList },
  { id: "billing", label: "Billing", icon: Receipt },
  { id: "finance", label: "Finance", icon: BookOpen },
  { id: "subscription", label: "Subscription", icon: BadgeCheck, adminOnly: true },
  { id: "reminders", label: "Reminders", icon: Bell },
  { id: "test-packages", label: "Test Packages", icon: Package },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "test-catalog", label: "Test Catalog", icon: FlaskConical },
  { id: "doctors", label: "Doctors", icon: UserCog },
  { id: "employees", label: "Employees", icon: Users, adminOnly: true },
  { id: "labs", label: "Labs", icon: Building2, adminOnly: true },
  { id: "collection-centers", label: "Collection Centers", icon: MapPin },
  { id: "external-labs", label: "External Labs", icon: Building2 },
  { id: "test-templates", label: "Templates", icon: FileText },
  { id: "roles", label: "Roles & Permissions", icon: Shield, adminOnly: true },
  { id: "security", label: "Security", icon: Laptop },
  { id: "visitor-logs", label: "Visitor Logs", icon: Globe, adminOnly: true },
  { id: "notifications", label: "Notifications", icon: Bell, adminOnly: true },
  { id: "system-settings", label: "System Settings", icon: Settings, adminOnly: true },
  { id: "quick-setup", label: "Quick Setup", icon: Sparkles, adminOnly: true },
];

export const VALID_ADMIN_DASHBOARD_TABS = new Set<TabType>(
  ADMIN_DASHBOARD_TABS.map((tab) => tab.id),
);

const ADMIN_DASHBOARD_NAV_GROUPS: AdminDashboardNavGroupDefinition[] = [
  {
    label: "Work",
    tabIds: ["overview", "notice-board", "booking-requests", "patients", "sheets", "tests", "billing", "reminders"],
  },
  {
    label: "Catalog",
    tabIds: ["test-catalog", "test-packages", "test-templates", "inventory", "doctors"],
  },
  {
    label: "Manage",
    tabIds: ["employees", "labs", "collection-centers", "external-labs", "reports"],
  },
  {
    label: "Account",
    tabIds: ["subscription", "finance", "quick-setup", "system-settings", "notifications", "roles", "security", "visitor-logs"],
  },
];

export const getVisibleAdminDashboardTabs = (isAdmin: boolean) =>
  ADMIN_DASHBOARD_TABS.filter((tab) => !tab.adminOnly || isAdmin);

export const getAdminDashboardNavGroups = (tabs: AdminDashboardTab[]) =>
  ADMIN_DASHBOARD_NAV_GROUPS.map((group) => ({
    label: group.label,
    tabs: tabs.filter((tab) => group.tabIds.includes(tab.id)),
  })).filter((group) => group.tabs.length > 0);

export const formatAdminDashboardSidebarCount = (count: number) =>
  (count > 99 ? "99+" : String(count));
