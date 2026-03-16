import { Navigate } from "react-router-dom";
import PlatformBookDemoPage from "@/components/platform/PlatformBookDemoPage";
import { usePublicPageMode } from "@/hooks/usePublicPageMode";
import InvalidTenantPage from "@/components/platform/InvalidTenantPage";

const BookDemo = () => {
  const { loading, platformMode, invalidTenantHost, hostname } = usePublicPageMode();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (invalidTenantHost) {
    return <InvalidTenantPage hostname={hostname} />;
  }

  if (platformMode) {
    return <PlatformBookDemoPage />;
  }

  return <Navigate to="/book-test" replace />;
};

export default BookDemo;
