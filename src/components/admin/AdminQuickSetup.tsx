import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FlaskConical,
  Globe2,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Palette,
  Settings2,
  Save,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/contexts/OrganizationContext";
import AdminSetupChecklist from "@/components/admin/AdminSetupChecklist";

type QuickSetupForm = {
  displayName: string;
  logoUrl: string;
  tagline: string;
  description: string;
  website: string;
  customDomain: string;
  labName: string;
  labEmail: string;
  labPhone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  abdmEnabled: string;
  abdmFacilityId: string;
  emailFromName: string;
  emailFromEmail: string;
  whatsappEnabled: string;
  whatsappPhoneNumberId: string;
  razorpayKeyId: string;
};

const emptyForm: QuickSetupForm = {
  displayName: "",
  logoUrl: "",
  tagline: "",
  description: "",
  website: "",
  customDomain: "",
  labName: "",
  labEmail: "",
  labPhone: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  abdmEnabled: "false",
  abdmFacilityId: "",
  emailFromName: "",
  emailFromEmail: "",
  whatsappEnabled: "false",
  whatsappPhoneNumberId: "",
  razorpayKeyId: "",
};

const settingKeys = [
  "branding_tagline",
  "branding_description",
  "organization_website",
  "email_from_name",
  "email_from_email",
  "whatsapp_enabled",
  "whatsapp_phone_number_id",
  "razorpay_key_id",
  "phonepe_merchant_id",
] as const;

const STARTER_CATALOG = [
  {
    category: {
      name: "Hematology",
      description: "Core blood-count and related pathology tests commonly offered at the front desk.",
    },
    tests: [
      {
        name: "Complete Blood Count (CBC)",
        test_id: "CBC",
        description: "Basic blood count panel used for routine diagnostic screening.",
        sample_type: "Blood",
      },
      {
        name: "Hemoglobin",
        test_id: "HB",
        description: "Hemoglobin estimation for anemia and routine screening.",
        sample_type: "Blood",
      },
    ],
  },
  {
    category: {
      name: "Biochemistry",
      description: "Common chemistry tests used in day-to-day outpatient and preventive care workflows.",
    },
    tests: [
      {
        name: "Fasting Blood Sugar",
        test_id: "FBS",
        description: "Routine glucose screening for metabolic and diabetic assessment.",
        sample_type: "Blood",
      },
      {
        name: "HbA1c",
        test_id: "HBA1C",
        description: "Average glucose control marker used in diabetic follow-up.",
        sample_type: "Blood",
      },
      {
        name: "Liver Function Test",
        test_id: "LFT",
        description: "Panel covering key liver enzymes and related chemistry markers.",
        sample_type: "Blood",
      },
      {
        name: "Lipid Profile",
        test_id: "LIPID",
        description: "Cholesterol and triglyceride screening panel for cardiovascular risk review.",
        sample_type: "Blood",
      },
    ],
  },
  {
    category: {
      name: "Endocrinology",
      description: "Hormone and thyroid-related tests that are commonly requested in outpatient diagnostics.",
    },
    tests: [
      {
        name: "TSH",
        test_id: "TSH",
        description: "Thyroid stimulating hormone test for thyroid screening and follow-up.",
        sample_type: "Blood",
      },
    ],
  },
] as const;

const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
};

const normalizeDomain = (value: string) => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    return trimmed.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  }
};

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
    recordType: isApexDomain ? "ALIAS / ANAME" : "CNAME",
    hostLabel: isApexDomain ? "@" : labels[0],
    target: PAGES_CNAME_TARGET,
    isApexDomain,
  };
};

type OrganizationDomainRecord = {
  id: string;
  domain: string;
  is_primary: boolean;
  verified_at: string | null;
};

type AdminQuickSetupProps = {
  onNavigate?: (tabId: string) => void;
};

const AdminQuickSetup = ({ onNavigate }: AdminQuickSetupProps) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { organization, primaryLab, refreshOrganization, loading: organizationLoading } = useOrganization();
  const [formData, setFormData] = useState<QuickSetupForm>(emptyForm);
  const [domainRecords, setDomainRecords] = useState<OrganizationDomainRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seedingStarterCatalog, setSeedingStarterCatalog] = useState(false);
  const [verifyingDomain, setVerifyingDomain] = useState(false);
  const [dnsCheckStatus, setDnsCheckStatus] = useState<"idle" | "checking" | "connected" | "not_connected">("idle");
  const [dnsCheckCname, setDnsCheckCname] = useState<string | null>(null);

  const populateForm = useCallback(async () => {
    if (organizationLoading) {
      return;
    }

    if (!organization?.id) {
      setFormData(emptyForm);
      setDomainRecords([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [settingsResponse, domainsResponse] = await Promise.all([
        supabase
          .from("organization_settings" as any)
          .select("setting_key, setting_value")
          .eq("organization_id", organization.id)
          .in("setting_key", [...settingKeys]),
        supabase
          .from("organization_domains" as any)
          .select("id, domain, is_primary, verified_at")
          .eq("organization_id", organization.id)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: true }),
      ]);

      const { data: settingsData, error: settingsError } = settingsResponse;
      const { data: domainsData, error: domainsError } = domainsResponse;

      if (settingsError) {
        throw settingsError;
      }
      if (domainsError) {
        throw domainsError;
      }

      const settingsMap = new Map<string, string>(
        ((((settingsData as unknown as { setting_key: string; setting_value: string | null }[] | null) || []).map((item) => [
          item.setting_key,
          item.setting_value || "",
        ])))
      );
      const primaryLabSettings =
        primaryLab?.settings && typeof primaryLab.settings === "object"
          ? (primaryLab.settings as Record<string, unknown>)
          : {};
      const domains = ((domainsData as unknown as OrganizationDomainRecord[] | null) || []);
      setDomainRecords(domains);
      const configuredBaseDomain = import.meta.env.VITE_PUBLIC_BASE_DOMAIN?.trim().toLowerCase() || "labshope.com";
      const expectedFallbackDomain = organization.slug
        ? `${organization.slug}.${configuredBaseDomain}`
        : "";
      const existingCustomDomain =
        domains.find((domain) => domain.is_primary && domain.domain !== expectedFallbackDomain)?.domain ||
        domains.find((domain) => domain.domain !== expectedFallbackDomain)?.domain ||
        "";

      setFormData({
        displayName: organization.display_name || "",
        logoUrl: organization.logo_url || primaryLab?.logo_url || "",
        tagline: settingsMap.get("branding_tagline") || "",
        description: settingsMap.get("branding_description") || "",
        website: settingsMap.get("organization_website") || "",
        customDomain: existingCustomDomain,
        labName: primaryLab?.name || "",
        labEmail: primaryLab?.email || "",
        labPhone: primaryLab?.phone || "",
        address: primaryLab?.address || "",
        city: primaryLab?.city || "",
        state: primaryLab?.state || "",
        pincode: primaryLab?.pincode || "",
        abdmEnabled:
          typeof primaryLabSettings.abdm_enabled === "boolean"
            ? String(primaryLabSettings.abdm_enabled)
            : typeof primaryLabSettings.abdm_enabled === "string"
              ? primaryLabSettings.abdm_enabled
              : "false",
        abdmFacilityId:
          typeof primaryLabSettings.abdm_facility_id === "string"
            ? primaryLabSettings.abdm_facility_id
            : "",
        emailFromName: settingsMap.get("email_from_name") || "",
        emailFromEmail: settingsMap.get("email_from_email") || "",
        whatsappEnabled: settingsMap.get("whatsapp_enabled") || "false",
        whatsappPhoneNumberId: settingsMap.get("whatsapp_phone_number_id") || "",
        razorpayKeyId: settingsMap.get("razorpay_key_id") || "",
      });
    } catch (error) {
      console.error("Error loading quick setup data:", error);
      toast.error("Failed to load quick setup.");
    } finally {
      setLoading(false);
    }
  }, [organization?.id, organization?.display_name, organization?.logo_url, organization?.slug, organizationLoading, primaryLab]);

  useEffect(() => {
    void populateForm();
  }, [populateForm]);

  const setupChecks = useMemo(() => {
    return [
      Boolean(formData.displayName.trim() && (formData.logoUrl.trim() || formData.tagline.trim())),
      Boolean(formData.labPhone.trim() && formData.address.trim() && formData.city.trim()),
      Boolean(formData.website.trim()),
      Boolean(formData.emailFromName.trim() || formData.emailFromEmail.trim()),
      Boolean(formData.whatsappPhoneNumberId.trim() || formData.razorpayKeyId.trim()),
    ];
  }, [formData]);

  const progressValue = Math.round(
    (setupChecks.filter(Boolean).length / setupChecks.length) * 100
  );
  const onboardingMode = searchParams.get("onboarding") === "1";
  const normalizedWebsite = normalizeUrl(formData.website);
  const configuredBaseDomain = import.meta.env.VITE_PUBLIC_BASE_DOMAIN?.trim().toLowerCase();
  const expectedFallbackDomain = useMemo(() => {
    if (!organization?.slug) {
      return "";
    }

    return `${organization.slug}.${configuredBaseDomain || "labshope.com"}`;
  }, [configuredBaseDomain, organization?.slug]);
  const normalizedCustomDomain = normalizeDomain(formData.customDomain);
  const fallbackDomainRecord = useMemo(
    () =>
      domainRecords.find((domain) => domain.domain === expectedFallbackDomain) ||
      domainRecords.find((domain) => !domain.is_primary) ||
      null,
    [domainRecords, expectedFallbackDomain]
  );
  const primaryDomainRecord = useMemo(
    () => domainRecords.find((domain) => domain.is_primary) || null,
    [domainRecords]
  );
  const customDomainRecord = useMemo(
    () => domainRecords.find((domain) => domain.domain === normalizedCustomDomain) || null,
    [domainRecords, normalizedCustomDomain]
  );
  const launchAccessDomain = fallbackDomainRecord?.domain || expectedFallbackDomain || primaryDomainRecord?.domain || "";
  const primaryPublicDomain = primaryDomainRecord?.domain || normalizedCustomDomain || launchAccessDomain;
  const customDomainStatus = normalizedCustomDomain
    ? customDomainRecord?.verified_at
      ? "Connected"
      : "Pending DNS"
    : "Using fallback domain";
  const dnsGuide = useMemo(
    () => getDnsGuide(normalizedCustomDomain, launchAccessDomain),
    [launchAccessDomain, normalizedCustomDomain]
  );
  const launchBaseUrl = useMemo(() => {
    if (typeof window === "undefined" || !organization?.slug) {
      return "";
    }

    const preferredLaunchHost =
      primaryDomainRecord?.verified_at && primaryDomainRecord.domain
        ? primaryDomainRecord.domain
        : launchAccessDomain;

    if (!preferredLaunchHost) {
      return normalizedWebsite ? normalizedWebsite.replace(/\/$/, "") : "";
    }

    const isLocalHost = preferredLaunchHost.endsWith(".localhost") || preferredLaunchHost === "localhost";
    return `${isLocalHost ? "http" : "https"}://${preferredLaunchHost}${isLocalHost ? ":8080" : ""}`;
  }, [launchAccessDomain, normalizedWebsite, organization?.slug, primaryDomainRecord]);

  const handleChange = (field: keyof QuickSetupForm, value: string) => {
    if (field === "customDomain") {
      setDnsCheckStatus("idle");
      setDnsCheckCname(null);
    }
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async () => {
    if (!organization?.id || !primaryLab?.id) {
      toast.error("Organization context is not available.");
      return;
    }

    if (!formData.displayName.trim()) {
      toast.error("Organization name is required.");
      return;
    }

    if (!formData.labName.trim()) {
      toast.error("Primary lab name is required.");
      return;
    }

    setSaving(true);
    try {
      const normalizedWebsite = normalizeUrl(formData.website);
      const normalizedCustomDomain = normalizeDomain(formData.customDomain);

      const organizationUpdate = supabase
        .from("organizations" as any)
        .update({
          display_name: formData.displayName.trim(),
          logo_url: formData.logoUrl.trim() || null,
          primary_email: formData.labEmail.trim() || organization.primary_email || null,
          primary_phone: formData.labPhone.trim() || organization.primary_phone || null,
        })
        .eq("id", organization.id);

      const labUpdate = (supabase as any)
        .from("labs")
        .update({
          name: formData.labName.trim(),
          logo_url: formData.logoUrl.trim() || null,
          email: formData.labEmail.trim() || null,
          phone: formData.labPhone.trim() || null,
          address: formData.address.trim() || null,
          city: formData.city.trim() || null,
          state: formData.state.trim() || null,
          pincode: formData.pincode.trim() || null,
          settings: {
            ...(primaryLab?.settings && typeof primaryLab.settings === "object" ? primaryLab.settings : {}),
            abdm_enabled: formData.abdmEnabled === "true",
            abdm_facility_id: formData.abdmFacilityId.trim() || null,
          },
        } as any)
        .eq("id", primaryLab.id)
        .eq("organization_id" as any, organization.id);

      const settingsPayload = [
        {
          organization_id: organization.id,
          setting_key: "branding_tagline",
          setting_value: formData.tagline.trim() || null,
          setting_type: "text",
          category: "general",
          label: "Brand Tagline",
          description: "Short public-facing tagline used across the site and report header.",
          is_encrypted: false,
          updated_by: user?.id,
        },
        {
          organization_id: organization.id,
          setting_key: "branding_description",
          setting_value: formData.description.trim() || null,
          setting_type: "text",
          category: "general",
          label: "Brand Description",
          description: "Longer organization description used in marketing and landing page sections.",
          is_encrypted: false,
          updated_by: user?.id,
        },
        {
          organization_id: organization.id,
          setting_key: "organization_website",
          setting_value: normalizedWebsite || null,
          setting_type: "text",
          category: "general",
          label: "Website URL",
          description: "Canonical public website URL for the organization.",
          is_encrypted: false,
          updated_by: user?.id,
        },
        {
          organization_id: organization.id,
          setting_key: "email_from_name",
          setting_value: formData.emailFromName.trim() || null,
          setting_type: "text",
          category: "email",
          label: "Sender Name",
          description: "Displayed as the sender name for patient emails from this organization.",
          is_encrypted: false,
          updated_by: user?.id,
        },
        {
          organization_id: organization.id,
          setting_key: "email_from_email",
          setting_value: formData.emailFromEmail.trim() || null,
          setting_type: "text",
          category: "email",
          label: "Sender Email",
          description: "Optional verified sender address for this organization.",
          is_encrypted: false,
          updated_by: user?.id,
        },
        {
          organization_id: organization.id,
          setting_key: "whatsapp_enabled",
          setting_value: formData.whatsappEnabled,
          setting_type: "boolean",
          category: "whatsapp",
          label: "WhatsApp Enabled",
          description: "Turn on WhatsApp delivery for OTP and notification flows for this organization.",
          is_encrypted: false,
          updated_by: user?.id,
        },
        {
          organization_id: organization.id,
          setting_key: "whatsapp_phone_number_id",
          setting_value: formData.whatsappPhoneNumberId.trim() || null,
          setting_type: "text",
          category: "whatsapp",
          label: "WhatsApp Phone Number ID",
          description: "Meta WhatsApp phone number ID used for this organization's outbound sends and inbound webhook routing.",
          is_encrypted: false,
          updated_by: user?.id,
        },
        {
          organization_id: organization.id,
          setting_key: "razorpay_key_id",
          setting_value: formData.razorpayKeyId.trim() || null,
          setting_type: "text",
          category: "payment",
          label: "Razorpay Key ID",
          description: "Razorpay key ID for this organization.",
          is_encrypted: false,
          updated_by: user?.id,
        },
      ];

      const settingsUpsert = supabase
        .from("organization_settings" as any)
        .upsert(settingsPayload, { onConflict: "organization_id,setting_key" });
      const domainMutations: PromiseLike<{ error: Error | null }>[] = [];
      const existingDomains = [...domainRecords];
      const fallbackDomain = expectedFallbackDomain || "";
      const fallbackRecord = existingDomains.find((domain) => domain.domain === fallbackDomain);
      const currentPrimaryCustomDomain = existingDomains.find(
        (domain) => domain.is_primary && domain.domain !== fallbackDomain
      );

      if (fallbackDomain) {
        if (fallbackRecord) {
          domainMutations.push(
            supabase
              .from("organization_domains" as any)
              .update({ is_primary: !normalizedCustomDomain })
              .eq("id", fallbackRecord.id)
          );
        } else {
          domainMutations.push(
            supabase.from("organization_domains" as any).insert({
              organization_id: organization.id,
              domain: fallbackDomain,
              is_primary: !normalizedCustomDomain,
            })
          );
        }
      }

      if (normalizedCustomDomain) {
        const existingCustomRecord = existingDomains.find((domain) => domain.domain === normalizedCustomDomain);

        if (currentPrimaryCustomDomain && currentPrimaryCustomDomain.domain !== normalizedCustomDomain) {
          domainMutations.push(
            supabase
              .from("organization_domains" as any)
              .update({ is_primary: false })
              .eq("id", currentPrimaryCustomDomain.id)
          );
        }

        if (existingCustomRecord) {
          domainMutations.push(
            supabase
              .from("organization_domains" as any)
              .update({ is_primary: true })
              .eq("id", existingCustomRecord.id)
          );
        } else {
          domainMutations.push(
            supabase.from("organization_domains" as any).insert({
              organization_id: organization.id,
              domain: normalizedCustomDomain,
              is_primary: true,
            })
          );
        }
      } else if (currentPrimaryCustomDomain) {
        domainMutations.push(
          supabase
            .from("organization_domains" as any)
            .update({ is_primary: false })
            .eq("id", currentPrimaryCustomDomain.id)
        );
      }

      const [organizationResult, labResult, settingsResult, ...domainResults] = await Promise.all([
        organizationUpdate,
        labUpdate,
        settingsUpsert,
        ...domainMutations,
      ]);

      if (organizationResult.error) {
        throw organizationResult.error;
      }
      if (labResult.error) {
        throw labResult.error;
      }
      if (settingsResult.error) {
        throw settingsResult.error;
      }
      for (const result of domainResults) {
        if (result.error) {
          throw result.error;
        }
      }

      await refreshOrganization();
      await populateForm();
      toast.success("Quick setup saved.");
    } catch (error: any) {
      console.error("Error saving quick setup:", error);
      toast.error(error.message || "Failed to save quick setup.");
    } finally {
      setSaving(false);
    }
  };

  const handleSeedStarterCatalog = async () => {
    if (!organization?.id) {
      toast.error("Organization context is not available.");
      return;
    }

    setSeedingStarterCatalog(true);
    try {
      const starterCategoryNames = STARTER_CATALOG.map((entry) => entry.category.name);
      const starterTestNames = STARTER_CATALOG.flatMap((entry) => entry.tests.map((test) => test.name));

      const [existingCategoriesResponse, existingTestsResponse] = await Promise.all([
        supabase
          .from("test_categories")
          .select("id, name")
          .eq("organization_id", organization.id)
          .in("name", starterCategoryNames),
        supabase
          .from("tests")
          .select("id, name, category_id")
          .eq("organization_id", organization.id)
          .in("name", starterTestNames),
      ]);

      if (existingCategoriesResponse.error) {
        throw existingCategoriesResponse.error;
      }
      if (existingTestsResponse.error) {
        throw existingTestsResponse.error;
      }

      const existingCategories = new Map(
        (((existingCategoriesResponse.data as Array<{ id: string; name: string }> | null) || []).map((category) => [
          category.name,
          category.id,
        ]))
      );
      const existingTestNames = new Set(
        (((existingTestsResponse.data as Array<{ name: string }> | null) || []).map((test) => test.name))
      );

      const categoriesToInsert = STARTER_CATALOG
        .filter((entry) => !existingCategories.has(entry.category.name))
        .map((entry) => ({
          name: entry.category.name,
          description: entry.category.description,
          organization_id: organization.id,
        }));

      if (categoriesToInsert.length > 0) {
        const { data: insertedCategories, error: insertCategoriesError } = await supabase
          .from("test_categories")
          .insert(categoriesToInsert)
          .select("id, name");

        if (insertCategoriesError) {
          throw insertCategoriesError;
        }

        for (const category of (insertedCategories as Array<{ id: string; name: string }> | null) || []) {
          existingCategories.set(category.name, category.id);
        }
      }

      const testsToInsert = STARTER_CATALOG.flatMap((entry) => {
        const categoryId = existingCategories.get(entry.category.name);
        if (!categoryId) {
          return [];
        }

        return entry.tests
          .filter((test) => !existingTestNames.has(test.name))
          .map((test) => ({
            organization_id: organization.id,
            category_id: categoryId,
            name: test.name,
            test_id: test.test_id,
            description: `${test.description} Review pricing, ranges, and panel items before going live.`,
            sample_type: test.sample_type,
            price: null,
          }));
      });

      if (testsToInsert.length > 0) {
        const { error: insertTestsError } = await supabase
          .from("tests")
          .insert(testsToInsert as any[]);

        if (insertTestsError) {
          throw insertTestsError;
        }
      }

      const insertedCategoryCount = categoriesToInsert.length;
      const insertedTestCount = testsToInsert.length;

      if (insertedCategoryCount === 0 && insertedTestCount === 0) {
        toast.success("Starter catalog is already loaded for this organization.");
      } else {
        toast.success(
          `Starter catalog loaded: ${insertedCategoryCount} categories and ${insertedTestCount} tests added.`
        );
      }
    } catch (error: any) {
      console.error("Error seeding starter catalog:", error);
      toast.error(error.message || "Failed to load starter catalog.");
    } finally {
      setSeedingStarterCatalog(false);
    }
  };

  const handleToggleDomainVerification = async () => {
    if (!organization?.id) {
      toast.error("Organization context is not available.");
      return;
    }

    if (!normalizedCustomDomain) {
      toast.error("Enter a custom domain first.");
      return;
    }

    if (!customDomainRecord?.id) {
      toast.error("Save Quick Setup before verifying the custom domain.");
      return;
    }

    setVerifyingDomain(true);
    try {
      const nextVerifiedAt = customDomainRecord.verified_at ? null : new Date().toISOString();
      const { error } = await supabase
        .from("organization_domains" as any)
        .update({ verified_at: nextVerifiedAt })
        .eq("id", customDomainRecord.id)
        .eq("organization_id", organization.id);

      if (error) {
        throw error;
      }

      await refreshOrganization();
      await populateForm();
      toast.success(nextVerifiedAt ? "Custom domain marked live." : "Custom domain moved back to pending.");
    } catch (error: any) {
      console.error("Error updating custom domain verification:", error);
      toast.error(error.message || "Failed to update custom domain status.");
    } finally {
      setVerifyingDomain(false);
    }
  };

  const handleCheckDns = async () => {
    if (!normalizedCustomDomain) return;
    setDnsCheckStatus("checking");
    setDnsCheckCname(null);
    try {
      const domainToCheck = dnsGuide?.isApexDomain ? `www.${normalizedCustomDomain}` : normalizedCustomDomain;
      const { data, error } = await supabase.functions.invoke("check-domain-dns", {
        body: { domain: domainToCheck },
      });
      if (error) throw error;
      setDnsCheckCname(data?.cname || null);
      if (data?.connected) {
        setDnsCheckStatus("connected");
        // Register domain with Cloudflare Pages (idempotent — safe to call repeatedly)
        supabase.functions.invoke("register-pages-domain", {
          body: { domain: normalizedCustomDomain },
        }).catch((err) => {
          console.warn("Cloudflare Pages domain registration failed (non-blocking):", err);
        });
        if (customDomainRecord?.id && !customDomainRecord.verified_at) {
          await handleToggleDomainVerification();
        }
      } else {
        setDnsCheckStatus("not_connected");
      }
    } catch {
      setDnsCheckStatus("not_connected");
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Loading quick setup...</div>;
  }

  return (
    <div className="space-y-6">
      <AdminSetupChecklist onNavigate={onNavigate} />
      {onboardingMode ? (
        <div className="rounded-[2rem] border border-clinical-blue/20 bg-[linear-gradient(135deg,rgba(31,138,205,0.1),rgba(255,255,255,0.98))] p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2">
                <Badge className="bg-clinical-blue text-white hover:bg-clinical-blue">Owner onboarding</Badge>
                <Badge variant="outline">Start here</Badge>
              </div>
              <h2 className="mt-3 font-heading text-2xl font-bold text-foreground">
                Your workspace is ready. Finish the launch-critical details first.
              </h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                Save the public identity, contact details, and communication settings on this page, then move straight
                into test catalog, templates, and staff setup.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => launchBaseUrl && window.open(launchBaseUrl, "_blank", "noopener,noreferrer")}
                disabled={!launchBaseUrl}
              >
                Preview site
              </Button>
              <Button
                onClick={() => launchBaseUrl && window.open(`${launchBaseUrl}/book-test`, "_blank", "noopener,noreferrer")}
                disabled={!launchBaseUrl}
              >
                Preview booking
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-heading text-2xl font-bold text-clinical-navy">Quick Setup</h2>
          <p className="text-muted-foreground">
            Finish the launch-critical fields from one screen instead of jumping between labs and settings.
          </p>
        </div>
        <div className="min-w-[240px] rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span>Go-live progress</span>
            <span>{progressValue}%</span>
          </div>
          <Progress value={progressValue} className="mt-3 h-2" />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Card className="border-0 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-primary" />
                Brand and public identity
              </CardTitle>
              <CardDescription>
                These values shape the tenant homepage, reports, and public trust signals.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="quick-display-name">Organization name</Label>
                <Input
                  id="quick-display-name"
                  value={formData.displayName}
                  onChange={(event) => handleChange("displayName", event.target.value)}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="quick-logo-url">Logo URL</Label>
                <Input
                  id="quick-logo-url"
                  value={formData.logoUrl}
                  onChange={(event) => handleChange("logoUrl", event.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="quick-tagline">Tagline</Label>
                <Input
                  id="quick-tagline"
                  value={formData.tagline}
                  onChange={(event) => handleChange("tagline", event.target.value)}
                  placeholder="Trusted diagnostic services"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="quick-description">Description</Label>
                <Textarea
                  id="quick-description"
                  value={formData.description}
                  onChange={(event) => handleChange("description", event.target.value)}
                  rows={4}
                  placeholder="What patients and lab partners should understand about this organization."
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="quick-website">Public website URL</Label>
                <Input
                  id="quick-website"
                  value={formData.website}
                  onChange={(event) => handleChange("website", event.target.value)}
                  placeholder="https://your-lab.example.com"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe2 className="h-5 w-5 text-primary" />
                Domain connection
              </CardTitle>
              <CardDescription>
                Use your own domain as the primary public address. Keep the fallback launch domain active until DNS is ready.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <p className="text-sm text-muted-foreground">Primary public domain</p>
                  <p className="mt-2 break-all font-medium text-foreground">{primaryPublicDomain || "-"}</p>
                  <Badge variant={normalizedCustomDomain ? "outline" : "default"} className="mt-3">
                    {customDomainStatus}
                  </Badge>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <p className="text-sm text-muted-foreground">Fallback launch domain</p>
                  <p className="mt-2 break-all font-medium text-foreground">{launchAccessDomain || "-"}</p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    This stays usable while DNS is being connected for the primary domain.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="quick-custom-domain">Primary custom domain</Label>
                <Input
                  id="quick-custom-domain"
                  value={formData.customDomain}
                  onChange={(event) => handleChange("customDomain", event.target.value)}
                  placeholder="app.yourlab.com"
                />
                <p className="text-xs text-muted-foreground">
                  Recommended: use a subdomain like <code className="rounded bg-muted px-1 py-0.5">app.yourlab.com</code>.
                  Root domains like <code className="rounded bg-muted px-1 py-0.5">yourlab.com</code> often need
                  provider-specific ALIAS or ANAME support.
                </p>
                {normalizedCustomDomain ? (
                  <div className="rounded-2xl border border-border bg-muted/10 px-4 py-3 space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      {dnsCheckStatus === "connected" || customDomainRecord?.verified_at ? (
                        <div className="flex items-center gap-2 text-sm text-emerald-700">
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          <span>DNS is connected.{dnsCheckCname ? ` Resolves to: ${dnsCheckCname}` : ""}</span>
                        </div>
                      ) : dnsCheckStatus === "not_connected" ? (
                        <div className="flex items-center gap-2 text-sm text-red-600">
                          <XCircle className="h-4 w-4 shrink-0" />
                          <span>
                            No CNAME record found for this domain yet.{dnsCheckCname ? ` Found: ${dnsCheckCname}` : ""}
                          </span>
                        </div>
                      ) : dnsCheckStatus === "checking" ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                          <span>Checking DNS...</span>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          {customDomainRecord?.id
                            ? "Click Check DNS to verify the domain is pointing correctly."
                            : "Save Quick Setup first so the domain is stored before checking."}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void handleCheckDns()}
                        disabled={dnsCheckStatus === "checking" || !customDomainRecord?.id}
                      >
                        {dnsCheckStatus === "checking" ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Globe2 className="mr-2 h-4 w-4" />
                        )}
                        Check DNS
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={customDomainRecord?.verified_at ? "outline" : "ghost"}
                        onClick={() => void handleToggleDomainVerification()}
                        disabled={verifyingDomain || !customDomainRecord?.id}
                      >
                        <BadgeCheck className="mr-2 h-4 w-4" />
                        {customDomainRecord?.verified_at ? "Mark pending" : "Mark live manually"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                The customer must update DNS at their registrar or DNS provider. Until that is done, the fallback
                launch domain should remain the working access point.
              </div>

              <div className="rounded-2xl border border-border bg-background p-4">
                <p className="font-medium text-foreground">DNS steps</p>
                <div className="mt-3 space-y-3 text-sm leading-7 text-muted-foreground">
                  <p>1. Ask the customer to create a DNS record for their chosen custom domain.</p>
                  <p>
                    2. Recommended record: <span className="font-medium text-foreground">CNAME</span> pointing their
                    custom subdomain to <span className="font-medium text-foreground">{launchAccessDomain || "the fallback launch domain"}</span>.
                  </p>
                  <p>3. Wait for DNS propagation at their provider.</p>
                  <p>4. Keep the fallback launch domain active until the custom domain is confirmed live.</p>
                </div>
              </div>

              {dnsGuide ? (
                <div className="rounded-2xl border border-border bg-background p-4">
                  <p className="font-medium text-foreground">Recommended DNS record</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
                      <p className="text-sm text-muted-foreground">Record type</p>
                      <p className="mt-1 font-medium text-foreground">{dnsGuide.recordType}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
                      <p className="text-sm text-muted-foreground">Host / Name</p>
                      <p className="mt-1 font-medium text-foreground">{dnsGuide.hostLabel}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
                      <p className="text-sm text-muted-foreground">Target</p>
                      <p className="mt-1 break-all font-medium text-foreground">{dnsGuide.target}</p>
                    </div>
                  </div>
                  {dnsGuide.isApexDomain ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Root/apex domains often need provider-specific `ALIAS` or `ANAME` support instead of a plain `CNAME`.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Primary lab contact details
              </CardTitle>
              <CardDescription>
                Patients should not see placeholder contact data on day one.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="quick-lab-name">Primary lab name</Label>
                <Input
                  id="quick-lab-name"
                  value={formData.labName}
                  onChange={(event) => handleChange("labName", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-lab-email">Email</Label>
                <Input
                  id="quick-lab-email"
                  value={formData.labEmail}
                  onChange={(event) => handleChange("labEmail", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-lab-phone">Phone</Label>
                <Input
                  id="quick-lab-phone"
                  value={formData.labPhone}
                  onChange={(event) => handleChange("labPhone", event.target.value)}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="quick-address">Address</Label>
                <Textarea
                  id="quick-address"
                  value={formData.address}
                  onChange={(event) => handleChange("address", event.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-city">City</Label>
                <Input
                  id="quick-city"
                  value={formData.city}
                  onChange={(event) => handleChange("city", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-state">State</Label>
                <Input
                  id="quick-state"
                  value={formData.state}
                  onChange={(event) => handleChange("state", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-pincode">Pincode</Label>
                <Input
                  id="quick-pincode"
                  value={formData.pincode}
                  onChange={(event) => handleChange("pincode", event.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                ABDM for this lab
              </CardTitle>
              <CardDescription>
                Keep ABDM credentials in organization settings, then map the facility or HFR ID for this branch here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border bg-muted/20 p-4 text-sm leading-7 text-muted-foreground">
                Most labs only need two decisions here: whether this branch should use ABDM, and which facility ID
                ABDM should use when staff run patient intake from this lab.
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="quick-abdm-enabled">Use ABDM for this lab</Label>
                  <select
                    id="quick-abdm-enabled"
                    value={formData.abdmEnabled}
                    onChange={(event) => handleChange("abdmEnabled", event.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="false">Disabled</option>
                    <option value="true">Enabled</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Turn this on only if this specific branch should participate in ABDM intake.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quick-abdm-facility-id">Facility / HFR ID</Label>
                  <Input
                    id="quick-abdm-facility-id"
                    value={formData.abdmFacilityId}
                    onChange={(event) => handleChange("abdmFacilityId", event.target.value)}
                    placeholder="HFR or ABDM facility identifier"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank if this lab should keep using the organization-wide fallback for now.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Launch integrations
              </CardTitle>
              <CardDescription>
                Add the minimum communication and payment hooks needed to operate smoothly.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="quick-email-name">Email sender name</Label>
                <Input
                  id="quick-email-name"
                  value={formData.emailFromName}
                  onChange={(event) => handleChange("emailFromName", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-email-address">Email sender address</Label>
                <Input
                  id="quick-email-address"
                  value={formData.emailFromEmail}
                  onChange={(event) => handleChange("emailFromEmail", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-whatsapp-enabled">WhatsApp</Label>
                <select
                  id="quick-whatsapp-enabled"
                  value={formData.whatsappEnabled}
                  onChange={(event) => handleChange("whatsappEnabled", event.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="false">Disabled</option>
                  <option value="true">Enabled</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-whatsapp-number-id">WhatsApp phone number ID</Label>
                <Input
                  id="quick-whatsapp-number-id"
                  value={formData.whatsappPhoneNumberId}
                  onChange={(event) => handleChange("whatsappPhoneNumberId", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quick-razorpay-key-id">Razorpay key ID</Label>
                <Input
                  id="quick-razorpay-key-id"
                  value={formData.razorpayKeyId}
                  onChange={(event) => handleChange("razorpayKeyId", event.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-primary" />
                Starter catalog pack
              </CardTitle>
              <CardDescription>
                Add a safe starter pack of common categories and tests so the team is not staring at an empty catalog.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <div className="text-sm font-medium text-foreground">Includes common starter entries</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Hematology, Biochemistry, and Endocrinology with common test shells like CBC, FBS, HbA1c, LFT,
                  Lipid Profile, and TSH.
                </p>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  Prices, normal ranges, and panel items still need your review before launch. Existing tests are not
                  overwritten.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => void handleSeedStarterCatalog()} disabled={seedingStarterCatalog}>
                  {seedingStarterCatalog ? "Loading starter catalog..." : "Load starter catalog"}
                </Button>
                <Button variant="outline" onClick={() => navigate("/admin?tab=test-catalog")}>
                  Open test catalog
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-0 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BadgeCheck className="h-5 w-5 text-primary" />
                Launch summary
              </CardTitle>
              <CardDescription>
                Focus on these fields first if the goal is to get a new lab live quickly.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                {
                  label: "Branding",
                  done: Boolean(formData.displayName.trim() && (formData.logoUrl.trim() || formData.tagline.trim())),
                  icon: Palette,
                  description: "Organization name plus at least a logo or tagline.",
                },
                {
                  label: "Public contact",
                  done: Boolean(formData.labPhone.trim() && formData.address.trim() && formData.city.trim()),
                  icon: Building2,
                  description: "Primary lab phone, address, and city.",
                },
                {
                  label: "Domain setup",
                  done: Boolean(normalizedCustomDomain || launchAccessDomain || formData.website.trim()),
                  icon: Globe2,
                  description: "Primary custom domain or fallback launch domain is defined.",
                },
                {
                  label: "Email sender",
                  done: Boolean(formData.emailFromName.trim() || formData.emailFromEmail.trim()),
                  icon: Mail,
                  description: "At least one email sender field configured.",
                },
                {
                  label: "Payments or WhatsApp",
                  done: Boolean(formData.whatsappPhoneNumberId.trim() || formData.razorpayKeyId.trim()),
                  icon: MessageCircle,
                  description: "At least one live operational integration attached.",
                },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-border bg-muted/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${item.done ? "bg-emerald-100 text-emerald-700" : "bg-primary/10 text-primary"}`}>
                        <item.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-medium text-foreground">{item.label}</div>
                        <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                    <Badge variant={item.done ? "default" : "outline"}>
                      {item.done ? "Ready" : "Pending"}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-primary" />
                Next recommended steps
              </CardTitle>
              <CardDescription>
                Move through these tabs in order if this is a brand-new self-serve tenant.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                {
                  title: "Test catalog",
                  description: "Add the tests the lab actually offers before sending staff into daily use.",
                  icon: ClipboardList,
                  tab: "test-catalog",
                },
                {
                  title: "Templates",
                  description: "Set up the report template patients and doctors will see first.",
                  icon: Palette,
                  tab: "test-templates",
                },
                {
                  title: "Employees",
                  description: "Invite front-desk and lab staff so one owner login is not the bottleneck.",
                  icon: Users,
                  tab: "employees",
                },
                {
                  title: "Billing",
                  description: "Confirm invoice and collection behavior before taking live payments.",
                  icon: CreditCard,
                  tab: "billing",
                },
              ].map((step) => (
                <button
                  key={step.title}
                  type="button"
                  onClick={() => navigate(`/admin?tab=${step.tab}`)}
                  className="flex w-full items-start justify-between gap-3 rounded-2xl border border-border bg-muted/20 p-4 text-left transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <step.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium text-foreground">{step.title}</div>
                      <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                    </div>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="rounded-[2rem] border border-clinical-blue/15 bg-[linear-gradient(180deg,rgba(31,138,205,0.08),rgba(31,138,205,0.02))] p-6 shadow-sm">
            <h3 className="font-heading text-xl font-semibold text-foreground">Save and keep moving</h3>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              Quick Setup covers the fields most owners need in the first hour. After this, move to test catalog,
              templates, staff, and billing detail.
            </p>
            <Button className="mt-5 w-full" onClick={handleSave} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save quick setup"}
            </Button>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => navigate("/admin?tab=test-catalog")}
              >
                Go to test catalog
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/admin?tab=overview")}
              >
                Back to overview
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminQuickSetup;
