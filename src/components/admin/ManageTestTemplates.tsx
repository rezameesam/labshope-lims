import { useState, useEffect } from "react";
import {
  FileText,
  Plus,
  Edit,
  Trash2,
  Save,
  Search,
  Copy,
  Eye,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TestTemplate {
  id: string;
  name: string;
  test_category: string | null;
  test_id: string | null;
  header_template: string | null;
  footer_template: string | null;
  result_format: string; // 'table' | 'list' | 'custom'
  include_normal_range: boolean;
  include_abnormal_flag: boolean;
  include_notes: boolean;
  custom_css: string | null;
  is_default: boolean;
  created_at: string;
}

interface TestCategory {
  id: string;
  name: string;
}

const ManageTestTemplates = () => {
  const [templates, setTemplates] = useState<TestTemplate[]>([]);
  const [categories, setCategories] = useState<TestCategory[]>([]);
  const [tests, setTests] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<TestTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<TestTemplate | null>(null);

  const [templateForm, setTemplateForm] = useState({
    name: "",
    test_category: "",
    test_id: "",
    header_template: "",
    footer_template: "",
    result_format: "table" as "table" | "list" | "custom",
    include_normal_range: true,
    include_abnormal_flag: true,
    include_notes: true,
    custom_css: "",
    is_default: false,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch templates
      const { data: templatesData, error: templatesError } = await supabase
        .from("test_templates")
        .select("*")
        .order("name");

      if (templatesError) throw templatesError;
      setTemplates(templatesData || []);

      // Fetch categories
      const { data: categoriesData, error: categoriesError } = await supabase
        .from("test_categories")
        .select("id, name")
        .order("name");

      if (categoriesError) throw categoriesError;
      setCategories(categoriesData || []);

      // Fetch tests
      const { data: testsData, error: testsError } = await supabase
        .from("tests")
        .select("id, name");

      if (testsError) throw testsError;
      setTests(testsData || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTemplateForm({
      name: "",
      test_category: "",
      test_id: "",
      header_template: "",
      footer_template: "",
      result_format: "table",
      include_normal_range: true,
      include_abnormal_flag: true,
      include_notes: true,
      custom_css: "",
      is_default: false,
    });
    setEditingTemplate(null);
  };

  const openEditDialog = (template: TestTemplate) => {
    setEditingTemplate(template);
    setTemplateForm({
      name: template.name,
      test_category: template.test_category || "",
      test_id: template.test_id || "",
      header_template: template.header_template || "",
      footer_template: template.footer_template || "",
      result_format: template.result_format as "table" | "list" | "custom",
      include_normal_range: template.include_normal_range,
      include_abnormal_flag: template.include_abnormal_flag,
      include_notes: template.include_notes,
      custom_css: template.custom_css || "",
      is_default: template.is_default,
    });
    setIsDialogOpen(true);
  };

  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim()) {
      toast.error("Template name is required");
      return;
    }

    try {
      const templateData = {
        name: templateForm.name.trim(),
        test_category: templateForm.test_category || null,
        test_id: templateForm.test_id || null,
        header_template: templateForm.header_template.trim() || null,
        footer_template: templateForm.footer_template.trim() || null,
        result_format: templateForm.result_format,
        include_normal_range: templateForm.include_normal_range,
        include_abnormal_flag: templateForm.include_abnormal_flag,
        include_notes: templateForm.include_notes,
        custom_css: templateForm.custom_css.trim() || null,
        is_default: templateForm.is_default,
      };

      if (editingTemplate) {
        const { error } = await supabase
          .from("test_templates")
          .update(templateData)
          .eq("id", editingTemplate.id);

        if (error) throw error;
        toast.success("Template updated successfully");
      } else {
        const { error } = await supabase
          .from("test_templates")
          .insert(templateData);

        if (error) throw error;
        toast.success("Template created successfully");
      }

      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      console.error("Error saving template:", error);
      toast.error("Failed to save template");
    }
  };

  const handleDeleteTemplate = async () => {
    if (!templateToDelete) return;

    try {
      const { error } = await supabase
        .from("test_templates")
        .delete()
        .eq("id", templateToDelete);

      if (error) throw error;

      toast.success("Template deleted successfully");
      setIsDeleteDialogOpen(false);
      setTemplateToDelete(null);
      fetchData();
    } catch (error) {
      console.error("Error deleting template:", error);
      toast.error("Failed to delete template");
    }
  };

  const handleDuplicateTemplate = async (template: TestTemplate) => {
    try {
      const { error } = await supabase
        .from("test_templates")
        .insert({
          name: `${template.name} (Copy)`,
          test_category: template.test_category,
          test_id: template.test_id,
          header_template: template.header_template,
          footer_template: template.footer_template,
          result_format: template.result_format,
          include_normal_range: template.include_normal_range,
          include_abnormal_flag: template.include_abnormal_flag,
          include_notes: template.include_notes,
          custom_css: template.custom_css,
          is_default: false,
        });

      if (error) throw error;
      toast.success("Template duplicated successfully");
      fetchData();
    } catch (error) {
      console.error("Error duplicating template:", error);
      toast.error("Failed to duplicate template");
    }
  };

  const filteredTemplates = templates.filter((template) =>
    template.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getFormatBadge = (format: string) => {
    switch (format) {
      case "table":
        return <Badge variant="default">Table</Badge>;
      case "list":
        return <Badge variant="secondary">List</Badge>;
      case "custom":
        return <Badge variant="outline">Custom</Badge>;
      default:
        return <Badge variant="outline">{format}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-clinical-navy">Test Result Templates</h2>
          <p className="text-muted-foreground">Create and manage test report templates</p>
        </div>
        <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Template
        </Button>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Templates Table */}
      <Card>
        <CardHeader>
          <CardTitle>Templates</CardTitle>
          <CardDescription>Manage test result report templates</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No templates found. Create your first template!
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Template Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Test</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Options</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTemplates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell>
                      {template.test_category ? (
                        <Badge variant="outline">{template.test_category}</Badge>
                      ) : (
                        <span className="text-muted-foreground">All</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {template.test_id ? (
                        <span className="text-sm text-muted-foreground">
                          {tests.find((t) => t.id === template.test_id)?.name || "—"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{getFormatBadge(template.result_format)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {template.include_normal_range && (
                          <Badge variant="outline" className="text-xs">Range</Badge>
                        )}
                        {template.include_abnormal_flag && (
                          <Badge variant="outline" className="text-xs">Flag</Badge>
                        )}
                        {template.include_notes && (
                          <Badge variant="outline" className="text-xs">Notes</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {template.is_default ? (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Default</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPreviewTemplate(template);
                            setIsPreviewDialogOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDuplicateTemplate(template)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(template)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setTemplateToDelete(template.id);
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

      {/* Add/Edit Template Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit Template" : "Create Template"}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-150px)] pr-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Template Name *</Label>
                  <Input
                    id="name"
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                    placeholder="e.g., Standard Blood Test Report"
                  />
                </div>
                <div>
                  <Label htmlFor="format">Result Format *</Label>
                  <Select
                    value={templateForm.result_format}
                    onValueChange={(value) => setTemplateForm({ ...templateForm, result_format: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="table">Table</SelectItem>
                      <SelectItem value="list">List</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="category">Test Category (Optional)</Label>
                  <Select
                    value={templateForm.test_category || "__all__"}
                    onValueChange={(value) => setTemplateForm({ ...templateForm, test_category: value === "__all__" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Categories</SelectItem>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.name}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="test">Specific Test (Optional)</Label>
                  <Select
                    value={templateForm.test_id || "__all__"}
                    onValueChange={(value) => setTemplateForm({ ...templateForm, test_id: value === "__all__" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Tests" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Tests</SelectItem>
                      {tests.map((test) => (
                        <SelectItem key={test.id} value={test.id}>
                          {test.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="header">Header Template (HTML)</Label>
                <Textarea
                  id="header"
                  value={templateForm.header_template}
                  onChange={(e) => setTemplateForm({ ...templateForm, header_template: e.target.value })}
                  placeholder="Custom HTML for report header..."
                  rows={4}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use variables: {"{"}patient_name{"}"}, {"{"}patient_id{"}"}, {"{"}test_date{"}"}
                </p>
              </div>

              <div>
                <Label htmlFor="footer">Footer Template (HTML)</Label>
                <Textarea
                  id="footer"
                  value={templateForm.footer_template}
                  onChange={(e) => setTemplateForm({ ...templateForm, footer_template: e.target.value })}
                  placeholder="Custom HTML for report footer..."
                  rows={4}
                  className="font-mono text-sm"
                />
              </div>

              <div>
                <Label htmlFor="css">Custom CSS (Optional)</Label>
                <Textarea
                  id="css"
                  value={templateForm.custom_css}
                  onChange={(e) => setTemplateForm({ ...templateForm, custom_css: e.target.value })}
                  placeholder="Custom CSS styles..."
                  rows={4}
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-3">
                <Label>Display Options</Label>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="include_normal_range"
                      checked={templateForm.include_normal_range}
                      onChange={(e) => setTemplateForm({ ...templateForm, include_normal_range: e.target.checked })}
                      className="rounded"
                    />
                    <Label htmlFor="include_normal_range">Include Normal Range</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="include_abnormal_flag"
                      checked={templateForm.include_abnormal_flag}
                      onChange={(e) => setTemplateForm({ ...templateForm, include_abnormal_flag: e.target.checked })}
                      className="rounded"
                    />
                    <Label htmlFor="include_abnormal_flag">Include Abnormal Flag</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="include_notes"
                      checked={templateForm.include_notes}
                      onChange={(e) => setTemplateForm({ ...templateForm, include_notes: e.target.checked })}
                      className="rounded"
                    />
                    <Label htmlFor="include_notes">Include Notes</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is_default"
                      checked={templateForm.is_default}
                      onChange={(e) => setTemplateForm({ ...templateForm, is_default: e.target.checked })}
                      className="rounded"
                    />
                    <Label htmlFor="is_default">Set as Default</Label>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate}>
              <Save className="h-4 w-4 mr-2" />
              {editingTemplate ? "Update" : "Create"} Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
          </DialogHeader>
          {previewTemplate && (
            <ScrollArea className="max-h-[calc(90vh-100px)]">
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Template Details</h3>
                  <div className="space-y-2 text-sm">
                    <p><strong>Name:</strong> {previewTemplate.name}</p>
                    <p><strong>Format:</strong> {previewTemplate.result_format}</p>
                    <p><strong>Category:</strong> {previewTemplate.test_category || "All"}</p>
                    <p><strong>Options:</strong>{" "}
                      {previewTemplate.include_normal_range && "Normal Range "}
                      {previewTemplate.include_abnormal_flag && "Abnormal Flag "}
                      {previewTemplate.include_notes && "Notes"}
                    </p>
                  </div>
                </div>
                {previewTemplate.header_template && (
                  <div>
                    <h3 className="font-semibold mb-2">Header Template</h3>
                    <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
                      {previewTemplate.header_template}
                    </pre>
                  </div>
                )}
                {previewTemplate.footer_template && (
                  <div>
                    <h3 className="font-semibold mb-2">Footer Template</h3>
                    <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
                      {previewTemplate.footer_template}
                    </pre>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this template? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTemplate} className="bg-red-500 hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ManageTestTemplates;

