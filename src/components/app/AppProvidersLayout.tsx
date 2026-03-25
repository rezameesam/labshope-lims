import { Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { PatientAuthProvider } from "@/hooks/usePatientAuth";
import { LabProvider } from "@/contexts/LabContext";
import { OrganizationProvider } from "@/contexts/OrganizationContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const AppProvidersLayout = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <LabProvider>
          <OrganizationProvider>
            <PatientAuthProvider>
              <Outlet />
            </PatientAuthProvider>
          </OrganizationProvider>
        </LabProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default AppProvidersLayout;
