import { Link } from "react-router-dom";
import { buildPlatformPathWithMarketing } from "@/lib/platformMarketing";
import { platformBranding } from "@/lib/platformBranding";
import { buildMarketingUrl, buildOperationsUrl } from "@/lib/publicTenant";

const PlatformSiteFooter = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-primary/20 bg-[linear-gradient(180deg,hsl(var(--card))_0%,hsl(var(--secondary)/0.3)_100%)]">
      <div className="container mx-auto px-4 py-12 lg:px-8">
        {/* Top section: brand + columns */}
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          {/* Brand */}
          <div className="col-span-2 md:col-span-2">
            <img
              src="/labshope-logo.jpg"
              alt="LabShope LIMS"
              className="h-8 w-auto object-contain"
            />
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              {platformBranding.tagline}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              <a
                href={`mailto:${platformBranding.contactEmail}`}
                className="transition hover:text-primary"
              >
                {platformBranding.contactEmail}
              </a>
            </p>
            {/* Social placeholder */}
            <div className="mt-4 flex gap-3 text-muted-foreground">
              <a
                href="#"
                aria-label="Twitter / X"
                className="rounded-md p-1 transition hover:text-primary"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="#"
                aria-label="LinkedIn"
                className="rounded-md p-1 transition hover:text-primary"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-foreground">
              Product
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a href={buildMarketingUrl(buildPlatformPathWithMarketing("/features"))} className="transition hover:text-primary">
                  Features
                </a>
              </li>
              <li>
                <a href={buildMarketingUrl(buildPlatformPathWithMarketing("/pricing"))} className="transition hover:text-primary">
                  Pricing
                </a>
              </li>
              <li>
                <a href={buildMarketingUrl(buildPlatformPathWithMarketing("/download"))} className="transition hover:text-primary">
                  Download App
                </a>
              </li>
              <li>
                <a href={buildMarketingUrl(buildPlatformPathWithMarketing("/start"))} className="transition hover:text-primary">
                  Get Started
                </a>
              </li>
              <li>
                <a href={buildMarketingUrl(buildPlatformPathWithMarketing("/book-demo"))} className="transition hover:text-primary">
                  Book Demo
                </a>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-foreground">
              Company
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a href={buildMarketingUrl("/")} className="transition hover:text-primary">
                  Home
                </a>
              </li>
              <li>
                <a href={buildMarketingUrl("/careers")} className="transition hover:text-primary">
                  Careers
                </a>
              </li>
              <li>
                <a href={buildMarketingUrl(buildPlatformPathWithMarketing("/contact"))} className="transition hover:text-primary">
                  Contact
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-foreground">
              Legal
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a href={buildMarketingUrl("/privacy")} className="transition hover:text-primary">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href={buildMarketingUrl("/terms")} className="transition hover:text-primary">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href={buildOperationsUrl("/platform/login")} className="transition hover:text-primary">
                  Platform Admin
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          © {year} {platformBranding.companyName}. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

export default PlatformSiteFooter;
