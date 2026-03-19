import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { ArrowRight, CalendarDays, CreditCard, FileText, Layers3, Loader2, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import PlatformSiteFooter from "@/components/platform/PlatformSiteFooter";
import PlatformSiteHeader from "@/components/platform/PlatformSiteHeader";
import Turnstile from "@/components/ui/turnstile";
import { toast } from "sonner";
import { getPlatformMarketingParams } from "@/lib/platformMarketing";
import { getPlatformPageTitle, platformBranding } from "@/lib/platformBranding";

const demoHighlights: Array<{ title: string; icon: LucideIcon }> = [
  { title: "Patients", icon: Users },
  { title: "Billing", icon: CreditCard },
  { title: "Reports", icon: FileText },
  { title: "Branches", icon: Layers3 },
];

const PlatformBookDemoPage = () => {
  const contactEmail = platformBranding.contactEmail;
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const [fullName, setFullName] = useState("");
  const [labName, setLabName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [branchCount, setBranchCount] = useState("1");
  const [notes, setNotes] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!fullName.trim() || !labName.trim() || !email.trim() || !phone.trim()) {
      toast.error("Please fill in the required fields.");
      return;
    }

    if (!supabaseUrl) {
      toast.error("Demo request endpoint is not configured.");
      return;
    }

    if (turnstileSiteKey && !captchaToken) {
      toast.error("Please complete the security check.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/submit-demo-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_name: fullName.trim(),
          lab_name: labName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          city: city.trim() || null,
          branch_count: branchCount ? Number(branchCount) : null,
          notes: notes.trim() || null,
          hostname: window.location.hostname,
          page_path: window.location.pathname,
          referer: document.referrer || null,
          ...getPlatformMarketingParams(),
          turnstile_token: captchaToken || undefined,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Failed to submit demo request.");
      }

      setSubmittedEmail(email.trim());
      setIsSubmitted(true);
      setFullName("");
      setLabName("");
      setEmail("");
      setPhone("");
      setCity("");
      setBranchCount("1");
      setNotes("");
      setCaptchaToken("");
      toast.success("Demo request submitted. We will contact you shortly.");
    } catch (error: any) {
      toast.error(error?.message || "Failed to submit demo request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{getPlatformPageTitle("Book Demo")}</title>
        <meta
          name="description"
          content="Book a product demo for diagnostic lab management, patient workflows, billing, reports, and branch operations."
        />
      </Helmet>
      <PlatformSiteHeader />

      <main>
        <section className="container mx-auto px-4 py-16 lg:px-8 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-4 py-2 text-sm font-medium text-primary">
                <CalendarDays className="h-4 w-4" />
                Product Demo
              </div>
              <h1 className="mt-6 font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                Book a demo for your diagnostic lab
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
                See how the platform handles patient management, tests, billing, reports, reminders, and multi-branch operations for diagnostic labs.
              </p>
              <div className="mt-10 grid gap-4 sm:grid-cols-2">
                {demoHighlights.map(({ title, icon: Icon }) => (
                  <div key={title} className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-clinical-blue-light text-clinical-blue">
                      <Icon className="h-5 w-5" />
                    </div>
                    <p className="mt-4 font-semibold text-foreground">{title}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-7 shadow-sm">
              <h2 className="font-heading text-2xl font-semibold text-foreground">Request a live walkthrough</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Share your lab details and we will reach out with a tailored demo.
              </p>

              {isSubmitted ? (
                <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-5">
                  <p className="font-medium text-foreground">Demo request received.</p>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    We will contact you at {submittedEmail || contactEmail}. If you need to reach us sooner, email {contactEmail}.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="demo-full-name">Full Name</Label>
                      <Input
                        id="demo-full-name"
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                        placeholder="Your name"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="demo-lab-name">Lab Name</Label>
                      <Input
                        id="demo-lab-name"
                        value={labName}
                        onChange={(event) => setLabName(event.target.value)}
                        placeholder="Your laboratory"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="demo-email">Work Email</Label>
                      <Input
                        id="demo-email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="name@lab.com"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="demo-phone">Phone</Label>
                      <Input
                        id="demo-phone"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        placeholder="+91 98765 43210"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="demo-city">City</Label>
                      <Input
                        id="demo-city"
                        value={city}
                        onChange={(event) => setCity(event.target.value)}
                        placeholder="City"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="demo-branches">Branches</Label>
                      <Input
                        id="demo-branches"
                        type="number"
                        min="1"
                        max="999"
                        value={branchCount}
                        onChange={(event) => setBranchCount(event.target.value)}
                        placeholder="1"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="demo-notes">What do you want to improve?</Label>
                    <Textarea
                      id="demo-notes"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Tell us about your workflow, current tools, or what you want the demo to focus on."
                      className="min-h-[120px]"
                    />
                  </div>

                  {turnstileSiteKey && (
                    <Turnstile
                      siteKey={turnstileSiteKey}
                      action="submit_demo_request"
                      onVerify={setCaptchaToken}
                      onExpire={() => setCaptchaToken("")}
                    />
                  )}

                  <Button type="submit" variant="clinical" size="lg" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        Request Demo
                        <ArrowRight className="h-5 w-5" />
                      </>
                    )}
                  </Button>
                </form>
              )}

              <div className="mt-8 rounded-2xl border border-border bg-muted/40 p-5">
                <h3 className="font-medium text-foreground">What happens next</h3>
                <ul className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
                  <li>1. We understand your lab size, branches, and current workflow.</li>
                  <li>2. We show the patient, test, billing, and report flow in the product.</li>
                  <li>3. We discuss onboarding, branding, setup, and pricing.</li>
                </ul>
                <p className="mt-4 text-sm text-muted-foreground">Sales contact: {contactEmail}</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PlatformSiteFooter />
    </div>
  );
};

export default PlatformBookDemoPage;
