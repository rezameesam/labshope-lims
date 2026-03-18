import { Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import PlatformFeaturesPage from "@/components/platform/PlatformFeaturesPage";
import { usePublicPageMode } from "@/hooks/usePublicPageMode";
import InvalidTenantPage from "@/components/platform/InvalidTenantPage";
import { platformBranding } from "@/lib/platformBranding";

const Features = () => {
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
          <title>{`Features | ${platformBranding.productName}`}</title>
          <meta name="description" content={`Explore the features of ${platformBranding.productName} — ${platformBranding.tagline}`} />
          <meta property="og:title" content={`Features | ${platformBranding.productName}`} />
          <meta property="og:description" content={`Explore the features of ${platformBranding.productName} — ${platformBranding.tagline}`} />
          <meta property="og:type" content="website" />
        </Helmet>
        <PlatformFeaturesPage />
      </>
    );
  }

  return <Navigate to="/" replace />;
};

export default Features;
