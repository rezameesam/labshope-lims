import { ArrowRight, Building2, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import PlatformSiteFooter from "@/components/platform/PlatformSiteFooter";
import PlatformSiteHeader from "@/components/platform/PlatformSiteHeader";
import { buildPlatformPathWithMarketing } from "@/lib/platformMarketing";

interface PlatformAccessPageProps {
  eyebrow: string;
  title: string;
  description: string;
  primaryCtaLabel: string;
  primaryCtaTo: string;
  secondaryCtaLabel: string;
  secondaryCtaTo: string;
  helperTitle: string;
  helperBody: string;
}

const portalPattern = import.meta.env.VITE_PUBLIC_BASE_DOMAIN
  ? `your-lab.${import.meta.env.VITE_PUBLIC_BASE_DOMAIN}`
  : "your-lab.labshope.com";

const PlatformAccessPage = ({
  eyebrow,
  title,
  description,
  primaryCtaLabel,
  primaryCtaTo,
  secondaryCtaLabel,
  secondaryCtaTo,
  helperTitle,
  helperBody,
}: PlatformAccessPageProps) => {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f5ef_0%,#ffffff_48%,#eef5f7_100%)] text-foreground">
      <PlatformSiteHeader />

      <main>
        <section className="container mx-auto px-4 py-16 lg:px-8 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="space-y-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-clinical-navy/15 bg-white/75 px-4 py-2 text-sm font-medium text-clinical-navy shadow-sm">
                <ShieldCheck className="h-4 w-4" />
                {eyebrow}
              </div>

              <div className="space-y-4">
                <h1 className="max-w-3xl font-heading text-4xl font-bold tracking-tight text-clinical-navy md:text-5xl">
                  {title}
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-foreground/75">
                  {description}
                </p>
              </div>

              <div className="flex flex-wrap gap-4">
                <Link to={primaryCtaTo}>
                  <Button variant="clinical" size="lg">
                    {primaryCtaLabel}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link to={secondaryCtaTo}>
                  <Button variant="outline" size="lg">
                    {secondaryCtaLabel}
                  </Button>
                </Link>
              </div>
            </div>

            <div className="rounded-[28px] border border-border/70 bg-white/90 p-8 shadow-xl shadow-clinical-navy/5">
              <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-clinical-navy text-primary-foreground">
                <Building2 className="h-6 w-6" />
              </div>

              <h2 className="font-heading text-2xl font-semibold text-clinical-navy">
                {helperTitle}
              </h2>
              <p className="mt-3 text-sm leading-7 text-foreground/70">
                {helperBody}
              </p>

              <div className="mt-6 rounded-2xl border border-border bg-muted/40 p-5">
                <p className="text-sm font-medium text-clinical-navy">Portal pattern</p>
                <p className="mt-2 font-mono text-sm text-foreground/70">{portalPattern}</p>
              </div>

              <div className="mt-6 space-y-3 text-sm text-foreground/70">
                <p>Tenant access is resolved from your lab domain or subdomain.</p>
                <p>
                  Use the product site to{" "}
                  <Link to={buildPlatformPathWithMarketing("/book-demo")} className="text-primary hover:underline">
                    request a demo
                  </Link>
                  , not to sign in to a customer portal.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PlatformSiteFooter />
    </div>
  );
};

export default PlatformAccessPage;
