import { useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowRight, CreditCard, FileText, FlaskConical, Layers3, MessageSquareMore, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildPlatformPathWithMarketing } from "@/lib/platformMarketing";
import { platformBranding } from "@/lib/platformBranding";
import PlatformSiteFooter from "@/components/platform/PlatformSiteFooter";
import PlatformSiteHeader from "@/components/platform/PlatformSiteHeader";
import { buildOperationsUrl } from "@/lib/publicTenant";

const features = [
  {
    icon: Users,
    title: "Patient Management",
    description: "Register patients, maintain history, and keep daily lab operations in one place.",
  },
  {
    icon: FlaskConical,
    title: "Test Workflow",
    description: "Track collections, results, and report readiness without fragmented manual processes.",
  },
  {
    icon: CreditCard,
    title: "Billing And Payments",
    description: "Create invoices, record payments, and monitor dues with cleaner financial visibility.",
  },
  {
    icon: FileText,
    title: "Branded Reports",
    description: "Generate report PDFs that reflect each lab’s identity and operational setup.",
  },
  {
    icon: MessageSquareMore,
    title: "Reminders",
    description: "Send follow-ups, payment reminders, and result notifications through your configured channels.",
  },
  {
    icon: Layers3,
    title: "Multi-Branch Control",
    description: "Manage multiple labs and collection centers under one customer organization.",
  },
];

const plans = [
  {
    name: "Starter",
    summary: "For one lab with up to 10 active staff and 25,000 patients.",
    items: ["1 lab · 10 active staff · 25,000 patients", "Core patient, test, billing, and report workflows", "Patient portal and standard notifications"],
  },
  {
    name: "Growth",
    summary: "For labs scaling across branches with higher patient volume.",
    items: ["Up to 10 labs · 100 active staff · 300,000 patients", "Inventory, doctor referrals, custom roles, and branding", "Branch-aware workflows and centralized reporting"],
  },
  {
    name: "Premium",
    summary: "For larger rollouts needing fewer limits and more implementation support.",
    items: ["Higher capacity beyond Growth plan limits", "Priority onboarding, migration support, and custom templates", "White-label, rollout coordination, and premium support paths"],
  },
];

const trustSignals = [
  "Multi-tenant architecture for separate lab customers",
  "Patient portal, billing, and branded report workflows",
  "Branch and collection-center support from day one",
];

const heroStats = [
  { value: "1 product", label: "No separate codebase per lab" },
  { value: "1 organization", label: "Per customer lab buyer" },
  { value: "Many labs", label: "Branches and collection centers" },
];

const operatingModel = [
  {
    title: "Platform",
    body: "The root domain markets the software, captures demo requests, and gives you one release path.",
  },
  {
    title: "Organization",
    body: "Each customer diagnostic lab gets its own branding, payments, notifications, reports, and isolated data.",
  },
  {
    title: "Lab Network",
    body: "Each organization can run one lab or many branches and collection centers without leaving the same tenant.",
  },
];

const workflowPreviewCards = [
  {
    eyebrow: "Front Desk",
    title: "Patient intake and queue visibility",
    accent: "bg-emerald-500",
    metrics: [
      ["Patients Today", "42"],
      ["Awaiting Collection", "7"],
      ["Reports Ready", "18"],
    ],
  },
  {
    eyebrow: "Testing",
    title: "Result entry and report readiness",
    accent: "bg-clinical-blue",
    metrics: [
      ["In Processing", "26"],
      ["Pending Validation", "5"],
      ["Released Today", "14"],
    ],
  },
  {
    eyebrow: "Billing",
    title: "Invoices, dues, and collections",
    accent: "bg-amber-500",
    metrics: [
      ["Collected", "Rs 48,200"],
      ["Outstanding", "Rs 9,600"],
      ["Payment Links", "11"],
    ],
  },
];

const faqs = [
  {
    question: "Can each diagnostic lab use its own branding?",
    answer:
      "Yes. Each organization can have its own public site branding, report branding, sender identity, payment configuration, and notification settings.",
  },
  {
    question: "Can one customer manage multiple branches?",
    answer:
      "Yes. The product supports multiple labs and collection centers under one organization, with tenant-aware data separation across customers.",
  },
  {
    question: "Do you help with onboarding and setup?",
    answer:
      "Yes. The intended rollout includes branding setup, branch creation, staff setup, test and pricing configuration, and data import support where needed.",
  },
  {
    question: "Can this work as a white-label product?",
    answer:
      "Yes. The root domain acts as the software product site, while each lab can run its own tenant-branded operational and patient-facing experience.",
  },
];

const selfServeSignals = [
  "Already know your owner/admin contact",
  "Can estimate labs, branches, or collection centers",
  "Know whether import or white-label is needed",
  "Want to move into setup immediately",
];

const ProductLandingPage = () => {
  const contactEmail = useMemo(() => platformBranding.contactEmail, []);

  return (
    <>
      <Helmet>
        <title>{`${platformBranding.productName} | Diagnostic Lab Management Software`}</title>
        <meta
          name="description"
          content="Manage patients, tests, billing, reports, reminders, and branches from one platform built for diagnostic labs."
        />
      </Helmet>

      <div className="min-h-screen bg-background text-foreground">
        <PlatformSiteHeader />

        <main>
          <section className="relative overflow-hidden bg-gradient-to-br from-primary/30 via-secondary/45 to-background dark:from-primary/25 dark:via-secondary/35 dark:to-background">
            
            
            <div className="container relative z-10 mx-auto px-4 py-24 lg:px-8 lg:py-32">
              <div className="grid gap-14 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
                <div className="max-w-3xl">
                  <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
                    <ShieldCheck className="h-4 w-4" />
                    Built for diagnostic labs and growing branch operations
                  </div>
                  <h2 className="font-heading text-4xl font-bold leading-tight text-foreground md:text-6xl">
                    Run Your Diagnostic Lab On One Modern System
                  </h2>
                  <p className="mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
                    Manage patients, tests, billing, reports, reminders, and branches from one platform built for diagnostic labs.
                  </p>
                  <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                    <Link to={buildPlatformPathWithMarketing("/start")}>
                      <Button variant="hero" size="xl">Start Setup</Button>
                    </Link>
                    <Link to={buildPlatformPathWithMarketing("/book-demo")}>
                      <Button variant="heroOutline" size="xl">
                        Book a Demo
                        <ArrowRight className="h-5 w-5" />
                      </Button>
                    </Link>
                  </div>
                  <div className="mt-10 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                    {heroStats.map((stat) => (
                      <div key={stat.label} className="rounded-3xl border border-border/70 bg-card/70 px-5 py-4">
                        <p className="font-heading text-2xl font-bold text-foreground">{stat.value}</p>
                        <p className="mt-1 text-muted-foreground">{stat.label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="rounded-[2rem] border border-border/70 bg-card/70 p-6 text-foreground shadow-2xl backdrop-blur">
                    <p className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">Why labs switch</p>
                    <div className="mt-6 space-y-5">
                      {[
                        "Replace spreadsheets, chats, and disconnected workflows",
                        "Improve turnaround across patients, billing, and reports",
                        "Launch a branded patient experience for each lab customer",
                      ].map((item) => (
                        <div key={item} className="rounded-2xl border border-border/60 bg-card/70 p-4">
                          <p className="text-base leading-relaxed text-foreground">{item}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[2rem] border border-border/70 bg-card/80 p-6 text-foreground shadow-2xl backdrop-blur">
                    <p className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">Commercial model</p>
                    <div className="mt-5 space-y-3 text-sm leading-7 text-foreground/80">
                      <p>Root domain sells the product.</p>
                      <p>Tenant domain serves the lab’s patients and staff.</p>
                      <p>No per-customer forked repo model.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="border-b border-primary/15 bg-primary/5">
            <div className="container mx-auto px-4 py-8 lg:px-8">
              <div className="grid gap-4 md:grid-cols-3">
                {trustSignals.map((signal) => (
                  <div
                    key={signal}
                    className="rounded-2xl border border-border bg-card px-5 py-4 text-sm font-medium text-foreground/85 shadow-sm"
                  >
                    {signal}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="border-b border-border/60 bg-secondary/25">
            <div className="container mx-auto px-4 py-14 lg:px-8">
              <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-2xl">
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Start On Your Own</p>
                  <h3 className="mt-4 font-heading text-3xl font-bold text-foreground">
                    If your lab already knows the basics, skip the long sales loop
                  </h3>
                  <p className="mt-4 text-lg leading-8 text-muted-foreground">
                    The platform now supports a real self-serve setup path. If your team already knows the owner,
                    rollout shape, and whether data migration is needed, you can move straight into onboarding.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {selfServeSignals.map((item) => (
                    <div key={item} className="rounded-2xl border border-border bg-card px-4 py-4 text-sm font-medium text-foreground/85 shadow-sm">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--secondary)/0.35)_100%)]">
            <div className="container mx-auto px-4 py-20 lg:px-8">
              <div className="max-w-3xl">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Operating Model</p>
                <h3 className="mt-4 font-heading text-3xl font-bold text-foreground md:text-5xl">
                  Structured like a product company, not a custom build for every buyer
                </h3>
                <p className="mt-6 text-lg leading-8 text-muted-foreground">
                  This is the difference between a reusable SaaS and a services-heavy fork model. The product stays
                  central, while each buying lab gets isolated operations inside its own organization.
                </p>
              </div>
              <div className="mt-12 grid gap-6 xl:grid-cols-3">
                {operatingModel.map((item, index) => (
                  <article
                    key={item.title}
                    className={`rounded-[2rem] border p-7 shadow-sm ${
                      index === 1
                        ? "border-clinical-blue/30 bg-[linear-gradient(180deg,rgba(31,138,205,0.08),hsl(var(--card)))] dark:bg-[linear-gradient(180deg,rgba(31,138,205,0.22),hsl(var(--card)))]"
                        : "border-border bg-card"
                    }`}
                  >
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
                      Layer {index + 1}
                    </p>
                    <h4 className="mt-4 font-heading text-2xl font-semibold text-foreground">{item.title}</h4>
                    <p className="mt-4 leading-7 text-muted-foreground">{item.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="border-b border-border/60 bg-muted/20">
            <div className="container mx-auto px-4 py-20 lg:px-8">
              <div className="max-w-3xl">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">The problem</p>
                <h3 className="mt-4 font-heading text-3xl font-bold text-foreground md:text-5xl">
                  Most labs still run critical work in too many places
                </h3>
                <p className="mt-6 text-lg leading-8 text-muted-foreground">
                  Patient records, test workflows, billing, reports, and follow-ups often get split across spreadsheets,
                  WhatsApp chats, paper files, and disconnected tools. That slows teams down and creates avoidable mistakes.
                </p>
              </div>
            </div>
          </section>

          <section id="features" className="bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--secondary)/0.35)_100%)]">
            <div className="container mx-auto px-4 py-20 lg:px-8">
              <div className="max-w-3xl">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Features</p>
                <h3 className="mt-4 font-heading text-3xl font-bold md:text-5xl">One platform for daily lab operations</h3>
                <p className="mt-6 text-lg text-muted-foreground">
                  From patient registration to final report delivery, keep your core workflows in one system your staff can use every day.
                </p>
              </div>
              <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {features.map((feature) => (
                  <article key={feature.title} className="rounded-3xl border border-border bg-card p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <feature.icon className="h-6 w-6" />
                    </div>
                    <h4 className="mt-6 font-heading text-2xl font-semibold text-foreground">{feature.title}</h4>
                    <p className="mt-3 leading-7 text-muted-foreground">{feature.description}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="border-y border-border/60 bg-[linear-gradient(180deg,rgba(31,138,205,0.06),transparent)]">
            <div className="container mx-auto px-4 py-20 lg:px-8">
              <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
                <div className="max-w-2xl">
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Workflow Preview</p>
                  <h3 className="mt-4 font-heading text-3xl font-bold text-foreground md:text-5xl">
                    The product should look operational, not theoretical
                  </h3>
                  <p className="mt-6 text-lg leading-8 text-muted-foreground">
                    A lab owner buying this software wants to understand what staff will actually manage every day:
                    intake, testing, billing, reporting, and branch operations. The product site should reflect that.
                  </p>
                  <div className="mt-8 flex flex-wrap gap-3">
                    <Link to={buildPlatformPathWithMarketing("/start")}>
                      <Button variant="clinical">Start Setup</Button>
                    </Link>
                    <Link to={buildPlatformPathWithMarketing("/book-demo")}>
                      <Button variant="outline">Explore Capabilities</Button>
                    </Link>
                  </div>
                </div>

                <div className="grid gap-5">
                  {workflowPreviewCards.map((card) => (
                    <article key={card.title} className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">{card.eyebrow}</p>
                          <h4 className="mt-3 font-heading text-2xl font-semibold text-foreground">{card.title}</h4>
                        </div>
                        <span className={`mt-1 h-3 w-3 rounded-full ${card.accent}`} />
                      </div>
                      <div className="mt-6 grid gap-3 sm:grid-cols-3">
                        {card.metrics.map(([label, value]) => (
                          <div key={label} className="rounded-2xl border border-border/70 bg-background px-4 py-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
                            <p className="mt-3 font-heading text-2xl font-bold text-foreground">{value}</p>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="border-y border-border/60 bg-secondary/40">
            <div className="container mx-auto grid gap-10 px-4 py-20 lg:grid-cols-2 lg:px-8">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Outcomes</p>
                <h3 className="mt-4 font-heading text-3xl font-bold md:text-5xl">Built to reduce operational friction</h3>
                <ul className="mt-8 space-y-4 text-lg text-muted-foreground">
                  <li>Faster billing and report turnaround</li>
                  <li>Cleaner patient and test tracking</li>
                  <li>Better visibility across branches</li>
                  <li>More professional patient experience</li>
                  <li>Less dependence on manual coordination</li>
                </ul>
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Who it’s for</p>
                <div className="mt-8 space-y-5">
                  {[
                    ["Single Lab", "For owner-led labs that want to replace manual workflows with one reliable system."],
                    ["Multi-Branch Lab", "For diagnostic groups managing branches and collection centers with shared visibility."],
                    ["Branded Patient Experience", "For labs that want their own portal, public website, and branded reports."],
                  ].map(([title, body]) => (
                    <article key={title} className="rounded-3xl border border-border bg-background p-6">
                      <h4 className="font-heading text-2xl font-semibold">{title}</h4>
                      <p className="mt-3 text-muted-foreground leading-7">{body}</p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section id="onboarding" className="bg-background">
            <div className="container mx-auto px-4 py-20 lg:px-8">
              <div className="max-w-3xl">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Onboarding</p>
                <h3 className="mt-4 font-heading text-3xl font-bold md:text-5xl">Go live without reinventing your process</h3>
                <p className="mt-6 text-lg text-muted-foreground">
                  We help you launch with your own branding, staff setup, tests, pricing, and patient workflow so you can move from setup to daily use quickly.
                </p>
              </div>
              <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
                {[
                  "We set up your organization and branding",
                  "Add labs, branches, and staff",
                  "Configure tests, pricing, and templates",
                  "Set up billing, notifications, and portal access",
                  "Train your team and go live",
                ].map((step, index) => (
                  <article key={step} className="rounded-3xl border border-border bg-card p-6">
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Step {index + 1}</p>
                    <p className="mt-4 text-base leading-7 text-foreground">{step}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section id="pricing" className="border-y border-primary/20 bg-muted/20 dark:bg-muted/30">
            <div className="container mx-auto px-4 py-20 lg:px-8">
              <div className="max-w-3xl">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Pricing</p>
                <h3 className="mt-4 font-heading text-3xl font-bold md:text-5xl">Simple plans for lab growth</h3>
                <p className="mt-6 text-lg text-muted-foreground">
                  Choose a plan based on your lab size, branch structure, and onboarding needs.
                </p>
              </div>
              <div className="mt-12 grid gap-6 lg:grid-cols-3">
                {plans.map((plan, index) => (
                  <article
                    key={plan.name}
                    className={`rounded-3xl border p-7 shadow-sm ${
                      index === 1
                        ? "border-clinical-blue bg-[linear-gradient(180deg,rgba(31,138,205,0.08),hsl(var(--card)))] dark:bg-[linear-gradient(180deg,rgba(31,138,205,0.22),hsl(var(--card)))]"
                        : "border-border bg-background"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <h4 className="font-heading text-3xl font-bold text-foreground">{plan.name}</h4>
                      {index === 1 ? (
                        <span className="rounded-full bg-clinical-blue px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground">
                          Popular
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-3 text-muted-foreground">{plan.summary}</p>
                    <ul className="mt-6 space-y-3 text-sm leading-6 text-foreground/85">
                      {plan.items.map((item) => (
                        <li key={item}>• {item}</li>
                      ))}
                    </ul>
                    <Link
                      to={buildPlatformPathWithMarketing(`/start?plan=${plan.name.toLowerCase()}`)}
                      className="mt-8 inline-flex"
                    >
                      <Button variant={index === 1 ? "clinical" : "outline"}>Start with {plan.name}</Button>
                    </Link>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section id="contact" className="bg-background">
            <div className="container mx-auto px-4 py-20 lg:px-8">
              <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
                <div className="rounded-[2rem] border border-border bg-card p-8 shadow-sm">
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Why this model</p>
                  <h3 className="mt-4 font-heading text-3xl font-bold text-foreground md:text-4xl">
                    Built as a product, not a separate codebase for every lab
                  </h3>
                  <p className="mt-6 text-base leading-8 text-muted-foreground">
                    The root site sells the software. Each tenant domain runs the branded lab experience. That lets you onboard new diagnostic labs without forking the product every time.
                  </p>
                  <ul className="mt-8 space-y-3 text-sm leading-7 text-foreground/80">
                    <li>Separate organizations with isolated lab data</li>
                    <li>Tenant-specific branding, payments, email, WhatsApp, and reports</li>
                    <li>Root-domain lead capture for product sales conversations</li>
                  </ul>
                </div>

                <div className="rounded-[2rem] border border-border bg-secondary/35 p-8 shadow-sm">
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">FAQ</p>
                  <div className="mt-6 space-y-4">
                    {faqs.map((faq) => (
                      <article key={faq.question} className="rounded-2xl border border-border bg-background p-5">
                        <h4 className="font-heading text-xl font-semibold text-foreground">{faq.question}</h4>
                        <p className="mt-3 text-sm leading-7 text-muted-foreground">{faq.answer}</p>
                      </article>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-[2rem] border border-primary/20 bg-card/90 px-8 py-14 text-foreground lg:px-14 dark:bg-card">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted-foreground">Contact</p>
                <h3 className="mt-4 font-heading text-3xl font-bold md:text-5xl">Ready to modernize your lab operations?</h3>
                <p className="mt-6 max-w-3xl text-lg text-muted-foreground">
                  Launch your own branded lab system with patient management, billing, reports, reminders, and branch support.
                </p>
                <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                  <Link to={buildPlatformPathWithMarketing("/start")}>
                    <Button variant="hero" size="xl">Get Started</Button>
                  </Link>
                  <Link to={buildPlatformPathWithMarketing("/book-demo")}>
                    <Button variant="heroOutline" size="xl">Contact Sales</Button>
                  </Link>
                  <a href={buildOperationsUrl("/auth/staff")}>
                    <Button variant="outline" size="xl">Staff Login</Button>
                  </a>
                </div>
                <p className="mt-6 text-sm text-muted-foreground">Sales contact: {contactEmail}</p>
              </div>
            </div>
          </section>
        </main>
        <PlatformSiteFooter />
      </div>
    </>
  );
};

export default ProductLandingPage;
