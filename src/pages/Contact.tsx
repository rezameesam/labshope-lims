import { Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import PlatformContactPage from "@/components/platform/PlatformContactPage";
import { usePublicPageMode } from "@/hooks/usePublicPageMode";
import InvalidTenantPage from "@/components/platform/InvalidTenantPage";
import { platformBranding } from "@/lib/platformBranding";

const Contact = () => {
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
          <title>{`Contact | ${platformBranding.productName}`}</title>
          <meta name="description" content={`Get in touch with the ${platformBranding.productName} team. Contact us at ${platformBranding.contactEmail}.`} />
          <meta property="og:title" content={`Contact | ${platformBranding.productName}`} />
          <meta property="og:description" content={`Get in touch with the ${platformBranding.productName} team. Contact us at ${platformBranding.contactEmail}.`} />
          <meta property="og:type" content="website" />
        </Helmet>
        <PlatformContactPage />
      </>
    );
  }

  return <Navigate to="/" replace />;
};

export default Contact;
