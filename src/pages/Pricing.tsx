import { Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import PlatformPricingPage from "@/components/platform/PlatformPricingPage";
import { usePublicPageMode } from "@/hooks/usePublicPageMode";
import InvalidTenantPage from "@/components/platform/InvalidTenantPage";
import { platformBranding } from "@/lib/platformBranding";

const Pricing = () => {
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
          <title>{`Pricing | ${platformBranding.productName}`}</title>
          <meta name="description" content={`Simple, transparent pricing for ${platformBranding.productName}. Choose the plan that fits your diagnostic lab.`} />
          <meta property="og:title" content={`Pricing | ${platformBranding.productName}`} />
          <meta property="og:description" content={`Simple, transparent pricing for ${platformBranding.productName}. Choose the plan that fits your diagnostic lab.`} />
          <meta property="og:type" content="website" />
        </Helmet>
        <PlatformPricingPage />
      </>
    );
  }

  return <Navigate to="/" replace />;
};

export default Pricing;
