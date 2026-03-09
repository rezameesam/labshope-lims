import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { MapPin, Phone, Mail, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface Lab {
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
}

const ContactSection = () => {
  const [lab, setLab] = useState<Lab | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMainLab();
  }, []);

  const fetchMainLab = async () => {
    try {
      // Fetch the main lab (type = 'main')
      const { data, error } = await supabase
        .from("labs")
        .select("address, city, state, pincode, phone, email")
        .eq("type", "main")
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 is "not found" - that's okay, we'll use defaults
        console.error("Error fetching lab:", error);
      }

      if (data) {
        setLab(data);
      }
    } catch (error) {
      console.error("Error fetching lab:", error);
    } finally {
      setLoading(false);
    }
  };

  // Generate Google Maps embed URL
  const getMapUrl = () => {
    // Use the exact embed URL from Google Maps for IRM Clinical Laboratory
    // This is the most accurate embed URL with place information
    // Coordinates: 34.0166940731705, 74.71822307563335
    const irmLabEmbedUrl = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3307.0590933298504!2d74.71822307563335!3d34.0166940731705!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x38e19111ec877e3b%3A0xf2ba762566daa3b4!2sIRM%20Clinical%20Laboratory!5e0!3m2!1sen!2sin!4v1767269360513!5m2!1sen!2sin";
    
    if (lab?.address || lab?.city) {
      // Build address-based search if we have address info
      const addressParts = [
        lab.address,
        lab.city,
        lab.state,
        lab.pincode,
      ].filter(Boolean);
      const address = encodeURIComponent(addressParts.join(", "));
      return `https://www.google.com/maps?q=${address}&hl=en&z=15&output=embed`;
    }
    // Default: Use the exact IRM Clinical Laboratory embed URL
    return irmLabEmbedUrl;
  };

  // Build contact info from lab data or use defaults
  const contactInfo = [
    {
      icon: MapPin,
      title: "Address",
      details: lab?.address && lab?.city
        ? [
            lab.address,
            `${lab.city}${lab.state ? `, ${lab.state}` : ""}`,
            lab.pincode || "",
          ].filter(Boolean)
        : ["Old Post Office Building", "Budgam, Jammu and Kashmir", "191111"],
    },
    {
      icon: Phone,
      title: "Phone",
      details: lab?.phone
        ? lab.phone.split(",").map((p) => p.trim())
        : ["9419034607", "9622635767"],
      isPhone: true,
    },
    {
      icon: Mail,
      title: "Email",
      details: lab?.email ? [lab.email] : ["irmclinic@gmail.com"],
      isEmail: true,
    },
    {
      icon: Clock,
      title: "Working Hours",
      details: ["Mon - Sat: 8:00 AM - 8:00 PM", "Sunday: 9:00 AM - 2:00 PM"],
    },
  ];

  return (
    <section id="contact" className="scroll-mt-24 bg-background py-20 lg:py-28">
      <div className="container mx-auto px-4 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-block px-4 py-1.5 rounded-full bg-secondary text-secondary-foreground text-sm font-medium mb-4"
          >
            Contact Us
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-3xl md:text-4xl lg:text-5xl font-heading font-bold text-foreground mb-4"
          >
            Get in <span className="text-primary">Touch</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-muted-foreground text-lg"
          >
            Have questions or need to book a test? We're here to help.
          </motion.p>
        </div>

        {/* Contact Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {contactInfo.map((info, index) => (
            <motion.div
              key={info.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="bg-card rounded-xl p-6 shadow-md border border-border text-center hover:shadow-lg transition-shadow"
            >
              <div className="inline-flex p-3 rounded-full bg-primary/10 text-primary mb-4">
                <info.icon className="h-6 w-6" />
              </div>
              <h3 className="font-heading font-semibold text-foreground mb-3">
                {info.title}
              </h3>
              <div className="space-y-1">
                {info.details.map((detail, i) => (
                  <p key={i} className="text-muted-foreground text-sm">
                    {info.isPhone ? (
                      <a
                        href={`tel:${detail}`}
                        className="hover:text-primary transition-colors"
                      >
                        {detail}
                      </a>
                    ) : info.isEmail ? (
                      <a
                        href={`mailto:${detail}`}
                        className="hover:text-primary transition-colors"
                      >
                        {detail}
                      </a>
                    ) : (
                      detail
                    )}
                  </p>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Map Embed */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="rounded-2xl overflow-hidden shadow-lg border border-border"
        >
          <iframe
            src={getMapUrl()}
            width="100%"
            height="400"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title="IRM Clinical Laboratory Location"
            className="w-full"
          />
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-12 text-center"
        >
          <p className="text-muted-foreground mb-4">
            Ready to book your test or have questions?
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="tel:9419034607">
              <Button variant="clinical" size="lg">
                <Phone className="h-4 w-4" />
                Call Now
              </Button>
            </a>
            <a href="mailto:irmclinic@gmail.com">
              <Button variant="outline" size="lg">
                <Mail className="h-4 w-4" />
                Send Email
              </Button>
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default ContactSection;
