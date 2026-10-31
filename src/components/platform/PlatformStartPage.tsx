import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { CircleCheck, Rocket, ShieldCheck, Sparkles } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import PlatformSiteFooter from "@/components/platform/PlatformSiteFooter";
import PlatformSiteHeader from "@/components/platform/PlatformSiteHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import Turnstile from "@/components/ui/turnstile";
import { getPlatformMarketingParams } from "@/lib/platformMarketing";
import { getPlatformPageTitle, platformBranding } from "@/lib/platformBranding";
import { toast } from "sonner";

const planOptions = [
  { value: "starter", label: "Starter", description: "Best for one lab, up to 5 staff, 10,000 patients, and one collection center.", price: "₹10,000/year", setup: "+ GST · no lock-in" },
  { value: "growth", label: "Growth", description: "Best for up to 5 labs, 50 active staff, 100,000 patients, and up to 10 collection centers.", price: "₹20,000/year", setup: "+ GST · no lock-in" },
  { value: "premium", label: "Premium", description: "Best for higher-touch rollout, premium support, and capacity beyond Growth.", price: "₹40,000/year", setup: "+ GST · premium onboarding scoped to rollout" },
] as const;

const PLAN_BASE_PRICES: Record<string, number> = {
  starter: 10000,
  growth: 20000,
  premium: 40000,
};

const setupModeOptions = [
  { value: "self_serve", label: "Self-serve start", description: "You want a fast setup path and owner-led launch." },
  { value: "assisted", label: "Assisted onboarding", description: "You want a guided rollout with more hands-on support." },
] as const;

const planHighlights: Record<(typeof planOptions)[number]["value"], string[]> = {
  starter: [
    "Single-lab setup with core patient, test, billing, and report workflows.",
    "Owner-led rollout path for faster go-live.",
    "Best when you want to replace manual work without a long implementation cycle.",
  ],
  growth: [
    "Up to 10 labs, 100 active staff, and 300,000 patients.",
    "Multi-branch structure with better operational visibility across locations.",
    "Stronger rollout support for billing, reports, reminders, and branch setup.",
    "Best fit for labs that want to scale beyond one desk or one location.",
  ],
  premium: [
    "Higher capacity beyond Growth with premium onboarding support.",
    "White-label rollout, deeper onboarding support, and higher-touch setup help.",
    "Better fit for complex operational rules, imported data, and custom launch needs.",
    "Best when the lab expects a more managed implementation path.",
  ],
};

const rolloutSignals = [
  "1-branch setups usually fit Starter if rollout is straightforward.",
  "2+ branches, collection centers, or deeper coordination usually fit Growth.",
  "White-label, migration-heavy, or managed rollout needs usually fit Premium.",
];

const qualifiesForInstantProvision = (input: {
  selectedPlan: string;
  setupMode: string;
  branchCount: number;
  needsDataImport: boolean;
  needsWhiteLabel: boolean;
}) =>
  input.setupMode === "self_serve" &&
  input.selectedPlan !== "premium" &&
  input.branchCount <= 2 &&
  !input.needsDataImport &&
  !input.needsWhiteLabel;

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

const PAGES_CNAME_TARGET =
  import.meta.env.VITE_PAGES_CNAME_TARGET ||
  `${import.meta.env.VITE_PUBLIC_BASE_DOMAIN?.split(".")[0] || "app"}.pages.dev`;

const getDnsGuide = (customDomain: string, fallbackDomain: string) => {
  if (!customDomain || !fallbackDomain) {
    return null;
  }

  const labels = customDomain.split(".").filter(Boolean);
  const isApexDomain = labels.length <= 2;

  return {
    recordType: "CNAME",
    hostLabel: isApexDomain ? "www" : labels[0],
    target: PAGES_CNAME_TARGET,
    isApexDomain,
  };
};

type SubdomainCheckState = {
  status: "idle" | "checking" | "available" | "taken" | "error";
  candidateSlug: string;
  candidateUrl: string;
  suggestionSlug: string;
  suggestionUrl: string;
  message: string;
};

const PlatformStartPage = () => {
  const [searchParams] = useSearchParams();
  const presetPlan = searchParams.get("plan")?.trim().toLowerCase();
  const initialPlan = planOptions.some((option) => option.value === presetPlan) ? presetPlan : "growth";
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const baseDomain = import.meta.env.VITE_PUBLIC_BASE_DOMAIN?.trim().toLowerCase() || "localhost";

  const [selectedPlan, setSelectedPlan] = useState(initialPlan);
  const [setupMode, setSetupMode] = useState("self_serve");
  const [organizationName, setOrganizationName] = useState("");
  const [primaryLabName, setPrimaryLabName] = useState("");
  const [ownerFullName, setOwnerFullName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [city, setCity] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [branchCount, setBranchCount] = useState("1");
  const [preferredSubdomain, setPreferredSubdomain] = useState("");
  const [goLiveTarget, setGoLiveTarget] = useState("");
  const [needsDataImport, setNeedsDataImport] = useState(false);
  const [needsWhiteLabel, setNeedsWhiteLabel] = useState(false);
  const [notes, setNotes] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [faviconUrl, setFaviconUrl] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponValidation, setCouponValidation] = useState<{
    status: "idle" | "checking" | "valid" | "invalid";
    message: string;
    discount_type?: "percent" | "fixed";
    discount_value?: number;
  }>({ status: "idle", message: "" });
  const [captchaToken, setCaptchaToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [subdomainCheck, setSubdomainCheck] = useState<SubdomainCheckState>({
    status: "idle",
    candidateSlug: "",
    candidateUrl: "",
    suggestionSlug: "",
    suggestionUrl: "",
    message: "",
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedSnapshot, setSubmittedSnapshot] = useState<{
    organizationName: string;
    ownerEmail: string;
    selectedPlan: string;
    setupMode: string;
    autoProvisioned: boolean;
    primaryDomain: string | null;
    accessDomain: string | null;
    launchUrl: string | null;
    staffLoginUrl: string | null;
    patientLoginUrl: string | null;
    bookingUrl: string | null;
    temporaryPassword: string | null;
    ownerLaunchEmailSent: boolean;
  } | null>(null);

  useEffect(() => {
    if (planOptions.some((option) => option.value === presetPlan)) {
      setSelectedPlan(presetPlan);
    }
  }, [presetPlan]);

  // Clear and re-validate coupon when plan changes
  useEffect(() => {
    if (couponCode.trim()) {
      setCouponValidation({ status: "checking", message: "" });
    } else {
      setCouponValidation({ status: "idle", message: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlan]);

  // Debounced coupon validation
  useEffect(() => {
    if (!couponCode.trim()) {
      setCouponValidation({ status: "idle", message: "" });
      return;
    }

    setCouponValidation({ status: "checking", message: "" });

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-coupon`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: couponCode, plan: selectedPlan }),
          }
        );
        const data = await res.json();
        if (data.valid) {
          setCouponValidation({
            status: "valid",
            message: data.message,
            discount_type: data.discount_type,
            discount_value: data.discount_value,
          });
        } else {
          setCouponValidation({ status: "invalid", message: data.message });
        }
      } catch {
        setCouponValidation({ status: "invalid", message: "Unable to validate coupon." });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [couponCode, selectedPlan]);

  const selectedPlanMeta = useMemo(
    () => planOptions.find((option) => option.value === selectedPlan) || planOptions[1],
    [selectedPlan],
  );

  const selectedSetupModeMeta = useMemo(
    () => setupModeOptions.find((option) => option.value === setupMode) || setupModeOptions[0],
    [setupMode],
  );

  const normalizedBranchCount = useMemo(() => {
    const parsed = Number(branchCount || "1");
    if (!Number.isFinite(parsed) || parsed < 1) {
      return 1;
    }
    return Math.min(999, Math.round(parsed));
  }, [branchCount]);

  const recommendedPlan = useMemo(() => {
    if (needsWhiteLabel || needsDataImport || setupMode === "assisted") {
      return "premium";
    }

    if (normalizedBranchCount >= 2) {
      return "growth";
    }

    return "starter";
  }, [needsDataImport, needsWhiteLabel, normalizedBranchCount, setupMode]);

  const recommendedPlanMeta = useMemo(
    () => planOptions.find((option) => option.value === recommendedPlan) || planOptions[1],
    [recommendedPlan],
  );

  const selectedPlanDiffersFromRecommendation = selectedPlan !== recommendedPlan;
  const instantProvisionEligible = useMemo(
    () =>
      qualifiesForInstantProvision({
        selectedPlan,
        setupMode,
        branchCount: normalizedBranchCount,
        needsDataImport,
        needsWhiteLabel,
      }),
    [needsDataImport, needsWhiteLabel, normalizedBranchCount, selectedPlan, setupMode],
  );
  const instantProvisionBlockers = useMemo(() => {
    const blockers: string[] = [];

    if (setupMode !== "self_serve") {
      blockers.push("switch to self-serve onboarding");
    }
    if (selectedPlan === "premium") {
      blockers.push("choose Starter or Growth instead of Premium");
    }
    if (normalizedBranchCount > 2) {
      blockers.push("reduce the initial rollout to 2 branches or fewer");
    }
    if (needsDataImport) {
      blockers.push("skip data import for the first rollout");
    }
    if (needsWhiteLabel) {
      blockers.push("skip white-label setup in the first rollout");
    }

    return blockers;
  }, [needsDataImport, needsWhiteLabel, normalizedBranchCount, selectedPlan, setupMode]);

  const subdomainPreview = useMemo(() => {
    const normalized = preferredSubdomain
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .replace(/^-+|-+$/g, "") || slugify(organizationName);

    if (!normalized) {
      return "";
    }

    return `${normalized}.${baseDomain === "localhost" ? "labshope.com" : baseDomain}`;
  }, [baseDomain, organizationName, preferredSubdomain]);

  const effectiveSubdomain = useMemo(() => {
    if (subdomainCheck.status === "taken" && subdomainCheck.suggestionSlug) {
      return subdomainCheck.suggestionSlug;
    }

    return preferredSubdomain
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .replace(/^-+|-+$/g, "") || slugify(organizationName);
  }, [organizationName, preferredSubdomain, subdomainCheck]);

  const normalizedCustomDomain = useMemo(() => {
    const trimmed = customDomain.trim().toLowerCase();
    if (!trimmed) {
      return "";
    }

    try {
      return new URL(trimmed).hostname.toLowerCase();
    } catch {
      return trimmed.replace(/^https?:\/\//, "").replace(/:\d+$/, "");
    }
  }, [customDomain]);
  const customDomainDnsGuide = useMemo(
    () => getDnsGuide(normalizedCustomDomain, effectiveSubdomain ? `${effectiveSubdomain}.${baseDomain === "localhost" ? "labshope.com" : baseDomain}` : ""),
    [baseDomain, effectiveSubdomain, normalizedCustomDomain]
  );

  const subdomainFieldLabel = normalizedCustomDomain
    ? "Fallback launch subdomain"
    : "Preferred launch subdomain";

  const subdomainHelperText =
    subdomainCheck.message ||
    (normalizedCustomDomain
      ? "Optional. Leave this blank and we will derive a temporary launch subdomain for first access."
      : "Use this if you do not have a custom domain yet. It becomes your primary launch address.");

  const launchUrlTitle = normalizedCustomDomain ? "Initial launch URL" : "Primary launch URL";
  const launchUrlDescription = normalizedCustomDomain
    ? "This fallback URL is what the team can use immediately while the primary domain is being connected."
    : subdomainCheck.status === "taken"
      ? "The current choice is taken, so the preview shows the next available launch URL."
      : "This becomes the public address if no custom domain is supplied.";

  useEffect(() => {
    if (!supabaseUrl) {
      return;
    }

    const candidateSlug = preferredSubdomain
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .replace(/^-+|-+$/g, "") || slugify(organizationName);

    if (!candidateSlug) {
      setSubdomainCheck({
        status: "idle",
        candidateSlug: "",
        candidateUrl: "",
        suggestionSlug: "",
        suggestionUrl: "",
        message: "",
      });
      return;
    }

    let cancelled = false;
    setSubdomainCheck((current) => ({
      ...current,
      status: "checking",
      candidateSlug,
      candidateUrl: subdomainPreview ? `https://${subdomainPreview}` : "",
      message: "Checking subdomain availability...",
    }));

    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/check-onboarding-subdomain`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            preferred_subdomain: preferredSubdomain.trim() || null,
            organization_name: organizationName.trim() || null,
            hostname: window.location.hostname,
          }),
        });

        const result = await response.json().catch(() => ({}));
        if (cancelled) {
          return;
        }

        if (!response.ok) {
          throw new Error(result.error || "Failed to check subdomain availability.");
        }

        if (result.available) {
          setSubdomainCheck({
            status: "available",
            candidateSlug: result.candidate_slug || candidateSlug,
            candidateUrl: result.candidate_url || "",
            suggestionSlug: result.candidate_slug || candidateSlug,
            suggestionUrl: result.candidate_url || "",
            message: "This subdomain is available.",
          });
          return;
        }

        setSubdomainCheck({
          status: "taken",
          candidateSlug: result.candidate_slug || candidateSlug,
          candidateUrl: result.candidate_url || "",
          suggestionSlug: result.suggestion_slug || "",
          suggestionUrl: result.suggestion_url || "",
          message: result.reason
            ? result.reason
            : result.suggestion_slug
            ? `That subdomain is taken. Try ${result.suggestion_slug} instead.`
            : "That subdomain is already taken.",
        });
      } catch (error: any) {
        if (cancelled) {
          return;
        }

        setSubdomainCheck({
          status: "error",
          candidateSlug,
          candidateUrl: "",
          suggestionSlug: "",
          suggestionUrl: "",
          message: error?.message || "Could not check subdomain availability.",
        });
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [organizationName, preferredSubdomain, subdomainPreview, supabaseUrl]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!organizationName.trim() || !ownerFullName.trim() || !ownerEmail.trim() || !ownerPhone.trim()) {
      toast.error("Please fill in the required fields.");
      return;
    }

    if (!supabaseUrl) {
      toast.error("Onboarding endpoint is not configured.");
      return;
    }

    if (turnstileSiteKey && !captchaToken) {
      toast.error("Please complete the security check.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/submit-onboarding-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selected_plan: selectedPlan,
          setup_mode: setupMode,
          organization_name: organizationName.trim(),
          primary_lab_name: primaryLabName.trim() || null,
          owner_full_name: ownerFullName.trim(),
          owner_email: ownerEmail.trim(),
          owner_phone: ownerPhone.trim(),
          city: city.trim() || null,
          custom_domain: normalizedCustomDomain || null,
          branch_count: Number(branchCount || "1"),
          preferred_subdomain: effectiveSubdomain || null,
          go_live_target: goLiveTarget || null,
          needs_data_import: needsDataImport,
          needs_white_label: needsWhiteLabel,
          logo_url: logoUrl.trim() || null,
          favicon_url: faviconUrl.trim() || null,
          notes: notes.trim() || null,
          coupon_code: couponCode.trim().toUpperCase() || null,
          hostname: window.location.hostname,
          page_path: window.location.pathname,
          referer: document.referrer || null,
          ...getPlatformMarketingParams(),
          turnstile_token: captchaToken || undefined,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Failed to submit onboarding request.");
      }

      setSubmittedSnapshot({
        organizationName: organizationName.trim(),
        ownerEmail: ownerEmail.trim(),
        selectedPlan,
        setupMode,
        autoProvisioned: Boolean(result.auto_provisioned),
        primaryDomain: result.primary_domain || normalizedCustomDomain || null,
        accessDomain: result.access_domain || null,
        launchUrl: result.launch_url || null,
        staffLoginUrl: result.staff_login_url || null,
        patientLoginUrl: result.patient_login_url || null,
        bookingUrl: result.booking_url || null,
        temporaryPassword: result.owner_temporary_password || null,
        ownerLaunchEmailSent: Boolean(result.owner_launch_email_sent),
      });
      setIsSubmitted(true);
      setOrganizationName("");
      setPrimaryLabName("");
      setOwnerFullName("");
      setOwnerEmail("");
      setOwnerPhone("");
      setCity("");
      setCustomDomain("");
      setBranchCount("1");
      setPreferredSubdomain("");
      setGoLiveTarget("");
      setNeedsDataImport(false);
      setNeedsWhiteLabel(false);
      setLogoUrl("");
      setFaviconUrl("");
      setNotes("");
      setCouponCode("");
      setCaptchaToken("");
      toast.success(
        result.auto_provisioned
          ? "Workspace created. Check your email for launch details."
          : "Onboarding request submitted. We will send the next steps shortly.",
      );
    } catch (error: any) {
      toast.error(error?.message || "Failed to submit onboarding request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{getPlatformPageTitle("Get Started")}</title>
        <meta
          name="description"
          content="Choose a plan, share your lab details, and start onboarding your diagnostic lab on the platform."
        />
      </Helmet>

      <PlatformSiteHeader />

      <main>
        <section className="border-b border-border/60 bg-[linear-gradient(180deg,rgba(31,138,205,0.07),transparent)]">
          <div className="container mx-auto px-4 py-16 lg:px-8 lg:py-24">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Get Started</p>
              <h1 className="mt-4 font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                Choose a plan and start your lab setup path
              </h1>
              <p className="mt-6 text-lg leading-8 text-muted-foreground">
                This is the shortest path from interest to rollout. Use your own domain if you already have one. If
                not, we can launch you on an available subdomain and help you move to your primary domain later.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-background">
          <div className="container mx-auto grid gap-8 px-4 py-16 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:py-20">
            <div className="space-y-5">
              <div className="rounded-[2rem] border border-border bg-card p-8 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Selected Plan</p>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <h2 className="font-heading text-3xl font-bold text-foreground">{selectedPlanMeta.label}</h2>
                  <div className="text-right">
                    {couponValidation.status === "valid" &&
                    couponValidation.discount_value !== undefined &&
                    PLAN_BASE_PRICES[selectedPlan] !== undefined ? (
                      (() => {
                        const base = PLAN_BASE_PRICES[selectedPlan];
                        const discounted =
                          couponValidation.discount_type === "percent"
                            ? base - (base * couponValidation.discount_value) / 100
                            : base - couponValidation.discount_value;
                        const final = Math.max(0, discounted);
                        return (
                          <>
                            <p className="font-heading text-lg font-bold text-muted-foreground line-through">{selectedPlanMeta.price}</p>
                            <p className="font-heading text-2xl font-bold text-emerald-600">
                              ₹{final.toLocaleString("en-IN")}/year
                            </p>
                          </>
                        );
                      })()
                    ) : (
                      <p className="font-heading text-2xl font-bold text-foreground">{selectedPlanMeta.price}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{selectedPlanMeta.setup}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{selectedPlanMeta.description}</p>
                <p className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                  WhatsApp/SMS provider charges are separate and not included in subscription price.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {planOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSelectedPlan(option.value)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                        selectedPlan === option.value
                          ? "border-clinical-blue bg-clinical-blue text-white"
                          : "border-border bg-background text-muted-foreground hover:border-clinical-blue/50"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="mt-6 space-y-3 text-sm leading-7 text-muted-foreground">
                  {planHighlights[selectedPlanMeta.value].map((item) => (
                    <div key={item} className="flex items-start gap-3">
                      <CircleCheck className="mt-1 h-4 w-4 shrink-0 text-primary" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[2rem] border border-border bg-card p-8 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Launch Mode</p>
                <div className="mt-5 flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Rocket className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-heading text-2xl font-semibold text-foreground">{selectedSetupModeMeta.label}</h3>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">{selectedSetupModeMeta.description}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[2rem] border border-clinical-blue/20 bg-[linear-gradient(180deg,rgba(31,138,205,0.08),hsl(var(--card)))] p-8 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Plan Guidance</p>
                    <h3 className="mt-2 font-heading text-2xl font-semibold text-foreground">
                      Recommended: {recommendedPlanMeta.label}
                    </h3>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">
                      Based on your current inputs for branches, onboarding mode, and rollout complexity.
                    </p>
                  </div>
                </div>
                {selectedPlanDiffersFromRecommendation ? (
                  <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                    You selected {selectedPlanMeta.label}, but your current inputs look closer to {recommendedPlanMeta.label}.
                  </div>
                ) : null}
                <div className="mt-5 space-y-3 text-sm leading-7 text-muted-foreground">
                  {rolloutSignals.map((item) => (
                    <div key={item} className="flex items-start gap-3">
                      <CircleCheck className="mt-1 h-4 w-4 shrink-0 text-primary" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div
                className={`rounded-[2rem] border p-8 shadow-sm ${
                  instantProvisionEligible
                    ? "border-emerald-200 bg-[linear-gradient(180deg,rgba(16,185,129,0.08),hsl(var(--card)))]"
                    : "border-border bg-card"
                }`}
              >
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">
                  Instant Setup Status
                </p>
                <h3 className="mt-4 font-heading text-2xl font-semibold text-foreground">
                  {instantProvisionEligible ? "Eligible for instant workspace creation" : "Will go into onboarding review"}
                </h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {instantProvisionEligible
                    ? "Based on the current inputs, this request can qualify for immediate provisioning after submit."
                    : "With the current inputs, this request is more likely to go to the onboarding queue before a workspace is created."}
                </p>
                {instantProvisionEligible ? (
                  <div className="mt-5 space-y-3 text-sm leading-7 text-muted-foreground">
                    {[
                      "Owner gets first-login access immediately after submit.",
                      "Workspace, booking page, and admin entry path are created in the same flow.",
                      "The owner can move straight into password rotation and Quick Setup.",
                    ].map((item) => (
                      <div key={item} className="flex items-start gap-3">
                        <CircleCheck className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl border border-border bg-background px-4 py-4 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">To qualify for instant setup:</p>
                    <div className="mt-3 space-y-2">
                      {instantProvisionBlockers.map((item) => (
                        <div key={item} className="flex items-start gap-3">
                          <CircleCheck className="mt-1 h-4 w-4 shrink-0 text-primary" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                    {selectedPlan === "premium" || setupMode !== "self_serve" ? (
                      <div className="mt-4 flex flex-wrap gap-3">
                        {setupMode !== "self_serve" ? (
                          <Button type="button" variant="outline" onClick={() => setSetupMode("self_serve")}>
                            Switch to self-serve
                          </Button>
                        ) : null}
                        {selectedPlan === "premium" ? (
                          <Button type="button" variant="outline" onClick={() => setSelectedPlan(recommendedPlan)}>
                            Use {recommendedPlanMeta.label}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="rounded-[2rem] border border-border bg-secondary/35 p-8 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">What happens next</p>
                <div className="mt-6 space-y-4 text-sm leading-7 text-muted-foreground">
                  {[
                    "We review your chosen plan and operating complexity.",
                    "We confirm branding, branch setup, and any import requirements.",
                    "We move you into the onboarding path with the right rollout level.",
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3">
                      <CircleCheck className="mt-1 h-4 w-4 shrink-0 text-primary" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-border bg-card p-8 shadow-sm">
              <h2 className="font-heading text-2xl font-semibold text-foreground">Start setup request</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Share the operational basics once. Start with your own domain if you have it. If not, we will reserve
                an available platform subdomain for launch access.
              </p>

              {isSubmitted ? (
                <div className="mt-8 rounded-2xl border border-primary/20 bg-primary/5 p-6">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-1 h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-foreground">Setup request received.</p>
                      <p className="mt-2 text-sm leading-7 text-muted-foreground">
                        {submittedSnapshot?.autoProvisioned
                          ? "Your workspace qualified for immediate provisioning. Check your email for launch details and first-login access."
                          : "We will review your requested plan and move this into the onboarding queue. You should receive a confirmation email and then launch details once the workspace is ready."}
                      </p>
                    </div>
                  </div>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border/70 bg-background px-4 py-4 text-sm">
                      <p className="text-muted-foreground">Organization</p>
                      <p className="mt-2 font-medium text-foreground">
                        {submittedSnapshot?.organizationName || "Your lab"}
                      </p>
                      <p className="text-muted-foreground">
                        {submittedSnapshot?.selectedPlan || selectedPlan} ·{" "}
                        {submittedSnapshot?.setupMode === "assisted" ? "Assisted onboarding" : "Self-serve start"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background px-4 py-4 text-sm">
                      <p className="text-muted-foreground">Primary inbox</p>
                      <p className="mt-2 font-medium text-foreground">
                        {submittedSnapshot?.ownerEmail || "Check your work email"}
                      </p>
                      <p className="text-muted-foreground">
                        {submittedSnapshot?.autoProvisioned && submittedSnapshot.ownerLaunchEmailSent
                          ? "Launch details have been sent there."
                          : submittedSnapshot?.autoProvisioned
                            ? "Launch details are already available below."
                            : "Launch details and next steps will be sent there."}
                      </p>
                    </div>
                  </div>
                  {submittedSnapshot?.primaryDomain ? (
                    <div className="mt-6 rounded-2xl border border-border/70 bg-background px-4 py-4 text-sm">
                      <p className="text-muted-foreground">Primary public domain</p>
                      <p className="mt-2 font-medium text-foreground">{submittedSnapshot.primaryDomain}</p>
                      <p className="text-muted-foreground">
                        This is the customer-owned or preferred public address for the lab.
                      </p>
                    </div>
                  ) : null}
                  {submittedSnapshot?.primaryDomain && submittedSnapshot?.accessDomain && submittedSnapshot.primaryDomain !== submittedSnapshot.accessDomain ? (
                    <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm">
                      <p className="font-medium text-amber-950">DNS step still required</p>
                      <p className="mt-2 text-amber-900">
                        Your lab can start on the fallback launch domain now, but the customer-owned domain will only
                        go live after DNS is updated at the registrar or DNS provider.
                      </p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-amber-200 bg-card px-4 py-3 dark:border-amber-500/30">
                          <p className="text-amber-700">Record type</p>
                          <p className="mt-1 font-medium text-amber-950">
                            {getDnsGuide(submittedSnapshot.primaryDomain, submittedSnapshot.accessDomain)?.recordType || "CNAME"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-amber-200 bg-card px-4 py-3 dark:border-amber-500/30">
                          <p className="text-amber-700">Host / Name</p>
                          <p className="mt-1 font-medium text-amber-950">
                            {getDnsGuide(submittedSnapshot.primaryDomain, submittedSnapshot.accessDomain)?.hostLabel || submittedSnapshot.primaryDomain}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-amber-200 bg-card px-4 py-3 dark:border-amber-500/30">
                          <p className="text-amber-700">Target</p>
                          <p className="mt-1 break-all font-medium text-amber-950">{submittedSnapshot.accessDomain}</p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                      {submittedSnapshot?.autoProvisioned ? (
                    <div className="mt-6 rounded-2xl border border-clinical-blue/20 bg-primary/10 px-4 py-4 text-sm">
                      <p className="font-medium text-foreground">Immediate owner access</p>
                      <p className="mt-2 text-muted-foreground">
                        The workspace is already live. Use the login and launch details below to enter the tenant now.
                        {submittedSnapshot.ownerLaunchEmailSent
                          ? " The same launch details were also emailed to the owner inbox."
                          : " Email delivery may not be configured yet, so the critical first-login details are shown here."}
                      </p>
                      {submittedSnapshot.primaryDomain ? (
                        <p className="mt-2 text-muted-foreground">
                          The launch links below use the platform fallback address so the team can start immediately
                          while the primary domain is being connected.
                        </p>
                      ) : null}
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-border/70 bg-background px-4 py-4">
                          <p className="text-muted-foreground">Staff login</p>
                          <p className="mt-2 break-all font-medium text-foreground">
                            {submittedSnapshot.staffLoginUrl || submittedSnapshot.launchUrl || "Ready now"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border/70 bg-background px-4 py-4">
                          <p className="text-muted-foreground">Owner temporary password</p>
                          <p className="mt-2 break-all font-mono text-sm font-medium text-foreground">
                            {submittedSnapshot.temporaryPassword || "Sent by email"}
                          </p>
                        </div>
                      </div>
                      {submittedSnapshot.accessDomain ? (
                        <div className="mt-4 rounded-2xl border border-border/70 bg-background px-4 py-4">
                          <p className="text-muted-foreground">Initial access domain</p>
                          <p className="mt-2 break-all font-medium text-foreground">{submittedSnapshot.accessDomain}</p>
                        </div>
                      ) : null}
                      <div className="mt-4 rounded-2xl border border-border/70 bg-background px-4 py-4">
                        <p className="font-medium text-foreground">First login flow</p>
                        <p className="mt-2 text-muted-foreground">
                          The owner signs in with the temporary password once, is asked to set a permanent password,
                          and then lands in Quick Setup to finish branding, contact details, and launch settings.
                        </p>
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-6 rounded-2xl border border-border/70 bg-background px-4 py-4 text-sm">
                    <p className="font-medium text-foreground">What happens next</p>
                    <div className="mt-3 space-y-3 text-muted-foreground">
                      {(submittedSnapshot?.autoProvisioned
                        ? [
                            "Your workspace was provisioned immediately because the request qualified for the self-serve path.",
                            "The owner email receives first-login credentials and the tenant URL.",
                            "You can open the workspace as soon as the launch email arrives.",
                          ]
                        : [
                            "A platform admin reviews your plan, branch count, and rollout requirements.",
                            "If the request is straightforward, your workspace can be provisioned directly from the onboarding queue.",
                            "The owner email receives launch details, login access, and the tenant URL once setup is approved.",
                          ]).map((item) => (
                        <div key={item} className="flex items-start gap-3">
                          <CircleCheck className="mt-1 h-4 w-4 shrink-0 text-primary" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-6 flex flex-wrap gap-3">
                    {submittedSnapshot?.autoProvisioned && submittedSnapshot.staffLoginUrl ? (
                      <Button asChild variant="clinical">
                        <a href={submittedSnapshot.staffLoginUrl}>Open staff login</a>
                      </Button>
                    ) : submittedSnapshot?.autoProvisioned && submittedSnapshot.launchUrl ? (
                      <Button asChild variant="clinical">
                        <a href={submittedSnapshot.launchUrl}>Open workspace</a>
                      </Button>
                    ) : null}
                    {submittedSnapshot?.autoProvisioned && submittedSnapshot.bookingUrl ? (
                      <Button asChild variant="outline">
                        <a href={submittedSnapshot.bookingUrl}>Open booking page</a>
                      </Button>
                    ) : null}
                    <Button asChild variant="clinical">
                      <a href="/book-demo">Book an optional walkthrough</a>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsSubmitted(false);
                        setSubmittedSnapshot(null);
                      }}
                    >
                      Submit another setup request
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Plan</Label>
                      <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {planOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Setup Mode</Label>
                      <Select value={setupMode} onValueChange={setSetupMode}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {setupModeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="organization-name">Organization Name</Label>
                      <Input id="organization-name" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="primary-lab-name">Primary Lab Name</Label>
                      <Input id="primary-lab-name" value={primaryLabName} onChange={(e) => setPrimaryLabName(e.target.value)} placeholder="Optional if same as organization" />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="owner-full-name">Owner / Admin Name</Label>
                      <Input id="owner-full-name" value={ownerFullName} onChange={(e) => setOwnerFullName(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="owner-email">Work Email</Label>
                      <Input id="owner-email" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} required />
                    </div>
                  </div>

                  <div className="rounded-[1.5rem] border border-border bg-background p-5">
                    <div className="mb-4">
                      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
                        Domain Setup
                      </p>
                      <p className="mt-2 text-sm leading-7 text-muted-foreground">
                        Your custom domain is the primary public address. The subdomain is only for launch access if you
                        need it.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="custom-domain">Primary custom domain</Label>
                        <Input
                          id="custom-domain"
                          value={customDomain}
                          onChange={(e) => setCustomDomain(e.target.value)}
                          placeholder="lab.example.com"
                        />
                        <p className="text-xs text-muted-foreground">
                          Use your own domain if you have one. We can still keep a fallback launch URL active while DNS
                          is being connected.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="preferred-subdomain">{subdomainFieldLabel}</Label>
                        <Input
                          id="preferred-subdomain"
                          value={preferredSubdomain}
                          onChange={(e) => setPreferredSubdomain(e.target.value)}
                          placeholder={normalizedCustomDomain ? "acme-launch" : "acme-diagnostics"}
                        />
                        <p
                          className={`text-xs ${
                            subdomainCheck.status === "available"
                              ? "text-emerald-700"
                              : subdomainCheck.status === "taken"
                                ? "text-amber-700"
                                : subdomainCheck.status === "error"
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                          }`}
                        >
                          {subdomainHelperText}
                        </p>
                        {subdomainCheck.status === "taken" && subdomainCheck.suggestionSlug ? (
                          <Button
                            type="button"
                            variant="link"
                            className="h-auto p-0 text-xs"
                            onClick={() => setPreferredSubdomain(subdomainCheck.suggestionSlug)}
                          >
                            Use {subdomainCheck.suggestionSlug}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="owner-phone">Phone</Label>
                      <Input id="owner-phone" value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="branch-count">Branches</Label>
                      <Input id="branch-count" type="number" min="1" max="999" value={branchCount} onChange={(e) => setBranchCount(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="go-live-target">Go-live Target</Label>
                      <DatePicker value={goLiveTarget} onChange={setGoLiveTarget} />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border bg-background px-4 py-4 text-sm">
                      <p className="text-muted-foreground">Recommended plan</p>
                      <p className="mt-2 font-medium text-foreground">{recommendedPlanMeta.label}</p>
                      <p className="text-muted-foreground">
                        {selectedPlanDiffersFromRecommendation
                          ? "You can keep your current choice, but this is the better fit from the current inputs."
                          : "Your current selection matches the form signals."}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border bg-background px-4 py-4 text-sm">
                      <p className="text-muted-foreground">{launchUrlTitle}</p>
                      <p className="mt-2 font-medium text-foreground">
                        {subdomainCheck.suggestionUrl || (subdomainPreview ? `https://${subdomainPreview}` : "Add a preferred subdomain to preview the tenant URL")}
                      </p>
                      <p className="text-muted-foreground">{launchUrlDescription}</p>
                      {effectiveSubdomain ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          This request will use <span className="font-medium text-foreground">{effectiveSubdomain}</span>.
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {normalizedCustomDomain && customDomainDnsGuide ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm">
                      <p className="font-medium text-amber-950">DNS connection preview</p>
                      <p className="mt-2 text-amber-900">
                        After purchase, ask the lab to add this DNS record so the custom domain can replace the launch subdomain.
                      </p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-amber-200 bg-card px-4 py-3 dark:border-amber-500/30">
                          <p className="text-amber-700">Record type</p>
                          <p className="mt-1 font-medium text-amber-950">{customDomainDnsGuide.recordType}</p>
                        </div>
                        <div className="rounded-2xl border border-amber-200 bg-card px-4 py-3 dark:border-amber-500/30">
                          <p className="text-amber-700">Host / Name</p>
                          <p className="mt-1 font-medium text-amber-950">{customDomainDnsGuide.hostLabel}</p>
                        </div>
                        <div className="rounded-2xl border border-amber-200 bg-card px-4 py-3 dark:border-amber-500/30">
                          <p className="text-amber-700">Target</p>
                          <p className="mt-1 break-all font-medium text-amber-950">{customDomainDnsGuide.target}</p>
                        </div>
                      </div>
                      {customDomainDnsGuide.isApexDomain ? (
                        <p className="mt-3 text-xs text-amber-800">
                          This points <strong>www.{normalizedCustomDomain}</strong> to your workspace. Most providers (including GoDaddy) don't support CNAME on the root domain — use your provider's domain forwarding to redirect the root to www.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex items-start gap-3 rounded-2xl border border-border bg-background px-4 py-4">
                      <Checkbox checked={needsDataImport} onCheckedChange={(checked) => setNeedsDataImport(Boolean(checked))} />
                      <span className="text-sm leading-6 text-muted-foreground">We need help importing existing tests, patients, or billing history.</span>
                    </label>
                    <label className="flex items-start gap-3 rounded-2xl border border-border bg-background px-4 py-4">
                      <Checkbox checked={needsWhiteLabel} onCheckedChange={(checked) => setNeedsWhiteLabel(Boolean(checked))} />
                      <span className="text-sm leading-6 text-muted-foreground">We need white-label branding or a dedicated domain rollout.</span>
                    </label>
                  </div>

                  <div className="rounded-[1.5rem] border border-border bg-background p-5 space-y-4">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Branding</p>
                      <p className="mt-2 text-sm leading-7 text-muted-foreground">
                        Optional. Paste a public URL to your logo and favicon so we can apply them when your workspace is set up. You can also upload them later from the admin panel.
                      </p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="logo-url">Logo URL <span className="text-muted-foreground font-normal">(optional)</span></Label>
                        <Input
                          id="logo-url"
                          type="url"
                          placeholder="https://yourdomain.com/logo.png"
                          value={logoUrl}
                          onChange={(e) => setLogoUrl(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">PNG or JPG · min 400 × 400 px · max 2 MB</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="favicon-url">Favicon URL <span className="text-muted-foreground font-normal">(optional)</span></Label>
                        <Input
                          id="favicon-url"
                          type="url"
                          placeholder="https://yourdomain.com/favicon.png"
                          value={faviconUrl}
                          onChange={(e) => setFaviconUrl(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">PNG · 32 × 32 px or 64 × 64 px</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="setup-coupon">Coupon code <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Input
                      id="setup-coupon"
                      name="setup-coupon"
                      autoComplete="off"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      placeholder="e.g. LAUNCH50"
                      className={`font-mono tracking-widest uppercase ${
                        couponValidation.status === "valid"
                          ? "border-emerald-400 focus-visible:ring-emerald-300"
                          : couponValidation.status === "invalid"
                          ? "border-red-400 focus-visible:ring-red-300"
                          : ""
                      }`}
                    />
                    {couponValidation.status === "checking" && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Checking…
                      </p>
                    )}
                    {couponValidation.status === "valid" && (
                      <p className="text-xs text-emerald-600 flex items-center gap-1">
                        <CircleCheck className="h-3.5 w-3.5 shrink-0" />
                        {couponValidation.message}
                      </p>
                    )}
                    {couponValidation.status === "invalid" && (
                      <p className="text-xs text-red-600 flex items-center gap-1">
                        <span className="shrink-0 font-bold">✕</span>
                        {couponValidation.message}
                      </p>
                    )}
                    {couponValidation.status === "idle" && (
                      <p className="text-xs text-muted-foreground">If you have a discount code, enter it here. Discounts are applied manually by the team before provisioning.</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="setup-notes">Notes</Label>
                    <Textarea
                      id="setup-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Tell us about your current workflow, billing setup, or rollout expectations."
                      rows={5}
                    />
                  </div>

                  {turnstileSiteKey ? (
                    <Turnstile siteKey={turnstileSiteKey} onVerify={setCaptchaToken} onExpire={() => setCaptchaToken("")} />
                  ) : null}

                  <Button type="submit" variant="clinical" size="lg" disabled={isSubmitting}>
                    {isSubmitting
                      ? "Submitting..."
                      : instantProvisionEligible
                        ? "Create My Workspace"
                        : "Start Setup"}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      <PlatformSiteFooter />
    </div>
  );
};

export default PlatformStartPage;
