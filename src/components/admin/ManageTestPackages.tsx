import { useState, useEffect } from "react";
import {
  Package,
  Plus,
  Edit,
  Trash2,
  Search,
  Save,
  X,
  IndianRupee,
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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Test {
  id: string;
  name: string;
  price: number;
  test_id?: string;
}

interface TestPackage {
  id: string;
  name: string;
  description: string | null;
  price: number;
  discount_percentage: number;
  is_active: boolean;
  tests: string[]; // Array of test IDs
}

const ManageTestPackages = () => {
  const [packages, setPackages] = useState<TestPackage[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [packageToDelete, setPackageToDelete] = useState<string | null>(null);
  const [editingPackage, setEditingPackage] = useState<TestPackage | null>(null);

  const [packageForm, setPackageForm] = useState({
    name: "",
    description: "",
    price: 0,
    discount_percentage: 0,
    is_active: true,
    selectedTests: [] as string[],
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch test packages
      const { data: packagesData, error: packagesError } = await supabase
        .from("test_packages")
        .select("*")
        .order("created_at", { ascending: false });

      if (packagesError) throw packagesError;

      // Fetch package tests
      const packageTestsMap = new Map<string, string[]>();
      if (packagesData && packagesData.length > 0) {
        const { data: packageTestsData, error: packageTestsError } = await supabase
          .from("test_package_tests")
          .select("package_id, test_id");

        if (packageTestsError) throw packageTestsError;

        packageTestsData?.forEach((pt) => {
          const existing = packageTestsMap.get(pt.package_id) || [];
          packageTestsMap.set(pt.package_id, [...existing, pt.test_id]);
        });
      }

      const packagesWithTests: TestPackage[] = (packagesData || []).map((pkg) => ({
        ...pkg,
        tests: packageTestsMap.get(pkg.id) || [],
      }));

      setPackages(packagesWithTests);

      // Fetch all tests
      const { data: testsData, error: testsError } = await supabase
        .from("tests")
        .select("id, name, price, test_id");

      if (testsError) throw testsError;
      setTests(testsData || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load test packages");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setPackageForm({
      name: "",
      description: "",
      price: 0,
      discount_percentage: 0,
      is_active: true,
      selectedTests: [],
    });
    setEditingPackage(null);
  };

  const openEditDialog = (pkg: TestPackage) => {
    setEditingPackage(pkg);
    setPackageForm({
      name: pkg.name,
      description: pkg.description || "",
      price: pkg.price,
      discount_percentage: pkg.discount_percentage,
      is_active: pkg.is_active,
      selectedTests: pkg.tests,
    });
    setIsDialogOpen(true);
  };

  const calculatePackagePrice = () => {
    const selectedTestsData = tests.filter((t) => packageForm.selectedTests.includes(t.id));
    const totalPrice = selectedTestsData.reduce((sum, test) => sum + (Number(test.price) || 0), 0);
    const discountAmount = (totalPrice * packageForm.discount_percentage) / 100;
    return totalPrice - discountAmount;
  };

  const handleSavePackage = async () => {
    if (!packageForm.name.trim()) {
      toast.error("Package name is required");
      return;
    }

    if (packageForm.selectedTests.length === 0) {
      toast.error("Please select at least one test");
      return;
    }

    try {
      const packageData = {
        name: packageForm.name.trim(),
        description: packageForm.description.trim() || null,
        price: calculatePackagePrice(),
        discount_percentage: packageForm.discount_percentage,
        is_active: packageForm.is_active,
      };

      if (editingPackage) {
        // Update existing package
        const { error: updateError } = await supabase
          .from("test_packages")
          .update(packageData)
          .eq("id", editingPackage.id);

        if (updateError) throw updateError;

        // Delete existing package tests
        const { error: deleteError } = await supabase
          .from("test_package_tests")
          .delete()
          .eq("package_id", editingPackage.id);

        if (deleteError) throw deleteError;

        // Insert new package tests
        const packageTests = packageForm.selectedTests.map((testId) => ({
          package_id: editingPackage.id,
          test_id: testId,
        }));

        if (packageTests.length > 0) {
          const { error: insertError } = await supabase
            .from("test_package_tests")
            .insert(packageTests);

          if (insertError) throw insertError;
        }

        toast.success("Test package updated successfully");
      } else {
        // Create new package
        const { data: newPackage, error: insertError } = await supabase
          .from("test_packages")
          .insert(packageData)
          .select()
          .single();

        if (insertError) throw insertError;

        // Insert package tests
        const packageTests = packageForm.selectedTests.map((testId) => ({
          package_id: newPackage.id,
          test_id: testId,
        }));

        if (packageTests.length > 0) {
          const { error: packageTestsError } = await supabase
            .from("test_package_tests")
            .insert(packageTests);

          if (packageTestsError) throw packageTestsError;
        }

        toast.success("Test package created successfully");
      }

      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      console.error("Error saving package:", error);
      toast.error("Failed to save test package");
    }
  };

  const handleDeletePackage = async () => {
    if (!packageToDelete) return;

    try {
      // Delete package tests first
      const { error: deleteTestsError } = await supabase
        .from("test_package_tests")
        .delete()
        .eq("package_id", packageToDelete);

      if (deleteTestsError) throw deleteTestsError;

      // Delete package
      const { error: deleteError } = await supabase
        .from("test_packages")
        .delete()
        .eq("id", packageToDelete);

      if (deleteError) throw deleteError;

      toast.success("Test package deleted successfully");
      setIsDeleteDialogOpen(false);
      setPackageToDelete(null);
      fetchData();
    } catch (error) {
      console.error("Error deleting package:", error);
      toast.error("Failed to delete test package");
    }
  };

  const toggleTestSelection = (testId: string) => {
    setPackageForm((prev) => ({
      ...prev,
      selectedTests: prev.selectedTests.includes(testId)
        ? prev.selectedTests.filter((id) => id !== testId)
        : [...prev.selectedTests, testId],
    }));
  };

  const filteredPackages = packages.filter((pkg) =>
    pkg.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredTests = tests.filter((test) =>
    test.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-clinical-navy">Test Packages</h2>
          <p className="text-muted-foreground">Create bundled test packages with special pricing</p>
        </div>
        <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Package
        </Button>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search packages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Packages Table */}
      <Card>
        <CardHeader>
          <CardTitle>Test Packages</CardTitle>
          <CardDescription>Manage bundled test packages</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filteredPackages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No test packages found. Create your first package!
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Package Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Tests</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPackages.map((pkg) => {
                  const packageTests = tests.filter((t) => pkg.tests.includes(t.id));
                  const individualPrice = packageTests.reduce((sum, t) => sum + (Number(t.price) || 0), 0);
                  const savings = individualPrice - pkg.price;

                  return (
                    <TableRow key={pkg.id}>
                      <TableCell className="font-medium">{pkg.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {pkg.description || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{pkg.tests.length} tests</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-semibold">₹{pkg.price.toLocaleString()}</span>
                          {savings > 0 && (
                            <span className="text-xs text-muted-foreground line-through">
                              ₹{individualPrice.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {pkg.discount_percentage > 0 ? (
                          <Badge variant="secondary">{pkg.discount_percentage}%</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={pkg.is_active ? "default" : "secondary"}>
                          {pkg.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(pkg)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setPackageToDelete(pkg.id);
                              setIsDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Package Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {editingPackage ? "Edit Test Package" : "Create Test Package"}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-200px)] pr-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Package Name *</Label>
                <Input
                  id="name"
                  value={packageForm.name}
                  onChange={(e) => setPackageForm({ ...packageForm, name: e.target.value })}
                  placeholder="e.g., Complete Health Package"
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={packageForm.description}
                  onChange={(e) => setPackageForm({ ...packageForm, description: e.target.value })}
                  placeholder="Package description..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="discount">Discount Percentage (%)</Label>
                  <Input
                    id="discount"
                    type="number"
                    min="0"
                    max="100"
                    value={packageForm.discount_percentage}
                    onChange={(e) => setPackageForm({ ...packageForm, discount_percentage: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Package Price</Label>
                  <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                    <IndianRupee className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{calculatePackagePrice().toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div>
                <Label>Select Tests *</Label>
                <div className="border rounded-md p-4 max-h-64 overflow-y-auto">
                  {filteredTests.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground">No tests available</div>
                  ) : (
                    <div className="space-y-2">
                      {filteredTests.map((test) => (
                        <div
                          key={test.id}
                          className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50"
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={packageForm.selectedTests.includes(test.id)}
                              onCheckedChange={() => toggleTestSelection(test.id)}
                            />
                            <div>
                              <p className="font-medium">{test.name}</p>
                              {test.test_id && (
                                <p className="text-xs text-muted-foreground">ID: {test.test_id}</p>
                              )}
                            </div>
                          </div>
                          <span className="text-sm font-medium">₹{Number(test.price).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {packageForm.selectedTests.length} test(s) selected
                </p>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePackage}>
              <Save className="h-4 w-4 mr-2" />
              {editingPackage ? "Update" : "Create"} Package
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Test Package</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this test package? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePackage} className="bg-red-500 hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ManageTestPackages;

