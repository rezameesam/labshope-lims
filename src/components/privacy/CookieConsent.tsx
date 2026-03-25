import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";

type ConsentState = {
  version: string;
  analytics: boolean;
  personalization: boolean;
  ads: boolean;
  updated_at: string;
};

const CONSENT_COOKIE = "irm_consent";
const CONSENT_VERSION = "1";
const ONE_YEAR = 60 * 60 * 24 * 365;
const PAGE_VIEW_LOG_THROTTLE_MS = 30_000;

const parseConsentCookie = (): ConsentState | null => {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${CONSENT_COOKIE}=`));
  if (!match) return null;

  try {
    const raw = decodeURIComponent(match.split("=")[1] || "");
    const parsed = JSON.parse(raw) as ConsentState;
    if (!parsed || parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeConsentCookie = (consent: ConsentState) => {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(
    JSON.stringify(consent)
  )}; Max-Age=${ONE_YEAR}; Path=/; SameSite=Lax${secure}`;
};

const isPublicPath = (path: string) => {
  const publicPaths = [
    "/",
    "/book-test",
    "/careers",
    "/work-with-us",
    "/privacy",
    "/terms",
    "/auth/patient",
    "/patient/reset-password",
    "/auth/staff",
    "/auth/employee",
    "/staff/reset-password",
    "/employee/reset-password",
  ];
  return publicPaths.includes(path);
};

const getBrowserCountry = (): { country_code: string | null; country_name: string | null } => {
  const locale = navigator.languages?.[0] || navigator.language || "";
  const parts = locale.replace(/_/g, "-").split("-");
  const candidate = parts.find((part, index) => index > 0 && /^[A-Za-z]{2}$/.test(part));
  const countryCode = candidate ? candidate.toUpperCase() : null;

  if (!countryCode) {
    return { country_code: null, country_name: null };
  }

  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
    return { country_code: countryCode, country_name: displayNames.of(countryCode) || countryCode };
  } catch {
    return { country_code: countryCode, country_name: countryCode };
  }
};

const CookieConsent = () => {
  const location = useLocation();
  const organizationContext = useOptionalOrganization();
  const organization = organizationContext?.organization ?? null;
  const organizationLoading = organizationContext?.loading ?? false;
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [prefs, setPrefs] = useState({
    analytics: true,
    personalization: true,
    ads: true,
  });

  const isPublic = useMemo(() => isPublicPath(location.pathname), [location.pathname]);
  const browserCountry = useMemo(() => getBrowserCountry(), []);

  useEffect(() => {
    if (!isPublic) return;
    const stored = parseConsentCookie();
    setConsent(stored);
    if (stored) {
      setPrefs({
        analytics: stored.analytics,
        personalization: stored.personalization,
        ads: stored.ads,
      });
    }
    setBannerOpen(!stored);
  }, [isPublic]);

  useEffect(() => {
    if (organizationLoading) return;
    if (!isPublic) return;

    const throttleKey = `visitor_log:${window.location.hostname}:${location.pathname}`;
    const lastLogged = Number(sessionStorage.getItem(throttleKey) || "0");
    if (Date.now() - lastLogged < PAGE_VIEW_LOG_THROTTLE_MS) {
      return;
    }

    const current = consent || parseConsentCookie();
    const payload = {
      event_type: "page_view",
      organization_id: organization?.id || null,
      hostname: window.location.hostname || null,
      path: location.pathname,
      referrer: document.referrer || null,
      consent: current,
      ...browserCountry,
    };

    sessionStorage.setItem(throttleKey, String(Date.now()));

    void supabase.functions
      .invoke("log-visitor", { body: payload })
      .catch((error) => {
        console.error("Failed to log visitor", error);
      });
  }, [isPublic, location.pathname, consent, browserCountry, organization?.id, organizationLoading]);

  const applyConsent = (nextPrefs: typeof prefs) => {
    const nextConsent: ConsentState = {
      version: CONSENT_VERSION,
      analytics: nextPrefs.analytics,
      personalization: nextPrefs.personalization,
      ads: nextPrefs.ads,
      updated_at: new Date().toISOString(),
    };
    writeConsentCookie(nextConsent);
    setConsent(nextConsent);
    setBannerOpen(false);
    setManageOpen(false);
    void supabase.functions.invoke("log-visitor", {
      body: {
        event_type: "consent_update",
        organization_id: organization?.id || null,
        hostname: window.location.hostname || null,
        path: location.pathname,
        referrer: document.referrer || null,
        consent: nextConsent,
        ...browserCountry,
      },
    });
  };

  if (!isPublic) return null;

  return (
    <>
      {bannerOpen && (
        <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-3xl rounded-xl border bg-background p-4 shadow-lg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold">We use cookies</p>
              <p className="text-sm text-muted-foreground">
                We use cookies for essential site functions, analytics, personalization, and ads.
                You can accept all, reject non-essential, or manage preferences.
              </p>
              <div className="flex items-center gap-2 text-xs text-primary">
                <a href="/privacy" className="underline">
                  Privacy Policy
                </a>
                <span className="text-muted-foreground">•</span>
                <button
                  type="button"
                  className="underline"
                  onClick={() => setManageOpen(true)}
                >
                  Manage
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  applyConsent({ analytics: true, personalization: true, ads: true })
                }
              >
                Accept All
              </Button>
            </div>
          </div>
        </div>
      )}

      {manageOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border bg-background p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Cookie Preferences</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Essential cookies are always on. Choose which optional cookies you allow.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManageOpen(false)}
                className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close cookie preferences"
              >
                ×
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium">Essential</p>
                  <p className="text-sm text-muted-foreground">
                    Required for login, security, and basic site functions.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked
                  disabled
                  aria-label="Essential cookies always enabled"
                  className="h-4 w-4 accent-primary"
                />
              </div>

              <label className="flex cursor-pointer items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium">Analytics</p>
                  <p className="text-sm text-muted-foreground">
                    Help us understand usage and improve the site.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.analytics}
                  onChange={(event) =>
                    setPrefs((prev) => ({ ...prev, analytics: event.target.checked }))
                  }
                  className="h-4 w-4 accent-primary"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium">Personalization</p>
                  <p className="text-sm text-muted-foreground">
                    Tailor content and experience to you.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.personalization}
                  onChange={(event) =>
                    setPrefs((prev) => ({ ...prev, personalization: event.target.checked }))
                  }
                  className="h-4 w-4 accent-primary"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium">Ads</p>
                  <p className="text-sm text-muted-foreground">
                    Show relevant ads and measure their performance.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.ads}
                  onChange={(event) =>
                    setPrefs((prev) => ({ ...prev, ads: event.target.checked }))
                  }
                  className="h-4 w-4 accent-primary"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  applyConsent({ analytics: false, personalization: false, ads: false })
                }
              >
                Reject non-essential
              </Button>
              <Button onClick={() => applyConsent(prefs)}>Save Preferences</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CookieConsent;
