import { Helmet } from "react-helmet-async";
import { CalendarDays, CircleCheck, Mail, PhoneCall, Rocket } from "lucide-react";
import { Link } from "react-router-dom";
import PlatformSiteFooter from "@/components/platform/PlatformSiteFooter";
import PlatformSiteHeader from "@/components/platform/PlatformSiteHeader";
import { Button } from "@/components/ui/button";
import { buildPlatformPathWithMarketing } from "@/lib/platformMarketing";
import { getPlatformPageTitle, platformBranding } from "@/lib/platformBranding";

const PlatformContactPage = () => {
  const contactEmail = platformBranding.contactEmail;

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{getPlatformPageTitle("Contact")}</title>
        <meta
          name="description"
          content="Talk to sales about diagnostic lab management software, onboarding, branding, and rollout planning."
        />
      </Helmet>

      <PlatformSiteHeader />

      <main>
        <section className="border-b border-border/60 bg-[linear-gradient(180deg,rgba(10,35,66,0.06),transparent)]">
          <div className="container mx-auto px-4 py-16 lg:px-8 lg:py-24">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-clinical-blue">Contact</p>
              <h1 className="mt-4 font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                Start the conversation with your lab model, not generic SaaS buzzwords
              </h1>
              <p className="mt-6 text-lg leading-8 text-muted-foreground">
                Share your branch structure, billing expectations, patient volume, and report workflow. The product
                discussion should map to your actual operating model.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-background">
          <div className="container mx-auto grid gap-8 px-4 py-16 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:py-20">
            <div className="rounded-[2rem] border border-border bg-card p-8 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-clinical-blue">What to bring</p>
              <ul className="mt-6 space-y-4 text-sm leading-7 text-muted-foreground">
                <li>How many labs, branches, or collection centers you operate</li>
                <li>Whether you need branded reports and patient portal access</li>
                <li>How billing and payment collection currently works</li>
                <li>Whether you need migration for tests, templates, or historical patient data</li>
              </ul>
            </div>

            <div className="grid gap-5">
              <div className="rounded-[2rem] border border-border bg-card p-8 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-clinical-blue-light text-clinical-blue">
                    <Rocket className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-heading text-2xl font-semibold text-foreground">Start setup</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Best path if you already know you want to move forward.</p>
                  </div>
                </div>
                <div className="mt-6">
                  <Link to={buildPlatformPathWithMarketing("/start")}>
                    <Button variant="clinical">Get Started</Button>
                  </Link>
                </div>
              </div>

              <div className="rounded-[2rem] border border-border bg-card p-8 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-clinical-blue-light text-clinical-blue">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-heading text-2xl font-semibold text-foreground">Book a live walkthrough</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Best path if you want a tailored demo and rollout discussion.</p>
                  </div>
                </div>
                <div className="mt-6">
                  <Link to={buildPlatformPathWithMarketing("/book-demo")}>
                    <Button variant="clinical">Book Demo</Button>
                  </Link>
                </div>
              </div>

              <div className="rounded-[2rem] border border-border bg-card p-8 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-clinical-blue-light text-clinical-blue">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-heading text-2xl font-semibold text-foreground">Email sales</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Useful for pricing, onboarding, and white-label questions.</p>
                  </div>
                </div>
                <div className="mt-6">
                  <a href={`mailto:${contactEmail}`} className="text-base font-medium text-clinical-blue hover:underline">
                    {contactEmail}
                  </a>
                </div>
              </div>

              <div className="rounded-[2rem] border border-border bg-secondary/35 p-8 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-clinical-blue-light text-clinical-blue">
                    <PhoneCall className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-heading text-2xl font-semibold text-foreground">What happens next</h2>
                    <p className="mt-1 text-sm text-muted-foreground">A practical sales process, not a bloated enterprise cycle.</p>
                  </div>
                </div>
                <ol className="mt-6 space-y-3 text-sm leading-7 text-muted-foreground">
                  <li>1. Short discovery on branches, billing, and reports</li>
                  <li>2. Live workflow walkthrough with your operational context</li>
                  <li>3. Recommendation on plan, onboarding, and timeline</li>
                </ol>
              </div>

              <div className="rounded-[2rem] border border-border bg-card p-8 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-clinical-blue">Fastest Path</p>
                <h2 className="mt-4 font-heading text-2xl font-semibold text-foreground">
                  Use self-serve setup if you are already past the “should we do this?” stage
                </h2>
                <div className="mt-6 space-y-3 text-sm leading-7 text-muted-foreground">
                  {[
                    "Choose this path if you already know your rollout owner and primary lab.",
                    "It is the fastest way to enter the onboarding queue without waiting for a call first.",
                    "A platform admin can review and provision the workspace directly from the internal onboarding queue.",
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3">
                      <CircleCheck className="mt-1 h-4 w-4 shrink-0 text-clinical-blue" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PlatformSiteFooter />
    </div>
  );
};

export default PlatformContactPage;
