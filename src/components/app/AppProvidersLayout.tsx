import { Outlet } from "react-router-dom";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { PatientAuthProvider } from "@/hooks/usePatientAuth";
import { LabProvider } from "@/contexts/LabContext";
import { OrganizationProvider } from "@/contexts/OrganizationContext";

const getErrorStatus = (error: unknown) => {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  if ("status" in error && typeof error.status === "number") {
    return error.status;
  }

  if (
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "status" in error.response &&
    typeof error.response.status === "number"
  ) {
    return error.response.status;
  }

  return undefined;
};

const shouldRetryQuery = (failureCount: number, error: unknown) => {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return false;
  }

  const status = getErrorStatus(error);

  if (status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return false;
  }

  return failureCount < 2;
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.state.data !== undefined) {
        console.warn("[react-query][background-query-error]", query.queryHash, error);
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      console.error(
        "[react-query][mutation-error]",
        mutation.options.mutationKey ?? "anonymous",
        error
      );
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 2 * 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: shouldRetryQuery,
      retryDelay: (attemptIndex) => Math.min(1_000 * 2 ** attemptIndex, 8_000),
      networkMode: "online",
    },
    mutations: {
      retry: 0,
      networkMode: "online",
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
