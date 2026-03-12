import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Link2, RefreshCcw, Search, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { DEFAULT_COUNTRY_CODE, getPhoneLookupVariants, normalizePhoneNumber } from "@/lib/phone";

type BookingRequestRow = Database["public"]["Tables"]["booking_requests"]["Row"];

type BookingRequest = BookingRequestRow & {
  patients?: {
    id: string;
    patient_id: string;
    full_name: string;
    phone: string;
  } | null;
  labs?: {
    id: string;
    name: string;
    lab_code: string;
  } | null;
  collection_centers?: {
    id: string;
    name: string;
    code: string;
  } | null;
};

type PatientSummary = {
  id: string;
  patient_id: string;
  full_name: string;
  phone: string;
  address: string | null;
  email: string | null;
  created_at: string;
};

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "scheduled", label: "Scheduled" },
  { value: "converted", label: "Converted" },
  { value: "closed", label: "Closed" },
] as const;

const statusTone: Record<string, string> = {
  new: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  contacted: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  scheduled: "bg-purple-100 text-purple-700 hover:bg-purple-100",
  converted: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  closed: "bg-slate-100 text-slate-700 hover:bg-slate-100",
};

const generatePatientId = () => {
  const prefix = "PAT";
  const year = new Date().getFullYear().toString().slice(-2);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${year}${random}`;
};

const getStatusBadge = (status: string) => (
  <Badge className={statusTone[status] || "bg-slate-100 text-slate-700 hover:bg-slate-100"}>
    {status.replace("_", " ")}
  </Badge>
);

interface ManageBookingRequestsProps {
  onCountChange?: (count: number) => void;
}

const ManageBookingRequests = ({ onCountChange }: ManageBookingRequestsProps) => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedRequest, setSelectedRequest] = useState<BookingRequest | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewStatus, setReviewStatus] = useState("new");
  const [matchingPatients, setMatchingPatients] = useState<PatientSummary[]>([]);
  const [manualSearch, setManualSearch] = useState("");
  const [manualResults, setManualResults] = useState<PatientSummary[]>([]);
  const [searchingPatients, setSearchingPatients] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("booking_requests")
        .select(`
          *,
          patients (
            id,
            patient_id,
            full_name,
            phone
          ),
          labs (
            id,
            name,
            lab_code
          ),
          collection_centers (
            id,
            name,
            code
          )
        `)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      const nextRequests = (data || []) as BookingRequest[];
      setRequests(nextRequests);
      onCountChange?.(nextRequests.filter((request) => request.status === "new").length);
    } catch (error: any) {
      console.error("Error fetching booking requests:", error);
      toast.error(error.message || "Failed to fetch booking requests");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchRequests();
  }, []);

  const filteredRequests = useMemo(() => {
    const query = search.trim().toLowerCase();

    return requests.filter((request) => {
      const matchesStatus = statusFilter === "all" || request.status === statusFilter;
      if (!query) {
        return matchesStatus;
      }

      const haystack = [
        request.full_name,
        request.phone,
        request.email || "",
        request.test_details || "",
        request.notes || "",
        request.patients?.patient_id || "",
        request.patients?.full_name || "",
      ]
        .join(" ")
        .toLowerCase();

      return matchesStatus && haystack.includes(query);
    });
  }, [requests, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pagedRequests = filteredRequests.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, pageSize]);

  useEffect(() => {
    if (currentPage !== safePage) {
      setCurrentPage(safePage);
    }
  }, [currentPage, safePage]);

  const stats = useMemo(() => {
    const counts = {
      total: requests.length,
      new: 0,
      contacted: 0,
      scheduled: 0,
      converted: 0,
    };

    for (const request of requests) {
      if (request.status in counts) {
        counts[request.status as keyof typeof counts] += 1;
      }
    }

    return counts;
  }, [requests]);

  const fetchPatientsByPhone = async (phone: string) => {
    const variants = getPhoneLookupVariants(phone, DEFAULT_COUNTRY_CODE);
    if (variants.length === 0) {
      setMatchingPatients([]);
      return;
    }

    const { data, error } = await supabase
      .from("patients")
      .select("id, patient_id, full_name, phone, address, email, created_at")
      .in("phone", variants)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    setMatchingPatients((data || []) as PatientSummary[]);
  };

  const openReview = async (request: BookingRequest) => {
    setSelectedRequest(request);
    setReviewStatus(request.status);
    setReviewOpen(true);
    setManualSearch("");
    setManualResults([]);
    setSearchingPatients(true);
    try {
      await fetchPatientsByPhone(request.phone);
    } catch (error: any) {
      console.error("Error fetching matching patients:", error);
      toast.error(error.message || "Failed to load matching patients");
      setMatchingPatients([]);
    } finally {
      setSearchingPatients(false);
    }
  };

  const handleManualSearch = async () => {
    const query = manualSearch.trim();
    if (query.length < 2) {
      toast.error("Enter at least 2 characters to search patients");
      return;
    }

    setSearchingPatients(true);
    try {
      const sanitized = query.replace(/,/g, " ");
      const { data, error } = await supabase
        .from("patients")
        .select("id, patient_id, full_name, phone, address, email, created_at")
        .eq("is_active", true)
        .or(
          `full_name.ilike.%${sanitized}%,patient_id.ilike.%${sanitized}%,phone.ilike.%${sanitized}%`
        )
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) {
        throw error;
      }

      setManualResults((data || []) as PatientSummary[]);
    } catch (error: any) {
      console.error("Error searching patients:", error);
      toast.error(error.message || "Failed to search patients");
    } finally {
      setSearchingPatients(false);
    }
  };

  const refreshSelectedRequest = (requestId: string, updates: Partial<BookingRequest>) => {
    setRequests((current) => {
      const nextRequests = current.map((request) =>
        request.id === requestId ? { ...request, ...updates } : request,
      );
      onCountChange?.(nextRequests.filter((request) => request.status === "new").length);
      return nextRequests;
    });
    setSelectedRequest((current) =>
      current && current.id === requestId ? { ...current, ...updates } : current
    );
  };

  const handleSaveStatus = async () => {
    if (!selectedRequest) {
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("booking_requests")
        .update({ status: reviewStatus })
        .eq("id", selectedRequest.id);

      if (error) {
        throw error;
      }

      refreshSelectedRequest(selectedRequest.id, { status: reviewStatus });
      toast.success("Booking request updated");
    } catch (error: any) {
      console.error("Error updating booking request:", error);
      toast.error(error.message || "Failed to update booking request");
    } finally {
      setSaving(false);
    }
  };

  const handleLinkPatient = async (patient: PatientSummary) => {
    if (!selectedRequest) {
      return;
    }

    setSaving(true);
    try {
      const updates = {
        patient_id: patient.id,
        status: "converted",
        converted_by: user?.id || null,
      } satisfies Database["public"]["Tables"]["booking_requests"]["Update"];

      const { error } = await supabase
        .from("booking_requests")
        .update(updates)
        .eq("id", selectedRequest.id);

      if (error) {
        throw error;
      }

      refreshSelectedRequest(selectedRequest.id, {
        patient_id: patient.id,
        status: "converted",
        patients: {
          id: patient.id,
          patient_id: patient.patient_id,
          full_name: patient.full_name,
          phone: patient.phone,
        },
      });
      setReviewStatus("converted");
      toast.success(`Linked to patient ${patient.patient_id}`);
    } catch (error: any) {
      console.error("Error linking patient:", error);
      toast.error(error.message || "Failed to link patient");
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePatient = async () => {
    if (!selectedRequest) {
      return;
    }

    setSaving(true);
    try {
      const normalizedPhone =
        normalizePhoneNumber(selectedRequest.phone, DEFAULT_COUNTRY_CODE) || selectedRequest.phone;
      const phoneVariants = getPhoneLookupVariants(normalizedPhone, DEFAULT_COUNTRY_CODE);

      const { data: existingPatients, error: checkError } = await supabase
        .from("patients")
        .select("id, patient_id, full_name, phone, address, email, created_at")
        .in("phone", phoneVariants)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (checkError) {
        throw checkError;
      }

      if (existingPatients && existingPatients.length > 0) {
        setMatchingPatients(existingPatients as PatientSummary[]);
        toast.error("An active patient already exists with this phone number. Link that record instead.");
        return;
      }

      const patientId = generatePatientId();
      const patientInsert: Database["public"]["Tables"]["patients"]["Insert"] = {
        patient_id: patientId,
        full_name: selectedRequest.full_name,
        phone: normalizedPhone,
        email: selectedRequest.email || null,
        address: selectedRequest.address || null,
        lab_id: selectedRequest.lab_id || null,
        collection_center_id: selectedRequest.collection_center_id || null,
        created_by: user?.id || null,
      };

      const { data: createdPatient, error: createError } = await supabase
        .from("patients")
        .insert(patientInsert)
        .select("id, patient_id, full_name, phone, address, email, created_at")
        .single();

      if (createError || !createdPatient) {
        throw createError || new Error("Patient creation failed");
      }

      await handleLinkPatient(createdPatient as PatientSummary);
      await fetchPatientsByPhone(normalizedPhone);
      toast.success(`Patient ${patientId} created from booking request`);
    } catch (error: any) {
      console.error("Error creating patient from booking request:", error);
      toast.error(error.message || "Failed to create patient");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Total Requests</p>
            <p className="mt-2 text-3xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">New</p>
            <p className="mt-2 text-3xl font-bold text-blue-600">{stats.new}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Contacted</p>
            <p className="mt-2 text-3xl font-bold text-amber-600">{stats.contacted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Scheduled</p>
            <p className="mt-2 text-3xl font-bold text-purple-600">{stats.scheduled}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Converted</p>
            <p className="mt-2 text-3xl font-bold text-emerald-600">{stats.converted}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Booking Requests</CardTitle>
              <CardDescription>
                Review public website requests before converting them into patients.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRefreshing(true);
                void fetchRequests();
              }}
              disabled={refreshing}
            >
              <RefreshCcw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          <div className="grid gap-4 pt-2 md:grid-cols-[1fr_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, phone, notes, or linked patient"
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-muted-foreground">Loading booking requests...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Requested By</TableHead>
                  <TableHead>Booking</TableHead>
                  <TableHead>Preferred Date</TableHead>
                  <TableHead>Preferred Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Linked Patient</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedRequests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{request.full_name}</p>
                        <p className="text-sm text-muted-foreground">{request.phone}</p>
                        {request.email && <p className="text-xs text-muted-foreground">{request.email}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <Badge variant="outline" className="capitalize">
                          {request.booking_type.replace("_", " ")}
                        </Badge>
                        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                          {request.test_details || request.notes || "No test details provided"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {request.preferred_date
                        ? format(new Date(request.preferred_date), "dd MMM yyyy")
                        : <span className="text-muted-foreground">Not set</span>}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p>{request.labs ? `${request.labs.name} (${request.labs.lab_code})` : "No lab selected"}</p>
                        <p className="text-muted-foreground">
                          {request.collection_centers
                            ? `${request.collection_centers.name} (${request.collection_centers.code})`
                            : "No collection center"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(request.status)}</TableCell>
                    <TableCell>
                      {request.patients ? (
                        <div>
                          <p className="font-medium">{request.patients.full_name}</p>
                          <p className="text-sm text-muted-foreground">{request.patients.patient_id}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Not linked</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button type="button" variant="outline" size="sm" onClick={() => void openReview(request)}>
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredRequests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      No booking requests found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
          {filteredRequests.length > 0 && (
            <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {startIndex + 1}-{Math.min(endIndex, filteredRequests.length)} of{" "}
                {filteredRequests.length}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Rows</span>
                  <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                    <SelectTrigger className="h-8 w-[90px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={safePage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {safePage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={safePage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Review Booking Request</DialogTitle>
            <DialogDescription>
              Update status, link to an existing patient, or create a new patient from this request.
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Request Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Patient</p>
                      <p className="font-medium">{selectedRequest.full_name}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Phone</p>
                      <p className="font-medium">{selectedRequest.phone}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Email</p>
                      <p className="font-medium">{selectedRequest.email || "Not provided"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Address</p>
                      <p className="font-medium">{selectedRequest.address || "Not provided"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Request</p>
                      <p className="font-medium capitalize">{selectedRequest.booking_type.replace("_", " ")}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Tests / Notes</p>
                      <p className="font-medium whitespace-pre-wrap">
                        {selectedRequest.test_details || selectedRequest.notes || "No details provided"}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Request Status</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={reviewStatus} onValueChange={setReviewStatus}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.filter((option) => option.value !== "all").map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 text-sm">
                      <p className="text-muted-foreground">Current link</p>
                      {selectedRequest.patients ? (
                        <div className="rounded-lg border bg-muted/30 p-3">
                          <p className="font-medium">{selectedRequest.patients.full_name}</p>
                          <p className="text-muted-foreground">
                            {selectedRequest.patients.patient_id} • {selectedRequest.patients.phone}
                          </p>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">No patient linked yet.</p>
                      )}
                    </div>
                    <Button type="button" variant="outline" onClick={handleSaveStatus} disabled={saving}>
                      Save Status
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Matching Patients by Phone</CardTitle>
                    <CardDescription>
                      Existing active patients with the same phone number appear here.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {searchingPatients && matchingPatients.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Checking for matching patients...</p>
                    ) : matchingPatients.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No active patient found with this phone number.</p>
                    ) : (
                      matchingPatients.map((patient) => (
                        <div
                          key={patient.id}
                          className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <p className="font-medium">{patient.full_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {patient.patient_id} • {patient.phone}
                            </p>
                          </div>
                          <Button type="button" size="sm" onClick={() => void handleLinkPatient(patient)} disabled={saving}>
                            <Link2 className="mr-2 h-4 w-4" />
                            Link Patient
                          </Button>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Search or Create Patient</CardTitle>
                    <CardDescription>
                      Search manually if the phone differs, or create a new patient if no record exists.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        value={manualSearch}
                        onChange={(e) => setManualSearch(e.target.value)}
                        placeholder="Search by patient ID, name, or phone"
                      />
                      <Button type="button" variant="outline" onClick={() => void handleManualSearch()} disabled={searchingPatients}>
                        Search
                      </Button>
                    </div>

                    {manualResults.length > 0 && (
                      <div className="space-y-3">
                        {manualResults.map((patient) => (
                          <div
                            key={patient.id}
                            className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div>
                              <p className="font-medium">{patient.full_name}</p>
                              <p className="text-sm text-muted-foreground">
                                {patient.patient_id} • {patient.phone}
                              </p>
                            </div>
                            <Button type="button" size="sm" onClick={() => void handleLinkPatient(patient)} disabled={saving}>
                              <Link2 className="mr-2 h-4 w-4" />
                              Link
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="rounded-lg border border-dashed p-4">
                      <p className="font-medium">No matching patient?</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Create a new patient record from this request without leaving the queue.
                      </p>
                      <Button type="button" className="mt-4" onClick={() => void handleCreatePatient()} disabled={saving}>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Create Patient From Request
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReviewOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManageBookingRequests;
