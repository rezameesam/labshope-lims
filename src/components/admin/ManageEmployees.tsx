import { useState, useEffect } from "react";
import { Plus, Search, Edit2, Trash2, Eye, EyeOff, User, Mail, Phone, Building, Shield, MoreHorizontal, UserX, UserCheck, FlaskConical, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface Employee {
  id: string;
  user_id: string;
  employee_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  designation: string | null;
  department: string | null;
  is_active: boolean;
  created_at: string;
  role?: string;
}

const ManageEmployees = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [filterRole, setFilterRole] = useState<"all" | "admin" | "employee" | "collector">("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    password: "",
    phone: "",
    designation: "",
    department: "",
    role: "employee" as "admin" | "employee" | "collector",
  });
  const [editFormData, setEditFormData] = useState({
    full_name: "",
    phone: "",
    designation: "",
    department: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customRoles, setCustomRoles] = useState<Array<{ id: string; name: string; description: string | null }>>([]);
  const [employeeCustomRoles, setEmployeeCustomRoles] = useState<Set<string>>(new Set());
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [isAssigningRoles, setIsAssigningRoles] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [customResetPassword, setCustomResetPassword] = useState("");

  const fetchEmployees = async () => {
    try {
      // Fetch employees with their roles
      const { data: employeesData, error: employeesError } = await supabase
        .from("employees")
        .select("*")
        .order("created_at", { ascending: false });

      if (employeesError) throw employeesError;

      // Fetch roles for all employees
      const userIds = employeesData?.map(e => e.user_id) || [];
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);

      if (rolesError) throw rolesError;

      // Combine employees with their roles
      const employeesWithRoles = employeesData?.map(emp => ({
        ...emp,
        role: rolesData?.find(r => r.user_id === emp.user_id)?.role || 'employee'
      })) || [];

      setEmployees(employeesWithRoles);
    } catch (error) {
      console.error("Error fetching employees:", error);
      toast.error("Failed to fetch employees");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
    fetchCustomRoles(); // Fetch custom roles on component mount
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("You must be logged in to add employees");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-employee`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            full_name: formData.full_name,
            phone: formData.phone || null,
            designation: formData.designation || null,
            department: formData.department || null,
            role: formData.role,
          }),
        }
      );

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || "Failed to create employee");
      }

      toast.success(`Employee ${formData.full_name} added successfully`);
      setIsDialogOpen(false);
      resetForm();
      fetchEmployees();
    } catch (error: any) {
      console.error("Error adding employee:", error);
      toast.error(error.message || "Failed to add employee");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from("employees")
        .update({
          full_name: editFormData.full_name,
          phone: editFormData.phone || null,
          designation: editFormData.designation || null,
          department: editFormData.department || null,
        })
        .eq("id", selectedEmployee.id);

      if (error) throw error;

      toast.success("Employee updated successfully");
      setIsEditDialogOpen(false);
      setSelectedEmployee(null);
      fetchEmployees();
    } catch (error: any) {
      console.error("Error updating employee:", error);
      toast.error(error.message || "Failed to update employee");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedEmployee) return;
    setIsSubmitting(true);

    try {
      // Deactivate instead of hard delete to maintain data integrity
      const { error } = await supabase
        .from("employees")
        .update({ is_active: false })
        .eq("id", selectedEmployee.id);

      if (error) throw error;

      toast.success("Employee deactivated successfully");
      setIsDeleteDialogOpen(false);
      setSelectedEmployee(null);
      fetchEmployees();
    } catch (error: any) {
      console.error("Error deactivating employee:", error);
      toast.error(error.message || "Failed to deactivate employee");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleEmployeeStatus = async (employee: Employee) => {
    try {
      const { error } = await supabase
        .from("employees")
        .update({ is_active: !employee.is_active })
        .eq("id", employee.id);

      if (error) throw error;
      
      toast.success(
        `Employee ${employee.is_active ? "deactivated" : "activated"} successfully`
      );
      fetchEmployees();
    } catch (error) {
      console.error("Error updating employee:", error);
      toast.error("Failed to update employee status");
    }
  };

  const resetForm = () => {
    setFormData({
      full_name: "",
      email: "",
      password: "",
      phone: "",
      designation: "",
      department: "",
      role: "employee",
    });
  };

  const openEditDialog = (employee: Employee) => {
    setSelectedEmployee(employee);
    setEditFormData({
      full_name: employee.full_name,
      phone: employee.phone || "",
      designation: employee.designation || "",
      department: employee.department || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleAdminResetPassword = async (mode: "email" | "temp" | "set") => {
    if (!selectedEmployee) return;
    if (mode === "set" && customResetPassword.length < 6) {
      toast.error("Custom password must be at least 6 characters");
      return;
    }

    setResetLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("You must be signed in.");
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/employee-admin-reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          employee_id: selectedEmployee.id,
          reset_base_url: `${window.location.origin}/staff/reset-password`,
          mode,
          ...(mode === "set" ? { custom_password: customResetPassword } : {}),
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to reset password");
      }

      if (mode === "temp") {
        toast.success(`Temporary password: ${result.temp_password}`);
      } else if (mode === "set") {
        toast.success("Custom password set successfully");
      } else {
        toast.success("Reset link sent to employee email");
      }
      setCustomResetPassword("");
      setIsResetDialogOpen(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to reset password");
    } finally {
      setResetLoading(false);
    }
  };

  const fetchCustomRoles = async () => {
    try {
      const { data: rolesData, error: rolesError } = await supabase
        .from("custom_roles")
        .select("id, name, description")
        .eq("is_active", true)
        .order("name");

      if (rolesError) throw rolesError;
      setCustomRoles(rolesData || []);
    } catch (error) {
      console.error("Error fetching custom roles:", error);
      setCustomRoles([]);
    }
  };

  const openEmployeeDetails = async (employee: Employee) => {
    setSelectedEmployee(employee);
    setIsSheetOpen(true);
    
    // Fetch custom roles and employee's assigned roles
    try {
      // Fetch all custom roles
      await fetchCustomRoles();

      // Fetch employee's assigned custom roles
      const { data: userRolesData, error: userRolesError } = await supabase
        .from("user_custom_roles")
        .select("role_id")
        .eq("user_id", employee.user_id);

      if (userRolesError) throw userRolesError;
      setEmployeeCustomRoles(new Set((userRolesData || []).map(r => r.role_id)));
    } catch (error) {
      console.error("Error fetching employee roles:", error);
      setEmployeeCustomRoles(new Set());
    }
  };

  const getRoleBadge = (role: string) => {
    if (role === "admin") {
      return <Badge className="bg-violet-100 text-violet-700 hover:bg-violet-100">Admin</Badge>;
    }
    if (role === "collector") {
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Collector</Badge>;
    }
    return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Employee</Badge>;
  };

  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch = 
      emp.full_name.toLowerCase().includes(search.toLowerCase()) ||
      emp.email.toLowerCase().includes(search.toLowerCase()) ||
      emp.employee_id.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = 
      filterStatus === "all" ||
      (filterStatus === "active" && emp.is_active) ||
      (filterStatus === "inactive" && !emp.is_active);

    const matchesRole = 
      filterRole === "all" ||
      emp.role === filterRole;

    return matchesSearch && matchesStatus && matchesRole;
  });

  const adminCount = employees.filter(e => e.role === "admin").length;
  const collectorCount = employees.filter(e => e.role === "collector").length;
  const activeCount = employees.filter(e => e.is_active).length;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <User className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{employees.length}</p>
                <p className="text-xs text-muted-foreground">Total Staff</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <UserCheck className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeCount}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-100">
                <Shield className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{adminCount}</p>
                <p className="text-xs text-muted-foreground">Administrators</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <FlaskConical className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{collectorCount}</p>
                <p className="text-xs text-muted-foreground">Collectors</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
        <div className="flex flex-col sm:flex-row gap-4 flex-1">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 w-full sm:w-80"
            />
          </div>
          <Tabs value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)} className="w-auto">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="inactive">Inactive</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={filterRole} onValueChange={(v) => setFilterRole(v as any)}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      <SelectItem value="admin">Admins</SelectItem>
                      <SelectItem value="employee">Employees</SelectItem>
                      <SelectItem value="collector">Collectors</SelectItem>
                    </SelectContent>
          </Select>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-clinical-navy hover:bg-clinical-navy/90">
              <Plus className="h-4 w-4 mr-2" />
              Add Employee
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add New Employee</DialogTitle>
              <DialogDescription>
                Create a new employee account with login credentials
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="full_name">Full Name *</Label>
                  <Input
                    id="full_name"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    required
                    placeholder="Enter full name"
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    placeholder="employee@irmclinic.com"
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="password">Password *</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                      minLength={6}
                      placeholder="Minimum 6 characters"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="Phone number"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">Role *</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value: "admin" | "employee" | "collector") =>
                      setFormData({ ...formData, role: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">Employee</SelectItem>
                      <SelectItem value="admin">Administrator</SelectItem>
                      <SelectItem value="collector">Sample Collector</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="designation">Designation</Label>
                  <Input
                    id="designation"
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    placeholder="e.g. Lab Technician"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    placeholder="e.g. Pathology"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-clinical-navy hover:bg-clinical-navy/90"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Creating..." : "Create Employee"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Employees Table */}
      <Card className="border-0 shadow-md">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">Employee</TableHead>
              <TableHead className="font-semibold">Contact</TableHead>
              <TableHead className="font-semibold">Department</TableHead>
              <TableHead className="font-semibold">Role</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="text-right font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                    Loading employees...
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredEmployees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  No employees found
                </TableCell>
              </TableRow>
            ) : (
              filteredEmployees.map((employee) => (
                <TableRow key={employee.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{employee.full_name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{employee.employee_id}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        {employee.email}
                      </div>
                      {employee.phone && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {employee.phone}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {employee.department ? (
                      <div className="flex items-center gap-1.5">
                        <Building className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{employee.department}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                    {employee.designation && (
                      <p className="text-xs text-muted-foreground mt-0.5">{employee.designation}</p>
                    )}
                  </TableCell>
                  <TableCell>{getRoleBadge(employee.role || 'employee')}</TableCell>
                  <TableCell>
                    <Badge 
                      className={employee.is_active 
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" 
                        : "bg-red-100 text-red-700 hover:bg-red-100"
                      }
                    >
                      {employee.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEmployeeDetails(employee)}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEditDialog(employee)}>
                          <Edit2 className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedEmployee(employee);
                            setCustomResetPassword("");
                            setIsResetDialogOpen(true);
                          }}
                        >
                          <KeyRound className="h-4 w-4 mr-2" />
                          Reset Password
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => toggleEmployeeStatus(employee)}>
                          {employee.is_active ? (
                            <>
                              <UserX className="h-4 w-4 mr-2" />
                              Deactivate
                            </>
                          ) : (
                            <>
                              <UserCheck className="h-4 w-4 mr-2" />
                              Activate
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-red-600"
                          onClick={() => {
                            setSelectedEmployee(employee);
                            setIsDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Employee</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit_full_name">Full Name *</Label>
              <Input
                id="edit_full_name"
                value={editFormData.full_name}
                onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_phone">Phone</Label>
              <Input
                id="edit_phone"
                type="tel"
                value={editFormData.phone}
                onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_designation">Designation</Label>
                <Input
                  id="edit_designation"
                  value={editFormData.designation}
                  onChange={(e) => setEditFormData({ ...editFormData, designation: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_department">Department</Label>
                <Input
                  id="edit_department"
                  value={editFormData.department}
                  onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
                />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full bg-clinical-navy hover:bg-clinical-navy/90"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate {selectedEmployee?.full_name}'s account. They will no longer be able to access the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Employee Password</DialogTitle>
            <DialogDescription>
              Choose how to reset password for {selectedEmployee?.full_name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Button
              className="w-full"
              disabled={resetLoading || !selectedEmployee?.email}
              onClick={() => handleAdminResetPassword("email")}
            >
              {resetLoading ? "Processing..." : "Send Reset Link by Email"}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              disabled={resetLoading}
              onClick={() => handleAdminResetPassword("temp")}
            >
              {resetLoading ? "Processing..." : "Set Temporary Password"}
            </Button>
            <div className="space-y-2 border rounded-md p-3">
              <Label htmlFor="custom-reset-password">Set Custom Password</Label>
              <Input
                id="custom-reset-password"
                type="text"
                value={customResetPassword}
                onChange={(e) => setCustomResetPassword(e.target.value)}
                placeholder="Enter new password (min 6 chars)"
              />
              <Button
                variant="outline"
                className="w-full"
                disabled={resetLoading || customResetPassword.length < 6}
                onClick={() => handleAdminResetPassword("set")}
              >
                {resetLoading ? "Processing..." : "Apply Custom Password"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Temporary password is shown once. Share it securely with the employee.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Employee Details Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Employee Details</SheetTitle>
          </SheetHeader>
          
          {selectedEmployee && (
            <div className="mt-6 space-y-6">
              <Card className="border-0 shadow-sm bg-gradient-to-br from-primary/5 to-transparent">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-8 w-8 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold">{selectedEmployee.full_name}</h3>
                      <p className="text-sm font-mono text-primary">{selectedEmployee.employee_id}</p>
                      <div className="flex gap-2 mt-2">
                        {getRoleBadge(selectedEmployee.role || 'employee')}
                        <Badge 
                          className={selectedEmployee.is_active 
                            ? "bg-emerald-100 text-emerald-700" 
                            : "bg-red-100 text-red-700"
                          }
                        >
                          {selectedEmployee.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="font-medium">{selectedEmployee.email}</p>
                  </div>
                </div>
                
                {selectedEmployee.phone && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <p className="font-medium">{selectedEmployee.phone}</p>
                    </div>
                  </div>
                )}

                {selectedEmployee.department && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Department</p>
                      <p className="font-medium">{selectedEmployee.department}</p>
                    </div>
                  </div>
                )}

                {selectedEmployee.designation && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Designation</p>
                      <p className="font-medium">{selectedEmployee.designation}</p>
                    </div>
                  </div>
                )}

                <div className="text-xs text-muted-foreground pt-4 border-t">
                  Joined: {format(new Date(selectedEmployee.created_at), "dd MMM yyyy")}
                </div>
              </div>

              {/* Custom Roles Section */}
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base font-semibold">Custom Roles</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Assign additional roles with specific permissions
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      // Refresh roles list before opening dialog
                      await fetchCustomRoles();
                      setIsRoleDialogOpen(true);
                    }}
                  >
                    <Shield className="h-4 w-4 mr-2" />
                    Manage Roles
                  </Button>
                </div>
                {employeeCustomRoles.size > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {customRoles
                      .filter(role => employeeCustomRoles.has(role.id))
                      .map(role => (
                        <Badge key={role.id} variant="secondary" className="text-xs">
                          {role.name}
                        </Badge>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No custom roles assigned</p>
                )}
              </div>

              <div className="flex gap-2 pt-4">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    setIsSheetOpen(false);
                    openEditDialog(selectedEmployee);
                  }}
                >
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button 
                  variant={selectedEmployee.is_active ? "destructive" : "default"}
                  className="flex-1"
                  onClick={() => {
                    toggleEmployeeStatus(selectedEmployee);
                    setIsSheetOpen(false);
                  }}
                >
                  {selectedEmployee.is_active ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Assign Custom Roles Dialog */}
      <Dialog open={isRoleDialogOpen} onOpenChange={(open) => {
        setIsRoleDialogOpen(open);
        if (open && selectedEmployee) {
          // Refresh roles when dialog opens
          fetchCustomRoles();
          // Refresh employee's current roles
          supabase
            .from("user_custom_roles")
            .select("role_id")
            .eq("user_id", selectedEmployee.user_id)
            .then(({ data, error }) => {
              if (!error && data) {
                setEmployeeCustomRoles(new Set(data.map(r => r.role_id)));
              }
            });
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Assign Custom Roles</DialogTitle>
            <DialogDescription>
              Select custom roles for {selectedEmployee?.full_name}. Users can have multiple roles, and permissions are cumulative.
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 border rounded-lg p-4 min-h-[300px] max-h-[400px]">
            <div className="space-y-3">
              {customRoles.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No custom roles available. Create roles in the "Roles & Permissions" section first.
                </p>
              ) : (
                customRoles.map((role) => (
                  <div
                    key={role.id}
                    className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      id={`role-${role.id}`}
                      checked={employeeCustomRoles.has(role.id)}
                      onCheckedChange={(checked) => {
                        const newRoles = new Set(employeeCustomRoles);
                        if (checked) {
                          newRoles.add(role.id);
                        } else {
                          newRoles.delete(role.id);
                        }
                        setEmployeeCustomRoles(newRoles);
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <Label
                        htmlFor={`role-${role.id}`}
                        className="font-medium cursor-pointer"
                      >
                        {role.name}
                      </Label>
                      {role.description && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {role.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!selectedEmployee) return;
                setIsAssigningRoles(true);
                try {
                  // Get current roles from database
                  const { data: currentRoles } = await supabase
                    .from("user_custom_roles")
                    .select("role_id")
                    .eq("user_id", selectedEmployee.user_id);

                  const currentRoleIds = new Set((currentRoles || []).map(r => r.role_id));
                  const newRoleIds = employeeCustomRoles;

                  // Find roles to add
                  const toAdd = Array.from(newRoleIds).filter(id => !currentRoleIds.has(id));
                  // Find roles to remove
                  const toRemove = Array.from(currentRoleIds).filter(id => !newRoleIds.has(id));

                  // Add new roles
                  if (toAdd.length > 0) {
                    const { error: addError } = await supabase
                      .from("user_custom_roles")
                      .insert(
                        toAdd.map(roleId => ({
                          user_id: selectedEmployee.user_id,
                          role_id: roleId,
                        }))
                      );

                    if (addError) throw addError;
                  }

                  // Remove roles
                  if (toRemove.length > 0) {
                    const { error: removeError } = await supabase
                      .from("user_custom_roles")
                      .delete()
                      .eq("user_id", selectedEmployee.user_id)
                      .in("role_id", toRemove);

                    if (removeError) throw removeError;
                  }

                  toast.success("Roles updated successfully");
                  
                  // Refresh employee's roles in the details view
                  const { data: updatedRoles } = await supabase
                    .from("user_custom_roles")
                    .select("role_id")
                    .eq("user_id", selectedEmployee.user_id);
                  setEmployeeCustomRoles(new Set((updatedRoles || []).map(r => r.role_id)));
                  
                  setIsRoleDialogOpen(false);
                } catch (error: any) {
                  console.error("Error updating roles:", error);
                  toast.error("Failed to update roles: " + (error.message || "Unknown error"));
                } finally {
                  setIsAssigningRoles(false);
                }
              }}
              className="bg-clinical-navy hover:bg-clinical-navy/90"
              disabled={isAssigningRoles}
            >
              {isAssigningRoles ? "Saving..." : "Save Roles"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManageEmployees;
