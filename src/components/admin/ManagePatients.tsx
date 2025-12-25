import { useState, useEffect } from "react";
import { Plus, Search, Eye, Edit2, Phone, Mail, MapPin, Calendar, Droplets, User, X, FileText, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
}

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
        .select("id, test_name, test_date, status, result")
        .eq("patient_id", patientId)
        .order("test_date", { ascending: false });

      if (error) throw error;
      setPatientTests(data || []);
    } catch (error) {
      console.error("Error fetching patient tests:", error);
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
    await fetchPatientTests(patient.id);
    setIsSheetOpen(true);
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

  const PatientForm = ({ onSubmit, isEdit = false }: { onSubmit: (e: React.FormEvent) => void; isEdit?: boolean }) => (
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
            <PatientForm onSubmit={handleSubmit} />
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
          <PatientForm onSubmit={handleEdit} isEdit />
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
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Test History ({patientTests.length})
                </h4>
                <div className="space-y-2">
                  {patientTests.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No tests recorded</p>
                  ) : (
                    patientTests.map((test) => (
                      <div 
                        key={test.id} 
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <div>
                          <p className="font-medium">{test.test_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(test.test_date), "dd MMM yyyy")}
                          </p>
                        </div>
                        {getStatusBadge(test.status)}
                      </div>
                    ))
                  )}
                </div>
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
    </div>
  );
};

export default ManagePatients;
