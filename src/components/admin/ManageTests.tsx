import { useState, useEffect } from "react";
import { Plus, Search, CheckCircle, Clock, AlertCircle, Filter, Calendar, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface PatientTest {
  id: string;
  patient_id: string;
  test_name: string;
  test_date: string;
  status: string;
  result: string | null;
  notes: string | null;
  created_at: string;
  patients: {
    patient_id: string;
    full_name: string;
    phone: string;
  };
}

interface Patient {
  id: string;
  patient_id: string;
  full_name: string;
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
}

const ManageTests = () => {
  const [tests, setTests] = useState<PatientTest[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [categories, setCategories] = useState<TestCategory[]>([]);
  const [testCatalog, setTestCatalog] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "in_progress" | "completed">("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isResultDialogOpen, setIsResultDialogOpen] = useState(false);
  const [selectedTest, setSelectedTest] = useState<PatientTest | null>(null);
  const [formData, setFormData] = useState({
    patient_id: "",
    test_name: "",
    test_date: new Date().toISOString().split("T")[0],
    notes: "",
  });
  const [resultData, setResultData] = useState({
    result: "",
    status: "completed",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      const [testsRes, patientsRes, categoriesRes, catalogRes] = await Promise.all([
        supabase
          .from("patient_tests")
          .select(`
            *,
            patients (
              patient_id,
              full_name,
              phone
            )
          `)
          .order("created_at", { ascending: false }),
        supabase.from("patients").select("id, patient_id, full_name").eq("is_active", true),
        supabase.from("test_categories").select("id, name"),
        supabase.from("tests").select("id, name, price, category_id"),
      ]);

      if (testsRes.error) throw testsRes.error;
      if (patientsRes.error) throw patientsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;
      if (catalogRes.error) throw catalogRes.error;

      setTests(testsRes.data || []);
      setPatients(patientsRes.data || []);
      setCategories(categoriesRes.data || []);
      setTestCatalog(catalogRes.data || []);
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
    setIsSubmitting(true);

    try {
      const { error } = await supabase.from("patient_tests").insert({
        patient_id: formData.patient_id,
        test_name: formData.test_name,
        test_date: formData.test_date,
        notes: formData.notes || null,
        status: "pending",
      });

      if (error) throw error;

      toast.success("Test added successfully");
      setIsDialogOpen(false);
      setFormData({
        patient_id: "",
        test_name: "",
        test_date: new Date().toISOString().split("T")[0],
        notes: "",
      });
      fetchData();
    } catch (error: any) {
      console.error("Error adding test:", error);
      toast.error(error.message || "Failed to add test");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResultSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTest) return;
    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from("patient_tests")
        .update({
          result: resultData.result,
          status: resultData.status,
        })
        .eq("id", selectedTest.id);

      if (error) throw error;

      toast.success("Test result updated successfully");
      setIsResultDialogOpen(false);
      setSelectedTest(null);
      setResultData({ result: "", status: "completed" });
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
    setResultData({
      result: test.result || "",
      status: test.status,
    });
    setIsResultDialogOpen(true);
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

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-clinical-navy hover:bg-clinical-navy/90">
              <Plus className="h-4 w-4 mr-2" />
              Add Test
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add New Test</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="patient_id">Patient *</Label>
                <Select
                  value={formData.patient_id}
                  onValueChange={(value) => setFormData({ ...formData, patient_id: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select patient" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map((patient) => (
                      <SelectItem key={patient.id} value={patient.id}>
                        <div className="flex items-center gap-2">
                          <span>{patient.full_name}</span>
                          <span className="text-muted-foreground font-mono text-xs">({patient.patient_id})</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="test_name">Test *</Label>
                <Select
                  value={formData.test_name}
                  onValueChange={(value) => setFormData({ ...formData, test_name: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select test" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.name}>
                        {cat.name}
                      </SelectItem>
                    ))}
                    {testCatalog.map((test) => (
                      <SelectItem key={test.id} value={test.name}>
                        {test.name} {test.price && `(₹${test.price})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Any additional notes..."
                  rows={3}
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-clinical-navy hover:bg-clinical-navy/90"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Adding..." : "Add Test"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
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

            <div className="space-y-2">
              <Label htmlFor="result">Result</Label>
              <Textarea
                id="result"
                value={resultData.result}
                onChange={(e) => setResultData({ ...resultData, result: e.target.value })}
                placeholder="Enter test results..."
                rows={6}
              />
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

      {/* Tests Table */}
      <Card className="border-0 shadow-md">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
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
                <TableCell colSpan={6} className="text-center py-12">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                    Loading tests...
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredTests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  {statusFilter !== "all" ? `No ${statusFilter.replace("_", " ")} tests found` : "No tests found"}
                </TableCell>
              </TableRow>
            ) : (
              filteredTests.map((test) => (
                <TableRow key={test.id} className="hover:bg-muted/30 transition-colors">
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
                    {test.result ? (
                      <span className="text-sm truncate max-w-[150px] block">
                        {test.result.substring(0, 50)}{test.result.length > 50 ? "..." : ""}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
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
