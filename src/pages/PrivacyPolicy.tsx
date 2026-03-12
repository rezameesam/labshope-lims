import { Helmet } from "react-helmet-async";
import { formatAppDate } from "@/lib/date";

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Privacy Policy | IRM Clinical Laboratory</title>
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
              IRM Clinical Laboratory ("IRM", "we", "us") provides diagnostic
              services and a patient portal to view results and manage billing.
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
              <span className="ml-1 font-medium">no-reply@irmclinic.com</span>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
