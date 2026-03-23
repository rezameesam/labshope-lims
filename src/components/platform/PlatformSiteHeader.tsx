import { Menu } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { buildPlatformPathWithMarketing } from "@/lib/platformMarketing";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";
import { buildMarketingUrl, buildOperationsUrl } from "@/lib/publicTenant";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const navItems = [
  { label: "Home", href: buildMarketingUrl("/") },
  { label: "Features", href: buildMarketingUrl(buildPlatformPathWithMarketing("/features")) },
  { label: "Pricing", href: buildMarketingUrl(buildPlatformPathWithMarketing("/pricing")) },
  { label: "Contact", href: buildMarketingUrl(buildPlatformPathWithMarketing("/contact")) },
  { label: "Careers", href: buildMarketingUrl("/careers") },
  { label: "Privacy", href: buildMarketingUrl("/privacy") },
  { label: "Terms", href: buildMarketingUrl("/terms") },
];

const PlatformSiteHeader = () => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const currentHref = `${window.location.origin}${location.pathname}`;

  const isActive = (href: string) => {
    const normalizedHref = href.endsWith("/") && href.length > 1 ? href.slice(0, -1) : href;
    const normalizedCurrent = currentHref.endsWith("/") && currentHref.length > 1 ? currentHref.slice(0, -1) : currentHref;
    return normalizedCurrent === normalizedHref;
  };

  return (
    <>
      <div className="w-full bg-amber-500 px-4 py-2 text-center text-sm font-medium text-amber-950">
        🚧 This platform is currently under development. No orders or sign-up requests will be accepted or entertained at this time.
      </div>
    <header className="sticky top-0 z-50 border-b border-primary/20 bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--secondary)/0.45)_100%)] backdrop-blur">
      <div className="container mx-auto flex h-18 items-center justify-between px-4 lg:px-8">
        <a href={buildMarketingUrl("/")} className="flex items-center gap-3">
          <img src="/labshope-logo.jpg" alt="LabShope LIMS" className="h-10 w-auto object-contain" />
        </a>

        <nav className="hidden items-center gap-8 lg:flex">
          {navItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={cn(
                "text-sm font-medium transition hover:text-primary",
                isActive(item.href) ? "text-primary" : "text-foreground/80",
              )}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open site navigation">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[88vw] max-w-sm">
              <div className="mt-10 flex flex-col gap-5">
                <div>
                  <img src="/labshope-logo.jpg" alt="LabShope LIMS" className="h-10 w-auto object-contain" />
                </div>
                <nav className="flex flex-col gap-4">
                  {navItems.map((item) => (
                    <div key={item.label}>
                      <SheetClose asChild>
                        <a
                          href={item.href}
                          className={cn(
                            "rounded-xl px-3 py-2 text-base font-medium transition hover:bg-secondary hover:text-primary",
                            isActive(item.href) ? "bg-secondary text-primary" : "text-foreground",
                          )}
                        >
                          {item.label}
                        </a>
                      </SheetClose>
                    </div>
                  ))}
                </nav>
                <div className="mt-4 flex flex-col gap-3">
                  <SheetClose asChild>
                    <a href={buildOperationsUrl("/platform/login")}>
                      <Button variant="outline" className="w-full">Platform Admin</Button>
                    </a>
                  </SheetClose>
                  <SheetClose asChild>
                    <a href={buildMarketingUrl(buildPlatformPathWithMarketing("/start"))}>
                      <Button variant="clinical" className="w-full">Get Started</Button>
                    </a>
                  </SheetClose>
                  <SheetClose asChild>
                    <a href={buildOperationsUrl("/auth/staff")}>
                      <Button variant="outline" className="w-full">Staff Login</Button>
                    </a>
                  </SheetClose>
                  <SheetClose asChild>
                    <a href={buildMarketingUrl(buildPlatformPathWithMarketing("/book-demo"))}>
                      <Button variant="heroOutline" className="w-full">Book Demo</Button>
                    </a>
                  </SheetClose>
                </div>
              </div>
            </SheetContent>
          </Sheet>
          <a href={buildOperationsUrl("/platform/login")} className="hidden sm:block">
            <Button variant="outline" size="sm">Platform Admin</Button>
          </a>
          <a href={buildOperationsUrl("/auth/staff")} className="hidden sm:block">
            <Button variant="outline" size="sm">Staff Login</Button>
          </a>
          <a href={buildMarketingUrl(buildPlatformPathWithMarketing("/book-demo"))} className="hidden sm:block">
            <Button variant="heroOutline" size="sm">Book Demo</Button>
          </a>
          <a href={buildMarketingUrl(buildPlatformPathWithMarketing("/start"))}>
            <Button variant="clinical" size="sm">Get Started</Button>
          </a>
        </div>
      </div>
    </header>
    </>
  );
};

export default PlatformSiteHeader;
