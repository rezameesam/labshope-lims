import { motion } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { ArrowRight, BadgeCheck, BriefcaseBusiness, Clock3, ExternalLink, FlaskConical, Phone, Stethoscope } from "lucide-react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/contexts/OrganizationContext";
import PlatformCareersPage from "@/components/platform/PlatformCareersPage";
import { usePublicPageMode } from "@/hooks/usePublicPageMode";
import InvalidTenantPage from "@/components/platform/InvalidTenantPage";

const applicationLink = "https://forms.gle/KRNCJz9TfzCgkaKE9";

const opportunityTypes = [
  {
    title: "Full-Time Roles",
    description:
      "Join our laboratory team in a dedicated full-time capacity and support day-to-day diagnostic operations.",
  },
  {
    title: "Part-Time Shifts",
    description:
      "Flexible scheduling for qualified candidates who want to contribute while balancing other commitments.",
  },
  {
    title: "Extra-Income Opportunities",
    description:
      "Suitable for experienced professionals looking for additional laboratory work and flexible earning options.",
  },
];

const qualifications = ["DMLT", "BMLT", "MLT", "Related lab technician diplomas or degrees"];

const Careers = () => {
  const { loading, platformMode, invalidTenantHost, hostname } = usePublicPageMode();
  const { branding } = useOrganization();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">Loading...</div></div>;
  }

  if (invalidTenantHost) {
    return <InvalidTenantPage hostname={hostname} />;
  }

  if (platformMode) {
    return <PlatformCareersPage />;
  }

  const reasonsToApply = [
    `Work with a trusted diagnostic laboratory${branding.establishedYear ? ` serving patients since ${branding.establishedYear}` : ""}.`,
    "Contribute to patient care in a professional, healthcare-focused environment.",
    "Explore flexible opportunities for part-time, full-time, or additional income.",
  ];
  return (
    <>
      <Helmet>
        <title>{`Work With Us | ${branding.displayName}`}</title>
        <meta
          name="description"
          content={`Apply to join ${branding.displayName}. We welcome qualified lab technician diploma and degree holders for full-time, part-time, and flexible opportunities.`}
        />
      </Helmet>

      <div className="min-h-screen bg-background">
        <Navbar />

        <main>
          <section className="relative overflow-hidden pt-28 pb-16 lg:pt-36 lg:pb-24">
            <div className="absolute inset-0 bg-hero-gradient" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_35%)]" />
            <div className="absolute bottom-0 left-0 right-0 h-28 bg-gradient-to-t from-background to-transparent" />

            <div className="container relative z-10 mx-auto px-4 lg:px-8">
              <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:items-center">
                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                >
                  <span className="mb-6 inline-flex rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-2 text-sm font-medium text-primary-foreground">
                    Careers at {branding.displayName}
                  </span>
                  <h1 className="max-w-3xl text-4xl font-bold leading-tight text-primary-foreground md:text-5xl lg:text-6xl">
                    Work With Us
                  </h1>
                  <p className="mt-6 max-w-3xl text-lg leading-8 text-primary-foreground/85 md:text-xl">
                    {branding.displayName} is inviting qualified and motivated
                    candidates to apply for opportunities with our team. If you
                    hold a lab technician diploma or degree and are interested
                    in working with us, including part-time or flexible
                    opportunities to earn extra income, we would love to hear
                    from you.
                  </p>

                  <div className="mt-8 flex flex-wrap gap-3">
                    {reasonsToApply.map((item) => (
                      <div
                        key={item}
                        className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-2 text-sm text-primary-foreground"
                      >
                        <BadgeCheck className="h-4 w-4" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                    <Button asChild variant="hero" size="xl">
                      <a href={applicationLink} target="_blank" rel="noopener noreferrer">
                        Apply Now
                        <ExternalLink className="h-5 w-5" />
                      </a>
                    </Button>
                    <Button asChild variant="heroOutline" size="xl">
                      <a href={`tel:${branding.primaryPhone}`}>
                        Speak With Our Team
                        <Phone className="h-5 w-5" />
                      </a>
                    </Button>
                  </div>
                </motion.div>

                <motion.aside
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.15 }}
                  className="rounded-3xl border border-white/15 bg-white/10 p-6 shadow-xl backdrop-blur-md lg:p-8"
                >
                  <div className="flex items-center gap-3 text-primary-foreground">
                    <div className="rounded-2xl bg-white/15 p-3">
                      <FlaskConical className="h-6 w-6" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-semibold">Who Should Apply</h2>
                      <p className="text-sm text-primary-foreground/75">Qualified lab professionals and motivated candidates</p>
                    </div>
                  </div>

                  <div className="mt-6 space-y-4">
                    <div className="rounded-2xl bg-white/10 p-5">
                      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary-foreground/70">
                        Eligible Qualifications
                      </p>
                      <ul className="mt-4 space-y-3 text-primary-foreground/90">
                        {qualifications.map((qualification) => (
                          <li key={qualification} className="flex items-start gap-3">
                            <BadgeCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
                            <span>{qualification}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-2xl bg-white/10 p-5">
                      <div className="flex items-center gap-3">
                        <Clock3 className="h-5 w-5 text-primary-foreground" />
                        <div>
                          <p className="font-semibold text-primary-foreground">Application review</p>
                          <p className="text-sm text-primary-foreground/75">
                            Selected candidates will be contacted after review.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.aside>
              </div>
            </div>
          </section>

          <section className="bg-background py-16 lg:py-24">
            <div className="container mx-auto px-4 lg:px-8">
              <div className="mx-auto max-w-3xl text-center">
                <span className="inline-flex rounded-full bg-secondary px-4 py-1.5 text-sm font-medium text-secondary-foreground">
                  Opportunity Types
                </span>
                <h2 className="mt-4 text-3xl font-bold text-foreground md:text-4xl">
                  Flexible roles for qualified laboratory professionals
                </h2>
                <p className="mt-4 text-lg text-muted-foreground">
                  We welcome applications from candidates who want to build a career with us or contribute through flexible work arrangements.
                </p>
              </div>

              <div className="mt-12 grid gap-6 md:grid-cols-3">
                {opportunityTypes.map((opportunity, index) => (
                  <motion.article
                    key={opportunity.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.08 }}
                    className="rounded-2xl border border-border bg-card-gradient p-6 shadow-md"
                  >
                    <div className="inline-flex rounded-2xl bg-primary/10 p-3 text-primary">
                      <BriefcaseBusiness className="h-6 w-6" />
                    </div>
                    <h3 className="mt-5 text-2xl font-semibold text-foreground">{opportunity.title}</h3>
                    <p className="mt-3 leading-7 text-muted-foreground">{opportunity.description}</p>
                  </motion.article>
                ))}
              </div>
            </div>
          </section>

          <section className="bg-subtle-gradient py-16 lg:py-24">
            <div className="container mx-auto px-4 lg:px-8">
              <div className="grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  className="rounded-3xl border border-border bg-card p-8 shadow-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                      <Stethoscope className="h-6 w-6" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-semibold text-foreground">Why {branding.displayName}</h2>
                      <p className="text-sm text-muted-foreground">A trusted healthcare and diagnostic environment</p>
                    </div>
                  </div>

                  <p className="mt-6 leading-7 text-muted-foreground">
                    {branding.displayName} has been serving patients with
                    dependable diagnostic practices and patient-focused service.
                    We value professionalism, accuracy, and clear communication
                    across every role in our laboratory operations.
                  </p>

                  <ul className="mt-6 space-y-4">
                    {reasonsToApply.map((reason) => (
                      <li key={reason} className="flex items-start gap-3">
                        <BadgeCheck className="mt-1 h-5 w-5 flex-shrink-0 text-success" />
                        <span className="text-foreground">{reason}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  className="rounded-3xl bg-clinical-navy p-8 text-primary-foreground shadow-xl lg:p-10"
                >
                  <span className="inline-flex rounded-full border border-primary-foreground/15 bg-primary-foreground/10 px-4 py-1.5 text-sm font-medium">
                    Ready to apply?
                  </span>
                  <h2 className="mt-4 text-3xl font-bold">Submit your details through our application form</h2>
                  <p className="mt-4 max-w-2xl leading-7 text-primary-foreground/75">
                    Use the application form to share your qualification, experience, and preferred work type. The form opens in Google Forms and can be completed on mobile or desktop.
                  </p>

                  <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                    <Button asChild variant="hero" size="xl">
                      <a href={applicationLink} target="_blank" rel="noopener noreferrer">
                        Apply Now
                        <ArrowRight className="h-5 w-5" />
                      </a>
                    </Button>
                    <Button asChild variant="heroOutline" size="xl">
                      <Link to="/">
                        Back to Home
                      </Link>
                    </Button>
                  </div>
                </motion.div>
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default Careers;
