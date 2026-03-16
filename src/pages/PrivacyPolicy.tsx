import { Helmet } from "react-helmet-async";
import { formatAppDate } from "@/lib/date";
import { useOrganization } from "@/contexts/OrganizationContext";
import PlatformLegalPage from "@/components/platform/PlatformLegalPage";
import { usePublicPageMode } from "@/hooks/usePublicPageMode";
import { platformBranding } from "@/lib/platformBranding";
import InvalidTenantPage from "@/components/platform/InvalidTenantPage";

const PrivacyPolicy = () => {
  const { loading, platformMode, invalidTenantHost, hostname } = usePublicPageMode();
  const { branding } = useOrganization();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">Loading...</div></div>;
  }

  if (invalidTenantHost) {
    return <InvalidTenantPage hostname={hostname} />;
  }

  if (platformMode) {
    return (
      <PlatformLegalPage
        title="Privacy Policy"
        description={`${platformBranding.productName} provides software for diagnostic labs. This policy explains how platform-level information is handled for demo requests, site usage, and customer interactions.`}
        sections={[
          {
            title: "Who we are",
            body: `${platformBranding.productName} provides software for diagnostic labs, including patient workflow, billing, reports, notifications, and branch operations.`,
          },
          {
            title: "Information we collect",
            body: "We may collect contact information from demo requests and limited technical information from visitors to improve security, analytics, and product experience.",
          },
          {
            title: "How we use data",
            body: "We use data to respond to sales inquiries, improve the product website, protect services, and support onboarding or customer communication.",
          },
          {
            title: "Customer data",
            body: "Diagnostic labs using the platform remain responsible for the patient and operational data they manage through their own tenant environment.",
          },
          {
            title: "Contact",
            body: `Questions about this policy can be sent to ${platformBranding.contactEmail}.`,
          },
        ]}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{`Privacy Policy | ${branding.displayName}`}</title>
      </Helmet>
      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <h1 className="text-2xl font-heading font-bold text-foreground mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-muted-foreground mb-6">Last updated: {formatAppDate(new Date())}</p>

        <div className="space-y-6 text-sm text-foreground">
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Who we are</h2>
            <p>
              {branding.displayName} provides diagnostic services and a patient
              portal to view results and manage billing.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Information we collect</h2>
            <p>
              We collect information you provide (such as name, phone, email,
              and patient ID) and limited technical data when you use our
              website.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>IP address and device/browser information</li>
              <li>Pages visited, referrer, and timestamps</li>
              <li>Cookie identifiers and consent preferences</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">How we use data</h2>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Security and fraud prevention</li>
              <li>Site performance and analytics</li>
              <li>Personalization of experience</li>
              <li>Advertising and measurement (if enabled)</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Cookies and consent</h2>
            <p>
              Essential cookies are required for core functionality. Optional
              cookies for analytics, personalization, and ads are controlled by
              your consent preferences.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Retention</h2>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Security logs: 30–90 days</li>
              <li>Analytics: 12–24 months</li>
              <li>Advertising: 6–12 months</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Your choices</h2>
            <p>
              You can manage cookie preferences anytime from the consent banner.
              You may also contact us to request access, correction, or
              deletion where applicable.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Contact</h2>
            <p>
              If you have questions about this policy, contact us at
              <span className="ml-1 font-medium">{branding.email}</span>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
