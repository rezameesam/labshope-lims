import { Link } from "react-router-dom";
import { buildPlatformPathWithMarketing } from "@/lib/platformMarketing";
import { platformBranding } from "@/lib/platformBranding";

const PlatformSiteFooter = () => {
  return (
    <footer className="border-t border-border bg-card">
      <div className="container mx-auto flex flex-col gap-6 px-4 py-10 text-sm text-muted-foreground lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div>
          <img src="/labshope-logo.jpg" alt="LabShope LIMS" className="h-8 w-auto object-contain mb-2" />
          <p className="mt-1">{platformBranding.tagline}</p>
          <p className="mt-1"><a href={`mailto:${platformBranding.contactEmail}`} className="transition hover:text-primary">{platformBranding.contactEmail}</a></p>
          <p className="mt-1 text-xs">© {new Date().getFullYear()} LabShope Technologies. All rights reserved.</p>
        </div>
        <div className="flex flex-wrap gap-5">
          <Link to="/" className="transition hover:text-primary">Home</Link>
          <Link to={buildPlatformPathWithMarketing("/features")} className="transition hover:text-primary">Features</Link>
          <Link to={buildPlatformPathWithMarketing("/pricing")} className="transition hover:text-primary">Pricing</Link>
          <Link to={buildPlatformPathWithMarketing("/contact")} className="transition hover:text-primary">Contact</Link>
          <Link to={buildPlatformPathWithMarketing("/start")} className="transition hover:text-primary">Get Started</Link>
          <Link to="/careers" className="transition hover:text-primary">Careers</Link>
          <Link to="/privacy" className="transition hover:text-primary">Privacy</Link>
          <Link to="/terms" className="transition hover:text-primary">Terms</Link>
          <Link to={buildPlatformPathWithMarketing("/book-demo")} className="transition hover:text-primary">Book Demo</Link>
          <Link to="/platform/login" className="transition hover:text-primary">Platform Admin</Link>
        </div>
      </div>
    </footer>
  );
};

export default PlatformSiteFooter;
