import { motion } from "framer-motion";
import { ArrowRight, Shield, Clock, Award } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const features = [
  { icon: Shield, text: "Accurate Results" },
  { icon: Clock, text: "Quick Turnaround" },
  { icon: Award, text: "Since 1996" },
];

const HeroSection = () => {
  return (
    <section className="relative min-h-screen flex items-center pt-20 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-hero-gradient" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent_50%)]" />
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
              Trusted Diagnostic Centre in Budgam
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-heading font-bold text-primary-foreground leading-tight mb-6"
          >
            Your Health,{" "}
            <span className="text-accent">Our Priority</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg md:text-xl text-primary-foreground/80 max-w-2xl mb-8"
          >
            IRM Clinical Laboratory has been providing accurate and reliable pathological 
            diagnostic services to the people of Budgam and Kashmir since 1996. 
            Experience trusted healthcare with modern technology.
          </motion.p>

          {/* Features Pills */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-wrap gap-4 mb-10"
          >
            {features.map((feature, index) => (
              <div
                key={feature.text}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary-foreground/10 text-primary-foreground border border-primary-foreground/20"
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
        <div className="w-64 h-64 rounded-full bg-primary-foreground/5 blur-3xl" />
      </motion.div>
    </section>
  );
};

export default HeroSection;
