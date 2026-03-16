import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/hooks/useAuth";
import { PatientAuthProvider } from "@/hooks/usePatientAuth";
import { LabProvider } from "@/contexts/LabContext";
import { OrganizationProvider } from "@/contexts/OrganizationContext";
import CookieConsent from "@/components/privacy/CookieConsent";
const Index = lazy(() => import("./pages/Index"));
const BookDemo = lazy(() => import("./pages/BookDemo"));
const BookTest = lazy(() => import("./pages/BookTest"));
const Features = lazy(() => import("./pages/Features"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Contact = lazy(() => import("./pages/Contact"));
const Start = lazy(() => import("./pages/Start"));
const PatientAuth = lazy(() => import("./pages/PatientAuth"));
const PatientDashboard = lazy(() => import("./pages/PatientDashboard"));
const PatientResetPassword = lazy(() => import("./pages/PatientResetPassword"));
const EmployeeAuth = lazy(() => import("./pages/EmployeeAuth"));
const EmployeeResetPassword = lazy(() => import("./pages/EmployeeResetPassword"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const CollectorDashboard = lazy(() => import("./pages/CollectorDashboard"));
const PlatformDashboard = lazy(() => import("./pages/PlatformDashboard"));
const PlatformLeads = lazy(() => import("./pages/PlatformLeads"));
const PlatformOnboarding = lazy(() => import("./pages/PlatformOnboarding"));
const PlatformCustomers = lazy(() => import("./pages/PlatformCustomers"));
const PlatformCustomerDetail = lazy(() => import("./pages/PlatformCustomerDetail"));
const PlatformSettings = lazy(() => import("./pages/PlatformSettings"));
const PlatformCoupons = lazy(() => import("./pages/PlatformCoupons"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const Careers = lazy(() => import("./pages/Careers"));

const queryClient = new QueryClient();

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <LabProvider>
              <OrganizationProvider>
                <PatientAuthProvider>
                  <CookieConsent />
                  <Suspense
                    fallback={
                      <div className="min-h-screen flex items-center justify-center bg-background">
                        <div className="animate-pulse text-muted-foreground">Loading...</div>
                      </div>
                    }
                  >
                    <Routes>
                      <Route path="/" element={<Index />} />
                      <Route path="/features" element={<Features />} />
                      <Route path="/pricing" element={<Pricing />} />
                      <Route path="/contact" element={<Contact />} />
                      <Route path="/start" element={<Start />} />
                      <Route path="/book-demo" element={<BookDemo />} />
                      <Route path="/book-test" element={<BookTest />} />
                      <Route path="/careers" element={<Careers />} />
                      <Route path="/work-with-us" element={<Careers />} />
                      <Route path="/privacy" element={<PrivacyPolicy />} />
                      <Route path="/terms" element={<TermsOfService />} />
                      <Route path="/auth/patient" element={<PatientAuth />} />
                      <Route path="/patient/reset-password" element={<PatientResetPassword />} />
                      <Route path="/patient/dashboard" element={<PatientDashboard />} />
                      <Route path="/auth/staff" element={<EmployeeAuth />} />
                      <Route path="/auth/employee" element={<EmployeeAuth />} />
                      <Route path="/staff/reset-password" element={<EmployeeResetPassword />} />
                      <Route path="/employee/reset-password" element={<EmployeeResetPassword />} />
                      <Route path="/admin" element={<AdminDashboard />} />
                      <Route path="/collector" element={<CollectorDashboard />} />
                      <Route path="/platform" element={<PlatformDashboard />} />
                      <Route path="/platform/" element={<PlatformDashboard />} />
                      <Route path="/platform/login" element={<EmployeeAuth />} />
                      <Route path="/platform/login/" element={<EmployeeAuth />} />
                      <Route path="/platform/leads" element={<PlatformLeads />} />
                      <Route path="/platform/leads/" element={<PlatformLeads />} />
                      <Route path="/platform/onboarding" element={<PlatformOnboarding />} />
                      <Route path="/platform/onboarding/" element={<PlatformOnboarding />} />
                      <Route path="/platform/customers" element={<PlatformCustomers />} />
                      <Route path="/platform/customers/" element={<PlatformCustomers />} />
                      <Route path="/platform/customers/:orgId" element={<PlatformCustomerDetail />} />
                      <Route path="/platform/settings" element={<PlatformSettings />} />
                      <Route path="/platform/settings/" element={<PlatformSettings />} />
                      <Route path="/platform/coupons" element={<PlatformCoupons />} />
                      <Route path="/platform/coupons/" element={<PlatformCoupons />} />
                      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                </PatientAuthProvider>
              </OrganizationProvider>
            </LabProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
