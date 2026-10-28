import { Suspense, type ReactElement } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import CookieConsent from "@/components/privacy/CookieConsent";
import AppRouteLoadingScreen from "@/components/app/AppRouteLoadingScreen";
import AppRouteWarmup from "@/components/app/AppRouteWarmup";
import AppShellErrorBoundary from "@/components/app/AppShellErrorBoundary";
import { lazyRoute } from "@/components/app/lazyRoute";

const AppProvidersLayout = lazyRoute(() => import("./components/app/AppProvidersLayout"));
const PublicAuthLayout = lazyRoute(() => import("./components/app/PublicAuthLayout"));
const PublicOrganizationLayout = lazyRoute(() => import("./components/app/PublicOrganizationLayout"));
const Index = lazyRoute(() => import("./pages/Index"));
const BookDemo = lazyRoute(() => import("./pages/BookDemo"));
const BookTest = lazyRoute(() => import("./pages/BookTest"));
const Features = lazyRoute(() => import("./pages/Features"));
const Pricing = lazyRoute(() => import("./pages/Pricing"));
const Contact = lazyRoute(() => import("./pages/Contact"));
const Start = lazyRoute(() => import("./pages/Start"));
const PatientAuth = lazyRoute(() => import("./pages/PatientAuth"));
const PatientDashboard = lazyRoute(() => import("./pages/PatientDashboard"));
const PatientResetPassword = lazyRoute(() => import("./pages/PatientResetPassword"));
const EmployeeAuth = lazyRoute(() => import("./pages/EmployeeAuth"));
const EmployeeResetPassword = lazyRoute(() => import("./pages/EmployeeResetPassword"));
const AdminDashboard = lazyRoute(() => import("./pages/AdminDashboard"));
const CollectorDashboard = lazyRoute(() => import("./pages/CollectorDashboard"));
const PlatformDashboard = lazyRoute(() => import("./pages/PlatformDashboard"));
const PlatformLeads = lazyRoute(() => import("./pages/PlatformLeads"));
const PlatformOnboarding = lazyRoute(() => import("./pages/PlatformOnboarding"));
const PlatformCustomers = lazyRoute(() => import("./pages/PlatformCustomers"));
const PlatformCustomerDetail = lazyRoute(() => import("./pages/PlatformCustomerDetail"));
const PlatformSettings = lazyRoute(() => import("./pages/PlatformSettings"));
const PlatformCoupons = lazyRoute(() => import("./pages/PlatformCoupons"));
const PlatformRevenue = lazyRoute(() => import("./pages/PlatformRevenue"));
const PlatformAuditLog = lazyRoute(() => import("./pages/PlatformAuditLog"));
const NotFound = lazyRoute(() => import("./pages/NotFound"));
const PrivacyPolicy = lazyRoute(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazyRoute(() => import("./pages/TermsOfService"));
const RefundPolicy = lazyRoute(() => import("./pages/RefundPolicy"));
const Careers = lazyRoute(() => import("./pages/Careers"));

const PUBLIC_PAGE_FALLBACK = {
  title: "Loading the next page",
  description: "Preparing public content and organization context for a smooth transition.",
};

const AUTH_PAGE_FALLBACK = {
  title: "Opening secure sign in",
  description: "Preparing authentication tools and restoring session state.",
};

const APP_PAGE_FALLBACK = {
  title: "Opening your workspace",
  description: "Loading the route shell and refreshing secure application data.",
};

const WARM_ROUTE_MODULES = [
  AppProvidersLayout,
  PublicAuthLayout,
  PublicOrganizationLayout,
  Start,
  BookDemo,
  BookTest,
  PatientAuth,
  EmployeeAuth,
  PatientDashboard,
  AdminDashboard,
  PlatformDashboard,
] as const;

const renderRoute = (
  element: ReactElement,
  fallback = PUBLIC_PAGE_FALLBACK
) => (
  <Suspense
    fallback={
      <AppRouteLoadingScreen
        title={fallback.title}
        description={fallback.description}
      />
    }
  >
    {element}
  </Suspense>
);

const renderPublicRoute = (element: ReactElement) =>
  renderRoute(element, PUBLIC_PAGE_FALLBACK);

const renderAuthRoute = (element: ReactElement) =>
  renderRoute(element, AUTH_PAGE_FALLBACK);

const renderAppRoute = (element: ReactElement) =>
  renderRoute(element, APP_PAGE_FALLBACK);

const AppRouter = () => {
  const location = useLocation();

  return (
    <AppShellErrorBoundary resetKey={location.pathname} homeHref="/">
      <AppRouteWarmup preloaders={WARM_ROUTE_MODULES} />
      <Routes>
        <Route element={renderPublicRoute(<PublicOrganizationLayout />)}>
          <Route path="/" element={renderPublicRoute(<Index />)} />
          <Route path="/features" element={renderPublicRoute(<Features />)} />
          <Route path="/pricing" element={renderPublicRoute(<Pricing />)} />
          <Route path="/contact" element={renderPublicRoute(<Contact />)} />
          <Route path="/start" element={renderPublicRoute(<Start />)} />
          <Route path="/book-demo" element={renderPublicRoute(<BookDemo />)} />
          <Route path="/book-test" element={renderPublicRoute(<BookTest />)} />
          <Route path="/careers" element={renderPublicRoute(<Careers />)} />
          <Route path="/work-with-us" element={renderPublicRoute(<Careers />)} />
          <Route path="/privacy" element={renderPublicRoute(<PrivacyPolicy />)} />
          <Route path="/terms" element={renderPublicRoute(<TermsOfService />)} />
          <Route path="/refund-policy" element={renderPublicRoute(<RefundPolicy />)} />
        </Route>
        <Route element={renderAuthRoute(<PublicAuthLayout />)}>
          <Route path="/auth/patient" element={renderAuthRoute(<PatientAuth />)} />
          <Route
            path="/patient/reset-password"
            element={renderAuthRoute(<PatientResetPassword />)}
          />
          <Route path="/auth/staff" element={renderAuthRoute(<EmployeeAuth />)} />
          <Route path="/auth/employee" element={renderAuthRoute(<EmployeeAuth />)} />
          <Route
            path="/staff/reset-password"
            element={renderAuthRoute(<EmployeeResetPassword />)}
          />
          <Route
            path="/employee/reset-password"
            element={renderAuthRoute(<EmployeeResetPassword />)}
          />
          <Route path="/platform/login" element={renderAuthRoute(<EmployeeAuth />)} />
          <Route path="/platform/login/" element={renderAuthRoute(<EmployeeAuth />)} />
        </Route>
        <Route element={renderAppRoute(<AppProvidersLayout />)}>
          <Route path="/patient/dashboard" element={renderAppRoute(<PatientDashboard />)} />
          <Route path="/admin" element={renderAppRoute(<AdminDashboard />)} />
          <Route path="/collector" element={renderAppRoute(<CollectorDashboard />)} />
          <Route path="/platform" element={renderAppRoute(<PlatformDashboard />)} />
          <Route path="/platform/" element={renderAppRoute(<PlatformDashboard />)} />
          <Route path="/platform/leads" element={renderAppRoute(<PlatformLeads />)} />
          <Route path="/platform/leads/" element={renderAppRoute(<PlatformLeads />)} />
          <Route
            path="/platform/onboarding"
            element={renderAppRoute(<PlatformOnboarding />)}
          />
          <Route
            path="/platform/onboarding/"
            element={renderAppRoute(<PlatformOnboarding />)}
          />
          <Route
            path="/platform/customers"
            element={renderAppRoute(<PlatformCustomers />)}
          />
          <Route
            path="/platform/customers/"
            element={renderAppRoute(<PlatformCustomers />)}
          />
          <Route
            path="/platform/customers/:orgId"
            element={renderAppRoute(<PlatformCustomerDetail />)}
          />
          <Route
            path="/platform/settings"
            element={renderAppRoute(<PlatformSettings />)}
          />
          <Route
            path="/platform/settings/"
            element={renderAppRoute(<PlatformSettings />)}
          />
          <Route path="/platform/coupons" element={renderAppRoute(<PlatformCoupons />)} />
          <Route path="/platform/coupons/" element={renderAppRoute(<PlatformCoupons />)} />
          <Route path="/platform/revenue" element={renderAppRoute(<PlatformRevenue />)} />
          <Route
            path="/platform/revenue/"
            element={renderAppRoute(<PlatformRevenue />)}
          />
          <Route
            path="/platform/audit-log"
            element={renderAppRoute(<PlatformAuditLog />)}
          />
          <Route
            path="/platform/audit-log/"
            element={renderAppRoute(<PlatformAuditLog />)}
          />
        </Route>
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={renderPublicRoute(<NotFound />)} />
      </Routes>
    </AppShellErrorBoundary>
  );
};

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <HelmetProvider>
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CookieConsent />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[9999] focus:rounded-lg focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:ring-2 focus:ring-ring focus:outline-none"
        >
          Skip to main content
        </a>
        <AppRouter />
      </BrowserRouter>
    </HelmetProvider>
  </ThemeProvider>
);

export default App;
