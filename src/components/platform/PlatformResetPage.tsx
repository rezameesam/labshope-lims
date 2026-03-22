import { ArrowRight, KeyRound, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import PlatformSiteFooter from "@/components/platform/PlatformSiteFooter";
import PlatformSiteHeader from "@/components/platform/PlatformSiteHeader";
import { buildPlatformPathWithMarketing } from "@/lib/platformMarketing";

interface PlatformResetPageProps {
  eyebrow: string;
  title: string;
  description: string;
  loginLabel: string;
  loginTo: string;
}

const PlatformResetPage = ({
  eyebrow,
  title,
  description,
  loginLabel,
  loginTo,
}: PlatformResetPageProps) => {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f6fb_0%,#ffffff_52%,#f7f3ea_100%)] text-foreground">
      <PlatformSiteHeader />

      <main className="container mx-auto px-4 py-16 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-4xl rounded-[32px] border border-border/70 bg-card/90 p-8 shadow-xl shadow-clinical-navy/5 lg:p-12">
          <div className="mx-auto max-w-2xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-4 py-2 text-sm font-medium text-foreground">
              <ShieldCheck className="h-4 w-4" />
              {eyebrow}
            </div>

            <div className="mt-6 inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-primary text-primary-foreground">
              <KeyRound className="h-7 w-7" />
            </div>

            <h1 className="mt-6 font-heading text-4xl font-bold tracking-tight text-foreground md:text-5xl">
              {title}
            </h1>
            <p className="mt-4 text-lg leading-8 text-foreground/72">
              {description}
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link to={loginTo}>
                <Button variant="clinical" size="lg">
                  {loginLabel}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to={buildPlatformPathWithMarketing("/book-demo")}>
                <Button variant="outline" size="lg">
                  Book Demo
                </Button>
              </Link>
            </div>

            <div className="mt-8 rounded-2xl border border-border bg-muted/40 p-5 text-left text-sm leading-7 text-foreground/70">
              Password reset links are tenant-specific. Open the reset link from your lab’s own portal domain to continue safely.
            </div>
          </div>
        </div>
      </main>

      <PlatformSiteFooter />
    </div>
  );
};

export default PlatformResetPage;
