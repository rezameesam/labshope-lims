import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, Shield, Search, Users, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription,
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface CustomRole {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_system_role: boolean;
  created_at: string;
  updated_at: string;
  permission_count?: number;
  user_count?: number;
}

type PermissionType = 
  | 'view_patients' | 'create_patients' | 'edit_patients' | 'delete_patients'
  | 'view_tests' | 'create_tests' | 'edit_tests' | 'delete_tests' | 'enter_test_results' | 'view_test_results'
  | 'view_billing' | 'create_invoices' | 'edit_invoices' | 'delete_invoices' | 'process_payments' | 'view_financial_reports'
  | 'view_inventory' | 'manage_inventory' | 'view_inventory_alerts'
  | 'view_employees' | 'create_employees' | 'edit_employees' | 'delete_employees' | 'manage_roles'
  | 'view_test_catalog' | 'manage_test_catalog'
  | 'view_test_packages' | 'manage_test_packages'
  | 'view_doctors' | 'manage_doctors'
  | 'view_reminders' | 'manage_reminders'
  | 'view_reports' | 'export_reports'
  | 'view_labs' | 'manage_labs' | 'view_collection_centers' | 'manage_collection_centers'
  | 'manage_settings' | 'view_audit_logs';

const PERMISSION_GROUPS = {
  'Patient Management': ['view_patients', 'create_patients', 'edit_patients', 'delete_patients'] as PermissionType[],
  'Test Management': ['view_tests', 'create_tests', 'edit_tests', 'delete_tests', 'enter_test_results', 'view_test_results'] as PermissionType[],
  'Billing & Finance': ['view_billing', 'create_invoices', 'edit_invoices', 'delete_invoices', 'process_payments', 'view_financial_reports'] as PermissionType[],
  'Inventory': ['view_inventory', 'manage_inventory', 'view_inventory_alerts'] as PermissionType[],
  'Employee Management': ['view_employees', 'create_employees', 'edit_employees', 'delete_employees', 'manage_roles'] as PermissionType[],
  'Test Catalog': ['view_test_catalog', 'manage_test_catalog'] as PermissionType[],
  'Test Packages': ['view_test_packages', 'manage_test_packages'] as PermissionType[],
  'Doctors': ['view_doctors', 'manage_doctors'] as PermissionType[],
  'Reminders': ['view_reminders', 'manage_reminders'] as PermissionType[],
  'Reports & Analytics': ['view_reports', 'export_reports'] as PermissionType[],
  'Labs & Centers': ['view_labs', 'manage_labs', 'view_collection_centers', 'manage_collection_centers'] as PermissionType[],
  'System': ['manage_settings', 'view_audit_logs'] as PermissionType[],
};

const PERMISSION_LABELS: Record<PermissionType, string> = {
  view_patients: 'View Patients',
  create_patients: 'Create Patients',
  edit_patients: 'Edit Patients',
  delete_patients: 'Delete Patients',
  view_tests: 'View Tests',
  create_tests: 'Create Tests',
  edit_tests: 'Edit Tests',
  delete_tests: 'Delete Tests',
  enter_test_results: 'Enter Test Results',
  view_test_results: 'View Test Results',
  view_billing: 'View Billing',
  create_invoices: 'Create Invoices',
  edit_invoices: 'Edit Invoices',
  delete_invoices: 'Delete Invoices',
  process_payments: 'Process Payments',
  view_financial_reports: 'View Financial Reports',
  view_inventory: 'View Inventory',
  manage_inventory: 'Manage Inventory',
  view_inventory_alerts: 'View Inventory Alerts',
  view_employees: 'View Employees',
  create_employees: 'Create Employees',
  edit_employees: 'Edit Employees',
  delete_employees: 'Delete Employees',
  manage_roles: 'Manage Roles',
  view_test_catalog: 'View Test Catalog',
  manage_test_catalog: 'Manage Test Catalog',
  view_test_packages: 'View Test Packages',
  manage_test_packages: 'Manage Test Packages',
  view_doctors: 'View Doctors',
  manage_doctors: 'Manage Doctors',
  view_reminders: 'View Reminders',
  manage_reminders: 'Manage Reminders',
  view_reports: 'View Reports',
  export_reports: 'Export Reports',
  view_labs: 'View Labs',
  manage_labs: 'Manage Labs',
  view_collection_centers: 'View Collection Centers',
  manage_collection_centers: 'Manage Collection Centers',
  manage_settings: 'Manage Settings',
  view_audit_logs: 'View Audit Logs',
};

const ManageRoles = () => {
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<CustomRole | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<PermissionType>>(new Set());
  const [roleForm, setRoleForm] = useState({
    name: "",
    description: "",
    is_active: true,
  });

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    try {
      setLoading(true);
      
      // Fetch roles
      const { data: rolesData, error: rolesError } = await supabase
        .from("custom_roles")
        .select("*")
        .order("created_at", { ascending: false });

      if (rolesError) throw rolesError;

      // Fetch permission counts and user counts for each role
      const rolesWithCounts = await Promise.all(
        (rolesData || []).map(async (role) => {
          const [permissionsRes, usersRes] = await Promise.all([
            supabase
              .from("role_permissions")
              .select("id", { count: "exact", head: true })
              .eq("role_id", role.id),
            supabase
              .from("user_custom_roles")
              .select("id", { count: "exact", head: true })
              .eq("role_id", role.id),
          ]);

          return {
            ...role,
            permission_count: permissionsRes.count || 0,
            user_count: usersRes.count || 0,
          };
        })
      );

      setRoles(rolesWithCounts);
    } catch (error) {
      console.error("Error fetching roles:", error);
      toast.error("Failed to fetch roles");
    } finally {
      setLoading(false);
    }
  };

  const fetchRolePermissions = async (roleId: string) => {
    try {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("permission")
        .eq("role_id", roleId);

      if (error) throw error;

      return new Set((data || []).map((p) => p.permission as PermissionType));
    } catch (error) {
      console.error("Error fetching role permissions:", error);
      return new Set<PermissionType>();
    }
  };

  const openEditDialog = async (role: CustomRole) => {
    setSelectedRole(role);
    setRoleForm({
      name: role.name,
      description: role.description || "",
      is_active: role.is_active,
    });
    
    const permissions = await fetchRolePermissions(role.id);
    setSelectedPermissions(permissions);
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    setSelectedRole(null);
    setRoleForm({
      name: "",
      description: "",
      is_active: true,
    });
    setSelectedPermissions(new Set());
    setIsDialogOpen(true);
  };

  const handleSaveRole = async () => {
    if (!roleForm.name.trim()) {
      toast.error("Role name is required");
      return;
    }

    try {
      if (selectedRole) {
        // Update existing role
        const { error: updateError } = await supabase
          .from("custom_roles")
          .update({
            name: roleForm.name,
            description: roleForm.description || null,
            is_active: roleForm.is_active,
          })
          .eq("id", selectedRole.id);

        if (updateError) throw updateError;

        // Update permissions
        const { data: existingPermissions } = await supabase
          .from("role_permissions")
          .select("permission")
          .eq("role_id", selectedRole.id);

        const existingSet = new Set((existingPermissions || []).map((p) => p.permission));

        // Remove permissions that are no longer selected
        const toRemove = Array.from(existingSet).filter((p) => !selectedPermissions.has(p));
        if (toRemove.length > 0) {
          await supabase
            .from("role_permissions")
            .delete()
            .eq("role_id", selectedRole.id)
            .in("permission", toRemove);
        }

        // Add new permissions
        const toAdd = Array.from(selectedPermissions).filter((p) => !existingSet.has(p));
        if (toAdd.length > 0) {
          await supabase
            .from("role_permissions")
            .insert(
              toAdd.map((permission) => ({
                role_id: selectedRole.id,
                permission,
              }))
            );
        }

        toast.success("Role updated successfully");
      } else {
        // Create new role
        const { data: newRole, error: createError } = await supabase
          .from("custom_roles")
          .insert({
            name: roleForm.name,
            description: roleForm.description || null,
            is_active: roleForm.is_active,
          })
          .select()
          .single();

        if (createError) throw createError;

        // Add permissions
        if (selectedPermissions.size > 0) {
          await supabase
            .from("role_permissions")
            .insert(
              Array.from(selectedPermissions).map((permission) => ({
                role_id: newRole.id,
                permission,
              }))
            );
        }

        toast.success("Role created successfully");
      }

      setIsDialogOpen(false);
      fetchRoles();
    } catch (error: any) {
      console.error("Error saving role:", error);
      toast.error(error.message || "Failed to save role");
    }
  };

  const handleDelete = async () => {
    if (!selectedRole) return;

    if (selectedRole.is_system_role) {
      toast.error("System roles cannot be deleted");
      return;
    }

    try {
      const { error } = await supabase
        .from("custom_roles")
        .delete()
        .eq("id", selectedRole.id);

      if (error) throw error;

      toast.success("Role deleted successfully");
      setIsDeleteDialogOpen(false);
      setSelectedRole(null);
      fetchRoles();
    } catch (error: any) {
      console.error("Error deleting role:", error);
      toast.error(error.message || "Failed to delete role");
    }
  };

  const togglePermission = (permission: PermissionType) => {
    const newSet = new Set(selectedPermissions);
    if (newSet.has(permission)) {
      newSet.delete(permission);
    } else {
      newSet.add(permission);
    }
    setSelectedPermissions(newSet);
  };

  const toggleAllInGroup = (groupPermissions: PermissionType[]) => {
    const allSelected = groupPermissions.every((p) => selectedPermissions.has(p));
    const newSet = new Set(selectedPermissions);
    
    if (allSelected) {
      groupPermissions.forEach((p) => newSet.delete(p));
    } else {
      groupPermissions.forEach((p) => newSet.add(p));
    }
    
    setSelectedPermissions(newSet);
  };

  const filteredRoles = roles.filter((role) =>
    role.name.toLowerCase().includes(search.toLowerCase()) ||
    (role.description && role.description.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) {
    return <div className="text-center py-8">Loading roles...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
        <div>
          <h2 className="text-2xl font-heading font-bold text-clinical-navy">Role Management</h2>
          <p className="text-muted-foreground">Create and manage custom roles with granular permissions</p>
        </div>
        <Button onClick={openCreateDialog} className="bg-clinical-navy hover:bg-clinical-navy/90">
          <Plus className="h-4 w-4 mr-2" />
          Create Role
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search roles..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Roles Table */}
      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle>Custom Roles</CardTitle>
          <CardDescription>
            Manage roles and their permissions. System roles (admin, employee, etc.) cannot be modified.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRoles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No roles found
                  </TableCell>
                </TableRow>
              ) : (
                filteredRoles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        {role.name}
                        {role.is_system_role && (
                          <Badge variant="outline" className="text-xs">System</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-md truncate">
                      {role.description || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{role.permission_count || 0} permissions</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{role.user_count || 0} users</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          role.is_active
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                            : "bg-red-100 text-red-700 hover:bg-red-100"
                        }
                      >
                        {role.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(role)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        {!role.is_system_role && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedRole(role);
                              setIsDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Role Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {selectedRole ? "Edit Role" : "Create New Role"}
            </DialogTitle>
            <DialogDescription>
              {selectedRole
                ? "Update role details and permissions"
                : "Create a new role and assign specific permissions"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Role Name *</Label>
                <Input
                  id="name"
                  value={roleForm.name}
                  onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                  placeholder="e.g., Lab Technician, Billing Staff, Receptionist"
                  disabled={selectedRole?.is_system_role}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="is_active">Status</Label>
                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox
                    id="is_active"
                    checked={roleForm.is_active}
                    onCheckedChange={(checked) =>
                      setRoleForm({ ...roleForm, is_active: checked as boolean })
                    }
                  />
                  <Label htmlFor="is_active" className="font-normal cursor-pointer">
                    Active
                  </Label>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={roleForm.description}
                onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                placeholder="e.g., Handles patient registration, test scheduling, and front desk operations"
                rows={3}
              />
            </div>

            <div className="space-y-2 flex-1 overflow-hidden flex flex-col min-h-0">
              <div className="flex items-center justify-between">
                <Label>Permissions *</Label>
                <Badge variant="secondary">
                  {selectedPermissions.size} selected
                </Badge>
              </div>
              <ScrollArea className="h-[600px] border rounded-lg p-4">
                <div className="space-y-6">
                  {Object.entries(PERMISSION_GROUPS).map(([groupName, permissions]) => {
                    const allSelected = permissions.every((p) => selectedPermissions.has(p));
                    const someSelected = permissions.some((p) => selectedPermissions.has(p));

                    return (
                      <div key={groupName} className="space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b">
                          <h4 className="font-semibold text-sm">{groupName}</h4>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => toggleAllInGroup(permissions)}
                          >
                            {allSelected ? "Deselect All" : "Select All"}
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {permissions.map((permission) => (
                            <div
                              key={permission}
                              className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted/50"
                            >
                              <Checkbox
                                id={permission}
                                checked={selectedPermissions.has(permission)}
                                onCheckedChange={() => togglePermission(permission)}
                              />
                              <Label
                                htmlFor={permission}
                                className="text-sm font-normal cursor-pointer flex-1"
                              >
                                {PERMISSION_LABELS[permission]}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveRole} className="bg-clinical-navy hover:bg-clinical-navy/90">
              {selectedRole ? "Update Role" : "Create Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Role</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the role "{selectedRole?.name}"? This action cannot be undone.
              Users with this role will lose their permissions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ManageRoles;


