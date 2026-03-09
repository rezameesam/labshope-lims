import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import ServicesSection from "@/components/ServicesSection";
import AboutSection from "@/components/AboutSection";
import ContactSection from "@/components/ContactSection";
import Footer from "@/components/Footer";

const Index = () => {
  const location = useLocation();

  useEffect(() => {
    const sectionId = location.hash.replace("#", "");

    if (!sectionId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);

    return () => window.clearTimeout(timeoutId);
  }, [location.hash]);

  return (
    <>
      <Helmet>
        <title>IRM Clinical Laboratory | Trusted Diagnostic Centre in Budgam, J&K</title>
        <meta
          name="description"
          content="IRM Clinical Laboratory - Your trusted pathological diagnostic centre in Budgam since 1996. Expert blood tests including haematology, biochemistry, immunology & more."
        />
      </Helmet>
      
      <div className="min-h-screen bg-background">
        <Navbar />
        <main>
          <HeroSection />
          <ServicesSection />
          <AboutSection />
          <ContactSection />
        </main>
        <Footer />
      </div>
    </>
  );
};

export default Index;
