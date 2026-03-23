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
    <section id="about" className="scroll-mt-24 bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--secondary)/0.22)_100%)] py-20 lg:py-28">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid items-start gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45 }}
            className="rounded-3xl border border-primary/20 bg-card/90 p-7 shadow-sm dark:bg-card"
          >
            <span className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              About Us
            </span>

            <h2 className="mt-4 text-3xl font-heading font-bold text-foreground md:text-4xl lg:text-5xl">
              Trusted Healthcare <span className="text-primary">Since {branding.establishedYear}</span>
            </h2>

            <p className="mt-5 text-base leading-8 text-muted-foreground md:text-lg">
              {`${branding.displayName} was established in ${branding.establishedYear} with a vision to provide accurate and affordable pathological diagnostic services${branding.locationLabel ? ` in ${branding.locationLabel}` : ""}.`}
            </p>
            <p className="mt-4 text-base leading-8 text-muted-foreground md:text-lg">
              Over the years, we have grown into a trusted diagnostic centre, serving patients with a commitment to quality, accuracy, and compassionate care.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {highlights.map((highlight, index) => (
                <motion.div
                  key={highlight}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.03 }}
                  className="flex items-start gap-2 rounded-xl border border-primary/15 bg-background/80 px-3 py-2.5 dark:bg-background/40"
                >
                  <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-primary" />
                  <span className="text-sm leading-6 text-foreground/90">{highlight}</span>
                </motion.div>
              ))}
            </div>

            <div className="mt-8 grid grid-cols-3 gap-3">
              {stats.map((stat, index) => (
                <motion.article
                  key={stat.label}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.08 + index * 0.06 }}
                  className="rounded-2xl border border-primary/15 bg-background/90 p-4 text-center dark:bg-background/50"
                >
                  <stat.icon className="mx-auto mb-2 h-5 w-5 text-primary" />
                  <p className="text-xl font-heading font-bold text-foreground md:text-2xl">{stat.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
                </motion.article>
              ))}
            </div>
          </motion.div>

          <motion.aside
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, delay: 0.08 }}
            className="rounded-3xl border border-primary/20 bg-[linear-gradient(180deg,hsl(var(--card))_0%,hsl(var(--secondary)/0.24)_100%)] p-7 shadow-sm lg:sticky lg:top-28"
          >
            <div className="mx-auto flex max-w-sm flex-col items-center text-center">
              <img
                src={branding.logoUrl || logo}
                alt={`${branding.displayName} Logo`}
                className="mb-5 h-36 w-36 rounded-2xl border border-primary/20 bg-background/60 p-3 object-contain md:h-44 md:w-44"
              />
              <h3 className="text-2xl font-heading font-bold text-foreground">{branding.displayName}</h3>
              <p className="mt-1 text-sm text-muted-foreground">Established {branding.establishedYear}</p>

              <div className="mt-6 w-full rounded-2xl border border-primary/20 bg-primary/10 px-5 py-4 dark:bg-primary/15">
                <p className="text-sm font-semibold text-primary dark:text-primary-foreground">Your Trusted Diagnostic Partner</p>
              </div>
            </div>
          </motion.aside>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
