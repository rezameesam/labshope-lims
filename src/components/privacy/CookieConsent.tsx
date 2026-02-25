import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

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
    "/privacy",
    "/terms",
    "/auth/patient",
    "/patient/reset-password",
    "/auth/employee",
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
    if (!isPublic) return;
    const current = consent || parseConsentCookie();
    const payload = {
      event_type: "page_view",
      path: location.pathname,
      referrer: document.referrer || null,
      consent: current,
      ...browserCountry,
    };

    const sendLog = async () => {
      try {
        await supabase.functions.invoke("log-visitor", { body: payload });
      } catch (error) {
        console.error("Failed to log visitor", error);
      }
    };

    sendLog();
  }, [isPublic, location.pathname, consent, browserCountry]);

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

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cookie Preferences</DialogTitle>
            <DialogDescription>
              Essential cookies are always on. Choose which optional cookies you allow.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">Essential</p>
                <p className="text-sm text-muted-foreground">
                  Required for login, security, and basic site functions.
                </p>
              </div>
              <Switch checked disabled />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">Analytics</p>
                <p className="text-sm text-muted-foreground">
                  Help us understand usage and improve the site.
                </p>
              </div>
              <Switch
                checked={prefs.analytics}
                onCheckedChange={(checked) =>
                  setPrefs((prev) => ({ ...prev, analytics: checked }))
                }
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">Personalization</p>
                <p className="text-sm text-muted-foreground">
                  Tailor content and experience to you.
                </p>
              </div>
              <Switch
                checked={prefs.personalization}
                onCheckedChange={(checked) =>
                  setPrefs((prev) => ({ ...prev, personalization: checked }))
                }
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">Ads</p>
                <p className="text-sm text-muted-foreground">
                  Show relevant ads and measure their performance.
                </p>
              </div>
              <Switch
                checked={prefs.ads}
                onCheckedChange={(checked) =>
                  setPrefs((prev) => ({ ...prev, ads: checked }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                applyConsent({ analytics: false, personalization: false, ads: false })
              }
            >
              Reject non-essential
            </Button>
            <Button onClick={() => applyConsent(prefs)}>Save Preferences</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CookieConsent;
