import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, Eye, Edit2, Phone, Mail, MapPin, Calendar, Droplets, User, X, FileText, ChevronRight, Download, Printer, Receipt, IndianRupee, Clock, CheckCircle, CheckCircle2, Building2, Lock, ClipboardList, Shield, FileSpreadsheet, CreditCard } from "lucide-react";
import { exportToExcel } from "@/lib/exportToExcel";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
  SheetDescription,
} from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { useLab } from "@/contexts/LabContext";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/contexts/OrganizationContext";
import { formatAppDate } from "@/lib/date";
import { generateScopedInvoiceNumber } from "@/lib/invoiceNumbers";
import { getUpgradeMessage, PLAN_LIMITS, resolvePlanTier } from "@/lib/planLimits";
import { DataPagination } from "@/components/ui/data-pagination";
import {
  DEFAULT_COUNTRY_CODE,
  PHONE_COUNTRY_OPTIONS,
  buildStoragePhoneNumber,
  formatPhoneForDisplay,
  getPhoneLookupVariants,
  splitPhoneForForm,
} from "@/lib/phone";
import PatientFilters from "./patients/PatientFilters";
import PatientTable from "./patients/PatientTable";
import PatientFormDialog from "./patients/PatientFormDialog";
import PatientDetailView from "./patients/PatientDetailView";

const AbhaEnrollmentDialog = React.lazy(() => import("./AbhaEnrollmentDialog").then((module) => ({ default: module.AbhaEnrollmentDialog })));
const AbdmQrCodeDisplay = React.lazy(() => import("./AbdmQrCodeDisplay"));
const DuplicatePhoneDialog = React.lazy(() => import("./DuplicatePhoneDialog"));

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

interface CatalogTest {
  id: string;
  test_id: string | null;
  name: string;
  price: number;
}

interface QuickAssignPackage {
  id: string;
  name: string;
  tests: string[];
  price: number;
}

interface QuickAssignDuplicateInsight {
  test_name: string;
  last_test_date: string;
  last_status: string;
  risk: "high" | "medium" | "low";
}

interface PatientCommunicationEvent {
  id: string;
  title: string;
  message: string | null;
  reminder_date: string;
  reminder_type: string;
  notification_method: string | null;
  notification_sent: boolean | null;
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
        <DatePicker
          value={formData.date_of_birth}
          onChange={(value) => setFormData({ ...formData, date_of_birth: value })}
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
      <div className="md:col-span-2 space-y-3 rounded-lg border border-border/70 bg-muted/35 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">ABHA / Health ID <span className="text-muted-foreground font-normal">(Optional)</span></p>
          {organizationId && !formData.abha_number && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 border-primary/30 bg-background/80 text-foreground hover:bg-primary/10 hover:text-foreground"
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
                className="h-7 gap-1.5 border-primary/25 bg-background/80 text-foreground hover:bg-primary/10 hover:text-foreground"
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
          <div className="space-y-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">ABHA Linked</span>
              <Badge variant="outline" className="h-5 border-emerald-500/35 text-xs text-emerald-700 dark:text-emerald-300">{formData.abdm_link_status || "linked"}</Badge>
            </div>
            <p className="pl-6 text-sm text-emerald-700 dark:text-emerald-300">Number: <span className="font-mono">{formData.abha_number}</span></p>
            {formData.abha_address && <p className="pl-6 text-sm text-emerald-700/90 dark:text-emerald-300/90">Address: {formData.abha_address}</p>}
            {organizationId && (
              <Button type="button" variant="ghost" size="sm" className="h-6 pl-6 text-xs text-primary hover:bg-transparent hover:text-primary/80" onClick={() => setEnrollOpen(true)}>
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
          <Suspense fallback={null}>
            <AbhaEnrollmentDialog
              open={enrollOpen}
              onOpenChange={setEnrollOpen}
              organizationId={organizationId}
              patientId={patientId ?? undefined}
              onEnrolled={handleEnrolled}
            />
          </Suspense>
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
  const [patientCommunicationEvents, setPatientCommunicationEvents] = useState<PatientCommunicationEvent[]>([]);
  const [quickAssignOpen, setQuickAssignOpen] = useState(false);
  const [quickAssignPatient, setQuickAssignPatient] = useState<Patient | null>(null);
  const [catalogTests, setCatalogTests] = useState<CatalogTest[]>([]);
  const [quickAssignPackages, setQuickAssignPackages] = useState<QuickAssignPackage[]>([]);
  const [quickAssignSelectedPackageId, setQuickAssignSelectedPackageId] = useState<string>("none");
  const [quickAssignSearch, setQuickAssignSearch] = useState("");
  const [quickAssignSelectedTests, setQuickAssignSelectedTests] = useState<string[]>([]);
  const [quickAssignSubmitting, setQuickAssignSubmitting] = useState(false);
  const [quickAssignDuplicateAccepted, setQuickAssignDuplicateAccepted] = useState(false);
  const [quickAssignDuplicateInsights, setQuickAssignDuplicateInsights] = useState<QuickAssignDuplicateInsight[]>([]);
  const [quickAssignSkipDuplicates, setQuickAssignSkipDuplicates] = useState(false);
  const [quickAssignOverrideReason, setQuickAssignOverrideReason] = useState("");
  const [quickAssignSuccess, setQuickAssignSuccess] = useState<{ invoiceNumber: string; finalAmount: number; patientName: string } | null>(null);
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
  const currentPlan = resolvePlanTier(settings.plan_tier);
  const patientLimit = PLAN_LIMITS[currentPlan].patients;
  const patientLimitReached = Number.isFinite(patientLimit) && patients.length >= patientLimit;
  const patientLimitMessage = patientLimitReached ? getUpgradeMessage(currentPlan, "patients", patientLimit) : "";

  const fetchPatients = useCallback(async () => {
    try {
      if (!organizationId) {
        setPatients([]);
        return;
      }

      let query = (supabase as any)
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

  const fetchCatalogTests = useCallback(async () => {
    try {
      if (!organizationId) {
        setCatalogTests([]);
        return;
      }

      const { data, error } = await (supabase as any)
        .from("tests")
        .select("id, test_id, name, price")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setCatalogTests((data || []) as CatalogTest[]);
    } catch (error) {
      console.error("Error fetching catalog tests:", error);
      setCatalogTests([]);
    }
  }, [organizationId]);

  const fetchQuickAssignPackages = useCallback(async () => {
    try {
      if (!organizationId) {
        setQuickAssignPackages([]);
        return;
      }

      const { data: packagesData, error: packagesError } = await (supabase as any)
        .from("test_packages")
        .select("id, name, price")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name");

      if (packagesError) throw packagesError;

      const packageIds = (packagesData || []).map((p: any) => p.id);
      let testsByPackage = new Map<string, string[]>();

      if (packageIds.length > 0) {
        const { data: packageTestsData, error: packageTestsError } = await (supabase as any)
          .from("test_package_tests")
          .select("package_id, test_id")
          .in("package_id", packageIds);

        if (!packageTestsError && packageTestsData) {
          for (const row of packageTestsData as Array<{ package_id: string; test_id: string }>) {
            const list = testsByPackage.get(row.package_id) || [];
            list.push(row.test_id);
            testsByPackage.set(row.package_id, list);
          }
        }
      }

      const normalized = (packagesData || []).map((pkg: any) => ({
        id: pkg.id,
        name: pkg.name,
        price: Number(pkg.price || 0),
        tests: testsByPackage.get(pkg.id) || [],
      })) as QuickAssignPackage[];

      setQuickAssignPackages(normalized);
    } catch (error) {
      console.error("Error fetching quick assign packages:", error);
      setQuickAssignPackages([]);
    }
  }, [organizationId]);

  const fetchLabs = useCallback(async () => {
    try {
      if (!organizationId) {
        setLabs([]);
        return;
      }

      let query = (supabase as any)
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

      let query = (supabase as any)
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

      const { data, error } = await (supabase as any)
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

  const fetchPatientCommunicationEvents = useCallback(async (patientId: string) => {
    try {
      if (!organizationId) {
        setPatientCommunicationEvents([]);
        return;
      }

      const { data, error } = await (supabase as any)
        .from("patient_reminders")
        .select("id, title, message, reminder_date, reminder_type, notification_method, notification_sent")
        .eq("patient_id", patientId)
        .order("reminder_date", { ascending: false })
        .limit(12);

      if (error) {
        if (error.code === "42P01") {
          setPatientCommunicationEvents([]);
          return;
        }
        throw error;
      }

      setPatientCommunicationEvents((data || []) as PatientCommunicationEvent[]);
    } catch (error) {
      console.error("Error fetching communication events:", error);
      setPatientCommunicationEvents([]);
    }
  }, [organizationId]);

  const fetchBillingSummary = async (patientId: string) => {
    if (!organizationId) {
      setBillingSummary(null);
      return;
    }

    try {
      const query = (supabase as any)
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

  const [payAllDialogOpen, setPayAllDialogOpen] = useState(false);
  const [payAllPatientId, setPayAllPatientId] = useState<string | null>(null);
  const [payAllAmount, setPayAllAmount] = useState(0);
  const [payAllMethod, setPayAllMethod] = useState("cash");
  const [payAllTxnId, setPayAllTxnId] = useState("");
  const [payAllSubmitting, setPayAllSubmitting] = useState(false);

  const openPayAllDialog = (patientId: string, outstanding: number) => {
    setPayAllPatientId(patientId);
    setPayAllAmount(outstanding);
    setPayAllMethod("cash");
    setPayAllTxnId("");
    setPayAllDialogOpen(true);
  };

  const handlePayAll = async () => {
    if (!organizationId || !payAllPatientId || payAllAmount <= 0) return;
    setPayAllSubmitting(true);
    try {
      // Fetch all unpaid/partial invoices for this patient
      const { data: invoices, error: fetchErr } = await (supabase as any)
        .from("invoices")
        .select("id, invoice_number, final_amount, paid_amount, patient_id")
        .eq("patient_id", payAllPatientId)
        .eq("organization_id", organizationId)
        .in("payment_status", ["pending", "partial"])
        .order("created_at");

      if (fetchErr) throw fetchErr;
      if (!invoices || invoices.length === 0) {
        toast.info("No outstanding invoices found");
        setPayAllDialogOpen(false);
        setPayAllSubmitting(false);
        return;
      }

      // Pay each invoice fully
      for (const inv of invoices) {
        const remaining = inv.final_amount - inv.paid_amount;
        if (remaining <= 0) continue;

        // Record payment
        await (supabase as any)
          .from("payments")
          .insert({
            invoice_id: inv.id,
            organization_id: organizationId,
            amount: remaining,
            payment_method: payAllMethod,
            transaction_id: payAllTxnId || null,
            received_by: user?.id,
          });

        // Update invoice to paid
        await (supabase as any)
          .from("invoices")
          .update({
            paid_amount: inv.final_amount,
            payment_status: "paid",
            payment_method: payAllMethod,
            paid_at: new Date().toISOString(),
          })
          .eq("id", inv.id);
      }

      toast.success(`All ${invoices.length} invoice(s) marked as paid — ₹${payAllAmount.toLocaleString()}`);
      setPayAllDialogOpen(false);

      // Refresh billing summary
      if (payAllPatientId) await fetchBillingSummary(payAllPatientId);
    } catch (err: any) {
      toast.error(err.message || "Failed to process payments");
    }
    setPayAllSubmitting(false);
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

      setAbdmProfileShares((data || []) as unknown as AbdmProfileShare[]);
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
    void fetchCatalogTests();
    void fetchQuickAssignPackages();
    void fetchAbdmProfileShares();
  }, [fetchAbdmProfileShares, fetchCatalogTests, fetchQuickAssignPackages, fetchCollectionCenters, fetchLabs, fetchPatients, organizationId, organizationLoading]);

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
    if (patientLimitReached) {
      toast.error(patientLimitMessage);
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
      const { data: existingPatients, error: checkError } = await (supabase as any)
        .from("patients")
        .select("id, patient_id, full_name, phone, date_of_birth, gender, email, address, blood_group, is_active, created_at")
        .in("phone", phoneLookupVariants)
        .eq("is_active", true)
        .eq("organization_id", organizationId);

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
      if (patientLimitReached) {
        toast.error(patientLimitMessage);
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
        created_by: user?.id || null,
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

      const { error } = await (supabase as any)
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
        .match({ id: selectedPatient.id, organization_id: organizationId });

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
      const { data, error } = await (supabase as any)
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
        .match({ id: share.matched_patient_id, organization_id: organizationId })
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
      const { error: shareError } = await (supabase as any)
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

      const { error: patientError } = await (supabase as any)
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

  const openQuickAssign = (patient: Patient) => {
    setQuickAssignPatient(patient);
    setQuickAssignSearch("");
    setQuickAssignSelectedTests([]);
    setQuickAssignSelectedPackageId("none");
    setQuickAssignDuplicateAccepted(false);
    setQuickAssignDuplicateInsights([]);
    setQuickAssignSkipDuplicates(false);
    setQuickAssignOverrideReason("");
    setQuickAssignSuccess(null);
    setQuickAssignOpen(true);
  };

  const toggleQuickAssignTest = (testName: string) => {
    setQuickAssignDuplicateAccepted(false);
    setQuickAssignDuplicateInsights([]);
    setQuickAssignSkipDuplicates(false);
    setQuickAssignOverrideReason("");
    setQuickAssignSelectedPackageId("none");
    setQuickAssignSelectedTests((prev) =>
      prev.includes(testName) ? prev.filter((t) => t !== testName) : [...prev, testName]
    );
  };

  const applyQuickAssignPackage = (packageId: string) => {
    setQuickAssignDuplicateAccepted(false);
    setQuickAssignDuplicateInsights([]);
    setQuickAssignSkipDuplicates(false);
    setQuickAssignOverrideReason("");
    setQuickAssignSelectedPackageId(packageId);

    if (packageId === "none") {
      return;
    }

    const selectedPackage = quickAssignPackageById.get(packageId);
    if (!selectedPackage) return;

    const packageTestNames = selectedPackage.tests
      .map((testId) => catalogTestNameById.get(testId))
      .filter(Boolean) as string[];

    setQuickAssignSelectedTests(packageTestNames);
  };

  const createQuickOrder = async (collectPayment = false) => {
    if (!quickAssignPatient || quickAssignSelectedTests.length === 0 || !organizationId) {
      toast.error("Select patient and at least one test");
      return;
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: recentRows } = await (supabase as any)
      .from("patient_tests")
      .select("test_name, test_date, status")
      .eq("patient_id", quickAssignPatient.id)
      .gte("test_date", thirtyDaysAgo.toISOString().slice(0, 10));

    const duplicateMap = new Map<string, { last_test_date: string; last_status: string }>();
    for (const row of (recentRows || []) as Array<{ test_name: string; test_date: string; status?: string }>) {
      if (!quickAssignSelectedTests.includes(row.test_name)) continue;
      const prev = duplicateMap.get(row.test_name);
      if (!prev || new Date(row.test_date) > new Date(prev.last_test_date)) {
        duplicateMap.set(row.test_name, { last_test_date: row.test_date, last_status: row.status || "unknown" });
      }
    }

    const duplicateInsights: QuickAssignDuplicateInsight[] = Array.from(duplicateMap.entries()).map(([test_name, info]) => {
      const ageDays = Math.max(0, Math.floor((Date.now() - new Date(info.last_test_date).getTime()) / (1000 * 60 * 60 * 24)));
      const risk: "high" | "medium" | "low" = ageDays <= 7 ? "high" : ageDays <= 30 ? "medium" : "low";
      return {
        test_name,
        last_test_date: info.last_test_date,
        last_status: info.last_status,
        risk,
      };
    });

    const hasHighRiskDuplicate = duplicateInsights.some((d) => d.risk === "high");

    if (duplicateInsights.length > 0 && !quickAssignDuplicateAccepted) {
      setQuickAssignDuplicateInsights(duplicateInsights);
      toast.warning(`Duplicate intelligence found ${duplicateInsights.length} overlap(s). Review and confirm.`);
      setQuickAssignDuplicateAccepted(true);
      return;
    }

    if (hasHighRiskDuplicate && !quickAssignSkipDuplicates && !quickAssignOverrideReason.trim()) {
      toast.error("High-risk duplicate detected. Add override reason or use 'Skip Duplicates'.");
      return;
    }

    setQuickAssignSubmitting(true);
    try {
      let selectedCatalogTests = quickAssignSelectedTests
        .map((name) => catalogTestByName.get(name))
        .filter(Boolean) as CatalogTest[];

      if (quickAssignSkipDuplicates && quickAssignDuplicateInsights.length > 0) {
        const duplicateNames = new Set(quickAssignDuplicateInsights.map((d) => d.test_name));
        selectedCatalogTests = selectedCatalogTests.filter((t) => !duplicateNames.has(t.name));
      }

      if (selectedCatalogTests.length === 0) {
        toast.error("No tests left after duplicate filtering");
        setQuickAssignSubmitting(false);
        return;
      }

      const { data: insertedTests, error: testsError } = await (supabase as any)
        .from("patient_tests")
        .insert(
          selectedCatalogTests.map((test) => ({
            patient_id: quickAssignPatient.id,
            organization_id: organizationId,
            test_id: test.id,
            test_name: test.name,
            test_date: new Date().toISOString().slice(0, 10),
            status: "pending",
            created_by: user?.id || null,
            collected_by: user?.id || null,
            collected_at: new Date().toISOString(),
            lab_id: quickAssignPatient.lab_id || currentLab?.id || null,
            collection_center_id: quickAssignPatient.collection_center_id || null,
          }))
        )
        .select("id, test_name");

      if (testsError) throw testsError;

      const invoiceNumber = await generateScopedInvoiceNumber(organizationId);
      const totalAmount = selectedCatalogTests.reduce((sum, t) => sum + Number(t.price || 0), 0);

      const selectedPackage = quickAssignPackageById.get(quickAssignSelectedPackageId) || null;
      let discountAmount = 0;
      if (selectedPackage) {
        const packageTestIds = new Set(selectedPackage.tests);
        const selectedPackageTests = selectedCatalogTests.filter((test) => packageTestIds.has(test.id));
        const packageItemsTotal = selectedPackageTests.reduce((sum, test) => sum + Number(test.price || 0), 0);
        if (selectedPackageTests.length > 0) {
          discountAmount = Math.max(0, packageItemsTotal - Number(selectedPackage.price || 0));
        }
      }
      const finalAmount = Math.max(0, totalAmount - discountAmount);

      const { data: invoice, error: invoiceError } = await (supabase as any)
        .from("invoices")
        .insert({
          invoice_number: invoiceNumber,
          patient_id: quickAssignPatient.id,
          organization_id: organizationId,
          lab_id: quickAssignPatient.lab_id || currentLab?.id || null,
          collection_center_id: quickAssignPatient.collection_center_id || null,
          total_amount: totalAmount,
          discount_amount: discountAmount,
          final_amount: finalAmount,
          paid_amount: collectPayment ? finalAmount : 0,
          payment_status: collectPayment ? "paid" : "pending",
          payment_method: collectPayment ? "cash" : null,
          paid_at: collectPayment ? new Date().toISOString() : null,
          created_by: user?.id || null,
          notes: `Quick order from Patients tab (${quickAssignSelectedTests.length} test(s))${selectedPackage ? ` • package:${selectedPackage.name}` : ""}${quickAssignOverrideReason.trim() ? ` • duplicate_override:${quickAssignOverrideReason.trim()}` : ""}`,
        })
        .select("id")
        .single();

      if (invoiceError) throw invoiceError;

      const insertedTestIdByName = new Map(
        ((insertedTests as Array<{ id: string; test_name: string }> | null) || []).map((test) => [test.test_name, test.id] as const),
      );

      const items = selectedCatalogTests.map((test) => ({
        invoice_id: invoice.id,
        organization_id: organizationId,
        test_name: test.name,
        unit_price: Number(test.price || 0),
        quantity: 1,
        amount: Number(test.price || 0),
        patient_test_id: insertedTestIdByName.get(test.name) || null,
      }));

      const { error: itemsError } = await (supabase as any).from("invoice_items").insert(items);
      if (itemsError) throw itemsError;

      if (collectPayment && finalAmount > 0) {
        const { error: paymentError } = await (supabase as any).from("payments").insert({
          invoice_id: invoice.id,
          organization_id: organizationId,
          amount: finalAmount,
          payment_method: "cash",
          payment_gateway: "manual",
          payment_date: new Date().toISOString(),
          notes: "Collected during quick order (Patients tab)",
        });
        if (paymentError) throw paymentError;
      }

      toast.success(`${collectPayment ? "Order + payment recorded" : "Order created"} for ${quickAssignPatient.full_name} (${invoiceNumber})`);
      setQuickAssignSuccess({ invoiceNumber, finalAmount, patientName: quickAssignPatient.full_name });
      setQuickAssignSelectedTests([]);
      setQuickAssignSearch("");
      setQuickAssignSelectedPackageId("none");
      setQuickAssignDuplicateAccepted(false);
      setQuickAssignDuplicateInsights([]);
      setQuickAssignSkipDuplicates(false);
      setQuickAssignOverrideReason("");
      void fetchPatients();
    } catch (error: any) {
      console.error("Quick assign failed", error);
      toast.error(error.message || "Failed to create quick order");
    } finally {
      setQuickAssignSubmitting(false);
    }
  };

  const openPatientDetails = async (patient: Patient) => {
    setSelectedPatient(patient);
    setSelectedTestIds(new Set());
    setBillingSummary(null);
    setPatientCommunicationEvents([]);
    await Promise.all([
      fetchPatientTests(patient.id),
      fetchBillingSummary(patient.id),
      fetchPatientCommunicationEvents(patient.id)
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
        const { generateMultiTestReportPDF } = await import("@/components/patient/TestReportPDF");
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
      const { error } = await (supabase as any)
        .from("patients")
        .update({ is_active: !patient.is_active })
        .match({ id: patient.id, organization_id: organizationId });

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

  const catalogTestByName = useMemo(
    () => new Map(catalogTests.map((test) => [test.name, test] as const)),
    [catalogTests],
  );
  const catalogTestNameById = useMemo(
    () => new Map(catalogTests.map((test) => [test.id, test.name] as const)),
    [catalogTests],
  );
  const quickAssignPackageById = useMemo(
    () => new Map(quickAssignPackages.map((pkg) => [pkg.id, pkg] as const)),
    [quickAssignPackages],
  );

  const filteredPatients = useMemo(() => {
    const searchLower = search.toLowerCase();
    const searchDigits = search.replace(/[^\d]/g, "");

    return patients.filter((patient) => {
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
  }, [patients, search, filterStatus, dateFrom, dateTo]);

  const filteredQuickAssignTests = useMemo(() => {
    if (!quickAssignSearch.trim()) {
      return catalogTests.slice(0, 80);
    }

    const q = quickAssignSearch.toLowerCase();
    return catalogTests
      .filter((test) => test.name.toLowerCase().includes(q) || (test.test_id || "").toLowerCase().includes(q))
      .slice(0, 80);
  }, [catalogTests, quickAssignSearch]);

  const quickAssignRecentSuggestions = useMemo(
    () => Array.from(new Set(patientTests.slice(0, 20).map((t) => t.test_name).filter(Boolean))).slice(0, 8),
    [patientTests],
  );

  const quickAssignTotal = useMemo(
    () =>
      quickAssignSelectedTests.reduce((sum, testName) => {
        const row = catalogTestByName.get(testName);
        return sum + Number(row?.price || 0);
      }, 0),
    [catalogTestByName, quickAssignSelectedTests],
  );

  const quickAssignSelectedPackage = useMemo(
    () => quickAssignPackages.find((pkg) => pkg.id === quickAssignSelectedPackageId) || null,
    [quickAssignPackages, quickAssignSelectedPackageId],
  );
  let quickAssignDiscount = 0;
  if (quickAssignSelectedPackage) {
    const packageTestIds = new Set(quickAssignSelectedPackage.tests);
    const packageItemsTotal = catalogTests
      .filter((test) => quickAssignSelectedTests.includes(test.name) && packageTestIds.has(test.id))
      .reduce((sum, test) => sum + Number(test.price || 0), 0);
    if (packageItemsTotal > 0) {
      quickAssignDiscount = Math.max(0, packageItemsTotal - Number(quickAssignSelectedPackage.price || 0));
    }
  }
  const quickAssignFinalTotal = Math.max(0, quickAssignTotal - quickAssignDiscount);
  const quickAssignHasHighRiskDuplicate = quickAssignDuplicateInsights.some((d) => d.risk === "high");
  const quickAssignSkippedDuplicateNames = quickAssignSkipDuplicates
    ? quickAssignDuplicateInsights.map((d) => d.test_name)
    : [];

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
      <PatientFilters
        search={search}
        onSearchChange={setSearch}
        filterStatus={filterStatus}
        onFilterStatusChange={setFilterStatus}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        onExport={() =>
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
        abdmScanShareEnabled={abdmScanShareEnabled}
        onOpenAbdmDialog={() => setIsAbdmDialogOpen(true)}
        onOpenAddPatientDialog={() => setIsDialogOpen(true)}
        addDisabled={patientLimitReached}
        addDisabledReason={patientLimitMessage}
      />

      {/* ABDM Scan and Share Dialog */}
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

      {/* Add Patient Dialog */}
      <PatientFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        title="Add New Patient"
        description="Enter patient details, contact information, and lab assignment to create a new patient record."
      >
        <PatientForm
          formData={formData}
          setFormData={setFormData}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          labs={labs}
          collectionCenters={collectionCenters}
          organizationId={organizationId}
        />
      </PatientFormDialog>

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
                <Suspense fallback={<div className="text-sm text-muted-foreground">Loading QR code...</div>}>
                  <AbdmQrCodeDisplay organizationId={organizationId} labId={currentLab?.id} />
                </Suspense>
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
      <PatientTable
        loading={loading}
        filteredPatients={filteredPatients}
        pagedPatients={pagedPatients}
        safePage={safePage}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        onViewPatient={(patient) => void openPatientDetails(patient)}
        onEditPatient={openEditDialog}
        onAssignTests={openQuickAssign}
      />

      <Sheet open={quickAssignOpen} onOpenChange={setQuickAssignOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Quick Test Order</SheetTitle>
            <SheetDescription>
              Assign tests directly from Patients tab without switching screens.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            {quickAssignSuccess ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
                <p className="font-semibold text-emerald-800">Order created successfully</p>
                <div className="text-sm">
                  <p><span className="text-muted-foreground">Patient:</span> {quickAssignSuccess.patientName}</p>
                  <p><span className="text-muted-foreground">Invoice:</span> {quickAssignSuccess.invoiceNumber}</p>
                  <p><span className="text-muted-foreground">Final Amount:</span> ₹{quickAssignSuccess.finalAmount.toLocaleString()}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setTab("billing"); setQuickAssignOpen(false); }}>
                    Open Billing
                  </Button>
                  <Button size="sm" onClick={() => {
                    setQuickAssignSuccess(null);
                    setQuickAssignSelectedTests([]);
                    setQuickAssignSearch("");
                    setQuickAssignSelectedPackageId("none");
                    setQuickAssignDuplicateAccepted(false);
                    setQuickAssignDuplicateInsights([]);
                    setQuickAssignSkipDuplicates(false);
                    setQuickAssignOverrideReason("");
                  }}>
                    Create Another
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {quickAssignPatient && (
                  <div className="rounded-lg border p-3 bg-muted/30">
                    <p className="font-medium">{quickAssignPatient.full_name}</p>
                    <p className="text-xs text-muted-foreground">{quickAssignPatient.patient_id} • {formatPhoneForDisplay(quickAssignPatient.phone)}</p>
                  </div>
                )}

            <div className="space-y-2">
              <Label htmlFor="quick-assign-package">Package (optional)</Label>
              <Select name="quick_assign_package" value={quickAssignSelectedPackageId} onValueChange={applyQuickAssignPackage}>
                <SelectTrigger id="quick-assign-package">
                  <SelectValue placeholder="Choose a package" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No package</SelectItem>
                  {quickAssignPackages.map((pkg) => (
                    <SelectItem key={pkg.id} value={pkg.id}>
                      {pkg.name} (₹{Number(pkg.price || 0).toLocaleString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {quickAssignRecentSuggestions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Recent for this patient</p>
                <div className="flex flex-wrap gap-2">
                  {quickAssignRecentSuggestions.map((name) => {
                    const active = quickAssignSelectedTests.includes(name);
                    return (
                      <Badge key={`recent-${name}`} variant={active ? "default" : "secondary"} className="cursor-pointer" onClick={() => toggleQuickAssignTest(name)}>
                        {active ? "✓ " : ""}{name}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="quick-assign-search">Search tests</Label>
              <Input
                id="quick-assign-search"
                name="quick_assign_search"
                placeholder="Search tests by name or code..."
                value={quickAssignSearch}
                onChange={(e) => setQuickAssignSearch(e.target.value)}
              />
            </div>

            {quickAssignSelectedTests.length > 0 && (
              <div className="rounded-lg border p-3 bg-muted/20 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Selected Tests</p>
                  <Button variant="ghost" size="sm" onClick={() => { setQuickAssignSelectedTests([]); setQuickAssignDuplicateAccepted(false); }}>
                    Clear
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {quickAssignSelectedTests.map((name) => (
                    <Badge key={name} variant="secondary" className="cursor-pointer" onClick={() => toggleQuickAssignTest(name)}>
                      {name} ×
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="max-h-[48vh] overflow-y-auto space-y-2 rounded-lg border p-2">
              {filteredQuickAssignTests.map((test) => {
                const active = quickAssignSelectedTests.includes(test.name);
                return (
                  <button
                    key={test.id}
                    type="button"
                    className={`w-full text-left rounded-md border px-3 py-2 transition ${active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                    onClick={() => toggleQuickAssignTest(test.name)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{test.name}</p>
                        {test.test_id && <p className="text-xs text-muted-foreground">{test.test_id}</p>}
                      </div>
                      <Badge variant={active ? "default" : "secondary"}>₹{Number(test.price || 0).toLocaleString()}</Badge>
                    </div>
                  </button>
                );
              })}
              {filteredQuickAssignTests.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No tests found</p>
              )}
            </div>

            <div className="rounded-lg border p-3 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Selected {quickAssignSelectedTests.length} test(s)</p>
                <p className="font-semibold">₹{quickAssignTotal.toLocaleString()}</p>
              </div>
              {quickAssignDiscount > 0 && (
                <div className="flex items-center justify-between text-xs text-emerald-700">
                  <p>Package discount</p>
                  <p>- ₹{quickAssignDiscount.toLocaleString()}</p>
                </div>
              )}
              <div className="flex items-center justify-between text-sm font-semibold">
                <p>Final amount</p>
                <p>₹{quickAssignFinalTotal.toLocaleString()}</p>
              </div>
            </div>

            {quickAssignDuplicateInsights.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-2">
                <p className="text-sm font-medium text-amber-800">Duplicate intelligence</p>
                <div className="space-y-1">
                  {quickAssignDuplicateInsights.map((item) => (
                    <div key={item.test_name} className="flex items-center justify-between text-xs">
                      <div>
                        <span className="font-medium">{item.test_name}</span>
                        <span className="text-muted-foreground ml-2">{formatAppDate(item.last_test_date)} • {item.last_status}</span>
                      </div>
                      <Badge
                        variant={item.risk === "high" ? "destructive" : item.risk === "medium" ? "secondary" : "outline"}
                      >
                        {item.risk}
                      </Badge>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="quick-assign-skip-duplicates" className="text-xs">Skip duplicates and order only fresh tests</Label>
                  <Switch
                    id="quick-assign-skip-duplicates"
                    checked={quickAssignSkipDuplicates}
                    onCheckedChange={setQuickAssignSkipDuplicates}
                  />
                </div>

                {quickAssignDuplicateInsights.some((d) => d.risk === "high") && !quickAssignSkipDuplicates && (
                  <div className="space-y-1">
                    <Label htmlFor="quick-assign-override-reason" className="text-xs">Override reason (required for high risk)</Label>
                    <Input
                      id="quick-assign-override-reason"
                      placeholder="Doctor advised repeat due to clinical change"
                      value={quickAssignOverrideReason}
                      onChange={(e) => setQuickAssignOverrideReason(e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}

            {quickAssignDuplicateAccepted && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                Duplicate warning acknowledged. Review duplicate intelligence and proceed.
              </p>
            )}

            {quickAssignSkipDuplicates && quickAssignSkippedDuplicateNames.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Will skip: {quickAssignSkippedDuplicateNames.join(", ")}
              </p>
            )}

            {quickAssignHasHighRiskDuplicate && !quickAssignSkipDuplicates && (
              <p className="text-xs text-amber-700">
                High risk = same test repeated within 7 days. Provide override reason to proceed.
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setQuickAssignOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => void createQuickOrder(false)}
                disabled={quickAssignSubmitting || quickAssignSelectedTests.length === 0 || (quickAssignHasHighRiskDuplicate && !quickAssignSkipDuplicates && !quickAssignOverrideReason.trim())}
              >
                {quickAssignSubmitting ? "Creating..." : "Create Order"}
              </Button>
              <Button
                className="flex-1"
                onClick={() => void createQuickOrder(true)}
                disabled={quickAssignSubmitting || quickAssignSelectedTests.length === 0 || (quickAssignHasHighRiskDuplicate && !quickAssignSkipDuplicates && !quickAssignOverrideReason.trim())}
              >
                {quickAssignSubmitting ? "Creating..." : "Create + Collect"}
              </Button>
            </div>
          </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit Dialog */}
      <PatientFormDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        title="Edit Patient"
        description="Update patient details, contact information, and lab assignment for the selected patient."
      >
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
      </PatientFormDialog>

      {/* Patient Detail Sheet + Reset Password Dialog + Print Options Dialog */}
      <PatientDetailView
        isSheetOpen={isSheetOpen}
        onSheetOpenChange={setIsSheetOpen}
        selectedPatient={selectedPatient}
        patientTests={patientTests}
        billingSummary={billingSummary}
        patientCommunicationEvents={patientCommunicationEvents}
        selectedTestIds={selectedTestIds}
        completedPatientTests={completedPatientTests}
        onToggleTestSelection={toggleTestSelection}
        onSelectAllTests={selectAllTests}
        onClearTestSelection={clearTestSelection}
        onOpenPrintDialog={() => setPrintDialogOpen(true)}
        onEditPatient={openEditDialog}
        onTogglePatientStatus={togglePatientStatus}
        onOpenResetDialog={() => {
          setCustomResetPassword("");
          setResetDialogOpen(true);
        }}
        onPayAll={openPayAllDialog}
        getStatusBadge={getStatusBadge}
        resetDialogOpen={resetDialogOpen}
        onResetDialogOpenChange={setResetDialogOpen}
        resetLoading={resetLoading}
        customResetPassword={customResetPassword}
        onCustomResetPasswordChange={setCustomResetPassword}
        onAdminResetPassword={handleAdminResetPassword}
        printDialogOpen={printDialogOpen}
        onPrintDialogOpenChange={setPrintDialogOpen}
        printOptions={printOptions}
        onPrintOptionsChange={setPrintOptions}
        onPrintTests={handlePrintTests}
      />

      {/* Pay All Dialog */}
      <Dialog open={payAllDialogOpen} onOpenChange={setPayAllDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Pay All Outstanding
            </DialogTitle>
            <DialogDescription>
              Record payment for all outstanding invoices for this patient.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg text-center">
              <p className="text-xs text-muted-foreground">Total Outstanding</p>
              <p className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-400">₹{payAllAmount.toLocaleString()}</p>
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={payAllMethod} onValueChange={setPayAllMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {payAllMethod !== "cash" && (
              <div className="space-y-2">
                <Label>Transaction ID</Label>
                <Input value={payAllTxnId} onChange={(e) => setPayAllTxnId(e.target.value)} placeholder="Enter transaction reference" />
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              This will mark all outstanding invoices as paid and create journal entries in Finance.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayAllDialogOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handlePayAll} disabled={payAllSubmitting}>
              {payAllSubmitting ? "Processing..." : `Pay ₹${payAllAmount.toLocaleString()}`}
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
      {duplicatePhoneDialogOpen && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}
    </div>
  );
};

export default ManagePatients;
