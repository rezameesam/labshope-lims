import { Menu } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { buildPlatformPathWithMarketing } from "@/lib/platformMarketing";
import { platformBranding } from "@/lib/platformBranding";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";

const navItems = [
  { label: "Home", to: "/" },
  { label: "Features", to: buildPlatformPathWithMarketing("/features") },
  { label: "Pricing", to: buildPlatformPathWithMarketing("/pricing") },
  { label: "Contact", to: buildPlatformPathWithMarketing("/contact") },
  { label: "Careers", to: "/careers" },
  { label: "Privacy", to: "/privacy" },
  { label: "Terms", to: "/terms" },
];

const PlatformSiteHeader = () => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (to: string) => {
    if (to === "/") {
      return location.pathname === "/";
    }

    return location.pathname === to;
  };

  return (
    <>
      <div className="w-full bg-amber-500 px-4 py-2 text-center text-sm font-medium text-amber-950">
        🚧 This platform is currently under development. No orders or sign-up requests will be accepted or entertained at this time.
      </div>
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/95 backdrop-blur">
      <div className="container mx-auto flex h-18 items-center justify-between px-4 lg:px-8">
        <Link to="/" className="flex items-center gap-3">
          <img src="/labshope-logo.jpg" alt="LabShope LIMS" className="h-10 w-auto object-contain" />
        </Link>

        <nav className="hidden items-center gap-8 lg:flex">
          {navItems.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className={cn(
                "text-sm font-medium transition hover:text-primary",
                isActive(item.to) ? "text-primary" : "text-foreground/80",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
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
                    <SheetClose asChild key={item.label}>
                      <Link
                        to={item.to}
                        className={cn(
                          "rounded-xl px-3 py-2 text-base font-medium transition hover:bg-secondary hover:text-primary",
                          isActive(item.to) ? "bg-secondary text-primary" : "text-foreground",
                        )}
                      >
                        {item.label}
                      </Link>
                    </SheetClose>
                  ))}
                </nav>
                <div className="mt-4 flex flex-col gap-3">
                  <SheetClose asChild>
                    <Link to="/platform/login">
                      <Button variant="outline" className="w-full">Platform Admin</Button>
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link to={buildPlatformPathWithMarketing("/start")}>
                      <Button variant="clinical" className="w-full">Get Started</Button>
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link to="/auth/staff">
                      <Button variant="outline" className="w-full">Staff Login</Button>
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link to={buildPlatformPathWithMarketing("/book-demo")}>
                      <Button variant="outline" className="w-full">Book Demo</Button>
                    </Link>
                  </SheetClose>
                </div>
              </div>
            </SheetContent>
          </Sheet>
          <Link to="/platform/login" className="hidden sm:block">
            <Button variant="outline" size="sm">Platform Admin</Button>
          </Link>
          <Link to="/auth/staff" className="hidden sm:block">
            <Button variant="outline" size="sm">Staff Login</Button>
          </Link>
          <Link to={buildPlatformPathWithMarketing("/book-demo")} className="hidden sm:block">
            <Button variant="outline" size="sm">Book Demo</Button>
          </Link>
          <Link to={buildPlatformPathWithMarketing("/start")}>
            <Button variant="clinical" size="sm">Get Started</Button>
          </Link>
        </div>
      </div>
    </header>
    </>
  );
};

export default PlatformSiteHeader;
