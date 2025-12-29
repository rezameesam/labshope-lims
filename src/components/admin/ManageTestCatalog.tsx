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
  test_id: string | null;
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
    test_id: "",
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
      // Use * to select all columns (handles case where test_id might not exist yet)
      const { data, error } = await supabase
        .from("tests")
        .select(`
          *,
          category:test_categories(name)
        `)
        .order("name");

      if (error) {
        console.error("Fetch error:", error);
        throw error;
      }
      setTests((data || []) as Test[]);
    } catch (error: any) {
      console.error("Error fetching tests:", error);
      const errorMessage = error?.message || "Failed to load tests";
      toast.error(errorMessage);
      // Set empty array on error to prevent further issues
      setTests([]);
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
      test_id: "",
      name: "",
      description: "",
      price: "",
      category_id: "none",
      unit: "",
      normal_range_min: "",
      normal_range_max: "",
      normal_range_text: "",
      sample_type: "Blood",
    });
    setSelectedTest(null);
  };

  const generateTestId = (testName: string): string => {
    // Generate a test ID based on test name initials
    const words = testName.toUpperCase().split(/\s+/).filter(w => w.length > 0);
    let prefix = "";
    
    if (words.length >= 2) {
      // Use first letter of each word (up to 4 words)
      prefix = words.slice(0, 4).map(w => w[0]).join('').replace(/[^A-Z0-9]/g, '');
    } else {
      // Use first 3-4 characters of single word
      prefix = testName.substring(0, 4).toUpperCase().replace(/\s/g, '').replace(/[^A-Z0-9]/g, '');
    }
    
    // Ensure prefix is at least 2 characters
    if (prefix.length < 2) {
      prefix = (testName.substring(0, 3).toUpperCase().replace(/\s/g, '').replace(/[^A-Z0-9]/g, '') || "TEST").substring(0, 3);
    }
    
    // Limit prefix to 4 characters max
    prefix = prefix.substring(0, 4);
    
    // Try to find a unique ID by checking existing tests
    let counter = 1;
    let testId = `${prefix}${counter.toString().padStart(3, '0')}`;
    
    // Check if this ID already exists
    const existingTest = tests.find(t => t.test_id === testId);
    if (existingTest) {
      // Find the highest number for this prefix
      const prefixTests = tests.filter(t => t.test_id?.startsWith(prefix));
      const numbers = prefixTests
        .map(t => {
          if (!t.test_id) return 0;
          // Escape special regex characters in prefix
          const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const match = t.test_id.match(new RegExp(`^${escapedPrefix}(\\d+)$`));
          return match ? parseInt(match[1]) : 0;
        })
        .filter(n => n > 0);
      counter = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
      testId = `${prefix}${counter.toString().padStart(3, '0')}`;
    }
    
    return testId;
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
        test_id: test.test_id || "",
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
      // Auto-generate test_id for new tests when dialog opens
      const autoGeneratedId = generateTestId("New Test");
      setTestForm(prev => ({ ...prev, test_id: autoGeneratedId }));
    }
    setIsTestDialogOpen(true);
  };

  const openCategoryDialog = () => {
    resetCategoryForm();
    setIsCategoryDialogOpen(true);
  };

  const handleGenerateMissingIds = async () => {
    const testsWithoutId = tests.filter(t => !t.test_id);
    
    if (testsWithoutId.length === 0) {
      toast.info("All tests already have IDs");
      return;
    }

    if (!confirm(`Generate Test IDs for ${testsWithoutId.length} test(s) that don't have one?`)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const updates = testsWithoutId.map(test => {
        const generatedId = generateTestId(test.name);
        return {
          id: test.id,
          test_id: generatedId
        };
      });

      // Check for duplicates and resolve conflicts
      const idMap = new Map<string, string[]>();
      updates.forEach(update => {
        if (!idMap.has(update.test_id)) {
          idMap.set(update.test_id, []);
        }
        idMap.get(update.test_id)!.push(update.id);
      });

      // Resolve conflicts by adding numbers
      const finalUpdates = updates.map(update => {
        const conflictingIds = idMap.get(update.test_id) || [];
        if (conflictingIds.length > 1) {
          const index = conflictingIds.indexOf(update.id);
          const prefix = update.test_id.replace(/\d+$/, '');
          const existingNumbers = tests
            .filter(t => t.test_id?.startsWith(prefix))
            .map(t => {
              if (!t.test_id) return 0;
              const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const match = t.test_id.match(new RegExp(`^${escapedPrefix}(\\d+)$`));
              return match ? parseInt(match[1]) : 0;
            })
            .filter(n => n > 0);
          const maxNum = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
          update.test_id = `${prefix}${(maxNum + index + 1).toString().padStart(3, '0')}`;
        }
        return update;
      });

      // Update all tests
      for (const update of finalUpdates) {
        const { error } = await supabase
          .from("tests")
          .update({ test_id: update.test_id })
          .eq("id", update.id);

        if (error) {
          console.error(`Error updating test ${update.id}:`, error);
          // Check if it's a schema error (column doesn't exist)
          if (error.code === 'PGRST204' || error.message?.includes("test_id")) {
            toast.error("The test_id column doesn't exist yet. Please run the database migration first. See the migration file: supabase/migrations/20251229210933_allow_employees_manage_tests.sql");
            throw new Error("Database migration required: The test_id column needs to be added to the tests table. Please run the migration in your Supabase dashboard.");
          }
          throw error;
        }
      }

      toast.success(`Generated Test IDs for ${finalUpdates.length} test(s)`);
      fetchTests();
    } catch (error: any) {
      console.error("Error generating test IDs:", error);
      toast.error(error.message || "Failed to generate test IDs");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveTest = async () => {
    if (!testForm.name.trim()) {
      toast.error("Test name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      // Auto-generate test_id if not provided or if name changed (for new tests)
      let testId: string | null = testForm.test_id.trim() || null;
      if (!testId) {
        // Auto-generate based on test name
        testId = generateTestId(testForm.name);
        // Update the form so user can see the generated ID
        setTestForm(prev => ({ ...prev, test_id: testId || "" }));
      }

      // Validate test_id if provided (must be unique)
      if (testId) {
        const existingTest = tests.find(t => t.test_id === testId && t.id !== selectedTest?.id);
        if (existingTest) {
          toast.error(`Test ID "${testId}" already exists. Please use a different ID.`);
          setIsSubmitting(false);
          return;
        }
      }

      const testData: any = {
        name: testForm.name.trim(),
        description: testForm.description.trim() || null,
        price: testForm.price ? parseFloat(testForm.price) : null,
        category_id: testForm.category_id && testForm.category_id !== "none" ? testForm.category_id : null,
        unit: testForm.unit.trim() || null,
        normal_range_min: testForm.normal_range_min ? parseFloat(testForm.normal_range_min) : null,
        normal_range_max: testForm.normal_range_max ? parseFloat(testForm.normal_range_max) : null,
        normal_range_text: testForm.normal_range_text.trim() || null,
        sample_type: testForm.sample_type || "Blood",
      };

      // Only include test_id if it's not null (to avoid UNIQUE constraint issues with null)
      if (testId) {
        testData.test_id = testId;
      }

      if (selectedTest) {
        // Update existing test
        const { error } = await supabase
          .from("tests")
          .update(testData)
          .eq("id", selectedTest.id);

        if (error) {
          console.error("Update error:", error);
          throw error;
        }
        toast.success("Test updated successfully");
      } else {
        // Create new test
        const { error } = await supabase
          .from("tests")
          .insert(testData);

        if (error) {
          console.error("Insert error:", error);
          throw error;
        }
        toast.success("Test created successfully");
      }

      setIsTestDialogOpen(false);
      resetTestForm();
      fetchTests();
    } catch (error: any) {
      console.error("Error saving test:", error);
      const errorMessage = error?.message || error?.error_description || "Failed to save test";
      toast.error(errorMessage);
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
    const searchLower = search.toLowerCase();
    const matchesSearch = 
      test.name.toLowerCase().includes(searchLower) ||
      test.test_id?.toLowerCase().includes(searchLower) ||
      test.description?.toLowerCase().includes(searchLower) ||
      test.category?.name.toLowerCase().includes(searchLower);
    
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
          {tests.some(t => !t.test_id) && (
            <Button 
              variant="outline"
              onClick={handleGenerateMissingIds}
              className="gap-2"
              title="Generate Test IDs for tests that don't have one"
            >
              <FlaskConical className="h-4 w-4" />
              Generate Missing IDs
            </Button>
          )}
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
                placeholder="Search by test ID, name, description, or category..."
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
                <TableHead>Test ID</TableHead>
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
                  <TableCell colSpan={7} className="text-center py-8">
                    Loading tests...
                  </TableCell>
                </TableRow>
              ) : filteredTests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No tests found
                  </TableCell>
                </TableRow>
              ) : (
                filteredTests.map((test) => (
                  <TableRow key={test.id} className="hover:bg-muted/30">
                    <TableCell>
                      {test.test_id ? (
                        <Badge variant="outline" className="font-mono">
                          {test.test_id}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                          No ID
                        </Badge>
                      )}
                    </TableCell>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="test_id">Test ID / Code</Label>
                <div className="flex gap-2">
                  <Input
                    id="test_id"
                    value={testForm.test_id}
                    onChange={(e) => setTestForm({ ...testForm, test_id: e.target.value.toUpperCase() })}
                    placeholder="e.g., CBC001, LFT001"
                    className="font-mono flex-1"
                  />
                  {!selectedTest && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const autoId = generateTestId(testForm.name || "New Test");
                        setTestForm(prev => ({ ...prev, test_id: autoId }));
                      }}
                      title="Auto-generate based on test name"
                    >
                      Auto
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedTest 
                    ? "Test ID can be edited if needed"
                    : "Auto-generated based on test name. Click 'Auto' to regenerate or edit manually"}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Test Name *</Label>
                <Input
                  id="name"
                  value={testForm.name}
                  onChange={(e) => {
                    const newName = e.target.value;
                    setTestForm(prev => {
                      const updated = { ...prev, name: newName };
                      // Auto-update test_id if it was auto-generated (for new tests only)
                      if (!selectedTest && prev.test_id && newName) {
                        // Only auto-update if test_id looks auto-generated (has 3 digits at end)
                        if (prev.test_id.match(/\d{3}$/)) {
                          updated.test_id = generateTestId(newName);
                        }
                      }
                      return updated;
                    });
                  }}
                  placeholder="e.g., Complete Blood Count (CBC)"
                />
              </div>
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
                  value={testForm.category_id || "none"}
                  onValueChange={(value) => setTestForm({ ...testForm, category_id: value })}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Category</SelectItem>
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

