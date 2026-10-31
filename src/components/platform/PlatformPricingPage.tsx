import { Helmet } from "react-helmet-async";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import PlatformSiteFooter from "@/components/platform/PlatformSiteFooter";
import PlatformSiteHeader from "@/components/platform/PlatformSiteHeader";
import { Button } from "@/components/ui/button";
import { buildPlatformPathWithMarketing } from "@/lib/platformMarketing";
import { getPlatformPageTitle, platformBranding } from "@/lib/platformBranding";
import { PLAN_LIMITS, PLAN_PRICES } from "@/lib/planLimits";

const plans = [
  {
    name: "Starter",
    subtitle: "For a single lab replacing manual daily operations.",
    price: `₹${PLAN_PRICES.starter.toLocaleString("en-IN")}`,
    priceSuffix: "/year",
    setupFee: "+ GST · no lock-in",
    recommended: false,
    items: [
      `1 lab · up to ${PLAN_LIMITS.starter.employees} active staff`,
      `Up to ${PLAN_LIMITS.starter.patients.toLocaleString("en-IN")} patients`,
      `${PLAN_LIMITS.starter.collectionCenters} collection center`,
      "Patient registration and history",
      "Tests, reports, and billing",
      "Patient portal access",
      "Email and basic WhatsApp reminders",
      "PDF report generation",
    ],
  },
  {
    name: "Growth",
    subtitle: "For labs with multiple branches, higher staff counts, and larger patient volume.",
    price: `₹${PLAN_PRICES.growth.toLocaleString("en-IN")}`,
    priceSuffix: "/year",
    setupFee: "+ GST · no lock-in",
    recommended: true,
    items: [
      "Everything in Starter",
      `Up to ${PLAN_LIMITS.growth.labs} labs · ${PLAN_LIMITS.growth.employees} active staff`,
      `Up to ${PLAN_LIMITS.growth.patients.toLocaleString("en-IN")} patients`,
      `Up to ${PLAN_LIMITS.growth.collectionCenters} collection centers`,
      "Collection centers and branch-aware operations",
      "Inventory and doctor referral tracking",
      "Custom roles and branch-aware workflows",
      "Organization branding and custom domain",
      "Full analytics and financial reporting",
    ],
  },
  {
    name: "Premium",
    subtitle: "For higher-scale labs that need support beyond Growth limits and a more managed rollout.",
    price: `₹${PLAN_PRICES.premium.toLocaleString("en-IN")}`,
    priceSuffix: "/year",
    setupFee: "+ GST · implementation scoped to rollout",
    recommended: false,
    items: [
      "Everything in Growth",
      "Higher scale beyond standard Growth limits",
      "Priority onboarding and data import",
      "Template and white-label customization",
      "Dedicated rollout coordination",
      "Optional isolated deployment path",
    ],
  },
];

const addOns = [
  "Historical data import and cleanup",
  "Custom report template migration",
  "Dedicated domain and white-label rollout",
  "Higher-touch onboarding and staff training",
];

const includedAcrossPlans = [
  "Separate organization-level data isolation",
  "Patient, test, billing, and report workflows",
  "Root product site plus tenant-branded lab experience",
  "Book-demo lead capture and onboarding path",
];

const selfServeReadiness = [
  "You already know the main owner/admin who should receive launch access.",
  "You can name the primary lab and estimate branch count.",
  "You know whether data import or white-label rollout is required.",
  "You want to move into setup now, without waiting for a full sales cycle.",
];

const onboardingExpectations = [
  {
    title: "Choose package and submit setup",
    body: "Pick Starter, Growth, or Premium, then enter owner, lab, and domain details in the setup flow.",
  },
  {
    title: "Instant setup or onboarding review",
    body: "Straightforward self-serve requests can be provisioned immediately. More complex rollouts go into the onboarding queue for review.",
  },
  {
    title: "Owner login and first launch",
    body: "The owner receives launch access, rotates the temporary password on first sign-in, and lands in Quick Setup to finish go-live tasks.",
  },
];

const afterPurchaseSteps = [
  "Your chosen plan opens the matching `/start?plan=...` setup path.",
  "You can enter your own primary custom domain first, or use an available platform subdomain if needed.",
  "If the request is simple enough, the workspace is created immediately with owner login details.",
  "If the request needs help, it goes into the onboarding queue and can still be provisioned from the platform admin panel.",
];

const PlatformPricingPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{getPlatformPageTitle("Pricing")}</title>
        <meta
          name="description"
          content="Compare Starter, Growth, and Premium plans for diagnostic lab management software."
        />
      </Helmet>

      <PlatformSiteHeader />

      <main>
        <section className="border-b border-border/60 bg-[linear-gradient(180deg,rgba(31,138,205,0.08),transparent)]">
          <div className="container mx-auto px-4 py-16 lg:px-8 lg:py-24">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Pricing</p>
              <h1 className="mt-4 font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                Plans that fit a standalone lab today and a branch network later
              </h1>
              <p className="mt-6 text-lg leading-8 text-muted-foreground">
                {platformBranding.productName} should be sold against operational complexity, not generic seat counts.
                Start with the workflow you need now and add rollout depth as your lab expands.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-background">
          <div className="container mx-auto px-4 py-16 lg:px-8 lg:py-20">
            <div className="grid gap-6 xl:grid-cols-3">
              {plans.map((plan) => (
                <article
                  key={plan.name}
                  className={`flex flex-col rounded-[2rem] border p-7 shadow-sm ${
                    plan.recommended
                      ? "border-clinical-blue bg-[linear-gradient(180deg,rgba(31,138,205,0.08),hsl(var(--card)))] dark:bg-[linear-gradient(180deg,rgba(31,138,205,0.22),hsl(var(--card)))]"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="font-heading text-2xl font-semibold text-foreground">{plan.name}</h2>
                    {plan.recommended ? (
                      <span className="rounded-full bg-clinical-blue px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                        Most popular
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{plan.subtitle}</p>

                  <div className="mt-6 border-t border-border/60 pt-6">
                    <div className="flex items-end gap-1">
                      <span className="font-heading text-4xl font-bold text-foreground">{plan.price}</span>
                      {plan.priceSuffix && (
                        <span className="mb-1 text-sm text-muted-foreground">{plan.priceSuffix}</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{plan.setupFee}</p>
                  </div>

                  <ul className="mt-6 flex-1 space-y-3">
                    {plan.items.map((item) => (
                      <li key={item} className="flex items-start gap-3 text-sm leading-7 text-muted-foreground">
                        <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-8">
                    <Link to={buildPlatformPathWithMarketing(`/start?plan=${plan.name.toLowerCase()}`)} className="block">
                      <Button variant={plan.recommended ? "clinical" : "outline"} className="w-full">
                        {`Get started · ${plan.price}${plan.priceSuffix}`}
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                    <p className="mt-2 text-center text-xs text-muted-foreground">
                      {plan.name === "Premium" ? "Includes premium onboarding and rollout scoping." : "No lock-in · cancel anytime"}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Feature comparison strip */}
        <section className="border-b border-border/60 bg-muted/40">
          <div className="container mx-auto px-4 py-12 lg:px-8">
            <div className="overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-card">
                    <th className="px-5 py-4 text-left font-semibold text-foreground">Feature</th>
                    <th className="px-5 py-4 text-center font-semibold text-foreground">Starter</th>
                    <th className="px-5 py-4 text-center font-semibold text-primary">Growth</th>
                    <th className="px-5 py-4 text-center font-semibold text-foreground">Premium</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[
                    ["Patient management", true, true, true],
                    ["Test, reports & billing", true, true, true],
                    ["Patient portal", true, true, true],
                    ["Email & WhatsApp reminders", true, true, true],
                    ["Labs included", "1", "Up to 5", "Above Growth limits"],
                    ["Active staff included", "Up to 5", "Up to 50", "Above Growth limits"],
                    ["Patient capacity", "Up to 10,000", "Up to 100,000", "Above Growth limits"],
                    ["Multiple labs / branches", false, true, true],
                    ["Collection centers", "1 included", "Up to 10", "Above Growth limits"],
                    ["Inventory & doctor referrals", false, true, true],
                    ["Custom domain", false, true, true],
                    ["Organization branding", false, true, true],
                    ["Advanced analytics", false, true, true],
                    ["Data import & migration", false, false, true],
                    ["Dedicated rollout support", false, false, true],
                    ["White-label customization", false, false, true],
                  ].map(([feature, starter, growth, premium]) => (
                    <tr key={String(feature)} className="bg-card even:bg-muted/40">
                      <td className="px-5 py-3 text-foreground">{String(feature)}</td>
                      <td className="px-5 py-3 text-center">
                        {typeof starter === "boolean" ? (starter ? <Check className="mx-auto h-4 w-4 text-emerald-500" /> : <span className="font-medium text-muted-foreground">—</span>) : <span className="text-xs font-medium text-foreground/80">{String(starter)}</span>}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {typeof growth === "boolean" ? (growth ? <Check className="mx-auto h-4 w-4 text-primary" /> : <span className="font-medium text-muted-foreground">—</span>) : <span className="text-xs font-medium text-foreground/80">{String(growth)}</span>}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {typeof premium === "boolean" ? (premium ? <Check className="mx-auto h-4 w-4 text-emerald-500" /> : <span className="font-medium text-muted-foreground">—</span>) : <span className="text-xs font-medium text-foreground/80">{String(premium)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="border-b border-border/60 bg-background">
          <div className="container mx-auto grid gap-10 px-4 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-20">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">After Purchase</p>
              <h2 className="mt-4 font-heading text-3xl font-bold text-foreground">
                Buying a package should move the lab straight into setup, not into a dead-end form
              </h2>
              <p className="mt-4 text-lg leading-8 text-muted-foreground">
                The plan buttons are connected to the real onboarding flow. Buyers do not need to guess what happens
                after selecting a package.
              </p>
            </div>
            <div className="grid gap-4">
              {afterPurchaseSteps.map((item, index) => (
                <div key={item} className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Step {index + 1}</p>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-border/60 bg-[linear-gradient(180deg,rgba(31,138,205,0.05),transparent)]">
          <div className="container mx-auto grid gap-10 px-4 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Buy And Start</p>
              <h2 className="mt-4 font-heading text-3xl font-bold text-foreground">
                If you already know the operational basics, you can move into setup without waiting on sales
              </h2>
              <p className="mt-4 text-lg leading-8 text-muted-foreground">
                The buying path is meant to be practical. If your lab already knows who owns rollout, how many branches
                exist, and whether migration is needed, use the self-serve setup flow directly.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {selfServeReadiness.map((item) => (
                <div key={item} className="rounded-3xl border border-border bg-card p-5 text-sm leading-7 text-muted-foreground shadow-sm">
                  <div className="flex items-start gap-3">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
                    <span>{item}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-border/60 bg-secondary/40">
          <div className="container mx-auto grid gap-10 px-4 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Add-ons</p>
              <h2 className="mt-4 font-heading text-3xl font-bold text-foreground">Use add-ons for rollout work, not as hidden plan traps</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {addOns.map((item) => (
                <div key={item} className="rounded-3xl border border-border bg-card p-5 text-sm leading-7 text-muted-foreground shadow-sm">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-background">
          <div className="container mx-auto px-4 py-16 lg:px-8 lg:py-20">
            <div className="rounded-[2rem] border border-border bg-card p-8 shadow-sm lg:p-10">
              <div className="max-w-3xl">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Onboarding Flow</p>
                <h2 className="mt-4 font-heading text-3xl font-bold text-foreground">
                  The product is designed to get a lab from pricing to launch without a messy handoff
                </h2>
              </div>
              <div className="mt-10 grid gap-5 lg:grid-cols-3">
                {onboardingExpectations.map((item, index) => (
                  <div key={item.title} className="rounded-3xl border border-border bg-background p-6">
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Step {index + 1}</p>
                    <h3 className="mt-3 font-heading text-2xl font-semibold text-foreground">{item.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">{item.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-background">
          <div className="container mx-auto px-4 py-16 lg:px-8 lg:py-20">
            <div className="rounded-[2rem] border border-border bg-card p-8 shadow-sm lg:p-10">
              <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Included Across Plans</p>
                  <h2 className="mt-4 font-heading text-3xl font-bold text-foreground">The commercial difference is rollout depth and complexity, not basic tenant safety</h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {includedAcrossPlans.map((item) => (
                    <div key={item} className="rounded-3xl border border-border bg-background p-5 text-sm leading-7 text-muted-foreground">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-background">
          <div className="container mx-auto px-4 py-16 lg:px-8 lg:py-20">
            <div className="rounded-[2rem] border border-border bg-card p-8 shadow-sm lg:p-10">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-2xl">
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Buying Guidance</p>
                  <h2 className="mt-4 font-heading text-3xl font-bold text-foreground md:text-4xl">
                    Choose based on branch complexity, not vanity feature counts
                  </h2>
                  <p className="mt-4 text-lg leading-8 text-muted-foreground">
                    If you are still standardizing one lab, start smaller. If you already manage branches,
                    collection, shared branding, centralized reporting, and up to 10 labs, start at Growth.
                  </p>
                </div>
                <div className="rounded-3xl border border-clinical-blue/20 bg-primary/10 p-5 text-sm leading-7 text-foreground">
                  <div className="flex items-center gap-2 font-semibold">
                    <ShieldCheck className="h-4 w-4" />
                    White-label ready
                  </div>
                  <p className="mt-2">
                    Root domain sells the software. Tenant domains run the branded lab experience.
                  </p>
                </div>
              </div>
              <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
                Note: WhatsApp and SMS delivery fees are not included in LabShope subscription pricing. Labs must bring their own provider account/credits (e.g., MSG91, Twilio, Meta WhatsApp BSP) and associated usage charges.
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link to={buildPlatformPathWithMarketing("/start?plan=growth")}>
                  <Button variant="clinical">Start Setup</Button>
                </Link>
                <Link to={buildPlatformPathWithMarketing("/book-demo")}>
                  <Button variant="outline">Review Features</Button>
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

export default PlatformPricingPage;
