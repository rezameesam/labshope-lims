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
import CookieConsent from "@/components/privacy/CookieConsent";
const Index = lazy(() => import("./pages/Index"));
const PatientAuth = lazy(() => import("./pages/PatientAuth"));
const PatientDashboard = lazy(() => import("./pages/PatientDashboard"));
const PatientResetPassword = lazy(() => import("./pages/PatientResetPassword"));
const EmployeeAuth = lazy(() => import("./pages/EmployeeAuth"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const CollectorDashboard = lazy(() => import("./pages/CollectorDashboard"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));

const queryClient = new QueryClient();

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <LabProvider>
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
                    <Route path="/privacy" element={<PrivacyPolicy />} />
                    <Route path="/terms" element={<TermsOfService />} />
                    <Route path="/auth/patient" element={<PatientAuth />} />
                    <Route path="/patient/reset-password" element={<PatientResetPassword />} />
                    <Route path="/patient/dashboard" element={<PatientDashboard />} />
                    <Route path="/auth/employee" element={<EmployeeAuth />} />
                    <Route path="/admin" element={<AdminDashboard />} />
                    <Route path="/collector" element={<CollectorDashboard />} />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </PatientAuthProvider>
            </LabProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
