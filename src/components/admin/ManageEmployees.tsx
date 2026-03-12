import { useState, useEffect } from "react";
import { Plus, Search, Edit2, Trash2, Eye, EyeOff, User, Mail, Phone, Building, Shield, MoreHorizontal, UserX, UserCheck, FlaskConical, KeyRound, Camera, CreditCard, IdCard, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { useLab } from "@/contexts/LabContext";
import { useAuth } from "@/hooks/useAuth";
import { formatAppDate } from "@/lib/date";

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

interface EmployeeIdentityDraft {
  photo_name: string;
  photo_preview: string;
  photo_path: string | null;
  photo_content_type: string | null;
  photo_size_bytes: number | null;
  aadhaar_number: string;
  pan_number: string;
  address: string;
}

interface EmployeeFormState extends EmployeeIdentityDraft {
  full_name: string;
  email: string;
  password: string;
  phone: string;
  designation: string;
  department: string;
  role: "admin" | "employee" | "collector";
  photo_file: File | null;
}

interface EmployeeEditFormState extends EmployeeIdentityDraft {
  full_name: string;
  phone: string;
  designation: string;
  department: string;
  photo_file: File | null;
}

const EMPLOYEE_PHOTO_BUCKET = "employee-photos";
const MAX_EMPLOYEE_PHOTO_BYTES = 1024 * 1024;

const createEmptyIdentityDraft = (): EmployeeIdentityDraft => ({
  photo_name: "",
  photo_preview: "",
  photo_path: null,
  photo_content_type: null,
  photo_size_bytes: null,
  aadhaar_number: "",
  pan_number: "",
  address: "",
});

const createEmptyFormData = (): EmployeeFormState => ({
  full_name: "",
  email: "",
  password: "",
  phone: "",
  designation: "",
  department: "",
  role: "employee",
  photo_file: null,
  ...createEmptyIdentityDraft(),
});

const createEmptyEditFormData = (): EmployeeEditFormState => ({
  full_name: "",
  phone: "",
  designation: "",
  department: "",
  photo_file: null,
  ...createEmptyIdentityDraft(),
});

const ManageEmployees = () => {
  const { currentLab } = useLab();
  const { user, hasRole } = useAuth();
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
  const [formData, setFormData] = useState<EmployeeFormState>(createEmptyFormData());
  const [editFormData, setEditFormData] = useState<EmployeeEditFormState>(createEmptyEditFormData());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [employeeIdentityDrafts, setEmployeeIdentityDrafts] = useState<Record<string, EmployeeIdentityDraft>>({});
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

      const employeeIds = employeesData?.map((employee) => employee.id) || [];
      const { data: privateDetailsData, error: privateDetailsError } = employeeIds.length > 0
        ? await supabase
            .from("employee_private_details")
            .select("employee_id, address, aadhaar_number, pan_number, photo_path, photo_original_name, photo_content_type, photo_size_bytes")
            .in("employee_id", employeeIds)
        : { data: [], error: null };

      if (privateDetailsError) throw privateDetailsError;

      const photoPaths = (privateDetailsData || [])
        .map((detail) => detail.photo_path)
        .filter((path): path is string => Boolean(path));

      const signedPhotoUrlByPath = new Map<string, string>();
      if (photoPaths.length > 0) {
        const { data: signedUrls, error: signedUrlsError } = await supabase.storage
          .from(EMPLOYEE_PHOTO_BUCKET)
          .createSignedUrls(photoPaths, 60 * 60);

        if (signedUrlsError) throw signedUrlsError;

        (signedUrls || []).forEach((signedUrlEntry) => {
          if (signedUrlEntry.path && signedUrlEntry.signedUrl) {
            signedPhotoUrlByPath.set(signedUrlEntry.path, signedUrlEntry.signedUrl);
          }
        });
      }

      // Combine employees with their roles
      const employeesWithRoles = employeesData?.map(emp => ({
        ...emp,
        role: rolesData?.find(r => r.user_id === emp.user_id)?.role || 'employee'
      })) || [];

      setEmployees(employeesWithRoles);
      setEmployeeIdentityDrafts((previousDrafts) => {
        const nextDrafts = { ...previousDrafts };

        employeesWithRoles.forEach((employee) => {
          const persistedDetails = privateDetailsData?.find((detail) => detail.employee_id === employee.id);
          if (persistedDetails) {
            nextDrafts[employee.id] = {
              photo_name: persistedDetails.photo_original_name || getPhotoNameFromPath(persistedDetails.photo_path),
              photo_preview: persistedDetails.photo_path ? signedPhotoUrlByPath.get(persistedDetails.photo_path) || "" : "",
              photo_path: persistedDetails.photo_path,
              photo_content_type: persistedDetails.photo_content_type,
              photo_size_bytes: persistedDetails.photo_size_bytes,
              aadhaar_number: persistedDetails.aadhaar_number || "",
              pan_number: persistedDetails.pan_number || "",
              address: persistedDetails.address || "",
            };
            return;
          }

          if (!nextDrafts[employee.id]) {
            nextDrafts[employee.id] = createEmptyIdentityDraft();
          }
        });

        return nextDrafts;
      });
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

    let createdEmployee:
      | {
          id: string;
          user_id: string;
        }
      | null = null;

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
            lab_id: currentLab?.id || null,
          }),
        }
      );

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || "Failed to create employee");
      }

      if (result.employee_row_id && result.user_id) {
        createdEmployee = {
          id: result.employee_row_id,
          user_id: result.user_id,
        };

        await saveEmployeeIdentity(createdEmployee, formData);
      }

      toast.success(`Employee ${formData.full_name} added successfully`);
      setIsDialogOpen(false);
      resetForm();
      await fetchEmployees();
    } catch (error: any) {
      console.error("Error adding employee:", error);
      if (createdEmployee) {
        toast.error(`Employee was created, but private details could not be saved: ${error.message || "Unknown error"}`);
        setIsDialogOpen(false);
        resetForm();
        await fetchEmployees();
      } else {
        toast.error(error.message || "Failed to add employee");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    setIsSubmitting(true);

    let employeeUpdated = false;

    try {
      const updatePayload = hasRole("admin")
        ? {
            full_name: editFormData.full_name,
            phone: editFormData.phone || null,
            designation: editFormData.designation || null,
            department: editFormData.department || null,
          }
        : {
            phone: editFormData.phone || null,
          };

      const { error } = await supabase
        .from("employees")
        .update(updatePayload)
        .eq("id", selectedEmployee.id);

      if (error) throw error;
      employeeUpdated = true;

      if (hasRole("admin") && canViewEmployeeIdentity(selectedEmployee)) {
        await saveEmployeeIdentity(selectedEmployee, editFormData);
      }

      toast.success("Employee updated successfully");
      setIsEditDialogOpen(false);
      setSelectedEmployee(null);
      await fetchEmployees();
    } catch (error: any) {
      console.error("Error updating employee:", error);
      if (employeeUpdated) {
        toast.error(`Employee was updated, but private details could not be saved: ${error.message || "Unknown error"}`);
        setIsEditDialogOpen(false);
        setSelectedEmployee(null);
        await fetchEmployees();
      } else {
        toast.error(error.message || "Failed to update employee");
      }
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
    setFormData(createEmptyFormData());
  };

  const getEmployeeIdentityDraft = (employee: Employee | null) => {
    if (!employee) return createEmptyIdentityDraft();

    return employeeIdentityDrafts[employee.id] || createEmptyIdentityDraft();
  };

  const normalizeAadhaar = (value: string) => value.replace(/\D/g, "").slice(0, 12);

  const normalizePan = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);

  const formatAadhaar = (value: string) => {
    const chunks = value.match(/.{1,4}/g);
    return chunks?.join(" ") || value;
  };

  const maskDocumentNumber = (value: string, visibleDigits = 4) => {
    if (!value) return "";
    if (value.length <= visibleDigits) return value;
    return `${"*".repeat(Math.max(0, value.length - visibleDigits))}${value.slice(-visibleDigits)}`;
  };

  const canViewEmployeeIdentity = (employee: Employee | null) => {
    if (!employee) return false;
    return hasRole("admin") || user?.id === employee.user_id;
  };

  const readImageFile = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
          return;
        }

        reject(new Error("Unable to read image file"));
      };
      reader.onerror = () => reject(reader.error || new Error("Unable to read image file"));
      reader.readAsDataURL(file);
    });

  const validateEmployeePhoto = (file: File) => {
    if (file.size >= MAX_EMPLOYEE_PHOTO_BYTES) {
      throw new Error("Employee picture must be smaller than 1 MB");
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new Error("Employee picture must be a JPG, PNG, or WebP image");
    }
  };

  const getFileExtension = (file: File) => {
    const nameParts = file.name.split(".");
    const explicitExtension = nameParts.length > 1 ? nameParts[nameParts.length - 1].toLowerCase() : "";
    if (explicitExtension) return explicitExtension;

    if (file.type === "image/png") return "png";
    if (file.type === "image/webp") return "webp";
    return "jpg";
  };

  const buildEmployeePhotoPath = (employeeUserId: string, file: File) =>
    `${employeeUserId}/profile.${getFileExtension(file)}`;

  const getPhotoNameFromPath = (photoPath: string | null) => {
    if (!photoPath) return "";
    const segments = photoPath.split("/");
    return segments[segments.length - 1] || "";
  };

  const getSignedEmployeePhotoUrl = async (photoPath: string | null) => {
    if (!photoPath) return "";

    const { data, error } = await supabase.storage
      .from(EMPLOYEE_PHOTO_BUCKET)
      .createSignedUrl(photoPath, 60 * 60);

    if (error) {
      throw error;
    }

    return data.signedUrl;
  };

  const fetchEmployeeIdentity = async (employee: Employee) => {
    if (!canViewEmployeeIdentity(employee)) {
      const emptyDraft = createEmptyIdentityDraft();
      setEmployeeIdentityDrafts((previousDrafts) => ({
        ...previousDrafts,
        [employee.id]: emptyDraft,
      }));
      return emptyDraft;
    }

    const { data, error } = await supabase
      .from("employee_private_details")
      .select("address, aadhaar_number, pan_number, photo_path, photo_original_name, photo_content_type, photo_size_bytes")
      .eq("employee_id", employee.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const draft: EmployeeIdentityDraft = {
      photo_name: data?.photo_original_name || getPhotoNameFromPath(data?.photo_path ?? null),
      photo_preview: data?.photo_path ? await getSignedEmployeePhotoUrl(data.photo_path) : "",
      photo_path: data?.photo_path ?? null,
      photo_content_type: data?.photo_content_type ?? null,
      photo_size_bytes: data?.photo_size_bytes ?? null,
      aadhaar_number: data?.aadhaar_number ?? "",
      pan_number: data?.pan_number ?? "",
      address: data?.address ?? "",
    };

    setEmployeeIdentityDrafts((previousDrafts) => ({
      ...previousDrafts,
      [employee.id]: draft,
    }));

    return draft;
  };

  const handlePhotoSelection = async (
    file: File,
    applyState: React.Dispatch<React.SetStateAction<EmployeeFormState>> | React.Dispatch<React.SetStateAction<EmployeeEditFormState>>,
  ) => {
    validateEmployeePhoto(file);
    const preview = await readImageFile(file);

    applyState((previous) => ({
      ...previous,
      photo_file: file,
      photo_name: file.name,
      photo_preview: preview,
      photo_path: previous.photo_path,
      photo_content_type: file.type,
      photo_size_bytes: file.size,
    }));
  };

  const clearPhotoSelection = (
    applyState: React.Dispatch<React.SetStateAction<EmployeeFormState>> | React.Dispatch<React.SetStateAction<EmployeeEditFormState>>,
  ) => {
    applyState((previous) => ({
      ...previous,
      photo_file: null,
      photo_name: "",
      photo_preview: "",
      photo_path: null,
      photo_content_type: null,
      photo_size_bytes: null,
    }));
  };

  const saveEmployeeIdentity = async (
    employee: Pick<Employee, "id" | "user_id">,
    identity: EmployeeIdentityDraft & { photo_file: File | null },
  ) => {
    let nextPhotoPath = identity.photo_path;
    let nextPhotoName = identity.photo_name;
    let nextPhotoContentType = identity.photo_content_type;
    let nextPhotoSizeBytes = identity.photo_size_bytes;

    if (identity.photo_file) {
      validateEmployeePhoto(identity.photo_file);
      const uploadPath = buildEmployeePhotoPath(employee.user_id, identity.photo_file);

      if (identity.photo_path && identity.photo_path !== uploadPath) {
        const { error: removeError } = await supabase.storage
          .from(EMPLOYEE_PHOTO_BUCKET)
          .remove([identity.photo_path]);
        if (removeError) throw removeError;
      }

      const { error: uploadError } = await supabase.storage
        .from(EMPLOYEE_PHOTO_BUCKET)
        .upload(uploadPath, identity.photo_file, {
          upsert: true,
          contentType: identity.photo_file.type,
          cacheControl: "3600",
        });

      if (uploadError) {
        throw uploadError;
      }

      nextPhotoPath = uploadPath;
      nextPhotoName = identity.photo_file.name;
      nextPhotoContentType = identity.photo_file.type;
      nextPhotoSizeBytes = identity.photo_file.size;
    } else if (!identity.photo_preview && identity.photo_path) {
      const { error: removeError } = await supabase.storage
        .from(EMPLOYEE_PHOTO_BUCKET)
        .remove([identity.photo_path]);
      if (removeError) throw removeError;

      nextPhotoPath = null;
      nextPhotoName = "";
      nextPhotoContentType = null;
      nextPhotoSizeBytes = null;
    }

    const normalizedAddress = identity.address.trim();
    const normalizedAadhaar = identity.aadhaar_number.trim();
    const normalizedPan = identity.pan_number.trim();

    const hasIdentityValues = Boolean(
      normalizedAddress || normalizedAadhaar || normalizedPan || nextPhotoPath
    );

    if (!hasIdentityValues) {
      const { error } = await supabase
        .from("employee_private_details")
        .delete()
        .eq("employee_id", employee.id);

      if (error) throw error;

      const emptyDraft = createEmptyIdentityDraft();
      setEmployeeIdentityDrafts((previousDrafts) => ({
        ...previousDrafts,
        [employee.id]: emptyDraft,
      }));

      return emptyDraft;
    }

    const { error } = await supabase
      .from("employee_private_details")
      .upsert(
        {
          employee_id: employee.id,
          address: normalizedAddress || null,
          aadhaar_number: normalizedAadhaar || null,
          pan_number: normalizedPan || null,
          photo_path: nextPhotoPath,
          photo_original_name: nextPhotoName || null,
          photo_content_type: nextPhotoContentType,
          photo_size_bytes: nextPhotoSizeBytes,
        },
        { onConflict: "employee_id" }
      );

    if (error) throw error;

    const savedDraft: EmployeeIdentityDraft = {
      photo_name: nextPhotoName,
      photo_preview: nextPhotoPath ? await getSignedEmployeePhotoUrl(nextPhotoPath) : "",
      photo_path: nextPhotoPath,
      photo_content_type: nextPhotoContentType,
      photo_size_bytes: nextPhotoSizeBytes,
      aadhaar_number: normalizedAadhaar,
      pan_number: normalizedPan,
      address: normalizedAddress,
    };

    setEmployeeIdentityDrafts((previousDrafts) => ({
      ...previousDrafts,
      [employee.id]: savedDraft,
    }));

    return savedDraft;
  };

  const openEditDialog = async (employee: Employee) => {
    try {
      const identityDraft = canViewEmployeeIdentity(employee)
        ? await fetchEmployeeIdentity(employee)
        : createEmptyIdentityDraft();
      setSelectedEmployee(employee);
      setEditFormData({
        ...createEmptyEditFormData(),
        full_name: employee.full_name,
        phone: employee.phone || "",
        designation: employee.designation || "",
        department: employee.department || "",
        ...identityDraft,
        photo_file: null,
      });
      setIsEditDialogOpen(true);
    } catch (error: any) {
      console.error("Error loading employee identity:", error);
      toast.error(error.message || "Failed to load employee details");
    }
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
      if (canViewEmployeeIdentity(employee)) {
        await fetchEmployeeIdentity(employee);
      }

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
      toast.error("Failed to load employee details");
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
  const selectedEmployeeIdentityDraft = getEmployeeIdentityDraft(selectedEmployee);
  const canViewSelectedEmployeeIdentity = canViewEmployeeIdentity(selectedEmployee);
  const canManageEmployeeRecords = hasRole("admin");
  const canEditSelectedEmployeePhone = Boolean(selectedEmployee) && (canManageEmployeeRecords || user?.id === selectedEmployee.user_id);

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
            <Label htmlFor="employee-search" className="sr-only">
              Search employees
            </Label>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="employee-search"
              name="employee_search"
              placeholder="Search by name, email, or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 w-full sm:w-80"
              autoComplete="off"
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
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                    name="full_name"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    required
                    placeholder="Enter full name"
                    autoComplete="name"
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    placeholder="employee@irmclinic.com"
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="password">Password *</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                      minLength={6}
                      placeholder="Minimum 6 characters"
                      autoComplete="new-password"
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
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="Phone number"
                    autoComplete="tel"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">Role *</Label>
                  <Select
                    name="role"
                    value={formData.role}
                    onValueChange={(value: "admin" | "employee" | "collector") =>
                      setFormData({ ...formData, role: value })
                    }
                  >
                    <SelectTrigger id="role">
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
                    name="designation"
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    placeholder="e.g. Lab Technician"
                    autoComplete="organization-title"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    name="department"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    placeholder="e.g. Pathology"
                    autoComplete="organization"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-dashed bg-muted/30 p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-medium">Identity Details</h4>
                    <p className="text-sm text-muted-foreground">
                      Optional private employee photo, address, Aadhaar, and PAN details.
                    </p>
                  </div>
                  <Badge variant="secondary">Private</Badge>
                </div>

                <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                  <div className="space-y-3">
                    <Label htmlFor="employee_photo">Employee Picture</Label>
                    <div className="rounded-xl border bg-background p-4">
                      <div className="flex flex-col items-center gap-3 text-center">
                        <div className="h-24 w-24 overflow-hidden rounded-full border bg-muted flex items-center justify-center">
                          {formData.photo_preview ? (
                            <img
                              src={formData.photo_preview}
                              alt="Employee preview"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Camera className="h-8 w-8 text-muted-foreground" />
                          )}
                        </div>
                        <div className="space-y-2 w-full">
                          <Input
                            id="employee_photo"
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              try {
                                await handlePhotoSelection(file, setFormData);
                              } catch (error: any) {
                                toast.error(error.message || "Failed to load employee picture");
                              } finally {
                                e.target.value = "";
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            onClick={() => document.getElementById("employee_photo")?.click()}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            {formData.photo_preview ? "Change Picture" : "Upload Picture"}
                          </Button>
                          {formData.photo_preview && (
                            <Button
                              type="button"
                              variant="ghost"
                              className="w-full"
                              onClick={() => clearPhotoSelection(setFormData)}
                            >
                              Remove Picture
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground break-all">
                          {formData.photo_name || "No image selected"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          JPG, PNG, or WebP. Must be less than 1 MB.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="aadhaar_number">Aadhaar Number</Label>
                      <Input
                        id="aadhaar_number"
                        inputMode="numeric"
                        value={formatAadhaar(formData.aadhaar_number)}
                        onChange={(e) => setFormData({
                          ...formData,
                          aadhaar_number: normalizeAadhaar(e.target.value),
                        })}
                        placeholder="1234 5678 9012"
                      />
                      <p className="text-xs text-muted-foreground">12 digits, optional.</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="pan_number">PAN Number</Label>
                      <Input
                        id="pan_number"
                        value={formData.pan_number}
                        onChange={(e) => setFormData({
                          ...formData,
                          pan_number: normalizePan(e.target.value),
                        })}
                        placeholder="ABCDE1234F"
                      />
                      <p className="text-xs text-muted-foreground">10 characters, optional.</p>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="employee_address">Address</Label>
                      <Textarea
                        id="employee_address"
                        value={formData.address}
                        onChange={(e) => setFormData({
                          ...formData,
                          address: e.target.value,
                        })}
                        placeholder="Enter employee address"
                        rows={4}
                      />
                      <p className="text-xs text-muted-foreground">Optional. Stored privately in Supabase.</p>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Stored in Supabase with restricted access. Only admins and the employee themselves should be able to view them.
                </p>
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
              filteredEmployees.map((employee) => {
                const employeeIdentityDraft = getEmployeeIdentityDraft(employee);

                return (
                <TableRow key={employee.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                        {employeeIdentityDraft.photo_preview ? (
                          <img
                            src={employeeIdentityDraft.photo_preview}
                            alt={employee.full_name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <User className="h-5 w-5 text-primary" />
                        )}
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
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                disabled={!canManageEmployeeRecords}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_phone">Phone</Label>
              <Input
                id="edit_phone"
                type="tel"
                value={editFormData.phone}
                onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                disabled={!canEditSelectedEmployeePhone}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_designation">Designation</Label>
                <Input
                  id="edit_designation"
                  value={editFormData.designation}
                  onChange={(e) => setEditFormData({ ...editFormData, designation: e.target.value })}
                  disabled={!canManageEmployeeRecords}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_department">Department</Label>
                <Input
                  id="edit_department"
                  value={editFormData.department}
                  onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
                  disabled={!canManageEmployeeRecords}
                />
              </div>
            </div>

            {canManageEmployeeRecords && canViewSelectedEmployeeIdentity && (
              <div className="rounded-xl border border-dashed bg-muted/30 p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-medium">Identity Details</h4>
                    <p className="text-sm text-muted-foreground">
                      Optional private photo, address, Aadhaar, and PAN details.
                    </p>
                  </div>
                  <Badge variant="secondary">Private</Badge>
                </div>

                <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                  <div className="space-y-3">
                    <Label htmlFor="edit_employee_photo">Employee Picture</Label>
                    <div className="rounded-xl border bg-background p-4">
                      <div className="flex flex-col items-center gap-3 text-center">
                        <div className="h-24 w-24 overflow-hidden rounded-full border bg-muted flex items-center justify-center">
                          {editFormData.photo_preview ? (
                            <img
                              src={editFormData.photo_preview}
                              alt="Employee preview"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Camera className="h-8 w-8 text-muted-foreground" />
                          )}
                        </div>
                        <div className="space-y-2 w-full">
                          <Input
                            id="edit_employee_photo"
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              try {
                                await handlePhotoSelection(file, setEditFormData);
                              } catch (error: any) {
                                toast.error(error.message || "Failed to load employee picture");
                              } finally {
                                e.target.value = "";
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            onClick={() => document.getElementById("edit_employee_photo")?.click()}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            {editFormData.photo_preview ? "Change Picture" : "Upload Picture"}
                          </Button>
                          {editFormData.photo_preview && (
                            <Button
                              type="button"
                              variant="ghost"
                              className="w-full"
                              onClick={() => clearPhotoSelection(setEditFormData)}
                            >
                              Remove Picture
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground break-all">
                          {editFormData.photo_name || "No image selected"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          JPG, PNG, or WebP. Must be less than 1 MB.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="edit_aadhaar_number">Aadhaar Number</Label>
                      <Input
                        id="edit_aadhaar_number"
                        inputMode="numeric"
                        value={formatAadhaar(editFormData.aadhaar_number)}
                        onChange={(e) => setEditFormData({
                          ...editFormData,
                          aadhaar_number: normalizeAadhaar(e.target.value),
                        })}
                        placeholder="1234 5678 9012"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit_pan_number">PAN Number</Label>
                      <Input
                        id="edit_pan_number"
                        value={editFormData.pan_number}
                        onChange={(e) => setEditFormData({
                          ...editFormData,
                          pan_number: normalizePan(e.target.value),
                        })}
                        placeholder="ABCDE1234F"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="edit_employee_address">Address</Label>
                      <Textarea
                        id="edit_employee_address"
                        value={editFormData.address}
                        onChange={(e) => setEditFormData({
                          ...editFormData,
                          address: e.target.value,
                        })}
                        placeholder="Enter employee address"
                        rows={4}
                      />
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Stored in Supabase with restricted access. Only admins and the employee themselves should be able to view them.
                </p>
              </div>
            )}
            <Button
              type="submit"
              className="w-full bg-clinical-navy hover:bg-clinical-navy/90"
              disabled={isSubmitting || !canEditSelectedEmployeePhone}
            >
              {isSubmitting ? "Saving..." : canManageEmployeeRecords ? "Save Changes" : "Save Phone Number"}
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
        <SheetContent className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle>Employee Details</SheetTitle>
          </SheetHeader>
          
          {selectedEmployee && (
            <ScrollArea className="mt-6 flex-1 pr-4">
              <div className="space-y-6 pb-6">
              <Card className="border-0 shadow-sm bg-gradient-to-br from-primary/5 to-transparent">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                      {selectedEmployeeIdentityDraft.photo_preview ? (
                        <img
                          src={selectedEmployeeIdentityDraft.photo_preview}
                          alt={selectedEmployee.full_name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <User className="h-8 w-8 text-primary" />
                      )}
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

                {canViewSelectedEmployeeIdentity && (
                  <div className="space-y-3 rounded-xl border border-dashed p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">Identity Details</p>
                        <p className="text-xs text-muted-foreground">
                          Stored privately in Supabase. Restricted to admins and the employee themselves.
                        </p>
                      </div>
                      <Badge variant="secondary">Private</Badge>
                    </div>

                    {selectedEmployeeIdentityDraft.photo_name && (
                      <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                        <Camera className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Picture</p>
                          <p className="font-medium">{selectedEmployeeIdentityDraft.photo_name}</p>
                        </div>
                      </div>
                    )}

                    {selectedEmployeeIdentityDraft.address && (
                      <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
                        <Building className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-xs text-muted-foreground">Address</p>
                          <p className="font-medium whitespace-pre-wrap">{selectedEmployeeIdentityDraft.address}</p>
                        </div>
                      </div>
                    )}

                    {selectedEmployeeIdentityDraft.aadhaar_number && (
                      <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                        <IdCard className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Aadhaar</p>
                          <p className="font-medium">
                            {maskDocumentNumber(formatAadhaar(selectedEmployeeIdentityDraft.aadhaar_number))}
                          </p>
                        </div>
                      </div>
                    )}

                    {selectedEmployeeIdentityDraft.pan_number && (
                      <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">PAN</p>
                          <p className="font-medium">
                            {maskDocumentNumber(selectedEmployeeIdentityDraft.pan_number)}
                          </p>
                        </div>
                      </div>
                    )}

                    {!selectedEmployeeIdentityDraft.photo_name &&
                      !selectedEmployeeIdentityDraft.address &&
                      !selectedEmployeeIdentityDraft.aadhaar_number &&
                      !selectedEmployeeIdentityDraft.pan_number && (
                        <p className="text-sm text-muted-foreground">
                          No private identity details saved yet.
                        </p>
                      )}
                  </div>
                )}

                <div className="text-xs text-muted-foreground pt-4 border-t">
                  Joined: {formatAppDate(selectedEmployee.created_at)}
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
            </ScrollArea>
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
