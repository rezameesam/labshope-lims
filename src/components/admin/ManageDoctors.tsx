import { useState, useEffect } from "react";
import {
  UserPlus,
  Search,
  Edit,
  Trash2,
  Save,
  X,
  Phone,
  Mail,
  MapPin,
  IndianRupee,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatAppDate } from "@/lib/date";

interface Doctor {
  id: string;
  name: string;
  specialization: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  commission_percentage: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

interface DoctorReferral {
  id: string;
  doctor_id: string;
  patient_id: string;
  patient_name: string;
  patient_id_code: string;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_amount: number | null;
  commission_amount: number | null;
  commission_paid: boolean;
  referral_date: string;
  notes: string | null;
  doctor?: Doctor;
}

const ManageDoctors = () => {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [referrals, setReferrals] = useState<DoctorReferral[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("doctors");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [doctorToDelete, setDoctorToDelete] = useState<string | null>(null);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);

  const [doctorForm, setDoctorForm] = useState({
    name: "",
    specialization: "",
    phone: "",
    email: "",
    address: "",
    commission_percentage: 0,
    is_active: true,
    notes: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch doctors
      const { data: doctorsData, error: doctorsError } = await supabase
        .from("doctors")
        .select("*")
        .order("name");

      if (doctorsError) throw doctorsError;
      setDoctors(doctorsData || []);

      // Fetch referrals
      const { data: referralsData, error: referralsError } = await supabase
        .from("doctor_referrals")
        .select(`
          *,
          doctor:doctors(*)
        `)
        .order("referral_date", { ascending: false });

      if (referralsError) throw referralsError;

      // Fetch patient info for referrals
      const referralsWithPatients = await Promise.all(
        (referralsData || []).map(async (ref) => {
          if (ref.patient_id) {
            const { data: patientData } = await supabase
              .from("patients")
              .select("full_name, patient_id")
              .eq("id", ref.patient_id)
              .single();

            return {
              ...ref,
              patient_name: patientData?.full_name || "Unknown",
              patient_id_code: patientData?.patient_id || "",
            };
          }
          return {
            ...ref,
            patient_name: "Unknown",
            patient_id_code: "",
          };
        })
      );

      setReferrals(referralsWithPatients);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load doctors data");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setDoctorForm({
      name: "",
      specialization: "",
      phone: "",
      email: "",
      address: "",
      commission_percentage: 0,
      is_active: true,
      notes: "",
    });
    setEditingDoctor(null);
  };

  const openEditDialog = (doctor: Doctor) => {
    setEditingDoctor(doctor);
    setDoctorForm({
      name: doctor.name,
      specialization: doctor.specialization || "",
      phone: doctor.phone || "",
      email: doctor.email || "",
      address: doctor.address || "",
      commission_percentage: doctor.commission_percentage,
      is_active: doctor.is_active,
      notes: doctor.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleSaveDoctor = async () => {
    if (!doctorForm.name.trim()) {
      toast.error("Doctor name is required");
      return;
    }

    try {
      const doctorData = {
        name: doctorForm.name.trim(),
        specialization: doctorForm.specialization.trim() || null,
        phone: doctorForm.phone.trim() || null,
        email: doctorForm.email.trim() || null,
        address: doctorForm.address.trim() || null,
        commission_percentage: doctorForm.commission_percentage,
        is_active: doctorForm.is_active,
        notes: doctorForm.notes.trim() || null,
      };

      if (editingDoctor) {
        const { error } = await supabase
          .from("doctors")
          .update(doctorData)
          .eq("id", editingDoctor.id);

        if (error) throw error;
        toast.success("Doctor updated successfully");
      } else {
        const { error } = await supabase
          .from("doctors")
          .insert(doctorData);

        if (error) throw error;
        toast.success("Doctor added successfully");
      }

      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      console.error("Error saving doctor:", error);
      toast.error("Failed to save doctor");
    }
  };

  const handleDeleteDoctor = async () => {
    if (!doctorToDelete) return;

    try {
      const { error } = await supabase
        .from("doctors")
        .delete()
        .eq("id", doctorToDelete);

      if (error) throw error;

      toast.success("Doctor deleted successfully");
      setIsDeleteDialogOpen(false);
      setDoctorToDelete(null);
      fetchData();
    } catch (error) {
      console.error("Error deleting doctor:", error);
      toast.error("Failed to delete doctor");
    }
  };

  const handleMarkCommissionPaid = async (referralId: string) => {
    try {
      const { error } = await supabase
        .from("doctor_referrals")
        .update({ commission_paid: true })
        .eq("id", referralId);

      if (error) throw error;
      toast.success("Commission marked as paid");
      fetchData();
    } catch (error) {
      console.error("Error updating commission:", error);
      toast.error("Failed to update commission status");
    }
  };

  const filteredDoctors = doctors.filter((doctor) =>
    doctor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doctor.specialization?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalCommission = referrals
    .filter((ref) => !ref.commission_paid && ref.commission_amount)
    .reduce((sum, ref) => sum + (Number(ref.commission_amount) || 0), 0);

  const totalPaidCommission = referrals
    .filter((ref) => ref.commission_paid && ref.commission_amount)
    .reduce((sum, ref) => sum + (Number(ref.commission_amount) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-clinical-navy">Doctor Management</h2>
          <p className="text-muted-foreground">Manage referral doctors and track commissions</p>
        </div>
        <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
          <UserPlus className="h-4 w-4 mr-2" />
          Add Doctor
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Users className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{doctors.length}</p>
                <p className="text-xs text-muted-foreground">Total Doctors</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <TrendingUp className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{referrals.length}</p>
                <p className="text-xs text-muted-foreground">Total Referrals</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <IndianRupee className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">₹{totalCommission.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Pending Commission</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-100">
                <IndianRupee className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">₹{totalPaidCommission.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Paid Commission</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="doctors">Doctors</TabsTrigger>
          <TabsTrigger value="referrals">Referrals</TabsTrigger>
        </TabsList>

        {/* Doctors Tab */}
        <TabsContent value="doctors" className="space-y-4">
          {/* Search */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Label htmlFor="doctor-search" className="sr-only">
                Search doctors
              </Label>
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="doctor-search"
                name="doctor_search"
                placeholder="Search doctors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                autoComplete="off"
              />
            </div>
          </div>

          {/* Doctors Table */}
          <Card>
            <CardHeader>
              <CardTitle>Doctors</CardTitle>
              <CardDescription>Manage referral doctors</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : filteredDoctors.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No doctors found. Add your first doctor!
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Name</TableHead>
                      <TableHead>Specialization</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead className="text-right">Commission %</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDoctors.map((doctor) => (
                      <TableRow key={doctor.id}>
                        <TableCell className="font-medium">{doctor.name}</TableCell>
                        <TableCell>
                          {doctor.specialization ? (
                            <Badge variant="outline">{doctor.specialization}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {doctor.phone && (
                              <div className="flex items-center gap-1 text-sm">
                                <Phone className="h-3 w-3" />
                                {doctor.phone}
                              </div>
                            )}
                            {doctor.email && (
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Mail className="h-3 w-3" />
                                {doctor.email}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {doctor.commission_percentage > 0 ? (
                            <span className="font-medium">{doctor.commission_percentage}%</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={doctor.is_active ? "default" : "secondary"}>
                            {doctor.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(doctor)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDoctorToDelete(doctor.id);
                                setIsDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Referrals Tab */}
        <TabsContent value="referrals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Referrals</CardTitle>
              <CardDescription>Track patient referrals and commissions</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : referrals.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No referrals found
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Date</TableHead>
                      <TableHead>Doctor</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead className="text-right">Invoice Amount</TableHead>
                      <TableHead className="text-right">Commission</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {referrals.map((referral) => (
                      <TableRow key={referral.id}>
                        <TableCell>
                          {formatAppDate(referral.referral_date)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {referral.doctor?.name || "Unknown"}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{referral.patient_name}</p>
                            <p className="text-xs text-muted-foreground">{referral.patient_id_code}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {referral.invoice_number ? (
                            <Badge variant="outline">{referral.invoice_number}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {referral.invoice_amount ? (
                            <span className="font-medium">₹{Number(referral.invoice_amount).toLocaleString()}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {referral.commission_amount ? (
                            <span className="font-semibold">₹{Number(referral.commission_amount).toLocaleString()}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {referral.commission_paid ? (
                            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Paid</Badge>
                          ) : (
                            <Badge variant="outline">Pending</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {!referral.commission_paid && referral.commission_amount && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleMarkCommissionPaid(referral.id)}
                            >
                              Mark Paid
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Doctor Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingDoctor ? "Edit Doctor" : "Add Doctor"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  name="name"
                  value={doctorForm.name}
                  onChange={(e) => setDoctorForm({ ...doctorForm, name: e.target.value })}
                  placeholder="Dr. John Doe"
                  autoComplete="name"
                />
              </div>
              <div>
                <Label htmlFor="specialization">Specialization</Label>
                <Input
                  id="specialization"
                  name="specialization"
                  value={doctorForm.specialization}
                  onChange={(e) => setDoctorForm({ ...doctorForm, specialization: e.target.value })}
                  placeholder="Cardiologist"
                  autoComplete="organization-title"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  name="phone"
                  value={doctorForm.phone}
                  onChange={(e) => setDoctorForm({ ...doctorForm, phone: e.target.value })}
                  placeholder="+91-1234567890"
                  autoComplete="tel"
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={doctorForm.email}
                  onChange={(e) => setDoctorForm({ ...doctorForm, email: e.target.value })}
                  placeholder="doctor@example.com"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                name="address"
                value={doctorForm.address}
                onChange={(e) => setDoctorForm({ ...doctorForm, address: e.target.value })}
                placeholder="Clinic address..."
                rows={2}
                autoComplete="street-address"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="commission">Commission Percentage (%)</Label>
                <Input
                  id="commission"
                  type="number"
                  min="0"
                  max="100"
                  value={doctorForm.commission_percentage}
                  onChange={(e) => setDoctorForm({ ...doctorForm, commission_percentage: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-end">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={doctorForm.is_active}
                    onChange={(e) => setDoctorForm({ ...doctorForm, is_active: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor="is_active">Active</Label>
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                name="notes"
                value={doctorForm.notes}
                onChange={(e) => setDoctorForm({ ...doctorForm, notes: e.target.value })}
                placeholder="Additional notes..."
                rows={3}
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveDoctor}>
              <Save className="h-4 w-4 mr-2" />
              {editingDoctor ? "Update" : "Add"} Doctor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Doctor</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this doctor? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDoctor} className="bg-red-500 hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ManageDoctors;
