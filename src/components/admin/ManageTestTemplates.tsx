import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Copy,
  Edit,
  Eye,
  LayoutTemplate,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import {
  REPORT_TEMPLATE_PRESETS,
  REPORT_TEMPLATE_VARIABLES,
  getTemplateScopeLabel,
  renderReportTemplateText,
  type ReportTemplatePreviewContext,
} from "@/lib/reportTemplates";
import { toast } from "sonner";
import { useOrganization } from "@/contexts/OrganizationContext";

interface TestTemplate {
  id: string;
  name: string;
  organization_id: string | null;
  test_category: string | null;
  test_id: string | null;
  header_template: string | null;
  footer_template: string | null;
  result_format: string;
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

type TemplateFormState = {
  name: string;
  test_category: string;
  test_id: string;
  header_template: string;
  footer_template: string;
  result_format: "table" | "list" | "custom";
  include_normal_range: boolean;
  include_abnormal_flag: boolean;
  include_notes: boolean;
  custom_css: string;
  is_default: boolean;
};

const EMPTY_FORM: TemplateFormState = {
  name: "",
  test_category: "",
  test_id: "",
  header_template: "",
  footer_template: "",
  result_format: "table",
  include_normal_range: true,
  include_abnormal_flag: true,
  include_notes: false,
  custom_css: "",
  is_default: false,
};

const PREVIEW_ROWS = [
  {
    test: "Hemoglobin",
    result: "13.8",
    unit: "g/dL",
    normalRange: "13.0 - 17.0",
    status: "OK",
    notes: "Within expected range",
  },
  {
    test: "WBC Count",
    result: "11.9",
    unit: "10^3/uL",
    normalRange: "4.0 - 10.0",
    status: "ABN",
    notes: "Slightly elevated",
  },
];

const createTemplateCardPreview = (
  template: Pick<
    TemplateFormState,
    | "header_template"
    | "footer_template"
    | "result_format"
    | "include_normal_range"
    | "include_abnormal_flag"
    | "include_notes"
  >,
  previewContext: ReportTemplatePreviewContext,
) => ({
  headerText: renderReportTemplateText(template.header_template, previewContext),
  footerText: renderReportTemplateText(template.footer_template, previewContext),
});

const TemplateReportPreview = ({
  template,
  scopeLabel,
  previewContext,
}: {
  template: Pick<
    TemplateFormState,
    | "header_template"
    | "footer_template"
    | "result_format"
    | "include_normal_range"
    | "include_abnormal_flag"
    | "include_notes"
  >;
  scopeLabel: string;
  previewContext: ReportTemplatePreviewContext;
}) => {
  const { headerText, footerText } = createTemplateCardPreview(template, previewContext);
  const displayRows = PREVIEW_ROWS.map((row) => {
    const cells = [row.test, row.result, row.unit];
    if (template.include_normal_range) cells.push(row.normalRange);
    if (template.include_notes) cells.push(row.notes);
    if (template.include_abnormal_flag) cells.push(row.status);
    return cells;
  });

  const headers = ["Test", "Result", "Unit"];
  if (template.include_normal_range) headers.push("Normal Range");
  if (template.include_notes) headers.push("Notes");
  if (template.include_abnormal_flag) headers.push("Status");

  return (
    <Card className="border-clinical-blue/15 bg-gradient-to-b from-white to-clinical-blue-light/20">
      <CardHeader className="space-y-3 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base text-clinical-navy">Live Preview</CardTitle>
            <CardDescription>Sample report layout using current template settings</CardDescription>
          </div>
          <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
            {scopeLabel}
          </Badge>
        </div>
        <div className="rounded-xl border border-border bg-background px-4 py-3 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {previewContext.lab_name}
          </div>
          <div className="mt-2 text-lg font-semibold text-foreground">{previewContext.test_name}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Patient {previewContext.patient_name} · {previewContext.patient_id}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Header Block
          </div>
          {headerText ? (
            <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">{headerText}</div>
          ) : (
            <div className="text-sm italic text-muted-foreground">No custom header text</div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Result Layout
          </div>

          {template.result_format === "list" ? (
            <div className="space-y-3">
              {PREVIEW_ROWS.map((row) => (
                <div key={row.test} className="rounded-lg border border-border/80 bg-muted/20 p-3">
                  <div className="font-medium text-foreground">{row.test}</div>
                  <div className="mt-1 text-sm text-foreground">
                    {row.result} {row.unit}
                  </div>
                  {template.include_normal_range && (
                    <div className="mt-1 text-sm text-muted-foreground">Range: {row.normalRange}</div>
                  )}
                  {template.include_abnormal_flag && (
                    <div className={`mt-1 text-sm font-medium ${row.status === "ABN" ? "text-red-600" : "text-emerald-600"}`}>
                      {row.status === "ABN" ? "Abnormal" : "Within Range"}
                    </div>
                  )}
                  {template.include_notes && (
                    <div className="mt-1 text-sm text-muted-foreground">Notes: {row.notes}</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border/80">
              <table className="w-full text-sm">
                <thead className="bg-clinical-navy text-primary-foreground">
                  <tr>
                    {headers.map((header) => (
                      <th key={header} className="px-3 py-2 text-left font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, index) => (
                    <tr key={PREVIEW_ROWS[index].test} className={index % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                      {row.map((cell, cellIndex) => (
                        <td
                          key={`${PREVIEW_ROWS[index].test}-${cellIndex}`}
                          className={`px-3 py-2 ${headers[cellIndex] === "Status" && cell === "ABN" ? "font-semibold text-red-600" : "text-foreground"}`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {template.result_format === "custom" && (
            <p className="mt-3 text-xs text-amber-700">
              Custom format is currently stored for future use. Reports still render with the table layout for now.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Footer Block
          </div>
          {footerText ? (
            <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">{footerText}</div>
          ) : (
            <div className="text-sm italic text-muted-foreground">No custom footer text</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const ManageTestTemplates = () => {
  const { organization, branding, settings, loading: organizationLoading } = useOrganization();
  const organizationId = organization?.id ?? null;
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
  const [activeEditor, setActiveEditor] = useState<"header_template" | "footer_template" | "custom_css">("header_template");
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(EMPTY_FORM);

  const previewContext = useMemo<ReportTemplatePreviewContext>(
    () => ({
      patient_name: "Amina Bhat",
      patient_id: "IRM-20481",
      phone: branding.primaryPhone,
      test_name: "Complete Blood Count",
      test_date: "10 Mar 2026",
      report_date: "10 Mar 2026",
      lab_name: branding.displayName,
      lab_code: "MAIN",
      collection_center: "Main Collection Center",
      entered_by: "Dr. Irfan Ahmad",
    }),
    [branding.displayName, branding.primaryPhone]
  );

  const defaultTemplateForm = useMemo<TemplateFormState>(
    () => ({
      ...EMPTY_FORM,
      header_template: settings.report_default_header_template || "",
      footer_template: settings.report_default_footer_template || "",
    }),
    [settings.report_default_footer_template, settings.report_default_header_template]
  );

  const fetchData = useCallback(async () => {
    if (!organizationId) {
      setTemplates([]);
      setCategories([]);
      setTests([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const templatesQuery = supabase
        .from("test_templates")
        .select("*")
        .eq("organization_id" as any, organizationId)
        .order("name");

      const [templatesResult, categoriesResult, testsResult] = await Promise.all([
        templatesQuery,
        supabase.from("test_categories").select("id, name").eq("organization_id", organizationId).order("name"),
        supabase.from("tests").select("id, name").eq("organization_id", organizationId).order("name"),
      ]);

      if (templatesResult.error) throw templatesResult.error;
      if (categoriesResult.error) throw categoriesResult.error;
      if (testsResult.error) throw testsResult.error;

      setTemplates((templatesResult.data || []) as TestTemplate[]);
      setCategories(categoriesResult.data || []);
      setTests(testsResult.data || []);
    } catch (error) {
      console.error("Error fetching templates:", error);
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (organizationLoading) {
      return;
    }

    if (!organizationId) {
      setTemplates([]);
      setCategories([]);
      setTests([]);
      setLoading(false);
      return;
    }

    void fetchData();
  }, [fetchData, organizationId, organizationLoading]);

  const resetForm = () => {
    setTemplateForm(defaultTemplateForm);
    setEditingTemplate(null);
    setActiveEditor("header_template");
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (template: TestTemplate) => {
    setEditingTemplate(template);
    setTemplateForm({
      name: template.name,
      test_category: template.test_category || "",
      test_id: template.test_id || "",
      header_template: template.header_template || "",
      footer_template: template.footer_template || "",
      result_format: (template.result_format as "table" | "list" | "custom") || "table",
      include_normal_range: template.include_normal_range ?? true,
      include_abnormal_flag: template.include_abnormal_flag ?? true,
      include_notes: template.include_notes ?? false,
      custom_css: template.custom_css || "",
      is_default: template.is_default ?? false,
    });
    setActiveEditor("header_template");
    setIsDialogOpen(true);
  };

  const startFromExistingTemplate = (template: TestTemplate) => {
    setEditingTemplate(null);
    setTemplateForm({
      name: `${template.name} Copy`,
      test_category: template.test_category || "",
      test_id: template.test_id || "",
      header_template: template.header_template || "",
      footer_template: template.footer_template || "",
      result_format: (template.result_format as "table" | "list" | "custom") || "table",
      include_normal_range: template.include_normal_range ?? true,
      include_abnormal_flag: template.include_abnormal_flag ?? true,
      include_notes: template.include_notes ?? false,
      custom_css: template.custom_css || "",
      is_default: false,
    });
    setActiveEditor("header_template");
    setIsDialogOpen(true);
  };

  const applyPreset = (presetId: string) => {
    const preset = REPORT_TEMPLATE_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;

    setTemplateForm((previous) => ({
      ...previous,
      name: previous.name || preset.name,
      header_template: preset.header_template,
      footer_template: preset.footer_template,
      result_format: preset.result_format,
      include_normal_range: preset.include_normal_range,
      include_abnormal_flag: preset.include_abnormal_flag,
      include_notes: preset.include_notes,
      custom_css: previous.custom_css,
      is_default: previous.is_default,
    }));
    toast.success(`${preset.name} preset applied`);
  };

  const insertVariable = (token: string) => {
    setTemplateForm((previous) => ({
      ...previous,
      [activeEditor]: `${previous[activeEditor]}${previous[activeEditor] ? " " : ""}${token}`,
    }));
  };

  const handleSaveTemplate = async () => {
    if (!organizationId) {
      toast.error("Organization context is required before saving templates");
      return;
    }

    if (!templateForm.name.trim()) {
      toast.error("Template name is required");
      return;
    }

    try {
      const payload = {
        organization_id: organizationId,
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
          .update(payload)
          .eq("id", editingTemplate.id)
          .eq("organization_id" as any, organizationId);

        if (error) throw error;
        toast.success("Template updated successfully");
      } else {
        const { error } = await supabase
          .from("test_templates")
          .insert(payload);

        if (error) throw error;
        toast.success("Template created successfully");
      }

      setIsDialogOpen(false);
      resetForm();
      await fetchData();
    } catch (error) {
      console.error("Error saving template:", error);
      toast.error("Failed to save template");
    }
  };

  const handleDeleteTemplate = async () => {
    if (!templateToDelete) return;
    if (!organizationId) {
      toast.error("Organization context is required before deleting templates");
      return;
    }

    try {
      const { error } = await supabase
        .from("test_templates")
        .delete()
        .eq("id", templateToDelete)
        .eq("organization_id" as any, organizationId);

      if (error) throw error;

      toast.success("Template deleted successfully");
      setTemplateToDelete(null);
      setIsDeleteDialogOpen(false);
      await fetchData();
    } catch (error) {
      console.error("Error deleting template:", error);
      toast.error("Failed to delete template");
    }
  };

  const filteredTemplates = useMemo(
    () =>
      templates.filter((template) =>
        [
          template.name,
          template.test_category || "",
          tests.find((item) => item.id === template.test_id)?.name || "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(searchQuery.toLowerCase()),
      ),
    [templates, tests, searchQuery],
  );

  const selectedTestName = useMemo(
    () => tests.find((item) => item.id === templateForm.test_id)?.name || null,
    [tests, templateForm.test_id],
  );

  const formScopeLabel = getTemplateScopeLabel(templateForm.test_category, selectedTestName);
  const defaultTemplate = templates.find((template) => template.is_default);

  const getFormatBadge = (format: string) => {
    switch (format) {
      case "table":
        return <Badge className="bg-clinical-navy/10 text-clinical-navy hover:bg-clinical-navy/10">Table</Badge>;
      case "list":
        return <Badge className="bg-primary/10 text-primary hover:bg-primary/10">List</Badge>;
      case "custom":
        return <Badge variant="outline">Custom</Badge>;
      default:
        return <Badge variant="outline">{format}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-clinical-navy">Test Result Templates</h2>
          <p className="text-muted-foreground">
            Create templates with live preview, reusable presets, and clearer report scope.
          </p>
        </div>
        <Button onClick={openCreateDialog} className="bg-clinical-navy hover:bg-clinical-navy/90">
          <Plus className="mr-2 h-4 w-4" />
          Create Template
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-primary/10">
          <CardHeader className="pb-2">
            <CardDescription>Total Templates</CardDescription>
            <CardTitle className="text-3xl">{templates.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-primary/10">
          <CardHeader className="pb-2">
            <CardDescription>Default Template</CardDescription>
            <CardTitle className="text-lg">{defaultTemplate?.name || "Not set"}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-primary/10">
          <CardHeader className="pb-2">
            <CardDescription>Quick Start</CardDescription>
            <CardTitle className="text-lg">3 presets ready</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Label htmlFor="test-template-search" className="sr-only">
              Search test templates
            </Label>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="test-template-search"
              name="test_template_search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by template, category, or test name"
              className="pl-10"
              autoComplete="off"
            />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">Loading templates...</CardContent>
        </Card>
      ) : filteredTemplates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <LayoutTemplate className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
            <div className="text-lg font-medium text-foreground">No templates found</div>
            <p className="mt-2 text-muted-foreground">
              Start with a preset and adjust the header, footer, and result layout from a live preview.
            </p>
            <Button onClick={openCreateDialog} className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Create First Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredTemplates.map((template) => {
            const testName = tests.find((item) => item.id === template.test_id)?.name || null;
            const scopeLabel = getTemplateScopeLabel(template.test_category, testName);
            const preview = createTemplateCardPreview({
              header_template: template.header_template || "",
              footer_template: template.footer_template || "",
              result_format: (template.result_format as "table" | "list" | "custom") || "table",
              include_normal_range: template.include_normal_range ?? true,
              include_abnormal_flag: template.include_abnormal_flag ?? true,
              include_notes: template.include_notes ?? false,
            }, previewContext);

            return (
              <Card key={template.id} className="overflow-hidden border-border/70 shadow-sm">
                <CardHeader className="space-y-4 border-b bg-muted/20">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-xl text-clinical-navy">{template.name}</CardTitle>
                      <CardDescription className="mt-1">{scopeLabel}</CardDescription>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {getFormatBadge(template.result_format)}
                      {template.is_default && (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Default</Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {template.include_normal_range && <Badge variant="outline">Normal Range</Badge>}
                    {template.include_abnormal_flag && <Badge variant="outline">Abnormal Flag</Badge>}
                    {template.include_notes && <Badge variant="outline">Notes</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-border bg-card p-4">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Header Preview
                      </div>
                      <div className="line-clamp-5 whitespace-pre-wrap text-sm leading-6 text-foreground">
                        {preview.headerText || "No custom header"}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Footer Preview
                      </div>
                      <div className="line-clamp-5 whitespace-pre-wrap text-sm leading-6 text-foreground">
                        {preview.footerText || "No custom footer"}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setPreviewTemplate(template);
                        setIsPreviewDialogOpen(true);
                      }}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      Preview
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => startFromExistingTemplate(template)}>
                      <Copy className="mr-2 h-4 w-4" />
                      Use as Base
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openEditDialog(template)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setTemplateToDelete(template.id);
                        setIsDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4 text-red-500" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="left-2 right-2 top-2 bottom-2 flex h-auto w-auto max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden p-0 sm:left-[50%] sm:right-auto sm:top-[50%] sm:bottom-auto sm:h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-2rem)] sm:w-[calc(100vw-2rem)] sm:max-w-6xl sm:translate-x-[-50%] sm:translate-y-[-50%]">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle>{editingTemplate ? "Edit Template" : "Create Template"}</DialogTitle>
            <DialogDescription>
              Use a preset or build your own. The preview updates as you type and uses the same placeholder rendering as the PDF report.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <div className="grid min-h-full lg:grid-cols-[minmax(0,1fr)_420px]">
              <div className="border-r">
              <div className="space-y-6 px-6 py-6">
                <Card className="border-primary/10 bg-primary/5">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <CardTitle className="text-base">Quick Start Presets</CardTitle>
                    </div>
                    <CardDescription>
                      Start from a sensible base instead of writing every header and footer from scratch.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-3">
                    {REPORT_TEMPLATE_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyPreset(preset.id)}
                        className="rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                      >
                        <div className="font-medium text-foreground">{preset.name}</div>
                        <p className="mt-1 text-sm text-muted-foreground">{preset.description}</p>
                      </button>
                    ))}
                  </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="template-name">Template Name *</Label>
                    <Input
                      id="template-name"
                      value={templateForm.name}
                      onChange={(e) => setTemplateForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Standard CBC Report"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="template-format">Result Format</Label>
                    <Select
                      value={templateForm.result_format}
                      onValueChange={(value) =>
                        setTemplateForm((prev) => ({
                          ...prev,
                          result_format: value as TemplateFormState["result_format"],
                        }))
                      }
                    >
                      <SelectTrigger id="template-format">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="table">Table</SelectItem>
                        <SelectItem value="list">List</SelectItem>
                        <SelectItem value="custom">Custom (table fallback)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="template-category">Applies To Category</Label>
                    <Select
                      value={templateForm.test_category || "__all__"}
                      onValueChange={(value) =>
                        setTemplateForm((prev) => ({
                          ...prev,
                          test_category: value === "__all__" ? "" : value,
                        }))
                      }
                    >
                      <SelectTrigger id="template-category">
                        <SelectValue placeholder="All Categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All Categories</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.name}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="template-test">Applies To Specific Test</Label>
                    <Select
                      value={templateForm.test_id || "__all__"}
                      onValueChange={(value) =>
                        setTemplateForm((prev) => ({
                          ...prev,
                          test_id: value === "__all__" ? "" : value,
                        }))
                      }
                    >
                      <SelectTrigger id="template-test">
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

                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <Wand2 className="h-4 w-4 text-primary" />
                      <CardTitle className="text-base">Variables</CardTitle>
                    </div>
                    <CardDescription>
                      Click any token to insert it into the active header, footer, or CSS field.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {REPORT_TEMPLATE_VARIABLES.map((token) => (
                        <Button
                          key={token}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => insertVariable(token)}
                        >
                          {token}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Active field:{" "}
                      <span className="font-medium text-foreground">
                        {activeEditor === "header_template"
                          ? "Header"
                          : activeEditor === "footer_template"
                            ? "Footer"
                            : "Custom CSS"}
                      </span>
                    </p>
                  </CardContent>
                </Card>

                <div className="space-y-2">
                  <Label htmlFor="template-header">Header Template</Label>
                  <Textarea
                    id="template-header"
                    value={templateForm.header_template}
                    onFocus={() => setActiveEditor("header_template")}
                    onChange={(e) => setTemplateForm((prev) => ({ ...prev, header_template: e.target.value }))}
                    placeholder="<p><strong>Patient:</strong> {patient_name}</p>"
                    rows={6}
                    className="font-mono text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="template-footer">Footer Template</Label>
                  <Textarea
                    id="template-footer"
                    value={templateForm.footer_template}
                    onFocus={() => setActiveEditor("footer_template")}
                    onChange={(e) => setTemplateForm((prev) => ({ ...prev, footer_template: e.target.value }))}
                    placeholder="<p>Processed at {lab_name}</p>"
                    rows={5}
                    className="font-mono text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="template-css">Custom CSS</Label>
                  <Textarea
                    id="template-css"
                    value={templateForm.custom_css}
                    onFocus={() => setActiveEditor("custom_css")}
                    onChange={(e) => setTemplateForm((prev) => ({ ...prev, custom_css: e.target.value }))}
                    placeholder="Stored for future styling support"
                    rows={4}
                    className="font-mono text-sm"
                  />
                </div>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Display Options</CardTitle>
                    <CardDescription>Control which data blocks appear in the results area.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="include-normal-range">Include Normal Range</Label>
                      <Switch
                        id="include-normal-range"
                        checked={templateForm.include_normal_range}
                        onCheckedChange={(checked) =>
                          setTemplateForm((prev) => ({ ...prev, include_normal_range: checked }))
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="include-abnormal-flag">Include Abnormal Flag</Label>
                      <Switch
                        id="include-abnormal-flag"
                        checked={templateForm.include_abnormal_flag}
                        onCheckedChange={(checked) =>
                          setTemplateForm((prev) => ({ ...prev, include_abnormal_flag: checked }))
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="include-notes">Include Notes</Label>
                      <Switch
                        id="include-notes"
                        checked={templateForm.include_notes}
                        onCheckedChange={(checked) =>
                          setTemplateForm((prev) => ({ ...prev, include_notes: checked }))
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="is-default-template">Set as Default</Label>
                      <Switch
                        id="is-default-template"
                        checked={templateForm.is_default}
                        onCheckedChange={(checked) =>
                          setTemplateForm((prev) => ({ ...prev, is_default: checked }))
                        }
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
              </div>

              <div className="bg-muted/20 px-5 py-6">
                <div className="space-y-4">
                  <TemplateReportPreview
                    template={templateForm}
                    scopeLabel={formScopeLabel}
                    previewContext={previewContext}
                  />
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Creation Tips</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-muted-foreground">
                      <p>Use category scope for whole departments such as Haematology or Biochemistry.</p>
                      <p>Use a specific test only when one test needs a specialized report layout.</p>
                      <p>Keep header/footer copy short so it does not push result rows too far down on printed A4 pages.</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate} className="bg-clinical-navy hover:bg-clinical-navy/90">
              <Save className="mr-2 h-4 w-4" />
              {editingTemplate ? "Update" : "Create"} Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
            <DialogDescription>
              This preview uses sample patient data and the same placeholder rendering used in the PDF generator.
            </DialogDescription>
          </DialogHeader>
          {previewTemplate && (
            <TemplateReportPreview
              template={{
                header_template: previewTemplate.header_template || "",
                footer_template: previewTemplate.footer_template || "",
                result_format: (previewTemplate.result_format as "table" | "list" | "custom") || "table",
                include_normal_range: previewTemplate.include_normal_range ?? true,
                include_abnormal_flag: previewTemplate.include_abnormal_flag ?? true,
                include_notes: previewTemplate.include_notes ?? false,
              }}
              scopeLabel={getTemplateScopeLabel(
                previewTemplate.test_category,
                tests.find((item) => item.id === previewTemplate.test_id)?.name || null,
              )}
              previewContext={previewContext}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the template and it will no longer appear in the report print dialog.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTemplate} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ManageTestTemplates;
