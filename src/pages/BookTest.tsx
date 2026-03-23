import { FormEvent, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { CalendarDays, CheckCircle2, ClipboardList, Home, PhoneCall } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Turnstile from "@/components/ui/turnstile";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  buildStoragePhoneNumber,
  DEFAULT_COUNTRY_CODE,
  PHONE_COUNTRY_OPTIONS,
} from "@/lib/phone";
import { useOrganization } from "@/contexts/OrganizationContext";
import PlatformBookDemoPage from "@/components/platform/PlatformBookDemoPage";
import { usePublicPageMode } from "@/hooks/usePublicPageMode";
import InvalidTenantPage from "@/components/platform/InvalidTenantPage";

type LabOption = {
  id: string;
  name: string;
  lab_code: string;
};

type CollectionCenterOption = {
  id: string;
  name: string;
  code: string;
  lab_id: string;
};

const today = new Date().toISOString().split("T")[0];
const MAX_ADDRESS_LENGTH = 250;

const BookTest = () => {
  const { loading: publicModeLoading, platformMode, invalidTenantHost, hostname } = usePublicPageMode();
  const { branding, organization, primaryLab, loading: organizationLoading } = useOrganization();
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaInstanceKey, setCaptchaInstanceKey] = useState(0);
  const [labs, setLabs] = useState<LabOption[]>([]);
  const [collectionCenters, setCollectionCenters] = useState<CollectionCenterOption[]>([]);
  const [formData, setFormData] = useState({
    full_name: "",
    country_code: DEFAULT_COUNTRY_CODE,
    phone: "",
    email: "",
    booking_type: "walk_in",
    address: "",
    preferred_date: "",
    lab_id: "",
    collection_center_id: "",
  });
  const resolvedOrganizationId = organization?.id || primaryLab?.organization_id || null;

  useEffect(() => {
    const fetchMeta = async () => {
      let labsQuery = supabase.from("labs").select("id, name, lab_code").eq("is_active", true).order("name");
      let centersQuery = supabase
        .from("collection_centers")
        .select("id, name, code, lab_id")
        .eq("is_active", true)
        .order("name");

      if (resolvedOrganizationId) {
        labsQuery = labsQuery.eq("organization_id" as any, resolvedOrganizationId);
        centersQuery = centersQuery.eq("organization_id" as any, resolvedOrganizationId);
      }

      const [labsRes, centersRes] = await Promise.all([labsQuery, centersQuery]);

      if (labsRes.error) {
        console.error("Error fetching labs:", labsRes.error);
      } else {
        setLabs(labsRes.data || []);
      }

      if (centersRes.error) {
        console.error("Error fetching collection centers:", centersRes.error);
      } else {
        setCollectionCenters(centersRes.data || []);
      }
    };

    if (!organizationLoading) {
      void fetchMeta();
    }
  }, [organizationLoading, resolvedOrganizationId]);

  const filteredCollectionCenters = useMemo(() => {
    if (!formData.lab_id) {
      return [];
    }

    return collectionCenters.filter((center) => center.lab_id === formData.lab_id);
  }, [collectionCenters, formData.lab_id]);

  const resetForm = () => {
    setFormData({
      full_name: "",
      country_code: DEFAULT_COUNTRY_CODE,
      phone: "",
      email: "",
      booking_type: "walk_in",
      address: "",
      preferred_date: "",
      lab_id: "",
      collection_center_id: "",
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedPhone = buildStoragePhoneNumber(formData.country_code, formData.phone);
    if (!normalizedPhone) {
      toast.error("Please enter a valid phone number");
      return;
    }

    if (formData.booking_type === "home_collection" && !formData.address.trim()) {
      toast.error("Address is required for home collection");
      return;
    }

    if (turnstileSiteKey && !captchaToken) {
      toast.error("Please complete the security check");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("submit-booking-request", {
        body: {
          full_name: formData.full_name.trim(),
          phone: normalizedPhone,
          email: formData.email.trim() || null,
          booking_type: formData.booking_type,
          address: formData.address.trim() || null,
          preferred_date: formData.preferred_date || null,
          lab_id: formData.lab_id || null,
          collection_center_id: formData.collection_center_id || null,
          organization_id: resolvedOrganizationId,
          turnstile_token: captchaToken,
        },
      });

      if (error) {
        throw error;
      }

      setSubmitted(true);
      setCaptchaToken("");
      setCaptchaInstanceKey((current) => current + 1);
      resetForm();
      toast.success("Booking request submitted");
    } catch (error: any) {
      console.error("Error submitting booking request:", error);
      toast.error(error.message || "Failed to submit booking request");
    } finally {
      setSubmitting(false);
    }
  };

  if (publicModeLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-pulse text-muted-foreground">Loading...</div></div>;
  }

  if (invalidTenantHost) {
    return <InvalidTenantPage hostname={hostname} />;
  }

  if (platformMode) {
    return <PlatformBookDemoPage />;
  }

  return (
    <>
      <Helmet>
        <title>{`Book Test Now | ${branding.displayName}`}</title>
        <meta
          name="description"
          content={`Request a diagnostic test booking with ${branding.displayName}. Share your name, phone number, visit preference, and preferred date.`}
        />
      </Helmet>

      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="relative overflow-hidden pt-24">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,116,144,0.08),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.08),transparent_35%)]" />
          <section className="container relative mx-auto px-4 py-10 lg:px-8 lg:py-16">
            <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-4 py-2 text-sm font-medium text-primary">
                  <ClipboardList className="h-4 w-4" />
                  Book Test Now
                </div>
                <div className="space-y-4">
                  <h1 className="max-w-3xl font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                    Send your booking request and let the lab team call you back.
                  </h1>
                  <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                    Share the patient name, phone number, and whether you want a walk-in visit or home
                    collection. The request goes to staff review first, then gets converted into a
                    patient record only when confirmed.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <Card className="border-primary/10 shadow-sm">
                    <CardContent className="flex items-start gap-3 p-5">
                      <PhoneCall className="mt-1 h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">Mandatory contact</p>
                        <p className="text-sm text-muted-foreground">Name and phone are required.</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-primary/10 shadow-sm">
                    <CardContent className="flex items-start gap-3 p-5">
                      <Home className="mt-1 h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">Home collection</p>
                        <p className="text-sm text-muted-foreground">Address becomes required only for home visits.</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-primary/10 shadow-sm">
                    <CardContent className="flex items-start gap-3 p-5">
                      <CalendarDays className="mt-1 h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">Preferred timing</p>
                        <p className="text-sm text-muted-foreground">Pick a preferred date if you already know it.</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <Card className="border-primary/10 shadow-lg">
                <CardHeader>
                  <CardTitle>Request Booking</CardTitle>
                  <CardDescription>
                    Staff will review this request and contact the patient to confirm the booking.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {submitted ? (
                    <div className="space-y-4 rounded-xl border border-green-200 bg-green-50 p-5 text-green-800">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-6 w-6" />
                        <div>
                          <p className="font-semibold">Booking request received</p>
                          <p className="text-sm text-green-700">
                            The lab team can now review it from the admin dashboard and contact the patient.
                          </p>
                        </div>
                      </div>
                      <Button type="button" variant="outline" onClick={() => setSubmitted(false)}>
                        Submit another request
                      </Button>
                    </div>
                  ) : (
                    <form className="space-y-4" onSubmit={handleSubmit}>
                      <div className="space-y-2">
                        <Label htmlFor="full_name">Full Name *</Label>
                        <Input
                          id="full_name"
                          name="full_name"
                          value={formData.full_name}
                          onChange={(e) => setFormData((current) => ({ ...current, full_name: e.target.value }))}
                          placeholder="Patient full name"
                          autoComplete="name"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone Number *</Label>
                        <div className="flex gap-2">
                          <Label htmlFor="country_code" className="sr-only">
                            Country code
                          </Label>
                          <select
                            id="country_code"
                            name="country_code"
                            value={formData.country_code}
                            onChange={(e) => setFormData((current) => ({ ...current, country_code: e.target.value }))}
                            className="h-10 w-[170px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                          >
                            {PHONE_COUNTRY_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <Input
                            id="phone"
                            name="phone"
                            type="tel"
                            inputMode="numeric"
                            value={formData.phone}
                            onChange={(e) =>
                              setFormData((current) => ({
                                ...current,
                                phone: e.target.value.replace(/[^\d]/g, ""),
                              }))
                            }
                            maxLength={15}
                            placeholder="Mobile number"
                            autoComplete="tel"
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData((current) => ({ ...current, email: e.target.value }))}
                          placeholder="patient@email.com"
                          autoComplete="email"
                        />
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="booking_type">Visit Type *</Label>
                          <select
                            id="booking_type"
                            name="booking_type"
                            value={formData.booking_type}
                            onChange={(e) =>
                              setFormData((current) => ({
                                ...current,
                                booking_type: e.target.value,
                              }))
                            }
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          >
                            <option value="walk_in">Walk-in Lab Visit</option>
                            <option value="home_collection">Home Collection</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="preferred_date">Preferred Date</Label>
                          <DateInput
                            id="preferred_date"
                            name="preferred_date"
                            min={today}
                            value={formData.preferred_date}
                            onChange={(value) =>
                              setFormData((current) => ({ ...current, preferred_date: value }))
                            }
                            autoComplete="off"
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="lab_id">Preferred Lab</Label>
                          <select
                            id="lab_id"
                            name="lab_id"
                            value={formData.lab_id || "none"}
                            onChange={(e) =>
                              setFormData((current) => ({
                                ...current,
                                lab_id: e.target.value === "none" ? "" : e.target.value,
                                collection_center_id: "",
                              }))
                            }
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          >
                            <option value="none">No preference</option>
                            {labs.map((lab) => (
                              <option key={lab.id} value={lab.id}>
                                {lab.name} ({lab.lab_code})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="collection_center_id">Collection Center</Label>
                          <select
                            id="collection_center_id"
                            name="collection_center_id"
                            value={formData.collection_center_id || "none"}
                            onChange={(e) =>
                              setFormData((current) => ({
                                ...current,
                                collection_center_id: e.target.value === "none" ? "" : e.target.value,
                              }))
                            }
                            disabled={!formData.lab_id}
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <option value="none">No preference</option>
                            {filteredCollectionCenters.map((center) => (
                              <option key={center.id} value={center.id}>
                                {center.name} ({center.code})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="address">
                          Address {formData.booking_type === "home_collection" ? "*" : ""}
                        </Label>
                        <Textarea
                          id="address"
                          name="address"
                          value={formData.address}
                          onChange={(e) =>
                            setFormData((current) => ({
                              ...current,
                              address: e.target.value.slice(0, MAX_ADDRESS_LENGTH),
                            }))
                          }
                          placeholder="Full address for patient visit or home sample collection"
                          rows={3}
                          maxLength={MAX_ADDRESS_LENGTH}
                          autoComplete="street-address"
                        />
                        <p className="text-xs text-muted-foreground">
                          {formData.address.length}/{MAX_ADDRESS_LENGTH} characters
                        </p>
                      </div>

                      {turnstileSiteKey && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium leading-none">Security Check *</p>
                          <div className="overflow-x-auto rounded-lg border p-3">
                            <Turnstile
                              key={captchaInstanceKey}
                              siteKey={turnstileSiteKey}
                              action="book_test_request"
                              onVerify={(token) => setCaptchaToken(token)}
                              onExpire={() => setCaptchaToken("")}
                            />
                          </div>
                        </div>
                      )}

                      <Button type="submit" variant="clinical" className="w-full" disabled={submitting}>
                        {submitting ? "Submitting..." : "Submit Booking Request"}
                      </Button>
                    </form>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
};

export default BookTest;
