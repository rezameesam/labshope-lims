import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ClipboardList, Home, PhoneCall } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";

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

type PatientBookingProfile = {
  id: string;
  full_name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  organization_id?: string | null;
};

type PatientBookTestRequestProps = {
  patient: PatientBookingProfile;
};

const today = new Date().toISOString().split("T")[0];
const MAX_ADDRESS_LENGTH = 250;

const PatientBookTestRequest = ({ patient }: PatientBookTestRequestProps) => {
  const { organization, primaryLab, loading: organizationLoading } = useOrganization();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [labs, setLabs] = useState<LabOption[]>([]);
  const [collectionCenters, setCollectionCenters] = useState<CollectionCenterOption[]>([]);
  const resolvedOrganizationId = patient.organization_id || organization?.id || primaryLab?.organization_id || null;
  const [formData, setFormData] = useState({
    booking_type: "walk_in",
    test_details: "",
    address: patient.address || "",
    preferred_date: "",
    notes: "",
    lab_id: "",
    collection_center_id: "",
  });

  useEffect(() => {
    setFormData((current) => ({
      ...current,
      address: patient.address || "",
    }));
  }, [patient.address]);

  useEffect(() => {
    const fetchMeta = async () => {
      if (!resolvedOrganizationId) {
        setLabs([]);
        setCollectionCenters([]);
        return;
      }

      const labsQuery = supabase
        .from("labs")
        .select("id, name, lab_code")
        .eq("is_active", true)
        .eq("organization_id", resolvedOrganizationId)
        .order("name");

      const centersQuery = supabase
        .from("collection_centers")
        .select("id, name, code, lab_id")
        .eq("is_active", true)
        .eq("organization_id", resolvedOrganizationId)
        .order("name");

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
      booking_type: "walk_in",
      test_details: "",
      address: patient.address || "",
      preferred_date: "",
      notes: "",
      lab_id: "",
      collection_center_id: "",
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!formData.test_details.trim()) {
      toast.error("Please describe the tests or packages you want to book");
      return;
    }

    if (formData.booking_type === "home_collection" && !formData.address.trim()) {
      toast.error("Address is required for home collection");
      return;
    }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Please sign in again and retry.");
      }

      const { error } = await supabase.functions.invoke("submit-booking-request", {
        body: {
          booking_type: formData.booking_type,
          test_details: formData.test_details.trim(),
          address: formData.address.trim() || null,
          preferred_date: formData.preferred_date || null,
          notes: formData.notes.trim() || null,
          lab_id: formData.lab_id || null,
          collection_center_id: formData.collection_center_id || null,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        throw error;
      }

      setSubmitted(true);
      resetForm();
      toast.success("Your booking request has been submitted");
    } catch (error: any) {
      console.error("Error submitting patient portal booking request:", error);
      toast.error(error.message || "Failed to submit booking request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <Card className="rounded-3xl border border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Book a Test
          </CardTitle>
          <CardDescription>
            Send a request directly from your portal and the lab team will contact you to confirm the booking.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Booked for</p>
            <p className="mt-1 font-medium text-foreground">{patient.full_name}</p>
            <p className="mt-2 text-sm text-muted-foreground">{patient.phone}</p>
            <p className="text-sm text-muted-foreground">{patient.email || "No email on file"}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-muted/40 p-4">
              <PhoneCall className="h-5 w-5 text-primary" />
              <p className="mt-3 font-medium">Profile linked</p>
              <p className="mt-1 text-sm text-muted-foreground">This request is attached to your portal account.</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/40 p-4">
              <Home className="h-5 w-5 text-primary" />
              <p className="mt-3 font-medium">Home collection</p>
              <p className="mt-1 text-sm text-muted-foreground">Add the visit address only when you need collection at home.</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/40 p-4">
              <CalendarDays className="h-5 w-5 text-primary" />
              <p className="mt-3 font-medium">Preferred date</p>
              <p className="mt-1 text-sm text-muted-foreground">Pick a date if you already know when you want the test.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle>Request Booking</CardTitle>
          <CardDescription>
            Mention the tests or packages you need. Staff will review and confirm the appointment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="space-y-4 rounded-2xl border border-emerald-200 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 p-5 text-emerald-800 dark:text-emerald-300">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6" />
                <div>
                  <p className="font-semibold">Booking request received</p>
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">
                    The lab team can now review your request and contact you on the number linked to this portal.
                  </p>
                </div>
              </div>
              <Button type="button" variant="outline" onClick={() => setSubmitted(false)}>
                Submit another request
              </Button>
            </div>
          ) : (
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="booking_type">Booking Type</Label>
                <Select
                  value={formData.booking_type}
                  onValueChange={(value) =>
                    setFormData((current) => ({
                      ...current,
                      booking_type: value,
                    }))
                  }
                >
                  <SelectTrigger id="booking_type">
                    <SelectValue placeholder="Choose booking type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="walk_in">Walk-in lab visit</SelectItem>
                    <SelectItem value="home_collection">Home collection</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="test_details">Tests or packages needed *</Label>
                <Textarea
                  id="test_details"
                  value={formData.test_details}
                  onChange={(e) => setFormData((current) => ({ ...current, test_details: e.target.value }))}
                  placeholder="Example: CBC, LFT, Thyroid profile, fasting sugar"
                  rows={4}
                  required
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="lab_id">Preferred Lab</Label>
                  <Select
                    value={formData.lab_id || "none"}
                    onValueChange={(value) =>
                      setFormData((current) => ({
                        ...current,
                        lab_id: value === "none" ? "" : value,
                        collection_center_id: "",
                      }))
                    }
                  >
                    <SelectTrigger id="lab_id">
                      <SelectValue placeholder="Select lab" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No preference</SelectItem>
                      {labs.map((lab) => (
                        <SelectItem key={lab.id} value={lab.id}>
                          {lab.name} ({lab.lab_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="collection_center_id">Collection Center</Label>
                  <Select
                    value={formData.collection_center_id || "none"}
                    onValueChange={(value) =>
                      setFormData((current) => ({
                        ...current,
                        collection_center_id: value === "none" ? "" : value,
                      }))
                    }
                    disabled={!formData.lab_id || filteredCollectionCenters.length === 0}
                  >
                    <SelectTrigger id="collection_center_id">
                      <SelectValue
                        placeholder={formData.lab_id ? "Select collection center" : "Choose a lab first"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No preference</SelectItem>
                      {filteredCollectionCenters.map((center) => (
                        <SelectItem key={center.id} value={center.id}>
                          {center.name} ({center.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="preferred_date">Preferred Date</Label>
                  <DateInput
                    id="preferred_date"
                    min={today}
                    value={formData.preferred_date}
                    onChange={(value) => setFormData((current) => ({ ...current, preferred_date: value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Input
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData((current) => ({ ...current, notes: e.target.value }))}
                    placeholder="Optional message for the lab team"
                  />
                </div>
              </div>

              {formData.booking_type === "home_collection" && (
                <div className="space-y-2">
                  <Label htmlFor="address">Collection Address *</Label>
                  <Textarea
                    id="address"
                    value={formData.address}
                    onChange={(e) =>
                      setFormData((current) => ({
                        ...current,
                        address: e.target.value.slice(0, MAX_ADDRESS_LENGTH),
                      }))
                    }
                    rows={3}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    {formData.address.length}/{MAX_ADDRESS_LENGTH} characters
                  </p>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit Booking Request"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PatientBookTestRequest;
