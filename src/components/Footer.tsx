import { Link } from "react-router-dom";
import { Phone, Mail, MapPin } from "lucide-react";
import logo from "@/assets/logo.png";
import { useOrganization } from "@/contexts/OrganizationContext";

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const { branding } = useOrganization();

  return (
    <footer className="bg-clinical-navy text-primary-foreground">
      <div className="container mx-auto px-4 lg:px-8 py-12 lg:py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand */}
          <div>
            <Link to="/" className="flex items-center gap-3 mb-4">
              <img src={branding.logoUrl || logo} alt={branding.displayName} className="h-12 w-12" />
              <div>
                <h3 className="font-heading font-bold text-lg">{branding.shortName}</h3>
                <p className="text-sm text-primary-foreground/70">{branding.secondaryLabel}</p>
              </div>
            </Link>
            <p className="text-primary-foreground/70 text-sm leading-relaxed">
              {`${branding.displayName} is your trusted diagnostic partner${branding.locationLabel ? ` in ${branding.locationLabel}` : ""}, serving the community with accurate and reliable test results since ${branding.establishedYear}.`}
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-heading font-semibold text-lg mb-4">Quick Links</h4>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/#services"
                  className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm"
                >
                  Our Services
                </Link>
              </li>
              <li>
                <Link
                  to="/#about"
                  className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm"
                >
                  About Us
                </Link>
              </li>
              <li>
                <Link
                  to="/#contact"
                  className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm"
                >
                  Contact
                </Link>
              </li>
              <li>
                <Link
                  to="/careers"
                  className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm"
                >
                  Work With Us
                </Link>
              </li>
              <li>
                <Link
                  to="/auth/patient"
                  className="text-primary-foreground/70 hover:text-primary-foreground transition-colors text-sm"
                >
                  Patient Portal
                </Link>
              </li>
            </ul>
          </div>

          {/* Services */}
          <div>
            <h4 className="font-heading font-semibold text-lg mb-4">Our Services</h4>
            <ul className="space-y-2 text-sm text-primary-foreground/70">
              <li>Haematology</li>
              <li>Biochemistry</li>
              <li>Urine Examination</li>
              <li>Hepatitis B Testing</li>
              <li>Immunology</li>
              <li>Cardiac Markers</li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-heading font-semibold text-lg mb-4">Contact Info</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3 text-primary-foreground/70">
                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{branding.addressLines.join(", ")}</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="h-4 w-4 flex-shrink-0" />
                <div className="text-primary-foreground/70">
                  {branding.phoneNumbers.map((phone, index) => (
                    <span key={phone}>
                      {index > 0 ? " / " : null}
                      <a href={`tel:${phone}`} className="hover:text-primary-foreground transition-colors">
                        {phone}
                      </a>
                    </span>
                  ))}
                </div>
              </li>
              <li className="flex items-center gap-3 text-primary-foreground/70">
                <Mail className="h-4 w-4 flex-shrink-0" />
                <a href={`mailto:${branding.email}`} className="hover:text-primary-foreground transition-colors">
                  {branding.email}
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 pt-8 border-t border-primary-foreground/10 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-primary-foreground/60">
            © {currentYear} {branding.displayName}. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm text-primary-foreground/60">
            <Link to="/privacy" className="hover:text-primary-foreground transition-colors">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-primary-foreground transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
