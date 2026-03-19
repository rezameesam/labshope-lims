import { Helmet } from "react-helmet-async";
import { ArrowRight, BriefcaseBusiness, Building2, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import PlatformSiteFooter from "@/components/platform/PlatformSiteFooter";
import PlatformSiteHeader from "@/components/platform/PlatformSiteHeader";
import { getPlatformPageTitle, platformBranding } from "@/lib/platformBranding";

const careerTracks: Array<{ title: string; body: string; icon: LucideIcon }> = [
  {
    title: "Product And Engineering",
    body: "Work on patient flows, billing, reports, and multi-tenant product systems.",
    icon: Building2,
  },
  {
    title: "Customer Success",
    body: "Help labs get onboarded, configured, and successful in daily operations.",
    icon: ShieldCheck,
  },
  {
    title: "Operations And Growth",
    body: "Support onboarding, documentation, sales prep, and customer rollout workflows.",
    icon: BriefcaseBusiness,
  },
];

const PlatformCareersPage = () => {
  const contactEmail = platformBranding.contactEmail;

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{getPlatformPageTitle("Careers")}</title>
        <meta
          name="description"
          content="Join the team building software for diagnostic labs, patient workflows, billing, reports, and branch operations."
        />
      </Helmet>
      <PlatformSiteHeader />

      <main>
        <section className="relative overflow-hidden border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--clinical-navy))_0%,hsl(var(--clinical-blue-dark))_100%)]">
          <div className="container mx-auto px-4 py-20 lg:px-8 lg:py-28">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-2 text-sm font-medium text-primary-foreground">
                <BriefcaseBusiness className="h-4 w-4" />
                Careers
              </div>
              <h1 className="mt-6 font-heading text-4xl font-bold text-primary-foreground md:text-6xl">
                Build the operating system for modern diagnostic labs
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-primary-foreground/80">
                We are building software for patient workflows, billing, reports, notifications, and multi-branch lab operations.
              </p>
              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <a href={`mailto:${contactEmail}?subject=${encodeURIComponent(`Careers at ${platformBranding.productName}`)}`}>
                  <Button variant="hero" size="xl">
                    Apply By Email
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </a>
                <Link to="/">
                  <Button variant="heroOutline" size="xl">Back to Home</Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-16 lg:px-8 lg:py-20">
          <div className="grid gap-6 md:grid-cols-3">
            {careerTracks.map(({ title, body, icon: Icon }) => (
              <article key={title} className="rounded-3xl border border-border bg-card p-6 shadow-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-clinical-blue-light text-clinical-blue">
                  <Icon className="h-6 w-6" />
                </div>
                <h2 className="mt-6 font-heading text-2xl font-semibold">{title}</h2>
                <p className="mt-3 leading-7 text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <PlatformSiteFooter />
    </div>
  );
};

export default PlatformCareersPage;
