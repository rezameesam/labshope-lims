import { useState, useEffect } from "react";
import { 
  Plus, Search, Edit2, Trash2, X, Save, FlaskConical,
  DollarSign, Tag, FileText, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface Test {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  category_id: string | null;
  category?: {
    name: string;
  } | null;
  unit: string | null;
  normal_range_min: number | null;
  normal_range_max: number | null;
  normal_range_text: string | null;
  sample_type: string | null;
  created_at: string;
}

interface TestCategory {
  id: string;
  name: string;
  description: string | null;
}

const ManageTestCatalog = () => {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const [tests, setTests] = useState<Test[]>([]);
  const [categories, setCategories] = useState<TestCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedTest, setSelectedTest] = useState<Test | null>(null);
  const [testToDelete, setTestToDelete] = useState<Test | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Test form state
  const [testForm, setTestForm] = useState({
    name: "",
    description: "",
    price: "",
    category_id: "",
    unit: "",
    normal_range_min: "",
    normal_range_max: "",
    normal_range_text: "",
    sample_type: "Blood",
  });

  // Category form state
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    description: "",
  });

  useEffect(() => {
    fetchTests();
    fetchCategories();
  }, []);

  const fetchTests = async () => {
    try {
      const { data, error } = await supabase
        .from("tests")
        .select(`
          *,
          category:test_categories(name)
        `)
        .order("name");

      if (error) throw error;
      setTests((data || []) as Test[]);
    } catch (error) {
      console.error("Error fetching tests:", error);
      toast.error("Failed to load tests");
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("test_categories")
        .select("*")
        .order("name");

      if (error) throw error;
      setCategories((data || []) as TestCategory[]);
    } catch (error) {
      console.error("Error fetching categories:", error);
      toast.error("Failed to load categories");
    }
  };

  const resetTestForm = () => {
    setTestForm({
      name: "",
      description: "",
      price: "",
      category_id: "",
      unit: "",
      normal_range_min: "",
      normal_range_max: "",
      normal_range_text: "",
      sample_type: "Blood",
    });
    setSelectedTest(null);
  };

  const resetCategoryForm = () => {
    setCategoryForm({
      name: "",
      description: "",
    });
  };

  const openTestDialog = (test?: Test) => {
    if (test) {
      setSelectedTest(test);
      setTestForm({
        name: test.name,
        description: test.description || "",
        price: test.price?.toString() || "",
        category_id: test.category_id || "",
        unit: test.unit || "",
        normal_range_min: test.normal_range_min?.toString() || "",
        normal_range_max: test.normal_range_max?.toString() || "",
        normal_range_text: test.normal_range_text || "",
        sample_type: test.sample_type || "Blood",
      });
    } else {
      resetTestForm();
    }
    setIsTestDialogOpen(true);
  };

  const openCategoryDialog = () => {
    resetCategoryForm();
    setIsCategoryDialogOpen(true);
  };

  const handleSaveTest = async () => {
    if (!testForm.name.trim()) {
      toast.error("Test name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const testData = {
        name: testForm.name.trim(),
        description: testForm.description.trim() || null,
        price: testForm.price ? parseFloat(testForm.price) : null,
        category_id: testForm.category_id || null,
        unit: testForm.unit.trim() || null,
        normal_range_min: testForm.normal_range_min ? parseFloat(testForm.normal_range_min) : null,
        normal_range_max: testForm.normal_range_max ? parseFloat(testForm.normal_range_max) : null,
        normal_range_text: testForm.normal_range_text.trim() || null,
        sample_type: testForm.sample_type || "Blood",
      };

      if (selectedTest) {
        // Update existing test
        const { error } = await supabase
          .from("tests")
          .update(testData)
          .eq("id", selectedTest.id);

        if (error) throw error;
        toast.success("Test updated successfully");
      } else {
        // Create new test
        const { error } = await supabase
          .from("tests")
          .insert(testData);

        if (error) throw error;
        toast.success("Test created successfully");
      }

      setIsTestDialogOpen(false);
      resetTestForm();
      fetchTests();
    } catch (error: any) {
      console.error("Error saving test:", error);
      toast.error(error.message || "Failed to save test");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) {
      toast.error("Category name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("test_categories")
        .insert({
          name: categoryForm.name.trim(),
          description: categoryForm.description.trim() || null,
        });

      if (error) throw error;
      toast.success("Category created successfully");
      setIsCategoryDialogOpen(false);
      resetCategoryForm();
      fetchCategories();
    } catch (error: any) {
      console.error("Error saving category:", error);
      toast.error(error.message || "Failed to save category");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTest = async () => {
    if (!testToDelete) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("tests")
        .delete()
        .eq("id", testToDelete.id);

      if (error) throw error;
      toast.success("Test deleted successfully");
      setIsDeleteDialogOpen(false);
      setTestToDelete(null);
      fetchTests();
    } catch (error: any) {
      console.error("Error deleting test:", error);
      toast.error(error.message || "Failed to delete test");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredTests = tests.filter((test) => {
    const matchesSearch = 
      test.name.toLowerCase().includes(search.toLowerCase()) ||
      test.description?.toLowerCase().includes(search.toLowerCase()) ||
      test.category?.name.toLowerCase().includes(search.toLowerCase());
    
    const matchesCategory = filterCategory === "all" || test.category_id === filterCategory;
    
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-clinical-navy">Test Catalog</h2>
          <p className="text-muted-foreground">Manage test names, rates, and categories</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={openCategoryDialog}
            className="gap-2"
          >
            <Tag className="h-4 w-4" />
            Add Category
          </Button>
          <Button 
            onClick={() => openTestDialog()}
            className="bg-clinical-navy hover:bg-clinical-navy/90 gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Test
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <FlaskConical className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{tests.length}</p>
                <p className="text-xs text-muted-foreground">Total Tests</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <Tag className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{categories.length}</p>
                <p className="text-xs text-muted-foreground">Categories</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <DollarSign className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  ₹{tests.reduce((sum, t) => sum + (t.price || 0), 0).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">Total Value</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tests..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tests Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Test Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Sample Type</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    Loading tests...
                  </TableCell>
                </TableRow>
              ) : filteredTests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No tests found
                  </TableCell>
                </TableRow>
              ) : (
                filteredTests.map((test) => (
                  <TableRow key={test.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div>
                        <p className="font-medium">{test.name}</p>
                        {test.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {test.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {test.category ? (
                        <Badge variant="outline">{test.category.name}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {test.price ? (
                        <span className="font-medium">₹{test.price.toLocaleString()}</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {test.unit || <span className="text-muted-foreground text-sm">—</span>}
                    </TableCell>
                    <TableCell>
                      {test.sample_type || <span className="text-muted-foreground text-sm">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openTestDialog(test)}
                          title="Edit Test"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setTestToDelete(test);
                            setIsDeleteDialogOpen(true);
                          }}
                          title="Delete Test"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Test Dialog */}
      <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5" />
              {selectedTest ? "Edit Test" : "Add New Test"}
            </DialogTitle>
            <DialogDescription>
              {selectedTest 
                ? "Update test information and pricing"
                : "Add a new test to the catalog"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Test Name *</Label>
              <Input
                id="name"
                value={testForm.name}
                onChange={(e) => setTestForm({ ...testForm, name: e.target.value })}
                placeholder="e.g., Complete Blood Count (CBC)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={testForm.description}
                onChange={(e) => setTestForm({ ...testForm, description: e.target.value })}
                placeholder="Test description..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={testForm.category_id}
                  onValueChange={(value) => setTestForm({ ...testForm, category_id: value })}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No Category</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">Price (₹)</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={testForm.price}
                  onChange={(e) => setTestForm({ ...testForm, price: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sample_type">Sample Type</Label>
                <Select
                  value={testForm.sample_type}
                  onValueChange={(value) => setTestForm({ ...testForm, sample_type: value })}
                >
                  <SelectTrigger id="sample_type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Blood">Blood</SelectItem>
                    <SelectItem value="Urine">Urine</SelectItem>
                    <SelectItem value="Stool">Stool</SelectItem>
                    <SelectItem value="Sputum">Sputum</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Input
                  id="unit"
                  value={testForm.unit}
                  onChange={(e) => setTestForm({ ...testForm, unit: e.target.value })}
                  placeholder="e.g., mg/dL, g/dL"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="normal_range_min">Normal Range (Min)</Label>
                <Input
                  id="normal_range_min"
                  type="number"
                  step="0.01"
                  value={testForm.normal_range_min}
                  onChange={(e) => setTestForm({ ...testForm, normal_range_min: e.target.value })}
                  placeholder="Min value"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="normal_range_max">Normal Range (Max)</Label>
                <Input
                  id="normal_range_max"
                  type="number"
                  step="0.01"
                  value={testForm.normal_range_max}
                  onChange={(e) => setTestForm({ ...testForm, normal_range_max: e.target.value })}
                  placeholder="Max value"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="normal_range_text">Normal Range (Text)</Label>
              <Input
                id="normal_range_text"
                value={testForm.normal_range_text}
                onChange={(e) => setTestForm({ ...testForm, normal_range_text: e.target.value })}
                placeholder="e.g., 4.5-5.5 g/dL or Negative"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTestDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTest} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : selectedTest ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Category Dialog */}
      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Add Category
            </DialogTitle>
            <DialogDescription>
              Create a new test category to organize tests
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="category_name">Category Name *</Label>
              <Input
                id="category_name"
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                placeholder="e.g., HAEMATOLOGY"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category_description">Description</Label>
              <Textarea
                id="category_description"
                value={categoryForm.description}
                onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                placeholder="Category description..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveCategory} disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Delete Test
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{testToDelete?.name}"? This action cannot be undone.
              This will not affect existing patient test records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTestToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTest}
              className="bg-destructive hover:bg-destructive/90"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ManageTestCatalog;

