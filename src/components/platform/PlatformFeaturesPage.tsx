import { Helmet } from "react-helmet-async";
import {
  BadgeIndianRupee,
  Building2,
  CreditCard,
  FileText,
  FlaskConical,
  Layers3,
  MessageSquareMore,
  ShieldCheck,
  Stethoscope,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import PlatformSiteFooter from "@/components/platform/PlatformSiteFooter";
import PlatformSiteHeader from "@/components/platform/PlatformSiteHeader";
import { Button } from "@/components/ui/button";
import { buildPlatformPathWithMarketing } from "@/lib/platformMarketing";
import { getPlatformPageTitle } from "@/lib/platformBranding";

const featureGroups = [
  {
    title: "Front Desk And Patient Flow",
    description: "Handle daily patient movement without scattered registers and one-off spreadsheets.",
    items: [
      ["Patient registration and history", Users],
      ["Booking requests and queue visibility", Building2],
      ["Patient portal access", ShieldCheck],
      ["Organization-scoped patient IDs", BadgeIndianRupee],
    ],
  },
  {
    title: "Testing And Reporting",
    description: "Keep test progress, result entry, and branded report delivery inside one operational flow.",
    items: [
      ["Test catalog and package management", FlaskConical],
      ["Result entry and report generation", FileText],
      ["Template-driven report branding", ShieldCheck],
      ["Doctor referral tracking", Stethoscope],
    ],
  },
  {
    title: "Billing And Collections",
    description: "Track invoices, dues, and payment history with tenant-safe financial separation.",
    items: [
      ["Invoice creation and updates", CreditCard],
      ["Razorpay order and webhook support", BadgeIndianRupee],
      ["Billing audit history", ShieldCheck],
      ["Patient billing portal", Users],
    ],
  },
  {
    title: "Operations And Growth",
    description: "Support multi-branch labs, follow-ups, and staff controls as the organization grows.",
    items: [
      ["Labs and collection centers", Layers3],
      ["Inventory and maintenance logs", Building2],
      ["Reminders and notifications", MessageSquareMore],
      ["Employee roles and custom permissions", ShieldCheck],
    ],
  },
];

const deploymentLayers = [
  {
    title: "Platform Layer",
    description: "Your product company controls the root marketing site, rollout process, and platform-level operations.",
    points: ["Root product site and lead capture", "Platform admin review for demo leads", "Shared rollout and release process"],
  },
  {
    title: "Organization Layer",
    description: "Each buying diagnostic lab becomes its own organization with separate configuration and customer identity.",
    points: ["Branding, payments, email, WhatsApp, and notifications", "Patient IDs, billing, reports, and templates", "Organization-scoped data isolation"],
  },
  {
    title: "Lab Layer",
    description: "Each organization can operate one or many labs, branches, and collection centers inside its tenant.",
    points: ["Main labs and branch operations", "Collection-center workflows", "Lab-level staff and operational routing"],
  },
];

const PlatformFeaturesPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{getPlatformPageTitle("Features")}</title>
        <meta
          name="description"
          content="Explore patient management, testing, billing, reporting, reminders, and branch operations for diagnostic labs."
        />
      </Helmet>

      <PlatformSiteHeader />

      <main>
        <section className="border-b border-border/60 bg-[linear-gradient(180deg,rgba(10,35,66,0.05),transparent)]">
          <div className="container mx-auto px-4 py-16 lg:px-8 lg:py-24">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-clinical-blue">Platform Features</p>
              <h1 className="mt-4 font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                Operational depth for diagnostic labs, not a generic clinic shell
              </h1>
              <p className="mt-6 text-lg leading-8 text-muted-foreground">
                The product is structured around how labs actually work every day: patient intake, test workflows,
                result readiness, billing, follow-ups, branch operations, and branded patient-facing delivery.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to={buildPlatformPathWithMarketing("/pricing")}>
                  <Button variant="clinical">See Pricing</Button>
                </Link>
                <Link to={buildPlatformPathWithMarketing("/book-demo")}>
                  <Button variant="outline">Book Demo</Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-background">
          <div className="container mx-auto px-4 py-16 lg:px-8 lg:py-20">
            <div className="grid gap-6 lg:grid-cols-2">
              {featureGroups.map((group) => (
                <article key={group.title} className="rounded-3xl border border-border bg-card p-7 shadow-sm">
                  <h2 className="font-heading text-2xl font-semibold text-foreground">{group.title}</h2>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{group.description}</p>
                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    {(group.items as [string, LucideIcon][]).map(([label, Icon]) => (
                      <div key={label} className="rounded-2xl border border-border/70 bg-background px-4 py-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-clinical-blue-light text-clinical-blue">
                          <Icon className="h-5 w-5" />
                        </div>
                        <p className="mt-4 text-sm font-medium text-foreground">{label}</p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-border/60 bg-secondary/40">
          <div className="container mx-auto grid gap-8 px-4 py-16 lg:grid-cols-3 lg:px-8">
            {[
              "Organization-level isolation across customer labs",
              "Lab and collection-center support inside each tenant",
              "Branded reports, notifications, payments, and public pages",
            ].map((point) => (
              <div key={point} className="rounded-3xl border border-border bg-card p-6 text-sm leading-7 text-muted-foreground shadow-sm">
                {point}
              </div>
            ))}
          </div>
        </section>

        <section className="bg-background">
          <div className="container mx-auto px-4 py-16 lg:px-8 lg:py-20">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-clinical-blue">Tenant Model</p>
              <h2 className="mt-4 font-heading text-3xl font-bold text-foreground md:text-5xl">
                One product, separate customer organizations, many labs per customer
              </h2>
              <p className="mt-6 text-lg leading-8 text-muted-foreground">
                This is the structure that makes the app sellable. You do not fork the codebase for every lab.
                You operate one product, and each customer runs inside its own organization with its own branches and branding.
              </p>
            </div>
            <div className="mt-10 grid gap-6 xl:grid-cols-3">
              {deploymentLayers.map((layer) => (
                <article key={layer.title} className="rounded-[2rem] border border-border bg-card p-7 shadow-sm">
                  <h3 className="font-heading text-2xl font-semibold text-foreground">{layer.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{layer.description}</p>
                  <ul className="mt-6 space-y-3 text-sm leading-7 text-foreground/85">
                    {layer.points.map((point) => (
                      <li key={point}>• {point}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-background">
          <div className="container mx-auto px-4 py-16 lg:px-8 lg:py-20">
            <div className="rounded-[2rem] border border-border bg-card p-8 shadow-sm lg:p-10">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-clinical-blue">Next Step</p>
              <h2 className="mt-4 font-heading text-3xl font-bold text-foreground md:text-4xl">
                See the workflow against your own lab model
              </h2>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
                The best validation is a live walkthrough using your branch structure, tests, billing pattern, and
                reporting expectations.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to={buildPlatformPathWithMarketing("/book-demo")}>
                  <Button variant="clinical">Request Live Demo</Button>
                </Link>
                <Link to={buildPlatformPathWithMarketing("/pricing")}>
                  <Button variant="outline">Compare Plans</Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PlatformSiteFooter />
    </div>
  );
};

export default PlatformFeaturesPage;
