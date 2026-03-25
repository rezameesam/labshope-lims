import { Outlet } from "react-router-dom";
import { OrganizationProvider } from "@/contexts/OrganizationContext";

const PublicOrganizationLayout = () => (
  <OrganizationProvider>
    <Outlet />
  </OrganizationProvider>
);

export default PublicOrganizationLayout;
