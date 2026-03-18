import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import ServicesSection from "@/components/ServicesSection";
import AboutSection from "@/components/AboutSection";
import ContactSection from "@/components/ContactSection";
import Footer from "@/components/Footer";
import { useOrganization } from "@/contexts/OrganizationContext";
import ProductLandingPage from "@/components/platform/ProductLandingPage";
import { usePublicPageMode } from "@/hooks/usePublicPageMode";
import InvalidTenantPage from "@/components/platform/InvalidTenantPage";
import { platformBranding } from "@/lib/platformBranding";

const Index = () => {
  const location = useLocation();
  const { branding } = useOrganization();
  const { loading, platformMode, invalidTenantHost, hostname } = usePublicPageMode();

  useEffect(() => {
    if (platformMode) {
      return;
    }

    const sectionId = location.hash.replace("#", "");

    if (!sectionId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);

    return () => window.clearTimeout(timeoutId);
  }, [location.hash]);

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
          <title>{`${platformBranding.productName} — ${platformBranding.tagline}`}</title>
          <meta name="description" content={platformBranding.tagline} />
          <meta property="og:title" content={`${platformBranding.productName} — ${platformBranding.tagline}`} />
          <meta property="og:description" content={platformBranding.tagline} />
          <meta property="og:type" content="website" />
        </Helmet>
        <ProductLandingPage />
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>{`${branding.displayName} | Trusted Diagnostic Centre${branding.locationLabel ? ` in ${branding.locationLabel}` : ""}`}</title>
        <meta name="description" content={`${branding.displayName} - ${branding.description}`} />
        <meta property="og:title" content={`${branding.displayName} | Trusted Diagnostic Centre`} />
        <meta property="og:description" content={`${branding.displayName} - ${branding.description}`} />
        <meta property="og:type" content="website" />
      </Helmet>
      
      <div className="min-h-screen bg-background">
        <Navbar />
        <main>
          <HeroSection />
          <ServicesSection />
          <AboutSection />
          <ContactSection />
        </main>
        <Footer />
      </div>
    </>
  );
};

export default Index;
