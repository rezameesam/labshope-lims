import React, { useState, useEffect } from "react";
import { Plus, Search, Eye, Edit2, Phone, Mail, MapPin, Calendar, Droplets, User, X, FileText, ChevronRight, Download, Printer, Receipt, IndianRupee, Clock, CheckCircle } from "lucide-react";
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
  created_at: string;
}

interface PatientTest {
  id: string;
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
}

interface BillingSummary {
  totalBilled: number;
  totalPaid: number;
  outstanding: number;
  invoiceCount: number;
}

interface PatientFormData {
  full_name: string;
  phone: string;
  email: string;
  address: string;
  date_of_birth: string;
  gender: string;
  blood_group: string;
}

interface PatientFormProps {
  formData: PatientFormData;
  setFormData: React.Dispatch<React.SetStateAction<PatientFormData>>;
  onSubmit: (e: React.FormEvent) => void;
  isEdit?: boolean;
  isSubmitting: boolean;
}

const PatientForm = ({ formData, setFormData, onSubmit, isEdit = false, isSubmitting }: PatientFormProps) => (
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
        <Input
          id="phone"
          type="tel"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          required
          placeholder="e.g. 9419034607"
        />
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

const ManagePatients = () => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientTests, setPatientTests] = useState<PatientTest[]>([]);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(new Set());
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printOptions, setPrintOptions] = useState({ includeHeader: true, includeFooter: true });
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    email: "",
    address: "",
    date_of_birth: "",
    gender: "",
    blood_group: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchPatients = async () => {
    try {
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPatients(data || []);
    } catch (error) {
      console.error("Error fetching patients:", error);
      toast.error("Failed to fetch patients");
    } finally {
      setLoading(false);
    }
  };

  const fetchPatientTests = async (patientId: string) => {
    try {
      const { data, error } = await supabase
        .from("patient_tests")
        .select("id, test_name, test_date, status, result, result_value, result_unit, is_abnormal, notes, result_entered_by")
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
      const patientId = generatePatientId();

      const { error } = await supabase.from("patients").insert({
        patient_id: patientId,
        full_name: formData.full_name,
        phone: formData.phone,
        email: formData.email || null,
        address: formData.address || null,
        date_of_birth: formData.date_of_birth || null,
        gender: formData.gender || null,
        blood_group: formData.blood_group || null,
      });

      if (error) throw error;

      toast.success(`Patient ${formData.full_name} added successfully`);
      setIsDialogOpen(false);
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
      const { error } = await supabase
        .from("patients")
        .update({
          full_name: formData.full_name,
          phone: formData.phone,
          email: formData.email || null,
          address: formData.address || null,
          date_of_birth: formData.date_of_birth || null,
          gender: formData.gender || null,
          blood_group: formData.blood_group || null,
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
      phone: "",
      email: "",
      address: "",
      date_of_birth: "",
      gender: "",
      blood_group: "",
    });
  };

  const openEditDialog = (patient: Patient) => {
    setSelectedPatient(patient);
    setFormData({
      full_name: patient.full_name,
      phone: patient.phone,
      email: patient.email || "",
      address: patient.address || "",
      date_of_birth: patient.date_of_birth || "",
      gender: patient.gender || "",
      blood_group: patient.blood_group || "",
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

  const handlePrintTests = () => {
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

    const success = generateMultiTestReportPDF(
      {
        full_name: selectedPatient.full_name,
        patient_id: selectedPatient.patient_id,
        phone: selectedPatient.phone,
        gender: selectedPatient.gender || undefined,
        blood_group: selectedPatient.blood_group || undefined,
      },
      testsToPrint,
      enteredByLabel,
      printOptions
    );

    if (success) {
      toast.success("Report downloaded successfully");
      setPrintDialogOpen(false);
    } else {
      toast.error("Failed to generate report");
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
    const matchesSearch = 
      patient.full_name.toLowerCase().includes(search.toLowerCase()) ||
      patient.phone.includes(search) ||
      patient.patient_id.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = 
      filterStatus === "all" ||
      (filterStatus === "active" && patient.is_active) ||
      (filterStatus === "inactive" && !patient.is_active);

    return matchesSearch && matchesStatus;
  });

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
              filteredPatients.map((patient) => (
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
                      {patient.phone}
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
                  <p className="font-medium">{selectedPatient.phone}</p>
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
    </div>
  );
};

export default ManagePatients;
