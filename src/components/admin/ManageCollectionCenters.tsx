import { useState, useEffect } from "react";
import {
  MapPin,
  Plus,
  Edit,
  Trash2,
  Save,
  Search,
  Building2,
  Phone,
  Mail,
  User,
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useLab } from "@/contexts/LabContext";
import { useAuth } from "@/hooks/useAuth";
import CollectionCenterAnalytics from "@/components/admin/CollectionCenterAnalytics";
import { BarChart3, Settings } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface CollectionCenter {
  id: string;
  lab_id: string;
  code: string;
  name: string;
  address: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  lab?: {
    id: string;
    name: string;
    lab_code: string;
  };
}

const ManageCollectionCenters = () => {
  const { hasRole } = useAuth();
  const { currentLab, availableLabs, isLabAdmin } = useLab();
  const [centers, setCenters] = useState<CollectionCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"management" | "analytics">("management");
  const [selectedCenterForAnalytics, setSelectedCenterForAnalytics] = useState<CollectionCenter | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [centerToDelete, setCenterToDelete] = useState<string | null>(null);
  const [editingCenter, setEditingCenter] = useState<CollectionCenter | null>(null);

  const [centerForm, setCenterForm] = useState({
    lab_id: currentLab?.id || "",
    code: "",
    name: "",
    address: "",
    contact_person: "",
    phone: "",
    email: "",
    is_active: true,
  });

  useEffect(() => {
    if (currentLab || hasRole("admin")) {
      fetchCenters();
    }
  }, [currentLab]);

  const fetchCenters = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("collection_centers")
        .select(`
          *,
          lab:labs(id, name, lab_code)
        `)
        .order("name");

      // If not admin, filter by current lab
      if (!hasRole("admin") && currentLab) {
        query = query.eq("lab_id", currentLab.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setCenters(data || []);
    } catch (error) {
      console.error("Error fetching collection centers:", error);
      toast.error("Failed to load collection centers");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setCenterForm({
      lab_id: currentLab?.id || "",
      code: "",
      name: "",
      address: "",
      contact_person: "",
      phone: "",
      email: "",
      is_active: true,
    });
    setEditingCenter(null);
  };

  const openEditDialog = (center: CollectionCenter) => {
    setEditingCenter(center);
    setCenterForm({
      lab_id: center.lab_id,
      code: center.code,
      name: center.name,
      address: center.address || "",
      contact_person: center.contact_person || "",
      phone: center.phone || "",
      email: center.email || "",
      is_active: center.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleSaveCenter = async () => {
    if (!centerForm.lab_id || !centerForm.code.trim() || !centerForm.name.trim()) {
      toast.error("Lab, code, and name are required");
      return;
    }

    // Check permissions
    if (!hasRole("admin") && !isLabAdmin(centerForm.lab_id)) {
      toast.error("You don't have permission to manage this lab's collection centers");
      return;
    }

    try {
      const centerData = {
        lab_id: centerForm.lab_id,
        code: centerForm.code.trim().toUpperCase(),
        name: centerForm.name.trim(),
        address: centerForm.address.trim() || null,
        contact_person: centerForm.contact_person.trim() || null,
        phone: centerForm.phone.trim() || null,
        email: centerForm.email.trim() || null,
        is_active: centerForm.is_active,
      };

      if (editingCenter) {
        const { error } = await supabase
          .from("collection_centers")
          .update(centerData)
          .eq("id", editingCenter.id);

        if (error) throw error;
        toast.success("Collection center updated successfully");
      } else {
        const { error } = await supabase.from("collection_centers").insert(centerData);

        if (error) throw error;
        toast.success("Collection center created successfully");
      }

      setIsDialogOpen(false);
      resetForm();
      fetchCenters();
    } catch (error: any) {
      console.error("Error saving collection center:", error);
      if (error.code === "23505") {
        toast.error("Collection center code already exists for this lab");
      } else {
        toast.error("Failed to save collection center");
      }
    }
  };

  const handleDeleteCenter = async () => {
    if (!centerToDelete) return;

    try {
      const { error } = await supabase
        .from("collection_centers")
        .delete()
        .eq("id", centerToDelete);

      if (error) throw error;

      toast.success("Collection center deleted successfully");
      setIsDeleteDialogOpen(false);
      setCenterToDelete(null);
      fetchCenters();
    } catch (error) {
      console.error("Error deleting collection center:", error);
      toast.error("Failed to delete collection center");
    }
  };

  const filteredCenters = centers.filter((center) =>
    center.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    center.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const accessibleLabs = hasRole("admin")
    ? availableLabs
    : availableLabs.filter((lab) => isLabAdmin(lab.id));

  if (!currentLab && !hasRole("admin")) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Please select a lab to manage collection centers
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-clinical-navy">Collection Centers</h2>
          <p className="text-muted-foreground">Manage sample collection centers</p>
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
          {viewMode === "management" && accessibleLabs.length > 0 && (
            <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Collection Center
            </Button>
          )}
        </div>
      </div>

      {/* Analytics View */}
      {viewMode === "analytics" && (
        <div className="space-y-4">
          {!selectedCenterForAnalytics ? (
            <Card>
              <CardHeader>
                <CardTitle>Select a Collection Center to View Analytics</CardTitle>
                <CardDescription>Choose a collection center from the list below to see detailed test statistics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {filteredCenters.map((center) => (
                    <div
                      key={center.id}
                      className="p-4 border rounded-lg cursor-pointer hover:bg-muted transition-colors"
                      onClick={() => setSelectedCenterForAnalytics(center)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold">{center.name}</p>
                          <p className="text-sm text-muted-foreground">Code: {center.code}</p>
                          {center.lab && (
                            <p className="text-xs text-muted-foreground">Lab: {center.lab.name}</p>
                          )}
                        </div>
                        <Badge variant={center.is_active ? "default" : "secondary"}>
                          {center.is_active ? "Active" : "Inactive"}
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
                <Button variant="outline" onClick={() => setSelectedCenterForAnalytics(null)}>
                  ← Back to Center List
                </Button>
              </div>
              <CollectionCenterAnalytics
                centerId={selectedCenterForAnalytics.id}
                centerName={selectedCenterForAnalytics.name}
                centerCode={selectedCenterForAnalytics.code}
              />
            </div>
          )}
        </div>
      )}

      {/* Management View */}
      {viewMode === "management" && (
        <>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search collection centers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Centers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Collection Centers</CardTitle>
          <CardDescription>Manage sample collection locations</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filteredCenters.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No collection centers found. Create your first collection center!
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  {hasRole("admin") && <TableHead>Lab</TableHead>}
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact Person</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCenters.map((center) => (
                  <TableRow key={center.id}>
                    {hasRole("admin") && (
                      <TableCell>
                        <div>
                          <p className="font-medium">{center.lab?.name}</p>
                          <p className="text-xs text-muted-foreground">{center.lab?.lab_code}</p>
                        </div>
                      </TableCell>
                    )}
                    <TableCell className="font-mono font-medium">{center.code}</TableCell>
                    <TableCell className="font-medium">{center.name}</TableCell>
                    <TableCell>
                      {center.contact_person ? (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {center.contact_person}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        {center.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {center.phone}
                          </div>
                        )}
                        {center.email && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {center.email}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {center.address ? (
                        <div className="text-sm max-w-xs truncate">{center.address}</div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={center.is_active ? "default" : "secondary"}>
                        {center.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {(hasRole("admin") || isLabAdmin(center.lab_id)) && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(center)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setCenterToDelete(center.id);
                                setIsDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Center Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingCenter ? "Edit Collection Center" : "Create Collection Center"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {hasRole("admin") && (
              <div>
                <Label htmlFor="lab_id">Lab *</Label>
                <Select
                  value={centerForm.lab_id}
                  onValueChange={(value) => setCenterForm({ ...centerForm, lab_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select lab" />
                  </SelectTrigger>
                  <SelectContent>
                    {accessibleLabs.map((lab) => (
                      <SelectItem key={lab.id} value={lab.id}>
                        {lab.name} ({lab.lab_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="code">Center Code *</Label>
                <Input
                  id="code"
                  value={centerForm.code}
                  onChange={(e) => setCenterForm({ ...centerForm, code: e.target.value })}
                  placeholder="CC001"
                  disabled={!!editingCenter}
                />
              </div>
              <div>
                <Label htmlFor="name">Center Name *</Label>
                <Input
                  id="name"
                  value={centerForm.name}
                  onChange={(e) => setCenterForm({ ...centerForm, name: e.target.value })}
                  placeholder="Collection Center Name"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={centerForm.address}
                onChange={(e) => setCenterForm({ ...centerForm, address: e.target.value })}
                placeholder="Full address..."
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="contact_person">Contact Person</Label>
              <Input
                id="contact_person"
                value={centerForm.contact_person}
                onChange={(e) => setCenterForm({ ...centerForm, contact_person: e.target.value })}
                placeholder="Contact person name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={centerForm.phone}
                  onChange={(e) => setCenterForm({ ...centerForm, phone: e.target.value })}
                  placeholder="+91-1234567890"
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={centerForm.email}
                  onChange={(e) => setCenterForm({ ...centerForm, email: e.target.value })}
                  placeholder="center@example.com"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={centerForm.is_active}
                onChange={(e) => setCenterForm({ ...centerForm, is_active: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="is_active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveCenter}>
              <Save className="h-4 w-4 mr-2" />
              {editingCenter ? "Update" : "Create"} Center
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Collection Center</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this collection center? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCenter} className="bg-red-500 hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </>
      )}
    </div>
  );
};

export default ManageCollectionCenters;

