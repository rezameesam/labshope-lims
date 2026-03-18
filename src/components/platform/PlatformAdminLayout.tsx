import { type ReactNode, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Building2,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Settings,
  ShieldCheck,
  Tag,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { platformBranding } from "@/lib/platformBranding";
import { useAuth } from "@/hooks/useAuth";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NotificationBell } from "@/components/platform/NotificationBell";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const NAV_SECTIONS = [
  {
    title: "Control",
    items: [
      {
        label: "Overview",
        description: "Main operating view",
        href: "/platform",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    title: "Pipeline",
    items: [
      {
        label: "Demo Leads",
        description: "Sales conversations",
        href: "/platform/leads",
        icon: Users,
      },
      {
        label: "Onboarding Queue",
        description: "Provisioning and launch",
        href: "/platform/onboarding",
        icon: ClipboardList,
      },
    ],
  },
  {
    title: "Customers",
    items: [
      {
        label: "Customer Ops",
        description: "Tenants, plans, domains",
        href: "/platform/customers",
        icon: Building2,
      },
    ],
  },
  {
    title: "Revenue",
    items: [
      {
        label: "Revenue",
        description: "MRR and plan breakdown",
        href: "/platform/revenue",
        icon: CreditCard,
      },
    ],
  },
  {
    title: "System",
    items: [
      {
        label: "Settings",
        description: "Platform-level configuration",
        href: "/platform/settings",
        icon: Settings,
      },
      {
        label: "Coupons",
        description: "Discount codes",
        href: "/platform/coupons",
        icon: Tag,
      },
      {
        label: "Audit Log",
        description: "Platform action trail",
        href: "/platform/audit-log",
        icon: ScrollText,
      },
    ],
  },
] as const;

interface PlatformAdminLayoutProps {
  children: ReactNode;
}

const getInitials = (email: string): string => {
  const local = email.split("@")[0];
  const parts = local.split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
};

const PlatformAdminLayout = ({ children }: PlatformAdminLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth/staff", { replace: true });
  };

  const isActive = (href: string) => {
    if (href === "/platform") {
      return location.pathname === "/platform" || location.pathname === "/platform/";
    }
    return location.pathname.startsWith(href);
  };

  const initials = user?.email ? getInitials(user.email) : "PA";

  const navContent = (onNavClick?: () => void) => (
    <div className="overflow-hidden rounded-[28px] bg-slate-950 text-slate-100 shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-6">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            Platform Admin
          </div>
          <NotificationBell />
        </div>
        <h1 className="mt-4 font-heading text-2xl font-bold tracking-tight text-white">
          {platformBranding.productName}
        </h1>
        <p className="mt-1.5 text-xs leading-6 text-slate-400">
          Operator console — sales, launch &amp; tenant ops
        </p>
      </div>

      {/* Nav */}
      <div className="space-y-5 px-4 py-5">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              {section.title}
            </p>
            <div className="mt-2 space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <button
                    key={item.label}
                    type="button"
                    aria-label={item.label}
                    aria-current={active ? "page" : undefined}
                    onClick={() => { navigate(item.href); onNavClick?.(); }}
                    className={`w-full rounded-2xl px-3 py-2.5 text-left transition ${
                      active
                        ? "bg-white text-slate-950"
                        : "text-slate-300 hover:bg-white/8 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`rounded-xl p-1.5 ${
                          active
                            ? "bg-slate-100 text-slate-700"
                            : "bg-white/8 text-slate-400"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-medium leading-none">{item.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* User footer */}
      <div className="border-t border-white/10 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-300">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-slate-200">
              {user?.email ?? "Platform admin"}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">Operator account</p>
          </div>
          <ThemeToggle />
          <button
            type="button"
            onClick={() => void handleSignOut()}
            title="Sign out"
            aria-label="Sign out"
            className="rounded-xl p-2 text-slate-500 transition hover:bg-white/8 hover:text-slate-200"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-950 px-4 py-3 xl:hidden">
        <span className="font-heading text-sm font-bold text-white">{platformBranding.productName}</span>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="rounded-xl p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[300px] bg-slate-950 p-0 border-0">
            {navContent(() => setMobileOpen(false))}
          </SheetContent>
        </Sheet>
      </div>

      <div className="mx-auto max-w-[1520px] px-4 py-6 lg:px-8 lg:py-8">
        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          {/* Desktop sidebar */}
          <aside className="hidden xl:block xl:sticky xl:top-6 xl:self-start">
            {navContent()}
          </aside>

          <main id="main-content" role="main" className="space-y-6 dark:text-slate-50">{children}</main>
        </div>
      </div>
    </div>
  );
};

export default PlatformAdminLayout;
