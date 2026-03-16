import { Helmet } from "react-helmet-async";
import { formatAppDate } from "@/lib/date";
import { useOrganization } from "@/contexts/OrganizationContext";
import PlatformLegalPage from "@/components/platform/PlatformLegalPage";
import { usePublicPageMode } from "@/hooks/usePublicPageMode";
import { platformBranding } from "@/lib/platformBranding";
import InvalidTenantPage from "@/components/platform/InvalidTenantPage";

const TermsOfService = () => {
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
        title="Terms of Service"
        description={`These terms govern use of the ${platformBranding.productName} product website and related demo or sales interactions.`}
        sections={[
          {
            title: "Acceptance of terms",
            body: `By accessing the ${platformBranding.productName} website, you agree to these terms and the related privacy policy.`,
          },
          {
            title: "Services",
            body: "We provide software and related onboarding or support services for diagnostic labs. Features, plans, and availability may change over time.",
          },
          {
            title: "Accounts and customer use",
            body: "Customer organizations are responsible for the accounts, data, and workflows they manage in their own tenant environment.",
          },
          {
            title: "Commercial terms",
            body: "Pricing, onboarding, support, and implementation commitments are governed by the commercial agreement or proposal accepted by the customer.",
          },
          {
            title: "Contact",
            body: `Questions about these terms can be sent to ${platformBranding.contactEmail}.`,
          },
        ]}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{`Terms of Service | ${branding.displayName}`}</title>
      </Helmet>
      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <h1 className="text-2xl font-heading font-bold text-foreground mb-2">
          Terms of Service
        </h1>
        <p className="text-sm text-muted-foreground mb-6">Last updated: {formatAppDate(new Date())}</p>

        <div className="space-y-6 text-sm text-foreground">
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Acceptance of terms</h2>
            <p>
              By accessing the {branding.displayName} website and patient
              portal, you agree to these Terms of Service and our Privacy Policy.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Services</h2>
            <p>
              We provide diagnostic laboratory services and a portal for viewing
              reports and managing billing. Services may change or be discontinued
              without notice.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Accounts and access</h2>
            <p>
              You are responsible for maintaining the confidentiality of your login
              credentials and for all activity that occurs under your account.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Health information</h2>
            <p>
              Content on this site is for informational purposes only and is not a
              substitute for professional medical advice, diagnosis, or treatment.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Payments and refunds</h2>
            <p>
              Fees for tests and services are disclosed at the time of booking.
              Refunds or adjustments are handled according to applicable clinic
              policies.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Prohibited use</h2>
            <p>
              You agree not to misuse the site, attempt unauthorized access, or
              interfere with the security or functionality of the services.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Limitation of liability</h2>
            <p>
              {branding.displayName} is not liable for indirect, incidental, or
              consequential damages arising from your use of the site or
              services, to the extent permitted by law.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Contact</h2>
            <p>
              Questions about these terms can be sent to
              <span className="ml-1 font-medium">{branding.email}</span>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
