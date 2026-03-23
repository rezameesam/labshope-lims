import { motion } from "framer-motion";
import { ArrowRight, Shield, Clock, Award } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/contexts/OrganizationContext";

const features = [
  { icon: Shield, text: "Accurate Results" },
  { icon: Clock, text: "Quick Turnaround" },
  { icon: Award, text: "Trusted Care" },
];

const HeroSection = () => {
  const { branding } = useOrganization();
  const featuresWithBranding = [
    features[0],
    features[1],
    { icon: Award, text: `Since ${branding.establishedYear}` },
  ];

  return (
    <section className="relative min-h-screen flex items-center pt-20 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-hero-gradient" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.14),transparent_50%)] dark:bg-[radial-gradient(circle_at_30%_50%,rgba(56,189,248,0.18),transparent_55%)]" />
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />

      {/* Content */}
      <div className="container relative z-10 mx-auto px-4 lg:px-8 py-16 lg:py-24">
        <div className="max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block px-4 py-2 rounded-full bg-primary-foreground/10 text-primary-foreground text-sm font-medium mb-6 border border-primary-foreground/20">
              {`Trusted Diagnostic Centre${branding.locationLabel ? ` in ${branding.locationLabel}` : ""}`}
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-6 text-4xl font-heading font-bold leading-tight text-white md:text-5xl lg:text-6xl xl:text-7xl"
          >
            Your Health,{" "}
            <span className="text-cyan-200">Our Priority</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg md:text-xl text-primary-foreground/90 max-w-2xl mb-8"
          >
            {branding.description} Experience trusted healthcare with modern diagnostic support.
          </motion.p>

          {/* Features Pills */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-wrap gap-4 mb-10"
          >
            {featuresWithBranding.map((feature) => (
              <div
                key={feature.text}
                className="flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-white dark:border-cyan-300/40 dark:bg-cyan-400/15"
              >
                <feature.icon className="h-4 w-4" />
                <span className="text-sm font-medium">{feature.text}</span>
              </div>
            ))}
          </motion.div>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex flex-col sm:flex-row gap-4"
          >
            <Link to="/book-test">
              <Button variant="hero" size="xl">
                Book Test Now
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <Button
              variant="heroOutline"
              size="xl"
              onClick={() => {
                document.getElementById("services")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              View Services
            </Button>
          </motion.div>
        </div>
      </div>

      {/* Floating Elements */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.5 }}
        className="absolute right-10 top-1/3 hidden xl:block"
      >
        <div className="w-64 h-64 rounded-full bg-primary-foreground/10 dark:bg-primary/25 blur-3xl" />
      </motion.div>
    </section>
  );
};

export default HeroSection;
n;
