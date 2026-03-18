import { ArrowRight, Home, FlaskConical, Tag, Phone } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import PlatformSiteFooter from "@/components/platform/PlatformSiteFooter";
import PlatformSiteHeader from "@/components/platform/PlatformSiteHeader";
import { usePublicPageMode } from "@/hooks/usePublicPageMode";
import { buildPlatformPathWithMarketing } from "@/lib/platformMarketing";

const NotFound = () => {
  const location = useLocation();
  const { loading, platformHost, platformMode } = usePublicPageMode();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  if (loading && platformHost) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <div className="text-center text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!loading && platformMode) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f7f5ef_0%,#ffffff_48%,#eef5f7_100%)] text-foreground">
        <PlatformSiteHeader />
        <main className="container mx-auto px-4 py-16 lg:px-8 lg:py-24">
          <div className="mx-auto max-w-3xl rounded-[32px] border border-border/70 bg-white/90 p-8 text-center shadow-xl shadow-clinical-navy/5 lg:p-12">
            {/* Large 404 illustration */}
            <div className="mb-6 select-none">
              <span className="font-heading text-[120px] font-black leading-none tracking-tight text-clinical-navy/10 md:text-[160px]">
                404
              </span>
            </div>

            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Page not found
            </p>
            <h1 className="mt-3 font-heading text-3xl font-bold tracking-tight text-clinical-navy md:text-4xl">
              This page doesn't exist.
            </h1>
            <p className="mt-4 text-base leading-7 text-foreground/70">
              The URL may have changed or the page was removed. Use the links below to get back on track.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/">
                <Button variant="clinical" size="lg">
                  Go To Product Home
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to={buildPlatformPathWithMarketing("/features")}>
                <Button variant="outline" size="lg">
                  Features
                </Button>
              </Link>
              <Link to={buildPlatformPathWithMarketing("/pricing")}>
                <Button variant="outline" size="lg">
                  Pricing
                </Button>
              </Link>
              <Link to={buildPlatformPathWithMarketing("/contact")}>
                <Button variant="outline" size="lg">
                  Contact
                </Button>
              </Link>
            </div>
          </div>
        </main>
        <PlatformSiteFooter />
      </div>
    );
  }

  // Tenant / generic 404
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4">
      <div className="w-full max-w-md rounded-2xl border bg-background p-8 text-center shadow-sm">
        <div className="mb-4 select-none">
          <span className="font-bold text-[96px] leading-none tracking-tight text-foreground/10">
            404
          </span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Page not found</h1>
        <p className="mt-2 text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <a href="/">
            <Button className="w-full" size="lg">
              <Home className="mr-2 h-4 w-4" />
              Return to Home
            </Button>
          </a>
        </div>

        <div className="mt-6 flex justify-center gap-6 text-sm text-muted-foreground">
          <a href="/features" className="flex items-center gap-1 transition hover:text-primary">
            <FlaskConical className="h-3.5 w-3.5" />
            Features
          </a>
          <a href="/pricing" className="flex items-center gap-1 transition hover:text-primary">
            <Tag className="h-3.5 w-3.5" />
            Pricing
          </a>
          <a href="/contact" className="flex items-center gap-1 transition hover:text-primary">
            <Phone className="h-3.5 w-3.5" />
            Contact
          </a>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
