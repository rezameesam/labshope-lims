import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Plus,
  Edit,
  Trash2,
  Save,
  Search,
  MapPin,
  Phone,
  Mail,
  Users,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useLab } from "@/contexts/LabContext";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/contexts/OrganizationContext";
import LabAnalytics from "@/components/admin/LabAnalytics";
import { BarChart3, Settings } from "lucide-react";

interface Lab {
  id: string;
  organization_id?: string | null;
  lab_code: string;
  name: string;
  type: string;
  parent_lab_id: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean | null;
  settings?: Record<string, unknown> | null;
  parent_lab?: Lab[];
}

const normalizeLabSettings = (value: unknown): Record<string, unknown> | null => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
};

const getLabAbdmSettings = (lab: Pick<Lab, "settings">) => {
  const settings =
    lab.settings && typeof lab.settings === "object"
      ? (lab.settings as Record<string, unknown>)
      : {};

  return {
    enabled:
      typeof settings.abdm_enabled === "boolean"
        ? settings.abdm_enabled
        : typeof settings.abdm_enabled === "string"
          ? settings.abdm_enabled === "true"
          : false,
    facilityId:
      typeof settings.abdm_facility_id === "string" ? settings.abdm_facility_id : "",
  };
};

const ManageLabs = () => {
  const { hasRole } = useAuth();
  const { refreshLabs, availableLabs } = useLab();
  const { organization, settings, loading: organizationLoading } = useOrganization();
  const organizationId = organization?.id ?? null;
  const isStarterPlan = settings.plan_tier === "starter";
  const [labs, setLabs] = useState<Lab[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [viewMode, setViewMode] = useState<"management" | "analytics">("management");
  const [selectedLabForAnalytics, setSelectedLabForAnalytics] = useState<Lab | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [labToDelete, setLabToDelete] = useState<string | null>(null);
  const [editingLab, setEditingLab] = useState<Lab | null>(null);

  const [labForm, setLabForm] = useState({
    lab_code: "",
    name: "",
    type: "main" as string,
    parent_lab_id: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    phone: "",
    email: "",
    abdm_enabled: false,
    abdm_facility_id: "",
    is_active: true,
  });

  const fetchLabs = useCallback(async () => {
    setLoading(true);
    try {
      // First check if labs table exists by trying a simple query
      let query = (supabase as any)
        .from("labs")
        .select("*")
        .order("name");

      if (organizationId) {
        query = query.eq("organization_id" as any, organizationId);
      }

      const { data: labsData, error } = await query;

      if (error) {
        // If table doesn't exist, show helpful message
        if (error.code === "42P01" || error.message.includes("does not exist")) {
          toast.error("Labs table not found. Please run the database migration first.");
          setLabs([]);
          return;
        }
        throw error;
      }

      // If we have data, try to fetch parent lab relationships
      if (labsData && labsData.length > 0) {
        const normalizedLabs: Lab[] = labsData.map((lab: any) => ({
          ...lab,
          settings: normalizeLabSettings(lab.settings),
          parent_lab: [],
        }));

        // Map parent lab info manually since foreign key relationship might not work
        const labsWithParent: Lab[] = normalizedLabs.map((lab) => {
          if (lab.parent_lab_id) {
            const parentLab = normalizedLabs.find((candidate) => candidate.id === lab.parent_lab_id);
            return {
              ...lab,
              parent_lab: parentLab ? [parentLab] : [],
            };
          }
          return {
            ...lab,
            parent_lab: [],
          };
        });
        setLabs(labsWithParent);
      } else {
        setLabs([]);
      }
    } catch (error: any) {
      console.error("Error fetching labs:", error);
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        toast.error("Labs table not found. Please run the database migration first.");
      } else {
        toast.error("Failed to load labs: " + (error.message || "Unknown error"));
      }
      setLabs([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (organizationLoading) {
      return;
    }

    void fetchLabs();
  }, [fetchLabs, organizationId, organizationLoading]);

  const resetForm = () => {
    setLabForm({
      lab_code: "",
      name: "",
      type: "main",
      parent_lab_id: "",
      address: "",
      city: "",
      state: "",
      pincode: "",
      phone: "",
      email: "",
      abdm_enabled: false,
      abdm_facility_id: "",
      is_active: true,
    });
    setEditingLab(null);
  };

  const openEditDialog = (lab: Lab) => {
    setEditingLab(lab);
    const abdmSettings = getLabAbdmSettings(lab);
    setLabForm({
      lab_code: lab.lab_code,
      name: lab.name,
      type: lab.type,
      parent_lab_id: lab.parent_lab_id || "",
      address: lab.address || "",
      city: lab.city || "",
      state: lab.state || "",
      pincode: lab.pincode || "",
      phone: lab.phone || "",
      email: lab.email || "",
      abdm_enabled: abdmSettings.enabled,
      abdm_facility_id: abdmSettings.facilityId,
      is_active: lab.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleSaveLab = async () => {
    if (!organizationId) {
      toast.error("Organization context is required before managing labs");
      return;
    }

    if (!labForm.lab_code.trim() || !labForm.name.trim()) {
      toast.error("Lab code and name are required");
      return;
    }

    try {
      const labData = {
        lab_code: labForm.lab_code.trim().toUpperCase(),
        organization_id: organizationId,
        name: labForm.name.trim(),
        type: labForm.type,
        parent_lab_id: labForm.parent_lab_id || null,
        address: labForm.address.trim() || null,
        city: labForm.city.trim() || null,
        state: labForm.state.trim() || null,
        pincode: labForm.pincode.trim() || null,
        phone: labForm.phone.trim() || null,
        email: labForm.email.trim() || null,
        settings: {
          ...(editingLab?.settings && typeof editingLab.settings === "object" ? editingLab.settings : {}),
          abdm_enabled: labForm.abdm_enabled,
          abdm_facility_id: labForm.abdm_facility_id.trim() || null,
        },
        is_active: labForm.is_active,
      };

      if (editingLab) {
        let updateQuery = (supabase as any)
          .from("labs")
          .update(labData)
          .match({ id: editingLab.id, organization_id: organizationId });
        const { error } = await updateQuery;

        if (error) throw error;
        toast.success("Lab updated successfully");
      } else {
        const { error } = await supabase.from("labs").insert(labData);

        if (error) throw error;
        toast.success("Lab created successfully");
      }

      setIsDialogOpen(false);
      resetForm();
      fetchLabs();
      refreshLabs();
    } catch (error: any) {
      console.error("Error saving lab:", error);
      if (error.code === "23505") {
        toast.error("Lab code already exists");
      } else {
        toast.error("Failed to save lab");
      }
    }
  };

  const handleDeleteLab = async () => {
    if (!labToDelete || !organizationId) return;

    try {
      const { error } = await (supabase as any)
        .from("labs")
        .delete()
        .match({ id: labToDelete, organization_id: organizationId });

      if (error) throw error;

      toast.success("Lab deleted successfully");
      setIsDeleteDialogOpen(false);
      setLabToDelete(null);
      fetchLabs();
      refreshLabs();
    } catch (error) {
      console.error("Error deleting lab:", error);
      toast.error("Failed to delete lab");
    }
  };

  const getTypeBadge = (type: string) => {
    const types: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
      main: { label: "Main Lab", variant: "default" },
      branch: { label: "Branch", variant: "secondary" },
      collection_center: { label: "Collection Center", variant: "outline" },
    };
    const typeInfo = types[type] || { label: type, variant: "outline" as const };
    return <Badge variant={typeInfo.variant}>{typeInfo.label}</Badge>;
  };

  const filteredLabs = labs.filter((lab) => {
    const matchesSearch =
      lab.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lab.lab_code.toLowerCase().includes(searchQuery.toLowerCase());

    if (activeTab === "all") return matchesSearch;
    if (activeTab === "active") return matchesSearch && lab.is_active;
    if (activeTab === "inactive") return matchesSearch && !lab.is_active;
    if (activeTab === "branches") return matchesSearch && lab.type === "branch";
    return matchesSearch;
  });

  const mainLabs = labs.filter((l) => l.type === "main");
  const branches = labs.filter((l) => l.type === "branch");
  const orgScopedAvailableLabs = organizationId
    ? availableLabs.filter((lab) => lab.organization_id === organizationId)
    : availableLabs;

  if (!hasRole("admin")) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        You don't have permission to manage labs
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-clinical-navy">Lab Management</h2>
          <p className="text-muted-foreground">Manage labs, branches, and collection centers</p>
        </div>
        <div className="flex gap-2">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "management" | "analytics")}>
            <TabsList>
              <TabsTrigger value="management">
                <Settings className="h-4 w-4 mr-2" />
                Management
              </TabsTrigger>
              <TabsTrigger value="analytics">
                <BarChart3 className="h-4 w-4 mr-2" />
                Analytics
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {viewMode === "management" && (
            isStarterPlan && labs.length >= 1 ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button disabled>
                        <Lock className="h-4 w-4 mr-2" />
                        Add Lab
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Starter plan allows only 1 lab. Upgrade to Growth or Premium to add more.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Add Lab
              </Button>
            )
          )}
        </div>
      </div>

      {/* Analytics View */}
      {viewMode === "analytics" && (
        <div className="space-y-4">
          {!selectedLabForAnalytics ? (
            <Card>
              <CardHeader>
                <CardTitle>Select a Lab to View Analytics</CardTitle>
                <CardDescription>Choose a lab from the list below to see detailed test statistics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {labs.map((lab) => (
                    <div
                      key={lab.id}
                      className="p-4 border rounded-lg cursor-pointer hover:bg-muted transition-colors"
                      onClick={() => setSelectedLabForAnalytics(lab)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold">{lab.name}</p>
                          <p className="text-sm text-muted-foreground">Code: {lab.lab_code}</p>
                        </div>
                        <Badge variant={lab.is_active ? "default" : "secondary"}>
                          {lab.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Button variant="outline" onClick={() => setSelectedLabForAnalytics(null)}>
                  ← Back to Lab List
                </Button>
              </div>
              <LabAnalytics
                labId={selectedLabForAnalytics.id}
                labName={selectedLabForAnalytics.name}
                labCode={selectedLabForAnalytics.lab_code}
              />
            </div>
          )}
        </div>
      )}

      {/* Management View */}
      {viewMode === "management" && (
        <>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Building2 className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{labs.length}</p>
                <p className="text-xs text-muted-foreground">Total Labs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <Building2 className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{mainLabs.length}</p>
                <p className="text-xs text-muted-foreground">Main Labs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-100">
                <Building2 className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{branches.length}</p>
                <p className="text-xs text-muted-foreground">Branches</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <Users className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{labs.filter((l) => l.is_active).length}</p>
                <p className="text-xs text-muted-foreground">Active Labs</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="inactive">Inactive</TabsTrigger>
            <TabsTrigger value="branches">Branches</TabsTrigger>
          </TabsList>

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Label htmlFor="lab-search" className="sr-only">
              Search labs
            </Label>
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="lab-search"
              name="lab_search"
              placeholder="Search labs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              autoComplete="off"
            />
          </div>
        </div>

        {/* Labs Table */}
        <TabsContent value={activeTab} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Labs</CardTitle>
              <CardDescription>Manage all labs and branches</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : filteredLabs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No labs found. Create your first lab!
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Parent Lab</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLabs.map((lab) => (
                      <TableRow key={lab.id}>
                        <TableCell className="font-mono font-medium">{lab.lab_code}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium">{lab.name}</p>
                            {getLabAbdmSettings(lab).facilityId && (
                              <Badge variant="outline" className="text-xs">
                                ABDM {getLabAbdmSettings(lab).enabled ? "Enabled" : "Mapped"}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{getTypeBadge(lab.type)}</TableCell>
                        <TableCell>
                          {lab.parent_lab && lab.parent_lab.length > 0 ? (
                            <span className="text-sm">{lab.parent_lab[0].name}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {lab.city && lab.state ? (
                            <div className="text-sm">
                              <p>{lab.city}</p>
                              <p className="text-xs text-muted-foreground">{lab.state}</p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-sm">
                            {lab.phone && (
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {lab.phone}
                              </div>
                            )}
                            {lab.email && (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Mail className="h-3 w-3" />
                                {lab.email}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={lab.is_active ? "default" : "secondary"}>
                            {lab.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(lab)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setLabToDelete(lab.id);
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
      </Tabs>
        </>
      )}

      {/* Add/Edit Lab Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{editingLab ? "Edit Lab" : "Create Lab"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto max-h-[calc(90vh-150px)] pr-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="lab_code">Lab Code *</Label>
                <Input
                  id="lab_code"
                  name="lab_code"
                  value={labForm.lab_code}
                  onChange={(e) => setLabForm({ ...labForm, lab_code: e.target.value })}
                  placeholder="LAB001"
                  disabled={!!editingLab}
                  autoComplete="off"
                />
              </div>
              <div>
                <Label htmlFor="name">Lab Name *</Label>
                <Input
                  id="name"
                  name="name"
                  value={labForm.name}
                  onChange={(e) => setLabForm({ ...labForm, name: e.target.value })}
                  placeholder="Main Laboratory"
                  autoComplete="organization"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="type">Type *</Label>
                <Select
                  name="type"
                  value={labForm.type}
                  onValueChange={(value) => setLabForm({ ...labForm, type: value as any })}
                >
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="main">Main Lab</SelectItem>
                    <SelectItem value="branch">Branch</SelectItem>
                    <SelectItem value="collection_center">Collection Center</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {labForm.type !== "main" && (
                <div>
                  <Label htmlFor="parent_lab">Parent Lab</Label>
                  <Select
                    name="parent_lab"
                    value={labForm.parent_lab_id}
                    onValueChange={(value) => setLabForm({ ...labForm, parent_lab_id: value })}
                  >
                    <SelectTrigger id="parent_lab">
                      <SelectValue placeholder="Select parent lab" />
                    </SelectTrigger>
                    <SelectContent>
                      {mainLabs
                        .filter((lab) => orgScopedAvailableLabs.some((availableLab) => availableLab.id === lab.id))
                        .map((lab) => (
                        <SelectItem key={lab.id} value={lab.id}>
                          {lab.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                name="address"
                value={labForm.address}
                onChange={(e) => setLabForm({ ...labForm, address: e.target.value })}
                placeholder="Full address..."
                rows={2}
                autoComplete="street-address"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  name="city"
                  value={labForm.city}
                  onChange={(e) => setLabForm({ ...labForm, city: e.target.value })}
                  placeholder="City"
                  autoComplete="address-level2"
                />
              </div>
              <div>
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  name="state"
                  value={labForm.state}
                  onChange={(e) => setLabForm({ ...labForm, state: e.target.value })}
                  placeholder="State"
                  autoComplete="address-level1"
                />
              </div>
              <div>
                <Label htmlFor="pincode">Pincode</Label>
                <Input
                  id="pincode"
                  name="pincode"
                  value={labForm.pincode}
                  onChange={(e) => setLabForm({ ...labForm, pincode: e.target.value })}
                  placeholder="Pincode"
                  autoComplete="postal-code"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  name="phone"
                  value={labForm.phone}
                  onChange={(e) => setLabForm({ ...labForm, phone: e.target.value })}
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
                  value={labForm.email}
                  onChange={(e) => setLabForm({ ...labForm, email: e.target.value })}
                  placeholder="lab@example.com"
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4 space-y-4">
              <div>
                <h3 className="font-medium text-slate-900">ABDM For This Lab</h3>
                <p className="text-sm text-muted-foreground">
                  Keep ABDM login and gateway settings at the organization level. Use this section only to map the facility/HFR ID for this lab.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="lab_abdm_enabled">ABDM Enabled</Label>
                  <Select
                    value={labForm.abdm_enabled ? "true" : "false"}
                    onValueChange={(value) =>
                      setLabForm({ ...labForm, abdm_enabled: value === "true" })
                    }
                  >
                    <SelectTrigger id="lab_abdm_enabled">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Enabled</SelectItem>
                      <SelectItem value="false">Disabled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="lab_abdm_facility_id">Facility / HFR ID</Label>
                  <Input
                    id="lab_abdm_facility_id"
                    value={labForm.abdm_facility_id}
                    onChange={(e) => setLabForm({ ...labForm, abdm_facility_id: e.target.value })}
                    placeholder="IN07..."
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={labForm.is_active}
                onChange={(e) => setLabForm({ ...labForm, is_active: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="is_active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveLab}>
              <Save className="h-4 w-4 mr-2" />
              {editingLab ? "Update" : "Create"} Lab
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lab</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this lab? This action cannot be undone. All associated data will be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteLab} className="bg-red-500 hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ManageLabs;
