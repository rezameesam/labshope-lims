import { ArrowRight } from "lucide-react";
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
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted-foreground">404</p>
            <h1 className="mt-4 font-heading text-4xl font-bold tracking-tight text-clinical-navy md:text-5xl">
              This platform page does not exist.
            </h1>
            <p className="mt-4 text-lg leading-8 text-foreground/72">
              Use the product homepage to learn about the platform, or open your lab’s own domain if you were trying to access a patient or staff portal.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link to="/">
                <Button variant="clinical" size="lg">
                  Go To Product Home
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to={buildPlatformPathWithMarketing("/book-demo")}>
                <Button variant="outline" size="lg">
                  Book Demo
                </Button>
              </Link>
            </div>
          </div>
        </main>
        <PlatformSiteFooter />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
