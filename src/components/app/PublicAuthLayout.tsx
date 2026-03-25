import { Outlet } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { PatientAuthProvider } from "@/hooks/usePatientAuth";
import { OrganizationProvider } from "@/contexts/OrganizationContext";

const PublicAuthLayout = () => (
  <AuthProvider>
    <OrganizationProvider>
      <PatientAuthProvider>
        <Outlet />
      </PatientAuthProvider>
    </OrganizationProvider>
  </AuthProvider>
);

export default PublicAuthLayout;
