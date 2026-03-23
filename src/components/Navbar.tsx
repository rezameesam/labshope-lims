import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Phone, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.png";
import { useOrganization } from "@/contexts/OrganizationContext";

const navLinks = [
  { name: "Home", href: "/" },
  { name: "Book Test", href: "/book-test" },
  { name: "Services", href: "/#services" },
  { name: "About", href: "/#about" },
  { name: "Work With Us", href: "/careers" },
  { name: "Contact", href: "/#contact" },
];

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const { branding } = useOrganization();

  const isActiveLink = (href: string) => {
    if (href === "/") {
      return location.pathname === "/" && !location.hash;
    }

    if (href.startsWith("/#")) {
      return location.pathname === "/" && location.hash === href.replace("/", "");
    }

    return location.pathname === href;
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-primary/20 bg-card/90 backdrop-blur-md shadow-sm dark:bg-background/85">
      <nav className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3">
            <img src={branding.logoUrl || logo} alt={branding.displayName} className="h-14 w-14" />
            <div className="hidden sm:block">
              <h1 className="text-lg font-heading font-bold text-foreground leading-tight dark:text-white">
                {branding.shortName}
              </h1>
              <p className="text-xs text-muted-foreground">{branding.secondaryLabel}</p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                to={link.href}
                onClick={() => setIsOpen(false)}
                className={`font-medium transition-colors duration-200 ${
                  isActiveLink(link.href) ? "text-primary" : "text-foreground/80 hover:text-primary"
                }`}
              >
                {link.name}
              </Link>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden lg:flex items-center gap-3">
            <a href={`tel:${branding.primaryPhone}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
              <Phone className="h-4 w-4" />
              <span>{branding.primaryPhone}</span>
            </a>
            <Link to="/auth/staff">
              <Button variant="outline" size="sm">
                <Users className="h-4 w-4" />
                Staff
              </Button>
            </Link>
            <Link to="/auth/patient">
              <Button variant="clinical" size="sm">
                <User className="h-4 w-4" />
                Patient
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="lg:hidden p-2 text-foreground"
            aria-label="Toggle menu"
          >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden border-t border-border"
            >
              <div className="py-4 space-y-3">
                {navLinks.map((link) => (
                  <Link
                    key={link.name}
                    to={link.href}
                    onClick={() => setIsOpen(false)}
                    className={`block rounded-lg px-4 py-2 transition-colors ${
                      isActiveLink(link.href)
                        ? "bg-secondary text-secondary-foreground"
                        : "text-foreground hover:bg-accent"
                    }`}
                  >
                    {link.name}
                  </Link>
                ))}
                <div className="pt-3 px-4 space-y-3 border-t border-border">
                  <a
                    href={`tel:${branding.primaryPhone}`}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <Phone className="h-4 w-4" />
                    <span>{branding.primaryPhone}</span>
                  </a>
                  <div className="flex gap-2">
                    <Link to="/auth/staff" className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        <Users className="h-4 w-4" />
                        Staff
                      </Button>
                    </Link>
                    <Link to="/auth/patient" className="flex-1">
                      <Button variant="clinical" size="sm" className="w-full">
                        <User className="h-4 w-4" />
                        Patient
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </header>
  );
};

export default Navbar;
