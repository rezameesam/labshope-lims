import { Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import PlatformBookDemoPage from "@/components/platform/PlatformBookDemoPage";
import { usePublicPageMode } from "@/hooks/usePublicPageMode";
import InvalidTenantPage from "@/components/platform/InvalidTenantPage";
import { platformBranding } from "@/lib/platformBranding";

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
    return (
      <>
        <Helmet>
          <title>{`Book a Demo | ${platformBranding.productName}`}</title>
          <meta name="description" content={`Schedule a free demo of ${platformBranding.productName} and see how it can streamline your diagnostic lab operations.`} />
          <meta property="og:title" content={`Book a Demo | ${platformBranding.productName}`} />
          <meta property="og:description" content={`Schedule a free demo of ${platformBranding.productName} and see how it can streamline your diagnostic lab operations.`} />
          <meta property="og:type" content="website" />
        </Helmet>
        <PlatformBookDemoPage />
      </>
    );
  }

  return <Navigate to="/book-test" replace />;
};

export default BookDemo;
