import { useState, useEffect, useMemo } from "react";
import { Plus, Search, CheckCircle, Clock, AlertCircle, Calendar, History, User, X, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { generateMultiTestReportPDF } from "@/components/patient/TestReportPDF";

interface PatientTest {
  id: string;
  patient_id: string;
  test_name: string;
  test_date: string;
  status: string;
  result: string | null;
  result_value: number | null;
  result_unit: string | null;
  is_abnormal: boolean | null;
  normal_range_text: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  updated_by: string | null;
  result_entered_by: string | null;
  result_entered_at: string | null;
  test_id: string | null;
  collected_by: string | null;
  collected_at: string | null;
  patients: {
    patient_id: string;
    full_name: string;
    phone: string;
  };
}

interface AuditLog {
  id: string;
  action: string;
  changed_by: string | null;
  changed_at: string;
  old_values: any;
  new_values: any;
  notes: string | null;
}

interface Patient {
  id: string;
  patient_id: string;
  full_name: string;
  phone: string;
}

interface TestCategory {
  id: string;
  name: string;
}

interface Test {
  id: string;
  name: string;
  price: number | null;
  category_id: string | null;
  unit: string | null;
  normal_range_text: string | null;
  normal_range_min: number | null;
  normal_range_max: number | null;
}

interface Doctor {
  id: string;
  name: string;
  specialization: string | null;
  commission_percentage: number | null;
}

const ManageTests = () => {
  const { user } = useAuth();
  const [tests, setTests] = useState<PatientTest[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [categories, setCategories] = useState<TestCategory[]>([]);
  const [testCatalog, setTestCatalog] = useState<Test[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "in_progress" | "completed">("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isResultDialogOpen, setIsResultDialogOpen] = useState(false);
  const [isAuditDialogOpen, setIsAuditDialogOpen] = useState(false);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [selectedTest, setSelectedTest] = useState<PatientTest | null>(null);
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [patientSearch, setPatientSearch] = useState("");
  const [testSearch, setTestSearch] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    test_date: new Date().toISOString().split("T")[0],
    notes: "",
    referred_by: "self" as string,
    custom_doctor_name: "",
  });
  const [resultData, setResultData] = useState({
    result: "",
    result_value: "",
    result_unit: "",
    normal_range_text: "",
    is_abnormal: false,
    status: "completed",
  });
  const [printOptions, setPrintOptions] = useState({
    includeHeader: true,
    includeFooter: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter patients by search
  const filteredPatients = useMemo(() => {
    if (!patientSearch.trim()) return patients.slice(0, 10);
    const searchLower = patientSearch.toLowerCase();
    return patients.filter(
      (p) =>
        p.full_name.toLowerCase().includes(searchLower) ||
        p.patient_id.toLowerCase().includes(searchLower) ||
        p.phone.includes(patientSearch)
    ).slice(0, 20);
  }, [patients, patientSearch]);

  // Group tests by category
  const testsByCategory = useMemo(() => {
    const grouped: Record<string, Test[]> = {};
    const uncategorized: Test[] = [];
    
    testCatalog.forEach((test) => {
      if (test.category_id) {
        const category = categories.find((c) => c.id === test.category_id);
        const categoryName = category?.name || "Other";
        if (!grouped[categoryName]) grouped[categoryName] = [];
        grouped[categoryName].push(test);
      } else {
        uncategorized.push(test);
      }
    });
    
    if (uncategorized.length > 0) {
      grouped["Other Tests"] = uncategorized;
    }
    
    return grouped;
  }, [testCatalog, categories]);

  // Filter tests by search and category
  const filteredTestsByCategory = useMemo(() => {
    let filtered: Record<string, Test[]> = {};
    const searchLower = testSearch.trim().toLowerCase();
    
    Object.entries(testsByCategory).forEach(([category, tests]) => {
      // Filter by category
      if (selectedCategoryFilter !== "all" && category !== selectedCategoryFilter) {
        return;
      }
      
      // Filter by search
      const matchingTests = searchLower
        ? tests.filter((t) => t.name.toLowerCase().includes(searchLower))
        : tests;
      
      if (matchingTests.length > 0) {
        filtered[category] = matchingTests;
      }
    });
    
    return filtered;
  }, [testsByCategory, testSearch, selectedCategoryFilter]);

  const fetchData = async () => {
    try {
      const [testsRes, patientsRes, categoriesRes, catalogRes, doctorsRes] = await Promise.all([
        supabase
          .from("patient_tests")
          .select(`
            id, patient_id, test_name, test_date, status, result, result_value, result_unit, 
            is_abnormal, normal_range_text, notes, created_at, created_by, updated_by, 
            result_entered_by, result_entered_at, test_id,
            patients (
              patient_id,
              full_name,
              phone
            )
          `)
          .order("created_at", { ascending: false }),
        supabase.from("patients").select("id, patient_id, full_name, phone").eq("is_active", true),
        supabase.from("test_categories").select("id, name"),
        supabase.from("tests").select("id, name, price, category_id, unit, normal_range_text, normal_range_min, normal_range_max"),
        supabase.from("doctors").select("id, name, specialization, commission_percentage").eq("is_active", true),
      ]);

      if (testsRes.error) throw testsRes.error;
      if (patientsRes.error) throw patientsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;
      if (catalogRes.error) throw catalogRes.error;
      if (doctorsRes.error) throw doctorsRes.error;

      setTests((testsRes.data || []) as unknown as PatientTest[]);
      setPatients(patientsRes.data || []);
      setCategories(categoriesRes.data || []);
      setTestCatalog((catalogRes.data || []) as Test[]);
      setDoctors(doctorsRes.data || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedPatient) {
      toast.error("Please select a patient");
      return;
    }
    
    if (selectedTests.length === 0) {
      toast.error("Please select at least one test");
      return;
    }
    
    setIsSubmitting(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      
      // Insert all selected tests for the patient
      const testsToInsert = selectedTests.map((testName) => ({
        patient_id: selectedPatient.id,
        test_name: testName,
        test_date: formData.test_date,
        notes: formData.notes || null,
        status: "pending",
        created_by: userData.user?.id,
        collected_by: userData.user?.id, // Track who collected the sample
        collected_at: new Date().toISOString(), // Track when sample was collected
      }));

      const { data: insertedTests, error } = await supabase
        .from("patient_tests")
        .insert(testsToInsert)
        .select();

      if (error) throw error;

      // Auto-create invoice for the tests
      const invoiceNumber = `INV${new Date().getFullYear().toString().slice(-2)}${Math.floor(10000 + Math.random() * 90000)}`;
      
      // Calculate prices from test catalog
      let totalAmount = 0;
      const invoiceItemsData = selectedTests.map((testName) => {
        const catalogTest = testCatalog.find(t => t.name === testName);
        const price = catalogTest?.price || 0;
        totalAmount += price;
        return {
          test_name: testName,
          unit_price: price,
          quantity: 1,
          amount: price,
          patient_test_id: insertedTests?.find(t => t.test_name === testName)?.id || null
        };
      });

      // Create the invoice
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          invoice_number: invoiceNumber,
          patient_id: selectedPatient.id,
          total_amount: totalAmount,
          final_amount: totalAmount,
          created_by: userData.user?.id,
          notes: `Auto-generated for ${selectedTests.length} test(s)`
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Create invoice items
      const invoiceItems = invoiceItemsData.map(item => ({
        ...item,
        invoice_id: invoice.id
      }));

      const { error: itemsError } = await supabase
        .from("invoice_items")
        .insert(invoiceItems);

      if (itemsError) throw itemsError;

      // Create doctor referral if a doctor from database was selected
      if (formData.referred_by !== "self" && formData.referred_by !== "custom") {
        const selectedDoctor = doctors.find(d => d.id === formData.referred_by);
        if (selectedDoctor) {
          const commissionAmount = selectedDoctor.commission_percentage 
            ? (totalAmount * selectedDoctor.commission_percentage) / 100 
            : 0;

          const { error: referralError } = await supabase
            .from("doctor_referrals")
            .insert({
              doctor_id: selectedDoctor.id,
              patient_id: selectedPatient.id,
              invoice_id: invoice.id,
              invoice_number: invoiceNumber,
              invoice_amount: totalAmount,
              commission_amount: commissionAmount,
              notes: formData.custom_doctor_name || null,
            });

          if (referralError) {
            console.error("Error creating referral:", referralError);
          }
        }
      }

      toast.success(`${selectedTests.length} test(s) added and invoice ${invoiceNumber} created`);
      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error("Error adding test:", error);
      toast.error(error.message || "Failed to add test");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedPatient(null);
    setSelectedTests([]);
    setPatientSearch("");
    setTestSearch("");
    setSelectedCategoryFilter("all");
    setFormData({
      test_date: new Date().toISOString().split("T")[0],
      notes: "",
      referred_by: "self",
      custom_doctor_name: "",
    });
  };

  const toggleTestSelection = (testName: string) => {
    setSelectedTests((prev) =>
      prev.includes(testName)
        ? prev.filter((t) => t !== testName)
        : [...prev, testName]
    );
  };

  const selectAllInCategory = (categoryTests: Test[]) => {
    const testNames = categoryTests.map((t) => t.name);
    const allSelected = testNames.every((name) => selectedTests.includes(name));
    
    if (allSelected) {
      setSelectedTests((prev) => prev.filter((t) => !testNames.includes(t)));
    } else {
      setSelectedTests((prev) => [...new Set([...prev, ...testNames])]);
    }
  };

  const handleResultSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTest) return;
    setIsSubmitting(true);

    try {
      const updateData: Record<string, unknown> = {
        result: resultData.result || null,
        result_value: resultData.result_value ? parseFloat(resultData.result_value) : null,
        result_unit: resultData.result_unit || null,
        normal_range_text: resultData.normal_range_text || null,
        is_abnormal: resultData.is_abnormal,
        status: resultData.status,
        updated_by: user?.id,
      };

      // If result is being entered for the first time, track who entered it
      if (!selectedTest.result && (resultData.result || resultData.result_value)) {
        updateData.result_entered_by = user?.id;
        updateData.result_entered_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("patient_tests")
        .update(updateData)
        .eq("id", selectedTest.id);

      if (error) throw error;

      toast.success("Test result updated successfully");
      setIsResultDialogOpen(false);
      setSelectedTest(null);
      setResultData({ result: "", result_value: "", result_unit: "", normal_range_text: "", is_abnormal: false, status: "completed" });
      fetchData();
    } catch (error: any) {
      console.error("Error updating result:", error);
      toast.error(error.message || "Failed to update result");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openResultDialog = (test: PatientTest) => {
    setSelectedTest(test);
    // Try to find the test in catalog to get default unit and normal range
    const catalogTest = testCatalog.find(t => t.name === test.test_name);
    
    // Calculate if result is abnormal based on normal range
    let isAbnormal = test.is_abnormal || false;
    if (test.result_value !== null && test.result_value !== undefined && catalogTest) {
      const value = test.result_value;
      const min = catalogTest.normal_range_min;
      const max = catalogTest.normal_range_max;
      
      if (min !== null && max !== null) {
        isAbnormal = value < min || value > max;
      } else if (min !== null) {
        isAbnormal = value < min;
      } else if (max !== null) {
        isAbnormal = value > max;
      }
    }
    
    setResultData({
      result: test.result || "",
      result_value: test.result_value?.toString() || "",
      result_unit: test.result_unit || catalogTest?.unit || "",
      normal_range_text: test.normal_range_text || catalogTest?.normal_range_text || "",
      is_abnormal: isAbnormal,
      status: test.status,
    });
    setIsResultDialogOpen(true);
  };

  const openAuditDialog = async (test: PatientTest) => {
    setSelectedTest(test);
    setIsAuditDialogOpen(true);
    setLoadingAudit(true);

    try {
      const { data, error } = await supabase
        .from("patient_test_audit")
        .select("*")
        .eq("patient_test_id", test.id)
        .order("changed_at", { ascending: false });

      if (error) throw error;
      setAuditLogs(data || []);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      toast.error("Failed to fetch audit history");
    } finally {
      setLoadingAudit(false);
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case "created":
        return "Test Created";
      case "result_updated":
        return "Result Updated";
      case "status_changed":
        return "Status Changed";
      case "updated":
        return "Record Updated";
      default:
        return action;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case "pending":
        return <Clock className="h-4 w-4 text-amber-500" />;
      case "in_progress":
        return <AlertCircle className="h-4 w-4 text-blue-500" />;
      default:
        return null;
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

  const filteredTests = tests.filter((test) => {
    const matchesSearch =
      test.test_name.toLowerCase().includes(search.toLowerCase()) ||
      test.patients?.full_name.toLowerCase().includes(search.toLowerCase()) ||
      test.patients?.patient_id.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || test.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const pendingCount = tests.filter(t => t.status === "pending").length;
  const inProgressCount = tests.filter(t => t.status === "in_progress").length;
  const completedCount = tests.filter(t => t.status === "completed").length;

  // Selection helpers for printing
  const togglePrintSelection = (testId: string) => {
    setSelectedTestIds(prev => 
      prev.includes(testId) 
        ? prev.filter(id => id !== testId)
        : [...prev, testId]
    );
  };

  const toggleAllSelection = () => {
    const completedFilteredTests = filteredTests.filter(t => t.status === "completed");
    if (selectedTestIds.length === completedFilteredTests.length) {
      setSelectedTestIds([]);
    } else {
      setSelectedTestIds(completedFilteredTests.map(t => t.id));
    }
  };

  const handlePrintSelected = async () => {
    const selectedTestsData = tests.filter(t => selectedTestIds.includes(t.id) && t.status === "completed");
    
    if (selectedTestsData.length === 0) {
      toast.error("No completed tests selected for printing");
      return;
    }

    // Group tests by patient
    const testsByPatient = selectedTestsData.reduce((acc, test) => {
      const patientId = test.patient_id;
      if (!acc[patientId]) {
        acc[patientId] = {
          patient: test.patients,
          tests: []
        };
      }
      acc[patientId].tests.push({
        id: test.id,
        test_name: test.test_name,
        test_date: test.test_date,
        status: test.status,
        result: test.result,
        result_value: test.result_value,
        result_unit: test.result_unit,
        is_abnormal: test.is_abnormal || false,
        normal_range_text: test.normal_range_text || undefined,
      });
      return acc;
    }, {} as Record<string, { patient: PatientTest["patients"]; tests: Array<any> }>);

    // Generate PDF for each patient
    let printedCount = 0;
    for (const patientData of Object.values(testsByPatient)) {
      const success = generateMultiTestReportPDF(
        {
          full_name: patientData.patient.full_name,
          patient_id: patientData.patient.patient_id,
          phone: patientData.patient.phone,
        },
        patientData.tests,
        undefined,
        printOptions
      );
      if (success) printedCount++;
    }

    if (printedCount > 0) {
      toast.success(`Generated ${printedCount} report(s)`);
      setSelectedTestIds([]);
      setIsPrintDialogOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter("all")}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{tests.length}</p>
                <p className="text-xs text-muted-foreground">Total Tests</p>
              </div>
              <div className="p-2 rounded-lg bg-primary/10">
                <Calendar className="h-4 w-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${statusFilter === 'pending' ? 'ring-2 ring-amber-500' : ''}`} onClick={() => setStatusFilter("pending")}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
              <div className="p-2 rounded-lg bg-amber-100">
                <Clock className="h-4 w-4 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${statusFilter === 'in_progress' ? 'ring-2 ring-blue-500' : ''}`} onClick={() => setStatusFilter("in_progress")}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-blue-600">{inProgressCount}</p>
                <p className="text-xs text-muted-foreground">In Progress</p>
              </div>
              <div className="p-2 rounded-lg bg-blue-100">
                <AlertCircle className="h-4 w-4 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${statusFilter === 'completed' ? 'ring-2 ring-emerald-500' : ''}`} onClick={() => setStatusFilter("completed")}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-emerald-600">{completedCount}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
              <div className="p-2 rounded-lg bg-emerald-100">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex flex-col sm:flex-row gap-4 flex-1">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by test, patient..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 w-full sm:w-80"
            />
          </div>
          {statusFilter !== "all" && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setStatusFilter("all")}
              className="text-muted-foreground"
            >
              Clear filter ×
            </Button>
          )}
        </div>

        <div className="flex gap-2">
          {selectedTestIds.length > 0 && (
            <Button 
              variant="outline" 
              onClick={() => setIsPrintDialogOpen(true)}
              className="gap-2"
            >
              <Printer className="h-4 w-4" />
              Print ({selectedTestIds.length})
            </Button>
          )}

          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
          <DialogTrigger asChild>
            <Button className="bg-clinical-navy hover:bg-clinical-navy/90">
              <Plus className="h-4 w-4 mr-2" />
              Add Test
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Add Tests for Patient</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 flex-1 overflow-hidden flex flex-col">
              {/* Patient Search Section */}
              <div className="space-y-2">
                <Label>Patient *</Label>
                {selectedPatient ? (
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg border">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-primary/10">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{selectedPatient.full_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedPatient.patient_id} • {selectedPatient.phone}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedPatient(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name, ID, or phone..."
                        value={patientSearch}
                        onChange={(e) => setPatientSearch(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    {patientSearch && (
                      <ScrollArea className="h-40 border rounded-lg">
                        <div className="p-2 space-y-1">
                          {filteredPatients.length === 0 ? (
                            <p className="text-sm text-muted-foreground p-2 text-center">
                              No patients found
                            </p>
                          ) : (
                            filteredPatients.map((patient) => (
                              <button
                                key={patient.id}
                                type="button"
                                onClick={() => {
                                  setSelectedPatient(patient);
                                  setPatientSearch("");
                                }}
                                className="w-full flex items-center gap-3 p-2 hover:bg-muted rounded-md text-left transition-colors"
                              >
                                <div className="p-1.5 rounded-full bg-primary/10">
                                  <User className="h-3 w-3 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">{patient.full_name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {patient.patient_id} • {patient.phone}
                                  </p>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                    )}
                  </div>
                )}
              </div>

              {/* Tests Selection Section */}
              <div className="space-y-2 flex-1 overflow-hidden flex flex-col min-h-0">
                <div className="flex items-center justify-between">
                  <Label>Select Tests *</Label>
                  {selectedTests.length > 0 && (
                    <Badge variant="secondary">{selectedTests.length} selected</Badge>
                  )}
                </div>
                
                {/* Search and Category Filter */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search tests..."
                      value={testSearch}
                      onChange={(e) => setTestSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={selectedCategoryFilter} onValueChange={setSelectedCategoryFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.name}>
                          {category.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="Other Tests">Other Tests</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <ScrollArea className="h-[300px] border rounded-lg">
                  <div className="p-3 space-y-4">
                    {Object.entries(filteredTestsByCategory).length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No tests found
                      </p>
                    ) : (
                      Object.entries(filteredTestsByCategory).map(([category, categoryTests]) => (
                        <div key={category} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                              {category}
                            </h4>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-xs h-6"
                              onClick={() => selectAllInCategory(categoryTests)}
                            >
                              {categoryTests.every((t) => selectedTests.includes(t.name))
                                ? "Deselect All"
                                : "Select All"}
                            </Button>
                          </div>
                          <div className="space-y-1">
                            {categoryTests.map((test) => (
                              <label
                                key={test.id}
                                className="flex items-center gap-3 p-2 hover:bg-muted rounded-md cursor-pointer transition-colors"
                              >
                                <Checkbox
                                  checked={selectedTests.includes(test.name)}
                                  onCheckedChange={() => toggleTestSelection(test.name)}
                                />
                                <div className="flex-1">
                                  <span className="font-medium">{test.name}</span>
                                  {test.price && (
                                    <span className="text-muted-foreground ml-2">
                                      ₹{test.price}
                                    </span>
                                  )}
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Selected Tests Summary */}
              {selectedTests.length > 0 && (
                <div className="flex flex-wrap gap-1.5 max-h-20 overflow-auto p-2 bg-muted/50 rounded-lg">
                  {selectedTests.map((testName) => (
                    <Badge
                      key={testName}
                      variant="secondary"
                      className="cursor-pointer hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => toggleTestSelection(testName)}
                    >
                      {testName}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              )}

              {/* Referred By Section */}
              <div className="space-y-2">
                <Label>Referred By</Label>
                <Select 
                  value={formData.referred_by} 
                  onValueChange={(value) => setFormData({ ...formData, referred_by: value, custom_doctor_name: "" })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select referral source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">Self</SelectItem>
                    {doctors.map((doctor) => (
                      <SelectItem key={doctor.id} value={doctor.id}>
                        Dr. {doctor.name} {doctor.specialization ? `(${doctor.specialization})` : ""}
                        {doctor.commission_percentage ? ` - ${doctor.commission_percentage}%` : ""}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Other (Enter name)</SelectItem>
                  </SelectContent>
                </Select>
                {formData.referred_by === "custom" && (
                  <Input
                    placeholder="Enter doctor's name..."
                    value={formData.custom_doctor_name}
                    onChange={(e) => setFormData({ ...formData, custom_doctor_name: e.target.value })}
                    className="mt-2"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="test_date">Test Date *</Label>
                  <Input
                    id="test_date"
                    type="date"
                    value={formData.test_date}
                    onChange={(e) => setFormData({ ...formData, test_date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Input
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Any notes..."
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-clinical-navy hover:bg-clinical-navy/90"
                disabled={isSubmitting || !selectedPatient || selectedTests.length === 0}
              >
                {isSubmitting
                  ? "Adding..."
                  : `Add ${selectedTests.length} Test${selectedTests.length !== 1 ? "s" : ""}`}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Result Dialog */}
      <Dialog open={isResultDialogOpen} onOpenChange={setIsResultDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Update Test Result</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleResultSubmit} className="space-y-4">
            <Card className="border-0 bg-muted/50">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{selectedTest?.test_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedTest?.patients?.full_name} • {selectedTest?.patients?.patient_id}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {selectedTest && format(new Date(selectedTest.test_date), "dd MMM yyyy")}
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={resultData.status}
                onValueChange={(value) => setResultData({ ...resultData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-amber-500" />
                      Pending
                    </div>
                  </SelectItem>
                  <SelectItem value="in_progress">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-blue-500" />
                      In Progress
                    </div>
                  </SelectItem>
                  <SelectItem value="completed">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      Completed
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Numeric Result Value and Unit */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="result_value">Result Value</Label>
                <div className="relative">
                  <Input
                    id="result_value"
                    type="number"
                    step="any"
                    value={resultData.result_value}
                    onChange={(e) => {
                      const value = e.target.value;
                      const catalogTest = testCatalog.find(t => t.name === selectedTest?.test_name);
                      
                      // Auto-detect abnormal based on normal range
                      let isAbnormal = resultData.is_abnormal;
                      if (value && catalogTest) {
                        const numValue = parseFloat(value);
                        if (!isNaN(numValue)) {
                          const min = catalogTest.normal_range_min;
                          const max = catalogTest.normal_range_max;
                          
                          if (min !== null && max !== null) {
                            isAbnormal = numValue < min || numValue > max;
                          } else if (min !== null) {
                            isAbnormal = numValue < min;
                          } else if (max !== null) {
                            isAbnormal = numValue > max;
                          }
                        }
                      }
                      
                      setResultData({ ...resultData, result_value: value, is_abnormal: isAbnormal });
                    }}
                    placeholder="e.g. 12.5"
                    className={(() => {
                      const catalogTest = testCatalog.find(t => t.name === selectedTest?.test_name);
                      if (resultData.result_value && catalogTest) {
                        const numValue = parseFloat(resultData.result_value);
                        if (!isNaN(numValue)) {
                          const min = catalogTest.normal_range_min;
                          const max = catalogTest.normal_range_max;
                          let isOutOfRange = false;
                          if (min !== null && max !== null) {
                            isOutOfRange = numValue < min || numValue > max;
                          } else if (min !== null) {
                            isOutOfRange = numValue < min;
                          } else if (max !== null) {
                            isOutOfRange = numValue > max;
                          }
                          if (isOutOfRange) {
                            return "border-red-500 focus-visible:ring-red-500";
                          }
                        }
                      }
                      return "";
                    })()}
                  />
                  {(() => {
                    const catalogTest = testCatalog.find(t => t.name === selectedTest?.test_name);
                    if (resultData.result_value && catalogTest) {
                      const numValue = parseFloat(resultData.result_value);
                      if (!isNaN(numValue)) {
                        const min = catalogTest.normal_range_min;
                        const max = catalogTest.normal_range_max;
                        let isOutOfRange = false;
                        if (min !== null && max !== null) {
                          isOutOfRange = numValue < min || numValue > max;
                        } else if (min !== null) {
                          isOutOfRange = numValue < min;
                        } else if (max !== null) {
                          isOutOfRange = numValue > max;
                        }
                        if (isOutOfRange) {
                          return (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                              <AlertCircle className="h-4 w-4 text-red-500" />
                            </div>
                          );
                        }
                      }
                    }
                    return null;
                  })()}
                </div>
                {(() => {
                  const catalogTest = testCatalog.find(t => t.name === selectedTest?.test_name);
                  if (resultData.result_value && catalogTest) {
                    const numValue = parseFloat(resultData.result_value);
                    if (!isNaN(numValue)) {
                      const min = catalogTest.normal_range_min;
                      const max = catalogTest.normal_range_max;
                      let isOutOfRange = false;
                      let message = "";
                      if (min !== null && max !== null) {
                        isOutOfRange = numValue < min || numValue > max;
                        if (numValue < min) {
                          message = `Value is below normal range (min: ${min})`;
                        } else if (numValue > max) {
                          message = `Value is above normal range (max: ${max})`;
                        }
                      } else if (min !== null) {
                        isOutOfRange = numValue < min;
                        if (isOutOfRange) {
                          message = `Value is below normal range (min: ${min})`;
                        }
                      } else if (max !== null) {
                        isOutOfRange = numValue > max;
                        if (isOutOfRange) {
                          message = `Value is above normal range (max: ${max})`;
                        }
                      }
                      if (isOutOfRange) {
                        return (
                          <p className="text-xs text-red-600 font-medium mt-1">
                            {message}
                          </p>
                        );
                      } else if (min !== null || max !== null) {
                        return (
                          <p className="text-xs text-green-600 font-medium mt-1">
                            Value is within normal range
                          </p>
                        );
                      }
                    }
                  }
                  return null;
                })()}
              </div>
              <div className="space-y-2">
                <Label htmlFor="result_unit">Unit</Label>
                <Input
                  id="result_unit"
                  value={resultData.result_unit}
                  onChange={(e) => setResultData({ ...resultData, result_unit: e.target.value })}
                  placeholder="e.g. mg/dL, U/L"
                />
              </div>
            </div>
            
            {/* Show Normal Range from Catalog if available */}
            {(() => {
              const catalogTest = testCatalog.find(t => t.name === selectedTest?.test_name);
              if (catalogTest && (catalogTest.normal_range_min !== null || catalogTest.normal_range_max !== null)) {
                const min = catalogTest.normal_range_min;
                const max = catalogTest.normal_range_max;
                const rangeText = min !== null && max !== null 
                  ? `${min} - ${max} ${catalogTest.unit || ''}`.trim()
                  : min !== null 
                    ? `≥ ${min} ${catalogTest.unit || ''}`.trim()
                    : `≤ ${max} ${catalogTest.unit || ''}`.trim();
                
                return (
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <p className="text-sm font-medium text-blue-900">Normal Range (from catalog):</p>
                    <p className="text-sm text-blue-700">{rangeText}</p>
                  </div>
                );
              }
              return null;
            })()}

            {/* Normal Range */}
            <div className="space-y-2">
              <Label htmlFor="normal_range_text">Normal Range</Label>
              <Input
                id="normal_range_text"
                value={resultData.normal_range_text}
                onChange={(e) => setResultData({ ...resultData, normal_range_text: e.target.value })}
                placeholder="e.g. 70-100 mg/dL, < 40 U/L, Negative"
              />
              <p className="text-xs text-muted-foreground">
                Enter the reference range for this test result
              </p>
            </div>

            {/* Text Result (for qualitative results) */}
            <div className="space-y-2">
              <Label htmlFor="result">Result Notes / Qualitative Result</Label>
              <Textarea
                id="result"
                value={resultData.result}
                onChange={(e) => setResultData({ ...resultData, result: e.target.value })}
                placeholder="Enter detailed results, observations, or qualitative findings..."
                rows={3}
              />
            </div>

            {/* Abnormal Flag */}
            <div className={`flex items-center gap-3 p-3 rounded-lg border ${
              resultData.is_abnormal 
                ? "bg-red-50 border-red-200" 
                : "bg-muted/30"
            }`}>
              <Checkbox
                id="is_abnormal"
                checked={resultData.is_abnormal}
                onCheckedChange={(checked) => setResultData({ ...resultData, is_abnormal: checked === true })}
              />
              <div className="flex-1">
                <Label htmlFor="is_abnormal" className="cursor-pointer font-medium text-foreground">
                  Mark as Abnormal
                </Label>
                <p className="text-xs text-muted-foreground">
                  {(() => {
                    const catalogTest = testCatalog.find(t => t.name === selectedTest?.test_name);
                    if (catalogTest && resultData.result_value && (catalogTest.normal_range_min !== null || catalogTest.normal_range_max !== null)) {
                      return "Automatically detected based on normal range. You can override if needed.";
                    }
                    return "Flag this result if it falls outside the normal range or is qualitatively abnormal";
                  })()}
                </p>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-clinical-navy hover:bg-clinical-navy/90"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Updating..." : "Update Result"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Audit History Dialog */}
      <Dialog open={isAuditDialogOpen} onOpenChange={setIsAuditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Audit History
            </DialogTitle>
          </DialogHeader>
          
          <Card className="border-0 bg-muted/50 mb-4">
            <CardContent className="pt-4">
              <p className="font-semibold">{selectedTest?.test_name}</p>
              <p className="text-sm text-muted-foreground">
                {selectedTest?.patients?.full_name} • {selectedTest?.patients?.patient_id}
              </p>
            </CardContent>
          </Card>

          {loadingAudit ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : auditLogs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No audit history available</p>
          ) : (
            <div className="space-y-3">
              {auditLogs.map((log) => (
                <div key={log.id} className="border rounded-lg p-3 bg-background">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary">{getActionLabel(log.action)}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(log.changed_at), "dd MMM yyyy, HH:mm")}
                    </span>
                  </div>
                  
                  {log.old_values && log.new_values && (
                    <div className="text-xs space-y-1">
                      {log.old_values.status !== log.new_values.status && (
                        <p>
                          Status: <span className="text-muted-foreground">{log.old_values.status}</span>
                          {" → "}
                          <span className="font-medium">{log.new_values.status}</span>
                        </p>
                      )}
                      {log.old_values.result !== log.new_values.result && (
                        <p>
                          Result updated
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Print Options Dialog */}
      <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5" />
              Print Report Options
            </DialogTitle>
            <DialogDescription>
              Configure print options for {selectedTestIds.length} selected test(s)
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="include-header" className="text-base font-medium">Include Header</Label>
                <p className="text-sm text-muted-foreground">
                  Lab name, address, phone and email at the top
                </p>
              </div>
              <Switch
                id="include-header"
                checked={printOptions.includeHeader}
                onCheckedChange={(checked) => setPrintOptions(prev => ({ ...prev, includeHeader: checked }))}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="include-footer" className="text-base font-medium">Include Footer</Label>
                <p className="text-sm text-muted-foreground">
                  Generated date and lab branding at the bottom
                </p>
              </div>
              <Switch
                id="include-footer"
                checked={printOptions.includeFooter}
                onCheckedChange={(checked) => setPrintOptions(prev => ({ ...prev, includeFooter: checked }))}
              />
            </div>
            
            <Card className="border-dashed bg-muted/30">
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">
                  <strong>Tip:</strong> Disable both options if you are using pre-printed letterhead paper.
                </p>
              </CardContent>
            </Card>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPrintDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handlePrintSelected} className="bg-clinical-navy hover:bg-clinical-navy/90 gap-2">
              <Printer className="h-4 w-4" />
              Print Reports
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tests Table */}
      <Card className="border-0 shadow-md">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedTestIds.length > 0 && selectedTestIds.length === filteredTests.filter(t => t.status === "completed").length}
                  onCheckedChange={toggleAllSelection}
                  aria-label="Select all completed tests"
                />
              </TableHead>
              <TableHead className="font-semibold">Patient</TableHead>
              <TableHead className="font-semibold">Test</TableHead>
              <TableHead className="font-semibold">Date</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold">Result</TableHead>
              <TableHead className="text-right font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                    Loading tests...
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredTests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  {statusFilter !== "all" ? `No ${statusFilter.replace("_", " ")} tests found` : "No tests found"}
                </TableCell>
              </TableRow>
            ) : (
              filteredTests.map((test) => (
                <TableRow key={test.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell>
                    <Checkbox
                      checked={selectedTestIds.includes(test.id)}
                      onCheckedChange={() => togglePrintSelection(test.id)}
                      disabled={test.status !== "completed"}
                      aria-label={`Select ${test.test_name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{test.patients?.full_name}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {test.patients?.patient_id}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{test.test_name}</p>
                    {test.notes && (
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {test.notes}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      {format(new Date(test.test_date), "dd MMM yyyy")}
                    </div>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(test.status)}
                  </TableCell>
                  <TableCell>
                    {test.result_value !== null && test.result_value !== undefined ? (
                      <span className="text-sm font-medium">
                        {test.result_value}
                        {test.result_unit && ` ${test.result_unit}`}
                      </span>
                    ) : test.result ? (
                      <span className="text-sm truncate max-w-[150px] block">
                        {test.result.substring(0, 50)}{test.result.length > 50 ? "..." : ""}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openAuditDialog(test)}
                        className="gap-1 text-muted-foreground hover:text-foreground"
                        title="View audit history"
                      >
                        <History className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openResultDialog(test)}
                        className="gap-1.5"
                      >
                        {test.status === "completed" ? (
                          <>
                            <CheckCircle className="h-3.5 w-3.5" />
                            View
                          </>
                        ) : (
                          <>
                            <Clock className="h-3.5 w-3.5" />
                            Update
                          </>
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

export default ManageTests;
