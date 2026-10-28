import { TIMED_OUT, raceTimeout, readCachedOrgContext, writeCachedOrgContext } from "@/lib/offline/authCache";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import fallbackLogo from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";
import { useOptionalAuth } from "@/hooks/useAuth";
import { useOptionalLab } from "@/contexts/LabContext";
import { getPublicHostname, getPublicSlugCandidate, isDefinitelyPlatformHostname } from "@/lib/publicTenant";

interface OrganizationRecord {
  id: string;
  slug: string;
  display_name: string;
  legal_name: string | null;
  status: string;
  primary_email: string | null;
  primary_phone: string | null;
  billing_email: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  metadata: Record<string, unknown> | null;
}

interface OrganizationLabRecord {
  id: string;
  organization_id: string | null;
  name: string;
  type: string;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  settings: Record<string, unknown> | null;
}

interface OrganizationBranding {
  displayName: string;
  shortName: string;
  secondaryLabel: string;
  tagline: string;
  description: string;
  locationLabel: string;
  phoneNumbers: string[];
  primaryPhone: string;
  email: string;
  website: string;
  addressLines: string[];
  logoUrl: string;
  faviconUrl: string;
  establishedYear: string;
  reportTagline: string;
  reportFooterNote: string;
}

interface OrganizationContextType {
  organization: OrganizationRecord | null;
  primaryLab: OrganizationLabRecord | null;
  branding: OrganizationBranding;
  settings: Record<string, string>;
  resolutionError: string | null;
  loading: boolean;
  refreshOrganization: () => Promise<void>;
}

const DEFAULT_BRANDING: OrganizationBranding = {
  displayName: "Diagnostic Laboratory",
  shortName: "Diagnostic",
  secondaryLabel: "Laboratory",
  tagline: "Trusted diagnostic services",
  description:
    "Accurate and reliable pathological diagnostic services with patient-focused care.",
  locationLabel: "Your City",
  phoneNumbers: ["+91-0000000000"],
  primaryPhone: "+91-0000000000",
  email: "support@example.com",
  website: "https://example.com",
  addressLines: ["Laboratory Address", "City, State", "Postal Code"],
  logoUrl: fallbackLogo,
  faviconUrl: "/favicon.png",
  establishedYear: "2000",
  reportTagline: "Quality Healthcare Services",
  reportFooterNote: "This is a computer-generated report.",
};

interface OrganizationSettingRecord {
  setting_key: string;
  setting_value: string | null;
}

interface PublicOrganizationContextPayload {
  organization?: OrganizationRecord | null;
  primary_lab?: OrganizationLabRecord | null;
  settings?: Record<string, string | null> | null;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

const splitPhoneNumbers = (value?: string | null) =>
  (value || "")
    .split(/[,/|]/)
    .map((part) => part.trim())
    .filter(Boolean);

const getBrandHeading = (displayName: string) => {
  const trimmed = displayName.trim();
  const suffixes = ["Clinical Laboratory", "Pathology Laboratory", "Laboratory", "Diagnostics", "Diagnostic Centre"];

  for (const suffix of suffixes) {
    if (trimmed.toLowerCase().endsWith(suffix.toLowerCase())) {
      const shortName = trimmed.slice(0, -suffix.length).trim();
      if (shortName) {
        return {
          shortName,
          secondaryLabel: suffix,
        };
      }
    }
  }

  return {
    shortName: trimmed,
    secondaryLabel: "Diagnostic Services",
  };
};

const deriveBranding = (
  organization: OrganizationRecord | null,
  primaryLab: OrganizationLabRecord | null,
  settingsMap: Map<string, string>
): OrganizationBranding => {
  const displayName = organization?.display_name || primaryLab?.name || DEFAULT_BRANDING.displayName;
  const { shortName, secondaryLabel } = getBrandHeading(displayName);

  const phoneNumbers = splitPhoneNumbers(primaryLab?.phone || organization?.primary_phone);
  const addressLines = primaryLab
    ? [
        primaryLab.address,
        [primaryLab.city, primaryLab.state].filter(Boolean).join(", "),
        primaryLab.pincode,
      ].filter((value): value is string => Boolean(value && value.trim()))
    : DEFAULT_BRANDING.addressLines;

  const locationLabel =
    [primaryLab?.city, primaryLab?.state].filter(Boolean).join(", ") || DEFAULT_BRANDING.locationLabel;

  const metadata = organization?.metadata || {};
  const labSettings = primaryLab?.settings || {};
  const resolvedWebsite =
    settingsMap.get("organization_website") ||
    (typeof window !== "undefined" ? window.location.origin : DEFAULT_BRANDING.website);
  const establishedYear = String(
    settingsMap.get("branding_established_year") ||
    metadata.established_year ||
      labSettings.established_year ||
      DEFAULT_BRANDING.establishedYear
  );

  return {
    displayName,
    shortName,
    secondaryLabel,
    tagline:
      settingsMap.get("branding_tagline") ||
      (typeof metadata.tagline === "string" && metadata.tagline) ||
      (typeof labSettings.tagline === "string" && labSettings.tagline) ||
      DEFAULT_BRANDING.tagline,
    description:
      settingsMap.get("branding_description") ||
      (typeof metadata.description === "string" && metadata.description) ||
      `${displayName} offers accurate and reliable diagnostic testing${
        locationLabel ? ` in ${locationLabel}` : ""
      }.`,
    locationLabel,
    phoneNumbers: phoneNumbers.length > 0 ? phoneNumbers : DEFAULT_BRANDING.phoneNumbers,
    primaryPhone: phoneNumbers[0] || DEFAULT_BRANDING.primaryPhone,
    email: primaryLab?.email || organization?.primary_email || DEFAULT_BRANDING.email,
    website: resolvedWebsite,
    addressLines: addressLines.length > 0 ? addressLines : DEFAULT_BRANDING.addressLines,
    logoUrl:
      primaryLab?.logo_url ||
      organization?.logo_url ||
      import.meta.env.VITE_PUBLIC_LOGO_URL ||
      DEFAULT_BRANDING.logoUrl,
    faviconUrl: organization?.favicon_url || DEFAULT_BRANDING.faviconUrl,
    establishedYear,
    reportTagline: settingsMap.get("report_tagline") || DEFAULT_BRANDING.reportTagline,
    reportFooterNote: settingsMap.get("report_footer_note") || DEFAULT_BRANDING.reportFooterNote,
  };
};

/** How long to wait for the workspace lookup when the last answer is already remembered. */
const ORG_LOOKUP_TIMEOUT_MS = 4000;

export const OrganizationProvider = ({ children }: { children: ReactNode }) => {
  const authContext = useOptionalAuth();
  const labContext = useOptionalLab();
  const user = authContext?.user ?? null;
  const authLoading = authContext?.loading ?? false;
  const currentLab = labContext?.currentLab ?? null;
  const labLoading = labContext?.loading ?? false;
  const [organization, setOrganization] = useState<OrganizationRecord | null>(null);
  const [primaryLab, setPrimaryLab] = useState<OrganizationLabRecord | null>(null);
  const [organizationSettings, setOrganizationSettings] = useState<Map<string, string>>(new Map());
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrganization = useCallback(async () => {
    // The lab list is only needed when the workspace can't be identified from the address.
    // If we remember this workspace, don't wait for it (it can be stuck behind a refresh).
    const startHostname = getPublicHostname();
    const rememberedWorkspace = Boolean(
      readCachedOrgContext<unknown>(getPublicSlugCandidate(startHostname) ?? startHostname ?? ""),
    );
    if (authLoading || (labLoading && !rememberedWorkspace)) return;

    setLoading(true);
    setResolutionError(null);

    try {
      let resolvedOrganization: OrganizationRecord | null = null;
      let resolvedLab: OrganizationLabRecord | null = null;
      let organizationId: string | null = null;
      let resolvedSettings = new Map<string, string>();

      // Step 1: Always resolve org from the current subdomain/hostname first.
      // This ensures that visiting acme.irmlab.com shows ACME's org context,
      // not the logged-in user's own org. Falls through gracefully when there
      // is no subdomain (e.g. localhost with no prefix).
      const hostname = getPublicHostname();
      const slugCandidate = getPublicSlugCandidate(hostname);
      const isCustomDomain = !isDefinitelyPlatformHostname(hostname) && !slugCandidate;
      if (slugCandidate || isCustomDomain) {
        const orgCacheKey = slugCandidate ?? hostname ?? "";
        let usedRememberedWorkspace = false;
        const rememberedContext = readCachedOrgContext<unknown>(orgCacheKey);
        const rpcCall = supabase.rpc(
          "get_public_organization_context" as any,
          { _domain: hostname, _slug: slugCandidate ?? null }
        );
        // With a remembered workspace, don't make the app wait on a slow or unreachable server.
        const rpcOutcome = rememberedContext ? await raceTimeout(rpcCall, ORG_LOOKUP_TIMEOUT_MS) : await rpcCall;
        const rpcResult =
          rpcOutcome === TIMED_OUT
            ? { data: null, error: { message: "Timed out reaching the server" } as { message: string } | null }
            : rpcOutcome;
        let publicContext = rpcResult.data;
        let publicContextError = rpcResult.error;
        if (!publicContextError && publicContext) {
          writeCachedOrgContext(orgCacheKey, publicContext);
        } else if (publicContextError) {
          // Server unreachable: use the last workspace details we saw so the app still opens.
          const remembered = readCachedOrgContext<typeof publicContext>(orgCacheKey);
          if (remembered) {
            publicContext = remembered;
            publicContextError = null;
            usedRememberedWorkspace = true;
          }
        }
        if (publicContextError) {
          setResolutionError(publicContextError.message || "Unable to resolve the tenant workspace.");
        }
        if (!publicContextError && publicContext) {
          const payload = publicContext as unknown as PublicOrganizationContextPayload;
          resolvedOrganization = payload.organization || null;
          resolvedLab = payload.primary_lab || null;
          organizationId = resolvedOrganization?.id || resolvedLab?.organization_id || null;
          resolvedSettings = new Map(
            Object.entries(payload.settings || {}).map(([key, value]) => [key, value || ""])
          );
          if (usedRememberedWorkspace && resolvedOrganization) {
            // The server could not be reached: show the workspace now instead of waiting
            // behind the follow-up queries below. Fresh data replaces this when they finish.
            setOrganization(resolvedOrganization);
            setPrimaryLab(resolvedLab);
            setOrganizationSettings(resolvedSettings);
            setLoading(false);
          }
        }
      }

      // Step 2: No subdomain org found — fall back to the authenticated user's
      // own org (primary lab → organization_users membership).
      if (!organizationId && user) {
        organizationId =
          (currentLab as { organization_id?: string | null } | null)?.organization_id ?? null;

        const { data: membershipData, error: membershipError } = await supabase
          .from("organization_users" as any)
          .select(`
            organization_id,
            is_primary,
            organization:organizations (
              id,
              slug,
              display_name,
              legal_name,
              status,
              primary_email,
              primary_phone,
              billing_email,
              logo_url,
              favicon_url,
              metadata
            )
          `)
          .eq("user_id", user.id)
          .eq("is_active", true)
          .order("is_primary", { ascending: false })
          .limit(1);

        if (!membershipError && membershipData && membershipData.length > 0) {
          const membership = membershipData[0] as unknown as {
            organization_id: string;
            organization?: OrganizationRecord | null;
          };
          organizationId = organizationId || membership.organization_id;
          resolvedOrganization = membership.organization || null;
        }

        if (!resolvedOrganization && organizationId) {
          const { data: organizationData, error: organizationError } = await supabase
            .from("organizations" as any)
            .select("id, slug, display_name, legal_name, status, primary_email, primary_phone, billing_email, logo_url, favicon_url, metadata")
            .eq("id", organizationId)
            .maybeSingle();

          if (!organizationError && organizationData) {
            resolvedOrganization = organizationData as unknown as OrganizationRecord;
          }
        }
      }

      if (organizationId && !resolvedLab) {
        const { data: labData, error: labError } = await supabase
          .from("labs")
          .select("id, organization_id, name, type, address, city, state, pincode, phone, email, logo_url, settings")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .order("type", { ascending: true })
          .order("created_at", { ascending: true })
          .limit(1);

        if (!labError && labData && labData.length > 0) {
          resolvedLab = labData[0] as unknown as OrganizationLabRecord;
        }
      }

      if (!organizationId && resolvedLab?.organization_id) {
        organizationId = resolvedLab.organization_id;
      }

      if (!resolvedOrganization && organizationId) {
        const { data: organizationData, error: organizationError } = await supabase
          .from("organizations" as any)
            .select("id, slug, display_name, legal_name, status, primary_email, primary_phone, billing_email, logo_url, favicon_url, metadata")
            .eq("id", organizationId)
            .maybeSingle();

        if (!organizationError && organizationData) {
          resolvedOrganization = organizationData as unknown as OrganizationRecord;
        }
      }

      if (organizationId && resolvedSettings.size === 0) {
        const { data: settingsData, error: settingsError } = await supabase
          .from("organization_settings" as any)
          .select("setting_key, setting_value")
          .eq("organization_id", organizationId)
          .in("setting_key", [
            "branding_tagline",
            "branding_description",
            "branding_established_year",
            "organization_website",
            "report_tagline",
            "report_footer_note",
            "report_default_header_template",
            "report_default_footer_template",
            "notification_follow_up_title",
            "notification_follow_up_message",
            "notification_checkup_title",
            "notification_checkup_message",
            "notification_payment_title",
            "notification_payment_message",
            "notification_test_result_title",
            "notification_test_result_message",
            "notification_custom_title",
            "notification_custom_message",
            "email_from_name",
            "email_from_email",
            "email_reply_to",
            "mailjet_api_key",
            "mailjet_secret_key",
            "resend_api_key",
            "mailgun_api_key",
            "mailgun_domain",
            "sendgrid_api_key",
            "plan_tier",
            "razorpay_key_id",
            "phonepe_merchant_id",
            "payu_key",
          ]);

        if (!settingsError && settingsData) {
          resolvedSettings = new Map(
            (settingsData as unknown as OrganizationSettingRecord[]).map((setting) => [
              setting.setting_key,
              setting.setting_value || "",
            ])
          );
        }
      }

      if (organizationId) {
        const needsPaymentGatewayHints = !resolvedSettings.get("razorpay_key_id") && !resolvedSettings.get("phonepe_merchant_id") && !resolvedSettings.get("payu_key");
        if (needsPaymentGatewayHints) {
          const { data: paymentSettingsData, error: paymentSettingsError } = await supabase
            .from("organization_settings" as any)
            .select("setting_key, setting_value")
            .eq("organization_id", organizationId)
            .in("setting_key", ["razorpay_key_id", "phonepe_merchant_id", "payu_key"]);

          if (!paymentSettingsError && paymentSettingsData) {
            for (const setting of paymentSettingsData as unknown as OrganizationSettingRecord[]) {
              resolvedSettings.set(setting.setting_key, setting.setting_value || "");
            }
          }
        }
      }

      setOrganization(resolvedOrganization);
      setPrimaryLab(resolvedLab);
      setOrganizationSettings(resolvedSettings);
    } catch (error) {
      console.error("Error fetching organization:", error);
      setResolutionError(error instanceof Error ? error.message : "Unable to resolve the tenant workspace.");
      setOrganization(null);
      setPrimaryLab(null);
      setOrganizationSettings(new Map());
    } finally {
      setLoading(false);
    }
  }, [authLoading, currentLab, labLoading, user]);

  useEffect(() => {
    void fetchOrganization();
  }, [fetchOrganization]);

  useEffect(() => {
    const branding = deriveBranding(organization, primaryLab, organizationSettings);
    const faviconHref = branding.faviconUrl || DEFAULT_BRANDING.faviconUrl;
    if (!faviconHref || typeof document === "undefined") {
      return;
    }

    document
      .querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]')
      .forEach((link) => {
        link.href = faviconHref;
      });
  }, [organization, primaryLab, organizationSettings]);

  return (
    <OrganizationContext.Provider
      value={{
        organization,
        primaryLab,
        branding: deriveBranding(organization, primaryLab, organizationSettings),
        settings: Object.fromEntries(organizationSettings.entries()),
        resolutionError,
        loading,
        refreshOrganization: fetchOrganization,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
};

export const useOrganization = () => {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error("useOrganization must be used within an OrganizationProvider");
  }
  return context;
};

export const useOptionalOrganization = () => useContext(OrganizationContext);
