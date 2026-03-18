import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import PlatformAdminLayout from "./PlatformAdminLayout";

interface PlatformRouteProps {
  children: ReactNode;
}

const PlatformRoute = ({ children }: PlatformRouteProps) => {
  const { user, loading: authLoading, isStaff } = useAuth();
  const { loading: platformAdminLoading, isPlatformAdmin } = usePlatformAdmin();

  if (authLoading || platformAdminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/platform/login" replace />;
  }

  if (!isStaff || !isPlatformAdmin) {
    return <Navigate to="/" replace />;
  }

  return <PlatformAdminLayout>{children}</PlatformAdminLayout>;
};

export default PlatformRoute;
