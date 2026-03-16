import React, { useCallback, useEffect, useState } from "react";
import { Plus, Search, Eye, Edit2, Phone, Mail, MapPin, Calendar, Droplets, User, X, FileText, ChevronRight, Download, Printer, Receipt, IndianRupee, Clock, CheckCircle, CheckCircle2, Building2, Lock, ClipboardList, Shield, FileSpreadsheet } from "lucide-react";
import { exportToExcel } from "@/lib/exportToExcel";
import { AbhaEnrollmentDialog } from "./AbhaEnrollmentDialog";
import { AbdmQrCodeDisplay } from "./AbdmQrCodeDisplay";
import { Button } from "@/components/ui/button";
import { generateMultiTestReportPDF } from "@/components/patient/TestReportPDF";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import DuplicatePhoneDialog from "./DuplicatePhoneDialog";
import { useLab } from "@/contexts/LabContext";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/contexts/OrganizationContext";
import { formatAppDate } from "@/lib/date";
import { DataPagination } from "@/components/ui/data-pagination";
import {
  DEFAULT_COUNTRY_CODE,
  PHONE_COUNTRY_OPTIONS,
  buildStoragePhoneNumber,
  formatPhoneForDisplay,
  getPhoneLookupVariants,
  splitPhoneForForm,
} from "@/lib/phone";

interface Patient {
  id: string;
  patient_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  address: string | null;
  date_of_birth: string | null;
  gender: string | null;
  blood_group: string | null;
  abha_number?: string | null;
  abha_address?: string | null;
  abdm_link_status?: string | null;
  abdm_linked_at?: string | null;
  abdm_last_verified_at?: string | null;
  abdm_source?: string | null;
  is_active: boolean;
  lab_id?: string | null;
  collection_center_id?: string | null;
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
  created_at: string;
}

interface PatientTest {
  id: string;
  test_id?: string | null;
  test_name: string;
  test_date: string;
  status: string;
  result: string | null;
  result_value: number | null;
  result_unit: string | null;
  is_abnormal: boolean;
  notes?: string | null;
  result_entered_by?: string | null;
  entered_by_name?: string;
  lab_id?: string | null;
  collection_center_id?: string | null;
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
}

interface BillingSummary {
  totalBilled: number;
  totalPaid: number;
  outstanding: number;
  invoiceCount: number;
}

interface PatientFormData {
  full_name: string;
  country_code: string;
  phone: string;
  email: string;
  address: string;
  date_of_birth: string;
  gender: string;
  blood_group: string;
  abha_number: string;
  abha_address: string;
  abdm_link_status: string;
  abdm_source: string;
  lab_id: string;
  collection_center_id: string;
}

interface AbdmScanShareIdentity {
  full_name: string;
  gender: string;
  date_of_birth: string;
  year_of_birth: string;
  phone: string;
  abha_number: string | null;
  abha_address: string | null;
  address: string;
  state: string;
  pincode: string;
  source: string;
}

interface AbdmProfileShare {
  id: string;
  request_status: "received" | "matched" | "unmatched" | "failed";
  patient_name: string | null;
  patient_gender: string | null;
  patient_date_of_birth: string | null;
  patient_year_of_birth: string | null;
  patient_phone: string | null;
  abha_number: string | null;
  abha_address: string | null;
  created_at: string;
  matched_patient_id: string | null;
  matched_patient?: {
    id: string;
    patient_id: string;
    full_name: string;
  } | null;
}

const ABDM_LINK_STATUS_OPTIONS = [
  { value: "unlinked", label: "Unlinked" },
  { value: "scan_shared", label: "Scan And Share" },
  { value: "linked", label: "Linked" },
  { value: "verified", label: "Verified" },
] as const;

interface PatientFormProps {
  formData: PatientFormData;
  setFormData: React.Dispatch<React.SetStateAction<PatientFormData>>;
  onSubmit: (e: React.FormEvent) => void;
  isEdit?: boolean;
  isSubmitting: boolean;
  labs?: { id: string; name: string; lab_code: string }[];
  collectionCenters?: { id: string; name: string; code: string; lab_id: string }[];
  organizationId?: string | null;
  patientId?: string | null;
}

interface ManagePatientsProps {
  onAssignTests?: (patient: Patient) => void;
}

interface AbhaMismatchField {
  key: keyof PatientFormData;
  label: string;
  existing: string;
  fromAbha: string;
}

const PatientForm = ({ formData, setFormData, onSubmit, isEdit = false, isSubmitting, labs = [], collectionCenters = [], organizationId = null, patientId = null }: PatientFormProps) => {
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [mismatchFields, setMismatchFields] = useState<AbhaMismatchField[]>([]);
  const [mismatchAbha, setMismatchAbha] = useState<{ abha_number: string; abha_address: string } | null>(null);
  const [mismatchOpen, setMismatchOpen] = useState(false);
  // Which fields to use ABHA value for (default: all mismatched)
  const [useAbhaFor, setUseAbhaFor] = useState<Set<keyof PatientFormData>>(new Set());

  function handleEnrolled(result: import("./AbhaEnrollmentDialog").AbhaEnrolledResult) {
    // Always apply ABHA identifiers
    const abhaFields = {
      abha_number: result.abha_number,
      abha_address: result.abha_address,
      abdm_link_status: "verified" as const,
      abdm_source: result.abha_number ? "abha_verified" : "abha_linked",
    };

    // Detect mismatches in personal details
    const checks: AbhaMismatchField[] = [];
    const normalize = (v: string) => v.trim().toLowerCase();

    if (result.full_name && formData.full_name && normalize(result.full_name) !== normalize(formData.full_name)) {
      checks.push({ key: "full_name", label: "Full Name", existing: formData.full_name, fromAbha: result.full_name });
    }
    if (result.gender && formData.gender && normalize(result.gender) !== normalize(formData.gender)) {
      checks.push({ key: "gender", label: "Gender", existing: formData.gender, fromAbha: result.gender });
    }
    if (result.date_of_birth && formData.date_of_birth && result.date_of_birth !== formData.date_of_birth) {
      checks.push({ key: "date_of_birth", label: "Date of Birth", existing: formData.date_of_birth, fromAbha: result.date_of_birth });
    }

    if (checks.length > 0) {
      setMismatchFields(checks);
      setMismatchAbha(abhaFields);
      setUseAbhaFor(new Set(checks.map((c) => c.key)));
      setMismatchOpen(true);
    } else {
      // No conflict — apply everything from ABHA
      setFormData((prev) => ({
        ...prev,
        full_name: result.full_name || prev.full_name,
        gender: result.gender || prev.gender,
        date_of_birth: result.date_of_birth || prev.date_of_birth,
        ...abhaFields,
      }));
    }
    setEnrollOpen(false);
  }

  function applyMismatchResolution() {
    setFormData((prev) => {
      const next = { ...prev, ...mismatchAbha! };
      for (const field of mismatchFields) {
        next[field.key] = (useAbhaFor.has(field.key) ? field.fromAbha : field.existing) as any;
      }
      return next;
    });
    setMismatchOpen(false);
    setMismatchFields([]);
    setMismatchAbha(null);
  }
  // Filter collection centers by selected lab
  const filteredCollectionCenters = formData.lab_id && collectionCenters
    ? collectionCenters.filter(cc => cc.lab_id === formData.lab_id)
    : [];
  const countryCodeOptions = PHONE_COUNTRY_OPTIONS.some(
    (option) => option.value === formData.country_code
  )
    ? PHONE_COUNTRY_OPTIONS
    : [
        { value: formData.country_code, label: `Custom (+${formData.country_code})` },
        ...PHONE_COUNTRY_OPTIONS,
      ];

  function formatAbhaDisplay(digits: string): string {
    const d = digits.replace(/\D/g, "").slice(0, 14);
    if (d.length <= 4) return d;
    if (d.length <= 8) return `${d.slice(0,4)}-${d.slice(4)}`;
    if (d.length <= 12) return `${d.slice(0,4)}-${d.slice(4,8)}-${d.slice(8)}`;
    return `${d.slice(0,4)}-${d.slice(4,8)}-${d.slice(8,12)}-${d.slice(12)}`;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="full_name">Full Name *</Label>
        <Input
          id="full_name"
          name="full_name"
          value={formData.full_name}
          onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
          required
          placeholder="Enter full name"
          autoComplete="name"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone Number *</Label>
        <div className="flex gap-2">
          <Label htmlFor="country_code" className="sr-only">
            Country code
          </Label>
          <Select
            name="country_code"
            value={formData.country_code}
            onValueChange={(value) => setFormData({ ...formData, country_code: value })}
          >
            <SelectTrigger id="country_code" className="w-[170px]">
              <SelectValue placeholder="Country code" />
            </SelectTrigger>
            <SelectContent>
              {countryCodeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            id="phone"
            name="phone"
            type="tel"
            value={formData.phone}
            onChange={(e) =>
              setFormData({
                ...formData,
                phone: e.target.value.replace(/[^\d]/g, ""),
              })
            }
            required
            maxLength={15}
            placeholder="Mobile number"
            autoComplete="tel"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Example: +{formData.country_code} {formData.phone || "XXXXXXXXXX"}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="patient@email.com"
          autoComplete="email"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="date_of_birth">Date of Birth</Label>
        <DateInput
          id="date_of_birth"
          name="date_of_birth"
          value={formData.date_of_birth}
          onChange={(value) => setFormData({ ...formData, date_of_birth: value })}
          autoComplete="off"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="gender">Gender</Label>
        <Select
          name="gender"
          value={formData.gender}
          onValueChange={(value) => setFormData({ ...formData, gender: value })}
        >
          <SelectTrigger id="gender">
            <SelectValue placeholder="Select gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Male">Male</SelectItem>
            <SelectItem value="Female">Female</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="blood_group">Blood Group</Label>
        <Select
          name="blood_group"
          value={formData.blood_group}
          onValueChange={(value) => setFormData({ ...formData, blood_group: value })}
        >
          <SelectTrigger id="blood_group">
            <SelectValue placeholder="Select blood group" />
          </SelectTrigger>
          <SelectContent>
            {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bg) => (
              <SelectItem key={bg} value={bg}>{bg}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ABHA / Health ID */}
      <div className="md:col-span-2 space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">ABHA / Health ID <span className="text-muted-foreground font-normal">(Optional)</span></p>
          {organizationId && !formData.abha_number && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
              onClick={() => setEnrollOpen(true)}
            >
              <Shield className="h-3.5 w-3.5" />
              Link / Verify ABHA
            </Button>
          )}
          {formData.abha_number && (
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
                onClick={() => setEnrollOpen(true)}
              >
                <Shield className="h-3.5 w-3.5" />
                Re-verify
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-muted-foreground hover:text-destructive"
                onClick={() => setFormData({ ...formData, abha_number: "", abha_address: "", abdm_link_status: "unlinked", abdm_source: "" })}
              >
                Clear
              </Button>
            </div>
          )}
        </div>

        {formData.abha_number ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="text-sm font-medium text-emerald-900">ABHA Linked</span>
              <Badge variant="outline" className="h-5 text-xs border-emerald-300 text-emerald-700">{formData.abdm_link_status || "linked"}</Badge>
            </div>
            <p className="text-sm text-emerald-800 pl-6">Number: <span className="font-mono">{formData.abha_number}</span></p>
            {formData.abha_address && <p className="text-sm text-emerald-700 pl-6">Address: {formData.abha_address}</p>}
            {organizationId && (
              <Button type="button" variant="ghost" size="sm" className="h-6 pl-6 text-xs text-blue-600 hover:text-blue-800" onClick={() => setEnrollOpen(true)}>
                Re-enroll / Change
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="abha_number" className="text-xs text-muted-foreground">ABHA Number (14-digit)</Label>
              <Input
                id="abha_number"
                name="abha_number"
                value={formatAbhaDisplay(formData.abha_number)}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 14);
                  setFormData({
                    ...formData,
                    abha_number: digits,
                    abdm_link_status: digits ? "linked" : "unlinked",
                    abdm_source: digits ? "manual" : "",
                  });
                }}
                placeholder="1234-5678-9012-34"
                maxLength={19}
              />
              <p className="text-xs text-muted-foreground">14-digit ABHA number e.g. 1234-5678-9012-34</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="abha_address" className="text-xs text-muted-foreground">ABHA Address</Label>
              <Input
                id="abha_address"
                name="abha_address"
                value={formData.abha_address}
                onChange={(e) => setFormData({ ...formData, abha_address: e.target.value.trimStart() })}
                placeholder="username@abdm"
              />
            </div>
          </div>
        )}

        {enrollOpen && organizationId && (
          <AbhaEnrollmentDialog
            open={enrollOpen}
            onOpenChange={setEnrollOpen}
            organizationId={organizationId}
            patientId={patientId ?? undefined}
            onEnrolled={handleEnrolled}
          />
        )}

        {/* Mismatch resolution dialog */}
        <Dialog open={mismatchOpen} onOpenChange={setMismatchOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-amber-500" />
                Details Mismatch
              </DialogTitle>
              <DialogDescription>
                The ABHA record has different details than what was entered. Choose which version to keep for each field.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {mismatchFields.map((field) => (
                <div key={field.key} className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{field.label}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => setUseAbhaFor((s) => { const n = new Set(s); n.delete(field.key); return n; })}
                      className={`rounded-md border px-3 py-2 text-left transition-colors ${!useAbhaFor.has(field.key) ? "border-clinical-navy bg-clinical-navy/10 font-medium" : "border-border hover:bg-muted"}`}
                    >
                      <span className="block text-xs text-muted-foreground mb-0.5">Current</span>
                      {field.existing}
                    </button>
                    <button
                      type="button"
                      onClick={() => setUseAbhaFor((s) => new Set([...s, field.key]))}
                      className={`rounded-md border px-3 py-2 text-left transition-colors ${useAbhaFor.has(field.key) ? "border-emerald-500 bg-emerald-50 font-medium" : "border-border hover:bg-muted"}`}
                    >
                      <span className="block text-xs text-muted-foreground mb-0.5">From ABHA</span>
                      {field.fromAbha}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">ABHA number and address will always be applied.</p>

            <DialogFooter>
              <Button variant="outline" onClick={() => setMismatchOpen(false)}>Cancel</Button>
              <Button onClick={applyMismatchResolution}>Apply &amp; Continue</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="address">Address</Label>
        <Input
          id="address"
          name="address"
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          placeholder="Full address"
          autoComplete="street-address"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="lab_id">Lab</Label>
        <Select
          name="lab_id"
          value={formData.lab_id || "none"}
          onValueChange={(value) => setFormData({ ...formData, lab_id: value === "none" ? "" : value, collection_center_id: "" })}
        >
          <SelectTrigger id="lab_id">
            <SelectValue placeholder="Select lab (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
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
          name="collection_center_id"
          value={formData.collection_center_id || "none"}
          onValueChange={(value) => setFormData({ ...formData, collection_center_id: value === "none" ? "" : value })}
          disabled={!formData.lab_id || formData.lab_id === "none"}
        >
          <SelectTrigger id="collection_center_id">
            <SelectValue placeholder={formData.lab_id ? "Select collection center (optional)" : "Select lab first"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {filteredCollectionCenters.map((center) => (
              <SelectItem key={center.id} value={center.id}>
                {center.name} ({center.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!formData.lab_id && (
          <p className="text-xs text-muted-foreground">Please select a lab first to choose a collection center</p>
        )}
      </div>
    </div>

    <Button
      type="submit"
      className="w-full bg-clinical-navy hover:bg-clinical-navy/90"
      disabled={isSubmitting}
    >
      {isSubmitting ? "Saving..." : isEdit ? "Update Patient" : "Add Patient"}
    </Button>
    </form>
  );
};

const ManagePatients = ({ onAssignTests }: ManagePatientsProps) => {
  const { currentLab } = useLab();
  const { organization, branding, settings, loading: organizationLoading } = useOrganization();
  const organizationId = organization?.id ?? null;
  const { user, isCollector } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [labs, setLabs] = useState<Array<{ id: string; name: string; lab_code: string }>>([]);
  const [collectionCenters, setCollectionCenters] = useState<Array<{ id: string; name: string; code: string; lab_id: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAbdmDialogOpen, setIsAbdmDialogOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientTests, setPatientTests] = useState<PatientTest[]>([]);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printOptions, setPrintOptions] = useState({ includeHeader: true, includeFooter: true, includeWatermark: true });
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [abdmProfileShares, setAbdmProfileShares] = useState<AbdmProfileShare[]>([]);
  const [matchShareDialogShare, setMatchShareDialogShare] = useState<AbdmProfileShare | null>(null);
  const [matchShareSearch, setMatchShareSearch] = useState("");
  const [matchShareLoading, setMatchShareLoading] = useState(false);
  const [abdmLookupInput, setAbdmLookupInput] = useState({
    abhaNumber: "",
    abhaAddress: "",
    mobile: "",
  });
  const [abdmPreview, setAbdmPreview] = useState<AbdmScanShareIdentity | null>(null);
  const [isAbdmLookupLoading, setIsAbdmLookupLoading] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    country_code: DEFAULT_COUNTRY_CODE,
    phone: "",
    email: "",
    address: "",
    date_of_birth: "",
    gender: "",
    blood_group: "",
    abha_number: "",
    abha_address: "",
    abdm_link_status: "unlinked",
    abdm_source: "manual",
    lab_id: currentLab?.id || "",
    collection_center_id: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicatePhoneDialogOpen, setDuplicatePhoneDialogOpen] = useState(false);
  const [existingPatientsWithPhone, setExistingPatientsWithPhone] = useState<Patient[]>([]);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [customResetPassword, setCustomResetPassword] = useState("");
  const abdmScanShareEnabled =
    settings.abdm_enabled === "true" && settings.abdm_scan_share_enabled === "true";

  const fetchPatients = useCallback(async () => {
    try {
      if (!organizationId) {
        setPatients([]);
        return;
      }

      let query = supabase
        .from("patients")
        .select(`
          *,
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
        `);

      query = query.eq("organization_id" as any, organizationId);

      // If user is a collector (and not admin/employee), only show patients they created
      if (isCollector && user?.id) {
        query = query.eq("created_by", user.id);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) throw error;
      setPatients(data || []);
    } catch (error: any) {
      console.error("Error fetching patients:", error);
      toast.error("Failed to fetch patients: " + (error.message || "Unknown error"));
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }, [isCollector, organizationId, user?.id]);

  const fetchLabs = useCallback(async () => {
    try {
      if (!organizationId) {
        setLabs([]);
        return;
      }

      let query = supabase
        .from("labs")
        .select("id, name, lab_code")
        .eq("is_active", true)
        .eq("organization_id" as any, organizationId)
        .order("name");

      const { data, error } = await query;

      if (error) {
        // Table might not exist yet
        if (error.code === "42P01") {
          setLabs([]);
          return;
        }
        throw error;
      }
      setLabs(data || []);
    } catch (error) {
      console.error("Error fetching labs:", error);
      setLabs([]);
    }
  }, [organizationId]);

  const fetchCollectionCenters = useCallback(async () => {
    try {
      if (!organizationId) {
        setCollectionCenters([]);
        return;
      }

      let query = supabase
        .from("collection_centers")
        .select("id, name, code, lab_id")
        .eq("is_active", true)
        .eq("organization_id" as any, organizationId)
        .order("name");

      const { data, error } = await query;

      if (error) {
        // Table might not exist yet
        if (error.code === "42P01") {
          setCollectionCenters([]);
          return;
        }
        throw error;
      }
      setCollectionCenters(data || []);
    } catch (error) {
      console.error("Error fetching collection centers:", error);
      setCollectionCenters([]);
    }
  }, [organizationId]);

  const fetchPatientTests = useCallback(async (patientId: string) => {
    try {
      if (!organizationId) {
        setPatientTests([]);
        return;
      }

      const { data, error } = await supabase
        .from("patient_tests")
        .select(`
          id,
          test_id,
          test_name,
          test_date,
          status,
          result,
          result_value,
          result_unit,
          is_abnormal,
          notes,
          result_entered_by,
          lab_id,
          collection_center_id,
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
        .eq("patient_id", patientId)
        .eq("organization_id" as any, organizationId)
        .order("test_date", { ascending: false });

      if (error) throw error;

      const rows = (data || []) as PatientTest[];
      const enteredByUserIds = Array.from(
        new Set(rows.map((t) => t.result_entered_by).filter(Boolean) as string[])
      );

      if (enteredByUserIds.length === 0) {
        setPatientTests(rows);
        return;
      }

      const { data: employeesData, error: employeesError } = await supabase
        .from("employees")
        .select("user_id, full_name")
        .in("user_id", enteredByUserIds);

      if (employeesError) throw employeesError;

      const nameByUserId = new Map(
        (employeesData || []).map((e) => [e.user_id, e.full_name] as const)
      );

      setPatientTests(
        rows.map((t) => ({
          ...t,
          entered_by_name: t.result_entered_by ? nameByUserId.get(t.result_entered_by) : undefined,
        }))
      );
    } catch (error) {
      console.error("Error fetching patient tests:", error);
    }
  }, [organizationId]);

  const fetchBillingSummary = async (patientId: string) => {
    if (!organizationId) {
      setBillingSummary(null);
      return;
    }

    try {
      const query = supabase
        .from("invoices")
        .select("final_amount, paid_amount")
        .eq("patient_id", patientId)
        .eq("organization_id" as any, organizationId);

      const { data, error } = await query;

      if (error) throw error;

      const invoices = data || [];
      const totalBilled = invoices.reduce((sum, inv) => sum + (inv.final_amount || 0), 0);
      const totalPaid = invoices.reduce((sum, inv) => sum + (inv.paid_amount || 0), 0);

      setBillingSummary({
        totalBilled,
        totalPaid,
        outstanding: totalBilled - totalPaid,
        invoiceCount: invoices.length,
      });
    } catch (error) {
      console.error("Error fetching billing summary:", error);
      setBillingSummary(null);
    }
  };

  const fetchAbdmProfileShares = useCallback(async () => {
    try {
      if (!organizationId || !abdmScanShareEnabled) {
        setAbdmProfileShares([]);
        return;
      }

      const { data, error } = await supabase
        .from("abdm_profile_shares" as any)
        .select(`
          id,
          request_status,
          patient_name,
          patient_gender,
          patient_date_of_birth,
          patient_year_of_birth,
          patient_phone,
          abha_number,
          abha_address,
          created_at,
          matched_patient_id,
          matched_patient:patients (
            id,
            patient_id,
            full_name
          )
        `)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(6);

      if (error) {
        if ((error as { code?: string }).code === "42P01") {
          setAbdmProfileShares([]);
          return;
        }
        throw error;
      }

      setAbdmProfileShares((data || []) as AbdmProfileShare[]);
    } catch (error) {
      console.error("Error fetching ABDM profile shares:", error);
      setAbdmProfileShares([]);
    }
  }, [abdmScanShareEnabled, organizationId]);

  useEffect(() => {
    if (organizationLoading) {
      return;
    }

    if (!organizationId) {
      setPatients([]);
      setLabs([]);
      setCollectionCenters([]);
      setLoading(false);
      return;
    }

    void fetchPatients();
    void fetchLabs();
    void fetchCollectionCenters();
    void fetchAbdmProfileShares();
  }, [fetchAbdmProfileShares, fetchCollectionCenters, fetchLabs, fetchPatients, organizationId, organizationLoading]);

  const generatePatientId = () => {
    const prefix = "PAT";
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const random = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}${year}${random}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) {
      toast.error("Organization context is required before creating patients");
      return;
    }
    setIsSubmitting(true);

    try {
      const normalizedPhone = buildStoragePhoneNumber(formData.country_code, formData.phone);
      if (!normalizedPhone) {
        toast.error("Please enter a valid phone number");
        setIsSubmitting(false);
        return;
      }

      const phoneLookupVariants = getPhoneLookupVariants(normalizedPhone, formData.country_code);

      // Check for existing patients with the same phone number
      let duplicateCheckQuery = supabase
        .from("patients")
        .select("id, patient_id, full_name, phone, date_of_birth, gender, email, address, blood_group, is_active, created_at")
        .in("phone", phoneLookupVariants)
        .eq("is_active", true);

      duplicateCheckQuery = duplicateCheckQuery.eq("organization_id" as any, organizationId);

      const { data: existingPatients, error: checkError } = await duplicateCheckQuery;

      if (checkError) throw checkError;

      // If duplicate phone found, show warning dialog
      if (existingPatients && existingPatients.length > 0) {
        setExistingPatientsWithPhone(existingPatients as Patient[]);
        setDuplicatePhoneDialogOpen(true);
        setIsSubmitting(false);
        return;
      }

      // No duplicates, proceed with creation
      await createPatient(normalizedPhone);
    } catch (error: any) {
      console.error("Error checking/adding patient:", error);
      toast.error(error.message || "Failed to add patient");
      setIsSubmitting(false);
    }
  };

  const createPatient = async (normalizedPhoneOverride?: string) => {
    try {
      if (!organizationId) {
        toast.error("Organization context is required before creating patients");
        setIsSubmitting(false);
        return;
      }

      const normalizedPhone = normalizedPhoneOverride || buildStoragePhoneNumber(formData.country_code, formData.phone);
      if (!normalizedPhone) {
        toast.error("Please enter a valid phone number");
        setIsSubmitting(false);
        return;
      }

      const patientId = generatePatientId();
      const abhaNumber = formData.abha_number.trim() || null;
      const abhaAddress = formData.abha_address.trim() || null;
      const hasAbdmIdentity = Boolean(abhaNumber || abhaAddress);
      const abdmStatus = hasAbdmIdentity ? formData.abdm_link_status || "linked" : "unlinked";

      const { data: { user: authUser } } = await supabase.auth.getUser();
      
      const { error } = await supabase.from("patients").insert({
        patient_id: patientId,
        full_name: formData.full_name,
        phone: normalizedPhone,
        email: formData.email || null,
        address: formData.address || null,
        date_of_birth: formData.date_of_birth || null,
        gender: formData.gender || null,
        blood_group: formData.blood_group || null,
        abha_number: abhaNumber,
        abha_address: abhaAddress,
        abdm_link_status: abdmStatus,
        abdm_linked_at: hasAbdmIdentity ? new Date().toISOString() : null,
        abdm_last_verified_at:
          hasAbdmIdentity && abdmStatus === "verified" ? new Date().toISOString() : null,
        abdm_source: hasAbdmIdentity ? formData.abdm_source || "manual" : null,
        password_reset_required: false,
        organization_id: organizationId,
        lab_id: formData.lab_id || null,
        collection_center_id: formData.collection_center_id || null,
        created_by: authUser?.id || null,
      });

      if (error) throw error;

      toast.success(`Patient ${formData.full_name} added successfully`);
      if (formData.email?.trim() || normalizedPhone) {
        try {
          const portalUrl = `${window.location.origin}/auth/patient`;
          const { sendPatientWelcomeEmail } = await import("@/services/notificationService");
          const results = await sendPatientWelcomeEmail({
            email: formData.email?.trim() || null,
            phone: normalizedPhone,
            fullName: formData.full_name,
            patientId,
            portalUrl,
            organizationId,
            branding: {
              name: branding.displayName,
              website: branding.website,
            },
          });
          if (!results.some((result) => result.success)) {
            toast.error("Patient created, but failed to send portal credentials notification.");
          }
        } catch (emailError) {
          console.error("Failed to send patient welcome email:", emailError);
          toast.error("Patient created, but failed to send portal credentials notification.");
        }
      }
      setIsDialogOpen(false);
      setDuplicatePhoneDialogOpen(false);
      resetForm();
      fetchPatients();
    } catch (error: any) {
      console.error("Error adding patient:", error);
      toast.error(error.message || "Failed to add patient");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    if (!organizationId) {
      toast.error("Organization context is required before updating patients");
      return;
    }
    setIsSubmitting(true);

    try {
      const normalizedPhone = buildStoragePhoneNumber(formData.country_code, formData.phone);
      if (!normalizedPhone) {
        toast.error("Please enter a valid phone number");
        setIsSubmitting(false);
        return;
      }

      const abhaNumber = formData.abha_number.trim() || null;
      const abhaAddress = formData.abha_address.trim() || null;
      const hasAbdmIdentity = Boolean(abhaNumber || abhaAddress);
      const abdmStatus = hasAbdmIdentity ? formData.abdm_link_status || "linked" : "unlinked";

      const { error } = await supabase
        .from("patients")
        .update({
          full_name: formData.full_name,
          phone: normalizedPhone,
          email: formData.email || null,
          address: formData.address || null,
          date_of_birth: formData.date_of_birth || null,
          gender: formData.gender || null,
          blood_group: formData.blood_group || null,
          abha_number: abhaNumber,
          abha_address: abhaAddress,
          abdm_link_status: abdmStatus,
          abdm_linked_at:
            hasAbdmIdentity
              ? selectedPatient.abdm_linked_at || new Date().toISOString()
              : null,
          abdm_last_verified_at:
            hasAbdmIdentity && abdmStatus === "verified"
              ? selectedPatient.abdm_last_verified_at || new Date().toISOString()
              : null,
          abdm_source:
            hasAbdmIdentity ? formData.abdm_source || selectedPatient.abdm_source || "manual" : null,
          lab_id: formData.lab_id || null,
          collection_center_id: formData.collection_center_id || null,
        })
        .eq("id", selectedPatient.id)
        .eq("organization_id" as any, organizationId);

      if (error) throw error;

      toast.success("Patient updated successfully");
      setIsEditDialogOpen(false);
      setSelectedPatient(null);
      resetForm();
      fetchPatients();
    } catch (error: any) {
      console.error("Error updating patient:", error);
      toast.error(error.message || "Failed to update patient");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      full_name: "",
      country_code: DEFAULT_COUNTRY_CODE,
      phone: "",
      email: "",
      address: "",
      date_of_birth: "",
      gender: "",
      blood_group: "",
      abha_number: "",
      abha_address: "",
      abdm_link_status: "unlinked",
      abdm_source: "manual",
      lab_id: currentLab?.id || "",
      collection_center_id: "",
    });
  };

  const openEditDialog = (patient: Patient) => {
    const parsedPhone = splitPhoneForForm(patient.phone, DEFAULT_COUNTRY_CODE);
    setSelectedPatient(patient);
    setFormData({
      full_name: patient.full_name,
      country_code: parsedPhone.countryCode,
      phone: parsedPhone.nationalNumber,
      email: patient.email || "",
      address: patient.address || "",
      date_of_birth: patient.date_of_birth || "",
      gender: patient.gender || "",
      blood_group: patient.blood_group || "",
      abha_number: patient.abha_number || "",
      abha_address: patient.abha_address || "",
      abdm_link_status: patient.abdm_link_status || "unlinked",
      abdm_source: patient.abdm_source || "manual",
      lab_id: (patient as any).lab_id || currentLab?.id || "",
      collection_center_id: (patient as any).collection_center_id || "",
    });
    setIsEditDialogOpen(true);
  };

  const resetAbdmLookup = () => {
    setAbdmLookupInput({
      abhaNumber: "",
      abhaAddress: "",
      mobile: "",
    });
    setAbdmPreview(null);
    setIsAbdmLookupLoading(false);
  };

  const applyAbdmPrefill = (identity: AbdmScanShareIdentity) => {
    const parsedPhone = splitPhoneForForm(identity.phone || "", DEFAULT_COUNTRY_CODE);
    setFormData((current) => ({
      ...current,
      full_name: identity.full_name || current.full_name,
      country_code: parsedPhone.countryCode,
      phone: parsedPhone.nationalNumber,
      gender: identity.gender || current.gender,
      date_of_birth: identity.date_of_birth || current.date_of_birth,
      address: identity.address || current.address,
      abha_number: identity.abha_number || current.abha_number,
      abha_address: identity.abha_address || current.abha_address,
      abdm_link_status: "scan_shared",
      abdm_source: identity.source || "scan_share",
    }));
    setIsAbdmDialogOpen(false);
    setIsDialogOpen(true);
    toast.success("ABDM identity applied to the new patient form.");
  };

  const applyAbdmProfileShareToForm = (share: AbdmProfileShare) => {
    const parsedPhone = splitPhoneForForm(share.patient_phone || "", DEFAULT_COUNTRY_CODE);
    const addressLine = [share.abha_address].filter(Boolean).join(", ");

    setFormData((current) => ({
      ...current,
      full_name: share.patient_name || current.full_name,
      country_code: parsedPhone.countryCode,
      phone: parsedPhone.nationalNumber,
      gender:
        share.patient_gender === "M"
          ? "Male"
          : share.patient_gender === "F"
            ? "Female"
            : current.gender,
      date_of_birth: share.patient_date_of_birth || current.date_of_birth,
      address: addressLine || current.address,
      abha_number: share.abha_number || current.abha_number,
      abha_address: share.abha_address || current.abha_address,
      abdm_link_status: "scan_shared",
      abdm_source: "scan_share",
    }));
    setIsDialogOpen(true);
    toast.success("ABDM profile share applied to the patient form.");
  };

  const openMatchedPatientFromShare = async (share: AbdmProfileShare) => {
    if (!share.matched_patient_id || !organizationId) {
      return;
    }

    const localPatient = patients.find((patient) => patient.id === share.matched_patient_id);
    if (localPatient) {
      await openPatientDetails(localPatient);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("patients")
        .select(`
          *,
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
        .eq("id", share.matched_patient_id)
        .eq("organization_id" as any, organizationId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        toast.error("Matched patient record could not be found.");
        return;
      }

      await openPatientDetails(data as Patient);
    } catch (error: any) {
      console.error("Error opening matched patient:", error);
      toast.error(error.message || "Failed to open matched patient");
    }
  };

  const matchShareToPatient = async (patient: Patient) => {
    const share = matchShareDialogShare;
    if (!share || !organizationId) return;
    setMatchShareLoading(true);
    try {
      // Update the profile share to mark it as matched
      const { error: shareError } = await supabase
        .from("abdm_profile_shares" as any)
        .update({ matched_patient_id: patient.id, request_status: "matched" })
        .eq("id", share.id)
        .eq("organization_id" as any, organizationId);
      if (shareError) throw shareError;

      // Write ABHA identity onto the patient record
      const abhaUpdate: Record<string, string | null> = {};
      if (share.abha_number) abhaUpdate.abha_number = share.abha_number;
      if (share.abha_address) abhaUpdate.abha_address = share.abha_address;
      abhaUpdate.abdm_link_status = "linked";
      abhaUpdate.abdm_source = "abha_linked";
      abhaUpdate.abdm_last_verified_at = new Date().toISOString();

      const { error: patientError } = await supabase
        .from("patients")
        .update(abhaUpdate as any)
        .eq("id", patient.id)
        .eq("organization_id" as any, organizationId);
      if (patientError) throw patientError;

      // Refresh shares list
      setAbdmProfileShares((prev) =>
        prev.map((s) =>
          s.id === share.id
            ? { ...s, request_status: "matched", matched_patient_id: patient.id, matched_patient: { id: patient.id, patient_id: patient.patient_id, full_name: patient.full_name } }
            : s,
        ),
      );
      setMatchShareDialogShare(null);
      setMatchShareSearch("");
      toast.success(`ABHA profile linked to ${patient.full_name}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to link profile share");
    } finally {
      setMatchShareLoading(false);
    }
  };

  const handleAbdmLookup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!organizationId) {
      toast.error("Organization context is required before using ABDM.");
      return;
    }

    if (
      !abdmLookupInput.abhaNumber.trim() &&
      !abdmLookupInput.abhaAddress.trim() &&
      !abdmLookupInput.mobile.trim()
    ) {
      toast.error("Enter an ABHA number, ABHA address, or mobile.");
      return;
    }

    setIsAbdmLookupLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("abdm-scan-share", {
        body: {
          organization_id: organizationId,
          lab_id: formData.lab_id || currentLab?.id || null,
          abha_number: abdmLookupInput.abhaNumber.trim() || null,
          abha_address: abdmLookupInput.abhaAddress.trim() || null,
          mobile: abdmLookupInput.mobile.trim() || null,
        },
      });

      if (error) {
        throw error;
      }

      const resolvedIdentity = (data as { identity?: AbdmScanShareIdentity } | null)?.identity;
      if (!resolvedIdentity) {
        throw new Error("ABDM response did not include a patient identity.");
      }

      setAbdmPreview(resolvedIdentity);
      toast.success("ABDM sandbox identity resolved.");
    } catch (error: any) {
      console.error("Error resolving ABDM identity:", error);
      toast.error(error.message || "Failed to resolve ABDM identity");
      setAbdmPreview(null);
    } finally {
      setIsAbdmLookupLoading(false);
    }
  };

  const openPatientDetails = async (patient: Patient) => {
    setSelectedPatient(patient);
    setSelectedTestIds(new Set());
    setBillingSummary(null);
    await Promise.all([
      fetchPatientTests(patient.id),
      fetchBillingSummary(patient.id)
    ]);
    setIsSheetOpen(true);
  };

  const toggleTestSelection = (testId: string) => {
    const newSelected = new Set(selectedTestIds);
    if (newSelected.has(testId)) {
      newSelected.delete(testId);
    } else {
      newSelected.add(testId);
    }
    setSelectedTestIds(newSelected);
  };

  const completedPatientTests = patientTests.filter(t => t.status === "completed");

  const selectAllTests = () => {
    setSelectedTestIds(new Set(completedPatientTests.map(t => t.id)));
  };

  const clearTestSelection = () => {
    setSelectedTestIds(new Set());
  };

  const handlePrintTests = async () => {
    if (!selectedPatient) return;
    
    const testsToPrint = selectedTestIds.size > 0 
      ? patientTests.filter(t => selectedTestIds.has(t.id))
      : completedPatientTests;
    
    if (testsToPrint.length === 0) {
      toast.error("No completed tests to print");
      return;
    }

    const uniqueNames = Array.from(
      new Set(testsToPrint.map((t) => t.entered_by_name).filter(Boolean) as string[])
    );
    const enteredByLabel =
      uniqueNames.length === 1
        ? uniqueNames[0]
        : uniqueNames.length > 1
          ? "Multiple Staff"
          : undefined;

    const testsWithLabInfo = testsToPrint.map((t) => {
      const labId = t.lab_id || selectedPatient?.lab_id || null;
      const collectionCenterId = t.collection_center_id || selectedPatient?.collection_center_id || null;
      const labFromList = labId ? labs.find((lab) => lab.id === labId) : undefined;
      const collectionCenterFromList = collectionCenterId
        ? collectionCenters.find((cc) => cc.id === collectionCenterId)
        : undefined;

      return {
        ...t,
        lab_id: labId,
        lab_name: t.labs?.name || labFromList?.name || selectedPatient?.labs?.name || currentLab?.name,
        lab_code: t.labs?.lab_code || labFromList?.lab_code || selectedPatient?.labs?.lab_code || currentLab?.lab_code,
        collection_center_name: t.collection_centers?.name || collectionCenterFromList?.name || selectedPatient?.collection_centers?.name,
        collection_center_code: t.collection_centers?.code || collectionCenterFromList?.code || selectedPatient?.collection_centers?.code,
      };
    });

    try {
        const success = await generateMultiTestReportPDF(
        {
          full_name: selectedPatient.full_name,
          patient_id: selectedPatient.patient_id,
          phone: selectedPatient.phone,
          gender: selectedPatient.gender || undefined,
          blood_group: selectedPatient.blood_group || undefined,
          },
          testsWithLabInfo,
          enteredByLabel,
          printOptions,
          undefined,
          {
            organizationId: organizationId || undefined,
            name: branding.displayName,
            tagline: branding.tagline,
            address: branding.addressLines.join(", "),
            phone: branding.phoneNumbers.join(" | "),
            email: branding.email,
            website: branding.website,
            logoUrl: branding.logoUrl,
            reportTagline: branding.reportTagline,
            reportFooterNote: branding.reportFooterNote,
          }
        );

      if (success) {
        toast.success("Report downloaded successfully");
        setPrintDialogOpen(false);
      } else {
        toast.error("Failed to generate report");
      }
    } catch (error: any) {
      console.error("Error generating report:", error);
      toast.error("Failed to generate report: " + (error.message || "Unknown error"));
    }
  };

  const togglePatientStatus = async (patient: Patient) => {
    if (!organizationId) {
      toast.error("Organization context is required before updating patient status");
      return;
    }

    try {
      const { error } = await supabase
        .from("patients")
        .update({ is_active: !patient.is_active })
        .eq("id", patient.id)
        .eq("organization_id" as any, organizationId);

      if (error) throw error;
      toast.success(`Patient ${patient.is_active ? 'deactivated' : 'activated'} successfully`);
      fetchPatients();
    } catch (error) {
      console.error("Error updating patient:", error);
      toast.error("Failed to update patient status");
    }
  };

  const handleAdminResetPassword = async (mode: "email" | "temp" | "set") => {
    if (!selectedPatient) return;
    if (mode === "set" && customResetPassword.length < 6) {
      toast.error("Custom password must be at least 6 characters");
      return;
    }

    setResetLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("You must be signed in.");
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/patient-admin-reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          patient_id: selectedPatient.id,
          reset_base_url: window.location.origin,
          mode,
          ...(mode === "set" ? { custom_password: customResetPassword } : {}),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to reset password");
      }

      if (mode === "temp") {
        toast.success(`Temporary password: ${result.temp_password}`);
      } else if (mode === "set") {
        toast.success("Custom password set successfully");
      } else {
        toast.success("Reset link sent to patient's email");
      }

      setCustomResetPassword("");
      setResetDialogOpen(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to reset password");
    } finally {
      setResetLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Completed</Badge>;
      case "pending":
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Pending</Badge>;
      case "in_progress":
        return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">In Progress</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const filteredPatients = patients.filter((patient) => {
    const searchLower = search.toLowerCase();
    const searchDigits = search.replace(/[^\d]/g, "");
    const phoneDigits = patient.phone.replace(/[^\d]/g, "");
    const matchesSearch = 
      patient.full_name.toLowerCase().includes(searchLower) ||
      patient.patient_id.toLowerCase().includes(searchLower) ||
      formatPhoneForDisplay(patient.phone).toLowerCase().includes(searchLower) ||
      (searchDigits.length > 0 && phoneDigits.includes(searchDigits));
    
    const matchesStatus =
      filterStatus === "all" ||
      (filterStatus === "active" && patient.is_active) ||
      (filterStatus === "inactive" && !patient.is_active);

    const regDate = patient.created_at ? patient.created_at.slice(0, 10) : null;
    const matchesDate =
      (!dateFrom || (regDate && regDate >= dateFrom)) &&
      (!dateTo || (regDate && regDate <= dateTo));

    return matchesSearch && matchesStatus && matchesDate;
  });

  const totalPages = Math.max(1, Math.ceil(filteredPatients.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pagedPatients = filteredPatients.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterStatus, dateFrom, dateTo]);

  useEffect(() => {
    if (currentPage !== safePage) {
      setCurrentPage(safePage);
    }
  }, [currentPage, safePage]);

  return (
    <div className="space-y-6">
      {/* Header with search and filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative max-w-sm">
            <Label htmlFor="patient-search" className="sr-only">
              Search patients
            </Label>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="patient-search"
              name="patient_search"
              placeholder="Search by name, phone, or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 w-full sm:w-80"
              autoComplete="off"
            />
          </div>
          <Tabs value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)} className="w-auto">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="inactive">Inactive</TabsTrigger>
            </TabsList>
          </Tabs>
          <DateInput
            id="patients-date-from"
            value={dateFrom}
            onChange={setDateFrom}
            placeholder="Registered from"
            className="w-[155px]"
            showFormatHint
          />
          <DateInput
            id="patients-date-to"
            value={dateTo}
            onChange={setDateTo}
            placeholder="Registered to"
            className="w-[155px]"
            showFormatHint
          />
          {(dateFrom || dateTo) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="text-muted-foreground"
            >
              Clear dates ×
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              exportToExcel("patients", [
                { key: "patient_id", label: "Patient ID" },
                { key: "full_name", label: "Name" },
                { key: "phone", label: "Phone" },
                { key: "email", label: "Email" },
                { key: "gender", label: "Gender" },
                { key: "date_of_birth", label: "Date of Birth" },
                { key: "blood_group", label: "Blood Group" },
                { key: "address", label: "Address" },
                { key: "is_active", label: "Active" },
              ], filteredPatients.map(p => ({ ...p, is_active: p.is_active ? "Yes" : "No" })))
            }
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export
          </Button>
          {abdmScanShareEnabled && (
            <Dialog
              open={isAbdmDialogOpen}
              onOpenChange={(open) => {
                setIsAbdmDialogOpen(open);
                if (!open) {
                  resetAbdmLookup();
                }
              }}
            >
              <DialogTrigger asChild>
                <Button type="button" variant="outline" className="border-clinical-navy text-clinical-navy">
                  <ClipboardList className="h-4 w-4 mr-2" />
                  Scan with ABDM
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>ABDM Scan And Share</DialogTitle>
                  <DialogDescription>
                    Resolve a sandbox patient identity first, then continue patient creation with a prefilled form.
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleAbdmLookup} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="abdm_lookup_abha_number">ABHA Number</Label>
                      <Input
                        id="abdm_lookup_abha_number"
                        value={abdmLookupInput.abhaNumber}
                        onChange={(e) =>
                          setAbdmLookupInput((current) => ({
                            ...current,
                            abhaNumber: e.target.value.replace(/[^\d]/g, ""),
                          }))
                        }
                        placeholder="14-digit ABHA number"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="abdm_lookup_mobile">Mobile</Label>
                      <Input
                        id="abdm_lookup_mobile"
                        value={abdmLookupInput.mobile}
                        onChange={(e) =>
                          setAbdmLookupInput((current) => ({
                            ...current,
                            mobile: e.target.value,
                          }))
                        }
                        placeholder="+91XXXXXXXXXX"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="abdm_lookup_abha_address">ABHA Address</Label>
                    <Input
                      id="abdm_lookup_abha_address"
                      value={abdmLookupInput.abhaAddress}
                      onChange={(e) =>
                        setAbdmLookupInput((current) => ({
                          ...current,
                          abhaAddress: e.target.value,
                        }))
                      }
                      placeholder="name@abdm"
                    />
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-muted-foreground">
                    This first version uses tenant-scoped ABDM sandbox settings and returns normalized mock identity data. Manual registration still remains available.
                  </div>

                  {abdmPreview && (
                    <Card className="border border-slate-200 shadow-none">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Resolved Identity</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <p><span className="text-muted-foreground">Name:</span> <span className="font-medium">{abdmPreview.full_name}</span></p>
                        <p><span className="text-muted-foreground">Gender:</span> <span className="font-medium">{abdmPreview.gender}</span></p>
                        <p><span className="text-muted-foreground">Date of Birth:</span> <span className="font-medium">{abdmPreview.date_of_birth}</span></p>
                        <p><span className="text-muted-foreground">Phone:</span> <span className="font-medium">{abdmPreview.phone}</span></p>
                        {abdmPreview.abha_number && (
                          <p><span className="text-muted-foreground">ABHA Number:</span> <span className="font-medium">{abdmPreview.abha_number}</span></p>
                        )}
                        {abdmPreview.abha_address && (
                          <p className="break-all"><span className="text-muted-foreground">ABHA Address:</span> <span className="font-medium">{abdmPreview.abha_address}</span></p>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        resetAbdmLookup();
                        setIsAbdmDialogOpen(false);
                      }}
                    >
                      Cancel
                    </Button>
                    {abdmPreview ? (
                      <Button type="button" onClick={() => applyAbdmPrefill(abdmPreview)}>
                        Use This Identity
                      </Button>
                    ) : (
                      <Button type="submit" disabled={isAbdmLookupLoading}>
                        {isAbdmLookupLoading ? "Resolving..." : "Resolve Identity"}
                      </Button>
                    )}
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-clinical-navy hover:bg-clinical-navy/90">
                <Plus className="h-4 w-4 mr-2" />
                Add Patient
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Patient</DialogTitle>
                <DialogDescription>
                  Enter patient details, contact information, and lab assignment to create a new patient record.
                </DialogDescription>
              </DialogHeader>
              <PatientForm
                formData={formData}
                setFormData={setFormData}
                onSubmit={handleSubmit}
                isSubmitting={isSubmitting}
                labs={labs}
                collectionCenters={collectionCenters}
                organizationId={organizationId}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {abdmScanShareEnabled && (
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardList className="h-4 w-4" />
                  Recent ABDM Shares
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Inbound Scan and Share callbacks stored for this organization. Use them to create a patient or review a matched record.
                </p>
              </div>
              <Badge variant="outline" className="w-fit">
                {abdmProfileShares.length} recent
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {organizationId && (
              <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                <p className="mb-3 text-xs font-medium text-blue-800">Patient Scan QR — show this for Scan &amp; Share intake</p>
                <AbdmQrCodeDisplay organizationId={organizationId} labId={currentLab?.id} />
              </div>
            )}
            {abdmProfileShares.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-muted-foreground">
                No ABDM profile shares have been received for this organization yet.
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {abdmProfileShares.map((share) => (
                  <div key={share.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{share.patient_name || "Unknown patient"}</p>
                        <p className="text-xs text-muted-foreground">
                          Received {formatAppDate(share.created_at)}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          share.request_status === "matched"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : share.request_status === "unmatched"
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : share.request_status === "failed"
                                ? "border-red-200 bg-red-50 text-red-700"
                                : "border-slate-200 bg-slate-50 text-slate-700"
                        }
                      >
                        {share.request_status}
                      </Badge>
                    </div>

                    <div className="mt-3 space-y-1 text-sm">
                      {share.patient_phone && (
                        <p>
                          <span className="text-muted-foreground">Phone:</span>{" "}
                          <span className="font-medium">{formatPhoneForDisplay(share.patient_phone)}</span>
                        </p>
                      )}
                      {share.abha_number && (
                        <p>
                          <span className="text-muted-foreground">ABHA Number:</span>{" "}
                          <span className="font-medium">{share.abha_number}</span>
                        </p>
                      )}
                      {share.abha_address && (
                        <p className="break-all">
                          <span className="text-muted-foreground">ABHA Address:</span>{" "}
                          <span className="font-medium">{share.abha_address}</span>
                        </p>
                      )}
                      {share.matched_patient && (
                        <p>
                          <span className="text-muted-foreground">Matched Patient:</span>{" "}
                          <span className="font-medium">
                            {share.matched_patient.full_name} ({share.matched_patient.patient_id})
                          </span>
                        </p>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => applyAbdmProfileShareToForm(share)}
                      >
                        Use For New Patient
                      </Button>
                      {!share.matched_patient_id && share.request_status !== "matched" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => { setMatchShareDialogShare(share); setMatchShareSearch(""); }}
                        >
                          Link to Existing Patient
                        </Button>
                      )}
                      {share.matched_patient_id && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void openMatchedPatientFromShare(share)}
                        >
                          View Matched Patient
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <User className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{patients.length}</p>
                <p className="text-xs text-muted-foreground">Total Patients</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <User className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{patients.filter(p => p.is_active).length}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <Calendar className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {patients.filter(p => {
                    const created = new Date(p.created_at);
                    const now = new Date();
                    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
                  }).length}
                </p>
                <p className="text-xs text-muted-foreground">This Month</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-100">
                <Droplets className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {patients.filter(p => p.blood_group).length}
                </p>
                <p className="text-xs text-muted-foreground">With Blood Group</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Patients Table */}
      <Card className="border-0 shadow-md">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">Patient ID</TableHead>
              <TableHead className="font-semibold">Name</TableHead>
              <TableHead className="font-semibold">Contact</TableHead>
              <TableHead className="font-semibold">Gender</TableHead>
              <TableHead className="font-semibold">Blood</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="text-right font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                    Loading patients...
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredPatients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  No patients found
                </TableCell>
              </TableRow>
            ) : (
              pagedPatients.map((patient) => (
                <TableRow key={patient.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="font-mono text-sm font-medium text-primary">
                    {patient.patient_id}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{patient.full_name}</div>
                    {patient.date_of_birth && (
                      <div className="text-xs text-muted-foreground">
                        DOB: {formatAppDate(patient.date_of_birth)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm">
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      {formatPhoneForDisplay(patient.phone)}
                    </div>
                    {patient.email && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        {patient.email}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{patient.gender || "-"}</TableCell>
                  <TableCell>
                    {patient.blood_group ? (
                      <Badge variant="outline" className="font-mono">
                        {patient.blood_group}
                      </Badge>
                    ) : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge 
                      className={patient.is_active 
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" 
                        : "bg-red-100 text-red-700 hover:bg-red-100"
                      }
                    >
                      {patient.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {onAssignTests && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onAssignTests(patient)}
                          className="h-8 w-8 p-0"
                          title="Assign tests"
                          aria-label="Assign tests"
                        >
                          <ClipboardList className="h-4 w-4" />
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => openPatientDetails(patient)}
                        className="h-8 w-8 p-0"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => openEditDialog(patient)}
                        className="h-8 w-8 p-0"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>
        {filteredPatients.length > 0 && (
          <DataPagination
            total={filteredPatients.length}
            page={safePage}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Patient</DialogTitle>
            <DialogDescription>
              Update patient details, contact information, and lab assignment for the selected patient.
            </DialogDescription>
          </DialogHeader>
          <PatientForm
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleEdit}
            isEdit
            isSubmitting={isSubmitting}
            labs={labs}
            collectionCenters={collectionCenters}
            organizationId={organizationId}
            patientId={selectedPatient?.id ?? null}
          />
        </DialogContent>
      </Dialog>

      {/* Patient Details Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Patient Details</SheetTitle>
          </SheetHeader>
          
          {selectedPatient && (
            <div className="mt-6 space-y-6">
              {/* Patient Info Card */}
              <Card className="border-0 shadow-sm bg-gradient-to-br from-primary/5 to-transparent">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-8 w-8 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold">{selectedPatient.full_name}</h3>
                      <p className="text-sm font-mono text-primary">{selectedPatient.patient_id}</p>
                      <Badge 
                        className={`mt-2 ${selectedPatient.is_active 
                          ? "bg-emerald-100 text-emerald-700" 
                          : "bg-red-100 text-red-700"
                        }`}
                      >
                        {selectedPatient.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Contact & Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> Phone
                  </p>
                  <p className="font-medium">{formatPhoneForDisplay(selectedPatient.phone)}</p>
                </div>
                {selectedPatient.email && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" /> Email
                    </p>
                    <p className="font-medium text-sm">{selectedPatient.email}</p>
                  </div>
                )}
                {selectedPatient.date_of_birth && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Date of Birth
                    </p>
                    <p className="font-medium">{formatAppDate(selectedPatient.date_of_birth)}</p>
                  </div>
                )}
                {selectedPatient.gender && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Gender</p>
                    <p className="font-medium">{selectedPatient.gender}</p>
                  </div>
                )}
                {selectedPatient.blood_group && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Droplets className="h-3 w-3" /> Blood Group
                    </p>
                    <Badge variant="outline" className="font-mono text-lg">
                      {selectedPatient.blood_group}
                    </Badge>
                  </div>
                )}
                {(selectedPatient.abha_number || selectedPatient.abha_address) && (
                  <div className="space-y-1 col-span-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <ClipboardList className="h-3 w-3" /> ABDM Identity
                      </p>
                      <button
                        type="button"
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                        onClick={() => handleEditPatient(selectedPatient)}
                      >
                        <Shield className="h-3 w-3" /> Re-verify
                      </button>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                      {selectedPatient.abha_number && (
                        <p className="text-sm">
                          <span className="text-muted-foreground">ABHA Number:</span>{" "}
                          <span className="font-medium">{selectedPatient.abha_number}</span>
                        </p>
                      )}
                      {selectedPatient.abha_address && (
                        <p className="text-sm break-all">
                          <span className="text-muted-foreground">ABHA Address:</span>{" "}
                          <span className="font-medium">{selectedPatient.abha_address}</span>
                        </p>
                      )}
                      <div className="flex items-center gap-3 flex-wrap">
                        <p className="text-sm">
                          <span className="text-muted-foreground">Status:</span>{" "}
                          <span className="font-medium capitalize">
                            {(selectedPatient.abdm_link_status || "unlinked").replace(/_/g, " ")}
                          </span>
                        </p>
                        {selectedPatient.abdm_source && (
                          <p className="text-sm">
                            <span className="text-muted-foreground">Method:</span>{" "}
                            <span className="font-medium capitalize">
                              {selectedPatient.abdm_source.replace(/_/g, " ")}
                            </span>
                          </p>
                        )}
                      </div>
                      {selectedPatient.abdm_last_verified_at && (
                        <p className="text-sm">
                          <span className="text-muted-foreground">Last verified:</span>{" "}
                          <span className="font-medium">{formatAppDate(selectedPatient.abdm_last_verified_at)}</span>
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {selectedPatient.address && (
                  <div className="space-y-1 col-span-2">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Address
                    </p>
                    <p className="font-medium">{selectedPatient.address}</p>
                  </div>
                )}
                {selectedPatient.labs && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> Lab
                    </p>
                    <div>
                      <p className="font-medium">{selectedPatient.labs.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{selectedPatient.labs.lab_code}</p>
                    </div>
                  </div>
                )}
                {selectedPatient.collection_centers && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> Collection Center
                    </p>
                    <div>
                      <p className="font-medium">{selectedPatient.collection_centers.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{selectedPatient.collection_centers.code}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Test History */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Test History ({patientTests.length})
                  </h4>
                  {completedPatientTests.length > 0 && (
                    <div className="flex items-center gap-2">
                      {selectedTestIds.size > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {selectedTestIds.size} selected
                        </Badge>
                      )}
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={selectedTestIds.size === completedPatientTests.length ? clearTestSelection : selectAllTests}
                      >
                        {selectedTestIds.size === completedPatientTests.length ? "Deselect" : "Select All"}
                      </Button>
                      <Button 
                        size="sm"
                        onClick={() => setPrintDialogOpen(true)}
                        className="gap-1"
                      >
                        <Printer className="h-4 w-4" />
                        Print {selectedTestIds.size > 0 ? `(${selectedTestIds.size})` : "All"}
                      </Button>
                    </div>
                  )}
                </div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {patientTests.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No tests recorded</p>
                  ) : (
                    patientTests.map((test) => (
                      <div 
                        key={test.id} 
                        className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        {test.status === "completed" && (
                          <Checkbox
                            checked={selectedTestIds.has(test.id)}
                            onCheckedChange={() => toggleTestSelection(test.id)}
                          />
                        )}
                        <div className="flex-1">
                          <p className="font-medium">{test.test_name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{formatAppDate(test.test_date)}</span>
                            {(test.result_value !== null && test.result_value !== undefined) || test.result ? (
                              <span className={`font-medium ${test.is_abnormal ? "text-red-600" : "text-green-600"}`}>
                                • {test.result_value !== null && test.result_value !== undefined 
                                  ? `${test.result_value}${test.result_unit ? ` ${test.result_unit}` : ""}`
                                  : test.result}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {getStatusBadge(test.status)}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Billing Summary */}
              <div>
                <h4 className="font-semibold flex items-center gap-2 mb-3">
                  <Receipt className="h-4 w-4" />
                  Billing Summary
                </h4>
                {billingSummary ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                      <div className="flex items-center gap-2">
                        <IndianRupee className="h-4 w-4 text-blue-600" />
                        <span className="text-xs text-muted-foreground">Total Billed</span>
                      </div>
                      <p className="text-lg font-bold text-blue-700 dark:text-blue-400">
                        ₹{billingSummary.totalBilled.toLocaleString()}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-emerald-600" />
                        <span className="text-xs text-muted-foreground">Total Paid</span>
                      </div>
                      <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                        ₹{billingSummary.totalPaid.toLocaleString()}
                      </p>
                    </div>
                    {billingSummary.outstanding > 0 && (
                      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 col-span-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-amber-600" />
                            <span className="text-sm text-amber-700 dark:text-amber-300">Outstanding Balance</span>
                          </div>
                          <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
                            ₹{billingSummary.outstanding.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    )}
                    <p className="col-span-2 text-xs text-muted-foreground">
                      {billingSummary.invoiceCount} invoice(s) on record
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">No billing records</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setCustomResetPassword("");
                    setResetDialogOpen(true);
                  }}
                >
                  <Lock className="h-4 w-4 mr-2" />
                  Reset Password
                </Button>
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    setIsSheetOpen(false);
                    openEditDialog(selectedPatient);
                  }}
                >
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button 
                  variant={selectedPatient.is_active ? "destructive" : "default"}
                  className="flex-1"
                  onClick={() => {
                    togglePatientStatus(selectedPatient);
                    setIsSheetOpen(false);
                  }}
                >
                  {selectedPatient.is_active ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Reset Patient Password
            </DialogTitle>
            <DialogDescription>
              Send a reset link, set a temporary password, or apply a custom password for the patient.
            </DialogDescription>
          </DialogHeader>
          {selectedPatient && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Choose how to reset the password for {selectedPatient.full_name}.
              </p>
              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={() => handleAdminResetPassword("email")}
                  disabled={resetLoading || !selectedPatient.email}
                >
                  Send Reset Link to Email
                </Button>
                {!selectedPatient.email && (
                  <p className="text-xs text-amber-600">
                    No email on file. Add an email to enable reset links.
                  </p>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleAdminResetPassword("temp")}
                  disabled={resetLoading}
                >
                  Set Temporary Password
                </Button>
                <div className="space-y-2 rounded-md border p-3">
                  <Label htmlFor="custom-reset-password">Set Custom Password</Label>
                  <Input
                    id="custom-reset-password"
                    type="text"
                    value={customResetPassword}
                    onChange={(e) => setCustomResetPassword(e.target.value)}
                    placeholder="Enter new password (min 6 chars)"
                  />
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleAdminResetPassword("set")}
                    disabled={resetLoading || customResetPassword.length < 6}
                  >
                    Apply Custom Password
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Temporary password is shown once. Share it securely with the patient.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetDialogOpen(false)}
              disabled={resetLoading}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Options Dialog */}
      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5" />
              Print Options
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <p className="text-sm text-muted-foreground">
              Configure options for pre-printed A4 paper. Disable header/footer to leave space for pre-printed letterhead.
            </p>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="admin-include-header" className="flex flex-col gap-1">
                  <span>Include Header</span>
                  <span className="font-normal text-xs text-muted-foreground">
                    Print lab name and contact info
                  </span>
                </Label>
                <Switch
                  id="admin-include-header"
                  checked={printOptions.includeHeader}
                  onCheckedChange={(checked) => 
                    setPrintOptions(prev => ({ ...prev, includeHeader: checked }))
                  }
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="admin-include-footer" className="flex flex-col gap-1">
                  <span>Include Footer</span>
                  <span className="font-normal text-xs text-muted-foreground">
                    Print generation info and disclaimer
                  </span>
                </Label>
                <Switch
                  id="admin-include-footer"
                  checked={printOptions.includeFooter}
                  onCheckedChange={(checked) => 
                    setPrintOptions(prev => ({ ...prev, includeFooter: checked }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="admin-include-watermark" className="flex flex-col gap-1">
                  <span>Include Watermark</span>
                  <span className="font-normal text-xs text-muted-foreground">
                    Very light organization logo across the report background
                  </span>
                </Label>
                <Switch
                  id="admin-include-watermark"
                  checked={printOptions.includeWatermark}
                  onCheckedChange={(checked) =>
                    setPrintOptions(prev => ({ ...prev, includeWatermark: checked }))
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handlePrintTests} className="gap-2">
              <Printer className="h-4 w-4" />
              Print {selectedTestIds.size > 0 ? `(${selectedTestIds.size})` : "All"}
            </Button>
          </DialogFooter>
        </DialogContent>
        </Dialog>

      {/* Link ABHA profile share to existing patient */}
      <Dialog open={!!matchShareDialogShare} onOpenChange={(open) => { if (!open) { setMatchShareDialogShare(null); setMatchShareSearch(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Link ABHA Profile to Existing Patient</DialogTitle>
            <DialogDescription>
              Search for an existing patient and link this ABHA profile to their record.
              {matchShareDialogShare?.abha_number && (
                <span className="block mt-1 font-mono text-xs">ABHA: {matchShareDialogShare.abha_number}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Search by name, phone, or patient ID..."
              value={matchShareSearch}
              onChange={(e) => setMatchShareSearch(e.target.value)}
              autoFocus
            />
            <div className="max-h-64 overflow-y-auto space-y-1">
              {patients
                .filter((p) => {
                  if (!matchShareSearch.trim()) return true;
                  const q = matchShareSearch.toLowerCase();
                  return (
                    p.full_name?.toLowerCase().includes(q) ||
                    p.phone?.includes(q) ||
                    p.patient_id?.toLowerCase().includes(q)
                  );
                })
                .slice(0, 20)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full text-left rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm hover:bg-muted transition-colors"
                    onClick={() => void matchShareToPatient(p)}
                    disabled={matchShareLoading}
                  >
                    <span className="font-medium">{p.full_name}</span>
                    <span className="ml-2 text-muted-foreground">{p.patient_id}</span>
                    {p.phone && <span className="ml-2 text-muted-foreground">{p.phone}</span>}
                  </button>
                ))}
              {patients.filter((p) => {
                if (!matchShareSearch.trim()) return true;
                const q = matchShareSearch.toLowerCase();
                return p.full_name?.toLowerCase().includes(q) || p.phone?.includes(q) || p.patient_id?.toLowerCase().includes(q);
              }).length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">No patients found.</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Duplicate Phone Warning Dialog */}
      <DuplicatePhoneDialog
        open={duplicatePhoneDialogOpen}
        onOpenChange={setDuplicatePhoneDialogOpen}
        existingPatients={existingPatientsWithPhone}
        phoneNumber={buildStoragePhoneNumber(formData.country_code, formData.phone) || formData.phone || ""}
        onContinue={() => createPatient()}
        onCancel={() => {
          setDuplicatePhoneDialogOpen(false);
          setIsSubmitting(false);
        }}
      />
    </div>
  );
};

export default ManagePatients;
