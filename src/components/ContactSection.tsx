import { motion } from "framer-motion";
import { MapPin, Phone, Mail, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/contexts/OrganizationContext";

const ContactSection = () => {
  const { branding, primaryLab } = useOrganization();

  // Generate Google Maps embed URL (prefer explicit coordinates over geocoded address)
  const getMapUrl = () => {
    const rawSettings =
      primaryLab?.settings && typeof primaryLab.settings === "object"
        ? (primaryLab.settings as Record<string, unknown>)
        : {};

    const latitude = Number(rawSettings.map_latitude);
    const longitude = Number(rawSettings.map_longitude);

    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return `https://www.google.com/maps?q=${latitude},${longitude}&hl=en&z=16&output=embed`;
    }

    const addressParts = [
      primaryLab?.address,
      primaryLab?.city,
      primaryLab?.state,
      primaryLab?.pincode,
      ...branding.addressLines,
    ].filter(Boolean);
    const address = encodeURIComponent(addressParts.join(", "));
    return `https://www.google.com/maps?q=${address}&hl=en&z=15&output=embed`;
  };

  // Build contact info from lab data or use defaults
  const contactInfo = [
    {
      icon: MapPin,
      title: "Address",
      details: primaryLab?.address && primaryLab?.city
        ? [
            primaryLab.address,
            `${primaryLab.city}${primaryLab.state ? `, ${primaryLab.state}` : ""}`,
            primaryLab.pincode || "",
          ].filter(Boolean)
        : branding.addressLines,
    },
    {
      icon: Phone,
      title: "Phone",
      details: primaryLab?.phone
        ? primaryLab.phone.split(",").map((p) => p.trim())
        : branding.phoneNumbers,
      isPhone: true,
    },
    {
      icon: Mail,
      title: "Email",
      details: primaryLab?.email ? [primaryLab.email] : [branding.email],
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
            title={`${branding.displayName} Location`}
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
            <a href={`tel:${branding.primaryPhone}`}>
              <Button variant="clinical" size="lg">
                <Phone className="h-4 w-4" />
                Call Now
              </Button>
            </a>
            <a href={`mailto:${branding.email}`}>
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
