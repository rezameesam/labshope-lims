import { motion } from "framer-motion";
import { CheckCircle2, Users, Award, Clock } from "lucide-react";
import logo from "@/assets/logo.png";
import { useOrganization } from "@/contexts/OrganizationContext";

const highlights = [
  "State-of-the-art laboratory equipment",
  "Experienced pathologists and technicians",
  "NABL standards compliance",
  "Quick and accurate test results",
  "Affordable pricing for all",
  "Home sample collection available",
];

const stats = [
  { icon: Users, value: "50,000+", label: "Patients Served" },
  { icon: Award, value: "29+", label: "Years Experience" },
  { icon: Clock, value: "24hrs", label: "Result Delivery" },
];

const AboutSection = () => {
  const { branding } = useOrganization();

  return (
    <section id="about" className="scroll-mt-24 bg-subtle-gradient py-20 lg:py-28">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Content */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block px-4 py-1.5 rounded-full bg-secondary text-secondary-foreground text-sm font-medium mb-4">
              About Us
            </span>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-heading font-bold text-foreground mb-6">
              Trusted Healthcare{" "}
              <span className="text-primary">{`Since ${branding.establishedYear}`}</span>
            </h2>
            <p className="text-muted-foreground text-lg mb-6 leading-relaxed">
              {`${branding.displayName} was established in ${branding.establishedYear} with a vision to provide accurate and affordable pathological diagnostic services${branding.locationLabel ? ` in ${branding.locationLabel}` : ""}.`}
            </p>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              Over the years, we have grown into a trusted diagnostic centre, serving patients with a commitment to quality, accuracy, and compassionate care.
            </p>

            {/* Highlights */}
            <div className="grid sm:grid-cols-2 gap-3 mb-8">
              {highlights.map((highlight, index) => (
                <motion.div
                  key={highlight}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center gap-2"
                >
                  <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                  <span className="text-foreground text-sm">{highlight}</span>
                </motion.div>
              ))}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              {stats.map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 + index * 0.1 }}
                  className="text-center p-4 bg-card rounded-xl border border-border shadow-sm"
                >
                  <stat.icon className="h-6 w-6 text-primary mx-auto mb-2" />
                  <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Right Visual */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            <div className="relative bg-card rounded-2xl p-8 lg:p-12 shadow-xl border border-border">
              {/* Logo Display */}
              <div className="flex flex-col items-center text-center">
                <motion.img
                  src={branding.logoUrl || logo}
                  alt={`${branding.displayName} Logo`}
                  className="w-48 h-48 lg:w-64 lg:h-64 mb-6"
                  animate={{ rotate: [0, 2, 0, -2, 0] }}
                  transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                />
                <h3 className="text-2xl lg:text-3xl font-heading font-bold text-clinical-navy mb-2">
                  {branding.displayName}
                </h3>
                <p className="text-muted-foreground font-medium">
                  {`Established ${branding.establishedYear}`}
                </p>
                <div className="mt-6 px-6 py-3 bg-secondary rounded-full">
                  <p className="text-sm text-secondary-foreground font-medium">
                    Your Trusted Diagnostic Partner
                  </p>
                </div>
              </div>
            </div>

            {/* Decorative Elements */}
            <div className="absolute -top-4 -right-4 w-24 h-24 bg-primary/10 rounded-full blur-2xl" />
            <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-clinical-teal/10 rounded-full blur-2xl" />
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
