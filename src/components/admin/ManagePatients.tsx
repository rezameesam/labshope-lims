import React, { useState, useEffect } from "react";
import { Plus, Search, Eye, Edit2, Phone, Mail, MapPin, Calendar, Droplets, User, X, FileText, ChevronRight, Download, Printer, Receipt, IndianRupee, Clock, CheckCircle, Building2, Lock, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateMultiTestReportPDF } from "@/components/patient/TestReportPDF";
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
  lab_id: string;
  collection_center_id: string;
}

interface PatientFormProps {
  formData: PatientFormData;
  setFormData: React.Dispatch<React.SetStateAction<PatientFormData>>;
  onSubmit: (e: React.FormEvent) => void;
  isEdit?: boolean;
  isSubmitting: boolean;
  labs?: { id: string; name: string; lab_code: string }[];
  collectionCenters?: { id: string; name: string; code: string; lab_id: string }[];
}

interface ManagePatientsProps {
  onAssignTests?: (patient: Patient) => void;
}

const PatientForm = ({ formData, setFormData, onSubmit, isEdit = false, isSubmitting, labs = [], collectionCenters = [] }: PatientFormProps) => {
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

  return (
    <form onSubmit={onSubmit} className="space-y-4">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="full_name">Full Name *</Label>
        <Input
          id="full_name"
          value={formData.full_name}
          onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
          required
          placeholder="Enter full name"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone Number *</Label>
        <div className="flex gap-2">
          <Select
            value={formData.country_code}
            onValueChange={(value) => setFormData({ ...formData, country_code: value })}
          >
            <SelectTrigger className="w-[170px]">
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
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="patient@email.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="date_of_birth">Date of Birth</Label>
        <Input
          id="date_of_birth"
          type="date"
          value={formData.date_of_birth}
          onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="gender">Gender</Label>
        <Select
          value={formData.gender}
          onValueChange={(value) => setFormData({ ...formData, gender: value })}
        >
          <SelectTrigger>
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
          value={formData.blood_group}
          onValueChange={(value) => setFormData({ ...formData, blood_group: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select blood group" />
          </SelectTrigger>
          <SelectContent>
            {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bg) => (
              <SelectItem key={bg} value={bg}>{bg}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="address">Address</Label>
        <Input
          id="address"
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          placeholder="Full address"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="lab_id">Lab</Label>
        <Select
          value={formData.lab_id || "none"}
          onValueChange={(value) => setFormData({ ...formData, lab_id: value === "none" ? "" : value, collection_center_id: "" })}
        >
          <SelectTrigger>
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
          value={formData.collection_center_id || "none"}
          onValueChange={(value) => setFormData({ ...formData, collection_center_id: value === "none" ? "" : value })}
          disabled={!formData.lab_id || formData.lab_id === "none"}
        >
          <SelectTrigger>
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
  const { user, isCollector } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [labs, setLabs] = useState<Array<{ id: string; name: string; lab_code: string }>>([]);
  const [collectionCenters, setCollectionCenters] = useState<Array<{ id: string; name: string; code: string; lab_id: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientTests, setPatientTests] = useState<PatientTest[]>([]);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printOptions, setPrintOptions] = useState({ includeHeader: true, includeFooter: true });
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [formData, setFormData] = useState({
    full_name: "",
    country_code: DEFAULT_COUNTRY_CODE,
    phone: "",
    email: "",
    address: "",
    date_of_birth: "",
    gender: "",
    blood_group: "",
    lab_id: currentLab?.id || "",
    collection_center_id: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicatePhoneDialogOpen, setDuplicatePhoneDialogOpen] = useState(false);
  const [existingPatientsWithPhone, setExistingPatientsWithPhone] = useState<Patient[]>([]);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const fetchPatients = async () => {
    try {
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
  };

  const fetchLabs = async () => {
    try {
      const { data, error } = await supabase
        .from("labs")
        .select("id, name, lab_code")
        .eq("is_active", true)
        .order("name");

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
  };

  const fetchCollectionCenters = async () => {
    try {
      const { data, error } = await supabase
        .from("collection_centers")
        .select("id, name, code, lab_id")
        .eq("is_active", true)
        .order("name");

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
  };

  const fetchPatientTests = async (patientId: string) => {
    try {
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
  };

  const fetchBillingSummary = async (patientId: string) => {
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select("final_amount, paid_amount")
        .eq("patient_id", patientId);

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

  useEffect(() => {
    fetchPatients();
    fetchLabs();
    fetchCollectionCenters();
  }, []);

  const generatePatientId = () => {
    const prefix = "PAT";
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const random = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}${year}${random}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      const { data: existingPatients, error: checkError } = await supabase
        .from("patients")
        .select("id, patient_id, full_name, phone, date_of_birth, gender, email, address, blood_group, is_active, created_at")
        .in("phone", phoneLookupVariants)
        .eq("is_active", true);

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
      const normalizedPhone = normalizedPhoneOverride || buildStoragePhoneNumber(formData.country_code, formData.phone);
      if (!normalizedPhone) {
        toast.error("Please enter a valid phone number");
        setIsSubmitting(false);
        return;
      }

      const patientId = generatePatientId();

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
        lab_id: formData.lab_id || null,
        collection_center_id: formData.collection_center_id || null,
        created_by: authUser?.id || null,
      });

      if (error) throw error;

      toast.success(`Patient ${formData.full_name} added successfully`);
      if (formData.email?.trim()) {
        try {
          const portalUrl = `${window.location.origin}/auth/patient`;
          const { sendPatientWelcomeEmail } = await import("@/services/notificationService");
          const results = await sendPatientWelcomeEmail({
            email: formData.email.trim(),
            fullName: formData.full_name,
            patientId,
            portalUrl,
          });
          if (!results.some((result) => result.success)) {
            toast.error("Patient created, but failed to send portal credentials email.");
          }
        } catch (emailError) {
          console.error("Failed to send patient welcome email:", emailError);
          toast.error("Patient created, but failed to send portal credentials email.");
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
    setIsSubmitting(true);

    try {
      const normalizedPhone = buildStoragePhoneNumber(formData.country_code, formData.phone);
      if (!normalizedPhone) {
        toast.error("Please enter a valid phone number");
        setIsSubmitting(false);
        return;
      }

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
          lab_id: formData.lab_id || null,
          collection_center_id: formData.collection_center_id || null,
        })
        .eq("id", selectedPatient.id);

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
      lab_id: (patient as any).lab_id || currentLab?.id || "",
      collection_center_id: (patient as any).collection_center_id || "",
    });
    setIsEditDialogOpen(true);
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
        printOptions
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
    try {
      const { error } = await supabase
        .from("patients")
        .update({ is_active: !patient.is_active })
        .eq("id", patient.id);

      if (error) throw error;
      toast.success(`Patient ${patient.is_active ? 'deactivated' : 'activated'} successfully`);
      fetchPatients();
    } catch (error) {
      console.error("Error updating patient:", error);
      toast.error("Failed to update patient status");
    }
  };

  const handleAdminResetPassword = async (mode: "email" | "temp") => {
    if (!selectedPatient) return;

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
          mode,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to reset password");
      }

      if (mode === "temp") {
        toast.success(`Temporary password set to ${result.temp_password || selectedPatient.patient_id}`);
      } else {
        toast.success("Reset link sent to patient's email");
      }

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

    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filteredPatients.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pagedPatients = filteredPatients.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterStatus]);

  useEffect(() => {
    if (currentPage !== safePage) {
      setCurrentPage(safePage);
    }
  }, [currentPage, safePage]);

  return (
    <div className="space-y-6">
      {/* Header with search and filters */}
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
        <div className="flex flex-col sm:flex-row gap-4 flex-1">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 w-full sm:w-80"
            />
          </div>
          <Tabs value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)} className="w-auto">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="inactive">Inactive</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

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
            </DialogHeader>
            <PatientForm 
              formData={formData}
              setFormData={setFormData}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              labs={labs}
              collectionCenters={collectionCenters}
            />
          </DialogContent>
        </Dialog>
      </div>

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
                        DOB: {format(new Date(patient.date_of_birth), "dd MMM yyyy")}
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
        {filteredPatients.length > 0 && (
          <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {startIndex + 1}-{Math.min(endIndex, filteredPatients.length)} of{" "}
              {filteredPatients.length}
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
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Patient</DialogTitle>
          </DialogHeader>
          <PatientForm 
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleEdit}
            isEdit
            isSubmitting={isSubmitting}
            labs={labs}
            collectionCenters={collectionCenters}
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
                    <p className="font-medium">{format(new Date(selectedPatient.date_of_birth), "dd MMM yyyy")}</p>
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
                            <span>{format(new Date(test.test_date), "dd MMM yyyy")}</span>
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
                  onClick={() => setResetDialogOpen(true)}
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
              Send a reset link or set a temporary password for the patient.
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
                  Set Temporary Password (Patient ID)
                </Button>
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
