import { useCallback, useEffect, useState } from "react";
import { User, UserCheck, Shield, FlaskConical } from "lucide-react";
import { exportToExcel } from "@/lib/exportToExcel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { useLab } from "@/contexts/LabContext";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/contexts/OrganizationContext";
import { getWebsiteHostname } from "@/lib/branding";
import { formatAppDate } from "@/lib/date";
import EmployeeFilters from "./employees/EmployeeFilters";
import { EmployeeTable } from "./employees/EmployeeTable";
import { EmployeeFormDialog, EmployeeEditDialog } from "./employees/EmployeeFormDialog";
import { EmployeeDetailView } from "./employees/EmployeeDetailView";

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
  photo_name: "", photo_preview: "", photo_path: null,
  photo_content_type: null, photo_size_bytes: null,
  aadhaar_number: "", pan_number: "", address: "",
});

const createEmptyFormData = (): EmployeeFormState => ({
  full_name: "", email: "", password: "", phone: "",
  designation: "", department: "", role: "employee",
  photo_file: null, ...createEmptyIdentityDraft(),
});

const createEmptyEditFormData = (): EmployeeEditFormState => ({
  full_name: "", phone: "", designation: "", department: "",
  photo_file: null, ...createEmptyIdentityDraft(),
});

const ManageEmployees = () => {
  const { branding, organization, loading: organizationLoading } = useOrganization();
  const organizationId = organization?.id ?? null;
  const employeeEmailPlaceholder = `employee@${getWebsiteHostname(branding.website)}`;
  const { currentLab } = useLab();
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("admin");

  // Data state
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [employeeIdentityDrafts, setEmployeeIdentityDrafts] = useState<Record<string, EmployeeIdentityDraft>>({});
  const [customRoles, setCustomRoles] = useState<Array<{ id: string; name: string; description: string | null }>>([]);
  const [employeeCustomRoles, setEmployeeCustomRoles] = useState<Set<string>>(new Set());

  // Filter state
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [filterRole, setFilterRole] = useState<"all" | "admin" | "employee" | "collector">("all");

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  // Form state
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState<EmployeeFormState>(createEmptyFormData());
  const [editFormData, setEditFormData] = useState<EmployeeEditFormState>(createEmptyEditFormData());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAssigningRoles, setIsAssigningRoles] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [customResetPassword, setCustomResetPassword] = useState("");

  // ── Utility functions ──
  const normalizeAadhaar = (value: string) => value.replace(/\D/g, "").slice(0, 12);
  const normalizePan = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  const formatAadhaar = (value: string) => { const c = value.match(/.{1,4}/g); return c?.join(" ") || value; };
  const maskDocumentNumber = (value: string, visibleDigits = 4) => {
    if (!value) return "";
    if (value.length <= visibleDigits) return value;
    return `${"*".repeat(Math.max(0, value.length - visibleDigits))}${value.slice(-visibleDigits)}`;
  };
  const canViewEmployeeIdentity = (employee: Employee | null) => {
    if (!employee) return false;
    return hasRole("admin") || user?.id === employee.user_id;
  };
  const getPhotoNameFromPath = (photoPath: string | null) => {
    if (!photoPath) return "";
    const segments = photoPath.split("/");
    return segments[segments.length - 1] || "";
  };
  const getEmployeeIdentityDraft = (employee: Employee | null) => {
    if (!employee) return createEmptyIdentityDraft();
    return employeeIdentityDrafts[employee.id] || createEmptyIdentityDraft();
  };
  const getRoleBadge = (role: string) => {
    if (role === "admin") return <Badge className="bg-violet-100 text-violet-700 hover:bg-violet-100">Admin</Badge>;
    if (role === "collector") return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Collector</Badge>;
    return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Employee</Badge>;
  };

  // ── Photo helpers ──
  const readImageFile = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Unable to read image file"));
    reader.onerror = () => reject(reader.error || new Error("Unable to read image file"));
    reader.readAsDataURL(file);
  });
  const validateEmployeePhoto = (file: File) => {
    if (file.size >= MAX_EMPLOYEE_PHOTO_BYTES) throw new Error("Employee picture must be smaller than 1 MB");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Employee picture must be a JPG, PNG, or WebP image");
  };
  const getFileExtension = (file: File) => {
    const parts = file.name.split(".");
    const ext = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
    if (ext) return ext;
    if (file.type === "image/png") return "png";
    if (file.type === "image/webp") return "webp";
    return "jpg";
  };
  const buildEmployeePhotoPath = (userId: string, file: File) => `${userId}/profile.${getFileExtension(file)}`;

  const handlePhotoSelection = async (file: File, applyState: any) => {
    validateEmployeePhoto(file);
    const preview = await readImageFile(file);
    applyState((prev: any) => ({ ...prev, photo_file: file, photo_name: file.name, photo_preview: preview, photo_path: prev.photo_path, photo_content_type: file.type, photo_size_bytes: file.size }));
  };
  const clearPhotoSelection = (applyState: any) => {
    applyState((prev: any) => ({ ...prev, photo_file: null, photo_name: "", photo_preview: "", photo_path: null, photo_content_type: null, photo_size_bytes: null }));
  };

  const getSignedEmployeePhotoUrl = async (photoPath: string | null) => {
    if (!photoPath) return "";
    const { data, error } = await supabase.storage.from(EMPLOYEE_PHOTO_BUCKET).createSignedUrl(photoPath, 60 * 60);
    if (error) throw error;
    return data.signedUrl;
  };

  const getFunctionErrorMessage = async (error: unknown) => {
    if (error instanceof FunctionsHttpError) {
      const response = error.context as Response | undefined;
      if (response) {
        try {
          const payload = await response.clone().json();
          if (typeof payload?.error === "string" && payload.error.trim()) return payload.error;
          if (typeof payload?.message === "string" && payload.message.trim()) return payload.message;
        } catch {
          try {
            const text = await response.clone().text();
            if (text.trim()) return text;
          } catch {
            // Ignore body parsing failures and fall back to the wrapper message below.
          }
        }
      }
    }

    if (error instanceof FunctionsRelayError || error instanceof FunctionsFetchError) {
      return error.message;
    }

    if (error instanceof Error && error.message) return error.message;
    return "Failed to add employee";
  };

  // ── Data fetching ──
  const fetchEmployees = useCallback(async () => {
    try {
      if (!organizationId) { setEmployees([]); setEmployeeIdentityDrafts({}); setLoading(false); return; }

      const { data: platformAdminsData } = await (supabase as any).from("platform_admins").select("user_id");
      const platformAdminUserIds: string[] = (platformAdminsData || []).map((row: { user_id: string }) => row.user_id);

      let employeesQuery = (supabase as any).from("employees").select("*").eq("organization_id" as any, organizationId).order("created_at", { ascending: false });
      if (currentLab?.id && !isAdmin) employeesQuery = (employeesQuery as any).eq("lab_id", currentLab.id);
      if (platformAdminUserIds.length > 0) employeesQuery = (employeesQuery as any).not("user_id", "in", `(${platformAdminUserIds.join(",")})`);

      const { data: employeesData, error: employeesError } = await employeesQuery;
      if (employeesError) throw employeesError;

      const userIds = employeesData?.map(e => e.user_id) || [];
      const { data: rolesData, error: rolesError } = await supabase.from("user_roles").select("user_id, role").in("user_id", userIds);
      if (rolesError) throw rolesError;

      const employeeIds = employeesData?.map(e => e.id) || [];
      const { data: privateDetailsData, error: privateDetailsError } = employeeIds.length > 0
        ? await supabase.from("employee_private_details").select("employee_id, address, aadhaar_number, pan_number, photo_path, photo_original_name, photo_content_type, photo_size_bytes").in("employee_id", employeeIds)
        : { data: [], error: null };
      if (privateDetailsError) throw privateDetailsError;

      const photoPaths = (privateDetailsData || []).map(d => d.photo_path).filter((p): p is string => Boolean(p));
      const signedPhotoUrlByPath = new Map<string, string>();
      if (photoPaths.length > 0) {
        const { data: signedUrls, error: signedUrlsError } = await supabase.storage.from(EMPLOYEE_PHOTO_BUCKET).createSignedUrls(photoPaths, 60 * 60);
        if (signedUrlsError) throw signedUrlsError;
        (signedUrls || []).forEach(s => { if (s.path && s.signedUrl) signedPhotoUrlByPath.set(s.path, s.signedUrl); });
      }

      const employeesWithRoles = employeesData?.map(emp => ({ ...emp, role: rolesData?.find(r => r.user_id === emp.user_id)?.role || "employee" })) || [];
      setEmployees(employeesWithRoles);

      setEmployeeIdentityDrafts(prev => {
        const next = { ...prev };
        employeesWithRoles.forEach(emp => {
          const det = privateDetailsData?.find(d => d.employee_id === emp.id);
          if (det) {
            next[emp.id] = { photo_name: det.photo_original_name || getPhotoNameFromPath(det.photo_path), photo_preview: det.photo_path ? signedPhotoUrlByPath.get(det.photo_path) || "" : "", photo_path: det.photo_path, photo_content_type: det.photo_content_type, photo_size_bytes: det.photo_size_bytes, aadhaar_number: det.aadhaar_number || "", pan_number: det.pan_number || "", address: det.address || "" };
          } else if (!next[emp.id]) { next[emp.id] = createEmptyIdentityDraft(); }
        });
        return next;
      });
    } catch (error) { console.error("Error fetching employees:", error); toast.error("Failed to fetch employees"); }
    finally { setLoading(false); }
  }, [organizationId, currentLab?.id, isAdmin]);

  const fetchCustomRoles = useCallback(async () => {
    try {
      if (!organizationId) { setCustomRoles([]); return []; }
      const { data, error } = await supabase.from("custom_roles").select("id, name, description").eq("is_active", true).eq("organization_id", organizationId).order("name");
      if (error) throw error;
      setCustomRoles(data || []);
      return data || [];
    } catch (error) { console.error("Error fetching custom roles:", error); setCustomRoles([]); return []; }
  }, [organizationId]);

  const fetchEmployeeIdentity = async (employee: Employee) => {
    if (!canViewEmployeeIdentity(employee)) {
      const empty = createEmptyIdentityDraft();
      setEmployeeIdentityDrafts(prev => ({ ...prev, [employee.id]: empty }));
      return empty;
    }
    const { data, error } = await supabase.from("employee_private_details").select("address, aadhaar_number, pan_number, photo_path, photo_original_name, photo_content_type, photo_size_bytes").eq("employee_id", employee.id).maybeSingle();
    if (error) throw error;
    const draft: EmployeeIdentityDraft = { photo_name: data?.photo_original_name || getPhotoNameFromPath(data?.photo_path ?? null), photo_preview: data?.photo_path ? await getSignedEmployeePhotoUrl(data.photo_path) : "", photo_path: data?.photo_path ?? null, photo_content_type: data?.photo_content_type ?? null, photo_size_bytes: data?.photo_size_bytes ?? null, aadhaar_number: data?.aadhaar_number ?? "", pan_number: data?.pan_number ?? "", address: data?.address ?? "" };
    setEmployeeIdentityDrafts(prev => ({ ...prev, [employee.id]: draft }));
    return draft;
  };

  const saveEmployeeIdentity = async (employee: Pick<Employee, "id" | "user_id">, identity: EmployeeIdentityDraft & { photo_file: File | null }) => {
    let nextPhotoPath = identity.photo_path, nextPhotoName = identity.photo_name, nextPhotoContentType = identity.photo_content_type, nextPhotoSizeBytes = identity.photo_size_bytes;

    if (identity.photo_file) {
      validateEmployeePhoto(identity.photo_file);
      const uploadPath = buildEmployeePhotoPath(employee.user_id, identity.photo_file);
      if (identity.photo_path && identity.photo_path !== uploadPath) { const { error } = await supabase.storage.from(EMPLOYEE_PHOTO_BUCKET).remove([identity.photo_path]); if (error) throw error; }
      const { error: uploadError } = await supabase.storage.from(EMPLOYEE_PHOTO_BUCKET).upload(uploadPath, identity.photo_file, { upsert: true, contentType: identity.photo_file.type, cacheControl: "3600" });
      if (uploadError) throw uploadError;
      nextPhotoPath = uploadPath; nextPhotoName = identity.photo_file.name; nextPhotoContentType = identity.photo_file.type; nextPhotoSizeBytes = identity.photo_file.size;
    } else if (!identity.photo_preview && identity.photo_path) {
      const { error } = await supabase.storage.from(EMPLOYEE_PHOTO_BUCKET).remove([identity.photo_path]); if (error) throw error;
      nextPhotoPath = null; nextPhotoName = ""; nextPhotoContentType = null; nextPhotoSizeBytes = null;
    }

    const addr = identity.address.trim(), aadh = identity.aadhaar_number.trim(), pan = identity.pan_number.trim();
    if (!addr && !aadh && !pan && !nextPhotoPath) {
      const { error } = await supabase.from("employee_private_details").delete().eq("employee_id", employee.id); if (error) throw error;
      const empty = createEmptyIdentityDraft(); setEmployeeIdentityDrafts(prev => ({ ...prev, [employee.id]: empty })); return empty;
    }

    const { error } = await supabase.from("employee_private_details").upsert({ employee_id: employee.id, address: addr || null, aadhaar_number: aadh || null, pan_number: pan || null, photo_path: nextPhotoPath, photo_original_name: nextPhotoName || null, photo_content_type: nextPhotoContentType, photo_size_bytes: nextPhotoSizeBytes }, { onConflict: "employee_id" });
    if (error) throw error;

    const saved: EmployeeIdentityDraft = { photo_name: nextPhotoName, photo_preview: nextPhotoPath ? await getSignedEmployeePhotoUrl(nextPhotoPath) : "", photo_path: nextPhotoPath, photo_content_type: nextPhotoContentType, photo_size_bytes: nextPhotoSizeBytes, aadhaar_number: aadh, pan_number: pan, address: addr };
    setEmployeeIdentityDrafts(prev => ({ ...prev, [employee.id]: saved })); return saved;
  };

  // ── Handlers ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) { toast.error("Organization context is required"); return; }
    setIsSubmitting(true);
    let created: { id: string; user_id: string } | null = null;
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke("create-employee", {
        body: { email: formData.email, password: formData.password, full_name: formData.full_name, phone: formData.phone || null, designation: formData.designation || null, department: formData.department || null, role: formData.role, lab_id: currentLab?.id || null, organization_id: organizationId },
      });
      if (fnError) throw fnError;
      if (result.employee_row_id && result.user_id) { created = { id: result.employee_row_id, user_id: result.user_id }; await saveEmployeeIdentity(created, formData); }
      toast.success(`Employee ${formData.full_name} added successfully`);
      setIsDialogOpen(false); setFormData(createEmptyFormData()); await fetchEmployees();
    } catch (error: unknown) {
      const errorMessage = await getFunctionErrorMessage(error);
      if (created) { toast.error(`Created but private details failed: ${errorMessage}`); setIsDialogOpen(false); setFormData(createEmptyFormData()); await fetchEmployees(); }
      else toast.error(errorMessage);
    } finally { setIsSubmitting(false); }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee || !organizationId) return;
    setIsSubmitting(true);
    let updated = false;
    try {
      const payload = hasRole("admin") ? { full_name: editFormData.full_name, phone: editFormData.phone || null, designation: editFormData.designation || null, department: editFormData.department || null } : { phone: editFormData.phone || null };
      const { error } = await (supabase as any).from("employees").update(payload).match({ id: selectedEmployee.id, organization_id: organizationId });
      if (error) throw error;
      updated = true;
      if (hasRole("admin") && canViewEmployeeIdentity(selectedEmployee)) await saveEmployeeIdentity(selectedEmployee, editFormData);
      toast.success("Employee updated"); setIsEditDialogOpen(false); setSelectedEmployee(null); await fetchEmployees();
    } catch (error: any) {
      if (updated) { toast.error(`Updated but private details failed: ${error.message}`); setIsEditDialogOpen(false); setSelectedEmployee(null); await fetchEmployees(); }
      else toast.error(error.message || "Failed to update employee");
    } finally { setIsSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!selectedEmployee || !organizationId) return;
    setIsSubmitting(true);
    try {
      const { error } = await (supabase as any).from("employees").update({ is_active: false }).match({ id: selectedEmployee.id, organization_id: organizationId });
      if (error) throw error;
      toast.success("Employee deactivated"); setIsDeleteDialogOpen(false); setSelectedEmployee(null); fetchEmployees();
    } catch (error: any) { toast.error(error.message || "Failed to deactivate"); }
    finally { setIsSubmitting(false); }
  };

  const toggleEmployeeStatus = async (employee: Employee) => {
    if (!organizationId) { toast.error("Organization context required"); return; }
    try {
      const { error } = await (supabase as any).from("employees").update({ is_active: !employee.is_active }).match({ id: employee.id, organization_id: organizationId });
      if (error) throw error;
      toast.success(`Employee ${employee.is_active ? "deactivated" : "activated"}`); fetchEmployees();
    } catch { toast.error("Failed to update status"); }
  };

  const openEditDialog = async (employee: Employee) => {
    try {
      const draft = canViewEmployeeIdentity(employee) ? await fetchEmployeeIdentity(employee) : createEmptyIdentityDraft();
      setSelectedEmployee(employee);
      setEditFormData({ ...createEmptyEditFormData(), full_name: employee.full_name, phone: employee.phone || "", designation: employee.designation || "", department: employee.department || "", ...draft, photo_file: null });
      setIsEditDialogOpen(true);
    } catch (error: any) { toast.error(error.message || "Failed to load employee details"); }
  };

  const openEmployeeDetails = async (employee: Employee) => {
    setSelectedEmployee(employee); setIsSheetOpen(true);
    try {
      if (canViewEmployeeIdentity(employee)) await fetchEmployeeIdentity(employee);
      const roles = await fetchCustomRoles();
      const visibleIds = new Set((roles || []).map(r => r.id));
      const { data, error } = await supabase.from("user_custom_roles").select("role_id").eq("user_id", employee.user_id);
      if (error) throw error;
      setEmployeeCustomRoles(new Set((data || []).map(r => r.role_id).filter(id => visibleIds.has(id))));
    } catch { setEmployeeCustomRoles(new Set()); toast.error("Failed to load employee details"); }
  };

  const handleAdminResetPassword = async (mode: "email" | "temp" | "set") => {
    if (!selectedEmployee) return;
    if (mode === "set" && customResetPassword.length < 6) { toast.error("Min 6 characters"); return; }
    setResetLoading(true);
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke("employee-admin-reset-password", {
        body: {
          employee_id: selectedEmployee.id,
          reset_base_url: `${window.location.origin}/staff/reset-password`,
          mode,
          ...(mode === "set" ? { custom_password: customResetPassword } : {}),
        },
      });
      if (fnError) throw fnError;
      if (mode === "temp") toast.success(`Temporary password: ${result.temp_password}`);
      else if (mode === "set") toast.success("Custom password set");
      else toast.success("Reset link sent");
      setCustomResetPassword(""); setIsResetDialogOpen(false);
    } catch (error: any) { toast.error(error.message || "Failed to reset password"); }
    finally { setResetLoading(false); }
  };

  const handleSaveRoles = async () => {
    if (!selectedEmployee) return;
    setIsAssigningRoles(true);
    try {
      const visibleIds = new Set(customRoles.map(r => r.id));
      const { data: current } = await supabase.from("user_custom_roles").select("role_id").eq("user_id", selectedEmployee.user_id);
      const currentIds = new Set((current || []).map(r => r.role_id).filter(id => visibleIds.has(id)));
      const toAdd = Array.from(employeeCustomRoles).filter(id => !currentIds.has(id));
      const toRemove = Array.from(currentIds).filter(id => !employeeCustomRoles.has(id));
      if (toAdd.length > 0) { const { error } = await supabase.from("user_custom_roles").insert(toAdd.map(roleId => ({ user_id: selectedEmployee.user_id, role_id: roleId }))); if (error) throw error; }
      if (toRemove.length > 0) { const { error } = await supabase.from("user_custom_roles").delete().eq("user_id", selectedEmployee.user_id).in("role_id", toRemove); if (error) throw error; }
      toast.success("Roles updated");
      const { data: updated } = await supabase.from("user_custom_roles").select("role_id").eq("user_id", selectedEmployee.user_id);
      setEmployeeCustomRoles(new Set((updated || []).map(r => r.role_id).filter(id => visibleIds.has(id))));
      setIsRoleDialogOpen(false);
    } catch (error: any) { toast.error("Failed to update roles: " + (error.message || "Unknown")); }
    finally { setIsAssigningRoles(false); }
  };

  useEffect(() => {
    if (organizationLoading) return;
    if (!organizationId) { setEmployees([]); setCustomRoles([]); setEmployeeIdentityDrafts({}); setLoading(false); return; }
    void fetchEmployees(); void fetchCustomRoles();
  }, [fetchCustomRoles, fetchEmployees, organizationId, organizationLoading]);

  // ── Derived state ──
  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.full_name.toLowerCase().includes(search.toLowerCase()) || emp.email.toLowerCase().includes(search.toLowerCase()) || emp.employee_id.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === "all" || (filterStatus === "active" && emp.is_active) || (filterStatus === "inactive" && !emp.is_active);
    const matchesRole = filterRole === "all" || emp.role === filterRole;
    return matchesSearch && matchesStatus && matchesRole;
  });

  const adminCount = employees.filter(e => e.role === "admin").length;
  const collectorCount = employees.filter(e => e.role === "collector").length;
  const activeCount = employees.filter(e => e.is_active).length;
  const canManageEmployeeRecords = hasRole("admin");
  const canEditSelectedEmployeePhone = Boolean(selectedEmployee) && (canManageEmployeeRecords || user?.id === selectedEmployee?.user_id);

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: User, color: "blue", count: employees.length, label: "Total Staff" },
          { icon: UserCheck, color: "emerald", count: activeCount, label: "Active" },
          { icon: Shield, color: "violet", count: adminCount, label: "Administrators" },
          { icon: FlaskConical, color: "amber", count: collectorCount, label: "Collectors" },
        ].map(({ icon: Icon, color, count, label }) => (
          <Card key={label} className="border-0 shadow-sm">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-${color}-100`}><Icon className={`h-4 w-4 text-${color}-600`} /></div>
                <div><p className="text-2xl font-bold">{count}</p><p className="text-xs text-muted-foreground">{label}</p></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <EmployeeFilters
        search={search} onSearchChange={setSearch}
        filterStatus={filterStatus} onFilterStatusChange={setFilterStatus}
        filterRole={filterRole} onFilterRoleChange={setFilterRole}
        onExport={() => exportToExcel("employees", [
          { key: "employee_id", label: "Employee ID" }, { key: "full_name", label: "Name" },
          { key: "email", label: "Email" }, { key: "phone", label: "Phone" },
          { key: "role", label: "Role" }, { key: "designation", label: "Designation" },
          { key: "department", label: "Department" }, { key: "is_active", label: "Active" },
        ], filteredEmployees.map(e => ({ ...e, is_active: e.is_active ? "Yes" : "No" })))}
        onAddClick={() => setIsDialogOpen(true)}
      />

      <EmployeeTable
        loading={loading} filteredEmployees={filteredEmployees}
        employeeIdentityDrafts={employeeIdentityDrafts} getRoleBadge={getRoleBadge}
        onViewDetails={openEmployeeDetails} onEdit={openEditDialog}
        onResetPassword={(emp) => { setSelectedEmployee(emp); setCustomResetPassword(""); setIsResetDialogOpen(true); }}
        onToggleStatus={toggleEmployeeStatus}
        onDelete={(emp) => { setSelectedEmployee(emp); setIsDeleteDialogOpen(true); }}
      />

      <EmployeeFormDialog
        isDialogOpen={isDialogOpen} onDialogOpenChange={setIsDialogOpen}
        formData={formData} onFormDataChange={setFormData} setFormData={setFormData}
        isSubmitting={isSubmitting} onSubmit={handleSubmit}
        showPassword={showPassword} onTogglePassword={() => setShowPassword(!showPassword)}
        employeeEmailPlaceholder={employeeEmailPlaceholder}
        onPhotoSelection={handlePhotoSelection} onClearPhoto={clearPhotoSelection}
        formatAadhaar={formatAadhaar} normalizeAadhaar={normalizeAadhaar} normalizePan={normalizePan}
      />

      <EmployeeEditDialog
        isOpen={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}
        editFormData={editFormData} onEditFormDataChange={setEditFormData} setEditFormData={setEditFormData}
        isSubmitting={isSubmitting} onSubmit={handleEdit}
        canManageEmployeeRecords={canManageEmployeeRecords}
        canEditSelectedEmployeePhone={canEditSelectedEmployeePhone}
        canViewSelectedEmployeeIdentity={canViewEmployeeIdentity(selectedEmployee)}
        onPhotoSelection={handlePhotoSelection} onClearPhoto={clearPhotoSelection}
        formatAadhaar={formatAadhaar} normalizeAadhaar={normalizeAadhaar} normalizePan={normalizePan}
      />

      <EmployeeDetailView
        isSheetOpen={isSheetOpen} onSheetOpenChange={setIsSheetOpen}
        selectedEmployee={selectedEmployee}
        selectedEmployeeIdentityDraft={getEmployeeIdentityDraft(selectedEmployee)}
        canViewSelectedEmployeeIdentity={canViewEmployeeIdentity(selectedEmployee)}
        getRoleBadge={getRoleBadge} formatAadhaar={formatAadhaar} maskDocumentNumber={maskDocumentNumber}
        customRoles={customRoles} employeeCustomRoles={employeeCustomRoles}
        onOpenEditDialog={() => { setIsSheetOpen(false); if (selectedEmployee) openEditDialog(selectedEmployee); }}
        onToggleStatus={(emp) => { toggleEmployeeStatus(emp); setIsSheetOpen(false); }}
        onOpenRoleDialog={async () => { await fetchCustomRoles(); setIsRoleDialogOpen(true); }}
        isDeleteDialogOpen={isDeleteDialogOpen} onDeleteDialogOpenChange={setIsDeleteDialogOpen}
        onDelete={handleDelete} isSubmitting={isSubmitting}
        isResetDialogOpen={isResetDialogOpen} onResetDialogOpenChange={setIsResetDialogOpen}
        customResetPassword={customResetPassword} onCustomResetPasswordChange={setCustomResetPassword}
        resetLoading={resetLoading} onAdminResetPassword={handleAdminResetPassword}
        isRoleDialogOpen={isRoleDialogOpen}
        onRoleDialogOpenChange={(open) => {
          setIsRoleDialogOpen(open);
          if (open && selectedEmployee) {
            fetchCustomRoles().then(roles => {
              const visibleIds = new Set((roles || []).map(r => r.id));
              supabase.from("user_custom_roles").select("role_id").eq("user_id", selectedEmployee.user_id).then(({ data, error }) => {
                if (!error && data) setEmployeeCustomRoles(new Set(data.map(r => r.role_id).filter(id => visibleIds.has(id))));
              });
            });
          }
        }}
        onEmployeeCustomRolesChange={setEmployeeCustomRoles}
        isAssigningRoles={isAssigningRoles} onSaveRoles={handleSaveRoles}
      />
    </div>
  );
};

export default ManageEmployees;
